import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 参与接口覆盖审计的四端 store。 */
export const STORE_SOURCES = [
  { app: 'admin', path: 'apps/admin/src/stores/admin.ts' },
  { app: 'store', path: 'apps/store/src/stores/store.ts' },
  { app: 'supplier', path: 'apps/supplier/src/stores/supplier.ts' },
  { app: 'user', path: 'apps/user/src/stores/user.ts' }
]

/** 参与接口覆盖审计的模块源码目录（.ts / .mjs，排除测试文件）。 */
export const MODULE_SOURCES = [
  { name: 'shared', dir: 'packages/shared/src', extension: '.ts' },
  { name: 'ui', dir: 'packages/ui/src', extension: '.ts' },
  { name: 'tencent-map-gateway', dir: 'packages/tencent-map-gateway/src', extension: '.mjs' },
  { name: 'scripts', dir: 'scripts', extension: '.mjs' }
]

export const SHARED_SOURCE = 'packages/shared/src/index.ts'
export const ALLOWLIST_PATH = 'scripts/interface-coverage-allowlist.json'
export const TEST_ROOTS = ['apps', 'packages', 'tests', 'scripts']

/** 写接口判定：动作体里出现任一持久化/事务调用即视为写接口。 */
export const WRITE_CALLS = [
  'executeAdminTransaction(',
  'runPlatformTransaction(',
  'runLockedPlatformTransaction(',
  'runLockedPlatformCollectionTask(',
  'prepareCatalogTransaction(',
  'applyCatalogStockOperation(',
  'commitCatalogTransaction(',
  'transitionPaymentAttempt(',
  'persist',
  'writePlatform',
  'writeCatalog',
  'writeNamedDeliveryRouteState(',
  'saveDailyDeliveryRoute(',
  'saveNamedDeliveryRoute('
]

/** 负路径（拒绝 / 校验失败 / 回滚）断言特征。 */
export const NEGATIVE_ASSERTIONS = /toBe\(false\)|toBeFalsy\(\)|toBeNull\(\)|not\.toBe\(true\)|ok: false|permission_denied|rolls back|rejects|!== true|toBeUndefined\(\)/

/**
 * 常量自动豁免规则：存储键、schema 版本、演示账号、标签/上限、系统角色与纯种子数据本身不是行为接口，
 * 不需要单独测试；规则外的导出常量必须在白名单里显式登记。
 */
export const AUTO_EXEMPT_CONSTANT_PATTERNS = [
  /_STORAGE_KEY$/,
  /_SCHEMA_VERSION$/,
  /^PERSISTENCE_VERSION$/,
  /^PLATFORM_PRODUCTION_RECOVERY_HANDLER_KEYS$/,
  /^CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA$/,
  /^SUPPLIER_DEMO_/,
  /^ADMIN_SUPER_/,
  /^CHANNEL_TAG_/,
  /^EXPRESS_DELIVERY_TAG$/,
  /^DRIVER_CHECK_IN_MAX_METERS$/,
  /^cityOptions$/,
  /^farmhouseFoods$/,
  /^UI_TYPOGRAPHY$/,
  /^designTokens$/,
  /^DEFAULT_BUSINESS_IMAGE_FALLBACK$/,
  /^DEFAULT_PRODUCT_CATEGORY_IMAGE$/,
  /^PRODUCT_CATEGORY_IMAGE/,
  /^TENCENT_MAP_/,
  /^MAX_/,
  /^DEMO_/,
  /_LOCK_NAME$/,
  /_DICTIONARY_TYPES$/,
  /_SOURCES$/,
  /_ROOTS$/,
  /_PATH$/,
  /_CALLS$/,
  /_ASSERTIONS$/,
  /_PATTERNS$/
]

export function isAutoExemptConstant(name) {
  return AUTO_EXEMPT_CONSTANT_PATTERNS.some((pattern) => pattern.test(name))
}

function isTestFile(name) {
  return name.endsWith('.test.ts') || name.endsWith('.test.mjs')
}

function walkFiles(dir) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}

