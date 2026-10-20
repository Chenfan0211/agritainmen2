import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLE_APPS, BUNDLE_LIMITS, auditBundleSize, collectBundleSizes, directoryBytes, evaluateBundleSize, kb } from './check-mp-bundle-size.mjs'

function writeFile(path, bytes) {
  writeFileSync(path, Buffer.alloc(bytes))
}

describe('evaluateBundleSize', () => {
  it('passes when both the main package and static assets are inside budget', () => {
    expect(evaluateBundleSize({ app: 'store', totalBytes: 900 * 1024, staticBytes: 400 * 1024 })).toEqual([])
  })

  it('flags an oversized main package and oversized static assets', () => {
    const findings = evaluateBundleSize({ app: 'store', totalBytes: BUNDLE_LIMITS.totalKb * 1024 + 1, staticBytes: BUNDLE_LIMITS.staticKb * 1024 + 1 })
    expect(findings).toHaveLength(2)
    expect(findings[0]).toContain('store 主包')
    expect(findings[1]).toContain('store 静态资源')
  })

  it('honours custom limits and rounds to whole KB', () => {
    expect(kb(1024 * 1600)).toBe(1600)
    expect(evaluateBundleSize({ app: 'user', totalBytes: 1024 + 1, staticBytes: 1024 + 1, limits: { totalKb: 1, staticKb: 1 } })).toHaveLength(2)
  })
})

describe('collectBundleSizes', () => {
  it('measures built apps and reports the missing ones', () => {
    const base = mkdtempSync(join(tmpdir(), 'mp-bundle-audit-'))
    try {
      const dist = join(base, 'apps', 'store', 'dist', 'build', 'mp-weixin')
      mkdirSync(join(dist, 'static', 'images'), { recursive: true })
      writeFile(join(dist, 'app.js'), 300 * 1024)
      writeFile(join(dist, 'static', 'images', 'a.webp'), 100 * 1024)

      const { measured, missing } = collectBundleSizes(base, ['store', 'user'])
      expect(measured).toHaveLength(1)
      expect(measured[0]).toMatchObject({ app: 'store', totalBytes: 400 * 1024, staticBytes: 100 * 1024 })
      expect(missing).toEqual(['user'])
      expect(directoryBytes(join(base, 'apps', 'store', 'dist', 'build', 'mp-weixin'))).toBe(400 * 1024)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('mini program bundle budget', () => {
  it('keeps every built mobile bundle inside the configured budget', () => {
    const { findings, measured } = auditBundleSize()
    expect(measured.map((item) => item.app)).toEqual(BUNDLE_APPS.filter((app) => measured.some((item) => item.app === app)))
    // 未构建时（例如先在干净环境跑 pnpm test）跳过体积断言，由 pnpm check:mp-size 在构建后强制校验。
    for (const item of measured) expect(findings, item.app).toEqual([])
  })
})
