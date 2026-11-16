import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient, defaultAdminRoles, readPlatformWithdrawals, writePlatformWithdrawal } from '@agritainment/shared'
import { useAdminStore } from './admin'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

const ok = (data: unknown) => ({ status: 200, body: { code: 'OK', message: 'ok', data } })
const pending = { id: 'W-SERVER', requesterId: 'T001', amountCents: 500, method: 'WECHAT', status: 'PENDING', createdAt: '2026-11-16T10:00:00Z' }

function reviewerStore() {
  const store = useAdminStore()
  store.apiRole = { ...defaultAdminRoles()[0], id: 'API-reviewer', code: 'reviewer', actionPermissions: ['leader.withdrawal.review'], menuPermissions: ['dashboard', 'leaders', 'commissions'] }
  store.auth = { isLoggedIn: true, account: 'reviewer', accountId: 'ADMIN-1', roleId: store.apiRole.id, roleCode: store.apiRole.code, name: '审核员' }
  return store
}

describe('admin API withdrawal review', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('loads server applications and reviews through Bearer without writing local records', async () => {
    expect(writePlatformWithdrawal({ id: 'W-LOCAL', requesterType: 'promoter', requesterId: 'T001', amount: 9, method: '微信提现', status: 'pending', requestKey: 'W-LOCAL', createdAt: '2026-11-15T10:00:00Z' })).toBe(true)
    const localBefore = JSON.stringify(readPlatformWithdrawals())
    let rows: Array<typeof pending & { reviewedBy?: string; reviewedAt?: string; reviewNote?: string }> = [pending]
    const transport = vi.fn(async (request) => {
      if (request.url.endsWith('/api/v1/withdrawals') && request.method === 'GET') return ok(rows)
      if (request.url.endsWith('/api/v1/withdrawals/W-SERVER/review')) {
        expect(request.method).toBe('POST')
        expect(request.headers.Authorization).toBe('Bearer reviewer-token')
        expect(request.body).toEqual({ approved: true, note: '核对通过' })
        rows = [{ ...pending, status: 'APPROVED', reviewedBy: 'ADMIN-1', reviewedAt: '2026-11-16T11:00:00Z', reviewNote: '核对通过' }]
        return ok(rows[0])
      }
      throw new Error(`Unexpected ${request.url}`)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => 'reviewer-token', transport })
    const store = reviewerStore()
    expect(await store.loadWithdrawals()).toBe(true)
    expect(store.apiWithdrawals).toMatchObject([{ id: 'W-SERVER', requesterId: 'T001', amount: 5, status: 'pending' }])
    expect(store.pendingWithdrawals).toBe(1)
    expect(store.queryAdminTodos().find((todo) => todo.type === 'withdrawal')?.objectIds).toEqual(['W-SERVER'])
    const reviewed = await store.reviewWithdrawal('W-SERVER', 'approved', '核对通过', 'leader.withdrawal.review')
    expect(reviewed).toMatchObject({ id: 'W-SERVER', status: 'approved', operator: 'ADMIN-1' })
    expect(store.apiWithdrawals).toMatchObject([{ id: 'W-SERVER', status: 'approved', reviewedNote: '核对通过' }])
    expect(store.pendingWithdrawals).toBe(0)
    expect(JSON.stringify(readPlatformWithdrawals())).toBe(localBefore)
  })

  it('refreshes server truth after a concurrent review conflict', async () => {
    let rows: Array<typeof pending & { reviewedBy?: string; reviewedAt?: string; reviewNote?: string }> = [pending]
    const transport = vi.fn(async (request) => {
      if (request.method === 'GET') return ok(rows)
      rows = [{ ...pending, status: 'REJECTED', reviewedBy: 'ADMIN-2' }]
      return { status: 409, body: { code: 'CONFLICT', message: '该提现申请已处理' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => 'reviewer-token', transport })
    const store = reviewerStore()
    await store.loadWithdrawals()
    expect(await store.reviewWithdrawal('W-SERVER', 'approved', undefined, 'leader.withdrawal.review')).toBeNull()
    expect(store.error).toContain('已处理')
    expect(store.apiWithdrawals).toMatchObject([{ id: 'W-SERVER', status: 'rejected' }])
  })

  it('does not query or review when the current role lacks review permission', async () => {
    const transport = vi.fn(async () => ok([pending]))
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => 'no-review', transport })
    const store = reviewerStore()
    store.apiRole = { ...store.apiRole!, actionPermissions: [] }
    expect(await store.loadWithdrawals()).toBe(false)
    expect(await store.reviewWithdrawal('W-SERVER', 'approved')).toBeNull()
    expect(transport).not.toHaveBeenCalled()
  })
})
