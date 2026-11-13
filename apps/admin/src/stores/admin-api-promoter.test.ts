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

describe('admin api P2 promoters and pricing defaults', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('creates and updates promoter through API', async () => {
    const calls: ApiTransportRequest[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.url.endsWith('/api/v1/org/promoters') && request.method === 'POST') return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'PROM1', name: '李业务' } } }
      return ok()
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    await store.login('admin', '123456')
    expect(await store.addPromoter({ name: '李业务', level: 'level1', region: '湘西', status: 'active' })).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/org/promoters'))).toBe(true)
    expect(await store.updatePromoter('PROM1', { name: '李业务2', level: 'level2', region: '湘西', status: 'active' })).toBe(true)
    expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/api/v1/org/promoters/PROM1'))).toBe(true)
  })

  it('updates leader status and pricing defaults through API', async () => {
    const calls: ApiTransportRequest[] = []
    const transport = vi.fn(async (request) => { calls.push(request); return ok() })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    await store.login('admin', '123456')
    expect(await store.setLeaderStatus('T001', false)).not.toBeNull()
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/api/v1/org/leaders/T001'))).toBe(true)
    expect(await store.updatePricingDefaults({ level1Amount: 5, level2Amount: 8 } as never)).toBe(true)
    expect(calls.some((c) => c.method === 'PUT' && c.url.endsWith('/api/v1/catalog/pricing-defaults'))).toBe(true)
  })
})
