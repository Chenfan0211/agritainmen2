import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { createUserStore } from '../../src/stores/user'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('user api mall bootstrap', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('loads products from the server catalog in api mode', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { 'SKU-API': 9 } } }
      expect(request.url).toContain('/api/v1/catalog/products?page=1&pageSize=200&channel=live')
      return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'P-API', supplierId: 'S-API', name: 'API 商城商品', category: 'fresh', channel: 'live', enabled: true, skus: [{ id: 'SKU-API', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    expect(store.products).toHaveLength(1)
    expect(store.products[0]).toMatchObject({ id: 'P-API', name: 'API 商城商品' })
  })

  it('does not silently use local products when the catalog fails', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => ({ status: 500, body: { code: 'INTERNAL_ERROR', message: '商城服务不可用' } }) })
    const store = createUserStore()
    await store.initialize()
    expect(store.products).toEqual([])
    expect(store.error).toContain('商城服务不可用')
  })
})
