import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('user portal typography', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxss'), 'utf8')

  it('uses a readable muted color for small business copy', () => {
    expect(source).toContain('/* Mobile readability contrast */')
    expect(source).toContain('.supplier-name, .stock-text, .order-time')
    expect(source).toContain('color: var(--mobile-muted)')
  })
})