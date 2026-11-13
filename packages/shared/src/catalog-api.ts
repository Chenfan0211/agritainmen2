import { apiRequest } from './api-client'
import type { Product } from './index'

export interface CatalogSkuDto {
  id: string
  name: string
  priceCents: number
  enabled: boolean
}

export interface CatalogProductDto {
  id: string
  supplierId: string
  name: string
  category: string
  channel: string
  enabled: boolean
  skus: CatalogSkuDto[]
}

export interface CatalogPageDto<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface CatalogQuery {
  page?: number
  pageSize?: number
  channel?: string
  keyword?: string
}

export type CatalogRequest = <T>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string; headers?: Record<string, string> }) => Promise<T>

function normalizePage(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

export function toProduct(dto: CatalogProductDto): Product {
  const skus = (dto.skus || []).map((sku) => ({
    id: sku.id,
    name: sku.name,
    price: sku.priceCents / 100,
    cost: sku.priceCents / 100,
    stock: 0,
  }))
  return {
    id: dto.id,
    name: dto.name,
    category: dto.category,
    price: skus[0]?.price ?? 0,
    cost: skus[0]?.cost ?? 0,
    stock: skus.reduce((sum, sku) => sum + sku.stock, 0),
    sales: 0,
    source: 'platform',
    status: dto.enabled ? 'active' : 'offline',
    supplier: dto.supplierId,
    supplierId: dto.supplierId,
    image: '/static/images/field.jpg',
    skus,
  } as Product
}

export function createCatalogApiClient(request: CatalogRequest = apiRequest) {
  return {
    async listProducts(query: CatalogQuery = {}): Promise<CatalogPageDto<Product>> {
      const page = normalizePage(query.page, 1)
      const pageSize = normalizePage(query.pageSize, 20)
      if (pageSize > 200) throw new Error('pageSize 必须在 1-200 之间')
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (query.channel?.trim()) params.set('channel', query.channel.trim())
      if (query.keyword?.trim()) params.set('keyword', query.keyword.trim())
      const result = await request<CatalogPageDto<CatalogProductDto>>(`/api/v1/catalog/products?${params.toString()}`)
      const items = result.items || []
      const skuIds = [...new Set(items.flatMap((item) => (item.skus || []).map((sku) => sku.id)).filter(Boolean))]
      if (!skuIds.length) return { ...result, items: items.map(toProduct) }
      const stocks = await request<Record<string, number>>(`/api/v1/inventory/available?skuIds=${encodeURIComponent(skuIds.join(","))}`)
      return {
        ...result,
        items: items.map((item) => {
          const product = toProduct(item)
          product.skus = product.skus.map((sku) => ({ ...sku, stock: Number(stocks[sku.id] || 0) }))
          product.stock = product.skus.reduce((sum, sku) => sum + sku.stock, 0)
          return product
        })
      }
    }
  }
}
