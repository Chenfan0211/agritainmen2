import { defineStore } from 'pinia'
import type { AdminAccount, AdminMenuKey, AdminPermissionCode, AdminRole, AfterSale, BusinessMediaValue, CatalogStockLogEntry, CatalogProduct, CatalogProductSubmission, CatalogState, Category, CCommissionAllocation, CDistributorProfile, CommissionRule, CommissionSettlementRecord, COrder, CProduct, DictGroup, DictItem, FarmAdministrativeAddress, FarmStore, GeocodeRequest, GeocodeResult, MockScenario, Order, PlatformAuditLogEntry, PlatformDictionaryState, PlatformEntities, PlatformJournalEntry, PlatformRecoveryHandlerKey, PlatformTransactionStep, PricePolicy, PriceTier, PricingDefaults, Product, Promoter, ShareConfig, StoreAccount, Supplier, SupplierAccount, SupplierSettlementRecord, WithdrawalRequestStatus, WriteResult } from '@agritainment/shared'
import { addDictGroup as addSharedDictGroup, addDictItem as addSharedDictItem, ADMIN_SUPER_ROLE_ID, appendCatalogStockLogs, appendPlatformAuditLog, approveCatalogProductSubmission as approveSharedCatalogProductSubmission, authenticateAdmin, buildFarmAdministrativeAddress, buildPromoterAccountSeeds, buildSupplierAccountSeeds, canPublishPlatformDictionaries, CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY, catalogChannelFlags, catalogProductStockWarnings, catalogProductToCProduct, catalogSkuNeedsRestock, catalogProductToProduct, clearPlatformJson, cloneSeed, confirmCSubOrderReceiptAtSupplier, createCatalogProductReviewRecoveryHandlerRegistration, createCatalogProductSubmission, createGeocodeProviders, createId, createPlatformAuditLogEntry, createPlatformProductionRecoveryHandlerRegistration, createStrictSnapshotRecoveryHandlerRegistration, createUserAtomicRecoveryHandlerRegistrations, DEFAULT_PRICING_DEFAULTS, deriveCOrderStatus, DICTIONARY_SCHEMA_VERSION, emptyPlatformMedia, enqueuePlatformRecovery, ensureCatalogState, formatFarmAdministrativeAddress, geocodeAddress, getPlatformProviders, hasAdminMenu, hasAdminPermission, initializePlatformRecoveryHandlers, mergeEntitySeeds, mergePlatformAfterSales, mergePlatformEntities, mergePlatformOrders, mergePlatformPromoterAccounts, mergePlatformStoreAccounts, mergePlatformSupplierAccounts, migrateFarmAdministrativeAddress, normalizeCProducts, normalizeMediaReference, pendingShareTotal, persistPlatformEntity, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, preparePlatformJournal, readCatalogProductSubmissionState, readCatalogState, readCCommissionRecords, readCDistributorProfiles, readCInventoryState, readCOrders, readPlatformAdminAccounts, readPlatformAdminRoles, readPlatformAfterSales, readPlatformAuditLogs, readPlatformCollectionRevision, readPlatformCommissionRules, readPlatformCommissionSettlementRecords, readPlatformCommissionSettlements, readPlatformDictionaries, readPlatformDrivers, readPlatformEntities, readPlatformJournal, readPlatformJson, readPlatformMedia, readPlatformOrders, readPlatformPromoterAccountState, readPlatformRecoveryQueue, readPlatformStoreAccounts, readPlatformSupplierAccounts, readPlatformSupplierSettlements, readPlatformWithdrawals, readPricingDefaults, readShareConfig, readShareRecords, reconcilePendingPlatformTransactions, rejectCatalogProductSubmission as rejectSharedCatalogProductSubmission, removeDictGroup as removeSharedDictGroup, removeDictItem as removeSharedDictItem, resolvePlatformJournal, resolvePlatformRecoveryTask, retryPlatformRecoveryTask, round2, runLockedPlatformTransaction, saveCatalogProduct as persistCatalogProduct, seedCCommerceData, seedPlatformAdminSecurity, syncCSubOrderFromSupplier, todayString, updateDictGroup as updateSharedDictGroup, updateDictItem as updateSharedDictItem, upsertPlatformFarm, validatePhone, writeCatalogState, writeCCommissionRecords, writeCDistributorProfiles, writeCOrders, writePlatformAdminAccounts, writePlatformAdminRoles, writePlatformAfterSales, writePlatformCommissionRules, writePlatformCommissionSettlementRecords, writePlatformCommissionSettlements, writePlatformEntities, writePlatformJson, writePlatformMedia, writePlatformOrders, writePlatformPromoterAccounts, writePlatformStoreAccounts, writePlatformSupplierAccounts, writePlatformSupplierSettlements, writePricingDefaults, writeShareConfig, writeShareRecords } from '@agritainment/shared'
import { PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY } from '@agritainment/shared'
import { demoAdminExportRecords, seedAdminDemoDataOnce } from '../data/demo-admin'
import { adminRepository } from '../services/repository'
import { buildSupplierQualification, readSupplierQualificationFields } from '../media-dictionary'

interface AdminState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  suppliers: Supplier[]
  supplierAccounts: SupplierAccount[]
  products: Product[]
  cProducts: CProduct[]
  catalogProducts: CatalogProduct[]
  catalogRevision: number
  productSubmissions: CatalogProductSubmission[]
  productSubmissionRevision: number
  pricingDefaults: PricingDefaults
  categories: Category[]
  orders: Order[]
  afterSales: AfterSale[]
  farms: FarmStore[]
  promoters: Promoter[]
  policies: PricePolicy[]
  commissionRules: CommissionRule[]
  lastSettledAt: string
  supplierSettlementRecords: SupplierSettlementRecord[]
  commissionSettlementRecords: CommissionSettlementRecord[]
  dictGroups: DictGroup[]
  dictItems: DictItem[]
  dictionaryRevision: number
  dictionaryUpdatedAt: string
  storeAccounts: StoreAccount[]
  exportRecords: Array<{ id: string; module: string; count: number; createdAt: string }>
  notificationsRead: boolean
  adminRoles: AdminRole[]
  adminAccounts: AdminAccount[]
  auth: { isLoggedIn: boolean; account: string; accountId: string; roleId: string; roleCode: string; name: string }
}

export interface AdminTodo {
  id: string
  type: string
  title: string
  count: number
  route: AdminMenuKey
  priority: 'high' | 'medium' | 'low'
  createdAt: string
  filters?: Record<string, string>
  objectIds?: string[]
}

type AdminTodoItem = {
  id: string
  status?: string
  date?: string
  amount?: number
  trackingNo?: string
  skus?: Array<{ stock: number; warningThreshold?: number }>
  supplierFulfillment?: { shipType?: string; driverId?: string; trackingNo?: string }
}

export function matchesAdminTodoItem(
  todo: Pick<AdminTodo, 'route' | 'filters' | 'objectIds'> | null | undefined,
  route: AdminMenuKey,
  item: AdminTodoItem,
  drivers: Array<{ id: string; status: string }> = []
): boolean {
  if (!todo || todo.route !== route) return true
  if (todo.objectIds?.length && !todo.objectIds.includes(item.id)) return false
  const filters = todo.filters || {}
  if (filters.status === 'active' && !['processing', 'refund-pending', 'return-pending'].includes(item.status || '')) return false
  if (filters.status === 'pending-or-shipping' && !['pending', 'shipping'].includes(item.status || '')) return false
  if (filters.status && !['active', 'pending-or-shipping'].includes(filters.status) && item.status !== filters.status) return false
  if (filters.logistics === 'missing') {
    const fulfillment = item.supplierFulfillment
    const missing = fulfillment?.shipType === 'courier'
      ? !(fulfillment.trackingNo || item.trackingNo)
      : fulfillment?.shipType === 'driver'
        ? !fulfillment.driverId
        : !(item.trackingNo || fulfillment?.trackingNo || fulfillment?.driverId)
    if (!missing) return false
  }
  if (filters.driver === 'invalid') {
    const driverId = item.supplierFulfillment?.driverId
    if (!driverId || drivers.find((driver) => driver.id === driverId)?.status === 'active') return false
  }
  if (filters.stock === 'warning' && !(item.skus || []).some((sku) => catalogSkuNeedsRestock(sku))) return false
  if (filters.expired === 'true' && (!item.date || item.date >= todayString())) return false
  if (filters.amount === 'missing' && Number(item.amount) > 0) return false
  return true
}

/** 商品保存时对比同一 SKU 库存，产出库存变动流水（清单「库存变化记录」）。 */
function buildCatalogStockLogs(current: CatalogState | null, payload: CatalogProduct, operator: string): CatalogStockLogEntry[] {
  const previous = current?.products.find((product) => product.id === payload.id)
  if (!previous) return []
  const createdAt = new Date().toISOString()
  return payload.skus.flatMap((sku) => {
    const before = previous.skus.find((candidate) => candidate.id === sku.id)?.stock
    if (before === undefined || before === sku.stock) return []
    return [{
      id: createId('SL'), productId: payload.id, skuId: sku.id, skuName: sku.name,
      before, after: sku.stock, delta: sku.stock - before, reason: '商品库库存调整', operator, createdAt
    }]
  })
}

function buildAdminTodos(state: Pick<AdminState, 'suppliers' | 'products' | 'productSubmissions' | 'catalogProducts' | 'orders' | 'afterSales' | 'supplierSettlementRecords' | 'commissionSettlementRecords'>): AdminTodo[] {
  const todos: AdminTodo[] = []
  const add = (type: string, title: string, items: Array<{ id: string }>, route: AdminMenuKey, priority: AdminTodo['priority'], createdAt: string, filters?: Record<string, string>) => {
    if (!items.length) return
    todos.push({ id: `todo:${type}`, type, title, count: items.length, route, priority, createdAt: createdAt || new Date(0).toISOString(), filters, objectIds: items.map((item) => item.id) })
  }

  const pendingSuppliers = state.suppliers.filter((item) => item.status === 'pending')
  add('supplier-review', `供应商「${pendingSuppliers[0]?.name}」待审核`, pendingSuppliers, 'suppliers', 'medium', stableAdminCreatedAt([]), { status: 'pending' })
  const pendingProductReviews: Array<{ id: string; productId: string; name: string; createdAt?: string }> = []
  const legacyPendingProducts: Array<{ id: string; name: string }> = []
  const pendingProductIds = new Set<string>()
  state.productSubmissions.filter((item) => item.status === 'pending').forEach((submission) => {
    if (pendingProductIds.has(submission.productId)) return
    pendingProductIds.add(submission.productId)
    pendingProductReviews.push({ id: submission.id, productId: submission.productId, name: submission.draft.name, createdAt: submission.submittedAt })
  })
  state.products.filter((item) => item.status === 'pending').forEach((product) => {
    if (pendingProductIds.has(product.id)) return
    pendingProductIds.add(product.id)
    legacyPendingProducts.push({ id: product.id, name: product.name })
  })
  add('product-review', `商品「${pendingProductReviews[0]?.name}」待审核`, pendingProductReviews, 'products', 'medium', pendingProductReviews[0]?.createdAt || stableAdminCreatedAt([]), { review: 'pending' })
  add('product-review-legacy', `商品「${legacyPendingProducts[0]?.name}」待审核`, legacyPendingProducts, 'products', 'medium', stableAdminCreatedAt([]), { review: 'legacy', status: 'pending' })
  const pendingOrders = state.orders.filter((item) => item.status === 'pending')
  add('pending-shipment', `订单「${pendingOrders[0]?.id} · ${pendingOrders[0]?.productName}」待发货`, pendingOrders, 'orders', 'medium', pendingOrders[0]?.createdAt || '', { status: 'pending' })
  const activeAfterSales = state.afterSales.filter((item) => ['processing', 'refund-pending', 'return-pending'].includes(item.status))
  add('after-sale', `售后「${activeAfterSales[0]?.productName}」待处理`, activeAfterSales, 'afterSales', 'medium', activeAfterSales[0]?.history?.[0]?.time || '', { status: 'active' })

  // 库存预警待办以商品为粒度：count / objectIds 与商品库「仅预警」筛选后的可见行一致。
  const stockWarningProducts = state.catalogProducts.filter((product) => catalogProductStockWarnings(product).length > 0)
  add('stock-warning', `商品「${stockWarningProducts[0]?.name}」库存低于预警阈值`, stockWarningProducts, 'products', 'medium', stableAdminCreatedAt([]), { stock: 'warning' })

  const withdrawals = Object.values(readPlatformWithdrawals() || {}).filter((item) => item.status === 'pending')
  add('withdrawal', `提现「${withdrawals[0]?.requesterId}」待审核`, withdrawals, 'commissions', 'medium', withdrawals[0]?.createdAt || '', { view: 'withdrawals', status: 'pending' })
  const recovery = readPlatformRecoveryQueue().filter((item) => item.status === 'pending')
  add('recovery', `事务「${recovery[0]?.operationId}」待恢复`, recovery, 'dashboard', 'high', recovery[0]?.createdAt || '', { detail: 'todos', type: 'recovery' })

  const failedSupplierSettlements = state.supplierSettlementRecords.filter((item) => item.status === 'failed')
  add('supplier-settlement-failed', `供应商结算「${failedSupplierSettlements[0]?.items[0]?.supplierName || failedSupplierSettlements[0]?.id}」失败`, failedSupplierSettlements, 'commissions', 'high', failedSupplierSettlements[0]?.createdAt || '', { settlementType: 'supplier', status: 'failed' })
  const failedCommissionSettlements = state.commissionSettlementRecords.filter((item) => item.status === 'failed')
  add('commission-settlement-failed', `佣金结算「${failedCommissionSettlements[0]?.items[0]?.promoterName || failedCommissionSettlements[0]?.id}」失败`, failedCommissionSettlements, 'commissions', 'high', failedCommissionSettlements[0]?.createdAt || '', { settlementType: 'commission', status: 'failed' })

  const shippingWithoutLogistics = state.orders.filter((item) => {
    if (item.status !== 'shipping') return false
    const fulfillment = item.supplierFulfillment
    if (fulfillment?.shipType === 'courier') return !(fulfillment.trackingNo || item.trackingNo)
    if (fulfillment?.shipType === 'driver') return !fulfillment.driverId
    return !(item.trackingNo || fulfillment?.trackingNo || fulfillment?.driverId)
  })
  add('shipping-logistics-missing', `配送订单「${shippingWithoutLogistics[0]?.id} · ${shippingWithoutLogistics[0]?.productName}」缺少物流关联`, shippingWithoutLogistics, 'orders', 'high', shippingWithoutLogistics[0]?.createdAt || '', { status: 'shipping', logistics: 'missing' })

  const drivers = new Map((readPlatformDrivers() || []).map((driver) => [driver.id, driver]))
  const invalidDriverOrders = state.orders.filter((item) => {
    const driverId = item.supplierFulfillment?.driverId
    if (!driverId || !['pending', 'shipping'].includes(item.status)) return false
    return drivers.get(driverId)?.status !== 'active'
  })
  add('driver-reference-invalid', `配送订单「${invalidDriverOrders[0]?.id} · ${invalidDriverOrders[0]?.productName}」司机不可用`, invalidDriverOrders, 'orders', 'high', invalidDriverOrders[0]?.createdAt || '', { status: 'pending-or-shipping', driver: 'invalid' })

  const refundFailed = state.afterSales.filter((item) => item.status === 'refund-failed')
  add('after-sale-refund-failed', `售后「${refundFailed[0]?.productName}」退款失败`, refundFailed, 'afterSales', 'high', refundFailed[0]?.history?.[0]?.time || '', { status: 'refund-failed' })

  return todos.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority] || b.createdAt.localeCompare(a.createdAt))
}

type FarmSavePayload = {
  name: string
  contact?: string
  contactPhone?: string
  region?: string
  address?: string
  city?: string
  districtCode?: string
  detail?: string
  tags?: string[]
  rating?: number
  averageSpend?: number
  status?: FarmStore['status']
  image?: BusinessMediaValue | null
  forceGeocode?: boolean
}

type FarmGeocoder = (request: GeocodeRequest) => Promise<GeocodeResult>

type AdminAuditContext = {
  module: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: unknown
  deniedMessage?: string
  validationMessage?: string
  requiresSuperAdmin?: boolean
  actor?: { id: string; name?: string; role?: string }
}

type AdminActionExecution<T> = { ok: true; value: T } | { ok: false; error: string }

type AdminTransactionInput = {
  operationId: string
  collections: string[]
  original: unknown
  target: unknown
  recoveryHandlerKey?: PlatformRecoveryHandlerKey
  recoverySchema?: string
  revisionChecks?: Array<{ key: string; expectedRevision: number }>
  validate?: () => boolean
  validateInLock?: () => boolean
  auditResult?: 'success' | 'failure'
  auditReason?: string
  steps: PlatformTransactionStep[]
}

export const ADMIN_PERMISSION_GROUPS: Array<{ key: AdminMenuKey; label: string; permissions: Array<{ code: AdminPermissionCode; label: string }> }> = [
  { key: 'reports', label: '经营报表', permissions: [{ code: 'report.export', label: '导出经营报表' }] },
  { key: 'suppliers', label: '供应商管理', permissions: [{ code: 'supplier.create', label: '新增供应商' }, { code: 'supplier.update', label: '修改供应商' }, { code: 'supplier.audit', label: '审核供应商' }, { code: 'supplier.pause', label: '暂停合作' }, { code: 'supplier.account.update', label: '修改供应商账号' }, { code: 'supplier.account.freeze', label: '冻结供应商账号' }] },
  { key: 'products', label: '商品库管理', permissions: [{ code: 'product.create', label: '新增商品' }, { code: 'product.update', label: '修改商品' }, { code: 'product.audit', label: '审核商品' }, { code: 'product.status', label: '上下架商品' }] },
  { key: 'categories', label: '品类管理', permissions: [{ code: 'category.manage', label: '维护品类' }] },
  { key: 'prices', label: '价格体系', permissions: [{ code: 'price.manage', label: '维护价格策略' }] },
  { key: 'orders', label: '订单管理', permissions: [{ code: 'order.ship', label: '订单发货' }, { code: 'order.confirm', label: '确认收货' }] },
  { key: 'afterSales', label: '售后管理', permissions: [{ code: 'afterSale.manage', label: '处理售后' }] },
  { key: 'farms', label: '门店管理', permissions: [{ code: 'farm.manage', label: '维护门店' }, { code: 'storeAccount.manage', label: '维护门店账号' }] },
  { key: 'promoters', label: '业务员管理', permissions: [{ code: 'promoter.manage', label: '维护业务员' }] },
  { key: 'commissions', label: '佣金结算', permissions: [{ code: 'commission.manage', label: '执行结算' }, { code: 'withdrawal.review', label: '审核提现' }] },
  { key: 'users', label: '用户信息', permissions: [{ code: 'user.view', label: '查看用户信息' }] },
  { key: 'leaders', label: '团长管理', permissions: [{ code: 'leader.manage', label: '维护团长' }, { code: 'leader.price.manage', label: '维护团长价格' }, { code: 'leader.withdrawal.review', label: '审核团长提现' }] },
  { key: 'dict', label: '字典数据', permissions: [{ code: 'dictionary.manage', label: '维护字典' }] },
  { key: 'logs', label: '操作日志', permissions: [{ code: 'audit.export', label: '导出操作日志' }] },
  { key: 'dashboard', label: '恢复中心', permissions: [{ code: 'recovery.resolve', label: '处理恢复任务' }] },
  { key: 'roles', label: '角色管理', permissions: [{ code: 'admin.role.create', label: '新增角色' }, { code: 'admin.role.update', label: '修改角色' }, { code: 'admin.role.permissions', label: '分配角色权限' }] },
  { key: 'accounts', label: '账号管理', permissions: [{ code: 'admin.account.create', label: '新增后台账号' }, { code: 'admin.account.update', label: '修改后台账号' }, { code: 'admin.account.status', label: '启停后台账号' }] }
]

const ADMIN_PERMISSION_MENU = new Map(ADMIN_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => [permission.code, group.key] as const)))

function rolePermissionsForMenus(menuPermissions: AdminMenuKey[], actionPermissions: AdminPermissionCode[]): AdminPermissionCode[] {
  const menus = new Set(menuPermissions)
  return [...new Set(actionPermissions)].filter((permission) => {
    const owner = ADMIN_PERMISSION_MENU.get(permission)
    return !!owner && menus.has(owner)
  })
}

type AdminRecoveryAuditSnapshot = { auditAction?: string; auditResult?: 'success' | 'failure'; auditLogs?: unknown[] }

type AdminRecoveryRevisionToken = Record<string, number>
type AdminRecoveryWriteStep = { apply: () => boolean; rollback: () => boolean }

function isAdminRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readStableAdminRecoverySnapshot<T extends object>(keys: readonly string[], read: () => T | null): { snapshot: T; token: AdminRecoveryRevisionToken } | null {
  const token = Object.fromEntries(keys.map((key) => [key, readPlatformCollectionRevision(key)]))
  const snapshot = read()
  if (!snapshot || keys.some((key) => readPlatformCollectionRevision(key) !== token[key])) return null
  return { snapshot, token }
}

function adminRecoveryRevisionsStillMatch(token: AdminRecoveryRevisionToken): boolean {
  return Object.entries(token).every(([key, revision]) => readPlatformCollectionRevision(key) === revision)
}

function executeAdminRecoveryWrites(steps: AdminRecoveryWriteStep[]): boolean {
  const applied: AdminRecoveryWriteStep[] = []
  for (const step of steps) {
    let ok = false
    try { ok = step.apply() } catch { ok = false }
    if (ok) {
      applied.push(step)
      continue
    }
    for (const completed of [...applied, step].reverse()) {
      try { completed.rollback() } catch { /* failed rollback leaves the task pending */ }
    }
    return false
  }
  return true
}

function readAdminRecoveryAuditSnapshot(template: AdminRecoveryAuditSnapshot): AdminRecoveryAuditSnapshot {
  const snapshot: AdminRecoveryAuditSnapshot = {}
  if ('auditLogs' in template) snapshot.auditLogs = template.auditLogs
  else if ('auditAction' in template) snapshot.auditAction = template.auditAction
  if ('auditResult' in template) snapshot.auditResult = template.auditResult
  return snapshot
}

