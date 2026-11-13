import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { resetSupplierStore, useSupplierStore } from '../../src/stores/supplier'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('supplier api workbench bootstrap', () => {
  beforeEach(() => { resetSupplierStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('loads fulfillment orders from the API in api mode', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S002' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S002', name: '测试供应商', status: 'cooperating', certified: true } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [] } }
      expect(request.url).toContain('/api/v1/fulfillment/orders?')
      return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'F-API', order_id: 'O-API', supplier_id: 'S002', status: 'PENDING' }], page: 1, pageSize: 200, total: 1 } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useSupplierStore()
    store.auth = { ...store.auth, isLoggedIn: true, role: 'supplier', supplierId: 'S002' }
    await store.initialize()
    expect(store.orders).toHaveLength(1)
    expect(store.orders[0]).toMatchObject({ id: 'F-API', orderId: 'O-API', supplierId: 'S002' })
  })

  it('does not fall back when fulfillment API fails', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S002' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S002', name: '测试供应商', status: 'cooperating', certified: true } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [] } }
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: '履约服务不可用' } }
    } })
    const store = useSupplierStore()
    store.auth = { ...store.auth, isLoggedIn: true, role: 'supplier', supplierId: 'S002' }
    await store.initialize()
    expect(store.orders).toEqual([])
    expect(store.error).toContain('履约服务不可用')
  })
})
