import { defineStore } from 'pinia'
import type { AfterSale, BusinessMediaValue, CatalogState, CAddress, CCartItem, CCommissionAllocation, CCommissionChain, CDistributorProfile, COrder, CProduct, CProductSku, CUserLevel, CommissionLedgerEntry, FarmStore, MockScenario, Order, PaymentAttempt, PlatformJournalEntry, Product, UserBinding, UserCommercePurchaseIntent, VoucherOrder, WithdrawalRequest } from '@agritainment/shared'
import {
  initialCatalogOrderQuantity,
  CATALOG_SCHEMA_VERSION, abortCatalogTransaction, allocateCCommissions, applyCatalogStockOperation, beginPaymentAttempt, buildSupplierAccountSeeds, cPriceForSku, catalogProductToCProduct, catalogProductsForAudience, cloneSeed, commitCatalogTransaction, cProducts as cProductSeeds, createId, demoCDistributorProfiles, deriveCOrderStatus, ensureCatalogState, ensureConfirmedPaymentRecoveryTask, markCatalogTransactionStockApplied, mergePlatformEntities, mergePlatformSupplierAccounts, migrateLegacyCatalog, normalizeCAddresses, normalizeCCommissionRecords, normalizeCOrders, normalizeCProducts, normalizeMinimumOrderQuantity, prepareCatalogTransaction, products as storeProductSeeds, promoters, readCAddresses, readCCommissionRecords, readCatalogState, readCOrders, readCUserSession, readCDistributorProfiles, writeCDistributorProfiles, readPendingCatalogTransactions, readPlatformJson, round2, seedCCommerceData,
  confirmCSubOrderReceiptAtSupplier, createUserAtomicRecoveryHandlerRegistrations, getPlatformProviders, initializePlatformRecoveryHandlers, isValidUserAtomicRecoveryJournal, markCSubOrderAfterSaleAtSupplier, readPaymentAttempts, readPlatformAfterSales, readPlatformCollectionRevision, readPlatformCommissionLedger, readPlatformEntities, readPlatformOrders, readPlatformSupplierAccounts, readPlatformWithdrawals, readUserBindings, readPlatformJournal, readUserCommercePurchaseIntents, reconcilePendingPlatformTransactions, resolveCReferralChain, resolveUserIdentity, retryPlatformRecoveryTask, runLockedPlatformCollectionTask, runLockedPlatformTransaction, simulateWechatLogin, splitCOrderItems, supplierCanReceiveNewOrders, suppliers as supplierSeeds, syncCSubOrderFromSupplier, transitionPaymentAttempt, upsertUserBinding, validateCatalogSkuOrderQuantity, writeUserBindings, writeCAddresses, writeCCommissionRecords, writeCOrder, writeCOrders, writeCUserSession, publishCSubOrderToSupplier, migrateLegacyCommissionsToLedger, readPlatformVoucherOrders, writePlatformAfterSales, writePlatformCommissionLedger, writePlatformCommissionLedgerEntry, writePlatformOrder, writePlatformOrders, writePlatformVoucherOrder, writePlatformVoucherOrders, writePlatformWithdrawal, writeUserCommercePurchaseIntents, preparePlatformJournal, markPlatformJournalStep, resolvePlatformJournal, enqueuePlatformRecovery, writeCatalogState, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_PRODUCTS_STORAGE_KEY, PLATFORM_C_SCHEMA_VERSION_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY
} from '@agritainment/shared'
import { seedDemoUserCart, seedDemoUserDistributor } from '../data/demo-distributor'
import { seedDemoUserOrders } from '../data/demo-orders'
import { readStorePackageProjection, userRepository } from '../services/repository'

interface CartLine extends CCartItem { stock: number; unavailable?: boolean }

const USER_COMMERCE_BOOTSTRAP_COLLECTIONS = [
  PLATFORM_C_SCHEMA_VERSION_STORAGE_KEY, PLATFORM_C_PRODUCTS_STORAGE_KEY, PLATFORM_C_DISTRIBUTORS_STORAGE_KEY,
  PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY,
  PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_MIGRATED_STORAGE_KEY,
  PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY,
  PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY
]
let activeUserCommerceBootstrap: Promise<CatalogState> | null = null
let latestUserCommerceBootstrap: Promise<CatalogState> | null = null

async function runUserCommerceBootstrap(): Promise<CatalogState> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const revisionChecks = USER_COMMERCE_BOOTSTRAP_COLLECTIONS.map((key) => ({ key, expectedRevision: readPlatformCollectionRevision(key) }))
    const result = await runLockedPlatformCollectionTask({
      collections: USER_COMMERCE_BOOTSTRAP_COLLECTIONS,
      revisionChecks,
      execute: () => {
        seedCCommerceData()
        migrateLegacyCommissionsToLedger()
        return recoverUserCatalogTransactions(ensureCatalogState(cloneSeed(storeProductSeeds), cloneSeed(cProductSeeds)))
      }
    })
    if (result.ok && result.value) return result.value
    if (!result.ok && result.code === 'revision_conflict') continue
    throw new Error(result.ok ? '商城启动未返回目录数据' : result.message)
  }
  throw new Error('商城启动数据持续发生并发更新，请重试')
}

/** Explicit locked startup migration; concurrent callers share the in-flight promise. */
export function migrateUserCommerceData(): Promise<CatalogState> {
  if (activeUserCommerceBootstrap) return activeUserCommerceBootstrap
  const bootstrap = runUserCommerceBootstrap()
  activeUserCommerceBootstrap = bootstrap
  latestUserCommerceBootstrap = bootstrap
  void bootstrap.then(
    () => { if (activeUserCommerceBootstrap === bootstrap) activeUserCommerceBootstrap = null },
    () => {
      if (activeUserCommerceBootstrap === bootstrap) activeUserCommerceBootstrap = null
      if (latestUserCommerceBootstrap === bootstrap) latestUserCommerceBootstrap = null
    }
  )
  return bootstrap
}

export function getUserCommerceBootstrapPromise(): Promise<CatalogState> {
  return latestUserCommerceBootstrap || migrateUserCommerceData()
}

interface UserOrderCatalogTransactionPayload {
  order: COrder
  binding?: UserBinding
}

interface UserVoucherCatalogTransactionPayload {
  voucherOrder: VoucherOrder
  commissionEntry?: CommissionLedgerEntry
}