function hasMatchingAdminRecoveryAudit(original: Record<string, unknown>, target: Record<string, unknown>): boolean {
  return (['auditAction', 'auditResult', 'auditLogs'] as const).every((field) => {
    if ((field in original) !== (field in target)) return false
    return JSON.stringify(original[field]) === JSON.stringify(target[field])
  })
}

function normalizeLegacyAdminRecoveryAudit(original: Record<string, unknown>, target: Record<string, unknown>): void {
  if ('auditLogs' in original && !('auditLogs' in target)) target.auditLogs = cloneSeed(original.auditLogs)
  if ('auditAction' in original && !('auditAction' in target)) target.auditAction = original.auditAction
  if ('auditResult' in original && !('auditResult' in target)) target.auditResult = original.auditResult
}

function removeAdminTransactionAudit(operationId: string, action?: string, result: 'success' | 'failure' = 'success'): boolean {
  if (!operationId?.trim()) return false
  const revision = readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  const logs = readPlatformAuditLogs()
  const next = logs.filter((entry) => !(entry.operationId === operationId && entry.result === result && (!action || entry.action === action)))
  return next.length === logs.length || writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, next, revision)
}

function recoveryAuditAction(original: AdminRecoveryAuditSnapshot, fallback?: string): string | undefined {
  return original.auditAction?.trim() || fallback
}

function recoveryAuditResult(original: AdminRecoveryAuditSnapshot): 'success' | 'failure' {
  return original.auditResult === 'failure' ? 'failure' : 'success'
}

function stableAdminSourceHash(ids: string[]): string {
  let hash = 2166136261
  for (const char of [...ids].sort().join('\u001f')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).toUpperCase()
}

function stableAdminCreatedAt(values: string[]): string {
  return [...values].filter(Boolean).sort().at(-1) || new Date(0).toISOString()
}

type AdminCommissionRuleRecoverySnapshot = { rules: CommissionRule[] } & AdminRecoveryAuditSnapshot
type AdminSupplierSettlementRecoverySnapshot = { orders: Record<string, Order>; settlements: Record<string, SupplierSettlementRecord> } & AdminRecoveryAuditSnapshot
type AdminCommissionSettlementRecoverySnapshot = {
  settlements: Record<string, { commission: number; settled: boolean; settledAt?: string }>
  shares: NonNullable<ReturnType<typeof readShareRecords>>
  history: Record<string, CommissionSettlementRecord>
} & AdminRecoveryAuditSnapshot

type AdminAfterSaleRecoverySnapshot = {
  afterSales?: Record<string, AfterSale>
  catalog?: CatalogState
  cOrders?: Record<string, COrder>
  commissions?: CCommissionAllocation[]
  platformOrders?: Record<string, Order>
  receipt?: { operationId: string; refundId: string }
} & AdminRecoveryAuditSnapshot

function readAfterSaleRecoverySnapshot(original: AdminAfterSaleRecoverySnapshot): AdminAfterSaleRecoverySnapshot {
  const snapshot: AdminAfterSaleRecoverySnapshot = { afterSales: readPlatformAfterSales() || {} }
  if ('catalog' in original) snapshot.catalog = readCatalogState() || undefined
  if ('cOrders' in original) snapshot.cOrders = readCOrders() || {}
  if ('commissions' in original) snapshot.commissions = readCCommissionRecords() || []
  if ('platformOrders' in original) snapshot.platformOrders = readPlatformOrders() || {}
  Object.assign(snapshot, readAdminRecoveryAuditSnapshot(original))
  if ('receipt' in original) snapshot.receipt = cloneSeed(original.receipt)
  return snapshot
}

function adminRecoveryAuditWriteSteps(journal: PlatformJournalEntry): AdminRecoveryWriteStep[] {
  if (journal.status === 'committed') return []
  const original = journal.original as AdminRecoveryAuditSnapshot
  return [{
    apply: () => removeAdminTransactionAudit(journal.operationId, recoveryAuditAction(original), recoveryAuditResult(original)),
    rollback: () => true
  }]
}

function validAdminRecoveryJournal(journal: PlatformJournalEntry, schema: string, validate: (snapshot: Record<string, unknown>) => boolean): boolean {
  if (journal.recoverySchema !== schema || !isAdminRecord(journal.original) || !isAdminRecord(journal.target)) return false
  normalizeLegacyAdminRecoveryAudit(journal.original, journal.target)
  return validate(journal.original) && validate(journal.target) && hasMatchingAdminRecoveryAudit(journal.original, journal.target)
}

const adminCommissionRuleRecovery = createStrictSnapshotRecoveryHandlerRegistration<AdminCommissionRuleRecoverySnapshot, AdminRecoveryRevisionToken>({
  key: 'admin-commission-rule-v1',
  fields: ['rules', 'auditAction', 'auditResult', 'auditLogs'],
  validateJournal: (journal) => validAdminRecoveryJournal(journal, 'admin-commission-rule-snapshot-v1', (snapshot) => Array.isArray(snapshot.rules)),
  readStable: (journal) => readStableAdminRecoverySnapshot([PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], () => ({
    rules: readPlatformCommissionRules() || [],
    ...readAdminRecoveryAuditSnapshot(journal.original as AdminRecoveryAuditSnapshot)
  })),
  isStillStable: adminRecoveryRevisionsStillMatch,
  writeSnapshot: (snapshot, rollback, journal) => executeAdminRecoveryWrites([
    { apply: () => writePlatformCommissionRules(snapshot.rules), rollback: () => writePlatformCommissionRules(rollback.rules) },
    ...adminRecoveryAuditWriteSteps(journal)
  ])
})

const adminSupplierSettlementRecovery = createStrictSnapshotRecoveryHandlerRegistration<AdminSupplierSettlementRecoverySnapshot, AdminRecoveryRevisionToken>({
  key: 'admin-supplier-settlement-v1',
  fields: ['orders', 'settlements', 'auditAction', 'auditResult', 'auditLogs'],
  validateJournal: (journal) => validAdminRecoveryJournal(journal, 'admin-supplier-settlement-snapshot-v1', (snapshot) => isAdminRecord(snapshot.orders) && isAdminRecord(snapshot.settlements)),
  readStable: (journal) => readStableAdminRecoverySnapshot([PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], () => ({
    orders: readPlatformOrders() || {},
    settlements: readPlatformSupplierSettlements() || {},
    ...readAdminRecoveryAuditSnapshot(journal.original as AdminRecoveryAuditSnapshot)
  })),
  isStillStable: adminRecoveryRevisionsStillMatch,
  writeSnapshot: (snapshot, rollback, journal) => executeAdminRecoveryWrites([
    { apply: () => writePlatformOrders(snapshot.orders), rollback: () => writePlatformOrders(rollback.orders) },
    { apply: () => writePlatformSupplierSettlements(snapshot.settlements), rollback: () => writePlatformSupplierSettlements(rollback.settlements) },
    ...adminRecoveryAuditWriteSteps(journal)
  ])
})

const adminCommissionSettlementRecovery = createStrictSnapshotRecoveryHandlerRegistration<AdminCommissionSettlementRecoverySnapshot, AdminRecoveryRevisionToken>({
  key: 'admin-commission-settlement-v1',
  fields: ['settlements', 'shares', 'history', 'auditAction', 'auditResult', 'auditLogs'],
  validateJournal: (journal) => validAdminRecoveryJournal(journal, 'admin-commission-settlement-snapshot-v1', (snapshot) => isAdminRecord(snapshot.settlements) && Array.isArray(snapshot.shares) && isAdminRecord(snapshot.history)),
  readStable: (journal) => readStableAdminRecoverySnapshot([PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], () => ({
    settlements: readPlatformCommissionSettlements(),
    shares: readShareRecords() || [],
    history: readPlatformCommissionSettlementRecords() || {},
    ...readAdminRecoveryAuditSnapshot(journal.original as AdminRecoveryAuditSnapshot)
  })),
  isStillStable: adminRecoveryRevisionsStillMatch,
  writeSnapshot: (snapshot, rollback, journal) => executeAdminRecoveryWrites([
    { apply: () => writePlatformCommissionSettlements(snapshot.settlements), rollback: () => writePlatformCommissionSettlements(rollback.settlements) },
    { apply: () => writeShareRecords(snapshot.shares), rollback: () => writeShareRecords(rollback.shares) },
    { apply: () => writePlatformCommissionSettlementRecords(snapshot.history), rollback: () => writePlatformCommissionSettlementRecords(rollback.history) },
    ...adminRecoveryAuditWriteSteps(journal)
  ])
})

const adminAfterSaleRecovery = createStrictSnapshotRecoveryHandlerRegistration<AdminAfterSaleRecoverySnapshot, AdminRecoveryRevisionToken>({
  key: 'admin-after-sale-v1',
  fields: ['afterSales', 'catalog', 'cOrders', 'commissions', 'platformOrders', 'auditAction', 'auditResult', 'auditLogs', 'receipt'],
  validateJournal: (journal) => {
    if (!['admin-after-sale-snapshot-v1', 'admin-after-sale-snapshot-v2', 'admin-after-sale-refund-receipt-v1'].includes(journal.recoverySchema || '')
      || !isAdminRecord(journal.original) || !isAdminRecord(journal.target)) return false
    normalizeLegacyAdminRecoveryAudit(journal.original, journal.target)
    return [journal.original, journal.target].every((snapshot) => isAdminRecord(snapshot.afterSales)
        && (!('catalog' in snapshot) || isAdminRecord(snapshot.catalog))
        && (!('cOrders' in snapshot) || isAdminRecord(snapshot.cOrders))
        && (!('commissions' in snapshot) || Array.isArray(snapshot.commissions))
        && (!('platformOrders' in snapshot) || isAdminRecord(snapshot.platformOrders))
        && (!('receipt' in snapshot) || isAdminRecord(snapshot.receipt) && typeof snapshot.receipt.operationId === 'string' && typeof snapshot.receipt.refundId === 'string'))
      && hasMatchingAdminRecoveryAudit(journal.original, journal.target)
  },
  readStable: (journal) => {
    const original = journal.original as AdminAfterSaleRecoverySnapshot
    const keys = [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
    if ('catalog' in original) keys.push(PLATFORM_CATALOG_STORAGE_KEY)
    if ('cOrders' in original) keys.push(PLATFORM_C_ORDERS_STORAGE_KEY)
    if ('commissions' in original) keys.push(PLATFORM_C_COMMISSIONS_STORAGE_KEY)
    if ('platformOrders' in original) keys.push(PLATFORM_ORDERS_STORAGE_KEY)
    return readStableAdminRecoverySnapshot(keys, () => {
      const snapshot = readAfterSaleRecoverySnapshot(original)
      return 'catalog' in original && !snapshot.catalog ? null : snapshot
    })
  },
  isStillStable: adminRecoveryRevisionsStillMatch,
  writeSnapshot: (snapshot, rollback, journal) => {
    const steps: AdminRecoveryWriteStep[] = [
      { apply: () => writePlatformAfterSales(snapshot.afterSales || {}), rollback: () => writePlatformAfterSales(rollback.afterSales || {}) }
    ]
    if ('catalog' in snapshot) steps.push({ apply: () => !!snapshot.catalog && writeCatalogState(snapshot.catalog), rollback: () => !!rollback.catalog && writeCatalogState(rollback.catalog) })
    if ('cOrders' in snapshot) steps.push({ apply: () => writeCOrders(snapshot.cOrders || {}), rollback: () => writeCOrders(rollback.cOrders || {}) })
    if ('commissions' in snapshot) steps.push({ apply: () => writeCCommissionRecords(snapshot.commissions || []), rollback: () => writeCCommissionRecords(rollback.commissions || []) })
    if ('platformOrders' in snapshot) steps.push({ apply: () => writePlatformOrders(snapshot.platformOrders || {}), rollback: () => writePlatformOrders(rollback.platformOrders || {}) })
    return executeAdminRecoveryWrites([...steps, ...adminRecoveryAuditWriteSteps(journal)])
  }
})

const ADMIN_FAILURE_AUDIT_HANDLER_KEY = 'admin-failure-audit-v1' as const
const ADMIN_FAILURE_AUDIT_FIELDS = ['id', 'module', 'action', 'actorId', 'actorName', 'actorRole', 'targetType', 'targetId', 'result', 'reason', 'operationId', 'createdAt'] as const

function validAdminFailureAuditEntry(value: unknown): value is PlatformAuditLogEntry {
  if (!isAdminRecord(value) || Object.keys(value).some((key) => !(ADMIN_FAILURE_AUDIT_FIELDS as readonly string[]).includes(key))) return false
  if (value.result !== 'failure' || typeof value.id !== 'string' || typeof value.createdAt !== 'string' || typeof value.module !== 'string'
    || typeof value.action !== 'string' || typeof value.actorId !== 'string' || typeof value.operationId !== 'string') return false
  const sanitized = createPlatformAuditLogEntry({
    module: value.module,
    action: value.action,
    actorId: value.actorId,
    actorName: typeof value.actorName === 'string' ? value.actorName : undefined,
    actorRole: typeof value.actorRole === 'string' ? value.actorRole : undefined,
    targetType: typeof value.targetType === 'string' ? value.targetType : undefined,
    targetId: typeof value.targetId === 'string' ? value.targetId : undefined,
    result: 'failure',
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    operationId: value.operationId
  })
  return !!sanitized && ADMIN_FAILURE_AUDIT_FIELDS
    .filter((key) => key !== 'id' && key !== 'createdAt')
    .every((key) => JSON.stringify(sanitized[key]) === JSON.stringify(value[key]))
}

const adminFailureAuditRecovery = createPlatformProductionRecoveryHandlerRegistration(ADMIN_FAILURE_AUDIT_HANDLER_KEY, {
  execute: (task, journal) => {
    if (task.handlerKey !== ADMIN_FAILURE_AUDIT_HANDLER_KEY || journal.recoverySchema !== ADMIN_FAILURE_AUDIT_HANDLER_KEY
      || journal.original !== null || !validAdminFailureAuditEntry(journal.target)) return false
    const target = journal.target
    const logs = readPlatformAuditLogs()
    if (logs.some((entry) => JSON.stringify(entry) === JSON.stringify(target))) return true
    return writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, [target, ...logs].slice(0, 1000))
  },
  readSnapshot: (task, journal) => task.handlerKey === ADMIN_FAILURE_AUDIT_HANDLER_KEY && validAdminFailureAuditEntry(journal.target)
    && readPlatformAuditLogs().some((entry) => JSON.stringify(entry) === JSON.stringify(journal.target)) ? journal.target : null
})

function recoverAdminFailureAudit(input: Omit<PlatformAuditLogEntry, 'id' | 'createdAt'>): Extract<WriteResult, { ok: false }> | null {
  if (appendPlatformAuditLog(input)) return null
  const created = createPlatformAuditLogEntry({ ...input, metadata: undefined })
  if (!created) return { ok: false, code: 'audit_recovery_required', message: '失败审计待恢复，且恢复快照无法生成', operationId: input.operationId, recoveryQueued: false, fatal: true }
  const { metadata: _metadata, ...target } = created
  const recoveryOperationId = `${input.operationId || createId('OP-ADMIN')}:failure-audit`
  const journalReady = preparePlatformJournal({
    operationId: recoveryOperationId,
    collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY],
    original: null,
    target,
    recoveryHandlerKey: ADMIN_FAILURE_AUDIT_HANDLER_KEY,
    recoverySchema: ADMIN_FAILURE_AUDIT_HANDLER_KEY
  }) && resolvePlatformJournal(recoveryOperationId, 'recovery-pending')
  const recoveryQueued = journalReady && enqueuePlatformRecovery({
    operationId: recoveryOperationId,
    failedStep: 'failure-audit',
    reason: 'admin failure audit append failed',
    handlerKey: ADMIN_FAILURE_AUDIT_HANDLER_KEY
  })
  return {
    ok: false,
    code: 'audit_recovery_required',
    message: recoveryQueued ? '操作失败，失败审计待恢复' : '操作失败，失败审计待恢复且恢复任务保存失败',
    operationId: input.operationId,
    failedStep: 'failure-audit',
    recoveryQueued,
    fatal: !recoveryQueued
  }
}

initializePlatformRecoveryHandlers([
  createCatalogProductReviewRecoveryHandlerRegistration(),
  adminCommissionRuleRecovery,
  adminSupplierSettlementRecovery,
  adminCommissionSettlementRecovery,
  adminAfterSaleRecovery,
  adminFailureAuditRecovery,
  ...createUserAtomicRecoveryHandlerRegistrations()
])

const ADMIN_REFUND_COLLECTIONS = [
  PLATFORM_AFTERSALES_STORAGE_KEY,
  PLATFORM_CATALOG_STORAGE_KEY,
  PLATFORM_C_ORDERS_STORAGE_KEY,
  PLATFORM_C_COMMISSIONS_STORAGE_KEY,
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_AUDIT_LOG_STORAGE_KEY
] as const

type AdminRefundContext = {
  work: AfterSale
  cOrder: COrder & { providerTransactionId: string }
  subOrder: COrder['subOrders'][number]
  supplierOrder: Order
  amount: number
}

function readStableAdminRefundSnapshot(): { snapshot: AdminAfterSaleRecoverySnapshot; token: AdminRecoveryRevisionToken } | null {
  return readStableAdminRecoverySnapshot(ADMIN_REFUND_COLLECTIONS, () => {
    const catalog = readCatalogState()
    if (!catalog) return null
    return {
      afterSales: cloneSeed(readPlatformAfterSales() || {}),
      catalog: cloneSeed(catalog),
      cOrders: cloneSeed(readCOrders() || {}),
      commissions: cloneSeed(readCCommissionRecords() || []),
      platformOrders: cloneSeed(readPlatformOrders() || {})
    }
  })
}

function resolveAdminRefundContext(snapshot: AdminAfterSaleRecoverySnapshot, id: string): { ok: true; value: AdminRefundContext } | { ok: false; message: string } {
  const work = snapshot.afterSales?.[id]
  if (!work) return { ok: false, message: '售后工单不存在，请刷新后重试' }
  if (!['refund-pending', 'return-pending', 'refund-failed', 'refunded'].includes(work.status)) return { ok: false, message: '售后状态已更新，请刷新后重试' }
  const cOrder = snapshot.cOrders?.[work.masterOrderId || work.orderId]
  if (!cOrder) return { ok: false, message: '售后主订单关联缺失，请在恢复中心核验' }
  if (!cOrder.providerTransactionId) return { ok: false, message: '原支付交易号缺失，请在恢复中心核验' }
  const subOrder = cOrder.subOrders.find((item) => item.id === work.subOrderId)
  if (!subOrder) return { ok: false, message: '售后子订单关联缺失，请在恢复中心核验' }
  const supplierOrder = work.supplierOrderId ? snapshot.platformOrders?.[work.supplierOrderId] : undefined
  if (!supplierOrder) return { ok: false, message: '售后供应商订单关联缺失，请在恢复中心核验' }
  if (!snapshot.catalog) return { ok: false, message: '商品库存快照缺失，请在恢复中心核验' }
  if (subOrder.items.some((item) => !snapshot.catalog!.products.find((product) => product.id === item.productId)?.skus.some((sku) => sku.id === item.skuId))) {
    return { ok: false, message: '退款库存关联缺失，请在恢复中心核验' }
  }
  const amount = round2(work.refundAmount ?? work.amount ?? 0)
  if (amount <= 0) return { ok: false, message: '退款金额无效，请核验售后工单' }
  return { ok: true, value: { work, cOrder: cOrder as COrder & { providerTransactionId: string }, subOrder, supplierOrder, amount } }
}

function buildAdminRefundTarget(snapshot: AdminAfterSaleRecoverySnapshot, id: string, refundId: string, now: string, operator: string): AdminAfterSaleRecoverySnapshot | null {
  const resolved = resolveAdminRefundContext(snapshot, id)
  if (!resolved.ok) return null
  const target = cloneSeed(snapshot)
  const work = target.afterSales![id]
  const cOrder = target.cOrders![resolved.value.cOrder.id]
  const subOrder = cOrder.subOrders.find((item) => item.id === resolved.value.subOrder.id)!
  const supplierOrder = target.platformOrders![resolved.value.supplierOrder.id]
  const alreadyRefunded = work.status === 'refunded' && work.providerRefundId === refundId

  if (!subOrder.inventoryReleased) {
    for (const item of subOrder.items) {
      const sku = target.catalog!.products.find((product) => product.id === item.productId)!.skus.find((candidate) => candidate.id === item.skuId)!
      sku.stock += item.quantity
    }
    target.catalog!.revision += 1
  }
  subOrder.inventoryReleased = true
  if (subOrder.afterSale) subOrder.afterSale.status = 'completed'
  cOrder.commissionAllocations = cOrder.commissionAllocations.map((commission) => commission.subOrderId === subOrder.id ? { ...commission, status: 'reversed' as const } : commission)
  cOrder.status = deriveCOrderStatus(cOrder.subOrders)
  target.commissions = target.commissions!.map((commission) => commission.orderId === cOrder.id && commission.subOrderId === subOrder.id ? { ...commission, status: 'reversed' as const } : commission)
  target.platformOrders![supplierOrder.id] = {
    ...supplierOrder,
    status: 'after-sale',
    flow: alreadyRefunded ? supplierOrder.flow : [...(supplierOrder.flow || []), { time: now, action: work.status === 'return-pending' ? '退货确认并完成退款' : '退款完成', operator }]
  }
  target.afterSales![id] = {
    ...work,
    status: 'refunded',
    providerRefundId: refundId,
    history: alreadyRefunded ? work.history : [...(work.history || []), { time: now, action: work.status === 'return-pending' ? '退货确认，退款完成' : '退款完成', operator }]
  }
  delete target.afterSales![id].failureReason
  return target
}