/** 汇总所有测试文件（供接口引用与负路径判定）。 */
export function loadTestFiles(root = ROOT) {
  const files = []
  for (const base of TEST_ROOTS) {
    for (const full of walkFiles(resolve(root, base))) {
      if (!isTestFile(full)) continue
      files.push({ path: full.slice(root.length + 1), source: readFileSync(full, 'utf8') })
    }
  }
  return files
}

/** 兼容旧签名：返回拼接后的测试语料文本。 */
export function loadTestCorpus(root = ROOT) {
  return loadTestFiles(root).map((file) => file.source).join('\n')
}

/** 解析测试文件中的用例块（用于负路径判定）。 */
export function parseTestBlocks(files) {
  const blocks = []
  for (const file of files) {
    const matches = [...file.source.matchAll(/\n\s*it\((?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)]
    matches.forEach((match, index) => {
      const end = index + 1 < matches.length ? matches[index + 1].index : file.source.length
      blocks.push({ path: file.path, name: match[1] || match[2] || match[3] || '', body: file.source.slice(match.index, end) })
    })
  }
  return blocks
}

/** 从 source 的 openIndex（指向 '{'）开始取平衡括号片段。 */
export function sliceBalanced(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openIndex + 1, i)
    }
  }
  return source.slice(openIndex + 1)
}

function extractBlock(source, marker) {
  const index = source.indexOf(marker)
  if (index < 0) return null
  return sliceBalanced(source, source.indexOf('{', index))
}

export function extractActionsBlock(source) {
  return extractBlock(source, '\n  actions: {')
}

export function extractGettersBlock(source) {
  return extractBlock(source, '\n  getters: {')
}

