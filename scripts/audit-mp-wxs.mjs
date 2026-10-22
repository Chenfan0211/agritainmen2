// 小程序 WXS 语法门禁：WXS 只支持 ES5 子集，且不支持正则字面量 / $event 等写法。
// 用法: node scripts/audit-mp-wxs.mjs  （构建后运行可同时校验 dist/build/mp-weixin 产物）
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootPath = fileURLToPath(new URL('..', import.meta.url))

/** 三端纯微信小程序。 */
export const MOBILE_APPS = ['store', 'supplier', 'user']

/**
 * 把字符串字面量与注释替换成等长空白（保留换行），
 * 这样规则匹配不会命中「字符串里写了箭头函数」之类的误报。
 */
export function maskStringsAndComments(source) {
  const chars = source.split('')
  const blank = (index) => {
    if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
  }
  let index = 0
  while (index < chars.length) {
    const char = chars[index]
    const next = chars[index + 1]
    if (char === '/' && next === '/') {
      while (index < chars.length && chars[index] !== '\n') blank(index++)
      continue
    }
    if (char === '/' && next === '*') {
      blank(index++)
      blank(index++)
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) blank(index++)
      if (index < chars.length) { blank(index++); blank(index++) }
      continue
    }
    if (char === "'" || char === '"') {
      const quote = char
      blank(index++)
      while (index < chars.length && chars[index] !== quote) {
        if (chars[index] === '\\') blank(index++)
        blank(index++)
      }
      if (index < chars.length) blank(index++)
      continue
    }
    index += 1
  }
  return chars.join('')
}

const REGEX_PRECEDING_CHARS = new Set(['=', '(', ',', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'])
const REGEX_PRECEDING_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'instanceof'])

/** 扫描正则字面量（WXS 不支持）：只在「表达式起始位置」的 `/` 上尝试匹配。 */
export function findRegexLiterals(masked) {
  const hits = []
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] !== '/') continue
    if (masked[index + 1] === '/' || masked[index + 1] === '*') continue
    let cursor = index - 1
    while (cursor >= 0 && /\s/.test(masked[cursor])) cursor -= 1
    if (cursor < 0) continue
    const previous = masked[cursor]
    let allowed = REGEX_PRECEDING_CHARS.has(previous)
    if (!allowed && /[A-Za-z_$]/.test(previous)) {
      let start = cursor
      while (start >= 0 && /[A-Za-z0-9_$]/.test(masked[start])) start -= 1
      allowed = REGEX_PRECEDING_WORDS.has(masked.slice(start + 1, cursor + 1))
    }
    if (!allowed) continue
    let scan = index + 1
    let closed = false
    while (scan < masked.length && masked[scan] !== '\n') {
      if (masked[scan] === '\\') { scan += 2; continue }
      if (masked[scan] === '/') { closed = true; break }
      scan += 1
    }
    if (closed) hits.push(index)
    index = scan
  }
  return hits
}

/** 单条 WXS 违规规则。 */
const WXS_RULES = [
  { id: 'for-in', message: 'WXS 不支持 for...in，请改用索引循环', pattern: /for\s*\(\s*(?:var\s+)?[A-Za-z_$][A-Za-z0-9_$]*\s+in\s/g },
  { id: 'regex-literal', message: 'WXS 不支持正则字面量，请改用字符串判断', detect: (masked) => findRegexLiterals(masked) },
  { id: 'event-placeholder', message: 'WXS/WXML 不支持 $event，请在事件上用 data-* 传参', pattern: /\$event\b/g },
  { id: 'arrow-function', message: 'WXS 不支持箭头函数', pattern: /=>/g },
  { id: 'template-literal', message: 'WXS 不支持模板字符串', pattern: /`/g },
  { id: 'optional-chaining', message: 'WXS 不支持可选链 ?.', pattern: /\?\./g },
  { id: 'nullish-coalescing', message: 'WXS 不支持空值合并 ??', pattern: /\?\?/g },
  { id: 'let-const', message: 'WXS 只支持 var 声明', pattern: /\b(?:let|const)\b/g },
  { id: 'spread', message: 'WXS 不支持展开运算符 ...', pattern: /\.\.\./g },
  { id: 'async-await', message: 'WXS 不支持 async/await', pattern: /\b(?:async|await)\b/g }
]

function lineOf(masked, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (masked[index] === '\n') line += 1
  return line
}

/** 审计单个 WXS 源码，返回违规明细。 */
export function auditWxsSource(source, file) {
  const masked = maskStringsAndComments(source)
  const findings = []
  for (const rule of WXS_RULES) {
    const offsets = rule.pattern
      ? Array.from(masked.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags)), (match) => match.index)
      : rule.detect(masked)
    for (const offset of offsets) findings.push(`${file}:${lineOf(masked, offset)} ${rule.message}`)
  }
  return findings
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (path.endsWith('.wxs')) out.push(path)
  }
  return out
}

/** 入口：扫描三端 src 与已构建产物里的全部 WXS。 */
export function auditMobileWxs(basePath = rootPath) {
  const findings = []
  for (const app of MOBILE_APPS) {
    const roots = [
      join(basePath, 'apps', app, 'src'),
      join(basePath, 'apps', app, 'dist', 'build', 'mp-weixin')
    ]
    for (const root of roots) {
      for (const file of walk(root)) {
        const relative = file.slice(basePath.length).replace(/\\/g, '/').replace(/^\//, '')
        findings.push(...auditWxsSource(readFileSync(file, 'utf8'), relative))
      }
    }
  }
  return findings
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const findings = auditMobileWxs()
  if (findings.length) {
    console.error(`WXS 语法门禁未通过，共 ${findings.length} 项：`)
    for (const item of findings) console.error('  - ' + item)
    console.error('WXS 只支持 ES5 子集：禁止 for...in、正则字面量、$event、箭头函数、模板字符串、可选链、??、let/const、展开运算符、async/await。')
    process.exit(1)
  }
  console.log('WXS 语法门禁通过：三端 src 与构建产物均未出现不被开发者工具支持的写法。')
}
