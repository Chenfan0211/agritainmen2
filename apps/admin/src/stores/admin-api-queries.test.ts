import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient, defaultAdminRoles } from '@agritainment/shared'
import { useAdminStore } from './admin'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('admin api P1 queries', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('loads categories, prices, users, afterSales, commissions, roles and accounts', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/auth/me')) return { status: 200, body: { code: 'OK', message: 'ok', data: { actorType: 'admin', actorId: 'A1', tenantId: 'PLATFORM', displayName: '管理员', roles: ['super_admin'], permissions: ['*'] } } }
      if (request.url.includes('/auth/admin/supplier-accounts')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/auth/admin/store-accounts')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/org/suppliers')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/org/farm-accounts')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/org/farms')) return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
      if (request.url.includes('/catalog/products')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: {} } }
      if (request.url.includes('/orders')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [], page: 1, pageSize: 200, total: 0 } } }
      if (request.url.includes('/catalog/categories')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'C1', code: 'fresh', name: '生鲜', sortOrder: 1, enabled: true }] } }
      if (request.url.includes('/catalog/prices')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'PP1', name: '门店价', scope: 'store', discountRate: 0.95, enabled: true }] } }
      if (request.url.includes('/org/users')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'U1', nickname: '王小满' }], page: 1, pageSize: 20, total: 1 } } }
      if (request.url.includes('/after-sales')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'AS1', order_id: 'O1', type: 'refund', status: 'processing', amount_cents: 10000 }], page: 1, pageSize: 20, total: 1 } } }
      if (request.url.includes('/commissions')) return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'CM1', source_id: 'S1', beneficiary_id: 'T1', amount_cents: 500, direction: 'PROMOTER', status: 'AVAILABLE' }], page: 1, pageSize: 20, total: 1 } } }
      if (request.url.endsWith('/withdrawals')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.includes('/auth/admin/roles')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'R1', code: 'admin', name: '管理员', enabled: true }] } }
      if (request.url.includes('/auth/admin/accounts')) return { status: 200, body: { code: 'OK', message: 'ok', data: [{ id: 'A1', account: 'admin', display_name: '管理员', enabled: true, role_code: 'admin' }] } }
      if (request.url.includes('/admin/dashboard')) return { status: 200, body: { code: 'OK', message: 'ok', data: { gmvCents: 0, orderCount: 0 } } }
      throw new Error('unexpected ' + request.url)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport, getAccessToken: () => 'server-token' })
    const store = useAdminStore()
    await store.initialize()
    if (store.error) throw new Error('init error=' + store.error)
    expect(store.categories.some((item) => item.name === '生鲜')).toBe(true)
    expect(store.policies.some((item) => item.name === '门店价')).toBe(true)
    expect(store.adminUsers[0]).toMatchObject({ id: 'U1', nickname: '王小满' })
    expect(store.afterSales[0]).toMatchObject({ id: 'AS1', amount: 100 })
    expect(store.commissionSettlementRecords[0]).toMatchObject({ id: 'CM1', amount: 5 })
    expect(store.adminRoles.some((item) => item.code === 'admin')).toBe(true)
    expect(store.adminAccounts.some((item) => item.account === 'admin')).toBe(true)
  })

  it('loads supplier data for a reviewer without querying unrelated modules', async () => {
    const calls: string[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request.url)
      if (request.url.endsWith('/api/v1/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'admin', actorId: 'A2', tenantId: 'PLATFORM', roles: ['reviewer'], permissions: ['supplier.audit'] } } }
      if (request.url.endsWith('/api/v1/org/suppliers')) return { status: 200, body: { code: 'OK', data: [] } }
      if (request.url.endsWith('/api/v1/auth/admin/supplier-accounts')) return { status: 200, body: { code: 'OK', data: [] } }
      throw new Error('unexpected ' + request.url)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport, getAccessToken: () => 'reviewer-token' })
    const store = useAdminStore()
    await store.initialize()
    expect(store.error).toBe('')
    expect(store.canMenu('suppliers')).toBe(true)
    expect(store.canMenu('farms')).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('opens the commissions review menu for a leader withdrawal reviewer', async () => {
    const calls: string[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => 'reviewer-token', transport: async (request) => {
      calls.push(request.url)
      if (request.url.endsWith('/auth/me')) return { status: 200, body: { code: 'OK', data: { actorType: 'admin', actorId: 'A3', tenantId: 'PLATFORM', roles: ['reviewer'], permissions: ['leader.withdrawal.review'] } } }
      if (request.url.endsWith('/withdrawals')) return { status: 200, body: { code: 'OK', data: [{ id: 'W1', requesterId: 'T1', amountCents: 200, method: 'WECHAT', status: 'PENDING', createdAt: '2026-11-16T10:00:00Z' }] } }
      throw new Error('unexpected ' + request.url)
    } })
    const store = useAdminStore()
    await store.initialize()
    expect(store.error).toBe('')
    expect(store.canMenu('commissions')).toBe(true)
    expect(store.pendingWithdrawals).toBe(1)
    expect(calls.filter((url) => url.endsWith('/withdrawals'))).toHaveLength(1)
  })

  it('sends super administrator role writes to auth service', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      return { status: 200, body: { code: 'OK', data: { id: 'R2', code: 'reviewer', name: '审核员', enabled: true } } }
    } })
    const store = useAdminStore()
    store.apiRole = defaultAdminRoles()[0]
    store.auth = { isLoggedIn: true, account: 'admin', accountId: 'A1', roleId: store.apiRole.id, roleCode: store.apiRole.code, name: '超级管理员' }
    store.adminRoles = [store.apiRole, { ...defaultAdminRoles()[1], id: 'R2', code: 'reviewer', name: '审核员' }]
    expect(await store.createAdminRole({ code: 'new_role', name: '新角色', menuPermissions: ['suppliers'], actionPermissions: ['supplier.audit'] })).toEqual({ ok: true })
    expect(await store.updateAdminRole('R2', { name: '资质审核员', enabled: true })).toEqual({ ok: true })
    expect(await store.updateAdminRolePermissions('R2', { menuPermissions: ['suppliers'], actionPermissions: ['supplier.audit'] })).toEqual({ ok: true })
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /api/v1/auth/admin/roles', 'PUT /api/v1/auth/admin/roles/R2', 'PUT /api/v1/auth/admin/roles/R2/permissions'
    ])
  })
})