function extractMembers(block) {
  if (block === null) return []
  const matches = [...block.matchAll(/\n    (?:async )?([A-Za-z_$][\w$]*)\s*[:(]/g)]
  return matches.map((match, index) => ({
    name: match[1],
    body: block.slice(match.index + 1, index + 1 < matches.length ? matches[index + 1].index + 1 : block.length)
  }))
}

/** 解析 store 动作：名称 + 方法体 + 是否写接口 + 审计 action 串。 */
export function extractStoreActions(source) {
  return extractMembers(extractActionsBlock(source)).map((member) => ({
    ...member,
    write: WRITE_CALLS.some((call) => member.body.includes(call)),
    actionIds: [...new Set([...member.body.matchAll(/action: '([^']+)'/g)].map((item) => item[1]))]
  }))
}

/** 解析 store getters（读接口）。 */
export function extractStoreGetters(source) {
  return extractMembers(extractGettersBlock(source))
}

/** 解析模块导出：函数（带函数体）与常量名；barrel 的 re-export 不计入。 */
export function extractModuleExports(source) {
  const functions = []
  const pattern = /export (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/g
  const matches = [...source.matchAll(pattern)]
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length
    functions.push({ name: match[1], body: source.slice(match.index, end) })
  })
  const constants = [...new Set([...source.matchAll(/export const ([A-Za-z_$][\w$]*)\s*=/g)].map((item) => item[1]))]
  return { functions, constants }
}

function referencedIn(name, text) {
  return new RegExp('\\b' + name + '\\b').test(text)
}

function blocksFor(action, blocks) {
  return blocks.filter((block) => referencedIn(action.name, block.body) || action.actionIds.some((id) => block.body.includes(id)))
}

/** 写接口 / 读接口 / 负路径三维度审计。 */
export function auditStoreInterfaces(source, corpusText, options = {}) {
  const actions = extractStoreActions(source)
  const getters = extractStoreGetters(source)
  const blocks = options.blocks || []
  const noNegativePath = options.allowlist?.storeNoNegativePath || {}
  const getterExempt = options.allowlist?.storeGetterExempt || {}
  const writes = actions.filter((action) => action.write)

  const coveredAny = actions.filter((action) => referencedIn(action.name, corpusText) || action.actionIds.some((id) => corpusText.includes(id)))
  const coveredAnyNames = new Set(coveredAny.map((action) => action.name))
  const negativeCoveredNames = new Set(coveredAny.filter((action) => blocksFor(action, blocks).some((block) => NEGATIVE_ASSERTIONS.test(block.body))).map((action) => action.name))

  const direct = writes.filter((action) => coveredAnyNames.has(action.name))
  const indirect = writes.filter((action) => !coveredAnyNames.has(action.name)
    && actions.some((caller) => coveredAnyNames.has(caller.name) && referencedIn(action.name, caller.body)))
  const indirectNames = new Set(indirect.map((action) => action.name))
  const uncovered = writes.filter((action) => !coveredAnyNames.has(action.name) && !indirectNames.has(action.name))

  const negativeMissing = writes
    .filter((action) => {
      if (noNegativePath[action.name]) return false
      if (negativeCoveredNames.has(action.name)) return false
      // 间接 helper（如 transitionAdminAfterSale）继承「已测调用者」的负路径覆盖
      const negativeCallers = actions.filter((caller) => negativeCoveredNames.has(caller.name) && referencedIn(action.name, caller.body))
      if (negativeCallers.length) return false
      return coveredAnyNames.has(action.name) || indirectNames.has(action.name)
    })
    .map((action) => action.name)

  const gettersCovered = getters.filter((getter) => referencedIn(getter.name, corpusText)
    || actions.some((action) => coveredAnyNames.has(action.name) && referencedIn(getter.name, action.body)))
  const gettersUncovered = getters
    .filter((getter) => !gettersCovered.includes(getter) && !getterExempt[getter.name])
    .map((getter) => getter.name)

  return {
    total: writes.length,
    covered: direct.length,
    indirectly: indirect.length,
    indirect: indirect.map((action) => action.name),
    uncovered: uncovered.map((action) => action.name),
    getters: { total: getters.length, covered: gettersCovered.length, uncovered: gettersUncovered },
    negative: { covered: negativeCoveredNames.size, exempt: Object.keys(noNegativePath).length, missing: negativeMissing }
  }
}

/** 模块导出覆盖：直接命中 → 被已覆盖函数调用 → 白名单 → 未覆盖。 */
export function auditModuleExports({ name, files, corpusText, blocks = [], allowlist = {} }) {
  const functions = []
  const constants = []
  for (const file of files) {
    const parsed = extractModuleExports(file.source)
    parsed.functions.forEach((fn) => functions.push({ ...fn, module: name, file: file.path }))
    parsed.constants.forEach((constant) => constants.push({ name: constant, module: name, file: file.path }))
  }
  const allowFunctions = allowlist.functionReasons || {}
  const allowConstants = new Set(allowlist.sharedConstants || [])
  const evidenceBlockText = blocks.map((block) => block.body).join('\n')
  // 豁免项单独计数，避免与「直接/间接覆盖」重复统计导致口径不一致
  const direct = new Set(functions.filter((fn) => !allowFunctions[fn.name] && referencedIn(fn.name, corpusText)).map((fn) => fn.name))
  const indirect = new Set()
  let changed = true
  while (changed) {
    changed = false
    for (const fn of functions) {
      if (allowFunctions[fn.name] || direct.has(fn.name) || indirect.has(fn.name)) continue
      if ([...direct, ...indirect].some((coveredName) => coveredName !== fn.name && referencedIn(coveredName, fn.body))) {
        indirect.add(fn.name)
        changed = true
      }
    }
  }
  const functionAllowlisted = functions.filter((fn) => allowFunctions[fn.name])
  const uncoveredFunctions = functions
    .filter((fn) => !direct.has(fn.name) && !indirect.has(fn.name) && !allowFunctions[fn.name])
    .map((fn) => `${fn.module}:${fn.name}`)
  const uncoveredConstants = constants
    .filter((constant) => !referencedIn(constant.name, corpusText) && !referencedIn(constant.name, evidenceBlockText) && !isAutoExemptConstant(constant.name) && !allowConstants.has(constant.name))
    .map((constant) => `${constant.module}:${constant.name}`)
  return {
    name,
    files: files.length,
    functions: functions.length,
    constants: constants.length,
    functionCovered: direct.size,
    functionIndirect: indirect.size,
    functionAllowlisted: functionAllowlisted.length,
    uncoveredFunctions,
    uncoveredConstants
  }
}

/** 兼容单文件签名（供旧用例与 index.ts 透视使用）。 */
export function auditSharedInterfaces(source, corpusText, allowlist = {}, storeCorpus = '') {
  const { functions, constants } = extractModuleExports(source)
  const report = auditModuleExports({
    name: 'shared',
    files: [{ path: SHARED_SOURCE, source }],
    corpusText: corpusText + '\n' + storeCorpus,
    blocks: [],
    allowlist
  })
  return {
    functions: functions.length,
    constants: constants.length,
    functionCovered: report.functionCovered,
    functionIndirect: report.functionIndirect,
    functionAllowlisted: report.functionAllowlisted,
    uncoveredFunctions: report.uncoveredFunctions.map((entry) => entry.split(':').pop()),
    uncoveredConstants: report.uncoveredConstants.map((entry) => entry.split(':').pop())
  }
}

function moduleFiles(root, module) {
  return walkFiles(resolve(root, module.dir))
    .filter((full) => full.endsWith(module.extension) && !isTestFile(full))
    .map((full) => ({ path: full.slice(root.length + 1), source: readFileSync(full, 'utf8') }))
}

export function auditInterfaces(root = ROOT) {
  const testFiles = loadTestFiles(root)
  const corpusText = testFiles.map((file) => file.source).join('\n')
  const blocks = parseTestBlocks(testFiles)
  const allowlist = JSON.parse(readFileSync(resolve(root, ALLOWLIST_PATH), 'utf8'))

  const storeSources = STORE_SOURCES.map((entry) => ({ entry, source: readFileSync(resolve(root, entry.path), 'utf8') }))
  const stores = storeSources.map(({ entry, source }) => ({
    app: entry.app,
    ...auditStoreInterfaces(source, corpusText, { blocks, allowlist })
  }))

  const coveredStoreBodies = storeSources.flatMap(({ source }) => {
    const actions = extractStoreActions(source)
    return actions.filter((action) => referencedIn(action.name, corpusText) || action.actionIds.some((id) => corpusText.includes(id))).map((action) => action.body)
  }).join('\n')
  const storeBlocks = blocks.concat([{ path: 'store-actions', name: 'covered-store-actions', body: coveredStoreBodies }])

  const modules = MODULE_SOURCES.map((module) => auditModuleExports({
    name: module.name,
    files: moduleFiles(root, module),
    corpusText,
    blocks: storeBlocks,
    allowlist
  }))

  const sharedModule = modules.find((module) => module.name === 'shared')
  return { stores, modules, shared: sharedModule }
}

export function collectFailures(report) {
  const failures = []
  for (const store of report.stores) {
    for (const name of store.uncovered) failures.push(`${store.app} 写接口未覆盖: ${name}`)
    for (const name of store.getters.uncovered) failures.push(`${store.app} 读接口未覆盖: ${name}`)
    for (const name of store.negative.missing) failures.push(`${store.app} 写接口缺少负路径断言: ${name}`)
  }
  for (const module of report.modules) {
    for (const name of module.uncoveredFunctions) failures.push(`模块函数未覆盖且未豁免: ${name}`)
    for (const name of module.uncoveredConstants) failures.push(`模块常量未登记豁免: ${name}`)
  }
  return failures
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const report = auditInterfaces()
  const failures = collectFailures(report)
  const storeSummary = report.stores.map((store) => `${store.app} ${store.covered + store.indirectly}/${store.total}`).join('，')
  const getterSummary = report.stores.map((store) => `${store.app} ${store.getters.covered}/${store.getters.total}`).join('，')
  const negativeSummary = report.stores.map((store) => `${store.app} ${store.total - store.negative.missing}/${store.total}`).join('，')
  const moduleSummary = report.modules
    .map((module) => `${module.name} ${module.functionCovered + module.functionIndirect}/${module.functions}${module.functionAllowlisted ? `(豁免 ${module.functionAllowlisted})` : ''}`)
    .join('；')
  if (failures.length) {
    console.error(`接口覆盖审计发现 ${failures.length} 项未覆盖:\n${failures.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`接口覆盖审计通过: 写接口 ${storeSummary}；读接口 ${getterSummary}；负路径 ${negativeSummary}；模块导出 ${moduleSummary}`)
  }
}
