// 业务样式硬编码色值门禁：色值只允许出现在 token 源文件（packages/ui/src/design-tokens.css / design-tokens.ts）。
// 用法: node scripts/audit-tokens.mjs
// 例外（uni-app 编译期变量、JSON 配置项）见 docs/design/zhulv-design-tokens.md「例外登记」，
// 新增例外必须同时改本文件与设计文档。
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootPath = fileURLToPath(new URL('..', import.meta.url))

/** 参与巡检的四端。 */
const TOKEN_AUDIT_APPS = ['admin', 'store', 'supplier', 'user']

/** 业务样式与脚本可扫描的源码扩展名。 */
const SOURCE_EXTENSIONS = new Set(['.vue', '.scss', '.css', '.ts'])

/** 例外文件：uni.scss 是 uni-app 编译期变量，无法引用 CSS 变量。 */
const TOKEN_AUDIT_ALLOWLIST = [/^apps\/[^/]+\/src\/uni\.scss$/]

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g
const RGB_LITERAL = /\brgba?\(\s*[\d.]/g

function normalize(file) {
  return file.replace(/\\/g, '/')
}

/** 例外判定：命中则整文件跳过。 */
export function isTokenAuditAllowed(file) {
  const target = normalize(file)
  return TOKEN_AUDIT_ALLOWLIST.some((pattern) => pattern.test(target))
}

/** 审计单份源码：返回 hex / rgb() 字面量明细。rgba(var(--x-rgb), a) 混色写法不算违规。 */
export function auditTokenSource(source, file) {
  if (isTokenAuditAllowed(file)) return []
  const findings = []
  const rows = source.split(/\r?\n/)
  for (let index = 0; index < rows.length; index += 1) {
    const hits = []
    for (const match of rows[index].matchAll(HEX_COLOR)) hits.push(match[0])
    for (const match of rows[index].matchAll(RGB_LITERAL)) hits.push(match[0].trim())
    if (hits.length) findings.push(`${normalize(file)}:${index + 1} 硬编码色值 ${hits.join(' ')}`)
  }
  return findings
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

/** 收集四端业务源码（跳过单测）。 */
export function collectTokenAuditFiles(basePath = rootPath) {
  const files = []
  for (const app of TOKEN_AUDIT_APPS) {
    for (const path of walk(join(basePath, 'apps', app, 'src'))) {
      if (!SOURCE_EXTENSIONS.has(extname(path))) continue
      if (/\.test\.[cm]?ts$/.test(path)) continue
      files.push(relative(basePath, path).replace(/\\/g, '/'))
    }
  }
  return files.sort()
}

/** 四端入口：扫描业务样式，返回全部硬编码色值。 */
export function auditBusinessTokens(basePath = rootPath) {
  const findings = []
  for (const file of collectTokenAuditFiles(basePath)) {
    findings.push(...auditTokenSource(readFileSync(join(basePath, file), 'utf8'), file))
  }
  return findings
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const findings = auditBusinessTokens()
  if (findings.length) {
    console.error(`字号与色值门禁未通过：发现 ${findings.length} 处业务样式硬编码色值`)
    for (const item of findings) console.error('  - ' + item)
    console.error('色值请写入 packages/ui/src/design-tokens.css，业务样式只引用 CSS 变量；例外见 docs/design/zhulv-design-tokens.md')
    process.exit(1)
  }
  console.log('色值门禁通过：业务样式未出现硬编码 hex / rgb() 字面量。')
}
