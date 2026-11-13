import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { resetSupplierStore, useSupplierStore } from '../../src/stores/supplier'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('supplier api fulfillment actions', () => {
  beforeEach(() => { resetSupplierStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('accepts and ships through the fulfillment API in api mode', async () => {
    const calls: Array<{ url: string; method?: string; headers: Record<string, string> }> = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S1' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '测试供应商', status: 'cooperating', certified: true } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.includes('/fulfillment/orders?')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'PENDING' }], page: 1, pageSize: 200, total: 1 } } }
      expect(request.headers['Idempotency-Key']).toMatch(/^fulfillment-/)
      if (request.url.endsWith('/accept')) return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'ACCEPTED' } } }
      if (request.url.endsWith('/ship')) return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'SHIPPED', ship_type: 'courier', tracking_no: 'SF1' } } }
      throw new Error('unexpected ' + request.url)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useSupplierStore()
    store.auth = { ...store.auth, isLoggedIn: true, role: 'supplier', supplierId: 'S1', name: '测试供应商', account: 'test', credentialUpdatedAt: '' }
    await store.initialize()
    expect(await store.acceptOrder('F1')).toBe(true)
    expect(await store.shipCourier('F1')).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/accept'))).toHaveLength(1)
    expect(calls.filter((call) => call.url.endsWith('/ship'))).toHaveLength(1)
    expect(store.orders[0]).toMatchObject({ id: 'F1', supplierFulfillment: { status: 'shipped', shipType: 'courier', trackingNo: 'SF1' } })
  })
})
