import type {
  AfterSale,
  CatalogState,
  CommissionLedgerEntry,
  FarmStore,
  Promoter,
  StoreAccount,
  Supplier,
  SupplierSettlementRecord,
  VoucherOrder
} from './index'
import { dashboardRegion, dashboardRegionChildren, isDashboardRegionCode, isResolvedFarmLocation } from './regions'
import { isValidChinaCoordinate } from './geocoding'

export type DashboardRole = 'leader' | 'regulator' | 'industry_service'
export type DashboardModule = 'overview' | 'regional-comparison' | 'regulatory-monitoring' | 'industry-empowerment'

export interface DashboardPrincipal {
  id: string
  name: string
  role: DashboardRole
  regionCodes: string[]
  status: 'active' | 'disabled'
}

export interface DashboardRange {
  start: string
  end: string
}

export interface DashboardBuildOptions {
  principal: DashboardPrincipal
  range: DashboardRange
  now?: Date
}

export interface DashboardCOrder {
  id: string
  farmId?: string
  amount: number
  status: string
  createdAt: string
  items: Array<{ productId: string; quantity: number }>
  subOrders?: Array<{ id?: string; amount?: number; afterSale?: { status: string } }>
  dataOrigin?: 'dashboard_demo'
}



export type DashboardVoucherOrder = VoucherOrder & { dataOrigin?: 'dashboard_demo' }

export interface DashboardFulfillmentOrder {
  id: string
  farmId?: string
  customer?: string
  amount: number
  status: string
  createdAt: string
  supplierId?: string
  items?: Array<{ productId: string; quantity: number }>
  supplierFulfillment?: {
    status?: string
    shipType?: 'driver' | 'courier'
    shortages?: Array<{ shortage: number; handled?: boolean }>
    trackingNo?: string
    updatedAt?: string
  }
  dataOrigin?: 'dashboard_demo'
}

export type DashboardDemoDataset =
  | 'consumerOrders'
  | 'vouchers'
  | 'afterSales'
  | 'fulfillmentOrders'
  | 'supplierSettlements'
  | 'commissionLedger'

export interface DashboardDemoSupplementInfo {
  enabled: boolean
  datasets: DashboardDemoDataset[]
  recordCount: number
  generatedAt: string
}

export type DashboardDataDomain = 'farms' | 'accounts' | 'catalog' | 'orders' | 'vouchers' | 'afterSales' | 'settlements'

export interface DashboardDataFreshness {
  domain: DashboardDataDomain
  updatedAt?: string
  stale: boolean
}

export interface DashboardDataSource {
  farms: FarmStore[]
  storeAccounts: StoreAccount[]
  suppliers: Supplier[]
  promoters: Promoter[]
  catalog: CatalogState | null
  cOrders: DashboardCOrder[]
  voucherOrders: DashboardVoucherOrder[]
  fulfillmentOrders: DashboardFulfillmentOrder[]
  afterSales: Array<Pick<AfterSale, 'id' | 'orderId' | 'status' | 'amount'> & { dataOrigin?: 'dashboard_demo' }>
  supplierSettlements?: SupplierSettlementRecord[]
  commissionLedger?: CommissionLedgerEntry[]
  domainUpdatedAt?: Partial<Record<DashboardDataDomain, string>>
  updatedAt?: string
  demoSupplement?: DashboardDemoSupplementInfo
}

export type DashboardRiskLevel = 'critical' | 'warning' | 'notice'

export interface DashboardRiskSubject {
  type: 'farm' | 'supplier' | 'order' | 'sku' | 'dataset'
  id: string
  name: string
  farmId?: string
  regionCode?: string
  occurredAt?: string
  detail: string
  dataOrigin?: 'dashboard_demo'
}

export interface DashboardRisk {
  id: string
  rule: string
  level: DashboardRiskLevel
  title: string
  description: string
  count: number
  farmId?: string
  supplierId?: string
  subjects: DashboardRiskSubject[]
}

export interface DashboardEvidence {
  metric: string
  value: number | string
  threshold?: number | string
  unit?: string
}

export interface DashboardSuggestion {
  id: string
  rule: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  action: string
  evidence: DashboardEvidence[]
  subjects: DashboardRiskSubject[]
}

export interface DashboardMapPoint {
  farmId: string
  name: string
  regionName: string
  adCode: string
  longitude: number
  latitude: number
  status: FarmStore['status']
  transactionAmount: number
  orderCount: number
}

export interface DashboardCityMapPoint {
  cityCode: string
  cityName: string
  longitude: number
  latitude: number
  storeCount: number
  transactionAmount: number
  orderCount: number
  riskCount: number
}

export interface DashboardFarmProfile {
  farmId: string
  name: string
  cityCode: string
  cityName: string
  districtCode: string
  districtName: string
  status: FarmStore['status']
  address: string
  longitude?: number
  latitude?: number
  activeStaffCount: number
  transactionAmount: number
  orderCount: number
  voucherCount: number
  redeemedVoucherCount: number
  riskCount: number
}

export interface DashboardCityProfile {
  cityCode: string
  cityName: string
  longitude?: number
  latitude?: number
  storeCount: number
  activeStoreCount: number
  activeStaffCount: number
  transactionAmount: number
  orderCount: number
  voucherRate: number | null
  fulfillmentRate: number | null
  afterSaleRate: number | null
  riskCount: number
  growthRate: number | null
}

export interface DashboardRegionRank {
  regionCode: string
  regionName: string
  storeCount: number
  transactionAmount: number
  orderCount: number
  activity: number
  growthRate: number | null
}

export interface DashboardCategoryGap {
  category: string
  demandQuantity: number
  availableStock: number
  demandShare: number
  supplyShare: number
  gap: number
}

export interface DashboardTrendPoint {
  date: string
  amount: number
  orderCount: number
}

/** 趋势窗口环比对比结果（清单「交易趋势分析…支持走势对比」）。 */
export interface TrendWindowComparison {
  currentAmount: number
  currentOrders: number
  previousAmount: number
  previousOrders: number
  /** 较上期环比（%）；上一期为 0 时返回 null，页面显示「--」。 */
  amountDeltaPercent: number | null
  orderDeltaPercent: number | null
}

/**
 * 对比同一时间窗口与其等长上一期。
 * 页面只负责把当前/上一期序列传进来，涨跌口径由本函数统一。
 */
