import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const themePath = resolve(import.meta.dirname, 'mobile-theme.scss')
const mobileApps = ['user', 'store', 'supplier']
const ownedMobileApps = ['user', 'store']

describe('shared mobile visual theme', () => {
  it('defines the shared mobile design contract', () => {
    expect(existsSync(themePath)).toBe(true)
    const source = readFileSync(themePath, 'utf8')

    for (const token of [
      '--mobile-brand',
      '--mobile-brand-deep',
      '--mobile-bg',
      '--mobile-surface',
      '--mobile-text',
      '--mobile-muted',
      '--mobile-border',
      '--mobile-price',
      '--mobile-warning',
      '--mobile-info',
      '--mobile-danger',
      '--mobile-radius-control',
      '--mobile-radius-card',
      '--mobile-radius-pill',
      '--mobile-shadow-float',
      '--mobile-control-compact',
      '--mobile-control-primary',
      '--mobile-touch-target',
      '--mobile-tab-height',
      '--mobile-section-gap',
      '--mobile-card-gap',
      '--mobile-card-padding',
      '--mobile-action-bar-height',
      '--mobile-sheet-header-height',
      '--mobile-sheet-max-height'
    ]) expect(source).toContain(token)

    expect(source).toContain('--mobile-control-compact: 40px')
    expect(source).toContain('--mobile-control-primary: 44px')
    expect(source).toContain('--mobile-touch-target: var(--mobile-control-primary)')
    expect(source).toContain('--mobile-section-gap: 12px')
    expect(source).toContain('--mobile-card-gap: 8px')
    expect(source).toContain('--mobile-sheet-header-height: 56px')
    expect(source).toContain('--mobile-sheet-max-height: 80vh')
    expect(source).toContain('--mobile-page-inline: 8px')
    expect(source).toContain('letter-spacing: 0')
    expect(source).toContain('env(safe-area-inset-bottom)')
    expect(source).toMatch(/button,\s*uni-button\s*\{[\s\S]*display:\s*inline-flex[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*center[\s\S]*text-align:\s*center/)
    expect(source).toMatch(/button::after,\s*uni-button::after\s*\{[\s\S]*border:\s*none[\s\S]*background:\s*none/)
    expect(source).toMatch(/\.sheet-scroll\s*\{[\s\S]*height:\s*auto/)
    expect(source).toMatch(/\.sheet-scroll\s*\{[\s\S]*max-height:\s*calc\(80vh/)
    expect(source).not.toMatch(/\.sheet-scroll\s*\{[^}]*[^x-]height:\s*calc\(80vh/)
    expect(source).toMatch(/\.sheet-foot\s*\{[\s\S]*padding:\s*10px 12px/)
    expect(source).toContain('--mobile-radius-pill: 999px')
    expect(source).toMatch(/\.mobile-action-primary\s*\{[\s\S]*border:\s*1px solid var\(--mobile-brand\)/)
    expect(source).toMatch(/\.mobile-action-secondary\s*\{[\s\S]*border:\s*1px solid var\(--mobile-border\)/)
    expect(source).toMatch(/\.mobile-search\s*\{[\s\S]*border-radius:\s*var\(--mobile-radius-pill\)/)
    expect(source).toMatch(/\.mobile-filter-tabs button\.active::after[\s\S]*background:\s*currentColor/)
    expect(source).toMatch(/\.page-back\s*\{[\s\S]*width:\s*44px[\s\S]*height:\s*44px[\s\S]*border-radius:\s*6px[\s\S]*background:\s*var\(--mobile-surface\)/)
    expect(source).toMatch(/\.logout-danger\s*\{[\s\S]*background:\s*var\(--mobile-danger\)[\s\S]*color:\s*#fff/)
  })

  it('provides the shared personal-center pc-* layout contract', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\.pc-page\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*var\(--mobile-section-gap\)/)
    expect(source).toMatch(/\.pc-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*minmax\(0,\s*1fr\)/)
    expect(source).toMatch(/\.pc-row\s*\{[\s\S]*min-height:\s*var\(--mobile-control-compact\)/)
    expect(source).toMatch(/\.pc-hero\s*\{[\s\S]*background:\s*linear-gradient/)
    expect(source).toMatch(/\.pc-hero-action\s*\{[\s\S]*justify-content:\s*center/)
    expect(source).toMatch(/\.pc-grid-main text[\s\S]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/\.pc-seg button\.active\s*\{[\s\S]*color:\s*var\(--mobile-brand\)/)
  })
  it('provides the shared login, state and accent quality classes', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\.pc-login-hero\s*\{[\s\S]*background:\s*linear-gradient/)
    expect(source).toMatch(/\.pc-login-card\s*\{[\s\S]*box-shadow:\s*var\(--mobile-shadow-float\)/)
    expect(source).toMatch(/\.pc-empty,\s*\.pc-loading,\s*\.pc-error\s*\{[\s\S]*display:\s*grid/)
    expect(source).toMatch(/\.pc-empty \.pc-state-action,[\s\S]*min-height:\s*var\(--mobile-control-primary\)/)
    expect(source).toMatch(/\.pc-card-accent\s*\{[^}]*border-top:\s*2px\s+solid\s+var\(--mobile-brand\)/)
  })
  it('lands the shared state components in every retained mobile portal', () => {
    const stateClasses = ['pc-empty', 'pc-loading', 'pc-error']
    for (const app of mobileApps) {
      const source = readFileSync(resolve(root, `apps/${app}/src/pages/index/index.vue`), 'utf8')
      expect(source, app).toMatch(/class="[^"]*(?:pc-empty|pc-loading|pc-error)[^"]*"/)
    }
    const withIconTile = mobileApps.some((app) => readFileSync(resolve(root, `apps/${app}/src/pages/index/index.vue`), 'utf8').includes('pc-state-icon'))
    expect(withIconTile).toBe(true)
  })
  it('keeps circular category labels on a two-line rhythm', () => {
    const source = readFileSync(themePath, 'utf8')
    expect(source).toMatch(/\.category-grid-label\s*\{[^}]*height:\s*calc\(12px \* 1\.25 \* 2\)[^}]*line-height:\s*1\.25/s)
    expect(source).toMatch(/\.category-grid\s*\{[^}]*margin-bottom:\s*10px/s)
    expect(source).toMatch(/\.category-grid-img\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/s)
    expect(source).not.toMatch(/\.pc-tile-icon \.ui-icon\s*\{[^}]*filter:/s)
  })

  it('provides a wide-screen desktop preview frame without changing mobile width', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\/\* #ifdef H5 \*\/\s*@media\s*\(min-width:\s*431px\)/)
    expect(source).toMatch(/@media\s*\(min-width:\s*431px\)[\s\S]*\.app-shell\s*\{[^}]*box-shadow:\s*0\s+32px\s+90px/)
    expect(source).toMatch(/@media\s*\(min-width:\s*431px\)[\s\S]*radial-gradient/)

  })
  it('provides the circular vector icon tile grid and wires it into every portal', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\.pc-tile-grid\s*\{[\s\S]*gap:\s*8px/)
    expect(source).toMatch(/\.pc-tile-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)/)
    expect(source).toMatch(/\.pc-tile-icon\s*\{[^}]*border-radius:\s*8px/)
    expect(source).toMatch(/\.pc-tile-icon\s*\{[^}]*place-items:\s*center/)
    expect(source).toMatch(/\.pc-tile-label\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/\.pc-tile--green\s*\.pc-tile-icon\s*\{[^}]*background:/)
    expect(source).toMatch(/\.pc-tile-badge\s*\{[^}]*background:\s*#d92c20/)
    expect(source).toMatch(/\.pc-tile-badge\s*\{[^}]*font-size:\s*12px/)
    expect(source).toMatch(/\.pc-tile-badge\s*\{[^}]*color:\s*#fff/)
    expect(source).not.toMatch(/\.pc-tile--green[^}]*linear-gradient/)

    for (const app of mobileApps) {
      const src = readFileSync(resolve(root, `apps/${app}/src/pages/index/index.vue`), 'utf8')
      expect(src, app).toContain('pc-tile')
    }
  })
  it('unifies sheet-head 56px chrome and compact sheet empty padding', () => {
    const source = readFileSync(themePath, 'utf8')
    expect(source).toMatch(/\.sheet-head\s*\{[\s\S]*min-height:\s*var\(--mobile-sheet-header-height\)/)
    expect(source).toMatch(/\.sheet-head\s*\{[\s\S]*flex:\s*none/)
    expect(source).toMatch(/\.sheet-head > text\s*\{[\s\S]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/\.sheet-empty,\s*\.sheet-scroll \.empty,\s*\.sheet-scroll \.empty-state\s*\{[\s\S]*padding:\s*28px 0/)
    expect(source).toMatch(/\.sheet-foot\s*\{[\s\S]*flex:\s*none/)

    const store = readFileSync(resolve(root, 'apps/store/src/pages/index/index.vue'), 'utf8')
    expect(store).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/)
    expect(store).not.toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*52px/)
    expect(store).toMatch(/\.empty\s*\{[^}]*padding:\s*(?:28|30|32)px 0/)
    expect(store).not.toMatch(/\.empty\s*\{[^}]*padding:\s*50px 0/)
  })

  it('lets short mobile sheets shrink instead of locking 80vh height', () => {
    const sources = [
      readFileSync(themePath, 'utf8'),
      readFileSync(resolve(root, 'apps/store/src/pages/index/index.vue'), 'utf8'),
      readFileSync(resolve(root, 'apps/user/src/pages/index/index.vue'), 'utf8'),
      readFileSync(resolve(root, 'apps/supplier/src/styles/global.scss'), 'utf8'),
      readFileSync(resolve(root, 'apps/supplier/src/pages/index/index.vue'), 'utf8')
    ]
    for (const css of sources) {
      expect(css).toMatch(/height:\s*auto/)
      expect(css).toMatch(/max-height:\s*calc\(80vh/)
      expect(css).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
    }
  })

  it('is loaded by every retained mobile portal', () => {
    for (const app of mobileApps) {
      const globalStyle = readFileSync(resolve(root, `apps/${app}/src/styles/global.scss`), 'utf8')
      expect(globalStyle, app).toContain('packages/ui/src/mobile-theme.scss')
    }
  })

  it('aligns each pages.json background with that portal own --mobile-bg', () => {
    // pages.json 控制小程序启动底色，必须与该端 --mobile-bg 最终解析值一致，否则启动瞬间会出现色差闪烁。
    const designTokens = readFileSync(resolve(root, 'packages/ui/src/design-tokens.css'), 'utf8')
    const tokenOf: Record<string, string | null> = { user: '--color-user-bg', store: '--color-store-bg' }
    for (const app of ownedMobileApps) {
      const pages = JSON.parse(readFileSync(resolve(root, `apps/${app}/src/pages.json`), 'utf8'))
      const globalStyle = readFileSync(resolve(root, `apps/${app}/src/styles/global.scss`), 'utf8')
      const token = tokenOf[app]
      const expected = token
        ? designTokens.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{3,8})`))?.[1]
        : globalStyle.match(/--mobile-bg:\s*(#[0-9a-fA-F]{3,8})/)?.[1]
      expect(expected, `${app} 的 --mobile-bg 未定义`).toBeTruthy()
      expect(pages.globalStyle.backgroundColor.toLowerCase(), app).toBe(expected!.toLowerCase())
    }
  })
})
