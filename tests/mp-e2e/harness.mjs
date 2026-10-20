// 微信开发者工具模拟器驱动层：就绪探针 + 自动重启重试 + 失败证据。
// 由 tests/mp-e2e/run.mjs 调用；放在 tests/ 下是为了避开 scripts/ 的接口覆盖审计。
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const CLI_PATH = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
export const TEST_APPID = 'wx4942e19ae41bc1b4'

/** 三端固定端口与链路默认值；一次只开一个项目。 */
export const APPS = {
  store: { port: 9421, dist: 'apps/store/dist/build/mp-weixin', chain: 'L1', initKeys: ['agritainment-platform-catalog'] },
  supplier: { port: 9422, dist: 'apps/supplier/dist/build/mp-weixin', chain: 'L3', initKeys: ['agritainment-platform-orders'] },
  user: { port: 9423, dist: 'apps/user/dist/build/mp-weixin', chain: 'L2', initKeys: ['agritainment-platform-c-inventory', 'agritainment-platform-c-products'] }
}

/** 就绪口径：页面已挂载（$vm）+ view 节点足够 + 截图非空白。 */
export const READINESS = { minButtons: 3, minViews: 1, minScreenshotBytes: 8192, timeoutMs: 180000, pollMs: 3000, attempts: 3 }
export const EXIT = { PASS: 0, FAIL: 1, BLOCKED: 2 }

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** 纯函数：解析 CLI 参数。 */
export function parseArgs(argv) {
  const parsed = { app: '', chain: '', port: 0, dump: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--app') parsed.app = String(argv[i + 1] || '')
    else if (token === '--chain') parsed.chain = String(argv[i + 1] || '')
    else if (token === '--port') parsed.port = Number(argv[i + 1] || 0)
    else if (token === '--dump') parsed.dump = true
  }
  const config = APPS[parsed.app]
  if (config) {
    if (!parsed.chain) parsed.chain = config.chain
    if (!parsed.port) parsed.port = config.port
  }
  return parsed
}

/** 纯函数：就绪判定，返回未达标项。 */
export function readinessFindings({ pageCount = 0, hasVm = false, viewCount = 0, buttonCount = 0, screenshotBytes = 0 }, limits = READINESS) {
  const findings = []
  if (pageCount < 1) findings.push('getCurrentPages() 为空')
  if (!hasVm) findings.push('页面 $vm 缺失（view 层未挂载）')
  if (viewCount < limits.minViews) findings.push(`view 节点 ${viewCount} < ${limits.minViews}`)
  if (buttonCount < limits.minButtons) findings.push(`可点元素 ${buttonCount} < ${limits.minButtons}（页面未渲染交互）`)
  if (screenshotBytes < limits.minScreenshotBytes) findings.push(`截图 ${screenshotBytes}B < ${limits.minScreenshotBytes}B（疑似空白）`)
  return findings
}

/** 纯函数：从开发者工具日志提取模拟器启动相关证据行。 */
export function pickLogEvidence(text, limit = 20) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => /SIMULATOR_LAUNCH|simulator launch failed|simulator launch success|app\.json/.test(line))
    .slice(-limit)
}

/** 纯函数：只取订单号本身（`订单号 SO123` → `SO123`）。 */
export function orderNoFrom(text) {
  const match = String(text || '').match(/([A-Z]{2}\d{6,})/)
  return match ? match[1] : ''
}

/** 纯函数：退出码映射。 */
export function exitCodeFor({ blocked = false, failures = 0 }) {
  if (blocked) return EXIT.BLOCKED
  return failures > 0 ? EXIT.FAIL : EXIT.PASS
}

/**
 * 开发者工具 CLI：路径含空格与中文，必须走带引号的 shell 命令。
 * 用异步 exec（不要 execSync）——同步阻塞事件循环会让尚未关闭的 automator ws 连接变成半开状态，
 * 从而毒化随后的自动化会话（表现为 page.$$ 恒为空）。
 */
async function cli(...args) {
  const command = [CLI_PATH, ...args].map((part) => `"${part}"`).join(' ')
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await promisify(exec)(command, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    } catch (error) {
      lastError = error
      await sleep(2000)
    }
  }
  throw lastError
}

