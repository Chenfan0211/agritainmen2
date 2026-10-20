import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MOBILE_APPS,
  UNSUPPORTED_TAGS,
  auditAppBuild,
  auditAppSource,
  findImportantOutsideMpBlock,
  findRiskyFeatures,
  findUnsupportedTagSelectors,
  hasPageScopedTokens
} from './audit-mp-styles.mjs'

describe('findUnsupportedTagSelectors', () => {
  it('flags HTML tags that mini programs compile into view/text', () => {
    const hits = findUnsupportedTagSelectors('.cart-bar small { display: block } .list-row>strong { color: red } .cost-prices span, del { opacity: .6 }')
    expect(hits.map((hit) => hit.tag).sort()).toEqual(['del', 'small', 'span', 'strong'])
  })

  it('lists the HTML tags that mini programs rewrite into view/text', () => {
    expect(UNSUPPORTED_TAGS).toContain('small')
    expect(UNSUPPORTED_TAGS).toContain('del')
    expect(UNSUPPORTED_TAGS).not.toContain('label')
  })

  it('flags universal selectors that WXSS cannot compile', () => {
    expect(findUnsupportedTagSelectors('* { box-sizing: border-box }').map((hit) => hit.tag)).toEqual(['*'])
    expect(findUnsupportedTagSelectors('.chip-scroll *::-webkit-scrollbar { display: none }').map((hit) => hit.tag)).toEqual(['*'])
    expect(findUnsupportedTagSelectors('view, text { box-sizing: border-box }')).toEqual([])
  })

  it('keeps native mini-program components and class selectors', () => {
    expect(findUnsupportedTagSelectors('.sku-input-grid label { font-weight: 600 } .meta, .val, .chip { display: block } image, button, input, textarea { box-sizing: border-box }')).toEqual([])
  })

  it('ignores selectors inside comments', () => {
    expect(findUnsupportedTagSelectors('/* .legacy small { display: block } */ .meta { display: block }')).toEqual([])
  })
})

describe('findRiskyFeatures', () => {
  it('flags color-mix and :has', () => {
    expect(findRiskyFeatures('.a { color: color-mix(in srgb, var(--color-on-brand) 80%, transparent) }')).toHaveLength(1)
    expect(findRiskyFeatures('.page:has(.bar) { padding-bottom: 8px }')).toHaveLength(1)
    expect(findRiskyFeatures('.a { color: rgba(var(--color-on-brand-rgb), 0.8) } .b.c { padding: 0 }')).toEqual([])
  })
})

describe('findImportantOutsideMpBlock', () => {
  it('only allows !important inside the MP-WEIXIN wide-screen block', () => {
    const source = [
      '/* #ifdef MP-WEIXIN */',
      '.app-shell { max-width: 100% !important; }',
      '/* #endif */',
      '.card { color: red; }'
    ].join('\n')
    expect(findImportantOutsideMpBlock(source)).toEqual([])

    const bad = '.card { color: red !important; }'
    expect(findImportantOutsideMpBlock(bad)).toHaveLength(1)
  })
})

describe('hasPageScopedTokens', () => {
  it('requires theme variables on both :root and page', () => {
    expect(hasPageScopedTokens(':root, page { --mobile-brand: #f0810f; }')).toBe(true)
    expect(hasPageScopedTokens(':root { --store-line: #e9ded1; }')).toBe(false)
  })
})

describe('mobile style contract', () => {
  it('keeps every mobile app free of unsupported tag selectors and risky syntax', () => {
    for (const app of MOBILE_APPS) {
      expect(auditAppSource(app), app).toEqual([])
    }
  })

  it('detects dead tag selectors in a mini-program build', () => {
    const base = mkdtempSync(join(tmpdir(), 'mp-style-audit-'))
    try {
      const dist = join(base, 'apps', 'demo', 'dist', 'build', 'mp-weixin', 'pages', 'index')
      mkdirSync(dist, { recursive: true })
      writeFileSync(join(dist, 'index.wxml'), '<view class="card"><view>1</view></view>')
      writeFileSync(join(dist, 'index.wxss'), '.card small { font-size: 12px }')
      const findings = auditAppBuild('demo', base)
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('<small>')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
