import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxml'), 'utf8')
const script = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.ts'), 'utf8')

describe('用户端商品分类图片', () => {
  it('分类页用横向图片宫格，复用共享品类图片', () => {
    expect(script).toContain('productCategoryImage')
    expect(template).toContain('class="category-grid"')
    expect(template).toContain('class="category-grid-item ')
    expect(template).toContain('class="category-grid-img"')
    expect(template).toContain('class="category-grid-label"')
    expect(template).toMatch(/<business-image class="category-grid-img" src="\{\{item\.image\}\}"/)
    expect(template).not.toContain('categoryIconName')
    expect(template).not.toContain('class="category-pills"')
    expect(template).not.toContain('class="category-pill"')
  })

  it('订阅字典更新并在卸载时释放缓存', () => {
    expect(script).toContain('let dictionaryState = readPlatformDictionaries()')
    expect(script).toContain('this.disposeDictionaryImages = dictCache.subscribe((state: typeof dictionaryState) => {')
    expect(script).toContain('this.disposeDictionaryImages()')
    expect(script).toContain('dictCache.dispose()')
  })
})