function weappLogRoot() {
  const base = join(process.env.LOCALAPPDATA || '', '微信开发者工具', 'User Data')
  if (!existsSync(base)) return ''
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(base, entry.name, 'WeappLog', 'logs')
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/** 收集最近一次模拟器启动的日志证据。 */
export function collectLaunchEvidence() {
  const root = weappLogRoot()
  if (!root) return []
  const files = readdirSync(root)
    .filter((name) => name.endsWith('.log'))
    .map((name) => join(root, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!files.length) return []
  const text = readFileSync(files[0], 'utf8')
  return pickLogEvidence(text.split(/\r?\n/).slice(-6000).join('\n'))
}

/** 截图 PNG 统计：判定空白页用。 */
export function screenshotStats(file) {
  if (!existsSync(file)) return { bytes: 0, uniqueBytes: 0, width: 0, height: 0 }
  const buffer = readFileSync(file)
  let offset = 8
  const idat = []
  let width = 0
  let height = 0
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString()
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8)
      height = buffer.readUInt32BE(offset + 12)
    }
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  let uniqueBytes = 0
  try {
    uniqueBytes = new Set(inflateSync(Buffer.concat(idat))).size
  } catch {
    uniqueBytes = 0
  }
  return { bytes: buffer.length, uniqueBytes, width, height }
}

/** 前置校验：产物存在 + appid 为测试号（脚本内部不构建）。 */
export function preflightApp(app) {
  const config = APPS[app]
  const findings = []
  if (!config) return { ok: false, findings: [`未知端: ${app || '(空)'}`] }
  const dist = resolve(ROOT, config.dist)
  const appJson = join(dist, 'app.json')
  const projectConfig = join(dist, 'project.config.json')
  if (!existsSync(appJson)) findings.push(`缺少 ${config.dist}/app.json（先执行 pnpm build:${app}）`)
  if (!existsSync(projectConfig)) findings.push(`缺少 ${config.dist}/project.config.json`)
  let appid = ''
  if (existsSync(projectConfig)) {
    appid = JSON.parse(readFileSync(projectConfig, 'utf8')).appid || ''
    if (appid !== TEST_APPID) findings.push(`appid=${appid || '(空)'} 不是测试号 ${TEST_APPID}（执行 pnpm mp:appid ${app} ${TEST_APPID} 后重新构建）`)
  }
  return { ok: findings.length === 0, findings, dist, appid, builtAt: existsSync(appJson) ? statSync(appJson).mtimeMs : 0 }
}

/**
 * 解析 miniprogram-automator：不写进仓库依赖（避免扰动 pnpm 依赖图导致 vite 构建失败），
 * 按 MP_AUTOMATOR_PATH → %TEMP%/mp-auto → 仓库 node_modules 顺序查找。
 */
export async function loadAutomator() {
  const candidates = [
    process.env.MP_AUTOMATOR_PATH,
    process.env.TEMP ? join(process.env.TEMP, 'mp-auto', 'node_modules', 'miniprogram-automator') : '',
    join(ROOT, 'node_modules', 'miniprogram-automator')
  ].filter(Boolean)
  for (const dir of candidates) {
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    // 该包入口是 out/index.js（package.json main），不能写死 index.js
    const main = JSON.parse(readFileSync(pkgPath, 'utf8')).main || 'index.js'
    const entry = resolve(dir, main)
    const entryFile = existsSync(entry) ? entry : `${entry}.js`
    if (!existsSync(entryFile)) continue
    const module = await import(pathToFileURL(entryFile).href).catch(() => null)
    if (module) return module.default || module
  }
  try {
    const module = await import('miniprogram-automator')
    return module.default || module
  } catch {
    throw new Error('未找到 miniprogram-automator：请执行 npm install --prefix "%TEMP%\\mp-auto" miniprogram-automator@0.13.0，或用 MP_AUTOMATOR_PATH 指定安装目录（不要装进本仓库依赖）')
  }
}