async function packagePurchaseIntent(input: Omit<UserCommercePurchaseIntent, 'operationId'>): Promise<UserCommercePurchaseIntent | null> {
  const voucherId = createId('VO')
  const candidate: UserCommercePurchaseIntent = { ...input, operationId: `package-payment:${voucherId}` }
  const matches = (intent: UserCommercePurchaseIntent) => intent.ownerUserId === input.ownerUserId && intent.productId === input.productId
    && intent.skuId === input.skuId && intent.quantity === input.quantity
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = readPlatformCollectionRevision(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
    const intents = readUserCommercePurchaseIntents()
    const after = readPlatformCollectionRevision(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
    if (before !== after) continue
    const existing = Object.values(intents).find(matches)
    if (existing) return existing
    const result = await runLockedPlatformCollectionTask({
      collections: [PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY],
      revisionChecks: [{ key: PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, expectedRevision: after }],
      execute: () => writeUserCommercePurchaseIntents({ ...intents, [candidate.operationId]: candidate }) ? candidate : null
    })
    if (result.ok) return result.value || null
    if (result.code !== 'revision_conflict') return null
  }
  return null
}

function samePackagePurchaseIntent(actual: UserCommercePurchaseIntent, expected: UserCommercePurchaseIntent): boolean {
  return actual.ownerUserId === expected.ownerUserId && actual.productId === expected.productId && actual.skuId === expected.skuId
    && actual.quantity === expected.quantity && actual.amount === expected.amount && actual.operationId === expected.operationId
}

async function deletePackagePurchaseIntent(expected: UserCommercePurchaseIntent): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = readPlatformCollectionRevision(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
    const intents = readUserCommercePurchaseIntents()
    const after = readPlatformCollectionRevision(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
    if (before !== after) continue
    const current = intents[expected.operationId]
    if (!current) return true
    if (!samePackagePurchaseIntent(current, expected)) return false
    const next = Object.fromEntries(Object.entries(intents).filter(([key]) => key !== expected.operationId))
    const result = await runLockedPlatformCollectionTask({
      collections: [PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY],
      revisionChecks: [{ key: PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, expectedRevision: after }],
      execute: () => writeUserCommercePurchaseIntents(next, after)
    })
    if (result.ok) return result.value === true
    if (result.code !== 'revision_conflict') return false
  }
  return false
}

type CommissionWithWithdrawalKeys = CCommissionAllocation & { withdrawalRequestKeys?: string[] }
const USER_COMMERCE_RECOVERY_HANDLER_KEY = 'user-commerce-recovery-v1'
const USER_COMMERCE_RECOVERY_SCHEMA = 'user-commerce-snapshot-v1'
type UserCommerceVariant = 'receipt' | 'withdrawal' | 'cancel' | 'after-sale' | 'after-sale-catalog'
interface UserCommerceSnapshot {
  variant: UserCommerceVariant
  ownerUserId: string
  orders: Record<string, COrder>
  commissions: CCommissionAllocation[]
  withdrawals?: Record<string, WithdrawalRequest>
  supplierOrders?: Record<string, Order>
  afterSales?: Record<string, AfterSale> | null
  catalog?: CatalogState
}
interface StableUserCommerceSnapshot { snapshot: UserCommerceSnapshot; revisions: Record<string, number> }

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function sameCollections(actual: string[], expected: string[]): boolean {
  const normalized = (collections: string[]) => [...new Set(collections)].sort((left, right) => left.localeCompare(right))
  const legacy = normalized(expected)
  const locked = normalized([...expected, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY])
  const candidate = normalized(actual)
  return JSON.stringify(candidate) === JSON.stringify(legacy) || JSON.stringify(candidate) === JSON.stringify(locked)
}
function userCommerceCollections(variant: UserCommerceVariant): string[] {
  if (variant === 'withdrawal') return [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY]
  if (variant === 'cancel') return [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY]
  if (variant === 'receipt') return [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY]
  return [PLATFORM_AFTERSALES_STORAGE_KEY, ...(variant === 'after-sale-catalog' ? [PLATFORM_CATALOG_STORAGE_KEY] : []), PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY]
}
function userCommerceSnapshotKeys(variant: UserCommerceVariant): string[] {
  if (variant === 'withdrawal') return ['variant', 'ownerUserId', 'orders', 'commissions', 'withdrawals']
  if (variant === 'cancel') return ['variant', 'ownerUserId', 'orders', 'commissions', 'catalog']
  if (variant === 'receipt') return ['variant', 'ownerUserId', 'orders', 'commissions', 'supplierOrders']
  return ['variant', 'ownerUserId', 'orders', 'commissions', 'supplierOrders', 'afterSales', ...(variant === 'after-sale-catalog' ? ['catalog'] : [])]
}
function isUserCommerceSnapshot(value: unknown): value is UserCommerceSnapshot {
  if (!isRecord(value) || !['receipt', 'withdrawal', 'cancel', 'after-sale', 'after-sale-catalog'].includes(String(value.variant)) || typeof value.ownerUserId !== 'string' || !value.ownerUserId.trim() || !isRecord(value.orders) || !Array.isArray(value.commissions)) return false
  const variant = value.variant as UserCommerceVariant
  if (!sameCollections(Object.keys(value), userCommerceSnapshotKeys(variant))) return false
  if (variant === 'withdrawal' && !isRecord(value.withdrawals)) return false
  if (variant !== 'withdrawal' && variant !== 'cancel' && !isRecord(value.supplierOrders)) return false
  if ((variant === 'after-sale' || variant === 'after-sale-catalog') && !(value.afterSales === null || isRecord(value.afterSales))) return false
  if ((variant === 'cancel' || variant === 'after-sale-catalog') && (!isRecord(value.catalog) || !Array.isArray(value.catalog.products) || !Number.isInteger(value.catalog.revision))) return false
  return true
}
function changedRecordKeys(original: Record<string, unknown>, target: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(original), ...Object.keys(target)])].filter((key) => JSON.stringify(original[key]) !== JSON.stringify(target[key]))
}
function changedArrayRecords<T extends { id: string }>(original: T[], target: T[]): T[] {
  const before = new Map(original.map((item) => [item.id, item]))
  const after = new Map(target.map((item) => [item.id, item]))
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)))
    .flatMap((id) => [before.get(id), after.get(id)].filter((item): item is T => !!item))
}
function hasUniqueIds(records: Array<{ id: string }>): boolean {
  return records.every((record) => typeof record?.id === 'string' && !!record.id.trim()) && new Set(records.map((record) => record.id)).size === records.length
}
function ordersHaveUniqueCommissionAllocationIds(orders: Record<string, COrder>): boolean {
  return Object.values(orders).every((order) => Array.isArray(order?.commissionAllocations) && hasUniqueIds(order.commissionAllocations))
}
function orderShapeAndCommissionMirrorsMatch(original: UserCommerceSnapshot, target: UserCommerceSnapshot): boolean {
  const mirrors = (snapshot: UserCommerceSnapshot) => Object.values(snapshot.orders).every((order) => {
    const ids = new Set(order.commissionAllocations.map((allocation) => allocation.id))
    return order.commissionAllocations.every((allocation) => JSON.stringify(snapshot.commissions.find((record) => record.id === allocation.id)) === JSON.stringify(allocation))
      && snapshot.commissions.filter((record) => record.orderId === order.id).every((record) => ids.has(record.id))
  })
  if (!mirrors(original) || !mirrors(target)) return false
  return Object.keys(original.orders).every((orderId) => {
    const before = original.orders[orderId]
    const after = target.orders[orderId]
    if (!after || before.subOrders.length !== after.subOrders.length || new Set(before.subOrders.map((sub) => sub.id)).size !== before.subOrders.length || new Set(after.subOrders.map((sub) => sub.id)).size !== after.subOrders.length) return false
    const { status: _beforeStatus, commissionAllocations: _beforeAllocations, subOrders: _beforeSubOrders, inventoryReleased: _beforeInventoryReleased, ...beforeStable } = before
    const { status: _afterStatus, commissionAllocations: _afterAllocations, subOrders: _afterSubOrders, inventoryReleased: _afterInventoryReleased, ...afterStable } = after
    if (original.variant !== 'cancel' && _beforeInventoryReleased !== _afterInventoryReleased) return false
    return JSON.stringify(beforeStable) === JSON.stringify(afterStable) && before.subOrders.every((sub) => after.subOrders.some((candidate) => candidate.id === sub.id))
  }) && Object.keys(target.orders).every((orderId) => !!original.orders[orderId])
}
function sameSubOrderFieldsExcept(before: object, after: object, allowed: string[]): boolean {
  const beforeStable = { ...(before as Record<string, unknown>) }
  const afterStable = { ...(after as Record<string, unknown>) }
  allowed.forEach((key) => { delete beforeStable[key]; delete afterStable[key] })
  return JSON.stringify(beforeStable) === JSON.stringify(afterStable)
}
function catalogDeltaMatchesOrderItems(original: CatalogState, target: CatalogState, expected: Map<string, number>, operationId: string): boolean {
  if (target.schemaVersion !== original.schemaVersion || target.revision !== original.revision + 1 || target.products.length !== original.products.length) return false
  const targetProducts = new Map(target.products.map((product) => [product.id, product]))
  for (const product of original.products) {
    const nextProduct = targetProducts.get(product.id)
    if (!nextProduct || nextProduct.skus.length !== product.skus.length) return false
    const { skus: _beforeSkus, ...beforeProduct } = product
    const { skus: _afterSkus, ...afterProduct } = nextProduct
    if (JSON.stringify(beforeProduct) !== JSON.stringify(afterProduct)) return false
    const nextSkus = new Map(nextProduct.skus.map((sku) => [sku.id, sku]))
    for (const sku of product.skus) {
      const nextSku = nextSkus.get(sku.id)
      if (!nextSku) return false
      const { stock: beforeStock, ...beforeSku } = sku
      const { stock: afterStock, ...afterSku } = nextSku
      if (JSON.stringify(beforeSku) !== JSON.stringify(afterSku) || afterStock - beforeStock !== (expected.get(`${product.id}:${sku.id}`) || 0)) return false
    }
  }
  const beforeOps = original.appliedOperations || {}
  const afterOps = target.appliedOperations || {}
  if (changedRecordKeys(beforeOps, afterOps).some((id) => id !== operationId)) return false
  const operation = afterOps[operationId]
  if (!operation || operation.action !== 'release') return false
  try {
    const fingerprint = JSON.parse(operation.requestFingerprint) as { action?: string; changes?: Array<{ productId: string; skuId: string; quantity: number }> }
    const fingerprintChanges = new Map<string, number>()
    for (const change of fingerprint.changes || []) fingerprintChanges.set(`${change.productId}:${change.skuId}`, (fingerprintChanges.get(`${change.productId}:${change.skuId}`) || 0) + change.quantity)
    return fingerprint.action === 'release' && JSON.stringify([...fingerprintChanges.entries()].sort()) === JSON.stringify([...expected.entries()].sort())
  } catch {
    return false
  }
}
type RecoverableCommission = CCommissionAllocation & { withdrawalRequestKeys?: string[] }
function commissionChangesAreAllowed(original: UserCommerceSnapshot, target: UserCommerceSnapshot): boolean {
  const before = new Map(original.commissions.map((record) => [record.id, record as RecoverableCommission]))
  const after = new Map(target.commissions.map((record) => [record.id, record as RecoverableCommission]))
  const defined = new Map<string, RecoverableCommission>()
  Object.values(original.orders).forEach((order) => order.commissionAllocations.forEach((record) => defined.set(record.id, record as RecoverableCommission)))
  original.commissions.forEach((record) => defined.set(record.id, record as RecoverableCommission))
  const sameFinancialSource = (left: RecoverableCommission, right: RecoverableCommission) => left.orderId === right.orderId && left.subOrderId === right.subOrderId
    && left.beneficiaryId === right.beneficiaryId && left.beneficiaryLevel === right.beneficiaryLevel
  const sameSource = (left: RecoverableCommission, right: RecoverableCommission) => sameFinancialSource(left, right) && left.createdAt === right.createdAt
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id)
    const next = after.get(id)
    if (JSON.stringify(previous) === JSON.stringify(next)) continue
    if (!next) return false
    if (previous) {
      if (!sameSource(previous, next)) return false
      if (original.variant === 'receipt') {
        if (previous.amount !== next.amount || previous.status !== 'pending' || next.status !== 'available') return false
        continue
      }
      if (original.variant === 'after-sale' || original.variant === 'after-sale-catalog') {
        if (previous.amount !== next.amount || previous.status === 'withdrawn' || next.status !== 'reversed') return false
        continue
      }
      if (original.variant === 'cancel') {
        if (previous.amount !== next.amount || previous.status !== 'pending' || next.status !== 'reversed') return false
        continue
      }
      const beforeKeys = previous.withdrawalRequestKeys || []
      const afterKeys = next.withdrawalRequestKeys || []
      if (previous.status !== 'available' || !['available', 'withdrawn'].includes(next.status) || next.amount <= 0 || next.amount > previous.amount
        || beforeKeys.some((key) => !afterKeys.includes(key))
        || (next.status === 'withdrawn' && (next.amount !== previous.amount || afterKeys.length <= beforeKeys.length))
        || (next.status === 'available' && (next.amount >= previous.amount || afterKeys.length !== beforeKeys.length))) return false
      continue
    }
    const orderAllocation = defined.get(id)
    if (orderAllocation) {
      if (!sameSource(orderAllocation, next) || orderAllocation.amount !== next.amount) return false
      if (original.variant === 'receipt' && orderAllocation.status === 'pending' && next.status === 'available') continue
      if ((original.variant === 'after-sale' || original.variant === 'after-sale-catalog') && orderAllocation.status !== 'withdrawn' && next.status === 'reversed') continue
      if (original.variant === 'cancel' && orderAllocation.status === 'pending' && next.status === 'reversed') continue
      if (original.variant === 'withdrawal' && orderAllocation.status === 'available' && next.status === 'withdrawn' && (next.withdrawalRequestKeys || []).length) continue
      return false
    }
    if (original.variant === 'after-sale' || original.variant === 'after-sale-catalog') {
      const source = [...defined.values()].find((record) => record.status === 'withdrawn' && id === `${record.id}:reverse:${record.subOrderId}`)
      if (!source || !sameFinancialSource(source, next) || next.amount !== -source.amount || next.status !== 'reversed') return false
      continue
    }
    if (original.variant === 'withdrawal') {
      const source = [...defined.values()].find((record) => id.startsWith(`${record.id}:withdrawn:`))
      const keys = next.withdrawalRequestKeys || []
      if (!source || source.status !== 'available' || !sameSource(source, next) || next.amount <= 0 || next.amount > source.amount || next.status !== 'withdrawn' || !keys.length) return false
      continue
    }
    return false
  }
  if (original.variant === 'withdrawal') {
    for (const source of defined.values()) {
      if (source.status !== 'available') continue
      const current = after.get(source.id)
      const splits = [...after.values()].filter((record) => record.id.startsWith(`${source.id}:withdrawn:`))
      const changed = JSON.stringify(current) !== JSON.stringify(before.get(source.id)) || splits.some((record) => !before.has(record.id))
      if (!changed) continue
      const total = (current?.amount || 0) + splits.reduce((sum, record) => sum + record.amount, 0)
      if (round2(total) !== round2(source.amount) || (current?.status === 'withdrawn' && splits.length)) return false
    }
  }
  return true
}
function userCommerceOperationMatches(journal: PlatformJournalEntry, original: UserCommerceSnapshot, target: UserCommerceSnapshot, changedOrderIds: string[], changedCommissions: CCommissionAllocation[]): boolean {
  const targetCommissions = new Map(target.commissions.map((record) => [record.id, record]))
  const targetAllocation = (record: CCommissionAllocation) => target.orders[record.orderId]?.commissionAllocations.find((allocation) => allocation.id === record.id)
  if (changedCommissions.some((record) => {
    const next = targetCommissions.get(record.id)
    return !!next && JSON.stringify(targetAllocation(next)) !== JSON.stringify(next)
  })) return false

  if (original.variant === 'withdrawal') {
    const prefix = `withdrawal-sync:${original.ownerUserId}:`
    if (!journal.operationId.startsWith(prefix)) return false
    const requestKeys = journal.operationId.slice(prefix.length).split(',').filter(Boolean)
    if (!requestKeys.length || new Set(requestKeys).size !== requestKeys.length || !changedCommissions.length
      || JSON.stringify(original.withdrawals) !== JSON.stringify(target.withdrawals)
      || JSON.stringify(original.withdrawals) !== JSON.stringify(readPlatformWithdrawals() || {})) return false
    const requests = Object.values(original.withdrawals || {})
    const requestsByKey = new Map(requests.map((request) => [request.requestKey, request]))
    if (requestsByKey.size !== requests.length || requestKeys.some((key) => {
      const request = requestsByKey.get(key)
      return !request || request.requesterType !== 'user' || request.requesterId !== original.ownerUserId || request.status !== 'approved'
    })) return false
    const usedKeys = new Set<string>()
    const consumedByKey = new Map<string, number>()
    for (const record of target.commissions as RecoverableCommission[]) {
      const previous = original.commissions.find((item) => item.id === record.id) as RecoverableCommission | undefined
      const beforeKeys = previous?.withdrawalRequestKeys || []
      const addedKeys = (record.withdrawalRequestKeys || []).filter((key) => !beforeKeys.includes(key))
      if (addedKeys.length > 1 || addedKeys.some((key) => !requestKeys.includes(key))) return false
      addedKeys.forEach((key) => {
        const consumed = previous ? (record.status === 'withdrawn' ? previous.amount : previous.amount - record.amount) : record.amount
        if (consumed <= 0) return
        usedKeys.add(key)
        consumedByKey.set(key, round2((consumedByKey.get(key) || 0) + consumed))
      })
    }
    if (requestKeys.some((key) => !usedKeys.has(key) || round2(consumedByKey.get(key) || 0) !== round2(requestsByKey.get(key)!.amount))) return false
    return changedOrderIds.every((orderId) => {
      const before = original.orders[orderId]
      const after = target.orders[orderId]
      if (!before || !after || !hasUniqueIds(before.commissionAllocations) || !hasUniqueIds(after.commissionAllocations)) return false
      const { commissionAllocations: _beforeAllocations, ...beforeStable } = before
      const { commissionAllocations: _afterAllocations, ...afterStable } = after
      return JSON.stringify(beforeStable) === JSON.stringify(afterStable)
    })
  }

  if (original.variant === 'receipt') {
    const match = /^receipt:([^:]+):(.+)$/.exec(journal.operationId)
    if (!match || changedOrderIds.length !== 1 || changedOrderIds[0] !== match[1]) return false
    const before = original.orders[match[1]]
    const after = target.orders[match[1]]
    const beforeSub = before?.subOrders.find((sub) => sub.id === match[2])
    const afterSub = after?.subOrders.find((sub) => sub.id === match[2])
    if (!before || !after || !beforeSub || !afterSub || beforeSub.status !== 'shipped' || afterSub.status !== 'received' || after.status !== deriveCOrderStatus(after.subOrders) || !sameSubOrderFieldsExcept(beforeSub, afterSub, ['status', 'logistics'])) return false
    if (before.subOrders.some((sub) => sub.id !== match[2] && JSON.stringify(sub) !== JSON.stringify(after.subOrders.find((candidate) => candidate.id === sub.id)))) return false
    return changedCommissions.every((record) => record.orderId === match[1] && record.subOrderId === match[2])
  }

  if (original.variant === 'cancel') {
    const orderId = /^cancel:(.+)$/.exec(journal.operationId)?.[1]
    if (!orderId || changedOrderIds.length !== 1 || changedOrderIds[0] !== orderId) return false
    const before = original.orders[orderId]
    const after = target.orders[orderId]
    if (!before || !after || before.status !== 'pending_payment' || before.inventoryReleased || after.status !== 'cancelled' || !after.inventoryReleased || before.subOrders.length !== after.subOrders.length) return false
    if (before.subOrders.some((sub) => {
      const next = after.subOrders.find((candidate) => candidate.id === sub.id)
      return !next || sub.status !== 'pending_payment' || next.status !== 'cancelled' || !next.inventoryReleased || next.logistics.length !== sub.logistics.length + 1
        || !sameSubOrderFieldsExcept(sub, next, ['status', 'inventoryReleased', 'logistics'])
    })) return false
    return changedCommissions.every((record) => record.orderId === orderId && record.status === 'reversed')
  }

  const match = /^after-sale:(.+)$/.exec(journal.operationId)
  if (!match || changedOrderIds.length !== 1) return false
  const orderId = changedOrderIds[0]
  const before = original.orders[orderId]
  const after = target.orders[orderId]
  const beforeSub = before?.subOrders.find((sub) => sub.id === match[1])
  const afterSub = after?.subOrders.find((sub) => sub.id === match[1])
  if (!before || !after || !beforeSub || !afterSub || !['paid', 'shipped', 'received'].includes(beforeSub.status) || afterSub.status !== 'after_sale' || after.status !== deriveCOrderStatus(after.subOrders) || beforeSub.afterSale || afterSub.afterSale?.status !== 'processing' || !sameSubOrderFieldsExcept(beforeSub, afterSub, ['status', 'afterSale', 'inventoryReleased'])) return false
  if ((original.variant === 'after-sale-catalog') !== (beforeSub.status === 'paid')) return false
  if (original.variant === 'after-sale' && afterSub.inventoryReleased !== beforeSub.inventoryReleased) return false
  if (original.variant === 'after-sale-catalog' && (!afterSub.inventoryReleased || beforeSub.inventoryReleased)) return false
  if (before.subOrders.some((sub) => sub.id !== match[1] && JSON.stringify(sub) !== JSON.stringify(after.subOrders.find((candidate) => candidate.id === sub.id)))) return false
  return changedCommissions.every((record) => record.orderId === orderId && record.subOrderId === match[1])
}
function isUserCommerceJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== USER_COMMERCE_RECOVERY_HANDLER_KEY || journal.recoverySchema !== USER_COMMERCE_RECOVERY_SCHEMA || !isUserCommerceSnapshot(journal.original) || !isUserCommerceSnapshot(journal.target)) return false
  const original = journal.original
  const target = journal.target
  if (original.variant !== target.variant || original.ownerUserId !== target.ownerUserId || !sameCollections(journal.collections, userCommerceCollections(original.variant))) return false
  if (!hasUniqueIds(original.commissions) || !hasUniqueIds(target.commissions) || !ordersHaveUniqueCommissionAllocationIds(original.orders) || !ordersHaveUniqueCommissionAllocationIds(target.orders)) return false
  if (!orderShapeAndCommissionMirrorsMatch(original, target)) return false
  const changedOrderIds = changedRecordKeys(original.orders, target.orders)
  if (!changedOrderIds.every((id) => {
    const before = original.orders[id]
    const after = target.orders[id]
    return (!before || before.userId === original.ownerUserId) && (!after || after.userId === original.ownerUserId)
  })) return false
  const ownedOrders = new Map<string, COrder>()
  Object.values({ ...original.orders, ...target.orders }).forEach((order) => {
    if (order?.userId === original.ownerUserId && Array.isArray(order.subOrders)) ownedOrders.set(order.id, order)
  })
  const orderHasSub = (orderId: string, subOrderId: string) => !!ownedOrders.get(orderId)?.subOrders.some((sub) => sub.id === subOrderId)
  const changedCommissions = changedArrayRecords(original.commissions, target.commissions)
  if (changedCommissions.some((record) => !orderHasSub(record.orderId, record.subOrderId)) || !commissionChangesAreAllowed(original, target)) return false
  if (!userCommerceOperationMatches(journal, original, target, changedOrderIds, changedCommissions)) return false
  if (original.variant === 'withdrawal') return true
  if (original.variant === 'cancel') {
    const orderId = changedOrderIds[0]
    const beforeOrder = original.orders[orderId]
    const expected = new Map<string, number>()
    for (const item of beforeOrder?.items || []) expected.set(`${item.productId}:${item.skuId}`, (expected.get(`${item.productId}:${item.skuId}`) || 0) + item.quantity)
    return expected.size > 0 && !!original.catalog && !!target.catalog && catalogDeltaMatchesOrderItems(original.catalog, target.catalog, expected, journal.operationId)
  }

  const changedOrderSet = new Set(changedOrderIds)
  const changedAfterSales = changedRecordKeys(original.afterSales || {}, target.afterSales || {})
  if (changedAfterSales.some((id) => {
    const before = (original.afterSales || {})[id]
    const after = (target.afterSales || {})[id]
    return !changedOrderSet.has(after?.orderId || before?.orderId || '')
  })) return false
  const changedSupplierOrders = changedRecordKeys(original.supplierOrders || {}, target.supplierOrders || {})
  if (changedSupplierOrders.some((id) => {
    const order = (target.supplierOrders || {})[id] || (original.supplierOrders || {})[id]
    const link = order?.supplierOrderLink
    return link?.source !== 'c-mall' || link.customerUserId !== original.ownerUserId || !changedOrderSet.has(link.sourceOrderId || '') || !orderHasSub(link.sourceOrderId || '', link.sourceSubOrderId || '')
  })) return false
  if (original.variant !== 'after-sale-catalog') return true
  const expected = new Map<string, number>()
  for (const orderId of changedOrderIds) {
    const beforeOrder = original.orders[orderId]
    const afterOrder = target.orders[orderId]
    if (!beforeOrder || !afterOrder) return false
    for (const afterSub of afterOrder.subOrders) {
      const beforeSub = beforeOrder.subOrders.find((sub) => sub.id === afterSub.id)
      if (!beforeSub || beforeSub.inventoryReleased || !afterSub.inventoryReleased || afterSub.status !== 'after_sale') continue
      for (const item of beforeSub.items) expected.set(`${item.productId}:${item.skuId}`, (expected.get(`${item.productId}:${item.skuId}`) || 0) + item.quantity)
    }
  }
  return expected.size > 0 && !!original.catalog && !!target.catalog && catalogDeltaMatchesOrderItems(original.catalog, target.catalog, expected, journal.operationId)
}
function stableRead<T>(key: string, reader: () => T): { data: T; revision: number } | null {
  const before = readPlatformCollectionRevision(key)
  const data = cloneSeed(reader())
  const after = readPlatformCollectionRevision(key)
  return before === after ? { data, revision: after } : null
}
function readStableUserCommerceSnapshot(variant: UserCommerceVariant, ownerUserId: string): StableUserCommerceSnapshot | null {
  const reads: Array<[string, () => unknown]> = [
    [PLATFORM_C_ORDERS_STORAGE_KEY, () => readCOrders() || {}],
    [PLATFORM_C_COMMISSIONS_STORAGE_KEY, () => readCCommissionRecords() || []]
  ]
  if (variant === 'after-sale' || variant === 'after-sale-catalog') reads.unshift([PLATFORM_AFTERSALES_STORAGE_KEY, () => readPlatformAfterSales()])
  if (variant === 'cancel') reads.unshift([PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()])
  if (variant === 'after-sale-catalog') reads.splice(1, 0, [PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()])
  if (variant === 'withdrawal') reads.push([PLATFORM_WITHDRAWALS_STORAGE_KEY, () => readPlatformWithdrawals() || {}])
  if (variant !== 'withdrawal' && variant !== 'cancel') reads.push([PLATFORM_ORDERS_STORAGE_KEY, () => readPlatformOrders() || {}])
  const values = new Map<string, unknown>()
  const revisions: Record<string, number> = {}
  for (const [key, reader] of reads) {
    const stable = stableRead(key, reader)
    if (!stable) return null
    values.set(key, stable.data)
    revisions[key] = stable.revision
  }
  const snapshot: UserCommerceSnapshot = {
    variant,
    ownerUserId,
    orders: values.get(PLATFORM_C_ORDERS_STORAGE_KEY) as Record<string, COrder>,
    commissions: values.get(PLATFORM_C_COMMISSIONS_STORAGE_KEY) as CCommissionAllocation[]
  }
  if (variant !== 'withdrawal' && variant !== 'cancel') snapshot.supplierOrders = values.get(PLATFORM_ORDERS_STORAGE_KEY) as Record<string, Order>
  if (variant === 'withdrawal') snapshot.withdrawals = values.get(PLATFORM_WITHDRAWALS_STORAGE_KEY) as Record<string, WithdrawalRequest>
  if (variant === 'after-sale' || variant === 'after-sale-catalog') snapshot.afterSales = values.get(PLATFORM_AFTERSALES_STORAGE_KEY) as Record<string, AfterSale> | null
  if (variant === 'after-sale-catalog') {
    const catalog = values.get(PLATFORM_CATALOG_STORAGE_KEY)
    if (!catalog) return null
    snapshot.catalog = catalog as CatalogState
  }
  if (variant === 'cancel') {
    const catalog = values.get(PLATFORM_CATALOG_STORAGE_KEY)
    if (!catalog) return null
    snapshot.catalog = catalog as CatalogState
  }
  return { snapshot, revisions }
}
function readUserCommerceSnapshot(journal: PlatformJournalEntry): UserCommerceSnapshot | null {
  if (!isUserCommerceJournal(journal)) return null
  return readStableUserCommerceSnapshot((journal.original as UserCommerceSnapshot).variant, (journal.original as UserCommerceSnapshot).ownerUserId)?.snapshot || null
}
function writeUserCommerceSnapshot(snapshot: UserCommerceSnapshot, rollbackSnapshot?: UserCommerceSnapshot): boolean {
  const before = rollbackSnapshot || readStableUserCommerceSnapshot(snapshot.variant, snapshot.ownerUserId)?.snapshot
  if (!before) return false
  const steps: Array<{ apply: () => boolean; rollback: () => boolean }> = []
  if (snapshot.afterSales !== undefined) steps.push({ apply: () => writePlatformAfterSales(snapshot.afterSales!), rollback: () => writePlatformAfterSales(before.afterSales!) })
  if (snapshot.catalog) steps.push({ apply: () => writeCatalogState(snapshot.catalog!), rollback: () => writeCatalogState(before.catalog!) })
  steps.push({ apply: () => writeCOrders(snapshot.orders), rollback: () => writeCOrders(before.orders) })
  steps.push({ apply: () => writeCCommissionRecords(snapshot.commissions), rollback: () => writeCCommissionRecords(before.commissions) })
  if (snapshot.supplierOrders) steps.push({ apply: () => writePlatformOrders(snapshot.supplierOrders!), rollback: () => writePlatformOrders(before.supplierOrders!) })
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) { applied.push(step); continue }
    for (const completed of [...applied].reverse()) completed.rollback()
    return false
  }
  return true
}
function recoverUserCommerceJournal(journal: PlatformJournalEntry): boolean {
  if (!isUserCommerceJournal(journal)) return false
  const original = journal.original as UserCommerceSnapshot
  const target = journal.target as UserCommerceSnapshot
  const current = readStableUserCommerceSnapshot(original.variant, original.ownerUserId)
  if (!current) return false
  const fields: Array<keyof UserCommerceSnapshot> = ['orders', 'commissions']
  if (original.variant === 'withdrawal') fields.push('withdrawals')
  else fields.push('supplierOrders')
  if (original.variant === 'after-sale' || original.variant === 'after-sale-catalog') fields.push('afterSales')
  if (original.variant === 'after-sale-catalog' || original.variant === 'cancel') fields.push('catalog')
  if (fields.some((field) => JSON.stringify(current.snapshot[field]) !== JSON.stringify(original[field]) && JSON.stringify(current.snapshot[field]) !== JSON.stringify(target[field]))) return false
  if (JSON.stringify(current.snapshot) === JSON.stringify(original) || JSON.stringify(current.snapshot) === JSON.stringify(target)) return true
  if (userCommerceCollections(original.variant).some((key) => readPlatformCollectionRevision(key) !== current.revisions[key])) return false
  return writeUserCommerceSnapshot(original, current.snapshot)
}
function reusableUserTarget(operationId: string, original: UserCommerceSnapshot): UserCommerceSnapshot | null {
  const journal = readPlatformJournal()[operationId]
  return journal?.status === 'aborted' && isUserCommerceJournal(journal) && JSON.stringify(journal.original) === JSON.stringify(original) ? cloneSeed(journal.target as UserCommerceSnapshot) : null
}