export function compareTrendWindows(
  current: ReadonlyArray<{ amount: number; orderCount: number }>,
  previous: ReadonlyArray<{ amount: number; orderCount: number }>
): TrendWindowComparison {
  const totalAmount = (points: ReadonlyArray<{ amount: number }>) => Math.round(points.reduce((sum, point) => sum + (Number(point?.amount) || 0), 0) * 100) / 100
  const totalOrders = (points: ReadonlyArray<{ orderCount: number }>) => points.reduce((sum, point) => sum + (Number(point?.orderCount) || 0), 0)
  const currentAmount = totalAmount(current)
  const previousAmount = totalAmount(previous)
  const currentOrders = totalOrders(current)
  const previousOrders = totalOrders(previous)
  const percent = (now: number, before: number) => before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null
  return {
    currentAmount,
    currentOrders,
    previousAmount,
    previousOrders,
    amountDeltaPercent: percent(currentAmount, previousAmount),
    orderDeltaPercent: percent(currentOrders, previousOrders)
  }
}

export interface DashboardSnapshot {
  generatedAt: string
  principal: DashboardPrincipal
  range: DashboardRange
  modules: DashboardModule[]
  demoSupplement?: DashboardDemoSupplementInfo
  overview: {
    storeCount: number
    supplierCount: number
    transactionAmount: number
    transactionOrderCount: number
    activeStaffCount: number
    riskCount: number
    promoterHostCount: number
    lowStockSkuCount: number
  }
  storeStatus: { active: number; pending: number; paused: number }
  fulfillment: {
    total: number
    completed: number
    rate: number | null
    overdueCount: number
    abnormalCount: number
  }
  service: {
    paidOrderCount: number
    afterSaleCount: number
    afterSaleRate: number | null
    eligibleVoucherCount: number
    redeemedVoucherCount: number
    voucherRedemptionRate: number | null
  }
  inventory: {
    availableSkuCount: number
    lowStockSkuCount: number
    totalStock: number
    categoryCount: number
  }
  settlement: {
    pendingSupplierAmount: number
    failedSupplierSettlementCount: number
    pendingCommissionAmount: number
    riskCount: number
  }
  mapPoints: DashboardMapPoint[]
  cityMapPoints: DashboardCityMapPoint[]
  farmProfiles: DashboardFarmProfile[]
  cityProfiles: DashboardCityProfile[]
  unlocatedStoreCount: number
  unattributedDataCount: number
  regionRanking: DashboardRegionRank[]
  categoryGaps: DashboardCategoryGap[]
  trend: DashboardTrendPoint[]
  risks: DashboardRisk[]
  suggestions: DashboardSuggestion[]
  domainFreshness: DashboardDataFreshness[]
  chain: {
    supplierCount: number
    listedProductCount: number
    activeStoreCount: number
    activePromoterHostCount: number
  }
}

const DASHBOARD_DATA_DOMAINS: DashboardDataDomain[] = [
  'farms', 'accounts', 'catalog', 'orders', 'vouchers', 'afterSales', 'settlements'
]

const DASHBOARD_DATA_DOMAIN_NAMES: Record<DashboardDataDomain, string> = {
  farms: '门店', accounts: '账号', catalog: '商品目录', orders: '订单', vouchers: '券订单',
  afterSales: '售后', settlements: '结算'
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))

function dateValue(value: string | undefined): number {
  if (!value) return Number.NaN
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') : value
  return Date.parse(normalized)
}

