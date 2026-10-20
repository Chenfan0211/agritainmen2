// 三端小程序静态图压缩：按真实渲染尺寸重编码 WebP，给微信主包 2MB 上限留出余量。
// 用法: node scripts/compress-static-images.mjs [--dry-run]
// 说明:
//   1) 品类图母版（assets/product-categories/master）在 375 屏只渲染 44×44，压到 128 方形；
//      压完必须执行 `pnpm sync:category-images` 同步到四端（哈希一致性由 tests/category-photo-assets.test.ts 守护）。
//   2) 商品图最大出现在详情横幅（375 宽），按 2x = 750 长边；同一份图同时用于列表位，因此不按列表 82px 再压小。
//   3) 复用 scripts/svg-icons-to-png.mjs 的 Chromium 探测，不新增依赖；体积不降不覆盖，脚本可重复执行。
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveChromiumExecutable } from './svg-icons-to-png.mjs'

const rootPath = fileURLToPath(new URL('..', import.meta.url))

/** 交付端清单（admin 同步消费品类图，但不参与小程序包体统计）。 */
const APP_LIST = ['admin', 'store', 'supplier', 'user']
const MOBILE_APP_LIST = ['store', 'supplier', 'user']

/** 品类图在 375 屏只渲染 44×44，按 128 提供（约 3x）。 */
export const CATEGORY_MAX_EDGE = 128
/** 商品图最大场景是详情横幅（375 宽），按 2x = 750 提供。 */
export const CONTENT_MAX_EDGE = 750
const WEBP_QUALITY = 0.78

export function isCategoryImage(relativePath) {
  // 端内路径是 static/images/categories/*，母版路径是 assets/product-categories/master/*，两种都要命中
  return /categories\//.test(relativePath.replace(/\\/g, '/'))
}

/** 按路径决定长边上限：品类图 128，其余 750。 */
export function maxEdgeForImage(relativePath) {
  return isCategoryImage(relativePath) ? CATEGORY_MAX_EDGE : CONTENT_MAX_EDGE
}

/** 等比缩放到长边上限；已在上限内返回 null（不再重编码，保证幂等与画质稳定）。 */
export function targetSize(width, height, maxEdge) {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest <= 0) return null
  if (longest <= maxEdge) return null
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 幂等保护：只有更小才覆盖。 */
export function shouldReplace(originalBytes, nextBytes) {
  return Number.isFinite(nextBytes) && nextBytes > 0 && nextBytes < originalBytes
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

function webpFilesIn(dir) {
  if (!existsSync(dir)) return []
  return walk(dir).filter((path) => extname(path).toLowerCase() === '.webp').sort()
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/** 品类图母版清单（compress 后需 sync 到四端）。 */
export function categoryMasterFiles(basePath = rootPath) {
  return webpFilesIn(join(basePath, 'assets', 'product-categories', 'master')).map((path) => relative(basePath, path).replace(/\\/g, '/'))
}

/** 共享商品图母版清单。 */
export function contentMasterFiles(basePath = rootPath) {
  return webpFilesIn(join(basePath, 'assets', 'images')).map((path) => relative(basePath, path).replace(/\\/g, '/'))
}

/** 各端自有商品图（排除品类图：品类图由 sync:category-images 统一同步）。 */
export function appContentImageFiles(basePath = rootPath, apps = APP_LIST) {
  const files = []
  for (const app of apps) {
    for (const path of webpFilesIn(join(basePath, 'apps', app, 'src', 'static', 'images'))) {
      const rel = relative(basePath, path).replace(/\\/g, '/')
      if (isCategoryImage(rel)) continue
      files.push(rel)
    }
  }
  return files.sort()
}

function kb(bytes) {
  return Math.round(bytes / 1024)
}

function staticImagesBytes(basePath, app) {
  const dir = join(basePath, 'apps', app, 'src', 'static', 'images')
  if (!existsSync(dir)) return 0
  return walk(dir).reduce((sum, path) => sum + statSync(path).size, 0)
}

/** 用 Chromium 画布把位图重编码为 WebP（小程序与 H5 均支持）。 */
async function encodeImage(page, buffer, maxEdge) {
  const dataUrl = 'data:image/webp;base64,' + buffer.toString('base64')
  return page.evaluate(async ({ dataUrl, maxEdge, quality }) => {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('图片解码失败')); image.src = dataUrl })
    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    const longest = Math.max(naturalWidth, naturalHeight)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)
    const encoded = canvas.toDataURL('image/webp', quality)
    return { width, height, naturalWidth, naturalHeight, dataUrl: encoded }
  }, { dataUrl, maxEdge, quality: WEBP_QUALITY })
}

