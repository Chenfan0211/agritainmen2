import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('门店商品能力边界', () => {
  it('只允许浏览和采购中台商品，不提供本地库存与上下架能力', () => {
    const page = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxml'), 'utf8')
    const store = readFileSync(resolve(import.meta.dirname, '../../../src/stores/store.ts'), 'utf8')

    expect(page).not.toContain('保存库存')
    expect(page).not.toContain('toggleListed')
    expect(page).not.toContain('stockDrafts')
    expect(store).not.toContain('setSkuStock(')
    expect(store).not.toContain('toggleListed(')
    expect(page).toContain('中台统一维护商品状态与库存')
  })
})