function qualificationExpiry(value: string | undefined): number {
  if (!value) return Number.NaN
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T23:59:59.999+08:00`)
    : dateValue(value)
}

function inRange(value: string, range: DashboardRange): boolean {
  const time = dateValue(value)
  const start = dateValue(range.start)
  const end = dateValue(range.end)
  return Number.isFinite(time) && (!Number.isFinite(start) || time >= start) && (!Number.isFinite(end) || time <= end)
}

function previousRange(range: DashboardRange): DashboardRange | null {
  const start = dateValue(range.start)
  const end = dateValue(range.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  const previousEnd = start - 1
  return {
    start: new Date(previousEnd - (end - start)).toISOString(),
    end: new Date(previousEnd).toISOString()
  }
}

function calculateGrowthRate(current: number, previous: number): number | null {
  if (previous > 0) return round((current - previous) / previous * 100, 1)
  return null
}

function locationOf(farm: FarmStore) {
  return (farm as FarmStore & {
    location?: { longitude: number; latitude: number; adCode: string; city: string; district: string }
    locationStatus?: 'resolved' | 'pending' | 'failed'
    address?: string
    locationError?: string
  })
}

export function farmRegionCode(farm: FarmStore): string {
  if (farm.regionCode && isDashboardRegionCode(farm.regionCode)) return farm.regionCode
  if (farm.structuredAddress?.districtCode && isDashboardRegionCode(farm.structuredAddress.districtCode)) return farm.structuredAddress.districtCode
  const location = locationOf(farm).location
  if (location?.adCode && isDashboardRegionCode(location.adCode)) return location.adCode
  return ''
}

function regionAllowed(code: string, allowed: string[]): boolean {
  if (!allowed.length) return true
  return !!code && allowed.some((regionCode) => code.startsWith(regionCode))
}

function isProvinceScope(allowed: string[]): boolean {
  return !allowed.length || allowed.some((code) => code.length <= 2)
}

function farmRegionName(farm: FarmStore): string {
  return locationOf(farm).location?.city || farm.city || farm.region || '待归属'
}

function farmLocationRisk(farm: FarmStore): { rule: string; detail: string } {
  const location = locationOf(farm).location
  const districtCode = farm.regionCode || farm.structuredAddress?.districtCode
  if (!farm.address?.trim()) return { rule: 'store-address-missing', detail: '门店详细地址缺失' }
  if (farm.locationError === 'REGION_MISMATCH' || (districtCode && location?.adCode && districtCode !== location.adCode)) {
    return { rule: 'store-location-region-mismatch', detail: '定位结果与所选县区不一致' }
  }
  if (farm.locationStatus === 'resolved' && location && (!isValidChinaCoordinate(location.longitude, location.latitude) || !isDashboardRegionCode(location.adCode))) {
    return { rule: 'store-location-invalid', detail: '门店坐标或行政区编码非法' }
  }
  if (farm.locationStatus === 'failed') return { rule: 'store-location-failed', detail: farm.locationError || '地理编码解析失败' }
  return { rule: 'store-location-missing', detail: '缺少有效地图坐标' }
}

function isDemoId(id: string): boolean {
  return id.toUpperCase().startsWith('DEMO-')
}

function orderValid(status: string): boolean {
  return !['cancelled', 'refunded', 'unpaid-cancelled', 'paid-cancelled'].includes(status)
}

function cOrderPaid(status: string): boolean {
  return ['paid', 'shipped', 'received', 'after_sale', 'partially_shipped', 'partially_received', 'partially_after_sale'].includes(status)
}

function cOrderNetAmount(order: DashboardCOrder): number {
  const refunded = (order.subOrders || [])
    .filter((subOrder) => subOrder.afterSale?.status === 'completed')
    .reduce((sum, subOrder) => sum + Math.max(0, Number(subOrder.amount) || 0), 0)
  return round(Math.max(0, Number(order.amount || 0) - refunded))
}


function rankingRegion(farm: FarmStore, allowedCodes: string[]): { code: string; name: string } | null {
  const code = farmRegionCode(farm)
  const scopeLength = allowedCodes.length ? Math.min(...allowedCodes.map((item) => item.length)) : 2
  const targetLength = scopeLength <= 2 ? 4 : 6
  if (code.length < targetLength) return null
  const location = locationOf(farm).location
  return {
    code: code.slice(0, targetLength),
    name: targetLength === 4 ? (location?.city || farm.city || farm.region || '待归属') : (location?.district || farm.region || '待归属')
  }
}

export function dashboardModulesForRole(role: DashboardRole): DashboardModule[] {
  if (role === 'leader') return ['overview', 'regional-comparison']
  if (role === 'regulator') return ['overview', 'regulatory-monitoring']
  return ['overview', 'industry-empowerment']
}

export function buildDashboardSnapshot(source: DashboardDataSource, options: DashboardBuildOptions): DashboardSnapshot {
  const { principal, range } = options
  if (principal.status !== 'active') throw new Error('Dashboard principal is disabled')
  const now = options.now || new Date()
  const domainFreshness = DASHBOARD_DATA_DOMAINS.map((domain): DashboardDataFreshness => {
    const updatedAt = source.domainUpdatedAt
      ? source.domainUpdatedAt[domain]
      : source.updatedAt
    const updatedTime = dateValue(updatedAt)
    return {
      domain,
      ...(updatedAt ? { updatedAt } : {}),
      stale: Number.isFinite(updatedTime) && now.getTime() - updatedTime > 24 * 60 * 60 * 1000
    }
  })
  const productById = new Map((source.catalog?.products || []).map((product) => [product.id, product]))
  const supplierById = new Map(source.suppliers.map((supplier) => [supplier.id, supplier]))
  const storeAccountById = new Map(source.storeAccounts.map((account) => [account.id, account]))
  const cOrderById = new Map(source.cOrders.map((order) => [order.id, order]))
  const voucherById = new Map(source.voucherOrders.map((order) => [order.id, order]))
  const sourceFulfillmentOrderById = new Map(source.fulfillmentOrders.map((order) => [order.id, order]))
  const allFarmByName = new Map(source.farms.map((farm) => [farm.name, farm]))
  const orderFarmId = (order: DashboardCOrder): string | undefined => {
    if (order.farmId) return order.farmId
    if (order.items.length !== 1) return undefined
    const farmIds = productById.get(order.items[0].productId)?.farmIds || []
    return farmIds.length === 1 ? farmIds[0] : undefined
  }
  const includeUnattributed = isProvinceScope(principal.regionCodes)
  const allowedFarms = source.farms.filter((farm) => {
    const code = farmRegionCode(farm)
    return code ? regionAllowed(code, principal.regionCodes) : includeUnattributed
  })
  const allowedFarmIds = new Set(allowedFarms.map((farm) => farm.id))
  const farmById = new Map(allowedFarms.map((farm) => [farm.id, farm]))
  const farmByName = new Map(allowedFarms.map((farm) => [farm.name, farm]))
  const farmSubject = (farm: FarmStore, detail: string, occurredAt?: string): DashboardRiskSubject => ({
    type: 'farm', id: farm.id, name: farm.name, farmId: farm.id, regionCode: farmRegionCode(farm), occurredAt, detail
  })
  const orderSubject = (order: DashboardFulfillmentOrder, detail: string): DashboardRiskSubject => {
    const farmId = order.farmId || allFarmByName.get(order.customer || '')?.id
    const farm = farmId ? farmById.get(farmId) : undefined
    return {
      type: 'order', id: order.id, name: `订单${order.id}`, farmId,
      regionCode: farm ? farmRegionCode(farm) : undefined, occurredAt: order.createdAt, detail,
      ...(order.dataOrigin ? { dataOrigin: order.dataOrigin } : {})
    }
  }
  const cOrderSubject = (order: DashboardCOrder, detail: string): DashboardRiskSubject => {
    const farmId = orderFarmId(order)
    const farm = farmId ? farmById.get(farmId) : undefined
    return {
      type: 'order', id: order.id, name: `订单${order.id}`, farmId,
      regionCode: farm ? farmRegionCode(farm) : undefined, occurredAt: order.createdAt, detail,
      ...(order.dataOrigin ? { dataOrigin: order.dataOrigin } : {})
    }
  }

  const filterCOrders = (targetRange: DashboardRange) => source.cOrders.filter((order) => {
    if (isDemoId(order.id) || !cOrderPaid(order.status) || cOrderNetAmount(order) <= 0 || !inRange(order.createdAt, targetRange)) return false
    const farmId = orderFarmId(order)
    return farmId ? allowedFarmIds.has(farmId) : includeUnattributed
  })
  const filterVouchers = (targetRange: DashboardRange) => source.voucherOrders.filter((order) => (
    !isDemoId(order.id) && order.status !== 'refunded' && inRange(order.createdAt, targetRange) && allowedFarmIds.has(order.farmId)
  ))

  const cOrders = filterCOrders(range)
  const vouchers = filterVouchers(range)
  const comparisonRange = previousRange(range)
  const previousCOrders = comparisonRange ? filterCOrders(comparisonRange) : []
  const previousVouchers = comparisonRange ? filterVouchers(comparisonRange) : []
  const scopedFulfillmentOrders = source.fulfillmentOrders.filter((order) => {
    if (isDemoId(order.id) || !inRange(order.createdAt, range)) return false
    const farmId = order.farmId || farmByName.get(order.customer || '')?.id
    return farmId ? allowedFarmIds.has(farmId) : includeUnattributed
  })
  const fulfillmentOrders = scopedFulfillmentOrders.filter((order) => orderValid(order.status))

  const transactionAmount = round(
    cOrders.reduce((sum, order) => sum + cOrderNetAmount(order), 0)
    + vouchers.reduce((sum, order) => sum + Number(order.amount || 0), 0)
  )
  const transactionOrderCount = cOrders.length + vouchers.length
  let unattributedDataCount = cOrders.filter((order) => !orderFarmId(order)).length
    + fulfillmentOrders.filter((order) => !order.farmId && !farmByName.has(order.customer || '')).length

  const products = (source.catalog?.products || []).filter((product) => product.status === 'active')
  const regionProductIds = new Set(products.filter((product) => (
    product.farmIds.some((id) => allowedFarmIds.has(id)) || (includeUnattributed && !product.farmIds.length)
  )).map((product) => product.id))
  const regionProducts = products.filter((product) => regionProductIds.has(product.id))
  const availableSkus = regionProducts.flatMap((product) => product.skus.filter((sku) => sku.status !== 'retired'))
  const lowStockSkus = availableSkus.filter((sku) => sku.stock <= 10)
  const outOfStockSkus = lowStockSkus.filter((sku) => sku.stock <= 0)
  const limitedStockSkus = lowStockSkus.filter((sku) => sku.stock > 0)
  const supplierIds = new Set(regionProducts.map((product) => product.supplierId))
  const cooperatingSuppliers = source.suppliers.filter((supplier) => (
    supplier.status === 'cooperating' && (includeUnattributed || supplierIds.has(supplier.id))
  ))
  const validPromoterIds = new Set(source.promoters.filter((promoter) => promoter.status === 'active').map((promoter) => promoter.id))
  const activePromoterIds = new Set(includeUnattributed ? validPromoterIds : [])
  const supplierSettlementRecords = (source.supplierSettlements || []).filter((record) => inRange(record.createdAt, range))
  const fulfillmentOrderById = new Map(source.fulfillmentOrders.filter((order) => {
    if (isDemoId(order.id) || !orderValid(order.status)) return false
    const farmId = order.farmId || allFarmByName.get(order.customer || '')?.id
    return farmId ? allowedFarmIds.has(farmId) : includeUnattributed
  }).map((order) => [order.id, order]))
  const settlementOrderKeys = new Set<string>()
  const settlementOrders = supplierSettlementRecords.flatMap((record) => record.items.flatMap((item) => item.orderIds.flatMap((orderId) => {
    const order = fulfillmentOrderById.get(orderId)
    const key = `${record.id}:${orderId}`
    if (!order || settlementOrderKeys.has(key)) return []
    settlementOrderKeys.add(key)
    return [{ record, item, order }]
  })))
  const pendingSupplierAmount = round(settlementOrders.filter(({ record }) => !record.status || record.status === 'pending').reduce((sum, { order }) => sum + Number(order.amount || 0), 0))
  const failedSupplierSettlementCount = new Set(settlementOrders.filter(({ record }) => record.status === 'failed').map(({ record }) => record.id)).size
  const commissionFarmId = (entry: CommissionLedgerEntry): string | undefined => {
    if (entry.farmId) return entry.farmId
    const voucher = voucherById.get(entry.sourceOrderId)
    if (voucher) return voucher.farmId
    const cOrder = cOrderById.get(entry.sourceOrderId)
    if (cOrder) return orderFarmId(cOrder)
    const fulfillmentOrder = sourceFulfillmentOrderById.get(entry.sourceOrderId)
    return fulfillmentOrder?.farmId
      || allFarmByName.get(fulfillmentOrder?.customer || '')?.id
      || storeAccountById.get(entry.beneficiaryId)?.farmId
  }
  if (includeUnattributed) {
    unattributedDataCount += (source.commissionLedger || []).filter((entry) => (
      entry.status === 'pending' && inRange(entry.createdAt, range) && !commissionFarmId(entry)
    )).length
  }
  const pendingCommissionAmount = round((source.commissionLedger || []).filter((entry) => {
    if (entry.status !== 'pending' || !inRange(entry.createdAt, range)) return false
    const farmId = commissionFarmId(entry)
    return farmId ? allowedFarmIds.has(farmId) : includeUnattributed
  }).reduce((sum, entry) => sum + Number(entry.amount || 0), 0))

  const completedFulfillment = fulfillmentOrders.filter((order) => ['delivered', 'received', 'completed'].includes(order.status)).length
  const pendingOverdueOrders = fulfillmentOrders.filter((order) => (
    ['submitted', 'accepted'].includes(order.supplierFulfillment?.status || '')
    && now.getTime() - dateValue(order.createdAt) > 48 * 60 * 60 * 1000
  ))
  const deliveringOverdueOrders = fulfillmentOrders.filter((order) => order.supplierFulfillment?.status === 'delivering' && now.getTime() - dateValue(order.supplierFulfillment.updatedAt || order.createdAt) > 48 * 60 * 60 * 1000)
  const unhandledShortageOrders = fulfillmentOrders.filter((order) => (order.supplierFulfillment?.shortages || []).some((item) => item.shortage > 0 && !item.handled))
  const cancelledFulfillmentOrders = scopedFulfillmentOrders.filter((order) => order.status === 'cancelled' || order.supplierFulfillment?.status === 'cancelled')
  const missingCourierTrackingOrders = fulfillmentOrders.filter((order) => (
    order.supplierFulfillment?.shipType === 'courier'
    && ['shipped', 'delivering'].includes(order.supplierFulfillment.status || '')
    && !order.supplierFulfillment.trackingNo?.trim()
  ))
  const overdueCount = new Set([...pendingOverdueOrders, ...deliveringOverdueOrders].map((order) => order.id)).size
  const abnormalCount = new Set([
    ...unhandledShortageOrders, ...cancelledFulfillmentOrders, ...missingCourierTrackingOrders, ...deliveringOverdueOrders
  ].map((order) => order.id)).size
  const fulfillmentRate = fulfillmentOrders.length ? round(completedFulfillment / fulfillmentOrders.length * 100, 1) : null

  const paidOrderIds = new Set(cOrders.map((order) => order.id))
  const validAfterSales = source.afterSales.filter((item) => item.status !== 'rejected' && paidOrderIds.has(item.orderId))
  const afterSaleOrderIds = new Set(validAfterSales.map((item) => item.orderId))
  cOrders.forEach((order) => {
    if (order.subOrders?.some((subOrder) => subOrder.afterSale && subOrder.afterSale.status !== 'reversed' && subOrder.afterSale.status !== 'rejected')) {
      afterSaleOrderIds.add(order.id)
    }
  })
  const afterSaleRate = paidOrderIds.size ? round(afterSaleOrderIds.size / paidOrderIds.size * 100, 1) : null
  const redeemedVouchers = vouchers.filter((order) => order.status === 'redeemed').length
  const voucherRate = vouchers.length ? round(redeemedVouchers / vouchers.length * 100, 1) : null

  const transactionByFarm = new Map<string, { amount: number; count: number }>()
  const previousTransactionByFarm = new Map<string, { amount: number; count: number }>()
  const addFarmTransaction = (target: Map<string, { amount: number; count: number }>, farmId: string | undefined, amount: number) => {
    if (!farmId || !allowedFarmIds.has(farmId)) return
    const current = target.get(farmId) || { amount: 0, count: 0 }
    current.amount += Number(amount || 0)
    current.count += 1
    target.set(farmId, current)
  }
  cOrders.forEach((order) => addFarmTransaction(transactionByFarm, orderFarmId(order), cOrderNetAmount(order)))
  vouchers.forEach((order) => addFarmTransaction(transactionByFarm, order.farmId, order.amount))
  previousCOrders.forEach((order) => addFarmTransaction(previousTransactionByFarm, orderFarmId(order), cOrderNetAmount(order)))
  previousVouchers.forEach((order) => addFarmTransaction(previousTransactionByFarm, order.farmId, order.amount))

  const mapPoints = allowedFarms.flatMap((farm): DashboardMapPoint[] => {
    const located = locationOf(farm)
    const location = located.location
    if (!isResolvedFarmLocation(farm) || !location) return []
    const transaction = transactionByFarm.get(farm.id) || { amount: 0, count: 0 }
    return [{
      farmId: farm.id, name: farm.name, regionName: farmRegionName(farm), adCode: location.adCode,
      longitude: location.longitude, latitude: location.latitude, status: farm.status,
      transactionAmount: round(transaction.amount), orderCount: transaction.count
    }]
  })
  const unlocatedFarms = allowedFarms.filter((farm) => !isResolvedFarmLocation(farm))

  const risks: DashboardRisk[] = []
  unlocatedFarms.forEach((farm) => {
    const locationRisk = farmLocationRisk(farm)
    risks.push({
      id: `location:${farm.id}`, rule: locationRisk.rule,
      level: 'warning', title: '门店定位异常', description: `${farm.name}：${locationRisk.detail}`, count: 1, farmId: farm.id,
      subjects: [farmSubject(farm, locationRisk.detail)]
    })
  })
  cooperatingSuppliers.forEach((supplier) => {
    const expires = qualificationExpiry(supplier.qualification.validUntil)
    const expired = expires < now.getTime()
    const days = Math.ceil((expires - now.getTime()) / 86400000)
    if (!Number.isFinite(days) || days > 30) return
    risks.push({
      id: `qualification:${supplier.id}`,
      rule: expired ? 'supplier-qualification-expired' : 'supplier-qualification-expiring',
      level: days <= 7 ? 'critical' : 'warning',
      title: expired ? '供应商资质已过期' : '供应商资质即将到期',
      description: expired ? `${supplier.name}资质已过期` : `${supplier.name}资质将在${days}天内到期`,
      count: 1, supplierId: supplier.id,
      subjects: [{
        type: 'supplier', id: supplier.id, name: supplier.name, occurredAt: supplier.qualification.validUntil,
        detail: expired ? '供应商资质已过期' : `供应商资质将在${days}天内到期`
      }]
    })
  })
  const orderSubjects = (items: DashboardFulfillmentOrder[], detail: string): DashboardRiskSubject[] => items.map((order) => orderSubject(order, detail))
  if (pendingOverdueOrders.length) risks.push({ id: 'fulfillment:overdue', rule: 'order-overdue-unshipped', level: 'critical', title: '超时未发货', description: `${pendingOverdueOrders.length}笔订单超过48小时未发货`, count: pendingOverdueOrders.length, subjects: orderSubjects(pendingOverdueOrders, '供应履约超过48小时未发货') })
  if (unhandledShortageOrders.length) risks.push({ id: 'fulfillment:shortage', rule: 'fulfillment-shortage-unhandled', level: 'critical', title: '缺货待处理', description: `${unhandledShortageOrders.length}笔订单存在未处理缺货`, count: unhandledShortageOrders.length, subjects: orderSubjects(unhandledShortageOrders, '供应履约存在未处理缺货') })
  if (cancelledFulfillmentOrders.length) risks.push({ id: 'fulfillment:cancelled', rule: 'fulfillment-cancelled', level: 'critical', title: '履约已取消', description: `${cancelledFulfillmentOrders.length}笔供应履约已取消`, count: cancelledFulfillmentOrders.length, subjects: orderSubjects(cancelledFulfillmentOrders, '供应履约已取消') })
  if (missingCourierTrackingOrders.length) risks.push({ id: 'fulfillment:tracking', rule: 'fulfillment-courier-tracking-missing', level: 'warning', title: '快递单号缺失', description: `${missingCourierTrackingOrders.length}笔快递履约缺少单号`, count: missingCourierTrackingOrders.length, subjects: orderSubjects(missingCourierTrackingOrders, '快递履约缺少运单号') })
  if (deliveringOverdueOrders.length) risks.push({ id: 'fulfillment:delivering-overdue', rule: 'fulfillment-delivering-overdue', level: 'critical', title: '配送超时', description: `${deliveringOverdueOrders.length}笔订单配送超过48小时`, count: deliveringOverdueOrders.length, subjects: orderSubjects(deliveringOverdueOrders, '配送状态超过48小时未更新') })
  const skuSubjects = (items: typeof availableSkus, detail: string): DashboardRiskSubject[] => items.map((sku) => ({ type: 'sku', id: sku.id, name: sku.name, detail }))
  if (outOfStockSkus.length) risks.push({ id: 'inventory:out', rule: 'out-of-stock', level: 'critical', title: '库存告罄', description: `${outOfStockSkus.length}个在售SKU已无库存`, count: outOfStockSkus.length, subjects: skuSubjects(outOfStockSkus, '在售SKU库存为0') })
  if (limitedStockSkus.length) risks.push({ id: 'inventory:low', rule: 'low-stock', level: 'warning', title: '库存预警', description: `${limitedStockSkus.length}个在售SKU库存不高于10`, count: limitedStockSkus.length, subjects: skuSubjects(limitedStockSkus, '在售SKU库存不高于10') })
  if (paidOrderIds.size >= 10 && afterSaleRate !== null && afterSaleRate > 5) risks.push({ id: 'service:after-sale', rule: 'high-after-sale-rate', level: 'warning', title: '售后率偏高', description: `当前售后率${afterSaleRate}%`, count: afterSaleOrderIds.size, subjects: cOrders.filter((order) => afterSaleOrderIds.has(order.id)).map((order) => cOrderSubject(order, '订单发生有效售后')) })
  domainFreshness.filter((item) => item.stale).forEach((item) => risks.push({
    id: `data:stale:${item.domain}`, rule: 'stale-data', level: 'notice', title: '数据更新延迟',
    description: `${DASHBOARD_DATA_DOMAIN_NAMES[item.domain]}数据超过24小时未更新`, count: 1,
    subjects: [{
      type: 'dataset', id: item.domain, name: DASHBOARD_DATA_DOMAIN_NAMES[item.domain],
      occurredAt: item.updatedAt, detail: `${DASHBOARD_DATA_DOMAIN_NAMES[item.domain]}数据更新延迟`
    }]
  }))
  if (failedSupplierSettlementCount) risks.push({ id: 'settlement:failed', rule: 'settlement-failed', level: 'critical', title: '供应商结算异常', description: `${failedSupplierSettlementCount}笔供应商结算失败`, count: failedSupplierSettlementCount, subjects: settlementOrders.filter(({ record }) => record.status === 'failed').map(({ order }) => orderSubject(order, '供应商结算失败')) })

  const demandByCategory = new Map<string, number>()
  cOrders.forEach((order) => order.items.forEach((item) => {
    const category = productById.get(item.productId)?.category || '待归类'
    demandByCategory.set(category, (demandByCategory.get(category) || 0) + Number(item.quantity || 0))
  }))
  vouchers.forEach((order) => {
    const category = productById.get(order.productId)?.category || '待归类'
    demandByCategory.set(category, (demandByCategory.get(category) || 0) + Number(order.quantity || 0))
  })
  const stockByCategory = new Map<string, number>()
  regionProducts.forEach((product) => stockByCategory.set(product.category, (stockByCategory.get(product.category) || 0) + product.skus.filter((sku) => sku.status !== 'retired').reduce((sum, sku) => sum + sku.stock, 0)))
  const demandTotal = [...demandByCategory.values()].reduce((sum, value) => sum + value, 0)
  const stockTotal = [...stockByCategory.values()].reduce((sum, value) => sum + value, 0)
  const categories = new Set([...demandByCategory.keys(), ...stockByCategory.keys()])
  const categoryGaps = [...categories].map((category) => {
    const demandQuantity = demandByCategory.get(category) || 0
    const availableStock = stockByCategory.get(category) || 0
    const demandShare = demandTotal ? demandQuantity / demandTotal : 0
    const supplyShare = stockTotal ? availableStock / stockTotal : 0
    return { category, demandQuantity, availableStock, demandShare: round(demandShare * 100, 1), supplyShare: round(supplyShare * 100, 1), gap: round((demandShare - supplyShare) * 100, 1) }
  }).sort((a, b) => b.gap - a.gap)

  const trendMap = new Map<string, { amount: number; orderCount: number }>()
  const addTrend = (createdAt: string, amount: number) => {
    const date = createdAt.slice(0, 10)
    const current = trendMap.get(date) || { amount: 0, orderCount: 0 }
    current.amount += Number(amount || 0); current.orderCount += 1; trendMap.set(date, current)
  }
  cOrders.forEach((order) => addTrend(order.createdAt, cOrderNetAmount(order)))
  vouchers.forEach((order) => addTrend(order.createdAt, order.amount))
  const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, amount: round(value.amount), orderCount: value.orderCount }))

  const rankMap = new Map<string, DashboardRegionRank>()
  const previousAmountByRegion = new Map<string, number>()
  allowedFarms.forEach((farm) => {
    const region = rankingRegion(farm, principal.regionCodes)
    if (!region) return
    const existing = rankMap.get(region.code) || { regionCode: region.code, regionName: region.name, storeCount: 0, transactionAmount: 0, orderCount: 0, activity: 0, growthRate: 0 }
    const transaction = transactionByFarm.get(farm.id) || { amount: 0, count: 0 }
    const previousTransaction = previousTransactionByFarm.get(farm.id) || { amount: 0, count: 0 }
    existing.storeCount += 1; existing.transactionAmount += transaction.amount; existing.orderCount += transaction.count
    previousAmountByRegion.set(region.code, (previousAmountByRegion.get(region.code) || 0) + previousTransaction.amount)
    existing.activity += farm.status === 'active' ? 1 : 0
    rankMap.set(region.code, existing)
  })
  const regionRanking = [...rankMap.values()].map((item) => ({
    ...item,
    transactionAmount: round(item.transactionAmount),
    activity: item.storeCount ? round(item.activity / item.storeCount * 100, 1) : 0,
    growthRate: calculateGrowthRate(item.transactionAmount, previousAmountByRegion.get(item.regionCode) || 0)
  })).sort((a, b) => b.transactionAmount - a.transactionAmount)

  const suggestions: DashboardSuggestion[] = categoryGaps.filter((item) => item.gap > 20).slice(0, 3).map((item) => ({
    id: `gap:${item.category}`, rule: 'category-supply-gap', priority: 'high', title: `${item.category}供给不足`,
    description: `需求占比较供给占比高${item.gap}%`, action: '补充供应商或扩大现有供应商供给',
    evidence: [
      { metric: 'demandShare', value: item.demandShare, unit: '%' },
      { metric: 'supplyShare', value: item.supplyShare, unit: '%' },
      { metric: 'gap', value: item.gap, threshold: 20, unit: '%' }
    ],
    subjects: (() => {
      const subjects: DashboardRiskSubject[] = regionProducts.filter((product) => product.category === item.category).flatMap((product) => (
        product.skus.filter((sku) => sku.status !== 'retired').map((sku) => ({
        type: 'sku' as const, id: sku.id, name: sku.name, detail: `${item.category}供需缺口${item.gap}%`
        }))
      ))
      return subjects.length ? subjects : [{ type: 'dataset', id: 'catalog', name: '商品目录', detail: `${item.category}供需缺口${item.gap}%` }]
    })()
  }))
  if (fulfillmentRate !== null && fulfillmentRate < 90) suggestions.push({
    id: 'fulfillment:optimize', rule: 'low-fulfillment', priority: 'high', title: '提升履约协同',
    description: `当前履约率${fulfillmentRate}%`, action: '优化供应商备货与配送协同',
    evidence: [{ metric: 'fulfillmentRate', value: fulfillmentRate, threshold: 90, unit: '%' }],
    subjects: orderSubjects(fulfillmentOrders, '履约率低于90%')
  })
  if (unlocatedFarms.length) suggestions.push({
    id: 'location:complete', rule: 'complete-store-location', priority: 'medium', title: '完善门店地址',
    description: `${unlocatedFarms.length}家门店无法展示地图点位`, action: '在运营后台补充地址并重新定位',
    evidence: [{ metric: 'unlocatedStoreCount', value: unlocatedFarms.length, threshold: 0, unit: 'store' }],
    subjects: unlocatedFarms.map((farm) => farmSubject(farm, '门店缺少有效地图坐标'))
  })
  const jointDemandByProduct = new Map<string, { quantity: number; farmIds: Set<string> }>()
  fulfillmentOrders.forEach((order) => {
    const farmId = order.farmId || farmByName.get(order.customer || '')?.id
    if (!farmId) return
    order.items?.forEach((item) => {
      const quantity = Number(item.quantity)
      if (!productById.has(item.productId) || !Number.isFinite(quantity) || quantity <= 0) return
      const demand = jointDemandByProduct.get(item.productId) || { quantity: 0, farmIds: new Set<string>() }
      demand.quantity += quantity
      demand.farmIds.add(farmId)
      jointDemandByProduct.set(item.productId, demand)
    })
  })
  jointDemandByProduct.forEach((demand, productId) => {
    if (demand.farmIds.size < 3 || demand.quantity < 20) return
    const product = productById.get(productId)!
    const farmSubjects = [...demand.farmIds].flatMap((farmId) => {
      const farm = farmById.get(farmId)
      return farm ? [farmSubject(farm, `${product.name}联合采购需求`)] : []
    })
    const productSubjects = product.skus.filter((sku) => sku.status !== 'retired').map((sku) => ({
      type: 'sku' as const, id: sku.id, name: sku.name, detail: `${product.name}合计需求${demand.quantity}件`
    }))
    suggestions.push({
      id: `joint:${productId}`, rule: 'joint-procurement', priority: 'medium', title: `组织${product.name}联合采购`,
      description: `${demand.farmIds.size}家门店合计需求${demand.quantity}件`, action: '汇总门店需求并向供应商发起联合采购',
      evidence: [
        { metric: 'storeCount', value: demand.farmIds.size, threshold: 3, unit: 'store' },
        { metric: 'demandQuantity', value: demand.quantity, threshold: 20, unit: 'item' }
      ],
      subjects: [...farmSubjects, ...productSubjects]
    })
  })
  const supplierDemand = new Map<string, number>()
  cOrders.forEach((order) => order.items.forEach((item) => {
    const supplierId = productById.get(item.productId)?.supplierId
    if (supplierId) supplierDemand.set(supplierId, (supplierDemand.get(supplierId) || 0) + item.quantity)
  }))
  const supplierDemandTotal = [...supplierDemand.values()].reduce((sum, value) => sum + value, 0)
  const maxSupplierDemand = Math.max(0, ...supplierDemand.values())
  const supplierConcentration = supplierDemandTotal ? round(maxSupplierDemand / supplierDemandTotal * 100, 1) : 0
  if (supplierConcentration > 70) {
    const dominantSupplierIds = [...supplierDemand.entries()].filter(([, demand]) => demand === maxSupplierDemand).map(([supplierId]) => supplierId)
    suggestions.push({
      id: 'supplier:backup', rule: 'supplier-concentration', priority: 'medium', title: '降低单一供应商依赖',
      description: '单一供应商承接需求占比超过70%', action: '引入同品类备用供应商',
      evidence: [{ metric: 'supplierDemandShare', value: supplierConcentration, threshold: 70, unit: '%' }],
      subjects: dominantSupplierIds.map((supplierId) => {
        const supplier = supplierById.get(supplierId)
        return { type: 'supplier', id: supplierId, name: supplier?.name || supplierId, detail: `需求承接占比${supplierConcentration}%` }
      })
    })
  }
  const currentTransactionCount = cOrders.length + vouchers.length
  const previousTransactionCount = previousCOrders.length + previousVouchers.length
  const transactionGrowth = calculateGrowthRate(currentTransactionCount, previousTransactionCount)
  if (transactionGrowth !== null && transactionGrowth > 20) suggestions.push({
    id: 'transaction:growth', rule: 'transaction-growth', priority: 'medium', title: '承接增长需求',
    description: `订单量环比增长${transactionGrowth ?? '--'}%`,
    action: '开发对应套餐或商品并提前组织供给',
    evidence: [
      ...(transactionGrowth !== null ? [{ metric: 'transactionGrowth', value: transactionGrowth, threshold: 20, unit: '%' }] : []),
    ],
    subjects: [{ type: 'dataset', id: 'orders', name: '订单', detail: '订单量环比增长超过20%' }]
  })
  if (failedSupplierSettlementCount) suggestions.push({
    id: 'settlement:coordinate', rule: 'settlement-coordination', priority: 'high', title: '处理结算异常',
    description: `${failedSupplierSettlementCount}笔供应商结算失败`, action: '核对订单、结算账户与支付通道后重新发起',
    evidence: [{ metric: 'failedSupplierSettlementCount', value: failedSupplierSettlementCount, threshold: 0, unit: 'settlement' }],
    subjects: settlementOrders.filter(({ record }) => record.status === 'failed').map(({ order }) => orderSubject(order, '供应商结算失败'))
  })

  const activeStaffByFarm = new Map<string, number>()
  source.storeAccounts.forEach((account) => {
    if (account.role === 'staff' && account.enabled && allowedFarmIds.has(account.farmId)) {
      activeStaffByFarm.set(account.farmId, (activeStaffByFarm.get(account.farmId) || 0) + 1)
    }
  })
  const voucherStatsByFarm = new Map<string, { count: number; redeemed: number }>()
  vouchers.forEach((voucher) => {
    const current = voucherStatsByFarm.get(voucher.farmId) || { count: 0, redeemed: 0 }
    current.count += 1
    if (voucher.status === 'redeemed') current.redeemed += 1
    voucherStatsByFarm.set(voucher.farmId, current)
  })
  const fulfillmentStatsByFarm = new Map<string, { total: number; completed: number }>()
  fulfillmentOrders.forEach((order) => {
    const farmId = order.farmId || farmByName.get(order.customer || '')?.id
    if (!farmId) return
    const current = fulfillmentStatsByFarm.get(farmId) || { total: 0, completed: 0 }
    current.total += 1
    if (['delivered', 'received', 'completed'].includes(order.status)) current.completed += 1
    fulfillmentStatsByFarm.set(farmId, current)
  })
  const paidOrderStatsByFarm = new Map<string, { total: number; afterSale: number }>()
  cOrders.forEach((order) => {
    const farmId = orderFarmId(order)
    if (!farmId) return
    const current = paidOrderStatsByFarm.get(farmId) || { total: 0, afterSale: 0 }
    current.total += 1
    if (afterSaleOrderIds.has(order.id)) current.afterSale += 1
    paidOrderStatsByFarm.set(farmId, current)
  })
  const riskIdsByFarm = new Map<string, Set<string>>()
  risks.forEach((risk) => {
    const farmIds = new Set([
      ...(risk.farmId ? [risk.farmId] : []),
      ...risk.subjects.flatMap((subject) => subject.farmId ? [subject.farmId] : [])
    ])
    farmIds.forEach((farmId) => {
      const ids = riskIdsByFarm.get(farmId) || new Set<string>()
      ids.add(risk.id)
      riskIdsByFarm.set(farmId, ids)
    })
  })
  const farmProfiles: DashboardFarmProfile[] = allowedFarms.map((farm) => {
    const districtCode = farmRegionCode(farm)
    const cityCode = districtCode.length >= 4 ? districtCode.slice(0, 4) : ''
    const location = isResolvedFarmLocation(farm) ? farm.location : undefined
    const transaction = transactionByFarm.get(farm.id) || { amount: 0, count: 0 }
    const voucher = voucherStatsByFarm.get(farm.id) || { count: 0, redeemed: 0 }
    return {
      farmId: farm.id,
      name: farm.name,
      cityCode,
      cityName: dashboardRegion(cityCode)?.name || '待归属',
      districtCode: districtCode.length === 6 ? districtCode : '',
      districtName: districtCode.length === 6 ? (dashboardRegion(districtCode)?.name || '待归属') : '待归属',
      status: farm.status,
      address: farm.address || '',
      ...(location ? { longitude: location.longitude, latitude: location.latitude } : {}),
      activeStaffCount: activeStaffByFarm.get(farm.id) || 0,
      transactionAmount: round(transaction.amount),
      orderCount: transaction.count,
      voucherCount: voucher.count,
      redeemedVoucherCount: voucher.redeemed,
      riskCount: riskIdsByFarm.get(farm.id)?.size || 0
    }
  })
  type CityAccumulator = DashboardCityProfile & {
    coordinateCount: number
    longitudeTotal: number
    latitudeTotal: number
    eligibleVoucherCount: number
    redeemedVoucherCount: number
    fulfillmentTotal: number
    fulfillmentCompleted: number
    paidOrderCount: number
    afterSaleCount: number
    previousAmount: number
  }
  const cityProfileMap = new Map<string, CityAccumulator>()
  farmProfiles.forEach((farm) => {
    if (!farm.cityCode) return
    const current = cityProfileMap.get(farm.cityCode) || {
      cityCode: farm.cityCode, cityName: dashboardRegion(farm.cityCode)!.name,
      storeCount: 0, activeStoreCount: 0, activeStaffCount: 0, transactionAmount: 0, orderCount: 0,
      voucherRate: null, fulfillmentRate: null, afterSaleRate: null, riskCount: 0, growthRate: null,
      coordinateCount: 0, longitudeTotal: 0, latitudeTotal: 0, eligibleVoucherCount: 0, redeemedVoucherCount: 0,
      fulfillmentTotal: 0, fulfillmentCompleted: 0, paidOrderCount: 0, afterSaleCount: 0, previousAmount: 0
    }
    current.storeCount += 1
    if (farm.status === 'active') current.activeStoreCount += 1
    current.activeStaffCount += farm.activeStaffCount
    current.transactionAmount += farm.transactionAmount
    current.orderCount += farm.orderCount
    current.riskCount += farm.riskCount
    current.previousAmount += previousTransactionByFarm.get(farm.farmId)?.amount || 0
    const voucher = voucherStatsByFarm.get(farm.farmId)
    current.eligibleVoucherCount += voucher?.count || 0
    current.redeemedVoucherCount += voucher?.redeemed || 0
    const fulfillment = fulfillmentStatsByFarm.get(farm.farmId)
    current.fulfillmentTotal += fulfillment?.total || 0
    current.fulfillmentCompleted += fulfillment?.completed || 0
    const paid = paidOrderStatsByFarm.get(farm.farmId)
    current.paidOrderCount += paid?.total || 0
    current.afterSaleCount += paid?.afterSale || 0
    if (farm.longitude !== undefined && farm.latitude !== undefined) {
      current.coordinateCount += 1
      current.longitudeTotal += farm.longitude
      current.latitudeTotal += farm.latitude
    }
    cityProfileMap.set(farm.cityCode, current)
  })
  const cityProfiles: DashboardCityProfile[] = [...cityProfileMap.values()].map((city) => ({
    cityCode: city.cityCode,
    cityName: city.cityName,
    ...(city.coordinateCount ? {
      longitude: round(city.longitudeTotal / city.coordinateCount, 4),
      latitude: round(city.latitudeTotal / city.coordinateCount, 4)
    } : {}),
    storeCount: city.storeCount,
    activeStoreCount: city.activeStoreCount,
    activeStaffCount: city.activeStaffCount,
    transactionAmount: round(city.transactionAmount),
    orderCount: city.orderCount,
    voucherRate: city.eligibleVoucherCount ? round(city.redeemedVoucherCount / city.eligibleVoucherCount * 100, 1) : null,
    fulfillmentRate: city.fulfillmentTotal ? round(city.fulfillmentCompleted / city.fulfillmentTotal * 100, 1) : null,
    afterSaleRate: city.paidOrderCount ? round(city.afterSaleCount / city.paidOrderCount * 100, 1) : null,
    riskCount: city.riskCount,
    growthRate: calculateGrowthRate(city.transactionAmount, city.previousAmount)
  })).sort((a, b) => b.transactionAmount - a.transactionAmount || a.cityCode.localeCompare(b.cityCode))
  const cityMapPoints: DashboardCityMapPoint[] = cityProfiles.flatMap((city) => (
    city.longitude === undefined || city.latitude === undefined ? [] : [{
      cityCode: city.cityCode, cityName: city.cityName, longitude: city.longitude, latitude: city.latitude,
      storeCount: city.storeCount, transactionAmount: city.transactionAmount, orderCount: city.orderCount, riskCount: city.riskCount
    }]
  ))

  const storeStatus = {
    active: allowedFarms.filter((farm) => farm.status === 'active').length,
    pending: allowedFarms.filter((farm) => farm.status === 'pending').length,
    paused: allowedFarms.filter((farm) => farm.status === 'paused').length
  }
  const activeStaffCount = source.storeAccounts.filter((account) => account.role === 'staff' && account.enabled && allowedFarmIds.has(account.farmId)).length
  return {
    generatedAt: now.toISOString(), principal: { ...principal, regionCodes: [...principal.regionCodes] }, range: { ...range }, modules: dashboardModulesForRole(principal.role),
    ...(source.demoSupplement ? { demoSupplement: { ...source.demoSupplement, datasets: [...source.demoSupplement.datasets] } } : {}),
    overview: {
      storeCount: allowedFarms.length, supplierCount: cooperatingSuppliers.length, transactionAmount, transactionOrderCount,
      activeStaffCount, riskCount: risks.reduce((sum, risk) => sum + risk.count, 0), promoterHostCount: activePromoterIds.size, lowStockSkuCount: lowStockSkus.length
    },
    storeStatus,
    fulfillment: { total: fulfillmentOrders.length, completed: completedFulfillment, rate: fulfillmentRate, overdueCount, abnormalCount },
    service: { paidOrderCount: paidOrderIds.size, afterSaleCount: afterSaleOrderIds.size, afterSaleRate, eligibleVoucherCount: vouchers.length, redeemedVoucherCount: redeemedVouchers, voucherRedemptionRate: voucherRate },
    inventory: { availableSkuCount: availableSkus.length, lowStockSkuCount: lowStockSkus.length, totalStock: availableSkus.reduce((sum, sku) => sum + sku.stock, 0), categoryCount: new Set(regionProducts.map((product) => product.category)).size },
    settlement: { pendingSupplierAmount, failedSupplierSettlementCount, pendingCommissionAmount, riskCount: failedSupplierSettlementCount },
    mapPoints, cityMapPoints, farmProfiles, cityProfiles,
    unlocatedStoreCount: unlocatedFarms.length, unattributedDataCount, regionRanking, categoryGaps, trend, risks, suggestions, domainFreshness,
    chain: { supplierCount: cooperatingSuppliers.length, listedProductCount: regionProducts.length, activeStoreCount: storeStatus.active, activePromoterHostCount: activePromoterIds.size }
  }
}
