import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, persistedEnvelope } from '@agritainment/shared'
import { createUserStore } from '../../src/stores/user'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function catalogResponse() {
  return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [
    { id: 'P1', supplierId: 'S1', name: '商城商品', category: 'fresh', channel: 'live', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] },
    { id: 'P1', supplierId: 'S1', name: '商城商品', category: 'fresh', channel: 'live', enabled: true, skus: [{ id: 'SKU2', name: '1kg', priceCents: 9990, enabled: true }] }
  ], page: 1, pageSize: 200, total: 1 } } }
}

describe('user api order submit', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('does not hydrate a local demo catalog in API mode', () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com' })
    vi.stubGlobal('wx', {
      getStorageSync: () => persistedEnvelope({ cProducts: [{ id: 'DEMO' }] }, ['cProducts']),
      setStorageSync: vi.fn()
    })
    expect(createUserStore().cProducts).toEqual([])
  })

  it('loads live catalog into the mall cart and refreshes stock from the API', async () => {
    let stock = 9
    const calls: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request.url)
      if (request.url.includes('/catalog/products')) return catalogResponse()
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', data: { SKU1: stock, SKU2: 4 } } }
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = createUserStore()
    await store.initialize()
    store.userId = 'U1'
    expect(store.cProducts).toMatchObject([{ id: 'P1', supplierId: 'S1', expressDelivery: true, skus: [{ id: 'SKU1', stock: 9, basePrice: 59.9 }, { id: 'SKU2', stock: 4, basePrice: 99.9 }] }])
    expect(store.addToCart('P1', 'SKU1')).toBe(true)
    stock = 0
    await store.refreshSharedState()
    expect(store.cProducts[0].skus[0].stock).toBe(0)
    expect(store.cart[0].unavailable).toBe(true)
    expect(calls.filter((url) => url.includes('/catalog/products'))).toHaveLength(2)
  })

  it('keeps the loaded API catalog when a later refresh fails', async () => {
    let failRefresh = false
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.includes('/catalog/products')) {
        if (failRefresh) throw new Error('目录暂不可用')
        return catalogResponse()
      }
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', data: { SKU1: 9, SKU2: 4 } } }
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = createUserStore()
    await store.initialize()
    expect(store.cProducts).toHaveLength(1)
    failRefresh = true
    await store.refreshSharedState()
    expect(store.cProducts).toHaveLength(1)
    expect(store.cProducts[0].id).toBe('P1')
    expect(store.error).toContain('目录暂不可用')
  })

  it('loads every page of the live catalog', async () => {
    const pages: number[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.includes('/catalog/products')) {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        const ids = page === 1 ? Array.from({ length: 200 }, (_, index) => index + 1) : [201]
        return { status: 200, body: { code: 'OK', data: { items: ids.map((id) => ({ id: `P${id}`, supplierId: 'S1', name: `商品${id}`, category: 'fresh', channel: 'live', enabled: true, skus: [{ id: `SKU${id}`, name: '默认规格', priceCents: 1000, enabled: true }] })), page, pageSize: 200, total: 201 } } }
      }
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', data: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`SKU${index + 1}`, 1])) } }
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = createUserStore()
    await store.initialize()
    expect(pages).toEqual([1, 2])
    expect(store.cProducts).toHaveLength(201)
    expect(store.cProducts[200].id).toBe('P201')
  })

  it('reconciles a restored API cart with the latest catalog price', async () => {
    let priceCents = 5990
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.includes('/catalog/products')) {
        const response = catalogResponse()
        response.body.data.items[0].skus[0].priceCents = priceCents
        return response
      }
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', data: { SKU1: 9, SKU2: 4 } } }
      throw new Error(`unexpected ${request.url}`)
    } })
    const first = createUserStore()
    first.userId = 'U1'
    await first.initialize()
    expect(first.addToCart('P1', 'SKU1')).toBe(true)
    priceCents = 6990
    const restored = createUserStore()
    restored.userId = 'U1'
    await restored.initialize()
    expect(restored.cart).toMatchObject([{ unitPrice: 69.9, basePrice: 69.9 }])
  })

  it('posts the mall cart to the order API and keeps the cart on failure', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return catalogResponse()
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { SKU1: 9, SKU2: 4 } } }
      expect(request.method).toBe('POST')
      expect(request.headers['Idempotency-Key']).toMatch(/^order-/)
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: '下单失败' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.userId = 'U1'
    store.addresses = [{ id: 'A1', userId: 'U1', receiver: '张三', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true, updatedAt: '' }]
    store.addToCart('P1', 'SKU1')
    if (!store.addToCart('P1', 'SKU1')) throw new Error('add failed: ' + store.checkoutError)
    const result = await store.submitOrder()
    expect(result).toBe(false)
    expect(store.checkoutError).toContain('下单失败')
    expect(store.cart).toHaveLength(1)
  })
})
