import { describe, expect, it } from 'vitest'
import { collectIconNamesFromSource, usedIconNames } from './svg-icons-to-png.mjs'

const VALID = ['store', 'truck', 'none']

describe('collectIconNamesFromSource', () => {
  it('collects static, dynamic and config icon usages', () => {
    const source = [
      '<UiIcon name="store" :size="18" />',
      '<UiIcon :name="flag ? \'truck\' : \'store\'" />',
      "const tab = { icon: 'truck' }",
      "const empty = { icon: 'none' }",
      "<UiIcon name=\"not-in-set\" />"
    ].join('\n')

    // 静态 name="x" 直接采用（其 PNG 存在性由 check-supplier-assets 门禁校验），动态字面量按本端图标集过滤
    expect(collectIconNamesFromSource(source, VALID)).toEqual(['not-in-set', 'store', 'truck'])
  })

  it('ignores unknown dynamic literals and unknown static names', () => {
    expect(collectIconNamesFromSource('<UiIcon name="ghost" />', VALID)).toEqual(['ghost'])
    expect(collectIconNamesFromSource("<UiIcon :name=\"a ? 'ghost' : 'store'\" />", VALID)).toEqual(['store'])
  })
})

describe('usedIconNames', () => {
  it('derives the supplier icon list from actual source usage', () => {
    const names = usedIconNames('supplier')
    expect(names).toContain('store')
    expect(names).toContain('navigation')
    expect(names).not.toContain('none')
  })
})
