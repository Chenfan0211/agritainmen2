import { describe, expect, it } from 'vitest'
import {
  EXPECTED_SUPPLIER_ICONS,
  REMOVED_SUPPLIER_SVGS,
  auditSupplierAssets,
  validateGeneratorContract,
  validateIconSourceSet,
  validateMpBundle,
  validateMpIconFiles,
  validateUsedIcons
} from './check-supplier-assets.mjs'

const pairedFiles = EXPECTED_SUPPLIER_ICONS.flatMap((name) => [`${name}.png`, `${name}.svg`])
const expectedMpIcons = EXPECTED_SUPPLIER_ICONS.flatMap((name) => [`/dist/static/icons/${name}.png`, `/dist/static/icons/${name}.svg`])

describe('validateIconSourceSet', () => {
  it('accepts a complete PNG/SVG set', () => {
    expect(validateIconSourceSet(pairedFiles)).toEqual([])
  })

  it('reports missing pairs and count mismatches', () => {
    const failures = validateIconSourceSet(['arrow-left.png'])
    expect(failures.some((message) => message.includes('PNG +'))).toBe(true)
    expect(failures.some((message) => message.includes('缺少图标源: arrow-left'))).toBe(true)
  })
})

describe('validateGeneratorContract', () => {
  it('requires the generator to derive icons from real source usage', () => {
    expect(validateGeneratorContract("const names = usedIconNames(app, basePath)\nconst mobileApps = ['store', 'supplier', 'user']")).toEqual([])
    expect(validateGeneratorContract('const names = []')).toHaveLength(2)
  })
})

describe('validateUsedIcons', () => {
  it('flags icons without a PNG source', () => {
    expect(validateUsedIcons(['store', 'store'], (name) => name === 'store')).toEqual([])
    expect(validateUsedIcons(['ghost'], () => false)).toEqual(['UiIcon 使用了不存在的 PNG: ghost'])
  })
})

describe('validateMpIconFiles', () => {
  it('requires the MP bundle to ship exactly the expected icons', () => {
    expect(validateMpIconFiles(expectedMpIcons)).toEqual([])
    expect(validateMpIconFiles(expectedMpIcons.slice(1))).toHaveLength(1)
  })
})

describe('validateMpBundle', () => {
  it('checks the safe-area branch and removed svgs', () => {
    expect(validateMpBundle({ mpFileNames: [], wxssWithStatusBarHeight: 1, wxssWithSafeAreaInsetTop: 0 })).toEqual([])
    const failures = validateMpBundle({
      mpFileNames: [`/dist/static/icons/${REMOVED_SUPPLIER_SVGS[0]}.svg`],
      wxssWithStatusBarHeight: 0,
      wxssWithSafeAreaInsetTop: 2
    })
    expect(failures).toHaveLength(3)
  })
})

describe('auditSupplierAssets', () => {
  it('passes on the current repository', () => {
    const { failures, summary } = auditSupplierAssets()
    expect(failures).toEqual([])
    expect(summary).toContain('MP safe-area branch verified')
  })
})
