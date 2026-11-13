import { describe, expect, it, vi } from 'vitest'
import { createCatalogApiClient, type CatalogRequest } from './catalog-api'

describe('catalog api client', () => {
  it('maps server cents to page currency and keeps sku ids', async () => {
    const request = vi.fn(async () => ({
      items: [{ id: 'P1', supplierId: 'S1', name: '腊肉', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }],
      page: 1, pageSize: 20, total: 1
    }))
    const client = createCatalogApiClient(request as unknown as CatalogRequest)
    const result = await client.listProducts({ channel: 'store' })
    expect(result.items[0]).toMatchObject({ id: 'P1', price: 59.9, cost: 59.9, stock: 0, status: 'active' })
    expect(result.items[0].skus[0]).toMatchObject({ id: 'SKU1', price: 59.9, stock: 0 })
  })

  it('passes filters and rejects invalid page size before request', async () => {
    const request = vi.fn()
    const client = createCatalogApiClient(request)
    await expect(client.listProducts({ channel: 'store', pageSize: 201 })).rejects.toThrow(/pageSize/)
    request.mockResolvedValueOnce({ items: [], page: 2, pageSize: 20, total: 0 })
    await client.listProducts({ channel: 'store', page: 2, pageSize: 20, keyword: '肉' })
    expect(request).toHaveBeenCalledWith('/api/v1/catalog/products?page=2&pageSize=20&channel=store&keyword=%E8%82%89')
  })
})
