import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 供应商端应存在的图标清单（PNG / SVG 双份）。 */
export const EXPECTED_SUPPLIER_ICONS = ['arrow-left', 'chevron-left', 'chevron-right', 'layout-dashboard', 'list-tree', 'map-pin', 'navigation', 'package', 'package-check', 'search', 'store', 'user-round', 'users', 'x']

/** 已删除、不得再出现在 MP 产物中的 SVG。 */
export const REMOVED_SUPPLIER_SVGS = ['calendar-check', 'calendar-days', 'badge-dollar-sign', 'badge-percent', 'bell-ring', 'bell', 'chart-no-axes-combined', 'chevron-down', 'credit-card', 'crown', 'door-open', 'download', 'factory', 'headset', 'house', 'link', 'megaphone', 'package-plus', 'phone', 'play', 'plus', 'radio', 'route', 'shield-check', 'shopping-bag', 'shopping-cart', 'sprout', 'tags', 'trophy', 'truck', 'user-round-check', 'utensils']

/** 源目录必须与清单完全一致，且 PNG / SVG 成对。 */
export function validateIconSourceSet(sourceFiles, expectedIcons = EXPECTED_SUPPLIER_ICONS) {
  const failures = []
  const pngs = sourceFiles.filter((name) => name.endsWith('.png'))
  const svgs = sourceFiles.filter((name) => name.endsWith('.svg'))
  if (pngs.length !== expectedIcons.length || svgs.length !== expectedIcons.length) {
    failures.push(`源图标应为 ${expectedIcons.length} PNG + ${expectedIcons.length} SVG，实际为 ${pngs.length} PNG + ${svgs.length} SVG`)
  }
  for (const name of expectedIcons) {
    if (!pngs.includes(`${name}.png`) || !svgs.includes(`${name}.svg`)) failures.push(`缺少图标源: ${name}`)
  }
  return failures
}

/** 生成脚本必须以「源码实际使用到的图标」为口径，且只覆盖三个移动端。 */
export function validateGeneratorContract(generatorSource) {
  const failures = []
  if (!generatorSource.includes('usedIconNames(app')) failures.push('PNG 生成脚本未按源码实际使用的图标推导图标清单')
  if (!generatorSource.includes("const mobileApps = ['store', 'supplier', 'user']")) failures.push('PNG 生成脚本的移动端清单不是 store/supplier/user')
  return failures
}

/** 源码里用到的 UiIcon 必须都有 PNG。 */
export function validateUsedIcons(usedIcons, hasPng) {
  const failures = []
  for (const name of [...new Set(usedIcons)]) {
    if (!hasPng(name)) failures.push(`UiIcon 使用了不存在的 PNG: ${name}`)
  }
  return failures
}

/** MP 产物 static/icons 必须与清单一致（不多不少）。 */
export function validateMpIconFiles(mpIconFiles, expectedIcons = EXPECTED_SUPPLIER_ICONS) {
  const expected = expectedIcons.flatMap((name) => [`${name}.png`, `${name}.svg`]).sort()
  const actual = mpIconFiles.map((path) => basename(path)).sort()
  if (JSON.stringify(actual) === JSON.stringify(expected)) return []
  return [`MP 产物 static/icons 应为 ${expected.length} 个 PNG/SVG，实际为 ${actual.length} 个`]
}

/** MP 产物安全区分支与已删除图标检查。 */
export function validateMpBundle({ mpFileNames, wxssWithStatusBarHeight, wxssWithSafeAreaInsetTop, removedSvgs = REMOVED_SUPPLIER_SVGS }) {
  const failures = []
  if (wxssWithStatusBarHeight === 0) failures.push('MP WXSS 未找到 --status-bar-height')
  if (wxssWithSafeAreaInsetTop > 0) failures.push('MP WXSS 不应包含 safe-area-inset-top')
  for (const name of removedSvgs) {
    if (mpFileNames.some((path) => path.endsWith(`/${name}.svg`) || path.endsWith(`\\${name}.svg`))) failures.push(`MP 产物仍包含已删除 SVG: ${name}.svg`)
  }
  return failures
}

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function filesContaining(directory, extension, text) {
  return filesUnder(directory).filter((path) => path.endsWith(extension) && readFileSync(path, 'utf8').includes(text))
}

const MP_ICON_PATTERN = /[/\\]static[/\\]icons[/\\][^/\\]+\.(png|svg)$/

/** 审计供应商端图标源、生成脚本契约与 MP 产物。 */
export function auditSupplierAssets(root = ROOT) {
  const supplierRoot = join(root, 'apps', 'supplier')
  const sourceIcons = join(supplierRoot, 'src', 'static', 'icons')
  const generatorScript = join(root, 'scripts', 'svg-icons-to-png.mjs')
  const mpDist = join(supplierRoot, 'dist', 'build', 'mp-weixin')
  if (!existsSync(sourceIcons)) return { failures: [`图标源目录不存在: ${relative(root, sourceIcons)}`], summary: null }

  const failures = []
  const sourceFiles = filesUnder(sourceIcons).filter((path) => statSync(path).isFile()).map((path) => relative(sourceIcons, path))
  failures.push(...validateIconSourceSet(sourceFiles))
  failures.push(...validateGeneratorContract(readFileSync(generatorScript, 'utf8')))

  const supplierSource = filesUnder(join(supplierRoot, 'src')).filter((path) => /\.(vue|ts)$/.test(path)).map((path) => readFileSync(path, 'utf8')).join('\n')
  const usedIcons = [
    ...[...supplierSource.matchAll(/UiIcon\s+name="([^"]+)"/g)].map((match) => match[1]),
    ...[...supplierSource.matchAll(/icon:\s*'([^']+)'/g)].map((match) => match[1]).filter((name) => name !== 'none')
  ]
  failures.push(...validateUsedIcons(usedIcons, (name) => existsSync(join(sourceIcons, `${name}.png`))))

  const mpFiles = filesUnder(mpDist)
  failures.push(...validateMpBundle({
    mpFileNames: mpFiles,
    wxssWithStatusBarHeight: filesContaining(mpDist, '.wxss', '--status-bar-height').length,
    wxssWithSafeAreaInsetTop: filesContaining(mpDist, '.wxss', 'safe-area-inset-top').length
  }))
  const mpIconFiles = mpFiles.filter((path) => MP_ICON_PATTERN.test(path))
  failures.push(...validateMpIconFiles(mpIconFiles))
  const pngs = sourceFiles.filter((name) => name.endsWith('.png'))
  const svgs = sourceFiles.filter((name) => name.endsWith('.svg'))
  return { failures, summary: `source ${pngs.length} PNG + ${svgs.length} SVG, MP ${mpIconFiles.length} icons, MP safe-area branch verified` }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const { failures, summary } = auditSupplierAssets()
  if (failures.length) {
    console.error(`[supplier-assets] ${failures.join('\n[supplier-assets] ')}`)
    process.exitCode = 1
  } else {
    console.log(`[supplier-assets] passed: ${summary}`)
  }
}
