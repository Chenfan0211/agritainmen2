// 模拟器链路运行入口：
//   node tests/mp-e2e/run.mjs --app store --chain L1
//   node tests/mp-e2e/run.mjs --app supplier --chain L3
//   node tests/mp-e2e/run.mjs --app user --chain L2
//   node tests/mp-e2e/run.mjs --app <app> --dump        # 打印当前页面可点元素清单，便于补链路
// 前置：先 pnpm mp:appid <app> wx4942e19ae41bc1b4 && pnpm build:<app>，再运行本脚本（脚本内部不构建）。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APPS, EXIT, captureBlockedEvidence, count, createRun, cur, evidenceDirFor, parseArgs, preflightApp, resetAndRelaunch, screenshotStats, textOf } from './harness.mjs'

const CHAINS = {
  store: { L1: () => import('./chains/store.mjs').then((m) => m.runStoreL1) },
  supplier: { L3: () => import('./chains/supplier.mjs').then((m) => m.runSupplierL3) },
  user: { L2: () => import('./chains/user.mjs').then((m) => m.runUserL2) }
}

function usage() {
  console.log('用法: node tests/mp-e2e/run.mjs --app <store|supplier|user> [--chain L1|L2|L3] [--port n] [--dump]')
  console.log('前置: pnpm mp:appid <app> wx4942e19ae41bc1b4 && pnpm build:<app>（不要在项目打开时重建 dist）')
}

/**
 * 打印当前页面可点元素清单，并落盘到证据目录的 dump.txt ——
 * 用于把"能渲染的环境"上的选择器一次性交接回来（无需手工复制粘贴）。
 */
async function dumpPage(mp, evidenceDir) {
  const lines = []
  const log = (text) => {
    lines.push(text)
    console.log(text)
  }
  const page = await cur(mp)
  log(`--- page dump: ${page.path} ---`)
  for (const selector of ['button', 'input']) {
    const list = await page.$$(selector).catch(() => [])
    log(`[${selector}] ${list.length} 个`)
    for (const element of list.slice(0, 60)) {
      const cls = ((await element.attribute('class')) || '').replace(/data-v-\w+/g, '').trim()
      const text = ((await element.text()) || '').replace(/\s+/g, ' ').trim().slice(0, 30)
      const value = selector === 'input' ? await element.value().catch(() => '') : ''
      log(`  [${cls}] "${text}"${value ? ` value="${value}"` : ''}`)
    }
  }
  for (const selector of ['.tabbar button', '.pc-tile', '.order-card', '.product-card', '.cart-row', '.sheet-foot button', '.chip', '.row']) {
    const list = await page.$$(selector).catch(() => [])
    if (!list.length) continue
    log(`[${selector}] ${list.length} 个`)
    for (const element of list.slice(0, 20)) {
      log(`  "${((await element.text()) || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`)
    }
  }
  const shotPath = join(evidenceDir, 'dump.png')
  await mp.screenshot({ path: shotPath }).catch(() => {})
  log(`screenshot: ${shotPath}`)
  writeFileSync(join(evidenceDir, 'dump.txt'), lines.join('\n'), 'utf8')
  console.log(`dump 已落盘：${join(evidenceDir, 'dump.txt')}`)
}
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!APPS[args.app]) {
    console.error(`未知端: ${args.app || '(空)'}`)
    usage()
    process.exit(EXIT.BLOCKED)
  }
  const preflight = preflightApp(args.app)
  if (!preflight.ok) {
    console.error(`前置校验未通过（${args.app}）：`)
    for (const item of preflight.findings) console.error('  - ' + item)
    usage()
    process.exit(EXIT.BLOCKED)
  }
  console.log(`[${args.app}] 产物: ${preflight.dist}`)
  console.log(`[${args.app}] appid: ${preflight.appid}，app.json mtime: ${new Date(preflight.builtAt).toISOString()}`)
  console.log(`[${args.app}] 端口: ${args.port}，链路: ${args.chain}`)

  const dir = evidenceDirFor(args.app, args.chain)
  const run = createRun({ app: args.app, chain: args.chain, evidenceDir: dir })
  const ready = await resetAndRelaunch({ app: args.app, port: args.port, evidenceDir: dir })
  if (!ready.ok) {
    captureBlockedEvidence(dir)
    run.blocked(`模拟器未就绪（重试 ${APPS[args.app] ? '' : ''}后仍失败）：${(ready.findings || []).join('；')}`)
    run.write({ readiness: { viewCount: ready.viewCount, screenshotBytes: ready.screenshotBytes, pageCount: ready.pageCount, hasVm: ready.hasVm } })
    process.exit(EXIT.BLOCKED)
  }
  console.log(`[${args.app}] 模拟器就绪（第 ${ready.attempt} 次尝试，view 节点 ${ready.viewCount}，截图 ${ready.screenshotBytes}B）`)

  if (args.dump) {
    await dumpPage(ready.mp, dir)
    await ready.mp.disconnect().catch(() => {})
    process.exit(EXIT.PASS)
  }

  const loader = CHAINS[args.app]?.[args.chain]
  if (!loader) {
    console.error(`未实现的链路: ${args.app}/${args.chain}`)
    usage()
    await ready.mp.disconnect().catch(() => {})
    process.exit(EXIT.BLOCKED)
  }

  try {
    const chain = await loader()
    await chain({ mp: ready.mp, run })
  } catch (error) {
    if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(error.message)) {
      run.blocked(`${args.app}/${args.chain} 链路脚本尚未实现（当前只交付 store/L1）；L2/L3 待模拟器恢复渲染后补：${error.message.split('\n')[0]}`)
    } else {
      run.check(`${args.chain}-error`, '链路执行未抛异常', false, error.message)
    }
  } finally {
    try {
      await ready.mp.disconnect()
    } catch {
      /* 忽略 */
    }
  }
  run.write()
  process.exit(run.exitCode)
}

main().catch((error) => {
  console.error('运行失败：', error)
  process.exit(EXIT.BLOCKED)
})
