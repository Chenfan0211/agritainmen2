// 把各移动端实际使用的 lucide SVG 图标渲染为小程序可用的 PNG。
// 用法: node scripts/svg-icons-to-png.mjs
// 说明: 微信小程序 <image> 不支持本地 SVG，H5 支持；本脚本用 Chromium 把 SVG
//       渲染成 64x64 透明底 PNG（墨色 #1f2a22 描边），覆盖小程序端图标空白问题。
// 依赖: playwright-core（只驱动本机已装的 Chrome / Edge / ms-playwright Chromium，不下载浏览器）。
//       找不到浏览器时可用 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 显式指定。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)
const mobileApps = ['store', 'supplier', 'user']
const size = 64
const color = '#1f2a22'

/**
 * 从源码文本里推导用到的图标名：
 * 支持 `UiIcon name="x"`、`:name="cond ? 'a' : 'b'"` 与配置里的 `icon: 'x'`，
 * 并过滤掉不在本端图标目录内的名字与占位值 `none`。
 */
export function collectIconNamesFromSource(source, validIcons) {
  const valid = new Set(validIcons)
  const names = new Set()
  for (const match of source.matchAll(/UiIcon\s+name="([a-z-]+)"/g)) names.add(match[1])
  for (const match of source.matchAll(/UiIcon\s+:name="([^"]+)"/g)) {
    for (const literal of match[1].matchAll(/'([a-z-]+)'/g)) if (valid.has(literal[1])) names.add(literal[1])
  }
  for (const match of source.matchAll(/icon:\s*'([a-z-]+)'/g)) {
    if (match[1] !== 'none' && valid.has(match[1])) names.add(match[1])
  }
  return [...names].sort()
}

function sourceFiles(dir) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
    const path = join(d, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
  return walk(dir).filter((path) => /\.(vue|ts)$/.test(path))
}

/** 按端读取源码，返回实际使用的图标名（排序去重）。 */
export function usedIconNames(app, basePath = rootPath) {
  const dir = join(basePath, 'apps', app, 'src')
  const iconsDir = join(basePath, 'apps', app, 'src', 'static', 'icons')
  const validIcons = readdirSync(iconsDir).filter((file) => file.endsWith('.svg')).map((file) => file.replace(/\.svg$/, ''))
  const source = sourceFiles(dir).map((path) => readFileSync(path, 'utf8')).join('\n')
  return collectIconNamesFromSource(source, validIcons)
}

function playwrightCacheCandidates() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return []
  const cacheRoot = join(localAppData, 'ms-playwright')
  if (!existsSync(cacheRoot)) return []
  return readdirSync(cacheRoot)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort()
    .reverse()
    .flatMap((name) => [
      join(cacheRoot, name, 'chrome-win', 'chrome.exe'),
      join(cacheRoot, name, 'chrome-linux', 'chrome'),
      join(cacheRoot, name, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    ])
}

export function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ...playwrightCacheCandidates()
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** 渲染并覆盖各端 PNG（CLI 专用：需要 Chromium）。 */
export async function renderIconPngs({ basePath = rootPath, apps = mobileApps, iconSize = size, iconColor = color } = {}) {
  const { chromium } = await import('playwright-core')
  const executablePath = resolveChromiumExecutable()
  if (!executablePath) {
    throw new Error(
      '未找到可用 Chromium：请设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH，或安装 Google Chrome / Microsoft Edge 后重试。'
    )
  }
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 1 })
  for (const app of apps) {
    const iconsDir = join(basePath, 'apps', app, 'src', 'static', 'icons')
    const names = usedIconNames(app, basePath)
    for (const name of names) {
      const raw = readFileSync(join(iconsDir, `${name}.svg`), 'utf8')
      const svg = raw.replace(/<!--[\s\S]*?-->/g, '')
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div style="color:${iconColor}">${svg}</div></body></html>`)
      await page.$eval('svg', (el, s) => {
        el.setAttribute('width', String(s))
        el.setAttribute('height', String(s))
      }, iconSize)
      await page.locator('svg').screenshot({ path: join(iconsDir, `${name}.png`), omitBackground: true })
    }
    console.log(`${app}: ${names.length} icons -> PNG`)
  }
  await browser.close()
  return apps.length
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  await renderIconPngs()
  console.log('done')
}