function removePendingAdminRecovery(operationId: string, failedStep: string): boolean {
  const queue = readPlatformRecoveryQueue()
  const next = queue.filter((task) => !(task.operationId === operationId && task.failedStep === failedStep && task.status === 'pending'))
  return next.length === queue.length || writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, next)
}

async function persistAdminRefundReceiptRecovery(input: {
  id: string
  operationId: string
  refundId: string
  now: string
  operator: string
  fallbackOriginal: AdminAfterSaleRecoverySnapshot
  fallbackTarget: AdminAfterSaleRecoverySnapshot
}): Promise<boolean> {
  const existing = readPlatformJournal()[input.operationId]
  if (existing) {
    if (existing.recoveryHandlerKey !== 'admin-after-sale-v1') return false
    if (existing.status === 'aborted' && !resolvePlatformJournal(input.operationId, 'recovery-pending')) return false
    const pending = readPlatformRecoveryQueue().some((task) => task.operationId === input.operationId && task.status === 'pending')
    if (!pending && !enqueuePlatformRecovery({ operationId: input.operationId, failedStep: 'provider-receipt', reason: 'refund provider succeeded before local persistence completed', handlerKey: 'admin-after-sale-v1' })) return false
    return resolvePlatformJournal(input.operationId, 'committed')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stable = readStableAdminRefundSnapshot()
    if (!stable) continue
    const latestTarget = buildAdminRefundTarget(stable.snapshot, input.id, input.refundId, input.now, input.operator)
    const receipt = { operationId: input.operationId, refundId: input.refundId }
    const original = latestTarget
      ? { ...stable.snapshot, auditAction: 'after-sale.refund', receipt }
      : { ...input.fallbackOriginal, auditAction: 'after-sale.refund', receipt }
    const target = latestTarget
      ? { ...latestTarget, auditAction: 'after-sale.refund', receipt }
      : { ...input.fallbackTarget, auditAction: 'after-sale.refund', receipt }
    const result = await runLockedPlatformTransaction<void>({
      operationId: input.operationId,
      collections: [...ADMIN_REFUND_COLLECTIONS],
      original,
      target,
      recoveryHandlerKey: 'admin-after-sale-v1',
      recoverySchema: 'admin-after-sale-refund-receipt-v1',
      revisionChecks: Object.entries(stable.token).map(([key, expectedRevision]) => ({ key, expectedRevision })),
      steps: [
        { key: 'provider-receipt', apply: () => true, rollback: () => true },
        {
          key: 'provider-recovery-queue',
          apply: () => enqueuePlatformRecovery({ operationId: input.operationId, failedStep: 'provider-receipt', reason: 'refund provider succeeded before local revision conflict', handlerKey: 'admin-after-sale-v1' }),
          rollback: () => removePendingAdminRecovery(input.operationId, 'provider-receipt')
        }
      ]
    })
    if (result.ok) return true
    if (result.code !== 'revision_conflict') return false
  }
  return false
}

function restoreRawPlatformCollection(key: string, snapshot: unknown): boolean {
  if (snapshot !== null) return writePlatformJson(key, snapshot)
  clearPlatformJson(key)
  return readPlatformJson(key) === null
}

const geocodeEnvironment = import.meta.env as Record<string, string | undefined>
const defaultFarmGeocoder: FarmGeocoder = (request) => geocodeAddress(request, createGeocodeProviders({
  tencentProxy: geocodeEnvironment.VITE_TENCENT_MAP_GATEWAY || '/api/tencent-map/geocode'
}))

function resolveFarmAddress(payload: FarmSavePayload, current?: FarmStore): { address: string; city: string; region: string; regionCode?: string; structuredAddress?: FarmAdministrativeAddress } | null {
  if (payload.districtCode || payload.detail) {
    if (!payload.districtCode || !payload.detail) return null
    try {
      const structuredAddress = buildFarmAdministrativeAddress(payload.districtCode, payload.detail)
      return { address: formatFarmAdministrativeAddress(structuredAddress), city: structuredAddress.city, region: structuredAddress.district, regionCode: structuredAddress.districtCode, structuredAddress }
    } catch {
      return null
    }
  }
  const address = payload.address?.trim() || ''
  if (!address) return null
  return { address, city: payload.city?.trim() || current?.city || '', region: payload.region?.trim() || current?.region || '待补充', regionCode: current?.regionCode, structuredAddress: current?.structuredAddress }
}

async function updateFarmCoordinates(farm: FarmStore, geocode: FarmGeocoder): Promise<void> {
  delete farm.location
  delete farm.locationError
  farm.locationStatus = 'pending'
  const result = await geocode({ address: farm.address, city: farm.city })
  farm.locationStatus = result.status
  if (result.status === 'resolved') {
    if (!/^\d{6}$/.test(result.location.adCode) || (farm.regionCode && result.location.adCode !== farm.regionCode)) {
      farm.locationStatus = 'failed'
      farm.locationError = 'REGION_MISMATCH'
      return
    }
    farm.location = result.location
  } else {
    farm.locationError = result.reason || 'REQUEST_FAILED'
  }
}

