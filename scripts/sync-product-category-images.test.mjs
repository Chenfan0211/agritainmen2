import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRODUCT_CATEGORY_IMAGE_APPS,
  PRODUCT_CATEGORY_IMAGE_FILES,
  categoryImageSyncPlan,
  fileHash,
  validateSourceFiles,
  validateSyncedHash
} from './sync-product-category-images.mjs'

describe('categoryImageSyncPlan', () => {
  it('maps every master image to each app target', () => {
    const plan = categoryImageSyncPlan({ root: '/repo' })
    expect(plan).toHaveLength(PRODUCT_CATEGORY_IMAGE_FILES.length * PRODUCT_CATEGORY_IMAGE_APPS.length)
    expect(plan[0]).toMatchObject({ app: 'admin', file: PRODUCT_CATEGORY_IMAGE_FILES[0] })
    expect(plan[0].target).toBe(join('/repo', 'apps', 'admin', 'src', 'static', 'images', 'categories', PRODUCT_CATEGORY_IMAGE_FILES[0]))
    expect(plan.some((item) => item.app === 'supplier')).toBe(true)
  })
})

describe('validateSourceFiles', () => {
  it('reports missing masters once per file', () => {
    const plan = categoryImageSyncPlan({ root: '/repo' })
    expect(validateSourceFiles(plan, () => true)).toEqual([])
    expect(validateSourceFiles(plan, () => false)).toHaveLength(PRODUCT_CATEGORY_IMAGE_FILES.length)
  })
})

describe('validateSyncedHash', () => {
  it('accepts equal hashes and reports mismatches', () => {
    expect(validateSyncedHash({ expectedHash: 'abc', actualHash: 'abc', app: 'admin', file: 'all.webp' })).toEqual([])
    expect(validateSyncedHash({ expectedHash: 'abc', actualHash: 'def', app: 'admin', file: 'all.webp' })).toEqual(['admin 商品品类图片同步失败: all.webp'])
  })
})

describe('fileHash', () => {
  it('hashes repository files deterministically', () => {
    const target = resolve(import.meta.dirname, '..', 'package.json')
    const first = fileHash(target)
    expect(first).toHaveLength(64)
    expect(fileHash(target)).toBe(first)
  })
})
