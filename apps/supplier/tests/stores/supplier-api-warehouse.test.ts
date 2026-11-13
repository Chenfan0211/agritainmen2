import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, SUPPLIER_DEMO_ID } from '@agritainment/shared'
import type { Supplier } from '@agritainment/shared'
import { resetSupplierStore, useSupplierStore } from '../../src/stores/supplier'
import { supplierWarehouseOf } from '../../src/services/repository'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) }, removeItem: (key: string) => { storage.delete(key) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('supplier API warehouse', () => {
  beforeEach(() => { resetSupplierStore(); localStorage.clear(); vi.unstubAllGlobals() })

  it('does not substitute the demo warehouse for a server profile without one', () => {
    expect(supplierWarehouseOf(SUPPLIER_DEMO_ID, [{ id: SUPPLIER_DEMO_ID } as Supplier])).toBeUndefined()
  })

  it('reads warehouse and saves with supplier profile version without local fallback', async () => {
    const writes: Array<{ url: string; method: string; body?: unknown }> = []
    let rejectNext = false
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'supplier', supplierId: 'S1' } } }
      if (request.url.endsWith('/org/me/supplier') && request.method === 'GET') return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '供应商一', status: 'cooperating', certified: true, version: 4, profile: { brands: ['原有品牌'], warehouse: { address: '旧仓点', longitude: 112.8, latitude: 28.1, coordinateSystem: 'GCJ-02' } } } } }
      if (request.url.endsWith('/auth/supplier/drivers')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.includes('/fulfillment/orders?')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.endsWith('/org/me/supplier/warehouse')) {
        writes.push(request)
        if (rejectNext) return { status: 409, body: { code: 'CONFLICT', message: '供应商资料已更新，请刷新后重试' } }
        return { status: 200, body: { code: 'OK', data: { id: 'S1', name: '供应商一', status: 'cooperating', certified: true, version: 5, profile: { brands: ['原有品牌'], warehouse: { address: '新仓点', contactName: '仓管', contactPhone: '13900000011', longitude: 112.9, latitude: 28.2, coordinateSystem: 'GCJ-02' } } } } }
      }
      throw new Error(request.url)
    } })
    const store = useSupplierStore()
    store.auth = { ...store.auth, isLoggedIn: true, role: 'supplier', supplierId: 'S1' }
    await store.initialize()
    expect(store.suppliers[0]).toMatchObject({ warehouse: { address: '旧仓点' }, version: 4 })
    const input = { address: '新仓点', contactName: '仓管', contactPhone: '13900000011', longitude: 112.9, latitude: 28.2 }
    expect(await store.updateWarehouse(input)).toEqual({ ok: true })
    expect(writes[0]).toMatchObject({ method: 'PUT', body: { ...input, expectedVersion: 4 } })
    expect(store.suppliers[0]).toMatchObject({ warehouse: { address: '新仓点' }, version: 5 })
    rejectNext = true
    const failed = await store.updateWarehouse({ ...input, address: '未保存仓点' })
    expect(failed).toMatchObject({ ok: false })
    expect(store.suppliers[0].warehouse?.address).toBe('新仓点')
    expect(writes[1].body).toMatchObject({ expectedVersion: 5 })
  })
})
