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
    store.orders[0].supplierFulfillment!.driverId = 'D1'
    expect(await store.shipCourier('F1')).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/accept'))).toHaveLength(1)
    expect(calls.filter((call) => call.url.endsWith('/ship'))).toHaveLength(1)
    expect(store.orders[0]).toMatchObject({ id: 'F1', supplierFulfillment: { status: 'shipped', shipType: 'courier', trackingNo: 'SF1' } })
    expect(store.orders[0].supplierFulfillment?.driverId).toBeUndefined()
  })

  it('assigns and reassigns active drivers before driver shipment', async () => {
    const calls: Array<{ url: string; body?: unknown }> = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S1' } } }
      if (request.url.endsWith('/org/me/supplier')) return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '测试供应商', status: 'cooperating', certified: true } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [
        { id: 'D1', supplierId: 'S1', name: '司机一', phone: '13900000011', account: 'driver1', enabled: true },
        { id: 'D2', supplierId: 'S1', name: '司机二', phone: '13900000012', account: 'driver2', enabled: true },
      ] } }
      if (request.url.includes('/fulfillment/orders?')) return { status: 200, body: { code: 'OK', data: { items: [{ id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'ACCEPTED' }], page: 1, pageSize: 200, total: 1 } } }
      if (request.url.endsWith('/assign-driver')) return { status: 200, body: { code: 'OK', data: { id: 'F1', status: 'ACCEPTED', driver_id: (request.body as { driverId: string }).driverId } } }
      if (request.url.endsWith('/ship')) return { status: 200, body: { code: 'OK', data: { id: 'F1', status: 'SHIPPED', ship_type: 'driver', driver_id: 'D2' } } }
      throw new Error(request.url)
    } })
    const store = useSupplierStore()
    store.auth = { isLoggedIn: true, role: 'supplier', supplierId: 'S1', name: '测试供应商', account: 'test' }
    await store.initialize()
    expect(store.assignableDriversForOrder(store.orders[0]).map((driver) => driver.id)).toEqual(['D1', 'D2'])
    expect(await store.assignDriver('F1', 'D1')).toBe(true)
    expect(await store.reassignDriver('F1', 'D2')).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/assign-driver')).map((call) => call.body)).toEqual([
      { driverId: 'D1' }, { driverId: 'D2', expectedDriverId: 'D1' },
    ])
    expect(await store.shipDriverApi('F1')).toBe(true)
    expect(calls.findLast((call) => call.url.endsWith('/ship'))?.body).toEqual({ shipType: 'driver', driverId: 'D2' })
    expect(store.orders[0].supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D2' })
  })
})
