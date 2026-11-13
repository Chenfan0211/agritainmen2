import { describe, expect, it, vi } from 'vitest'
import { createAdminQueryClient, type AdminQueryRequest } from './admin-query-api'

describe('admin query api client', () => {
  it('loads dashboard and reports', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/api/v1/admin/dashboard') return { gmvCents: 1807050, orderCount: 72, supplierCount: 3, farmCount: 5, pendingAuditCount: 1 }
      return { items: [{ id: 'D1', order_date: '2026-10-01', order_count: 2, gmv_cents: 5000 }], page: 1, pageSize: 20, total: 1 }
    })
    const client = createAdminQueryClient(request as unknown as AdminQueryRequest)
    const dashboard = await client.dashboard()
    expect(dashboard.gmv).toBe(18070.5)
    expect(dashboard.orderCount).toBe(72)
    const reports = await client.reports({ from: '2026-10-01', to: '2026-10-31' })
    expect(reports.items[0].gmv).toBe(50)
  })
  it('loads categories, prices, users, afterSales, commissions, roles, accounts', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/api/v1/catalog/categories')) return [{ id: 'C1', code: 'fresh', name: '生鲜', sortOrder: 1, enabled: true }]
      if (path.startsWith('/api/v1/catalog/prices')) return [{ id: 'P1', name: '门店价', scope: 'store', discountRate: 0.95, enabled: true }]
      if (path.startsWith('/api/v1/org/users')) return { items: [{ id: 'U1', nickname: '王小满' }], page: 1, pageSize: 20, total: 1 }
      if (path.startsWith('/api/v1/after-sales')) return { items: [{ id: 'AS1', amount_cents: 10000 }], page: 1, pageSize: 20, total: 1 }
      if (path.startsWith('/api/v1/commissions')) return { items: [{ id: 'C1', amount_cents: 500 }], page: 1, pageSize: 20, total: 1 }
      if (path.startsWith('/api/v1/auth/admin/roles')) return [{ id: 'R1', code: 'admin', name: '管理员' }]
      return [{ id: 'A1', account: 'admin', display_name: '管理员' }]
    })
    const client = createAdminQueryClient(request as unknown as AdminQueryRequest)
    expect((await client.categories())[0].name).toBe('生鲜')
    expect((await client.prices())[0].discountRate).toBe(0.95)
    expect((await client.users()).items[0].id).toBe('U1')
    expect((await client.afterSales()).items[0].amount).toBe(100)
    expect((await client.commissions()).items[0].amount).toBe(5)
    expect((await client.roles())[0].code).toBe('admin')
    expect((await client.accounts())[0].account).toBe('admin')
  })
})
