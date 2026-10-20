import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['admin', 'store', 'user', 'supplier']
const files = [
  'agricultural-products.webp', 'prepared-foods.webp', 'ingredients-seasonings.webp',
  'featured-ingredients.webp', 'local-specialties.webp', 'souvenirs.webp',
  'cultural-tourism-gifts.webp', 'homestay-supplies.webp', 'packaging-consumables.webp',
  'package-vouchers.webp', 'fresh-produce.webp', 'seasonal-fruit.webp',
  'organic-vegetables.webp', 'grains-oils-noodles.webp', 'beverages.webp',
  'all.webp', 'fallback.webp'
]

function webpDimensions(file: string) {
  const bytes = readFileSync(file)
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
  expect(bytes.subarray(8, 12).toString()).toBe('WEBP')
  const format = bytes.subarray(12, 16).toString()
  if (format === 'VP8X') {
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16)
    }
  }
  if (format === 'VP8L') {
    return {
      width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
      height: 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10)
    }
  }
  expect(format).toBe('VP8 ')
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff
  }
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

  it('母版和四端资源均为 128 方形 WebP、大小合规且哈希一致', () => {
    for (const file of files) {
      const master = resolve(root, 'assets/product-categories/master', file)
      expect(existsSync(master), `缺少母版 ${file}`).toBe(true)
      expect(webpDimensions(master)).toEqual({ width: 128, height: 128 })
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
