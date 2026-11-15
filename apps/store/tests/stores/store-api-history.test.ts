import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { resetStoreStore, useStoreStore } from '../../src/stores/store'

if (!globalThis.localStorage) {
  const values = new Map<string, string>()
  globalThis.localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear(), key: () => null, get length() { return values.size } } as unknown as Storage
}

const ok = (data: unknown) => ({ status: 200, body: { code: 'OK', data } })
const order = (id: string, buyerId = 'F1', status = 'PENDING_PAYMENT', createdAt = '2026-11-15T10:00:00Z') => ({
  id, orderNo: `NO-${id}`, buyerId, status, amountCents: 11980, receiver: '王店长',
  receiverPhone: '13900000001', address: '湖南省门店1号', createdAt,
  items: [{ skuId: 'SKU1', productId: 'P1', supplierId: 'S1', name: '服务端腊肉', unitPriceCents: 5990, quantity: 2, amountCents: 11980 }]
})
const catalog = () => ok({ items: [{ id: 'P1', supplierId: 'S1', name: '腊肉', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 })

function signedInStore() {
  const store = useStoreStore()
  store.auth = { ...store.auth, isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F1', tenantId: 'PLATFORM', role: 'owner' }
  return store
}

describe('store API history readback', () => {
  beforeEach(() => { resetStoreStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('reads every server page, maps server prices and sorts newest first', async () => {
    const requested: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.includes('/catalog/products')) return catalog()
      if (request.url.includes('/inventory/available')) return ok({ SKU1: 20 })
      if (request.url.includes('/api/v1/orders?')) {
        requested.push(request.url)
        const page = Number(new URL(request.url).searchParams.get('page'))
        return ok({ items: page === 1 ? Array.from({ length: 200 }, (_, i) => order(`O${i + 1}`)) : [order('O201', 'F1', 'PAID', '2026-11-16T10:00:00Z')], page, pageSize: 200, total: 201 })
      }
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = signedInStore()
    store.orders = [{ id: 'OLD', farmId: 'F1' } as (typeof store.orders)[number]]
    await store.initialize()
    expect(store.error).toBe('')
    expect(requested).toHaveLength(2)
    expect(requested[0]).toContain('buyerId=F1')
    expect(store.orders).toHaveLength(201)
    expect(store.orders[0]).toMatchObject({ id: 'O201', farmId: 'F1', status: 'submitted', amount: 119.8, itemCount: 2, orderNo: 'NO-O201' })
    expect(store.orders[0].items[0]).toMatchObject({ name: '服务端腊肉', skuName: '500g', price: 59.9, quantity: 2 })
    expect(store.orders[0].paymentDeadlineAt).toBeUndefined()
  })

  it('rejects a foreign order or an unknown server status without keeping cached orders', async () => {
    let next = order('O-FOREIGN', 'F2')
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.includes('/catalog/products')) return catalog()
      if (request.url.includes('/inventory/available')) return ok({ SKU1: 20 })
      return ok({ items: [next], page: 1, pageSize: 200, total: 1 })
    } })
    const store = signedInStore()
    store.orders = [{ id: 'OLD', farmId: 'F1' } as (typeof store.orders)[number]]
    await store.initialize()
    expect(store.orders).toHaveLength(0)
    expect(store.error).toContain('门店')
    next = order('O-UNKNOWN', 'F1', 'MYSTERY')
    await store.initialize(true)
    expect(store.orders).toHaveLength(0)
    expect(store.error).toContain('状态')
  })

  it('fetches an order detail by ID and rejects a foreign detail', async () => {
    let buyerId = 'F1'
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      expect(request.url).toBe('https://api.example.com/api/v1/orders/O-DETAIL')
      return ok(order('O-DETAIL', buyerId))
    } })
    const store = signedInStore()
    expect(await store.loadApiOrderDetail('O-DETAIL')).toBe(true)
    expect(store.orders[0]).toMatchObject({ id: 'O-DETAIL', farmId: 'F1' })
    buyerId = 'F2'
    expect(await store.loadApiOrderDetail('O-DETAIL')).toBe(false)
    expect(store.orders).toHaveLength(0)
  })

  it('does not mutate API orders through demo lifecycle actions', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com' })
    const store = signedInStore()
    store.orders = [{ id: 'O1', farmId: 'F1', amount: 10, saved: 0, itemCount: 1, items: [], status: 'pending-payment', createdAt: '2026-11-15', paymentDeadlineAt: '2026-11-15T00:00:00Z', logistics: [] }]
    expect(await store.payOrder('O1')).toBe(false)
    expect(await store.cancelOrder('O1')).toBe(false)
    expect(await store.sweepExpiredPaymentOrders()).toBe(0)
    expect(store.initiateAfterSale('O1')).toBe(false)
    expect(store.orders[0].status).toBe('pending-payment')
    store.orders[0].status = 'received'
    expect(store.initiateAfterSale('O1')).toBe(false)
    store.orders[0].status = 'submitted'
    expect(await store.advanceOrder('O1')).toBe(false)
    store.orders[0].status = 'delivering'
    expect(await store.confirmReceipt('O1')).toBe(false)
  })

  it('loads server history immediately after API password login', async () => {
    const calls: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request.url)
      if (request.url.endsWith('/auth/store/login')) return ok({ accessToken: 'access', refreshToken: 'refresh', profile: { actorType: 'store', actorId: 'AUTH-1', tenantId: 'PLATFORM', farmId: 'F1', roles: ['store', 'owner'] } })
      if (request.url.endsWith('/auth/store/farm')) return ok({ farmId: 'F1', name: '石板溪', contact: '王店长', contactPhone: '13900000001', address: '湖南省门店1号', priceLevel: null })
      if (request.url.includes('/catalog/products')) return catalog()
      if (request.url.includes('/inventory/available')) return ok({ SKU1: 20 })
      if (request.url.includes('/api/v1/orders?')) return ok({ items: [order('O-HISTORY')], page: 1, pageSize: 200, total: 1 })
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = useStoreStore()
    expect(await store.loginWithPassword('13900000001', 'secret', 'owner')).toBe(true)
    expect(calls.some((url) => url.includes('/api/v1/orders?'))).toBe(true)
    expect(store.orders.map((item) => item.id)).toEqual(['O-HISTORY'])
  })
})
