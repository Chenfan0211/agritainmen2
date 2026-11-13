import { describe, expect, it, vi } from 'vitest'
import { createCatalogApiClient, type CatalogRequest } from './catalog-api'

describe('catalog api client stock composition', () => {
  it('merges available quantities from the inventory service', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/api/v1/catalog/products')) {
        return { items: [{ id: 'P1', supplierId: 'S1', name: '腊肉', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 20, total: 1 }
      }
      if (path.startsWith('/api/v1/inventory/available')) return { SKU1: 7, 'SKU-OTHER': 2 }
      throw new Error(path)
    })
    const result = await createCatalogApiClient(request as unknown as CatalogRequest).listProducts({ channel: 'store' })
    expect(request).toHaveBeenLastCalledWith('/api/v1/inventory/available?skuIds=SKU1')
    expect(result.items[0].skus[0].stock).toBe(7)
    expect(result.items[0].stock).toBe(7)
  })
})