function decodeDataUrl(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

export async function compressStaticImages({ basePath = rootPath, apps = APP_LIST, dryRun = false } = {}) {
  const { chromium } = await import('playwright-core')
  const executablePath = resolveChromiumExecutable()
  if (!executablePath) {
    throw new Error('未找到可用 Chromium：请设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH，或安装 Google Chrome / Microsoft Edge 后重试。')
  }

  const before = {}
  for (const app of apps) before[app] = staticImagesBytes(basePath, app)

  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })
  const encodedByOriginalHash = new Map()
  const results = []

  const masters = [...categoryMasterFiles(basePath), ...contentMasterFiles(basePath)]
  for (const file of masters) {
    const absolute = join(basePath, file)
    const buffer = readFileSync(absolute)
    const maxEdge = maxEdgeForImage(file)
    const encoded = await encodeImage(page, buffer, maxEdge)
    const next = decodeDataUrl(encoded.dataUrl)
    const resized = encoded.naturalWidth !== encoded.width || encoded.naturalHeight !== encoded.height
    const applied = resized && shouldReplace(buffer.length, next.length)
    if (applied) {
      encodedByOriginalHash.set(sha256(buffer), next)
      if (!dryRun) writeFileSync(absolute, next)
    }
    results.push({ file, from: buffer.length, to: applied ? next.length : buffer.length, size: encoded.width + 'x' + encoded.height, applied })
  }

  for (const file of appContentImageFiles(basePath, apps)) {
    const absolute = join(basePath, file)
    const buffer = readFileSync(absolute)
    const shared = encodedByOriginalHash.get(sha256(buffer))
    if (shared) {
      if (!dryRun) copyFileSync(join(basePath, 'assets', 'images', file.split('/').pop()), absolute)
      results.push({ file, from: buffer.length, to: shared.length, size: 'shared', applied: true })
      continue
    }
    const encoded = await encodeImage(page, buffer, maxEdgeForImage(file))
    const next = decodeDataUrl(encoded.dataUrl)
    const resized = encoded.naturalWidth !== encoded.width || encoded.naturalHeight !== encoded.height
    const applied = resized && shouldReplace(buffer.length, next.length)
    if (applied && !dryRun) writeFileSync(absolute, next)
    results.push({ file, from: buffer.length, to: applied ? next.length : buffer.length, size: encoded.width + 'x' + encoded.height, applied })
  }

  await browser.close()

  for (const item of results) {
    console.log(`${item.applied ? '压缩' : '跳过'} ${item.file} ${kb(item.from)}KB -> ${kb(item.to)}KB (${item.size})`)
  }
  const after = {}
  for (const app of apps) after[app] = dryRun ? before[app] : staticImagesBytes(basePath, app)
  for (const app of MOBILE_APP_LIST) {
    if (before[app] === undefined) continue
    console.log(`${app} 静态图 ${kb(before[app])}KB -> ${kb(after[app])}KB`)
  }
  console.log('品类图母版已更新：请执行 `pnpm sync:category-images` 同步到四端后再构建。')
  return results
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  await compressStaticImages({ dryRun: process.argv.includes('--dry-run') })
}
