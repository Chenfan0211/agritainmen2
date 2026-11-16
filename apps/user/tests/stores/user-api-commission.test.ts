import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { createUserStore } from '../../src/stores/user'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('user api commission summary', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('loads my commission summary in api mode', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/commissions/me')) return { status: 200, body: { code: 'OK', message: 'ok', data: { availableCents: 12000, pendingCents: 3000, withdrawnCents: 5000 } } }
      return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 20, total: 0 } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U-DEMO-L1', identityProfile: { openid: 'mock_openid_demo_level1', userId: 'U-DEMO-L1', level: 'level1', leaderId: 'T001', status: 'active' } })
    await store.refreshCommissionSummary()
    expect(store.availableCommission).toBe(120)
    expect(store.pendingCommission).toBe(30)
    store.$patch({ identityProfile: null })
    await store.refreshCommissionSummary()
    expect(store.commissionSummary).toBe(null)
  })

  it('surfaces an error and keeps summary empty when the commission API fails', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: '佣金服务不可用' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U-DEMO-L1', identityProfile: { openid: 'mock_openid_demo_level1', userId: 'U-DEMO-L1', level: 'level1', leaderId: 'T001', status: 'active' } })
    await store.refreshCommissionSummary()
    expect(store.commissionSummary).toBe(null)
    expect(store.error).toContain('佣金服务不可用')
  })

  it('does not query the referred leader commission for a normal user', async () => {
    const transport = vi.fn(async (request) => ({ status: 200, body: { code: 'OK', message: 'ok', data: { items: [] } } }))
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.setReferral('T001')
    await store.refreshCommissionSummary()
    expect(transport.mock.calls.some(([request]) => request.url.includes('/commissions/me'))).toBe(false)
    expect(store.commissionSummary).toBe(null)
  })
})
