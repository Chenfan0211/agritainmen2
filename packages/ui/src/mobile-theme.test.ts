import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const theme = readFileSync(resolve(import.meta.dirname, 'mobile-theme.scss'), 'utf8')

describe('shared mobile visual theme', () => {
  it('defines the mobile token contract used by native mini programs', () => {
    for (const token of [
      '--mobile-brand', '--mobile-bg', '--mobile-surface', '--mobile-text', '--mobile-muted',
      '--mobile-border', '--mobile-danger', '--mobile-control-compact', '--mobile-control-primary',
      '--mobile-touch-target', '--mobile-tab-height', '--mobile-sheet-header-height'
    ]) expect(theme).toContain(token)
    expect(theme).toContain('--mobile-control-compact: 40px')
    expect(theme).toContain('--mobile-control-primary: 44px')
    expect(theme).toContain('--mobile-sheet-header-height: 56px')
  })

  it('wires the mp-weixin root selector and safe area contract', () => {
    expect(theme).toMatch(/page[^{]*\{/)
    expect(theme).toContain('env(safe-area-inset-bottom)')
    expect(theme).toContain('button::after')
  })
})
