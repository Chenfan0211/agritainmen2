// 按端切换小程序 AppID（测试号 / 正式 AppID / 游客模式），一次只改一个端。
// 用法: node scripts/set-mp-appid.mjs <store|supplier|user> <wx开头的16位十六进制 | touristappid> [--dry-run]
// 说明: 只改 apps/<app>/src/manifest.json 里 mp-weixin 段的 appid，其余内容与格式保持不变。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootPath = fileURLToPath(new URL('..', import.meta.url))
const APPS = ['store', 'supplier', 'user']
const TOURIST_APPID = 'touristappid'

/** 校验并规范化小程序 AppID：测试号/正式号形如 wx + 16 位十六进制，或 touristappid（游客模式）。 */
export function normalizeAppId(input) {
  const value = String(input ?? '').trim()
  if (value === TOURIST_APPID) return TOURIST_APPID
  if (/^wx[0-9a-f]{16}$/.test(value)) return value
  throw new Error(`AppID 格式不合法：${value || '(空)'}（应为 wx + 16 位十六进制，或 ${TOURIST_APPID}）`)
}

/** 只替换 mp-weixin 段内的 appid，保留文件其余内容与缩进。 */
export function replaceWeixinAppId(source, appid) {
  const marker = '"mp-weixin"'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('manifest 缺少 mp-weixin 段')
  const rest = source.slice(start)
  const match = rest.match(/"appid"\s*:\s*"[^"]*"/)
  if (!match) throw new Error('manifest 的 mp-weixin 段缺少 appid')
  const updatedRest = rest.slice(0, match.index) + `"appid": "${appid}"` + rest.slice(match.index + match[0].length)
  return source.slice(0, start) + updatedRest
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const [app, appidInput, ...flags] = process.argv.slice(2)
  if (!APPS.includes(app)) {
    console.error(`用法: node scripts/set-mp-appid.mjs <${APPS.join('|')}> <AppID> [--dry-run]`)
    process.exit(1)
  }
  let appid
  try {
    appid = normalizeAppId(appidInput)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  const manifestPath = join(rootPath, 'apps', app, 'src', 'manifest.json')
  const source = readFileSync(manifestPath, 'utf8')
  const updated = replaceWeixinAppId(source, appid)
  const dryRun = flags.includes('--dry-run')
  console.log(`[${app}] mp-weixin.appid -> ${appid}${dryRun ? ' (dry-run，未写入)' : ''}`)
  if (!dryRun) {
    writeFileSync(manifestPath, updated)
    console.log(`[${app}] 已写入 apps/${app}/src/manifest.json，重新构建后生效：pnpm build:${app}`)
  }
}
