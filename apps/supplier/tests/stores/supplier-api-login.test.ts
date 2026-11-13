import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { readSupplierAccessToken, readSupplierRefreshToken } from '../../src/services/api-runtime'
import { resetSupplierStore, useSupplierStore } from '../../src/stores/supplier'

describe('supplier and driver API login', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    resetSupplierStore()
    const values = new Map<string, string>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => values.get(key) ?? '',
      setStorageSync: (key: string, value: string) => values.set(key, value),
      removeStorageSync: (key: string) => values.delete(key),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not load orders before login and uses server supplier identity', async () => {
    const calls: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: readSupplierAccessToken, transport: async (request) => {
      calls.push(request.url)
      if (request.url.endsWith('/auth/supplier/login')) return { status: 200, body: { code: 'OK', data: { accessToken: 'access-s1', refreshToken: 'refresh-s1', profile: { actorType: 'supplier', supplierId: 'S1', displayName: '供应商一' } } } }
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S1' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '供应商一', status: 'cooperating', certified: true } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.includes('/fulfillment/orders?')) {
        expect(request.headers.Authorization).toBe('Bearer access-s1')
        return { status: 200, body: { code: 'OK', data: { items: [{ id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'PENDING' }], page: 1, pageSize: 200, total: 1 } } }
      }
      throw new Error(request.url)
    } })
    const store = useSupplierStore()
    await store.initialize()
    expect(calls.some((url) => url.includes('/fulfillment/orders?'))).toBe(false)
    expect(await store.loginSupplierApi('supplier1', 'secret')).toBe(true)
    expect(store.auth).toMatchObject({ role: 'supplier', supplierId: 'S1', name: '供应商一' })
    expect(store.orders).toHaveLength(1)
    expect(readSupplierAccessToken()).toBe('access-s1')
  })

  it('uses driver login and keeps only assigned work', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: readSupplierAccessToken, transport: async (request) => {
      if (request.url.endsWith('/auth/driver/login')) return { status: 200, body: { code: 'OK', data: { accessToken: 'access-d1', refreshToken: 'refresh-d1', profile: { actorType: 'driver', supplierId: 'S1', driverId: 'D1', displayName: '司机一' } } } }
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'driver', supplierId: 'S1', driverId: 'D1' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '供应商一', status: 'cooperating', certified: true } } }
      if (request.url.includes('/fulfillment/orders?')) return { status: 200, body: { code: 'OK', data: { items: [{ id: 'F1', order_id: 'O1', supplier_id: 'S1', driver_id: 'D1', status: 'SHIPPED', ship_type: 'driver' }], page: 1, pageSize: 200, total: 1 } } }
      throw new Error(request.url)
    } })
    const store = useSupplierStore()
    expect(await store.loginDriverApi('driver1', 'secret')).toBe(true)
    expect(store.auth).toMatchObject({ role: 'driver', supplierId: 'S1', driverId: 'D1' })
    expect(store.orders).toMatchObject([{ id: 'F1', supplierFulfillment: { driverId: 'D1', status: 'shipped' } }])
    expect(readSupplierRefreshToken()).toBe('refresh-d1')
  })

  it('creates and disables drivers through the authenticated API', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/auth/supplier/drivers') && request.method === 'POST') return { status: 200, body: { code: 'OK', data: { id: 'D1', supplierId: 'S1', name: '司机一', account: 'driver1', phone: '13900000012', enabled: true } } }
      if (request.url.endsWith('/auth/supplier/drivers/D1')) return { status: 200, body: { code: 'OK', data: { id: 'D1', supplierId: 'S1', name: '司机一', account: 'driver1', phone: '13900000012', enabled: false } } }
      throw new Error(request.url)
    } })
    const store = useSupplierStore()
    store.auth = { isLoggedIn: true, role: 'supplier', account: 'supplier1', name: '供应商一', supplierId: 'S1' }
    expect(await store.addDriver({ name: '司机一', phone: '13900000012', account: 'driver1', password: 'secret1' })).toEqual({ ok: true })
    expect(store.drivers[0]).toMatchObject({ id: 'D1', supplierId: 'S1' })
    expect(await store.toggleDriverStatusApi('D1')).toBe(true)
    expect(store.drivers[0].status).toBe('disabled')
    expect(calls.map((item) => item.method)).toEqual(['POST', 'PATCH'])
  })

  it('does not keep an authenticated screen when own supplier profile fails', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: readSupplierAccessToken, transport: async (request) => {
      if (request.url.endsWith('/auth/supplier/login')) return { status: 200, body: { code: 'OK', data: { accessToken: 'access-s1', refreshToken: 'refresh-s1', profile: { actorType: 'supplier', supplierId: 'S1', displayName: '供应商一' } } } }
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S1' } } }
      return { status: 503, body: { code: 'INTERNAL_ERROR', message: '组织服务不可用' } }
    } })
    const store = useSupplierStore()
    expect(await store.loginSupplierApi('supplier1', 'secret')).toBe(false)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(readSupplierAccessToken()).toBe('')
    expect(store.loginError).toContain('组织服务不可用')
  })
})
