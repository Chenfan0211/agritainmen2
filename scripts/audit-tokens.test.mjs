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
    expect(auditTokenSource(source, 'apps/supplier/src/pages/index/index.vue')).toEqual([])
  })

  it('skips compile time uni.scss variables', () => {
    expect(isTokenAuditAllowed('apps/store/src/uni.scss')).toBe(true)
    expect(auditTokenSource('$uni-color-primary: #f0810f;', 'apps/store/src/uni.scss')).toEqual([])
  })
})

describe('token contract', () => {
  it('keeps all four ends free of hardcoded colors', () => {
    expect(auditBusinessTokens()).toEqual([])
  })

  it('scans business sources and skips test files', () => {
    const files = collectTokenAuditFiles()
    expect(files).toContain('apps/store/src/styles/global.scss')
    expect(files).toContain('apps/store/src/uni.scss')
    expect(files.some((file) => file.includes('.test.'))).toBe(false)
  })

  it('keeps the store theme tokens in the single token source', () => {
    const css = readFileSync('packages/ui/src/design-tokens.css', 'utf8')
    for (const token of ['--color-store-brand', '--color-store-brand-rgb', '--color-store-line', '--gradient-store', '--shadow-store-bar']) {
      expect(css).toContain(token + ':')
    }
  })
})
