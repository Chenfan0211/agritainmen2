import { describe, expect, it } from 'vitest'
import { CATEGORY_MAX_EDGE, CONTENT_MAX_EDGE, appContentImageFiles, categoryMasterFiles, contentMasterFiles, isCategoryImage, maxEdgeForImage, shouldReplace, targetSize } from './compress-static-images.mjs'

describe('static image resize plan', () => {
  it('recognises both app category assets and product-category masters', () => {
    expect(isCategoryImage('apps/store/src/static/images/categories/all.webp')).toBe(true)
    expect(isCategoryImage('assets/product-categories/master/all.webp')).toBe(true)
    expect(isCategoryImage('apps/user/src/static/images/farmhouse.webp')).toBe(false)
  })

  it('uses 128 for category art and 750 for content imagery', () => {
    expect(maxEdgeForImage('apps/store/src/static/images/categories/all.webp')).toBe(CATEGORY_MAX_EDGE)
    expect(maxEdgeForImage('assets/images/farmhouse.webp')).toBe(CONTENT_MAX_EDGE)
  })

  it('keeps the aspect ratio and skips images that already fit', () => {
    expect(targetSize(512, 512, CATEGORY_MAX_EDGE)).toEqual({ width: 128, height: 128 })
    expect(targetSize(900, 600, CONTENT_MAX_EDGE)).toEqual({ width: 750, height: 500 })
    expect(targetSize(750, 1000, CONTENT_MAX_EDGE)).toEqual({ width: 563, height: 750 })
    expect(targetSize(128, 128, CATEGORY_MAX_EDGE)).toBeNull()
    expect(targetSize(0, 0, CONTENT_MAX_EDGE)).toBeNull()
  })

  it('only replaces an image when the new bytes are smaller', () => {
    expect(shouldReplace(1000, 800)).toBe(true)
    expect(shouldReplace(800, 800)).toBe(false)
    expect(shouldReplace(100, 200)).toBe(false)
    expect(shouldReplace(1000, 0)).toBe(false)
  })
})

describe('static image inventory', () => {
  it('lists the 17 category masters and the shared content masters', () => {
    expect(categoryMasterFiles()).toHaveLength(17)
    expect(contentMasterFiles().length).toBeGreaterThan(0)
    expect(contentMasterFiles().every((file) => maxEdgeForImage(file) === CONTENT_MAX_EDGE)).toBe(true)
  })

  it('never treats per app category assets as free standing content images', () => {
    const files = appContentImageFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((file) => isCategoryImage(file))).toBe(false)
  })
})