type UserAtomicVariant = 'checkout' | 'payment' | 'package'
interface UserAtomicSnapshot {
  variant: UserAtomicVariant
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
const USER_PAYMENT_RECOVERY_HANDLER_KEY = 'user-payment-v1'
const USER_PACKAGE_RECOVERY_HANDLER_KEY = 'user-package-v1'
function userAtomicCollections(variant: UserAtomicVariant): string[] {
  if (variant === 'checkout') return [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY]
  if (variant === 'payment') return [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY]
  return [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY]
}
function readStableUserAtomicSnapshot(variant: UserAtomicVariant, ownerUserId: string): StableUserCommerceSnapshot | { snapshot: UserAtomicSnapshot; revisions: Record<string, number> } | null {
  const reads: Array<[string, () => unknown]> = variant === 'checkout'
    ? [[PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()], [PLATFORM_C_ORDERS_STORAGE_KEY, () => readCOrders() || {}], [PLATFORM_C_COMMISSIONS_STORAGE_KEY, () => readCCommissionRecords() || []], [PLATFORM_BINDINGS_STORAGE_KEY, () => readUserBindings() || {}]]
    : variant === 'payment'
      ? [[PLATFORM_C_ORDERS_STORAGE_KEY, () => readCOrders() || {}], [PLATFORM_ORDERS_STORAGE_KEY, () => readPlatformOrders() || {}], [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, () => readPlatformCommissionLedger() || {}]]
      : [[PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()], [PLATFORM_VOUCHERS_STORAGE_KEY, () => readPlatformVoucherOrders() || {}], [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, () => readPlatformCommissionLedger() || {}], [PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, () => readUserCommercePurchaseIntents()]]
  const values = new Map<string, unknown>()
  const revisions: Record<string, number> = {}
  for (const [key, reader] of reads) {
    const stable = stableRead(key, reader)
    if (!stable || (key === PLATFORM_CATALOG_STORAGE_KEY && !stable.data)) return null
    values.set(key, stable.data)
    revisions[key] = stable.revision
  }
  const snapshot: UserAtomicSnapshot = { variant, ownerUserId }
  if (variant === 'checkout') Object.assign(snapshot, { catalog: values.get(PLATFORM_CATALOG_STORAGE_KEY), orders: values.get(PLATFORM_C_ORDERS_STORAGE_KEY), commissions: values.get(PLATFORM_C_COMMISSIONS_STORAGE_KEY), bindings: values.get(PLATFORM_BINDINGS_STORAGE_KEY) })
  else if (variant === 'payment') Object.assign(snapshot, { orders: values.get(PLATFORM_C_ORDERS_STORAGE_KEY), supplierOrders: values.get(PLATFORM_ORDERS_STORAGE_KEY), ledger: values.get(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY) })
  else Object.assign(snapshot, { catalog: values.get(PLATFORM_CATALOG_STORAGE_KEY), vouchers: values.get(PLATFORM_VOUCHERS_STORAGE_KEY), ledger: values.get(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY), intents: values.get(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY) })
  return { snapshot, revisions }
}
function isUserAtomicJournal(journal: PlatformJournalEntry, variant: UserAtomicVariant): boolean {
  const original = journal.original as UserAtomicSnapshot
  const target = journal.target as UserAtomicSnapshot
  const handlerKey = variant === 'payment' ? USER_PAYMENT_RECOVERY_HANDLER_KEY : variant === 'package' ? USER_PACKAGE_RECOVERY_HANDLER_KEY : USER_COMMERCE_RECOVERY_HANDLER_KEY
  return journal.recoveryHandlerKey === handlerKey && journal.recoverySchema === `user-${variant}-snapshot-v1`
    && original?.variant === variant && target?.variant === variant && !!original.ownerUserId && original.ownerUserId === target.ownerUserId
    && sameCollections(journal.collections, userAtomicCollections(variant))
}
function readUserAtomicSnapshot(journal: PlatformJournalEntry, variant: UserAtomicVariant): UserAtomicSnapshot | null {
  if (!isUserAtomicJournal(journal, variant)) return null
  return (readStableUserAtomicSnapshot(variant, (journal.original as UserAtomicSnapshot).ownerUserId) as { snapshot: UserAtomicSnapshot } | null)?.snapshot || null
}
function writeUserAtomicSnapshot(snapshot: UserAtomicSnapshot): boolean {
  const before = (readStableUserAtomicSnapshot(snapshot.variant, snapshot.ownerUserId) as { snapshot: UserAtomicSnapshot } | null)?.snapshot
  if (!before) return false
  const steps: Array<{ apply: () => boolean; rollback: () => boolean }> = []
  if (snapshot.catalog) steps.push({ apply: () => writeCatalogState(snapshot.catalog!), rollback: () => writeCatalogState(before.catalog!) })
  if (snapshot.orders) steps.push({ apply: () => writeCOrders(snapshot.orders!), rollback: () => writeCOrders(before.orders!) })
  if (snapshot.commissions) steps.push({ apply: () => writeCCommissionRecords(snapshot.commissions!), rollback: () => writeCCommissionRecords(before.commissions!) })
  if (snapshot.bindings) steps.push({ apply: () => writeUserBindings(snapshot.bindings!), rollback: () => writeUserBindings(before.bindings!) })
  if (snapshot.supplierOrders) steps.push({ apply: () => writePlatformOrders(snapshot.supplierOrders!), rollback: () => writePlatformOrders(before.supplierOrders!) })
  if (snapshot.ledger) steps.push({ apply: () => writePlatformCommissionLedger(snapshot.ledger!), rollback: () => writePlatformCommissionLedger(before.ledger!) })
  if (snapshot.vouchers) steps.push({ apply: () => writePlatformVoucherOrders(snapshot.vouchers!), rollback: () => writePlatformVoucherOrders(before.vouchers!) })
  if (snapshot.intents) steps.push({ apply: () => writeUserCommercePurchaseIntents(snapshot.intents!), rollback: () => writeUserCommercePurchaseIntents(before.intents!) })
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) { applied.push(step); continue }
    for (const completed of [...applied].reverse()) completed.rollback()
    return false
  }
  return true
}
function recoverUserAtomicJournal(journal: PlatformJournalEntry, variant: UserAtomicVariant): boolean {
  const current = readUserAtomicSnapshot(journal, variant)
  if (!current) return false
  if (JSON.stringify(current) === JSON.stringify(journal.target)) return true
  return writeUserAtomicSnapshot(journal.original as UserAtomicSnapshot)
}
function reusableUserAtomicTarget(operationId: string, original: UserAtomicSnapshot, variant: UserAtomicVariant): UserAtomicSnapshot | null {
  const journal = readPlatformJournal()[operationId]
  return journal?.status === 'aborted' && isValidUserAtomicRecoveryJournal(journal, variant) && JSON.stringify(journal.original) === JSON.stringify(original)
    ? cloneSeed(journal.target as UserAtomicSnapshot)
    : null
}

