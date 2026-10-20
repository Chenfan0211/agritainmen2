// 小程序样式门禁：防止「标签选择器失效 / 主题变量漏 page / 新语法不兼容」回归。
// 用法: node scripts/audit-mp-styles.mjs  （构建后运行可同时校验 dist/build/mp-weixin 产物）
// 说明: 微信小程序会把 <small>/<strong>/<span>/<del> 等未知标签编译成 <view>，
//       因此这些标签选择器永远匹配不到元素，业务样式会整段失效；统一改用语义 class。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)

/** 三端纯微信小程序。 */
export const MOBILE_APPS = ['store', 'supplier', 'user']

/** 小程序不支持的 HTML 标签（会被编译成 view/text，标签选择器随之失效）。 */
// 注意：label / form / button / input / textarea / image / navigator / picker 等是微信原生组件，不在名单内。
export const UNSUPPORTED_TAGS = ['small', 'strong', 'span', 'em', 'del', 'b', 'i', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'section', 'article', 'header', 'footer', 'nav', 'table', 'tr', 'td', 'th', 'code', 'pre', 'figure', 'blockquote']

/** wxss 产物里允许出现、但 wxml 不一定有的标签（微信原生组件 + 框架标签）。 */
const BUILD_TAG_WHITELIST = new Set([
  'page', 'body', 'slot', 'template', 'block', 'import', 'include',
  'view', 'scroll-view', 'swiper', 'swiper-item', 'movable-area', 'movable-view',
  'cover-view', 'cover-image', 'match-media', 'page-container', 'share-element', 'root-portal',
  'icon', 'text', 'rich-text', 'progress', 'button', 'checkbox', 'checkbox-group', 'form',
  'input', 'label', 'picker', 'picker-view', 'picker-view-column', 'radio', 'radio-group',
  'slider', 'switch', 'textarea', 'navigator', 'functional-page-navigator', 'audio', 'image',
  'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas', 'open-data', 'web-view',
  'ad', 'ad-custom', 'official-account', 'open-container', 'navigation-bar', 'page-meta',
  'keyboard-accessory', 'editor', 'voip-room', 'channel-live', 'channel-video', 'snapshot'
].concat([
  'uni-button', 'uni-input', 'uni-textarea', 'uni-text', 'uni-view', 'uni-image',
  'uni-scroll-view', 'uni-swiper', 'uni-swiper-item', 'uni-movable-area', 'uni-movable-view',
  'uni-resize-sensor', 'uni-modal', 'uni-toast', 'uni-picker', 'uni-picker-view',
  'uni-picker-view-column', 'uni-checkbox', 'uni-radio', 'uni-switch', 'uni-slider',
  'uni-progress', 'uni-navigator', 'uni-label', 'uni-form', 'uni-canvas', 'uni-map', 'uni-video',
  'uni-cover-view', 'uni-cover-image', 'uni-rich-text', 'uni-web-view', 'uni-official-account',
  'uni-open-data', 'uni-ad', 'uni-camera', 'uni-live-player', 'uni-live-pusher', 'uni-icon'
]))

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function stripKeyframes(css) {
  return css.replace(/@(-webkit-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
}

function selectorTexts(css) {
  const clean = stripKeyframes(stripComments(css))
  const selectors = []
  let depth = 0
  let start = 0
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    if (char === '{') {
      const selector = clean.slice(start, i)
      if (!selector.trim().startsWith('@')) selectors.push(selector)
      depth++
      start = i + 1
      continue
    }
    if (char === '}') {
      depth = Math.max(0, depth - 1)
      start = i + 1
      continue
    }
    if (char === ';' && depth === 0) start = i + 1
  }
  return selectors
}

/** 找出使用小程序不支持标签/通配符的选择器（返回 { tag, selector } 列表）。 */
export function findUnsupportedTagSelectors(css) {
  const findings = []
  for (const selector of selectorTexts(css)) {
    for (const part of selector.split(',')) {
      for (const token of part.trim().split(/[\s>+~]+/)) {
        const tag = token.replace(/[.:#[].*$/, '')
        if (tag === '*') findings.push({ tag: '*', selector: part.trim() })
        else if (UNSUPPORTED_TAGS.includes(tag)) findings.push({ tag, selector: part.trim() })
      }
    }
  }
  return findings
}

/** 找出小程序 webview 兼容性风险语法。 */
export function findRiskyFeatures(css) {
  const clean = stripComments(css)
  const findings = []
  if (clean.includes('color-mix(')) findings.push('color-mix()：老微信内核不支持，整条声明会失效，请改用 rgba(var(--x-rgb), α)')
  if (/:has\(/.test(clean)) findings.push(':has()：老微信内核不支持，请改用状态 class')
  return findings
}

/** 找出 #ifdef MP-WEIXIN 块之外的 !important。 */
export function findImportantOutsideMpBlock(source) {
  const kept = source.replace(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*?\/\* #endif \*\//g, '')
  const hits = []
  kept.split('\n').forEach((line, index) => {
    if (line.includes('!important')) hits.push({ line: index + 1, text: line.trim().slice(0, 80) })
  })
  return hits
}

/** 主题变量块是否同时声明在 :root 与 page（小程序根节点是 page）。 */
export function hasPageScopedTokens(scss) {
  const clean = stripComments(scss)
  const blocks = clean.match(/(^|[},;\s])([^{}]*)\{[^{}]*--(?:mobile|store|color)-[a-z0-9-]+\s*:/g) || []
  return blocks.some((block) => {
    const selector = block.slice(0, block.indexOf('{')).replace(/^[},;\s]+/, '')
    return selector.split(',').some((part) => part.trim() === 'page')
  })
}

function styleEntries(source) {
  const entries = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let match
  while ((match = re.exec(source))) entries.push(match[1])
  return entries
}

function sourceFiles(app, basePath = rootPath) {
  const dir = join(basePath, 'apps', app, 'src')
  return walk(dir).filter((path) => /\.(vue|scss|css)$/.test(path))
}

/** 源码级巡检：返回该端所有命中项。 */
export function auditAppSource(app, basePath = rootPath) {
  const findings = []
  for (const path of sourceFiles(app, basePath)) {
    const source = readFileSync(path, 'utf8')
    const relative = path.slice(basePath.length).replace(/\\/g, '/')
    const styleBodies = path.endsWith('.vue') ? styleEntries(source).join('\n') : source
    for (const hit of findUnsupportedTagSelectors(styleBodies)) {
      const reason = hit.tag === '*'
        ? '通配符选择器（WXSS 编译报 unexpected token *）'
        : `标签选择器（<${hit.tag}> 在小程序里会被编译成 view）`
      findings.push(`${relative}: ${hit.selector} ${reason}`)
    }
    for (const hit of findRiskyFeatures(styleBodies)) findings.push(`${relative}: ${hit}`)
    for (const hit of findImportantOutsideMpBlock(styleBodies)) findings.push(`${relative}:${hit.line}: !important 只能出现在 #ifdef MP-WEIXIN 宽屏适配块（${hit.text}）`)
  }
  const globalScss = join(basePath, 'apps', app, 'src', 'styles', 'global.scss')
  if (existsSync(globalScss) && !hasPageScopedTokens(readFileSync(globalScss, 'utf8'))) {
    findings.push(`apps/${app}/src/styles/global.scss: 主题变量必须同时声明在 :root 与 page（小程序根节点是 page）`)
  }
  return findings
}

/** 产物级巡检：wxss 中的标签选择器必须在 wxml 里真实存在。 */
export function auditAppBuild(app, basePath = rootPath) {
  const dist = join(basePath, 'apps', app, 'dist', 'build', 'mp-weixin')
  if (!existsSync(dist)) return []
  const files = walk(dist)
  const wxml = files.filter((path) => path.endsWith('.wxml')).map((path) => readFileSync(path, 'utf8')).join('\n')
  const findings = []
  for (const path of files.filter((file) => file.endsWith('.wxss'))) {
    const relative = path.slice(basePath.length).replace(/\\/g, '/')
    for (const selector of selectorTexts(readFileSync(path, 'utf8'))) {
      for (const part of selector.split(',')) {
        for (const token of part.trim().split(/[\s>+~]+/)) {
          const tag = token.replace(/[.:#[].*$/, '')
          if (tag === '*') { findings.push(`${relative}: 选择器 ${part.trim()} 使用通配符，WXSS 无法编译`); continue }
          if (!/^[a-z][a-z0-9-]*$/.test(tag)) continue
          if (BUILD_TAG_WHITELIST.has(tag)) continue
          if (new RegExp(`<${tag}[\\s>/]`).test(wxml)) continue
          findings.push(`${relative}: 选择器 ${part.trim()} 依赖不存在的 <${tag}> 元素`)
        }
      }
    }
  }
  return findings
}

/** 四端入口：三端小程序按端巡检。 */
export function auditMobileStyles(basePath = rootPath) {
  const findings = []
  for (const app of MOBILE_APPS) {
    findings.push(...auditAppSource(app, basePath).map((item) => `[${app}] ${item}`))
    findings.push(...auditAppBuild(app, basePath).map((item) => `[build][${app}] ${item}`))
  }
  return findings
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const findings = auditMobileStyles()
  if (findings.length) {
    console.error(`小程序样式门禁未通过，共 ${findings.length} 项：`)
    for (const item of findings) console.error('  - ' + item)
    process.exit(1)
  }
  console.log('小程序样式门禁通过：标签选择器、主题变量作用域、兼容语法与 !important 均符合规范。')
}
