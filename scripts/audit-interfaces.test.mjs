import { describe, expect, it } from 'vitest'
import {
  auditInterfaces,
  auditSharedInterfaces,
  auditStoreInterfaces,
  collectFailures,
  extractActionsBlock,
  extractGettersBlock,
  extractModuleExports,
  extractStoreActions,
  extractStoreGetters,
  isAutoExemptConstant,
  loadTestCorpus,
  loadTestFiles,
  parseTestBlocks,
  sliceBalanced
} from './audit-interfaces.mjs'

const STORE_SOURCE = [
  "export const useDemoStore = defineStore('demo', {",
  '  state: () => ({ items: [] }),',
  '  actions: {',
  '    loadItems() {',
  '      return this.items',
  '    },',
  '    saveItem(payload: string) {',
  '      return writePlatformItem(payload)',
  '    },',
  '    async publishItem(payload: string) {',
  '      return this.saveItem(payload)',
  '    }',
  '  }',
  '})',
  ''
].join('\n')

const SHARED_SOURCE = [
  "export const DEMO_STORAGE_KEY = 'demo-storage'",
  'export const SAMPLE_LIMIT = 10',
  'export function coveredHelper() {',
  '  return 1',
  '}',
  'export function indirectHelper() {',
  '  return coveredHelper()',
  '}',
  'export function orphanHelper() {',
  '  return 2',
  '}',
  ''
].join('\n')

const STORE_WITH_GETTERS = [
  "export const useDemoStore = defineStore('demo', {",
  '  getters: {',
  '    pendingItems: (state) => state.items.filter((item) => item.pending),',
  '    total: (state) => state.items.length',
  '  },',
  '  actions: {',
  '    loadItems() { return this.items },',
  '    saveItem(payload: string) { return writePlatformItem(payload) }',
  '  }',
  '})',
  ''
].join('\n')

describe('store parsing helpers', () => {
  it('splits actions and getters blocks', () => {
    expect(extractActionsBlock(STORE_WITH_GETTERS)).toContain('saveItem')
    expect(extractGettersBlock(STORE_WITH_GETTERS)).toContain('pendingItems')
    expect(extractStoreGetters(STORE_WITH_GETTERS).map((getter) => getter.name)).toEqual(['pendingItems', 'total'])
  })

  it('slices balanced braces', () => {
    expect(sliceBalanced('x = { a: { b: 1 } }', 4)).toBe(' a: { b: 1 } ')
  })
})

describe('module export parsing', () => {
  it('collects functions and constants while ignoring barrel re-exports', () => {
    const source = ["export * from './other'", 'export const LIMIT = 3', 'export function helper() {', '  return LIMIT', '}'].join('\n')
    const parsed = extractModuleExports(source)
    expect(parsed.functions.map((fn) => fn.name)).toEqual(['helper'])
    expect(parsed.constants).toEqual(['LIMIT'])
  })
})

describe('test corpus helpers', () => {
  it('loads test files and splits named it-blocks', () => {
    const files = loadTestFiles()
    expect(files.length).toBeGreaterThan(50)
    expect(loadTestCorpus()).toContain('repository interface coverage')
    const blocks = parseTestBlocks(files)
    expect(blocks.length).toBeGreaterThan(1000)
    expect(blocks.every((block) => typeof block.name === 'string')).toBe(true)
    expect(blocks.some((block) => block.name.includes('keeps every store write interface'))).toBe(true)
  })
})

describe('auditStoreInterfaces 负路径与读接口', () => {
  it('flags a covered write interface without a negative assertion', () => {
    const blocks = [{ path: 'x.test.ts', name: 'saves', body: "store.saveItem('a')" }]
    expect(auditStoreInterfaces(STORE_SOURCE, "store.saveItem('a')", { blocks }).negative.missing).toEqual(['saveItem'])
  })

  it('accepts negative assertions and explicit exemptions', () => {
    const negativeBlocks = [{ path: 'x.test.ts', name: 'rejects', body: "expect(store.saveItem('a')).toBe(false)" }]
    expect(auditStoreInterfaces(STORE_SOURCE, "store.saveItem('a')", { blocks: negativeBlocks }).negative.missing).toEqual([])
    const allowlist = { storeNoNegativePath: { saveItem: '无失败分支' } }
    expect(auditStoreInterfaces(STORE_SOURCE, "store.saveItem('a')", { blocks: [], allowlist }).negative.missing).toEqual([])
  })

  it('reports getters that no test references', () => {
    expect(auditStoreInterfaces(STORE_WITH_GETTERS, 'saveItem()').getters.uncovered).toEqual(['pendingItems', 'total'])
  })
})

describe('extractStoreActions', () => {
  it('marks only actions that touch persistence as write interfaces', () => {
    const actions = extractStoreActions(STORE_SOURCE)
    expect(actions.map((action) => action.name)).toEqual(['loadItems', 'saveItem', 'publishItem'])
    expect(actions.filter((action) => action.write).map((action) => action.name)).toEqual(['saveItem'])
  })
})

describe('auditStoreInterfaces', () => {
  it('counts a write interface as indirectly covered when a tested action calls it', () => {
    expect(auditStoreInterfaces(STORE_SOURCE, 'publishItem() {')).toMatchObject({ total: 1, covered: 0, indirectly: 1, uncovered: [] })
  })

  it('reports write interfaces that no tested action reaches', () => {
    expect(auditStoreInterfaces(STORE_SOURCE, 'nothing-referenced').uncovered).toEqual(['saveItem'])
  })
})

describe('auditSharedInterfaces', () => {
  it('separates tested, indirectly reached, exempt and uncovered exports', () => {
    const report = auditSharedInterfaces(SHARED_SOURCE, 'coveredHelper', {}, '')
    expect(report.functions).toBe(3)
    expect(report.functionCovered).toBe(1)
    expect(report.functionIndirect).toBe(1)
    expect(report.uncoveredFunctions).toEqual(['orphanHelper'])
    expect(report.uncoveredConstants).toEqual(['SAMPLE_LIMIT'])
    expect(isAutoExemptConstant('DEMO_STORAGE_KEY')).toBe(true)
    expect(isAutoExemptConstant('SAMPLE_LIMIT')).toBe(false)
  })

  it('honours explicit exemptions with reasons', () => {
    const report = auditSharedInterfaces(SHARED_SOURCE, '', {
      functionReasons: { coveredHelper: '测试豁免', indirectHelper: '测试豁免', orphanHelper: '测试豁免' },
      sharedConstants: ['SAMPLE_LIMIT']
    }, '')
    expect(report.uncoveredFunctions).toEqual([])
    expect(report.uncoveredConstants).toEqual([])
  })
})

describe('repository interface coverage', () => {
  it('keeps every store write interface, getter, negative path and module export covered', () => {
    const report = auditInterfaces()
    expect(collectFailures(report)).toEqual([])
    expect(report.modules.map((module) => module.name)).toEqual(['shared', 'ui', 'tencent-map-gateway', 'scripts'])
    expect(report.stores.every((store) => store.uncovered.length === 0 && store.getters.uncovered.length === 0 && store.negative.missing.length === 0)).toBe(true)
  })
})
