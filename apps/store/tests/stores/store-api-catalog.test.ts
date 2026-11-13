import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { resetStoreStore, useStoreStore } from '../../src/stores/store'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('store api catalog bootstrap', () => {
  beforeEach(() => { resetStoreStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('loads products from the server catalog in api mode', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { 'SKU-API': 9 } } }
      expect(request.url).toContain('/api/v1/catalog/products?page=1&pageSize=200&channel=store')
      return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'P-API', supplierId: 'S-API', name: 'API 腊肉', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU-API', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useStoreStore()
    await store.initialize()
    expect(store.products).toHaveLength(1)
    expect(store.products[0]).toMatchObject({ id: 'P-API', name: 'API 腊肉', supplierId: 'S-API' })
    expect(store.products[0].skus[0]).toMatchObject({ id: 'SKU-API', price: 59.9, stock: 9 })
  })

  it('surfaces api failure instead of silently using local catalog', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => ({ status: 500, body: { code: 'INTERNAL_ERROR', message: '服务不可用' } }) })
    const store = useStoreStore()
    await store.initialize()
    expect(store.error).toContain('服务不可用')
    expect(store.products).toEqual([])
  })
})
