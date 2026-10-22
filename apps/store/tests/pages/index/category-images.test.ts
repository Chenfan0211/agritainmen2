import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxml'), 'utf8')
const pageTs = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.ts'), 'utf8')
const theme = readFileSync(resolve(import.meta.dirname, '../../../../../packages/ui/src/mobile-theme.scss'), 'utf8')

describe('门店端商品分类图片', () => {
  it('使用共享品类图片替换分类系统图标', () => {
    expect(pageTs).toContain('productCategoryImage(item.key, dictionaryState)')
    expect(page).not.toContain('categoryIconName')
    expect(page).toMatch(/<business-image class="category-grid-img" src="\{\{item\.image\}\}" fallback="\{\{item\.fallback\}\}" error-fallback="\{\{item\.errorFallback\}\}" show-error="\{\{false\}\}"/)
  })

  it('订阅字典更新并在卸载时释放缓存', () => {
    expect(pageTs).toContain('let dictionaryState = readPlatformDictionaries()')
    expect(pageTs).toContain('disposeDictionary = dictCache.subscribe((state: any) => {')
    expect(pageTs).toContain('disposeDictionary?.()')
    expect(pageTs).toContain('dictCache.dispose()')
  })

  it('圆形宫格两行对齐，分类列表标签与名称竖排', () => {
    expect(theme).toMatch(/\.category-grid-label\s*\{[^}]*height:\s*calc\(12px \* 1\.25 \* 2\)/s)
    expect(page).not.toContain('class="cat-name-row"')
    expect(page).toContain('class="tag-row"')
    expect(page).toContain('class="cat-product-name"')
  })
})
