import { PLATFORM_DICTIONARIES_STORAGE_KEY, DICTIONARY_SCHEMA_VERSION, selectDictOptions, builtInDictLabel, canPublishPlatformDictionaries, defaultDictionaryPublishLock, migratePlatformDictionaries, createInitialPlatformDictionaries, mergeLegacyProductCategories } from './dictionaries'
import { PlatformEventBus } from './platform-event-bus'
import { normalizeMediaReference, type MediaReference } from './media'
import { defaultProductCategoryImage } from './product-category-images'
import type { DictionaryPublishLock, PlatformDictionaryState } from './dictionaries'
import type { FarmLocation } from './geocoding'
export type Role = 'customer' | 'staff' | 'manager'
export type ProductSource = 'platform' | 'farmhouse'
export type ProductStatus = 'active' | 'pending' | 'offline' | 'rejected'
export type OrderStatus = 'pending-payment' | 'pending' | 'shipping' | 'delivered' | 'after-sale' | 'paid-cancelled' | 'unpaid-cancelled'
export type AfterSaleStatus = 'processing' | 'rejected' | 'refund-pending' | 'return-pending' | 'refunded' | 'refund-failed'
export type PurchaseStatus = 'submitted' | 'accepted' | 'shipped' | 'delivering' | 'received' | 'completed' | 'cancelled'
export type MockScenario = 'normal' | 'empty' | 'failure'
export type FarmAvailability = 'bookable' | 'full' | 'closed'
export type CommissionStatus = 'pending' | 'available' | 'completed' | 'settled' | 'reversed'
export const PERSISTENCE_VERSION = 8

export interface Sku {
  id: string
  name: string
  price: number
  cost: number
  stock: number
  image?: string
  level1Amount?: number
  level2Amount?: number
  minimumOrderQuantity?: number
}

export interface Member {
  id: string
  name: string
  level: 'normal' | 'silver' | 'gold'
  balance: number
  points: number
  phone: string
  memberNo?: string
  cumulativeCommission?: number
  fans?: number
  monthlyOrders?: number
}

export interface CommissionRule {
  id: string
  name: string
  targetType: 'farm' | 'product' | 'live'
  rate: number
  enabled: boolean
  updatedAt: string
}

export interface LogisticsEvent {
  time: string
  title: string
  detail: string
}

export interface BalanceEntry {
  id: string
  type: 'recharge' | 'consume' | 'refund'
  amount: number
  balance: number
  description: string
  createdAt: string
}

export interface PromotionRecord {
  id: string
  targetType: 'farm' | 'product' | 'live'
  targetId: string
  targetName: string
  link: string
  shareCount: number
  lockedFans: number
  estimatedCommission: number
  promoterId?: string
  createdAt: string
}

export interface CommissionEntry {
  id: string
  type: 'income' | 'withdrawal'
  amount: number
  description: string
  createdAt: string
  promoterId?: string
  status: CommissionStatus
  targetType?: PromotionRecord['targetType']
  targetId?: string
  requestKey?: string
}

export interface TenantConfig {
  code: string
  farmId: string
  buildTarget: string
  name: string
  shortName: string
  slogan: string
  theme: string
  phone: string
  address: string
  hours: string
  distanceKm?: number
  appId?: string
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  sales: number
  source: ProductSource
  status: ProductStatus
  image: BusinessMediaValue
  supplier: string
  tags: string[]
  skus: Sku[]
  farmIds: string[]
  promoName?: string
  emoji?: string
  commissionRate?: number
  commissionSold?: number
  commissionEarn?: number
  spec?: string
  images?: BusinessMediaValue[]
  channels?: { store?: boolean; live?: boolean }
  expressDelivery?: boolean
  productType?: ProductType
  staffCommissionRate?: number
  supplierId?: string
  supplierName?: string
  channel?: CatalogChannel
  promoterCommissionRate?: number
  storeCommissionRate?: number
}

export type ProductChannel = 'store' | 'live'
export type ProductType = 'goods' | 'package'
export type CatalogChannel = 'store' | 'live' | 'all'

/** 门店 / 业务员档位默认折让系数（分销价）：A 档 95 折、B 档 97 折、C 档为基准分销价。 */
export const DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS: Record<StorePriceLevel, number> = { A: 0.95, B: 0.97, C: 1 }

export interface PricingDefaults {
  promoterCommissionRate: number
  storeCommissionRate: number
  level1Amount: number
  level2Amount: number
  /** 门店 / 业务员档位折让系数（清单「分销价格」：按门店 / 业务员层级配置分销供货价） */
  storePriceLevelDiscounts?: Record<StorePriceLevel, number>
}

export interface CatalogSku {
  id: string
  name: string
  image: BusinessMediaValue
  retailPrice: number
  cost: number
  stock: number
  level1Amount: number
  level2Amount: number
  minimumOrderQuantity?: number
  status?: 'active' | 'retired'
  /** SKU 库存预警阈值；留空表示不预警（清单「库存预警」） */
  warningThreshold?: number
}

export interface CatalogProduct {
  id: string
  name: string
  category: string
  supplierId: string
  supplierName: string
  source: ProductSource
  status: ProductStatus
  image: BusinessMediaValue
  images: BusinessMediaValue[]
  tags: string[]
  productType: ProductType
  expressDelivery: boolean
  channel: CatalogChannel
  farmIds: string[]
  promoterCommissionRate: number
  storeCommissionRate: number
  skus: CatalogSku[]
}

export interface CatalogState {
  schemaVersion: number
  revision: number
  products: CatalogProduct[]
  appliedOperations?: Record<string, CatalogStockOperation>
}

export interface StoreCatalogSelection {
  storeId: string
  productId: string
  listed: boolean
  skuRetailPrices?: Record<string, number>
  /** @deprecated v0 compatibility; migrated to skuRetailPrices on read. */
  retailPrice?: number
  updatedAt: string
}

export interface StoreCatalogSelectionState {
  schemaVersion: number
  revision: number
  selections: StoreCatalogSelection[]
}

export interface CatalogStockChange {
  productId: string
  skuId: string
  quantity: number
}

/** 库存变动流水（清单「库存变化记录」）：后台商品库保存时，同一 SKU 库存数值变化即记一条。 */
export interface CatalogStockLogEntry {
  id: string
  productId: string
  skuId: string
  skuName: string
  before: number
  after: number
  delta: number
  reason: string
  operator: string
  createdAt: string
}

export interface CatalogStockOperation {
  id: string
  action: 'reserve' | 'release'
  requestFingerprint: string
  changes: CatalogStockChange[]
  appliedAt: string
}

export type CatalogTransactionChannel = 'user' | 'farmhouse' | 'store'
export type CatalogTransactionStatus = 'prepared' | 'stock-applied' | 'committed' | 'aborted'

export interface CatalogTransactionJournalEntry<T = unknown> {
  id: string
  channel: CatalogTransactionChannel
  action: 'reserve' | 'release'
  status: CatalogTransactionStatus
  inventoryChanges: CatalogStockChange[]
  payload: T
  createdAt: string
  updatedAt: string
}

export const DEFAULT_PRICING_DEFAULTS: PricingDefaults = {
  promoterCommissionRate: 5,
  storeCommissionRate: 3,
  level1Amount: 10,
  level2Amount: 15,
  storePriceLevelDiscounts: { ...DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS }
}

export const PLATFORM_CATALOG_STORAGE_KEY = 'agritainment-platform-catalog'
export const PLATFORM_CATALOG_STOCK_LOG_STORAGE_KEY = 'agritainment-platform-catalog-stock-log'
export const PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY = 'agritainment-platform-store-catalog-selections'
export const PLATFORM_PRICING_DEFAULTS_STORAGE_KEY = 'agritainment-platform-pricing-defaults'
export const PLATFORM_SHARE_CONFIG_STORAGE_KEY = 'agritainment-platform-share-config'
export const PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY = 'agritainment-platform-catalog-transaction-journal'
export const PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY = 'agritainment-platform-catalog-product-submissions'
export const PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY = 'agritainment-platform-driver-store-scopes'
export const PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY = 'agritainment-platform-named-delivery-routes'
export const PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY = 'agritainment-platform-daily-delivery-routes'
export const PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY = 'agritainment-platform-transaction-journal'
export const PLATFORM_RECOVERY_QUEUE_STORAGE_KEY = 'agritainment-platform-recovery-queue'
export const PLATFORM_AUDIT_LOG_STORAGE_KEY = 'agritainment-platform-audit-log'
export const PLATFORM_ADMIN_ROLES_STORAGE_KEY = 'agritainment-platform-admin-roles'
export const PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY = 'agritainment-platform-admin-accounts'
export const CATALOG_SCHEMA_VERSION = 2
export const STORE_CATALOG_SELECTION_SCHEMA_VERSION = 1
export const CATALOG_PRODUCT_SUBMISSION_SCHEMA_VERSION = 1
export const DRIVER_STORE_SCOPE_SCHEMA_VERSION = 1
export const NAMED_DELIVERY_ROUTE_SCHEMA_VERSION = 1
export const DAILY_DELIVERY_ROUTE_SCHEMA_VERSION = 1
export const DRIVER_CHECK_IN_MAX_METERS = 500

export type PlatformJournalStatus = 'prepared' | 'committed' | 'aborted' | 'recovery-pending'
export interface PlatformJournalEntry {
  operationId: string
  collections: string[]
  original: unknown
  target: unknown
  recoveryHandlerKey?: StoredPlatformRecoveryHandlerKey
  recoverySchema?: string
  completedSteps: string[]
  status: PlatformJournalStatus
  createdAt: string
  updatedAt: string
}

export type CatalogProductSubmissionKind = 'create' | 'update'
export type CatalogProductSubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface CatalogProductSubmission {
  id: string
  productId: string
  source: 'supplier' | 'admin'
  supplierId?: string
  kind: CatalogProductSubmissionKind
  status: CatalogProductSubmissionStatus
  draft: CatalogProduct
  baseCatalogRevision: number
  baseProductFingerprint?: string
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

export interface CatalogProductSubmissionState {
  schemaVersion: number
  revision: number
  submissions: CatalogProductSubmission[]
  updatedAt: string
}

export interface DriverStoreScope {
  supplierId: string
  driverId: string
  storeIds: string[]
  updatedAt: string
}

export interface DriverStoreScopeState {
  schemaVersion: number
  revision: number
  scopes: DriverStoreScope[]
  updatedAt: string
}

export interface RouteStopCheckIn {
  at: string
  latitude: number
  longitude: number
  distanceM: number
}

export interface RouteStop {
  storeId: string
  storeName: string
  address: string
  longitude?: number
  latitude?: number
  orderIds: string[]
  completedOrderIds?: string[]
  completedAt?: string
  checkIn?: RouteStopCheckIn
}

export interface NamedDeliveryRoute {
  id: string
  supplierId: string
  name: string
  storeIds: string[]
  driverId?: string
  updatedAt: string
}

export interface NamedDeliveryRouteState {
  schemaVersion: number
  revision: number
  routes: NamedDeliveryRoute[]
  updatedAt: string
}

export interface DeliveryRouteOrder {
  orderId: string
  storeId: string
  storeName: string
  address: string
  longitude?: number
  latitude?: number
}

export interface RouteOrigin {
  longitude: number
  latitude: number
}

export interface RouteOptimizationInput {
  origin: RouteOrigin
  stops: readonly RouteStop[]
  preserveStopOrder?: boolean
  averageSpeedKmh?: number
  serviceMinutesPerStop?: number
}

export interface RouteSegment {
  fromId: string
  toStoreId: string
  distanceKm: number
}

export interface RouteOptimizationOutput {
  orderedStops: RouteStop[]
  segments: RouteSegment[]
  totalDistanceKm: number
  estimatedDurationMinutes: number
  provider: string
  warnings: string[]
  polyline?: RouteOrigin[]
}

export type RouteOutboundHandoverStatus = 'pending_supplier' | 'rejected' | 'pending_dispatch' | 'dispatched'

export interface RouteOutboundHandoverItem {
  skuId: string
  productId: string
  name: string
  skuName: string
  image: string
  expected: number
  warehouseQuantity?: number
  driverActual: number
  supplierActual?: number
}

export interface RouteOutboundShortageAllocation {
  skuId: string
  storeId: string
  quantity: number
  note?: string
}

export interface RouteOutboundHandover {
  status: RouteOutboundHandoverStatus
  items: RouteOutboundHandoverItem[]
  driverId: string
  driverName: string
  driverSubmittedAt: string
  driverNote?: string
  proofImages?: string[]
  rejectionReason?: string
  supplierId?: string
  supplierName?: string
  supplierReviewedAt?: string
  supplierNote?: string
  reviewHistory?: Array<{ action: 'confirmed' | 'rejected'; at: string; operatorId: string; operatorName: string; note?: string }>
  shortageAllocations: RouteOutboundShortageAllocation[]
  dispatchedAt?: string
}

export type RouteWarehouseCheckInReason = 'location_failed' | 'device_issue' | 'warehouse_coordinate_error' | 'other'

export interface RouteWarehouseCheckIn {
  at: string
  type?: 'normal' | 'abnormal'
  reasonCode?: RouteWarehouseCheckInReason
  reasonNote?: string
  longitude?: number
  latitude?: number
  distanceM?: number
}

export interface DailyDeliveryRoute {
  id: string
  supplierId: string
  driverId: string
  namedRouteId?: string
  deliveryDate: string
  status: 'draft' | 'published' | 'stale' | 'completed'
  stops: RouteStop[]
  totalDistanceKm: number
  estimatedDurationMinutes: number
  sourceOrderIds: string[]
  provider: string
  segments?: RouteSegment[]
  warnings?: string[]
  origin?: RouteOrigin
  scopeStoreIds?: string[]
  baselineRevisions?: { routes: number; orders: number; scopes: number; entities: number; namedRoutes?: number; drivers?: number }
  warehouseCheckIn?: RouteWarehouseCheckIn
  outboundHandover?: RouteOutboundHandover
  stopCount?: number
  polyline?: RouteOrigin[]
  generatedAt: string
  publishedAt?: string
  completedAt?: string
}

export interface DailyDeliveryRouteState {
  schemaVersion: number
  revision: number
  routes: DailyDeliveryRoute[]
  updatedAt: string
}
export interface PlatformRecoveryTask {
  id: string
  operationId: string
  failedStep: string
  reason: string
  handlerKey?: StoredPlatformRecoveryHandlerKey
  retryCount: number
  lastError?: string
  createdAt: string
  status: 'pending' | 'resolved'
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
}

export type WriteResult<T = void> =
  | { ok: true; value?: T; operationId?: string }
  | { ok: false; code: string; message: string; operationId?: string; failedStep?: string; recoveryQueued?: boolean; fatal?: boolean }
export const PLATFORM_PRODUCTION_RECOVERY_HANDLER_KEYS = [
  'user-receipt-v1', 'user-after-sale-v1', 'user-payment-v1', 'user-payment-confirmation-v1', 'user-package-v1',
  'store-order-v1', 'store-return-completion-v1',
  'farmhouse-refund-v1', 'farmhouse-voucher-v1',
  'supplier-commit-v1', 'supplier-fulfillment-sync-v1',
  'admin-fulfillment-v1', 'admin-settlement-v1', 'admin-after-sale-v1',
  'user-commerce-recovery-v1', 'farmhouse-commerce-recovery-v1', 'admin-commission-rule-v1',
  'admin-supplier-settlement-v1', 'admin-commission-settlement-v1',
  'admin-failure-audit-v1',
  'catalog-product-review-v1'
] as const
/** Stable keys accepted by new production recovery registrations. */
export type PlatformProductionRecoveryHandlerKey = typeof PLATFORM_PRODUCTION_RECOVERY_HANDLER_KEYS[number]
/** Legacy journal snapshots may contain custom string keys and remain readable. */
export type PlatformRecoveryHandlerKey = PlatformProductionRecoveryHandlerKey
type StoredPlatformRecoveryHandlerKey = PlatformRecoveryHandlerKey | (string & {})

export interface RepositorySnapshot<T = unknown> { revision: number; updatedAt: string; data: T }

export interface PlatformTransactionStep {
  key: string
  apply: () => boolean
  rollback?: () => boolean
}

export interface PlatformTransactionSpec {
  operationId: string
  collections: string[]
  original?: unknown
  target?: unknown
  recoveryHandlerKey?: string
  recoverySchema?: string
  revisionChecks?: Array<{ key: string; expectedRevision: number }>
  steps: PlatformTransactionStep[]
}

export interface LockedPlatformTransactionSpec<T> extends PlatformTransactionSpec {
  recoveryHandlerKey?: PlatformRecoveryHandlerKey
  lockCollections?: string[]
  validate?: () => boolean
  value?: T
}

export interface LockedPlatformMutationBuildResult<T> {
  targetSnapshots: Record<string, unknown>
  steps: PlatformTransactionStep[]
  value?: T
}

export interface LockedPlatformMutationSpec<T> {
  operationId: string
  collectionKeys: string[]
  revisionChecks: Record<string, number>
  recoveryHandlerKey: PlatformRecoveryHandlerKey
  recoverySchema?: string
  build: (currentSnapshots: Record<string, unknown>, revisions: Record<string, number>) => LockedPlatformMutationBuildResult<T>
}

export interface PlatformRecoveryHandler {
  execute: (task: PlatformRecoveryTask, journal: PlatformJournalEntry) => boolean | Promise<boolean>
  readSnapshot: (task: PlatformRecoveryTask, journal: PlatformJournalEntry) => unknown | Promise<unknown>
}
export interface PlatformRecoveryHandlerRegistration {
  key: PlatformRecoveryHandlerKey
  handler: PlatformRecoveryHandler
}

/** Creates a typed production registration without inventing a generic snapshot recovery handler. */
export function createPlatformProductionRecoveryHandlerRegistration(key: PlatformProductionRecoveryHandlerKey, handler: PlatformRecoveryHandler): PlatformRecoveryHandlerRegistration {
  return { key, handler }
}

export function createStrictSnapshotRecoveryHandlerRegistration<T extends object, TToken>(input: {
  key: PlatformProductionRecoveryHandlerKey
  fields: readonly (keyof T)[]
  validateJournal: (journal: PlatformJournalEntry) => boolean
  readStable: (journal: PlatformJournalEntry) => { snapshot: T; token: TToken } | null
  isStillStable: (token: TToken, journal: PlatformJournalEntry) => boolean
  writeSnapshot: (snapshot: T, rollback: T, journal: PlatformJournalEntry) => boolean
}): PlatformRecoveryHandlerRegistration {
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
  return createPlatformProductionRecoveryHandlerRegistration(input.key, {
    execute: (task, journal) => {
      if (task.handlerKey !== input.key || !input.validateJournal(journal)) return false
      const original = journal.original as T
      const target = journal.target as T
      const stable = input.readStable(journal)
      if (!stable) return false
      if (input.fields.some((field) => !same(stable.snapshot[field], original[field]) && !same(stable.snapshot[field], target[field]))) return false
      const desired = journal.status === 'committed' ? target : original
      if (same(stable.snapshot, desired)) return true
      if (!input.isStillStable(stable.token, journal)) return false
      return input.writeSnapshot(desired, stable.snapshot, journal)
    },
    readSnapshot: (task, journal) => task.handlerKey === input.key && input.validateJournal(journal) ? input.readStable(journal)?.snapshot || null : null
  })
}

const platformRecoveryHandlers = new Map<string, PlatformRecoveryHandler>()

export function registerPlatformRecoveryHandler(handlerKey: string, handler: PlatformRecoveryHandler): () => void {
  const key = handlerKey?.trim()
  if (!key || !handler || typeof handler.execute !== 'function' || typeof handler.readSnapshot !== 'function') return () => undefined
  platformRecoveryHandlers.set(key, handler)
  return () => { if (platformRecoveryHandlers.get(key) === handler) platformRecoveryHandlers.delete(key) }
}

/** Registers production handlers once, preserving handlers registered by tests or other modules. */
export function initializePlatformRecoveryHandlers(handlers: readonly PlatformRecoveryHandlerRegistration[]): void {
  handlers.forEach(({ key, handler }) => {
    const handlerKey = key?.trim()
    if (!handlerKey || platformRecoveryHandlers.has(handlerKey) || !handler || typeof handler.execute !== 'function' || typeof handler.readSnapshot !== 'function') return
    platformRecoveryHandlers.set(handlerKey, handler)
  })
}

export interface PlatformTransactionRunResult {
  ok: boolean
  operationId: string
  failedStep?: string
  reason?: string
  recoveryQueued?: boolean
  fatal?: boolean
}

type BrowserLockManager = {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>
}

const platformCollectionMutexes = new Map<string, Promise<void>>()

function normalizePlatformTransactionCollections(collections: readonly string[]): string[] {
  return [...new Set(collections.map((key) => key.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function revisionChecksPass(revisionChecks?: readonly { key: string; expectedRevision: number }[]): boolean {
  return !revisionChecks?.some(({ key, expectedRevision }) => !key?.trim() || !Number.isInteger(expectedRevision) || readPlatformCollectionRevision(key) !== expectedRevision)
}

function missingPlatformTransactionRevisionCheck(collections: readonly string[], revisionChecks?: readonly { key: string; expectedRevision: number }[]): string | undefined {
  const internalCollections = new Set([PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY])
  const seenRevisionKeys = new Set<string>()
  const checkedCollections = new Set<string>()
  for (const { key, expectedRevision } of revisionChecks || []) {
    const normalizedKey = key?.trim()
    if (!normalizedKey || normalizedKey !== key || seenRevisionKeys.has(normalizedKey)) return normalizedKey || key || 'invalid-revision-check'
    seenRevisionKeys.add(normalizedKey)
    if (Number.isInteger(expectedRevision)) checkedCollections.add(key)
  }
  return normalizePlatformTransactionCollections(collections).find((key) => !internalCollections.has(key) && !checkedCollections.has(key))
}

async function withFallbackPlatformCollectionLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = platformCollectionMutexes.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => barrier)
  platformCollectionMutexes.set(key, tail)
  await previous
  try {
    return await action()
  } finally {
    release()
    if (platformCollectionMutexes.get(key) === tail) platformCollectionMutexes.delete(key)
  }
}

async function withLockedPlatformCollections<T>(collections: readonly string[], action: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { locks?: BrowserLockManager }).locks
  const acquire = async (index: number): Promise<T> => {
    if (index >= collections.length) return action()
    const next = () => acquire(index + 1)
    return lockManager
      ? lockManager.request(`agritainment-platform:${collections[index]}`, next)
      : withFallbackPlatformCollectionLock(collections[index], next)
  }
  return acquire(0)
}

function transactionFailureMessage(reason?: string): string {
  if (reason === 'revision-conflict') return '数据已更新，请刷新后重试'
  return '事务未完成，请重试或在恢复中心处理'
}

function toLockedTransactionWriteResult<T>(result: PlatformTransactionRunResult, value?: T): WriteResult<T> {
  if (result.ok) return { ok: true, value, operationId: result.operationId }
  return {
    ok: false,
    code: result.reason === 'revision-conflict' ? 'revision_conflict' : (result.reason || 'transaction-failed').replace(/-/g, '_'),
    message: transactionFailureMessage(result.reason),
    operationId: result.operationId,
    failedStep: result.failedStep,
    recoveryQueued: result.recoveryQueued,
    fatal: result.fatal
  }
}

/** Async transaction entry point that serializes all participating local collections. */
export async function runLockedPlatformTransaction<T>(input: LockedPlatformTransactionSpec<T>): Promise<WriteResult<T>> {
  const transactionCollections = normalizePlatformTransactionCollections([
    ...(input.collections || []),
    PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
    PLATFORM_RECOVERY_QUEUE_STORAGE_KEY
  ])
  const lockedCollections = normalizePlatformTransactionCollections([...transactionCollections, ...(input.lockCollections || [])])
  return withLockedPlatformCollections(lockedCollections, async () => {
    const missingRevisionCheck = missingPlatformTransactionRevisionCheck(input.collections || [], input.revisionChecks)
    if (missingRevisionCheck) {
      return { ok: false, code: 'missing_revision_check', message: `事务集合缺少 revision check：${missingRevisionCheck}`, operationId: input.operationId }
    }
    if (!revisionChecksPass(input.revisionChecks)) {
      return { ok: false, code: 'revision_conflict', message: transactionFailureMessage('revision-conflict'), operationId: input.operationId }
    }
    if (input.validate && !input.validate()) {
      return { ok: false, code: 'validation_failed', message: '数据状态已变化，请刷新后重试', operationId: input.operationId }
    }
    return toLockedTransactionWriteResult(runPlatformTransaction({ ...input, collections: transactionCollections }), input.value)
  })
}

/** Builds all mutation snapshots only after every participating collection lock is held. */
export async function runLockedPlatformMutation<T>(input: LockedPlatformMutationSpec<T>): Promise<WriteResult<T>> {
  const collections = normalizePlatformTransactionCollections(input.collectionKeys || [])
  if (!collections.length) return { ok: false, code: 'invalid_input', message: '事务集合不能为空', operationId: input.operationId }
  const transactionCollections = normalizePlatformTransactionCollections([
    ...collections,
    PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
    PLATFORM_RECOVERY_QUEUE_STORAGE_KEY
  ])
  const revisionChecks = Object.entries(input.revisionChecks || {}).map(([key, expectedRevision]) => ({ key, expectedRevision }))
  return withLockedPlatformCollections(transactionCollections, async () => {
    const missingRevisionCheck = missingPlatformTransactionRevisionCheck(collections, revisionChecks)
    if (missingRevisionCheck) {
      return { ok: false, code: 'missing_revision_check', message: `事务集合缺少 revision check：${missingRevisionCheck}`, operationId: input.operationId }
    }
    if (!revisionChecksPass(revisionChecks)) {
      return { ok: false, code: 'revision_conflict', message: transactionFailureMessage('revision-conflict'), operationId: input.operationId }
    }
    const revisions = Object.fromEntries(collections.map((key) => [key, readPlatformCollectionRevision(key)]))
    const currentSnapshots = Object.fromEntries(collections.map((key) => [key, cloneSeed(readPlatformJson<unknown>(key))]))
    let mutation: LockedPlatformMutationBuildResult<T>
    try {
      mutation = input.build(currentSnapshots, revisions)
    } catch (error) {
      return {
        ok: false,
        code: 'mutation_build_failed',
        message: error instanceof Error && error.message ? error.message : '事务目标构建失败',
        operationId: input.operationId
      }
    }
    if (!mutation || !mutation.targetSnapshots || !mutation.steps?.length
      || collections.some((key) => !Object.prototype.hasOwnProperty.call(mutation.targetSnapshots, key))) {
      return { ok: false, code: 'mutation_build_failed', message: '事务目标构建失败', operationId: input.operationId }
    }
    return toLockedTransactionWriteResult(runPlatformTransaction({
      operationId: input.operationId,
      collections: transactionCollections,
      original: currentSnapshots,
      target: mutation.targetSnapshots,
      recoveryHandlerKey: input.recoveryHandlerKey,
      recoverySchema: input.recoverySchema,
      revisionChecks,
      steps: mutation.steps
    }), mutation.value)
  })
}

export async function runLockedPlatformCollectionTask<T>(input: {
  collections: readonly string[]
  revisionChecks?: Array<{ key: string; expectedRevision: number }>
  execute: () => T | Promise<T>
}): Promise<WriteResult<T>> {
  const collections = normalizePlatformTransactionCollections(input.collections || [])
  if (!collections.length || typeof input.execute !== 'function') return { ok: false, code: 'invalid_input', message: '锁任务参数无效' }
  return withLockedPlatformCollections(collections, async () => {
    if (!revisionChecksPass(input.revisionChecks)) return { ok: false, code: 'revision_conflict', message: transactionFailureMessage('revision-conflict') }
    try {
      return { ok: true, value: await input.execute() }
    } catch (error) {
      return { ok: false, code: 'task_failed', message: error instanceof Error && error.message ? error.message : '锁任务执行失败' }
    }
  })
}

/** Best-effort multi-collection transaction for localStorage-backed demo data. */
export function runPlatformTransaction(input: PlatformTransactionSpec): PlatformTransactionRunResult {
  const { operationId, collections, original, target, recoveryHandlerKey, recoverySchema, revisionChecks, steps } = input
  if (!operationId?.trim() || !collections?.length || !steps?.length) return { ok: false, operationId, reason: 'invalid-transaction' }
  if (!revisionChecksPass(revisionChecks)) {
    return { ok: false, operationId, reason: 'revision-conflict' }
  }
  if (!preparePlatformJournal({ operationId, collections, original: original ?? {}, target: target ?? {}, recoveryHandlerKey, recoverySchema })) return { ok: false, operationId, reason: 'journal-prepare-failed' }
  const applied: PlatformTransactionStep[] = []

  const rollbackSteps = (doneSteps: PlatformTransactionStep[]): boolean => {
    let rollbackOk = true
    for (const done of [...doneSteps].reverse()) {
      if (!done.rollback) {
        rollbackOk = false
        continue
      }
      try {
        if (!done.rollback()) rollbackOk = false
      } catch {
        rollbackOk = false
      }
    }
    return rollbackOk
  }

  const queueRecovery = (failedStep: string, reason: string): boolean => enqueuePlatformRecovery({ operationId, failedStep, reason, handlerKey: readPlatformJournal()[operationId]?.recoveryHandlerKey || recoveryHandlerKey })

  for (const step of steps) {
    const failedStep = step?.key || 'unknown'
    let appliedOk = false
    let applyThrew = false
    try {
      appliedOk = !!step?.key && step.apply()
    } catch {
      applyThrew = true
    }
    if (!appliedOk) {
      const rollbackOk = rollbackSteps(step?.rollback ? [...applied, step] : applied)
      const journalOk = resolvePlatformJournal(operationId, rollbackOk ? 'aborted' : 'recovery-pending')
      const recoveryQueued = !rollbackOk || !journalOk ? queueRecovery(failedStep, !rollbackOk ? 'transaction rollback failed' : 'journal status write failed') : undefined
      return { ok: false, operationId, failedStep, reason: recoveryQueued === false ? 'recovery-queue-write-failed' : applyThrew ? 'step-threw' : 'step-failed', recoveryQueued, fatal: recoveryQueued === false || undefined }
    }
    applied.push(step)
    if (!markPlatformJournalStep(operationId, step.key)) {
      const rollbackOk = rollbackSteps(applied)
      resolvePlatformJournal(operationId, rollbackOk ? 'aborted' : 'recovery-pending')
      const recoveryQueued = queueRecovery(step.key, rollbackOk ? 'journal step write failed after rollback' : 'journal step write and rollback failed')
      return { ok: false, operationId, failedStep: step.key, reason: recoveryQueued ? 'journal-step-write-failed' : 'recovery-queue-write-failed', recoveryQueued, fatal: recoveryQueued === false || undefined }
    }
  }
  if (!resolvePlatformJournal(operationId, 'committed')) {
    const rollbackOk = rollbackSteps(applied)
    resolvePlatformJournal(operationId, rollbackOk ? 'aborted' : 'recovery-pending')
    const recoveryQueued = queueRecovery('journal', rollbackOk ? 'journal commit write failed after rollback' : 'journal commit write and rollback failed')
    return { ok: false, operationId, failedStep: 'journal', reason: recoveryQueued ? 'journal-resolve-failed' : 'recovery-queue-write-failed', recoveryQueued, fatal: recoveryQueued === false || undefined }
  }
  return { ok: true, operationId }
}

export function resolvePlatformRecoveryTask(id: string, verification?: { resolvedBy: string; note: string; outcome: 'committed' | 'aborted'; audit?: () => boolean }): boolean {
  if (!id?.trim()) return false
  const queue = readPlatformRecoveryQueue()
  const index = queue.findIndex((task) => task.id === id)
  if (index < 0 || queue[index].status !== 'pending') return false
  const task = queue[index]
  if (task.handlerKey && platformRecoveryHandlers.has(task.handlerKey)) return false
  if (!verification?.resolvedBy?.trim() || !verification.note?.trim() || !['committed', 'aborted'].includes(verification.outcome)) return false
  const journal = readPlatformJournal()[task.operationId]
  if (journal && !resolvePlatformJournal(task.operationId, verification.outcome)) return false
  queue[index] = { ...task, status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: verification.resolvedBy.trim(), resolutionNote: verification.note.trim() }
  if (!writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)) {
    if (journal) resolvePlatformJournal(task.operationId, 'recovery-pending')
    return false
  }
  let auditOk = true
  try { auditOk = verification.audit ? verification.audit() : true } catch { auditOk = false }
  if (auditOk) return true
  queue[index] = { ...task, lastError: 'audit-log-failed' }
  const queueRestored = writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)
  const journalRestored = journal ? resolvePlatformJournal(task.operationId, 'recovery-pending') : true
  if (!queueRestored || !journalRestored) enqueuePlatformRecovery({ operationId: task.operationId, failedStep: 'recovery-audit', reason: 'recovery audit rollback failed' })
  return false
}

export async function retryPlatformRecoveryTask(id: string, resolvedBy: string, audit?: () => boolean): Promise<WriteResult<PlatformRecoveryTask>> {
  if (!id?.trim() || !resolvedBy?.trim()) return { ok: false, code: 'invalid-input', message: '恢复任务和操作人不能为空' }
  let hintedCollections: string[] | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!hintedCollections) {
      const hintedTask = readPlatformRecoveryQueue().find((task) => task.id === id)
      const hintedJournal = hintedTask ? readPlatformJournal()[hintedTask.operationId] : undefined
      hintedCollections = normalizePlatformTransactionCollections([
        PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
        PLATFORM_RECOVERY_QUEUE_STORAGE_KEY,
        ...(hintedJournal?.collections || [])
      ])
    }
    const lockedCollections = hintedCollections
    const result = await withLockedPlatformCollections(lockedCollections, async (): Promise<WriteResult<PlatformRecoveryTask> | { retryWith: string[] }> => {
      const queue = readPlatformRecoveryQueue()
      const index = queue.findIndex((task) => task.id === id)
      if (index < 0) return { ok: false, code: 'not-found', message: '恢复任务不存在' }
      const task = queue[index]
      if (task.status !== 'pending') return { ok: false, code: 'already-resolved', message: '恢复任务已处理' }
      if (!task.handlerKey) return { ok: false, code: 'manual-verification-required', message: '旧恢复任务需人工核验并填写处理说明' }
      const handler = platformRecoveryHandlers.get(task.handlerKey)
      if (!handler) return { ok: false, code: 'handler-not-registered', message: '恢复处理器尚未加载' }
      const journal = readPlatformJournal()[task.operationId]
      if (!journal) return { ok: false, code: 'journal-not-found', message: '事务快照不存在，需人工核验' }
      const requiredCollections = normalizePlatformTransactionCollections([
        PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
        PLATFORM_RECOVERY_QUEUE_STORAGE_KEY,
        ...journal.collections
      ])
      if (requiredCollections.some((key) => !lockedCollections.includes(key))) return { retryWith: requiredCollections }

      let code = 'handler-failed'
      let snapshot: unknown
      let executed = false
      try {
        executed = await handler.execute(task, journal)
        if (executed) snapshot = await handler.readSnapshot(task, journal)
      } catch (error) {
        code = error instanceof Error && error.message ? error.message : 'handler-threw'
      }
      let matchesOriginal = false
      let matchesTarget = false
      if (executed) {
        try {
          const serialized = JSON.stringify(snapshot)
          matchesOriginal = serialized === JSON.stringify(journal.original)
          matchesTarget = serialized === JSON.stringify(journal.target)
          if (!matchesOriginal && !matchesTarget) code = 'snapshot-mismatch'
        } catch {
          code = 'snapshot-unreadable'
        }
      }

      const retried: PlatformRecoveryTask = { ...task, retryCount: task.retryCount + 1 }
      if (!matchesOriginal && !matchesTarget) {
        queue[index] = { ...retried, lastError: code }
        if (!writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)) return { ok: false, code: 'recovery-update-failed', message: '恢复结果无法保存' }
        return { ok: false, code, message: code === 'snapshot-mismatch' ? '恢复后数据与原始及目标快照均不一致' : '恢复处理器执行失败' }
      }

      const nextJournalStatus: PlatformJournalStatus = matchesOriginal ? 'aborted' : 'committed'
      if (!resolvePlatformJournal(task.operationId, nextJournalStatus)) {
        queue[index] = { ...retried, lastError: 'journal-resolve-failed' }
        writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)
        return { ok: false, code: 'journal-resolve-failed', message: '恢复数据已确认，但事务状态无法保存' }
      }
      const resolved: PlatformRecoveryTask = { ...retried, status: 'resolved', lastError: undefined, resolvedAt: new Date().toISOString(), resolvedBy: resolvedBy.trim() }
      queue[index] = resolved
      if (!writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)) return { ok: false, code: 'recovery-update-failed', message: '恢复任务状态无法保存' }
      let auditOk = true
      try { auditOk = audit ? audit() : true } catch { auditOk = false }
      if (!auditOk) {
        queue[index] = { ...retried, status: 'pending', lastError: 'audit-log-failed' }
        const queueRestored = writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)
        const journalRestored = resolvePlatformJournal(task.operationId, 'recovery-pending')
        if (!queueRestored || !journalRestored) enqueuePlatformRecovery({ operationId: task.operationId, failedStep: 'recovery-audit', reason: 'recovery audit rollback failed' })
        return { ok: false, code: 'audit-log-failed', message: '恢复成功日志无法保存' }
      }
      return { ok: true, value: resolved }
    })
    if ('retryWith' in result) {
      hintedCollections = result.retryWith
      continue
    }
    return result
  }
  return { ok: false, code: 'recovery-lock-set-changed', message: '恢复事务集合持续变化，请重试' }
}
export type AdminMenuKey = 'dashboard' | 'reports' | 'suppliers' | 'products' | 'categories' | 'prices' | 'orders' | 'afterSales' | 'farms' | 'promoters' | 'commissions' | 'users' | 'leaders' | 'dict' | 'logs' | 'roles' | 'accounts'
export type AdminPermissionCode = string

export interface AdminRole {
  id: string
  code: string
  name: string
  menuPermissions: AdminMenuKey[]
  actionPermissions: AdminPermissionCode[]
  enabled: boolean
  system: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminAccount {
  id: string
  account: string
  password: string
  name: string
  roleId: string
  enabled: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export const ADMIN_SUPER_ROLE_ID = 'AR-SUPER'
export const ADMIN_SUPER_ACCOUNT_ID = 'AA-SUPER'
const ADMIN_SEED_AT = '2026-08-29T00:00:00.000Z'

export const ALL_ADMIN_MENU_KEYS: AdminMenuKey[] = ['dashboard', 'reports', 'suppliers', 'products', 'categories', 'prices', 'orders', 'afterSales', 'farms', 'promoters', 'commissions', 'users', 'leaders', 'dict', 'logs', 'roles', 'accounts']
export const ALL_ADMIN_ACTION_PERMISSIONS: AdminPermissionCode[] = [
  'supplier.create', 'supplier.update', 'supplier.audit', 'supplier.pause', 'supplier.account.update', 'supplier.account.freeze',
  'product.create', 'product.update', 'product.audit', 'product.status', 'category.manage', 'price.manage',
  'order.ship', 'order.confirm', 'afterSale.manage', 'farm.manage', 'storeAccount.manage', 'promoter.manage',
  'commission.manage', 'withdrawal.review', 'dictionary.manage', 'report.export', 'recovery.resolve', 'audit.export',
  'user.view', 'leader.manage', 'leader.price.manage', 'leader.withdrawal.review',
  'admin.role.create', 'admin.role.update', 'admin.role.permissions', 'admin.account.create', 'admin.account.update', 'admin.account.status'
]

export function defaultAdminRoles(): AdminRole[] {
  const make = (id: string, code: string, name: string, menuPermissions: AdminMenuKey[], actionPermissions: AdminPermissionCode[], system = true): AdminRole => ({ id, code, name, menuPermissions, actionPermissions, enabled: true, system, createdAt: ADMIN_SEED_AT, updatedAt: ADMIN_SEED_AT })
  return [
    make(ADMIN_SUPER_ROLE_ID, 'super_admin', '超级管理员', [...ALL_ADMIN_MENU_KEYS], [...ALL_ADMIN_ACTION_PERMISSIONS]),
    make('AR-OPERATIONS', 'operations', '运营', ['dashboard', 'reports', 'suppliers', 'products', 'categories', 'prices', 'orders', 'afterSales', 'farms', 'promoters', 'users', 'leaders'], ['supplier.create', 'supplier.update', 'supplier.pause', 'supplier.account.update', 'supplier.account.freeze', 'product.create', 'product.update', 'product.status', 'category.manage', 'price.manage', 'order.ship', 'order.confirm', 'afterSale.manage', 'farm.manage', 'promoter.manage', 'report.export', 'user.view', 'leader.manage', 'leader.price.manage']),
    make('AR-REVIEWER', 'reviewer', '审核', ['dashboard', 'suppliers', 'products', 'afterSales'], ['supplier.audit', 'product.audit', 'product.status', 'afterSale.manage']),
    make('AR-FINANCE', 'finance', '财务', ['dashboard', 'reports', 'orders', 'afterSales', 'commissions', 'leaders'], ['commission.manage', 'withdrawal.review', 'leader.withdrawal.review', 'report.export']),
    make('AR-VIEWER', 'viewer', '只读', ['dashboard', 'reports'], [])
  ]
}

export function defaultAdminAccounts(): AdminAccount[] {
  return [{ id: ADMIN_SUPER_ACCOUNT_ID, account: 'admin', password: '123456', name: '超级管理员', roleId: ADMIN_SUPER_ROLE_ID, enabled: true, createdAt: ADMIN_SEED_AT, updatedAt: ADMIN_SEED_AT }]
}

export function readPlatformAdminRoles(): AdminRole[] {
  const saved = readPlatformJson<AdminRole[]>(PLATFORM_ADMIN_ROLES_STORAGE_KEY)
  return Array.isArray(saved) ? cloneSeed(saved) : []
}

export function writePlatformAdminRoles(roles: AdminRole[]): boolean {
  if (!Array.isArray(roles) || !roles.length || new Set(roles.map((role) => role.id)).size !== roles.length || new Set(roles.map((role) => role.code)).size !== roles.length) return false
  if (roles.some((role) => !role.id?.trim() || !role.code?.trim() || !role.name?.trim() || !Array.isArray(role.menuPermissions) || !Array.isArray(role.actionPermissions))) return false
  return writePlatformJson(PLATFORM_ADMIN_ROLES_STORAGE_KEY, roles)
}

export function readPlatformAdminAccounts(): AdminAccount[] {
  const saved = readPlatformJson<AdminAccount[]>(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY)
  return Array.isArray(saved) ? cloneSeed(saved) : []
}

export function writePlatformAdminAccounts(accounts: AdminAccount[]): boolean {
  if (!Array.isArray(accounts) || !accounts.length || new Set(accounts.map((item) => item.id)).size !== accounts.length || new Set(accounts.map((item) => item.account)).size !== accounts.length) return false
  if (accounts.some((item) => !item.id?.trim() || !item.account?.trim() || !item.password || !item.name?.trim() || !item.roleId?.trim())) return false
  return writePlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, accounts)
}

export function seedPlatformAdminSecurity(): boolean {
  const existingRoles = readPlatformAdminRoles()
  const existingAccounts = readPlatformAdminAccounts()
  const defaults = defaultAdminRoles()
  const productAuditRoles = new Set(['super_admin', 'reviewer'])
  // 预约管理与旅游线路已按功能清单移除：从历史角色里剔除对应菜单键与动作权限，避免残留死权限。
  const retiredMenus = new Set<string>(['bookings', 'routes'])
  const retiredPermissions = new Set<string>(['route.manage', 'booking.confirm', 'booking.complete', 'booking.cancel'])
  const roles = existingRoles.length ? existingRoles.map((role) => {
    const menuPermissions = [...new Set([...role.menuPermissions.filter((menu) => !retiredMenus.has(menu)), ...(productAuditRoles.has(role.code) ? ['products' as AdminMenuKey] : [])])]
    const actionPermissions = [...new Set([...role.actionPermissions.filter((permission) => !retiredPermissions.has(permission)), ...(productAuditRoles.has(role.code) ? ['product.audit'] : [])])]
    return {
      ...role,
      menuPermissions,
      actionPermissions
    }
  }) : defaults
  const accounts = existingAccounts.length ? existingAccounts : defaultAdminAccounts()
  if (existingRoles.length && existingAccounts.length && JSON.stringify(roles) === JSON.stringify(existingRoles)) return true
  const result = runPlatformTransaction({
    operationId: createId('ADMIN-SECURITY-SEED'),
    collections: [PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY],
    original: { roles: existingRoles, accounts: existingAccounts },
    target: { roles, accounts },
    steps: [
      { key: 'admin-roles', apply: () => writePlatformAdminRoles(roles), rollback: () => existingRoles.length ? writePlatformAdminRoles(existingRoles) : (clearPlatformJson(PLATFORM_ADMIN_ROLES_STORAGE_KEY), true) },
      { key: 'admin-accounts', apply: () => writePlatformAdminAccounts(accounts), rollback: () => existingAccounts.length ? writePlatformAdminAccounts(existingAccounts) : (clearPlatformJson(PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY), true) }
    ]
  })
  return result.ok
}

export function authenticateAdmin(accounts: AdminAccount[], roles: AdminRole[], account: string, password: string): { ok: true; account: AdminAccount; role: AdminRole } | { ok: false; reason: 'invalid-credentials' | 'inactive' } {
  const found = accounts.find((item) => item.account === account.trim())
  if (!found || found.password !== password) return { ok: false, reason: 'invalid-credentials' }
  const role = roles.find((item) => item.id === found.roleId)
  if (!found.enabled || !role?.enabled) return { ok: false, reason: 'inactive' }
  return { ok: true, account: found, role }
}

export function hasAdminMenu(role: AdminRole | undefined, menu: AdminMenuKey): boolean {
  return !!role?.enabled && (role.id === ADMIN_SUPER_ROLE_ID || role.menuPermissions.includes(menu))
}

export function hasAdminPermission(role: AdminRole | undefined, permission: AdminPermissionCode): boolean {
  return !!role?.enabled && (role.id === ADMIN_SUPER_ROLE_ID || role.actionPermissions.includes(permission))
}

export interface PlatformAuditLogEntry {
  id: string
  module: string
  action: string
  actorId: string
  actorName?: string
  actorRole?: string
  targetType?: string
  targetId?: string
  result: 'success' | 'failure'
  reason?: string
  operationId?: string
  metadata?: unknown
  createdAt: string
}

export function readPlatformAuditLogs(): PlatformAuditLogEntry[] {
  const saved = readPlatformJson<PlatformAuditLogEntry[]>(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  return Array.isArray(saved) ? cloneSeed(saved).map((entry) => ({ ...entry, module: entry.module || entry.action.split('.')[0] || 'system', result: entry.result || 'success' })) : []
}

export function createPlatformAuditLogEntry(input: Omit<PlatformAuditLogEntry, 'id' | 'createdAt'>): PlatformAuditLogEntry | null {
  if (!input?.action?.trim() || !input.actorId?.trim()) return null
  const maskPhone = (value: unknown): unknown => typeof value === 'string' && /^1\d{10}$/.test(value.trim())
    ? `${value.trim().slice(0, 3)}****${value.trim().slice(-4)}`
    : value
  const sanitizeText = (value: string): string => value
    .replace(/(^|\D)(\d{17}[\dXx])(?=\D|$)/g, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(/(^|\D)(1\d{10})(?=\D|$)/g, (_match, prefix: string, phone: string) => `${prefix}${phone.slice(0, 3)}****${phone.slice(-4)}`)
  const sanitize = (value: unknown, key = ''): unknown => {
    if (/password|credential|token|secret|phone|mobile|idcard|identitynumber|certificatenumber|licensenumber|permitnumber/i.test(key)) return '[REDACTED]'
    if (/account|actorid|actorname|targetid/i.test(key)) {
      const masked = maskPhone(value)
      return typeof masked === 'string' ? sanitizeText(masked) : masked
    }
    if (Array.isArray(value)) return value.map((item) => sanitize(item))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [nestedKey, sanitize(nestedValue, nestedKey)]))
    return typeof value === 'string' ? sanitizeText(value) : value
  }
  const entry: PlatformAuditLogEntry = {
    ...input,
    actorId: sanitize(input.actorId, 'actorId') as string,
    actorName: sanitize(input.actorName, 'actorName') as string | undefined,
    targetId: sanitize(input.targetId, 'targetId') as string | undefined,
    reason: sanitize(input.reason, 'reason') as string | undefined,
    metadata: sanitize(input.metadata),
    id: createId('AUDIT'),
    createdAt: new Date().toISOString()
  }
  return entry
}

export function appendPlatformAuditLog(input: Omit<PlatformAuditLogEntry, 'id' | 'createdAt'>): boolean {
  const entry = createPlatformAuditLogEntry(input)
  return !!entry && writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, [entry, ...readPlatformAuditLogs()].slice(0, 1000))
}

export function readPlatformJournal(): Record<string, PlatformJournalEntry> {
  const saved = readPlatformJson<Record<string, PlatformJournalEntry>>(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
  return cloneSeed(saved)
}

export function readPendingPlatformJournals(): PlatformJournalEntry[] {
  return Object.values(readPlatformJournal()).filter((entry) => entry.status === 'prepared' || entry.status === 'recovery-pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function preparePlatformJournal(input: { operationId: string; collections: string[]; original: unknown; target: unknown; recoveryHandlerKey?: StoredPlatformRecoveryHandlerKey; recoverySchema?: string }): boolean {
  if (!input?.operationId?.trim() || !Array.isArray(input.collections) || !input.collections.length) return false
  const recoveryHandlerKey = input.recoveryHandlerKey?.trim() || undefined
  const recoverySchema = input.recoverySchema?.trim() || undefined
  const journals = readPlatformJournal()
  const existing = journals[input.operationId]
  if (existing) {
    const matches = JSON.stringify(existing.original) === JSON.stringify(input.original) && JSON.stringify(existing.target) === JSON.stringify(input.target) && JSON.stringify(existing.collections) === JSON.stringify(input.collections) && existing.recoveryHandlerKey === recoveryHandlerKey && existing.recoverySchema === recoverySchema
    if (!matches) return false
    if (existing.status !== 'aborted') return true
    existing.status = 'prepared'
    existing.completedSteps = []
    existing.updatedAt = new Date().toISOString()
    return writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, journals)
  }
  const now = new Date().toISOString()
  journals[input.operationId] = { operationId: input.operationId, collections: [...new Set(input.collections.filter(Boolean))], original: cloneSeed(input.original), target: cloneSeed(input.target), recoveryHandlerKey, recoverySchema, completedSteps: [], status: 'prepared', createdAt: now, updatedAt: now }
  return writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, journals)
}

export function markPlatformJournalStep(operationId: string, step: string): boolean {
  if (!operationId?.trim() || !step?.trim()) return false
  const journals = readPlatformJournal()
  const entry = journals[operationId]
  if (!entry || entry.status !== 'prepared') return false
  if (!entry.completedSteps.includes(step)) entry.completedSteps.push(step)
  entry.updatedAt = new Date().toISOString()
  return writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, journals)
}

export function resolvePlatformJournal(operationId: string, status: PlatformJournalStatus): boolean {
  const journals = readPlatformJournal()
  const entry = journals[operationId]
  const canResolveRecovery = entry?.status === 'recovery-pending' && (status === 'aborted' || status === 'committed')
  if (!entry || (entry.status !== 'prepared' && entry.status !== status && !canResolveRecovery && !(status === 'recovery-pending' && (entry.status === 'committed' || entry.status === 'aborted')))) return false
  entry.status = status
  entry.updatedAt = new Date().toISOString()
  return writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, journals)
}

export function enqueuePlatformRecovery(input: { operationId: string; failedStep: string; reason: string; handlerKey?: string }): boolean {
  if (!input?.operationId?.trim() || !input.failedStep?.trim() || !input.reason?.trim()) return false
  const existing = readPlatformJson<PlatformRecoveryTask[]>(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  const queue = Array.isArray(existing) ? existing : []
  const duplicate = queue.find((task) => task.operationId === input.operationId && task.failedStep === input.failedStep && task.status === 'pending')
  if (duplicate) {
    if (input.handlerKey?.trim() && !duplicate.handlerKey) {
      duplicate.handlerKey = input.handlerKey.trim()
      return writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, queue)
    }
    return true
  }
  const task: PlatformRecoveryTask = { id: createId('REC'), operationId: input.operationId, failedStep: input.failedStep, reason: input.reason.trim(), handlerKey: input.handlerKey?.trim() || undefined, retryCount: 0, createdAt: new Date().toISOString(), status: 'pending' }
  return writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, [...queue, task])
}

export function readPlatformRecoveryQueue(): PlatformRecoveryTask[] {
  const saved = readPlatformJson<PlatformRecoveryTask[]>(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  return Array.isArray(saved) ? cloneSeed(saved).map((task) => ({ ...task, retryCount: Number.isInteger(task.retryCount) && task.retryCount >= 0 ? task.retryCount : 0 })) : []
}

export interface PlatformRecoveryReconciliationOptions {
  handlerKey?: PlatformRecoveryHandlerKey
  /** Explicit migration guard for legacy journals that do not declare an owner. */
  matches?: (journal: PlatformJournalEntry) => boolean
}

/** Ensures owned journals have recovery tasks without assigning an owner to unrelated legacy journals. */
export function reconcilePendingPlatformTransactions(input?: PlatformRecoveryHandlerKey | PlatformRecoveryReconciliationOptions): WriteResult<number> {
  const options: PlatformRecoveryReconciliationOptions = typeof input === 'string' ? { handlerKey: input } : input || {}
  const pendingOperationIds = new Set(readPlatformRecoveryQueue().filter((task) => task.status === 'pending').map((task) => task.operationId))
  let created = 0
  for (const journal of readPendingPlatformJournals()) {
    if (pendingOperationIds.has(journal.operationId)) continue
    const handlerKey = journal.recoveryHandlerKey || (options.handlerKey && options.matches?.(journal) ? options.handlerKey : undefined)
    if (!handlerKey) continue
    if (!enqueuePlatformRecovery({ operationId: journal.operationId, failedStep: 'reconciliation', reason: 'pending transaction requires recovery reconciliation', handlerKey })) {
      return { ok: false, code: 'recovery-queue-write-failed', message: '恢复任务无法保存' }
    }
    pendingOperationIds.add(journal.operationId)
    created += 1
  }
  return { ok: true, value: created }
}

export * from './providers'

export const CHANNEL_TAG_STORE = '门店商品'
export const CHANNEL_TAG_LIVE = '用户端商品'
export const EXPRESS_DELIVERY_TAG = '快递直发'

export function resolveProductChannels(input: { channels?: { store?: boolean; live?: boolean }; source?: ProductSource }): { store: boolean; live: boolean } {
  const declared = input.channels
  if (declared && (declared.store || declared.live)) return { store: !!declared.store, live: !!declared.live }
  if ('source' in input && input.source !== undefined) return { store: true, live: false }
  return { store: false, live: true }
}

export function productChannelTags(input: { channels?: { store?: boolean; live?: boolean }; source?: ProductSource }): string[] {
  const { store, live } = resolveProductChannels(input)
  const tags: string[] = []
  if (store) tags.push(CHANNEL_TAG_STORE)
  if (live) tags.push(CHANNEL_TAG_LIVE)
  return tags
}

export function isExpressDeliverable(input: { expressDelivery?: boolean; productType?: ProductType }): boolean {
  return !!input.expressDelivery && (input.productType ?? 'goods') === 'goods'
}

export function displayProductTags(
  input: { channels?: { store?: boolean; live?: boolean }; source?: ProductSource; expressDelivery?: boolean; productType?: ProductType; tags?: string[] },
  channel?: ProductChannel
): string[] {
  const tags = [...productChannelTags(input), ...(Array.isArray(input.tags) ? input.tags : [])]
  if (isExpressDeliverable(input)) tags.push(EXPRESS_DELIVERY_TAG)
  if (channel === 'store') return tags.filter((tag) => tag !== CHANNEL_TAG_LIVE)
  if (channel === 'live') return tags.filter((tag) => tag !== CHANNEL_TAG_STORE)
  return tags
}

export function storeCommissionAmount(retail: number, rate = 0): number {
  const validRate = Number.isFinite(Number(rate)) ? Number(rate) : 0
  return round2(Math.max(0, Number(retail) || 0) * validRate / 100)
}

export function storeGrossMargin(retail: number, cost: number): number {
  return round2((Number(retail) || 0) - (Number(cost) || 0))
}

export interface SupplierQualificationAttachment {
  typeCode: string
  number?: string
  image?: BusinessMediaValue
  validUntil?: string
  reviewNote?: string
}

export interface SupplierQualification {
  businessLicense: BusinessMediaValue
  permit: BusinessMediaValue
  validUntil: string
  reviewNote: string
  attachments?: SupplierQualificationAttachment[]
}

export interface SupplierWarehouse {
  address: string
  /** 仓点联系人（清单「仓点设置」：供应商仓点 / 联系人维护） */
  contactName?: string
  contactPhone?: string
  longitude?: number
  latitude?: number
  coordinateSystem: 'GCJ-02'
}

export interface Supplier {
  id: string
  name: string
  region: string
  category: string
  certified: boolean
  status: 'pending' | 'cooperating' | 'paused'
  productCount: number
  coop?: boolean
  emoji?: string
  contactPhone?: string
  /** 可供商品品牌（清单「供应品类管理」：配置供应商可供品牌） */
  brands?: string[]
  /** 服务区域（清单「供应品类管理」：配置供应商服务区域） */
  serviceRegions?: string[]
  warehouse?: SupplierWarehouse
  qualification: SupplierQualification
  cooperationPauseReason?: string
  cooperationPausedAt?: string
  cooperationPausedBy?: string
}

export interface Category {
  id: string
  name: string
  type: 'product' | 'supplier' | 'general'
}

export type DictType = string

export interface DictGroup {
  id: string
  type: DictType
  name: string
  scope?: 'business' | 'system'
  locked?: boolean
  enabled?: boolean
}

export interface DictItem {
  id: string
  type: DictType
  code: string
  label: string
  enabled: boolean
  sort: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
  image?: MediaReference
}

export type StoreRole = 'owner' | 'staff'

/**
 * 业务员分销价档位：门店端支持门店 / 业务员两类角色登录，
 * 业务员按所属档位展示差异化分销价（A 档 95 折、B 档 97 折、C 档为基准分销价）。
 */
export type StorePriceLevel = 'A' | 'B' | 'C'

export const STORE_PRICE_LEVELS: readonly StorePriceLevel[] = ['A', 'B', 'C']

export interface StoreAccount {
  id: string
  farmId: string
  name: string
  account: string
  password: string
  role: StoreRole
  enabled: boolean
  promoEnabled?: boolean
  priceLevel?: StorePriceLevel
  createdAt?: string
}

export type BusinessMediaValue = MediaReference | string

export function mediaValueToImage(value: BusinessMediaValue): string {
  if (typeof value === 'string') return value
  if (value.source === 'legacy') return value.url
  if (value.source === 'builtin') return value.path
  return ''
}

export interface FarmAdministrativeAddress {
  provinceCode?: string
  province: string
  cityCode?: string
  city: string
  districtCode?: string
  district: string
  detail: string
}

export interface FarmStore {
  id: string
  name: string
  /** 门店联系人（清单「门店信息」：门店名称、地区、地址、联系人…） */
  contact?: string
  contactPhone?: string
  region: string
  distance: number
  rating: number
  monthlySales: number
  averageSpend: number
  status: 'active' | 'pending' | 'paused'
  selectedCount: number
  gmv: number
  image: BusinessMediaValue
  tags: string[]
  storeTags?: string[]
  emoji?: string
  adminDesc?: string
  core?: boolean
  city: string
  availability: FarmAvailability
  /** 门店人气值（历史叫"直播人气"，产地直播移除后作为门店人气指标保留）。 */
  address: string
  regionCode?: string
  structuredAddress?: FarmAdministrativeAddress
  location?: FarmLocation
  locationStatus?: 'resolved' | 'pending' | 'failed'
  locationError?: string
}

export interface OrderFlowEvent {
  time: string
  action: string
  operator: string
  note?: string
}

export interface FulfillmentEvent {
  id: string
  orderId: string
  subOrderId?: string
  from: string
  to: string
  operatorId: string
  operatorRole: string
  createdAt: string
}

export interface ShortageItem {
  skuId: string
  name: string
  ordered: number
  actual: number
  shortage: number
  handled?: boolean
  handledAt?: string
}

export interface HandoverLog {
  id: string
  type: 'out' | 'in'
  orderId: string
  time: string
  operatorId: string
  operatorName: string
  operatorRole: 'supplier' | 'driver'
  note?: string
  shortageCount?: number
}

export interface DriverAccount {
  id: string
  supplierId: string
  name: string
  account: string
  password: string
  phone?: string
  status: 'active' | 'disabled'
  createdAt: string
}

export interface SupplierFulfillment {
  status: PurchaseStatus
  shipType?: 'driver' | 'courier'
  driverId?: string
  driverName?: string
  trackingNo?: string
  shortages: ShortageItem[]
  handovers: HandoverLog[]
  deliverDate?: string
  updatedAt: string
}

export type OrderSource = 'store' | 'farmhouse' | 'c-mall' | 'farmhouse-courier'

export interface SupplierOrderLink {
  source: OrderSource
  sourceOrderId?: string
  sourceSubOrderId?: string
  customerUserId?: string
  deliveryAddress?: CAddress
}

export interface Order {
  id: string
  productName: string
  quantity: number
  amount: number
  customer: string
  storeId?: string
  storeName?: string
  channel: 'shop' | 'live' | 'purchase'
  status: OrderStatus
  createdAt: string
  trackingNo?: string
  logistics?: LogisticsEvent[]
  flow?: OrderFlowEvent[]
  supplierId?: string
  settlementId?: string
  items?: OrderItem[]
  supplierFulfillment?: SupplierFulfillment
  supplierOrderLink?: SupplierOrderLink
  fulfillmentEvents?: FulfillmentEvent[]
}


export interface PricePolicy {
  id: string
  name: string
  type: 'group' | 'ladder'
  scope: string
  discount: number
  enabled: boolean
  tiers?: PriceTier[]
}

export interface PriceTier {
  minQty: number
  maxQty: number | null
  price: number
  discountOff: number
}

export interface AfterSale {
  id: string
  orderId: string
  productName: string
  applicant: string
  type: 'reship' | 'refund' | 'return' | 'claim'
  amount: number
  status: AfterSaleStatus
  issue?: string
  quantity?: number
  image?: string
  evidenceImages?: BusinessMediaValue[]
  refundAmount?: number
  refundMethod?: 'return' | 'only'
  refundMode?: 'full' | 'ratio' | 'custom'
  returnTrackingNo?: string
  history?: Array<{ time: string; action: string; operator: string }>
  sourcePortal?: string
  masterOrderId?: string
  subOrderId?: string
  supplierOrderId?: string
  operationId?: string
  providerRefundId?: string
  failureReason?: string
  /** 售后责任供应商；缺省时按订单所属供应商推导（清单「售后统计」：供应商责任） */
  responsibleSupplierId?: string
}

export interface Promoter {
  id: string
  name: string
  level: string
  type?: string
  /** 负责区域（清单「业务员资源管理」：业务员资料、等级、类型、负责区域、合作状态） */
  region?: string
  fans: number
  orders: number
  gmv: number
  commission: number
  cumulativeCommission?: number
  settled?: boolean
  status: 'active' | 'paused'
}


export interface OrderItem {
  productId: string
  skuId: string
  name: string
  skuName: string
  image: string
  quantity: number
  price: number
  minimumOrderQuantity?: number
  deliveryMode?: 'pickup' | 'courier'
}

export type OperationalReportDimension = 'day' | 'store' | 'supplier' | 'category'
export interface OperationalReportFilter {
  from: string
  to: string
  store?: string
  supplierId?: string
  category?: string
}
export interface OperationalReportRow {
  key: string
  label: string
  orderCount: number
  itemCount: number
  gmv: number
}

function reportLocalDate(value: string): string {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface OperationalReportSummary {
  orderCount: number
  itemCount: number
  gmv: number
}

function validReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value
}

function reportStoreName(order: Order): string {
  return order.storeName?.trim() || order.customer || '未知门店'
}

function reportStoreMatch(value: string): string {
  return String(value || '').trim().replace(/\s*[·•-]?\s*门店\s*$/, '').trim()
}

interface AllocatedOrderLine {
  item: OrderItem
  product?: Product
  supplierId?: string
  supplierLabel: string
  category: string
  quantity: number
  amount: number
}

function allocateOrderLines(order: Order, productMap: Map<string, Product>): AllocatedOrderLine[] {
  if (!Array.isArray(order.items)) return []
  return order.items.map((item) => {
    const product = productMap.get(item.productId)
    const quantity = Math.max(0, Number(item.quantity) || 0)
    const price = Math.max(0, Number(item.price) || 0)
    const supplierId = product?.supplierId || order.supplierId
    return {
      item,
      product,
      supplierId,
      supplierLabel: product?.supplierName || product?.supplier || '未知供应商',
      category: product?.category || '未分类',
      quantity,
      amount: round2(price * quantity)
    }
  }).filter((line) => line.quantity > 0)
}

export function aggregateOperationalReport(orders: Order[], products: Product[], filter: OperationalReportFilter, dimension: OperationalReportDimension): OperationalReportRow[] {
  if (!validReportDate(filter.from) || !validReportDate(filter.to) || filter.from > filter.to) return []
  const validStatuses = new Set<OrderStatus>(['pending', 'shipping', 'delivered'])
  const productMap = new Map(products.map((product) => [product.id, product]))
  const grouped = new Map<string, { label: string; itemCount: number; gmv: number; orderIds: Set<string> }>()
  const add = (key: string, label: string, order: Order, itemCount: number, gmv: number) => {
    const current = grouped.get(key) || { label, itemCount: 0, gmv: 0, orderIds: new Set<string>() }
    current.itemCount += Math.max(0, Number(itemCount) || 0)
    current.gmv += Number(gmv) || 0
    current.orderIds.add(order.id)
    grouped.set(key, current)
  }
  [...new Map(orders.filter((order) => order?.id).map((order) => [order.id, order])).values()].filter((order) => {
    const date = reportLocalDate(order.createdAt)
    if (!order?.id || !validStatuses.has(order.status) || !date || date < filter.from || date > filter.to) return false
    if (filter.store && order.storeId !== filter.store && reportStoreMatch(reportStoreName(order)) !== reportStoreMatch(filter.store)) return false
    if ((filter.supplierId || filter.category) && Array.isArray(order.items) && order.items.length) {
      const matchesLine = order.items.some((item) => {
        const product = productMap.get(item.productId)
        return (!filter.supplierId || (product?.supplierId || order.supplierId) === filter.supplierId) && (!filter.category || (product?.category || '未分类') === filter.category)
      })
      if (!matchesLine) return false
    } else if ((filter.supplierId || filter.category) && !order.items?.length) return false
    return true
  }).forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : []
    if (dimension === 'day' || dimension === 'store') {
      const key = dimension === 'day' ? reportLocalDate(order.createdAt) : (order.storeId || reportStoreName(order))
      const label = dimension === 'day' ? key : reportStoreName(order)
      const selectedItems = items.filter((item) => {
        const product = productMap.get(item.productId)
        return (!filter.supplierId || (product?.supplierId || order.supplierId) === filter.supplierId) && (!filter.category || (product?.category || '未分类') === filter.category)
      })
      const hasLineFilters = !!filter.supplierId || !!filter.category
      const itemCount = selectedItems.length ? selectedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : (!items.length && !hasLineFilters ? order.quantity : 0)
      const gmv = !hasLineFilters ? order.amount : (selectedItems.length ? selectedItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0) : 0)
      if (itemCount > 0 || gmv > 0) add(key, label, order, itemCount, gmv)
      return
    }
    const lines = allocateOrderLines(order, productMap)
    const selectedLines = lines.length ? lines.filter((line) => {
      if (filter.supplierId && line.supplierId !== filter.supplierId) return false
      if (filter.category && line.category !== filter.category) return false
      return true
    }) : (!filter.supplierId && !filter.category ? [{ item: null, supplierId: undefined, supplierLabel: '未知供应商', category: '未分类', quantity: Number(order.quantity), amount: Number(order.amount) }] : [])
    selectedLines.forEach((line) => {
      const isSupplier = dimension === 'supplier'
      const key = isSupplier ? (line.supplierId || 'unknown-supplier') : (line.category === '未分类' ? 'uncategorized' : line.category)
      const label = isSupplier ? line.supplierLabel : line.category
      const quantity = line.item ? line.quantity : Number(order.quantity)
      const amount = line.item && Number.isFinite(line.amount) ? line.amount : Number(order.amount)
      add(key, label, order, quantity, amount)
    })
  })
  return [...grouped.entries()].map(([key, value]) => ({ key, label: value.label, orderCount: value.orderIds.size, itemCount: value.itemCount, gmv: round2(value.gmv) })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}

export function summarizeOperationalReport(orders: Order[], products: Product[], filter: OperationalReportFilter): OperationalReportSummary {
  const rows = aggregateOperationalReport(orders, products, filter, 'day')
  return {
    orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
    itemCount: rows.reduce((sum, row) => sum + row.itemCount, 0),
    gmv: round2(rows.reduce((sum, row) => sum + row.gmv, 0))
  }
}

export interface StorefrontOrder {
  id: string
  customerUserId?: string
  amount: number
  itemCount: number
  items: OrderItem[]
  status: '待发货' | '待收货' | '已发货' | '已完成' | '已取消' | '退款中' | '已退款' | '退货中' | '已退货'
  createdAt: string
  delivery?: { mode: 'pickup' | 'courier'; address?: string }
  platformOrderId?: string
  platformOrderIds?: string[]
  trackingNo?: string
  courier?: string
  logistics?: LogisticsEvent[]
  inventoryReleased?: boolean
  balanceRefunded?: boolean
  pointsAwarded?: number
  afterSaleType?: 'refund' | 'return'
  payMethod?: 'balance' | 'wechat'
  remark?: string
}

export interface SupplierSettlementRecord {
  id: string
  period: string
  supplierIds: string[]
  orderIds: string[]
  amount: number
  status?: string
  createdAt: string
  items: Array<{ supplierId: string; supplierName: string; orderIds: string[]; amount: number }>
}

export interface CommissionSettlementRecord {
  id: string
  promoterIds: string[]
  amount: number
  status?: string
  createdAt: string
  items: Array<{ promoterId: string; promoterName: string; amount: number }>
}

export interface PurchaseOrder {
  id: string
  amount: number
  items: OrderItem[]
  status: PurchaseStatus
  createdAt: string
}

export const tenant: TenantConfig = {
  code: 'shibanxi',
  farmId: 'F001',
  buildTarget: 'farmhouse-shibanxi',
  name: '石板溪农家乐',
  shortName: '石板溪',
  slogan: '山景土菜 · 包厢预订',
  theme: '#17633f',
  phone: '0743-888-xxxx',
  address: '湖南省湘西州永顺县石板溪村',
  hours: '09:00–21:30',
  distanceKm: 8.6
}

export const products: Product[] = [
  { id: 'P001', emoji: '🥓', name: '湘西烟熏柴火腊肉 500g', category: '土特产', spec: '500g/袋', price: 59.9, cost: 38, stock: 2400, sales: 2860, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '柴火慢熏'], channels: { store: true }, expressDelivery: true, productType: 'goods', farmIds: ['F001', 'F002'], promoName: '湘西烟熏柴火腊肉 500g', commissionRate: 18, commissionSold: 158, commissionEarn: 10.8, images: ['/static/images/bacon.webp', '/static/images/chili.webp'], skus: [{ id: 'P001-500', name: '500g', price: 59.9, cost: 38, stock: 2000 }, { id: 'P001-1000', name: '1kg家庭装', price: 109, cost: 78, stock: 400 }] },
  { id: 'P002', emoji: '🍑', name: '炎陵黄桃 5斤礼盒', category: '生鲜农产', spec: '5斤/盒', price: 68, cost: 42, stock: 1860, sales: 2090, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '炎陵果业有限公司', tags: ['产地直发', '当季鲜果'], farmIds: ['F001', 'F002', 'F003'], promoName: '炎陵黄桃 5斤礼盒', commissionRate: 15, commissionSold: 230, commissionEarn: 10.2, images: ['/static/images/peach.webp', '/static/images/farmhouse.webp'], skus: [{ id: 'P002-5J', name: '5斤礼盒', price: 68, cost: 42, stock: 1500 }, { id: 'P002-10J', name: '10斤家庭装', price: 128, cost: 92, stock: 360 }] },
  { id: 'P003', emoji: '🍵', name: '安化黑茶礼盒装', category: '伴手礼', spec: '礼盒装', price: 128, cost: 86, stock: 640, sales: 770, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['中台甄选', '礼盒装'], farmIds: ['F002', 'F005'], images: ['/static/images/tea.webp', '/static/images/mountain.webp'], skus: [{ id: 'P003-GIFT', name: '雅藏礼盒', price: 128, cost: 86, stock: 640 }] },
  { id: 'P004', emoji: '🫙', name: '农家自制剁辣椒 2瓶', category: '食材调料', spec: '2瓶/组', price: 39.9, cost: 20, stock: 120, sales: 386, source: 'farmhouse', status: 'pending', image: '/static/images/chili.webp', supplier: '石板溪农家乐', tags: ['农家手作', '下饭'], farmIds: ['F001'], skus: [{ id: 'P004-2', name: '2瓶装', price: 39.9, cost: 20, stock: 120 }] },
  { id: 'P005', emoji: '🍯', name: '武陵山野生土蜂蜜 500g', category: '生鲜农产', spec: '500g/瓶', price: 88, cost: 56, stock: 980, sales: 868, source: 'platform', status: 'active', image: '/static/images/honey.webp', supplier: '武陵蜂业合作社', tags: ['自然成熟', '产地直发'], farmIds: ['F002', 'F004'], images: ['/static/images/honey.webp', '/static/images/field.webp'], skus: [{ id: 'P005-500', name: '500g', price: 88, cost: 56, stock: 980 }] },
  { id: 'P006', emoji: '🌾', name: '石板溪生态富硒米 5kg', category: '农产品', spec: '5kg/袋', price: 49.9, cost: 32, stock: 300, sales: 672, source: 'farmhouse', status: 'pending', image: '/static/images/rice.webp', supplier: '石板溪农家乐', tags: ['生态种植', '本店自有'], farmIds: ['F001', 'F003'], skus: [{ id: 'P006-5K', name: '5kg', price: 49.9, cost: 32, stock: 300 }] },
  { id: 'P007', emoji: '🎟', name: '农家四人欢聚套餐券', category: '套餐券', spec: '4人/份', price: 288, cost: 120, stock: 500, sales: 86, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '石板溪农家乐', tags: ['到店核销', '含锁定食材'], channels: { store: true }, productType: 'package', farmIds: ['F001'], promoName: '石板溪农家乐 · 四人套餐券', commissionRate: 12, commissionSold: 86, commissionEarn: 34.5, skus: [{ id: 'P007-4P', name: '四人套餐券', price: 288, cost: 120, stock: 500 }] },
  { id: 'P008', emoji: '🐟', name: '东江鱼仔香辣味 200g', category: '土特产', spec: '200g/袋', price: 32.8, cost: 21, stock: 1652, sales: 1652, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '东江湖食品', tags: ['中台甄选', '香辣下饭'], farmIds: ['F001', 'F003'], images: ['/static/images/field.webp', '/static/images/rice.webp'], skus: [{ id: 'P008-200', name: '200g', price: 32.8, cost: 21, stock: 1652 }] },
  { id: 'P009', emoji: '🦆', name: '招牌酱板鸭 整只装', category: '土特产', spec: '整只装', price: 49, cost: 30, stock: 800, sales: 320, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '酱香'], farmIds: ['F002', 'F005'], skus: [{ id: 'P009-1', name: '整只装', price: 49, cost: 30, stock: 800 }] },
  { id: 'P010', emoji: '🍵', name: '安化黑茶 · 农家自藏', category: '伴手礼', spec: '礼盒装', price: 128, cost: 60, stock: 80, sales: 260, source: 'farmhouse', status: 'active', image: '/static/images/tea.webp', supplier: '石板溪农家乐', tags: ['自有商品', '农家自藏'], farmIds: ['F001'], promoName: '安化黑茶 · 礼盒装', commissionRate: 20, commissionSold: 64, commissionEarn: 25.6, skus: [{ id: 'P010-1', name: '礼盒装', price: 128, cost: 60, stock: 80 }] },
  { id: 'P011', emoji: '🐔', name: '山泉土鸡汤礼盒', category: '农产品', spec: '2只/盒', price: 108, cost: 55, stock: 60, sales: 40, source: 'farmhouse', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['门店自有', '滋补'], farmIds: ['F002'], skus: [{ id: 'P011-1', name: '2只装', price: 108, cost: 55, stock: 60 }] },
  { id: 'P012', emoji: '🥓', name: '湘西柴火腊肉真空装', category: '预制菜', spec: '500g/袋', price: 68, cost: 35, stock: 200, sales: 90, source: 'farmhouse', status: 'pending', image: '/static/images/bacon.webp', supplier: '稻香村生态农庄', tags: ['门店自有', '真空锁鲜'], farmIds: ['F003'], skus: [{ id: 'P012-1', name: '500g', price: 68, cost: 35, stock: 200 }] },
  { id: 'P013', emoji: '🍶', name: '农家米酒 5斤装', category: '酒水饮料', spec: '5斤/坛', price: 56, cost: 24, stock: 150, sales: 60, source: 'farmhouse', status: 'pending', image: '/static/images/field.webp', supplier: '橘子洲畔农家院', tags: ['门店自有', '土法酿造'], farmIds: ['F004'], skus: [{ id: 'P013-1', name: '5斤装', price: 56, cost: 24, stock: 150 }] },
  { id: 'P014', emoji: '🛏', name: '民宿一次性洗漱套装', category: '民宿用品', spec: '100套/箱', price: 3.5, cost: 1.8, stock: 12000, sales: 600, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '易耗品'], farmIds: ['F002', 'F003'], skus: [{ id: 'P014-100', name: '100套/箱', price: 3.5, cost: 1.8, stock: 12000 }] },
  { id: 'P015', emoji: '🍄', name: '瑶山鲜菌菇礼盒 1kg', category: '土特产', spec: '1kg/盒', price: 45.8, cost: 28, stock: 560, sales: 148, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '道县瑶山菌业合作社', tags: ['产地直发', '山珍'], farmIds: ['F002', 'F007'], promoName: '瑶山鲜菌菇礼盒 1kg', commissionRate: 15, commissionSold: 22, commissionEarn: 6.9, images: ['/static/images/field.webp', '/static/images/mountain.webp'], skus: [{ id: 'P015-1K', name: '1kg礼盒', price: 45.8, cost: 28, stock: 420 }, { id: 'P015-2K', name: '2kg家庭装', price: 86, cost: 52, stock: 140 }] },
  { id: 'P016', emoji: '🐟', name: '洞庭湖风干刁子鱼 400g', category: '土特产', spec: '400g/袋', price: 42.8, cost: 26, stock: 1240, sales: 532, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '洞庭湖水产品合作社', tags: ['中台甄选', '湖鲜'], farmIds: ['F008', 'F009'], promoName: '洞庭湖风干刁子鱼 400g', commissionRate: 16, commissionSold: 86, commissionEarn: 6.8, skus: [{ id: 'P016-400', name: '400g', price: 42.8, cost: 26, stock: 1240 }] },
  { id: 'P017', emoji: '🥩', name: '宁乡花猪腊肠 400g', category: '预制菜', spec: '400g/袋', price: 38.8, cost: 24, stock: 860, sales: 268, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '宁乡花猪生态养殖场', tags: ['中台甄选', '农家土法'], farmIds: ['F003', 'F004'], promoName: '宁乡花猪腊肠 400g', commissionRate: 14, commissionSold: 35, commissionEarn: 5.4, skus: [{ id: 'P017-400', name: '400g', price: 38.8, cost: 24, stock: 860 }] },
  { id: 'P018', emoji: '🌶', name: '湘西剁椒鱼头酱 500g', category: '食材调料', spec: '500g/罐', price: 29.9, cost: 15, stock: 720, sales: 420, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '湘西腊味合作社', tags: ['农家手作', '下饭神器'], farmIds: ['F001', 'F006'], skus: [{ id: 'P018-500', name: '500g', price: 29.9, cost: 15, stock: 720 }] },
  { id: 'P019', emoji: '🍒', name: '靖州杨梅干 250g', category: '土特产', spec: '250g/袋', price: 26.8, cost: 14, stock: 480, sales: 96, source: 'platform', status: 'pending', image: '/static/images/peach.webp', supplier: '靖州杨梅专业合作社', tags: ['当季限定', '果干'], farmIds: ['F001'], skus: [{ id: 'P019-250', name: '250g', price: 26.8, cost: 14, stock: 480 }] },
  { id: 'P020', emoji: '🥚', name: '武陵山土鸡蛋 30枚', category: '农产品', spec: '30枚/盒', price: 39.9, cost: 24, stock: 320, sales: 184, source: 'farmhouse', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['门店自有', '散养'], farmIds: ['F002'], skus: [{ id: 'P020-30', name: '30枚', price: 39.9, cost: 24, stock: 320 }] },
  { id: 'P021', emoji: '🍶', name: '宝庆糯米甜酒 2L坛装', category: '酒水饮料', spec: '2L/坛', price: 46, cost: 22, stock: 260, sales: 58, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '邵阳宝庆预制菜食品厂', tags: ['土法酿造', '甜香'], farmIds: ['F009'], skus: [{ id: 'P021-2L', name: '2L坛装', price: 46, cost: 22, stock: 260 }] },
  { id: 'P022', emoji: '🧺', name: '湘西农家伴手礼大礼包', category: '文旅伴手礼', spec: '8件/箱', price: 158, cost: 92, stock: 200, sales: 132, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '县供销社惠农服务中心', tags: ['中台甄选', '走亲访友'], farmIds: ['F001', 'F002', 'F005'], promoName: '湘西农家伴手礼大礼包', commissionRate: 12, commissionSold: 28, commissionEarn: 19, skus: [{ id: 'P022-8', name: '8件装', price: 158, cost: 92, stock: 200 }] },
  { id: 'P023', emoji: '🫙', name: '安化擂茶粉 500g', category: '食材调料', spec: '500g/罐', price: 39.9, cost: 22, stock: 380, sales: 92, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['非遗技艺', '冲饮'], farmIds: ['F010', 'F007'], skus: [{ id: 'P023-500', name: '500g', price: 39.9, cost: 22, stock: 380 }] },
  { id: 'P024', emoji: '🛏', name: '民宿四件套床上用品', category: '民宿用品', spec: '1套/袋', price: 89, cost: 52, stock: 420, sales: 76, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['中台甄选', '亲肤纯棉'], farmIds: ['F002', 'F004'], skus: [{ id: 'P024-1', name: '四件套', price: 89, cost: 52, stock: 420 }] },
  { id: 'P025', emoji: '🍊', name: '麻阳冰糖橙 5kg礼盒', category: '时令水果', spec: '5kg/盒', price: 59.9, cost: 38, stock: 1520, sales: 640, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '麻阳冰糖橙合作社', tags: ['产地直发', '爆汁甜橙'], farmIds: ['F024', 'F025'], promoName: '麻阳冰糖橙 5kg礼盒', commissionRate: 15, commissionSold: 96, commissionEarn: 9, skus: [{ id: 'P025-5K', name: '5kg礼盒', price: 59.9, cost: 38, stock: 1520 }] },
  { id: 'P026', emoji: '🥒', name: '白关丝瓜 3斤装', category: '有机蔬菜', spec: '3斤/袋', price: 19.9, cost: 10, stock: 680, sales: 128, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '白关丝瓜种植合作社', tags: ['地理标志', '当日现摘'], farmIds: ['F017'], skus: [{ id: 'P026-3J', name: '3斤装', price: 19.9, cost: 10, stock: 680 }] },
  { id: 'P027', emoji: '🍠', name: '江永香芋 5斤装', category: '农产品', spec: '5斤/袋', price: 32.8, cost: 18, stock: 920, sales: 286, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '江永香芋种植基地', tags: ['粉糯香甜', '产地直发'], farmIds: ['F021'], skus: [{ id: 'P027-5J', name: '5斤装', price: 32.8, cost: 18, stock: 920 }] },
  { id: 'P028', emoji: '🍊', name: '石门柑橘 5kg', category: '时令水果', spec: '5kg/箱', price: 45.8, cost: 28, stock: 1860, sales: 520, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '石门柑橘专业合作社', tags: ['高山蜜橘', '甜酸适口'], farmIds: ['F013', 'F025'], promoName: '石门柑橘 5kg', commissionRate: 13, commissionSold: 62, commissionEarn: 6, skus: [{ id: 'P028-5K', name: '5kg', price: 45.8, cost: 28, stock: 1860 }] },
  { id: 'P029', emoji: '🌼', name: '祁东黄花菜 500g', category: '土特产', spec: '500g/袋', price: 28.8, cost: 16, stock: 760, sales: 238, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '祁东黄花菜产业园', tags: ['三蒸三晒', '煲汤必备'], farmIds: ['F019'], skus: [{ id: 'P029-500', name: '500g', price: 28.8, cost: 16, stock: 760 }] },
  { id: 'P030', emoji: '🦐', name: '南县稻虾米 5kg', category: '农产品', spec: '5kg/袋', price: 59.9, cost: 36, stock: 1100, sales: 342, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '南县稻虾合作社', tags: ['稻虾共生', '米香浓郁'], farmIds: ['F027'], skus: [{ id: 'P030-5K', name: '5kg', price: 59.9, cost: 36, stock: 1100 }] },
  { id: 'P031', emoji: '🐟', name: '浏阳蒸火焙鱼 300g', category: '预制菜', spec: '300g/袋', price: 38.8, cost: 22, stock: 540, sales: 168, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '浏阳蒸菜食品厂', tags: ['蒸菜非遗', '开袋即蒸'], farmIds: ['F016', 'F018'], skus: [{ id: 'P031-300', name: '300g', price: 38.8, cost: 22, stock: 540 }] },
  { id: 'P032', emoji: '🦆', name: '临武酱板鸭 整只装', category: '预制菜', spec: '整只/袋', price: 58, cost: 34, stock: 860, sales: 420, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '临武鸭业股份有限公司', tags: ['武陵风味', '酱香浓郁'], farmIds: ['F020'], promoName: '临武酱板鸭 整只装', commissionRate: 14, commissionSold: 58, commissionEarn: 8.1, skus: [{ id: 'P032-1', name: '整只装', price: 58, cost: 34, stock: 860 }] },
  { id: 'P033', emoji: '🥜', name: '平江香干 300g', category: '预制菜', spec: '300g/袋', price: 15.8, cost: 8, stock: 1480, sales: 720, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '平江豆干食品厂', tags: ['卤香入味', '追剧零食'], farmIds: ['F018', 'F023'], skus: [{ id: 'P033-300', name: '300g', price: 15.8, cost: 8, stock: 1480 }] },
  { id: 'P034', emoji: '🫘', name: '武冈卤香干 400g', category: '预制菜', spec: '400g/袋', price: 22.8, cost: 12, stock: 620, sales: 186, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '武冈卤味食品有限公司', tags: ['武冈卤菜', '百年老卤'], farmIds: ['F023'], skus: [{ id: 'P034-400', name: '400g', price: 22.8, cost: 12, stock: 620 }] },
  { id: 'P035', emoji: '🥘', name: '长沙小炒黄牛肉预制品 500g', category: '预制菜', spec: '500g/袋', price: 46.8, cost: 28, stock: 380, sales: 96, source: 'platform', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '长沙马王堆预制菜工厂', tags: ['湘味经典', '锁鲜装'], farmIds: ['F016', 'F030'], skus: [{ id: 'P035-500', name: '500g', price: 46.8, cost: 28, stock: 380 }] },
  { id: 'P036', emoji: '🌶', name: '双峰辣酱 500g', category: '食材调料', spec: '500g/瓶', price: 29.9, cost: 15, stock: 720, sales: 264, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '双峰辣酱世家', tags: ['非遗辣酱', '拌饭神器'], farmIds: ['F022'], skus: [{ id: 'P036-500', name: '500g', price: 29.9, cost: 15, stock: 720 }] },
  { id: 'P037', emoji: '🍜', name: '耒阳红薯粉 1kg', category: '食材调料', spec: '1kg/袋', price: 19.9, cost: 10, stock: 890, sales: 310, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '耒阳红薯粉加工厂', tags: ['纯手工', '久煮不烂'], farmIds: ['F019'], skus: [{ id: 'P037-1K', name: '1kg', price: 19.9, cost: 10, stock: 890 }] },
  { id: 'P038', emoji: '🍜', name: '永州米粉干 2kg', category: '食材调料', spec: '2kg/袋', price: 26.8, cost: 14, stock: 560, sales: 148, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '祁阳米粉食品厂', tags: ['Q弹爽滑', '早餐首选'], farmIds: ['F021'], skus: [{ id: 'P038-2K', name: '2kg', price: 26.8, cost: 14, stock: 560 }] },
  { id: 'P039', emoji: '🎋', name: '沅江芦笋 500g', category: '农产品', spec: '500g/袋', price: 24.9, cost: 13, stock: 320, sales: 64, source: 'platform', status: 'pending', image: '/static/images/field.webp', supplier: '沅江芦笋合作社', tags: ['洞庭湖鲜', '脆嫩爽口'], farmIds: ['F027'], skus: [{ id: 'P039-500', name: '500g', price: 24.9, cost: 13, stock: 320 }] },
  { id: 'P040', emoji: '🍃', name: '张家界莓茶礼盒', category: '文旅伴手礼', spec: '200g/盒', price: 168, cost: 98, stock: 420, sales: 186, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '张家界莓茶产业合作社', tags: ['土家神茶', '回甘绵长'], farmIds: ['F026'], promoName: '张家界莓茶礼盒', commissionRate: 16, commissionSold: 32, commissionEarn: 26.9, skus: [{ id: 'P040-200', name: '200g礼盒', price: 168, cost: 98, stock: 420 }] },
  { id: 'P041', emoji: '🍵', name: '君山银针礼盒', category: '伴手礼', spec: '250g/盒', price: 198, cost: 120, stock: 260, sales: 128, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '君山银针茶业', tags: ['黄茶之冠', '金镶玉'], farmIds: ['F018', 'F025'], skus: [{ id: 'P041-250', name: '250g礼盒', price: 198, cost: 120, stock: 260 }] },
  { id: 'P042', emoji: '🍵', name: '古丈毛尖礼盒', category: '伴手礼', spec: '250g/盒', price: 138, cost: 82, stock: 380, sales: 176, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '古丈毛尖茶厂', tags: ['高山绿茶', '板栗香'], farmIds: ['F028'], skus: [{ id: 'P042-250', name: '250g礼盒', price: 138, cost: 82, stock: 380 }] },
  { id: 'P043', emoji: '🥿', name: '民宿一次性凉拖 100双', category: '民宿用品', spec: '100双/箱', price: 180, cost: 98, stock: 800, sales: 320, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['加厚防滑', '易耗品'], farmIds: ['F002', 'F016'], skus: [{ id: 'P043-100', name: '100双/箱', price: 180, cost: 98, stock: 800 }] },
  { id: 'P044', emoji: '🧺', name: '竹纤维浴巾 20条', category: '民宿用品', spec: '20条/箱', price: 250, cost: 140, stock: 300, sales: 96, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['亲肤速干', '整箱装'], farmIds: ['F002', 'F026'], skus: [{ id: 'P044-20', name: '20条/箱', price: 250, cost: 140, stock: 300 }] },
  { id: 'P045', emoji: '📦', name: '牛皮纸打包袋 ×500', category: '包装耗材', spec: '500只/箱', price: 175, cost: 92, stock: 1500, sales: 520, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['可降解', '外卖打包'], farmIds: ['F001', 'F003'], skus: [{ id: 'P045-500', name: '500只/箱', price: 175, cost: 92, stock: 1500 }] },
  { id: 'P046', emoji: '🧻', name: '商用保鲜膜 300米', category: '包装耗材', spec: '300米/卷', price: 28, cost: 15, stock: 900, sales: 380, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '县供销社惠农服务中心', tags: ['厨房必备', '加厚款'], farmIds: ['F001', 'F006'], skus: [{ id: 'P046-300', name: '300米/卷', price: 28, cost: 15, stock: 900 }] },
  { id: 'P047', emoji: '🍯', name: '桑植土蜂蜜 1kg', category: '蜂蜜/土特产', spec: '1kg/罐', price: 128, cost: 78, stock: 340, sales: 158, source: 'platform', status: 'active', image: '/static/images/honey.webp', supplier: '桑植蜂蜜养殖合作社', tags: ['自然成熟', '高山百花蜜'], farmIds: ['F026', 'F028'], skus: [{ id: 'P047-1K', name: '1kg', price: 128, cost: 78, stock: 340 }] },
  { id: 'P048', emoji: '🍘', name: '古丈蒿子粑粑 6个装', category: '土特产', spec: '6个/盒', price: 22.8, cost: 12, stock: 460, sales: 138, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '古丈毛尖茶厂', tags: ['清明美食', '香糯可口'], farmIds: ['F028'], skus: [{ id: 'P048-6', name: '6个装', price: 22.8, cost: 12, stock: 460 }] },
  { id: 'P049', emoji: '🍎', name: '望城蔬果脆片 200g', category: '土特产', spec: '200g/袋', price: 19.8, cost: 10, stock: 680, sales: 246, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '望城蔬果种植基地', tags: ['低温脱水', '果蔬脆'], farmIds: ['F016'], skus: [{ id: 'P049-200', name: '200g', price: 19.8, cost: 10, stock: 680 }] },
  { id: 'P050', emoji: '🪷', name: '湘莲莲子羹 400g', category: '伴手礼', spec: '400g/罐', price: 46, cost: 26, stock: 420, sales: 118, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘潭湘莲食品有限公司', tags: ['贡品湘莲', '即食冲饮'], farmIds: ['F029'], skus: [{ id: 'P050-400', name: '400g', price: 46, cost: 26, stock: 420 }] },
  { id: 'P051', emoji: '🎁', name: '湖南特产八件套', category: '文旅伴手礼', spec: '8件/箱', price: 168, cost: 96, stock: 280, sales: 142, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '浏阳蒸菜食品厂', tags: ['礼遇湖南', '走亲访友'], farmIds: ['F016', 'F023'], promoName: '湖南特产八件套', commissionRate: 12, commissionSold: 18, commissionEarn: 20.2, skus: [{ id: 'P051-8', name: '8件装', price: 168, cost: 96, stock: 280 }] },
  { id: 'P052', emoji: '🪭', name: '湘绣团扇伴手礼', category: '文旅伴手礼', spec: '单把/盒', price: 88, cost: 48, stock: 320, sales: 86, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘潭湘莲食品有限公司', tags: ['非遗湘绣', '国风雅礼'], farmIds: ['F029'], skus: [{ id: 'P052-1', name: '单把装', price: 88, cost: 48, stock: 320 }] },
  { id: 'P053', emoji: '🍚', name: '双人农家土菜套餐券', category: '套餐券', spec: '2人/份', price: 128, cost: 55, stock: 400, sales: 96, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '石板溪农家乐', tags: ['到店核销', '土菜四菜一汤'], farmIds: ['F001'], skus: [{ id: 'P053-2P', name: '双人套餐券', price: 128, cost: 55, stock: 400 }] },
  { id: 'P054', emoji: '🎓', name: '亲子研学半日券', category: '套餐券', spec: '1大1小/份', price: 98, cost: 40, stock: 260, sales: 68, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '稻香村生态农庄', tags: ['插秧体验', '自然课堂'], farmIds: ['F003'], skus: [{ id: 'P054-2', name: '1大1小', price: 98, cost: 40, stock: 260 }] },
  { id: 'P055', emoji: '🏨', name: '山景民宿一晚券', category: '套餐券', spec: '1晚/份', price: 268, cost: 120, stock: 180, sales: 46, source: 'farmhouse', status: 'active', image: '/static/images/mountain.webp', supplier: '云上人家山景农庄', tags: ['含双早', '山景房'], farmIds: ['F002'], skus: [{ id: 'P055-1', name: '1晚', price: 268, cost: 120, stock: 180 }] },
  { id: 'P056', emoji: '🥝', name: '麻阳猕猴桃汁 6瓶', category: '酒水饮料', spec: '6瓶/箱', price: 39.9, cost: 22, stock: 480, sales: 132, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '麻阳冰糖橙合作社', tags: ['鲜榨还原', '0添加'], farmIds: ['F024'], skus: [{ id: 'P056-6', name: '6瓶装', price: 39.9, cost: 22, stock: 480 }] },
  { id: 'P057', emoji: '🧋', name: '常德擂茶 2L', category: '酒水饮料', spec: '2L/桶', price: 25.8, cost: 13, stock: 560, sales: 186, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '石门柑橘专业合作社', tags: ['老牌擂茶', '解腻神器'], farmIds: ['F025'], skus: [{ id: 'P057-2L', name: '2L', price: 25.8, cost: 13, stock: 560 }] },
  { id: 'P058', emoji: '🥤', name: '莓茶气泡水 12瓶', category: '酒水饮料', spec: '12瓶/箱', price: 49.9, cost: 26, stock: 380, sales: 92, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '张家界莓茶产业合作社', tags: ['国货新饮', '0糖0脂'], farmIds: ['F026'], skus: [{ id: 'P058-12', name: '12瓶装', price: 49.9, cost: 26, stock: 380 }] },
  { id: 'P059', emoji: '🥚', name: '临武鸭蛋 20枚', category: '农产品', spec: '20枚/盒', price: 32, cost: 18, stock: 520, sales: 176, source: 'platform', status: 'pending', image: '/static/images/farmhouse.webp', supplier: '临武鸭业股份有限公司', tags: ['散养鸭蛋', '蛋黄流油'], farmIds: ['F020'], skus: [{ id: 'P059-20', name: '20枚', price: 32, cost: 18, stock: 520 }] },
  { id: 'P060', emoji: '🌾', name: '望城富硒米 10kg', category: '农产品', spec: '10kg/袋', price: 89, cost: 52, stock: 460, sales: 154, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '望城蔬果种植基地', tags: ['富硒种植', '当季新米'], farmIds: ['F016', 'F030'], skus: [{ id: 'P060-10K', name: '10kg', price: 89, cost: 52, stock: 460 }] },
  { id: 'P061', emoji: '🍲', name: '云上人家·山景双人土菜券', category: '套餐券', spec: '2人/份', price: 168, cost: 78, stock: 300, sales: 64, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '云上人家山景农庄', tags: ['含双人土菜', '山景餐厅'], farmIds: ['F002'], skus: [{ id: 'P061-2P', name: '双人券', price: 168, cost: 78, stock: 300 }] },
  { id: 'P062', emoji: '🧑‍🌾', name: '稻香村·田园亲子餐券', category: '套餐券', spec: '1大1小/份', price: 128, cost: 55, stock: 260, sales: 52, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '稻香村生态农庄', tags: ['亲子餐', '研学配套'], farmIds: ['F003'], skus: [{ id: 'P062-2', name: '1大1小', price: 128, cost: 55, stock: 260 }] },
  { id: 'P063', emoji: '🌙', name: '橘子洲·江畔双人套餐券', category: '套餐券', spec: '2人/份', price: 158, cost: 70, stock: 240, sales: 48, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '橘子洲畔农家院', tags: ['江景位', '双人餐'], farmIds: ['F004'], skus: [{ id: 'P063-2P', name: '双人券', price: 158, cost: 70, stock: 240 }] },
  { id: 'P064', emoji: '🏮', name: '韶山·红色家宴套餐券', category: '套餐券', spec: '4人/份', price: 288, cost: 120, stock: 200, sales: 36, source: 'farmhouse', status: 'active', image: '/static/images/farmhouse.webp', supplier: '韶山红色记忆农庄', tags: ['家宴', '红色主题'], farmIds: ['F005'], skus: [{ id: 'P064-4P', name: '四人券', price: 288, cost: 120, stock: 200 }] },
  { id: 'P065', emoji: '🥗', name: '南岳·山野素斋套餐券', category: '套餐券', spec: '2人/份', price: 98, cost: 40, stock: 220, sales: 42, source: 'farmhouse', status: 'active', image: '/static/images/field.webp', supplier: '衡山南岳农家乐', tags: ['素斋', '山野时蔬'], farmIds: ['F006'], skus: [{ id: 'P065-2P', name: '双人券', price: 98, cost: 40, stock: 220 }] },
  { id: 'P066', emoji: '🍵', name: '云溪·茶香套餐券', category: '套餐券', spec: '2人/份', price: 138, cost: 60, stock: 180, sales: 30, source: 'farmhouse', status: 'active', image: '/static/images/tea.webp', supplier: '炎陵云溪农庄', tags: ['茶山景', '双人餐'], farmIds: ['F007'], skus: [{ id: 'P066-2P', name: '双人券', price: 138, cost: 60, stock: 180 }] },
  { id: 'P067', emoji: '🏞', name: '崀山·丹霞家宴券', category: '套餐券', spec: '4人/份', price: 268, cost: 112, stock: 160, sales: 26, source: 'farmhouse', status: 'active', image: '/static/images/mountain.webp', supplier: '邵阳崀山人家', tags: ['丹霞观景', '家宴'], farmIds: ['F009'], skus: [{ id: 'P067-4P', name: '四人券', price: 268, cost: 112, stock: 160 }] },
]

export const selectableProducts: Product[] = products.filter((item) => item.source === 'platform' && item.id !== 'P014')

export const purchaseSupplies: Product[] = [
  { id: 'PP01', emoji: '🧂', name: '餐厨复合调味料 5kg', category: '食材调料', price: 45, cost: 28, stock: 300, sales: 120, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '中台供应链', tags: ['食材调料', '中台甄选'], farmIds: [], skus: [{ id: 'PP01-1', name: '5kg', price: 45, cost: 28, stock: 300 }] },
  { id: 'PP02', emoji: '🛏', name: '民宿一次性洗漱套装', category: '民宿用品', price: 3.5, cost: 1.5, stock: 12000, sales: 600, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['民宿用品', '100 套/箱'], farmIds: [], skus: [{ id: 'PP02-1', name: '100 套/箱', price: 3.5, cost: 1.5, stock: 12000 }] },
  { id: 'PP04', emoji: '🍶', name: '本地散装料酒 5L', category: '酒水饮料', price: 36, cost: 22, stock: 500, sales: 300, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['酒水饮料', '烹饪用'], farmIds: [], skus: [{ id: 'PP04-1', name: '5L', price: 36, cost: 22, stock: 500 }] },
  { id: 'PP03', emoji: '🥡', name: '环保打包餐盒 ×300', category: '包装耗材', price: 1.2, cost: 0.6, stock: 20000, sales: 800, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['包装耗材', '可降解'], farmIds: [], skus: [{ id: 'PP03-1', name: '300只/箱', price: 1.2, cost: 0.6, stock: 20000 }] },
  { id: 'PP05', emoji: '🌾', name: '生态富硒米 25kg', category: '食材调料', price: 230, cost: 168, stock: 200, sales: 150, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '中台供应链', tags: ['食材调料', '产地直发'], farmIds: [], skus: [{ id: 'PP05-1', name: '25kg', price: 230, cost: 168, stock: 200 }] },
  { id: 'PP06', emoji: '🧻', name: '商用厨房纸 ×12 卷', category: '包装耗材', price: 58, cost: 36, stock: 600, sales: 200, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['包装耗材', '整箱装'], farmIds: [], skus: [{ id: 'PP06-1', name: '12卷/箱', price: 58, cost: 36, stock: 600 }] }
]

const qualification = (license: string, permit: string, validUntil: string, reviewNote: string): SupplierQualification => ({ businessLicense: license, permit, validUntil, reviewNote })

const supplierBrandSeeds: Record<string, string[]> = {
  S002: ['湘西腊味', '柴火腊味'],
  S003: ['安化黑茶', '白沙溪'],
  S004: ['炎陵黄桃'],
  S005: ['供销惠农甄选'],
  S006: ['武陵山蜂蜜'],
  S008: ['洞庭湖鲜'],
  S009: ['宁乡花猪'],
  S011: ['金雁粮油'],
  S013: ['望城绿蔬'],
  S014: ['浏阳蒸菜'],
  S023: ['临武鸭'],
  S026: ['双峰辣酱'],
  S027: ['古丈毛尖'],
  S031: ['武冈卤味'],
  S032: ['君山银针'],
  S034: ['桑植蜂蜜'],
  S036: ['祁阳米粉']
}

/** 服务区域默认取供应商所在地，跨区域供应商显式覆盖。 */
const supplierServiceRegionSeeds: Record<string, string[]> = {
  S005: ['常德', '益阳', '长沙'],
  S008: ['岳阳', '常德'],
  S013: ['长沙', '株洲']
}

const rawSuppliers: Supplier[] = [
  { id: 'S001', emoji: '🏭', name: '靖州杨梅专业合作社', contactPhone: '13973015588', region: '怀化靖州', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431229MA4L8X21', '待补充', '2026-12-31', '等待合作社资质材料核验') },
  { id: 'S002', emoji: '🥓', name: '湘西腊味合作社', contactPhone: '13787366688', region: '湘西州', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 32, coop: true, qualification: qualification('91433100MA4L8X21', 'SC10443310001821', '2028-06-30', '证照齐全，年度复核通过') },
  { id: 'S003', emoji: '🍵', name: '安化茶业集团', contactPhone: '13873790012', region: '益阳安化', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 18, coop: false, qualification: qualification('91430923MA4Q2A18', 'SC11443092300216', '2027-12-31', '生产许可与商标授权已核验') },
  { id: 'S004', emoji: '🍑', name: '炎陵果业有限公司', contactPhone: '13574902233', region: '株洲炎陵', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 9, coop: false, qualification: qualification('91430225MA4R7H09', 'NY4302252026018', '2027-09-15', '产地证明和抽检报告有效') },
  { id: 'S005', emoji: '🏪', name: '县供销社惠农服务中心', contactPhone: '13973615566', region: '常德', category: '综合品类', certified: true, status: 'cooperating', productCount: 46, coop: true, qualification: qualification('91430700MA4T9L31', 'SC12430700000158', '2028-03-31', '供销社体系网点，证照齐全') },
  { id: 'S006', emoji: '🍯', name: '武陵蜂业专业合作社', contactPhone: '13637448899', region: '张家界', category: '蜂蜜/土特产', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('93430800MA4P6B17', 'SC12643080000412', '2027-03-20', '最新批次质检报告已通过') },
  { id: 'S007', emoji: '🍶', name: '湘窖酒业经销商', contactPhone: '15080835577', region: '邵阳', category: '酒水饮料', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430500MA4R2H09', '资料补充中', '2026-10-31', '缺少酒类流通许可附件') },
  { id: 'S008', emoji: '🐟', name: '洞庭湖水产品合作社', contactPhone: '13774021133', region: '岳阳', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 12, coop: true, qualification: qualification('91430600MA4P9D27', 'SC12443060000365', '2028-05-31', '活鲜冷链资质与质检报告已核验') },
  { id: 'S009', emoji: '🥩', name: '宁乡花猪生态养殖场', contactPhone: '13974886622', region: '长沙宁乡', category: '综合品类', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430124MA4T1C64', 'SC11443012400981', '2028-01-31', '定点屠宰与防疫合格证明齐全') },
  { id: 'S010', emoji: '🍄', name: '道县瑶山菌业合作社', contactPhone: '15074763399', region: '永州道县', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431124MA4R8F43', '待补充', '2027-03-31', '等待食用菌种植基地资质核验') },
  { id: 'S011', emoji: '🌾', name: '衡阳金雁粮油加工厂', contactPhone: '13873467711', region: '衡阳', category: '综合品类', certified: true, status: 'cooperating', productCount: 15, coop: false, qualification: qualification('91430400MA4L2B19', 'SC12443040001542', '2028-09-30', '粮食加工许可与溯源档案已核验') },
  { id: 'S012', emoji: '🥡', name: '邵阳宝庆预制菜食品厂', contactPhone: '15273908844', region: '邵阳', category: '腊味/预制菜', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430502MA4R9H66', '资料补充中', '2027-01-31', '缺少预制菜生产许可附件') },
  { id: 'S013', emoji: '🍅', name: '望城蔬果种植基地', contactPhone: '13873152211', region: '长沙望城', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 10, coop: true, qualification: qualification('91430112MA4Q6C42', 'NY4301122026009', '2028-04-30', '绿色食品认证与基地备案齐全') },
  { id: 'S014', emoji: '🍲', name: '浏阳蒸菜食品厂', contactPhone: '13787183345', region: '长沙浏阳', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 14, coop: false, qualification: qualification('91430181MA4M2E87', 'SC11443018100763', '2028-11-30', '蒸菜工艺标准备案有效') },
  { id: 'S015', emoji: '🥒', name: '白关丝瓜种植合作社', contactPhone: '13973365577', region: '株洲芦淞', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430203MA4L9D15', '待补充', '2027-05-31', '等待地理标志授权材料') },
  { id: 'S016', emoji: '🪷', name: '湘潭湘莲食品有限公司', contactPhone: '15073219988', region: '湘潭', category: '综合品类', certified: true, status: 'cooperating', productCount: 7, coop: false, qualification: qualification('91430300MA4R1A56', 'SC11443030000428', '2028-02-28', '莲制品加工许可有效') },
  { id: 'S017', emoji: '🌼', name: '祁东黄花菜产业园', contactPhone: '13875766601', region: '衡阳祁东', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 6, coop: true, qualification: qualification('91430426MA4T3B72', 'NY4304262027003', '2028-06-30', '产地直采协议与质检报告有效') },
  { id: 'S018', emoji: '🌿', name: '邵东中药材合作社', contactPhone: '13647398866', region: '邵阳邵东', category: '综合品类', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430521MA4N5F21', '待补充', '2026-12-31', '等待GAP种植基地认证') },
  { id: 'S019', emoji: '🥜', name: '平江豆干食品厂', contactPhone: '13975023310', region: '岳阳平江', category: '综合品类', certified: true, status: 'cooperating', productCount: 11, coop: false, qualification: qualification('91430626MA4L3G58', 'SC11443062600159', '2028-03-31', '豆制品生产许可有效') },
  { id: 'S020', emoji: '🍊', name: '石门柑橘专业合作社', contactPhone: '13787649922', region: '常德石门', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 9, coop: true, qualification: qualification('91430726MA4P2A63', 'NY4307262026005', '2027-10-31', '柑橘出口基地备案有效') },
  { id: 'S021', emoji: '🍃', name: '张家界莓茶产业合作社', contactPhone: '15074421168', region: '张家界永定', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430802MA4R5E91', 'SC11443080200841', '2028-08-31', '莓茶地理标志授权有效') },
  { id: 'S022', emoji: '🦐', name: '南县稻虾合作社', contactPhone: '13873780055', region: '益阳南县', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430921MA4M7H34', '待补充', '2027-06-30', '等待稻虾共作基地认证') },
  { id: 'S023', emoji: '🦆', name: '临武鸭业股份有限公司', contactPhone: '13975702234', region: '郴州临武', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 16, coop: true, qualification: qualification('91431025MA4L1B96', 'SC11443102500537', '2028-05-31', '养殖屠宰加工全链资质齐全') },
  { id: 'S024', emoji: '🍠', name: '江永香芋种植基地', contactPhone: '13674661190', region: '永州江永', category: '生鲜农产', certified: true, status: 'cooperating', productCount: 5, coop: false, qualification: qualification('91431125MA4R2D77', 'NY4311252027001', '2027-09-30', '香芋绿色种植认证有效') },
  { id: 'S025', emoji: '🥝', name: '麻阳冰糖橙合作社', contactPhone: '15074538812', region: '怀化麻阳', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91431226MA4P8B23', '待补充', '2027-02-28', '等待冰糖橙商标授权') },
  { id: 'S026', emoji: '🌶', name: '双峰辣酱世家', contactPhone: '13873895544', region: '娄底双峰', category: '综合品类', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('91431321MA4M6A18', 'SC11443132100462', '2028-01-31', '酱料加工非遗工艺备案') },
  { id: 'S027', emoji: '🍵', name: '古丈毛尖茶厂', contactPhone: '13787932260', region: '湘西古丈', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 7, coop: false, qualification: qualification('91433126MA4L2C84', 'SC11443312600173', '2028-07-31', '绿茶生产许可有效') },
  { id: 'S028', emoji: '🥘', name: '长沙马王堆预制菜工厂', contactPhone: '15273146688', region: '长沙芙蓉', category: '腊味/预制菜', certified: true, status: 'paused', productCount: 3, coop: false, qualification: qualification('91430102MA4T5A39', 'SC11443010200691', '2027-08-31', '暂停止产整改中') },
  { id: 'S029', emoji: '🍑', name: '炎陵黄桃第二基地', contactPhone: '13974109925', region: '株洲炎陵', category: '生鲜农产', certified: true, status: 'paused', productCount: 2, coop: false, qualification: qualification('91430225MA4R8K52', 'NY4302252026015', '2027-07-31', '基地升级改造中') },
  { id: 'S030', emoji: '🍠', name: '耒阳红薯粉加工厂', contactPhone: '13677445532', region: '衡阳耒阳', category: '综合品类', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430481MA4M3E67', '待补充', '2027-04-30', '等待淀粉加工许可') },
  { id: 'S031', emoji: '🍗', name: '武冈卤味食品有限公司', contactPhone: '13787963378', region: '邵阳武冈', category: '腊味/预制菜', certified: true, status: 'cooperating', productCount: 12, coop: false, qualification: qualification('91430581MA4L7D92', 'SC11443058100318', '2028-10-31', '卤制品SC与门店备案齐全') },
  { id: 'S032', emoji: '🍵', name: '君山银针茶业', contactPhone: '15073089913', region: '岳阳君山', category: '茶叶/伴手礼', certified: true, status: 'cooperating', productCount: 6, coop: false, qualification: qualification('91430611MA4P1B45', 'SC11443061100724', '2028-09-30', '黄茶生产许可有效') },
  { id: 'S033', emoji: '🐢', name: '汉寿甲鱼养殖基地', contactPhone: '13875624407', region: '常德汉寿', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430722MA4R3E58', '待补充', '2027-03-31', '等待水产品质检报告') },
  { id: 'S034', emoji: '🍯', name: '桑植蜂蜜养殖合作社', contactPhone: '13974456621', region: '张家界桑植', category: '蜂蜜/土特产', certified: true, status: 'cooperating', productCount: 4, coop: false, qualification: qualification('91430822MA4M9B16', 'SC11443082200295', '2028-03-31', '蜂产品生产许可有效') },
  { id: 'S035', emoji: '🎋', name: '沅江芦笋合作社', contactPhone: '15274732258', region: '益阳沅江', category: '生鲜农产', certified: false, status: 'pending', productCount: 0, coop: false, qualification: qualification('91430981MA4T1H27', '待补充', '2027-01-31', '等待洞庭湖湿地种植备案') },
  { id: 'S036', emoji: '🍜', name: '祁阳米粉食品厂', contactPhone: '13874693370', region: '永州祁阳', category: '综合品类', certified: true, status: 'cooperating', productCount: 8, coop: false, qualification: qualification('91430421MA4Q7F83', 'SC11443042100638', '2028-12-31', '米粉制品SC有效') },
]

export const suppliers: Supplier[] = rawSuppliers.map((supplier) => ({
  ...supplier,
  brands: supplier.brands ?? supplierBrandSeeds[supplier.id] ?? [],
  serviceRegions: supplier.serviceRegions ?? supplierServiceRegionSeeds[supplier.id] ?? [supplier.region]
}))

export const storeAccounts: StoreAccount[] = [
  { id: 'SA001', farmId: 'F001', name: '王店长', account: '13800000001', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-01 09:00' },
  { id: 'SA002', farmId: 'F001', name: '李店员', account: '13800000002', password: '123456', role: 'staff', enabled: true, promoEnabled: true, priceLevel: 'A', createdAt: '2026-08-01 09:00' },
  { id: 'SA003', farmId: 'F002', name: '张店长', account: '13800000003', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-01 09:00' },
  { id: 'SA004', farmId: 'F003', name: '王店长', account: '13800000004', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-02 10:00' },
  { id: 'SA005', farmId: 'F003', name: '李店员', account: '13800000005', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-02 10:00' },
  { id: 'SA006', farmId: 'F002', name: '赵店长', account: '13800000006', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-03 09:30' },
  { id: 'SA007', farmId: 'F005', name: '孙店长', account: '13800000007', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-04 14:20' },
  { id: 'SA008', farmId: 'F007', name: '周店员', account: '13800000008', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-05 11:10' },
  { id: 'SA009', farmId: 'F006', name: '刘店长', account: '13800000009', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-06 09:40' },
  { id: 'SA010', farmId: 'F008', name: '黄店长', account: '13800000010', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-06 10:20' },
  { id: 'SA011', farmId: 'F009', name: '陈店员', account: '13800000011', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-07 14:00' },
  { id: 'SA012', farmId: 'F011', name: '杨店长', account: '13800000012', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-07 15:30' },
  { id: 'SA013', farmId: 'F013', name: '罗店员', account: '13800000013', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-08 09:10' },
  { id: 'SA014', farmId: 'F015', name: '何店长', account: '13800000014', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-08 11:40' },
  { id: 'SA015', farmId: 'F016', name: '蒋店长', account: '13800000015', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-09 10:00' },
  { id: 'SA016', farmId: 'F018', name: '邓店员', account: '13800000016', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-09 16:20' },
  { id: 'SA017', farmId: 'F020', name: '曹店长', account: '13800000017', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-10 09:50' },
  { id: 'SA018', farmId: 'F022', name: '袁店员', account: '13800000018', password: '123456', role: 'staff', enabled: true, createdAt: '2026-08-10 13:30' },
  { id: 'SA019', farmId: 'F024', name: '谢店长', account: '13800000019', password: '123456', role: 'owner', enabled: true, createdAt: '2026-08-11 10:10' },
  { id: 'SA020', farmId: 'F026', name: '谭店长', account: '13800000020', password: '123456', role: 'owner', enabled: false, createdAt: '2026-08-11 15:00' }
]

export const categories: Category[] = [
  { id: 'C001', name: '农产品', type: 'product' },
  { id: 'C002', name: '预制菜', type: 'product' },
  { id: 'C003', name: '食材调料', type: 'product' },
  { id: 'C004', name: '文旅伴手礼', type: 'product' },
  { id: 'C005', name: '民宿用品', type: 'product' },
  { id: 'C006', name: '包装耗材', type: 'product' },
  { id: 'C007', name: '土特产', type: 'product' },
  { id: 'C008', name: '伴手礼', type: 'product' },
  { id: 'C009', name: '套餐券', type: 'product' },
  { id: 'C010', name: '腊味/预制菜', type: 'supplier' },
  { id: 'C011', name: '茶叶/伴手礼', type: 'supplier' },
  { id: 'C012', name: '蜂蜜/土特产', type: 'supplier' },
  { id: 'C013', name: '综合品类', type: 'supplier' },
  { id: 'C014', name: '生鲜农产', type: 'general' },
  { id: 'C015', name: '酒水饮料', type: 'general' },
  { id: 'C016', name: '有机蔬菜', type: 'product' },
  { id: 'C017', name: '时令水果', type: 'product' },
  { id: 'C018', name: '粮油米面', type: 'product' },
  { id: 'C019', name: '水产养殖', type: 'supplier' },
  { id: 'C020', name: '蔬菜种植', type: 'supplier' },
  { id: 'C021', name: '禽蛋养殖', type: 'supplier' },
  { id: 'C022', name: '农家体验', type: 'general' },
  { id: 'C023', name: '露营烧烤', type: 'general' },
  { id: 'C024', name: '研学亲子', type: 'general' }
]

export function categoryIconName(category: string): string {
  const value = category.trim().toLowerCase()
  if (value === '全部') return 'layout-dashboard'
  if (['套餐券', '代金券', '优惠券'].some((keyword) => value.includes(keyword))) return 'badge-percent'
  if (['民宿', '住宿', '客房'].some((keyword) => value.includes(keyword))) return 'house'
  if (['包装', '耗材'].some((keyword) => value.includes(keyword))) return 'package'
  if (['体验', '采摘', '研学'].some((keyword) => value.includes(keyword))) return 'map-pin'
  if (['土特产', '伴手礼', '礼品', '文旅'].some((keyword) => value.includes(keyword))) return 'shopping-bag'
  if (['预制菜', '食材', '调料', '粮油', '米面', '饮料', '酒水', '腊味'].some((keyword) => value.includes(keyword))) return 'utensils'
  if (['农产品', '农产', '生鲜', '水果', '果蔬', '蔬菜', '蜂蜜', '茶叶', '禽蛋', '水产', '养殖', '种植'].some((keyword) => value.includes(keyword))) return 'sprout'
  return 'tags'
}

export function productCategoryImage(category: string, state: PlatformDictionaryState = readPlatformDictionaries()): MediaReference {
  const normalized = category.trim()
  const item = state.items.find((candidate) => candidate.type === 'productCategory'
    && (candidate.code === normalized || candidate.label === normalized))
  return normalizeMediaReference(item?.image) ?? defaultProductCategoryImage(normalized)
}

const rawFarms: Array<Omit<FarmStore, 'address' | 'location' | 'locationStatus' | 'locationError' | 'structuredAddress' | 'regionCode'>> = [
  { id: 'F001', core: true, emoji: '🏡', adminDesc: '样板店 · 柴火土菜', name: '石板溪农家乐', contact: '王店长', contactPhone: '13900000001', region: '湘西州永顺县', city: '湘西州', availability: 'bookable', distance: 0.8, rating: 4.9, monthlySales: 1280, averageSpend: 78, status: 'active', selectedCount: 86, gmv: 42860, image: '/static/images/farmhouse.webp', tags: ['柴火土菜', '临溪包厢', '可停车'], storeTags: ['柴火土灶', '山泉养鱼', '亲子研学'] },
  { id: 'F002', core: true, emoji: '⛰', adminDesc: '山景民宿', name: '云上人家山景农庄', contact: '李店长', contactPhone: '13900000002', region: '张家界永定区', city: '张家界市', availability: 'bookable', distance: 1.1, rating: 4.8, monthlySales: 960, averageSpend: 120, status: 'active', selectedCount: 64, gmv: 38420, image: '/static/images/mountain.webp', tags: ['山景民宿', '家宴大厅'] },
  { id: 'F003', core: true, emoji: '🌾', adminDesc: '亲子研学', name: '稻香村生态农庄', contact: '张店长', contactPhone: '13900000003', region: '常德桃源县', city: '常德市', availability: 'full', distance: 1.6, rating: 4.7, monthlySales: 720, averageSpend: 65, status: 'active', selectedCount: 52, gmv: 31200, image: '/static/images/field.webp', tags: ['亲子研学', '研学基地'] },
  { id: 'F004', core: true, emoji: '🍊', name: '橘子洲畔农家院', contact: '陈店长', contactPhone: '13900000004', region: '长沙湘江新区', city: '长沙市', availability: 'bookable', distance: 2.0, rating: 4.6, monthlySales: 680, averageSpend: 88, status: 'active', selectedCount: 40, gmv: 26800, image: '/static/images/field.webp', tags: ['湘江夜景', '江畔餐厅'] },
  { id: 'F005', core: true, emoji: '🏮', adminDesc: '红色研学', name: '韶山红色记忆农庄', contact: '刘店长', contactPhone: '13900000005', region: '湘潭韶山市', city: '湘潭市', availability: 'closed', distance: 3.5, rating: 4.7, monthlySales: 610, averageSpend: 68, status: 'pending', selectedCount: 12, gmv: 0, image: '/static/images/field.webp', tags: ['红色研学'] },
  { id: 'F006', emoji: '⛰', adminDesc: '南岳祈福 · 山野土菜', name: '衡山南岳农家乐', contact: '赵店长', contactPhone: '13900000006', region: '衡阳市南岳区', city: '衡阳市', availability: 'bookable', distance: 2.6, rating: 4.6, monthlySales: 520, averageSpend: 72, status: 'active', selectedCount: 28, gmv: 18900, image: '/static/images/mountain.webp', tags: ['南岳祈福', '山野土菜'] },
  { id: 'F007', emoji: '🍵', adminDesc: '云溪茶香 · 山野民宿', name: '炎陵云溪农庄', contact: '周店长', contactPhone: '13900000007', region: '株洲炎陵县', city: '株洲市', availability: 'bookable', distance: 3.1, rating: 4.5, monthlySales: 430, averageSpend: 66, status: 'active', selectedCount: 22, gmv: 15200, image: '/static/images/tea.webp', tags: ['茶山民宿', '云海日出'] },
  { id: 'F008', emoji: '🐟', adminDesc: '洞庭湖畔 · 全鱼宴', name: '岳阳洞庭渔村', contact: '吴店长', contactPhone: '13900000008', region: '岳阳市君山区', city: '岳阳市', availability: 'full', distance: 4.2, rating: 4.4, monthlySales: 360, averageSpend: 88, status: 'pending', selectedCount: 10, gmv: 0, image: '/static/images/field.webp', tags: ['全鱼宴', '湖景'] },
  { id: 'F009', emoji: '🏞', adminDesc: '崀山丹霞人家', name: '邵阳崀山人家', contact: '郑店长', contactPhone: '13900000009', region: '邵阳市新宁县', city: '邵阳市', availability: 'bookable', distance: 2.9, rating: 4.7, monthlySales: 470, averageSpend: 70, status: 'active', selectedCount: 26, gmv: 17600, image: '/static/images/farmhouse.webp', tags: ['丹霞风光', '柴火饭'] },
  { id: 'F010', emoji: '🍃', adminDesc: '安化茶乡小院', name: '益阳安化茶乡小院', contact: '孙店长', contactPhone: '13900000010', region: '益阳市安化县', city: '益阳市', availability: 'closed', distance: 5.0, rating: 4.3, monthlySales: 280, averageSpend: 60, status: 'paused', selectedCount: 8, gmv: 0, image: '/static/images/tea.webp', tags: ['黑茶体验', '民宿'] },
  { id: 'F011', emoji: '🐠', adminDesc: '侗寨风味 · 河鲜码头', name: '怀化侗乡渔寨', contact: '黄店长', contactPhone: '13900000011', region: '怀化市洪江区', city: '怀化市', availability: 'bookable', distance: 3.8, rating: 4.5, monthlySales: 410, averageSpend: 76, status: 'active', selectedCount: 18, gmv: 14200, image: '/static/images/field.webp', tags: ['侗寨风情', '河鲜'] },
  { id: 'F012', emoji: '🌶', adminDesc: '十八洞苗家院 · 筹备中', name: '湘西十八洞苗家院', contact: '徐店长', contactPhone: '13900000012', region: '湘西州花垣县', city: '湘西州', availability: 'closed', distance: 6.2, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 6, gmv: 0, image: '/static/images/farmhouse.webp', tags: ['苗家酸汤', '即将开业'] },
  { id: 'F013', emoji: '🪷', adminDesc: '柳叶湖景 · 荷香餐厅', name: '常德柳叶湖荷香农庄', contact: '马店长', contactPhone: '13900000013', region: '常德市武陵区', city: '常德市', availability: 'bookable', distance: 2.8, rating: 4.6, monthlySales: 520, averageSpend: 82, status: 'active', selectedCount: 24, gmv: 19800, image: '/static/images/mountain.webp', tags: ['湖景餐厅', '荷塘月色'] },
  { id: 'F014', emoji: '🏞', adminDesc: '神农谷林间民宿', name: '株洲神农谷山居', contact: '朱店长', contactPhone: '13900000014', region: '株洲市炎陵县', city: '株洲市', availability: 'closed', distance: 4.6, rating: 4.3, monthlySales: 0, averageSpend: 0, status: 'paused', selectedCount: 5, gmv: 0, image: '/static/images/field.webp', tags: ['森林康养', '暂停营业'] },
  { id: 'F015', emoji: '🐔', adminDesc: '乌石山野土鸡庄', name: '湘潭乌石土鸡农庄', contact: '胡店长', contactPhone: '13900000015', region: '湘潭市湘潭县', city: '湘潭市', availability: 'bookable', distance: 3.4, rating: 4.5, monthlySales: 380, averageSpend: 68, status: 'active', selectedCount: 16, gmv: 12800, image: '/static/images/farmhouse.webp', tags: ['散养土鸡', '柴火灶'] },
  { id: 'F016', emoji: '🐟', adminDesc: '捞刀河畔 · 渔家土菜', name: '长沙捞刀河渔家乐', contact: '郭店长', contactPhone: '13900000016', region: '长沙市开福区', city: '长沙市', availability: 'bookable', distance: 2.4, rating: 4.6, monthlySales: 460, averageSpend: 82, status: 'active', selectedCount: 22, gmv: 17600, image: '/static/images/field.webp', tags: ['河鲜渔家', '临水包厢'] },
  { id: 'F017', emoji: '⛰', adminDesc: '酒埠江山水人家', name: '株洲酒埠江山水农庄', contact: '何店长', contactPhone: '13900000017', region: '株洲市攸县', city: '株洲市', availability: 'bookable', distance: 3.6, rating: 4.4, monthlySales: 320, averageSpend: 70, status: 'active', selectedCount: 14, gmv: 11600, image: '/static/images/mountain.webp', tags: ['水库鱼', '山水民宿'] },
  { id: 'F018', emoji: '🏘', adminDesc: '古村人家 · 明清院落', name: '岳阳张谷英古村农家', contact: '高店长', contactPhone: '13900000018', region: '岳阳市岳阳县', city: '岳阳市', availability: 'bookable', distance: 3.9, rating: 4.6, monthlySales: 440, averageSpend: 76, status: 'active', selectedCount: 20, gmv: 15200, image: '/static/images/farmhouse.webp', tags: ['古村文化', '土灶菜'] },
  { id: 'F019', emoji: '🌄', adminDesc: '祝融峰下 · 云海人家', name: '衡山祝融云海人家', contact: '罗店长', contactPhone: '13900000019', region: '衡阳市南岳区', city: '衡阳市', availability: 'bookable', distance: 3.0, rating: 4.7, monthlySales: 500, averageSpend: 74, status: 'active', selectedCount: 24, gmv: 18400, image: '/static/images/mountain.webp', tags: ['云海日出', '衡山土菜'] },
  { id: 'F020', emoji: '🏞', adminDesc: '东江湖畔 · 渔村人家', name: '郴州东江湖人家', contact: '梁店长', contactPhone: '13900000020', region: '郴州市资兴市', city: '郴州市', availability: 'bookable', distance: 3.2, rating: 4.7, monthlySales: 540, averageSpend: 86, status: 'active', selectedCount: 26, gmv: 21000, image: '/static/images/field.webp', tags: ['东江湖鲜', '环湖民宿'] },
  { id: 'F021', emoji: '🛖', adminDesc: '九嶷山麓 · 瑶寨风情', name: '永州九嶷山瑶寨', contact: '宋店长', contactPhone: '13900000021', region: '永州市宁远县', city: '永州市', availability: 'bookable', distance: 4.1, rating: 4.5, monthlySales: 360, averageSpend: 66, status: 'active', selectedCount: 16, gmv: 12800, image: '/static/images/farmhouse.webp', tags: ['瑶家油茶', '长桌宴'] },
  { id: 'F022', emoji: '🌾', adminDesc: '紫鹊界梯田人家', name: '娄底紫鹊界梯田农庄', contact: '唐店长', contactPhone: '13900000022', region: '娄底市新化县', city: '娄底市', availability: 'bookable', distance: 4.4, rating: 4.6, monthlySales: 420, averageSpend: 72, status: 'active', selectedCount: 18, gmv: 15800, image: '/static/images/field.webp', tags: ['梯田风光', '柴火腊肉'] },
  { id: 'F023', emoji: '🏜', adminDesc: '崀山丹霞客栈', name: '邵阳崀山丹霞客栈', contact: '许店长', contactPhone: '13900000023', region: '邵阳市新宁县', city: '邵阳市', availability: 'closed', distance: 3.7, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 8, gmv: 0, image: '/static/images/mountain.webp', tags: ['丹霞奇观', '即将开业'] },
  { id: 'F024', emoji: '🏮', adminDesc: '洪江古商城驿站', name: '怀化洪江古商城驿站', contact: '邓店长', contactPhone: '13900000024', region: '怀化市洪江区', city: '怀化市', availability: 'bookable', distance: 3.5, rating: 4.5, monthlySales: 400, averageSpend: 78, status: 'active', selectedCount: 18, gmv: 14600, image: '/static/images/farmhouse.webp', tags: ['古商城', '明清客栈'] },
  { id: 'F025', emoji: '🦢', adminDesc: '白马湖畔 · 田园餐厅', name: '常德桃源白马湖农庄', contact: '冯店长', contactPhone: '13900000025', region: '常德市桃源县', city: '常德市', availability: 'bookable', distance: 2.7, rating: 4.5, monthlySales: 380, averageSpend: 70, status: 'active', selectedCount: 16, gmv: 13800, image: '/static/images/field.webp', tags: ['田园风光', '土家腊肉'] },
  { id: 'F026', emoji: '🏞', adminDesc: '武陵源溪畔小院', name: '张家界武陵源溪畔院', contact: '韩店长', contactPhone: '13900000026', region: '张家界市武陵源区', city: '张家界市', availability: 'bookable', distance: 2.2, rating: 4.7, monthlySales: 520, averageSpend: 90, status: 'active', selectedCount: 26, gmv: 19600, image: '/static/images/mountain.webp', tags: ['溪畔民宿', '张家界景'] },
  { id: 'F027', emoji: '🎋', adminDesc: '芦花小院 · 洞庭人家', name: '益阳沅江芦花小院', contact: '曹店长', contactPhone: '13900000027', region: '益阳市沅江市', city: '益阳市', availability: 'closed', distance: 4.8, rating: 4.3, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 6, gmv: 0, image: '/static/images/field.webp', tags: ['芦苇荡', '筹备中'] },
  { id: 'F028', emoji: '🏔', adminDesc: '矮寨大桥 · 峡谷人家', name: '湘西矮寨峡谷人家', contact: '彭店长', contactPhone: '13900000028', region: '湘西州吉首市', city: '湘西州', availability: 'bookable', distance: 2.9, rating: 4.6, monthlySales: 480, averageSpend: 74, status: 'active', selectedCount: 22, gmv: 17200, image: '/static/images/farmhouse.webp', tags: ['峡谷风光', '苗家酸汤'] },
  { id: 'F029', emoji: '🌉', adminDesc: '窑湾江畔 · 夜泊人家', name: '湘潭窑湾江畔农庄', contact: '曾店长', contactPhone: '13900000029', region: '湘潭市雨湖区', city: '湘潭市', availability: 'closed', distance: 3.3, rating: 4.2, monthlySales: 0, averageSpend: 0, status: 'paused', selectedCount: 4, gmv: 0, image: '/static/images/field.webp', tags: ['江畔夜景', '暂停营业'] },
  { id: 'F030', emoji: '🪷', adminDesc: '洋湖湿地 · 荷塘月色', name: '长沙洋湖荷塘月色院', contact: '肖店长', contactPhone: '13900000030', region: '长沙市岳麓区', city: '长沙市', availability: 'closed', distance: 2.6, rating: 4.4, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 10, gmv: 0, image: '/static/images/field.webp', tags: ['湿地公园', '荷塘餐厅'] },
]

const FARM_CITY_INDEX: Record<string, { adCode: string; longitude: number; latitude: number; district: string }> = {
  '长沙市': { adCode: '430102', longitude: 112.9388, latitude: 28.2278, district: '岳麓区' },
  '湘西州': { adCode: '433127', longitude: 109.8542, latitude: 28.6267, district: '永顺县' },
  '张家界市': { adCode: '430802', longitude: 110.4792, latitude: 29.1171, district: '永定区' },
  '常德市': { adCode: '430702', longitude: 111.6990, latitude: 29.0015, district: '桃源县' },
  '湘潭市': { adCode: '430302', longitude: 112.5270, latitude: 27.9149, district: '韶山市' },
  '衡阳市': { adCode: '430405', longitude: 112.5166, latitude: 27.2410, district: '南岳区' },
  '株洲市': { adCode: '430202', longitude: 113.7744, latitude: 26.4894, district: '炎陵县' },
  '岳阳市': { adCode: '430602', longitude: 112.8952, latitude: 29.4581, district: '君山区' },
  '邵阳市': { adCode: '430502', longitude: 111.0588, latitude: 26.6350, district: '新宁县' },
  '益阳市': { adCode: '430902', longitude: 112.3552, latitude: 28.5715, district: '安化县' },
  '怀化市': { adCode: '431202', longitude: 109.9856, latitude: 27.3996, district: '洪江区' },
  '娄底市': { adCode: '431302', longitude: 111.9946, latitude: 27.7001, district: '双峰县' },
  '永州市': { adCode: '431102', longitude: 111.6134, latitude: 25.5278, district: '江永县' },
  '郴州市': { adCode: '431002', longitude: 113.0135, latitude: 25.7704, district: '临武县' }
}
const FARM_LOCALE: Record<string, { adCode: string; longitude: number; latitude: number; district: string }> = {
  'F004': { adCode: '430104', longitude: 112.9388, latitude: 28.2278, district: '岳麓区' }
}

const FARM_DETAIL: Record<string, string> = {
  'F001': '石板溪街道', 'F004': '橘子洲街道潇湘中路', 'F002': '天门山路', 'F005': '清溪镇'
}

function enrichSeedFarms(seed: Array<Omit<FarmStore, 'address' | 'location' | 'locationStatus' | 'locationError' | 'structuredAddress' | 'regionCode'>>): FarmStore[] {
  return seed.map((farm) => {
    const info = FARM_LOCALE[farm.id] || FARM_CITY_INDEX[farm.city] || { adCode: '430100', longitude: 112.9388, latitude: 28.2278, district: '岳麓区' }
    const detail = FARM_DETAIL[farm.id] || '演示地址'
    const structuredAddress: FarmAdministrativeAddress = { province: '湖南省', provinceCode: '43', city: farm.city || '长沙市', cityCode: info.adCode.slice(0, 4), district: info.district, districtCode: info.adCode, detail }
    return {
      ...farm,
      address: '湖南省' + (farm.city || '') + info.district + detail,
      regionCode: info.adCode,
      structuredAddress,
      location: { longitude: info.longitude, latitude: info.latitude, coordinateSystem: 'GCJ-02' as const, adCode: info.adCode, province: '湖南省', city: farm.city || '长沙市', district: info.district, formattedAddress: '湖南省' + (farm.city || '') + info.district + detail, provider: 'amap' as const, geocodedAt: '2026-08-01T00:00:00.000Z' },
      locationStatus: 'resolved' as const
    }
  })
}
export const farms: FarmStore[] = enrichSeedFarms(rawFarms)

export const orders: Order[] = [
  { id: 'NJ202608110928', productName: '炎陵黄桃礼盒', quantity: 2, amount: 136, customer: '石板溪农家乐', channel: 'live', status: 'pending', createdAt: '2026-08-11 09:28', supplierId: 'S004', items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃 5斤礼盒', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 2, price: 68 }], flow: [{ time: '2026-08-11 09:28', action: '用户下单', operator: '石板溪农家乐' }, { time: '2026-08-11 09:28', action: '订单支付成功', operator: '石板溪农家乐' }] },
  { id: 'NJ202608110915', productName: '湘西烟熏柴火腊肉', quantity: 5, amount: 277.7, customer: '云上人家山景农庄', channel: 'shop', status: 'pending', createdAt: '2026-08-11 09:15', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 3, price: 59.9 }, { productId: 'P009', skuId: 'P009-1', name: '招牌酱板鸭 整只装', skuName: '整只装', image: '/static/images/bacon.webp', quantity: 2, price: 49 }] },
  { id: 'NJ202608110903', productName: '民宿一次性洗漱套装', quantity: 200, amount: 360, customer: '云上人家山景农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-11 09:03', supplierId: 'S005', items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 200, price: 1.8 }], flow: [{ time: '2026-08-11 09:03', action: '用户下单', operator: '云上人家山景农庄' }, { time: '2026-08-11 09:03', action: '订单支付成功', operator: '云上人家山景农庄' }, { time: '2026-08-11 09:03', action: '已发货 · 已安排司机配送', operator: '运营管理员' }] },
  { id: 'NJ202608110851', productName: '安化黑茶礼盒', quantity: 1, amount: 128, customer: '团长 · 张同学', channel: 'live', status: 'shipping', createdAt: '2026-08-11 08:51', supplierId: 'S003', items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 1, price: 128 }] },
  { id: 'NJ202608110842', productName: '武陵山野生土蜂蜜', quantity: 3, amount: 264, customer: '稻香村生态农庄', channel: 'shop', status: 'delivered', createdAt: '2026-08-11 08:42', supplierId: 'S006', items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 3, price: 88 }], flow: [{ time: '2026-08-11 08:42', action: '用户下单', operator: '稻香村生态农庄' }, { time: '2026-08-11 08:42', action: '订单支付成功', operator: '稻香村生态农庄' }, { time: '2026-08-11 08:42', action: '已发货 · 已安排司机配送', operator: '运营管理员' }, { time: '2026-08-11 08:42', action: '已确认收货', operator: '运营管理员' }] },
  { id: 'NJ202608121030', productName: '湘西烟熏柴火腊肉', quantity: 6, amount: 359.4, customer: '石板溪农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-12 10:30', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 6, price: 59.9 }] },
  { id: 'NJ202608121015', productName: '安化黑茶礼盒装', quantity: 2, amount: 256, customer: '云上人家山景农庄', channel: 'purchase', status: 'unpaid-cancelled', createdAt: '2026-08-12 10:15', supplierId: 'S003', items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 2, price: 128 }], flow: [{ time: '2026-08-12 10:15', action: '用户下单', operator: '云上人家山景农庄' }, { time: '2026-08-12 10:15', action: '未支付取消', operator: '云上人家山景农庄' }] },
  { id: 'NJ202608120958', productName: '洞庭湖风干刁子鱼', quantity: 10, amount: 428, customer: '团长 · 苗家阿妹', channel: 'live', status: 'shipping', createdAt: '2026-08-12 09:58', supplierId: 'S008', trackingNo: 'SF1493208660121', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 10, price: 42.8 }] },
  { id: 'NJ202608120945', productName: '民宿一次性洗漱套装', quantity: 100, amount: 350, customer: '稻香村生态农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-12 09:45', supplierId: 'S005', trackingNo: 'DB4321689092', logistics: [{ time: '2026-08-12 09:45', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-12 11:02', title: '运输中', detail: '包裹已到达长沙转运中心' }], items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 100, price: 3.5 }] },
  { id: 'NJ202608120931', productName: '武陵山野生土蜂蜜', quantity: 2, amount: 176, customer: '团长 · 土家幺妹', channel: 'live', status: 'paid-cancelled', createdAt: '2026-08-12 09:31', supplierId: 'S006', trackingNo: 'ZT7231096554', items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }], flow: [{ time: '2026-08-12 09:31', action: '用户下单', operator: '推客 · 土家幺妹' }, { time: '2026-08-12 09:31', action: '订单支付成功', operator: '推客 · 土家幺妹' }, { time: '2026-08-12 09:31', action: '已支付取消', operator: '推客 · 土家幺妹' }] },
  { id: 'NJ202608120918', productName: '农家自制剁辣椒', quantity: 20, amount: 798, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 09:18', items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 20, price: 39.9 }] },
  { id: 'NJ202608120905', productName: '宁乡花猪腊肠', quantity: 15, amount: 582, customer: '衡山南岳农家乐', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 09:05', supplierId: 'S009', trackingNo: 'YT7754219833', logistics: [{ time: '2026-08-11 16:20', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-08-11 21:47', title: '运输中', detail: '包裹已到达衡阳分拨中心' }, { time: '2026-08-12 08:35', title: '派送中', detail: '快递员正在派送' }], items: [{ productId: 'P017', skuId: 'P017-400', name: '宁乡花猪腊肠 400g', skuName: '400g', image: '/static/images/bacon.webp', quantity: 15, price: 38.8 }] },
  { id: 'NJ202608120851', productName: '农家四人欢聚套餐券', quantity: 3, amount: 864, customer: '团长 · 湘农优选', channel: 'live', status: 'after-sale', createdAt: '2026-08-12 08:51', items: [{ productId: 'P007', skuId: 'P007-4P', name: '农家四人欢聚套餐券', skuName: '四人套餐券', image: '/static/images/farmhouse.webp', quantity: 3, price: 288 }] },
  { id: 'NJ202608120842', productName: '山泉土鸡汤礼盒', quantity: 4, amount: 432, customer: '韶山红色记忆农庄', channel: 'purchase', status: 'shipping', createdAt: '2026-08-12 08:42', trackingNo: 'JDV00152633821', items: [{ productId: 'P011', skuId: 'P011-1', name: '山泉土鸡汤礼盒', skuName: '2只装', image: '/static/images/farmhouse.webp', quantity: 4, price: 108 }] },
  { id: 'NJ202608120830', productName: '安化擂茶粉', quantity: 8, amount: 319.2, customer: '益阳安化茶乡小院', channel: 'shop', status: 'delivered', createdAt: '2026-08-12 08:30', supplierId: 'S003', trackingNo: 'EMS555882761', items: [{ productId: 'P023', skuId: 'P023-500', name: '安化擂茶粉 500g', skuName: '500g', image: '/static/images/tea.webp', quantity: 8, price: 39.9 } ] },
  { id: 'NJ202607201600', productName: '宝庆糯米甜酒 2L坛装', quantity: 4, amount: 184, customer: '岳阳洞庭渔村', channel: 'shop', status: 'delivered', createdAt: '2026-07-20 16:00', supplierId: 'S012', trackingNo: 'DB4320001000', logistics: [{ time: '2026-07-20 16:00', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-07-20 16:13', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-20 16:38', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-20 16:30', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 4, price: 46 }] },
  { id: 'NJ202607201109', productName: '麻阳猕猴桃汁 6瓶', quantity: 4, amount: 159.6, customer: '岳阳洞庭渔村', channel: 'shop', status: 'delivered', createdAt: '2026-07-20 11:09', supplierId: 'S025', trackingNo: 'YD8840001001', logistics: [{ time: '2026-07-20 11:09', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-20 11:44', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-20 11:27', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-20 11:03', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P056', skuId: 'P056-6', name: '麻阳猕猴桃汁 6瓶', skuName: '6瓶装', image: '/static/images/field.webp', quantity: 4, price: 39.9 }] },
  { id: 'NJ202607211215', productName: '白关丝瓜 3斤装', quantity: 2, amount: 39.8, customer: '团长 · 湘农优选', channel: 'shop', status: 'delivered', createdAt: '2026-07-21 12:15', supplierId: 'S015', trackingNo: 'YD8840001002', logistics: [{ time: '2026-07-21 12:15', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-21 12:01', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-21 12:38', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-21 12:03', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P026', skuId: 'P026-3J', name: '白关丝瓜 3斤装', skuName: '3斤装', image: '/static/images/field.webp', quantity: 2, price: 19.9 }] },
  { id: 'NJ202607211740', productName: '宁乡花猪腊肠 400g', quantity: 6, amount: 691.2, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-07-21 17:40', supplierId: 'S009', trackingNo: 'EMS550001003', logistics: [{ time: '2026-07-21 17:40', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-21 17:30', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-21 17:01', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-21 17:28', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P017', skuId: 'P017-400', name: '宁乡花猪腊肠 400g', skuName: '400g', image: '/static/images/bacon.webp', quantity: 4, price: 38.8 }, { productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 2, price: 268 }] },
  { id: 'NJ202607221134', productName: '石门柑橘 5kg', quantity: 2, amount: 91.6, customer: '云上人家山景农庄', channel: 'live', status: 'delivered', createdAt: '2026-07-22 11:34', supplierId: 'S020', items: [{ productId: 'P028', skuId: 'P028-5K', name: '石门柑橘 5kg', skuName: '5kg', image: '/static/images/peach.webp', quantity: 2, price: 45.8 }] },
  { id: 'NJ202607220823', productName: '靖州杨梅干 250g', quantity: 4, amount: 107.2, customer: '团长 · 土家幺妹', channel: 'live', status: 'delivered', createdAt: '2026-07-22 08:23', supplierId: 'S001', items: [{ productId: 'P019', skuId: 'P019-250', name: '靖州杨梅干 250g', skuName: '250g', image: '/static/images/peach.webp', quantity: 4, price: 26.8 }] },
  { id: 'NJ202607231022', productName: '竹纤维浴巾 20条', quantity: 2, amount: 500, customer: '游客 · 李女士', channel: 'live', status: 'delivered', createdAt: '2026-07-23 10:22', supplierId: 'S005', items: [{ productId: 'P044', skuId: 'P044-20', name: '竹纤维浴巾 20条', skuName: '20条/箱', image: '/static/images/field.webp', quantity: 2, price: 250 }] },
  { id: 'NJ202607240956', productName: '湘莲莲子羹 400g', quantity: 7, amount: 300.4, customer: '怀化侗乡渔寨', channel: 'purchase', status: 'delivered', createdAt: '2026-07-24 09:56', supplierId: 'S016', trackingNo: 'EMS550001004', logistics: [{ time: '2026-07-24 09:56', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-24 09:15', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-24 09:09', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-24 09:46', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P050', skuId: 'P050-400', name: '湘莲莲子羹 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 4, price: 46 }, { productId: 'P031', skuId: 'P031-300', name: '浏阳蒸火焙鱼 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 38.8 }] },
  { id: 'NJ202607240808', productName: '湘西剁椒鱼头酱 500g', quantity: 2, amount: 59.8, customer: '团长 · 岳阳小龙虾哥', channel: 'purchase', status: 'delivered', createdAt: '2026-07-24 08:08', supplierId: 'S002', trackingNo: 'EMS550001005', logistics: [{ time: '2026-07-24 08:08', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-24 08:40', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-24 08:21', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-24 08:00', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }] },
  { id: 'NJ202607251625', productName: '亲子研学半日券', quantity: 4, amount: 392, customer: '炎陵云溪农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-25 16:25', trackingNo: 'JDV1500001006', logistics: [{ time: '2026-07-25 16:25', title: '商家已发货', detail: '订单已由 京东物流 揽收' }, { time: '2026-07-25 16:34', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-25 16:07', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-25 16:06', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202607250843', productName: '洞庭湖风干刁子鱼 400g', quantity: 3, amount: 128.4, customer: '韶山红色记忆农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-25 08:43', supplierId: 'S008', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 42.8 }] },
  { id: 'NJ202607261435', productName: '亲子研学半日券', quantity: 6, amount: 490, customer: '团长 · 辣妹子', channel: 'shop', status: 'delivered', createdAt: '2026-07-26 14:35', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }, { productId: 'P009', skuId: 'P009-1', name: '招牌酱板鸭 整只装', skuName: '整只装', image: '/static/images/bacon.webp', quantity: 2, price: 49 }] },
  { id: 'NJ202607271207', productName: '宝庆糯米甜酒 2L坛装', quantity: 3, amount: 138, customer: '韶山红色记忆农庄', channel: 'shop', status: 'delivered', createdAt: '2026-07-27 12:07', supplierId: 'S012', trackingNo: 'EMS550001007', logistics: [{ time: '2026-07-27 12:07', title: '商家已发货', detail: '订单已由 邮政EMS 揽收' }, { time: '2026-07-27 12:10', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-27 12:48', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-27 12:45', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 3, price: 46 }] },
  { id: 'NJ202607281702', productName: '湘西农家伴手礼大礼包', quantity: 2, amount: 316, customer: '游客 · 刘女士', channel: 'shop', status: 'delivered', createdAt: '2026-07-28 17:02', supplierId: 'S005', trackingNo: 'SF1490001008', logistics: [{ time: '2026-07-28 17:02', title: '商家已发货', detail: '订单已由 顺丰速运 揽收' }, { time: '2026-07-28 17:47', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-28 17:48', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-28 17:26', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P022', skuId: 'P022-8', name: '湘西农家伴手礼大礼包', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 158 }] },
  { id: 'NJ202607281733', productName: '望城蔬果脆片 200g', quantity: 1, amount: 19.8, customer: '团长 · 衡山云姐', channel: 'live', status: 'delivered', createdAt: '2026-07-28 17:33', supplierId: 'S013', trackingNo: 'JDV1500001009', items: [{ productId: 'P049', skuId: 'P049-200', name: '望城蔬果脆片 200g', skuName: '200g', image: '/static/images/field.webp', quantity: 1, price: 19.8 }] },
  { id: 'NJ202607291837', productName: '麻阳冰糖橙 5kg礼盒', quantity: 3, amount: 247.8, customer: '长沙捞刀河渔家乐', channel: 'live', status: 'delivered', createdAt: '2026-07-29 18:37', supplierId: 'S025', items: [{ productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 2, price: 59.9 }, { productId: 'P010', skuId: 'P010-1', name: '安化黑茶 · 农家自藏', skuName: '礼盒装', image: '/static/images/tea.webp', quantity: 1, price: 128 }] },
  { id: 'NJ202607291457', productName: '武陵山野生土蜂蜜 500g', quantity: 2, amount: 176, customer: '衡山南岳农家乐', channel: 'live', status: 'delivered', createdAt: '2026-07-29 14:57', supplierId: 'S006', trackingNo: 'YD8840001010', logistics: [{ time: '2026-07-29 14:57', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-29 14:15', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-29 14:29', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-29 14:29', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }] },
  { id: 'NJ202607301917', productName: '武陵山野生土蜂蜜 500g', quantity: 2, amount: 176, customer: '团长 · 衡山云姐', channel: 'purchase', status: 'delivered', createdAt: '2026-07-30 19:17', supplierId: 'S006', trackingNo: 'YD8840001011', logistics: [{ time: '2026-07-30 19:17', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-07-30 19:43', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-30 19:06', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-30 19:07', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜 500g', skuName: '500g', image: '/static/images/honey.webp', quantity: 2, price: 88 }] },
  { id: 'NJ202607301510', productName: '民宿四件套床上用品', quantity: 2, amount: 178, customer: '云上人家山景农庄', channel: 'purchase', status: 'delivered', createdAt: '2026-07-30 15:10', supplierId: 'S005', trackingNo: 'ZT7230001012', logistics: [{ time: '2026-07-30 15:10', title: '商家已发货', detail: '订单已由 中通快递 揽收' }, { time: '2026-07-30 15:05', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-30 15:36', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-30 15:20', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 2, price: 89 }] },
  { id: 'NJ202607311634', productName: '民宿一次性凉拖 100双', quantity: 6, amount: 632, customer: '橘子洲畔农家院', channel: 'shop', status: 'delivered', createdAt: '2026-07-31 16:34', supplierId: 'S005', trackingNo: 'YT7750001013', logistics: [{ time: '2026-07-31 16:34', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-07-31 16:42', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-07-31 16:26', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-07-31 16:13', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P043', skuId: 'P043-100', name: '民宿一次性凉拖 100双', skuName: '100双/箱', image: '/static/images/field.webp', quantity: 2, price: 180 }, { productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 4, price: 68 }] },
  { id: 'NJ202607311856', productName: '湘莲莲子羹 400g', quantity: 3, amount: 138, customer: '团长 · 洞庭湖渔哥', channel: 'shop', status: 'delivered', createdAt: '2026-07-31 18:56', supplierId: 'S016', items: [{ productId: 'P050', skuId: 'P050-400', name: '湘莲莲子羹 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 46 }] },
  { id: 'NJ202608011306', productName: '洞庭湖风干刁子鱼 400g', quantity: 3, amount: 128.4, customer: '长沙捞刀河渔家乐', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 13:06', supplierId: 'S008', items: [{ productId: 'P016', skuId: 'P016-400', name: '洞庭湖风干刁子鱼 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 3, price: 42.8 }] },
  { id: 'NJ202608010857', productName: '商用保鲜膜 300米', quantity: 4, amount: 112, customer: '稻香村生态农庄', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 08:57', supplierId: 'S005', trackingNo: 'SF1490001014', items: [{ productId: 'P046', skuId: 'P046-300', name: '商用保鲜膜 300米', skuName: '300米/卷', image: '/static/images/field.webp', quantity: 4, price: 28 }] },
  { id: 'NJ202608010816', productName: '双峰辣酱 500g', quantity: 6, amount: 451.8, customer: '团长 · 湘农优选', channel: 'shop', status: 'delivered', createdAt: '2026-08-01 08:16', supplierId: 'S026', trackingNo: 'DB4320001015', logistics: [{ time: '2026-08-01 08:16', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-01 08:37', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-01 08:05', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-01 08:13', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P036', skuId: 'P036-500', name: '双峰辣酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }, { productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202608021854', productName: '湘西剁椒鱼头酱 500g', quantity: 4, amount: 119.6, customer: '橘子洲畔农家院', channel: 'live', status: 'delivered', createdAt: '2026-08-02 18:54', supplierId: 'S002', trackingNo: 'JDV1500001016', items: [{ productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 4, price: 29.9 }] },
  { id: 'NJ202608021520', productName: '平江香干 300g', quantity: 3, amount: 47.4, customer: '橘子洲畔农家院', channel: 'live', status: 'delivered', createdAt: '2026-08-02 15:20', supplierId: 'S019', trackingNo: 'DB4320001017', logistics: [{ time: '2026-08-02 15:20', title: '商家已发货', detail: '订单已由 德邦快递 揽收' }, { time: '2026-08-02 15:28', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-02 15:47', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-02 15:22', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 15.8 }] },
  { id: 'NJ202608021027', productName: '民宿一次性洗漱套装', quantity: 2, amount: 7, customer: '团长 · 山里阿强', channel: 'live', status: 'delivered', createdAt: '2026-08-02 10:27', supplierId: 'S005', trackingNo: 'YT7750001018', logistics: [{ time: '2026-08-02 10:27', title: '商家已发货', detail: '订单已由 圆通速递 揽收' }, { time: '2026-08-02 10:20', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-02 10:16', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-02 10:09', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P014', skuId: 'P014-100', name: '民宿一次性洗漱套装', skuName: '100套/箱', image: '/static/images/field.webp', quantity: 2, price: 3.5 }] },
  { id: 'NJ202608021514', productName: '安化黑茶 · 农家自藏', quantity: 2, amount: 187.9, customer: '游客 · 李女士', channel: 'purchase', status: 'delivered', createdAt: '2026-08-02 15:14', items: [{ productId: 'P010', skuId: 'P010-1', name: '安化黑茶 · 农家自藏', skuName: '礼盒装', image: '/static/images/tea.webp', quantity: 1, price: 128 }, { productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 1, price: 59.9 }] },
  { id: 'NJ202608031958', productName: '农家自制剁辣椒 2瓶', quantity: 3, amount: 119.7, customer: '邵阳崀山人家', channel: 'purchase', status: 'delivered', createdAt: '2026-08-03 19:58', trackingNo: 'YD8840001019', logistics: [{ time: '2026-08-03 19:58', title: '商家已发货', detail: '订单已由 韵达快递 揽收' }, { time: '2026-08-03 19:04', title: '运输中', detail: '包裹已到达长沙转运中心' }, { time: '2026-08-03 19:13', title: '派送中', detail: '快递员正在派送，请保持电话畅通' }, { time: '2026-08-03 19:10', title: '已签收', detail: '包裹已由本人签收，感谢使用' }], items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608031449', productName: '武冈卤香干 400g', quantity: 4, amount: 91.2, customer: '团长 · 苗家阿妹', channel: 'shop', status: 'delivered', createdAt: '2026-08-03 14:49', supplierId: 'S031', items: [{ productId: 'P034', skuId: 'P034-400', name: '武冈卤香干 400g', skuName: '400g', image: '/static/images/field.webp', quantity: 4, price: 22.8 }] },
  { id: 'NJ202608030831', productName: '山景民宿一晚券', quantity: 1, amount: 268, customer: '石板溪农家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 08:31', items: [{ productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 1, price: 268 }] },
  { id: 'NJ202608031951', productName: '农家四人欢聚套餐券', quantity: 2, amount: 347.9, customer: '常德柳叶湖荷香农庄', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 19:51', trackingNo: 'YD8840001020', items: [{ productId: 'P007', skuId: 'P007-4P', name: '农家四人欢聚套餐券', skuName: '四人套餐券', image: '/static/images/farmhouse.webp', quantity: 1, price: 288 }, { productId: 'P025', skuId: 'P025-5K', name: '麻阳冰糖橙 5kg礼盒', skuName: '5kg礼盒', image: '/static/images/peach.webp', quantity: 1, price: 59.9 }] },
  { id: 'NJ202608030902', productName: '望城富硒米 10kg', quantity: 2, amount: 178, customer: '团长 · 湘农优选', channel: 'shop', status: 'shipping', createdAt: '2026-08-03 09:02', supplierId: 'S013', trackingNo: 'DB4320001021', items: [{ productId: 'P060', skuId: 'P060-10K', name: '望城富硒米 10kg', skuName: '10kg', image: '/static/images/rice.webp', quantity: 2, price: 89 }] },
  { id: 'NJ202608041934', productName: '亲子研学半日券', quantity: 2, amount: 196, customer: '石板溪农家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-04 19:34', trackingNo: 'SF1490001022', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 2, price: 98 }] },
  { id: 'NJ202608041938', productName: '古丈毛尖礼盒', quantity: 2, amount: 276, customer: '游客 · 李女士', channel: 'live', status: 'shipping', createdAt: '2026-08-04 19:38', supplierId: 'S027', items: [{ productId: 'P042', skuId: 'P042-250', name: '古丈毛尖礼盒', skuName: '250g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 138 }] },
  { id: 'NJ202608041912', productName: '湘绣团扇伴手礼', quantity: 6, amount: 350.4, customer: '团长 · 苗家阿妹', channel: 'live', status: 'shipping', createdAt: '2026-08-04 19:12', supplierId: 'S016', items: [{ productId: 'P052', skuId: 'P052-1', name: '湘绣团扇伴手礼', skuName: '单把装', image: '/static/images/field.webp', quantity: 3, price: 88 }, { productId: 'P029', skuId: 'P029-500', name: '祁东黄花菜 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 3, price: 28.8 }] },
  { id: 'NJ202608050907', productName: '宝庆糯米甜酒 2L坛装', quantity: 1, amount: 46, customer: '郴州东江湖人家', channel: 'live', status: 'shipping', createdAt: '2026-08-05 09:07', supplierId: 'S012', trackingNo: 'YD8840001023', items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 1, price: 46 }] },
  { id: 'NJ202608051756', productName: '祁东黄花菜 500g', quantity: 4, amount: 115.2, customer: '石板溪农家乐', channel: 'purchase', status: 'shipping', createdAt: '2026-08-05 17:56', supplierId: 'S017', items: [{ productId: 'P029', skuId: 'P029-500', name: '祁东黄花菜 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 4, price: 28.8 }] },
  { id: 'NJ202608050803', productName: '山泉土鸡汤礼盒', quantity: 2, amount: 216, customer: '团长 · 岳阳小龙虾哥', channel: 'purchase', status: 'shipping', createdAt: '2026-08-05 08:03', trackingNo: 'DB4320001024', items: [{ productId: 'P011', skuId: 'P011-1', name: '山泉土鸡汤礼盒', skuName: '2只装', image: '/static/images/farmhouse.webp', quantity: 2, price: 108 }] },
  { id: 'NJ202608061158', productName: '浏阳蒸火焙鱼 300g', quantity: 7, amount: 253.6, customer: '岳阳洞庭渔村', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 11:58', supplierId: 'S014', items: [{ productId: 'P031', skuId: 'P031-300', name: '浏阳蒸火焙鱼 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 4, price: 38.8 }, { productId: 'P027', skuId: 'P027-5J', name: '江永香芋 5斤装', skuName: '5斤装', image: '/static/images/field.webp', quantity: 3, price: 32.8 }] },
  { id: 'NJ202608061224', productName: '亲子研学半日券', quantity: 4, amount: 392, customer: '长沙捞刀河渔家乐', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 12:24', trackingNo: 'ZT7230001025', items: [{ productId: 'P054', skuId: 'P054-2', name: '亲子研学半日券', skuName: '1大1小', image: '/static/images/field.webp', quantity: 4, price: 98 }] },
  { id: 'NJ202608061220', productName: '竹纤维浴巾 20条', quantity: 2, amount: 500, customer: '团长 · 茶香小妹', channel: 'shop', status: 'shipping', createdAt: '2026-08-06 12:20', supplierId: 'S005', trackingNo: 'ZT7230001026', items: [{ productId: 'P044', skuId: 'P044-20', name: '竹纤维浴巾 20条', skuName: '20条/箱', image: '/static/images/field.webp', quantity: 2, price: 250 }] },
  { id: 'NJ202608070836', productName: '山景民宿一晚券', quantity: 1, amount: 268, customer: '怀化侗乡渔寨', channel: 'shop', status: 'shipping', createdAt: '2026-08-07 08:36', items: [{ productId: 'P055', skuId: 'P055-1', name: '山景民宿一晚券', skuName: '1晚', image: '/static/images/mountain.webp', quantity: 1, price: 268 }] },
  { id: 'NJ202608071039', productName: '桑植土蜂蜜 1kg', quantity: 5, amount: 191.2, customer: '常德柳叶湖荷香农庄', channel: 'shop', status: 'shipping', createdAt: '2026-08-07 10:39', supplierId: 'S034', items: [{ productId: 'P047', skuId: 'P047-1K', name: '桑植土蜂蜜 1kg', skuName: '1kg', image: '/static/images/honey.webp', quantity: 1, price: 128 }, { productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 4, price: 15.8 }] },
  { id: 'NJ202608070928', productName: '永州米粉干 2kg', quantity: 3, amount: 80.4, customer: '团长 · 张同学', channel: 'live', status: 'shipping', createdAt: '2026-08-07 09:28', supplierId: 'S036', items: [{ productId: 'P038', skuId: 'P038-2K', name: '永州米粉干 2kg', skuName: '2kg', image: '/static/images/field.webp', quantity: 3, price: 26.8 }] },
  { id: 'NJ202608081904', productName: '民宿四件套床上用品', quantity: 3, amount: 267, customer: '云上人家山景农庄', channel: 'live', status: 'pending', createdAt: '2026-08-08 19:04', supplierId: 'S005', items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 3, price: 89 }] },
  { id: 'NJ202608081249', productName: '麻阳猕猴桃汁 6瓶', quantity: 3, amount: 119.7, customer: '石板溪农家乐', channel: 'live', status: 'pending', createdAt: '2026-08-08 12:49', supplierId: 'S025', items: [{ productId: 'P056', skuId: 'P056-6', name: '麻阳猕猴桃汁 6瓶', skuName: '6瓶装', image: '/static/images/field.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608080934', productName: '张家界莓茶礼盒', quantity: 4, amount: 652, customer: '团长 · 辣妹子', channel: 'purchase', status: 'pending', createdAt: '2026-08-08 09:34', supplierId: 'S021', items: [{ productId: 'P040', skuId: 'P040-200', name: '张家界莓茶礼盒', skuName: '200g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 168 }, { productId: 'P022', skuId: 'P022-8', name: '湘西农家伴手礼大礼包', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 158 }] },
  { id: 'NJ202608080837', productName: '平江香干 300g', quantity: 3, amount: 47.4, customer: '游客 · 李女士', channel: 'purchase', status: 'pending', createdAt: '2026-08-08 08:37', supplierId: 'S019', items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 3, price: 15.8 }] },
  { id: 'NJ202608081036', productName: '湘西柴火腊肉真空装', quantity: 1, amount: 68, customer: '岳阳洞庭渔村', channel: 'shop', status: 'pending', createdAt: '2026-08-08 10:36', items: [{ productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 1, price: 68 }] },
  { id: 'NJ202608091500', productName: '湖南特产八件套', quantity: 2, amount: 336, customer: '团长 · 岳阳小龙虾哥', channel: 'shop', status: 'pending', createdAt: '2026-08-09 15:00', supplierId: 'S014', items: [{ productId: 'P051', skuId: 'P051-8', name: '湖南特产八件套', skuName: '8件装', image: '/static/images/farmhouse.webp', quantity: 2, price: 168 }] },
  { id: 'NJ202608090803', productName: '湘西柴火腊肉真空装', quantity: 6, amount: 331.8, customer: '石板溪农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-09 08:03', items: [{ productId: 'P012', skuId: 'P012-1', name: '湘西柴火腊肉真空装', skuName: '500g', image: '/static/images/bacon.webp', quantity: 4, price: 68 }, { productId: 'P018', skuId: 'P018-500', name: '湘西剁椒鱼头酱 500g', skuName: '500g', image: '/static/images/chili.webp', quantity: 2, price: 29.9 }] },
  { id: 'NJ202608091348', productName: '民宿四件套床上用品', quantity: 3, amount: 267, customer: '衡山南岳农家乐', channel: 'shop', status: 'pending', createdAt: '2026-08-09 13:48', supplierId: 'S005', items: [{ productId: 'P024', skuId: 'P024-1', name: '民宿四件套床上用品', skuName: '四件套', image: '/static/images/field.webp', quantity: 3, price: 89 }] },
  { id: 'NJ202608090937', productName: '耒阳红薯粉 1kg', quantity: 3, amount: 59.7, customer: '团长 · 土家幺妹', channel: 'shop', status: 'pending', createdAt: '2026-08-09 09:37', supplierId: 'S030', items: [{ productId: 'P037', skuId: 'P037-1K', name: '耒阳红薯粉 1kg', skuName: '1kg', image: '/static/images/field.webp', quantity: 3, price: 19.9 }] },
  { id: 'NJ202608091559', productName: '东江鱼仔香辣味 200g', quantity: 1, amount: 32.8, customer: '常德柳叶湖荷香农庄', channel: 'live', status: 'pending', createdAt: '2026-08-09 15:59', items: [{ productId: 'P008', skuId: 'P008-200', name: '东江鱼仔香辣味 200g', skuName: '200g', image: '/static/images/field.webp', quantity: 1, price: 32.8 }] },
  { id: 'NJ202608101841', productName: '民宿一次性凉拖 100双', quantity: 5, amount: 444, customer: '游客 · 王先生', channel: 'live', status: 'pending', createdAt: '2026-08-10 18:41', supplierId: 'S005', items: [{ productId: 'P043', skuId: 'P043-100', name: '民宿一次性凉拖 100双', skuName: '100双/箱', image: '/static/images/field.webp', quantity: 2, price: 180 }, { productId: 'P046', skuId: 'P046-300', name: '商用保鲜膜 300米', skuName: '300米/卷', image: '/static/images/field.webp', quantity: 3, price: 28 }] },
  { id: 'NJ202608101312', productName: '古丈蒿子粑粑 6个装', quantity: 1, amount: 22.8, customer: '团长 · 岳阳小龙虾哥', channel: 'live', status: 'pending', createdAt: '2026-08-10 13:12', supplierId: 'S027', items: [{ productId: 'P048', skuId: 'P048-6', name: '古丈蒿子粑粑 6个装', skuName: '6个装', image: '/static/images/field.webp', quantity: 1, price: 22.8 }] },
  { id: 'NJ202608101724', productName: '临武鸭蛋 20枚', quantity: 4, amount: 128, customer: '衡山南岳农家乐', channel: 'purchase', status: 'pending', createdAt: '2026-08-10 17:24', supplierId: 'S023', items: [{ productId: 'P059', skuId: 'P059-20', name: '临武鸭蛋 20枚', skuName: '20枚', image: '/static/images/farmhouse.webp', quantity: 4, price: 32 }] },
  { id: 'NJ202608101149', productName: '湘西烟熏柴火腊肉 500g', quantity: 3, amount: 179.7, customer: '云上人家山景农庄', channel: 'purchase', status: 'pending', createdAt: '2026-08-10 11:49', supplierId: 'S002', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 3, price: 59.9 }] },
  { id: 'NJ202608101542', productName: '君山银针礼盒', quantity: 3, amount: 571, customer: '团长 · 湘农优选', channel: 'shop', status: 'pending', createdAt: '2026-08-10 15:42', supplierId: 'S032', items: [{ productId: 'P041', skuId: 'P041-250', name: '君山银针礼盒', skuName: '250g礼盒', image: '/static/images/tea.webp', quantity: 2, price: 198 }, { productId: 'P045', skuId: 'P045-500', name: '牛皮纸打包袋 ×500', skuName: '500只/箱', image: '/static/images/field.webp', quantity: 1, price: 175 }] },
  { id: 'NJ202608111521', productName: '南县稻虾米 5kg', quantity: 2, amount: 119.8, customer: '岳阳洞庭渔村', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 15:21', supplierId: 'S022', items: [{ productId: 'P030', skuId: 'P030-5K', name: '南县稻虾米 5kg', skuName: '5kg', image: '/static/images/rice.webp', quantity: 2, price: 59.9 }] },
  { id: 'NJ202608110926', productName: '农家自制剁辣椒 2瓶', quantity: 3, amount: 119.7, customer: '怀化侗乡渔寨', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 09:26', trackingNo: 'YT7750001027', items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 3, price: 39.9 }] },
  { id: 'NJ202608111718', productName: '宝庆糯米甜酒 2L坛装', quantity: 4, amount: 184, customer: '团长 · 洞庭湖渔哥', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 17:18', supplierId: 'S012', items: [{ productId: 'P021', skuId: 'P021-2L', name: '宝庆糯米甜酒 2L坛装', skuName: '2L坛装', image: '/static/images/field.webp', quantity: 4, price: 46 }] },
  { id: 'NJ202608111646', productName: '平江香干 300g', quantity: 6, amount: 214.8, customer: '炎陵云溪农庄', channel: 'shop', status: 'after-sale', createdAt: '2026-08-11 16:46', supplierId: 'S019', items: [{ productId: 'P033', skuId: 'P033-300', name: '平江香干 300g', skuName: '300g', image: '/static/images/field.webp', quantity: 2, price: 15.8 }, { productId: 'P028', skuId: 'P028-5K', name: '石门柑橘 5kg', skuName: '5kg', image: '/static/images/peach.webp', quantity: 4, price: 45.8 }] },
{ id: 'NJ202608121952', productName: '沅江芦笋 500g', quantity: 1, amount: 24.9, customer: '郴州东江湖人家', channel: 'live', status: 'after-sale', createdAt: '2026-08-12 19:52', supplierId: 'S035', items: [{ productId: 'P039', skuId: 'P039-500', name: '沅江芦笋 500g', skuName: '500g', image: '/static/images/field.webp', quantity: 1, price: 24.9 }] },
]

export const pricePolicies: PricePolicy[] = [
  { id: 'R001', name: '全平台分销价', type: 'group', scope: '全部门店', discount: 18, enabled: true },
  { id: 'R002', name: '腊味阶梯采购', type: 'ladder', scope: '腊味类商品', discount: 24, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 42, discountOff: 30 },
    { minQty: 50, maxQty: 199, price: 39, discountOff: 35 },
    { minQty: 200, maxQty: 499, price: 37, discountOff: 38 },
    { minQty: 500, maxQty: null, price: 35, discountOff: 42 }
  ] },
  { id: 'R005', name: '生鲜果蔬分销价', type: 'group', scope: '生鲜类目', discount: 12, enabled: true },
  { id: 'R006', name: '餐具耗材阶梯价', type: 'ladder', scope: '打包/耗材类', discount: 20, enabled: true, tiers: [
    { minQty: 1, maxQty: 99, price: 1.2, discountOff: 15 },
    { minQty: 100, maxQty: 499, price: 1, discountOff: 25 },
    { minQty: 500, maxQty: null, price: 0.8, discountOff: 35 }
  ] },
  { id: 'R009', name: '蜂蜜/土特产阶梯价', type: 'ladder', scope: '蜂蜜/土特产类目', discount: 15, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 88, discountOff: 10 },
    { minQty: 50, maxQty: 199, price: 82, discountOff: 16 },
    { minQty: 200, maxQty: null, price: 78, discountOff: 20 }
  ] },
  { id: 'R012', name: '茶酒礼盒分销价', type: 'group', scope: '茶酒礼盒类目', discount: 15, enabled: true },
  { id: 'R013', name: '农产品分销价', type: 'group', scope: '农产品类目', discount: 10, enabled: true },
  { id: 'R014', name: '预制菜阶梯价', type: 'ladder', scope: '预制菜类目', discount: 18, enabled: true, tiers: [
    { minQty: 1, maxQty: 99, price: 38.8, discountOff: 15 },
    { minQty: 100, maxQty: 499, price: 35.5, discountOff: 22 },
    { minQty: 500, maxQty: null, price: 33, discountOff: 28 }
  ] },
  { id: 'R017', name: '民宿耗材分销价', type: 'group', scope: '民宿耗材类目', discount: 12, enabled: true },
  { id: 'R018', name: '土特产阶梯价', type: 'ladder', scope: '土特产类目', discount: 16, enabled: true, tiers: [
    { minQty: 1, maxQty: 49, price: 42.8, discountOff: 10 },
    { minQty: 50, maxQty: 199, price: 39.9, discountOff: 16 },
    { minQty: 200, maxQty: null, price: 36.5, discountOff: 23 }
  ] },
  { id: 'R021', name: '门店分销价', type: 'group', scope: '全部门店订货端商品', discount: 0, enabled: true },
  { id: 'R022', name: '业务员分销价', type: 'group', scope: '业务员 A / B / C 档', discount: 0, enabled: true }
]

export const afterSales: AfterSale[] = [
  { id: 'SH20582', orderId: 'NJ202608110928', productName: '黄桃礼盒', applicant: '石板溪农家乐', type: 'reship', amount: 136, status: 'processing', issue: '运输破损 2 盒', quantity: 2, image: '/static/images/peach.webp' },
  { id: 'SH20577', orderId: 'NJ202608110851', productName: '黑茶礼盒', applicant: '团长订单', type: 'refund', amount: 128, status: 'processing', issue: '客户七天无理由', quantity: 1, image: '/static/images/tea.webp' },
  { id: 'SH20561', orderId: 'NJ202608110915', productName: '柴火腊肉', applicant: '云上人家山景农庄', type: 'claim', amount: 59.9, status: 'refunded', issue: '质量问题理赔', quantity: 5, image: '/static/images/bacon.webp', refundAmount: 59.9, refundMethod: 'only', refundMode: 'full' },
  { id: 'SH20590', orderId: 'NJ202608120851', productName: '四人套餐券', applicant: '团长订单', type: 'claim', amount: 864, status: 'processing', issue: '到店核销人数不符', quantity: 3, image: '/static/images/farmhouse.webp', history: [{ time: '2026-08-12 09:12', action: '提交理赔申请', operator: '推客 · 湘农优选' }] },
  { id: 'SH20588', orderId: 'NJ202608120958', productName: '洞庭湖风干刁子鱼', applicant: '团长订单', type: 'reship', amount: 428, status: 'processing', issue: '运输破损 2 袋', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-08-12 10:05', action: '提交补发申请', operator: '推客 · 苗家阿妹' }] },
  { id: 'SH20585', orderId: 'NJ202608120918', productName: '剁辣椒', applicant: '橘子洲畔农家院', type: 'refund', amount: 798, status: 'processing', issue: '口感风味不符', quantity: 8, image: '/static/images/chili.webp', refundAmount: 239.4, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-12 09:30', action: '申请部分退款', operator: '橘子洲畔农家院' }] },
  { id: 'SH20583', orderId: 'NJ202608120842', productName: '土鸡汤礼盒', applicant: '韶山红色记忆农庄', type: 'refund', amount: 432, status: 'processing', issue: '七天无理由', quantity: 4, image: '/static/images/farmhouse.webp', history: [{ time: '2026-08-12 09:02', action: '提交退款申请', operator: '韶山红色记忆农庄' }] },
  { id: 'SH20580', orderId: 'NJ202608121030', productName: '柴火腊肉', applicant: '石板溪农家乐', type: 'claim', amount: 359.4, status: 'processing', issue: '物流延误理赔', quantity: 6, image: '/static/images/bacon.webp', refundAmount: 119.8, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-12 10:45', action: '提交理赔申请', operator: '石板溪农家乐' } ] },
  { id: 'SH20601', orderId: 'NJ202608111521', productName: '南县稻虾米', responsibleSupplierId: 'S022', applicant: '岳阳洞庭渔村', type: 'reship', amount: 119.8, status: 'processing', issue: '少发漏发', quantity: 2, image: '/static/images/rice.webp', history: [{ time: '2026-08-11 15:21', action: '提交补发申请', operator: '岳阳洞庭渔村' }] },
  { id: 'SH20602', orderId: 'NJ202608110926', productName: '农家自制剁辣椒', applicant: '怀化侗乡渔寨', type: 'claim', amount: 119.7, status: 'processing', issue: '质量问题', quantity: 3, image: '/static/images/chili.webp', history: [{ time: '2026-08-11 09:26', action: '提交理赔申请', operator: '怀化侗乡渔寨' }] },
  { id: 'SH20603', orderId: 'NJ202608111718', productName: '宝庆糯米甜酒', applicant: '团长订单', type: 'refund', amount: 184, status: 'refunded', issue: '口感风味不符', quantity: 4, image: '/static/images/field.webp', refundAmount: 55.2, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-08-11 17:18', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20604', orderId: 'NJ202608111646', productName: '平江香干', applicant: '炎陵云溪农庄', type: 'refund', amount: 214.8, status: 'processing', issue: '七天无理由', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-08-11 16:46', action: '提交退款申请', operator: '炎陵云溪农庄' }] },
  { id: 'SH20605', orderId: 'NJ202608121952', productName: '沅江芦笋', applicant: '郴州东江湖人家', type: 'refund', amount: 24.9, status: 'processing', issue: '客户取消', quantity: 1, image: '/static/images/field.webp', history: [{ time: '2026-08-12 19:52', action: '提交退款申请', operator: '郴州东江湖人家' }] },
  { id: 'SH20606', orderId: 'NJ202607201600', productName: '宝庆糯米甜酒', applicant: '岳阳洞庭渔村', type: 'claim', amount: 184, status: 'refunded', issue: '其他', quantity: 4, image: '/static/images/field.webp', refundAmount: 55.2, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-20 16:00', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20607', orderId: 'NJ202607201109', productName: '麻阳猕猴桃汁', responsibleSupplierId: 'S025', applicant: '岳阳洞庭渔村', type: 'reship', amount: 159.6, status: 'processing', issue: '运输破损', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-20 11:09', action: '提交补发申请', operator: '岳阳洞庭渔村' }] },
  { id: 'SH20608', orderId: 'NJ202607211215', productName: '白关丝瓜', responsibleSupplierId: 'S015', applicant: '团长订单', type: 'reship', amount: 39.8, status: 'processing', issue: '少发漏发', quantity: 2, image: '/static/images/field.webp', history: [{ time: '2026-07-21 12:15', action: '提交补发申请', operator: '推客订单' }] },
  { id: 'SH20609', orderId: 'NJ202607211740', productName: '宁乡花猪腊肠', responsibleSupplierId: 'S009', applicant: '橘子洲畔农家院', type: 'claim', amount: 691.2, status: 'refunded', issue: '质量问题', quantity: 4, image: '/static/images/bacon.webp', refundAmount: 207.4, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-21 17:40', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20610', orderId: 'NJ202607221134', productName: '石门柑橘', applicant: '云上人家山景农庄', type: 'refund', amount: 91.6, status: 'processing', issue: '口感风味不符', quantity: 2, image: '/static/images/peach.webp', history: [{ time: '2026-07-22 11:34', action: '提交退款申请', operator: '云上人家山景农庄' }] },
  { id: 'SH20611', orderId: 'NJ202607220823', productName: '靖州杨梅干', applicant: '团长订单', type: 'refund', amount: 107.2, status: 'processing', issue: '七天无理由', quantity: 4, image: '/static/images/peach.webp', history: [{ time: '2026-07-22 08:23', action: '提交退款申请', operator: '推客订单' }] },
  { id: 'SH20612', orderId: 'NJ202607231022', productName: '竹纤维浴巾', applicant: '游客 · 李女士', type: 'refund', amount: 500, status: 'refunded', issue: '客户取消', quantity: 2, image: '/static/images/field.webp', refundAmount: 150, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-23 10:22', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20613', orderId: 'NJ202607240956', productName: '湘莲莲子羹', applicant: '怀化侗乡渔寨', type: 'claim', amount: 300.4, status: 'processing', issue: '其他', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-24 09:56', action: '提交理赔申请', operator: '怀化侗乡渔寨' }] },
  { id: 'SH20614', orderId: 'NJ202607240808', productName: '湘西剁椒鱼头酱', responsibleSupplierId: 'S002', applicant: '团长订单', type: 'reship', amount: 59.8, status: 'processing', issue: '运输破损', quantity: 2, image: '/static/images/chili.webp', history: [{ time: '2026-07-24 08:08', action: '提交补发申请', operator: '推客订单' }] },
  { id: 'SH20615', orderId: 'NJ202607251625', productName: '亲子研学半日券', applicant: '炎陵云溪农庄', type: 'reship', amount: 392, status: 'refunded', issue: '少发漏发', quantity: 4, image: '/static/images/field.webp', refundAmount: 117.6, refundMethod: 'only', refundMode: 'ratio', history: [{ time: '2026-07-25 16:25', action: '处理完成，退款到账', operator: '运营管理员' }] },
  { id: 'SH20616', orderId: 'NJ202607250843', productName: '洞庭湖风干刁子鱼', responsibleSupplierId: 'S008', applicant: '韶山红色记忆农庄', type: 'claim', amount: 128.4, status: 'processing', issue: '质量问题', quantity: 3, image: '/static/images/field.webp', history: [{ time: '2026-07-25 08:43', action: '提交理赔申请', operator: '韶山红色记忆农庄' }] },
{ id: 'SH20617', orderId: 'NJ202607261435', productName: '亲子研学半日券', applicant: '团长订单', type: 'refund', amount: 490, status: 'processing', issue: '口感风味不符', quantity: 4, image: '/static/images/field.webp', history: [{ time: '2026-07-26 14:35', action: '提交退款申请', operator: '推客订单' }] },
]

export const promoters: Promoter[] = [
  { id: 'T001', name: '张同学', region: '湘西州', level: '黄金', type: '业务员', fans: 326, orders: 142, gmv: 86420, commission: 2486.5, cumulativeCommission: 18920, settled: false, status: 'active' },
  { id: 'T002', name: '山里阿强', region: '张家界市', level: '白银', type: '业务员', fans: 0, orders: 286, gmv: 124800, commission: 14976, settled: false, status: 'active' },
  { id: 'T003', name: '湘农优选', region: '长沙市', level: '青铜', type: '业务员', fans: 198, orders: 96, gmv: 48200, commission: 6748, settled: false, status: 'active' },
  { id: 'T004', name: '乡村小李', region: '常德市', level: '白银', type: '业务员', fans: 142, orders: 58, gmv: 32600, commission: 3912, settled: true, status: 'active' },
  { id: 'T005', name: '茶香小妹', region: '益阳市', level: '黄金', type: '业务员', fans: 286, orders: 168, gmv: 68900, commission: 4120, cumulativeCommission: 28600, settled: false, status: 'active' },
  { id: 'T006', name: '腊味老李', region: '湘西州', level: '白银', type: '业务员', fans: 96, orders: 74, gmv: 32600, commission: 1580, cumulativeCommission: 12600, settled: true, status: 'active' },
  { id: 'T007', name: '苗家阿妹', region: '邵阳市', level: '青铜', type: '业务员', fans: 420, orders: 132, gmv: 92000, commission: 5200, cumulativeCommission: 39800, settled: false, status: 'active' },
  { id: 'T008', name: '溪谷骑行客', region: '怀化市', level: '青铜', type: '业务员', fans: 58, orders: 40, gmv: 16800, commission: 720, cumulativeCommission: 3200, settled: false, status: 'active' },
  { id: 'T009', name: '土家幺妹', region: '张家界市', level: '白银', type: '业务员', fans: 1500, orders: 320, gmv: 156000, commission: 9860, cumulativeCommission: 76200, settled: false, status: 'active' },
  { id: 'T010', name: '果园大叔', region: '株洲市', level: '白银', type: '业务员', fans: 132, orders: 88, gmv: 41200, commission: 2100, cumulativeCommission: 15400, settled: true, status: 'active' },
  { id: 'T011', name: '板栗哥', region: '岳阳市', level: '青铜', type: '业务员', fans: 64, orders: 26, gmv: 11800, commission: 560, cumulativeCommission: 1800, settled: false, status: 'active' },
  { id: 'T012', name: '辣妹子', region: '长沙市', level: '白银', type: '业务员', fans: 680, orders: 150, gmv: 72000, commission: 8260, cumulativeCommission: 38600, settled: false, status: 'active' },
  { id: 'T013', name: '山货老王', region: '郴州市', level: '白银', type: '业务员', fans: 88, orders: 36, gmv: 15800, commission: 620, cumulativeCommission: 4600, settled: true, status: 'paused' },
  { id: 'T014', name: '土菜一姐', region: '衡阳市', level: '青铜', type: '业务员', fans: 260, orders: 84, gmv: 38600, commission: 3120, cumulativeCommission: 21800, settled: false, status: 'active' },
  { id: 'T015', name: '竹笋妹', region: '益阳市', level: '黄金', type: '业务员', fans: 214, orders: 96, gmv: 44800, commission: 2860, cumulativeCommission: 16900, settled: false, status: 'active' },
  { id: 'T016', name: '洞庭湖渔哥', region: '岳阳市', level: '白银', type: '业务员', fans: 168, orders: 62, gmv: 28600, commission: 1960, cumulativeCommission: 11200, settled: false, status: 'active' },
  { id: 'T017', name: '橘子洲头阿明', region: '长沙市', level: '青铜', type: '业务员', fans: 72, orders: 32, gmv: 12600, commission: 610, cumulativeCommission: 2400, settled: true, status: 'active' },
  { id: 'T018', name: '湘西米酒妹', region: '湘西州', level: '黄金', type: '业务员', fans: 312, orders: 148, gmv: 68200, commission: 4520, cumulativeCommission: 31800, settled: false, status: 'active' },
  { id: 'T019', name: '茶园春晓', region: '娄底市', level: '白银', type: '业务员', fans: 820, orders: 210, gmv: 98000, commission: 11200, cumulativeCommission: 52400, settled: false, status: 'active' },
  { id: 'T020', name: '高山银针姐', region: '益阳市', level: '青铜', type: '业务员', fans: 356, orders: 118, gmv: 52600, commission: 4860, cumulativeCommission: 22600, settled: false, status: 'active' },
  { id: 'T021', name: '桃花源小张', region: '常德市', level: '白银', type: '业务员', fans: 118, orders: 52, gmv: 23800, commission: 1240, cumulativeCommission: 6800, settled: true, status: 'active' },
  { id: 'T022', name: '醴陵烟花哥', region: '株洲市', level: '青铜', type: '业务员', fans: 46, orders: 24, gmv: 9800, commission: 480, cumulativeCommission: 1600, settled: false, status: 'active' },
  { id: 'T023', name: '衡山云姐', region: '衡阳市', level: '青铜', type: '业务员', fans: 268, orders: 94, gmv: 43800, commission: 3680, cumulativeCommission: 19200, settled: false, status: 'active' },
  { id: 'T024', name: '郴州雾漫姑娘', region: '郴州市', level: '黄金', type: '业务员', fans: 298, orders: 132, gmv: 58600, commission: 3960, cumulativeCommission: 25400, settled: false, status: 'active' },
  { id: 'T025', name: '永州香芋哥', region: '永州市', level: '白银', type: '业务员', fans: 132, orders: 58, gmv: 26400, commission: 1480, cumulativeCommission: 7200, settled: true, status: 'active' },
  { id: 'T026', name: '怀化侗家阿妹', region: '怀化市', level: '青铜', type: '业务员', fans: 64, orders: 30, gmv: 13200, commission: 650, cumulativeCommission: 2800, settled: false, status: 'active' },
  { id: 'T027', name: '娄底辣酱哥', region: '娄底市', level: '黄金', type: '业务员', fans: 286, orders: 126, gmv: 54600, commission: 3740, cumulativeCommission: 19800, settled: false, status: 'active' },
  { id: 'T028', name: '岳阳小龙虾哥', region: '岳阳市', level: '白银', type: '业务员', fans: 640, orders: 168, gmv: 82600, commission: 9360, cumulativeCommission: 42800, settled: false, status: 'active' },
  { id: 'T029', name: '常德柳叶姐', region: '常德市', level: '白银', type: '业务员', fans: 148, orders: 68, gmv: 29800, commission: 1680, cumulativeCommission: 8600, settled: false, status: 'active' },
  { id: 'T030', name: '益阳竹艺匠人', region: '益阳市', level: '青铜', type: '业务员', fans: 226, orders: 82, gmv: 38600, commission: 3260, cumulativeCommission: 14600, settled: false, status: 'paused' }
]

export const commissionSettlements: CommissionSettlementRecord[] = [
  { id: 'CS20260808', promoterIds: ['T001', 'T002', 'T003', 'T005', 'T009'], amount: 38190.5, createdAt: '2026-08-08 10:00', items: [
    { promoterId: 'T001', promoterName: '张同学', amount: 2486.5 },
    { promoterId: 'T002', promoterName: '山里阿强', amount: 14976 },
    { promoterId: 'T003', promoterName: '湘农优选', amount: 6748 },
    { promoterId: 'T005', promoterName: '茶香小妹', amount: 4120 },
    { promoterId: 'T009', promoterName: '土家幺妹', amount: 9860 }
  ] },
  { id: 'CS20260801', promoterIds: ['T004', 'T007'], amount: 9112, createdAt: '2026-08-01 10:00', items: [
    { promoterId: 'T004', promoterName: '乡村小李', amount: 3912 },
    { promoterId: 'T007', promoterName: '苗家阿妹', amount: 5200 }
  ] },
  { id: 'CS20260725', promoterIds: ['T006', 'T008', 'T010'], amount: 4400, createdAt: '2026-07-25 10:00', items: [
    { promoterId: 'T006', promoterName: '腊味老李', amount: 1580 },
    { promoterId: 'T008', promoterName: '溪谷骑行客', amount: 720 },
    { promoterId: 'T010', promoterName: '果园大叔', amount: 2100 }
  ] },
  { id: 'CS20260730', promoterIds: ['T004', 'T011'], amount: 4472, createdAt: '2026-07-30 10:00', items: [
    { promoterId: 'T004', promoterName: '乡村小李', amount: 3912 },
    { promoterId: 'T011', promoterName: '板栗哥', amount: 560 }
  ] },
  { id: 'CS20260802', promoterIds: ['T017', 'T022'], amount: 1090, createdAt: '2026-08-02 10:00', items: [
    { promoterId: 'T017', promoterName: '橘子洲头阿明', amount: 610 },
    { promoterId: 'T022', promoterName: '醴陵烟花哥', amount: 480 }
  ] },
  { id: 'CS20260804', promoterIds: ['T011', 'T013', 'T030'], amount: 4440, createdAt: '2026-08-04 10:00', items: [
    { promoterId: 'T011', promoterName: '板栗哥', amount: 560 },
    { promoterId: 'T013', promoterName: '山货老王', amount: 620 },
    { promoterId: 'T030', promoterName: '益阳竹艺匠人', amount: 3260 }
  ] },
  { id: 'CS20260806', promoterIds: ['T015', 'T021', 'T025'], amount: 5580, createdAt: '2026-08-06 10:00', items: [
    { promoterId: 'T015', promoterName: '竹笋妹', amount: 2860 },
    { promoterId: 'T021', promoterName: '桃花源小张', amount: 1240 },
    { promoterId: 'T025', promoterName: '永州香芋哥', amount: 1480 }
  ] },
  { id: 'CS20260807', promoterIds: ['T029', 'T026'], amount: 2330, createdAt: '2026-08-07 10:00', items: [
    { promoterId: 'T029', promoterName: '常德柳叶姐', amount: 1680 },
    { promoterId: 'T026', promoterName: '怀化侗家阿妹', amount: 650 }
  ] },
  { id: 'CS20260809', promoterIds: ['T016', 'T018', 'T023', 'T027'], amount: 13900, createdAt: '2026-08-09 10:00', items: [
    { promoterId: 'T016', promoterName: '洞庭湖渔哥', amount: 1960 },
    { promoterId: 'T018', promoterName: '湘西米酒妹', amount: 4520 },
    { promoterId: 'T023', promoterName: '衡山云姐', amount: 3680 },
    { promoterId: 'T027', promoterName: '娄底辣酱哥', amount: 3740 }
  ] },
  { id: 'CS20260811', promoterIds: ['T012', 'T019', 'T020', 'T024', 'T028'], amount: 37640, createdAt: '2026-08-11 10:00', items: [
    { promoterId: 'T012', promoterName: '辣妹子', amount: 8260 },
    { promoterId: 'T019', promoterName: '茶园春晓', amount: 11200 },
    { promoterId: 'T020', promoterName: '高山银针姐', amount: 4860 },
    { promoterId: 'T024', promoterName: '郴州雾漫姑娘', amount: 3960 },
    { promoterId: 'T028', promoterName: '岳阳小龙虾哥', amount: 9360 }
  ] }
]

export const supplierSettlements: SupplierSettlementRecord[] = [
  { id: 'ST20260806', period: '2026-08', supplierIds: ['S001', 'S002', 'S005'], orderIds: ['NJ202608110928', 'NJ202608110915', 'NJ202608110842'], amount: 699.5, createdAt: '2026-08-06 10:00', items: [
    { supplierId: 'S001', supplierName: '靖州杨梅专业合作社', orderIds: ['NJ202608110928'], amount: 136 },
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608110915'], amount: 299.5 },
    { supplierId: 'S005', supplierName: '县供销社惠农服务中心', orderIds: ['NJ202608110842'], amount: 264 }
  ] },
  { id: 'ST20260720', period: '2026-07', supplierIds: ['S003', 'S004'], orderIds: ['NJ202607301201', 'NJ202607281101'], amount: 486, createdAt: '2026-07-20 10:00', items: [
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202607301201'], amount: 128 },
    { supplierId: 'S004', supplierName: '炎陵果业有限公司', orderIds: ['NJ202607281101'], amount: 358 }
  ] },
  { id: 'ST20260728', period: '2026-07', supplierIds: ['S025', 'S014', 'S023'], orderIds: ['NJ202607221134', 'NJ202607240956', 'NJ202607250843'], amount: 396.4, createdAt: '2026-07-28 10:00', items: [
    { supplierId: 'S025', supplierName: '麻阳冰糖橙合作社', orderIds: ['NJ202607221134'], amount: 239.6 },
    { supplierId: 'S014', supplierName: '浏阳蒸菜食品厂', orderIds: ['NJ202607240956'], amount: 116.4 },
    { supplierId: 'S023', supplierName: '临武鸭业股份有限公司', orderIds: ['NJ202607250843'], amount: 40.4 }
  ] },
  { id: 'ST20260802', period: '2026-08', supplierIds: ['S020', 'S021', 'S002'], orderIds: ['NJ202608010857', 'NJ202608011306', 'NJ202608010816'], amount: 328.5, createdAt: '2026-08-02 10:00', items: [
    { supplierId: 'S020', supplierName: '石门柑橘专业合作社', orderIds: ['NJ202608010857'], amount: 91.6 },
    { supplierId: 'S021', supplierName: '张家界莓茶产业合作社', orderIds: ['NJ202608011306'], amount: 168 },
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608010816'], amount: 68.9 }
  ] },
  { id: 'ST20260804', period: '2026-08', supplierIds: ['S036', 'S009', 'S017'], orderIds: ['NJ202608031958', 'NJ202608030831', 'NJ202608031449'], amount: 311.9, createdAt: '2026-08-04 10:00', items: [
    { supplierId: 'S036', supplierName: '祁阳米粉食品厂', orderIds: ['NJ202608031958'], amount: 107.2 },
    { supplierId: 'S009', supplierName: '宁乡花猪生态养殖场', orderIds: ['NJ202608030831'], amount: 155.2 },
    { supplierId: 'S017', supplierName: '祁东黄花菜产业园', orderIds: ['NJ202608031449'], amount: 49.5 }
  ] },
  { id: 'ST20260808', period: '2026-08', supplierIds: ['S006', 'S008', 'S010'], orderIds: ['NJ202608061158', 'NJ202608081904', 'NJ202608070928'], amount: 501.4, createdAt: '2026-08-08 10:00', items: [
    { supplierId: 'S006', supplierName: '武陵蜂业合作社', orderIds: ['NJ202608061158'], amount: 176 },
    { supplierId: 'S008', supplierName: '洞庭湖水产品合作社', orderIds: ['NJ202608081904'], amount: 171.2 },
    { supplierId: 'S010', supplierName: '道县瑶山菌业合作社', orderIds: ['NJ202608070928'], amount: 154.2 }
  ] },
  { id: 'ST20260810', period: '2026-08', supplierIds: ['S002', 'S003'], orderIds: ['NJ202608101841', 'NJ202608101312'], amount: 532.6, createdAt: '2026-08-10 10:00', items: [
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608101841'], amount: 403.6 },
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202608101312'], amount: 129 }
  ] },
  { id: 'ST20260812', period: '2026-08', supplierIds: ['S002', 'S003', 'S008', 'S005', 'S006'], orderIds: ['NJ202608121030', 'NJ202608121015', 'NJ202608120958', 'NJ202608120945', 'NJ202608120931'], amount: 1569.4, createdAt: '2026-08-12 10:00', items: [
    { supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['NJ202608121030'], amount: 359.4 },
    { supplierId: 'S003', supplierName: '安化茶业集团', orderIds: ['NJ202608121015'], amount: 256 },
    { supplierId: 'S008', supplierName: '洞庭湖水产品合作社', orderIds: ['NJ202608120958'], amount: 428 },
    { supplierId: 'S005', supplierName: '县供销社惠农服务中心', orderIds: ['NJ202608120945'], amount: 350 },
    { supplierId: 'S006', supplierName: '武陵蜂业合作社', orderIds: ['NJ202608120931'], amount: 176 }
  ] }
]



export const members: Member[] = [
  { id: 'M001', name: '王女士', level: 'gold', balance: 386.5, points: 2860, phone: '138****6688', memberNo: 'SBX·8829', cumulativeCommission: 1286, fans: 68, monthlyOrders: 23 },
  { id: 'M002', name: '张先生', level: 'silver', balance: 628, points: 1580, phone: '139****2255', memberNo: 'SBX·6631', cumulativeCommission: 486, fans: 26, monthlyOrders: 12 },
  { id: 'M003', name: '李女士', level: 'gold', balance: 1280, points: 5200, phone: '137****8812', memberNo: 'SBX·7745', cumulativeCommission: 3260, fans: 182, monthlyOrders: 46 },
  { id: 'M004', name: '陈先生', level: 'normal', balance: 200, points: 320, phone: '150****3398', memberNo: 'SBX·5568', monthlyOrders: 3 },
  { id: 'M005', name: '刘女士', level: 'silver', balance: 460, points: 1180, phone: '136****5521', memberNo: 'SBX·9012', cumulativeCommission: 358, fans: 18, monthlyOrders: 9 },
  { id: 'M006', name: '赵先生', level: 'gold', balance: 896, points: 4600, phone: '158****7733', memberNo: 'SBX·4487', cumulativeCommission: 1986, fans: 96, monthlyOrders: 31 },
  { id: 'M007', name: '孙女士', level: 'normal', balance: 88, points: 120, phone: '152****0098', memberNo: 'SBX·3351', monthlyOrders: 2 },
  { id: 'M008', name: '周先生', level: 'silver', balance: 1020, points: 2980, phone: '139****6677', memberNo: 'SBX·2294', cumulativeCommission: 862, fans: 42, monthlyOrders: 18 }
]

export const commissionRules: CommissionRule[] = [
  { id: 'CR001', name: '门店推广佣金', targetType: 'farm', rate: 8, enabled: true, updatedAt: '2026-08-11 09:00' },
  { id: 'CR002', name: '商品推广佣金', targetType: 'product', rate: 12, enabled: true, updatedAt: '2026-08-11 09:00' },
  { id: 'CR004', name: '门店带客佣金', targetType: 'farm', rate: 6, enabled: true, updatedAt: '2026-08-12 09:00' },
  { id: 'CR005', name: '生鲜品类推广佣金', targetType: 'product', rate: 10, enabled: true, updatedAt: '2026-08-12 09:00' },
  { id: 'CR007', name: '门店会员转化佣金', targetType: 'farm', rate: 5, enabled: true, updatedAt: '2026-08-12 14:00' },
  { id: 'CR008', name: '年货专场佣金', targetType: 'product', rate: 18, enabled: false, updatedAt: '2026-08-12 14:00' },
  { id: 'CR010', name: '民宿推广佣金', targetType: 'farm', rate: 9, enabled: true, updatedAt: '2026-08-13 09:30' },
  { id: 'CR011', name: '茶酒类目佣金', targetType: 'product', rate: 14, enabled: true, updatedAt: '2026-08-13 10:00' },
  { id: 'CR012', name: '跨店联播佣金', targetType: 'live', rate: 8, enabled: true, updatedAt: '2026-08-13 10:00' }
]

export const cityOptions = ['张家界永定区', '长沙岳麓区', '湘西州', '常德桃源县']

export const farmhouseExperiences: FarmExperience[] = [
  { id: 'EXP001', farmId: 'F001', name: '农事采摘体验', categoryCode: 'pick', description: '应季果蔬采摘 · 亲子互动', price: 68, status: 'active', image: '/static/images/field.webp', sort: 1, updatedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'EXP002', farmId: 'F001', name: '柴火土灶现做', categoryCode: 'cook', description: '农家柴火灶 · 现场烹饪', price: 128, status: 'active', image: '/static/images/farmhouse.webp', sort: 2, updatedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'EXP003', farmId: 'F001', name: '露营帐篷烧烤', categoryCode: 'camp', description: '临溪草坪 · 夜宿露营', price: 198, status: 'active', image: '/static/images/mountain.webp', sort: 3, updatedAt: '2026-08-01T09:00:00.000Z' }
]

export const farmhouseFoods = [
  { id: 'FD01', emoji: '🐔', name: '山泉土鸡汤', description: '散养土鸡 · 文火慢炖三小时', price: 88, originalPrice: 108, image: '/static/images/farmhouse.webp' },
  { id: 'FD02', emoji: '🥓', name: '湘西柴火腊肉', description: '松柏烟熏 · 农家自晒', price: 58, originalPrice: 68, image: '/static/images/bacon.webp' },
  { id: 'FD03', emoji: '🐟', name: '剁椒石板鱼', description: '山泉活鱼 · 现杀现做', price: 68, image: '/static/images/chili.webp' },
  { id: 'FD04', emoji: '🌶', name: '擂辣椒皮蛋', description: '本地青椒 · 农家味道', price: 26, image: '/static/images/field.webp' },
  { id: 'FD05', emoji: '🐠', name: '酸汤黄鸭叫', description: '山泉黄鸭叫 · 酸汤开胃', price: 58, image: '/static/images/field.webp' },
  { id: 'FD06', emoji: '🦆', name: '血粑鸭', description: '苗家血粑 · 土鸭现宰', price: 68, image: '/static/images/farmhouse.webp' },
  { id: 'FD07', emoji: '🍘', name: '蒿子粑粑', description: '清明蒿子 · 香糯拉丝', price: 18, originalPrice: 22, image: '/static/images/field.webp' },
  { id: 'FD08', emoji: '🍗', name: '茶油蒸土鸡', description: '山茶油 · 土鸡整只蒸', price: 98, originalPrice: 118, image: '/static/images/farmhouse.webp' },
  { id: 'FD09', emoji: '🎃', name: '蒸南瓜花', description: '应季南瓜花 · 清甜软糯', price: 22, image: '/static/images/field.webp' },
  { id: 'FD10', emoji: '🍲', name: '柴火豆腐', description: '石磨豆浆 · 柴火慢炖', price: 28, image: '/static/images/chili.webp' }
]

export interface SupplierResponsibilityStat {
  supplierId: string
  supplierName: string
  count: number
  amount: number
  rate: number
}

export interface DerivedPlatformMetrics {
  gmv: number
  farmCount: number
  supplierCount: number
  orderCount: number
  pendingCommission: number
  orderStats: { total: number; pending: number; shipping: number }
  afterSaleStats: { settlement: number; count: number; processing: number; resolved: number; rate: string; supplierResponsibility: SupplierResponsibilityStat[] }
  farmStats: { total: number; liveCount: number; configuring: number; selfProducts: number; pendingSelfProducts: number }
  promoterStats: { pendingCommission: number; activePromoters: number; lockedFans: number }
  hotProducts: Array<{ name: string; supplier: string; amount: number; units: number; image: string }>
  categoryShares: Array<{ name: string; value: number }>
  dailyTrend: Array<{ label: string; amount: number; count: number }>
}

export interface DashboardMetricsFilter {
  from?: string
  to?: string
  validStatuses?: OrderStatus[]
}

export function derivePlatformMetrics(input: {
  orders: Order[]
  products: Product[]
  farms: FarmStore[]
  suppliers: Supplier[]
  afterSales: AfterSale[]
  promoters: Promoter[]
  filter?: DashboardMetricsFilter
}): DerivedPlatformMetrics {
  const { orders, products, farms, suppliers, afterSales, promoters, filter } = input
  const validStatuses = new Set<OrderStatus>(filter?.validStatuses ?? ['pending', 'shipping', 'delivered'])
  const hasInvalidRange = !!filter && (
    (!!filter.from && !validReportDate(filter.from)) ||
    (!!filter.to && !validReportDate(filter.to)) ||
    (!!filter.from && !!filter.to && filter.from > filter.to)
  )
  const metricOrders = hasInvalidRange ? [] : [...new Map(orders.filter((order) => order?.id).map((order) => [order.id, order])).values()].filter((order) => {
    const date = reportLocalDate(order.createdAt)
    if (!validStatuses.has(order.status) || !date) return false
    if (filter?.from && date < filter.from) return false
    if (filter?.to && date > filter.to) return false
    return true
  })
  const gmv = round2(metricOrders.reduce((sum, order) => sum + order.amount, 0))
  const orderStats = {
    total: metricOrders.length,
    pending: metricOrders.filter((order) => order.status === 'pending').length,
    shipping: metricOrders.filter((order) => order.status === 'shipping').length,
  }
  const resolved = afterSales.filter((afterSale) => afterSale.status === 'refunded').length
  const orderById = new Map(orders.filter((order) => order?.id).map((order) => [order.id, order]))
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  const responsibilityTotals = new Map<string, { count: number; amount: number }>()
  afterSales.forEach((afterSale) => {
    const supplierId = afterSale.responsibleSupplierId || orderById.get(afterSale.orderId)?.supplierId || ''
    if (!supplierId) return
    const current = responsibilityTotals.get(supplierId) ?? { count: 0, amount: 0 }
    current.count += 1
    current.amount += afterSale.refundAmount ?? afterSale.amount
    responsibilityTotals.set(supplierId, current)
  })
  const supplierResponsibility: SupplierResponsibilityStat[] = [...responsibilityTotals.entries()]
    .map(([supplierId, total]) => ({
      supplierId,
      supplierName: supplierById.get(supplierId)?.name || supplierId,
      count: total.count,
      amount: round2(total.amount),
      rate: afterSales.length ? Math.round((total.count / afterSales.length) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
  const afterSaleStats = {
    settlement: Math.round(afterSales.filter((afterSale) => afterSale.status === 'refunded').reduce((sum, afterSale) => sum + (afterSale.refundAmount ?? afterSale.amount), 0) * 100) / 100,
    count: afterSales.length,
    processing: afterSales.filter((afterSale) => afterSale.status === 'processing').length,
    resolved,
    rate: afterSales.length ? `${Math.round((resolved / afterSales.length) * 1000) / 10}%` : '0%',
    supplierResponsibility,
  }
  const farmhouseProducts = products.filter((product) => product.source === 'farmhouse')
  const farmStats = {
    total: farms.length,
    liveCount: farms.filter((farm) => farm.status === 'active').length,
    configuring: farms.filter((farm) => farm.status === 'pending').length,
    selfProducts: farmhouseProducts.length,
    pendingSelfProducts: farmhouseProducts.filter((product) => product.status === 'pending').length,
  }
  const promoterStats = {
    pendingCommission: Math.round(promoters.filter((promoter) => !promoter.settled).reduce((sum, promoter) => sum + promoter.commission, 0) * 100) / 100,
    activePromoters: promoters.filter((promoter) => promoter.status === 'active').length,
    lockedFans: promoters.reduce((sum, promoter) => sum + promoter.fans, 0),
  }
  const productMap = new Map(products.map((product) => [product.id, product]))
  const productSales = new Map<string, { name: string; supplier: string; amount: number; units: number; image: string }>()
  const categorySales = new Map<string, number>()
  metricOrders.forEach((order) => allocateOrderLines(order, productMap).forEach((line) => {
    const current = productSales.get(line.item.productId) || {
      name: line.product?.name || line.item.name || '未知商品',
      supplier: line.supplierLabel,
      amount: 0,
      units: 0,
      image: mediaValueToImage(line.product?.image || line.item.image)
    }
    current.amount = round2(current.amount + line.amount)
    current.units += line.quantity
    productSales.set(line.item.productId, current)
    categorySales.set(line.category, round2((categorySales.get(line.category) || 0) + line.amount))
  }))
  const hotProducts = [...productSales.values()]
    .sort((a, b) => b.units - a.units || b.amount - a.amount || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 5)
  const categoryShares = [...categorySales.entries()].map(([name, value]) => ({ name, value }))
  const dayMap = new Map<string, { amount: number; count: number }>()
  metricOrders.forEach((order) => {
    const date = reportLocalDate(order.createdAt)
    if (!date) return
    const current = dayMap.get(date) || { amount: 0, count: 0 }
    current.amount += order.amount
    current.count += 1
    dayMap.set(date, current)
  })
  const dailyTrend = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, amount: round2(value.amount), count: value.count }))
  return {
    gmv, farmCount: farms.length, supplierCount: suppliers.length, orderCount: metricOrders.length,
    pendingCommission: promoterStats.pendingCommission, orderStats, afterSaleStats, farmStats, promoterStats,
    hotProducts, categoryShares, dailyTrend,
  }
}

export function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10
}

export function formatNumber(value: number): string {
  return round2(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function money(value: number): string {
  return `¥${formatNumber(value)}`
}

export function calcCartTotal(items: Array<{ price: number; quantity: number }>): number {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
}

export function calcMargin(cost: number, retail: number): { amount: number; rate: number } {
  const amount = Math.round((retail - cost) * 100) / 100
  return { amount, rate: retail > 0 ? Math.round((amount / retail) * 1000) / 10 : 0 }
}

let idSequence = 0

export function createId(prefix: string): string {
  idSequence = (idSequence + 1) % 1000
  return `${prefix}${Date.now().toString().slice(-9)}${idSequence.toString().padStart(3, '0')}`
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`
}

export function enableKeyboardButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('uni-button:not([tabindex])').forEach((button) => { button.tabIndex = 0 })
}

export function focusFirstInteractive(root: ParentNode): void {
  enableKeyboardButtons(root)
  root.querySelector<HTMLElement>('uni-button:not([disabled]), input:not(:disabled), select:not(:disabled)')?.focus()
}

export function installKeyboardButtonSupport(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined
  const sync = () => enableKeyboardButtons(document)
  const activate = (event: KeyboardEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.tagName !== 'UNI-BUTTON' || target.hasAttribute('disabled') || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    target.click()
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('keydown', activate)
  return () => {
    observer.disconnect()
    document.removeEventListener('keydown', activate)
  }
}

export function mockDelay<T>(value: T, delay = 180, scenario: MockScenario = 'normal', emptyValue?: T): Promise<T> {
  return new Promise((resolve, reject) => setTimeout(() => {
    if (scenario === 'failure') {
      reject(new Error('模拟数据加载失败，请重试'))
      return
    }
    resolve(cloneSeed(scenario === 'empty' ? (emptyValue ?? value) : value))
  }, delay))
}

function mergePersisted(defaultValue: unknown, savedValue: unknown): unknown {
  if (savedValue === undefined || savedValue === null) return cloneSeed(defaultValue)
  if (Array.isArray(defaultValue) && Array.isArray(savedValue)) {
    return savedValue.map((savedItem) => {
      if (!savedItem || typeof savedItem !== 'object' || !('id' in savedItem)) return savedItem
      const base = defaultValue.find((item) => item && typeof item === 'object' && 'id' in item && item.id === savedItem.id)
      return base ? mergePersisted(base, savedItem) : savedItem
    })
  }
  if (defaultValue && savedValue && typeof defaultValue === 'object' && typeof savedValue === 'object') {
    const merged: Record<string, unknown> = { ...(defaultValue as Record<string, unknown>) }
    Object.entries(savedValue as Record<string, unknown>).forEach(([key, value]) => {
      merged[key] = key in merged ? mergePersisted(merged[key], value) : value
    })
    return merged
  }
  return savedValue
}

export function mergePersistedDefaults<T>(defaults: T, saved: unknown): T {
  return mergePersisted(defaults, saved) as T
}

export function mergeEntitySeeds<T extends { id: string }>(defaults: T[], saved: T[]): T[] {
  const savedById = new Map(saved.map((item) => [item.id, item]))
  const merged = defaults.map((item) => mergePersistedDefaults(item, savedById.get(item.id)))
  const defaultIds = new Set(defaults.map((item) => item.id))
  return [...merged, ...saved.filter((item) => !defaultIds.has(item.id)).map(cloneSeed)]
}

type PersistedObject = Record<string, unknown>
type StateMigration = (state: PersistedObject, defaults: PersistedObject) => PersistedObject

const transientStateKeys = new Set(['initialized', 'loading', 'error', 'mockScenario', 'checkoutError', 'purchaseError', 'operationKey'])

export function selectPersistedState<T>(state: T, keys?: readonly (keyof T)[]): Partial<T> {
  if (!state || typeof state !== 'object') return state as Partial<T>
  const allowed = keys ? new Set(keys.map(String)) : null
  return Object.fromEntries(Object.entries(state as PersistedObject).filter(([key]) => !transientStateKeys.has(key) && (!allowed || allowed.has(key)))) as Partial<T>
}

/** 已按功能清单移除的业务域，迁移时从落盘状态里剔除。 */
const retiredPersistedStateKeys = ['bookings', 'routes', 'lives', 'travelRoutes', 'liveRooms'] as const

const stateMigrations: Record<number, StateMigration> = {
  1: (state) => state,
  2: (state, defaults) => {
    if ('member' in defaults && !state.member && ('balance' in state || 'points' in state)) {
      state.member = { balance: state.balance, points: state.points }
      delete state.balance
      delete state.points
    }
    return state
  },
  3: (state) => {
    if (Array.isArray(state.commissionEntries)) {
      state.commissionEntries = state.commissionEntries.map((entry) => {
        if (!entry || typeof entry !== 'object' || 'status' in entry) return entry
        return { ...entry, status: entry.type === 'withdrawal' ? 'completed' : 'available' }
      })
    }
    transientStateKeys.forEach((key) => delete state[key])
    return state
  },
  4: (state, defaults) => {
    if (Array.isArray(state.products)) {
      state.products = state.products.map((product) => {
        if (!product || typeof product !== 'object' || !Array.isArray(product.skus)) return product
        const hasOnlyLegacySku = product.skus.length > 0 && product.skus.every((sku: unknown) => sku && typeof sku === 'object' && 'id' in sku && String(sku.id).endsWith('-DEFAULT'))
        if (!hasOnlyLegacySku) return product
        const { skus: _legacySkus, ...rest } = product
        return rest
      })
    }
    if ('member' in defaults && Array.isArray(state.orders)) {
      state.orders = state.orders.map((order) => order && typeof order === 'object' && !Array.isArray(order.items) ? { ...order, items: [] } : order)
    }
    if (Array.isArray(state.supplierSettlementRecords)) {
      state.supplierSettlementRecords = state.supplierSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object') return record
        const createdAt = typeof record.createdAt === 'string' ? record.createdAt : ''
        return { orderIds: [], period: createdAt.slice(0, 7), ...record }
      })
    }
    delete state.withdrawalRecords
    return state
  },
  5: (state) => {
    if (Array.isArray(state.suppliers)) {
      state.suppliers = state.suppliers.map((supplier) => {
        if (!supplier || typeof supplier !== 'object' || !supplier.qualification || typeof supplier.qualification !== 'object') return supplier
        if (!Object.values(supplier.qualification).some((value) => String(value).includes('旧版演示数据') || String(value) === '待补充')) return supplier
        const { qualification: _legacyQualification, ...rest } = supplier
        return rest
      })
    }
    return state
  },
  6: (state) => {
    if (Array.isArray(state.purchaseOrders)) {
      state.purchaseOrders = state.purchaseOrders.map((order) => {
        if (!order || typeof order !== 'object' || !Array.isArray(order.items)) return order
        return { ...order, items: order.items.map((item: unknown) => {
          if (!item || typeof item !== 'object' || !('productId' in item)) return item
          return { skuId: `${String(item.productId)}-DEFAULT`, skuName: '默认规格', image: '', ...item }
        }) }
      })
    }
    if (Array.isArray(state.supplierSettlementRecords)) {
      state.supplierSettlementRecords = state.supplierSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record.items)) return record
        const supplierIds: string[] = Array.isArray(record.supplierIds) ? record.supplierIds.map(String) : []
        const orderIds: string[] = Array.isArray(record.orderIds) ? record.orderIds.map(String) : []
        const amount = typeof record.amount === 'number' ? record.amount : 0
        return { ...record, items: supplierIds.map((supplierId, index) => ({ supplierId, supplierName: supplierId, orderIds: supplierIds.length === 1 ? orderIds : [], amount: supplierIds.length === 1 || index === 0 ? amount : 0 })) }
      })
    }
    if (Array.isArray(state.commissionSettlementRecords)) {
      state.commissionSettlementRecords = state.commissionSettlementRecords.map((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record.items)) return record
        const promoterIds: string[] = Array.isArray(record.promoterIds) ? record.promoterIds.map(String) : []
        const amount = typeof record.amount === 'number' ? record.amount : 0
        return { ...record, items: promoterIds.map((promoterId, index) => ({ promoterId, promoterName: promoterId, amount: promoterIds.length === 1 || index === 0 ? amount : 0 })) }
      })
    }
     return state
  },
  8: (state) => {
    retiredPersistedStateKeys.forEach((key) => delete state[key])
    return state
  }
}

export function migratePersistedState<T>(saved: unknown, defaults: T, version = PERSISTENCE_VERSION): T {
  if (!saved || typeof saved !== 'object') return cloneSeed(defaults)
  const envelope = saved as { version?: number; state?: unknown }
  const rawState = envelope.state && typeof envelope.state === 'object' ? envelope.state : saved
  let migrated = cloneSeed(rawState as PersistedObject)
  const savedVersion = Number.isInteger(envelope.version) ? Math.max(0, Number(envelope.version)) : 0
  for (let nextVersion = savedVersion + 1; nextVersion <= version; nextVersion += 1) {
    migrated = (stateMigrations[nextVersion] || ((state) => state))(migrated, defaults as PersistedObject)
  }
  if (savedVersion > 0 && savedVersion < version) clearRetiredPlatformData()
  return mergePersisted(defaults, migrated) as T
}

export function persistedEnvelope<T>(state: T, keys?: readonly (keyof T)[], version = PERSISTENCE_VERSION): { version: number; state: Partial<T> } {
  return { version, state: cloneSeed(selectPersistedState(state, keys)) }
}

export const purchaseSteps: PurchaseStatus[] = ['submitted', 'accepted', 'shipped', 'delivering', 'received', 'completed']

export function canTransitionPurchaseStatus(from: PurchaseStatus, to: PurchaseStatus): boolean {
  if (from === to) return true
  return purchaseSteps.indexOf(to) === purchaseSteps.indexOf(from) + 1 || (to === 'cancelled' && !['received', 'completed', 'cancelled'].includes(from))
}

export function nextPurchaseStatus(status: PurchaseStatus): PurchaseStatus {
  return purchaseSteps[Math.min(purchaseSteps.indexOf(status) + 1, purchaseSteps.length - 1)]
}


export interface PricePolicyInput {
  name: string
  type: PricePolicy['type']
  discount: number
  tiers?: PriceTier[]
}

export function validatePricePolicy(input: PricePolicyInput): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('请填写策略名称')
  if (!Number.isFinite(input.discount) || input.discount < 1 || input.discount > 100) errors.push('优惠比例需在 1-100 之间')
  if (input.type === 'ladder') {
    const tiers = input.tiers || []
    if (!tiers.length) {
      errors.push('阶梯价至少需要 1 个档位')
    } else {
      let prevMax: number | null = null
      tiers.forEach((tier, index) => {
        const label = `档位${index + 1}`
        if (!Number.isInteger(tier.minQty) || tier.minQty < 1) { errors.push(`${label}：起始数量需为 ≥1 的整数`); return }
        if (tier.maxQty !== null && (!Number.isInteger(tier.maxQty) || tier.maxQty < tier.minQty)) { errors.push(`${label}：上限数量需为 ≥ 起始数量的整数，或留空表示无上限`); return }
        if (!Number.isFinite(tier.price) || tier.price <= 0) { errors.push(`${label}：阶梯单价需大于 0`); return }
        if (!Number.isFinite(tier.discountOff) || tier.discountOff < 0 || tier.discountOff > 100) { errors.push(`${label}：让利比例需在 0-100 之间`); return }
        if (index > 0) {
          if (prevMax === null) { errors.push('无上限档（上限留空）必须排在最后'); return }
          if (tier.minQty <= prevMax) { errors.push(`${label}：起始数量需大于上一档上限，区间不能重叠`); return }
        }
        prevMax = tier.maxQty
      })
    }
  }
  return errors
}


// ===== 中台发布数据：admin 维护的门店图片/商品图片/门店人气值统一发布，其他应用读取覆盖 =====
export const PLATFORM_MEDIA_STORAGE_KEY = 'agritainment-platform-media'

export interface PlatformMedia {
  farms: Record<string, BusinessMediaValue>
  products: Record<string, { image: BusinessMediaValue; images?: BusinessMediaValue[] }>
  updatedAt: string
}

interface PlatformMediaStorage {
  read: () => unknown
  write: (value: unknown) => void
}

function platformMediaStorage(): PlatformMediaStorage | null {
  // H5：直接使用 localStorage，保证同一 origin 下多端共享
  try {
    const scope = globalThis as { localStorage?: Storage }
    const storage = scope.localStorage
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return {
        read: () => storage.getItem(PLATFORM_MEDIA_STORAGE_KEY),
        write: (value) => storage.setItem(PLATFORM_MEDIA_STORAGE_KEY, String(value))
      }
    }
  } catch {
    // 无 localStorage 时继续尝试 uni
  }
  // 小程序等端：尝试全局 uni
  try {
    const scope = globalThis as { uni?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void } }
    const uniRef = scope.uni
    if (uniRef?.getStorageSync && uniRef.setStorageSync) {
      return {
        read: () => uniRef.getStorageSync!(PLATFORM_MEDIA_STORAGE_KEY),
        write: (value) => uniRef.setStorageSync!(PLATFORM_MEDIA_STORAGE_KEY, value)
      }
    }
  } catch {
    // 忽略
  }
  return null
}

export function emptyPlatformMedia(): PlatformMedia {
  return { farms: {}, products: {}, updatedAt: '' }
}

export function readPlatformMedia(): PlatformMedia | null {
  const storage = platformMediaStorage()
  if (!storage) return null
  try {
    let saved = storage.read()
    if (typeof saved === 'string') saved = JSON.parse(saved)
    if (saved && typeof saved === 'object') {
      const media = saved as Partial<PlatformMedia>
      if (media.farms && typeof media.farms === 'object' && media.products && typeof media.products === 'object') {
        return {
          farms: media.farms as Record<string, BusinessMediaValue>,
          products: media.products as Record<string, { image: BusinessMediaValue; images?: BusinessMediaValue[] }>,
          updatedAt: typeof media.updatedAt === 'string' ? media.updatedAt : ''
        }
      }
    }
  } catch {
    // 读取异常时回退默认图
  }
  return null
}

export function writePlatformMedia(media: PlatformMedia): boolean {
  const storage = platformMediaStorage()
  if (!storage) return false
  try {
    storage.write(JSON.stringify(media))
    return true
  } catch {
    return false
  }
}

function isUploadedImage(value: unknown): boolean {
  if (typeof value !== 'string') return !!value && typeof value === 'object'
  return !!value && (value.startsWith('data:image/') || value.startsWith('blob:'))
}

/** 发布门店图片：上传图写入素材库，非上传图（默认图/移除）则删除对应记录 */
export function upsertPlatformFarm(media: PlatformMedia | null, id: string, image: BusinessMediaValue): PlatformMedia {
  const base = media ?? emptyPlatformMedia()
  const farms = { ...base.farms }
  if (isUploadedImage(image)) farms[id] = image
  else delete farms[id]
  return { ...base, farms, updatedAt: new Date().toISOString() }
}


/** 发布商品图片：主图/详情图任一为上传图则写入，否则删除对应记录 */
export function upsertPlatformProduct(media: PlatformMedia | null, id: string, image: BusinessMediaValue, images?: BusinessMediaValue[]): PlatformMedia {
  const base = media ?? emptyPlatformMedia()
  const products = { ...base.products }
  const uploadedImages = (images ?? []).filter(isUploadedImage)
  if (isUploadedImage(image) || uploadedImages.length) {
    products[id] = { image, images: uploadedImages }
  } else {
    delete products[id]
  }
  return { ...base, products, updatedAt: new Date().toISOString() }
}

/** 用素材库覆盖实体图片：无记录的实体保持原图 */
export function applyPlatformMedia(
  farms: FarmStore[] | null | undefined,
  products: Product[] | null | undefined,
  media: PlatformMedia | null = readPlatformMedia()
): void {
  if (!media) return
  if (Array.isArray(farms)) {
    farms.forEach((farm) => {
      const override = media.farms[farm.id]
      if (override) farm.image = override
    })
  }
  if (Array.isArray(products)) {
    products.forEach((product) => {
      const override = media.products[product.id]
      if (override && override.image) {
        product.image = override.image
        if (Array.isArray(override.images) && override.images.length) product.images = [...override.images]
      }
    })
  }
}


// ===== 共享业务数据通道：H5 同源共享，小程序回退种子 =====
export const PLATFORM_BINDINGS_STORAGE_KEY = 'agritainment-platform-bindings'
export const PLATFORM_CONFIG_STORAGE_KEY = 'agritainment-platform-config'
export const PLATFORM_SHARES_STORAGE_KEY = 'agritainment-platform-shares'
export const PLATFORM_STORE_ACCOUNTS_STORAGE_KEY = 'agritainment-platform-store-accounts'

export interface UserBinding {
  userId: string
  promoterId?: string
  staffAccountId?: string
  status: 'pending' | 'bound'
  boundAt?: string
}

export interface ShareConfig {
  promoterRate: number
  staffRate: number
  /** 一级团长分成比例（%）；未配置时不下发。 */
  leaderLevel1Rate?: number
  /** 二级团长分成比例（%）；未配置时不下发。 */
  leaderLevel2Rate?: number
}

export interface ShareRecord {
  id: string
  userId: string
  orderId: string
  orderAmount: number
  role: 'promoter' | 'staff'
  promoterId?: string
  staffAccountId?: string
  rate: number
  amount: number
  createdAt: string
  settled?: boolean
  status?: 'pending' | 'settled' | 'reversed'
}

interface PlatformJsonStorage {
  read: (key: string) => unknown
  write: (key: string, value: unknown) => void
  remove?: (key: string) => void
}

const PLATFORM_REVISION_SIDECAR_SUFFIX = ':revision'

function platformRevisionSidecarKey(key: string): string { return `${key}${PLATFORM_REVISION_SIDECAR_SUFFIX}` }
function isPlatformRevisionSidecar(key: string): boolean { return key.endsWith(PLATFORM_REVISION_SIDECAR_SUFFIX) }

function platformJsonStorage(): PlatformJsonStorage | null {
  try {
    const scope = globalThis as { localStorage?: Storage }
    const storage = scope.localStorage
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return { read: (key) => storage.getItem(key), write: (key, value) => storage.setItem(key, String(value)), remove: (key) => storage.removeItem(key) }
    }
  } catch {
    // 无 localStorage 时继续尝试 uni
  }
  try {
    const scope = globalThis as { uni?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void; removeStorageSync?: (key: string) => void } }
    const uniRef = scope.uni
    if (uniRef?.getStorageSync && uniRef.setStorageSync) {
      return { read: (key) => uniRef.getStorageSync!(key), write: (key, value) => uniRef.setStorageSync!(key, value), remove: uniRef.removeStorageSync ? (key) => uniRef.removeStorageSync!(key) : undefined }
    }
  } catch {
    // 忽略
  }
  return null
}

export function readPlatformJson<T>(key: string, fallback: T | null = null): T | null {
  const storage = platformJsonStorage()
  if (!storage) return fallback
  try {
    let saved = storage.read(key)
    if (typeof saved === 'string') saved = JSON.parse(saved)
    return (saved ?? fallback) as T | null
  } catch {
    return fallback
  }
}


const platformChangeListeners = new Set<(event: PlatformChange) => void>()
let lastPlatformChange: PlatformChange | null = null
function notifyPlatformChange(key: string, source: string): void {
  lastPlatformChange = { key, source }
  const event = lastPlatformChange
  platformChangeListeners.forEach((listener) => { try { listener(event) } catch { /* ignore */ } })
}

function readPlatformRevisionSidecar(key: string): number | null {
  const saved = readPlatformJson<unknown>(platformRevisionSidecarKey(key))
  return Number.isInteger(saved) && (saved as number) >= 0 ? saved as number : null
}

function restorePlatformStorageValue(storage: PlatformJsonStorage, key: string, value: unknown): void {
  try {
    if (value == null && storage.remove) storage.remove(key)
    else storage.write(key, value == null ? JSON.stringify(null) : value)
  } catch {
    // A failed restore remains observable through the original false return value.
  }
}

/** Reads the concurrency revision for a raw platform JSON collection. */
export function readPlatformCollectionRevision(key: string): number {
  if (!key?.trim() || isPlatformRevisionSidecar(key)) return 0
  return readPlatformRevisionSidecar(key) ?? readVersionedRecord(key)?.revision ?? 0
}

/** Writes a raw platform JSON collection and advances its sidecar revision. */
export function writePlatformJson(key: string, value: unknown, expectedRevision?: number): boolean {
  const storage = platformJsonStorage()
  const normalizedKey = key?.trim()
  if (!storage || !normalizedKey) return false
  let previousPayload: unknown
  let previousSidecar: unknown
  let sidecarKey = ''
  let restoreRequired = false
  try {
    const currentRevision = readPlatformCollectionRevision(normalizedKey)
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || currentRevision !== expectedRevision)) return false
    previousPayload = storage.read(normalizedKey)
    sidecarKey = platformRevisionSidecarKey(normalizedKey)
    previousSidecar = !isPlatformRevisionSidecar(normalizedKey) ? storage.read(sidecarKey) : null
    restoreRequired = true
    storage.write(normalizedKey, JSON.stringify(value))
    if (!isPlatformRevisionSidecar(normalizedKey)) {
      storage.write(sidecarKey, JSON.stringify(currentRevision + 1))
    }
    notifyPlatformChange(normalizedKey, 'write')
    return true
  } catch {
    if (restoreRequired) {
      restorePlatformStorageValue(storage, normalizedKey, previousPayload)
      if (!isPlatformRevisionSidecar(normalizedKey)) restorePlatformStorageValue(storage, sidecarKey, previousSidecar)
    }
    return false
  }
}

/** Restores an original collection only while the current payload still belongs to the transaction. */
export function rollbackPlatformCollectionSnapshot(key: string, original: unknown, target: unknown): boolean {
  const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
  const current = readPlatformJson<unknown>(key)
  if (same(current, original)) return true
  if (!same(current, target)) return false
  if (original !== null) return writePlatformJson(key, cloneSeed(original))
  clearPlatformJson(key)
  return readPlatformJson(key) === null
}

export function clearPlatformJson(key: string): void {
  try {
    const scope = globalThis as { localStorage?: Storage }
    if (scope.localStorage && typeof scope.localStorage.removeItem === 'function') {
      scope.localStorage.removeItem(key)
      if (!isPlatformRevisionSidecar(key)) scope.localStorage.removeItem(platformRevisionSidecarKey(key))
      return
    }
  } catch {
    // 忽略
  }
  try {
    const uniRef = (globalThis as unknown as { uni?: { removeStorageSync?: (key: string) => void } }).uni
    uniRef?.removeStorageSync?.(key)
    if (!isPlatformRevisionSidecar(key)) uniRef?.removeStorageSync?.(platformRevisionSidecarKey(key))
  } catch {
    // 忽略
  }
}

export interface VersionedStorageRecord<T> {
  revision: number
  updatedAt: string
  data: T
}

export function readVersionedRecord<T>(key: string): VersionedStorageRecord<T> | null {
  const saved = readPlatformJson<VersionedStorageRecord<T>>(key)
  if (!saved || !Number.isInteger(saved.revision) || saved.revision < 0 || typeof saved.updatedAt !== 'string' || !('data' in saved)) return null
  return saved
}

export function writeVersionedRecord<T>(key: string, next: VersionedStorageRecord<T>, expectedRevision: number): boolean {
  const current = readVersionedRecord<T>(key)
  const currentRevision = current?.revision ?? 0
  const nextUpdatedAt = Date.parse(next.updatedAt)
  const currentUpdatedAt = current ? Date.parse(current.updatedAt) : Number.NEGATIVE_INFINITY
  if (currentRevision !== expectedRevision || next.revision !== expectedRevision + 1 || !Number.isFinite(nextUpdatedAt)) return false
  if (current && (!Number.isFinite(currentUpdatedAt) || nextUpdatedAt <= currentUpdatedAt)) return false
  return writePlatformJson(key, cloneSeed(next))
}

/** 用户绑定：临时可覆盖，下单后正式锁定 */
export function readUserBindings(): Record<string, UserBinding> | null {
  const bindings = readPlatformJson<Record<string, UserBinding>>(PLATFORM_BINDINGS_STORAGE_KEY)
  return bindings && typeof bindings === 'object' ? bindings : null
}
export function writeUserBindings(bindings: Record<string, UserBinding>): boolean {
  return !!bindings && writePlatformJson(PLATFORM_BINDINGS_STORAGE_KEY, bindings)
}
export function upsertUserBinding(binding: UserBinding): boolean {
  if (!binding?.userId) return false
  const bindings = readUserBindings() ?? {}
  const existing = bindings[binding.userId]
  if (existing && existing.status === 'bound') {
    const samePromoter = binding.promoterId && existing.promoterId === binding.promoterId
    const sameStaff = binding.staffAccountId && existing.staffAccountId === binding.staffAccountId
    const sameOwner = (samePromoter || sameStaff)
    if (!sameOwner) return false
    return writePlatformJson(PLATFORM_BINDINGS_STORAGE_KEY, { ...bindings, [binding.userId]: { ...binding, boundAt: binding.boundAt || existing.boundAt } })
  }
  return writePlatformJson(PLATFORM_BINDINGS_STORAGE_KEY, { ...bindings, [binding.userId]: binding })
}

/** 分成比例配置：中控台设置，各端读取 */
export const DEFAULT_SHARE_CONFIG: ShareConfig = { promoterRate: 5, staffRate: 3 }
export function readShareConfig(): ShareConfig {
  const saved = readPlatformJson<Partial<ShareConfig>>(PLATFORM_SHARE_CONFIG_STORAGE_KEY)
    || readPlatformJson<Partial<ShareConfig>>(PLATFORM_CONFIG_STORAGE_KEY)
  const shareRateOrUndefined = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const leaderLevel1Rate = shareRateOrUndefined(saved?.leaderLevel1Rate)
  const leaderLevel2Rate = shareRateOrUndefined(saved?.leaderLevel2Rate)
  return {
    promoterRate: typeof saved?.promoterRate === 'number' ? saved.promoterRate : DEFAULT_SHARE_CONFIG.promoterRate,
    staffRate: typeof saved?.staffRate === 'number' ? saved.staffRate : DEFAULT_SHARE_CONFIG.staffRate,
    ...(leaderLevel1Rate === undefined ? {} : { leaderLevel1Rate }),
    ...(leaderLevel2Rate === undefined ? {} : { leaderLevel2Rate })
  }
}
export function writeShareConfig(config: ShareConfig): boolean {
  if (![config.promoterRate, config.staffRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return false
  const next: ShareConfig = { promoterRate: round2(config.promoterRate), staffRate: round2(config.staffRate) }
  if (typeof config.leaderLevel1Rate === 'number' && Number.isFinite(config.leaderLevel1Rate)) next.leaderLevel1Rate = round2(config.leaderLevel1Rate)
  if (typeof config.leaderLevel2Rate === 'number' && Number.isFinite(config.leaderLevel2Rate)) next.leaderLevel2Rate = round2(config.leaderLevel2Rate)
  return writePlatformJson(PLATFORM_SHARE_CONFIG_STORAGE_KEY, next)
}

export function readPricingDefaults(): PricingDefaults {
  const saved = readPlatformJson<Partial<PricingDefaults> & Partial<ShareConfig>>(PLATFORM_PRICING_DEFAULTS_STORAGE_KEY)
    || readPlatformJson<Partial<PricingDefaults> & Partial<ShareConfig>>(PLATFORM_CONFIG_STORAGE_KEY)
  const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return {
    promoterCommissionRate: numberOr(saved?.promoterCommissionRate ?? saved?.promoterRate, DEFAULT_PRICING_DEFAULTS.promoterCommissionRate),
    storeCommissionRate: numberOr(saved?.storeCommissionRate ?? saved?.staffRate, DEFAULT_PRICING_DEFAULTS.storeCommissionRate),
    level1Amount: numberOr(saved?.level1Amount, DEFAULT_PRICING_DEFAULTS.level1Amount),
    level2Amount: numberOr(saved?.level2Amount, DEFAULT_PRICING_DEFAULTS.level2Amount),
    storePriceLevelDiscounts: normalizeStorePriceLevelDiscounts(saved?.storePriceLevelDiscounts)
  }
}

export function writePricingDefaults(defaults: PricingDefaults): boolean {
  const values = [defaults.promoterCommissionRate, defaults.storeCommissionRate, defaults.level1Amount, defaults.level2Amount]
  if (!values.every((value) => Number.isFinite(value) && value >= 0) || defaults.promoterCommissionRate > 100 || defaults.storeCommissionRate > 100) return false
  const providedDiscounts = defaults.storePriceLevelDiscounts
  if (providedDiscounts && !STORE_PRICE_LEVELS.every((level) => validStorePriceLevelDiscount(providedDiscounts[level]))) return false
  const discounts = normalizeStorePriceLevelDiscounts(providedDiscounts ?? readPricingDefaults().storePriceLevelDiscounts)
  return writePlatformJson(PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, {
    promoterCommissionRate: round2(defaults.promoterCommissionRate),
    storeCommissionRate: round2(defaults.storeCommissionRate),
    level1Amount: round2(defaults.level1Amount),
    level2Amount: round2(defaults.level2Amount),
    storePriceLevelDiscounts: discounts
  })
}

function validStorePriceLevelDiscount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
}

/** 归一化档位折让：非法或缺省按默认值兜底，保证门店端取价稳定。 */
export function normalizeStorePriceLevelDiscounts(input?: Partial<Record<StorePriceLevel, number>> | null): Record<StorePriceLevel, number> {
  return STORE_PRICE_LEVELS.reduce((acc, level) => {
    const value = input?.[level]
    acc[level] = validStorePriceLevelDiscount(value) ? Math.round((value as number) * 10000) / 10000 : DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS[level]
    return acc
  }, {} as Record<StorePriceLevel, number>)
}

/** 门店端读取运营后台配置的档位折让（分销价系数）；未配置时返回默认 A 0.95 / B 0.97 / C 1。 */
export function readStorePriceLevelDiscounts(): Record<StorePriceLevel, number> {
  return normalizeStorePriceLevelDiscounts(readPricingDefaults().storePriceLevelDiscounts)
}

/** 仅更新档位折让，保留其余价格默认值；非法系数直接拒绝。 */
export function writeStorePriceLevelDiscounts(input: Partial<Record<StorePriceLevel, number>>): boolean {
  if (!STORE_PRICE_LEVELS.every((level) => input[level] === undefined || validStorePriceLevelDiscount(input[level]))) return false
  const current = readPricingDefaults()
  return writePricingDefaults({
    ...current,
    storePriceLevelDiscounts: normalizeStorePriceLevelDiscounts({ ...current.storePriceLevelDiscounts, ...input })
  })
}

/** 分成记录 */
export function readShareRecords(): ShareRecord[] | null {
  const records = readPlatformJson<ShareRecord[]>(PLATFORM_SHARES_STORAGE_KEY)
  return Array.isArray(records) ? records : null
}
export function writeShareRecord(record: ShareRecord): boolean {
  const records = readShareRecords() ?? []
  const existing = records.findIndex((item) => item.id === record.id)
  if (existing >= 0) records[existing] = record
  else records.unshift(record)
  return writePlatformJson(PLATFORM_SHARES_STORAGE_KEY, records)
}

/** 整表覆盖写入分成记录（结算标记等） */
export function writeShareRecords(records: ShareRecord[]): boolean {
  return writePlatformJson(PLATFORM_SHARES_STORAGE_KEY, records)
}

/** 按 id 批量标记分成已结算 */
export function markShareSettled(ids: string[]): boolean {
  const records = readShareRecords() ?? []
  const idSet = new Set(ids)
  let changed = false
  records.forEach((item) => { if (idSet.has(item.id) && !item.settled) { item.settled = true; item.status = 'settled'; changed = true } })
  return !changed || writeShareRecords(records)
}

/** 业务员未结算分成求和（佣金结算口径） */
export function pendingShareAmount(promoterId: string): number {
  const records = readShareRecords() ?? []
  const sum = records
    .filter((item) => item.role === 'promoter' && item.promoterId === promoterId && !item.settled && item.status !== 'reversed')
    .reduce((acc, item) => acc + item.amount, 0)
  return Math.round(sum * 100) / 100
}

/** 所有业务员未结算分成总额 */
export function pendingShareTotal(): number {
  const records = readShareRecords() ?? []
  const sum = records.filter((item) => item.role === 'promoter' && !item.settled && item.status !== 'reversed').reduce((acc, item) => acc + item.amount, 0)
  return Math.round(sum * 100) / 100
}

/** 业务员端演示数据：仅在对应存储通道为空时写入一次，不覆盖用户真实数据 */
export const demoShareRecords: ShareRecord[] = [
  { id: 'SR-D001', userId: 'U9001', orderId: 'NJ202608151132', orderAmount: 288, role: 'promoter', promoterId: 'T001', rate: 5, amount: 14.4, createdAt: '2026-08-15 11:32' },
  { id: 'SR-D002', userId: 'U9002', orderId: 'NJ202608141026', orderAmount: 128, role: 'promoter', promoterId: 'T001', rate: 8, amount: 10.24, createdAt: '2026-08-14 10:26' },
  { id: 'SR-D003', userId: 'U9003', orderId: 'NJ202608121843', orderAmount: 68.9, role: 'promoter', promoterId: 'T001', rate: 10, amount: 6.89, createdAt: '2026-08-12 18:43' },
  { id: 'SR-D004', userId: 'U9004', orderId: 'NJ202608110947', orderAmount: 59.9, role: 'promoter', promoterId: 'T001', rate: 8, amount: 4.79, createdAt: '2026-08-11 09:47' },
  { id: 'SR-D005', userId: 'U9005', orderId: 'NJ202608091618', orderAmount: 45, role: 'promoter', promoterId: 'T001', rate: 5, amount: 2.25, createdAt: '2026-08-09 16:18' },
  { id: 'SR-D006', userId: 'U9011', orderId: 'NJ202608161032', orderAmount: 198, role: 'promoter', promoterId: 'T002', rate: 8, amount: 15.84, createdAt: '2026-08-16 10:32' },
  { id: 'SR-D007', userId: 'U9012', orderId: 'NJ202608151548', orderAmount: 88, role: 'promoter', promoterId: 'T002', rate: 8, amount: 7.04, createdAt: '2026-08-15 15:48' },
  { id: 'SR-D008', userId: 'U9013', orderId: 'NJ202608141210', orderAmount: 128, role: 'promoter', promoterId: 'T002', rate: 5, amount: 6.4, createdAt: '2026-08-14 12:10' }
]

export const demoUserBindings: Record<string, UserBinding> = {
  U9001: { userId: 'U9001', promoterId: 'T001', status: 'bound', boundAt: '2026-08-15 11:35' },
  U9002: { userId: 'U9002', promoterId: 'T001', status: 'bound', boundAt: '2026-08-14 10:30' },
  U9003: { userId: 'U9003', promoterId: 'T001', status: 'pending' },
  U9004: { userId: 'U9004', promoterId: 'T001', status: 'bound', boundAt: '2026-08-11 09:50' },
  U9005: { userId: 'U9005', promoterId: 'T001', status: 'pending' },
  U9011: { userId: 'U9011', promoterId: 'T002', status: 'bound', boundAt: '2026-08-16 10:35' },
  U9012: { userId: 'U9012', promoterId: 'T002', status: 'bound', boundAt: '2026-08-15 15:50' }
}

function mergeDemoRecordsById<T extends { id: string }>(existing: T[] | null, seeds: T[]): T[] {
  const current = existing ? [...existing] : []
  const ids = new Set(current.map((item) => item.id))
  seeds.forEach((seed) => { if (!ids.has(seed.id)) { current.push(cloneSeed(seed)); ids.add(seed.id) } })
  return current
}

export function seedPlatformDemoData(): void {
  const shares = mergeDemoRecordsById(readShareRecords(), demoShareRecords)
  if (!readShareRecords() || shares.length !== (readShareRecords() || []).length) writeShareRecords(shares)
  const bindings = { ...(readUserBindings() || {}) }
  let bindingAdded = !readUserBindings()
  Object.entries(demoUserBindings).forEach(([id, binding]) => {
    if (!bindings[id]) { bindings[id] = cloneSeed(binding); bindingAdded = true }
  })
  if (bindingAdded) writeUserBindings(bindings)
  farmhouseExperiences.forEach((experience) => {
    if (!readPlatformExperiences()?.[experience.id]) writePlatformExperience(cloneSeed(experience))
  })
}

// ===== 中台主数据发布：admin 维护的商品/门店/供应商/价格策略/品类全字段发布，其他应用读取覆盖 =====
export const PLATFORM_ENTITIES_STORAGE_KEY = 'agritainment-platform-entities'

export type PlatformEntityKind = 'products' | 'farms' | 'suppliers' | 'policies' | 'categories' | 'promoters'

export interface PlatformEntities {
  products?: Record<string, Product>
  farms?: Record<string, FarmStore>
  suppliers?: Record<string, Supplier>
  policies?: Record<string, PricePolicy>
  categories?: Record<string, Category>
  promoters?: Record<string, Promoter>
  deliverDate?: string
  updatedAt: string
}

export function readPlatformEntities(): PlatformEntities | null {
  const entities = readPlatformJson<PlatformEntities>(PLATFORM_ENTITIES_STORAGE_KEY)
  return entities && typeof entities === 'object' ? entities : null
}

export function writePlatformEntities(entities: PlatformEntities): boolean {
  return writePlatformJson(PLATFORM_ENTITIES_STORAGE_KEY, entities)
}

/** 按 id 整体覆盖某类实体快照（无删除语义：商品/门店用上下架/停用表达业务状态） */
export function upsertPlatformEntity(kind: PlatformEntityKind, id: string, entity: unknown): boolean {
  if (!id || !entity || typeof entity !== 'object') return false
  const base = readPlatformEntities() ?? { updatedAt: '' }
  const map = { ...((base[kind] as Record<string, unknown> | undefined) || {}) }
  map[id] = entity
  const next: PlatformEntities = { ...base, [kind]: map, updatedAt: new Date().toISOString() }
  return writePlatformEntities(next) && JSON.stringify(readPlatformEntities()?.[kind]?.[id]) === JSON.stringify(entity)
}

export function removePlatformEntity(kind: PlatformEntityKind, id: string): boolean {
  if (!id) return false
  const base = readPlatformEntities() ?? { updatedAt: '' }
  const map = { ...((base[kind] as Record<string, unknown> | undefined) || {}) }
  map[id] = null
  const next: PlatformEntities = { ...base, [kind]: map, updatedAt: new Date().toISOString() }
  return writePlatformEntities(next) && (readPlatformEntities()?.[kind] as Record<string, unknown> | undefined)?.[id] === null
}

/** 平台实体覆盖种子：按 id 整体替换，追加平台独有实体；无记录保持种子 */
export function mergePlatformEntities<T extends { id: string }>(list: T[], map: Record<string, T | null> | undefined): T[] {
  if (!map) return list
  const existing = new Set(list.map((item) => item.id))
  const merged = list.filter((item) => map[item.id] !== null).map((item) => (map[item.id] ? { ...item, ...map[item.id] } : item))
  for (const entity of Object.values(map)) {
    if (!entity) continue
    if (!existing.has(entity.id)) merged.push(entity)
  }
  return merged
}

export function applyPlatformEntities(
  products: Product[] | null | undefined,
  farms: FarmStore[] | null | undefined,
  suppliers: Supplier[] | null | undefined,
  policies: PricePolicy[] | null | undefined,
  categories: Category[] | null | undefined,
  entities: PlatformEntities | null = readPlatformEntities()
): void {
  if (!entities) return
  if (Array.isArray(products) && entities.products) products.splice(0, products.length, ...mergePlatformEntities(products, entities.products))
  if (Array.isArray(farms) && entities.farms) farms.splice(0, farms.length, ...mergePlatformEntities(farms, entities.farms))
  if (Array.isArray(suppliers) && entities.suppliers) suppliers.splice(0, suppliers.length, ...mergePlatformEntities(suppliers, entities.suppliers))
  if (Array.isArray(policies) && entities.policies) policies.splice(0, policies.length, ...mergePlatformEntities(policies, entities.policies))
  if (Array.isArray(categories) && entities.categories) categories.splice(0, categories.length, ...mergePlatformEntities(categories, entities.categories))
}

// ===== 订单/售后跨端串联：消费端下单写入，中台履约/售后处理回写 =====
export const PLATFORM_ORDERS_STORAGE_KEY = 'agritainment-platform-orders'
export const PLATFORM_AFTERSALES_STORAGE_KEY = 'agritainment-platform-after-sales'

export function readPlatformOrders(): Record<string, Order> | null {
  const orders = readPlatformJson<Record<string, Order>>(PLATFORM_ORDERS_STORAGE_KEY)
  return orders && typeof orders === 'object' ? orders : null
}
export function writePlatformOrder(order: Order): boolean {
  const orders = readPlatformOrders() ?? {}
  return writePlatformJson(PLATFORM_ORDERS_STORAGE_KEY, { ...orders, [order.id]: order })
}

export function readPlatformPromoters(): Record<string, Promoter> {
  return readPlatformEntities()?.promoters || {}
}

export function persistPlatformEntity(kind: PlatformEntityKind, id: string, entity: unknown): boolean {
  return upsertPlatformEntity(kind, id, entity)
}
export function writePlatformOrders(orders: Record<string, Order>): boolean {
  return writePlatformJson(PLATFORM_ORDERS_STORAGE_KEY, orders)
}
export function mergePlatformOrders(defaults: Order[], published: Record<string, Order> | null): Order[] {
  if (!published) return defaults
  const byId = new Map(defaults.map((item) => [item.id, item]))
  const merged = defaults.map((item) => published[item.id] ?? item)
  for (const order of Object.values(published)) {
    if (!byId.has(order.id)) merged.unshift(order)
  }
  return merged
}
export function readPlatformAfterSales(): Record<string, AfterSale> | null {
  const works = readPlatformJson<Record<string, AfterSale>>(PLATFORM_AFTERSALES_STORAGE_KEY)
  return works && typeof works === 'object' ? works : null
}
export function writePlatformAfterSale(work: AfterSale): boolean {
  const works = readPlatformAfterSales() ?? {}
  return writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, { ...works, [work.id]: work })
}
export function writePlatformAfterSales(works: Record<string, AfterSale> | null): boolean {
  if (works === null) {
    clearPlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY)
    return readPlatformAfterSales() === null
  }
  return !!works && writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, works)
}
export function mergePlatformAfterSales(defaults: AfterSale[], published: Record<string, AfterSale> | null): AfterSale[] {
  if (!published) return defaults
  const byId = new Map(defaults.map((item) => [item.id, item]))
  const merged = defaults.map((item) => published[item.id] ?? item)
  for (const work of Object.values(published)) {
    if (!byId.has(work.id)) merged.unshift(work)
  }
  return merged
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  'pending-payment': '待付款', pending: '待发货', shipping: '已发货', delivered: '已完成', 'after-sale': '已完成',
  'paid-cancelled': '已支付取消', 'unpaid-cancelled': '未支付取消'
}

export function orderStatusText(status: OrderStatus): string {
  return ORDER_STATUS_TEXT[status] || status
}

/** 消费端读取中台回写的订单状态（未出现在平台通道返回 null） */
export function readPlatformOrderStatus(orderId: string): string | null {
  const order = readPlatformOrders()?.[orderId]
  return order ? orderStatusText(order.status) : null
}

export function readPlatformOrder(orderId: string): Order | null {
  return readPlatformOrders()?.[orderId] || null
}
export function readPlatformAfterSaleStatus(orderId: string): string | null {
  const work = Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === orderId)
  if (!work) return null
  const map: Record<string, string> = { processing: '售后中', rejected: '售后拒绝', 'refund-pending': '待退款', 'return-pending': '待退货', refunded: '已退款', 'refund-failed': '退款失败' }
  return map[work.status] || work.status
}

// ===== 佣金结算回流：中台结算后同步业务员端 =====
export const PLATFORM_SETTLEMENTS_STORAGE_KEY = 'agritainment-platform-settlements'

export interface PlatformCommissionSettlement {
  commission: number
  settled: boolean
  settledAt?: string
}

export function readPlatformCommissionSettlement(promoterId: string): PlatformCommissionSettlement | null {
  const settlements = readPlatformJson<Record<string, PlatformCommissionSettlement>>(PLATFORM_SETTLEMENTS_STORAGE_KEY)
  return settlements?.[promoterId] || null
}

export function writePlatformCommissionSettlement(promoterId: string, payload: PlatformCommissionSettlement): boolean {
  if (!promoterId?.trim() || !payload || !Number.isFinite(Number(payload.commission))) return false
  const settlements = { ...(readPlatformJson<Record<string, PlatformCommissionSettlement>>(PLATFORM_SETTLEMENTS_STORAGE_KEY) || {}) }
  settlements[promoterId] = payload
  return writePlatformJson(PLATFORM_SETTLEMENTS_STORAGE_KEY, settlements)
}
export function readPlatformCommissionSettlements(): Record<string, PlatformCommissionSettlement> {
  const settlements = readPlatformJson<Record<string, PlatformCommissionSettlement>>(PLATFORM_SETTLEMENTS_STORAGE_KEY)
  return settlements && typeof settlements === 'object' ? settlements : {}
}
export function writePlatformCommissionSettlements(settlements: Record<string, PlatformCommissionSettlement>): boolean {
  return writePlatformJson(PLATFORM_SETTLEMENTS_STORAGE_KEY, settlements)
}



/** 门店账号：中控台与门店端店长工作台共享 */
export function readPlatformStoreAccounts(): StoreAccount[] | null {
  const accounts = readPlatformJson<StoreAccount[]>(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY)
  return Array.isArray(accounts) ? accounts : null
}
export function writePlatformStoreAccounts(accounts: StoreAccount[]): boolean {
  return writePlatformJson(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, accounts)
}
export function mergePlatformStoreAccounts(defaults: StoreAccount[], published: StoreAccount[] | null): StoreAccount[] {
  if (!published) return defaults
  const byId = new Map(published.map((item) => [item.id, item]))
  const merged = defaults.map((item) => byId.get(item.id) ?? item)
  const ids = new Set(merged.map((item) => item.id))
  return [...merged, ...published.filter((item) => !ids.has(item.id))]
}

/** 消费分成计算：正式绑定 + 全局比例 */
export function resolveShare(
  binding: UserBinding | null | undefined,
  config: ShareConfig,
  amount: number
): { role: 'promoter' | 'staff'; rate: number; amount: number } | null {
  if (!binding || binding.status !== 'bound' || !Number.isFinite(amount) || amount <= 0) return null
  const role = binding.promoterId ? 'promoter' : binding.staffAccountId ? 'staff' : null
  if (!role) return null
  const rate = role === 'promoter' ? config.promoterRate : config.staffRate
  return { role, rate, amount: round2((amount * rate) / 100) }
}


/** 用户身份：openid 锚定到稳定 userId，用户端 / 门店端统一 */
export const USER_ID_STORAGE_KEY = 'agritainment-user-id'
export const PLATFORM_USER_LINKS_STORAGE_KEY = 'agritainment-platform-user-links'

function readUserStorageValue(key: string): string {
  const storage = platformJsonStorage()
  if (!storage) return ''
  try {
    let saved = storage.read(key)
    if (typeof saved === 'string') {
      try {
        saved = JSON.parse(saved)
      } catch {
        // 非 JSON 字符串（如纯 userId）
      }
    }
    if (typeof saved === 'string') return saved
    if (saved && typeof saved === 'object' && 'data' in saved) {
      const data = (saved as { data?: unknown }).data
      if (typeof data === 'string') return data
    }
  } catch {
    // 忽略
  }
  return ''
}

function writeUserStorageValue(key: string, value: string): void {
  const storage = platformJsonStorage()
  if (!storage) return
  try {
    storage.write(key, value)
  } catch {
    // 忽略
  }
}

/** 读取或生成本地匿名 userId（两端共用，H5 同源一致） */
export function getOrCreateUserId(): string {
  const saved = readUserStorageValue(USER_ID_STORAGE_KEY)
  if (saved) return saved
  const userId = createId('U')
  writeUserStorageValue(USER_ID_STORAGE_KEY, userId)
  return userId
}

/** openid -> userId 映射（共享通道，H5 同域共享） */
export function readUserLinks(): Record<string, string> | null {
  const links = readPlatformJson<Record<string, string>>(PLATFORM_USER_LINKS_STORAGE_KEY)
  return links && typeof links === 'object' ? links : null
}
export function writeUserLink(openid: string, userId: string): boolean {
  if (!openid?.trim() || !userId?.trim()) return false
  const links = readUserLinks() ?? {}
  return writePlatformJson(PLATFORM_USER_LINKS_STORAGE_KEY, { ...links, [openid]: userId })
}
export function resolveUserIdByOpenid(openid: string): string {
  if (!openid) return ''
  return (readUserLinks() ?? {})[openid] || ''
}

/** 以 openid 解析统一 userId：已映射则复用；否则用本地 userId 并建立 openid↔userId 映射 */
export function resolveUserIdentity(openid: string): string {
  if (!openid) return getOrCreateUserId()
  const linked = resolveUserIdByOpenid(openid)
  if (linked) return linked
  // 每个授权主体独立生成用户 ID；设备级匿名 ID 只服务于未授权旧流程。
  const userId = createId('U')
  writeUserLink(openid, userId)
  return userId
}

// ===== 供应商履约：司机账号 / 配送交接 / 缺货（apps/supplier）=====
export const PLATFORM_DRIVERS_STORAGE_KEY = 'agritainment-platform-drivers'
export const SUPPLIER_DEMO_ID = 'S002'
export const SUPPLIER_DEMO_ACCOUNT = 'supplier'
export const SUPPLIER_DEMO_PASSWORD = '123456'

export function readPlatformDrivers(): DriverAccount[] | null {
  const drivers = readPlatformJson<DriverAccount[]>(PLATFORM_DRIVERS_STORAGE_KEY)
  return Array.isArray(drivers) ? drivers : null
}
export function writePlatformDrivers(drivers: DriverAccount[]): boolean {
  return writePlatformJson(PLATFORM_DRIVERS_STORAGE_KEY, drivers)
}
export function mergePlatformDrivers(defaults: DriverAccount[], published: DriverAccount[] | null): DriverAccount[] {
  if (!published) return defaults
  const byId = new Map(published.map((item) => [item.id, item]))
  const merged = defaults.map((item) => byId.get(item.id) ?? item)
  const ids = new Set(merged.map((item) => item.id))
  return [...merged, ...published.filter((item) => !ids.has(item.id))]
}

export const demoDrivers: DriverAccount[] = [
  { id: 'D001', supplierId: SUPPLIER_DEMO_ID, name: '张伟', account: 'driver01', password: '123456', phone: '13711110001', status: 'active', createdAt: '2026-08-18 09:00' },
  { id: 'D002', supplierId: SUPPLIER_DEMO_ID, name: '李强', account: 'driver02', password: '123456', phone: '13711110002', status: 'active', createdAt: '2026-08-18 09:05' },
  { id: 'D003', supplierId: SUPPLIER_DEMO_ID, name: '王芳', account: 'driver03', password: '123456', phone: '13711110003', status: 'active', createdAt: '2026-08-18 09:10' }
]

export const demoNamedDeliveryRoutes: NamedDeliveryRoute[] = [
  { id: 'NR-S002-EAST', supplierId: SUPPLIER_DEMO_ID, name: '东线', storeIds: ['F001', 'F002'], driverId: 'D001', updatedAt: '2026-08-18T09:20:00.000Z' },
  { id: 'NR-S002-WEST', supplierId: SUPPLIER_DEMO_ID, name: '西线', storeIds: ['F003'], driverId: 'D002', updatedAt: '2026-08-18T09:21:00.000Z' }
]

const supplierStatusToOrderStatus: Record<PurchaseStatus, OrderStatus> = {
  submitted: 'pending', accepted: 'pending', shipped: 'shipping', delivering: 'shipping', received: 'delivered', completed: 'delivered', cancelled: 'unpaid-cancelled'
}

/** 门店进货单若无履约信息（如 store 直接提交的单），按 Order.status 推导初始履约状态 */
export function ensureSupplierFulfillment(order: Order): SupplierFulfillment {
  if (order.supplierFulfillment) return order.supplierFulfillment
  const status: PurchaseStatus =
    order.status === 'shipping' ? 'shipped' :
    order.status === 'delivered' ? 'received' :
    order.status === 'unpaid-cancelled' || order.status === 'paid-cancelled' ? 'cancelled' : 'submitted'
  return { status, shortages: [], handovers: [], updatedAt: order.createdAt }
}

export function computeShortage(items: OrderItem[], actuals: Record<string, number>): ShortageItem[] {
  return items
    .map((item) => {
      const raw = actuals[item.skuId]
      const actual = Number.isFinite(raw) ? Math.max(0, Math.min(item.quantity, Math.round(raw))) : item.quantity
      return { skuId: item.skuId, name: item.name, ordered: item.quantity, actual, shortage: item.quantity - actual }
    })
    .filter((item) => item.shortage > 0)
}

export interface SupplierMetrics {
  toAcceptCount: number
  toDispatchCount: number
  toHandoverCount: number
  deliveringCount: number
  shortageOrderCount: number
  todayOrderCount: number
  todayAmount: number
}

export function deriveSupplierMetrics(orders: Order[]): SupplierMetrics {
  const now = new Date()
  const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isToday = (value: string) => value.startsWith(todayPrefix)
  const isTodayInTransit = (order: Order) => {
    const fulfillment = order.supplierFulfillment
    return fulfillment?.deliverDate === todayString() && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
  }
  const todayOrders = orders.filter((order) => isToday(order.createdAt))
  return {
    toAcceptCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'submitted').length,
    toDispatchCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'accepted').length,
    toHandoverCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'shipped').length,
    deliveringCount: orders.filter((order) => ensureSupplierFulfillment(order).status === 'delivering').length,
    shortageOrderCount: orders.filter((order) => isTodayInTransit(order) && (order.supplierFulfillment?.shortages.length || 0) > 0).length,
    todayOrderCount: todayOrders.length,
    todayAmount: round2(todayOrders.reduce((sum, order) => sum + order.amount, 0))
  }
}

export interface TodayFarmhouseQuantities {
  storeCount: number
  itemCount: number
  pendingShipItemCount: number
  shortageItemCount: number
  deliveringItemCount: number
}

function isFarmhouseSupplyOrder(order: Order): boolean {
  if (order.supplierOrderLink?.source === 'c-mall') return false
  return order.channel === 'purchase' || order.supplierOrderLink?.source === 'farmhouse-courier'
}

function farmhouseOrderItemCount(order: Order): number {
  return (order.items || []).reduce((sum, item) => sum + item.quantity, 0)
}

export function deriveTodayFarmhouseQuantities(
  orders: Order[],
  storeKeyOf: (order: Order) => string | undefined = (order) => order.storeId || order.storeName || order.customer
): TodayFarmhouseQuantities {
  const today = todayString()
  const isToday = (value: string) => value.startsWith(today)
  const isTodayInTransit = (order: Order) => {
    const fulfillment = order.supplierFulfillment
    return fulfillment?.deliverDate === today && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
  }
  const scoped = orders.filter(isFarmhouseSupplyOrder)
  const todayOrders = scoped.filter((order) => isToday(order.createdAt))
  const stores = new Set<string>()
  for (const order of todayOrders) {
    const key = storeKeyOf(order)
    if (key) stores.add(key)
  }
  return {
    storeCount: stores.size,
    itemCount: todayOrders.reduce((sum, order) => sum + farmhouseOrderItemCount(order), 0),
    pendingShipItemCount: scoped
      .filter((order) => ensureSupplierFulfillment(order).status === 'accepted')
      .reduce((sum, order) => sum + farmhouseOrderItemCount(order), 0),
    shortageItemCount: scoped
      .filter(isTodayInTransit)
      .reduce((sum, order) => sum + (order.supplierFulfillment?.shortages || []).reduce((qty, item) => qty + item.shortage, 0), 0),
    deliveringItemCount: scoped
      .filter((order) => ensureSupplierFulfillment(order).status === 'delivering')
      .reduce((sum, order) => sum + farmhouseOrderItemCount(order), 0)
  }
}

export function driverActiveTaskCounts(orders: Order[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const order of orders) {
    const fulfillment = order.supplierFulfillment
    if (fulfillment?.driverId && fulfillment.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')) {
      result[fulfillment.driverId] = (result[fulfillment.driverId] || 0) + 1
    }
  }
  return result
}

export function validateSupplierAccount(account: string, password: string): boolean {
  return account.trim() === SUPPLIER_DEMO_ACCOUNT && password === SUPPLIER_DEMO_PASSWORD
}
export function findDriverByAccount(drivers: DriverAccount[], account: string): DriverAccount | null {
  return drivers.find((driver) => driver.account === account.trim()) || null
}
export function findActiveDriver(drivers: DriverAccount[], account: string, password: string): DriverAccount | null {
  const driver = findDriverByAccount(drivers, account)
  return driver && driver.status === 'active' && driver.password === password ? driver : null
}

function flowEvent(action: string, operator: string, note?: string): OrderFlowEvent {
  const event: OrderFlowEvent = { time: new Date().toISOString(), action, operator }
  if (note) event.note = note
  return event
}

function fulfillmentEvent(orderId: string, from: string, to: string, operatorId: string, operatorRole: string, subOrderId?: string): FulfillmentEvent {
  return { id: createId('FUL'), orderId, subOrderId, from, to, operatorId, operatorRole, createdAt: new Date().toISOString() }
}

function logisticsEvent(title: string, detail: string): LogisticsEvent {
  return { time: new Date().toISOString(), title, detail }
}

export function acceptSupplierOrder(order: Order, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'submitted') return null
  const now = new Date().toISOString()
  return {
    ...order,
    status: 'pending',
    flow: [...(order.flow || []), flowEvent('中台已接单 · 供应商已接单，备货中', operator)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'submitted', 'accepted', operator, 'supplier')],
    supplierFulfillment: { ...fulfillment, status: 'accepted', updatedAt: now }
  }
}

export function assignSupplierDriver(order: Order, driver: DriverAccount, operator: string, deliveryDate = todayString()): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'accepted') return null
  if (!driver || driver.status !== 'active') return null
  if (driver.supplierId !== (order.supplierId || SUPPLIER_DEMO_ID)) return null
  const now = new Date().toISOString()
  return {
    ...order,
    status: 'shipping',
    flow: [...(order.flow || []), flowEvent(`已发货 · 已指派司机 ${driver.name} 配送`, operator)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'accepted', 'shipped', operator, 'supplier')],
    supplierFulfillment: { ...fulfillment, status: 'shipped', shipType: 'driver', driverId: driver.id, driverName: driver.name, deliverDate: deliveryDate, updatedAt: now }
  }
}

export function reassignSupplierDriver(order: Order, driver: DriverAccount, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (!fulfillment.driverId || fulfillment.shipType !== 'driver') return null
  if (fulfillment.status !== 'shipped' && fulfillment.status !== 'delivering') return null
  if (!driver || driver.status !== 'active' || driver.id === fulfillment.driverId) return null
  if (driver.supplierId !== (order.supplierId || SUPPLIER_DEMO_ID)) return null
  const now = new Date().toISOString()
  return {
    ...order,
    status: 'shipping',
    flow: [...(order.flow || []), flowEvent(`改派司机 · ${driver.name}（原 ${fulfillment.driverName || '未指派'}）`, operator)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, fulfillment.status, fulfillment.status, operator, 'supplier')],
    supplierFulfillment: { ...fulfillment, driverId: driver.id, driverName: driver.name, updatedAt: now }
  }
}

export function shipSupplierCourier(order: Order, trackingNo: string, operator: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'accepted') return null
  if (!trackingNo || !trackingNo.trim()) return null
  const now = new Date().toISOString()
  return {
    ...order,
    status: 'shipping',
    trackingNo: trackingNo.trim(),
    flow: [...(order.flow || []), flowEvent(`已发货 · 快递直发，运单 ${trackingNo.trim()}`, operator)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'accepted', 'shipped', operator, 'supplier')],
    logistics: [...(order.logistics || []), logisticsEvent('商品已发货', `快递已揽收，运单号 ${trackingNo.trim()}`)],
    supplierFulfillment: { ...fulfillment, status: 'shipped', shipType: 'courier', trackingNo: trackingNo.trim(), deliverDate: todayString(), updatedAt: now }
  }
}

export function handoverSupplierOut(order: Order, actuals: Record<string, number>, operator: { id: string; name: string; role: 'supplier' | 'driver' }, note?: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'shipped') return null
  const shortages = computeShortage(order.items || [], actuals)
  const now = new Date().toISOString()
  const handover: HandoverLog = { id: createId('H'), type: 'out', orderId: order.id, time: now, operatorId: operator.id, operatorName: operator.name, operatorRole: operator.role, shortageCount: shortages.length }
  if (note) handover.note = note
  const flow = [...(order.flow || []), flowEvent(fulfillment.shipType === 'courier' ? '出库交接完成 · 快递揽收' : `出库交接完成 · 司机 ${fulfillment.driverName || ''} 领货`, operator.name)]
  if (shortages.length) {
    flow.push(flowEvent(`缺货 ${shortages.length} 项：${shortages.map((item) => `${item.name} -${item.shortage}`).join('、')}`, operator.name))
  }
  return {
    ...order,
    status: 'shipping',
    flow,
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'shipped', 'delivering', operator.id, operator.role)],
    logistics: fulfillment.shipType === 'courier' ? [...(order.logistics || []), logisticsEvent('运输中', '包裹已进入模拟运输流程')] : order.logistics,
    supplierFulfillment: { ...fulfillment, status: 'delivering', shortages, handovers: [...fulfillment.handovers, handover], updatedAt: now }
  }
}

export function handoverSupplierIn(order: Order, operator: { id: string; name: string; role: 'supplier' | 'driver' }, note?: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'delivering' || fulfillment.shipType !== 'driver') return null
  if (fulfillment.driverId !== operator.id) return null
  const now = new Date().toISOString()
  const handover: HandoverLog = { id: createId('H'), type: 'in', orderId: order.id, time: now, operatorId: operator.id, operatorName: operator.name, operatorRole: operator.role }
  if (note) handover.note = note
  return {
    ...order,
    status: 'delivered',
    flow: [...(order.flow || []), flowEvent(`到店交接完成 · 司机 ${operator.name} 已与门店交接`, operator.name)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'delivering', 'received', operator.id, operator.role)],
    supplierFulfillment: { ...fulfillment, status: 'received', handovers: [...fulfillment.handovers, handover], updatedAt: now }
  }
}

export function confirmCourierDelivered(order: Order, operator: { id: string; name: string; role: 'supplier' | 'driver' }): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  if (fulfillment.status !== 'delivering' || fulfillment.shipType !== 'courier') return null
  const now = new Date().toISOString()
  return {
    ...order,
    status: 'delivered',
    flow: [...(order.flow || []), flowEvent('已签收 · 快递送达门店', operator.name)],
    fulfillmentEvents: [...(order.fulfillmentEvents || []), fulfillmentEvent(order.id, 'delivering', 'received', operator.id, operator.role)],
    logistics: [...(order.logistics || []), logisticsEvent('已签收', '包裹已由收货方签收')],
    supplierFulfillment: { ...fulfillment, status: 'received', updatedAt: now }
  }
}

export function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function markShortageHandled(order: Order, skuId: string, operatorName: string): Order | null {
  const fulfillment = ensureSupplierFulfillment(order)
  const target = fulfillment.shortages.find((item) => item.skuId === skuId)
  if (!target || target.handled) return null
  const now = new Date().toISOString()
  const shortages = fulfillment.shortages.map((item) => item.skuId === skuId ? { ...item, handled: true, handledAt: now } : item)
  return {
    ...order,
    flow: [...(order.flow || []), flowEvent(`已标记补发 · ${target.name} 缺 ${target.shortage}`, operatorName)],
    supplierFulfillment: { ...fulfillment, shortages, updatedAt: now }
  }
}

// ===== C端分销商城 =====
export type CUserLevel = 'normal' | 'level1' | 'level2'
export type CProductStatus = 'active' | 'offline'
export type COrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'received' | 'cancelled' | 'after_sale' | 'partially_shipped' | 'partially_received' | 'partially_after_sale'
export type CCommissionStatus = 'pending' | 'available' | 'withdrawn' | 'reversed'

export interface CProductSku {
  id: string
  name: string
  image: string
  stock: number
  basePrice: number
  level1Commission: number
  level2Commission: number
  minimumOrderQuantity?: number
}

export interface CProduct {
  id: string
  name: string
  category: string
  supplierId: string
  supplierName: string
  image: string
  images?: string[]
  tags: string[]
  status: CProductStatus
  shippingType: 'courier'
  skus: CProductSku[]
  channels?: { store?: boolean; live?: boolean }
  expressDelivery?: boolean
  productType?: ProductType
}

export function catalogChannelFlags(channel: CatalogChannel): { store: boolean; live: boolean } {
  return { store: channel === 'store' || channel === 'all', live: channel === 'live' || channel === 'all' }
}

export function catalogPriceForSku(sku: CatalogSku, level: CUserLevel): number {
  if (level === 'level1') return round2(sku.retailPrice - sku.level1Amount - sku.level2Amount)
  if (level === 'level2') return round2(sku.retailPrice - sku.level2Amount)
  return round2(sku.retailPrice)
}

export function allocateCatalogCommissions(
  items: Array<{ quantity: number; level1Amount: number; level2Amount: number }>,
  chain: CCommissionChain,
  buyerLevel: CUserLevel
): Array<{ beneficiaryId: string; beneficiaryLevel: 'level1' | 'level2'; amount: number }> {
  const level1Amount = round2(items.reduce((sum, item) => sum + item.level1Amount * item.quantity, 0))
  const level2Amount = round2(items.reduce((sum, item) => sum + item.level2Amount * item.quantity, 0))
  if (buyerLevel === 'level1') return []
  if (buyerLevel === 'level2') {
    return chain.level1Id && level1Amount > 0
      ? [{ beneficiaryId: chain.level1Id, beneficiaryLevel: 'level1', amount: level1Amount }]
      : []
  }
  const result: Array<{ beneficiaryId: string; beneficiaryLevel: 'level1' | 'level2'; amount: number }> = []
  if (chain.level1Id && level1Amount > 0) result.push({ beneficiaryId: chain.level1Id, beneficiaryLevel: 'level1', amount: level1Amount })
  if (chain.level2Id && level2Amount > 0) result.push({ beneficiaryId: chain.level2Id, beneficiaryLevel: 'level2', amount: level2Amount })
  return result
}

export interface StoreCatalogCommissionLine {
  unitPrice: number
  quantity: number
  promoterCommissionRate: number
  storeCommissionRate: number
}

export interface StoreCatalogReferral {
  type: 'promoter' | 'staff'
  beneficiaryId: string
}

export function allocateStoreCatalogCommission(
  lines: StoreCatalogCommissionLine[],
  referral: StoreCatalogReferral | null,
  storeOwnerId: string
): { beneficiaryId: string; beneficiaryType: 'promoter' | 'staff' | 'owner'; amount: number } | null {
  const beneficiaryId = referral?.beneficiaryId || storeOwnerId
  if (!beneficiaryId || !lines.length) return null
  const usePromoterRate = referral?.type === 'promoter'
  const amount = round2(lines.reduce((sum, line) => {
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isInteger(line.quantity) || line.quantity <= 0) return sum
    const rate = usePromoterRate ? line.promoterCommissionRate : line.storeCommissionRate
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return sum
    return sum + round2(line.unitPrice * line.quantity * rate / 100)
  }, 0))
  return {
    beneficiaryId,
    beneficiaryType: referral?.type || 'owner',
    amount
  }
}

function channelFromLegacy(input: { channels?: { store?: boolean; live?: boolean }; source?: ProductSource }): CatalogChannel {
  const channels = resolveProductChannels(input)
  return channels.store && channels.live ? 'all' : channels.live ? 'live' : 'store'
}

export function normalizeMinimumOrderQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 1
}

export function initialCatalogOrderQuantity(minimumOrderQuantity: unknown): number {
  return Math.max(1, normalizeMinimumOrderQuantity(minimumOrderQuantity))
}

export type CatalogSkuOrderQuantityValidation =
  | { ok: true; minimumOrderQuantity: number; availableStock: number }
  | { ok: false; code: 'invalid_quantity' | 'below_minimum_order_quantity' | 'insufficient_stock'; minimumOrderQuantity: number; availableStock: number }

export function validateCatalogSkuOrderQuantity(
  sku: Pick<CatalogSku, 'stock' | 'minimumOrderQuantity'>,
  quantity: number
): CatalogSkuOrderQuantityValidation {
  const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
  const availableStock = Number.isFinite(sku.stock) ? Math.max(0, Math.floor(sku.stock)) : 0
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, code: 'invalid_quantity', minimumOrderQuantity, availableStock }
  if (quantity < minimumOrderQuantity) return { ok: false, code: 'below_minimum_order_quantity', minimumOrderQuantity, availableStock }
  if (quantity > availableStock) return { ok: false, code: 'insufficient_stock', minimumOrderQuantity, availableStock }
  return { ok: true, minimumOrderQuantity, availableStock }
}

export function canOrderCatalogSku(sku: Pick<CatalogSku, 'stock' | 'minimumOrderQuantity'>, quantity: number): boolean {
  return validateCatalogSkuOrderQuantity(sku, quantity).ok
}

function normalizeCatalogSku(sku: CatalogSku): CatalogSku {
  const next: CatalogSku = { ...sku, minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity), status: sku.status === 'retired' ? 'retired' : 'active' }
  if (typeof next.warningThreshold !== 'number' || !Number.isFinite(next.warningThreshold) || next.warningThreshold <= 0) delete next.warningThreshold
  else next.warningThreshold = Math.floor(next.warningThreshold)
  return next
}

function catalogSkuIsValid(sku: CatalogSku): boolean {
  return !!sku.id && !!sku.name && (!sku.status || sku.status === 'active' || sku.status === 'retired') && (sku.warningThreshold === undefined || (Number.isFinite(sku.warningThreshold) && sku.warningThreshold >= 0)) && [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].every((value) => Number.isFinite(value) && value >= 0) && Number.isInteger(sku.minimumOrderQuantity) && Number(sku.minimumOrderQuantity) >= 0 && sku.retailPrice >= sku.level1Amount + sku.level2Amount
}

function catalogProductIsValid(product: CatalogProduct): boolean {
  if (!product.id || !product.name || !product.skus.length || !product.skus.every(catalogSkuIsValid)) return false
  if (![product.promoterCommissionRate, product.storeCommissionRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return false
  if (product.productType === 'package') return product.channel === 'store' && !product.expressDelivery
  if ((product.channel === 'live' || product.channel === 'all') && !product.expressDelivery) return false
  return true
}

function legacyDistributionAmounts(retailPrice: number, level1Amount: number, level2Amount: number): { level1Amount: number; level2Amount: number } {
  const normalizedRetail = Math.max(0, round2(retailPrice))
  const normalizedLevel2 = Math.min(normalizedRetail, Math.max(0, round2(level2Amount)))
  return {
    level1Amount: Math.min(round2(normalizedRetail - normalizedLevel2), Math.max(0, round2(level1Amount))),
    level2Amount: normalizedLevel2
  }
}

export function catalogProductToProduct(product: CatalogProduct): Product {
  const channels = catalogChannelFlags(product.channel)
  const skus: Sku[] = product.skus.filter((sku) => sku.status !== 'retired').map((sku) => ({ id: sku.id, name: sku.name, image: mediaValueToImage(sku.image), price: sku.retailPrice, cost: sku.cost, stock: sku.stock, level1Amount: sku.level1Amount, level2Amount: sku.level2Amount, minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity) }))
  return {
    id: product.id, name: product.name, category: product.category,
    price: skus.length ? Math.min(...skus.map((sku) => sku.price)) : 0,
    cost: skus.length ? Math.min(...skus.map((sku) => sku.cost)) : 0,
    stock: skus.reduce((sum, sku) => sum + sku.stock, 0), sales: 0,
    source: product.source, status: product.status, image: mediaValueToImage(product.image),
    images: [...product.images].map(mediaValueToImage), supplier: product.supplierName, supplierId: product.supplierId,
    supplierName: product.supplierName, tags: [...product.tags], skus,
    farmIds: [...product.farmIds], channels, channel: product.channel,
    expressDelivery: product.expressDelivery, productType: product.productType,
    commissionRate: product.promoterCommissionRate,
    staffCommissionRate: product.storeCommissionRate,
    promoterCommissionRate: product.promoterCommissionRate,
    storeCommissionRate: product.storeCommissionRate
  }
}

export function catalogProductToStoreProduct(product: CatalogProduct, selection?: StoreCatalogSelection): Product {
  const projected = catalogProductToProduct(product)
  if (!selection?.skuRetailPrices) return projected
  projected.skus.forEach((sku) => {
    const price = selection.skuRetailPrices?.[sku.id]
    if (Number.isFinite(price) && Number(price) >= 0) sku.price = round2(Number(price))
  })
  projected.price = projected.skus.length ? Math.min(...projected.skus.map((sku) => sku.price)) : 0
  return projected
}

export function catalogProductToCProduct(product: CatalogProduct): CProduct {
  const channels = catalogChannelFlags(product.channel)
  return {
    id: product.id, name: product.name, category: product.category,
    supplierId: product.supplierId, supplierName: product.supplierName,
    image: mediaValueToImage(product.image), images: [...product.images].map(mediaValueToImage), tags: [...product.tags],
    status: product.status === 'active' ? 'active' : 'offline', shippingType: 'courier',
    channels, expressDelivery: product.expressDelivery, productType: product.productType,
    skus: product.skus.filter((sku) => sku.status !== 'retired').map((sku) => ({
      id: sku.id, name: sku.name, image: mediaValueToImage(sku.image), stock: sku.stock,
      basePrice: round2(sku.retailPrice - sku.level1Amount - sku.level2Amount),
      level1Commission: sku.level1Amount, level2Commission: sku.level2Amount,
      minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
    }))
  }
}

/** 演示用库存预警阈值：仅让「库存预警 / 变化记录」在初始化演示数据中可见。 */
const DEMO_STOCK_WARNING_THRESHOLDS: Record<string, number> = {
  'C002-10J': 60,
  'C003-GIFT': 80,
  'P011-1': 100
}

function demoStockWarning(skuId: string): { warningThreshold?: number } {
  const threshold = DEMO_STOCK_WARNING_THRESHOLDS[skuId]
  return threshold === undefined ? {} : { warningThreshold: threshold }
}

export function migrateLegacyCatalog(storeProducts: Product[], liveProducts: CProduct[], defaults: PricingDefaults = DEFAULT_PRICING_DEFAULTS): CatalogProduct[] {
  const migratedStore = storeProducts.map((product): CatalogProduct => ({
    id: product.id, name: product.name, category: product.category,
    supplierId: product.supplierId || '', supplierName: product.supplierName || product.supplier,
    source: product.source, status: product.status, image: product.image,
    images: [...(product.images || [])], tags: [...product.tags],
    productType: product.productType || (product.category === '套餐券' ? 'package' : 'goods'), expressDelivery: !!product.expressDelivery,
    channel: product.channel || channelFromLegacy(product), farmIds: [...product.farmIds],
    promoterCommissionRate: product.promoterCommissionRate ?? product.commissionRate ?? defaults.promoterCommissionRate,
    storeCommissionRate: product.storeCommissionRate ?? product.staffCommissionRate ?? defaults.storeCommissionRate,
    skus: (product.skus.length ? product.skus : [{ id: `${product.id}-DEFAULT`, name: product.spec || '默认规格', price: product.price, cost: product.cost, stock: product.stock }]).map((sku) => ({
      id: sku.id, name: sku.name, image: sku.image || product.image,
      retailPrice: round2(sku.price), cost: round2(sku.cost), stock: Math.max(0, Math.floor(sku.stock)),
      status: 'active', minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity), ...demoStockWarning(sku.id),
      ...legacyDistributionAmounts(sku.price, sku.level1Amount ?? defaults.level1Amount, sku.level2Amount ?? defaults.level2Amount)
    }))
  }))
  const migratedLive = liveProducts.map((product): CatalogProduct => ({
    id: product.id, name: product.name, category: product.category,
    supplierId: product.supplierId, supplierName: product.supplierName,
    source: 'platform', status: product.status, image: product.image,
    images: [...(product.images || [])], tags: [...product.tags],
    productType: product.productType || 'goods', expressDelivery: product.expressDelivery ?? true,
    channel: channelFromLegacy(product), farmIds: [],
    promoterCommissionRate: defaults.promoterCommissionRate,
    storeCommissionRate: defaults.storeCommissionRate,
    skus: product.skus.map((sku) => ({
      id: sku.id, name: sku.name, image: sku.image || product.image,
      retailPrice: round2(sku.basePrice + sku.level1Commission + sku.level2Commission),
      cost: round2(sku.basePrice), stock: Math.max(0, Math.floor(sku.stock)),
      status: 'active', minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity), ...demoStockWarning(sku.id),
      level1Amount: round2(sku.level1Commission), level2Amount: round2(sku.level2Commission)
    }))
  }))
  return [...migratedStore, ...migratedLive].filter((product) => product.id && product.name && product.skus.length > 0 && product.skus.every(catalogSkuIsValid))
}

function normalizeCatalogState(value: unknown): CatalogState | null {
  const state = value as Partial<CatalogState> | null
  if (!state || (state.schemaVersion !== 1 && state.schemaVersion !== CATALOG_SCHEMA_VERSION) || !Number.isInteger(state.revision) || Number(state.revision) < 0 || !Array.isArray(state.products)) return null
  if (state.products.some((product) => !product || !Array.isArray(product.skus))) return null
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    revision: Number(state.revision),
    products: cloneSeed(state.products).map((product) => ({
      ...product,
      skus: product.skus.map(normalizeCatalogSku)
    })),
    appliedOperations: state.appliedOperations && typeof state.appliedOperations === 'object' ? cloneSeed(state.appliedOperations) : {}
  }
}

export function readCatalogState(): CatalogState | null {
  const raw = readPlatformJson<CatalogState>(PLATFORM_CATALOG_STORAGE_KEY)
  const state = normalizeCatalogState(raw)
  if (!state || state.products.some((product) => !catalogProductIsValid(product))) return null
  return cloneSeed(state)
}

export function ensureCatalogState(storeProducts: Product[], liveProducts: CProduct[], defaults: PricingDefaults = readPricingDefaults()): CatalogState {
  const existing = readCatalogState()
  if (existing) return existing
  const migrated = readCatalogLegacyMigrationMarker()
  const state: CatalogState = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    revision: 0,
    products: migrateLegacyCatalog(storeProducts, migrated ? [] : liveProducts, defaults),
    appliedOperations: {}
  }
  if (!migrated) writePlatformJson(PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY, { schemaVersion: 1, catalogSchemaVersion: CATALOG_SCHEMA_VERSION, migratedAt: new Date().toISOString() })
  writeCatalogState(state)
  return state
}

export type CatalogAudience = 'user' | 'ordering' | 'farmhouse-selection'

export function catalogProductsForAudience(state: CatalogState, audience: CatalogAudience): CatalogProduct[] {
  return state.products.filter((product) => {
    if (product.status !== 'active' || !product.skus.some((sku) => sku.status !== 'retired')) return false
    const channels = catalogChannelFlags(product.channel)
    if (audience === 'user') return channels.live && product.productType === 'goods' && product.expressDelivery
    return channels.store
  })
}

export function writeCatalogState(state: CatalogState, expectedRevision?: number): boolean {
  const current = readCatalogState()
  if (expectedRevision !== undefined && current?.revision !== expectedRevision) return false
  const normalized = normalizeCatalogState(state)
  if (!normalized || normalized.products.some((product) => !catalogProductIsValid(product))) return false
  if (normalized.appliedOperations) {
    const normalizedOps: Record<string, CatalogStockOperation> = {}
    for (const [id, op] of Object.entries(normalized.appliedOperations)) {
      normalizedOps[id] = { ...op, action: op.action || 'reserve', requestFingerprint: op.requestFingerprint || catalogOperationFingerprint(op.action || 'reserve', op.changes || []), changes: [] }
    }
    normalized.appliedOperations = normalizedOps
  }
  return writePlatformJson(PLATFORM_CATALOG_STORAGE_KEY, normalized)
}

/** 读取库存变动流水（按时间倒序）。 */
export function readCatalogStockLogs(): CatalogStockLogEntry[] {
  const saved = readPlatformJson<Record<string, CatalogStockLogEntry>>(PLATFORM_CATALOG_STOCK_LOG_STORAGE_KEY)
  if (!saved || typeof saved !== 'object') return []
  return Object.values(saved)
    .filter((entry) => !!entry?.id && !!entry.productId && !!entry.skuId)
    .map((entry) => ({ ...entry }))
    .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
}

export function writeCatalogStockLogs(entries: CatalogStockLogEntry[]): boolean {
  const map = Object.fromEntries(entries.filter((entry) => !!entry?.id).map((entry) => [entry.id, { ...entry }]))
  return writePlatformJson(PLATFORM_CATALOG_STOCK_LOG_STORAGE_KEY, map)
}

/** 追加库存流水；同 id 幂等覆盖，返回是否写入成功。 */
export function appendCatalogStockLogs(entries: CatalogStockLogEntry[]): boolean {
  if (!entries.length) return true
  const map = new Map(readCatalogStockLogs().map((entry) => [entry.id, entry]))
  entries.forEach((entry) => map.set(entry.id, { ...entry }))
  return writeCatalogStockLogs([...map.values()])
}

/** 库存预警判定：未配置阈值或阈值不大于 0 视为不预警。 */
export function catalogSkuNeedsRestock(sku: Pick<CatalogSku, 'stock' | 'warningThreshold'>): boolean {
  return typeof sku.warningThreshold === 'number' && Number.isFinite(sku.warningThreshold) && sku.warningThreshold > 0 && sku.stock <= sku.warningThreshold
}

/** 商品内的预警规格列表，供列表标记、筛选与待办跳转共用同一判定。 */
export function catalogProductStockWarnings<TSku extends Pick<CatalogSku, 'stock' | 'warningThreshold'>>(product: { skus: TSku[] }): TSku[] {
  return product.skus.filter((sku) => catalogSkuNeedsRestock(sku))
}

export function saveCatalogProduct(product: CatalogProduct, expectedRevision: number): CatalogState | null {
  const current = readCatalogState()
  if (!current || current.revision !== expectedRevision) return null
  const normalized: CatalogProduct = {
    ...product,
    image: normalizeMediaReference(product.image) || product.image,
    images: (product.images || []).map((img) => normalizeMediaReference(img) || img),
    skus: product.skus.map((sku) => normalizeCatalogSku({ ...sku, image: normalizeMediaReference(sku.image) || sku.image }))
  }
  if (!catalogProductIsValid(normalized)) return null
  const returned: CatalogProduct = {
    ...normalized,
    skus: normalized.skus.map((sku, index) => {
      const result = { ...sku }
      if (product.skus[index].minimumOrderQuantity === undefined) delete result.minimumOrderQuantity
      if (product.skus[index].status === undefined) delete result.status
      return result
    })
  }
  const next = cloneSeed(current)
  const index = next.products.findIndex((item) => item.id === product.id)
  if (index >= 0) next.products[index] = cloneSeed(returned)
  else next.products.unshift(cloneSeed(returned))
  next.revision += 1
  return writeCatalogState(next, expectedRevision) ? next : null
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function writeFailure(code: string, message: string): WriteResult<never> {
  return { ok: false, code, message }
}

function normalizeSubmittedProduct(value: unknown): CatalogProduct | null {
  const normalized = normalizeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [value] })
  const product = normalized?.products[0]
  return product && catalogProductIsValid(product) ? product : null
}

function canonicalFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalFingerprintValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().flatMap((key) => {
    const nested = (value as Record<string, unknown>)[key]
    return nested === undefined ? [] : [[key, canonicalFingerprintValue(nested)]]
  }))
}

function catalogProductFingerprint(product: CatalogProduct): string {
  return JSON.stringify(canonicalFingerprintValue(product))
}

function normalizeCatalogProductSubmissionState(value: unknown): CatalogProductSubmissionState | null {
  const state = value as Partial<CatalogProductSubmissionState> | null
  if (!state || state.schemaVersion !== CATALOG_PRODUCT_SUBMISSION_SCHEMA_VERSION || !Number.isInteger(state.revision) || Number(state.revision) < 0 || !Array.isArray(state.submissions) || !validIsoTimestamp(state.updatedAt)) return null
  const submissions: CatalogProductSubmission[] = []
  const ids = new Set<string>()
  const pendingProductIds = new Set<string>()
  for (const candidate of state.submissions) {
    if (!candidate || !candidate.id?.trim() || ids.has(candidate.id) || !candidate.productId?.trim() || (candidate.source !== 'supplier' && candidate.source !== 'admin') || (candidate.source === 'supplier' && !candidate.supplierId?.trim()) || (candidate.kind !== 'create' && candidate.kind !== 'update') || (candidate.status !== 'pending' && candidate.status !== 'approved' && candidate.status !== 'rejected') || !Number.isInteger(candidate.baseCatalogRevision) || candidate.baseCatalogRevision < 0 || (candidate.baseProductFingerprint !== undefined && !candidate.baseProductFingerprint.trim()) || !candidate.submittedBy?.trim() || !validIsoTimestamp(candidate.submittedAt)) return null
    const draft = normalizeSubmittedProduct(candidate.draft)
    if (!draft || draft.id !== candidate.productId || (candidate.source === 'supplier' && draft.supplierId !== candidate.supplierId)) return null
    if (candidate.status === 'pending') {
      if (pendingProductIds.has(candidate.productId)) return null
      pendingProductIds.add(candidate.productId)
    } else if (!candidate.reviewedBy?.trim() || !validIsoTimestamp(candidate.reviewedAt)) return null
    ids.add(candidate.id)
    submissions.push({
      ...cloneSeed(candidate), draft,
      reviewNote: candidate.reviewNote?.trim() || undefined
    })
  }
  return { schemaVersion: CATALOG_PRODUCT_SUBMISSION_SCHEMA_VERSION, revision: Number(state.revision), submissions, updatedAt: state.updatedAt }
}

export function readCatalogProductSubmissionState(): CatalogProductSubmissionState | null {
  const normalized = normalizeCatalogProductSubmissionState(readPlatformJson<unknown>(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY))
  return normalized ? cloneSeed(normalized) : null
}

export function readCatalogProductSubmissions(): CatalogProductSubmission[] {
  return readCatalogProductSubmissionState()?.submissions ?? []
}

export function writeCatalogProductSubmissionState(next: CatalogProductSubmissionState, expectedRevision: number): boolean {
  const raw = readPlatformJson<unknown>(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
  const current = normalizeCatalogProductSubmissionState(raw)
  if ((raw !== null && !current) || !Number.isInteger(expectedRevision) || (current?.revision ?? 0) !== expectedRevision || next.revision !== expectedRevision + 1) return false
  const normalized = normalizeCatalogProductSubmissionState(next)
  if (!normalized) return false
  if (current && Date.parse(normalized.updatedAt) <= Date.parse(current.updatedAt)) return false
  return writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(normalized))
}

export interface CatalogProductAuditInput {
  module: string
  action: string
  actorId: string
  actorName?: string
  actorRole?: string
  targetType?: string
  targetId?: string
  metadata?: unknown
}

type CatalogProductAuditTransaction = {
  revision: number
  original: PlatformAuditLogEntry[]
  target: PlatformAuditLogEntry[]
}

function createCatalogProductAuditTransaction(audit: CatalogProductAuditInput | undefined, operationId: string): CatalogProductAuditTransaction | null {
  if (!audit) return null
  const entry = createPlatformAuditLogEntry({ ...audit, result: 'success', operationId })
  if (!entry) return null
  const original = readPlatformAuditLogs()
  return { revision: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY), original, target: [entry, ...original].slice(0, 1000) }
}

function catalogProductTransactionFailure(transaction: { code?: string; operationId?: string; failedStep?: string; recoveryQueued?: boolean; fatal?: boolean }, message: string): WriteResult<never> {
  if (transaction.code === 'revision_conflict') return { ...transaction, ok: false, code: 'revision_conflict', message }
  return {
    ok: false,
    code: transaction.recoveryQueued ? 'recovery_queued' : transaction.fatal ? 'recovery_failed' : transaction.failedStep === 'audit' ? 'audit_failed' : 'write_failed',
    message,
    operationId: transaction.operationId,
    failedStep: transaction.failedStep,
    recoveryQueued: transaction.recoveryQueued ?? false,
    fatal: transaction.fatal ?? false
  }
}

export async function createCatalogProductSubmission(
  input: Omit<CatalogProductSubmission, 'productId' | 'status' | 'baseProductFingerprint' | 'reviewedBy' | 'reviewedAt' | 'reviewNote'>,
  expectedRevision: number,
  audit?: CatalogProductAuditInput
): Promise<WriteResult<CatalogProductSubmission>> {
  const initialRevisions = {
    catalog: readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY),
    submissions: readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY),
    audit: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  }
  const raw = readPlatformJson<unknown>(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
  const current = normalizeCatalogProductSubmissionState(raw)
  if (raw !== null && !current) return writeFailure('invalid_payload', '商品提交集合损坏')
  if ((current?.revision ?? 0) !== expectedRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  if (!input?.id?.trim() || (input.source !== 'supplier' && input.source !== 'admin') || (input.source === 'supplier' && !input.supplierId?.trim()) || (input.kind !== 'create' && input.kind !== 'update') || !Number.isInteger(input.baseCatalogRevision) || input.baseCatalogRevision < 0 || !input.submittedBy?.trim() || !validIsoTimestamp(input.submittedAt)) return writeFailure('invalid_payload', '商品提交无效')
  const product = normalizeSubmittedProduct(input.draft)
  if (!product || (input.source === 'supplier' && product.supplierId !== input.supplierId)) return writeFailure('invalid_payload', '商品提交无效')
  const catalog = readCatalogState()
  if (!catalog || catalog.revision !== input.baseCatalogRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const formalProduct = catalog?.products.find((item) => item.id === product.id)
  if ((input.kind === 'create' && formalProduct) || (input.kind === 'update' && !formalProduct)) return writeFailure('invalid_submission_type', '提交类型与正式目录不匹配')
  if (input.source === 'supplier' && input.kind === 'update' && formalProduct?.supplierId !== input.supplierId) return writeFailure('supplier_mismatch', '不能修改其他供应商的商品')
  const submissions = cloneSeed(current?.submissions ?? [])
  if (submissions.some((item) => item.id === input.id)) return writeFailure('duplicate_id', '提交编号已存在')
  if (submissions.some((item) => item.productId === product.id && item.status === 'pending')) return writeFailure('duplicate_pending', '该商品已有待审核提交')
  const submission: CatalogProductSubmission = {
    id: input.id,
    productId: product.id,
    source: input.source,
    supplierId: input.supplierId,
    kind: input.kind,
    status: 'pending',
    draft: product,
    baseCatalogRevision: input.baseCatalogRevision,
    baseProductFingerprint: input.kind === 'update' && formalProduct ? catalogProductFingerprint(formalProduct) : undefined,
    submittedBy: input.submittedBy,
    submittedAt: input.submittedAt
  }
  const next: CatalogProductSubmissionState = { schemaVersion: CATALOG_PRODUCT_SUBMISSION_SCHEMA_VERSION, revision: expectedRevision + 1, submissions: [...submissions, submission], updatedAt: input.submittedAt }
  const operationId = createId('OP-CATALOG-PRODUCT-SUBMISSION')
  const auditTransaction = createCatalogProductAuditTransaction(audit, operationId)
  if (audit && !auditTransaction) return writeFailure('invalid_payload', '商品提交审计信息无效')
  if (initialRevisions.catalog !== readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
    || initialRevisions.submissions !== readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
    || (audit && initialRevisions.audit !== readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY))) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const originalState: CatalogProductSubmissionState = current ?? {
    schemaVersion: CATALOG_PRODUCT_SUBMISSION_SCHEMA_VERSION,
    revision: 0,
    submissions: [],
    updatedAt: new Date(0).toISOString()
  }
  const originalSnapshot: CatalogProductReviewRecoverySnapshot = { catalog, submissions: originalState, auditLogs: auditTransaction?.original }
  const targetSnapshot: CatalogProductReviewRecoverySnapshot = { catalog, submissions: next, auditLogs: auditTransaction?.target }
  const transaction = await runLockedPlatformTransaction({
    operationId,
    collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, ...(auditTransaction ? [PLATFORM_AUDIT_LOG_STORAGE_KEY] : [])],
    original: originalSnapshot,
    target: targetSnapshot,
    recoveryHandlerKey: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY,
    recoverySchema: CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA,
    revisionChecks: [
      { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: initialRevisions.catalog },
      { key: PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, expectedRevision: initialRevisions.submissions },
      ...(auditTransaction ? [{ key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: initialRevisions.audit }] : [])
    ],
    value: submission,
    steps: [
      {
        key: 'product-submission',
        apply: () => writeCatalogProductSubmissionState(next, expectedRevision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readCatalogProductSubmissionState,
          original: originalState,
          target: next,
          writeOriginal: (original) => writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(original))
        })
      },
      ...(auditTransaction ? [{
        key: 'audit',
        apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, auditTransaction.target, auditTransaction.revision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readPlatformAuditLogs,
          original: auditTransaction.original,
          target: auditTransaction.target,
          writeOriginal: (original) => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, cloneSeed(original))
        })
      }] : [])
    ]
  })
  return transaction.ok
    ? { ok: true, value: cloneSeed(submission), operationId }
    : catalogProductTransactionFailure(transaction, transaction.failedStep === 'audit' ? '商品提交日志失败，请重试' : '商品提交保存失败')
}

export const CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY: PlatformProductionRecoveryHandlerKey = 'catalog-product-review-v1'
export const CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA = 'catalog-product-review-snapshot-v1'

interface CatalogProductReviewRecoverySnapshot {
  catalog: CatalogState
  submissions: CatalogProductSubmissionState
  auditLogs?: PlatformAuditLogEntry[]
}

function normalizeCatalogProductReviewRecoverySnapshot(value: unknown): CatalogProductReviewRecoverySnapshot | null {
  const snapshot = value as Partial<CatalogProductReviewRecoverySnapshot> | null
  const catalog = normalizeCatalogState(snapshot?.catalog)
  const submissions = normalizeCatalogProductSubmissionState(snapshot?.submissions)
  const auditLogs = snapshot?.auditLogs
  if (!catalog || !submissions || (auditLogs !== undefined && !Array.isArray(auditLogs))) return null
  return { catalog, submissions, auditLogs: auditLogs === undefined ? undefined : cloneSeed(auditLogs) }
}

export function createCatalogProductReviewRecoveryHandlerRegistration(): PlatformRecoveryHandlerRegistration {
  return createStrictSnapshotRecoveryHandlerRegistration<CatalogProductReviewRecoverySnapshot, { catalogRevision: number; submissionRevision: number; auditRevision: number }>({
    key: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY,
    fields: ['catalog', 'submissions', 'auditLogs'],
    validateJournal: (journal) => journal.recoverySchema === CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA
      && journal.collections.includes(PLATFORM_CATALOG_STORAGE_KEY)
      && journal.collections.includes(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
      && !!normalizeCatalogProductReviewRecoverySnapshot(journal.original)
      && !!normalizeCatalogProductReviewRecoverySnapshot(journal.target)
      && (((journal.original as CatalogProductReviewRecoverySnapshot).auditLogs === undefined && (journal.target as CatalogProductReviewRecoverySnapshot).auditLogs === undefined)
        || (journal.collections.includes(PLATFORM_AUDIT_LOG_STORAGE_KEY)
          && Array.isArray((journal.original as CatalogProductReviewRecoverySnapshot).auditLogs)
          && Array.isArray((journal.target as CatalogProductReviewRecoverySnapshot).auditLogs))),
    readStable: (journal) => {
      const before = {
        catalogRevision: readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY),
        submissionRevision: readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY),
        auditRevision: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      }
      const catalog = readCatalogState()
      const submissions = readCatalogProductSubmissionState()
      const after = {
        catalogRevision: readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY),
        submissionRevision: readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY),
        auditRevision: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      }
      if (!catalog || !submissions || before.catalogRevision !== after.catalogRevision || before.submissionRevision !== after.submissionRevision || before.auditRevision !== after.auditRevision) return null
      const usesAudit = Array.isArray((journal.original as CatalogProductReviewRecoverySnapshot).auditLogs) || Array.isArray((journal.target as CatalogProductReviewRecoverySnapshot).auditLogs)
      return { snapshot: usesAudit ? { catalog, submissions, auditLogs: readPlatformAuditLogs() } : { catalog, submissions }, token: after }
    },
    isStillStable: (token) => readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY) === token.catalogRevision
      && readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY) === token.submissionRevision
      && readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY) === token.auditRevision,
    writeSnapshot: (snapshot, rollback) => {
      if (!writePlatformJson(PLATFORM_CATALOG_STORAGE_KEY, cloneSeed(snapshot.catalog))) return false
      if (!writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(snapshot.submissions))) {
        writePlatformJson(PLATFORM_CATALOG_STORAGE_KEY, cloneSeed(rollback.catalog))
        return false
      }
      if (snapshot.auditLogs === undefined || writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, cloneSeed(snapshot.auditLogs))) return true
      writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(rollback.submissions))
      writePlatformJson(PLATFORM_CATALOG_STORAGE_KEY, cloneSeed(rollback.catalog))
      return false
    }
  })
}

export interface CatalogProductSubmissionReviewInput {
  submissionId: string
  reviewedBy: string
  reviewedAt: string
  note?: string
  expectedSubmissionRevision: number
  expectedCatalogRevision?: number
  audit?: CatalogProductAuditInput
}

function rollbackCatalogProductReviewCollection<T>(input: {
  read: () => T | null
  original: T
  target: T
  writeOriginal: (original: T) => boolean
}): boolean {
  const current = input.read()
  const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
  if (same(current, input.original)) return true
  if (!same(current, input.target)) return false
  return input.writeOriginal(input.original)
}

export async function approveCatalogProductSubmission(input: CatalogProductSubmissionReviewInput): Promise<WriteResult<CatalogProductSubmission>> {
  const initialRevisions = {
    catalog: readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY),
    submissions: readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY),
    audit: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  }
  const state = readCatalogProductSubmissionState()
  const catalog = readCatalogState()
  if (!state || !catalog || state.revision !== input.expectedSubmissionRevision || catalog.revision !== input.expectedCatalogRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  if (!input.submissionId?.trim() || !input.reviewedBy?.trim() || !validIsoTimestamp(input.reviewedAt) || Date.parse(input.reviewedAt) <= Date.parse(state.updatedAt)) return writeFailure('invalid_payload', '审核信息无效')
  const index = state.submissions.findIndex((item) => item.id === input.submissionId)
  const submission = state.submissions[index]
  if (!submission) return writeFailure('not_found', '商品提交不存在')
  if (submission.status !== 'pending') return writeFailure('invalid_status', '商品提交已审核')
  const formalIndex = catalog.products.findIndex((item) => item.id === submission.productId)
  const targetConflict = submission.kind === 'create'
    ? formalIndex >= 0
    : formalIndex < 0 || (submission.baseProductFingerprint
      ? catalogProductFingerprint(catalog.products[formalIndex]) !== submission.baseProductFingerprint
      : submission.baseCatalogRevision !== catalog.revision)
  if (targetConflict) return writeFailure('catalog_conflict', '正式目录状态与提交不匹配')
  if (submission.kind === 'update' && catalog.products[formalIndex].status !== 'active' && catalog.products[formalIndex].status !== 'offline') return writeFailure('catalog_conflict', '正式商品状态无法保留')

  const approvedProduct: CatalogProduct = submission.kind === 'create'
    ? { ...cloneSeed(submission.draft), status: 'offline' }
    : { ...cloneSeed(submission.draft), status: catalog.products[formalIndex].status }
  const nextCatalog = cloneSeed(catalog)
  if (formalIndex >= 0) nextCatalog.products[formalIndex] = approvedProduct
  else nextCatalog.products.unshift(approvedProduct)
  nextCatalog.revision += 1
  const reviewed: CatalogProductSubmission = { ...submission, status: 'approved', reviewedBy: input.reviewedBy, reviewedAt: input.reviewedAt, reviewNote: input.note?.trim() || undefined }
  const nextState = cloneSeed(state)
  nextState.submissions[index] = reviewed
  nextState.revision += 1
  nextState.updatedAt = input.reviewedAt
  const operationId = createId('OP-CATALOG-PRODUCT-REVIEW')
  const auditTransaction = createCatalogProductAuditTransaction(input.audit, operationId)
  if (input.audit && !auditTransaction) return writeFailure('invalid_payload', '商品审核审计信息无效')
  if (initialRevisions.catalog !== readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
    || initialRevisions.submissions !== readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
    || (auditTransaction && initialRevisions.audit !== readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY))) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const originalSnapshot: CatalogProductReviewRecoverySnapshot = { catalog, submissions: state, auditLogs: auditTransaction?.original }
  const targetSnapshot: CatalogProductReviewRecoverySnapshot = { catalog: nextCatalog, submissions: nextState, auditLogs: auditTransaction?.target }
  const transaction = await runLockedPlatformTransaction({
    operationId,
    collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, ...(auditTransaction ? [PLATFORM_AUDIT_LOG_STORAGE_KEY] : [])],
    original: originalSnapshot,
    target: targetSnapshot,
    recoveryHandlerKey: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY,
    recoverySchema: CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA,
    revisionChecks: [
      { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: initialRevisions.catalog },
      { key: PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, expectedRevision: initialRevisions.submissions },
      ...(auditTransaction ? [{ key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: initialRevisions.audit }] : [])
    ],
    value: reviewed,
    steps: [
      {
        key: 'catalog-review',
        apply: () => writeCatalogState(nextCatalog, input.expectedCatalogRevision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readCatalogState,
          original: catalog,
          target: nextCatalog,
          writeOriginal: (original) => writePlatformJson(PLATFORM_CATALOG_STORAGE_KEY, cloneSeed(original))
        })
      },
      {
        key: 'product-submission-review',
        apply: () => writeCatalogProductSubmissionState(nextState, input.expectedSubmissionRevision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readCatalogProductSubmissionState,
          original: state,
          target: nextState,
          writeOriginal: (original) => writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(original))
        })
      },
      ...(auditTransaction ? [{
        key: 'audit',
        apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, auditTransaction.target, auditTransaction.revision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readPlatformAuditLogs,
          original: auditTransaction.original,
          target: auditTransaction.target,
          writeOriginal: (original) => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, cloneSeed(original))
        })
      }] : [])
    ]
  })
  if (!transaction.ok) return catalogProductTransactionFailure(transaction, transaction.recoveryQueued ? '审核写入不完整，已加入恢复队列' : transaction.failedStep === 'audit' ? '商品审核日志失败，请重试' : '审核保存失败')
  return { ok: true, value: cloneSeed(reviewed), operationId }
}

export async function rejectCatalogProductSubmission(input: CatalogProductSubmissionReviewInput): Promise<WriteResult<CatalogProductSubmission>> {
  const initialRevisions = {
    catalog: readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY),
    submissions: readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY),
    audit: readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  }
  const state = readCatalogProductSubmissionState()
  const catalog = readCatalogState()
  if (!state || !catalog || state.revision !== input.expectedSubmissionRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const reviewNote = input.note?.trim()
  if (!input.submissionId?.trim() || !input.reviewedBy?.trim() || !reviewNote || !validIsoTimestamp(input.reviewedAt) || Date.parse(input.reviewedAt) <= Date.parse(state.updatedAt)) return writeFailure('invalid_payload', '审核信息无效')
  const index = state.submissions.findIndex((item) => item.id === input.submissionId)
  const submission = state.submissions[index]
  if (!submission) return writeFailure('not_found', '商品提交不存在')
  if (submission.status !== 'pending') return writeFailure('invalid_status', '商品提交已审核')
  const reviewed: CatalogProductSubmission = { ...submission, status: 'rejected', reviewedBy: input.reviewedBy, reviewedAt: input.reviewedAt, reviewNote }
  const next = cloneSeed(state)
  next.submissions[index] = reviewed
  next.revision += 1
  next.updatedAt = input.reviewedAt
  const operationId = createId('OP-CATALOG-PRODUCT-REJECT')
  const auditTransaction = createCatalogProductAuditTransaction(input.audit, operationId)
  if (input.audit && !auditTransaction) return writeFailure('invalid_payload', '商品审核审计信息无效')
  if (initialRevisions.catalog !== readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
    || initialRevisions.submissions !== readPlatformCollectionRevision(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY)
    || (auditTransaction && initialRevisions.audit !== readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY))) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const transaction = await runLockedPlatformTransaction({
    operationId,
    collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, ...(auditTransaction ? [PLATFORM_AUDIT_LOG_STORAGE_KEY] : [])],
    original: { catalog, submissions: state, auditLogs: auditTransaction?.original } satisfies CatalogProductReviewRecoverySnapshot,
    target: { catalog, submissions: next, auditLogs: auditTransaction?.target } satisfies CatalogProductReviewRecoverySnapshot,
    recoveryHandlerKey: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY,
    recoverySchema: CATALOG_PRODUCT_REVIEW_RECOVERY_SCHEMA,
    revisionChecks: [
      { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: initialRevisions.catalog },
      { key: PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, expectedRevision: initialRevisions.submissions },
      ...(auditTransaction ? [{ key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: initialRevisions.audit }] : [])
    ],
    value: reviewed,
    steps: [
      {
        key: 'product-submission-review',
        apply: () => writeCatalogProductSubmissionState(next, input.expectedSubmissionRevision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readCatalogProductSubmissionState,
          original: state,
          target: next,
          writeOriginal: (original) => writePlatformJson(PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, cloneSeed(original))
        })
      },
      ...(auditTransaction ? [{
        key: 'audit',
        apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, auditTransaction.target, auditTransaction.revision),
        rollback: () => rollbackCatalogProductReviewCollection({
          read: readPlatformAuditLogs,
          original: auditTransaction.original,
          target: auditTransaction.target,
          writeOriginal: (original) => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, cloneSeed(original))
        })
      }] : [])
    ]
  })
  return transaction.ok
    ? { ok: true, value: cloneSeed(reviewed), operationId }
    : catalogProductTransactionFailure(transaction, transaction.failedStep === 'audit' ? '商品审核日志失败，请重试' : '审核状态保存失败')
}

function normalizeDriverStoreScopeState(value: unknown): DriverStoreScopeState | null {
  const state = value as Partial<DriverStoreScopeState> | null
  if (!state || state.schemaVersion !== DRIVER_STORE_SCOPE_SCHEMA_VERSION || !Number.isInteger(state.revision) || Number(state.revision) < 0 || !Array.isArray(state.scopes) || !validIsoTimestamp(state.updatedAt)) return null
  const scopeKeys = new Set<string>()
  const scopes: DriverStoreScope[] = []
  for (const scope of state.scopes) {
    const key = `${scope?.supplierId}\u0000${scope?.driverId}`
    if (!scope?.supplierId?.trim() || !scope.driverId?.trim() || scopeKeys.has(key) || !Array.isArray(scope.storeIds) || scope.storeIds.some((storeId) => typeof storeId !== 'string' || !storeId.trim()) || !validIsoTimestamp(scope.updatedAt)) return null
    scopeKeys.add(key)
    scopes.push({ supplierId: scope.supplierId, driverId: scope.driverId, storeIds: [...new Set(scope.storeIds)].sort((left, right) => left.localeCompare(right)), updatedAt: scope.updatedAt })
  }
  scopes.sort((left, right) => left.supplierId.localeCompare(right.supplierId) || left.driverId.localeCompare(right.driverId))
  return { schemaVersion: DRIVER_STORE_SCOPE_SCHEMA_VERSION, revision: Number(state.revision), scopes, updatedAt: state.updatedAt }
}

export function readDriverStoreScopeState(): DriverStoreScopeState | null {
  const state = normalizeDriverStoreScopeState(readPlatformJson<unknown>(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY))
  return state ? cloneSeed(state) : null
}

export function readDriverStoreScopes(supplierId?: string, driverId?: string): DriverStoreScope[] {
  return (readDriverStoreScopeState()?.scopes ?? []).filter((scope) => (!supplierId || scope.supplierId === supplierId) && (!driverId || scope.driverId === driverId))
}

export function writeDriverStoreScopeState(next: DriverStoreScopeState, expectedRevision: number): boolean {
  const raw = readPlatformJson<unknown>(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)
  const current = normalizeDriverStoreScopeState(raw)
  if ((raw !== null && !current) || !Number.isInteger(expectedRevision) || (current?.revision ?? 0) !== expectedRevision || next.revision !== expectedRevision + 1) return false
  const normalized = normalizeDriverStoreScopeState(next)
  if (!normalized || (current && Date.parse(normalized.updatedAt) <= Date.parse(current.updatedAt))) return false
  return writePlatformJson(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, cloneSeed(normalized))
}

function uniqueStoreIdsInOrder(storeIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const storeId of storeIds) {
    const id = typeof storeId === 'string' ? storeId.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

function normalizeNamedDeliveryRouteState(value: unknown): NamedDeliveryRouteState | null {
  const state = value as Partial<NamedDeliveryRouteState> | null
  if (!state || state.schemaVersion !== NAMED_DELIVERY_ROUTE_SCHEMA_VERSION || !Number.isInteger(state.revision) || Number(state.revision) < 0 || !Array.isArray(state.routes) || !validIsoTimestamp(state.updatedAt)) return null
  const ids = new Set<string>()
  const routes: NamedDeliveryRoute[] = []
  const candidates: NamedDeliveryRoute[] = []
  for (const route of state.routes) {
    if (!route?.id?.trim() || ids.has(route.id) || !route.supplierId?.trim() || !route.name?.trim() || !Array.isArray(route.storeIds) || route.storeIds.some((storeId) => typeof storeId !== 'string' || !storeId.trim()) || !validIsoTimestamp(route.updatedAt) || (route.driverId !== undefined && !route.driverId.trim())) return null
    ids.add(route.id)
    candidates.push({
      id: route.id, supplierId: route.supplierId, name: route.name.trim(),
      storeIds: uniqueStoreIdsInOrder(route.storeIds),
      ...(route.driverId ? { driverId: route.driverId } : {}),
      updatedAt: route.updatedAt
    })
  }
  const claimedStores = new Map<string, Set<string>>()
  candidates.sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt) || left.id.localeCompare(right.id))
  candidates.forEach((route) => {
    const claimed = claimedStores.get(route.supplierId) || new Set<string>()
    const storeIds = route.storeIds.filter((storeId) => !claimed.has(storeId))
    storeIds.forEach((storeId) => claimed.add(storeId))
    claimedStores.set(route.supplierId, claimed)
    routes.push({ ...route, storeIds })
  })
  routes.sort((left, right) => left.supplierId.localeCompare(right.supplierId) || left.id.localeCompare(right.id))
  return { schemaVersion: NAMED_DELIVERY_ROUTE_SCHEMA_VERSION, revision: Number(state.revision), routes, updatedAt: state.updatedAt }
}

export function readNamedDeliveryRouteState(): NamedDeliveryRouteState | null {
  const state = normalizeNamedDeliveryRouteState(readPlatformJson<unknown>(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY))
  return state ? cloneSeed(state) : null
}

export function readNamedDeliveryRoutes(supplierId?: string): NamedDeliveryRoute[] {
  return (readNamedDeliveryRouteState()?.routes ?? []).filter((route) => !supplierId || route.supplierId === supplierId)
}

export function namedRouteForDriver(supplierId: string, driverId: string): NamedDeliveryRoute | undefined {
  return namedRoutesForDriver(supplierId, driverId)[0]
}

export function namedRoutesForDriver(supplierId: string, driverId: string): NamedDeliveryRoute[] {
  return readNamedDeliveryRoutes(supplierId).filter((route) => route.driverId === driverId)
}

export function writeNamedDeliveryRouteState(next: NamedDeliveryRouteState, expectedRevision: number): boolean {
  const raw = readPlatformJson<unknown>(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY)
  const current = normalizeNamedDeliveryRouteState(raw)
  if ((raw !== null && !current) || !Number.isInteger(expectedRevision) || (current?.revision ?? 0) !== expectedRevision || next.revision !== expectedRevision + 1) return false
  const normalized = normalizeNamedDeliveryRouteState(next)
  if (!normalized || (current && Date.parse(normalized.updatedAt) <= Date.parse(current.updatedAt))) return false
  return writePlatformJson(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, cloneSeed(normalized))
}

export function saveNamedDeliveryRoute(route: NamedDeliveryRoute, expectedRevision: number): WriteResult<NamedDeliveryRoute> {
  const raw = readPlatformJson<unknown>(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY)
  const current = normalizeNamedDeliveryRouteState(raw)
  if (raw !== null && !current) return writeFailure('invalid_payload', '命名线路集合损坏')
  if ((current?.revision ?? 0) !== expectedRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const normalizedRoute = normalizeNamedDeliveryRouteState({ schemaVersion: NAMED_DELIVERY_ROUTE_SCHEMA_VERSION, revision: 1, routes: [route], updatedAt: route.updatedAt })?.routes[0]
  if (!normalizedRoute) return writeFailure('invalid_payload', '命名线路无效')
  const routes = cloneSeed(current?.routes ?? [])
  const index = routes.findIndex((item) => item.id === normalizedRoute.id)
  const conflict = routes
    .filter((item) => item.id !== normalizedRoute.id && item.supplierId === normalizedRoute.supplierId)
    .flatMap((item) => normalizedRoute.storeIds.filter((storeId) => item.storeIds.includes(storeId)).map((storeId) => ({ item, storeId })))
    .at(0)
  if (conflict) return writeFailure('route_store_conflict', `门店「${conflict.storeId}」已在线路「${conflict.item.name}」中`)
  if (index >= 0) routes[index] = normalizedRoute
  else routes.push(normalizedRoute)
  routes.sort((left, right) => left.supplierId.localeCompare(right.supplierId) || left.id.localeCompare(right.id))
  const next: NamedDeliveryRouteState = { schemaVersion: NAMED_DELIVERY_ROUTE_SCHEMA_VERSION, revision: expectedRevision + 1, routes, updatedAt: route.updatedAt }
  return writeNamedDeliveryRouteState(next, expectedRevision) ? { ok: true, value: cloneSeed(normalizedRoute) } : writeFailure('write_failed', '命名线路保存失败')
}

export function orderStopsByNamedRoute(storeIds: readonly string[], stops: readonly RouteStop[]): { stops: RouteStop[]; warnings: string[] } {
  const byId = new Map((Array.isArray(stops) ? stops : []).map((stop) => [stop.storeId, stop]))
  const ordered: RouteStop[] = []
  const seen = new Set<string>()
  for (const storeId of storeIds || []) {
    const stop = byId.get(storeId)
    if (!stop || seen.has(storeId)) continue
    ordered.push(cloneSeed(stop))
    seen.add(storeId)
  }
  const warnings: string[] = []
  for (const stop of stops || []) {
    if (seen.has(stop.storeId)) continue
    ordered.push(cloneSeed(stop))
    seen.add(stop.storeId)
    warnings.push(`off_route:${stop.storeId}`)
  }
  return { stops: ordered, warnings }
}

export function saveDriverStoreScope(scope: DriverStoreScope, expectedRevision: number): WriteResult<DriverStoreScope> {
  const raw = readPlatformJson<unknown>(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)
  const current = normalizeDriverStoreScopeState(raw)
  if (raw !== null && !current) return writeFailure('invalid_payload', '司机范围集合损坏')
  if ((current?.revision ?? 0) !== expectedRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const normalizedScope = normalizeDriverStoreScopeState({ schemaVersion: DRIVER_STORE_SCOPE_SCHEMA_VERSION, revision: 1, scopes: [scope], updatedAt: scope.updatedAt })?.scopes[0]
  if (!normalizedScope) return writeFailure('invalid_payload', '司机范围无效')
  const scopes = cloneSeed(current?.scopes ?? [])
  const index = scopes.findIndex((item) => item.supplierId === normalizedScope.supplierId && item.driverId === normalizedScope.driverId)
  if (index >= 0) scopes[index] = normalizedScope
  else scopes.push(normalizedScope)
  scopes.sort((left, right) => left.supplierId.localeCompare(right.supplierId) || left.driverId.localeCompare(right.driverId))
  const next: DriverStoreScopeState = { schemaVersion: DRIVER_STORE_SCOPE_SCHEMA_VERSION, revision: expectedRevision + 1, scopes, updatedAt: scope.updatedAt }
  return writeDriverStoreScopeState(next, expectedRevision) ? { ok: true, value: cloneSeed(normalizedScope) } : writeFailure('write_failed', '司机范围保存失败')
}

function coordinateIsValid(longitude: unknown, latitude: unknown): boolean {
  return typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
}

function routeStopIsValid(stop: RouteStop): boolean {
  if (!stop?.storeId?.trim() || !stop.storeName?.trim() || !stop.address?.trim() || !Array.isArray(stop.orderIds) || !stop.orderIds.length || stop.orderIds.some((id) => typeof id !== 'string' || !id.trim())) return false
  const orderIds = new Set(stop.orderIds)
  const completedOrderIds = stop.completedOrderIds || []
  if (!Array.isArray(completedOrderIds) || new Set(completedOrderIds).size !== completedOrderIds.length || completedOrderIds.some((id) => typeof id !== 'string' || !orderIds.has(id)) || (stop.completedAt !== undefined && !validIsoTimestamp(stop.completedAt)) || (completedOrderIds.length === orderIds.size) !== !!stop.completedAt) return false
  const hasLongitude = stop.longitude !== undefined
  const hasLatitude = stop.latitude !== undefined
  if (hasLongitude !== hasLatitude || (hasLongitude && !coordinateIsValid(stop.longitude, stop.latitude))) return false
  if (stop.checkIn === undefined) return true
  const checkIn = stop.checkIn
  return !!checkIn && validIsoTimestamp(checkIn.at) && coordinateIsValid(checkIn.longitude, checkIn.latitude) && Number.isFinite(checkIn.distanceM) && checkIn.distanceM >= 0
}

export function filterStopsWithOrders(stops: readonly RouteStop[]): RouteStop[] {
  return (Array.isArray(stops) ? stops : []).filter((stop) => Array.isArray(stop?.orderIds) && stop.orderIds.length > 0)
}

function routePolylineIsValid(value: unknown): value is RouteOrigin[] {
  return Array.isArray(value) && value.every((point) => coordinateIsValid(point?.longitude, point?.latitude))
}

export function snapshotDailyDeliveryRoute(route: DailyDeliveryRoute): DailyDeliveryRoute {
  const stops = filterStopsWithOrders(route.stops)
  const sourceOrderIds = [...new Set(stops.flatMap((stop) => stop.orderIds))].sort((left, right) => left.localeCompare(right))
  return {
    ...cloneSeed(route),
    stops,
    sourceOrderIds,
    stopCount: stops.length,
    ...(routePolylineIsValid(route.polyline) ? { polyline: route.polyline.map((point) => ({ longitude: point.longitude, latitude: point.latitude })) } : { polyline: undefined })
  }
}

export interface EnsurePublishedRoutesInput {
  supplierId: string
  date: string
  drivers: readonly DriverAccount[]
  orders: readonly Order[]
  warehouse?: RouteOrigin
  scopes?: readonly DriverStoreScope[]
  namedRoutes?: readonly NamedDeliveryRoute[]
  resolveStore: (order: Order) => { storeId: string; storeName: string; address: string; longitude?: number; latitude?: number } | undefined
  now?: string
}

export async function ensurePublishedRoutesForDate(input: EnsurePublishedRoutesInput): Promise<{ generated: DailyDeliveryRoute[]; skipped: string[]; routes: DailyDeliveryRoute[] }> {
  const generated: DailyDeliveryRoute[] = []
  const skipped: string[] = []
  if (!input?.supplierId?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) {
    return { generated, skipped, routes: readDailyDeliveryRoutes(input?.supplierId) }
  }
  const existing = readDailyDeliveryRoutes(input.supplierId)
  let revision = readDailyDeliveryRouteState()?.revision ?? 0
  const warehouse = input.warehouse
  const hasWarehouse = warehouse ? coordinateIsValid(warehouse.longitude, warehouse.latitude) : false
  for (const driver of input.drivers.filter((item) => item.supplierId === input.supplierId && item.status === 'active')) {
    if (existing.some((route) => route.driverId === driver.id && route.deliveryDate === input.date && route.status !== 'draft')) {
      skipped.push(driver.id)
      continue
    }
    if (!hasWarehouse) {
      skipped.push(driver.id)
      continue
    }
    const driverOrders = input.orders.filter((order) => {
      const fulfillment = order.supplierFulfillment
      return order.supplierId === input.supplierId && fulfillment?.driverId === driver.id && fulfillment.shipType === 'driver'
        && fulfillment.deliverDate === input.date && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
    })
    if (!driverOrders.length) {
      skipped.push(driver.id)
      continue
    }
    const resolved = driverOrders.map((order) => ({ order, store: input.resolveStore(order) }))
    if (resolved.some((item) => !item.store)) {
      skipped.push(driver.id)
      continue
    }
    const stops = filterStopsWithOrders(mergeDeliveryOrdersByStore(resolved.map(({ order, store }) => ({
      orderId: order.id, storeId: store!.storeId, storeName: store!.storeName, address: store!.address,
      longitude: store!.longitude, latitude: store!.latitude
    }))))
    if (!stops.length) {
      skipped.push(driver.id)
      continue
    }
    const named = (input.namedRoutes || []).find((route) => route.supplierId === input.supplierId && route.driverId === driver.id)
    const namedOrder = named ? orderStopsByNamedRoute(named.storeIds, stops) : { stops, warnings: [] as string[] }
    let optimized
    try {
      const providers = await import('./providers')
      optimized = await providers.getPlatformProviders().routeOptimization.optimize({ origin: warehouse!, stops: namedOrder.stops })
    } catch {
      const local = optimizeDeliveryRoute({ origin: warehouse!, stops: namedOrder.stops })
      optimized = local ? { ok: true as const, value: local } : { ok: false as const, code: 'route_optimization_failed', message: '线路规划失败' }
    }
    if (!optimized.ok || !optimized.value) {
      skipped.push(driver.id)
      continue
    }
    const ordered = named ? orderStopsByNamedRoute(named.storeIds, optimized.value.orderedStops) : { stops: optimized.value.orderedStops, warnings: [] as string[] }
    optimized = { ...optimized, value: { ...optimized.value, orderedStops: ordered.stops, warnings: [...new Set([...(optimized.value.warnings || []), ...namedOrder.warnings, ...ordered.warnings])] } }
    const previousUpdatedAt = readDailyDeliveryRouteState()?.updatedAt
    const now = new Date(Math.max(
      Date.parse(input.now || '') || Date.now(),
      (previousUpdatedAt ? Date.parse(previousUpdatedAt) : 0) + 1
    )).toISOString()
    const draft = snapshotDailyDeliveryRoute({
      id: `ROUTE-${input.supplierId}-${driver.id}-${input.date}`,
      supplierId: input.supplierId,
      driverId: driver.id,
      deliveryDate: input.date,
      status: 'published',
      stops: optimized.value.orderedStops,
      totalDistanceKm: optimized.value.totalDistanceKm,
      estimatedDurationMinutes: optimized.value.estimatedDurationMinutes,
      sourceOrderIds: driverOrders.map((order) => order.id),
      provider: optimized.value.provider,
      segments: optimized.value.segments,
      warnings: optimized.value.warnings,
      origin: warehouse,
      polyline: optimized.value.polyline,
      scopeStoreIds: cloneSeed(named?.storeIds || (input.scopes || []).find((scope) => scope.supplierId === input.supplierId && scope.driverId === driver.id)?.storeIds || []),
      generatedAt: now,
      publishedAt: now
    })
    const saved = saveDailyDeliveryRoute(draft, revision)
    if (!saved.ok || !saved.value) {
      skipped.push(driver.id)
      continue
    }
    revision += 1
    generated.push(saved.value)
    existing.push(saved.value)
  }
  return { generated, skipped, routes: readDailyDeliveryRoutes(input.supplierId) }
}

export function mergeDeliveryOrdersByStore(orders: readonly DeliveryRouteOrder[]): RouteStop[] {
  if (!Array.isArray(orders)) return []
  const grouped = new Map<string, RouteStop>()
  for (const order of orders) {
    if (!order?.orderId?.trim() || !order.storeId?.trim() || !order.storeName?.trim() || !order.address?.trim()) continue
    const coordinatesValid = coordinateIsValid(order.longitude, order.latitude)
    const current = grouped.get(order.storeId)
    if (!current) {
      grouped.set(order.storeId, {
        storeId: order.storeId, storeName: order.storeName, address: order.address,
        ...(coordinatesValid ? { longitude: order.longitude, latitude: order.latitude } : {}),
        orderIds: [order.orderId]
      })
      continue
    }
    if (!current.orderIds.includes(order.orderId)) current.orderIds.push(order.orderId)
    if (current.longitude === undefined && coordinatesValid) {
      current.longitude = order.longitude
      current.latitude = order.latitude
    }
  }
  return [...grouped.values()].map((stop) => ({ ...stop, orderIds: [...stop.orderIds].sort((left, right) => left.localeCompare(right)) })).sort((left, right) => left.storeId.localeCompare(right.storeId))
}

function preciseHaversineKm(left: RouteOrigin, right: RouteOrigin): number {
  const radiusKm = 6371
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(right.latitude - left.latitude)
  const longitudeDelta = toRadians(right.longitude - left.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * radiusKm * Math.asin(Math.sqrt(a))
}

export function distanceMeters(left: RouteOrigin, right: RouteOrigin): number {
  return Math.round(preciseHaversineKm(left, right) * 1000)
}

export function validateStopCheckIn(stop: Pick<RouteStop, 'latitude' | 'longitude'>, location: RouteOrigin): { ok: true; distanceM: number } | { ok: false; code: string; message: string; distanceM?: number } {
  if (stop.latitude === undefined || stop.longitude === undefined || !coordinateIsValid(stop.longitude, stop.latitude)) {
    return { ok: false, code: 'store_coordinates_missing', message: '门店缺少坐标，无法打卡' }
  }
  if (!coordinateIsValid(location.longitude, location.latitude)) {
    return { ok: false, code: 'location_unavailable', message: '无法获取定位，请开启定位权限' }
  }
  const distanceM = distanceMeters({ latitude: stop.latitude, longitude: stop.longitude }, location)
  if (distanceM > DRIVER_CHECK_IN_MAX_METERS) {
    return { ok: false, code: 'too_far', message: `距离门店 ${distanceM} 米，超过 ${DRIVER_CHECK_IN_MAX_METERS} 米不能打卡`, distanceM }
  }
  return { ok: true, distanceM }
}

export function validateWarehouseCheckIn(origin: RouteOrigin | undefined, location: RouteOrigin): { ok: true; distanceM: number } | { ok: false; code: string; message: string; distanceM?: number } {
  if (!origin || !coordinateIsValid(origin.longitude, origin.latitude)) {
    return { ok: false, code: 'warehouse_coordinates_missing', message: '仓点缺少坐标，无法打卡' }
  }
  if (!coordinateIsValid(location.longitude, location.latitude)) {
    return { ok: false, code: 'location_unavailable', message: '无法获取定位，请开启定位权限' }
  }
  const distanceM = distanceMeters(origin, location)
  if (distanceM > DRIVER_CHECK_IN_MAX_METERS) {
    return { ok: false, code: 'too_far', message: `距离仓点 ${distanceM} 米，超过 ${DRIVER_CHECK_IN_MAX_METERS} 米不能打卡`, distanceM }
  }
  return { ok: true, distanceM }
}

export function createAbnormalWarehouseCheckIn(reasonCode: RouteWarehouseCheckInReason, reasonNote: string | undefined, location?: RouteOrigin, now = new Date().toISOString()): RouteWarehouseCheckIn | null {
  const reasons: RouteWarehouseCheckInReason[] = ['location_failed', 'device_issue', 'warehouse_coordinate_error', 'other']
  if (!reasons.includes(reasonCode)) return null
  const note = String(reasonNote || '').trim()
  if (reasonCode === 'other' && !note) return null
  const hasLocation = !!location && coordinateIsValid(location.longitude, location.latitude)
  return {
    at: now,
    type: 'abnormal',
    reasonCode,
    ...(note ? { reasonNote: note } : {}),
    ...(hasLocation ? { longitude: location!.longitude, latitude: location!.latitude } : {})
  }
}

export function reorderRouteStops(route: DailyDeliveryRoute, orderedStoreIds: readonly string[]): DailyDeliveryRoute | null {
  if (!route || !Array.isArray(orderedStoreIds)) return null
  const currentIds = route.stops.map((stop) => stop.storeId)
  const nextIds = [...new Set(orderedStoreIds.map((storeId) => storeId?.trim()).filter(Boolean))]
  if (nextIds.length !== currentIds.length || currentIds.some((storeId) => !nextIds.includes(storeId))) return null
  if (route.stops.some((stop, index) => (stop.completedAt || stop.completedOrderIds?.length === stop.orderIds.length) && nextIds[index] !== stop.storeId)) return null
  const byId = new Map(route.stops.map((stop) => [stop.storeId, stop]))
  const stops = nextIds.map((storeId) => cloneSeed(byId.get(storeId)!))
  const origin = route.origin
  if (!origin || stops.some((stop) => stop.longitude === undefined || stop.latitude === undefined)) {
    return cloneSeed({ ...route, stops })
  }
  let previous: RouteOrigin = origin
  let totalDistanceKm = 0
  const segments: RouteSegment[] = []
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index]
    const destination = { longitude: stop.longitude!, latitude: stop.latitude! }
    const distanceKm = distanceMeters(previous, destination) / 1000
    totalDistanceKm += distanceKm
    segments.push({ fromId: index === 0 ? 'origin' : stops[index - 1].storeId, toStoreId: stop.storeId, distanceKm })
    previous = destination
  }
  const roundedDistanceKm = Math.round(totalDistanceKm * 10) / 10
  const originalTravelMinutes = Math.max(0, route.estimatedDurationMinutes - route.stops.length * 5)
  const averageSpeedKmh = route.totalDistanceKm > 0 && originalTravelMinutes > 0 ? route.totalDistanceKm / (originalTravelMinutes / 60) : 30
  const estimatedDurationMinutes = Math.max(1, Math.round(roundedDistanceKm / Math.max(1, averageSpeedKmh) * 60 + stops.length * 5))
  return cloneSeed({
    ...route,
    stops,
    segments,
    totalDistanceKm: roundedDistanceKm,
    estimatedDurationMinutes,
    polyline: [origin, ...stops.map((stop) => ({ longitude: stop.longitude!, latitude: stop.latitude! }))]
  })
}

export function aggregateRouteOutboundItems(orders: readonly Order[]): RouteOutboundHandoverItem[] {
  const grouped = new Map<string, RouteOutboundHandoverItem>()
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const line of order.items || []) {
      if (!line?.skuId?.trim() || !Number.isInteger(line.quantity) || line.quantity <= 0) continue
      const current = grouped.get(line.skuId)
      if (current) {
        current.expected += line.quantity
        current.driverActual += line.quantity
        if (!current.image && line.image) current.image = line.image
        if (!current.name && line.name) current.name = line.name
        if (!current.skuName && line.skuName) current.skuName = line.skuName
        continue
      }
      grouped.set(line.skuId, {
        skuId: line.skuId,
        productId: line.productId,
        name: line.name,
        skuName: line.skuName,
        image: line.image || '',
        expected: line.quantity,
        driverActual: line.quantity
      })
    }
  }
  return [...grouped.values()]
}

function routeOutboundActualsValid(items: readonly RouteOutboundHandoverItem[], actuals: Record<string, number>, fallback: (item: RouteOutboundHandoverItem) => number): Record<string, number> | null {
  if (!actuals || typeof actuals !== 'object' || Array.isArray(actuals)) return null
  const bySku = new Map(items.map((item) => [item.skuId, item]))
  if (Object.keys(actuals).some((skuId) => !bySku.has(skuId))) return null
  const normalized: Record<string, number> = {}
  for (const item of items) {
    const value = actuals[item.skuId] === undefined ? fallback(item) : Number(actuals[item.skuId])
    if (!Number.isInteger(value) || value < 0 || value > item.expected) return null
    normalized[item.skuId] = value
  }
  return normalized
}

export interface RouteOutboundHandoverInput {
  actuals: Record<string, number>
  proofImages: string[]
  note?: string
}

export function createRouteOutboundHandover(route: DailyDeliveryRoute, orders: readonly Order[], operator: { id: string; name: string; role: 'supplier' | 'driver' }, input: RouteOutboundHandoverInput, now = new Date().toISOString()): DailyDeliveryRoute | null {
  if (!route || route.status === 'completed' || operator.role !== 'driver' || operator.id !== route.driverId || !route.warehouseCheckIn) return null
  if (route.outboundHandover && route.outboundHandover.status !== 'pending_supplier' && route.outboundHandover.status !== 'rejected') return null
  const proofImages = [...new Set((Array.isArray(input?.proofImages) ? input.proofImages : []).map((image) => image?.trim()).filter(Boolean))]
  if (!proofImages.length || proofImages.length > 6) return null
  const items = aggregateRouteOutboundItems(orders)
  const normalized = routeOutboundActualsValid(items, input.actuals, (item) => item.expected)
  if (!normalized) return null
  const previousQuantities = new Map((route.outboundHandover?.items || []).map((item) => [item.skuId, item.warehouseQuantity]))
  return cloneSeed({
    ...route,
    outboundHandover: {
      status: 'pending_supplier' as const,
      items: items.map((item) => ({
        ...item,
        ...(previousQuantities.get(item.skuId) !== undefined ? { warehouseQuantity: previousQuantities.get(item.skuId) } : {}),
        driverActual: normalized[item.skuId]
      })),
      driverId: operator.id,
      driverName: operator.name,
      driverSubmittedAt: now,
      ...(input.note?.trim() ? { driverNote: input.note.trim() } : {}),
      proofImages,
      ...(route.outboundHandover?.reviewHistory?.length ? { reviewHistory: cloneSeed(route.outboundHandover.reviewHistory) } : {}),
      shortageAllocations: []
    }
  })
}

export function reviewRouteOutboundHandover(route: DailyDeliveryRoute, input: { actuals: Record<string, number>; note?: string }, operator: { id: string; name: string; role: 'supplier' | 'driver' }, now = new Date().toISOString()): DailyDeliveryRoute | null {
  const handover = route?.outboundHandover
  if (!handover || handover.status !== 'pending_supplier' || operator.role !== 'supplier') return null
  if (!handover.proofImages?.length) return null
  const normalized = routeOutboundActualsValid(handover.items, input.actuals, (item) => item.driverActual)
  if (!normalized) return null
  const reviewHistory = [...(handover.reviewHistory || []), { action: 'confirmed' as const, at: now, operatorId: operator.id, operatorName: operator.name, ...(input.note?.trim() ? { note: input.note.trim() } : {}) }]
  return cloneSeed({
    ...route,
    outboundHandover: {
      ...handover,
      status: 'pending_dispatch' as const,
      items: handover.items.map((item) => ({ ...item, supplierActual: normalized[item.skuId] })),
      supplierId: operator.id,
      supplierName: operator.name,
      supplierReviewedAt: now,
      ...(input.note?.trim() ? { supplierNote: input.note.trim() } : {}),
      reviewHistory,
      shortageAllocations: []
    }
  })
}

export function rejectRouteOutboundHandover(route: DailyDeliveryRoute, reason: string, operator: { id: string; name: string; role: 'supplier' | 'driver' }, now = new Date().toISOString()): DailyDeliveryRoute | null {
  const handover = route?.outboundHandover
  const rejectionReason = String(reason || '').trim()
  if (!handover || handover.status !== 'pending_supplier' || operator.role !== 'supplier' || !rejectionReason) return null
  const reviewHistory = [...(handover.reviewHistory || []), { action: 'rejected' as const, at: now, operatorId: operator.id, operatorName: operator.name, note: rejectionReason }]
  return cloneSeed({
    ...route,
    outboundHandover: {
      ...handover,
      status: 'rejected' as const,
      rejectionReason,
      reviewHistory,
      shortageAllocations: []
    }
  })
}

function routeStoreExpected(orders: readonly Order[], route: DailyDeliveryRoute, storeId: string, skuId: string): number {
  const stop = route.stops.find((item) => item.storeId === storeId)
  if (!stop) return 0
  return orders
    .filter((order) => stop.orderIds.includes(order.id))
    .reduce((sum, order) => sum + (order.items || []).filter((line) => line.skuId === skuId).reduce((lineSum, line) => lineSum + line.quantity, 0), 0)
}

function routeShortageAllocationValid(route: DailyDeliveryRoute, orders: readonly Order[], allocations: readonly RouteOutboundShortageAllocation[]): RouteOutboundShortageAllocation[] | null {
  const handover = route?.outboundHandover
  if (!handover || handover.status !== 'pending_dispatch' || !Array.isArray(allocations)) return null
  const bySku = new Map(handover.items.map((item) => [item.skuId, item]))
  const keys = new Set<string>()
  const normalized: RouteOutboundShortageAllocation[] = []
  for (const allocation of allocations) {
    const skuId = allocation?.skuId?.trim()
    const storeId = allocation?.storeId?.trim()
    const quantity = Number(allocation?.quantity)
    const note = typeof allocation?.note === 'string' ? allocation.note.trim() : ''
    if (!skuId || !storeId || !Number.isInteger(quantity) || quantity < 0) return null
    const item = bySku.get(skuId)
    if (!item) return null
    const key = `${skuId}\u0000${storeId}`
    if (keys.has(key)) return null
    keys.add(key)
    if (quantity === 0) continue
    const shortage = item.expected - (item.supplierActual ?? item.driverActual)
    const storeExpected = routeStoreExpected(orders, route, storeId, skuId)
    if (shortage <= 0 || storeExpected <= 0 || quantity > storeExpected) return null
    normalized.push({ skuId, storeId, quantity, ...(note ? { note } : {}) })
  }
  for (const item of handover.items) {
    const shortage = item.expected - (item.supplierActual ?? item.driverActual)
    const allocated = normalized.filter((entry) => entry.skuId === item.skuId).reduce((sum, entry) => sum + entry.quantity, 0)
    if (shortage < 0 || allocated !== shortage) return null
  }
  return normalized.sort((left, right) => left.skuId.localeCompare(right.skuId) || left.storeId.localeCompare(right.storeId))
}

export function saveRouteOutboundShortages(route: DailyDeliveryRoute, orders: readonly Order[], allocations: readonly RouteOutboundShortageAllocation[]): DailyDeliveryRoute | null {
  const normalized = routeShortageAllocationValid(route, orders, allocations)
  if (!normalized) return null
  return cloneSeed({ ...route, outboundHandover: { ...route.outboundHandover!, shortageAllocations: normalized } })
}

export function dispatchRouteOutbound(route: DailyDeliveryRoute, orders: readonly Order[], operator: { id: string; name: string; role: 'supplier' | 'driver' }, now = new Date().toISOString()): { route: DailyDeliveryRoute; orders: Order[] } | null {
  const handover = route?.outboundHandover
  if (!handover || handover.status !== 'pending_dispatch' || !route.warehouseCheckIn || operator.role !== 'driver' || operator.id !== route.driverId) return null
  const allocations = routeShortageAllocationValid(route, orders, handover.shortageAllocations)
  if (!allocations) return null
  const assigned = new Map<string, number>()
  for (const allocation of allocations) {
    const stop = route.stops.find((item) => item.storeId === allocation.storeId)
    if (!stop) return null
    const candidates = orders
      .filter((order) => stop.orderIds.includes(order.id) && (order.items || []).some((line) => line.skuId === allocation.skuId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    let remaining = allocation.quantity
    for (const order of candidates) {
      const capacity = (order.items || []).filter((line) => line.skuId === allocation.skuId).reduce((sum, line) => sum + line.quantity, 0)
      const count = Math.min(remaining, capacity)
      if (count > 0) assigned.set(`${order.id}\u0000${allocation.skuId}`, count)
      remaining -= count
      if (remaining === 0) break
    }
    if (remaining !== 0) return null
  }
  const supplier = { id: handover.supplierId || 'supplier', name: handover.supplierName || '供应商', role: 'supplier' as const }
  const nextOrders: Order[] = []
  for (const order of orders) {
    const actuals: Record<string, number> = {}
    for (const line of order.items || []) {
      actuals[line.skuId] = line.quantity - (assigned.get(`${order.id}\u0000${line.skuId}`) || 0)
    }
    const next = handoverSupplierOut(order, actuals, supplier, handover.supplierNote)
    if (!next) return null
    nextOrders.push(next)
  }
  return {
    route: cloneSeed({ ...route, outboundHandover: { ...handover, status: 'dispatched' as const, dispatchedAt: now } }),
    orders: nextOrders
  }
}

export function completeRouteStopHandover(route: DailyDeliveryRoute, orders: readonly Order[], stopId: string, operator: { id: string; name: string; role: 'supplier' | 'driver' }, note?: string, now = new Date().toISOString()): { route: DailyDeliveryRoute; orders: Order[] } | null {
  if (!route || route.outboundHandover?.status !== 'dispatched' || operator.role !== 'driver' || operator.id !== route.driverId) return null
  const stop = route.stops.find((item) => item.storeId === stopId)
  if (!stop?.checkIn) return null
  const stopOrders = orders.filter((order) => stop.orderIds.includes(order.id))
  if (!stopOrders.length || stopOrders.some((order) => !['delivering', 'received'].includes(order.supplierFulfillment?.status || ''))) return null
  const updatedById = new Map<string, Order>()
  for (const order of stopOrders) {
    if (order.supplierFulfillment?.status === 'received') continue
    const updated = handoverSupplierIn(order, operator, note)
    if (!updated) return null
    updatedById.set(order.id, updated)
  }
  const nextOrders = orders.map((order) => updatedById.get(order.id) || order)
  const completedOrderIds = [...stop.orderIds]
  const stops = route.stops.map((item) => item.storeId === stopId ? { ...item, completedOrderIds, completedAt: item.completedAt || now } : item)
  const completed = stops.every((item) => item.completedOrderIds?.length === item.orderIds.length)
  return {
    route: cloneSeed({ ...route, stops, ...(completed ? { status: 'completed' as const, completedAt: now } : {}) }),
    orders: nextOrders
  }
}

function routePathDistance(origin: RouteOrigin, stops: readonly RouteStop[]): number {
  let previous = origin
  let total = 0
  for (const stop of stops) {
    total += preciseHaversineKm(previous, { longitude: stop.longitude!, latitude: stop.latitude! })
    previous = { longitude: stop.longitude!, latitude: stop.latitude! }
  }
  return total
}

function nearestNeighborRoute(origin: RouteOrigin, stops: readonly RouteStop[]): RouteStop[] {
  const remaining = stops.map((stop) => cloneSeed(stop))
  const ordered: RouteStop[] = []
  let current = origin
  while (remaining.length) {
    remaining.sort((left, right) => {
      const delta = preciseHaversineKm(current, { longitude: left.longitude!, latitude: left.latitude! }) - preciseHaversineKm(current, { longitude: right.longitude!, latitude: right.latitude! })
      return Math.abs(delta) > 1e-9 ? delta : left.storeId.localeCompare(right.storeId)
    })
    const next = remaining.shift()!
    ordered.push(next)
    current = { longitude: next.longitude!, latitude: next.latitude! }
  }
  return ordered
}

function improveRouteWithTwoOpt(origin: RouteOrigin, initial: readonly RouteStop[]): RouteStop[] {
  let route = initial.map((stop) => cloneSeed(stop))
  let improved = true
  while (improved) {
    improved = false
    const baseline = routePathDistance(origin, route)
    for (let start = 0; start < route.length - 1 && !improved; start += 1) {
      for (let end = start + 1; end < route.length; end += 1) {
        const candidate = [...route.slice(0, start), ...route.slice(start, end + 1).reverse(), ...route.slice(end + 1)]
        if (routePathDistance(origin, candidate) < baseline - 1e-9) {
          route = candidate
          improved = true
          break
        }
      }
    }
  }
  return route
}

export function optimizeDeliveryRoute(input: RouteOptimizationInput): RouteOptimizationOutput | null {
  if (!input || !coordinateIsValid(input.origin?.longitude, input.origin?.latitude) || !Array.isArray(input.stops) || input.stops.some((stop) => !routeStopIsValid(stop))) return null
  const averageSpeedKmh = input.averageSpeedKmh ?? 30
  const serviceMinutesPerStop = input.serviceMinutesPerStop ?? 5
  if (!Number.isFinite(averageSpeedKmh) || averageSpeedKmh <= 0 || !Number.isFinite(serviceMinutesPerStop) || serviceMinutesPerStop < 0) return null
  const located = input.stops.filter((stop) => stop.longitude !== undefined).map((stop) => cloneSeed(stop))
  const missing = input.stops.filter((stop) => stop.longitude === undefined).map((stop) => cloneSeed(stop)).sort((left, right) => left.storeId.localeCompare(right.storeId))
  const optimized = input.preserveStopOrder ? located : improveRouteWithTwoOpt(input.origin, nearestNeighborRoute(input.origin, located))
  const segments: RouteSegment[] = []
  let previous: RouteOrigin = input.origin
  let fromId = 'origin'
  for (const stop of optimized) {
    const distanceKm = preciseHaversineKm(previous, { longitude: stop.longitude!, latitude: stop.latitude! })
    segments.push({ fromId, toStoreId: stop.storeId, distanceKm: Math.round(distanceKm * 1000) / 1000 })
    previous = { longitude: stop.longitude!, latitude: stop.latitude! }
    fromId = stop.storeId
  }
  const totalDistanceKm = Math.round(segments.reduce((sum, segment) => sum + segment.distanceKm, 0) * 1000) / 1000
  return {
    orderedStops: [...optimized, ...missing], segments, totalDistanceKm,
    estimatedDurationMinutes: Math.ceil(totalDistanceKm / averageSpeedKmh * 60 + serviceMinutesPerStop * input.stops.length),
    provider: 'mock-route-optimization', warnings: missing.map((stop) => `missing_coordinates:${stop.storeId}`)
  }
}

function normalizeDailyDeliveryRouteState(value: unknown): DailyDeliveryRouteState | null {
  const state = value as Partial<DailyDeliveryRouteState> | null
  if (!state || state.schemaVersion !== DAILY_DELIVERY_ROUTE_SCHEMA_VERSION || !Number.isInteger(state.revision) || Number(state.revision) < 0 || !Array.isArray(state.routes) || !validIsoTimestamp(state.updatedAt)) return null
  const ids = new Set<string>()
  const routes: DailyDeliveryRoute[] = []
  for (const route of state.routes) {
    if (!route?.id?.trim() || ids.has(route.id) || !route.supplierId?.trim() || !route.driverId?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(route.deliveryDate || '') || !['draft', 'published', 'stale', 'completed'].includes(route.status) || !Array.isArray(route.stops) || route.stops.some((stop) => !routeStopIsValid(stop)) || !Number.isFinite(route.totalDistanceKm) || route.totalDistanceKm < 0 || !Number.isFinite(route.estimatedDurationMinutes) || route.estimatedDurationMinutes < 0 || !Array.isArray(route.sourceOrderIds) || route.sourceOrderIds.some((orderId) => typeof orderId !== 'string' || !orderId.trim()) || !route.provider?.trim() || !validIsoTimestamp(route.generatedAt) || (route.publishedAt !== undefined && !validIsoTimestamp(route.publishedAt)) || (route.completedAt !== undefined && !validIsoTimestamp(route.completedAt)) || (route.status !== 'draft' && !route.publishedAt) || (route.status === 'completed') !== !!route.completedAt || (route.status === 'completed' && route.stops.some((stop) => !stop.completedAt))) return null
    ids.add(route.id)
    routes.push({
      ...cloneSeed(route),
      sourceOrderIds: [...new Set(route.sourceOrderIds)].sort((left, right) => left.localeCompare(right)),
      stopCount: route.stops.length,
      ...(routePolylineIsValid(route.polyline) ? { polyline: route.polyline } : {})
    })
  }
  return { schemaVersion: DAILY_DELIVERY_ROUTE_SCHEMA_VERSION, revision: Number(state.revision), routes, updatedAt: state.updatedAt }
}

export function readDailyDeliveryRouteState(): DailyDeliveryRouteState | null {
  const state = normalizeDailyDeliveryRouteState(readPlatformJson<unknown>(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY))
  return state ? cloneSeed(state) : null
}

export function readDailyDeliveryRoutes(supplierId?: string, driverId?: string): DailyDeliveryRoute[] {
  const routes = readDailyDeliveryRouteState()?.routes ?? []
  return routes.filter((route) => (!supplierId || route.supplierId === supplierId) && (!driverId || route.driverId === driverId))
}

export function writeDailyDeliveryRouteState(next: DailyDeliveryRouteState, expectedRevision: number): boolean {
  const raw = readPlatformJson<unknown>(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
  const current = normalizeDailyDeliveryRouteState(raw)
  if ((raw !== null && !current) || !Number.isInteger(expectedRevision) || (current?.revision ?? 0) !== expectedRevision || next.revision !== expectedRevision + 1) return false
  const normalized = normalizeDailyDeliveryRouteState(next)
  if (!normalized || (current && Date.parse(normalized.updatedAt) <= Date.parse(current.updatedAt))) return false
  return writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, cloneSeed(normalized))
}

export function saveDailyDeliveryRoute(route: DailyDeliveryRoute, expectedRevision: number): WriteResult<DailyDeliveryRoute> {
  const raw = readPlatformJson<unknown>(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
  const current = normalizeDailyDeliveryRouteState(raw)
  if (raw !== null && !current) return writeFailure('invalid_payload', '每日配送路线集合损坏')
  if ((current?.revision ?? 0) !== expectedRevision) return writeFailure('revision_conflict', '数据已更新，请刷新后重试')
  const normalizedRoute = normalizeDailyDeliveryRouteState({ schemaVersion: DAILY_DELIVERY_ROUTE_SCHEMA_VERSION, revision: 1, routes: [route], updatedAt: route.generatedAt })?.routes[0]
  if (!normalizedRoute) return writeFailure('invalid_payload', '每日配送路线无效')
  const routes = cloneSeed(current?.routes ?? [])
  const index = routes.findIndex((item) => item.id === normalizedRoute.id)
  if (index >= 0) routes[index] = normalizedRoute
  else routes.push(normalizedRoute)
  routes.sort((left, right) => left.id.localeCompare(right.id))
  const next: DailyDeliveryRouteState = { schemaVersion: DAILY_DELIVERY_ROUTE_SCHEMA_VERSION, revision: expectedRevision + 1, routes, updatedAt: route.generatedAt }
  return writeDailyDeliveryRouteState(next, expectedRevision) ? { ok: true, value: cloneSeed(normalizedRoute) } : writeFailure('write_failed', '每日配送路线保存失败')
}

function sameStockChanges(left: CatalogStockChange[], right: CatalogStockChange[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}


function catalogOperationFingerprint(action: string, changes: CatalogStockChange[]): string {
  return JSON.stringify({ action, changes: changes.map((c) => ({ productId: c.productId, skuId: c.skuId, quantity: c.quantity })) })
}
export function compactCatalogTransactionJournal(journal: Record<string, CatalogTransactionJournalEntry>, options: { now: string; retentionMs: number }): Record<string, CatalogTransactionJournalEntry> {
  const cutoff = new Date(options.now).getTime() - options.retentionMs
  return Object.fromEntries(Object.entries(journal).filter(([, entry]) => {
    const age = new Date(entry.updatedAt || entry.createdAt).getTime()
    const terminal = entry.status === 'committed' || entry.status === 'aborted'
    return !(terminal && age < cutoff)
  }))
}
export function compactCatalogAppliedOperations(appliedOperations: Record<string, CatalogStockOperation>, journal: Record<string, CatalogTransactionJournalEntry>, options: { now: string; retentionMs: number }): Record<string, CatalogStockOperation> {
  const cutoff = new Date(options.now).getTime() - options.retentionMs
  const result: Record<string, CatalogStockOperation> = {}
  for (const [id, op] of Object.entries(appliedOperations)) {
    const journalEntry = journal[id]
    const isOld = !!op.appliedAt && new Date(op.appliedAt).getTime() < cutoff
    const keepForRecovery = journalEntry && (journalEntry.status === 'prepared' || journalEntry.status === 'stock-applied')
    result[id] = (isOld && !keepForRecovery) ? { ...op, changes: [], requestFingerprint: op.requestFingerprint || catalogOperationFingerprint(op.action || 'reserve', op.changes || []) } : op
  }
  return result
}
export function applyCatalogStockOperation(operationId: string, changes: CatalogStockChange[], expectedRevision: number): { state: CatalogState; applied: boolean } | null {
  const current = readCatalogState()
  if (!current || !operationId || !changes.length) return null
  const existing = current.appliedOperations?.[operationId]
  const fingerprint = catalogOperationFingerprint('reserve', changes)
  if (existing) return existing.requestFingerprint === fingerprint ? { state: current, applied: false } : null
  if (current.revision !== expectedRevision) return null
  const next = cloneSeed(current)
  for (const change of changes) {
    if (!Number.isInteger(change.quantity) || change.quantity === 0) return null
    const sku = next.products.find((product) => product.id === change.productId)?.skus.find((candidate) => candidate.id === change.skuId)
    if (!sku || (change.quantity < 0 && sku.status === 'retired') || sku.stock + change.quantity < 0) return null
    sku.stock += change.quantity
  }
  next.appliedOperations ||= {}
  next.appliedOperations[operationId] = { id: operationId, action: 'reserve', requestFingerprint: fingerprint, changes: cloneSeed(changes), appliedAt: new Date().toISOString() }
  next.revision += 1
  return writeCatalogState(next, expectedRevision) ? { state: next, applied: true } : null
}

export function updateCatalogStock(changes: CatalogStockChange[], expectedRevision: number): CatalogState | null {
  return applyCatalogStockOperation(createId('STOCK'), changes, expectedRevision)?.state || null
}

function selectionPrices(product: CatalogProduct, input: Pick<StoreCatalogSelection, 'skuRetailPrices' | 'retailPrice'>): Record<string, number> | null {
  if (input.skuRetailPrices && typeof input.skuRetailPrices === 'object') {
    const prices = Object.fromEntries(Object.entries(input.skuRetailPrices).map(([id, price]) => [id, round2(Number(price))]))
    if (product.skus.some((sku) => sku.status !== 'retired' && (!Number.isFinite(prices[sku.id]) || prices[sku.id] < 0))) return null
    return prices
  }
  if (!Number.isFinite(input.retailPrice) || Number(input.retailPrice) < 0) return null
  const active = product.skus.filter((sku) => sku.status !== 'retired')
  const base = active.length ? Math.min(...active.map((sku) => sku.retailPrice)) : 0
  const delta = round2(Number(input.retailPrice) - base)
  return Object.fromEntries(product.skus.map((sku) => [sku.id, Math.max(0, round2(sku.retailPrice + delta))]))
}

export function readStoreCatalogSelectionState(): StoreCatalogSelectionState {
  const saved = readPlatformJson<StoreCatalogSelectionState | StoreCatalogSelection[]>(PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY)
  const legacy = Array.isArray(saved)
  const revision = legacy ? 0 : Number.isInteger(saved?.revision) && Number(saved?.revision) >= 0 ? Number(saved?.revision) : 0
  const source = legacy ? saved : Array.isArray(saved?.selections) ? saved.selections : []
  const catalog = readCatalogState()
  const selections = source.flatMap((item) => {
    const product = catalog?.products.find((candidate) => candidate.id === item?.productId)
    if (!item?.storeId || !product || !catalogChannelFlags(product.channel).store || typeof item.listed !== 'boolean') return []
    const skuRetailPrices = selectionPrices(product, item)
    if (!skuRetailPrices) return []
    return [{ storeId: item.storeId, productId: item.productId, listed: item.listed, skuRetailPrices, updatedAt: item.updatedAt || new Date(0).toISOString() }]
  })
  const state = { schemaVersion: STORE_CATALOG_SELECTION_SCHEMA_VERSION, revision, selections }
  if (legacy || (saved && !Array.isArray(saved) && saved.schemaVersion !== STORE_CATALOG_SELECTION_SCHEMA_VERSION)) writePlatformJson(PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, state)
  return cloneSeed(state)
}

export function readStoreCatalogSelections(storeId?: string): StoreCatalogSelection[] {
  const selections = readStoreCatalogSelectionState().selections
  return cloneSeed(storeId ? selections.filter((item) => item.storeId === storeId) : selections)
}

export function ensureStoreCatalogSelectionDefaults(storeId: string, catalog: CatalogState): StoreCatalogSelectionState {
  const current = readStoreCatalogSelectionState()
  if (!storeId || current.selections.some((item) => item.storeId === storeId)) return current
  const updatedAt = new Date().toISOString()
  const defaults = catalogProductsForAudience(catalog, 'farmhouse-selection')
    .filter((product) => product.farmIds.includes(storeId))
    .map<StoreCatalogSelection>((product) => ({
      storeId,
      productId: product.id,
      listed: true,
      skuRetailPrices: Object.fromEntries(product.skus.filter((sku) => sku.status !== 'retired').map((sku) => [sku.id, round2(sku.retailPrice)])),
      updatedAt
    }))
  if (!defaults.length) return current
  const next: StoreCatalogSelectionState = { ...current, revision: current.revision + 1, selections: [...current.selections, ...defaults] }
  return writePlatformJson(PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, next) ? cloneSeed(next) : current
}

export function saveStoreCatalogSelection(input: Omit<StoreCatalogSelection, 'updatedAt' | 'retailPrice'> & { updatedAt?: string }, expectedRevision: number): StoreCatalogSelectionState | null {
  const current = readStoreCatalogSelectionState()
  const product = readCatalogState()?.products.find((item) => item.id === input.productId)
  if (current.revision !== expectedRevision || !input.storeId || !product || !catalogChannelFlags(product.channel).store) return null
  const skuRetailPrices = selectionPrices(product, input)
  if (!skuRetailPrices) return null
  const next = cloneSeed(current)
  const selection: StoreCatalogSelection = { storeId: input.storeId, productId: input.productId, listed: input.listed, skuRetailPrices, updatedAt: input.updatedAt || new Date().toISOString() }
  const index = next.selections.findIndex((item) => item.storeId === input.storeId && item.productId === input.productId)
  if (index >= 0) next.selections[index] = selection
  else next.selections.push(selection)
  next.revision += 1
  return writePlatformJson(PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, next) ? next : null
}

export function upsertStoreCatalogSelection(input: Omit<StoreCatalogSelection, 'updatedAt'> & { updatedAt?: string }): boolean {
  const current = readStoreCatalogSelectionState()
  const product = readCatalogState()?.products.find((item) => item.id === input.productId)
  if (!product) return false
  const skuRetailPrices = selectionPrices(product, input)
  if (!skuRetailPrices) return false
  return !!saveStoreCatalogSelection({ storeId: input.storeId, productId: input.productId, listed: input.listed, skuRetailPrices, updatedAt: input.updatedAt }, current.revision)
}

export function readCatalogTransactionJournal(): Record<string, CatalogTransactionJournalEntry> {
  const saved = readPlatformJson<Record<string, CatalogTransactionJournalEntry>>(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
  return cloneSeed(saved)
}

export function readPendingCatalogTransactions(channel?: CatalogTransactionChannel): CatalogTransactionJournalEntry[] {
  return Object.values(readCatalogTransactionJournal())
    .filter((entry) => (!channel || entry.channel === channel) && (entry.status === 'prepared' || entry.status === 'stock-applied'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function prepareCatalogTransaction<T>(input: Omit<CatalogTransactionJournalEntry<T>, 'status' | 'createdAt' | 'updatedAt'>): boolean {
  if (!input.id || !input.inventoryChanges.length || input.inventoryChanges.some((change) => !change.productId || !change.skuId || !Number.isInteger(change.quantity) || change.quantity === 0)) return false
  const journal = readCatalogTransactionJournal()
  const existing = journal[input.id]
  if (existing) {
    const matches = existing.channel === input.channel && existing.action === input.action
      && JSON.stringify(existing.inventoryChanges) === JSON.stringify(input.inventoryChanges)
      && JSON.stringify(existing.payload) === JSON.stringify(input.payload)
    if (!matches || existing.status !== 'aborted') return matches
    existing.status = 'prepared'
    existing.updatedAt = new Date().toISOString()
    return writePlatformJson(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, journal)
  }
  const now = new Date().toISOString()
  journal[input.id] = { ...cloneSeed(input), status: 'prepared', createdAt: now, updatedAt: now }
  return writePlatformJson(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, journal)
}

function setCatalogTransactionStatus(id: string, status: CatalogTransactionStatus): boolean {
  const journal = readCatalogTransactionJournal()
  const entry = journal[id]
  if (!entry) return false
  if (entry.status === status) return true
  if (status === 'stock-applied' && entry.status !== 'prepared') return false
  if (status === 'committed' && entry.status !== 'stock-applied') return false
  if (status === 'aborted' && entry.status !== 'prepared' && entry.status !== 'stock-applied') return false
  entry.status = status
  entry.updatedAt = new Date().toISOString()
  return writePlatformJson(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, journal)
}

export function markCatalogTransactionStockApplied(id: string): boolean {
  return setCatalogTransactionStatus(id, 'stock-applied')
}

export function commitCatalogTransaction(id: string): boolean {
  return setCatalogTransactionStatus(id, 'committed')
}

export function abortCatalogTransaction(id: string): boolean {
  return setCatalogTransactionStatus(id, 'aborted')
}

export function resolveCatalogTransactionForRecovery(id: string, status: 'committed' | 'aborted'): boolean {
  const journal = readCatalogTransactionJournal()
  const entry = journal[id]
  if (!entry) return false
  if (entry.status === status) return true
  entry.status = status
  entry.updatedAt = new Date().toISOString()
  return writePlatformJson(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, journal)
}

export interface CDistributorProfile {
  userId: string
  promoterId: string
  level: 'level1' | 'level2'
  parentPromoterId?: string
  status: 'active' | 'paused'
}

export interface CAddress {
  id: string
  userId: string
  receiver: string
  phone: string
  region: string
  detail: string
  isDefault: boolean
  updatedAt?: string
}

export interface COrderItem {
  productId: string
  skuId: string
  name: string
  skuName: string
  image: string
  quantity: number
  minimumOrderQuantity?: number
  unitPrice: number
  basePrice: number
  level1Commission: number
  level2Commission: number
  supplierId: string
}

export interface CSubOrder {
  id: string
  supplierId: string
  supplierName: string
  items: COrderItem[]
  amount: number
  status: COrderStatus
  trackingNo?: string
  courier?: string
  logistics: LogisticsEvent[]
  afterSale?: CAfterSaleRequest
  inventoryReleased?: boolean
}

export interface CAfterSaleRequest {
  id: string
  reason: string
  status: 'processing' | 'reversed' | 'completed'
  createdAt: string
  evidenceImages?: BusinessMediaValue[]
}

export interface CCommissionAllocation {
  id: string
  orderId: string
  subOrderId: string
  beneficiaryId: string
  beneficiaryLevel: 'level1' | 'level2'
  amount: number
  status: CCommissionStatus
  createdAt: string
}

export interface COrder {
  id: string
  userId: string
  level: CUserLevel
  address: CAddress
  amount: number
  items: COrderItem[]
  subOrders: CSubOrder[]
  distributorChain?: string[]
  commissionAllocations: CCommissionAllocation[]
  status: COrderStatus
  createdAt: string
  paidAt?: string
  providerTransactionId?: string
  remark?: string
  inventoryReleased?: boolean
}

export interface CPriceBreakdown {
  level1: number
  level2: number
  normal: number
}

export interface COrderItemGroup {
  supplierId: string
  items: COrderItem[]
}

export interface CCartItem extends COrderItem {
  lockedLevel: CUserLevel
}

export interface CUserSessionState {
  cart: CCartItem[]
  referralPromoterId: string
}

export interface CInventoryState {
  revision: number
  products: CProduct[]
}

export interface CCommissionChain {
  level1Id?: string
  level2Id?: string
}

export const PLATFORM_C_PRODUCTS_STORAGE_KEY = 'agritainment-platform-c-products'
export const PLATFORM_C_INVENTORY_STORAGE_KEY = 'agritainment-platform-c-inventory'
export const PLATFORM_C_DISTRIBUTORS_STORAGE_KEY = 'agritainment-platform-c-distributors'
export const PLATFORM_C_ADDRESSES_STORAGE_KEY = 'agritainment-platform-c-addresses'
export const PLATFORM_C_ORDERS_STORAGE_KEY = 'agritainment-platform-c-orders'
export const PLATFORM_C_COMMISSIONS_STORAGE_KEY = 'agritainment-platform-c-commissions'
export const PLATFORM_C_USER_SESSIONS_STORAGE_KEY = 'agritainment-platform-c-user-sessions'
export const PLATFORM_C_SCHEMA_VERSION_STORAGE_KEY = 'agritainment-platform-c-schema-version'
export const PLATFORM_C_INVALID_RECORDS_STORAGE_KEY = 'agritainment-platform-c-invalid-records'
export const PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY = 'agritainment-platform-payment-attempts'
export const C_COMMERCE_SCHEMA_VERSION = 1

export type PaymentAttemptStatus = 'created' | 'unknown' | 'failed' | 'confirmed' | 'synchronized'
export interface PaymentAttempt {
  operationId: string
  orderId: string
  userId: string
  amount: number
  status: PaymentAttemptStatus
  providerTransactionId?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
}

function validPaymentAttempt(value: unknown): value is PaymentAttempt {
  const attempt = value as PaymentAttempt | null
  return !!attempt
    && typeof attempt.operationId === 'string' && !!attempt.operationId.trim()
    && typeof attempt.orderId === 'string' && !!attempt.orderId.trim()
    && typeof attempt.userId === 'string' && !!attempt.userId.trim()
    && Number.isFinite(attempt.amount) && attempt.amount > 0
    && ['created', 'unknown', 'failed', 'confirmed', 'synchronized'].includes(attempt.status)
    && (!['confirmed', 'synchronized'].includes(attempt.status) || !!attempt.providerTransactionId?.trim())
    && (attempt.status !== 'failed' || !!attempt.failureReason?.trim())
    && (!['created', 'unknown'].includes(attempt.status) || (!attempt.providerTransactionId && !attempt.failureReason))
    && (attempt.status !== 'failed' || !attempt.providerTransactionId)
    && (!['confirmed', 'synchronized'].includes(attempt.status) || !attempt.failureReason)
    && Number.isFinite(Date.parse(attempt.createdAt))
    && Number.isFinite(Date.parse(attempt.updatedAt))
    && Date.parse(attempt.updatedAt) >= Date.parse(attempt.createdAt)
}

export function readPaymentAttempts(): Record<string, PaymentAttempt> {
  const saved = readPlatformJson<Record<string, PaymentAttempt>>(PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY)
  if (!saved || typeof saved !== 'object') return {}
  return Object.fromEntries(Object.entries(saved).filter(([operationId, attempt]) => operationId === attempt?.operationId && validPaymentAttempt(attempt)))
}

function writePaymentAttempt(attempt: PaymentAttempt): boolean {
  if (!validPaymentAttempt(attempt)) return false
  return writePlatformJson(PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, { ...readPaymentAttempts(), [attempt.operationId]: cloneSeed(attempt) })
}

export interface BeginPaymentAttemptInput {
  orderId: string
  userId: string
  amount: number
}

export type BeginPaymentAttemptResult =
  | { ok: true; attempt: PaymentAttempt }
  | { ok: false; code: 'invalid' | 'ownership_conflict' | 'write_failed'; message: string }

function latestPaymentAttempt(attempts: PaymentAttempt[]): PaymentAttempt | undefined {
  return [...attempts].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || right.operationId.localeCompare(left.operationId))[0]
}

export async function beginPaymentAttempt(input: BeginPaymentAttemptInput): Promise<BeginPaymentAttemptResult> {
  if (!input.orderId?.trim() || !input.userId?.trim() || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, code: 'invalid', message: '支付记录参数无效' }
  }
  const result = await runLockedPlatformCollectionTask<BeginPaymentAttemptResult>({
    collections: [PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY],
    execute: () => {
      const attempts = readPaymentAttempts()
      const orderAttempts = Object.values(attempts).filter((attempt) => attempt.orderId === input.orderId)
      if (orderAttempts.some((attempt) => attempt.userId !== input.userId || attempt.amount !== input.amount)) {
        return { ok: false, code: 'ownership_conflict', message: '支付记录归属异常' }
      }
      const latest = latestPaymentAttempt(orderAttempts)
      if (latest && latest.status !== 'failed') return { ok: true, attempt: latest }
      let operationId = `payment:${input.orderId}`
      if (latest) {
        let retry = 1
        do { operationId = `payment:${input.orderId}:retry:${retry}`; retry += 1 } while (attempts[operationId])
      }
      const latestTimestamp = orderAttempts.reduce((maximum, attempt) => Math.max(maximum, Date.parse(attempt.createdAt), Date.parse(attempt.updatedAt)), 0)
      const timestamp = new Date(Math.max(Date.now(), latestTimestamp + 1)).toISOString()
      const attempt: PaymentAttempt = { ...input, operationId, status: 'created', createdAt: timestamp, updatedAt: timestamp }
      return writePaymentAttempt(attempt)
        ? { ok: true, attempt }
        : { ok: false, code: 'write_failed', message: '支付记录无法保存' }
    }
  })
  return result.ok && result.value ? result.value : { ok: false, code: 'write_failed', message: '支付记录无法保存' }
}

const PAYMENT_ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, PaymentAttemptStatus[]> = {
  created: ['created', 'unknown', 'failed', 'confirmed'],
  unknown: ['unknown', 'failed', 'confirmed'],
  failed: ['failed'],
  confirmed: ['confirmed', 'synchronized'],
  synchronized: ['synchronized']
}

export async function transitionPaymentAttempt(attempt: PaymentAttempt): Promise<boolean> {
  if (!validPaymentAttempt(attempt)) return false
  const result = await runLockedPlatformCollectionTask({
    collections: [PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY],
    execute: () => {
      const current = readPaymentAttempts()[attempt.operationId]
      if (!current) return false
      if (current.orderId !== attempt.orderId || current.userId !== attempt.userId || current.amount !== attempt.amount || current.createdAt !== attempt.createdAt) return false
      if (!PAYMENT_ATTEMPT_TRANSITIONS[current.status].includes(attempt.status)) return false
      if (Date.parse(attempt.updatedAt) < Date.parse(current.updatedAt)) return false
      if (current.providerTransactionId && current.providerTransactionId !== attempt.providerTransactionId) return false
      if (current.status === attempt.status && (current.providerTransactionId !== attempt.providerTransactionId || current.failureReason !== attempt.failureReason)) return false
      if (current.status === 'synchronized' && (current.providerTransactionId !== attempt.providerTransactionId || current.failureReason !== attempt.failureReason)) return false
      return writePaymentAttempt(attempt)
    }
  })
  return result.ok && result.value === true
}

export interface CInvalidRecord {
  kind: 'commission'
  recordId: string
  reason: string
  recordedAt: string
}

export function readCCommerceSchemaVersion(): number {
  const saved = readPlatformJson<number>(PLATFORM_C_SCHEMA_VERSION_STORAGE_KEY)
  return typeof saved === 'number' && Number.isInteger(saved) && saved >= 0 ? saved : 0
}

export function ensureCCommerceSchemaVersion(): void {
  if (readCCommerceSchemaVersion() !== C_COMMERCE_SCHEMA_VERSION) writePlatformJson(PLATFORM_C_SCHEMA_VERSION_STORAGE_KEY, C_COMMERCE_SCHEMA_VERSION)
}

export function readCInvalidRecords(): CInvalidRecord[] {
  const saved = readPlatformJson<CInvalidRecord[]>(PLATFORM_C_INVALID_RECORDS_STORAGE_KEY)
  return Array.isArray(saved) ? saved : []
}

function recordInvalidCommissionIds(records: readonly CCommissionAllocation[]): void {
  const invalid = records.filter((record) => !record || !record.id || !record.orderId || !record.subOrderId || !record.beneficiaryId || !Number.isFinite(Number(record.amount)))
  if (!invalid.length) return
  const existing = readCInvalidRecords()
  const known = new Set(existing.map((item) => item.recordId))
  const next = invalid.filter((record) => !known.has(String(record?.id || ''))).map((record) => ({ kind: 'commission' as const, recordId: String(record?.id || 'unknown'), reason: '缺少订单、子订单、受益人或有效金额', recordedAt: new Date().toISOString() }))
  if (next.length) writePlatformJson(PLATFORM_C_INVALID_RECORDS_STORAGE_KEY, [...existing, ...next])
}

export const cProducts: CProduct[] = [
  {
    id: 'C001', name: '湘西烟熏柴火腊肉', category: '土特产', supplierId: 'S002', supplierName: '湘西腊味合作社', image: '/static/images/bacon.webp',
    tags: ['柴火慢熏', '产地直发'], status: 'active', shippingType: 'courier', channels: { live: true }, expressDelivery: true, productType: 'goods',
    skus: [{ id: 'C001-500', name: '500g/袋', image: '/static/images/bacon.webp', stock: 120, basePrice: 20, level1Commission: 10, level2Commission: 15 }, { id: 'C001-1000', name: '1kg家庭装', image: '/static/images/bacon.webp', stock: 60, basePrice: 38, level1Commission: 16, level2Commission: 21 }]
  },
  {
    id: 'C002', name: '炎陵黄桃鲜果礼盒', category: '生鲜水果', supplierId: 'S004', supplierName: '炎陵果业有限公司', image: '/static/images/peach.webp',
    tags: ['当季鲜果', '顺丰冷链'], status: 'active', shippingType: 'courier', channels: { live: true }, expressDelivery: true, productType: 'goods',
    skus: [{ id: 'C002-5J', name: '5斤礼盒', image: '/static/images/peach.webp', stock: 80, basePrice: 32, level1Commission: 8, level2Commission: 12 }, { id: 'C002-10J', name: '10斤家庭装', image: '/static/images/peach.webp', stock: 40, basePrice: 58, level1Commission: 14, level2Commission: 18 }]
  },
  {
    id: 'C003', name: '安化黑茶礼盒装', category: '茶饮伴手礼', supplierId: 'S003', supplierName: '安化茶业集团', image: '/static/images/tea.webp',
    tags: ['礼盒装', '节日送礼'], status: 'active', shippingType: 'courier', channels: { live: true }, expressDelivery: true, productType: 'goods',
    skus: [{ id: 'C003-GIFT', name: '雅藏礼盒', image: '/static/images/tea.webp', stock: 50, basePrice: 48, level1Commission: 16, level2Commission: 24 }]
  },
  {
    id: 'C004', name: '武陵山野生土蜂蜜', category: '土特产', supplierId: 'S006', supplierName: '武陵蜂业专业合作社', image: '/static/images/honey.webp',
    tags: ['自然成熟', '产地直发'], status: 'active', shippingType: 'courier', channels: { live: true }, expressDelivery: true, productType: 'goods',
    skus: [{ id: 'C004-500', name: '500g/瓶', image: '/static/images/honey.webp', stock: 90, basePrice: 56, level1Commission: 20, level2Commission: 24 }]
  }
]

export const demoCDistributorProfiles: Record<string, CDistributorProfile> = {
  'U-DEMO-L1': { userId: 'U-DEMO-L1', promoterId: 'T001', level: 'level1', status: 'active' },
  'U-DEMO-L2': { userId: 'U-DEMO-L2', promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' }
}

export function cPriceBreakdown(sku: CProductSku): CPriceBreakdown {
  return { level1: round2(sku.basePrice), level2: round2(sku.basePrice + sku.level1Commission), normal: round2(sku.basePrice + sku.level1Commission + sku.level2Commission) }
}

export function cPriceForSku(sku: CProductSku, level: CUserLevel): number {
  const prices = cPriceBreakdown(sku)
  return prices[level]
}

export function resolveCReferralChain(promoterId: string, promoterList: readonly Promoter[], profiles: Record<string, CDistributorProfile>): CCommissionChain | null {
  const promoter = promoterList.find((item) => item.id === promoterId)
  if (!promoter || promoter.status !== 'active') return null
  const profile = Object.values(profiles).find((item) => item.promoterId === promoterId)
  if (profile && profile.status !== 'active') return null
  const parent = profile?.parentPromoterId
    ? promoterList.find((item) => item.id === profile.parentPromoterId && item.status === 'active')
    : undefined
  return parent ? { level1Id: parent.id, level2Id: promoterId } : { level2Id: promoterId }
}

export function allocateCCommissions(items: COrderItem[], chain: CCommissionChain, buyerLevel: CUserLevel, orderId = '', subOrderId = ''): CCommissionAllocation[] {
  const now = new Date().toISOString()
  return allocateCatalogCommissions(
    items.map((item) => ({ quantity: item.quantity, level1Amount: item.level1Commission, level2Amount: item.level2Commission })),
    chain,
    buyerLevel
  ).map((allocation) => ({
    id: createId('CC'), orderId, subOrderId,
    beneficiaryId: allocation.beneficiaryId,
    beneficiaryLevel: allocation.beneficiaryLevel,
    amount: allocation.amount, status: 'pending', createdAt: now
  }))
}

export function splitCOrderItems(items: COrderItem[]): COrderItemGroup[] {
  const groups = new Map<string, COrderItem[]>()
  items.forEach((item) => groups.set(item.supplierId, [...(groups.get(item.supplierId) || []), item]))
  return [...groups.entries()].map(([supplierId, groupedItems]) => ({ supplierId, items: groupedItems }))
}

export function nextCOrderStatus(status: COrderStatus): COrderStatus {
  const next: Partial<Record<COrderStatus, COrderStatus>> = { pending_payment: 'paid', paid: 'shipped', shipped: 'received', received: 'received', partially_shipped: 'partially_received', partially_received: 'partially_received', partially_after_sale: 'partially_after_sale', cancelled: 'cancelled', after_sale: 'after_sale' }
  return next[status] || status
}

export function deriveCOrderStatus(subOrders: readonly Pick<CSubOrder, 'status'>[]): COrderStatus {
  if (!subOrders.length) return 'pending_payment'
  const statuses = subOrders.map((item) => item.status)
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled'
  if (statuses.every((status) => status === 'after_sale')) return 'after_sale'
  if (statuses.some((status) => status === 'after_sale')) return 'partially_after_sale'
  if (statuses.every((status) => status === 'received')) return 'received'
  if (statuses.some((status) => status === 'received')) return 'partially_received'
  if (statuses.every((status) => status === 'shipped')) return 'shipped'
  if (statuses.some((status) => status === 'shipped')) return 'partially_shipped'
  if (statuses.every((status) => status === 'paid')) return 'paid'
  if (statuses.some((status) => status === 'paid')) return 'paid'
  return 'pending_payment'
}

export type PortalTarget = 'admin' | 'farmhouse' | 'store' | 'promoter' | 'user' | 'supplier'

const PORTAL_QUERY_KEYS = new Set(['promoter', 'promoterName', 'live', 'staff', 'farm', 'activity', 'store'])

export function buildPortalUrl(target: PortalTarget, path: string, params: Record<string, string | undefined> = {}, origin = ''): string {
  const prefix = `/${target}/`
  const normalizedPath = path.replace(/^\/+/, '')
  const query = Object.entries(params)
    .filter(([key, value]) => PORTAL_QUERY_KEYS.has(key) && typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join('&')
  return `${origin.replace(/\/$/, '')}${prefix}#/${normalizedPath}${query ? `?${query}` : ''}`
}

export interface SupplierFulfillmentSnapshot {
  status?: PurchaseStatus
  shipType?: 'driver' | 'courier'
  trackingNo?: string
  courier?: string
  logistics?: LogisticsEvent[]
}

function cStatusFromSupplierSnapshot(snapshot: SupplierFulfillmentSnapshot): COrderStatus | null {
  if (snapshot.status === 'received' || snapshot.status === 'completed') return 'received'
  if (snapshot.status === 'shipped' || snapshot.status === 'delivering') return 'shipped'
  if (snapshot.status === 'cancelled') return 'after_sale'
  if (snapshot.status === 'submitted' || snapshot.status === 'accepted') return 'paid'
  return null
}

const C_FULFILLMENT_STATUS_RANK: Partial<Record<COrderStatus, number>> = {
  pending_payment: 0,
  paid: 1,
  partially_shipped: 2,
  shipped: 2,
  partially_received: 3,
  received: 3,
  partially_after_sale: 4
}

function mergeCSubOrderStatus(current: COrderStatus, incoming: COrderStatus | null): COrderStatus {
  if (!incoming || current === 'received' || current === 'cancelled' || current === 'after_sale') return current
  if (incoming === 'after_sale') return incoming
  const currentRank = C_FULFILLMENT_STATUS_RANK[current]
  const incomingRank = C_FULFILLMENT_STATUS_RANK[incoming]
  return currentRank === undefined || incomingRank === undefined || incomingRank < currentRank ? current : incoming
}

function mergeLogisticsEvents(current: readonly LogisticsEvent[], incoming: readonly LogisticsEvent[]): LogisticsEvent[] {
  const events = new Map<string, LogisticsEvent>()
  ;[...current, ...incoming].forEach((event) => {
    const key = JSON.stringify([event.time, event.title, event.detail])
    if (!events.has(key)) events.set(key, cloneSeed(event))
  })
  return [...events.values()].sort((a, b) => {
    const left = Date.parse(a.time)
    const right = Date.parse(b.time)
    return Number.isNaN(left) || Number.isNaN(right) ? 0 : left - right
  })
}

export function mergeCSubOrderFulfillment(current: CSubOrder, incoming: SupplierFulfillmentSnapshot): CSubOrder {
  const incomingStatus = cStatusFromSupplierSnapshot(incoming)
  const terminal = current.status === 'received' || current.status === 'cancelled' || current.status === 'after_sale'
  const status = mergeCSubOrderStatus(current.status, incomingStatus)
  const logistics = terminal || !Array.isArray(incoming.logistics)
    ? current.logistics
    : mergeLogisticsEvents(current.logistics, incoming.logistics)
  const trackingNo = incoming.trackingNo?.trim() || current.trackingNo
  const courier = incoming.courier?.trim() || current.courier || (incoming.shipType === 'courier' ? '快递配送' : undefined)
  return {
    ...current,
    status,
    trackingNo,
    courier,
    logistics
  }
}

export function publishCSubOrderToSupplier(order: COrder, subOrder: CSubOrder): Order {
  const fulfillment: SupplierFulfillment = {
    status: 'submitted', shipType: 'courier', shortages: [], handovers: [], updatedAt: new Date().toISOString()
  }
  return {
    id: `C-MALL-${subOrder.id}`,
    productName: subOrder.items[0]?.name || 'C端商城商品',
    quantity: subOrder.items.reduce((sum, item) => sum + item.quantity, 0),
    amount: round2(subOrder.amount),
    customer: `${order.address.receiver} · C端商城`,
    storeId: 'C-MALL',
    storeName: 'C端商城',
    channel: 'purchase',
    status: 'pending',
    createdAt: order.createdAt,
    items: subOrder.items.map((item) => ({ productId: item.productId, skuId: item.skuId, name: item.name, skuName: item.skuName, image: item.image, quantity: item.quantity, price: item.unitPrice })),
    supplierId: subOrder.supplierId,
    supplierFulfillment: fulfillment,
    supplierOrderLink: {
      source: 'c-mall', sourceOrderId: order.id, sourceSubOrderId: subOrder.id,
      customerUserId: order.userId, deliveryAddress: cloneSeed(order.address)
    },
    logistics: cloneSeed(subOrder.logistics)
  }
}

export function syncCSubOrderFromSupplier(order: COrder, subOrder: CSubOrder, supplierOrder: Order): COrder {
  const next = cloneSeed(order)
  const target = next.subOrders.find((item) => item.id === subOrder.id)
  if (!target) return next
  const fulfillment = supplierOrder.supplierFulfillment
  const supplierStatus = fulfillment?.status || (supplierOrder.status === 'delivered' ? 'received' : supplierOrder.status === 'shipping' ? 'shipped' : undefined)
  next.subOrders[next.subOrders.findIndex((item) => item.id === subOrder.id)] = mergeCSubOrderFulfillment(target, {
    status: supplierStatus,
    shipType: fulfillment?.shipType,
    trackingNo: supplierOrder.trackingNo || fulfillment?.trackingNo,
    logistics: supplierOrder.logistics
  })
  next.status = deriveCOrderStatus(next.subOrders)
  return next
}

export function markCSubOrderAfterSaleAtSupplier(supplierOrder: Order, operator = '用户'): Order | null {
  if (supplierOrder.supplierOrderLink?.source !== 'c-mall') return null
  const fulfillment = ensureSupplierFulfillment(supplierOrder)
  if (fulfillment.status === 'cancelled' || supplierOrder.status === 'after-sale') return supplierOrder
  const now = new Date().toISOString()
  return {
    ...supplierOrder,
    status: 'after-sale',
    flow: [...(supplierOrder.flow || []), flowEvent('售后处理中 · C 端用户发起售后', operator)],
    fulfillmentEvents: [...(supplierOrder.fulfillmentEvents || []), fulfillmentEvent(supplierOrder.id, fulfillment.status, 'cancelled', operator, 'user')],
    logistics: [...(supplierOrder.logistics || []), logisticsEvent('售后处理中', 'C 端用户已发起售后')],
    supplierFulfillment: { ...fulfillment, status: 'cancelled', updatedAt: now }
  }
}

export function confirmCSubOrderReceiptAtSupplier(supplierOrder: Order, operator = '用户', operatorRole = 'user'): Order | null {
  if (supplierOrder.supplierOrderLink?.source !== 'c-mall') return null
  const fulfillment = ensureSupplierFulfillment(supplierOrder)
  if (fulfillment.status !== 'shipped' && fulfillment.status !== 'delivering') return null
  return {
    ...supplierOrder,
    status: 'delivered',
    flow: [...(supplierOrder.flow || []), flowEvent('已签收 · C 端用户确认收货', operator)],
    fulfillmentEvents: [...(supplierOrder.fulfillmentEvents || []), fulfillmentEvent(supplierOrder.id, fulfillment.status, 'received', operator, operatorRole)],
    logistics: [...(supplierOrder.logistics || []), logisticsEvent('已签收', 'C 端用户已确认收货')],
    supplierFulfillment: { ...fulfillment, status: 'received', updatedAt: new Date().toISOString() }
  }
}

function normalizeIso(value: unknown): string {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function normalizeCProducts(products: readonly CProduct[]): CProduct[] {
  if (!Array.isArray(products)) return []
  return products.map((product) => {
    if (!product || !product.id || !product.name || !Array.isArray(product.skus) || (product.status !== 'active' && product.status !== 'offline') || product.shippingType !== 'courier') return null
    const skus: CProductSku[] = product.skus.map((sku: CProductSku): CProductSku | null => {
      if (!sku || !sku.id || !sku.name) return null
      const stock = Number(sku.stock)
      const basePrice = Number(sku.basePrice)
      const level1Commission = Number(sku.level1Commission)
      const level2Commission = Number(sku.level2Commission)
      if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(basePrice) || basePrice < 0 || !Number.isFinite(level1Commission) || level1Commission < 0 || !Number.isFinite(level2Commission) || level2Commission < 0) return null
      return { ...sku, stock: Math.floor(stock), basePrice: round2(basePrice), level1Commission: round2(level1Commission), level2Commission: round2(level2Commission), minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity) }
    }).filter((sku: CProductSku | null): sku is CProductSku => sku !== null)
    return skus.length ? { ...product, tags: Array.isArray(product.tags) ? product.tags : [], skus } : null
  }).filter((product): product is CProduct => !!product)
}

export function normalizeCAddresses(addresses: Record<string, CAddress>): Record<string, CAddress> {
  const valid: CAddress[] = Object.entries(addresses || {}).map(([id, address], index): CAddress | null => {
    if (!address || !address.userId || !address.receiver?.trim() || !/^1[3-9]\d{9}$/.test(address.phone?.trim() || '') || !address.region?.trim() || !address.detail?.trim()) return null
    return { id: address.id || id, userId: address.userId, receiver: address.receiver.trim(), phone: address.phone.trim(), region: address.region.trim(), detail: address.detail.trim(), isDefault: !!address.isDefault, updatedAt: address.updatedAt ? normalizeIso(address.updatedAt) : new Date(index).toISOString() }
  }).filter((address): address is CAddress => address !== null)
  const grouped = new Map<string, CAddress[]>()
  valid.forEach((address) => grouped.set(address.userId, [...(grouped.get(address.userId) || []), address]))
  const normalized: Record<string, CAddress> = {}
  grouped.forEach((items) => {
    const defaults = items.filter((item) => item.isDefault)
    const selected = (defaults.length ? defaults : items).slice().sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '')).at(-1)
    items.forEach((item) => { normalized[item.id] = { ...item, isDefault: item.id === selected?.id } })
  })
  return normalized
}

export function normalizeCCommissionRecords(records: readonly CCommissionAllocation[]): CCommissionAllocation[] {
  if (!Array.isArray(records)) return []
  return records.filter((record) => record && record.id && record.orderId && record.subOrderId && record.beneficiaryId && Number.isFinite(Number(record.amount))).map((record) => ({
    ...record,
    amount: round2(Number(record.amount)),
    status: record.status === 'available' || record.status === 'withdrawn' || record.status === 'reversed' ? record.status : 'pending',
    createdAt: normalizeIso(record.createdAt)
  }))
}

export function normalizeCOrders(orders: Record<string, COrder>): Record<string, COrder> {
  const normalized: Record<string, COrder> = {}
  const statuses: COrderStatus[] = ['pending_payment', 'paid', 'shipped', 'received', 'cancelled', 'after_sale', 'partially_shipped', 'partially_received', 'partially_after_sale']
  Object.entries(orders || {}).forEach(([id, order]) => {
    if (!order || !order.id || !order.userId || !order.address || order.address.userId !== order.userId || !order.address.receiver?.trim() || !/^1[3-9]\d{9}$/.test(order.address.phone?.trim() || '') || !order.address.region?.trim() || !order.address.detail?.trim() || !Array.isArray(order.subOrders)) return
    const subOrderIds = new Set<string>()
    for (const sub of order.subOrders) {
      if (!sub?.id || subOrderIds.has(sub.id)) return
      subOrderIds.add(sub.id)
      if (!sub.supplierId || !Array.isArray(sub.items) || sub.items.some((item) => !item || !item.productId || !item.skuId || !item.supplierId || item.supplierId !== sub.supplierId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0 || !Number.isFinite(Number(item.basePrice)) || Number(item.basePrice) < 0 || !Number.isFinite(Number(item.level1Commission)) || Number(item.level1Commission) < 0 || !Number.isFinite(Number(item.level2Commission)) || Number(item.level2Commission) < 0)) return
    }
    const subOrders = order.subOrders.filter((sub) => sub && sub.id && sub.supplierId && Array.isArray(sub.items)).map((sub): CSubOrder => {
      const items = sub.items.map((item) => ({
        ...item,
        quantity: Math.floor(Number(item.quantity)),
        minimumOrderQuantity: normalizeMinimumOrderQuantity(item.minimumOrderQuantity),
        unitPrice: round2(Number(item.unitPrice) || 0),
        basePrice: round2(Number(item.basePrice) || 0),
        level1Commission: round2(Number(item.level1Commission) || 0),
        level2Commission: round2(Number(item.level2Commission) || 0)
      }))
      const logistics = Array.isArray(sub.logistics) ? sub.logistics.filter((event) => event && event.title).map((event) => ({
        time: normalizeIso(event.time), title: String(event.title), detail: String(event.detail || '')
      })) : []
      const afterSale: CAfterSaleRequest | undefined = sub.afterSale ? { ...sub.afterSale, status: sub.afterSale.status === 'reversed' || sub.afterSale.status === 'completed' ? sub.afterSale.status : 'processing', createdAt: normalizeIso(sub.afterSale.createdAt) } : undefined
      return {
        ...sub,
        items,
        amount: round2(Number(sub.amount) || 0),
        status: statuses.includes(sub.status) ? sub.status : 'pending_payment',
        logistics,
        afterSale,
        inventoryReleased: !!sub.inventoryReleased
      }
    }).filter((sub) => sub.items.length > 0)
    const subIds = new Set(subOrders.map((sub) => sub.id))
    const commissionAllocations = normalizeCCommissionRecords(order.commissionAllocations || []).filter((record) => record.orderId === order.id && subIds.has(record.subOrderId))
    if (!subOrders.length) return
    normalized[id] = { ...order, id: order.id, items: subOrders.flatMap((sub) => sub.items), amount: round2(Number(order.amount) || 0), subOrders, commissionAllocations, status: deriveCOrderStatus(subOrders), createdAt: normalizeIso(order.createdAt), paidAt: order.paidAt ? normalizeIso(order.paidAt) : undefined }
  })
  return normalized
}

function readRawCInventoryState(): CInventoryState | null {
  const saved = readPlatformJson<CInventoryState>(PLATFORM_C_INVENTORY_STORAGE_KEY)
  if (!saved || !Number.isInteger(saved.revision) || saved.revision < 0 || !Array.isArray(saved.products)) return null
  const products = normalizeCProducts(saved.products)
  return products.length ? { revision: saved.revision, products } : null
}

export function readCInventoryState(): CInventoryState | null {
  if (readCatalogLegacyMigrationMarker()) return null
  const saved = readRawCInventoryState()
  if (saved) return saved
  const legacy = readPlatformJson<CProduct[]>(PLATFORM_C_PRODUCTS_STORAGE_KEY)
  if (!Array.isArray(legacy)) return null
  const migrated = { revision: 0, products: normalizeCProducts(legacy) }
  if (!migrated.products.length) return null
  writePlatformJson(PLATFORM_C_INVENTORY_STORAGE_KEY, migrated)
  return migrated
}

export function writeCInventoryState(next: CInventoryState, expectedRevision: number): boolean {
  if (readCatalogLegacyMigrationMarker()) return false
  const current = readCInventoryState()
  const currentRevision = current?.revision ?? 0
  if (currentRevision !== expectedRevision || next.revision !== expectedRevision + 1) return false
  const products = normalizeCProducts(next.products)
  if (!products.length) return false
  return writePlatformJson(PLATFORM_C_INVENTORY_STORAGE_KEY, { revision: next.revision, products })
}

export function readCProducts(): CProduct[] | null { return readCInventoryState()?.products || null }
export function writeCProducts(value: CProduct[]): boolean {
  const current = readCInventoryState()
  const expectedRevision = current?.revision ?? 0
  return writeCInventoryState({ revision: expectedRevision + 1, products: value }, expectedRevision)
}

export function readCUserSession(userId: string): CUserSessionState {
  const sessions = readPlatformJson<Record<string, CUserSessionState>>(PLATFORM_C_USER_SESSIONS_STORAGE_KEY) || {}
  const saved = sessions[userId]
  return {
    cart: Array.isArray(saved?.cart) ? cloneSeed(saved.cart) : [],
    referralPromoterId: typeof saved?.referralPromoterId === 'string' ? saved.referralPromoterId : ''
  }
}

export function writeCUserSession(userId: string, value: CUserSessionState): boolean {
  if (!userId) return false
  const sessions = readPlatformJson<Record<string, CUserSessionState>>(PLATFORM_C_USER_SESSIONS_STORAGE_KEY) || {}
  sessions[userId] = cloneSeed(value)
  return writePlatformJson(PLATFORM_C_USER_SESSIONS_STORAGE_KEY, sessions)
}
export function readCDistributorProfiles(): Record<string, CDistributorProfile> | null {
  const saved = readPlatformJson<Record<string, CDistributorProfile>>(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY)
  return saved && typeof saved === 'object' ? saved : null
}
export function writeCDistributorProfiles(value: Record<string, CDistributorProfile>): boolean { return writePlatformJson(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, value) }
export function readCAddresses(): Record<string, CAddress> | null {
  const saved = readPlatformJson<Record<string, CAddress>>(PLATFORM_C_ADDRESSES_STORAGE_KEY)
  return saved && typeof saved === 'object' ? normalizeCAddresses(saved) : null
}
export function writeCAddresses(value: Record<string, CAddress>): boolean { return writePlatformJson(PLATFORM_C_ADDRESSES_STORAGE_KEY, normalizeCAddresses(value)) }
export function writeCAddress(value: CAddress): boolean { return writeCAddresses({ ...(readCAddresses() || {}), [value.id]: value }) }
export function removeCAddress(id: string): boolean {
  const addresses = readCAddresses() || {}
  const removed = addresses[id]
  if (!removed) return false
  delete addresses[id]
  if (removed?.isDefault) {
    const remaining = Object.values(addresses)
    if (remaining.length && !remaining.some((address) => address.isDefault)) remaining[0].isDefault = true
  }
  return writeCAddresses(addresses)
}

export function canTransitionCOrderStatus(from: COrderStatus, to: COrderStatus): boolean {
  if (from === to) return true
  return nextCOrderStatus(from) === to
}
export function readCOrders(): Record<string, COrder> | null {
  const saved = readPlatformJson<Record<string, COrder>>(PLATFORM_C_ORDERS_STORAGE_KEY)
  return saved && typeof saved === 'object' ? normalizeCOrders(saved) : null
}
export function writeCOrder(value: COrder): boolean { return writePlatformJson(PLATFORM_C_ORDERS_STORAGE_KEY, { ...(readCOrders() || {}), [value.id]: normalizeCOrders({ [value.id]: value })[value.id] || value }) }
export function writeCOrders(value: Record<string, COrder>): boolean { return writePlatformJson(PLATFORM_C_ORDERS_STORAGE_KEY, normalizeCOrders(value)) }
export function readCCommissionRecords(): CCommissionAllocation[] | null {
  const saved = readPlatformJson<CCommissionAllocation[]>(PLATFORM_C_COMMISSIONS_STORAGE_KEY)
  if (!Array.isArray(saved)) return null
  recordInvalidCommissionIds(saved)
  const normalized = normalizeCCommissionRecords(saved)
  if (JSON.stringify(saved) !== JSON.stringify(normalized)) writePlatformJson(PLATFORM_C_COMMISSIONS_STORAGE_KEY, normalized)
  return normalized
}
export function writeCCommissionRecords(value: CCommissionAllocation[]): boolean {
  recordInvalidCommissionIds(value)
  return writePlatformJson(PLATFORM_C_COMMISSIONS_STORAGE_KEY, normalizeCCommissionRecords(value))
}

export function seedCCommerceData(): void {
  ensureCCommerceSchemaVersion()
  if (!readCProducts()) writeCProducts(cloneSeed(cProducts))
  if (!readCDistributorProfiles()) writeCDistributorProfiles(cloneSeed(demoCDistributorProfiles))
  if (!readCCommissionRecords()) writeCCommissionRecords([])
}


export * from './auth'
export * from './media'
export * from './product-category-images'
export * from './regions'
export * from './dashboard'
export * from './dashboard-source'
export * from './geocoding'
export * from './xlsx'
export * from './dictionaries'
export * from './platform-repository'
export * from './platform-event-bus'

// ===== 兼容层：平台共享数据引擎（按方案 B2 重建） =====

export interface VoucherOrder {
  id: string
  userId: string
  promoterId?: string
  liveId?: string
  farmId: string
  productId: string
  skuId: string
  quantity: number
  amount: number
  status: 'paid' | 'redeemed' | 'refunded'
  createdAt: string
  providerTransactionId?: string
  redeemedAt?: string
  refundedAt?: string
}

export interface UserCommercePurchaseIntent {
  ownerUserId: string
  productId: string
  skuId: string
  quantity: number
  amount: number
  operationId: string
}

export interface CommissionLedgerEntry {
  id: string
  sourceOrderId: string
  sourceSubOrderId?: string
  beneficiaryType: 'promoter' | 'staff' | 'farm' | 'live'
  beneficiaryId: string
  farmId?: string
  role: string
  amount: number
  status: CommissionStatus
  reversalOf?: string
  createdAt: string
  updatedAt?: string
  dataOrigin?: 'dashboard_demo'
}

export interface PromoterAccount {
  id: string
  promoterId: string
  type: string
  level: string
  status: 'active' | 'paused' | 'pending'
  name: string
  account: string
  password: string
  mobile?: string
  enabled: boolean
  createdAt: string
}

export interface PlatformPrincipal {
  actorType: string
  actorId: string
  tenantId: string
  regionCodes?: string[]
  status: string
}

export interface PlatformChange {
  key: string
  source: 'write' | 'storage' | string
  publishedAt?: number
}
export const PLATFORM_VOUCHERS_STORAGE_KEY = 'agritainment-platform-vouchers'
export const PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY = 'agritainment-platform-user-commerce-intents'
export const PLATFORM_COMMISSION_LEDGER_STORAGE_KEY = 'agritainment-platform-commission-ledger'
export const PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY = 'agritainment-platform-commission-ledger-migrated'
export const PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY = 'agritainment-platform-promoter-accounts'
export const PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY = 'agritainment-platform-supplier-accounts'
export const PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY = 'agritainment-platform-supplier-settlements'
export const PLATFORM_COMMISSION_RULES_STORAGE_KEY = 'agritainment-platform-commission-rules'
export const PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY = 'agritainment-platform-commission-settlement-records'
export const PLATFORM_EXPERIENCES_STORAGE_KEY = 'agritainment-platform-experiences'
export const PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY = 'agritainment-platform-catalog-legacy-migration-marker'
const PLATFORM_RETIRED_DATA_MARKER_STORAGE_KEY = 'agritainment-platform-retired-data-cleared-v8'

/**
 * 已按功能清单移除的业务域（预约管理 / 旅游线路 / 产地直播）在本地存储里的遗留集合键。
 * 保留导出，便于排查与测试断言。
 */
export const RETIRED_PLATFORM_STORAGE_KEYS = [
  'agritainment-platform-bookings',
  'agritainment-platform-routes',
  'agritainment-platform-lives',
  'agritainment-platform-lives-updated-at',
  'agritainment-platform-experiences'
] as const

/**
 * 一次性清理：清掉已移除业务域的本地存储遗留集合。
 * 幂等：清理完成后写入标记键，重复调用不会重复写入。
 */
export function clearRetiredPlatformData(): boolean {
  try {
    if (readPlatformJson<boolean>(PLATFORM_RETIRED_DATA_MARKER_STORAGE_KEY) === true) return true
    RETIRED_PLATFORM_STORAGE_KEYS.forEach((key) => clearPlatformJson(key))
    return writePlatformJson(PLATFORM_RETIRED_DATA_MARKER_STORAGE_KEY, true)
  } catch {
    return false
  }
}

// ===== 兼容层：字典运行时与平台变更订阅 =====
export interface PlatformDictionaryCache {
  getOptions(type: DictType): DictItem[]
  label(type: DictType, code: string): string
  subscribe(listener: (state: PlatformDictionaryState) => void): () => void
  dispose(): void
}

export function readPlatformDictionaries(): PlatformDictionaryState {
  const saved = readPlatformJson<unknown>(PLATFORM_DICTIONARIES_STORAGE_KEY)
  const currentSchema = !!saved && typeof saved === 'object' && !Array.isArray(saved)
    && (saved as { schemaVersion?: unknown }).schemaVersion === DICTIONARY_SCHEMA_VERSION
  const state = saved && typeof saved === 'object'
    ? migratePlatformDictionaries(saved, dictGroupSeeds as unknown as DictGroup[], dictItemSeeds as unknown as DictItem[])
    : createInitialPlatformDictionaries(dictGroupSeeds as unknown as DictGroup[], dictItemSeeds as unknown as DictItem[])
  if (currentSchema) return state
  return mergeLegacyProductCategories(state, Object.values(readPlatformEntities()?.categories ?? {}))
}

const dictionariesEventBus = new PlatformEventBus('agritainment-platform-changes')

export async function publishPlatformDictionaries(
  input: PlatformDictionaryState,
  expectedRevision: number,
  publishLock: DictionaryPublishLock = defaultDictionaryPublishLock()
): Promise<PlatformDictionaryState | null> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return null
  return publishLock.runExclusive(() => {
    const current = readPlatformDictionaries()
    if (current.revision !== expectedRevision || !canPublishPlatformDictionaries(current, input)) return null
    const next = migratePlatformDictionaries({ ...input, schemaVersion: DICTIONARY_SCHEMA_VERSION, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }, dictGroupSeeds as unknown as DictGroup[], dictItemSeeds as unknown as DictItem[])
    return (writePlatformJson(PLATFORM_DICTIONARIES_STORAGE_KEY, next) ? (dictionariesEventBus.publish('storage.changed', { key: PLATFORM_DICTIONARIES_STORAGE_KEY, source: 'write' }), next) : null)
  })
}

export function getDictOptions(type: DictType, options: { state?: PlatformDictionaryState; includeDisabled?: boolean } = {}): DictItem[] {
  return selectDictOptions(options.state ?? readPlatformDictionaries(), type, options.includeDisabled)
}

export function dictLabel(type: DictType, code: string, state: PlatformDictionaryState = readPlatformDictionaries()): string {
  return selectDictOptions(state, type, true).find((item) => item.code === code)?.label ?? builtInDictLabel(type, code) ?? code
}

let boundPlatformStorageListener = false
function handlePlatformStorage(event: StorageEvent): void {
  if (event.key) notifyPlatformChange(event.key, 'storage')
}
function ensurePlatformStorageListener(): void {
  if (boundPlatformStorageListener) return
  const scope = globalThis as { addEventListener?: (type: string, listener: EventListener) => void }
  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('storage', handlePlatformStorage as unknown as EventListener)
    boundPlatformStorageListener = true
  }
}
export function subscribePlatformChanges(listener: (event: PlatformChange) => void, keys: string[] = []): () => void {
  ensurePlatformStorageListener()
  const keySet = new Set(keys)
  const wrapped = (event: PlatformChange) => { if (keySet.size === 0 || keySet.has(event.key)) listener(event) }
  platformChangeListeners.add(wrapped)
  const doc = typeof document !== 'undefined' ? document : null
  const onVisibility = () => {
    if (doc && (doc as { visibilityState?: string }).visibilityState === 'visible' && lastPlatformChange) wrapped({ ...lastPlatformChange, source: 'visibility' })
  }
  if (doc) {
    const add = (doc as { addEventListener: (t: string, l: EventListener) => void }).addEventListener
    const remove = (doc as { removeEventListener: (t: string, l: EventListener) => void }).removeEventListener
    add('visibilitychange', onVisibility as unknown as EventListener)
    return () => { platformChangeListeners.delete(wrapped); remove('visibilitychange', onVisibility as unknown as EventListener) }
  }
  return () => platformChangeListeners.delete(wrapped)
}

export function createPlatformDictionaryCache(options: { read?: () => PlatformDictionaryState; subscribe?: typeof subscribePlatformChanges } = {}): PlatformDictionaryCache {
  const read = options.read ?? readPlatformDictionaries
  const subscribeToPlatform = options.subscribe ?? subscribePlatformChanges
  const listeners = new Set<(state: PlatformDictionaryState) => void>()
  let state = read()
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsubscribe = subscribeToPlatform(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; state = read(); listeners.forEach((l) => l(state)) }, 300)
  }, [PLATFORM_DICTIONARIES_STORAGE_KEY])
  return {
    getOptions: (type) => selectDictOptions(state, type, false),
    label: (type, code) => selectDictOptions(state, type, true).find((item) => item.code === code)?.label ?? builtInDictLabel(type, code) ?? code,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    dispose: () => { unsubscribe(); if (timer) clearTimeout(timer); listeners.clear() }
  }
}

// ===== 兼容层：平台共享 CRUD 引擎 =====
const RETIRED_ALLIANCE_STATE_STORAGE_KEY = 'agritainment-alliance-discovery'
const RETIRED_ALLIANCE_RECOVERY_HANDLER_KEY = 'alliance-withdrawal-v1'
const RETIRED_ALLIANCE_OPERATION_PREFIX = 'alliance-withdrawal-'

function isRetiredAllianceRecovery(value: { operationId?: string; handlerKey?: string; recoveryHandlerKey?: string }): boolean {
  return value.handlerKey === RETIRED_ALLIANCE_RECOVERY_HANDLER_KEY
    || value.recoveryHandlerKey === RETIRED_ALLIANCE_RECOVERY_HANDLER_KEY
    || value.operationId?.startsWith(RETIRED_ALLIANCE_OPERATION_PREFIX) === true
}

export function purgeRetiredAllianceData(): void {
  if (readPlatformJson<unknown>(RETIRED_ALLIANCE_STATE_STORAGE_KEY) !== null) clearPlatformJson(RETIRED_ALLIANCE_STATE_STORAGE_KEY)

  const journals = readPlatformJournal()
  const activeJournals = Object.fromEntries(Object.entries(journals).filter(([, journal]) => !isRetiredAllianceRecovery(journal)))
  if (Object.keys(activeJournals).length !== Object.keys(journals).length) writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, activeJournals)

  const recoveryQueue = readPlatformRecoveryQueue()
  const activeRecoveryQueue = recoveryQueue.filter((task) => !isRetiredAllianceRecovery(task))
  if (activeRecoveryQueue.length !== recoveryQueue.length) writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, activeRecoveryQueue)
}
export function readPlatformCommissionLedger(): Record<string, CommissionLedgerEntry> | null {
  const data = readPlatformJson<Record<string, CommissionLedgerEntry>>(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY)
  return data && typeof data === 'object' ? data : null
}
export function writePlatformCommissionLedgerEntry(entry: CommissionLedgerEntry): boolean {
  if (!entry?.id || !entry.beneficiaryId) return false
  const ledger = readPlatformCommissionLedger() ?? {}
  return writePlatformJson(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, { ...ledger, [entry.id]: entry })
}
export function writePlatformCommissionLedger(entries: Record<string, CommissionLedgerEntry>): boolean {
  return writePlatformJson(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, entries)
}
export type WithdrawalRequesterType = 'promoter' | 'user'
export type WithdrawalRequestStatus = 'pending' | 'approved' | 'rejected'
export interface WithdrawalRequest {
  id: string
  requesterType: WithdrawalRequesterType
  requesterId: string
  amount: number
  method: string
  status: WithdrawalRequestStatus
  requestKey: string
  createdAt: string
  reviewedAt?: string
  operator?: string
  reviewedNote?: string
  revision?: number
}
export const PLATFORM_WITHDRAWALS_STORAGE_KEY = 'agritainment-platform-withdrawals'
export function readPlatformWithdrawals(): Record<string, WithdrawalRequest> | null {
  const data = readPlatformJson<Record<string, WithdrawalRequest>>(PLATFORM_WITHDRAWALS_STORAGE_KEY)
  if (!data || typeof data !== 'object') return null
  const valid: Record<string, WithdrawalRequest> = {}
  Object.entries(data).forEach(([id, request]) => {
    if (!request || request.id !== id || typeof request.requesterId !== 'string' || !request.requesterId.trim() || !['promoter', 'user'].includes(request.requesterType) || !Number.isFinite(Number(request.amount)) || Number(request.amount) <= 0 || typeof request.method !== 'string' || !request.method.trim() || !['pending', 'approved', 'rejected'].includes(request.status) || typeof request.requestKey !== 'string' || !request.requestKey.trim() || !request.createdAt || !Number.isFinite(Date.parse(request.createdAt))) return
    valid[id] = { ...request, amount: round2(Number(request.amount)), createdAt: normalizeIso(request.createdAt), method: request.method.trim() }
  })
  return valid
}
export function writePlatformWithdrawal(request: WithdrawalRequest): boolean {
  if (!request?.id || typeof request.requesterId !== 'string' || !request.requesterId.trim() || !['promoter', 'user'].includes(request.requesterType) || !Number.isFinite(request.amount) || request.amount <= 0 || typeof request.method !== 'string' || !request.method.trim() || !['pending', 'approved', 'rejected'].includes(request.status) || typeof request.requestKey !== 'string' || !request.requestKey.trim() || !request.createdAt) return false
  const withdrawals = readPlatformWithdrawals() ?? {}
  return writePlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY, { ...withdrawals, [request.id]: request })
}
let platformWithdrawalTransitionLocked = false
export function transitionPlatformWithdrawal(id: string, status: WithdrawalRequestStatus, operator: string, note?: string): WithdrawalRequest | null {
  if (status !== 'approved' && status !== 'rejected') return null
  if (platformWithdrawalTransitionLocked) return null
  platformWithdrawalTransitionLocked = true
  try {
    const withdrawals = readPlatformWithdrawals() ?? {}
    const current = withdrawals[id]
    if (!current || current.status !== 'pending') return null
    const next: WithdrawalRequest = { ...current, status, reviewedAt: new Date().toISOString(), operator, reviewedNote: note?.trim() || undefined, revision: (current.revision || 0) + 1 }
    if (!writePlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY, { ...withdrawals, [id]: next })) return null
    // Verify the persisted snapshot. A concurrent reviewer may have replaced it between read and write.
    const persisted = readPlatformWithdrawals()?.[id]
    if (!persisted || persisted.status !== next.status || persisted.revision !== next.revision || persisted.reviewedAt !== next.reviewedAt || persisted.operator !== next.operator) return null
    if (!appendPlatformAuditLog({ module: 'withdrawals', action: `withdrawal.${status}`, actorId: operator, actorRole: 'admin', targetType: 'withdrawal', targetId: id, result: 'success', metadata: { note: next.reviewedNote } })) {
      if (!writePlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY, withdrawals)) enqueuePlatformRecovery({ operationId: createId('OP-WITHDRAWAL-AUDIT'), failedStep: 'audit-log', reason: 'withdrawal audit rollback failed' })
      return null
    }
    return persisted
  } finally {
    platformWithdrawalTransitionLocked = false
  }
}
export function readPlatformVoucherOrders(): Record<string, VoucherOrder> | null {
  const data = readPlatformJson<Record<string, VoucherOrder>>(PLATFORM_VOUCHERS_STORAGE_KEY)
  return data && typeof data === 'object' ? data : null
}
export function writePlatformVoucherOrder(order: VoucherOrder): boolean {
  if (!order?.id || !order.userId || !order.farmId) return false
  const orders = readPlatformVoucherOrders() ?? {}
  return writePlatformJson(PLATFORM_VOUCHERS_STORAGE_KEY, { ...orders, [order.id]: order })
}
export function writePlatformVoucherOrders(orders: Record<string, VoucherOrder>): boolean {
  return !!orders && writePlatformJson(PLATFORM_VOUCHERS_STORAGE_KEY, orders)
}
const USER_COMMERCE_PURCHASE_INTENT_FIELDS = ['ownerUserId', 'productId', 'skuId', 'quantity', 'amount', 'operationId'] as const
const USER_COMMERCE_PURCHASE_OPERATION_PATTERN = /^package-payment:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/
function validUserCommercePurchaseIntent(key: string, value: unknown): value is UserCommercePurchaseIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const intent = value as Record<string, unknown>
  const validId = (candidate: unknown) => typeof candidate === 'string' && !!candidate && candidate.trim() === candidate
  return Object.keys(intent).length === USER_COMMERCE_PURCHASE_INTENT_FIELDS.length
    && USER_COMMERCE_PURCHASE_INTENT_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(intent, field))
    && validId(intent.ownerUserId) && validId(intent.productId) && validId(intent.skuId)
    && Number.isInteger(intent.quantity) && Number(intent.quantity) > 0
    && typeof intent.amount === 'number' && Number.isFinite(intent.amount) && intent.amount > 0
    && typeof intent.operationId === 'string' && intent.operationId === key && USER_COMMERCE_PURCHASE_OPERATION_PATTERN.test(intent.operationId)
}
function validUserCommercePurchaseIntents(value: unknown): value is Record<string, UserCommercePurchaseIntent> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, intent]) => validUserCommercePurchaseIntent(key, intent))
}
export function readUserCommercePurchaseIntents(): Record<string, UserCommercePurchaseIntent> {
  const intents = readPlatformJson<unknown>(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return {}
  return Object.fromEntries(Object.entries(intents).filter(([key, intent]) => validUserCommercePurchaseIntent(key, intent)))
}
export function writeUserCommercePurchaseIntents(intents: Record<string, UserCommercePurchaseIntent>, expectedRevision?: number): boolean {
  return validUserCommercePurchaseIntents(intents) && writePlatformJson(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, intents, expectedRevision)
}
export function readPlatformSupplierSettlements(): Record<string, SupplierSettlementRecord> | null {
  const data = readPlatformJson<Record<string, SupplierSettlementRecord>>(PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY)
  return data && typeof data === 'object' ? data : null
}
export function writePlatformSupplierSettlements(records: Record<string, SupplierSettlementRecord>): boolean {
  return !!records && typeof records === 'object' && !Array.isArray(records) && writePlatformJson(PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, records)
}
export function writePlatformSupplierSettlement(record: SupplierSettlementRecord): boolean {
  if (!record?.id) return false
  const records = readPlatformSupplierSettlements() ?? {}
  const normalized = { ...record, status: record.status || 'pending' }
  return writePlatformJson(PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, { ...records, [record.id]: normalized })
}
export function readPlatformCommissionRules(): CommissionRule[] | null {
  const data = readPlatformJson<CommissionRule[]>(PLATFORM_COMMISSION_RULES_STORAGE_KEY)
  return Array.isArray(data) ? data : null
}
export function writePlatformCommissionRules(rules: CommissionRule[]): boolean {
  return Array.isArray(rules) && writePlatformJson(PLATFORM_COMMISSION_RULES_STORAGE_KEY, rules)
}
export function readPlatformCommissionSettlementRecords(): Record<string, CommissionSettlementRecord> | null {
  const data = readPlatformJson<Record<string, CommissionSettlementRecord>>(PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY)
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null
}
export function writePlatformCommissionSettlementRecords(records: Record<string, CommissionSettlementRecord>): boolean {
  return !!records && typeof records === 'object' && !Array.isArray(records) && writePlatformJson(PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, records)
}
// ===== 兼容层：供应商拆单引擎 =====
export function buildSupplierPlatformOrders(input: {
  sourceOrderId: string
  source: OrderSource
  customer: string
  storeId?: string
  storeName?: string
  channel: Order['channel']
  items: OrderItem[]
  products: Product[]
  createdAt: string
  status: OrderStatus
  customerUserId?: string
  deliveryAddress?: CAddress
}): Order[] {
  const supplierByName = new Map<string, Supplier>()
  suppliers.forEach((supplier) => supplierByName.set(supplier.name, supplier))
  const groups = new Map<string, { supplierId: string; supplierName: string; items: OrderItem[] }>()
  for (const item of input.items) {
    const product = input.products.find((p) => p.id === item.productId)
    const supplierName = product?.supplier || ''
    const supplier = supplierByName.get(supplierName)
    const key = supplier?.id || supplierName || 'unknown'
    if (!groups.has(key)) groups.set(key, { supplierId: supplier?.id || '', supplierName, items: [] })
    groups.get(key)!.items.push(item)
  }
  const groupList = Array.from(groups.values())
  const multiple = groupList.length > 1
  return groupList.map((group, index) => {
    const baseId = multiple ? `${input.sourceOrderId}-S${index + 1}` : input.sourceOrderId
    const quantity = group.items.reduce((sum, item) => sum + item.quantity, 0)
    const amount = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const first = group.items[0]
    return {
      id: baseId,
      productName: first?.name || input.customer,
      quantity,
      amount,
      customer: input.customer,
      channel: input.channel,
      status: input.status,
      createdAt: input.createdAt,
      storeId: input.storeId,
      storeName: input.storeName,
      supplierId: group.supplierId,
      items: group.items,
      supplierOrderLink: { source: input.source, sourceOrderId: input.sourceOrderId, sourceSubOrderId: baseId, customerUserId: input.customerUserId, deliveryAddress: input.deliveryAddress ? cloneSeed(input.deliveryAddress) : undefined }
    }
  })
}

// ===== 兼容层：业务员账号引擎 =====
export interface PromoterAccountState {
  schemaVersion: number
  revision: number
  accounts: PromoterAccount[]
  updatedAt: string
}
export function buildPromoterAccountSeeds(promotersSeed: Promoter[]): PromoterAccount[] {
  const used = new Set<string>()
  return promotersSeed.map((promoter) => {
    const numericId = /^T(\d+)$/.exec(promoter.id)?.[1]
    let offset = numericId ? Math.max(0, Number(numericId) - 1) * 20 : Array.from(promoter.id).reduce((sum, char) => sum + char.charCodeAt(0), 0)
    let account = '138' + String(offset).padStart(8, '0').slice(-8)
    while (used.has(account)) { offset += 1; account = '138' + String(offset).padStart(8, '0').slice(-8) }
    used.add(account)
    const id = numericId ? 'PA' + numericId.padStart(3, '0') : 'PA-' + promoter.id
    return ({
    id,
    promoterId: promoter.id,
    name: promoter.name,
    level: promoter.level,
    type: promoter.type || '',
    account,
    password: '123456',
    status: 'active' as const,
    enabled: true,
    createdAt: '2026-08-01T09:00:00.000Z'
  })
  })
}
export function readPlatformPromoterAccountState(): PromoterAccountState {
  const saved = readPlatformJson<PromoterAccountState>(PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY)
  if (saved && typeof saved === 'object') return saved
  return { schemaVersion: 1, revision: 0, accounts: [], updatedAt: '' }
}
export function readPlatformPromoterAccounts(): PromoterAccount[] {
  return readPlatformPromoterAccountState().accounts
}
export function writePlatformPromoterAccounts(accounts: PromoterAccount[], expectedRevision: number): boolean {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return false
  const accountsSet = new Set(accounts.map((a) => a.account))
  if (accountsSet.size !== accounts.length) return false
  const current = readPlatformPromoterAccountState()
  if (current.revision !== expectedRevision) return false
  const next: PromoterAccountState = { schemaVersion: 1, revision: expectedRevision + 1, accounts, updatedAt: new Date().toISOString() }
  return writePlatformJson(PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY, next)
}
export function authenticatePromoter(accounts: PromoterAccount[], promotersSeed: Promoter[], account: string, password: string): { ok: true; account: PromoterAccount; promoter: Promoter } | { ok: false; reason: string } {
  const found = accounts.find((a) => a.account === account)
  if (!found || found.password !== password) return { ok: false, reason: 'invalid-credentials' }
  if (!found.enabled) return { ok: false, reason: 'inactive' }
  const promoter = promotersSeed.find((p) => p.id === found.promoterId)
  if (!promoter || promoter.status !== 'active') return { ok: false, reason: 'inactive' }
  return { ok: true, account: found, promoter }
}
export function mergePlatformPromoterAccounts(defaults: PromoterAccount[], saved: PromoterAccount[]): PromoterAccount[] {
  const savedByKey = new Map(saved.map((a) => [a.promoterId, a]))
  return defaults.map((d) => savedByKey.get(d.promoterId) || d)
}

// ===== 兼容层：佣金冲正 / 迁移 / 券流转 =====
export function reverseCommissionLedgerEntry(id: string, sourceOrderId: string, beneficiaryId: string, amount: number, reversedAt: string): boolean {
  const ledger = readPlatformCommissionLedger() ?? {}
  const entry = ledger[id]
  if (!entry || entry.status === 'reversed') return false
  const reversed: CommissionLedgerEntry = { ...entry, id, status: 'reversed', reversalOf: entry.id, updatedAt: reversedAt }
  const next = { ...ledger, [id]: reversed }
  return writePlatformJson(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, next)
}
export function migrateLegacyCommissionsToLedger(): boolean {
  const migrated = readPlatformJson<unknown>(PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY)
  if (migrated !== null && migrated !== undefined) return false
  const legacy = readPlatformJson<Array<Record<string, unknown>>>(PLATFORM_C_COMMISSIONS_STORAGE_KEY)
  const ledger = readPlatformCommissionLedger() ?? {}
  if (Array.isArray(legacy)) {
    for (const record of legacy) {
      const id = String(record.id || '')
      if (!id) continue
      ledger[id] = {
        id,
        sourceOrderId: String(record.orderId || record.sourceOrderId || ''),
        beneficiaryType: (record.beneficiaryType as CommissionLedgerEntry['beneficiaryType']) || 'promoter',
        beneficiaryId: String(record.beneficiaryId || record.promoterId || 'T001'),
        role: String(record.role || 'promoter'),
        amount: Number(record.amount) || 0,
        status: (record.status as CommissionLedgerEntry['status']) || 'available',
        createdAt: String(record.createdAt || ''),
        updatedAt: String(record.createdAt || '')
      }
    }
  }
  writePlatformJson(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, ledger)
  writePlatformJson(PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY, new Date().toISOString())
  return true
}
export function transitionVoucherOrder(id: string, status: VoucherOrder['status'], at: string): boolean {
  const orders = readPlatformVoucherOrders() ?? {}
  const order = orders[id]
  if (!order || order.status === status) return false
  const allowed = (order.status === 'paid' && status === 'redeemed') || (order.status === 'redeemed' && status === 'refunded')
  if (!allowed) return false
  const next: VoucherOrder = { ...order, status }
  if (status === 'redeemed') next.redeemedAt = at
  if (status === 'refunded') next.refundedAt = at
  return writePlatformJson(PLATFORM_VOUCHERS_STORAGE_KEY, { ...orders, [id]: next })
}

// ===== 兼容层：供应商账号引擎 =====
export interface SupplierAccount {
  id: string
  supplierId: string
  supplierName: string
  account: string
  password: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
export function buildSupplierAccountSeeds(suppliersSeed: Supplier[], createdAt: string = '2026-08-24T09:00:00.000Z'): SupplierAccount[] {
  return suppliersSeed
    .filter((supplier) => supplier.certified && !!supplier.contactPhone)
    .map((supplier, index) => ({
      id: 'SA' + String(index + 1).padStart(3, '0'),
      supplierId: supplier.id,
      supplierName: supplier.name,
      account: supplier.contactPhone!,
      password: supplier.contactPhone!,
      enabled: true,
      createdAt,
      updatedAt: createdAt
    }))
}
export function supplierCanLogin(supplier?: Supplier, account?: SupplierAccount): boolean {
  return !!supplier?.certified && (supplier.status === 'cooperating' || supplier.status === 'paused') && !!account && account.enabled !== false
}
export function supplierCanReceiveNewOrders(supplier?: Supplier, account?: SupplierAccount): boolean {
  return !!supplier?.certified && supplier.status === 'cooperating' && !!account && account.enabled !== false
}
export function authenticateSupplier(accounts: SupplierAccount[], suppliersSeed: Supplier[], account: string, password: string): { ok: true; account: SupplierAccount; supplier: Supplier } | { ok: false; reason: string } {
  const found = accounts.find((a) => a.account === account)
  if (!found || found.password !== password) return { ok: false, reason: 'invalid-credentials' }
  const supplier = suppliersSeed.find((s) => s.id === found.supplierId)
  if (!supplierCanLogin(supplier, found)) return { ok: false, reason: 'inactive' }
  return { ok: true, account: found, supplier: supplier! }
}
export function mergePlatformSupplierAccounts(defaults: SupplierAccount[], saved: SupplierAccount[]): SupplierAccount[] {
  const savedByKey = new Map(saved.map((a) => [a.supplierId, a]))
  return defaults.map((d) => savedByKey.get(d.supplierId) || d)
}

// ===== 兼容层：字典种子 =====
export interface DictGroupSeed { id: string; type: string; name: string; scope: 'business' | 'system'; locked: boolean; enabled: boolean }
export interface DictItemSeed { id: string; type: string; code: string; label: string; enabled: boolean; sort: number; image?: MediaReference }
const dictGroupSeeds: DictGroupSeed[] = [
  { id: 'DG01', type: 'supplierStatus', name: '供应商状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG02', type: 'afterSaleReason', name: '售后原因', scope: 'business', locked: false, enabled: true },
  { id: 'DG03', type: 'productStatus', name: '商品状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG04', type: 'farmStatus', name: '门店状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG05', type: 'orderStatus', name: '订单状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG06', type: 'afterSaleStatus', name: '售后状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG07', type: 'promoterStatus', name: '业务员状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG10', type: 'unit', name: '商品单位', scope: 'business', locked: false, enabled: true },
  { id: 'DG11', type: 'logistics', name: '物流公司', scope: 'business', locked: false, enabled: true },
  { id: 'DG12', type: 'productCategory', name: '商品品类', scope: 'business', locked: false, enabled: true },
  { id: 'DG13', type: 'supplierCategory', name: '供应商品类', scope: 'business', locked: false, enabled: true },
  { id: 'DG14', type: 'generalCategory', name: '通用品类', scope: 'business', locked: false, enabled: true },
  { id: 'DG15', type: 'productTag', name: '商品标签', scope: 'business', locked: false, enabled: true },
  { id: 'DG16', type: 'farmTag', name: '门店标签', scope: 'business', locked: false, enabled: true },
  { id: 'DG19', type: 'qualificationType', name: '供应商资质', scope: 'business', locked: false, enabled: true },
  { id: 'DG20', type: 'promoterType', name: '业务员类型', scope: 'business', locked: false, enabled: true },
  { id: 'DG21', type: 'promoterLevel', name: '业务员等级', scope: 'business', locked: false, enabled: true },
  { id: 'DG25', type: 'withdrawMethod', name: '提现方式', scope: 'business', locked: false, enabled: true },
  { id: 'DG26', type: 'fulfillmentStatus', name: '履约状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG27', type: 'voucherStatus', name: '核销状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG28', type: 'settlementStatus', name: '结算状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG29', type: 'commissionStatus', name: '佣金状态', scope: 'system', locked: true, enabled: true },
  { id: 'DG30', type: 'productSource', name: '商品来源', scope: 'system', locked: true, enabled: true },
  { id: 'DG31', type: 'productType', name: '商品类型', scope: 'system', locked: true, enabled: true },
  { id: 'DG32', type: 'catalogChannel', name: '商品渠道', scope: 'system', locked: true, enabled: true },
  { id: 'DG33', type: 'deliveryMode', name: '配送方式', scope: 'system', locked: true, enabled: true },
  { id: 'DG34', type: 'afterSaleType', name: '售后类型', scope: 'system', locked: true, enabled: true },
  { id: 'DG35', type: 'refundMode', name: '退款模式', scope: 'system', locked: true, enabled: true },
  { id: 'DG36', type: 'pricePolicyType', name: '价格策略类型', scope: 'system', locked: true, enabled: true },
  { id: 'DG37', type: 'accountRole', name: '账号角色', scope: 'system', locked: true, enabled: true },
  { id: 'DG40', type: 'refundMethod', name: '退款方式', scope: 'system', locked: true, enabled: true },
  { id: 'DG39', type: 'commissionTargetType', name: '佣金目标类型', scope: 'system', locked: true, enabled: true }
];

const dictItemSeeds: DictItemSeed[] = [
  { id: 'DIR01', type: 'afterSaleReason', code: 'transport', label: '运输破损', enabled: true, sort: 1 },
  { id: 'DIR02', type: 'afterSaleReason', code: 'quality', label: '质量问题', enabled: true, sort: 2 },
  { id: 'DIR03', type: 'afterSaleReason', code: 'seven-day', label: '七天无理由', enabled: true, sort: 3 },
  { id: 'DIR04', type: 'afterSaleReason', code: 'shortage', label: '少发漏发', enabled: true, sort: 4 },
  { id: 'DIR05', type: 'afterSaleReason', code: 'taste', label: '口感风味不符', enabled: true, sort: 5 },
  { id: 'DIR06', type: 'afterSaleReason', code: 'cancel', label: '客户取消', enabled: true, sort: 6 },
  { id: 'DIR07', type: 'afterSaleReason', code: 'other', label: '其他', enabled: true, sort: 7 },
  { id: 'DISS01', type: 'supplierStatus', code: 'pending', label: '待处理', enabled: true, sort: 1 },
  { id: 'DISS02', type: 'supplierStatus', code: 'cooperating', label: '合作中', enabled: true, sort: 2 },
  { id: 'DISS03', type: 'supplierStatus', code: 'paused', label: '已暂停', enabled: true, sort: 3 },
  { id: 'DISS04', type: 'supplierStatus', code: 'rejected', label: '已驳回', enabled: true, sort: 4 },
  { id: 'DISP01', type: 'productStatus', code: 'pending', label: '待审核', enabled: true, sort: 1 },
  { id: 'DISP02', type: 'productStatus', code: 'active', label: '已上架', enabled: true, sort: 2 },
  { id: 'DISP03', type: 'productStatus', code: 'offline', label: '已下架', enabled: true, sort: 3 },
  { id: 'DISP04', type: 'productStatus', code: 'rejected', label: '已驳回', enabled: true, sort: 4 },
  { id: 'DIFS01', type: 'farmStatus', code: 'pending', label: '筹备中', enabled: true, sort: 1 },
  { id: 'DIFS02', type: 'farmStatus', code: 'active', label: '经营中', enabled: true, sort: 2 },
  { id: 'DIFS03', type: 'farmStatus', code: 'paused', label: '已停用', enabled: true, sort: 3 },
  { id: 'DIOS01', type: 'orderStatus', code: 'pending', label: '待支付', enabled: true, sort: 1 },
  { id: 'DIOS02', type: 'orderStatus', code: 'paid', label: '已支付', enabled: true, sort: 2 },
  { id: 'DIOS03', type: 'orderStatus', code: 'shipping', label: '配送中', enabled: true, sort: 3 },
  { id: 'DIOS04', type: 'orderStatus', code: 'delivered', label: '已完成', enabled: true, sort: 4 },
  { id: 'DIOS05', type: 'orderStatus', code: 'after-sale', label: '售后中', enabled: true, sort: 5 },
  { id: 'DIAS01', type: 'afterSaleStatus', code: 'processing', label: '售后中', enabled: true, sort: 1 },
  { id: 'DIAS02', type: 'afterSaleStatus', code: 'rejected', label: '售后拒绝', enabled: true, sort: 2 },
  { id: 'DIAS03', type: 'afterSaleStatus', code: 'refunded', label: '已退款', enabled: true, sort: 3 },
  { id: 'DIPR01', type: 'promoterStatus', code: 'active', label: '启用', enabled: true, sort: 1 },
  { id: 'DIPR02', type: 'promoterStatus', code: 'paused', label: '停用', enabled: true, sort: 2 },
  { id: 'DIPS01', type: 'productSource', code: 'platform', label: '平台商品', enabled: true, sort: 1 },
  { id: 'DIPS02', type: 'productSource', code: 'farmhouse', label: '门店商品', enabled: true, sort: 2 },
  { id: 'DIPT01', type: 'productType', code: 'goods', label: '实物商品', enabled: true, sort: 1 },
  { id: 'DIPT02', type: 'productType', code: 'package', label: '套餐券', enabled: true, sort: 2 },
  { id: 'DPC01', type: 'productCategory', code: 'C001', label: '农产品', enabled: true, sort: 1, image: defaultProductCategoryImage('农产品') },
  { id: 'DPC02', type: 'productCategory', code: 'C002', label: '特色食材', enabled: true, sort: 2, image: defaultProductCategoryImage('特色食材') },
  { id: 'DPC03', type: 'productCategory', code: 'C003', label: '预制菜', enabled: true, sort: 3, image: defaultProductCategoryImage('预制菜') },
  { id: 'DPC04', type: 'productCategory', code: 'C004', label: '食材调料', enabled: true, sort: 4, image: defaultProductCategoryImage('食材调料') },
  { id: 'DPC05', type: 'productCategory', code: 'C005', label: '土特产', enabled: true, sort: 5, image: defaultProductCategoryImage('土特产') },
  { id: 'DPC06', type: 'productCategory', code: 'C006', label: '伴手礼', enabled: true, sort: 6, image: defaultProductCategoryImage('伴手礼') },
  { id: 'DPC07', type: 'productCategory', code: 'C007', label: '文旅伴手礼', enabled: true, sort: 7, image: defaultProductCategoryImage('文旅伴手礼') },
  { id: 'DPC08', type: 'productCategory', code: 'C008', label: '民宿用品', enabled: true, sort: 8, image: defaultProductCategoryImage('民宿用品') },
  { id: 'DPC09', type: 'productCategory', code: 'C009', label: '包装耗材', enabled: true, sort: 9, image: defaultProductCategoryImage('包装耗材') },
  { id: 'DPC10', type: 'productCategory', code: 'C010', label: '套餐券', enabled: true, sort: 10, image: defaultProductCategoryImage('套餐券') },
  { id: 'DPC11', type: 'productCategory', code: 'C011', label: '生鲜农产', enabled: true, sort: 11, image: defaultProductCategoryImage('生鲜农产') },
  { id: 'DPC12', type: 'productCategory', code: 'C012', label: '时令水果', enabled: true, sort: 12, image: defaultProductCategoryImage('时令水果') },
  { id: 'DPC13', type: 'productCategory', code: 'C013', label: '有机蔬菜', enabled: true, sort: 13, image: defaultProductCategoryImage('有机蔬菜') },
  { id: 'DPC14', type: 'productCategory', code: 'C014', label: '粮油米面', enabled: true, sort: 14, image: defaultProductCategoryImage('粮油米面') },
  { id: 'DPC15', type: 'productCategory', code: 'C015', label: '酒水饮料', enabled: true, sort: 15, image: defaultProductCategoryImage('酒水饮料') },
  { id: 'DSC01', type: 'supplierCategory', code: 'C001', label: '生鲜农产', enabled: true, sort: 1 },
  { id: 'DSC02', type: 'supplierCategory', code: 'C002', label: '综合品类', enabled: true, sort: 2 },
  { id: 'DGC01', type: 'generalCategory', code: 'G001', label: '通用分类', enabled: true, sort: 1 },
  { id: 'DPT01', type: 'promoterType', code: 'promoter', label: '业务员', enabled: true, sort: 1 },
  { id: 'DPL01', type: 'promoterLevel', code: 'bronze', label: '青铜', enabled: true, sort: 1 },
  { id: 'DPL02', type: 'promoterLevel', code: 'silver', label: '白银', enabled: true, sort: 2 },
  { id: 'DPL03', type: 'promoterLevel', code: 'gold', label: '黄金', enabled: true, sort: 3 },
  { id: 'DWM01', type: 'withdrawMethod', code: 'wechat', label: '微信提现', enabled: true, sort: 1 },
  { id: 'DWM02', type: 'withdrawMethod', code: 'bank', label: '银行卡', enabled: true, sort: 2 },
  { id: 'DQT01', type: 'qualificationType', code: 'business-license', label: '营业执照', enabled: true, sort: 1 },
  { id: 'DQT02', type: 'qualificationType', code: 'food-license', label: '食品经营许可证', enabled: true, sort: 2 },
  { id: 'DUNIT01', type: 'unit', code: 'box', label: '盒', enabled: true, sort: 1 },
  { id: 'DLEX01', type: 'logistics', code: 'sf', label: '顺丰速运', enabled: true, sort: 1 }
];

// ===== 兼容层：供应商账号读写 =====
export interface PlatformSupplierAccount {
  id: string
  supplierId: string
  supplierName: string
  account: string
  password: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
export function readPlatformSupplierAccounts(): PlatformSupplierAccount[] {
  const data = readPlatformJson<PlatformSupplierAccount[]>(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY)
  return Array.isArray(data) ? data : []
}
export function writePlatformSupplierAccounts(accounts: PlatformSupplierAccount[]): boolean {
  return writePlatformJson(PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, accounts)
}

// ===== 兼容层：体验项目引擎（farmhouse 维护发布） =====
export interface FarmExperience {
  id: string
  farmId: string
  name: string
  categoryCode: string
  description: string
  price: number
  status: 'active' | 'inactive'
  image: BusinessMediaValue
  sort: number
  updatedAt: string
}
export function readPlatformExperiences(): Record<string, FarmExperience | null> | null {
  const data = readPlatformJson<Record<string, FarmExperience | null>>(PLATFORM_EXPERIENCES_STORAGE_KEY)
  return data && typeof data === 'object' ? data : null
}
export function writePlatformExperience(experience: FarmExperience): boolean {
  if (!experience?.id) return false
  const experiences = readPlatformExperiences() ?? {}
  return writePlatformJson(PLATFORM_EXPERIENCES_STORAGE_KEY, { ...experiences, [experience.id]: experience })
}
export function removePlatformExperience(id: string): boolean {
  const experiences = readPlatformExperiences() ?? {}
  experiences[id] = null
  return writePlatformJson(PLATFORM_EXPERIENCES_STORAGE_KEY, experiences)
}
export function mergePlatformExperiences(experiences: FarmExperience[]): FarmExperience[] {
  const merged = new Map<string, FarmExperience>()
  experiences.forEach((e) => { if (e) merged.set(e.id, e) })
  const shared = readPlatformExperiences()
  if (shared) Object.entries(shared).forEach(([id, e]) => { if (e) merged.set(id, e); else merged.delete(id) })
  return Array.from(merged.values())
}



// ===== 兼容层：catalog 迁移标记 =====
export interface CatalogLegacyMigrationMarker { schemaVersion: number; catalogSchemaVersion: number; migratedAt: string }
export function readCatalogLegacyMigrationMarker(): CatalogLegacyMigrationMarker | null {
  const saved = readPlatformJson<CatalogLegacyMigrationMarker>(PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY)
  if (!saved || typeof saved !== 'object') return null
  if (saved.schemaVersion !== 1 || saved.catalogSchemaVersion !== CATALOG_SCHEMA_VERSION) return null
  return saved
}

export type UserAtomicRecoveryVariant = 'checkout' | 'payment' | 'package'
export interface UserAtomicRecoverySnapshot {
  variant: UserAtomicRecoveryVariant
  ownerUserId: string
  catalog?: CatalogState
  orders?: Record<string, COrder>
  commissions?: CCommissionAllocation[]
  bindings?: Record<string, UserBinding>
  supplierOrders?: Record<string, Order>
  ledger?: Record<string, CommissionLedgerEntry>
  vouchers?: Record<string, VoucherOrder>
  intents?: Record<string, UserCommercePurchaseIntent>
}

const USER_ATOMIC_RECOVERY_CONFIG: Record<UserAtomicRecoveryVariant, { key: PlatformRecoveryHandlerKey; schema: string; collections: string[]; fields: string[] }> = {
  checkout: {
    key: 'user-commerce-recovery-v1', schema: 'user-checkout-snapshot-v1',
    collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY],
    fields: ['variant', 'ownerUserId', 'catalog', 'orders', 'commissions', 'bindings']
  },
  payment: {
    key: 'user-payment-v1', schema: 'user-payment-snapshot-v1',
    collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY],
    fields: ['variant', 'ownerUserId', 'orders', 'supplierOrders', 'ledger']
  },
  package: {
    key: 'user-package-v1', schema: 'user-package-snapshot-v1',
    collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY],
    fields: ['variant', 'ownerUserId', 'catalog', 'vouchers', 'ledger', 'intents']
  }
}

function userAtomicRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function userAtomicSame(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function userAtomicExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean { return userAtomicSame(Object.keys(value).sort(), [...expected].sort()) }
function userAtomicChangedKeys<T>(original: Record<string, T>, target: Record<string, T>): string[] {
  return [...new Set([...Object.keys(original), ...Object.keys(target)])].filter((key) => !userAtomicSame(original[key], target[key]))
}
function userAtomicUniqueIds(values: Array<{ id: string }>): boolean {
  return values.every((value) => typeof value?.id === 'string' && !!value.id.trim()) && new Set(values.map((value) => value.id)).size === values.length
}
function userAtomicValidSnapshot(value: unknown, variant: UserAtomicRecoveryVariant): value is UserAtomicRecoverySnapshot {
  if (!userAtomicRecord(value) || value.variant !== variant || typeof value.ownerUserId !== 'string' || !value.ownerUserId.trim()) return false
  if (!userAtomicExactKeys(value, USER_ATOMIC_RECOVERY_CONFIG[variant].fields)) return false
  if (variant === 'checkout') return userAtomicRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision)
    && userAtomicRecord(value.orders) && Array.isArray(value.commissions) && userAtomicRecord(value.bindings)
  if (variant === 'payment') return userAtomicRecord(value.orders) && userAtomicRecord(value.supplierOrders) && userAtomicRecord(value.ledger)
  return userAtomicRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision)
    && userAtomicRecord(value.vouchers) && userAtomicRecord(value.ledger) && userAtomicRecord(value.intents)
}

function userAtomicCatalogReserveMatches(original: CatalogState, target: CatalogState, operationId: string, expectedChanges: Map<string, number>): boolean {
  if (original.schemaVersion !== target.schemaVersion || target.revision !== original.revision + 1 || original.products.length !== target.products.length) return false
  if (!userAtomicUniqueIds(original.products) || !userAtomicUniqueIds(target.products)) return false
  const targetProducts = new Map(target.products.map((product) => [product.id, product]))
  for (const product of original.products) {
    const next = targetProducts.get(product.id)
    if (!next || !userAtomicUniqueIds(product.skus) || !userAtomicUniqueIds(next.skus) || product.skus.length !== next.skus.length) return false
    const { skus: _beforeSkus, ...beforeProduct } = product
    const { skus: _afterSkus, ...afterProduct } = next
    if (!userAtomicSame(beforeProduct, afterProduct)) return false
    const nextSkus = new Map(next.skus.map((sku) => [sku.id, sku]))
    for (const sku of product.skus) {
      const nextSku = nextSkus.get(sku.id)
      if (!nextSku) return false
      const { stock: beforeStock, ...beforeSku } = sku
      const { stock: afterStock, ...afterSku } = nextSku
      if (!userAtomicSame(beforeSku, afterSku) || afterStock - beforeStock !== (expectedChanges.get(`${product.id}:${sku.id}`) || 0) || afterStock < 0) return false
    }
  }
  const originalOperations = original.appliedOperations || {}
  const targetOperations = target.appliedOperations || {}
  if (originalOperations[operationId] || userAtomicChangedKeys(originalOperations, targetOperations).length !== 1 || !targetOperations[operationId]) return false
  const operation = targetOperations[operationId]
  if (operation.id !== operationId || operation.action !== 'reserve') return false
  try {
    const fingerprint = JSON.parse(operation.requestFingerprint) as { action?: string; changes?: CatalogStockChange[] }
    const actual = new Map<string, number>()
    for (const change of fingerprint.changes || []) {
      if (!Number.isInteger(change.quantity) || !change.productId || !change.skuId) return false
      actual.set(`${change.productId}:${change.skuId}`, (actual.get(`${change.productId}:${change.skuId}`) || 0) + change.quantity)
    }
    return fingerprint.action === 'reserve' && userAtomicSame([...actual.entries()].sort(), [...expectedChanges.entries()].sort())
  } catch { return false }
}

function userAtomicOrderAmountIsValid(order: COrder): boolean {
  if (!order.id?.trim() || !order.userId?.trim() || order.address?.userId !== order.userId || order.status !== 'pending_payment' || order.providerTransactionId || order.paidAt) return false
  if (!userAtomicUniqueIds(order.subOrders) || !userAtomicUniqueIds(order.commissionAllocations)) return false
  if (order.items.some((item) => !item.productId || !item.skuId || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) return false
  if (round2(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)) !== round2(order.amount)) return false
  const nestedItems = order.subOrders.flatMap((subOrder) => subOrder.items)
  if (order.subOrders.some((subOrder) => subOrder.status !== 'pending_payment' || round2(subOrder.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)) !== round2(subOrder.amount))) return false
  const itemKey = (item: COrderItem) => JSON.stringify(item)
  if (!userAtomicSame(nestedItems.map(itemKey).sort(), order.items.map(itemKey).sort())) return false
  return order.commissionAllocations.every((allocation) => allocation.orderId === order.id && order.subOrders.some((subOrder) => subOrder.id === allocation.subOrderId)
    && !!allocation.beneficiaryId?.trim() && Number.isFinite(allocation.amount) && allocation.amount >= 0)
}

function userAtomicCheckoutJournalIsValid(journal: PlatformJournalEntry, original: UserAtomicRecoverySnapshot, target: UserAtomicRecoverySnapshot): boolean {
  const orderId = /^(.+):reserve$/.exec(journal.operationId)?.[1]
  if (!orderId || !original.catalog || !target.catalog || !original.orders || !target.orders || !original.commissions || !target.commissions || !original.bindings || !target.bindings) return false
  if (userAtomicChangedKeys(original.orders, target.orders).length !== 1 || original.orders[orderId] || !target.orders[orderId]) return false
  const order = target.orders[orderId]
  if (order.id !== orderId || order.userId !== original.ownerUserId || !userAtomicOrderAmountIsValid(order)) return false
  if (!userAtomicUniqueIds(original.commissions) || !userAtomicUniqueIds(target.commissions)) return false
  const originalCommissions = new Map(original.commissions.map((entry) => [entry.id, entry]))
  const targetCommissions = new Map(target.commissions.map((entry) => [entry.id, entry]))
  if (original.commissions.some((entry) => !userAtomicSame(targetCommissions.get(entry.id), entry))) return false
  if (order.commissionAllocations.some((entry) => originalCommissions.has(entry.id) || !userAtomicSame(targetCommissions.get(entry.id), entry))) return false
  if (target.commissions.some((entry) => !originalCommissions.has(entry.id) && !order.commissionAllocations.some((allocation) => allocation.id === entry.id))) return false
  const bindingChanges = userAtomicChangedKeys(original.bindings, target.bindings)
  if (bindingChanges.some((key) => key !== original.ownerUserId)) return false
  if (bindingChanges.length) {
    const binding = target.bindings[original.ownerUserId]
    if (!binding || binding.userId !== original.ownerUserId || binding.status !== 'bound' || !binding.promoterId?.trim()) return false
  }
  const inventory = new Map<string, number>()
  for (const item of order.items) inventory.set(`${item.productId}:${item.skuId}`, (inventory.get(`${item.productId}:${item.skuId}`) || 0) - item.quantity)
  return userAtomicCatalogReserveMatches(original.catalog, target.catalog, journal.operationId, inventory)
}

function userAtomicPaymentOrderMatches(original: COrder, target: COrder): boolean {
  if (original.status !== 'pending_payment' || !target.providerTransactionId?.trim() || !target.paidAt?.trim() || original.subOrders.length !== target.subOrders.length) return false
  const { status: _beforeStatus, paidAt: _beforePaidAt, providerTransactionId: _beforeTransactionId, subOrders: _beforeSubOrders, ...beforeStable } = original
  const { status: _afterStatus, paidAt: _afterPaidAt, providerTransactionId: _afterTransactionId, subOrders: _afterSubOrders, ...afterStable } = target
  if (!userAtomicSame(beforeStable, afterStable) || target.status !== deriveCOrderStatus(target.subOrders)) return false
  return original.subOrders.every((subOrder) => {
    const next = target.subOrders.find((candidate) => candidate.id === subOrder.id)
    if (!next || subOrder.status !== 'pending_payment' || next.status !== 'paid' || next.logistics.length !== subOrder.logistics.length + 2) return false
    const { status: _beforeSubStatus, logistics: _beforeLogistics, ...beforeSubStable } = subOrder
    const { status: _afterSubStatus, logistics: _afterLogistics, ...afterSubStable } = next
    return userAtomicSame(beforeSubStable, afterSubStable) && userAtomicSame(next.logistics.slice(0, subOrder.logistics.length), subOrder.logistics)
  })
}

function userAtomicPaymentJournalIsValid(journal: PlatformJournalEntry, original: UserAtomicRecoverySnapshot, target: UserAtomicRecoverySnapshot): boolean {
  const orderId = /^payment:(.+)$/.exec(journal.operationId)?.[1]
  if (!orderId || !original.orders || !target.orders || !original.supplierOrders || !target.supplierOrders || !original.ledger || !target.ledger) return false
  if (userAtomicChangedKeys(original.orders, target.orders).length !== 1 || !original.orders[orderId] || !target.orders[orderId]) return false
  const beforeOrder = original.orders[orderId]
  const afterOrder = target.orders[orderId]
  if (beforeOrder.userId !== original.ownerUserId || !userAtomicPaymentOrderMatches(beforeOrder, afterOrder)) return false
  const supplierChanges = userAtomicChangedKeys(original.supplierOrders, target.supplierOrders)
  if (supplierChanges.length !== afterOrder.subOrders.length) return false
  if (supplierChanges.some((id) => {
    if (original.supplierOrders![id]) return true
    const supplierOrder = target.supplierOrders![id]
    const link = supplierOrder?.supplierOrderLink
    return !supplierOrder || link?.source !== 'c-mall' || link.sourceOrderId !== orderId || link.customerUserId !== original.ownerUserId
      || !afterOrder.subOrders.some((subOrder) => subOrder.id === link.sourceSubOrderId && supplierOrder.amount === subOrder.amount && supplierOrder.supplierId === subOrder.supplierId)
  })) return false
  const ledgerChanges = userAtomicChangedKeys(original.ledger, target.ledger)
  if (ledgerChanges.length !== afterOrder.commissionAllocations.length) return false
  return ledgerChanges.every((id) => {
    if (original.ledger![id]) return false
    const entry = target.ledger![id]
    const allocation = afterOrder.commissionAllocations.find((candidate) => `CC-${candidate.id}` === id)
    return !!entry && !!allocation && entry.sourceOrderId === orderId && entry.sourceSubOrderId === allocation.subOrderId
      && entry.beneficiaryType === 'promoter' && entry.beneficiaryId === allocation.beneficiaryId
      && entry.role === (allocation.beneficiaryLevel || 'promoter') && round2(entry.amount) === round2(allocation.amount) && entry.status === 'pending'
  })
}

function userAtomicPackageJournalIsValid(journal: PlatformJournalEntry, original: UserAtomicRecoverySnapshot, target: UserAtomicRecoverySnapshot): boolean {
  const voucherId = USER_COMMERCE_PURCHASE_OPERATION_PATTERN.exec(journal.operationId)?.[1]
  if (!voucherId || !original.catalog || !target.catalog || !original.vouchers || !target.vouchers || !original.ledger || !target.ledger || !original.intents || !target.intents) return false
  if (!validUserCommercePurchaseIntents(original.intents) || !validUserCommercePurchaseIntents(target.intents)) return false
  if (userAtomicChangedKeys(original.vouchers, target.vouchers).length !== 1 || original.vouchers[voucherId] || !target.vouchers[voucherId]) return false
  const voucher = target.vouchers[voucherId]
  if (voucher.id !== voucherId || voucher.userId !== original.ownerUserId || voucher.status !== 'paid' || !voucher.providerTransactionId?.trim()
    || !Number.isInteger(voucher.quantity) || voucher.quantity <= 0 || !Number.isFinite(voucher.amount) || voucher.amount <= 0) return false
  const intent = original.intents[journal.operationId]
  const intentChanges = userAtomicChangedKeys(original.intents, target.intents)
  if (!intent || target.intents[journal.operationId] || intentChanges.length !== 1 || intentChanges[0] !== journal.operationId
    || intent.operationId !== journal.operationId || intent.ownerUserId !== original.ownerUserId || intent.productId !== voucher.productId
    || intent.skuId !== voucher.skuId || intent.quantity !== voucher.quantity || round2(intent.amount) !== round2(voucher.amount)) return false
  const product = original.catalog.products.find((candidate) => candidate.id === voucher.productId)
  const sku = product?.skus.find((candidate) => candidate.id === voucher.skuId)
  if (!product || !sku || !product.farmIds.includes(voucher.farmId)) return false
  const inventory = new Map([[`${voucher.productId}:${voucher.skuId}`, -voucher.quantity]])
  if (!userAtomicCatalogReserveMatches(original.catalog, target.catalog, journal.operationId, inventory)) return false
  const ledgerChanges = userAtomicChangedKeys(original.ledger, target.ledger)
  const expectedCommission = voucher.promoterId && product.promoterCommissionRate > 0 ? round2(voucher.amount * product.promoterCommissionRate / 100) : 0
  if (!expectedCommission) return ledgerChanges.length === 0
  if (ledgerChanges.length !== 1 || ledgerChanges[0] !== `${voucher.id}:commission` || original.ledger[ledgerChanges[0]]) return false
  const entry = target.ledger[ledgerChanges[0]]
  return !!entry && entry.sourceOrderId === voucher.id && entry.beneficiaryType === 'promoter' && entry.beneficiaryId === voucher.promoterId
    && entry.farmId === voucher.farmId && entry.role === 'promoter' && round2(entry.amount) === expectedCommission && entry.status === 'pending'
}

export function isValidUserAtomicRecoveryJournal(journal: PlatformJournalEntry, variant?: UserAtomicRecoveryVariant): boolean {
  const detected = variant || (journal.original as { variant?: UserAtomicRecoveryVariant } | null)?.variant
  if (!detected || !USER_ATOMIC_RECOVERY_CONFIG[detected]) return false
  const config = USER_ATOMIC_RECOVERY_CONFIG[detected]
  if (journal.recoveryHandlerKey !== config.key || journal.recoverySchema !== config.schema) return false
  const expectedCollections = normalizePlatformTransactionCollections([...config.collections, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY])
  if (!userAtomicSame([...journal.collections].sort(), expectedCollections)) return false
  if (!userAtomicValidSnapshot(journal.original, detected) || !userAtomicValidSnapshot(journal.target, detected)) return false
  const original = journal.original
  const target = journal.target
  if (original.ownerUserId !== target.ownerUserId) return false
  if (detected === 'checkout') return userAtomicCheckoutJournalIsValid(journal, original, target)
  if (detected === 'payment') return userAtomicPaymentJournalIsValid(journal, original, target)
  return userAtomicPackageJournalIsValid(journal, original, target)
}

function readStableUserAtomicRecoverySnapshot(variant: UserAtomicRecoveryVariant, ownerUserId: string): { snapshot: UserAtomicRecoverySnapshot; revisions: Record<string, number> } | null {
  const config = USER_ATOMIC_RECOVERY_CONFIG[variant]
  const readers: Record<string, () => unknown> = {
    [PLATFORM_CATALOG_STORAGE_KEY]: () => readCatalogState(),
    [PLATFORM_C_ORDERS_STORAGE_KEY]: () => readCOrders() || {},
    [PLATFORM_C_COMMISSIONS_STORAGE_KEY]: () => readCCommissionRecords() || [],
    [PLATFORM_BINDINGS_STORAGE_KEY]: () => readUserBindings() || {},
    [PLATFORM_ORDERS_STORAGE_KEY]: () => readPlatformOrders() || {},
    [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY]: () => readPlatformCommissionLedger() || {},
    [PLATFORM_VOUCHERS_STORAGE_KEY]: () => readPlatformVoucherOrders() || {}
    , [PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY]: () => readUserCommercePurchaseIntents()
  }
  const values: Record<string, unknown> = {}
  const revisions: Record<string, number> = {}
  for (const key of config.collections) {
    const before = readPlatformCollectionRevision(key)
    const value = cloneSeed(readers[key]())
    const after = readPlatformCollectionRevision(key)
    if (before !== after || (key === PLATFORM_CATALOG_STORAGE_KEY && !value)) return null
    values[key] = value
    revisions[key] = after
  }
  const snapshot: UserAtomicRecoverySnapshot = { variant, ownerUserId }
  if (variant === 'checkout') Object.assign(snapshot, { catalog: values[PLATFORM_CATALOG_STORAGE_KEY], orders: values[PLATFORM_C_ORDERS_STORAGE_KEY], commissions: values[PLATFORM_C_COMMISSIONS_STORAGE_KEY], bindings: values[PLATFORM_BINDINGS_STORAGE_KEY] })
  else if (variant === 'payment') Object.assign(snapshot, { orders: values[PLATFORM_C_ORDERS_STORAGE_KEY], supplierOrders: values[PLATFORM_ORDERS_STORAGE_KEY], ledger: values[PLATFORM_COMMISSION_LEDGER_STORAGE_KEY] })
  else Object.assign(snapshot, { catalog: values[PLATFORM_CATALOG_STORAGE_KEY], vouchers: values[PLATFORM_VOUCHERS_STORAGE_KEY], ledger: values[PLATFORM_COMMISSION_LEDGER_STORAGE_KEY], intents: values[PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY] })
  return { snapshot, revisions }
}

function writeUserAtomicRecoverySnapshot(snapshot: UserAtomicRecoverySnapshot, rollback: UserAtomicRecoverySnapshot): boolean {
  const steps: Array<{ apply: () => boolean; rollback: () => boolean }> = []
  if (snapshot.catalog && rollback.catalog) steps.push({ apply: () => writeCatalogState(snapshot.catalog!), rollback: () => writeCatalogState(rollback.catalog!) })
  if (snapshot.orders && rollback.orders) steps.push({ apply: () => writeCOrders(snapshot.orders!), rollback: () => writeCOrders(rollback.orders!) })
  if (snapshot.commissions && rollback.commissions) steps.push({ apply: () => writeCCommissionRecords(snapshot.commissions!), rollback: () => writeCCommissionRecords(rollback.commissions!) })
  if (snapshot.bindings && rollback.bindings) steps.push({ apply: () => writeUserBindings(snapshot.bindings!), rollback: () => writeUserBindings(rollback.bindings!) })
  if (snapshot.supplierOrders && rollback.supplierOrders) steps.push({ apply: () => writePlatformOrders(snapshot.supplierOrders!), rollback: () => writePlatformOrders(rollback.supplierOrders!) })
  if (snapshot.ledger && rollback.ledger) steps.push({ apply: () => writePlatformCommissionLedger(snapshot.ledger!), rollback: () => writePlatformCommissionLedger(rollback.ledger!) })
  if (snapshot.vouchers && rollback.vouchers) steps.push({ apply: () => writePlatformVoucherOrders(snapshot.vouchers!), rollback: () => writePlatformVoucherOrders(rollback.vouchers!) })
  if (snapshot.intents && rollback.intents) steps.push({ apply: () => writeUserCommercePurchaseIntents(snapshot.intents!), rollback: () => writeUserCommercePurchaseIntents(rollback.intents!) })
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) { applied.push(step); continue }
    for (const completed of [...applied].reverse()) completed.rollback()
    return false
  }
  return true
}

function executeUserAtomicRecovery(journal: PlatformJournalEntry, variant: UserAtomicRecoveryVariant): boolean {
  if (!isValidUserAtomicRecoveryJournal(journal, variant)) return false
  const original = journal.original as UserAtomicRecoverySnapshot
  const target = journal.target as UserAtomicRecoverySnapshot
  const current = readStableUserAtomicRecoverySnapshot(variant, original.ownerUserId)
  if (!current) return false
  const fields = USER_ATOMIC_RECOVERY_CONFIG[variant].fields.filter((field) => field !== 'variant' && field !== 'ownerUserId') as Array<keyof UserAtomicRecoverySnapshot>
  if (fields.some((field) => !userAtomicSame(current.snapshot[field], original[field]) && !userAtomicSame(current.snapshot[field], target[field]))) return false
  if (userAtomicSame(current.snapshot, original) || userAtomicSame(current.snapshot, target)) return true
  if (USER_ATOMIC_RECOVERY_CONFIG[variant].collections.some((key) => readPlatformCollectionRevision(key) !== current.revisions[key])) return false
  return writeUserAtomicRecoverySnapshot(original, current.snapshot)
}

type PaymentConfirmationRecoveryStatus = 'confirmed' | 'synchronized'
interface PaymentConfirmationRecoverySnapshot {
  variant: 'payment-confirmation'
  attemptOperationId: string
  orderId: string
  userId: string
  amount: number
  providerTransactionId: string
  confirmedAt: string
  status: PaymentConfirmationRecoveryStatus
}

const USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY = 'user-payment-confirmation-v1'
const USER_PAYMENT_CONFIRMATION_RECOVERY_SCHEMA = 'user-payment-confirmation-v1'
const PAYMENT_CONFIRMATION_RECOVERY_COLLECTIONS = [
  PLATFORM_C_ORDERS_STORAGE_KEY,
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_COMMISSION_LEDGER_STORAGE_KEY,
  PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY
]

function paymentConfirmationRecoveryOperationId(attemptOperationId: string): string {
  return `payment-confirmation:${attemptOperationId}`
}

function paymentConfirmationSnapshot(value: unknown, status?: PaymentConfirmationRecoveryStatus): value is PaymentConfirmationRecoverySnapshot {
  if (!userAtomicRecord(value) || !userAtomicExactKeys(value, ['variant', 'attemptOperationId', 'orderId', 'userId', 'amount', 'providerTransactionId', 'confirmedAt', 'status'])) return false
  return value.variant === 'payment-confirmation'
    && typeof value.attemptOperationId === 'string' && !!value.attemptOperationId.trim()
    && typeof value.orderId === 'string' && !!value.orderId.trim()
    && typeof value.userId === 'string' && !!value.userId.trim()
    && typeof value.amount === 'number' && Number.isFinite(value.amount) && value.amount > 0
    && typeof value.providerTransactionId === 'string' && !!value.providerTransactionId.trim()
    && typeof value.confirmedAt === 'string' && Number.isFinite(Date.parse(value.confirmedAt))
    && (value.status === 'confirmed' || value.status === 'synchronized')
    && (!status || value.status === status)
}

function validPaymentConfirmationRecoveryJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY || journal.recoverySchema !== USER_PAYMENT_CONFIRMATION_RECOVERY_SCHEMA) return false
  if (!paymentConfirmationSnapshot(journal.original, 'confirmed') || !paymentConfirmationSnapshot(journal.target, 'synchronized')) return false
  const original = journal.original
  const target = journal.target
  const expectedCollections = normalizePlatformTransactionCollections([...PAYMENT_CONFIRMATION_RECOVERY_COLLECTIONS, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY])
  const { status: _originalStatus, ...originalIdentity } = original
  const { status: _targetStatus, ...targetIdentity } = target
  return journal.operationId === paymentConfirmationRecoveryOperationId(original.attemptOperationId)
    && userAtomicSame(originalIdentity, targetIdentity)
    && userAtomicSame([...journal.collections].sort(), expectedCollections)
}

function paymentConfirmationSupplierOrderMatches(order: Order | undefined, descriptor: PaymentConfirmationRecoverySnapshot, subOrder: CSubOrder): boolean {
  const link = order?.supplierOrderLink
  return !!order && link?.source === 'c-mall' && link.sourceOrderId === descriptor.orderId && link.sourceSubOrderId === subOrder.id
    && link.customerUserId === descriptor.userId && order.supplierId === subOrder.supplierId && round2(order.amount) === round2(subOrder.amount)
}

function paymentConfirmationLedgerEntryMatches(entry: CommissionLedgerEntry | undefined, descriptor: PaymentConfirmationRecoverySnapshot, allocation: CCommissionAllocation): boolean {
  return !!entry && entry.sourceOrderId === descriptor.orderId && entry.sourceSubOrderId === allocation.subOrderId
    && entry.beneficiaryType === 'promoter' && entry.beneficiaryId === allocation.beneficiaryId
    && entry.role === (allocation.beneficiaryLevel || 'promoter') && round2(entry.amount) === round2(allocation.amount)
}

function paymentConfirmationBusinessIsSynchronized(descriptor: PaymentConfirmationRecoverySnapshot): boolean {
  const attempt = readPaymentAttempts()[descriptor.attemptOperationId]
  const order = (readCOrders() || {})[descriptor.orderId]
  if (!attempt || attempt.status !== 'synchronized' || attempt.providerTransactionId !== descriptor.providerTransactionId
    || attempt.userId !== descriptor.userId || round2(attempt.amount) !== round2(descriptor.amount)
    || !order || order.userId !== descriptor.userId || round2(order.amount) !== round2(descriptor.amount)
    || order.providerTransactionId !== descriptor.providerTransactionId || order.status === 'pending_payment'
    || order.subOrders.some((subOrder) => subOrder.status === 'pending_payment')) return false
  const supplierOrders = readPlatformOrders() || {}
  const ledger = readPlatformCommissionLedger() || {}
  return order.subOrders.every((subOrder) => paymentConfirmationSupplierOrderMatches(supplierOrders[`C-MALL-${subOrder.id}`], descriptor, subOrder))
    && order.commissionAllocations.every((allocation) => paymentConfirmationLedgerEntryMatches(ledger[`CC-${allocation.id}`], descriptor, allocation))
}

function executePaymentConfirmationRecovery(journal: PlatformJournalEntry): boolean {
  if (!validPaymentConfirmationRecoveryJournal(journal)) return false
  const descriptor = journal.original as PaymentConfirmationRecoverySnapshot
  if (paymentConfirmationBusinessIsSynchronized(descriptor)) return true
  const attempts = readPaymentAttempts()
  const attempt = attempts[descriptor.attemptOperationId]
  const orders = readCOrders() || {}
  const order = orders[descriptor.orderId]
  if (!attempt || attempt.status !== 'confirmed' || attempt.providerTransactionId !== descriptor.providerTransactionId
    || attempt.orderId !== descriptor.orderId || attempt.userId !== descriptor.userId || round2(attempt.amount) !== round2(descriptor.amount)
    || attempt.updatedAt !== descriptor.confirmedAt
    || !order || order.userId !== descriptor.userId || round2(order.amount) !== round2(descriptor.amount)) return false

  const paidOrder = cloneSeed(order)
  if (paidOrder.status === 'pending_payment') {
    if (!userAtomicOrderAmountIsValid(paidOrder) || paidOrder.providerTransactionId || paidOrder.subOrders.some((subOrder) => subOrder.status !== 'pending_payment')) return false
    paidOrder.paidAt = descriptor.confirmedAt
    paidOrder.providerTransactionId = descriptor.providerTransactionId
    paidOrder.subOrders.forEach((subOrder) => {
      subOrder.status = 'paid'
      subOrder.logistics.push(
        { time: descriptor.confirmedAt, title: '支付成功', detail: '订单已进入供应商备货流程' },
        { time: descriptor.confirmedAt, title: '等待发货', detail: '供应商准备发货，暂无运单号' }
      )
    })
    paidOrder.status = deriveCOrderStatus(paidOrder.subOrders)
  } else if (paidOrder.providerTransactionId !== descriptor.providerTransactionId || paidOrder.subOrders.some((subOrder) => subOrder.status === 'pending_payment')) return false

  const supplierOrders = readPlatformOrders() || {}
  const nextSupplierOrders = cloneSeed(supplierOrders)
  for (const subOrder of paidOrder.subOrders) {
    const id = `C-MALL-${subOrder.id}`
    if (nextSupplierOrders[id]) {
      if (!paymentConfirmationSupplierOrderMatches(nextSupplierOrders[id], descriptor, subOrder)) return false
    } else nextSupplierOrders[id] = publishCSubOrderToSupplier(paidOrder, subOrder)
  }
  const ledger = readPlatformCommissionLedger() || {}
  const nextLedger = cloneSeed(ledger)
  for (const allocation of paidOrder.commissionAllocations) {
    const id = `CC-${allocation.id}`
    if (nextLedger[id]) {
      if (!paymentConfirmationLedgerEntryMatches(nextLedger[id], descriptor, allocation)) return false
    } else {
      nextLedger[id] = {
        id,
        sourceOrderId: descriptor.orderId,
        sourceSubOrderId: allocation.subOrderId,
        beneficiaryType: 'promoter',
        beneficiaryId: allocation.beneficiaryId,
        role: allocation.beneficiaryLevel || 'promoter',
        amount: allocation.amount,
        status: 'pending',
        createdAt: allocation.createdAt || descriptor.confirmedAt
      }
    }
  }
  const nextOrders = { ...orders, [paidOrder.id]: paidOrder }
  const synchronizedAttempt: PaymentAttempt = {
    ...attempt,
    status: 'synchronized',
    updatedAt: new Date(Math.max(Date.now(), Date.parse(attempt.updatedAt) + 1)).toISOString()
  }
  const steps = [
    { changed: !userAtomicSame(supplierOrders, nextSupplierOrders), apply: () => writePlatformOrders(nextSupplierOrders), rollback: () => writePlatformOrders(supplierOrders) },
    { changed: !userAtomicSame(ledger, nextLedger), apply: () => writePlatformCommissionLedger(nextLedger), rollback: () => writePlatformCommissionLedger(ledger) },
    { changed: !userAtomicSame(orders, nextOrders), apply: () => writeCOrders(nextOrders), rollback: () => writeCOrders(orders) },
    { changed: true, apply: () => writePaymentAttempt(synchronizedAttempt), rollback: () => writePlatformJson(PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, attempts) }
  ].filter((step) => step.changed)
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) { applied.push(step); continue }
    let rollbackOk = true
    for (const completed of [...applied, step].reverse()) if (!completed.rollback()) rollbackOk = false
    throw new Error(rollbackOk ? 'payment-confirmation-write-failed' : 'payment-confirmation-rollback-failed')
  }
  return paymentConfirmationBusinessIsSynchronized(descriptor)
}

export async function ensureConfirmedPaymentRecoveryTask(attemptOperationId: string): Promise<WriteResult<PlatformRecoveryTask>> {
  const operationId = paymentConfirmationRecoveryOperationId(attemptOperationId?.trim())
  let failure: WriteResult<PlatformRecoveryTask> | undefined
  const result = await runLockedPlatformCollectionTask<PlatformRecoveryTask | null>({
    collections: [...PAYMENT_CONFIRMATION_RECOVERY_COLLECTIONS, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY],
    execute: () => {
      const attempt = readPaymentAttempts()[attemptOperationId]
      if (!attempt || attempt.status !== 'confirmed' || !attempt.providerTransactionId) {
        failure = { ok: false, code: 'payment_not_confirmed', message: '支付结果尚未确认', operationId }
        return null
      }
      const original: PaymentConfirmationRecoverySnapshot = {
        variant: 'payment-confirmation', attemptOperationId: attempt.operationId, orderId: attempt.orderId, userId: attempt.userId,
        amount: attempt.amount, providerTransactionId: attempt.providerTransactionId, confirmedAt: attempt.updatedAt, status: 'confirmed'
      }
      const target: PaymentConfirmationRecoverySnapshot = { ...original, status: 'synchronized' }
      const collections = normalizePlatformTransactionCollections([...PAYMENT_CONFIRMATION_RECOVERY_COLLECTIONS, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY])
      if (!preparePlatformJournal({ operationId, collections, original, target, recoveryHandlerKey: USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY, recoverySchema: USER_PAYMENT_CONFIRMATION_RECOVERY_SCHEMA })
        || !resolvePlatformJournal(operationId, 'recovery-pending')) {
        failure = { ok: false, code: 'recovery_journal_write_failed', message: '支付恢复事务无法保存', operationId, fatal: true }
        return null
      }
      if (!enqueuePlatformRecovery({ operationId, failedStep: 'payment-synchronization', reason: 'confirmed payment requires business synchronization', handlerKey: USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY })) {
        failure = { ok: false, code: 'recovery_queue_write_failed', message: '支付恢复记录无法保存', operationId, fatal: true }
        return null
      }
      return readPlatformRecoveryQueue().find((task) => task.operationId === operationId && task.status === 'pending') || null
    }
  })
  if (!result.ok) return { ok: false, code: result.code, message: result.message, operationId, fatal: result.fatal }
  if (!result.value) return failure || { ok: false, code: 'recovery_task_missing', message: '支付恢复任务无法读取', operationId, fatal: true }
  return { ok: true, value: result.value, operationId }
}

function createPaymentConfirmationRecoveryHandlerRegistration(): PlatformRecoveryHandlerRegistration {
  return createPlatformProductionRecoveryHandlerRegistration(USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY, {
    execute: (task, journal) => task.handlerKey === USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY && executePaymentConfirmationRecovery(journal),
    readSnapshot: (task, journal) => {
      if (task.handlerKey !== USER_PAYMENT_CONFIRMATION_RECOVERY_HANDLER_KEY || !validPaymentConfirmationRecoveryJournal(journal)) return null
      const original = journal.original as PaymentConfirmationRecoverySnapshot
      return paymentConfirmationBusinessIsSynchronized(original) ? journal.target : journal.original
    }
  })
}

export function createUserAtomicRecoveryHandlerRegistrations(): PlatformRecoveryHandlerRegistration[] {
  const registrations = (Object.keys(USER_ATOMIC_RECOVERY_CONFIG) as UserAtomicRecoveryVariant[]).map((variant) => {
    const config = USER_ATOMIC_RECOVERY_CONFIG[variant]
    return createPlatformProductionRecoveryHandlerRegistration(config.key, {
      execute: (task, journal) => task.handlerKey === config.key && executeUserAtomicRecovery(journal, variant),
      readSnapshot: (task, journal) => task.handlerKey === config.key && isValidUserAtomicRecoveryJournal(journal, variant)
        ? readStableUserAtomicRecoverySnapshot(variant, (journal.original as UserAtomicRecoverySnapshot).ownerUserId)?.snapshot || null
        : null
    })
  })
  return [...registrations, createPaymentConfirmationRecoveryHandlerRegistration()]
}
export interface TieredPriceResult {
  unitPrice: number
  discountOff: number
  matchedPolicy: PricePolicy | null
  tier: PriceTier | null
}

function policyScopeKeywords(scope: string): string[] {
  return scope
    .replace(/类商品|商品|类目|类$/g, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function matchesPolicyScope(scope: string, category: string, name: string): boolean {
  const text = `${category} ${name}`.toLowerCase()
  const keywords = policyScopeKeywords(scope).map((keyword) => keyword.toLowerCase())
  return keywords.length > 0 && keywords.some((keyword) => text.includes(keyword))
}

export function tieredUnitPrice(
  input: { category: string; name: string; basePrice: number; quantity: number },
  policies: readonly PricePolicy[]
): TieredPriceResult {
  const fallback: TieredPriceResult = { unitPrice: input.basePrice, discountOff: 0, matchedPolicy: null, tier: null }
  if (!Number.isFinite(input.quantity) || input.quantity < 1) return fallback
  const matchedPolicy = policies.find((policy) => policy.enabled && policy.type === 'ladder' && matchesPolicyScope(policy.scope, input.category, input.name))
  if (!matchedPolicy || !matchedPolicy.tiers?.length) return fallback
  const tier = matchedPolicy.tiers.find((candidate) => candidate.minQty <= input.quantity && (candidate.maxQty === null || input.quantity <= candidate.maxQty))
  if (!tier) return fallback
  return { unitPrice: round2(tier.price), discountOff: tier.discountOff, matchedPolicy, tier }
}
