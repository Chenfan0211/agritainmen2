import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, readPlatformWithdrawals } from '@agritainment/shared'
import { createUserStore } from '../../src/stores/user'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

const ok = (data: unknown) => ({ status: 200, body: { code: 'OK', message: 'ok', data } })

describe('user api withdrawal', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('loads server history and submits with the current leader and an idempotency key', async () => {
    let availableCents = 500
    const rows: Array<Record<string, unknown>> = []
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return ok({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/commissions/me')) return ok({ availableCents, pendingCents: 0, withdrawnCents: 0 })
      if (request.url.includes('/withdrawals/me')) return ok(rows)
      if (request.url.endsWith('/withdrawals') && request.method === 'POST') {
        expect(request.body).toEqual({ requesterId: 'T001', amountCents: 500, method: 'WECHAT' })
        expect(request.headers['Idempotency-Key']).toMatch(/^withdrawal-/)
        rows.unshift({ id: 'W-1', requesterId: 'T001', amountCents: 500, method: 'WECHAT', status: 'PENDING', createdAt: '2026-11-16T10:00:00Z' })
        availableCents = 0
        return ok(rows[0])
      }
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    const localBefore = JSON.stringify(readPlatformWithdrawals())
    await store.refreshCommissionSummary()
    expect(store.availableCommission).toBe(5)
    expect(await store.withdrawCommission()).toBe('pending')
    expect(store.availableCommission).toBe(0)
    expect(store.withdrawalRequests).toMatchObject([{ id: 'W-1', amount: 5, status: 'pending' }])
    expect(await store.withdrawCommission()).toBe('duplicate')
    expect(transport.mock.calls.filter(([request]) => request.url.endsWith('/withdrawals') && request.method === 'POST')).toHaveLength(1)
    expect(JSON.stringify(readPlatformWithdrawals())).toBe(localBefore)
    store.$patch({ userId: 'U2', identityProfile: { openid: 'openid-2', userId: 'U2', leaderId: 'T002', level: 'level2', status: 'active' } })
    expect(store.withdrawalRequests).toEqual([])
    expect(store.availableCommission).toBe(0)
  })

  it('does not write a local withdrawal when the server rejects the request', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return ok({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/commissions/me')) return ok({ availableCents: 500, pendingCents: 0, withdrawnCents: 0 })
      if (request.url.includes('/withdrawals/me')) return ok([])
      return { status: 409, body: { code: 'CONFLICT', message: '可提现佣金不足' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    const localBefore = JSON.stringify(readPlatformWithdrawals())
    expect(await store.withdrawCommission()).toBe(false)
    expect(store.error).toContain('可提现佣金不足')
    expect(JSON.stringify(readPlatformWithdrawals())).toBe(localBefore)
  })

  it('reloads server withdrawal history after opening the store again', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return ok({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/commissions/me')) return ok({ availableCents: 0, pendingCents: 0, withdrawnCents: 500 })
      if (request.url.includes('/withdrawals/me')) return ok([{ id: 'W-HISTORY', requesterId: 'T001', amountCents: 500, method: 'WECHAT', status: 'APPROVED', createdAt: '2026-11-15T10:00:00Z', reviewedAt: '2026-11-16T10:00:00Z', reviewNote: '审核通过' }])
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    await store.refreshCommissionSummary()
    expect(store.withdrawalRequests).toMatchObject([{ id: 'W-HISTORY', amount: 5, status: 'approved', method: '微信提现', reviewedNote: '审核通过' }])
    expect(store.availableCommission).toBe(0)
  })

  it('clears old financial data when the current authorization is revoked', async () => {
    let revoked = false
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return ok({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/commissions/me')) return revoked ? { status: 401, body: { code: 'UNAUTHORIZED', message: '登录已失效' } } : ok({ availableCents: 500, pendingCents: 0, withdrawnCents: 0 })
      if (request.url.includes('/withdrawals/me')) return ok([{ id: 'W-OLD', requesterId: 'T001', amountCents: 100, method: 'WECHAT', status: 'PENDING', createdAt: '2026-11-15T10:00:00Z' }])
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.$patch({ userId: 'U1', identityProfile: { openid: 'openid-1', userId: 'U1', leaderId: 'T001', level: 'level1', status: 'active' } })
    await store.refreshCommissionSummary()
    expect(store.availableCommission).toBe(5)
    expect(store.withdrawalRequests).toHaveLength(1)
    revoked = true
    await store.refreshCommissionSummary()
    expect(store.availableCommission).toBe(0)
    expect(store.withdrawalRequests).toEqual([])
  })
})
