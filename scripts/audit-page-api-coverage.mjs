import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const MATRIX_PATH = 'scripts/page-api-matrix.json'
export const OPENAPI_PATH = 'docs/backend/openapi.yaml'
export const STATUSES = new Set(['done', 'in-progress', 'planned', 'frontend-only', 'internal'])
const PAGE_FILES = {
  admin: ['apps/admin/src/pages/index/index.vue', 'apps/admin/src/components/AdminUsersPanel.vue', 'apps/admin/src/components/AdminLeadersPanel.vue'],
  store: ['apps/store/src/pages/index/index.ts', 'apps/store/src/pages/checkout/index.ts', 'apps/store/src/pages/order-detail/index.ts'],
  supplier: ['apps/supplier/src/pages/index/index.ts'],
  user: ['apps/user/src/pages/index/index.ts', 'apps/user/src/pages/operations/index.ts']
}
const STORE_FILES = { admin: 'apps/admin/src/stores/admin.ts', store: 'apps/store/src/stores/store.ts', supplier: 'apps/supplier/src/stores/supplier.ts', user: 'apps/user/src/stores/user.ts' }
function read(path) { return readFileSync(path, 'utf8') }
function normalizePath(path) { const text = String(path || '').trim(); return text ? (text.startsWith('/') ? text : `/${text}`) : '' }
function normalizeApi(value) { if (!Array.isArray(value) || value.length !== 2) return ''; const method = String(value[0] || '').trim().toUpperCase(); const path = normalizePath(value[1]); return method && path ? `${method} ${path.startsWith('/api/v1') ? path : `/api/v1${path}`}` : '' }
function parseOpenApi(root) {
  const file = resolve(root, OPENAPI_PATH); if (!existsSync(file)) return new Set()
  const spec = parse(read(file)); const operations = new Set()
  for (const [path, entry] of Object.entries(spec.paths || {})) for (const method of Object.keys(entry || {})) if (['get','post','put','patch','delete'].includes(method)) operations.add(`${method.toUpperCase()} /api/v1${path}`)
  return operations
}
export function parseStoreActions(source) {
  const marker = /actions\s*:\s*\{/u.exec(source)
  if (!marker) return []
  const names = []
  for (const line of source.slice(marker.index).split(/\r?\n/u)) {
    const match = /^    (?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/u.exec(line)
    if (match && !['if','for','while','switch','catch'].includes(match[1])) names.push(match[1])
  }
  return [...new Set(names)]
}

export function parsePageActions(source) { return [...new Set([...source.matchAll(/\bstore\.([A-Za-z_$][\w$]*)\s*\(/gu)].map((m) => m[1]).filter((name) => !name.startsWith('$')))] }
function collectSources(root) {
  const out = {}
  for (const [app, files] of Object.entries(PAGE_FILES)) {
    const pageActions = new Set()
    for (const relative of files) {
      const file = resolve(root, relative)
      if (existsSync(file)) parsePageActions(read(file)).forEach((name) => pageActions.add(name))
    }
    const storeActions = new Set()
    const storeFile = resolve(root, STORE_FILES[app])
    if (existsSync(storeFile)) parseStoreActions(read(storeFile)).forEach((name) => storeActions.add(name))
    out[app] = { page: pageActions, store: storeActions }
  }
  return out
}

function validateEntry(key, item, sourceActions, strictOpenApi) {
  const errors = []
  if (!item || typeof item !== 'object') return [`${key}:invalid-entry`]
  if (!item.action?.trim()) errors.push(`${key}:missing-action`)
  if (!STATUSES.has(item.status)) errors.push(`${key}:invalid-status`)
  if (!['page', 'store', 'internal'].includes(item.owner)) errors.push(`${key}:invalid-owner`)
  if (['frontend-only', 'internal'].includes(item.status) && !String(item.reason || '').trim()) errors.push(`${key}:missing-reason`)
  if (item.status === 'planned') { if (!String(item.stage || '').trim()) errors.push(`${key}:missing-stage`); if (!String(item.dataDomain || '').trim()) errors.push(`${key}:missing-dataDomain`) }
  if (['done', 'in-progress'].includes(item.status) && !Array.isArray(item.api)) errors.push(`${key}:missing-api`)
  if (strictOpenApi && item.status === 'planned' && normalizeApi(item.api) && !strictOpenApi.has(normalizeApi(item.api))) errors.push(`${key}:planned-api-missing-from-openapi`)
  if (!sourceActions.has(item.action) && item.owner !== 'internal' && !item.synthetic) errors.push(`${key}:${item.action}:stale-entry`)
  return errors
}
export function auditPageApiCoverage(root = ROOT, options = {}) {
  const strictOpenApi = options.strict ? parseOpenApi(root) : null
  const matrixFile = resolve(root, MATRIX_PATH); const matrix = existsSync(matrixFile) ? JSON.parse(read(matrixFile)) : { pages: [] }
  const openapi = parseOpenApi(root); const sources = collectSources(root, options.includeStore)
  const failures = []; const invalidEntries = []; const missingApis = []; const plannedActions = []; const pages = []; const declaredByApp = new Map()
  for (const page of matrix.pages || []) {
    const app = page.app; const key = `${app}:${page.page}`; const entries = Array.isArray(page.actions) ? page.actions : []
    if (!declaredByApp.has(app)) declaredByApp.set(app, new Set())
    const appActions = declaredByApp.get(app); let done = 0, inProgress = 0, planned = 0, frontendOnly = 0
    for (const item of entries) {
      if (item?.action) appActions.add(item.action)
      const sourceSet = item.owner === 'store' ? sources[app]?.store : sources[app]?.page
      for (const error of validateEntry(key, item, sourceSet || new Set(), strictOpenApi)) { if (/planned-api-missing-from-openapi/u.test(error)) failures.push(error); else invalidEntries.push(error) }
      if (!item?.action) continue
      const api = normalizeApi(item.api)
      if (['done','in-progress'].includes(item.status) && api && !openapi.has(api)) missingApis.push(`${key}:${item.action}:${api}`)
      if (item.status === 'planned' && api) plannedActions.push({ app, page: page.page, action: item.action, stage: item.stage, dataDomain: item.dataDomain, api })
      if (item.status === 'done') done += 1
      if (item.status === 'in-progress') inProgress += 1
      if (item.status === 'planned') planned += 1
      if (item.status === 'frontend-only') frontendOnly += 1
    }
    pages.push({ app, page: page.page, total: entries.length, done, inProgress, planned, frontendOnly })
  }
  const unmappedActions = []
  for (const [app, actions] of Object.entries(sources)) {
    if (!(matrix.pages || []).some((page) => page.app === app) && matrix.requireAllApps) unmappedActions.push(`${app}:missing-page-domain`)
    const declared = declaredByApp.get(app) || new Set()
    for (const action of actions.page) if (!declared.has(action)) unmappedActions.push(`${app}:${action}`)
    for (const action of actions.store) if (!declared.has(action)) unmappedActions.push(`${app}:${action}`)
  }
  return { ok: missingApis.length === 0 && unmappedActions.length === 0 && invalidEntries.length === 0 && failures.length === 0, pages, missingApis: [...new Set(missingApis)], unmappedActions: [...new Set(unmappedActions)], invalidEntries: [...new Set(invalidEntries)], failures: [...new Set(failures)], plannedActions, openapiOperations: openapi.size }
}
const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const strict = process.argv.includes('--strict'); const includeStore = process.argv.includes('--include-store')
  const report = auditPageApiCoverage(ROOT, { strict, includeStore })
  const summary = `页面域 ${report.pages.length}，done ${report.pages.reduce((s,p)=>s+p.done,0)}，in-progress ${report.pages.reduce((s,p)=>s+p.inProgress,0)}，planned ${report.pages.reduce((s,p)=>s+p.planned,0)}，frontend-only ${report.pages.reduce((s,p)=>s+p.frontendOnly,0)}，OpenAPI ${report.openapiOperations}`
  if (!report.ok) {
    console.error('页面 API 覆盖审计失败')
    if (report.missingApis.length) console.error(`已接入但缺 OpenAPI:\n${report.missingApis.join('\n')}`)
    if (report.unmappedActions.length) console.error(`未声明动作:\n${report.unmappedActions.join('\n')}`)
    if (report.invalidEntries.length) console.error(`矩阵非法项:\n${report.invalidEntries.join('\n')}`)
    if (report.failures.length) console.error(`严格模式错误:\n${report.failures.join('\n')}`)
    if (report.plannedActions.length) { const byStage = new Map(); for (const item of report.plannedActions) byStage.set(item.stage, (byStage.get(item.stage)||0)+1); console.error(`planned 阶段清单:\n${[...byStage.entries()].sort().map(([stage,count])=>`  ${stage}: ${count}`).join('\n')}`) }
    console.error(`\n汇总: ${summary}`); process.exitCode = 1
  } else { console.log(`页面 API 覆盖审计通过: ${summary}`) }
}
