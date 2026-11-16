import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient } from '@agritainment/shared'
import { useAdminStore } from '../../src/stores/admin'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('admin api dashboard bootstrap', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('loads suppliers, products, orders and farms from the API in api mode', async () => {
    const urls: string[] = []
    const transport = vi.fn(async (request) => {
      urls.push(request.url)
      if (request.url.includes('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'admin', actorId: 'A1', tenantId: 'PLATFORM', roles: ['super_admin'], permissions: ['*'] } } }
      if (request.url.includes('/auth/admin/supplier-accounts')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.includes('/auth/admin/store-accounts')) return { status: 200, body: { code: 'OK', data: [{ id: 'AUTH-1', storeAccountId: 'FACC-1', farmId: 'F1', account: '13900000001', enabled: true }] } }
      if (request.url.includes('/org/farm-accounts')) return { status: 200, body: { code: 'OK', data: [{ id: 'FACC-1', farm_id: 'F1', account: '13900000001', display_name: '店主', role: 'owner', enabled: true }, { id: 'FACC-2', farm_id: 'F1', account: '13900000002', display_name: '店员', role: 'staff', enabled: true }] } }
      if (request.url.includes('/org/suppliers')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'S1', name: 'API 供应商', region: '湘西', status: 'active', contactPhone: '138' }] } }
      if (request.url.includes('/org/farms')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'F1', name: 'API 门店', region: '湘西', status: 'active' }] } }
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'P1', supplierId: 'S1', name: 'API 商品', category: 'fresh', channel: 'store', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 } } }
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { SKU1: 9 } } }
      if (request.url.includes('/orders')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'O1', orderNo: 'NO1', buyerId: 'F1', status: 'PENDING_PAYMENT', amountCents: 10000, receiver: '张三', receiverPhone: '138', address: '湖南', items: [] }], page: 1, pageSize: 200, total: 1 } } }
      if (request.url.includes('/after-sales')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/catalog/categories')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/catalog/prices')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/org/users')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 20, total: 0 } } }
      if (request.url.includes('/commissions')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 20, total: 0 } } }
      if (request.url.includes('/withdrawals?')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 20, total: 0, pendingTotal: 0 } } }
      if (request.url.includes('/auth/admin/roles')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/auth/admin/accounts')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      throw new Error('unexpected ' + request.url)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport, getAccessToken: () => 'server-token' })
    const store = useAdminStore()
    await store.initialize()
    if (store.error) throw new Error('init error=' + store.error)
    expect(store.suppliers).toHaveLength(1)
    expect(store.suppliers[0]).toMatchObject({ id: 'S1', name: 'API 供应商' })
    expect(store.products).toHaveLength(1)
    expect(store.products[0]).toMatchObject({ id: 'P1', name: 'API 商品', supplierId: 'S1' })
    expect(store.orders).toHaveLength(1)
    expect(store.orders[0]).toMatchObject({ id: 'O1', amount: 100 })
    expect(store.farms).toHaveLength(1)
    expect(store.storeAccounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'FACC-1', provisioned: true, password: '' }),
      expect.objectContaining({ id: 'FACC-2', provisioned: false, password: '' })
    ]))
    expect(urls.some((url) => url.includes('/catalog/products'))).toBe(true)
  })
})
