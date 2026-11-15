import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneSeed, configureApiClient } from '@agritainment/shared'
import { resetStoreStore, useStoreStore } from '../../src/stores/store'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function catalogResponse() {
  return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'P1', supplierId: 'S1', name: '腊肉', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 } } }
}

describe('store api order submit', () => {
  beforeEach(() => { resetStoreStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('posts the selected cart to the order API with an idempotency key', async () => {
    const calls: Array<{ url: string; method?: string; headers: Record<string, string> }> = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { SKU1: 20 } } }
      if (request.url.includes('/catalog/products')) return catalogResponse()
      expect(request.method).toBe('POST')
      expect(request.headers['Idempotency-Key']).toMatch(/^order-/)
      return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'O1', orderNo: 'NO1', status: 'PENDING_PAYMENT', amountCents: 11980, items: [] } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useStoreStore()
    await store.initialize()
    expect(store.orders).toHaveLength(0)
    store.auth = { ...store.auth, isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F1', tenantId: 'PLATFORM', role: 'owner' }
    store.info = { ...store.info, contact: '王店长', phone: '13900000001', address: '湖南省长沙市门店1号' }
    store.addToCart(store.products[0], undefined, 2)
    const before = cloneSeed(store.cart)
    const order = await store.submitOrder()
    if (!order) throw new Error('checkoutError=' + store.checkoutError + ' calls=' + calls.map((call) => call.url).join(','))
    expect(order).toMatchObject({ id: 'O1', status: 'pending-payment', amount: 119.8 })
    expect(store.cart).toHaveLength(0)
    expect(calls.filter((call) => call.url.endsWith('/orders'))).toHaveLength(1)
    expect(before).toHaveLength(1)
  })

  it('keeps the cart unchanged when the order API fails', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { SKU1: 20 } } }
      if (request.url.includes('/catalog/products')) return catalogResponse()
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: '下单失败' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useStoreStore()
    await store.initialize()
    store.auth = { ...store.auth, isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F1', tenantId: 'PLATFORM', role: 'owner' }
    store.info = { ...store.info, contact: '王店长', phone: '13900000001', address: '湖南省长沙市门店1号' }
    store.addToCart(store.products[0], undefined, 2)
    const order = await store.submitOrder()
    expect(order).toBe(null)
    expect(store.cart).toHaveLength(1)
    expect(store.checkoutError).toContain('下单失败')
  })

  it('does not post with an anonymous account or a missing delivery address', async () => {
    const calls: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request.url)
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', data: { SKU1: 20 } } }
      if (request.url.includes('/catalog/products')) return catalogResponse()
      throw new Error('unexpected order request')
    } })
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0], undefined, 2)
    expect(await store.submitOrder()).toBe(null)
    expect(store.checkoutError).toContain('登录')
    store.auth = { ...store.auth, isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F1', tenantId: 'PLATFORM', role: 'owner' }
    store.info = { ...store.info, address: '', phone: '' }
    expect(await store.submitOrder()).toBe(null)
    expect(store.checkoutError).toContain('收货')
    expect(calls.filter((url) => url.endsWith('/orders'))).toHaveLength(0)
  })
})