export async function tryConnect(port, { retries = 8, delayMs = 1500 } = {}) {
  const automator = await loadAutomator()
  for (let i = 0; i < retries; i += 1) {
    try {
      return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` })
    } catch {
      await sleep(delayMs)
    }
  }
  return null
}
/** 探针：页面挂载 + view 节点 + 截图非空白。 */
export async function probeReadiness(mp, evidenceDir, { initKeys = [] } = {}) {
  const result = { ok: false, findings: [], viewCount: 0, buttonCount: 0, screenshotBytes: 0, pageCount: 0, hasVm: false, initKeysFound: [] }
  try {
    const page = await mp.currentPage()
    const info = await mp.evaluate((keys) => {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const first = pages[0]
      const found = []
      for (const key of keys) {
        try {
          const value = wx.getStorageSync(key)
          if (value !== '' && value !== null && value !== undefined) found.push(key)
        } catch {
          /* 忽略 */
        }
      }
      return { pageCount: pages.length, hasVm: !!(first && first.$vm), found }
    }, initKeys)
    result.pageCount = info.pageCount
    result.hasVm = info.hasVm
    result.initKeysFound = info.found || []
    try {
      result.viewCount = (await page.$$('view')).length
    } catch {
      result.viewCount = 0
    }
    try {
      result.buttonCount = (await page.$$('button')).length
    } catch {
      result.buttonCount = 0
    }
    try {
      const shotPath = join(evidenceDir, 'readiness.png')
      await mp.screenshot({ path: shotPath })
      result.screenshotBytes = screenshotStats(shotPath).bytes
    } catch {
      result.screenshotBytes = 0
    }
    result.findings = readinessFindings(result)
    if (initKeys.length && !result.initKeysFound.length) {
      result.findings.push('应用未重新初始化（平台存储未播种：' + initKeys.join(' / ') + '）')
    }
    result.ok = result.findings.length === 0
    result.page = page
    return result
  } catch (error) {
    result.findings = ['探针异常: ' + error.message]
    return result
  }
}

/**
 * 等模拟器就绪：
 * 实测 `auto` 之后约 10–20s 自动化会话才完成 view 层注册，过早连接会得到
 * `getPageMetaByWebviewId(...) is null` 或 view 节点 0；因此先沉降再慢节奏重连，
 * 每 3 轮补发一次 auto（不重启项目）帮助会话重新注册。
 */
async function waitForReady(port, evidenceDir, log, initKeys = [], { target = '' } = {}) {
  const deadline = Date.now() + READINESS.timeoutMs
  let last = { ok: false, findings: ['尚未连接自动化端口'] }
  let round = 0
  log(`  等待模拟器渲染（最多 ${Math.round(READINESS.timeoutMs / 1000)}s，先沉降 15s）…`)
  await sleep(15000)
  while (Date.now() < deadline) {
    round += 1
    const mp = await tryConnect(port, { retries: 3, delayMs: 2000 })
    if (mp) {
      const probe = await probeReadiness(mp, evidenceDir, { initKeys })
      try {
        await mp.disconnect()
      } catch {
        /* 忽略 */
      }
      if (probe.ok) return { ...probe, mp: await tryConnect(port, { retries: 3, delayMs: 2000 }) }
      last = probe
      log(`  第 ${round} 轮未就绪：${probe.findings.join('；')}`)
      if (round % 3 === 0 && target) {
        log('  补发 auto 让自动化会话重新注册…')
        try {
          await cli('auto', '--project', target, '--auto-port', String(port), '--trust-project')
        } catch (error) {
          log(`  补发 auto 失败：${error.message.split('\n')[0]}`)
        }
      }
    } else {
      log('  自动化端口未响应，继续等待…')
    }
    await sleep(6000)
  }
  return last
}
/**
 * 复位并确保模拟器可用：
 * ① 若应用在跑 → 清空存储（保证演示种子确定性）；
 * ② 整包重启（close → open → auto）——清存储后必须重启，否则平台数据不会重新播种；
 * ③ 就绪探针：view 层已挂载（$vm + 节点 + 非空白截图）且平台存储已播种。
 */
export async function resetAndRelaunch({ app, port, evidenceDir, log = console.log }) {
  const config = APPS[app]
  const dist = resolve(ROOT, config.dist)
  const initKeys = config.initKeys || []

  const existing = await tryConnect(port, { retries: 2, delayMs: 1000 })
  if (existing) {
    try {
      await existing.evaluate(() => wx.clearStorageSync())
      log('已清空小程序存储')
    } catch {
      /* 忽略 */
    }
    try {
      await existing.disconnect()
    } catch {
      /* 忽略 */
    }
    await sleep(1500)
  }

  let last = { ok: false, findings: ['未尝试'] }
  for (let attempt = 1; attempt <= READINESS.attempts; attempt += 1) {
    log(`重启模拟器（第 ${attempt}/${READINESS.attempts} 次）：close → open → auto`)
    try {
      await cli('close', '--project', dist)
    } catch (error) {
      log(`  close 失败（可能未打开）：${error.message.split('\n')[0]}`)
    }
    await sleep(3000)
    if (attempt === READINESS.attempts) {
      // 硬恢复：模拟器 view 层反复不挂载时，清编译缓存并重启 IDE
      log('  硬恢复：cache --clean compile → quit IDE')
      try {
        await cli('cache', '--clean', 'compile', '--project', dist)
      } catch (error) {
        log(`  cache 清理失败：${error.message.split('\n')[0]}`)
      }
      try {
        await cli('quit', '--project', dist)
      } catch (error) {
        log(`  quit 失败（IDE 可能已退出）：${error.message.split('\n')[0]}`)
      }
      await sleep(8000)
    }
    try {
      await cli('open', '--project', dist)
    } catch (error) {
      log(`  open 失败（可能已打开）：${error.message.split('\n')[0]}`)
    }
    await sleep(8000)
    try {
      await cli('auto', '--project', dist, '--auto-port', String(port), '--trust-project')
    } catch (error) {
      log(`  auto 失败（端口可能已就绪）：${error.message.split('\n')[0]}`)
    }
    last = await waitForReady(port, evidenceDir, log, initKeys, { target: dist })
    if (last.ok) return { ...last, attempt }
  }
  return last
}
/** 元素与页面辅助：每次都取新的 currentPage()，避免点到隐藏页面实例。 */
export const cur = (mp) => mp.currentPage()

export async function count(page, selector) {
  return (await page.$$(selector)).length
}

export async function textOf(page, selector, index = 0) {
  const list = await page.$$(selector)
  const target = list[index]
  if (!target) return null
  return ((await target.text()) || '').replace(/\s+/g, ' ').trim()
}

export async function tapSel(page, selector, index = 0) {
  const list = await page.$$(selector)
  if (!list[index]) throw new Error(`未找到可点元素 ${selector}[${index}]`)
  await list[index].tap()
  await sleep(700)
}

export async function tapText(page, selector, text, index = 0) {
  const list = await page.$$(selector)
  let matched = 0
  for (const element of list) {
    const value = ((await element.text()) || '').replace(/\s+/g, ' ').trim()
    if (!value.includes(text)) continue
    if (matched++ < index) continue
    await element.tap()
    await sleep(700)
    return true
  }
  return false
}

export async function tapTab(mp, label, { settleMs = 900 } = {}) {
  const page = await cur(mp)
  const ok = await tapText(page, '.tabbar button', label)
  await sleep(settleMs)
  return ok
}

export async function waitForSelector(mp, selector, { timeoutMs = 12000, pollMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = await cur(mp)
    try {
      if ((await page.$$(selector)).length > 0) return page
    } catch {
      /* 页面切换中，继续等 */
    }
    await sleep(pollMs)
  }
  return null
}

/** 等页面跳转到指定路由；返回命中的页面（失败返回 null）。 */
export async function waitForRoute(mp, fragment, { timeoutMs = 12000, pollMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = await cur(mp)
    if (page && String(page.path).includes(fragment)) return page
    await sleep(pollMs)
  }
  return null
}

/** 轮询选择器文本直到满足 predicate；返回最后读到的文本。 */
export async function waitForText(mp, selector, predicate, { timeoutMs = 8000, pollMs = 400, index = 0 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastText = null
  while (Date.now() < deadline) {
    const page = await cur(mp)
    lastText = await textOf(page, selector, index).catch(() => null)
    if (predicate(lastText)) return lastText
    await sleep(pollMs)
  }
  return lastText
}

export async function shot(mp, evidenceDir, name) {
  const file = join(evidenceDir, `${name}.png`)
  await mp.screenshot({ path: file })
  return file
}

/** 报告与退出码。 */
export function createRun({ app, chain, evidenceDir }) {
  const checks = []
  const failures = []
  let blockedReason = ''
  const run = {
    app,
    chain,
    evidenceDir,
    checks,
    failures,
    check(id, label, ok, detail = '') {
      checks.push({ id, label, ok, detail })
      if (!ok) failures.push(`${id} ${label} :: ${detail}`)
      console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} ${label}${detail ? ' | ' + detail : ''}`)
      return ok
    },
    blocked(reason) {
      blockedReason = reason
      console.log(`BLOCKED | ${reason}`)
    },
    get blockedReason() {
      return blockedReason
    },
    get exitCode() {
      return exitCodeFor({ blocked: !!blockedReason, failures: failures.length })
    },
    write(extra = {}) {
      mkdirSync(evidenceDir, { recursive: true })
      const report = { app, chain, ranAt: new Date().toISOString(), exitCode: run.exitCode, blockedReason, checks, failures, ...extra }
      writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
      const passed = checks.filter((item) => item.ok).length
      console.log(`---- ${app}/${chain} 汇总：PASS ${passed}/${checks.length}，失败 ${failures.length}${blockedReason ? '，BLOCKED' : ''} ----`)
      for (const item of failures) console.log('  - ' + item)
      console.log(`证据目录：${evidenceDir}`)
      return report
    }
  }
  mkdirSync(evidenceDir, { recursive: true })
  return run
}

/** BLOCKED 证据包：启动日志行 + 提示。 */
export function captureBlockedEvidence(evidenceDir, log = console.log) {
  const evidence = collectLaunchEvidence()
  mkdirSync(evidenceDir, { recursive: true })
  const file = join(evidenceDir, 'devtools-launch-evidence.txt')
  writeFileSync(file, evidence.join('\n') || '(未找到相关的开发者工具日志行)', 'utf8')
  log(`已写入启动证据：${file}`)
  log('提示：请先构建（pnpm build:<app>）再打开项目，不要在项目打开期间重建 dist。')
  return evidence
}

export function evidenceDirFor(app, chain) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return resolve(ROOT, 'artifacts', 'mp-e2e', `${app}-${chain}-${stamp}`)
}
