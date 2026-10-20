// 微信小程序包体门禁：三端主包与静态资源必须在预算内（微信主包上限 2MB）。
// 用法: node scripts/check-mp-bundle-size.mjs  （需先 pnpm build）
// 说明: 阈值按原始 dist/build/mp-weixin 体积统计，给微信上传压缩留安全边际。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootPath = fileURLToPath(new URL('..', import.meta.url))

/** 三端纯微信小程序。 */
export const BUNDLE_APPS = ['store', 'supplier', 'user']

/** 主包体积上限与静态资源上限（KB）。 */
export const BUNDLE_LIMITS = { totalKb: 1600, staticKb: 700 }

export function kb(bytes) {
  return Math.round(bytes / 1024)
}

export function directoryBytes(dir) {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    total += entry.isDirectory() ? directoryBytes(path) : statSync(path).size
  }
  return total
}

/** 单端判定：返回超预算明细（纯函数，便于单测）。 */
export function evaluateBundleSize({ app, totalBytes, staticBytes, limits = BUNDLE_LIMITS }) {
  const findings = []
  // 按字节比较，避免四舍五入掉临界超限
  if (totalBytes > limits.totalKb * 1024) {
    findings.push(`${app} 主包 ${kb(totalBytes)}KB 超过 ${limits.totalKb}KB 预算`)
  }
  if (staticBytes > limits.staticKb * 1024) {
    findings.push(`${app} 静态资源 ${kb(staticBytes)}KB 超过 ${limits.staticKb}KB 预算`)
  }
  return findings
}

/** 采集三端产物体积；未构建（dist 不存在）的端标记为 missing。 */
export function collectBundleSizes(basePath = rootPath, apps = BUNDLE_APPS) {
  const measured = []
  const missing = []
  for (const app of apps) {
    const dist = join(basePath, 'apps', app, 'dist', 'build', 'mp-weixin')
    if (!existsSync(dist)) {
      missing.push(app)
      continue
    }
    measured.push({ app, totalBytes: directoryBytes(dist), staticBytes: directoryBytes(join(dist, 'static')) })
  }
  return { measured, missing }
}

export function auditBundleSize(basePath = rootPath, apps = BUNDLE_APPS) {
  const { measured, missing } = collectBundleSizes(basePath, apps)
  const findings = measured.flatMap((item) => evaluateBundleSize(item))
  return { findings, measured, missing }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const { findings, measured, missing } = auditBundleSize()
  for (const item of measured) {
    console.log(`${item.app}: 主包 ${kb(item.totalBytes)}KB / 静态 ${kb(item.staticBytes)}KB（预算 ${BUNDLE_LIMITS.totalKb}KB / ${BUNDLE_LIMITS.staticKb}KB）`)
  }
  if (missing.length) {
    console.error(`缺少小程序构建产物：${missing.join('、')}；请先执行 pnpm build`)
    process.exit(1)
  }
  if (findings.length) {
    console.error('小程序包体门禁未通过：')
    for (const item of findings) console.error('  - ' + item)
    process.exit(1)
  }
  console.log('小程序包体门禁通过：三端主包与静态资源均在预算内。')
}