function unavailableSupplierName(supplierIds: string[]): string | null {
  const directory = mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers)
  const accounts = mergePlatformSupplierAccounts(buildSupplierAccountSeeds(directory), readPlatformSupplierAccounts())
  for (const supplierId of new Set(supplierIds)) {
    const supplier = directory.find((item) => item.id === supplierId)
    if (supplier && !supplierCanReceiveNewOrders(supplier, accounts.find((item) => item.supplierId === supplierId))) return supplier.name
  }
  return null
}

function buildUserAfterSaleCase(order: COrder, sub: COrder['subOrders'][number], evidenceImages?: BusinessMediaValue[]): AfterSale {
  const amount = round2(sub.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))
  const quantity = sub.items.reduce((sum, item) => sum + item.quantity, 0)
  return {
    id: sub.afterSale?.id || createId('AS'),
    orderId: order.id,
    productName: sub.items[0]?.name || '商品',
    applicant: order.address?.receiver || '用户',
    type: 'refund',
    amount,
    status: 'processing',
    sourcePortal: 'user',
    masterOrderId: order.id,
    subOrderId: sub.id,
    supplierOrderId: `C-MALL-${sub.id}`,
    operationId: `after-sale:${sub.id}`,
    issue: sub.afterSale?.reason || '用户申请售后',
    quantity,
    evidenceImages,
    history: [{
      time: new Date().toLocaleString('zh-CN'),
      action: '用户发起售后，平台受理中',
      operator: order.address?.receiver || '用户'
    }]
  }
}

interface UserState {
  initialized: boolean
  loading: boolean
  withdrawalsTick: number
  distributorTick: number
  error: string
  mockScenario: MockScenario
  farms: FarmStore[]
  products: Product[]
  cProducts: CProduct[]
  inventoryRevision: number
  launchProductId: string
  promoterId: string
  promoterName: string
  referralPromoterId: string
  userId: string
  cart: CartLine[]
  orders: COrder[]
  addresses: CAddress[]
  commissionRecords: CCommissionAllocation[]
  auth: { isLoggedIn: boolean; openid: string }
  checkoutError: string
  entryChecked: boolean
  entryRestricted: boolean
}

