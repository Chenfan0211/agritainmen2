import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditBusinessTokens, auditTokenSource, collectTokenAuditFiles, isTokenAuditAllowed } from './audit-tokens.mjs'

describe('auditTokenSource', () => {
  it('flags hardcoded hex and rgb literals', () => {
    const source = ['.a { color: #F0810F; }', '.b { background: rgba(255, 255, 255, .2); }'].join('\n')
    const findings = auditTokenSource(source, 'apps/store/src/styles/global.scss')
    expect(findings).toHaveLength(2)
    expect(findings[0]).toContain('#F0810F')
    expect(findings[1]).toContain('rgba(')
  })

  it('accepts token mixed rgba and variable only values', () => {
    const source = '.a { background: rgba(var(--color-on-brand-rgb), .2); color: var(--color-ink); }'
    expect(auditTokenSource(source, 'apps/supplier/src/pages/index/index.wxss')).toEqual([])
  })

  it('only skips the admin compile-time uni.scss', () => {
    expect(isTokenAuditAllowed('apps/admin/src/uni.scss')).toBe(true)
    expect(auditTokenSource('$uni-color-primary: #f0810f;', 'apps/admin/src/uni.scss')).toEqual([])
    expect(isTokenAuditAllowed('apps/store/src/uni.scss')).toBe(false)
  })

  it('no longer exempts the three mobile app.wxss entries', () => {
    for (const app of ['store', 'supplier', 'user']) {
      expect(isTokenAuditAllowed(`apps/${app}/src/app.wxss`)).toBe(false)
      expect(auditTokenSource(':root { --color-brand-primary: #C8322B; }', `apps/${app}/src/app.wxss`)).toHaveLength(1)
    }
  })
})

describe('token contract', () => {
  it('keeps all four ends free of hardcoded colors', () => {
    expect(auditBusinessTokens()).toEqual([])
  })

  it('scans business sources and skips test files', () => {
    const files = collectTokenAuditFiles()
    expect(files).toContain('apps/store/src/styles/global.scss')
    expect(files).toContain('apps/user/src/styles/global.scss')
    expect(files).toContain('apps/store/src/app.wxss')
    expect(files.some((file) => file.includes('.test.'))).toBe(false)
  })

  it('keeps the store theme tokens in the single token source', () => {
    const css = readFileSync('packages/ui/src/design-tokens.css', 'utf8')
    for (const token of ['--color-store-brand', '--color-store-brand-rgb', '--color-store-line', '--gradient-store', '--shadow-store-bar']) {
      expect(css).toContain(token + ':')
    }
  })
})
