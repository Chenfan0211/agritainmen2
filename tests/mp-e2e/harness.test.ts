import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPS, EXIT, READINESS, exitCodeFor, orderNoFrom, parseArgs, pickLogEvidence, preflightApp, readinessFindings, screenshotStats } from './harness.mjs'

describe('mp-e2e harness 纯函数', () => {
  it('parseArgs 取默认链路与端口', () => {
    expect(parseArgs(['--app', 'store'])).toMatchObject({ app: 'store', chain: 'L1', port: 9421 })
    expect(parseArgs(['--app', 'supplier'])).toMatchObject({ chain: 'L3', port: 9422 })
    expect(parseArgs(['--app', 'user', '--chain', 'L2', '--port', '9999'])).toMatchObject({ chain: 'L2', port: 9999 })
    expect(parseArgs(['--app', 'unknown'])).toMatchObject({ app: 'unknown', chain: '', port: 0 })
  })

  it('就绪判定：登录页（9 view / 5 按钮 / 26KB 截图）通过；空白页与未初始化不通过', () => {
    expect(readinessFindings({ pageCount: 1, hasVm: true, viewCount: 9, buttonCount: 5, screenshotBytes: 26250 })).toEqual([])
    const blank = readinessFindings({ pageCount: 1, hasVm: false, viewCount: 0, buttonCount: 0, screenshotBytes: 2512 })
    expect(blank.join('|')).toContain('$vm 缺失')
    expect(blank.join('|')).toContain('疑似空白')
    expect(readinessFindings({ pageCount: 1, hasVm: true, viewCount: 9, buttonCount: 1, screenshotBytes: 26250 }).join('|')).toContain('可点元素')
  })

  it('退出码映射：0 通过 / 1 断言失败 / 2 BLOCKED', () => {
    expect(exitCodeFor({ blocked: false, failures: 0 })).toBe(EXIT.PASS)
    expect(exitCodeFor({ blocked: false, failures: 2 })).toBe(EXIT.FAIL)
    expect(exitCodeFor({ blocked: true, failures: 0 })).toBe(EXIT.BLOCKED)
  })

  it('从开发者工具日志里提取模拟器启动证据', () => {
    const log = [
      '[INFO] compile success',
      '[ERROR] [SimulatorLaunch] SIMULATOR_LAUNCH_CAUGHT { valueType: \'undefined\' }',
      '[ERROR] [appservice] simulator launch failed Error: simulator launch failed',
      '[INFO] [appservice] simulator launch success',
      '[ERROR] app.json: app.json is not found in the project root directory'
    ].join('\n')
    const evidence = pickLogEvidence(log)
    expect(evidence).toHaveLength(4)
    expect(evidence[0]).toContain('SIMULATOR_LAUNCH_CAUGHT')
    expect(evidence.at(-1)).toContain('app.json')
  })

  it('份单号解析只取 SO/AS 编号', () => {
    expect(orderNoFrom('订单号 SO487592387001')).toBe('SO487592387001')
    expect(orderNoFrom('供应链 · 中台直配到店')).toBe('')
    expect(orderNoFrom(null)).toBe('')
  })

  it('预检：三端均有产物与测试号 appid；未知端失败', () => {
    expect(Object.keys(APPS)).toEqual(['store', 'supplier', 'user'])
    expect(APPS.store.initKeys).toContain('agritainment-platform-catalog')
    expect(preflightApp('nope').ok).toBe(false)
    const store = preflightApp('store')
    expect(store.findings.filter((item) => item.includes('app.json'))).toEqual([])
  })

  it('截图统计能区分有内容与空白', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp-e2e-shot-'))
    try {
      const file = join(dir, 'a.png')
      writeFileSync(file, Buffer.alloc(64))
      expect(screenshotStats(file).bytes).toBe(64)
      expect(screenshotStats(join(dir, 'missing.png')).bytes).toBe(0)
      mkdirSync(dir, { recursive: true })
      expect(READINESS.minButtons).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
