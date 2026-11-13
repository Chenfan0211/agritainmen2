import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient } from '@agritainment/shared'
import type { ApiTransportRequest } from '@agritainment/shared'
import { useAdminStore } from './admin'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}
function ok() { return { status: 200, body: { code: 'OK', message: 'ok', data: [] } } }

describe('admin api P2 dict groups and price policies', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('creates dict group and price policy through API', async () => {
    const calls: ApiTransportRequest[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.url.endsWith('/api/v1/admin/dictionaries') && request.method === 'POST') return ok()
      if (request.url.endsWith('/api/v1/catalog/prices') && request.method === 'POST') return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'PP1', name: '门店价', scope: 'store', discount_rate: 0.95, enabled: true } } }
      return ok()
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    await store.login('admin', '123456')
    expect(await store.addDictGroup({ type: 'productCategory', name: '生鲜' })).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/admin/dictionaries'))).toBe(true)
    expect(await store.createPolicy('门店价', 'group', 'store', 95)).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/catalog/prices'))).toBe(true)
  })

  it('updates and toggles price policy through API', async () => {
    const calls: ApiTransportRequest[] = []
    const transport = vi.fn(async (request) => { calls.push(request); return ok() })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    await store.login('admin', '123456')
    store.policies = [{ id: 'PP1', name: '门店价', type: 'store', scope: 'store', discount: 95, enabled: true, tiers: [] } as never]
    expect(await store.updatePolicy('PP1', '门店价2', 'store', 90, true)).toBe(true)
    expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/api/v1/catalog/prices/PP1'))).toBe(true)
    expect(await store.togglePolicy('PP1')).toBe(true)
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/api/v1/catalog/prices/PP1'))).toBe(true)
  })
})