export const useAdminStore = defineStore('operations', {
  state: (): AdminState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    suppliers: [],
    supplierAccounts: [],
    products: [],
    cProducts: [],
    catalogProducts: [],
    catalogRevision: 0,
    productSubmissions: [],
    productSubmissionRevision: 0,
    pricingDefaults: { ...DEFAULT_PRICING_DEFAULTS },
    categories: [],
    orders: [],
    afterSales: [],
    farms: [],
    promoters: [],
    policies: [],
    commissionRules: [],
    lastSettledAt: '',
    supplierSettlementRecords: [],
    commissionSettlementRecords: [],
    dictGroups: [],
    dictItems: [],
    dictionaryRevision: 0,
    dictionaryUpdatedAt: new Date(0).toISOString(),
    storeAccounts: [],
    exportRecords: [],
    notificationsRead: false,
    adminRoles: [],
    adminAccounts: [],
    auth: { isLoggedIn: false, account: '', accountId: '', roleId: '', roleCode: '', name: '' }
  }),
  getters: {
    pendingSuppliers: (state) => state.suppliers.filter((item) => item.status === 'pending').length,
    pendingProducts: (state) => new Set([
      ...state.products.filter((item) => item.status === 'pending').map((item) => item.id),
      ...state.productSubmissions.filter((item) => item.status === 'pending').map((item) => item.productId)
    ]).size,
    pendingOrders: (state) => state.orders.filter((item) => item.status === 'pending').length,
    pendingAfterSales: (state) => state.afterSales.filter((item) => !['refunded', 'rejected', 'refund-failed'].includes(item.status)).length,
    pendingWithdrawals: () => Object.values(readPlatformWithdrawals() || {}).filter((item) => item.status === 'pending').length,
    pendingRecovery: () => readPlatformRecoveryQueue().filter((item) => item.status === 'pending').length,
    pendingTodos(state): number {
      return buildAdminTodos(state).reduce((sum, todo) => sum + todo.count, 0)
    },
    totalCommission: () => pendingShareTotal(),
    totalGmv: (state) => round2(state.orders.reduce((sum, item) => sum + item.amount, 0)),
    activeFarmCount: (state) => state.farms.filter((item) => item.status === 'active').length,
    activeSupplierCount: (state) => state.suppliers.filter((item) => item.status === 'cooperating').length,
    shippedOrderCount: (state) => state.orders.filter((item) => item.status === 'shipping' || item.status === 'delivered').length,
    hotProducts: (state) => [...state.products].sort((a, b) => b.sales - a.sales).slice(0, 5),
    dailyTrend: (state) => {
      const latest = state.orders.reduce((value, order) => Math.max(value, new Date(order.createdAt.replace(' ', 'T')).getTime() || 0), 0) || Date.now()
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(latest)
        date.setDate(date.getDate() - (6 - index))
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const orders = state.orders.filter((order) => order.createdAt.startsWith(key))
        return { key, label: `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')}`, amount: round2(orders.reduce((sum, order) => sum + order.amount, 0)), count: orders.length }
      })
    }
  },
  actions: {
    queryAdminTodos(): AdminTodo[] {
      return buildAdminTodos(this)
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && (this.suppliers.length > 0 || this.products.length > 0 || this.orders.length > 0)
      this.loading = true
      this.error = ''
      try {
        initializePlatformRecoveryHandlers([createCatalogProductReviewRecoveryHandlerRegistration()])
        const productReviewReconciliation = reconcilePendingPlatformTransactions({ handlerKey: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY })
        if (!productReviewReconciliation.ok) throw new Error(productReviewReconciliation.message)
        seedCCommerceData()
        if (!seedPlatformAdminSecurity()) throw new Error('后台权限数据初始化失败')
        const data = await adminRepository.loadDashboard(this.mockScenario)
        const legacyProducts = hasPersistedData ? mergeEntitySeeds(data.products, this.products) : data.products
        const cInventory = readCInventoryState()
        const catalog = readCatalogState() ?? ensureCatalogState(legacyProducts, normalizeCProducts(cInventory?.products || []))
        const productSubmissionState = readCatalogProductSubmissionState()
        const storeProducts = catalog.products.filter((product) => catalogChannelFlags(product.channel).store).map(catalogProductToProduct)
        const liveProducts = catalog.products.filter((product) => catalogChannelFlags(product.channel).live).map(catalogProductToCProduct)
        const platformEntities = readPlatformEntities()
        const legacySuppliers = hasPersistedData ? mergeEntitySeeds(data.suppliers, this.suppliers) : data.suppliers
        const legacySupplierIds = new Set(legacySuppliers.map((supplier) => supplier.id))
        const mergedSuppliers = mergePlatformEntities(legacySuppliers, platformEntities?.suppliers)
        const resolvedSuppliers = [
          ...mergedSuppliers.filter((supplier) => !legacySupplierIds.has(supplier.id)).reverse(),
          ...mergedSuppliers.filter((supplier) => legacySupplierIds.has(supplier.id))
        ]
        const persistedCommissionRules = readPlatformCommissionRules() || []
        const persistedCommissionSettlements = Object.values(readPlatformCommissionSettlementRecords() || {})
        const persistedSupplierSettlements = Object.values(readPlatformSupplierSettlements() || {})
        const dictionaries = readPlatformDictionaries()
        const adminRoles = readPlatformAdminRoles()
        const adminAccounts = readPlatformAdminAccounts()
        this.$patch({
          suppliers: resolvedSuppliers,
          supplierAccounts: mergePlatformSupplierAccounts(buildSupplierAccountSeeds(resolvedSuppliers), readPlatformSupplierAccounts()),
          products: storeProducts,
          cProducts: liveProducts,
          catalogProducts: catalog.products,
          catalogRevision: catalog.revision,
          productSubmissions: productSubmissionState?.submissions ?? [],
          productSubmissionRevision: productSubmissionState?.revision ?? 0,
          pricingDefaults: readPricingDefaults(),
          categories: mergeEntitySeeds(mergePlatformEntities(data.categories, platformEntities?.categories), hasPersistedData ? this.categories : []),
          orders: hasPersistedData ? mergeEntitySeeds(data.orders, this.orders) : data.orders,
          afterSales: hasPersistedData ? mergeEntitySeeds(data.afterSales, this.afterSales) : data.afterSales,
          farms: mergeEntitySeeds(mergePlatformEntities(data.farms, platformEntities?.farms), hasPersistedData ? this.farms : []).map(migrateFarmAdministrativeAddress),
          promoters: mergeEntitySeeds(mergePlatformEntities(data.promoters, platformEntities?.promoters), hasPersistedData ? this.promoters : []),
          policies: mergeEntitySeeds(mergePlatformEntities(data.pricePolicies, platformEntities?.policies), hasPersistedData ? this.policies : []),
          commissionRules: mergeEntitySeeds(mergeEntitySeeds(data.commissionRules, persistedCommissionRules), hasPersistedData ? this.commissionRules : []),
          commissionSettlementRecords: mergeEntitySeeds(mergeEntitySeeds(data.commissionSettlements, persistedCommissionSettlements), hasPersistedData ? this.commissionSettlementRecords : []),
          supplierSettlementRecords: mergeEntitySeeds(mergeEntitySeeds(data.supplierSettlements, persistedSupplierSettlements), hasPersistedData ? this.supplierSettlementRecords : []),
          dictGroups: dictionaries.groups,
          dictItems: dictionaries.items,
          dictionaryRevision: dictionaries.revision,
          dictionaryUpdatedAt: dictionaries.updatedAt,
          storeAccounts: mergePlatformStoreAccounts(data.storeAccounts, readPlatformStoreAccounts()),
          adminRoles,
          adminAccounts,
          initialized: true
        })
        if (this.auth.isLoggedIn) {
          const account = adminAccounts.find((item) => item.id === this.auth.accountId || item.account === this.auth.account)
          const role = adminRoles.find((item) => item.id === account?.roleId)
          if (!account?.enabled || !role?.enabled) this.logout()
          else this.auth = { isLoggedIn: true, account: account.account, accountId: account.id, roleId: role.id, roleCode: role.code, name: account.name }
        }
        this.orders = mergePlatformOrders(this.orders, readPlatformOrders())
        this.afterSales = mergePlatformAfterSales(this.afterSales, readPlatformAfterSales())
        this.supplierSettlementRecords = mergeEntitySeeds(this.supplierSettlementRecords, Object.values(readPlatformSupplierSettlements() || {}))
        if (this.mockScenario === 'normal') {
          seedAdminDemoDataOnce()
          if (!this.exportRecords.length) this.exportRecords = cloneSeed(demoAdminExportRecords)
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    async refreshSharedState() {
      await this.initialize(true)
    },
    setMockScenario(scenario: MockScenario) {
      this.mockScenario = scenario
      this.initialized = false
    },
    applyCatalogState(catalog: CatalogState) {
      this.catalogProducts = catalog.products
      this.catalogRevision = catalog.revision
      this.products = catalog.products.filter((product) => catalogChannelFlags(product.channel).store).map(catalogProductToProduct)
      this.cProducts = catalog.products.filter((product) => catalogChannelFlags(product.channel).live).map(catalogProductToCProduct)
    },
    executeAdminAction<T>(permission: AdminPermissionCode, context: AdminAuditContext, operation: () => T): AdminActionExecution<T> {
      if (!this.can(permission)) {
        const auditRecovery = recoverAdminFailureAudit({
          module: context.module,
          action: context.action,
          actorId: this.auth.accountId || this.auth.account || 'anonymous',
          actorName: this.auth.name || undefined,
          actorRole: this.auth.roleCode || undefined,
          targetType: context.targetType,
          targetId: context.targetId,
          result: 'failure',
          reason: 'permission-denied',
          operationId: createId('OP-ADMIN-ACTION'),
          metadata: context.metadata
        })
        return { ok: false, error: auditRecovery?.message || context.deniedMessage || '无权执行该操作' }
      }
      try {
        return { ok: true, value: operation() }
      } catch (error) {
        const reason = error instanceof Error && error.message ? error.message : 'operation-threw'
        const auditRecovery = recoverAdminFailureAudit({
          module: context.module,
          action: context.action,
          actorId: this.auth.accountId || this.auth.account || 'anonymous',
          actorName: this.auth.name || undefined,
          actorRole: this.auth.roleCode || undefined,
          targetType: context.targetType,
          targetId: context.targetId,
          result: 'failure',
          reason,
          operationId: createId('OP-ADMIN-ACTION'),
          metadata: context.metadata
        })
        return { ok: false, error: auditRecovery?.message || '操作执行失败，请重试' }
      }
    },
    async executeAdminTransaction(permission: AdminPermissionCode | null, context: AdminAuditContext, transaction: AdminTransactionInput): Promise<WriteResult> {
      const actor = context.actor || {
        id: this.auth.accountId || this.auth.account || 'anonymous',
        name: this.auth.name || undefined,
        role: this.auth.roleCode || undefined
      }
      const failureAudit = (reason: string) => recoverAdminFailureAudit({
        module: context.module,
        action: context.action,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        targetType: context.targetType,
        targetId: context.targetId,
        result: 'failure',
        reason,
        operationId: transaction.operationId,
        metadata: context.metadata
      })
      this.error = ''
      if ((permission && !this.can(permission)) || (context.requiresSuperAdmin && this.auth.roleId !== ADMIN_SUPER_ROLE_ID)) {
        const auditRecovery = failureAudit('permission-denied')
        if (auditRecovery) {
          this.error = auditRecovery.message
          return auditRecovery
        }
        this.error = context.deniedMessage || '无权执行该操作'
        return { ok: false, code: 'permission_denied', message: this.error, operationId: transaction.operationId }
      }
      let valid = true
      try { valid = transaction.validate ? transaction.validate() : true } catch { valid = false }
      if (!valid) {
        const auditRecovery = failureAudit('validation-failed')
        if (auditRecovery) {
          this.error = auditRecovery.message
          return auditRecovery
        }
        this.error = context.validationMessage || '操作数据无效，请刷新后重试'
        return { ok: false, code: 'validation_failed', message: this.error, operationId: transaction.operationId }
      }
      const auditResult = transaction.auditResult || 'success'
      const revisionChecks = [...(transaction.revisionChecks || [])]
      if (transaction.collections.includes(PLATFORM_AUDIT_LOG_STORAGE_KEY) && !revisionChecks.some(({ key }) => key === PLATFORM_AUDIT_LOG_STORAGE_KEY)) {
        revisionChecks.push({ key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY) })
      }
      const result = await runLockedPlatformTransaction<void>({
        operationId: transaction.operationId,
        collections: transaction.collections,
        original: transaction.original,
        target: transaction.target,
        recoveryHandlerKey: transaction.recoveryHandlerKey,
        recoverySchema: transaction.recoverySchema,
        revisionChecks,
        validate: transaction.validateInLock,
        steps: [
          ...transaction.steps,
          {
            key: 'audit',
            apply: () => appendPlatformAuditLog({
              module: context.module,
              action: context.action,
              actorId: actor.id,
              actorName: actor.name,
              actorRole: actor.role,
              targetType: context.targetType,
              targetId: context.targetId,
              result: auditResult,
              reason: transaction.auditReason,
              operationId: transaction.operationId,
              metadata: context.metadata
            }),
            rollback: () => removeAdminTransactionAudit(transaction.operationId, context.action, auditResult)
          }
        ]
      })
      if (!result.ok) {
        const auditRecovery = failureAudit(result.fatal ? 'transaction-fatal' : result.code || 'business-write-failed')
        if (auditRecovery) {
          this.error = auditRecovery.message
          return auditRecovery
        }
        this.error = result.message
      }
      return result
    },
    async executeAdminRecoveryAction(context: AdminAuditContext, operation: (audit: () => boolean) => WriteResult<unknown> | Promise<WriteResult<unknown>>): Promise<WriteResult<unknown>> {
      const actor = {
        id: this.auth.accountId || this.auth.account || 'anonymous',
        name: this.auth.name || undefined,
        role: this.auth.roleCode || undefined
      }
      const writeAudit = (result: 'success' | 'failure', reason?: string) => appendPlatformAuditLog({
        module: context.module,
        action: context.action,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        targetType: context.targetType,
        targetId: context.targetId,
        result,
        reason,
        metadata: context.metadata
      })
      this.error = ''
      if (!this.can('recovery.resolve')) {
        const auditRecovery = recoverAdminFailureAudit({
          module: context.module, action: context.action, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
          targetType: context.targetType, targetId: context.targetId, result: 'failure', reason: 'permission-denied', operationId: createId('OP-ADMIN-RECOVERY'), metadata: context.metadata
        })
        this.error = auditRecovery?.message || context.deniedMessage || '无权处理恢复任务'
        if (auditRecovery) return auditRecovery
        return { ok: false, code: 'permission_denied', message: this.error }
      }
      let result: WriteResult<unknown>
      try {
        result = await operation(() => writeAudit('success'))
      } catch (error) {
        result = { ok: false, code: 'operation-threw', message: error instanceof Error && error.message ? error.message : '恢复任务处理失败' }
      }
      if (!result.ok) {
        const auditRecovery = recoverAdminFailureAudit({
          module: context.module, action: context.action, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
          targetType: context.targetType, targetId: context.targetId, result: 'failure', reason: result.code || 'recovery-failed', operationId: result.operationId || createId('OP-ADMIN-RECOVERY'), metadata: context.metadata
        })
        if (auditRecovery) return auditRecovery
        this.error = result.message
      }
      return result
    },
    async saveCatalogProduct(payload: CatalogProduct): Promise<{ ok: true } | { ok: false; error: string }> {
      const collectionRevision = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
      const current = readCatalogState()
      const creating = !current?.products.some((product) => product.id === payload.id)
      const permission: AdminPermissionCode = creating ? 'product.create' : 'product.update'
      const deniedMessage = creating ? '无权新增商品' : '无权修改商品'
      const stale = !current || current.revision !== this.catalogRevision
      const expectedRevision = this.catalogRevision
      let next: CatalogState | null = null
      const stockLogEntries = creating ? [] : buildCatalogStockLogs(current, payload, this.auth.name || this.auth.account || 'admin')
      const operationId = createId('OP-CATALOG-PRODUCT')
      if (creating) {
        const submissionState = readCatalogProductSubmissionState()
        if (!this.can(permission)) {
          const auditRecovery = recoverAdminFailureAudit({ module: 'products', action: 'product.create', actorId: this.auth.accountId || this.auth.account || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: payload.id, result: 'failure', reason: 'permission-denied', operationId, metadata: { name: payload.name } })
          return { ok: false, error: auditRecovery?.message || deniedMessage }
        }
        if (!current || stale) return { ok: false, error: '商品数据已更新，请刷新后重试' }
        const submittedAt = new Date(Math.max(Date.now(), Date.parse(submissionState?.updatedAt || '') + 1 || 0)).toISOString()
        const submissionResult = await createCatalogProductSubmission({
          id: createId('SUB-PRODUCT'), source: 'admin', kind: 'create', draft: payload,
          baseCatalogRevision: current.revision,
          submittedBy: this.auth.accountId || this.auth.account,
          submittedAt
        }, submissionState?.revision ?? 0, {
          module: 'products', action: 'product.create', actorId: this.auth.accountId || this.auth.account,
          actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: payload.id,
          metadata: { name: payload.name }
        })
        if (!submissionResult.ok) return { ok: false, error: submissionResult.code === 'invalid_payload' ? '商品配置非法，请检查渠道、快递、佣金和 SKU 价格' : submissionResult.message || '商品提交失败，请重试' }
        const latestSubmissions = readCatalogProductSubmissionState()
        this.productSubmissions = latestSubmissions?.submissions ?? []
        this.productSubmissionRevision = latestSubmissions?.revision ?? 0
        return { ok: true }
      }
      const result = await this.executeAdminTransaction(permission, { module: 'products', action: creating ? 'product.create' : 'product.update', targetType: 'catalog-product', targetId: payload.id, deniedMessage, validationMessage: '商品数据已更新，请刷新后重试', metadata: { name: payload.name } }, {
        operationId,
        collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: current,
        target: payload,
        revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: collectionRevision }],
        validate: () => !stale,
        steps: [{ key: 'catalog-product', apply: () => !!(next = persistCatalogProduct(payload, expectedRevision)), rollback: () => next && current ? writeCatalogState(current, next.revision) : true }]
      })
      if (!result.ok) {
        const latest = readCatalogState()
        const revisionConflict = !latest || latest.revision !== expectedRevision
        if (latest) this.applyCatalogState(latest)
        if (result.code === 'permission_denied') return { ok: false, error: this.error || deniedMessage }
        if (result.failedStep === 'audit') return { ok: false, error: '商品保存日志失败，请重试' }
        return revisionConflict
          ? { ok: false, error: '商品数据已更新，请刷新后重试' }
          : { ok: false, error: '商品配置非法，请检查渠道、快递、佣金和 SKU 价格' }
      }
      if (!next) return { ok: false, error: '商品配置非法，请检查渠道、快递、佣金和 SKU 价格' }
      this.applyCatalogState(next)
      // 库存流水为追加式记录，事务成功后写入；写失败不影响商品保存结果。
      if (stockLogEntries.length) appendCatalogStockLogs(stockLogEntries)
      return { ok: true }
    },
    async toggleCatalogProduct(id: string) {
      const item = this.catalogProducts.find((product) => product.id === id)
      const collectionRevision = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
      const current = readCatalogState()
      const stale = !current || current.revision !== this.catalogRevision
      const persisted = current?.products.find((product) => product.id === id)
      const mutable = !!item && !!persisted && (item.status === 'active' || item.status === 'offline') && persisted.status === item.status
      const payload = mutable ? { ...item, status: item.status === 'active' ? 'offline' as const : 'active' as const } : null
      let next: CatalogState | null = null
      const operationId = createId('OP-CATALOG-PRODUCT-STATUS')
      const result = await this.executeAdminTransaction('product.status', { module: 'products', action: 'product.status', targetType: 'catalog-product', targetId: id, deniedMessage: '无权变更商品状态', validationMessage: stale ? '商品数据已更新，请刷新后重试' : '商品不存在', metadata: { status: payload?.status } }, {
        operationId, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: current, target: payload,
        revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: collectionRevision }],
        validate: () => mutable && !!payload && !!current && !stale,
        steps: [{ key: 'catalog-product', apply: () => !!current && !!payload && !!(next = persistCatalogProduct(payload, current.revision)), rollback: () => next && current ? writeCatalogState(current, next.revision) : true }]
      })
      if (!result.ok || !next) return false
      this.applyCatalogState(next)
      return true
    },
    async approveCatalogProductSubmission(id: string): Promise<WriteResult<CatalogProductSubmission>> {
      if (!this.can('product.audit')) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'products', action: 'product.audit.approve', actorId: this.auth.accountId || this.auth.account || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: id, result: 'failure', reason: 'permission-denied', operationId: createId('OP-PRODUCT-AUDIT') })
        if (auditRecovery) {
          this.error = auditRecovery.message
          return auditRecovery
        }
        return { ok: false, code: 'permission_denied', message: '无权审核商品' }
      }
      const state = readCatalogProductSubmissionState()
      const catalog = readCatalogState()
      if (!state || !catalog) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'products', action: 'product.audit.approve', actorId: this.auth.accountId || this.auth.account || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: id, result: 'failure', reason: 'revision-conflict', operationId: createId('OP-PRODUCT-AUDIT') })
        return auditRecovery || { ok: false, code: 'revision_conflict', message: '数据已更新，请刷新后重试' }
      }
      const reviewedAt = new Date(Math.max(Date.now(), Date.parse(state.updatedAt) + 1)).toISOString()
      const result = await approveSharedCatalogProductSubmission({
        submissionId: id, reviewedBy: this.auth.accountId || this.auth.account, reviewedAt,
        expectedSubmissionRevision: state.revision, expectedCatalogRevision: catalog.revision,
        audit: { module: 'products', action: 'product.audit.approve', actorId: this.auth.accountId || this.auth.account, actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: id }
      })
      if (result.ok) {
        const latestCatalog = readCatalogState()
        const latestSubmissions = readCatalogProductSubmissionState()
        if (latestCatalog) this.applyCatalogState(latestCatalog)
        this.productSubmissions = latestSubmissions?.submissions ?? []
        this.productSubmissionRevision = latestSubmissions?.revision ?? 0
      } else this.error = result.message
      return result
    },
    async rejectCatalogProductSubmission(id: string, reason: string): Promise<WriteResult<CatalogProductSubmission>> {
      const operationId = createId('OP-PRODUCT-AUDIT')
      const auditFailure = (failureReason: string) => recoverAdminFailureAudit({ module: 'products', action: 'product.audit.reject', actorId: this.auth.accountId || this.auth.account || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: id, result: 'failure', reason: failureReason, operationId })
      if (!this.can('product.audit')) return auditFailure('permission-denied') || { ok: false, code: 'permission_denied', message: '无权审核商品' }
      const note = reason.trim()
      if (!note) return auditFailure('invalid-reason') || { ok: false, code: 'invalid_reason', message: '请填写驳回原因' }
      const state = readCatalogProductSubmissionState()
      if (!state) return auditFailure('revision-conflict') || { ok: false, code: 'revision_conflict', message: '数据已更新，请刷新后重试' }
      const reviewedAt = new Date(Math.max(Date.now(), Date.parse(state.updatedAt) + 1)).toISOString()
      const result = await rejectSharedCatalogProductSubmission({
        submissionId: id, reviewedBy: this.auth.accountId || this.auth.account, reviewedAt, note,
        expectedSubmissionRevision: state.revision,
        audit: { module: 'products', action: 'product.audit.reject', actorId: this.auth.accountId || this.auth.account, actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'catalog-product-submission', targetId: id, metadata: { reason: note } }
      })
      if (result.ok) {
        const latestSubmissions = readCatalogProductSubmissionState()
        this.productSubmissions = latestSubmissions?.submissions ?? []
        this.productSubmissionRevision = latestSubmissions?.revision ?? 0
      } else this.error = result.message
      return result
    },
    async updatePricingDefaults(defaults: PricingDefaults) {
      const revision = readPlatformCollectionRevision(PLATFORM_PRICING_DEFAULTS_STORAGE_KEY)
      const previous = readPricingDefaults()
      const result = await this.executeAdminTransaction('price.manage', { module: 'prices', action: 'price.defaults.update', targetType: 'pricing-defaults', targetId: 'default', deniedMessage: '无权修改价格配置' }, {
        operationId: createId('OP-PRICE-DEFAULTS'), collections: [PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target: defaults,
        revisionChecks: [{ key: PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, expectedRevision: revision }],
        steps: [{ key: 'pricing-defaults', apply: () => writePricingDefaults(defaults), rollback: () => writePricingDefaults(previous) }]
      })
      if (!result.ok) return false
      this.pricingDefaults = readPricingDefaults()
      return true
    },
    async updateLeaderPricing(defaults: PricingDefaults) {
      const revision = readPlatformCollectionRevision(PLATFORM_PRICING_DEFAULTS_STORAGE_KEY)
      const previous = readPricingDefaults()
      const result = await this.executeAdminTransaction('leader.price.manage', { module: 'leaders', action: 'leader.price.update', targetType: 'leader-price', targetId: 'default', deniedMessage: '无权修改团长价格', validationMessage: '团长价格配置不合法' }, {
        operationId: createId('OP-LEADER-PRICE'),
        collections: [PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: previous,
        target: defaults,
        revisionChecks: [{ key: PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => Number.isFinite(defaults.level1Amount) && Number.isFinite(defaults.level2Amount) && defaults.level1Amount >= 0 && defaults.level2Amount >= 0,
        steps: [{ key: 'leader-price', apply: () => writePricingDefaults(defaults), rollback: () => writePricingDefaults(previous) }]
      })
      if (!result.ok) return false
      this.pricingDefaults = readPricingDefaults()
      return true
    },
    async updateLeaderShareRates(payload: { level1Rate: number; level2Rate: number }) {
      const rawShareConfig = readPlatformJson(PLATFORM_SHARE_CONFIG_STORAGE_KEY)
      const revision = readPlatformCollectionRevision(PLATFORM_SHARE_CONFIG_STORAGE_KEY)
      const previous = readShareConfig()
      const target = { ...previous, leaderLevel1Rate: payload.level1Rate, leaderLevel2Rate: payload.level2Rate }
      const result = await this.executeAdminTransaction('leader.manage', { module: 'leaders', action: 'leader.share.update', targetType: 'leader-share', targetId: 'default', deniedMessage: '无权修改团长分成', validationMessage: '分成比例需在 0-100 之间' }, {
        operationId: createId('OP-LEADER-SHARE'),
        collections: [PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: previous,
        target,
        revisionChecks: [{ key: PLATFORM_SHARE_CONFIG_STORAGE_KEY, expectedRevision: revision }],
        validate: () => [payload.level1Rate, payload.level2Rate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100),
        steps: [{ key: 'leader-share', apply: () => writeShareConfig(target), rollback: () => restoreRawPlatformCollection(PLATFORM_SHARE_CONFIG_STORAGE_KEY, rawShareConfig) }]
      })
      return result.ok
    },
    async setLeaderStatus(userId: string, enabled: boolean) {
      const rawProfiles = readPlatformJson(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY)
      const previous = readCDistributorProfiles() || {}
      const current = previous[userId]
      const revision = readPlatformCollectionRevision(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY)
      const next = current ? { ...current, status: enabled ? 'active' as const : 'paused' as const } : null
      const target = next ? { ...previous, [userId]: next } : previous
      const result = await this.executeAdminTransaction('leader.manage', { module: 'leaders', action: enabled ? 'leader.enable' : 'leader.disable', targetType: 'leader', targetId: userId, deniedMessage: '无权修改团长状态', validationMessage: '团长不存在' }, {
        operationId: createId('OP-LEADER-STATUS'),
        collections: [PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: previous,
        target,
        revisionChecks: [{ key: PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!next,
        steps: [{ key: 'leader', apply: () => writeCDistributorProfiles(target as Record<string, CDistributorProfile>), rollback: () => restoreRawPlatformCollection(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, rawProfiles) }]
      })
      return result.ok ? next : null
    },
    async addCategory(name: string, type: Category['type'], image?: DictItem['image']) {
      const trimmed = name.trim()
      if (type === 'product') {
        const id = createId('DI')
        const code = createId('PC')
        const sort = this.dictItems
          .filter((item) => item.type === 'productCategory')
          .reduce((maximum, item) => Math.max(maximum, item.sort), 0) + 10
        return this.publishDictionaryMutation(
          { module: 'categories', action: 'category.create', targetType: 'category', targetId: id, deniedMessage: '无权新增品类' },
          (state) => trimmed && !state.items.some((item) => item.type === 'productCategory' && item.label === trimmed)
            ? addSharedDictItem(state, { id, type: 'productCategory', code, label: trimmed, enabled: true, sort, image })
            : null,
          !trimmed ? '请填写品类名称' : '品类名称已存在或未上传图片',
          'category.manage'
        )
      }
      const next = { id: createId('C'), name: trimmed, type }
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const persistedEntities = readPlatformEntities()
      const originalEntities: PlatformEntities = cloneSeed(persistedEntities || { updatedAt: new Date(0).toISOString() })
      const targetEntities = { ...originalEntities, categories: { ...(originalEntities.categories || {}), [next.id]: next } }
      const result = await this.executeAdminTransaction('category.manage', {
        module: 'categories', action: 'category.create', targetType: 'category', targetId: next.id,
        deniedMessage: '无权新增品类', validationMessage: !trimmed ? '请填写品类名称' : '品类名称已存在'
      }, {
        operationId: createId('OP-CATEGORY'),
        collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: originalEntities,
        target: targetEntities,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!trimmed && !this.categories.some((item) => item.name === trimmed),
        steps: [{ key: 'category', apply: () => persistPlatformEntity('categories', next.id, next), rollback: () => {
          if (persistedEntities) return writePlatformEntities(originalEntities)
          localStorage.removeItem(PLATFORM_ENTITIES_STORAGE_KEY)
          return readPlatformEntities() === null
        } }]
      })
      if (!result.ok) return false
      this.categories.unshift(next)
      return true
    },
    async updateCategory(id: string, name: string, type: Category['type'], image?: DictItem['image']) {
      const trimmed = name.trim()
      const dictionaryItem = this.dictItems.find((item) => item.id === id && item.type === 'productCategory')
      if (dictionaryItem) {
        return this.publishDictionaryMutation(
          { module: 'categories', action: 'category.update', targetType: 'category', targetId: id, deniedMessage: '无权修改品类' },
          (state) => type === 'product' && trimmed && !state.items.some((item) => item.id !== id && item.type === 'productCategory' && item.label === trimmed)
            ? updateSharedDictItem(state, id, { label: trimmed, image })
            : null,
          '品类不存在、名称为空、名称重复或未上传图片',
          'category.manage'
        )
      }
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const previous = cloneSeed(readPlatformEntities() || { updatedAt: new Date(0).toISOString() })
      const item = previous.categories?.[id] || this.categories.find((candidate) => candidate.id === id)
      const next = item ? { ...item, name: trimmed, type } : null
      const target = next ? { ...previous, categories: { ...(previous.categories || {}), [id]: next }, updatedAt: new Date().toISOString() } : previous
      const result = await this.executeAdminTransaction('category.manage', { module: 'categories', action: 'category.update', targetType: 'category', targetId: id, deniedMessage: '无权修改品类', validationMessage: '品类不存在、名称为空或名称重复' }, {
        operationId: createId('OP-CATEGORY'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!next && !!trimmed && !this.categories.some((candidate) => candidate.id !== id && candidate.name === trimmed),
        steps: [{ key: 'category', apply: () => writePlatformEntities(target), rollback: () => writePlatformEntities(previous) }]
      })
      if (!result.ok || !item || !next) return false
      Object.assign(item, next)
      return true
    },
    async removeCategory(id: string) {
      const dictionaryItem = this.dictItems.find((item) => item.id === id && item.type === 'productCategory')
      if (dictionaryItem) {
        const inUse = this.catalogProducts.some((product) => product.category === dictionaryItem.label)
        return this.publishDictionaryMutation(
          { module: 'categories', action: 'category.delete', targetType: 'category', targetId: id, deniedMessage: '无权删除品类' },
          (state) => inUse ? null : removeSharedDictItem(state, id),
          inUse ? '品类正在使用，无法删除' : '品类不存在',
          'category.manage'
        )
      }
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const previous = cloneSeed(readPlatformEntities() || { updatedAt: new Date(0).toISOString() })
      const item = previous.categories?.[id] || this.categories.find((candidate) => candidate.id === id)
      const inUse = !!item && (this.products.some((product) => product.category === item.name) || this.suppliers.some((supplier) => supplier.category === item.name))
      const categories = { ...(previous.categories || {}) }
      delete categories[id]
      const target = { ...previous, categories, updatedAt: new Date().toISOString() }
      const result = await this.executeAdminTransaction('category.manage', { module: 'categories', action: 'category.delete', targetType: 'category', targetId: id, deniedMessage: '无权删除品类', validationMessage: inUse ? '品类正在使用，无法删除' : '品类不存在' }, {
        operationId: createId('OP-CATEGORY'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!item && !inUse,
        steps: [{ key: 'category', apply: () => writePlatformEntities(target), rollback: () => writePlatformEntities(previous) }]
      })
      if (!result.ok) return false
      this.categories = this.categories.filter((candidate) => candidate.id !== id)
      return true
    },
    dictionaryState(): PlatformDictionaryState {
      return {
        schemaVersion: DICTIONARY_SCHEMA_VERSION,
        revision: this.dictionaryRevision,
        groups: this.dictGroups.map((group) => ({ ...group })),
        items: this.dictItems.map((item) => ({ ...item })),
        updatedAt: this.dictionaryUpdatedAt
      }
    },
    applyDictionaryState(state: PlatformDictionaryState) {
      this.dictGroups = state.groups
      this.dictItems = state.items
      this.dictionaryRevision = state.revision
      this.dictionaryUpdatedAt = state.updatedAt
    },
    async publishDictionaryMutation(context: AdminAuditContext, mutate: (state: PlatformDictionaryState) => PlatformDictionaryState | null, invalidMessage = '字典操作无效', permission: AdminPermissionCode = 'dictionary.manage') {
      const current = this.dictionaryState()
      const rawPersisted = readPlatformJson(PLATFORM_DICTIONARIES_STORAGE_KEY)
      const persisted = readPlatformDictionaries()
      const mutated = mutate(current)
      const target = mutated ? { ...mutated, revision: current.revision + 1, updatedAt: new Date().toISOString() } : current
      const collectionRevision = readPlatformCollectionRevision(PLATFORM_DICTIONARIES_STORAGE_KEY)
      const stale = persisted.revision !== current.revision
      const result = await this.executeAdminTransaction(permission, {
        ...context,
        deniedMessage: context.deniedMessage || '无权维护字典',
        validationMessage: stale ? '字典数据已更新，请重试' : invalidMessage
      }, {
        operationId: createId('OP-DICTIONARY'),
        collections: [PLATFORM_DICTIONARIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: rawPersisted,
        target,
        revisionChecks: [{ key: PLATFORM_DICTIONARIES_STORAGE_KEY, expectedRevision: collectionRevision }],
        validate: () => !!mutated && !stale && canPublishPlatformDictionaries(persisted, target),
        steps: [{ key: 'dictionary', apply: () => writePlatformJson(PLATFORM_DICTIONARIES_STORAGE_KEY, target, collectionRevision), rollback: () => restoreRawPlatformCollection(PLATFORM_DICTIONARIES_STORAGE_KEY, rawPersisted) }]
      })
      if (!result.ok) {
        if (stale || result.code === 'revision_conflict') this.applyDictionaryState(readPlatformDictionaries())
        return false
      }
      this.applyDictionaryState(target)
      return true
    },
    async addDictGroup(payload: { type: string; name: string }) {
      return this.publishDictionaryMutation({ module: 'dict', action: 'dictionary.group.create', targetType: 'dictionary-group', deniedMessage: '无权新增字典分组' }, (state) => addSharedDictGroup(state, { id: createId('DG'), type: payload.type.trim(), name: payload.name.trim() }))
    },
    async updateDictGroup(id: string, payload: { type?: string; name?: string; enabled?: boolean }) {
      return this.publishDictionaryMutation({ module: 'dict', action: 'dictionary.group.update', targetType: 'dictionary-group', targetId: id, deniedMessage: '无权修改字典分组' }, (state) => updateSharedDictGroup(state, id, payload))
    },
    async removeDictGroup(id: string) {
      return this.publishDictionaryMutation({ module: 'dict', action: 'dictionary.group.delete', targetType: 'dictionary-group', targetId: id, deniedMessage: '无权删除字典分组' }, (state) => removeSharedDictGroup(state, id), '该分组下还有字典项，请先清空')
    },
    async addDictItem(payload: { type: DictItem['type']; code: string; label: string; enabled?: boolean; sort?: number; tone?: DictItem['tone']; image?: DictItem['image'] }) {
      return this.publishDictionaryMutation({ module: 'dict', action: 'dictionary.item.create', targetType: 'dictionary-item', deniedMessage: '无权新增字典项' }, (state) => addSharedDictItem(state, {
        id: createId('DI'), type: payload.type, code: payload.code.trim(), label: payload.label.trim(), enabled: payload.enabled ?? true, sort: payload.sort ?? 0, tone: payload.tone, image: payload.image
      }))
    },
    async updateDictItem(id: string, payload: { code?: string; label?: string; enabled?: boolean; sort?: number; tone?: DictItem['tone']; image?: DictItem['image'] }) {
      return this.publishDictionaryMutation({ module: 'dict', action: 'dictionary.item.update', targetType: 'dictionary-item', targetId: id, deniedMessage: '无权修改字典项' }, (state) => updateSharedDictItem(state, id, payload))
    },
    async removeDictItem(id: string) {
      const item = this.dictItems.find((candidate) => candidate.id === id)
      const inUse = item?.type === 'productCategory' && this.catalogProducts.some((product) => product.category === item.label)
      return this.publishDictionaryMutation(
        { module: 'dict', action: 'dictionary.item.delete', targetType: 'dictionary-item', targetId: id, deniedMessage: '无权删除字典项' },
        (state) => inUse ? null : removeSharedDictItem(state, id),
        inUse ? '品类正在使用，无法删除' : '系统字典项不可删除'
      )
    },
    async addStoreAccount(payload: { farmId: string; name: string; account: string; password: string; role: StoreAccount['role']; promoEnabled?: boolean; priceLevel?: StoreAccount['priceLevel'] }) {
      const valid = !!payload.farmId && !!payload.name.trim() && !!payload.account.trim() && !!payload.password.trim() && !this.storeAccounts.some((item) => item.farmId === payload.farmId && item.account === payload.account)
      const revision = readPlatformCollectionRevision(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const rawPersisted = readPlatformJson(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const previousAccounts = cloneSeed(this.storeAccounts)
      const nextAccounts = [{ id: createId('SA'), farmId: payload.farmId, name: payload.name.trim(), account: payload.account.trim(), password: payload.password.trim(), role: payload.role, enabled: true, promoEnabled: payload.promoEnabled ?? false, priceLevel: payload.role === 'staff' ? payload.priceLevel : undefined, createdAt: new Date().toLocaleString('zh-CN') }, ...this.storeAccounts]
      const result = await this.executeAdminTransaction('storeAccount.manage', { module: 'accounts', action: 'store-account.create', targetType: 'store-account', deniedMessage: '无权新增门店账号', validationMessage: '门店账号信息无效或账号已存在' }, {
        operationId: createId('OP-STORE-ACCOUNT'), collections: [PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previousAccounts, target: nextAccounts,
        revisionChecks: [{ key: PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => valid,
        steps: [{ key: 'store-account', apply: () => writePlatformStoreAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, rawPersisted) }]
      })
      if (!result.ok) return false
      this.storeAccounts = nextAccounts
      return true
    },
    async updateStoreAccount(id: string, payload: { name?: string; account?: string; password?: string; role?: StoreAccount['role']; enabled?: boolean; promoEnabled?: boolean; priceLevel?: StoreAccount['priceLevel'] }) {
      const revision = readPlatformCollectionRevision(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      const nextItem = item ? { ...item } : null
      if (nextItem && payload.name !== undefined && payload.name.trim()) nextItem.name = payload.name.trim()
      if (nextItem && payload.account !== undefined && payload.account.trim()) nextItem.account = payload.account.trim()
      if (nextItem && payload.password !== undefined && payload.password.trim()) nextItem.password = payload.password.trim()
      if (nextItem && payload.role !== undefined) nextItem.role = payload.role
      if (nextItem && payload.enabled !== undefined) nextItem.enabled = payload.enabled
      if (nextItem && payload.promoEnabled !== undefined) nextItem.promoEnabled = payload.promoEnabled
      if (nextItem && payload.priceLevel !== undefined) nextItem.priceLevel = payload.priceLevel
      const rawPersisted = readPlatformJson(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const previousAccounts = cloneSeed(this.storeAccounts)
      const nextAccounts = this.storeAccounts.map((candidate) => candidate.id === id && nextItem ? nextItem : candidate)
      const result = await this.executeAdminTransaction('storeAccount.manage', { module: 'accounts', action: 'store-account.update', targetType: 'store-account', targetId: id, deniedMessage: '无权修改门店账号', validationMessage: '门店账号不存在' }, {
        operationId: createId('OP-STORE-ACCOUNT'), collections: [PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: rawPersisted, target: nextAccounts,
        revisionChecks: [{ key: PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!nextItem,
        steps: [{ key: 'store-account', apply: () => writePlatformStoreAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, rawPersisted) }]
      })
      if (!result.ok) return false
      this.storeAccounts = nextAccounts
      return true
    },
    async toggleStoreAccount(id: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      const rawPersisted = readPlatformJson(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
      const previousAccounts = cloneSeed(this.storeAccounts)
      const nextAccounts = this.storeAccounts.map((candidate) => candidate.id === id ? { ...candidate, enabled: !candidate.enabled } : candidate)
      const result = await this.executeAdminTransaction('storeAccount.manage', { module: 'accounts', action: 'store-account.status', targetType: 'store-account', targetId: id, deniedMessage: '无权启停门店账号', validationMessage: '门店账号不存在' }, {
        operationId: createId('OP-STORE-ACCOUNT-STATUS'), collections: [PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previousAccounts, target: nextAccounts,
        revisionChecks: [{ key: PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!item,
        steps: [{ key: 'store-account', apply: () => writePlatformStoreAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, rawPersisted) }]
      })
      if (!result.ok) return false
      this.storeAccounts = nextAccounts
      return true
    },
    async inviteSupplier(payload: { name: string; category: string; region?: string; contactPhone?: string; brands?: string[]; serviceRegions?: string[]; businessLicenseNumber?: string; businessLicense?: BusinessMediaValue | null; permitNumber?: string; permit?: BusinessMediaValue | null; validUntil?: string; coop?: boolean }): Promise<{ ok: boolean; error?: string }> {
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const phone = payload.contactPhone?.trim() || ''
      const duplicate = this.suppliers.some((item) => item.contactPhone === phone) || this.supplierAccounts.some((item) => item.account === phone)
      const validationError = !payload.name.trim() ? '请填写供应商名称' : !phone ? '请填写联系人手机号' : !validatePhone(phone) ? '请输入正确的11位手机号' : duplicate ? '该手机号已绑定其他供应商' : ''
      const supplier: Supplier = {
        id: createId('S'), name: payload.name.trim(), region: payload.region?.trim() || '待补充', category: payload.category,
        certified: false, status: 'pending', productCount: 0, coop: false,
        contactPhone: phone,
        brands: payload.brands ?? [],
        serviceRegions: payload.serviceRegions ?? (payload.region?.trim() ? [payload.region.trim()] : []),
        qualification: buildSupplierQualification({
          businessLicenseNumber: payload.businessLicenseNumber,
          businessLicense: payload.businessLicense,
          permitNumber: payload.permitNumber,
          permit: payload.permit,
          validUntil: payload.validUntil,
          reviewNote: '运营邀请入驻，等待供应商补充资质'
        })
      }
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const operationId = createId('OP-SUPPLIER-INVITE')
      const result = await this.executeAdminTransaction('supplier.create', { module: 'suppliers', action: 'supplier.create', targetType: 'supplier', targetId: supplier.id, deniedMessage: '无权新增供应商', validationMessage: validationError, metadata: { name: supplier.name, contactPhone: supplier.contactPhone } }, {
        operationId,
        collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: rawEntities,
        target: supplier,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision }],
        validate: () => !validationError,
        steps: [{ key: 'supplier', apply: () => persistPlatformEntity('suppliers', supplier.id, supplier), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '供应商资料保存失败，请重试' }
      this.suppliers.unshift(supplier)
      return { ok: true }
    },
    async updateSupplier(id: string, payload: { name: string; category: string; region?: string; contactPhone?: string; brands?: string[]; serviceRegions?: string[]; businessLicenseNumber?: string; businessLicense?: BusinessMediaValue | null; permitNumber?: string; permit?: BusinessMediaValue | null; validUntil?: string; coop?: boolean; password?: string }): Promise<{ ok: boolean; error?: string }> {
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const accountRevision = readPlatformCollectionRevision(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const item = this.suppliers.find((supplier) => supplier.id === id)
      const phone = payload.contactPhone?.trim() || ''
      const duplicate = this.suppliers.some((supplier) => supplier.id !== id && supplier.contactPhone === phone) || this.supplierAccounts.some((account) => account.supplierId !== id && account.account === phone)
      const validationError = !item || !payload.name.trim() ? '请填写供应商名称' : !phone ? '请填写联系人手机号' : !validatePhone(phone) ? '请输入正确的11位手机号' : duplicate ? '该手机号已绑定其他供应商' : ''
      const existingAccount = this.supplierAccounts.find((account) => account.supplierId === id)
      const previous = item ? { ...item, qualification: { ...item.qualification, attachments: item.qualification.attachments?.map((attachment) => ({ ...attachment })) } } : null
      const next: Supplier | null = previous ? { ...previous, name: payload.name.trim(), region: payload.region?.trim() || previous.region, category: payload.category, contactPhone: phone } : null
      if (next && payload.coop !== undefined) next.coop = payload.coop
      if (next && payload.brands !== undefined) next.brands = payload.brands
      if (next && payload.serviceRegions !== undefined) next.serviceRegions = payload.serviceRegions
      const currentQualification = item ? readSupplierQualificationFields(item.qualification) : null
      const hasBusinessLicense = Object.prototype.hasOwnProperty.call(payload, 'businessLicense')
      const hasPermit = Object.prototype.hasOwnProperty.call(payload, 'permit')
      if (next && item && currentQualification) next.qualification = buildSupplierQualification({ businessLicenseNumber: payload.businessLicenseNumber ?? currentQualification.businessLicenseNumber, businessLicense: hasBusinessLicense ? payload.businessLicense : currentQualification.businessLicense, permitNumber: payload.permitNumber ?? currentQualification.permitNumber, permit: hasPermit ? payload.permit : currentQualification.permit, validUntil: payload.validUntil || item.qualification.validUntil, reviewNote: item.qualification.reviewNote })
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const rawAccounts = readPlatformJson(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const previousAccounts = this.supplierAccounts.map((account) => ({ ...account }))
      const nextAccounts = existingAccount && next && existingAccount.supplierName !== next.name
        ? this.supplierAccounts.map((account) => account.supplierId === id ? { ...account, supplierName: next.name } : account)
        : previousAccounts
      const operationId = createId('OP-SUPPLIER-UPDATE')
      const result = await this.executeAdminTransaction('supplier.update', { module: 'suppliers', action: 'supplier.update', targetType: 'supplier', targetId: id, deniedMessage: '无权修改供应商', validationMessage: validationError, metadata: next ? { name: next.name, region: next.region, category: next.category } : undefined }, {
        operationId, collections: [PLATFORM_ENTITIES_STORAGE_KEY, ...(nextAccounts === previousAccounts ? [] : [PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY]), PLATFORM_AUDIT_LOG_STORAGE_KEY], original: { supplier: previous, accounts: rawAccounts }, target: { supplier: next, accounts: nextAccounts },
        revisionChecks: [
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision },
          ...(nextAccounts === previousAccounts ? [] : [{ key: PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision }])
        ],
        validate: () => !validationError && !!next,
        steps: [
          { key: 'supplier', apply: () => !!next && persistPlatformEntity('suppliers', id, next), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) },
          ...(nextAccounts === previousAccounts ? [] : [{ key: 'supplier-account-name', apply: () => writePlatformSupplierAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, rawAccounts) }])
        ]
      })
      if (!result.ok || !item || !next) return { ok: false, error: this.error || '供应商资料保存失败，请重试' }
      Object.assign(item, next)
      if (nextAccounts !== previousAccounts) this.supplierAccounts = nextAccounts
      return { ok: true }
    },
    async auditSupplier(id: string, approved: boolean) {
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const accountRevision = readPlatformCollectionRevision(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const item = this.suppliers.find((supplier) => supplier.id === id)
      const phone = item?.contactPhone?.trim() || ''
      const valid = !!item && !item.certified && item.status === 'pending' && (!approved || (validatePhone(phone) && !this.supplierAccounts.some((account) => account.supplierId !== id && account.account === phone)))
      const previous = item ? { ...item } : null
      const previousAccounts = this.supplierAccounts.map((account) => ({ ...account }))
      const existingAccount = previousAccounts.find((account) => account.supplierId === id)
      const now = new Date().toISOString()
      const next = item ? { ...item, certified: approved, coop: approved, status: approved ? 'cooperating' as const : 'paused' as const } : null
      const account: SupplierAccount | undefined = approved && item ? (existingAccount || { id: createId('SA'), supplierId: id, supplierName: item.name, account: phone, password: phone, enabled: true, createdAt: now, updatedAt: now }) : undefined
      const nextAccounts = approved && account
        ? [account, ...previousAccounts.filter((candidate) => candidate.supplierId !== id)]
        : previousAccounts.filter((candidate) => candidate.supplierId !== id)
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const rawAccounts = readPlatformJson(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const operationId = createId('OP-SUPPLIER-AUDIT')
      const action = approved ? 'supplier.audit.approve' : 'supplier.audit.reject'
      const result = await this.executeAdminTransaction('supplier.audit', { module: 'suppliers', action, targetType: 'supplier', targetId: id, deniedMessage: '无权审核供应商', validationMessage: '供应商状态或账号信息不满足审核条件' }, {
        operationId,
        collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { supplier: previous, accounts: previousAccounts },
        target: { supplier: next, accounts: nextAccounts },
        revisionChecks: [
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision },
          { key: PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision }
        ],
        validate: () => valid && !!next,
        steps: [
          { key: 'supplier', apply: () => !!next && persistPlatformEntity('suppliers', id, next), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) },
          { key: 'supplier-account', apply: () => writePlatformSupplierAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, rawAccounts) }
        ]
      })
      if (!result.ok || !item || !next) return false
      Object.assign(item, next)
      this.supplierAccounts = nextAccounts
      return true
    },
    async restoreSupplierPending(id: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const item = this.suppliers.find((supplier) => supplier.id === id)
      const next = item ? { ...item, status: 'pending' as const } : null
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const result = await this.executeAdminTransaction('supplier.audit', { module: 'suppliers', action: 'supplier.restore-pending', targetType: 'supplier', targetId: id, deniedMessage: '无权恢复供应商状态', validationMessage: '供应商当前不可恢复为待处理' }, { operationId: createId('OP-SUPPLIER-STATUS'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: item, target: next, revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }], validate: () => !!item && !item.certified && item.status === 'paused', steps: [{ key: 'supplier', apply: () => !!next && persistPlatformEntity('suppliers', id, next), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) }] })
      if (!result.ok || !item || !next) return false
      Object.assign(item, next)
      return true
    },
    async pauseSupplier(id: string, reason: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const item = this.suppliers.find((supplier) => supplier.id === id)
      const pauseReason = reason.trim()
      const next = item ? { ...item, status: 'paused' as const, cooperationPauseReason: pauseReason, cooperationPausedAt: new Date().toISOString(), cooperationPausedBy: this.auth.name || this.auth.account || '系统' } : null
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const result = await this.executeAdminTransaction('supplier.pause', { module: 'suppliers', action: 'supplier.pause', targetType: 'supplier', targetId: id, deniedMessage: '无权暂停供应商', validationMessage: '供应商当前不可暂停或暂停原因为空', metadata: { reason: pauseReason } }, { operationId: createId('OP-SUPPLIER-STATUS'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: item, target: next, revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }], validate: () => !!item && item.certified && item.status === 'cooperating' && !!pauseReason, steps: [{ key: 'supplier', apply: () => !!next && persistPlatformEntity('suppliers', id, next), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) }] })
      if (!result.ok || !item || !next) return false
      Object.assign(item, next)
      return true
    },
    async resumeSupplier(id: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const item = this.suppliers.find((supplier) => supplier.id === id)
      const next = item ? { ...item, status: 'cooperating' as const } : null
      if (next) { delete next.cooperationPauseReason; delete next.cooperationPausedAt; delete next.cooperationPausedBy }
      const rawEntities = readPlatformJson(PLATFORM_ENTITIES_STORAGE_KEY)
      const result = await this.executeAdminTransaction('supplier.pause', { module: 'suppliers', action: 'supplier.resume', targetType: 'supplier', targetId: id, deniedMessage: '无权恢复供应商合作', validationMessage: '供应商当前不可恢复合作' }, { operationId: createId('OP-SUPPLIER-STATUS'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: item, target: next, revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }], validate: () => !!item && item.certified && item.status === 'paused', steps: [{ key: 'supplier', apply: () => !!next && persistPlatformEntity('suppliers', id, next), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, rawEntities) }] })
      if (!result.ok || !item || !next) return false
      Object.keys(item).forEach((key) => {
        if (!(key in next)) delete (item as unknown as Record<string, unknown>)[key]
      })
      Object.assign(item, next)
      return true
    },
    async updateSupplierAccount(id: string, payload: { account?: string; password?: string; enabled?: boolean; freezeReason?: string }): Promise<{ ok: boolean; error?: string }> {
      const revision = readPlatformCollectionRevision(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const action = payload.enabled === false ? 'supplier.account.freeze' : payload.enabled === true ? 'supplier.account.unfreeze' : 'supplier.account.update'
      const permission: AdminPermissionCode = payload.enabled === undefined ? 'supplier.account.update' : 'supplier.account.freeze'
      const supplier = this.suppliers.find((item) => item.id === id)
      const existing = this.supplierAccounts.find((item) => item.supplierId === id)
      const account = payload.account?.trim() || existing?.account || ''
      const password = payload.password ?? existing?.password ?? ''
      const validationError = !supplier?.certified || !existing ? '供应商尚未认证，不能配置账号' : !validatePhone(account) ? '请输入正确的11位手机号' : password.length < 6 || password.length > 20 ? '密码需6-20位' : this.supplierAccounts.some((item) => item.supplierId !== id && item.account === account) ? '该登录账号已被使用' : payload.enabled === false && !payload.freezeReason?.trim() ? '请填写冻结原因' : ''
      const nextAccount: SupplierAccount | null = existing && supplier ? { ...existing, account, password, enabled: payload.enabled ?? existing.enabled, supplierName: supplier.name, updatedAt: new Date().toISOString() } : null
      const previousAccounts = this.supplierAccounts.map((item) => ({ ...item }))
      const nextAccounts = this.supplierAccounts.map((item) => item.supplierId === id && nextAccount ? nextAccount : item)
      const rawAccounts = readPlatformJson(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
      const operationId = createId('OP-SUPPLIER-ACCOUNT')
      const result = await this.executeAdminTransaction(permission, { module: 'suppliers', action, targetType: 'supplier-account', targetId: existing?.id || id, deniedMessage: '无权修改供应商账号', validationMessage: validationError, metadata: { account, password: payload.password ? '已修改' : undefined, enabled: nextAccount?.enabled, freezeReason: payload.freezeReason?.trim() } }, { operationId, collections: [PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: rawAccounts, target: nextAccounts, revisionChecks: [{ key: PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }], validate: () => !validationError && !!nextAccount, steps: [{ key: 'supplier-account', apply: () => writePlatformSupplierAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, rawAccounts) }] })
      if (!result.ok) return { ok: false, error: this.error || '供应商账号保存失败，请重试' }
      this.supplierAccounts = nextAccounts
      return { ok: true }
    },
    async createPolicy(name: string, type: PricePolicy['type'], scope: string, discount: number, tiers?: PriceTier[]) {
      discount = round2(discount)
      const next = { id: createId('R'), name, type, scope, discount, enabled: true, tiers: tiers?.map((tier) => ({ ...tier, price: round2(tier.price) })) }
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const previous = cloneSeed(readPlatformEntities() || { updatedAt: new Date(0).toISOString() })
      const target = { ...previous, policies: { ...(previous.policies || {}), [next.id]: next }, updatedAt: new Date().toISOString() }
      const result = await this.executeAdminTransaction('price.manage', { module: 'prices', action: 'price.policy.create', targetType: 'price-policy', targetId: next.id, deniedMessage: '无权新增价格策略', validationMessage: '价格策略参数无效' }, {
        operationId: createId('OP-PRICE-POLICY'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!name && !!scope && discount > 0 && discount <= 100,
        steps: [{ key: 'price-policy', apply: () => writePlatformEntities(target), rollback: () => writePlatformEntities(previous) }]
      })
      if (!result.ok) return false
      this.policies.unshift(next)
      return true
    },
    async updatePolicy(id: string, name: string, scope: string, discount: number, enabled?: boolean, tiers?: PriceTier[]) {
      discount = round2(discount)
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const previous = cloneSeed(readPlatformEntities() || { updatedAt: new Date(0).toISOString() })
      const item = previous.policies?.[id] || this.policies.find((policy) => policy.id === id)
      const next = item ? { ...item, name, scope, discount, ...(enabled === undefined ? {} : { enabled }), ...(tiers === undefined ? {} : { tiers: tiers.map((tier) => ({ ...tier, price: round2(tier.price) })) }) } : null
      const target = next ? { ...previous, policies: { ...(previous.policies || {}), [id]: next }, updatedAt: new Date().toISOString() } : previous
      const result = await this.executeAdminTransaction('price.manage', { module: 'prices', action: 'price.policy.update', targetType: 'price-policy', targetId: id, deniedMessage: '无权修改价格策略', validationMessage: '价格策略参数无效' }, {
        operationId: createId('OP-PRICE-POLICY'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!next && !!name && !!scope && discount > 0 && discount <= 100,
        steps: [{ key: 'price-policy', apply: () => writePlatformEntities(target), rollback: () => writePlatformEntities(previous) }]
      })
      if (!result.ok || !item || !next) return false
      // 价格策略读写都以持久化集合为准，事务成功后同步内存列表，避免页面刷新前显示旧值
      const livePolicy = this.policies.find((policy) => policy.id === id)
      if (livePolicy) Object.assign(livePolicy, next)
      else this.policies.unshift({ ...next })
      return true
    },
    async togglePolicy(id: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const previous = cloneSeed(readPlatformEntities() || { updatedAt: new Date(0).toISOString() })
      const item = previous.policies?.[id] || this.policies.find((policy) => policy.id === id)
      const next = item ? { ...item, enabled: !item.enabled } : null
      const target = next ? { ...previous, policies: { ...(previous.policies || {}), [id]: next }, updatedAt: new Date().toISOString() } : previous
      const result = await this.executeAdminTransaction('price.manage', { module: 'prices', action: 'price.policy.status', targetType: 'price-policy', targetId: id, deniedMessage: '无权启停价格策略', validationMessage: '价格策略不存在' }, {
        operationId: createId('OP-PRICE-POLICY'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target,
        revisionChecks: [{ key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!next,
        steps: [{ key: 'price-policy', apply: () => writePlatformEntities(target), rollback: () => writePlatformEntities(previous) }]
      })
      if (!result.ok || !item || !next) return false
      // 价格策略读写都以持久化集合为准，事务成功后同步内存列表，避免页面刷新前显示旧值
      const livePolicy = this.policies.find((policy) => policy.id === id)
      if (livePolicy) Object.assign(livePolicy, next)
      else this.policies.unshift({ ...next })
      return true
    },
    async shipOrder(id: string) {
      const platformOrderRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
      const cOrderRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
      const item = this.orders.find((order) => order.id === id)
      const supplierOrderLink = item?.supplierOrderLink
      let valid = !!item && item.status === 'pending'
      if (supplierOrderLink?.source === 'c-mall') {
        const fulfillment = item?.supplierFulfillment
        const hasLogistics = !!fulfillment && ['shipped', 'delivering'].includes(fulfillment.status) && (fulfillment.shipType === 'courier' ? !!(fulfillment.trackingNo || item.trackingNo) : !!fulfillment.driverId)
        valid = valid && hasLogistics && !!supplierOrderLink.sourceOrderId && !!supplierOrderLink.sourceSubOrderId
      }
      const now = new Date().toLocaleString('zh-CN')
      const next = item ? { ...item, status: 'shipping' as const, flow: [...(item.flow || []), { time: now, action: '已发货 · 后台确认履约', operator: this.auth.account || '运营管理员', note: item.supplierOrderLink?.source === 'c-mall' ? '已核验供应商物流信息' : '后台确认订单进入配送' }], fulfillmentEvents: [...(item.fulfillmentEvents || []), { id: createId('FUL'), orderId: item.id, from: item.status, to: 'shipping', operatorId: this.auth.account || 'admin', operatorRole: 'admin', createdAt: new Date().toISOString() }] } : null
      const originalPlatformOrders = cloneSeed(readPlatformOrders() || {})
      const nextPlatformOrders = next ? { ...originalPlatformOrders, [next.id]: next } : originalPlatformOrders
      const originalCOrders = cloneSeed(readCOrders() || {})
      let nextCOrders = originalCOrders
      if (supplierOrderLink?.source === 'c-mall') {
        const cOrder = supplierOrderLink.sourceOrderId ? originalCOrders[supplierOrderLink.sourceOrderId] : undefined
        const cSubOrder = cOrder?.subOrders.find((subOrder) => subOrder.id === supplierOrderLink.sourceSubOrderId)
        valid = valid && !!cOrder && !!cSubOrder && !!next
        if (cOrder && cSubOrder && next) nextCOrders = { ...originalCOrders, [cOrder.id]: syncCSubOrderFromSupplier(cOrder, cSubOrder, next) }
      }
      const operationId = createId('ADMIN-SHIP')
      const result = await this.executeAdminTransaction('order.ship', { module: 'orders', action: 'order.ship', targetType: 'order', targetId: id, deniedMessage: '无权发货', validationMessage: '订单状态或物流关联不满足发货条件' }, {
        operationId, collections: [PLATFORM_ORDERS_STORAGE_KEY, ...(nextCOrders === originalCOrders ? [] : [PLATFORM_C_ORDERS_STORAGE_KEY]), PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { platformOrders: originalPlatformOrders, cOrders: originalCOrders }, target: { platformOrders: nextPlatformOrders, cOrders: nextCOrders },
        revisionChecks: [
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: platformOrderRevision },
          ...(nextCOrders === originalCOrders ? [] : [{ key: PLATFORM_C_ORDERS_STORAGE_KEY, expectedRevision: cOrderRevision }])
        ],
        validate: () => valid && !!next,
        steps: [
          { key: 'platform-orders', apply: () => writePlatformOrders(nextPlatformOrders), rollback: () => writePlatformOrders(originalPlatformOrders) },
          ...(nextCOrders === originalCOrders ? [] : [{ key: 'c-orders', apply: () => writeCOrders(nextCOrders), rollback: () => writeCOrders(originalCOrders) }])
        ]
      })
      if (!result.ok || !next) return false
      this.orders[this.orders.findIndex((order) => order.id === id)] = next
      return true
    },
    async batchShipOrders(ids: string[]) {
      let count = 0
      for (const id of ids) if (await this.shipOrder(id)) count += 1
      return count
    },
    async confirmOrder(id: string) {
      const platformOrderRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
      const cOrderRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
      const commissionRevision = readPlatformCollectionRevision(PLATFORM_C_COMMISSIONS_STORAGE_KEY)
      const item = this.orders.find((order) => order.id === id)
      let valid = !!item && item.status === 'shipping'
      const operator = this.auth.account || '运营管理员'
      const originalPlatformOrders = cloneSeed(readPlatformOrders() || {})
      const originalCOrders = cloneSeed(readCOrders() || {})
      const originalCommissions = cloneSeed(readCCommissionRecords() || [])
      const linked = item?.supplierOrderLink?.source === 'c-mall' && item.supplierOrderLink.sourceOrderId && item.supplierOrderLink.sourceSubOrderId ? item.supplierOrderLink : null
      if (item?.supplierOrderLink?.source === 'c-mall' && !linked) valid = false
      const receivedSupplierOrder = linked && item ? confirmCSubOrderReceiptAtSupplier(item, operator, 'admin') : null
      if (linked && !receivedSupplierOrder) valid = false
      const now = new Date().toLocaleString('zh-CN')
      const next = receivedSupplierOrder || (item ? { ...item, status: 'delivered' as const, flow: [...(item.flow || []), { time: now, action: '已确认收货', operator, note: '门店已签收' }], fulfillmentEvents: [...(item.fulfillmentEvents || []), { id: createId('FUL'), orderId: item.id, from: item.status, to: 'delivered', operatorId: this.auth.account || 'admin', operatorRole: 'admin', createdAt: new Date().toISOString() }] } : null)
      const nextPlatformOrders = next ? { ...originalPlatformOrders, [next.id]: next } : originalPlatformOrders
      let nextCOrders = originalCOrders
      let nextCommissions = originalCommissions
      if (linked) {
        const sourceOrderId = linked.sourceOrderId
        const sourceSubOrderId = linked.sourceSubOrderId
        const cOrder = sourceOrderId ? originalCOrders[sourceOrderId] : undefined
        const cSubOrder = cOrder?.subOrders.find((subOrder) => subOrder.id === sourceSubOrderId)
        valid = valid && !!cOrder && !!cSubOrder && !!next
        if (cOrder && cSubOrder && next) {
          const nextCOrder = syncCSubOrderFromSupplier(cOrder, cSubOrder, next)
          nextCOrder.commissionAllocations.filter((record) => record.subOrderId === cSubOrder.id && record.status === 'pending').forEach((record) => { record.status = 'available' })
          nextCOrders = { ...originalCOrders, [nextCOrder.id]: nextCOrder }
          const changed = new Map(nextCOrder.commissionAllocations.map((record) => [record.id, record]))
          nextCommissions = originalCommissions.map((record) => changed.get(record.id) || record)
        }
      }
      const operationId = createId('ADMIN-RECEIPT')
      const result = await this.executeAdminTransaction('order.confirm', { module: 'orders', action: 'order.confirm', targetType: 'order', targetId: id, deniedMessage: '无权确认收货', validationMessage: '订单状态或关联快照不满足确认条件' }, {
        operationId, collections: [PLATFORM_ORDERS_STORAGE_KEY, ...(linked ? [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY] : []), PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { platformOrders: originalPlatformOrders, cOrders: originalCOrders, commissions: originalCommissions },
        target: { platformOrders: nextPlatformOrders, cOrders: nextCOrders, commissions: nextCommissions },
        revisionChecks: [
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: platformOrderRevision },
          ...(linked ? [
            { key: PLATFORM_C_ORDERS_STORAGE_KEY, expectedRevision: cOrderRevision },
            { key: PLATFORM_C_COMMISSIONS_STORAGE_KEY, expectedRevision: commissionRevision }
          ] : [])
        ],
        validate: () => valid && !!next,
        steps: [
          { key: 'platform-orders', apply: () => writePlatformOrders(nextPlatformOrders), rollback: () => writePlatformOrders(originalPlatformOrders) },
          ...(linked ? [
            { key: 'c-orders', apply: () => writeCOrders(nextCOrders), rollback: () => writeCOrders(originalCOrders) },
            { key: 'c-commissions', apply: () => writeCCommissionRecords(nextCommissions), rollback: () => writeCCommissionRecords(originalCommissions) }
          ] : [])
        ]
      })
      if (!result.ok || !next) return false
      this.orders[this.orders.findIndex((order) => order.id === id)] = next
      return true
    },
    async transitionAdminAfterSale(id: string, action: string, expectedStatuses: AfterSale['status'][], nextStatus: AfterSale['status'], historyAction: string, patch: Partial<AfterSale> = {}, allowed = true) {
      const revision = readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY)
      const previousAfterSales = { ...Object.fromEntries(this.afterSales.map((item) => [item.id, cloneSeed(item)])), ...(readPlatformAfterSales() || {}) }
      const item = previousAfterSales[id]
      const transitionTime = item?.history?.at(-1)?.time || new Date(0).toISOString()
      const next = item ? { ...item, ...patch, status: nextStatus, history: [...(item.history || []), { time: transitionTime, action: historyAction, operator: '运营管理员' }] } : null
      const nextAfterSales = next ? { ...previousAfterSales, [id]: next } : previousAfterSales
      const operationId = `OP-ADMIN-AFTER-SALE-${stableAdminSourceHash([id, action, nextStatus])}`
      const result = await this.executeAdminTransaction('afterSale.manage', { module: 'afterSales', action, targetType: 'after-sale', targetId: id, metadata: { from: item?.status, to: nextStatus }, deniedMessage: '无权处理售后' }, {
        operationId,
        collections: [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { afterSales: previousAfterSales, auditAction: action },
        target: { afterSales: nextAfterSales, auditAction: action },
        recoveryHandlerKey: 'admin-after-sale-v1',
        recoverySchema: 'admin-after-sale-snapshot-v1',
        revisionChecks: [{ key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => allowed && !!item && expectedStatuses.includes(item.status),
        steps: [{ key: 'after-sales', apply: () => writePlatformAfterSales(nextAfterSales), rollback: () => writePlatformAfterSales(previousAfterSales) }]
      })
      if (!result.ok || !next) return false
      const index = this.afterSales.findIndex((afterSale) => afterSale.id === id)
      if (index >= 0) this.afterSales[index] = next
      else this.afterSales.unshift(next)
      return true
    },
    async initiateAfterSale(orderId: string, type: AfterSale['type'], issue: string) {
      const revision = readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY)
      const order = this.orders.find((candidate) => candidate.id === orderId)
      const previousAfterSales = { ...Object.fromEntries(this.afterSales.map((item) => [item.id, cloneSeed(item)])), ...(readPlatformAfterSales() || {}) }
      const firstItem = order?.items?.[0]
      const nextAfterSale: AfterSale = {
        id: `AS-ADMIN-${orderId}`, orderId,
        productName: firstItem?.name || order?.productName || '',
        applicant: order?.customer || '',
        type,
        amount: order?.amount || 0,
        status: 'processing',
        issue,
        quantity: firstItem?.quantity || order?.quantity,
        image: firstItem?.image,
        history: [{ time: order?.createdAt || new Date(0).toISOString(), action: '用户发起售后，平台受理中', operator: '运营管理员' }]
      }
      const nextAfterSales = { ...previousAfterSales, [nextAfterSale.id]: nextAfterSale }
      const operationId = `OP-ADMIN-AFTER-SALE-CREATE-${stableAdminSourceHash([orderId])}`
      const result = await this.executeAdminTransaction('afterSale.manage', { module: 'afterSales', action: 'after-sale.create', targetType: 'order', targetId: orderId, deniedMessage: '无权发起售后' }, {
        operationId,
        collections: [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { afterSales: previousAfterSales, auditAction: 'after-sale.create' },
        target: { afterSales: nextAfterSales, auditAction: 'after-sale.create' },
        recoveryHandlerKey: 'admin-after-sale-v1',
        recoverySchema: 'admin-after-sale-snapshot-v1',
        revisionChecks: [{ key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!order && order.status === 'delivered' && !Object.values(previousAfterSales).some((afterSale) => afterSale.orderId === orderId),
        steps: [{ key: 'after-sales', apply: () => writePlatformAfterSales(nextAfterSales), rollback: () => writePlatformAfterSales(previousAfterSales) }]
      })
      if (!result.ok) return false
      this.afterSales.unshift(nextAfterSale)
      return true
    },
    rejectAfterSale(id: string) {
      return this.transitionAdminAfterSale(id, 'after-sale.reject', ['processing'], 'rejected', '售后申请已拒绝')
    },
    approveAfterSaleRefund(id: string) {
      return this.transitionAdminAfterSale(id, 'after-sale.approve-refund', ['processing'], 'refund-pending', '已同意退款，待退款')
    },
    approveAfterSaleReturn(id: string) {
      return this.transitionAdminAfterSale(id, 'after-sale.approve-return', ['processing'], 'return-pending', '已同意退货，待退货')
    },
    /** 登记退回运单号（清单「退款与退货：…退货物流」）：状态不变，仅补录物流并留痕。 */
    async recordAfterSaleReturnTracking(id: string, trackingNo: string) {
      const value = trackingNo.trim()
      const revision = readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY)
      const previousAfterSales = { ...Object.fromEntries(this.afterSales.map((item) => [item.id, cloneSeed(item)])), ...(readPlatformAfterSales() || {}) }
      const item = previousAfterSales[id]
      const editable = !!item && ['processing', 'return-pending'].includes(item.status)
      const validationError = !item ? '售后工单不存在' : !editable ? '当前状态不能登记退回运单号' : value.length < 6 || value.length > 32 ? '请输入 6-32 位退回运单号' : ''
      const stamp = new Date()
      const transitionTime = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
      const next = item && !validationError
        ? { ...item, returnTrackingNo: value, history: [...(item.history || []), { time: transitionTime, action: `登记退回运单号 ${value}`, operator: this.auth.name || '运营管理员' }] }
        : null
      const nextAfterSales = next ? { ...previousAfterSales, [id]: next } : previousAfterSales
      const operationId = `OP-ADMIN-AFTER-SALE-RETURN-${stableAdminSourceHash([id, value])}`
      const result = await this.executeAdminTransaction('afterSale.manage', { module: 'afterSales', action: 'after-sale.return-tracking', targetType: 'after-sale', targetId: id, deniedMessage: '无权处理售后', validationMessage: validationError }, {
        operationId,
        collections: [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { afterSales: previousAfterSales, auditAction: 'after-sale.return-tracking' },
        target: { afterSales: nextAfterSales, auditAction: 'after-sale.return-tracking' },
        recoveryHandlerKey: 'admin-after-sale-v1',
        recoverySchema: 'admin-after-sale-snapshot-v1',
        revisionChecks: [{ key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !validationError && !!next,
        steps: [{ key: 'after-sales', apply: () => writePlatformAfterSales(nextAfterSales), rollback: () => writePlatformAfterSales(previousAfterSales) }]
      })
      if (!result.ok || !next) return false
      const index = this.afterSales.findIndex((afterSale) => afterSale.id === id)
      if (index >= 0) this.afterSales[index] = next
      else this.afterSales.unshift(next)
      return true
    },
    async refundAfterSale(id: string) {
      this.error = ''
      const stable = readStableAdminRefundSnapshot()
      const previous = stable?.snapshot
      const work = previous?.afterSales?.[id]
      const operationId = `refund:${work?.operationId || work?.id || id}`
      const auditContext: AdminAuditContext = {
        module: 'afterSales', action: 'after-sale.refund', targetType: 'after-sale', targetId: id,
        deniedMessage: '无权处理售后', validationMessage: '售后关联数据不完整，请刷新后重试'
      }
      const recordFailure = (reason: string, auditOperationId = operationId) => {
        const auditRecovery = recoverAdminFailureAudit({
          module: auditContext.module, action: auditContext.action,
          actorId: this.auth.accountId || this.auth.account || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode,
          targetType: auditContext.targetType, targetId: id, result: 'failure', reason, operationId: auditOperationId
        })
        if (auditRecovery) this.error = auditRecovery.message
        return auditRecovery
      }
      if (!this.can('afterSale.manage')) {
        await this.executeAdminTransaction('afterSale.manage', auditContext, {
          operationId, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: {}, target: {}, steps: []
        })
        return false
      }
      const escapedOperationId = operationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const receiptOperationPattern = new RegExp(`^${escapedOperationId}(?::attempt:\\d+)?$`)
      const receiptJournals = Object.values(readPlatformJournal()).filter((journal) => receiptOperationPattern.test(journal.operationId))
      const receiptTasks = readPlatformRecoveryQueue().filter((task) => receiptOperationPattern.test(task.operationId))
      const pendingReceiptTask = receiptTasks.find((task) => task.status === 'pending')
      if (pendingReceiptTask) {
        const receiptJournal = receiptJournals.find((journal) => journal.operationId === pendingReceiptTask.operationId)
        const receipt = isAdminRecord(receiptJournal?.original) && isAdminRecord(receiptJournal.original.receipt) ? receiptJournal.original.receipt : null
        const validReceipt = receiptJournal?.status === 'committed'
          && receiptJournal.recoverySchema === 'admin-after-sale-refund-receipt-v1'
          && receiptJournal.recoveryHandlerKey === 'admin-after-sale-v1'
          && pendingReceiptTask.handlerKey === 'admin-after-sale-v1'
          && receipt?.operationId === pendingReceiptTask.operationId
          && typeof receipt.refundId === 'string'
          && !!receipt.refundId.trim()
        if (!validReceipt) {
          this.error = '退款回执恢复任务异常，请在恢复中心核验'
          recordFailure('provider-receipt-recovery-invalid')
          return false
        }
        const retried = await retryPlatformRecoveryTask(pendingReceiptTask.id, this.auth.name || this.auth.account || 'admin')
        if (!retried.ok) {
          this.error = retried.message
          recordFailure(retried.code || 'recovery-failed', pendingReceiptTask.operationId)
          return false
        }
        const latestAfterSales = readPlatformAfterSales() || {}
        const latestWork = latestAfterSales[id]
        if (latestWork) {
          const index = this.afterSales.findIndex((item) => item.id === id)
          if (index >= 0) this.afterSales[index] = latestWork
          else this.afterSales.unshift(latestWork)
        }
        const latestCatalog = readCatalogState()
        if (latestCatalog) this.applyCatalogState(latestCatalog)
        const latestOrders = readPlatformOrders() || {}
        const supplierOrderId = latestWork?.supplierOrderId
        if (supplierOrderId && latestOrders[supplierOrderId]) {
          const orderIndex = this.orders.findIndex((item) => item.id === supplierOrderId)
          if (orderIndex >= 0) this.orders[orderIndex] = latestOrders[supplierOrderId]
        }
        appendPlatformAuditLog({
          module: auditContext.module, action: auditContext.action, actorId: this.auth.accountId,
          actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: auditContext.targetType,
          targetId: id, result: 'success', operationId: pendingReceiptTask.operationId, metadata: { recoveryTaskId: pendingReceiptTask.id, refundId: receipt.refundId }
        })
        return true
      }
      if (work?.status === 'refunded') {
        const index = this.afterSales.findIndex((item) => item.id === id)
        if (index >= 0) this.afterSales[index] = work
        return true
      }
      if (receiptJournals.length || receiptTasks.length) {
        this.error = '退款回执恢复任务异常，请在恢复中心核验'
        recordFailure('provider-receipt-recovery-invalid')
        return false
      }
      if (!stable || !previous) {
        auditContext.validationMessage = '售后关联数据已更新，请刷新后重试'
        await this.executeAdminTransaction('afterSale.manage', auditContext, {
          operationId, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: {}, target: {}, validate: () => false, steps: []
        })
        return false
      }
      const linked = resolveAdminRefundContext(previous, id)
      if (!linked.ok) {
        auditContext.validationMessage = linked.message
        await this.executeAdminTransaction('afterSale.manage', auditContext, {
          operationId, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: {}, target: {}, validate: () => false, steps: []
        })
        return false
      }
      const activeWork = linked.value.work
      const { cOrder, amount } = linked.value
      const rejectedAttempts = (activeWork.history || []).filter((entry) => entry.action.startsWith('退款失败：')).length
      const providerOperationId = activeWork.status === 'refund-failed'
        ? `${operationId}:attempt:${rejectedAttempts + 1}`
        : operationId

      let providerResult: Awaited<ReturnType<ReturnType<typeof getPlatformProviders>['refund']['refundPayment']>>
      try {
        providerResult = await getPlatformProviders().refund.refundPayment({ transactionId: cOrder.providerTransactionId, amount, operationId: providerOperationId })
      } catch {
        this.error = '退款结果待确认，请重试查询'
        await this.executeAdminTransaction('afterSale.manage', auditContext, {
          operationId: `${providerOperationId}:unknown`, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: {}, target: {},
          auditResult: 'failure', auditReason: 'provider-result-unknown', steps: []
        })
        this.error = '退款结果待确认，请重试查询'
        return false
      }

      const now = new Date().toISOString()
      if (!providerResult.ok) {
        const nextWork: AfterSale = {
          ...activeWork, status: 'refund-failed', failureReason: providerResult.message,
          history: [...(activeWork.history || []), { time: now, action: `退款失败：${providerResult.message}`, operator: this.auth.name || '运营管理员' }]
        }
        const nextAfterSales = { ...previous.afterSales, [id]: nextWork }
        const result = await this.executeAdminTransaction('afterSale.manage', auditContext, {
          operationId: createId(`${providerOperationId}:failed:`),
          collections: [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
          original: { afterSales: previous.afterSales, auditAction: auditContext.action, auditResult: 'failure' },
          target: { afterSales: nextAfterSales, auditAction: auditContext.action, auditResult: 'failure' },
          recoveryHandlerKey: 'admin-after-sale-v1', recoverySchema: 'admin-after-sale-snapshot-v1',
          revisionChecks: [{ key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.token[PLATFORM_AFTERSALES_STORAGE_KEY] }],
          auditResult: 'failure', auditReason: `provider:${providerResult.code}`,
          steps: [{ key: 'after-sales', apply: () => writePlatformAfterSales(nextAfterSales), rollback: () => writePlatformAfterSales(previous.afterSales || {}) }]
        })
        if (result.ok) {
          const index = this.afterSales.findIndex((item) => item.id === id)
          if (index >= 0) this.afterSales[index] = nextWork
          else this.afterSales.unshift(nextWork)
          this.error = providerResult.message
        }
        return false
      }

      const refundId = providerResult.value?.refundId
      if (!refundId) {
        this.error = '退款回执缺少退款流水号，请立即人工核验'
        recordFailure('provider-receipt-invalid', providerOperationId)
        return false
      }
      const operator = this.auth.name || '运营管理员'
      const targetSnapshot = buildAdminRefundTarget(previous, id, refundId, now, operator)
      if (!targetSnapshot) {
        this.error = '退款本地目标快照生成失败，请立即人工核验'
        recordFailure('refund-target-invalid', providerOperationId)
        return false
      }
      const receipt = { operationId: providerOperationId, refundId }
      const original = { ...previous, auditAction: auditContext.action, receipt }
      const target = { ...targetSnapshot, auditAction: auditContext.action, receipt }
      const result = await this.executeAdminTransaction('afterSale.manage', auditContext, {
        operationId: providerOperationId,
        collections: [...ADMIN_REFUND_COLLECTIONS],
        original, target,
        recoveryHandlerKey: 'admin-after-sale-v1', recoverySchema: 'admin-after-sale-refund-receipt-v1',
        revisionChecks: Object.entries(stable.token).map(([key, expectedRevision]) => ({ key, expectedRevision })),
        steps: [
          { key: 'after-sales', apply: () => writePlatformAfterSales(targetSnapshot.afterSales || {}), rollback: () => writePlatformAfterSales(previous.afterSales || {}) },
          { key: 'catalog', apply: () => writeCatalogState(targetSnapshot.catalog!, previous.catalog!.revision), rollback: () => writeCatalogState(previous.catalog!) },
          { key: 'c-orders', apply: () => writeCOrders(targetSnapshot.cOrders || {}), rollback: () => writeCOrders(previous.cOrders || {}) },
          { key: 'c-commissions', apply: () => writeCCommissionRecords(targetSnapshot.commissions || []), rollback: () => writeCCommissionRecords(previous.commissions || []) },
          { key: 'platform-orders', apply: () => writePlatformOrders(targetSnapshot.platformOrders || {}), rollback: () => writePlatformOrders(previous.platformOrders || {}) }
        ]
      })
      if (!result.ok) {
        const queued = await persistAdminRefundReceiptRecovery({ id, operationId: providerOperationId, refundId, now, operator, fallbackOriginal: previous, fallbackTarget: targetSnapshot })
        this.error = queued ? '退款已成功，正在等待本地数据恢复' : '退款已成功，但恢复任务保存失败，请立即人工核验'
        return false
      }
      const nextWork = targetSnapshot.afterSales![id]
      const nextSupplierOrder = targetSnapshot.platformOrders![linked.value.supplierOrder.id]
      const index = this.afterSales.findIndex((item) => item.id === id)
      if (index >= 0) this.afterSales[index] = nextWork
      else this.afterSales.unshift(nextWork)
      const orderIndex = this.orders.findIndex((item) => item.id === nextSupplierOrder.id)
      if (orderIndex >= 0) this.orders[orderIndex] = nextSupplierOrder
      this.applyCatalogState(targetSnapshot.catalog!)
      return true
    },
    async addFarm(payload: FarmSavePayload, geocode: FarmGeocoder = defaultFarmGeocoder) {
      const mediaRevision = readPlatformCollectionRevision(PLATFORM_MEDIA_STORAGE_KEY)
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const address = resolveFarmAddress(payload)
      const createdFarm: FarmStore = {
        id: createId('F'), name: payload.name.trim(), contact: payload.contact?.trim(), contactPhone: payload.contactPhone?.trim(), region: address?.region || '', distance: 0,
        rating: payload.rating ?? 5, monthlySales: 0, averageSpend: payload.averageSpend ?? 0,
        status: payload.status ?? 'pending', selectedCount: 0, gmv: 0, image: normalizeMediaReference(payload.image) ?? { source: 'builtin', path: '/static/images/farmhouse.webp' },
        tags: payload.tags?.length ? payload.tags : ['新入驻'],
        city: address?.city || '湘西州',
        availability: 'bookable',
        address: address?.address || '', regionCode: address?.regionCode, structuredAddress: address?.structuredAddress, locationStatus: 'failed'
      }
      if (address) await updateFarmCoordinates(createdFarm, geocode)
      const rawPreviousMedia = readPlatformJson(PLATFORM_MEDIA_STORAGE_KEY)
      const previousMedia = cloneSeed(readPlatformMedia() ?? emptyPlatformMedia())
      const targetMedia = upsertPlatformFarm(previousMedia, createdFarm.id, createdFarm.image)
      const persistedEntities = readPlatformEntities()
      const previousEntities: PlatformEntities = cloneSeed(persistedEntities || { updatedAt: new Date(0).toISOString() })
      const targetEntities = { ...previousEntities, farms: { ...(previousEntities.farms || {}), [createdFarm.id]: createdFarm }, updatedAt: new Date().toISOString() }
      const result = await this.executeAdminTransaction('farm.manage', { module: 'farms', action: 'farm.create', targetType: 'farm', targetId: createdFarm.id, deniedMessage: '无权新增门店', validationMessage: '请填写门店名称和地址' }, {
        operationId: createId('OP-FARM'), collections: [PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { media: previousMedia, entities: persistedEntities }, target: { media: targetMedia, entities: targetEntities },
        revisionChecks: [
          { key: PLATFORM_MEDIA_STORAGE_KEY, expectedRevision: mediaRevision },
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision }
        ],
        validate: () => !!payload.name.trim() && !!address,
        steps: [
          { key: 'farm-media', apply: () => writePlatformMedia(targetMedia), rollback: () => restoreRawPlatformCollection(PLATFORM_MEDIA_STORAGE_KEY, rawPreviousMedia) },
          { key: 'farm-entity', apply: () => writePlatformEntities(targetEntities), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, persistedEntities) }
        ]
      })
      if (!result.ok) return false
      this.farms.unshift(createdFarm)
      return true
    },
    async updateFarm(id: string, payload: FarmSavePayload, geocode: FarmGeocoder = defaultFarmGeocoder) {
      const mediaRevision = readPlatformCollectionRevision(PLATFORM_MEDIA_STORAGE_KEY)
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const item = this.farms.find((farm) => farm.id === id)
      const itemIndex = this.farms.findIndex((farm) => farm.id === id)
      const address = item ? resolveFarmAddress(payload, item) : null
      const next = item && address ? { ...item, tags: [...item.tags] } : null
      let optimisticLocation = false
      if (next && address) {
        const locationInputChanged = item!.address !== address.address || item!.regionCode !== address.regionCode
        next.name = payload.name.trim()
        if (payload.contact !== undefined) next.contact = payload.contact.trim()
        if (payload.contactPhone !== undefined) next.contactPhone = payload.contactPhone.trim()
        next.region = address.region
        next.city = address.city || next.city
        next.address = address.address
        next.regionCode = address.regionCode
        next.structuredAddress = address.structuredAddress
        if (payload.tags?.length) next.tags = payload.tags
        if (payload.rating !== undefined) next.rating = payload.rating
        if (payload.averageSpend !== undefined) next.averageSpend = payload.averageSpend
        if (payload.status) next.status = payload.status
        if (payload.image !== undefined) next.image = normalizeMediaReference(payload.image) ?? { source: 'builtin', path: '/static/images/farmhouse.webp' }
        if (payload.forceGeocode || locationInputChanged) {
          const locating = updateFarmCoordinates(next, geocode)
          this.farms[itemIndex] = next
          optimisticLocation = true
          await locating
        }
      }
      const rawPreviousMedia = readPlatformJson(PLATFORM_MEDIA_STORAGE_KEY)
      const previousMedia = cloneSeed(readPlatformMedia() ?? emptyPlatformMedia())
      const targetMedia = next ? upsertPlatformFarm(previousMedia, next.id, next.image) : previousMedia
      const persistedEntities = readPlatformEntities()
      const previousEntities: PlatformEntities = cloneSeed(persistedEntities || { updatedAt: new Date(0).toISOString() })
      const targetEntities = next ? { ...previousEntities, farms: { ...(previousEntities.farms || {}), [id]: next }, updatedAt: new Date().toISOString() } : previousEntities
      const result = await this.executeAdminTransaction('farm.manage', { module: 'farms', action: 'farm.update', targetType: 'farm', targetId: id, deniedMessage: '无权修改门店', validationMessage: '农家乐不存在或名称、地址无效' }, {
        operationId: createId('OP-FARM'), collections: [PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { media: previousMedia, entities: persistedEntities }, target: { media: targetMedia, entities: targetEntities },
        revisionChecks: [
          { key: PLATFORM_MEDIA_STORAGE_KEY, expectedRevision: mediaRevision },
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision }
        ],
        validate: () => !!next && !!payload.name.trim() && !!address,
        steps: [
          { key: 'farm-media', apply: () => writePlatformMedia(targetMedia), rollback: () => restoreRawPlatformCollection(PLATFORM_MEDIA_STORAGE_KEY, rawPreviousMedia) },
          { key: 'farm-entity', apply: () => writePlatformEntities(targetEntities), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, persistedEntities) }
        ]
      })
      if (!result.ok || !next) {
        if (optimisticLocation && item) this.farms[itemIndex] = item
        return false
      }
      this.farms[itemIndex] = next
      return true
    },
    async addPromoter(payload: { name: string; level: string; type?: string; region?: string; status: Promoter['status'] }) {
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const accountRevision = readPlatformCollectionRevision(PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY)
      const promoter: Promoter = {
        id: createId('T'), name: payload.name.trim(), level: payload.level.trim() || '普通业务员', type: payload.type, region: payload.region?.trim() || undefined,
        fans: 0, orders: 0, gmv: 0, commission: 0, cumulativeCommission: 0, settled: false, status: payload.status
      }
      const persistedEntities = readPlatformEntities()
      const previousEntities: PlatformEntities = cloneSeed(persistedEntities || { updatedAt: new Date(0).toISOString() })
      const targetEntities = { ...previousEntities, promoters: { ...(previousEntities.promoters || {}), [promoter.id]: promoter }, updatedAt: new Date().toISOString() }
      const accountState = readPlatformPromoterAccountState()
      const previousAccounts = cloneSeed(accountState.accounts)
      const accounts = buildPromoterAccountSeeds([...this.promoters, promoter])
      const nextAccounts = mergePlatformPromoterAccounts(accounts, previousAccounts)
      const result = await this.executeAdminTransaction('promoter.manage', { module: 'promoters', action: 'promoter.create', targetType: 'promoter', targetId: promoter.id, deniedMessage: '无权新增业务员', validationMessage: '请填写业务员名称' }, {
        operationId: createId('OP-PROMOTER'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { entities: persistedEntities, accounts: previousAccounts }, target: { entities: targetEntities, accounts: nextAccounts },
        revisionChecks: [
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision },
          { key: PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision }
        ],
        validate: () => !!payload.name.trim(),
        steps: [
          { key: 'promoter-entity', apply: () => writePlatformEntities(targetEntities), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, persistedEntities) },
          { key: 'promoter-account', apply: () => writePlatformPromoterAccounts(nextAccounts, accountState.revision), rollback: () => writePlatformPromoterAccounts(previousAccounts, accountState.revision + 1) }
        ]
      })
      if (!result.ok) return false
      this.promoters.unshift(promoter)
      return true
    },
    async updatePromoter(id: string, payload: { name: string; level: string; type?: string; region?: string; status: Promoter['status'] }) {
      const entityRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const accountRevision = readPlatformCollectionRevision(PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY)
      const persistedEntities = readPlatformEntities()
      const item = persistedEntities?.promoters?.[id] || this.promoters.find((promoter) => promoter.id === id)
      const next = item ? { ...item, name: payload.name.trim(), level: payload.level.trim() || item.level, type: payload.type || item.type, region: payload.region !== undefined ? (payload.region.trim() || undefined) : item.region, status: payload.status || item.status } : null
      const previousEntities: PlatformEntities = cloneSeed(persistedEntities || { updatedAt: new Date(0).toISOString() })
      const targetEntities = next ? { ...previousEntities, promoters: { ...(previousEntities.promoters || {}), [id]: next }, updatedAt: new Date().toISOString() } : previousEntities
      const accountState = readPlatformPromoterAccountState()
      const seededAccounts = mergePlatformPromoterAccounts(buildPromoterAccountSeeds(this.promoters), accountState.accounts)
      const previousAccounts = cloneSeed(accountState.accounts)
      const nextAccounts = next ? seededAccounts.map((account) => account.promoterId === id ? { ...account, name: next.name, level: next.level, type: next.type || '', status: next.status } : account) : seededAccounts
      const result = await this.executeAdminTransaction('promoter.manage', { module: 'promoters', action: 'promoter.update', targetType: 'promoter', targetId: id, deniedMessage: '无权修改业务员', validationMessage: '业务员不存在或名称为空' }, {
        operationId: createId('OP-PROMOTER'), collections: [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { entities: persistedEntities, accounts: previousAccounts }, target: { entities: targetEntities, accounts: nextAccounts },
        revisionChecks: [
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: entityRevision },
          { key: PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision }
        ],
        validate: () => !!next && !!payload.name.trim(),
        steps: [
          { key: 'promoter-entity', apply: () => writePlatformEntities(targetEntities), rollback: () => restoreRawPlatformCollection(PLATFORM_ENTITIES_STORAGE_KEY, persistedEntities) },
          { key: 'promoter-account', apply: () => writePlatformPromoterAccounts(nextAccounts, accountState.revision), rollback: () => writePlatformPromoterAccounts(previousAccounts, accountState.revision + 1) }
        ]
      })
      if (!result.ok || !item || !next) return false
      Object.assign(item, next)
      return true
    },
    async settleCommissions() {
      const shares = readShareRecords() ?? []
      const unsettled = shares.filter((item) => item.role === 'promoter' && !item.settled && item.status !== 'reversed').sort((a, b) => a.id.localeCompare(b.id))
      const byPromoter = new Map<string, { name: string; amount: number }>()
      unsettled.forEach((item) => {
        const key = item.promoterId || 'T001'
        const entry = byPromoter.get(key) || { name: this.promoters.find((p) => p.id === key)?.name || key, amount: 0 }
        entry.amount = Math.round((entry.amount + item.amount) * 100) / 100
        byPromoter.set(key, entry)
      })
      const amount = Math.round(unsettled.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
      const sourceHash = stableAdminSourceHash(unsettled.map((item) => item.id))
      const createdAt = stableAdminCreatedAt(unsettled.map((item) => item.createdAt))
      const settlement: CommissionSettlementRecord = {
        id: `CS-${sourceHash}`, promoterIds: [...byPromoter.keys()].sort(), amount, createdAt,
        items: [...byPromoter.entries()].map(([promoterId, entry]) => ({ promoterId, promoterName: entry.name, amount: entry.amount }))
      }
      const previousSettlements = readPlatformCommissionSettlements()
      const nextSettlements = cloneSeed(previousSettlements)
      for (const [promoterId, entry] of byPromoter) {
        nextSettlements[promoterId] = { commission: entry.amount, settled: true, settledAt: createdAt }
      }
      const unsettledIds = new Set(unsettled.map((item) => item.id))
      const nextShares = shares.map((item) => unsettledIds.has(item.id) ? { ...item, settled: true, status: 'settled' as const } : item)
      const previousHistory = readPlatformCommissionSettlementRecords() || {}
      const nextHistory = { ...previousHistory, [settlement.id]: settlement }
      const operationId = `OP-ADMIN-COMMISSION-SETTLE-${sourceHash}`
      const result = await this.executeAdminTransaction('commission.manage', { module: 'commissions', action: 'commission.settle', targetType: 'commission-settlement', targetId: settlement.id, metadata: { shareIds: unsettled.map((item) => item.id), amount }, deniedMessage: '无权执行佣金结算' }, {
        operationId,
        collections: [PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { settlements: previousSettlements, shares, history: previousHistory, auditAction: 'commission.settle' },
        target: { settlements: nextSettlements, shares: nextShares, history: nextHistory, auditAction: 'commission.settle' },
        recoveryHandlerKey: 'admin-commission-settlement-v1',
        recoverySchema: 'admin-commission-settlement-snapshot-v1',
        revisionChecks: [
          { key: PLATFORM_SETTLEMENTS_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_SETTLEMENTS_STORAGE_KEY) },
          { key: PLATFORM_SHARES_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_SHARES_STORAGE_KEY) },
          { key: PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY) }
        ],
        validate: () => unsettled.length > 0 && amount !== 0,
        steps: [
          { key: 'promoter-settlements', apply: () => writePlatformCommissionSettlements(nextSettlements), rollback: () => writePlatformCommissionSettlements(previousSettlements) },
          { key: 'share-records', apply: () => writeShareRecords(nextShares), rollback: () => writeShareRecords(shares) },
          { key: 'commission-settlement-history', apply: () => writePlatformCommissionSettlementRecords(nextHistory), rollback: () => writePlatformCommissionSettlementRecords(previousHistory) }
        ]
      })
      if (!result.ok) return false
      this.commissionSettlementRecords = [settlement, ...this.commissionSettlementRecords.filter((item) => item.id !== settlement.id)]
      byPromoter.forEach((entry, promoterId) => {
        const promoter = this.promoters.find((p) => p.id === promoterId)
        if (promoter) { promoter.commission = 0; promoter.settled = true }
      })
      this.lastSettledAt = createdAt
      return true
    },
    async settleSuppliers(ids: string[]) {
      const suppliers = this.suppliers.filter((item) => ids.includes(item.id))
      const supplierIds = suppliers.map((item) => item.id)
      const previousOrders = { ...Object.fromEntries(this.orders.map((item) => [item.id, cloneSeed(item)])), ...(readPlatformOrders() || {}) }
      const orders = Object.values(previousOrders).filter((item) => item.status === 'delivered' && !item.settlementId && item.supplierId && supplierIds.includes(item.supplierId))
      const sourceHash = stableAdminSourceHash(orders.map((item) => item.id))
      const createdAt = stableAdminCreatedAt(orders.map((item) => item.createdAt))
      const items = suppliers.map((supplier) => {
        const supplierOrders = orders.filter((order) => order.supplierId === supplier.id)
        return { supplierId: supplier.id, supplierName: supplier.name, orderIds: supplierOrders.map((order) => order.id), amount: Math.round(supplierOrders.reduce((sum, order) => sum + order.amount, 0) * 100) / 100 }
      }).filter((item) => item.orderIds.length)
      const id = `ST-${sourceHash}`
      const settlement: SupplierSettlementRecord = { id, period: createdAt.slice(0, 7), supplierIds: items.map((item) => item.supplierId), orderIds: orders.map((item) => item.id), amount: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100, createdAt, items, status: 'pending' }
      const nextOrders = { ...previousOrders }
      orders.forEach((item) => { nextOrders[item.id] = { ...item, settlementId: id } })
      const previousSettlements = readPlatformSupplierSettlements() || {}
      const nextSettlements = { ...previousSettlements, [id]: settlement }
      const operationId = `OP-ADMIN-SUPPLIER-SETTLE-${sourceHash}`
      const result = await this.executeAdminTransaction('commission.manage', { module: 'commissions', action: 'supplier.settle', targetType: 'supplier-settlement', targetId: id, metadata: { orderIds: orders.map((item) => item.id), amount: settlement.amount }, deniedMessage: '无权执行供应商结算' }, {
        operationId,
        collections: [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { orders: previousOrders, settlements: previousSettlements, auditAction: 'supplier.settle' },
        target: { orders: nextOrders, settlements: nextSettlements, auditAction: 'supplier.settle' },
        recoveryHandlerKey: 'admin-supplier-settlement-v1',
        recoverySchema: 'admin-supplier-settlement-snapshot-v1',
        revisionChecks: [
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY) },
          { key: PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY) }
        ],
        validate: () => suppliers.length > 0 && orders.length > 0 && items.length > 0,
        steps: [
          { key: 'supplier-settlement-history', apply: () => writePlatformSupplierSettlements(nextSettlements), rollback: () => writePlatformSupplierSettlements(previousSettlements) },
          { key: 'supplier-orders', apply: () => writePlatformOrders(nextOrders), rollback: () => writePlatformOrders(previousOrders) }
        ]
      })
      if (!result.ok) {
        if (result.code === 'validation_failed' && suppliers.length > 0 && orders.length === 0) this.error = ''
        return false
      }
      this.supplierSettlementRecords = [settlement, ...this.supplierSettlementRecords.filter((item) => item.id !== settlement.id)]
      this.orders = this.orders.map((item) => nextOrders[item.id] || item)
      return true
    },
    async updateCommissionRule(id: string, rate: number, enabled: boolean) {
      rate = round2(rate)
      const persistedRules = readPlatformCommissionRules() || cloneSeed(this.commissionRules)
      const item = persistedRules.find((rule) => rule.id === id)
      const next = item ? { ...item, rate, enabled, updatedAt: new Date().toLocaleString('zh-CN') } : null
      const nextRules = next ? persistedRules.map((rule) => rule.id === id ? next : rule) : persistedRules
      const operationId = `OP-ADMIN-COMMISSION-RULE-${id}-${rate}-${enabled ? '1' : '0'}`
      const result = await this.executeAdminTransaction('commission.manage', { module: 'commissions', action: 'commission.rule.update', targetType: 'commission-rule', targetId: id, metadata: { rate, enabled }, deniedMessage: '无权修改佣金规则' }, {
        operationId,
        collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
        original: { rules: persistedRules, auditAction: 'commission.rule.update' },
        target: { rules: nextRules, auditAction: 'commission.rule.update' },
        recoveryHandlerKey: 'admin-commission-rule-v1',
        recoverySchema: 'admin-commission-rule-snapshot-v1',
        revisionChecks: [{ key: PLATFORM_COMMISSION_RULES_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_COMMISSION_RULES_STORAGE_KEY) }],
        validate: () => !!next && rate > 0 && rate <= 100,
        steps: [{ key: 'commission-rules', apply: () => writePlatformCommissionRules(nextRules), rollback: () => writePlatformCommissionRules(persistedRules) }]
      })
      if (!result.ok || !next) return false
      const memoryItem = this.commissionRules.find((rule) => rule.id === id)
      if (memoryItem) Object.assign(memoryItem, next)
      else this.commissionRules.push(next)
      return true
    },
    async saveShareConfig(config: ShareConfig) {
      const previous = readShareConfig()
      const rawPrevious = readPlatformJson(PLATFORM_SHARE_CONFIG_STORAGE_KEY)
      const revision = readPlatformCollectionRevision(PLATFORM_SHARE_CONFIG_STORAGE_KEY)
      const operationId = createId('OP-SHARE-CONFIG')
      const valid = [config.promoterRate, config.staffRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
      const result = await this.executeAdminTransaction('commission.manage', {
        module: 'commissions', action: 'commission.config.update', targetType: 'share-config', targetId: 'default',
        deniedMessage: '无权修改消费分成配置', validationMessage: '消费分成比例需为0-100', metadata: config
      }, {
        operationId, collections: [PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: previous, target: config,
        revisionChecks: [{ key: PLATFORM_SHARE_CONFIG_STORAGE_KEY, expectedRevision: revision }],
        validate: () => valid,
        steps: [{ key: 'share-config', apply: () => writeShareConfig(config), rollback: () => restoreRawPlatformCollection(PLATFORM_SHARE_CONFIG_STORAGE_KEY, rawPrevious) }]
      })
      return result.ok
    },
    async reviewWithdrawal(id: string, status: WithdrawalRequestStatus, note?: string, permission: AdminPermissionCode = 'withdrawal.review') {
      const rawWithdrawals = readPlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY)
      const withdrawals = readPlatformWithdrawals() ?? {}
      const current = withdrawals[id]
      const revision = readPlatformCollectionRevision(PLATFORM_WITHDRAWALS_STORAGE_KEY)
      const next = current && current.status === 'pending' && (status === 'approved' || status === 'rejected')
        ? { ...current, status, reviewedAt: new Date().toISOString(), operator: this.auth.name || this.auth.account || 'admin', reviewedNote: note?.trim() || undefined, revision: (current.revision || 0) + 1 }
        : null
      const target = next ? { ...withdrawals, [id]: next } : withdrawals
      const result = await this.executeAdminTransaction(permission, {
        module: 'withdrawals', action: `withdrawal.${status}`, targetType: 'withdrawal', targetId: id,
        deniedMessage: '无权审核提现', validationMessage: '提现申请已处理或不存在', metadata: { note: next?.reviewedNote }
      }, {
        operationId: createId('OP-WITHDRAWAL-REVIEW'), collections: [PLATFORM_WITHDRAWALS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: withdrawals, target,
        revisionChecks: [{ key: PLATFORM_WITHDRAWALS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!next,
        steps: [{ key: 'withdrawal', apply: () => writePlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY, target, revision), rollback: () => restoreRawPlatformCollection(PLATFORM_WITHDRAWALS_STORAGE_KEY, rawWithdrawals) }]
      })
      return result.ok ? next : null
    },
    async resolveRecoveryTask(id: string, verification: { note: string; outcome: 'committed' | 'aborted' }) {
      const result = await this.executeAdminRecoveryAction({
        module: 'recovery', action: 'recovery.resolve', targetType: 'recovery-task', targetId: id,
        deniedMessage: '无权处理恢复任务', metadata: verification
      }, async (audit) => {
        const task = readPlatformRecoveryQueue().find((item) => item.id === id)
        if (!task || task.status !== 'pending') return { ok: false, code: 'not-found', message: '恢复任务不存在或已处理' }
        const actor = this.auth.name || this.auth.account || 'admin'
        if (!task.handlerKey) {
          if (!verification.note.trim()) return { ok: false, code: 'verification-required', message: '旧恢复任务必须填写人工核验说明' }
          return resolvePlatformRecoveryTask(id, { resolvedBy: actor, note: verification.note, outcome: verification.outcome, audit })
            ? { ok: true, value: task }
            : { ok: false, code: 'manual-resolution-failed', message: '人工核验结果保存失败' }
        }
        return retryPlatformRecoveryTask(id, actor, audit)
      })
      return result.ok
    },
    markNotificationsRead() {
      this.notificationsRead = true
    },
    async recordExport(module: string, count: number) {
      const createdAt = new Date().toLocaleString('zh-CN')
      const operationId = createId('OP-REPORT-EXPORT')
      const result = await this.executeAdminTransaction('report.export', { module: 'reports', action: 'report.export', targetType: 'report', targetId: module, deniedMessage: '无权导出报表', metadata: { module, count } }, {
        operationId, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: { module, count }, steps: []
      })
      if (!result.ok) return false
      this.exportRecords.unshift({ id: createId('EX'), module, count, createdAt })
      return true
    },
    async recordAuditExport(module: string, count: number) {
      const createdAt = new Date().toLocaleString('zh-CN')
      const operationId = createId('OP-AUDIT-EXPORT')
      const result = await this.executeAdminTransaction('audit.export', { module: 'audit', action: 'audit.export', targetType: 'audit-log', targetId: module, deniedMessage: '无权导出操作日志', metadata: { module, count } }, {
        operationId, collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: { module, count }, steps: []
      })
      if (!result.ok) return false
      this.exportRecords.unshift({ id: createId('EX'), module, count, createdAt })
      return true
    },
    currentAdminRole(): AdminRole | undefined {
      return this.adminRoles.find((role) => role.id === this.auth.roleId) || readPlatformAdminRoles().find((role) => role.id === this.auth.roleId)
    },
    canMenu(menu: AdminMenuKey) {
      return hasAdminMenu(this.currentAdminRole(), menu)
    },
    can(permission: AdminPermissionCode) {
      return hasAdminPermission(this.currentAdminRole(), permission)
    },
    async createAdminRole(payload: { code: string; name: string; menuPermissions: AdminMenuKey[]; actionPermissions: AdminPermissionCode[] }): Promise<{ ok: boolean; error?: string }> {
      if (this.auth.roleId !== ADMIN_SUPER_ROLE_ID) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'roles', action: 'admin.role.create', actorId: this.auth.accountId || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, result: 'failure', reason: 'permission-denied', operationId: createId('OP-ADMIN-ROLE') })
        this.error = auditRecovery?.message || '无权创建角色'
        return { ok: false, error: this.error }
      }
      const code = payload.code.trim()
      const name = payload.name.trim()
      const revision = readPlatformCollectionRevision(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const roles = readPlatformAdminRoles()
      const menuPermissions = [...new Set(payload.menuPermissions)]
      const now = new Date().toISOString()
      const role: AdminRole = { id: createId('AR'), code, name, menuPermissions, actionPermissions: rolePermissionsForMenus(menuPermissions, payload.actionPermissions), enabled: true, system: false, createdAt: now, updatedAt: now }
      const nextRoles = [...roles, role]
      const operationId = createId('OP-ADMIN-ROLE')
      const invalidMessage = !code || !name ? '请填写角色编码和名称' : '角色编码已存在'
      const result = await this.executeAdminTransaction('admin.role.create', {
        module: 'roles', action: 'admin.role.create', targetType: 'admin-role', targetId: role.id,
        deniedMessage: '无权创建角色', validationMessage: invalidMessage,
        metadata: { code, name, menuPermissions: role.menuPermissions, actionPermissions: role.actionPermissions }
      }, {
        operationId, collections: [PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: roles, target: nextRoles,
        revisionChecks: [{ key: PLATFORM_ADMIN_ROLES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!code && !!name && !roles.some((item) => item.code === code),
        steps: [{ key: 'admin-role', apply: () => writePlatformAdminRoles(nextRoles), rollback: () => writePlatformAdminRoles(roles) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '角色保存失败，请重试' }
      this.adminRoles = nextRoles
      return { ok: true }
    },
    async updateAdminRole(id: string, payload: { name?: string; menuPermissions?: AdminMenuKey[]; actionPermissions?: AdminPermissionCode[]; enabled?: boolean }): Promise<{ ok: boolean; error?: string }> {
      const revision = readPlatformCollectionRevision(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const roles = readPlatformAdminRoles()
      const role = roles.find((item) => item.id === id)
      const changesPermissions = Object.prototype.hasOwnProperty.call(payload, 'menuPermissions') || Object.prototype.hasOwnProperty.call(payload, 'actionPermissions')
      const validationMessage = changesPermissions ? '权限分配请使用独立权限接口' : !role ? '角色不存在' : role.id === ADMIN_SUPER_ROLE_ID ? '超级管理员角色不可修改' : ''
      const nextRole: AdminRole | undefined = role ? { ...role, name: payload.name?.trim() || role.name, enabled: payload.enabled ?? role.enabled, updatedAt: new Date().toISOString() } : undefined
      const nextRoles = nextRole ? roles.map((item) => item.id === id ? nextRole : item) : roles
      const rawRoles = readPlatformJson(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const operationId = createId('OP-ADMIN-ROLE')
      const result = await this.executeAdminTransaction('admin.role.update', {
        module: 'roles', action: 'admin.role.update', targetType: 'admin-role', targetId: id,
        deniedMessage: '无权修改角色', validationMessage, requiresSuperAdmin: true,
        metadata: nextRole ? { name: nextRole.name, enabled: nextRole.enabled } : undefined
      }, {
        operationId, collections: [PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: roles, target: nextRoles,
        revisionChecks: [{ key: PLATFORM_ADMIN_ROLES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !validationMessage && !!nextRole,
        steps: [{ key: 'admin-role', apply: () => writePlatformAdminRoles(nextRoles), rollback: () => restoreRawPlatformCollection(PLATFORM_ADMIN_ROLES_STORAGE_KEY, rawRoles) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '角色保存失败，请重试' }
      this.adminRoles = nextRoles
      return { ok: true }
    },
    async updateAdminRolePermissions(id: string, payload: { menuPermissions: AdminMenuKey[]; actionPermissions: AdminPermissionCode[] }): Promise<{ ok: boolean; error?: string }> {
      if (this.auth.roleId !== ADMIN_SUPER_ROLE_ID) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'roles', action: 'admin.role.permissions', actorId: this.auth.accountId || 'anonymous', actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'admin-role', targetId: id, result: 'failure', reason: 'permission-denied', operationId: createId('OP-ADMIN-ROLE-PERMISSIONS') })
        this.error = auditRecovery?.message || '无权分配角色权限'
        return { ok: false, error: this.error }
      }
      const revision = readPlatformCollectionRevision(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const roles = readPlatformAdminRoles()
      const role = roles.find((item) => item.id === id)
      const menuPermissions = [...new Set(payload.menuPermissions)]
      const nextRole: AdminRole | undefined = role ? { ...role, menuPermissions, actionPermissions: rolePermissionsForMenus(menuPermissions, payload.actionPermissions), updatedAt: new Date().toISOString() } : undefined
      const nextRoles = nextRole ? roles.map((item) => item.id === id ? nextRole : item) : roles
      const operationId = createId('OP-ADMIN-ROLE-PERMISSIONS')
      const result = await this.executeAdminTransaction('admin.role.permissions', {
        module: 'roles', action: 'admin.role.permissions', targetType: 'admin-role', targetId: id,
        deniedMessage: '无权分配角色权限', validationMessage: !role ? '角色不存在' : '超级管理员角色不可修改',
        metadata: nextRole ? { menuPermissions: nextRole.menuPermissions, actionPermissions: nextRole.actionPermissions } : undefined
      }, {
        operationId, collections: [PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: roles, target: nextRoles,
        revisionChecks: [{ key: PLATFORM_ADMIN_ROLES_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !!nextRole && nextRole.id !== ADMIN_SUPER_ROLE_ID,
        steps: [{ key: 'admin-role', apply: () => writePlatformAdminRoles(nextRoles), rollback: () => writePlatformAdminRoles(roles) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '角色权限保存失败，请重试' }
      this.adminRoles = nextRoles
      return { ok: true }
    },
    async createAdminAccount(payload: { account: string; password: string; name: string; roleId: string }): Promise<{ ok: boolean; error?: string }> {
      const account = payload.account.trim()
      const name = payload.name.trim()
      const accountRevision = readPlatformCollectionRevision(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const roleRevision = readPlatformCollectionRevision(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const initialAccounts = readPlatformAdminAccounts()
      const initialRole = readPlatformAdminRoles().find((item) => item.id === payload.roleId && item.enabled)
      const validationMessage = !account || !name ? '请填写账号和姓名'
        : payload.password.length < 6 || payload.password.length > 20 ? '密码需6-20位'
          : !initialRole ? '请选择有效角色'
            : initialAccounts.some((item) => item.account === account) ? '后台账号已存在' : ''
      const now = new Date().toISOString()
      const created: AdminAccount = { id: createId('AA'), account, password: payload.password, name, roleId: payload.roleId, enabled: true, createdAt: now, updatedAt: now }
      const accounts: AdminAccount[] = []
      const nextAccounts: AdminAccount[] = []
      let rawAccounts: unknown
      const operationId = createId('OP-ADMIN-ACCOUNT')
      const result = await this.executeAdminTransaction('admin.account.create', {
        module: 'accounts', action: 'admin.account.create', targetType: 'admin-account', targetId: created.id,
        deniedMessage: '无权创建后台账号', validationMessage, requiresSuperAdmin: true,
        metadata: { account, name, roleId: payload.roleId, password: '已设置' }
      }, {
        operationId, collections: [PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: accounts, target: nextAccounts,
        revisionChecks: [
          { key: PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision },
          { key: PLATFORM_ADMIN_ROLES_STORAGE_KEY, expectedRevision: roleRevision }
        ],
        validate: () => !validationMessage,
        validateInLock: () => {
          const lockedAccounts = readPlatformAdminAccounts()
          const lockedRole = readPlatformAdminRoles().find((item) => item.id === payload.roleId && item.enabled)
          if (!lockedRole || lockedAccounts.some((item) => item.account === account)) return false
          accounts.splice(0, accounts.length, ...lockedAccounts)
          nextAccounts.splice(0, nextAccounts.length, ...lockedAccounts, { ...created, roleId: lockedRole.id })
          rawAccounts = readPlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
          return true
        },
        steps: [{ key: 'admin-account', apply: () => writePlatformAdminAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, rawAccounts) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '后台账号保存失败，请重试' }
      this.adminAccounts = nextAccounts
      return { ok: true }
    },
    async updateAdminAccount(id: string, payload: { account?: string; password?: string; name?: string; roleId?: string; enabled?: boolean }): Promise<{ ok: boolean; error?: string }> {
      const accountRevision = readPlatformCollectionRevision(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const roleRevision = readPlatformCollectionRevision(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
      const initialAccounts = readPlatformAdminAccounts()
      const current = initialAccounts.find((item) => item.id === id)
      const roles = readPlatformAdminRoles()
      const roleId = payload.roleId ?? current?.roleId ?? ''
      const role = roles.find((item) => item.id === roleId && item.enabled)
      const enabledSuperCount = initialAccounts.filter((item) => item.enabled && item.roleId === ADMIN_SUPER_ROLE_ID).length
      const account = payload.account?.trim() || current?.account || ''
      const name = payload.name?.trim() || current?.name || ''
      const password = payload.password ?? current?.password ?? ''
      const validationMessage = Object.prototype.hasOwnProperty.call(payload, 'enabled') ? '账号资料修改不能变更启用状态'
        : !current ? '后台账号不存在'
          : !role ? '请选择有效角色'
            : (current.roleId === ADMIN_SUPER_ROLE_ID || roleId === ADMIN_SUPER_ROLE_ID) && this.auth.roleId !== ADMIN_SUPER_ROLE_ID ? '无权操作超级管理员账号'
              : current.enabled && current.roleId === ADMIN_SUPER_ROLE_ID && roleId !== ADMIN_SUPER_ROLE_ID && enabledSuperCount <= 1 ? '不能停用或降级最后一个超级管理员'
                : !account || !name ? '请填写账号和姓名'
                  : password.length < 6 || password.length > 20 ? '密码需6-20位'
                    : initialAccounts.some((item) => item.id !== id && item.account === account) ? '后台账号已存在' : ''
      let nextAccount: AdminAccount | undefined
      const accounts: AdminAccount[] = []
      const nextAccounts: AdminAccount[] = []
      let rawAccounts: unknown
      const operationId = createId('OP-ADMIN-ACCOUNT')
      const result = await this.executeAdminTransaction('admin.account.update', {
        module: 'accounts', action: 'admin.account.update', targetType: 'admin-account', targetId: id,
        deniedMessage: '无权修改后台账号', validationMessage,
        metadata: current ? { account, name, roleId, password: payload.password ? '已修改' : undefined } : undefined
      }, {
        operationId, collections: [PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: accounts, target: nextAccounts,
        revisionChecks: [
          { key: PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, expectedRevision: accountRevision },
          { key: PLATFORM_ADMIN_ROLES_STORAGE_KEY, expectedRevision: roleRevision }
        ],
        validate: () => !validationMessage && !!current,
        validateInLock: () => {
          const lockedAccounts = readPlatformAdminAccounts()
          const lockedCurrent = lockedAccounts.find((item) => item.id === id)
          const lockedRole = readPlatformAdminRoles().find((item) => item.id === roleId && item.enabled)
          const lockedEnabledSuperCount = lockedAccounts.filter((item) => item.enabled && item.roleId === ADMIN_SUPER_ROLE_ID).length
          if (!lockedCurrent || !lockedRole
            || lockedAccounts.some((item) => item.id !== id && item.account === account)
            || lockedCurrent.enabled && lockedCurrent.roleId === ADMIN_SUPER_ROLE_ID && roleId !== ADMIN_SUPER_ROLE_ID && lockedEnabledSuperCount <= 1) return false
          nextAccount = { ...lockedCurrent, account, name, password, roleId: lockedRole.id, updatedAt: new Date().toISOString() }
          accounts.splice(0, accounts.length, ...lockedAccounts)
          nextAccounts.splice(0, nextAccounts.length, ...lockedAccounts.map((item) => item.id === id ? nextAccount! : item))
          rawAccounts = readPlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
          return true
        },
        steps: [{ key: 'admin-account', apply: () => writePlatformAdminAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, rawAccounts) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '后台账号保存失败，请重试' }
      this.adminAccounts = nextAccounts
      return { ok: true }
    },
    async setAdminAccountEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
      const revision = readPlatformCollectionRevision(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const accounts = readPlatformAdminAccounts()
      const current = accounts.find((item) => item.id === id)
      const enabledSuperCount = accounts.filter((item) => item.enabled && item.roleId === ADMIN_SUPER_ROLE_ID).length
      const validationMessage = !current ? '后台账号不存在'
        : !enabled && current.roleId === ADMIN_SUPER_ROLE_ID && enabledSuperCount <= 1 ? '不能停用最后一个超级管理员'
          : current.roleId === ADMIN_SUPER_ROLE_ID && this.auth.roleId !== ADMIN_SUPER_ROLE_ID ? '无权操作超级管理员账号' : ''
      const nextAccount: AdminAccount | undefined = current ? { ...current, enabled, updatedAt: new Date().toISOString() } : undefined
      const nextAccounts = nextAccount ? accounts.map((item) => item.id === id ? nextAccount : item) : accounts
      const rawAccounts = readPlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const operationId = createId('OP-ADMIN-ACCOUNT-STATUS')
      const result = await this.executeAdminTransaction('admin.account.status', {
        module: 'accounts', action: enabled ? 'admin.account.enable' : 'admin.account.disable', targetType: 'admin-account', targetId: id,
        deniedMessage: '无权启停后台账号', validationMessage, metadata: current ? { account: current.account, enabled } : { enabled }
      }, {
        operationId, collections: [PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: accounts, target: nextAccounts,
        revisionChecks: [{ key: PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }],
        validate: () => !validationMessage && !!nextAccount,
        steps: current?.enabled === enabled ? [] : [{ key: 'admin-account', apply: () => writePlatformAdminAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, rawAccounts) }]
      })
      if (!result.ok) return { ok: false, error: this.error || '后台账号状态保存失败，请重试' }
      this.adminAccounts = nextAccounts
      return { ok: true }
    },
    async login(account: string, password: string) {
      this.error = ''
      if (!seedPlatformAdminSecurity()) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'auth', action: 'admin.login', actorId: account.trim() || 'anonymous', result: 'failure', reason: 'security-seed-failed', operationId: createId('OP-ADMIN-LOGIN') })
        this.error = auditRecovery?.message || '登录数据初始化失败，请重试'
        return false
      }
      const revision = readPlatformCollectionRevision(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const roles = readPlatformAdminRoles()
      const accounts = readPlatformAdminAccounts()
      const result = authenticateAdmin(accounts, roles, account, password)
      if (!result.ok) {
        const auditRecovery = recoverAdminFailureAudit({ module: 'auth', action: 'admin.login', actorId: account.trim() || 'anonymous', result: 'failure', reason: result.reason, operationId: createId('OP-ADMIN-LOGIN') })
        this.error = auditRecovery?.message || (result.reason === 'inactive' ? '账号或角色已停用，请联系超级管理员' : '账号或密码错误')
        return false
      }
      const now = new Date().toISOString()
      const nextAccount = { ...result.account, lastLoginAt: now, updatedAt: now }
      const nextAccounts = accounts.map((item) => item.id === nextAccount.id ? nextAccount : item)
      const rawAccounts = readPlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
      const operationId = createId('OP-ADMIN-LOGIN')
      const persisted = await this.executeAdminTransaction(null, {
        module: 'auth', action: 'admin.login', targetType: 'admin-account', targetId: nextAccount.id,
        actor: { id: nextAccount.id, name: nextAccount.name, role: result.role.code }
      }, {
        operationId, collections: [PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: accounts, target: nextAccounts,
        revisionChecks: [{ key: PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, expectedRevision: revision }],
        steps: [{ key: 'admin-account', apply: () => writePlatformAdminAccounts(nextAccounts), rollback: () => restoreRawPlatformCollection(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, rawAccounts) }]
      })
      if (!persisted.ok) return false
      this.adminRoles = roles
      this.adminAccounts = nextAccounts
      this.auth = { isLoggedIn: true, account: nextAccount.account, accountId: nextAccount.id, roleId: result.role.id, roleCode: result.role.code, name: nextAccount.name }
      return true
    },
    logout() {
      if (this.auth.isLoggedIn) appendPlatformAuditLog({ module: 'auth', action: 'admin.logout', actorId: this.auth.accountId, actorName: this.auth.name, actorRole: this.auth.roleCode, targetType: 'admin-account', targetId: this.auth.accountId, result: 'success' })
      this.auth = { isLoggedIn: false, account: '', accountId: '', roleId: '', roleCode: '', name: '' }
    }
  }
})
