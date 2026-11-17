import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, readCCommissionRecords } from '@agritainment/shared'
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
      if (request.url.includes('/commissions/me')) return { status: 200, body: { code: 'OK', message: 'ok', data: { availableCents: 12000, pendingCents: 3000, withdrawnCents: 5000, earnedCents: 20000, approvedWithdrawalCents: 2000 } } }
      if (request.url.includes('/withdrawals/me')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 10, total: 0, pendingTotal: 0 } } }
      return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 20, total: 0 } } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U-DEMO-L1', identityProfile: { openid: 'mock_openid_demo_level1', userId: 'U-DEMO-L1', level: 'level1', leaderId: 'T001', status: 'active' } })
    await store.refreshCommissionSummary()
    expect(store.availableCommission).toBe(120)
    expect(store.pendingCommission).toBe(30)
    expect(store.commissionSummary).toMatchObject({ earned: 200, withdrawn: 50, approved: 20 })
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

  it('rejects an incomplete financial summary instead of showing zero income', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/commissions/me')) return { status: 200, body: { code: 'OK', data: { availableCents: 500, pendingCents: 0, withdrawnCents: 0 } } }
      if (request.url.includes('/withdrawals/me')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 10, total: 0, pendingTotal: 0 } } }
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    expect(await store.refreshCommissionSummary()).toBe(false)
    expect(store.commissionSummary).toBe(null)
    expect(store.error).toContain('佣金汇总格式异常')
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

  it('loads own commission rows by cursor without mixing local records or another leader', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `C-${12 - index}`, sourceId: `O-${12 - index}`,
      beneficiaryId: 'T001', amountCents: 100, direction: 'LEVEL_1', status: 'AVAILABLE',
      createdAt: `2030-01-01T00:00:${String(12 - index).padStart(2, '0')}Z` }))
    const requests: URL[] = []
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/commissions/me/records')) {
        const url = new URL(request.url)
        requests.push(url)
        const page = Number(url.searchParams.get('page'))
        const beforeId = url.searchParams.get('beforeId')
        const start = beforeId ? rows.findIndex((row) => row.id === beforeId) + 1 : 0
        const items = url.searchParams.get('beneficiaryId') === 'T001' ? rows.slice(start, start + 10) : []
        return { status: 200, body: { code: 'OK', data: { items, page, pageSize: 10, total: items.length ? rows.length : 0 } } }
      }
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    const localBefore = JSON.stringify(readCCommissionRecords())
    expect(await store.refreshCommissionRecords()).toBe(true)
    expect(store.myCommissionRecords).toHaveLength(10)
    rows.unshift({ id: 'C-NEW', sourceId: 'O-NEW', beneficiaryId: 'T001', amountCents: 100, direction: 'LEVEL_1', status: 'AVAILABLE', createdAt: '2031-01-01T00:00:00Z' })
    expect(await store.loadMoreCommissionRecords()).toBe(true)
    expect(requests.at(-1)?.searchParams.get('beforeId')).toBe('C-3')
    expect(store.myCommissionRecords.map((row) => row.id)).toEqual(Array.from({ length: 12 }, (_, index) => `C-${12 - index}`))
    expect(store.apiCommissionTotal).toBe(12)
    expect(JSON.stringify(readCCommissionRecords())).toBe(localBefore)
    store.$patch({ userId: 'U2', identityProfile: { openid: 'openid-2', userId: 'U2', leaderId: 'T002', level: 'level2', status: 'active' } })
    expect(store.myCommissionRecords).toEqual([])
    expect(await store.refreshCommissionRecords()).toBe(true)
    expect(store.apiCommissionTotal).toBe(0)
  })

  it('clears cached commission rows when the current authorization expires', async () => {
    let revoked = false
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/commissions/me/records')) return { status: 200, body: { code: 'OK', data: { items: [{ id: 'C-OLD', sourceId: 'O-1', beneficiaryId: 'T001', amountCents: 100, direction: 'LEVEL_1', status: 'AVAILABLE', createdAt: '2030-01-01T00:00:00Z' }], page: 1, pageSize: 10, total: 1 } } }
      if (request.url.includes('/commissions/me')) return revoked ? { status: 401, body: { code: 'UNAUTHORIZED', message: '登录已失效' } }
        : { status: 200, body: { code: 'OK', data: { availableCents: 100, pendingCents: 0, withdrawnCents: 0, earnedCents: 100, approvedWithdrawalCents: 0 } } }
      if (request.url.includes('/withdrawals/me')) return { status: 200, body: { code: 'OK', data: { items: [], page: 1, pageSize: 10, total: 0, pendingTotal: 0 } } }
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    expect(await store.refreshCommissionSummary()).toBe(true)
    expect(await store.refreshCommissionRecords()).toBe(true)
    expect(store.myCommissionRecords).toHaveLength(1)
    revoked = true
    expect(await store.refreshCommissionSummary()).toBe(false)
    expect(store.myCommissionRecords).toEqual([])
    expect(store.apiCommissionTotal).toBe(0)
  })
})