const nowString = () => new Date().toISOString()
const validLevel = (value: unknown): value is CUserLevel => value === 'normal' || value === 'level1' || value === 'level2'
const resolveDirectReferralChain = (promoterId: string, profiles: Record<string, CDistributorProfile>): CCommissionChain | null => resolveCReferralChain(promoterId, promoters, profiles)
const persistUserAddresses = (userId: string, addresses: CAddress[], options: { removedIds?: string[]; defaultId?: string } = {}) => {
  const all = cloneSeed(readCAddresses() || {})
  options.removedIds?.forEach((id) => { delete all[id] })
  addresses.forEach((address) => { all[address.id] = address })
  if (options.defaultId) {
    const updatedAt = nowString()
    Object.values(all).forEach((address) => {
      if (address.userId !== userId) return
      address.isDefault = address.id === options.defaultId
      if (address.isDefault) address.updatedAt = updatedAt
    })
  }
  const normalized = normalizeCAddresses(all)
  if (!writeCAddresses(normalized)) return null
  return Object.values(normalized).filter((address) => address.userId === userId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

const persistCommissionChanges = (changes: CCommissionAllocation[]): CCommissionAllocation[] | null => {
  const records = new Map((readCCommissionRecords() || []).map((item) => [item.id, item]))
  changes.forEach((item) => records.set(item.id, item))
  const merged = [...records.values()]
  return writeCCommissionRecords(merged) ? merged : null
}

function persistUserCatalogTransaction(payload: UserOrderCatalogTransactionPayload): CCommissionAllocation[] | null {
  const originalCommissions = cloneSeed(readCCommissionRecords() || [])
  const originalOrders = cloneSeed(readCOrders() || {})
  const originalBindings = cloneSeed(readUserBindings() || {})
  const commissions = persistCommissionChanges(payload.order.commissionAllocations)
  if (!commissions || !writeCOrder(payload.order)) {
    writeCCommissionRecords(originalCommissions)
    writeCOrders(originalOrders)
    return null
  }
  if (payload.binding && !upsertUserBinding(payload.binding)) {
    writeCCommissionRecords(originalCommissions)
    writeCOrders(originalOrders)
    writeUserBindings(originalBindings)
    return null
  }
  return commissions
}

function applyOrderSnapshot(target: COrder, snapshot: COrder): void {
  const subOrders = snapshot.subOrders.map((next) => {
    const current = target.subOrders.find((item) => item.id === next.id)
    if (!current) return next
    Object.assign(current, next)
    return current
  })
  Object.assign(target, snapshot, { subOrders })
}

function recoverUserCatalogTransactions(initial: CatalogState): CatalogState {
  let catalog = initial
  for (const entry of readPendingCatalogTransactions('user')) {
    const payload = entry.payload as Partial<UserOrderCatalogTransactionPayload & UserVoucherCatalogTransactionPayload>
    if (!payload.order?.id && !payload.voucherOrder?.id) { abortCatalogTransaction(entry.id); continue }
    if (entry.status === 'prepared') {
      const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, readCatalogState()?.revision ?? catalog.revision)
      if (!result) { abortCatalogTransaction(entry.id); continue }
      catalog = result.state
      if (!markCatalogTransactionStockApplied(entry.id)) continue
    }
    if (payload.voucherOrder) {
      if (!writePlatformVoucherOrder(payload.voucherOrder)) continue
      if (payload.commissionEntry && !writePlatformCommissionLedgerEntry(payload.commissionEntry)) continue
    } else if (!persistUserCatalogTransaction(payload as UserOrderCatalogTransactionPayload)) continue
    commitCatalogTransaction(entry.id)
  }
  return readCatalogState() || catalog
}

function syncPersistedFulfillment(orders: Record<string, COrder>): Record<string, COrder> {
  const supplierOrders = readPlatformOrders() || {}
  const next = { ...orders }
  Object.values(next).forEach((order) => {
    order.subOrders.forEach((sub) => {
      const supplierOrder = supplierOrders[`C-MALL-${sub.id}`]
      if (supplierOrder?.supplierOrderLink?.source === 'c-mall') next[order.id] = syncCSubOrderFromSupplier(next[order.id], sub, supplierOrder)
    })
  })
  return next
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    initialized: false, loading: false, withdrawalsTick: 0, distributorTick: 0, error: '', mockScenario: 'normal', farms: [], products: [], cProducts: [], inventoryRevision: 0, launchProductId: '', promoterId: '', promoterName: '', referralPromoterId: '', userId: '',
    cart: [], orders: [], addresses: [], commissionRecords: [], auth: { isLoggedIn: false, openid: '' }, checkoutError: '', entryChecked: false, entryRestricted: false
  }),
  getters: {
    distributorProfiles: (state): Record<string, CDistributorProfile> => { void state.distributorTick; return readCDistributorProfiles() || {} },
    level: (state): CUserLevel => { void state.distributorTick; return (readCDistributorProfiles()?.[state.userId]?.status === 'active' ? readCDistributorProfiles()?.[state.userId]?.level : 'normal') || 'normal' },
    currentDistributor: (state) => {
      void state.distributorTick
      const profile = readCDistributorProfiles()?.[state.userId]
      return profile && profile.status === 'active' ? profile : null
    },
    priceFor: (state) => {
      void state.distributorTick
      const userId = state.userId
      return (sku: CProductSku, level?: CUserLevel) => {
      const profile = readCDistributorProfiles()?.[userId]
      const resolved = level || (profile?.status === 'active' ? profile.level : 'normal')
      return cPriceForSku(sku, resolved)
      }
    },
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => Math.round(state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100,
    cartHasUnavailable: (state) => state.cart.some((item) => item.unavailable),
    defaultAddress: (state) => state.addresses.find((item) => item.isDefault) || state.addresses[0] || null,
    vouchers: (state): VoucherOrder[] => Object.values(readPlatformVoucherOrders() || {}).filter((item) => item.userId === state.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    myCommissionRecords: (state) => {
      void state.distributorTick
      void state.distributorTick
      const profile = readCDistributorProfiles()?.[state.userId]
      const beneficiaryId = profile?.status === 'active' ? profile.promoterId : undefined
      return state.commissionRecords.filter((item) => item.beneficiaryId === beneficiaryId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    withdrawalRequests: (state): WithdrawalRequest[] => {
      void state.withdrawalsTick
      return Object.values(readPlatformWithdrawals() || {}).filter((item) => item.requesterType === 'user' && item.requesterId === state.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    availableCommission(): number {
      const available = this.myCommissionRecords.filter((item) => item.status === 'available').reduce((sum, item) => sum + item.amount, 0)
      const pending = this.withdrawalRequests.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
      return Math.max(0, round2(available - pending))
    },
    pendingCommission(): number { return Math.round(this.myCommissionRecords.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) * 100) / 100 }
  },
  actions: {
    paymentAttemptForOrder(orderId: string): PaymentAttempt | null {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return null
      return Object.values(readPaymentAttempts())
        .filter((attempt) => attempt.orderId === order.id && attempt.userId === order.userId && attempt.amount === order.amount)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
          || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          || right.operationId.localeCompare(left.operationId))[0] || null
    },
    async recoverConfirmedPaymentAttempt(attempt: PaymentAttempt) {
      if (attempt.status !== 'confirmed' || !attempt.providerTransactionId) return false
      try {
        const queried = await getPlatformProviders().payment.queryPayment({ operationId: attempt.operationId })
        if (queried.ok && queried.value?.status === 'confirmed' && queried.value.transactionId !== attempt.providerTransactionId) {
          this.checkoutError = '支付回执不一致，请联系客服'
          return false
        }
        if (queried.ok && queried.value?.status === 'failed') {
          this.checkoutError = '支付渠道未确认扣款，请稍后重试'
          return false
        }
      } catch {
        // 本地 confirmed 记录已持久化，渠道查询暂时不可用时仍按原回执恢复业务同步。
      }
      const queued = await ensureConfirmedPaymentRecoveryTask(attempt.operationId)
      if (!queued.ok) {
        this.checkoutError = queued.fatal ? '恢复记录写入失败，请停止继续操作' : queued.message
        return false
      }
      if (!queued.value) { this.checkoutError = '支付恢复任务无法读取'; return false }
      const recovered = await retryPlatformRecoveryTask(queued.value.id, `USER:${attempt.userId}`)
      if (!recovered.ok) {
        this.checkoutError = recovered.message || '支付结果同步失败，请重试'
        return false
      }
      const persisted = (readCOrders() || {})[attempt.orderId]
      const current = this.orders.find((order) => order.id === attempt.orderId)
      if (persisted && current) applyOrderSnapshot(current, persisted)
      this.checkoutError = ''
      return true
    },
    async reconcilePaymentAttempts() {
      let changed = false
      for (const order of this.orders) {
        const attempt = this.paymentAttemptForOrder(order.id)
        if (attempt?.status !== 'confirmed') continue
        if (await this.recoverConfirmedPaymentAttempt(attempt)) changed = true
      }
      return changed
    },
    seedDemoData() {
      if (!this.userId || this.mockScenario !== 'normal') return false
      const seededOrders = seedDemoUserOrders(this.userId)
      if (seededOrders) this.orders = Object.values(readCOrders() || {}).filter((item) => item.userId === this.userId)
      const seededDistributor = seedDemoUserDistributor(this.userId)
      if (seededDistributor) this.distributorTick += 1
      const seededCart = seedDemoUserCart(this.userId, this.mockScenario)
      if (seededCart) this.restoreSession()
      return seededOrders || seededDistributor || seededCart
    },
    applyCatalogState(catalog: CatalogState) {
      const products = normalizeCProducts(catalogProductsForAudience(catalog, 'user').map(catalogProductToCProduct))
      this.cProducts = products
      this.inventoryRevision = catalog.revision
      this.cart = this.cart.map((line) => {
        const sku = products.find((product) => product.id === line.productId)?.skus.find((candidate) => candidate.id === line.skuId)
        const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        return { ...line, stock: sku?.stock ?? 0, minimumOrderQuantity, unavailable: !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok }
      })
    },
    refreshCatalog() {
      const catalog = readCatalogState()
      if (catalog) this.applyCatalogState(catalog)
      return catalog
    },
    failStockConflict() {
      this.checkoutError = '库存已更新，请刷新后重试'
      return false
    },
    persistSession() {
      if (!this.userId) return false
      const cart = this.cart.map(({ stock: _stock, ...item }) => item)
      return writeCUserSession(this.userId, { cart, referralPromoterId: this.referralPromoterId })
    },
    restoreSession() {
      if (!this.userId) return
      const session = readCUserSession(this.userId)
      const restored: Array<CartLine | null> = session.cart.map((item): CartLine | null => {
        const product = this.cProducts.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        const quantity = Number(item.quantity)
        const amounts = [item.unitPrice, item.basePrice, item.level1Commission, item.level2Commission]
        if (!Number.isInteger(quantity) || quantity <= 0 || !amounts.every((amount) => Number.isFinite(amount) && amount >= 0) || !validLevel(item.lockedLevel)) return null
        const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? item.minimumOrderQuantity)
        if (!product || product.status !== 'active' || product.shippingType !== 'courier' || !sku || !Number.isFinite(sku.stock) || sku.stock < 0) return { ...item, quantity, stock: 0, minimumOrderQuantity, unavailable: true }
        return { ...item, quantity, stock: sku.stock, minimumOrderQuantity, unavailable: !validateCatalogSkuOrderQuantity(sku, quantity).ok }
      })
      this.cart = restored.filter((item): item is CartLine => item !== null)
      if (!this.referralPromoterId && session.referralPromoterId) this.referralPromoterId = session.referralPromoterId
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      if (!this.entryChecked) this.applyLaunch({})
      if (this.entryChecked && this.entryRestricted) {
        this.cProducts = []
        this.initialized = true
        return
      }
      this.loading = true; this.error = ''
      try {
        await getUserCommerceBootstrapPromise()
        const atomicRecoveryHandlers = createUserAtomicRecoveryHandlerRegistrations()
        const checkoutRecoveryHandler = atomicRecoveryHandlers.find((registration) => registration.key === USER_COMMERCE_RECOVERY_HANDLER_KEY)!.handler
        initializePlatformRecoveryHandlers([{
          key: USER_COMMERCE_RECOVERY_HANDLER_KEY,
          handler: {
            execute: (task, journal) => {
              if (task.handlerKey !== USER_COMMERCE_RECOVERY_HANDLER_KEY) return false
              if (isValidUserAtomicRecoveryJournal(journal, 'checkout')) return checkoutRecoveryHandler.execute(task, journal)
              return recoverUserCommerceJournal(journal)
            },
            readSnapshot: (task, journal) => task.handlerKey !== USER_COMMERCE_RECOVERY_HANDLER_KEY ? null : isValidUserAtomicRecoveryJournal(journal, 'checkout') ? checkoutRecoveryHandler.readSnapshot(task, journal) : readUserCommerceSnapshot(journal)
          }
        }, ...atomicRecoveryHandlers.filter((registration) => registration.key !== USER_COMMERCE_RECOVERY_HANDLER_KEY)])
        const data = await userRepository.loadDashboard(this.mockScenario)
        const catalog = readCatalogState() || { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: migrateLegacyCatalog(data.catalogStoreProducts, data.cProducts), appliedOperations: {} }
        const savedOrders = syncPersistedFulfillment(normalizeCOrders(readCOrders() || {}))
        const savedAddresses = normalizeCAddresses(readCAddresses() || {})
        const rawCommissionRecords = readPlatformJson<CCommissionAllocation[]>(PLATFORM_C_COMMISSIONS_STORAGE_KEY)
        const savedCommissionRecords = normalizeCCommissionRecords(Array.isArray(rawCommissionRecords) ? rawCommissionRecords : [])
        if (Object.values(readPlatformJournal()).some((entry) => entry.status === 'recovery-pending')) this.error = '存在待恢复数据，请联系管理员'
        this.$patch({
          farms: data.farms, products: data.products,
          orders: this.userId ? Object.values(savedOrders).filter((item) => item.userId === this.userId) : [],
          addresses: this.userId ? Object.values(savedAddresses).filter((item) => item.userId === this.userId) : [],
          commissionRecords: this.userId ? savedCommissionRecords : [], initialized: true
        })
        this.applyCatalogState(catalog)
        await this.reconcilePaymentAttempts()
        if (this.userId) await this.syncWithdrawals()
        if (this.userId) this.restoreSession()
      } catch (error) { this.error = error instanceof Error ? error.message : '数据加载失败' } finally { this.loading = false }
    },
    applyLaunch(query: Record<string, string | undefined>) {
      const savedName = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-promoter-name') : ''
      const savedPromoter = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-promoter-id') : ''
      this.launchProductId = query.product?.trim() || ''
      this.promoterName = query.promoterName || (typeof savedName === 'string' ? savedName : '') || ''
      if (!this.userId && this.auth.isLoggedIn && this.auth.openid) this.userId = resolveUserIdentity(this.auth.openid)
      const bound = this.userId ? readUserBindings()?.[this.userId] : undefined
      const requestedPromoter = query.promoter?.trim() || ''
      const storedPromoter = typeof savedPromoter === 'string' ? savedPromoter.trim() : ''
      const profiles = readCDistributorProfiles() || demoCDistributorProfiles
      const validRequestedPromoter = resolveDirectReferralChain(requestedPromoter, profiles) ? requestedPromoter : ''
      const validStoredPromoter = this.auth.isLoggedIn && storedPromoter && resolveDirectReferralChain(storedPromoter, profiles) ? storedPromoter : ''
      this.promoterId = bound?.status === 'bound' ? bound.promoterId || '' : validRequestedPromoter || validStoredPromoter
      this.referralPromoterId = this.promoterId
      this.entryChecked = true
      this.entryRestricted = !this.promoterId
      if (this.promoterId && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-id', this.promoterId)
      if (this.promoterName && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-name', this.promoterName)
    },
    refreshFulfillment() {
      const synced = syncPersistedFulfillment(normalizeCOrders(readCOrders() || {}))
      const currentOrders = new Map(this.orders.map((item) => [item.id, item]))
      this.orders = this.userId ? Object.values(synced).filter((item) => item.userId === this.userId).map((snapshot) => {
        const current = currentOrders.get(snapshot.id)
        if (!current) return snapshot
        applyOrderSnapshot(current, snapshot)
        return current
      }) : []
      return this.orders
    },
    async syncFulfillmentProjection() {
      const result = await runLockedPlatformCollectionTask({
        collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY],
        execute: () => {
          const persisted = normalizeCOrders(readCOrders() || {})
          const synced = syncPersistedFulfillment(persisted)
          if (JSON.stringify(synced) === JSON.stringify(persisted)) return false
          return writeCOrders(synced)
        }
      })
      if (!result.ok || result.value !== true) {
        if (!result.ok) this.error = '履约同步失败，请重试'
        return false
      }
      this.refreshFulfillment()
      return true
    },
    async refreshSharedState() {
      this.refreshCatalog()
      this.products = readStorePackageProjection()
      const persisted = normalizeCOrders(readCOrders() || {})
      const synced = syncPersistedFulfillment(persisted)
      const addresses = normalizeCAddresses(readCAddresses() || {})
      this.orders = this.userId ? Object.values(synced).filter((item) => item.userId === this.userId) : []
      this.addresses = this.userId ? Object.values(addresses).filter((item) => item.userId === this.userId) : []
      this.commissionRecords = this.userId ? readCCommissionRecords() || [] : []
      await this.reconcilePaymentAttempts()
      if (this.userId) await this.syncWithdrawals()
      if (this.userId) this.restoreSession()
      return this.orders
    },
    async wechatLogin() { this.persistSession(); const { openid } = await simulateWechatLogin(); this.auth = { isLoggedIn: true, openid }; this.userId = resolveUserIdentity(openid); this.cart = []; this.orders = []; this.addresses = []; this.commissionRecords = []; this.checkoutError = ''; return { openid, userId: this.userId } },
    setReferral(promoterId: string) {
      const value = promoterId.trim()
      const bound = this.userId ? readUserBindings()?.[this.userId] : undefined
      if (bound?.status === 'bound') return bound.promoterId === value
      if (!resolveDirectReferralChain(value, readCDistributorProfiles() || demoCDistributorProfiles)) return false
      this.referralPromoterId = value; this.promoterId = value; this.persistSession()
      this.entryChecked = true; this.entryRestricted = false
      return true
    },
    setDemoDistributorLevel(level: CUserLevel) {
      const userId = this.userId || (this.userId = 'U-DEMO-L1')
      const list = { ...(readCDistributorProfiles() || {}) }
      if (level === 'normal') delete list[userId]
      else if (level === 'level1') list[userId] = { userId, promoterId: 'T001', level: 'level1', status: 'active' }
      else list[userId] = { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' }
      writeCDistributorProfiles(list)
      this.entryChecked = true
      this.entryRestricted = false
      this.distributorTick = (this.distributorTick || 0) + 1
    },
    priceForSku(sku: CProductSku) { return cPriceForSku(sku, this.level) },
    addToCart(productId: string, skuId: string, quantity?: number) {
      const product = this.cProducts.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (!product || !sku || product.status !== 'active' || product.shippingType !== 'courier' || !Number.isFinite(sku.stock) || sku.stock < 0 || sku.basePrice < 0 || sku.level1Commission < 0 || sku.level2Commission < 0) { this.checkoutError = '商品配置异常，暂不可购买'; return false }
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
      const increment = quantity === undefined ? (line ? 1 : initialCatalogOrderQuantity(minimumOrderQuantity)) : quantity
      const nextQuantity = (line?.quantity || 0) + increment
      const validation = validateCatalogSkuOrderQuantity(sku, nextQuantity)
      if (!validation.ok) {
        this.checkoutError = validation.code === 'below_minimum_order_quantity' || sku.stock < minimumOrderQuantity ? `${product.name}（${sku.name}）库存不足或购买数量未达要求` : `${product.name}（${sku.name}）库存不足`
        return false
      }
      if (line) { line.quantity = nextQuantity; line.minimumOrderQuantity = minimumOrderQuantity; line.unavailable = false }
      else this.cart.push({ productId, skuId, name: product.name, skuName: sku.name, image: sku.image || product.image, quantity: nextQuantity, minimumOrderQuantity, unitPrice: cPriceForSku(sku, this.level), basePrice: sku.basePrice, level1Commission: sku.level1Commission, level2Commission: sku.level2Commission, supplierId: product.supplierId, stock: sku.stock, lockedLevel: this.level, unavailable: false })
      this.persistSession()
      this.checkoutError = ''; return true
    },
    changeCart(productId: string, skuId: string, delta: number) {
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      const sku = this.cProducts.find((item) => item.id === productId)?.skus.find((item) => item.id === skuId)
      if (!line || !Number.isInteger(delta) || delta === 0 || delta > 0 && (!sku || sku.stock < 0 || line.quantity + delta > sku.stock)) { this.checkoutError = '库存不足'; return false }
      line.quantity += delta
      if (line.quantity <= 0) this.removeFromCart(productId, skuId)
      else {
        line.stock = sku?.stock ?? 0
        line.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        line.unavailable = !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
        this.persistSession()
      }
      this.checkoutError = ''; return true
    },
    removeFromCart(productId: string, skuId: string) { this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId)); this.persistSession() },
    setAddress(input: Omit<CAddress, 'id' | 'userId'> & { id?: string }) {
      if (!this.userId || !input.receiver.trim() || !/^1[3-9]\d{9}$/.test(input.phone.trim()) || !input.region.trim() || !input.detail.trim()) return false
      const address: CAddress = { ...input, id: input.id || createId('ADDR'), userId: this.userId, receiver: input.receiver.trim(), phone: input.phone.trim(), region: input.region.trim(), detail: input.detail.trim(), isDefault: input.isDefault, updatedAt: new Date().toISOString() }
      const nextAddresses = cloneSeed(this.addresses)
      if (address.isDefault) nextAddresses.forEach((item) => { item.isDefault = false })
      if (nextAddresses.some((item) => item.id === address.id)) {
        const index = nextAddresses.findIndex((item) => item.id === address.id)
        nextAddresses[index] = address
      } else nextAddresses.unshift(address)
      if (!nextAddresses.some((item) => item.isDefault) && nextAddresses.length) nextAddresses[0].isDefault = true
      const saved = persistUserAddresses(this.userId, nextAddresses, { defaultId: address.isDefault ? address.id : undefined })
      if (!saved) return false
      this.addresses = saved
      return true
    },
    setDefaultAddress(id: string) {
      if (!this.addresses.some((item) => item.id === id)) return false
      const nextAddresses = this.addresses.map((item) => ({ ...item, isDefault: item.id === id }))
      const saved = persistUserAddresses(this.userId, nextAddresses, { defaultId: id })
      if (!saved) return false
      this.addresses = saved
      return true
    },
    removeAddress(id: string) {
      const removed = this.addresses.find((item) => item.id === id)
      if (!removed) return false
      const nextAddresses = this.addresses.filter((item) => item.id !== id)
      if (removed.isDefault && nextAddresses.length) nextAddresses.splice(0, nextAddresses.length, ...nextAddresses.map((item, index) => ({ ...item, isDefault: index === 0 })))
      const saved = persistUserAddresses(this.userId, nextAddresses, { removedIds: [id], defaultId: removed.isDefault ? nextAddresses[0]?.id : undefined })
      if (!saved) return false
      this.addresses = saved
      return true
    },
    async submitOrder(remark = '', selectedKeys?: string[]) {
      this.checkoutError = ''; const address = this.defaultAddress
      const checkoutCart = selectedKeys?.length ? this.cart.filter((line) => selectedKeys.includes(`${line.productId}-${line.skuId}`)) : this.cart
      if (this.entryChecked && this.entryRestricted) { this.checkoutError = '请通过有效团长分享链接进入商城'; return false }
      if (!this.userId || !checkoutCart.length) { this.checkoutError = selectedKeys?.length ? '请先选择要结算的商品' : '购物车为空'; return false }
      if (!address) { this.checkoutError = '请先设置收货地址'; return false }
      const unavailableSupplier = unavailableSupplierName(checkoutCart.map((item) => item.supplierId))
      if (unavailableSupplier) { this.checkoutError = `${unavailableSupplier}已暂停接单，请选择其他商品`; return false }
      const catalog = readCatalogState()
      if (!catalog) return this.failStockConflict()
      const revisionChanged = catalog.revision !== this.inventoryRevision
      const products = normalizeCProducts(catalogProductsForAudience(catalog, 'user').map(catalogProductToCProduct))
      const invalidLine = checkoutCart.find((line) => {
        const product = products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || product.status !== 'active' || product.shippingType !== 'courier' || !sku || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.basePrice) || line.basePrice < 0 || !Number.isFinite(line.level1Commission) || line.level1Commission < 0 || !Number.isFinite(line.level2Commission) || line.level2Commission < 0 || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      })
      if (invalidLine) {
        const product = products.find((item) => item.id === invalidLine.productId)
        const sku = product?.skus.find((item) => item.id === invalidLine.skuId)
        const validation = sku ? validateCatalogSkuOrderQuantity(sku, invalidLine.quantity) : null
        if (revisionChanged) {
          invalidLine.stock = sku?.stock ?? 0
          invalidLine.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? invalidLine.minimumOrderQuantity)
          invalidLine.unavailable = true
        }
        this.checkoutError = !product || product.status !== 'active' || product.shippingType !== 'courier' ? `${invalidLine.name}已下架或不支持快递配送` : !sku ? `${invalidLine.name}（${invalidLine.skuName}）规格已失效` : validation && !validation.ok && (validation.code === 'below_minimum_order_quantity' || sku.stock < normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)) ? `${invalidLine.name}（${invalidLine.skuName}）库存不足或购买数量未达要求` : `${invalidLine.name}（${invalidLine.skuName}）库存不足`
        return false
      }
      if (revisionChanged) return this.failStockConflict()
      const items = checkoutCart.map(({ stock: _stock, lockedLevel: _level, unavailable: _unavailable, ...item }) => ({ ...item, minimumOrderQuantity: normalizeMinimumOrderQuantity(item.minimumOrderQuantity) }))
      const id = createId('CO')
      const groups = splitCOrderItems(items)
      const chain = resolveDirectReferralChain(this.referralPromoterId, readCDistributorProfiles() || demoCDistributorProfiles) || {}
      const checkoutLevel = checkoutCart[0]?.lockedLevel || this.level
      const subOrders = groups.map((group) => {
        const product = this.cProducts.find((item) => item.supplierId === group.supplierId)
        return { id: createId('CSO'), supplierId: group.supplierId, supplierName: product?.supplierName || group.supplierId, items: group.items, amount: Math.round(group.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100, status: 'pending_payment' as const, logistics: [{ time: nowString(), title: '订单已提交', detail: '等待模拟支付' }] }
      })
      const commissionAllocations = groups.flatMap((group, index) => (['normal', 'level2', 'level1'] as CUserLevel[]).flatMap((level) => {
        const levelItems = group.items.filter((item) => checkoutCart.find((line) => line.productId === item.productId && line.skuId === item.skuId)?.lockedLevel === level)
        return levelItems.length ? allocateCCommissions(levelItems, chain, level, id, subOrders[index].id) : []
      }))
      const order: COrder = { id, userId: this.userId, level: checkoutLevel, address: cloneSeed(address), amount: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100, items, subOrders, distributorChain: [chain.level1Id, chain.level2Id].filter((item): item is string => !!item), commissionAllocations, status: 'pending_payment', createdAt: nowString(), remark: remark.trim() || undefined }
      const operationId = `${order.id}:reserve`
      const inventoryChanges = checkoutCart.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const bound = readUserBindings()?.[this.userId]
      const payload: UserOrderCatalogTransactionPayload = {
        order,
        binding: this.referralPromoterId && chain.level2Id && (!bound || bound.status !== 'bound')
          ? { userId: this.userId, promoterId: this.referralPromoterId, status: 'bound', boundAt: nowString() }
          : undefined
      }
      const stable = readStableUserAtomicSnapshot('checkout', this.userId) as { snapshot: UserAtomicSnapshot; revisions: Record<string, number> } | null
      if (!stable || stable.snapshot.catalog?.revision !== catalog.revision) return this.failStockConflict()
      const original = stable.snapshot
      const targetCatalog = cloneSeed(original.catalog!)
      for (const change of inventoryChanges) {
        const targetSku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((sku) => sku.id === change.skuId)
        const quantity = -change.quantity
        if (!targetSku || !validateCatalogSkuOrderQuantity(targetSku, quantity).ok) return this.failStockConflict()
        targetSku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = { id: operationId, action: 'reserve', requestFingerprint: JSON.stringify({ action: 'reserve', changes: inventoryChanges }), changes: [], appliedAt: nowString() }
      const commissionMap = new Map((original.commissions || []).map((item) => [item.id, item]))
      order.commissionAllocations.forEach((item) => commissionMap.set(item.id, item))
      const target: UserAtomicSnapshot = {
        ...original,
        catalog: targetCatalog,
        orders: { ...(original.orders || {}), [order.id]: order },
        commissions: [...commissionMap.values()],
        bindings: payload.binding ? { ...(original.bindings || {}), [payload.binding.userId]: payload.binding } : original.bindings
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: userAtomicCollections('checkout'),
        original,
        target,
        recoveryHandlerKey: USER_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: 'user-checkout-snapshot-v1',
        revisionChecks: userAtomicCollections('checkout').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'catalog', apply: () => writeCatalogState(target.catalog!, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, target.catalog!.revision) },
          { key: 'c-orders', apply: () => writeCOrders(target.orders!), rollback: () => writeCOrders(original.orders!) },
          { key: 'c-commissions', apply: () => writeCCommissionRecords(target.commissions!), rollback: () => writeCCommissionRecords(original.commissions!) },
          { key: 'bindings', apply: () => writeUserBindings(target.bindings!), rollback: () => writeUserBindings(original.bindings!) }
        ]
      })
      if (!result.ok) {
        if (result.code === 'revision_conflict') { this.checkoutError = '库存已更新，请刷新后重试'; return false }
        this.checkoutError = result.fatal ? '订单事务恢复失败，请联系平台处理' : '订单处理中，请刷新后重试'
        return false
      }
      this.applyCatalogState(targetCatalog)
      this.orders.unshift(order)
      this.commissionRecords = target.commissions!
      const checkedOutKeys = new Set(checkoutCart.map((line) => `${line.productId}-${line.skuId}`))
      this.cart = this.cart.filter((line) => !checkedOutKeys.has(`${line.productId}-${line.skuId}`))
      this.persistSession(); return true
    },
    async payOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'pending_payment') return false
      const stable = readStableUserAtomicSnapshot('payment', order.userId || this.userId) as { snapshot: UserAtomicSnapshot; revisions: Record<string, number> } | null
      const persistedOrder = stable?.snapshot.orders?.[id]
      if (!stable || !persistedOrder || persistedOrder.status !== 'pending_payment') { this.checkoutError = '订单数据已更新，请重试'; return false }
      const unavailableSupplier = unavailableSupplierName(persistedOrder.subOrders.map((item) => item.supplierId))
      if (unavailableSupplier) { this.checkoutError = `${unavailableSupplier}已暂停接单，暂时无法支付`; return false }
      const businessOperationId = `payment:${persistedOrder.id}`
      const begun = await beginPaymentAttempt({ orderId: persistedOrder.id, userId: persistedOrder.userId, amount: persistedOrder.amount })
      if (!begun.ok) {
        this.checkoutError = begun.code === 'ownership_conflict' ? '支付记录归属异常，请联系客服' : '支付记录无法保存，请稍后重试'
        return false
      }
      let attempt = begun.attempt
      const attemptOperationId = attempt.operationId
      if (attempt.status === 'confirmed') return this.recoverConfirmedPaymentAttempt(attempt)
      let transactionId = attempt.status === 'synchronized' ? attempt.providerTransactionId : undefined
      const saveAttempt = async (status: PaymentAttempt['status'], patch: Partial<PaymentAttempt> = {}) => {
        attempt = { ...attempt, ...patch, status, updatedAt: new Date(Math.max(Date.now(), Date.parse(attempt.updatedAt))).toISOString() }
        return transitionPaymentAttempt(attempt)
      }

      const applyQueryResult = async () => {
        try {
          const queried = await getPlatformProviders().payment.queryPayment({ operationId: attemptOperationId })
          if (queried.ok && queried.value?.status === 'confirmed' && queried.value.transactionId) {
            transactionId = queried.value.transactionId
            if (await saveAttempt('confirmed', { providerTransactionId: transactionId, failureReason: undefined })) return true
            this.checkoutError = '支付结果确认中，请稍后查询'
            return false
          }
          if (queried.ok && queried.value?.status === 'failed') {
            await saveAttempt('failed', { failureReason: '支付失败', providerTransactionId: undefined })
            this.checkoutError = '支付失败，请重新发起'
            return false
          }
        } catch {
          // 保留 unknown，稍后仍可按同一 operationId 查询。
        }
        await saveAttempt('unknown', { failureReason: undefined, providerTransactionId: undefined })
        this.checkoutError = '支付结果确认中，请稍后查询'
        return false
      }

      if (!transactionId && attempt.status === 'unknown' && !await applyQueryResult()) return false
      if (!transactionId) {
        try {
          const payment = await getPlatformProviders().payment.createPayment({ orderId: persistedOrder.id, amount: persistedOrder.amount, operationId: attemptOperationId })
          if (!payment.ok || !payment.value?.transactionId) {
            const message = payment.ok ? '支付失败，请稍后重试' : payment.message
            await saveAttempt('failed', { failureReason: message, providerTransactionId: undefined })
            this.checkoutError = message
            return false
          }
          transactionId = payment.value.transactionId
          if (!await saveAttempt('confirmed', { providerTransactionId: transactionId, failureReason: undefined })) { this.checkoutError = '支付结果确认中，请稍后查询'; return false }
        } catch {
          if (!await applyQueryResult()) return false
        }
      }
      if (!transactionId) return false
      const original = stable.snapshot
      let target = reusableUserAtomicTarget(businessOperationId, original, 'payment')
      if (!target) {
        const nextOrder = cloneSeed(persistedOrder)
        nextOrder.paidAt = nowString()
        nextOrder.providerTransactionId = transactionId
        const nextPlatformOrders = cloneSeed(original.supplierOrders || {})
        for (const sub of nextOrder.subOrders) {
          sub.status = 'paid'
          sub.logistics.push({ time: nowString(), title: '支付成功', detail: '订单已进入供应商备货流程' }, { time: nowString(), title: '等待发货', detail: '供应商准备发货，暂无运单号' })
          const published = publishCSubOrderToSupplier(nextOrder, sub)
          nextPlatformOrders[published.id] = published
        }
        const nextLedger = cloneSeed(original.ledger || {})
        for (const record of nextOrder.commissionAllocations) {
          const subOrder = nextOrder.subOrders.find((item) => item.id === record.subOrderId)
          const sourceFarmIds = new Set(subOrder?.items.flatMap((item) => this.products.find((product) => product.id === item.productId)?.farmIds || []) || [])
          const entry = { id: 'CC-' + record.id, sourceOrderId: persistedOrder.id, sourceSubOrderId: record.subOrderId, beneficiaryType: 'promoter', beneficiaryId: record.beneficiaryId, role: record.beneficiaryLevel || 'promoter', farmId: sourceFarmIds.size === 1 ? [...sourceFarmIds][0] : undefined, amount: record.amount, status: 'pending', createdAt: record.createdAt || nowString() } as CommissionLedgerEntry
          nextLedger[entry.id] = entry
        }
        nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
        target = { ...original, orders: { ...original.orders!, [nextOrder.id]: nextOrder }, supplierOrders: nextPlatformOrders, ledger: nextLedger }
      }
      const result = await runLockedPlatformTransaction({
        operationId: businessOperationId,
        collections: userAtomicCollections('payment'),
        original,
        target,
        recoveryHandlerKey: USER_PAYMENT_RECOVERY_HANDLER_KEY,
        recoverySchema: 'user-payment-snapshot-v1',
        revisionChecks: userAtomicCollections('payment').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'platform-orders', apply: () => writePlatformOrders(target.supplierOrders!), rollback: () => writePlatformOrders(original.supplierOrders!) },
          { key: 'commission-ledger', apply: () => writePlatformCommissionLedger(target.ledger!), rollback: () => writePlatformCommissionLedger(original.ledger!) },
          { key: 'c-orders', apply: () => writeCOrders(target.orders!), rollback: () => writeCOrders(original.orders!) }
        ]
      })
      if (!result.ok) {
        const queued = await ensureConfirmedPaymentRecoveryTask(attempt.operationId)
        this.checkoutError = !queued.ok && queued.fatal ? '恢复记录写入失败，请停止继续操作' : result.fatal ? '支付事务恢复失败，请联系平台处理' : '支付结果同步失败，请重试'
        return false
      }
      applyOrderSnapshot(order, target.orders![id])
      const synchronized = await saveAttempt('synchronized', { providerTransactionId: transactionId, failureReason: undefined })
      if (!synchronized) {
        const queued = await ensureConfirmedPaymentRecoveryTask(attempt.operationId)
        this.checkoutError = !queued.ok && queued.fatal ? '恢复记录写入失败，请停止继续操作' : '支付已成功，支付记录待恢复'
      } else this.checkoutError = ''
      return true
    },
    async buyLivePackage(productId: string, skuId: string, quantity?: number) {
      const product = this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (!this.userId || !product || product.productType !== 'package' || !sku) {
        this.checkoutError = '套餐已下架或规格失效'
        return false
      }
      const catalog = readCatalogState()
      const catalogProduct = catalog?.products.find((item) => item.id === productId && item.status === 'active' && item.productType === 'package')
      const catalogSku = catalogProduct?.skus.find((item) => item.id === skuId && item.status !== 'retired')
      if (!catalog || !catalogProduct || !catalogSku) { this.checkoutError = '套餐已下架或规格失效'; return false }
      if (catalog.revision !== this.inventoryRevision) this.applyCatalogState(catalog)
      const minimumOrderQuantity = normalizeMinimumOrderQuantity(catalogSku.minimumOrderQuantity)
      const qty = quantity === undefined ? initialCatalogOrderQuantity(minimumOrderQuantity) : Number(quantity)
      const validation = validateCatalogSkuOrderQuantity(catalogSku, qty)
      if (!validation.ok) {
        this.checkoutError = validation.code === 'below_minimum_order_quantity' || catalogSku.stock < minimumOrderQuantity ? '套餐库存不足或购买数量未达要求' : '套餐库存不足'
        return false
      }
      const amount = round2(sku.price * qty)
      const intent = await packagePurchaseIntent({ ownerUserId: this.userId, productId, skuId, quantity: qty, amount })
      if (!intent) { this.checkoutError = '套餐订单创建失败，请重试'; return false }
      const operationId = intent.operationId
      const id = operationId.slice('package-payment:'.length)
      const lockedAmount = intent.amount
      let payment
      try {
        payment = await getPlatformProviders().payment.createPayment({ orderId: id, amount: lockedAmount, operationId })
      } catch {
        this.checkoutError = '支付结果待确认，请重试查询'
        return false
      }
      if (!payment.ok) {
        if (!await deletePackagePurchaseIntent(intent)) {
          this.checkoutError = '支付失败记录未清理，请停止重试并联系平台'
          return false
        }
        this.checkoutError = payment.message
        return false
      }
      if (!payment.value?.transactionId) { this.checkoutError = '支付失败，请稍后重试'; return false }
      const promoterId = this.referralPromoterId || readUserBindings()?.[this.userId]?.promoterId || this.promoterId || undefined
      const voucher: VoucherOrder = {
        id, userId: this.userId, promoterId, farmId: product.farmIds[0] || 'F001',
        productId, skuId, quantity: qty, amount: lockedAmount, status: 'paid', createdAt: nowString(), providerTransactionId: payment.value.transactionId
      }
      const rate = product.promoterCommissionRate ?? product.commissionRate ?? 0
      const commissionEntry: CommissionLedgerEntry | undefined = promoterId && Number(rate) > 0 ? {
        id: id + ':commission', sourceOrderId: id, beneficiaryType: 'promoter', beneficiaryId: promoterId,
        farmId: voucher.farmId, role: 'promoter', amount: round2(lockedAmount * Number(rate) / 100), status: 'pending', createdAt: nowString()
      } : undefined
      const inventoryChanges = [{ productId, skuId, quantity: -qty }]
      const stable = readStableUserAtomicSnapshot('package', this.userId) as { snapshot: UserAtomicSnapshot; revisions: Record<string, number> } | null
      if (!stable || stable.snapshot.catalog?.revision !== catalog.revision) return this.failStockConflict()
      const original = stable.snapshot
      let target = reusableUserAtomicTarget(operationId, original, 'package')
      if (!target) {
        const targetCatalog = cloneSeed(original.catalog!)
        const targetSku = targetCatalog.products.find((item) => item.id === productId)?.skus.find((item) => item.id === skuId)
        if (!targetSku || !validateCatalogSkuOrderQuantity(targetSku, qty).ok) return this.failStockConflict()
        targetSku.stock -= qty
        targetCatalog.revision += 1
        targetCatalog.appliedOperations ||= {}
        targetCatalog.appliedOperations[operationId] = { id: operationId, action: 'reserve', requestFingerprint: JSON.stringify({ action: 'reserve', changes: inventoryChanges }), changes: [], appliedAt: nowString() }
        target = {
          ...original,
          catalog: targetCatalog,
          vouchers: { ...(original.vouchers || {}), [voucher.id]: voucher },
          ledger: commissionEntry ? { ...(original.ledger || {}), [commissionEntry.id]: commissionEntry } : original.ledger,
          intents: Object.fromEntries(Object.entries(original.intents || {}).filter(([key]) => key !== operationId))
        }
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: userAtomicCollections('package'),
        original,
        target,
        recoveryHandlerKey: USER_PACKAGE_RECOVERY_HANDLER_KEY,
        recoverySchema: 'user-package-snapshot-v1',
        revisionChecks: userAtomicCollections('package').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'catalog', apply: () => writeCatalogState(target.catalog!, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, target.catalog!.revision) },
          { key: 'vouchers', apply: () => writePlatformVoucherOrders(target.vouchers!), rollback: () => writePlatformVoucherOrders(original.vouchers!) },
          { key: 'commission-ledger', apply: () => writePlatformCommissionLedger(target.ledger!), rollback: () => writePlatformCommissionLedger(original.ledger!) },
          { key: 'purchase-intent', apply: () => writeUserCommercePurchaseIntents(target.intents!), rollback: () => writeUserCommercePurchaseIntents(original.intents!) }
        ]
      })
      if (!result.ok) { this.checkoutError = result.fatal ? '套餐事务恢复失败，请联系平台处理' : '套餐订单处理中，请刷新后重试'; return false }
      this.applyCatalogState(target.catalog!)
      this.checkoutError = ''
      return true
    },
    shipSubOrder(id: string, subOrderId: string) {
      const order = this.orders.find((item) => item.id === id)
      const sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || sub.status !== 'paid' || !!readPlatformOrders()?.[`C-MALL-${sub.id}`]) return false
      const nextOrder = cloneSeed(order)
      const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
      nextSub.status = 'shipped'; nextSub.courier = '顺丰速运'; nextSub.trackingNo = `SF${String(Date.now()).slice(-10)}`
      nextSub.logistics.push({ time: nowString(), title: '商品已发货', detail: `${nextSub.courier} ${nextSub.trackingNo} 已揽收` }, { time: nowString(), title: '运输中', detail: '包裹已进入模拟运输' })
      nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
      if (!writeCOrder(nextOrder)) return false
      applyOrderSnapshot(order, nextOrder)
      return true
    },
    async confirmSubOrderReceipt(id: string, subOrderId: string) {
      let order = this.orders.find((item) => item.id === id)
      let sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || sub.status !== 'shipped') return false
      const visibleOrder = order
      const ownerUserId = order.userId || this.userId
      await this.syncFulfillmentProjection()
      order = this.orders.find((item) => item.id === id)
      sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || sub.status !== 'shipped') return false
      const operationId = `receipt:${id}:${subOrderId}`
      const stable = readStableUserCommerceSnapshot('receipt', ownerUserId)
      if (!stable) { this.error = '订单数据已更新，请重试'; return false }
      const original = stable.snapshot
      const persistedOrder = original.orders[id]
      const persistedSub = persistedOrder?.subOrders.find((item) => item.id === subOrderId)
      if (!persistedOrder || !persistedSub || persistedSub.status !== 'shipped') return false
      let target = reusableUserTarget(operationId, original)
      if (!target) {
        const nextOrder = cloneSeed(persistedOrder)
        const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
        nextSub.status = 'received'; nextSub.logistics.push({ time: nowString(), title: '已确认收货', detail: '快递商品已签收' })
        nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status === 'pending').forEach((item) => { item.status = 'available' })
        nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
        const commissionMap = new Map(original.commissions.map((item) => [item.id, item]))
        nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id).forEach((item) => commissionMap.set(item.id, item))
        const supplierOrder = original.supplierOrders![`C-MALL-${nextSub.id}`]
        const confirmedSupplierOrder = supplierOrder ? confirmCSubOrderReceiptAtSupplier(supplierOrder) : null
        target = {
          ...original,
          orders: { ...original.orders, [nextOrder.id]: nextOrder },
          commissions: [...commissionMap.values()],
          supplierOrders: confirmedSupplierOrder ? { ...original.supplierOrders!, [confirmedSupplierOrder.id]: confirmedSupplierOrder } : original.supplierOrders
        }
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: userCommerceCollections('receipt'),
        original,
        target,
        recoveryHandlerKey: USER_COMMERCE_RECOVERY_HANDLER_KEY, recoverySchema: USER_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: userCommerceCollections('receipt').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'c-orders', apply: () => writeCOrders(target!.orders), rollback: () => writeCOrders(original.orders) },
          { key: 'c-commissions', apply: () => writeCCommissionRecords(target!.commissions), rollback: () => writeCCommissionRecords(original.commissions) },
          { key: 'platform-orders', apply: () => writePlatformOrders(target!.supplierOrders!), rollback: () => writePlatformOrders(original.supplierOrders!) }
        ]
      })
      if (!result.ok) { this.error = result.fatal ? '确认收货事务恢复失败，请联系平台处理' : '数据未完成，请重试'; return false }
      applyOrderSnapshot(order, target.orders[id])
      if (visibleOrder !== order) applyOrderSnapshot(visibleOrder, target.orders[id])
      this.commissionRecords = target.commissions
      return true
    },
    /** 提交提现申请；返回 pending/duplicate/invalid/insufficient/false，不再按旧 boolean 解释。 */
    async withdrawCommission(method = '微信提现'): Promise<'pending' | 'duplicate' | 'invalid' | 'insufficient' | false> {
      if (!this.userId) return 'invalid' as const
      const userId = this.userId
      const result = await runLockedPlatformCollectionTask({
        collections: [PLATFORM_WITHDRAWALS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_DISTRIBUTORS_STORAGE_KEY],
        execute: () => {
          const withdrawals = readPlatformWithdrawals() || {}
          const records = readCCommissionRecords() || []
          const promoterId = (readCDistributorProfiles() || {})[userId]?.promoterId || ''
          const hasActiveRequest = Object.values(withdrawals).some((item) => {
            if (item.requesterType !== 'user' || item.requesterId !== userId) return false
            if (item.status === 'pending') return true
            return item.status === 'approved' && !records.some((record) => (record as CommissionWithWithdrawalKeys).withdrawalRequestKeys?.includes(item.requestKey))
          })
          if (hasActiveRequest) return 'duplicate' as const
          const amount = round2(records.filter((item) => item.beneficiaryId === promoterId && item.status === 'available').reduce((sum, item) => sum + item.amount, 0))
          if (!Number.isFinite(amount) || amount <= 0) return 'invalid' as const
          const id = createId('WD-USER')
          const request: WithdrawalRequest = { id, requesterType: 'user', requesterId: userId, amount, method, status: 'pending', requestKey: id, createdAt: nowString() }
          return writePlatformWithdrawal(request) ? 'pending' as const : false
        }
      })
      if (!result.ok) return false
      if (result.value === 'pending' || result.value === 'duplicate') this.withdrawalsTick += 1
      return result.value ?? false
    },
    async syncWithdrawals() {
      if (!this.userId) return false
      const stable = readStableUserCommerceSnapshot('withdrawal', this.userId)
      if (!stable) { this.error = '提现数据已更新，请重试'; return false }
      const original = stable.snapshot
      const requests = Object.values(original.withdrawals || {}).filter((item) => item.requesterType === 'user' && item.requesterId === this.userId && item.status === 'approved').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const originalRecords = original.commissions
      const records = cloneSeed(originalRecords) as CommissionWithWithdrawalKeys[]
      const nextOrders = cloneSeed(original.orders)
      let changed = false
      const consumedRequestKeys: string[] = []
      for (const request of requests) {
        const marked = records.some((item) => (item as CommissionWithWithdrawalKeys).withdrawalRequestKeys?.includes(request.requestKey))
        if (marked) continue
        const available = records.filter((item) => item.beneficiaryId === (readCDistributorProfiles()?.[this.userId]?.promoterId || '') && item.status === 'available').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const total = round2(available.reduce((sum, item) => sum + item.amount, 0))
        if (total < request.amount) { this.error = `提现 ${request.id} 的可用佣金不足`; continue }
        let remaining = request.amount
        const additions: CommissionWithWithdrawalKeys[] = []
        for (const item of available) {
          if (remaining <= 0) break
          const current = records.find((candidate) => candidate.id === item.id) as CommissionWithWithdrawalKeys | undefined
          if (!current) continue
          const consume = Math.min(current.amount, remaining)
          if (consume >= current.amount) {
            current.status = 'withdrawn'
            current.withdrawalRequestKeys = [...(current.withdrawalRequestKeys || []), request.requestKey]
          } else {
            current.amount = round2(current.amount - consume)
            const withdrawn: CommissionWithWithdrawalKeys = { ...current, id: `${current.id}:withdrawn:${request.requestKey}`, amount: round2(consume), status: 'withdrawn', withdrawalRequestKeys: [request.requestKey] }
            additions.push(withdrawn)
          }
          remaining = round2(remaining - consume)
        }
        records.push(...additions)
        changed = true
        consumedRequestKeys.push(request.requestKey)
      }
      if (!changed) return false
      Object.values(nextOrders).forEach((order) => {
        let orderChanged = false
        const allocations = [...order.commissionAllocations]
        records.filter((item) => item.orderId === order.id).forEach((record) => {
          const index = allocations.findIndex((item) => item.id === record.id)
          if (index >= 0) { allocations[index] = { ...record }; orderChanged = true }
          else if (record.status === 'withdrawn') { allocations.push({ ...record }); orderChanged = true }
        })
        if (orderChanged) order.commissionAllocations = allocations
      })
      const result = await runLockedPlatformTransaction({
        operationId: `withdrawal-sync:${this.userId}:${consumedRequestKeys.join(',')}`,
        collections: userCommerceCollections('withdrawal'),
        original,
        target: { ...original, orders: nextOrders, commissions: records },
        recoveryHandlerKey: USER_COMMERCE_RECOVERY_HANDLER_KEY, recoverySchema: USER_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: userCommerceCollections('withdrawal').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'c-commissions', apply: () => writeCCommissionRecords(records), rollback: () => writeCCommissionRecords(originalRecords) },
          { key: 'c-orders', apply: () => writeCOrders(nextOrders), rollback: () => writeCOrders(original.orders) }
        ]
      })
      if (!result.ok) { this.error = result.fatal ? '提现同步恢复失败，请联系平台处理' : '提现同步失败，请重试'; return false }
      this.commissionRecords = records
      this.orders = this.orders.map((order) => nextOrders[order.id] || order)
      this.withdrawalsTick += 1
      return true
    },
    async cancelOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'pending_payment' || order.inventoryReleased) return false
      const stable = readStableUserCommerceSnapshot('cancel', order.userId || this.userId)
      const original = stable?.snapshot
      const persistedOrder = original?.orders[id]
      if (!stable || !original?.catalog || !persistedOrder || persistedOrder.status !== 'pending_payment' || persistedOrder.inventoryReleased || original.catalog.revision !== this.inventoryRevision) return this.failStockConflict()
      const invalidItem = persistedOrder.items.find((item) => {
        const product = original.catalog!.products.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        return !product || !sku || !Number.isInteger(item.quantity) || item.quantity <= 0
      })
      if (invalidItem) { this.checkoutError = '订单商品规格已失效，无法释放库存'; return false }
      const operationId = `cancel:${persistedOrder.id}`
      let target = reusableUserTarget(operationId, original)
      if (!target) {
        const operationTime = nowString()
        const nextOrder = cloneSeed(persistedOrder)
        nextOrder.inventoryReleased = true
        nextOrder.subOrders.forEach((sub) => {
          sub.status = 'cancelled'; sub.inventoryReleased = true
          sub.logistics.push({ time: operationTime, title: '订单已取消', detail: '待支付订单取消，库存已释放' })
        })
        nextOrder.commissionAllocations.forEach((item) => { item.status = 'reversed' })
        nextOrder.status = 'cancelled'
        const nextCatalog = cloneSeed(original.catalog)
        const inventoryChanges = nextOrder.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
        for (const item of inventoryChanges) {
          const sku = nextCatalog.products.find((product) => product.id === item.productId)?.skus.find((candidate) => candidate.id === item.skuId)
          if (!sku) return false
          sku.stock += item.quantity
        }
        nextCatalog.revision += 1
        nextCatalog.appliedOperations ||= {}
        nextCatalog.appliedOperations[operationId] = { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes: inventoryChanges }), changes: [], appliedAt: operationTime }
        const commissionMap = new Map(original.commissions.map((item) => [item.id, item]))
        nextOrder.commissionAllocations.forEach((item) => commissionMap.set(item.id, item))
        target = { ...original, catalog: nextCatalog, orders: { ...original.orders, [nextOrder.id]: nextOrder }, commissions: [...commissionMap.values()] }
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: userCommerceCollections('cancel'),
        original,
        target,
        recoveryHandlerKey: USER_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: USER_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: userCommerceCollections('cancel').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'catalog', apply: () => writeCatalogState(target!.catalog!, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, target!.catalog!.revision) },
          { key: 'c-orders', apply: () => writeCOrders(target!.orders), rollback: () => writeCOrders(original.orders) },
          { key: 'c-commissions', apply: () => writeCCommissionRecords(target!.commissions), rollback: () => writeCCommissionRecords(original.commissions) }
        ]
      })
      if (!result.ok) { this.checkoutError = result.fatal ? '取消订单事务恢复失败，请联系平台处理' : '取消订单失败，请刷新后重试'; return false }
      this.applyCatalogState(target.catalog!)
      applyOrderSnapshot(order, target.orders[id])
      this.commissionRecords = target.commissions
      return true
    },
    async requestSubOrderAfterSale(id: string, subOrderId: string, evidenceImages?: BusinessMediaValue[]) {
      let order = this.orders.find((item) => item.id === id)
      let sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || !['paid', 'shipped', 'received'].includes(sub.status) || sub.afterSale) return false
      const visibleOrder = order
      const ownerUserId = order.userId || this.userId
      await this.syncFulfillmentProjection()
      order = this.orders.find((item) => item.id === id)
      sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || !['paid', 'shipped', 'received'].includes(sub.status) || sub.afterSale) return false
      const classification = readStableUserCommerceSnapshot('after-sale-catalog', ownerUserId)
      const classifiedSub = classification?.snapshot.orders[id]?.subOrders.find((item) => item.id === subOrderId)
      if (!classification || !classifiedSub || !['paid', 'shipped', 'received'].includes(classifiedSub.status) || classifiedSub.afterSale) return false
      const paidAfterSale = classifiedSub.status === 'paid'
      const variant: UserCommerceVariant = paidAfterSale ? 'after-sale-catalog' : 'after-sale'
      const operationId = `after-sale:${subOrderId}`
      const stable = paidAfterSale ? classification : readStableUserCommerceSnapshot(variant, ownerUserId)
      if (!stable) { this.checkoutError = '订单数据已更新，请重试'; return false }
      const original = stable.snapshot
      const persistedOrder = original.orders[id]
      const persistedSub = persistedOrder?.subOrders.find((item) => item.id === subOrderId)
      if (!persistedOrder || !persistedSub || !['paid', 'shipped', 'received'].includes(persistedSub.status) || persistedSub.afterSale) return false
      if ((persistedSub.status === 'paid') !== paidAfterSale) { this.checkoutError = '订单数据已更新，请重试'; return false }
      if (paidAfterSale && (!original.catalog || original.catalog.revision !== this.inventoryRevision)) return this.failStockConflict()
      if (paidAfterSale) {
        const invalidItem = persistedSub.items.find((item) => {
          const product = original.catalog!.products.find((candidate) => candidate.id === item.productId)
          const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
          return !product || !sku || !Number.isInteger(item.quantity) || item.quantity <= 0
        })
        if (invalidItem) { this.checkoutError = '商品规格已失效，无法释放库存'; return false }
      }
      let target = reusableUserTarget(operationId, original)
      if (!target) {
        const operationTime = nowString()
        const nextOrder = cloneSeed(persistedOrder)
        const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
        if (paidAfterSale) nextSub.inventoryReleased = true
        nextSub.status = 'after_sale'; nextSub.afterSale = { id: `CAS-${nextSub.id}`, reason: '演示售后', status: 'processing', createdAt: operationTime, evidenceImages }
        const negativeRecords = nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status === 'withdrawn').map((item) => ({ ...item, id: `${item.id}:reverse:${nextSub.id}`, amount: -item.amount, status: 'reversed' as const, createdAt: operationTime }))
        nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status !== 'withdrawn').forEach((item) => { item.status = 'reversed' })
        nextOrder.commissionAllocations.push(...negativeRecords); nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
        const commissionMap = new Map(original.commissions.map((item) => [item.id, item]))
        nextOrder.commissionAllocations.forEach((item) => commissionMap.set(item.id, item))
        const afterSale = buildUserAfterSaleCase(nextOrder, nextSub, evidenceImages)
        const supplierOrder = original.supplierOrders![`C-MALL-${nextSub.id}`]
        const afterSaleSupplierOrder = supplierOrder ? markCSubOrderAfterSaleAtSupplier(supplierOrder) : null
        target = {
          ...original,
          orders: { ...original.orders, [nextOrder.id]: nextOrder },
          commissions: [...commissionMap.values()],
          afterSales: { ...(original.afterSales || {}), [afterSale.id]: afterSale },
          supplierOrders: afterSaleSupplierOrder ? { ...original.supplierOrders!, [afterSaleSupplierOrder.id]: afterSaleSupplierOrder } : original.supplierOrders
        }
        if (target.catalog) {
          target.catalog = cloneSeed(target.catalog)
          for (const item of nextSub.items) {
            const sku = target.catalog.products.find((product) => product.id === item.productId)?.skus.find((candidate) => candidate.id === item.skuId)
            if (!sku) return false
            sku.stock += item.quantity
          }
          const changes = nextSub.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
          target.catalog.revision += 1
          target.catalog.appliedOperations ||= {}
          target.catalog.appliedOperations[operationId] = { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes }), changes: [], appliedAt: operationTime }
        }
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: userCommerceCollections(variant),
        original,
        target,
        recoveryHandlerKey: USER_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: USER_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: userCommerceCollections(variant).map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'platform-after-sales', apply: () => writePlatformAfterSales(target!.afterSales!), rollback: () => writePlatformAfterSales(original.afterSales!) },
          ...(target.catalog && original.catalog ? [{ key: 'catalog', apply: () => writeCatalogState(target!.catalog!, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, target!.catalog!.revision) }] : []),
          { key: 'c-orders', apply: () => writeCOrders(target!.orders), rollback: () => writeCOrders(original.orders) },
          { key: 'c-commissions', apply: () => writeCCommissionRecords(target!.commissions), rollback: () => writeCCommissionRecords(original.commissions) },
          { key: 'platform-orders', apply: () => writePlatformOrders(target!.supplierOrders!), rollback: () => writePlatformOrders(original.supplierOrders!) }
        ]
      })
      if (!result.ok) { this.checkoutError = result.fatal ? '售后事务恢复失败，请联系平台处理' : '数据未完成，请重试'; return false }
      if (target.catalog) this.applyCatalogState(target.catalog)
      applyOrderSnapshot(order, target.orders[id])
      if (visibleOrder !== order) applyOrderSnapshot(visibleOrder, target.orders[id])
      this.commissionRecords = target.commissions
      return true
    },
    logout() {
      this.persistSession()
      this.auth = { isLoggedIn: false, openid: '' }
      this.userId = ''
      this.cart = []
      this.orders = []
      this.addresses = []
      this.commissionRecords = []
      this.referralPromoterId = ''
      this.promoterId = ''
      this.initialized = false
    }
  }
})
