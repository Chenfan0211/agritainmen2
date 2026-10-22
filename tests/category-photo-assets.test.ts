import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['admin', 'store', 'user', 'supplier']
const files = [
  'agricultural-products.jpg', 'prepared-foods.jpg', 'ingredients-seasonings.jpg',
  'featured-ingredients.jpg', 'local-specialties.jpg', 'souvenirs.jpg',
  'cultural-tourism-gifts.jpg', 'homestay-supplies.jpg', 'packaging-consumables.jpg',
  'package-vouchers.jpg', 'fresh-produce.jpg', 'seasonal-fruit.jpg',
  'organic-vegetables.jpg', 'grains-oils-noodles.jpg', 'beverages.jpg',
  'all.jpg', 'fallback.jpg'
]

function jpegDimensions(file: string) {
  const bytes = readFileSync(file)
  expect(bytes[0]).toBe(0xff)
  expect(bytes[1]).toBe(0xd8)
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error(`无效 JPEG 标记: ${file}`)
    const marker = bytes[offset + 1]!
    offset += 2
    if (marker === 0xd9 || marker === 0xda) break
    const length = bytes.readUInt16BE(offset)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  throw new Error(`未找到 JPEG 尺寸: ${file}`)
}

describe('商品品类实拍图资产', () => {
  it('记录 17 个不同的 Unsplash/Pexels 免费图片来源', () => {
    const manifestPath = resolve(root, 'assets/product-categories/sources.json')
    expect(existsSync(manifestPath)).toBe(true)
    const sources = JSON.parse(readFileSync(manifestPath, 'utf8')) as Array<{ file: string; library: string; page: string; author: string; downloadedAt: string }>
    expect(sources.map((item) => item.file).sort()).toEqual([...files].sort())
    expect(new Set(sources.map((item) => item.page))).toHaveLength(17)
    expect(new Set(sources.map((item) => item.library))).toEqual(new Set(['Unsplash', 'Pexels']))
    for (const source of sources) {
      expect(source.author.trim()).not.toBe('')
      expect(source.downloadedAt).toBe('2026-09-02')
      expect(new URL(source.page).hostname).toMatch(/^(?:www\.)?(?:unsplash\.com|pexels\.com)$/)
    }
  })

  it('母版和四端资源均为 128 方形 JPEG、大小合规且哈希一致', () => {
    for (const file of files) {
      const master = resolve(root, 'assets/product-categories/master', file)
      expect(existsSync(master), `缺少母版 ${file}`).toBe(true)
      expect(jpegDimensions(master)).toEqual({ width: 128, height: 128 })
      expect(statSync(master).size, `${file} 超过 24KB`).toBeLessThanOrEqual(24 * 1024)
      const expectedHash = createHash('sha256').update(readFileSync(master)).digest('hex')
      for (const app of apps) {
        const target = resolve(root, 'apps', app, 'src/static/images/categories', file)
        expect(existsSync(target), `${app} 缺少 ${file}`).toBe(true)
        expect(createHash('sha256').update(readFileSync(target)).digest('hex')).toBe(expectedHash)
      }
    }
  })
})
