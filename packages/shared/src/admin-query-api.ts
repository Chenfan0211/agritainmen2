import { apiRequest } from './api-client'

export type AdminQueryRequest = <T>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string; headers?: Record<string, string> }) => Promise<T>
export interface PageResult<T> { items: T[]; page: number; pageSize: number; total: number }
export interface DashboardSummary { gmv: number; orderCount: number; supplierCount: number; farmCount: number; pendingAuditCount: number }
export interface ReportRow { id: string; orderDate: string; orderCount: number; gmv: number }
export interface CategoryItem { id: string; code: string; name: string; icon?: string; sortOrder: number; enabled: boolean }
export interface PricePolicyItem { id: string; name: string; scope: string; targetId?: string; discountRate: number; enabled: boolean }
export interface UserItem { id: string; nickname?: string; phone?: string; level?: string; leaderId?: string; parentLeaderId?: string; sourceChannel?: string; status?: string }
export interface AfterSaleItem { id: string; orderId: string; subOrderId?: string; buyerId?: string; supplierId?: string; type: string; status: string; reason?: string; amount: number; refunded: number; returnTrackingNo?: string }
export interface CommissionItem { id: string; sourceId: string; beneficiaryId: string; amount: number; direction: string; status: string }
export interface RoleItem { id: string; code: string; name: string; permissionsJson?: string; systemRole?: boolean; enabled: boolean }
export interface AccountItem { id: string; account: string; displayName: string; enabled: boolean; roleCode?: string }

function cents(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n / 100 : 0 }
function text(value: unknown): string { return typeof value === 'string' ? value : '' }

export function createAdminQueryClient(request: AdminQueryRequest = apiRequest) {
  return {
    async dashboard(): Promise<DashboardSummary> {
      const dto = await request<Record<string, unknown>>('/api/v1/admin/dashboard')
      return { gmv: cents(dto?.gmvCents), orderCount: Number(dto?.orderCount || 0), supplierCount: Number(dto?.supplierCount || 0), farmCount: Number(dto?.farmCount || 0), pendingAuditCount: Number(dto?.pendingAuditCount || 0) }
    },
    async reports(query: { from?: string; to?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<ReportRow>> {
      const params = new URLSearchParams()
      if (query.from) params.set('from', query.from)
      if (query.to) params.set('to', query.to)
      if (query.page) params.set('page', String(query.page))
      if (query.pageSize) params.set('pageSize', String(query.pageSize))
      const dto = await request<Record<string, any>>(`/api/v1/admin/reports?${params.toString()}`)
      return { items: (dto?.items || []).map((row: Record<string, unknown>) => ({ id: text(row.id), orderDate: text(row.order_date), orderCount: Number(row.order_count || 0), gmv: cents(row.gmv_cents) })), page: Number(dto?.page || 1), pageSize: Number(dto?.pageSize || 20), total: Number(dto?.total || 0) }
    },
    async categories(): Promise<CategoryItem[]> {
      const dto = await request<Array<Record<string, unknown>>>('/api/v1/catalog/categories')
      return (dto || []).map((row) => ({ id: text(row.id), code: text(row.code), name: text(row.name), icon: text(row.icon) || undefined, sortOrder: Number(row.sortOrder || 0), enabled: row.enabled !== false }))
    },
    async prices(): Promise<PricePolicyItem[]> {
      const dto = await request<Array<Record<string, unknown>>>('/api/v1/catalog/prices')
      return (dto || []).map((row) => ({ id: text(row.id), name: text(row.name), scope: text(row.scope), targetId: text(row.targetId) || undefined, discountRate: Number(row.discountRate || 1), enabled: row.enabled !== false }))
    },
    async users(query: { page?: number; pageSize?: number } = {}): Promise<PageResult<UserItem>> {
      const params = new URLSearchParams({ page: String(query.page || 1), pageSize: String(query.pageSize || 20) })
      const dto = await request<Record<string, any>>(`/api/v1/org/users?${params.toString()}`)
      return { items: (dto?.items || []).map((row: Record<string, unknown>) => ({ id: text(row.id), nickname: text(row.nickname) || undefined, phone: text(row.phone) || undefined, level: text(row.level) || undefined, leaderId: text(row.leader_id) || undefined, parentLeaderId: text(row.parent_leader_id) || undefined, sourceChannel: text(row.source_channel) || undefined, status: text(row.status) || undefined })), page: Number(dto?.page || 1), pageSize: Number(dto?.pageSize || 20), total: Number(dto?.total || 0) }
    },
    async afterSales(query: { status?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<AfterSaleItem>> {
      const params = new URLSearchParams({ page: String(query.page || 1), pageSize: String(query.pageSize || 20) })
      if (query.status) params.set('status', query.status)
      const dto = await request<Record<string, any>>(`/api/v1/after-sales?${params.toString()}`)
      return { items: (dto?.items || []).map((row: Record<string, unknown>) => ({ id: text(row.id), orderId: text(row.order_id), subOrderId: text(row.sub_order_id) || undefined, buyerId: text(row.buyer_id) || undefined, supplierId: text(row.supplier_id) || undefined, type: text(row.type), status: text(row.status), reason: text(row.reason) || undefined, amount: cents(row.amount_cents), refunded: cents(row.refunded_cents), returnTrackingNo: text(row.return_tracking_no) || undefined })), page: Number(dto?.page || 1), pageSize: Number(dto?.pageSize || 20), total: Number(dto?.total || 0) }
    },
    async commissions(query: { beneficiaryId?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<CommissionItem>> {
      const params = new URLSearchParams({ page: String(query.page || 1), pageSize: String(query.pageSize || 20) })
      if (query.beneficiaryId) params.set('beneficiaryId', query.beneficiaryId)
      const dto = await request<Record<string, any>>(`/api/v1/commissions?${params.toString()}`)
      return { items: (dto?.items || []).map((row: Record<string, unknown>) => ({ id: text(row.id), sourceId: text(row.source_id), beneficiaryId: text(row.beneficiary_id), amount: cents(row.amount_cents), direction: text(row.direction), status: text(row.status) })), page: Number(dto?.page || 1), pageSize: Number(dto?.pageSize || 20), total: Number(dto?.total || 0) }
    },
    async myCommission(beneficiaryId: string): Promise<{ available: number; pending: number; withdrawn: number }> {
      const dto = await request<Record<string, unknown>>(`/api/v1/commissions/me?beneficiaryId=${encodeURIComponent(beneficiaryId)}`)
      return { available: cents(dto?.availableCents), pending: cents(dto?.pendingCents), withdrawn: cents(dto?.withdrawnCents) }
    },
    async roles(): Promise<RoleItem[]> {
      const dto = await request<Array<Record<string, unknown>>>('/api/v1/auth/admin/roles')
      return (dto || []).map((row) => ({ id: text(row.id), code: text(row.code), name: text(row.name), permissionsJson: text(row.permissions_json) || undefined, systemRole: row.system_role === true, enabled: row.enabled !== false }))
    },
    async accounts(): Promise<AccountItem[]> {
      const dto = await request<Array<Record<string, unknown>>>('/api/v1/auth/admin/accounts')
      return (dto || []).map((row) => ({ id: text(row.id), account: text(row.account), displayName: text(row.display_name), enabled: row.enabled !== false, roleCode: text(row.role_code) || undefined }))
    }
  }
}
