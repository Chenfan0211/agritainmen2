import { defineStore } from 'pinia'
import type { COrder, CatalogProduct, CatalogProductSubmission, DailyDeliveryRoute, DailyDeliveryRouteState, DriverAccount, DriverStoreScope, DriverStoreScopeState, MockScenario, NamedDeliveryRoute, Order, PlatformAuditLogEntry, PlatformEntities, PlatformJournalEntry, PlatformRecoveryHandlerKey, RouteOptimizationOutput, RouteOrigin, RouteOutboundShortageAllocation, RouteSegment, RouteWarehouseCheckIn, RouteStop, ShortageItem, Supplier, SupplierAccount, SupplierSettlementRecord, WriteResult } from '@agritainment/shared'
import {
  CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, SUPPLIER_DEMO_ID, acceptSupplierOrder, appendPlatformAuditLog, applyCatalogStockOperation, assignSupplierDriver, authenticateSupplier, buildSupplierAccountSeeds, clearPlatformJson, cloneSeed, confirmCourierDelivered, createCatalogProductReviewRecoveryHandlerRegistration, createCatalogProductSubmission, createId,
  deriveSupplierMetrics, deriveTodayFarmhouseQuantities, demoDrivers, demoNamedDeliveryRoutes, driverActiveTaskCounts, ensurePublishedRoutesForDate, ensureSupplierFulfillment, findActiveDriver, findDriverByAccount,
  handoverSupplierIn, handoverSupplierOut, haversineKm, initializePlatformRecoveryHandlers, markShortageHandled, mergeDeliveryOrdersByStore, mergePlatformDrivers, mergePlatformEntities, mergePlatformSupplierAccounts, namedRouteForDriver, namedRoutesForDriver, orderStopsByNamedRoute, readCOrders, readCatalogProductSubmissionState, readCatalogState, readDailyDeliveryRouteState, readDailyDeliveryRoutes, readDriverStoreScopeState, readDriverStoreScopes, readNamedDeliveryRouteState, readNamedDeliveryRoutes, readPlatformAuditLogs, readPlatformCollectionRevision, readPlatformDrivers, readPlatformEntities, readPlatformJson, readPlatformOrders, readPlatformSupplierAccounts, readPlatformSupplierSettlements, saveDailyDeliveryRoute, saveNamedDeliveryRoute, snapshotDailyDeliveryRoute, validatePhone, validateStopCheckIn,
  completeRouteStopHandover as completeRouteStopHandoverState, createAbnormalWarehouseCheckIn, createRouteOutboundHandover as createRouteOutboundHandoverState, createStrictSnapshotRecoveryHandlerRegistration, dispatchRouteOutbound as dispatchRouteOutboundState, enqueuePlatformRecovery, getPlatformProviders, reconcilePendingPlatformTransactions, reassignSupplierDriver, rejectRouteOutboundHandover as rejectRouteOutboundHandoverState, reorderRouteStops as reorderRouteStopState, resolvePlatformJournal, reviewRouteOutboundHandover as reviewRouteOutboundHandoverState, rollbackPlatformCollectionSnapshot, runLockedPlatformCollectionTask, runLockedPlatformTransaction, runPlatformTransaction, saveCatalogProduct as persistCatalogProduct, saveRouteOutboundShortages as applyRouteOutboundShortages, shipSupplierCourier, supplierCanLogin, supplierCanReceiveNewOrders, suppliers as supplierSeeds, syncCSubOrderFromSupplier, todayString, upsertPlatformEntity, validateWarehouseCheckIn, writeCOrders, writeCatalogState, writePlatformDrivers, writePlatformJson, writePlatformOrder, writePlatformOrders
} from '@agritainment/shared'
import { deliveryDistanceKm, resolveOrderStore, seedSupplierDataOnce, storeDirectory, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../services/repository'

const FULFILLMENT_STATUS_TEXT: Record<string, string> = {
  submitted: '待接单', accepted: '待发货', shipped: '待出库', delivering: '配送中', received: '已收货', cancelled: '已取消', completed: '已完成'
}

const SUPPLIER_FULFILLMENT_RECOVERY_HANDLER_KEY = 'supplier-fulfillment-sync-v1' as PlatformRecoveryHandlerKey
const SUPPLIER_FULFILLMENT_RECOVERY_SCHEMA = 'supplier-fulfillment-snapshot-v1'
const SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY = 'supplier-routing-atomic-v1' as PlatformRecoveryHandlerKey
const SUPPLIER_ROUTING_RECOVERY_SCHEMA = 'supplier-routing-snapshot-v1'
const SUPPLIER_ROUTING_COLLECTIONS = [
  PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY,
  PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY,
  PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY
] as const

interface SupplierFulfillmentSnapshot {
  platformOrders: Record<string, Order>
  cOrders?: Record<string, COrder>
  drivers?: DriverAccount[]
}

interface SupplierRoutingSnapshot {
  platformOrders: Record<string, Order>
  cOrders: Record<string, COrder>
  drivers: DriverAccount[]
  driverScopes: DriverStoreScopeState | null
  dailyRoutes: DailyDeliveryRouteState | null
  entities: PlatformEntities | null
  auditLogs: PlatformAuditLogEntry[]
}

const ROUTING_COLLECTION_FIELDS: Record<string, keyof SupplierRoutingSnapshot> = {
  [PLATFORM_ORDERS_STORAGE_KEY]: 'platformOrders', [PLATFORM_C_ORDERS_STORAGE_KEY]: 'cOrders',
  [PLATFORM_DRIVERS_STORAGE_KEY]: 'drivers', [PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY]: 'driverScopes',
  [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]: 'dailyRoutes', [PLATFORM_ENTITIES_STORAGE_KEY]: 'entities',
  [PLATFORM_AUDIT_LOG_STORAGE_KEY]: 'auditLogs'
}

function routingBusinessCollections(collections: readonly string[]): string[] {
  return [...new Set(collections.filter((key) => !!ROUTING_COLLECTION_FIELDS[key]))].sort((left, right) => left.localeCompare(right))
}

function readSupplierRoutingSnapshot(collections: readonly string[] = SUPPLIER_ROUTING_COLLECTIONS): SupplierRoutingSnapshot {
  const selected = new Set(routingBusinessCollections(collections))
  const snapshot = {} as SupplierRoutingSnapshot
  if (selected.has(PLATFORM_ORDERS_STORAGE_KEY)) snapshot.platformOrders = cloneSeed(readPlatformOrders() || {})
  if (selected.has(PLATFORM_C_ORDERS_STORAGE_KEY)) snapshot.cOrders = cloneSeed(readCOrders() || {})
  if (selected.has(PLATFORM_DRIVERS_STORAGE_KEY)) snapshot.drivers = cloneSeed(readPlatformDrivers() || [])
  if (selected.has(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)) snapshot.driverScopes = cloneSeed(readDriverStoreScopeState())
  if (selected.has(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)) snapshot.dailyRoutes = cloneSeed(readDailyDeliveryRouteState())
  if (selected.has(PLATFORM_ENTITIES_STORAGE_KEY)) snapshot.entities = cloneSeed(readPlatformEntities())
  if (selected.has(PLATFORM_AUDIT_LOG_STORAGE_KEY)) snapshot.auditLogs = cloneSeed(readPlatformAuditLogs())
  return snapshot
}

function selectSupplierRoutingSnapshot(snapshot: SupplierRoutingSnapshot, collections: readonly string[]): SupplierRoutingSnapshot {
  const selected = {} as SupplierRoutingSnapshot
  for (const key of routingBusinessCollections(collections)) {
    const field = ROUTING_COLLECTION_FIELDS[key]
    ;(selected as unknown as Record<string, unknown>)[field] = cloneSeed(snapshot[field])
  }
  return selected
}

function routingRevisionToken(collections: readonly string[] = SUPPLIER_ROUTING_COLLECTIONS): Record<string, number> {
  return Object.fromEntries(routingBusinessCollections(collections).map((key) => [key, readPlatformCollectionRevision(key)]))
}

function writeNullablePlatformJson(key: string, value: unknown): boolean {
  if (value !== null) return writePlatformJson(key, cloneSeed(value))
  clearPlatformJson(key)
  return readPlatformJson(key) === null
}

function writeSupplierRoutingSnapshot(snapshot: SupplierRoutingSnapshot, rollback: SupplierRoutingSnapshot, journal: PlatformJournalEntry): boolean {
  const writes = routingBusinessCollections(journal.collections).map((key) => [key, ROUTING_COLLECTION_FIELDS[key]] as const)
  const applied: Array<[string, keyof SupplierRoutingSnapshot]> = []
  for (const [key, field] of writes) {
    if (writeNullablePlatformJson(key, snapshot[field])) {
      applied.push([key, field])
      continue
    }
    for (const [appliedKey, appliedField] of applied.reverse()) rollbackPlatformCollectionSnapshot(appliedKey, rollback[appliedField], snapshot[appliedField])
    return false
  }
  return true
}

function sameRoutingValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameWithoutFields(left: unknown, right: unknown, omitted: readonly string[]): boolean {
  if (!isRecord(left) || !isRecord(right)) return false
  const omittedFields = new Set(omitted)
  const select = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !omittedFields.has(key)))
  return sameRoutingValue(select(left), select(right))
}

function changedRecordKeys<T>(original: Record<string, T>, target: Record<string, T>): string[] {
  return [...new Set([...Object.keys(original), ...Object.keys(target)])]
    .filter((key) => !sameRoutingValue(original[key], target[key]))
}

function changedEntityIds<T extends { id: string }>(original: readonly T[], target: readonly T[]): string[] {
  const originalById = Object.fromEntries(original.map((item) => [item.id, item]))
  const targetById = Object.fromEntries(target.map((item) => [item.id, item]))
  return changedRecordKeys(originalById, targetById)
}

function exactRoutingCollections(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((key) => actual.includes(key))
}

function validRoutingSnapshotField(field: keyof SupplierRoutingSnapshot, value: unknown): boolean {
  if (field === 'drivers' || field === 'auditLogs') return Array.isArray(value)
  if (field === 'driverScopes' || field === 'dailyRoutes' || field === 'entities') return value === null || isRecord(value)
  return isRecord(value)
}

function addedRoutingAudits(original: readonly PlatformAuditLogEntry[], target: readonly PlatformAuditLogEntry[]): PlatformAuditLogEntry[] | null {
  if (target.length > 1000) return null
  for (let added = 1; added <= target.length; added += 1) {
    const retained = target.length - added
    if (target.length === Math.min(1000, original.length + added)
      && sameRoutingValue(target.slice(added), original.slice(0, retained))) return target.slice(0, added)
  }
  return null
}

function validRoutingAudit(entry: PlatformAuditLogEntry): boolean {
  return !!entry?.id?.trim() && entry.module === 'routing' && entry.result === 'success'
    && !!entry.action?.trim() && !!entry.actorId?.trim() && Number.isFinite(Date.parse(entry.createdAt))
}

function validRouteStateRevision(original: DailyDeliveryRouteState | null, target: DailyDeliveryRouteState | null): target is DailyDeliveryRouteState {
  if (!target || target.schemaVersion !== 1 || target.revision !== (original?.revision ?? 0) + 1
    || !Array.isArray(target.routes) || new Set(target.routes.map((route) => route.id)).size !== target.routes.length
    || !target.updatedAt?.trim() || !Number.isFinite(Date.parse(target.updatedAt))) return false
  return !original || sameWithoutFields(original, target, ['revision', 'routes', 'updatedAt'])
}

function validateStaledRoutes(
  original: DailyDeliveryRouteState | null,
  target: DailyDeliveryRouteState | null,
  audits: readonly PlatformAuditLogEntry[],
  allowed: (route: DailyDeliveryRoute) => boolean = () => true
): boolean {
  if (!original || !validRouteStateRevision(original, target) || !audits.length || audits.some((entry) => entry.action !== 'route.stale')) return false
  const changedIds = changedEntityIds(original.routes, target.routes)
  if (!changedIds.length || changedIds.length !== audits.length || target.routes.length !== original.routes.length) return false
  const auditByRoute = new Map(audits.map((entry) => [entry.targetId, entry]))
  if (auditByRoute.size !== audits.length) return false
  return changedIds.every((routeId) => {
    const before = original.routes.find((route) => route.id === routeId)
    const after = target.routes.find((route) => route.id === routeId)
    const audit = auditByRoute.get(routeId)
    const metadata = audit?.metadata
    return !!before && !!after && !!audit && isRecord(metadata)
      && before.status === 'published' && after.status === 'stale'
      && sameWithoutFields(before, after, ['status', 'generatedAt']) && allowed(before)
      && audit.actorId === before.supplierId && audit.actorRole === 'system'
      && audit.targetType === 'daily-delivery-route'
      && metadata.driverId === before.driverId && metadata.deliveryDate === before.deliveryDate
  })
}

function validateScopeJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[], operationDate: string): boolean {
  const scopeAudit = audits.find((entry) => entry.action === 'driver.scope.update')
  const staleAudits = audits.filter((entry) => entry.action === 'route.stale')
  if (!scopeAudit || audits.length !== staleAudits.length + 1 || !target.driverScopes || !scopeAudit.targetId) return false
  const scope = target.driverScopes.scopes.find((item) => item.supplierId === scopeAudit.actorId && item.driverId === scopeAudit.targetId)
  const metadata = scopeAudit.metadata
  const expectedCollections = [PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(staleAudits.length ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
  if (!scope || !isRecord(metadata) || !sameRoutingValue(metadata.storeIds, scope.storeIds)
    || scopeAudit.actorRole !== 'supplier' || scopeAudit.targetType !== 'driver'
    || !sameRoutingValue(target.driverScopes, nextScopeState(original.driverScopes, scope))
    || !exactRoutingCollections(business, expectedCollections)) return false
  return staleAudits.length
    ? validateStaledRoutes(original.dailyRoutes, target.dailyRoutes, staleAudits, (route) => route.supplierId === scope.supplierId && route.driverId === scope.driverId && route.deliveryDate >= operationDate)
    : true
}

function validateScopeMigrationJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[]): boolean {
  if (!exactRoutingCollections(business, [PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY])
    || !target.driverScopes || !audits.length || audits.some((entry) => entry.action !== 'driver.scope.migrate')) return false
  const originalScopes = original.driverScopes?.scopes || []
  const originalByKey = new Map(originalScopes.map((scope) => [`${scope.supplierId}:${scope.driverId}`, scope]))
  const addedScopes = target.driverScopes.scopes.filter((scope) => !originalByKey.has(`${scope.supplierId}:${scope.driverId}`))
  if (addedScopes.length !== audits.length || target.driverScopes.scopes.length !== originalScopes.length + addedScopes.length
    || target.driverScopes.revision !== (original.driverScopes?.revision ?? 0) + addedScopes.length
    || target.driverScopes.schemaVersion !== 1
    || originalScopes.some((scope) => !sameRoutingValue(scope, target.driverScopes!.scopes.find((item) => item.supplierId === scope.supplierId && item.driverId === scope.driverId)))) return false
  return addedScopes.every((scope) => {
    const audit = audits.find((entry) => entry.actorId === scope.supplierId && entry.targetId === scope.driverId)
    return !!audit && audit.actorRole === 'system' && audit.targetType === 'driver'
      && isRecord(audit.metadata) && sameRoutingValue(audit.metadata.storeIds, scope.storeIds)
  })
}

function validateWarehouseJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[], operationDate: string): boolean {
  const warehouseAudit = audits.find((entry) => entry.action === 'warehouse.update')
  const staleAudits = audits.filter((entry) => entry.action === 'route.stale')
  if (!warehouseAudit || audits.length !== staleAudits.length + 1 || !original.entities || !target.entities || !warehouseAudit.targetId
    || warehouseAudit.actorId !== warehouseAudit.targetId || warehouseAudit.actorRole !== 'supplier' || warehouseAudit.targetType !== 'supplier') return false
  const originalSuppliers = original.entities.suppliers || {}
  const targetSuppliers = target.entities.suppliers || {}
  const supplierId = warehouseAudit.targetId
  const before = originalSuppliers[supplierId]
  const after = targetSuppliers[supplierId]
  const warehouse = after?.warehouse
  const metadata = warehouseAudit.metadata
  const hasCoordinates = warehouse?.longitude !== undefined
  const expectedCollections = [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(staleAudits.length ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
  if (!before || !after || !warehouse || !warehouse.address?.trim() || warehouse.coordinateSystem !== 'GCJ-02'
    || (hasCoordinates !== (warehouse.latitude !== undefined)) || (hasCoordinates && (!Number.isFinite(warehouse.longitude) || !Number.isFinite(warehouse.latitude)))
    || !isRecord(metadata) || metadata.address !== warehouse.address || metadata.hasCoordinates !== hasCoordinates
    || !sameWithoutFields(original.entities, target.entities, ['suppliers', 'updatedAt'])
    || changedRecordKeys(originalSuppliers, targetSuppliers).length !== 1 || !sameWithoutFields(before, after, ['warehouse'])
    || !exactRoutingCollections(business, expectedCollections)) return false
  return staleAudits.length
    ? validateStaledRoutes(original.dailyRoutes, target.dailyRoutes, staleAudits, (route) => route.supplierId === supplierId && route.deliveryDate >= operationDate)
    : true
}

function validatePublishedRouteJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[]): boolean {
  const publishesOrders = business.includes(PLATFORM_ORDERS_STORAGE_KEY)
  const expectedCollections = [
    ...(publishesOrders ? [PLATFORM_ORDERS_STORAGE_KEY] : []),
    PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY,
    PLATFORM_AUDIT_LOG_STORAGE_KEY
  ]
  if (!exactRoutingCollections(business, expectedCollections)
    || audits.length !== 1 || audits[0].action !== 'route.publish' || !validRouteStateRevision(original.dailyRoutes, target.dailyRoutes)) return false
  const audit = audits[0]
  const routeId = audit.targetId
  const route = target.dailyRoutes.routes.find((item) => item.id === routeId)
  const changedIds = changedEntityIds(original.dailyRoutes?.routes || [], target.dailyRoutes.routes)
  const metadata = audit.metadata
  if (!routeId || !route || changedIds.length !== 1 || changedIds[0] !== routeId || !isRecord(metadata)
    || audit.actorId !== route.supplierId || audit.actorRole !== 'supplier' || audit.targetType !== 'daily-delivery-route'
    || route.status !== 'published' || route.generatedAt !== route.publishedAt || target.dailyRoutes.updatedAt !== route.publishedAt
    || metadata.driverId !== route.driverId || metadata.deliveryDate !== route.deliveryDate || metadata.revision !== target.dailyRoutes.revision
    || route.stops.some((stop) => !Array.isArray(stop.orderIds) || stop.completedOrderIds !== undefined || stop.completedAt !== undefined)) return false
  const routedOrderIds = [...new Set(route.stops.flatMap((stop) => stop.orderIds))].sort()
  if (!sameRoutingValue([...route.sourceOrderIds].sort(), routedOrderIds)) return false
  if (publishesOrders) {
    const changedOrderIds = changedRecordKeys(original.platformOrders, target.platformOrders).sort()
    if (!sameRoutingValue(changedOrderIds, routedOrderIds)) return false
    const assignedOrdersValid = changedOrderIds.every((orderId) => {
      const before = original.platformOrders[orderId]
      const after = target.platformOrders[orderId]
      const previous = before?.supplierFulfillment
      const next = after?.supplierFulfillment
      const flow = after?.flow?.at(-1)
      const event = after?.fulfillmentEvents?.at(-1)
      return !!before && !!after && !!previous && !!next && !!flow && !!event
        && before.supplierId === route.supplierId && previous.status === 'accepted' && !previous.driverId
        && after.status === 'shipping' && next.status === 'shipped' && next.shipType === 'driver'
        && next.driverId === route.driverId && next.deliverDate === route.deliveryDate
        && sameWithoutFields(before, after, ['status', 'flow', 'fulfillmentEvents', 'supplierFulfillment'])
        && after.flow!.length === (before.flow?.length || 0) + 1
        && sameRoutingValue(after.flow!.slice(0, -1), before.flow || [])
        && after.fulfillmentEvents!.length === (before.fulfillmentEvents?.length || 0) + 1
        && sameRoutingValue(after.fulfillmentEvents!.slice(0, -1), before.fulfillmentEvents || [])
        && flow.action === `已发货 · 已指派司机 ${next.driverName} 配送`
        && event.orderId === orderId && event.from === 'accepted' && event.to === 'shipped' && event.operatorRole === 'supplier'
    })
    if (!assignedOrdersValid) return false
  }
  return (original.dailyRoutes?.routes || []).every((before) => before.id === routeId || sameRoutingValue(before, target.dailyRoutes!.routes.find((item) => item.id === before.id)))
}

function validateDriverCreationJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[]): boolean {
  if (!exactRoutingCollections(business, [PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY])
    || audits.length !== 1 || audits[0].action !== 'driver.scope.create' || target.drivers.length !== original.drivers.length + 1
    || !sameRoutingValue(target.drivers.slice(0, original.drivers.length), original.drivers) || !target.driverScopes) return false
  const driver = target.drivers.at(-1)!
  const audit = audits[0]
  const scope = target.driverScopes.scopes.find((item) => item.supplierId === driver.supplierId && item.driverId === driver.id)
  return !!driver.id?.trim() && !!driver.supplierId?.trim() && !!driver.name?.trim() && !!driver.account?.trim()
    && driver.status === 'active' && !original.drivers.some((item) => item.id === driver.id || item.account === driver.account)
    && !!scope && scope.storeIds.length === 0 && sameRoutingValue(target.driverScopes, nextScopeState(original.driverScopes, scope))
    && audit.actorId === driver.supplierId && audit.actorRole === 'supplier' && audit.targetType === 'driver' && audit.targetId === driver.id
    && isRecord(audit.metadata) && sameRoutingValue(audit.metadata.storeIds, [])
}

function validateRouteProgress(original: DailyDeliveryRouteState | null, target: DailyDeliveryRouteState | null, order: Order, audit: PlatformAuditLogEntry): boolean {
  if (!original || !validRouteStateRevision(original, target)) return false
  const changedIds = changedEntityIds(original.routes, target.routes)
  if (changedIds.length !== 1 || changedIds[0] !== audit.targetId) return false
  const before = original.routes.find((route) => route.id === changedIds[0])
  const after = target.routes.find((route) => route.id === changedIds[0])
  const fulfillment = order.supplierFulfillment
  if (!before || !after || !fulfillment?.driverId || !fulfillment.deliverDate || !before.sourceOrderIds.includes(order.id)
    || before.supplierId !== order.supplierId || before.driverId !== fulfillment.driverId || before.deliveryDate !== fulfillment.deliverDate
    || !['published', 'stale'].includes(before.status) || !sameWithoutFields(before, after, ['status', 'stops', 'completedAt'])) return false
  let changedStop = false
  const stopsValid = before.stops.length === after.stops.length && before.stops.every((stop, index) => {
    const next = after.stops[index]
    if (!next || !sameWithoutFields(stop, next, ['completedOrderIds', 'completedAt'])) return false
    const previousCompleted = stop.completedOrderIds || []
    const expectedCompleted = stop.orderIds.filter((orderId) => orderId === order.id || previousCompleted.includes(orderId))
    if (!sameRoutingValue(next.completedOrderIds || [], expectedCompleted)) return false
    const newlyChanged = !sameRoutingValue(previousCompleted, expectedCompleted)
    changedStop ||= newlyChanged
    const completed = expectedCompleted.length === stop.orderIds.length
    return completed ? next.completedAt === target.updatedAt : next.completedAt === stop.completedAt
  })
  if (!stopsValid || !changedStop) return false
  const completed = after.stops.every((stop) => stop.completedOrderIds?.length === stop.orderIds.length)
  if (completed ? after.status !== 'completed' || after.completedAt !== target.updatedAt : after.status !== before.status || after.completedAt !== before.completedAt) return false
  return audit.action === (completed ? 'route.complete' : 'route.progress')
}

function validateAppendedFulfillmentHistory(before: Order, after: Order, audit: PlatformAuditLogEntry): boolean {
  const previousFulfillment = before.supplierFulfillment
  const nextFulfillment = after.supplierFulfillment
  const flow = after.flow?.at(-1)
  const event = after.fulfillmentEvents?.at(-1)
  if (!previousFulfillment || !nextFulfillment || !flow || !event || !audit.actorName?.trim()
    || !event.id.startsWith('FUL') || before.fulfillmentEvents?.some((item) => item.id === event.id)) return false

  const updatedAt = Date.parse(nextFulfillment.updatedAt)
  const flowAt = Date.parse(flow.time)
  const eventAt = Date.parse(event.createdAt)
  const auditAt = Date.parse(audit.createdAt)
  if (![updatedAt, flowAt, eventAt, auditAt].every(Number.isFinite)
    || flowAt < updatedAt || eventAt < flowAt || eventAt > auditAt) return false

  const assignment = audit.action === 'order.driver.assign'
  const reassignment = audit.action === 'order.driver.reassign'
  const routeProgress = audit.action === 'route.progress' || audit.action === 'route.complete'
  if (!assignment && !reassignment && !routeProgress) return false
  const expectedFlowAction = assignment
    ? `已发货 · 已指派司机 ${nextFulfillment.driverName} 配送`
    : reassignment
      ? `改派司机 · ${nextFulfillment.driverName}（原 ${previousFulfillment.driverName || '未指派'}）`
      : `到店交接完成 · 司机 ${audit.actorName} 已与门店交接`
  const expectedOperatorId = routeProgress ? audit.actorId : audit.actorName
  const expectedOperatorRole = routeProgress ? 'driver' : 'supplier'

  return sameRoutingValue(flow, { time: flow.time, action: expectedFlowAction, operator: audit.actorName })
    && sameRoutingValue(event, {
      id: event.id,
      orderId: after.id,
      from: previousFulfillment.status,
      to: nextFulfillment.status,
      operatorId: expectedOperatorId,
      operatorRole: expectedOperatorRole,
      createdAt: event.createdAt
    })
}

function validateFulfillmentRoutingJournal(original: SupplierRoutingSnapshot, target: SupplierRoutingSnapshot, audits: readonly PlatformAuditLogEntry[], business: readonly string[], operationId: string): boolean {
  const primary = audits.filter((entry) => ['order.driver.assign', 'order.driver.reassign', 'route.progress', 'route.complete'].includes(entry.action))
  const staleAudits = audits.filter((entry) => entry.action === 'route.stale')
  if (primary.length !== 1 || audits.length !== staleAudits.length + 1) return false
  const action = primary[0]
  const metadata = action.metadata
  const metadataOrderId = isRecord(metadata) && typeof metadata.orderId === 'string' ? metadata.orderId : undefined
  const orderId = action.action.startsWith('order.driver.') ? action.targetId : metadataOrderId
  const changedOrderIds = changedRecordKeys(original.platformOrders, target.platformOrders)
  const before = orderId ? original.platformOrders[orderId] : undefined
  const after = orderId ? target.platformOrders[orderId] : undefined
  if (!orderId || !before || !after || changedOrderIds.length !== 1 || changedOrderIds[0] !== orderId
    || !operationId.startsWith(`supplier-fulfillment:${orderId}:`)
    || !sameWithoutFields(before, after, ['status', 'flow', 'fulfillmentEvents', 'supplierFulfillment'])
    || !Array.isArray(after.flow) || after.flow.length !== (before.flow?.length || 0) + 1 || !sameRoutingValue(after.flow.slice(0, -1), before.flow || [])
    || !Array.isArray(after.fulfillmentEvents) || after.fulfillmentEvents.length !== (before.fulfillmentEvents?.length || 0) + 1
    || !sameRoutingValue(after.fulfillmentEvents.slice(0, -1), before.fulfillmentEvents || [])
    || action.operationId !== operationId || !isRecord(metadata)) return false
  const previousFulfillment = before.supplierFulfillment
  const nextFulfillment = after.supplierFulfillment
  if (!previousFulfillment || !nextFulfillment || before.supplierId !== after.supplierId || !after.supplierId
    || !validateAppendedFulfillmentHistory(before, after, action)) return false
  const includesCOrders = business.includes(PLATFORM_C_ORDERS_STORAGE_KEY)
  const link = after.supplierOrderLink
  if ((link?.source === 'c-mall') !== includesCOrders) return false
  if (includesCOrders) {
    const cOrder = link?.sourceOrderId ? original.cOrders[link.sourceOrderId] : undefined
    const subOrder = cOrder?.subOrders.find((item) => item.id === link?.sourceSubOrderId)
    if (!cOrder || !subOrder || changedRecordKeys(original.cOrders, target.cOrders).length !== 1
      || !sameRoutingValue(target.cOrders[cOrder.id], syncCSubOrderFromSupplier(cOrder, subOrder, after))) return false
  }
  if (action.action.startsWith('order.driver.')) {
    const assigning = action.action === 'order.driver.assign'
    const nextDriverId = nextFulfillment.driverId
    if (!nextDriverId || action.targetId !== orderId || action.actorId !== after.supplierId || action.actorRole !== 'supplier'
      || action.targetType !== 'order' || metadata.driverId !== nextDriverId
      || metadata.previousDriverId !== previousFulfillment.driverId || nextFulfillment.shipType !== 'driver' || after.status !== 'shipping'
      || (assigning ? previousFulfillment.status !== 'accepted' || !!previousFulfillment.driverId || nextFulfillment.status !== 'shipped'
        || !sameWithoutFields(previousFulfillment, nextFulfillment, ['status', 'shipType', 'driverId', 'driverName', 'deliverDate', 'updatedAt'])
        : !['shipped', 'delivering'].includes(previousFulfillment.status) || previousFulfillment.driverId === nextDriverId
          || nextFulfillment.status !== previousFulfillment.status || !sameWithoutFields(previousFulfillment, nextFulfillment, ['driverId', 'driverName', 'updatedAt']))) return false
    const expectedCollections = [PLATFORM_ORDERS_STORAGE_KEY, ...(includesCOrders ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(staleAudits.length ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
    if (!exactRoutingCollections(business, expectedCollections)) return false
    const routeDrivers = new Set([nextDriverId, ...(previousFulfillment.driverId ? [previousFulfillment.driverId] : [])])
    return staleAudits.length
      ? validateStaledRoutes(original.dailyRoutes, target.dailyRoutes, staleAudits, (route) => route.supplierId === after.supplierId && routeDrivers.has(route.driverId) && route.deliveryDate === nextFulfillment.deliverDate)
      : true
  }
  if (staleAudits.length || !exactRoutingCollections(business, [PLATFORM_ORDERS_STORAGE_KEY, ...(includesCOrders ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY])
    || previousFulfillment.status !== 'delivering' || previousFulfillment.shipType !== 'driver'
    || nextFulfillment.status !== 'received' || nextFulfillment.driverId !== previousFulfillment.driverId || nextFulfillment.driverName !== previousFulfillment.driverName
    || nextFulfillment.deliverDate !== previousFulfillment.deliverDate || after.status !== 'delivered'
    || !sameWithoutFields(previousFulfillment, nextFulfillment, ['status', 'handovers', 'updatedAt'])
    || nextFulfillment.handovers.length !== previousFulfillment.handovers.length + 1
    || !sameRoutingValue(nextFulfillment.handovers.slice(0, -1), previousFulfillment.handovers)) return false
  const handover = nextFulfillment.handovers.at(-1)!
  if (!handover.id?.trim() || previousFulfillment.handovers.some((item) => item.id === handover.id)
    || handover.type !== 'in' || handover.orderId !== orderId || handover.time !== nextFulfillment.updatedAt
    || handover.operatorId !== nextFulfillment.driverId || handover.operatorName !== action.actorName || handover.operatorRole !== 'driver'
    || action.actorId !== nextFulfillment.driverId
    || action.actorRole !== 'driver' || action.targetType !== 'daily-delivery-route'
    || metadata.driverId !== nextFulfillment.driverId || metadata.deliveryDate !== nextFulfillment.deliverDate) return false
  return validateRouteProgress(original.dailyRoutes, target.dailyRoutes, after, action)
}

function isSupplierRoutingJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY || journal.recoverySchema !== SUPPLIER_ROUTING_RECOVERY_SCHEMA) return false
  const business = journal.collections.filter((key) => key !== PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && key !== PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  if (!business.length || new Set(journal.collections).size !== journal.collections.length || business.some((key) => !ROUTING_COLLECTION_FIELDS[key]) || !isRecord(journal.original) || !isRecord(journal.target)) return false
  const original = journal.original
  const target = journal.target
  if (!business.every((key) => {
    const field = ROUTING_COLLECTION_FIELDS[key]
    return field in original && field in target && validRoutingSnapshotField(field, original[field]) && validRoutingSnapshotField(field, target[field])
  })) return false
  const expectedFields = business.map((key) => ROUTING_COLLECTION_FIELDS[key]).sort()
  if (!sameRoutingValue(Object.keys(original).sort(), expectedFields) || !sameRoutingValue(Object.keys(target).sort(), expectedFields)
    || !Array.isArray(original.auditLogs) || !Array.isArray(target.auditLogs)) return false
  const audits = addedRoutingAudits(original.auditLogs, target.auditLogs)
  if (!audits?.length || audits.some((entry) => !validRoutingAudit(entry))) return false
  const originalSnapshot = original as unknown as SupplierRoutingSnapshot
  const targetSnapshot = target as unknown as SupplierRoutingSnapshot
  const createdAt = new Date(journal.createdAt)
  if (!Number.isFinite(createdAt.getTime())) return false
  const operationDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`
  if (journal.operationId.startsWith('OP-DRIVER-SCOPE-MIGRATE')) return validateScopeMigrationJournal(originalSnapshot, targetSnapshot, audits, business)
  if (journal.operationId.startsWith('OP-DRIVER-SCOPE')) return validateScopeJournal(originalSnapshot, targetSnapshot, audits, business, operationDate)
  if (journal.operationId.startsWith('OP-ROUTE-STALE')) {
    return exactRoutingCollections(business, [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY])
      && validateStaledRoutes(originalSnapshot.dailyRoutes, targetSnapshot.dailyRoutes, audits)
  }
  if (journal.operationId.startsWith('OP-ROUTE-PUBLISH')) return validatePublishedRouteJournal(originalSnapshot, targetSnapshot, audits, business)
  if (journal.operationId.startsWith('OP-WAREHOUSE')) return validateWarehouseJournal(originalSnapshot, targetSnapshot, audits, business, operationDate)
  if (journal.operationId.startsWith('OP-DRIVER-CREATE')) return validateDriverCreationJournal(originalSnapshot, targetSnapshot, audits, business)
  return validateFulfillmentRoutingJournal(originalSnapshot, targetSnapshot, audits, business, journal.operationId)
}

function createSupplierRoutingRecoveryHandlerRegistration() {
  return createStrictSnapshotRecoveryHandlerRegistration<SupplierRoutingSnapshot, Record<string, number>>({
    key: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY,
    fields: ['platformOrders', 'cOrders', 'drivers', 'driverScopes', 'dailyRoutes', 'entities', 'auditLogs'],
    validateJournal: isSupplierRoutingJournal,
    readStable: (journal) => {
      const collections = routingBusinessCollections(journal.collections)
      const before = routingRevisionToken(collections)
      const current = readSupplierRoutingSnapshot(collections)
      const snapshot = Object.fromEntries(Object.keys(journal.original as Record<string, unknown>).map((field) => [field, current[field as keyof SupplierRoutingSnapshot]])) as unknown as SupplierRoutingSnapshot
      const after = routingRevisionToken(collections)
      return JSON.stringify(before) === JSON.stringify(after) ? { snapshot, token: after } : null
    },
    isStillStable: (token, journal) => JSON.stringify(token) === JSON.stringify(routingRevisionToken(journal.collections)),
    writeSnapshot: writeSupplierRoutingSnapshot
  })
}

function routingAuditEntries(original: readonly PlatformAuditLogEntry[], entries: Array<Omit<PlatformAuditLogEntry, 'id' | 'createdAt' | 'result'>>): PlatformAuditLogEntry[] {
  const created = entries.map((entry, index) => ({ ...entry, id: createId('AUDIT'), result: 'success' as const, createdAt: new Date(Date.now() + index).toISOString() }))
  return [...created.reverse(), ...cloneSeed(original)].slice(0, 1000)
}

function nextScopeState(current: DriverStoreScopeState | null, scope: DriverStoreScope): DriverStoreScopeState {
  const scopes = cloneSeed(current?.scopes || [])
  const index = scopes.findIndex((item) => item.supplierId === scope.supplierId && item.driverId === scope.driverId)
  if (index >= 0) scopes[index] = scope
  else scopes.push(scope)
  scopes.sort((left, right) => left.supplierId.localeCompare(right.supplierId) || left.driverId.localeCompare(right.driverId))
  return { schemaVersion: 1, revision: (current?.revision ?? 0) + 1, scopes, updatedAt: scope.updatedAt }
}

function staleRouteState(current: DailyDeliveryRouteState | null, supplierId: string, driverIds: readonly string[], deliveryDate?: string, dateMode: 'exact' | 'from' = 'exact'): { state: DailyDeliveryRouteState | null; stale: DailyDeliveryRoute[] } {
  const targets = new Set(driverIds)
  const stale: DailyDeliveryRoute[] = []
  const routes = cloneSeed(current?.routes || []).map((route) => {
    const dateOutsideRange = deliveryDate && (dateMode === 'from' ? route.deliveryDate < deliveryDate : route.deliveryDate !== deliveryDate)
    if (route.supplierId !== supplierId || !targets.has(route.driverId) || dateOutsideRange || route.status !== 'published') return route
    const changed = { ...route, status: 'stale' as const, generatedAt: timestampAfter(current?.updatedAt) }
    stale.push(changed)
    return changed
  })
  if (!stale.length) return { state: current, stale }
  const updatedAt = timestampAfter(current?.updatedAt)
  return { state: { schemaVersion: 1, revision: (current?.revision ?? 0) + 1, routes, updatedAt }, stale }
}

function completeRouteOrderState(current: DailyDeliveryRouteState | null, order: Order): { state: DailyDeliveryRouteState | null; route: DailyDeliveryRoute | null } {
  const fulfillment = order.supplierFulfillment
  if (!current || fulfillment?.status !== 'received' || fulfillment.shipType !== 'driver' || !fulfillment.driverId || !fulfillment.deliverDate) return { state: current, route: null }
  const completedAt = timestampAfter(current.updatedAt)
  let completedRoute: DailyDeliveryRoute | null = null
  const routes = cloneSeed(current.routes).map((route) => {
    if (route.supplierId !== order.supplierId || route.driverId !== fulfillment.driverId || route.deliveryDate !== fulfillment.deliverDate || !['published', 'stale'].includes(route.status) || !route.sourceOrderIds.includes(order.id)) return route
    let changed = false
    const stops = route.stops.map((stop) => {
      if (!stop.orderIds.includes(order.id)) return stop
      const completedOrderIds = stop.orderIds.filter((orderId) => orderId === order.id || (stop.completedOrderIds || []).includes(orderId))
      if (completedOrderIds.length === (stop.completedOrderIds || []).length) return stop
      changed = true
      return { ...stop, completedOrderIds, ...(completedOrderIds.length === stop.orderIds.length ? { completedAt } : {}) }
    })
    if (!changed) return route
    const routeCompleted = stops.every((stop) => stop.completedOrderIds?.length === stop.orderIds.length)
    completedRoute = { ...route, stops, ...(routeCompleted ? { status: 'completed' as const, completedAt } : {}) }
    return completedRoute
  })
  if (!completedRoute) return { state: current, route: null }
  return { state: { schemaVersion: 1, revision: current.revision + 1, routes, updatedAt: completedAt }, route: completedRoute }
}

function persistSupplierRoute(route: DailyDeliveryRoute): WriteResult<DailyDeliveryRoute> {
  const state = readDailyDeliveryRouteState()
  const next = snapshotDailyDeliveryRoute({ ...route, generatedAt: timestampAfter(state?.updatedAt) })
  return saveDailyDeliveryRoute(next, state?.revision ?? 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function includesOnlyCollections(journal: PlatformJournalEntry, collections: string[]): boolean {
  return journal.collections.length === collections.length && collections.every((key) => journal.collections.includes(key))
}

function isSupplierFulfillmentSnapshot(value: unknown, includeCOrders: boolean, includeDrivers: boolean): value is SupplierFulfillmentSnapshot {
  if (!isRecord(value) || !isRecord(value.platformOrders)) return false
  return (!includeCOrders || isRecord(value.cOrders)) && (!includeDrivers || Array.isArray(value.drivers))
}

function isSupplierFulfillmentJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== SUPPLIER_FULFILLMENT_RECOVERY_HANDLER_KEY || journal.recoverySchema !== SUPPLIER_FULFILLMENT_RECOVERY_SCHEMA) return false
  const includeCOrders = journal.collections.includes(PLATFORM_C_ORDERS_STORAGE_KEY)
  const includeDrivers = journal.collections.includes(PLATFORM_DRIVERS_STORAGE_KEY)
  const businessCollections = journal.collections.filter((key) => key !== PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && key !== PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  const expected = [PLATFORM_ORDERS_STORAGE_KEY, ...(includeCOrders ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), ...(includeDrivers ? [PLATFORM_DRIVERS_STORAGE_KEY] : [])]
  if (!includesOnlyCollections({ ...journal, collections: businessCollections }, expected)) return false
  return isSupplierFulfillmentSnapshot(journal.original, includeCOrders, includeDrivers) && isSupplierFulfillmentSnapshot(journal.target, includeCOrders, includeDrivers)
}

function readSupplierFulfillmentSnapshot(includeCOrders: boolean, includeDrivers = false): SupplierFulfillmentSnapshot {
  const snapshot: SupplierFulfillmentSnapshot = { platformOrders: cloneSeed(readPlatformOrders() || {}) }
  if (includeCOrders) snapshot.cOrders = cloneSeed(readCOrders() || {})
  if (includeDrivers) snapshot.drivers = cloneSeed(readPlatformDrivers() || [])
  return snapshot
}

function readStableSupplierFulfillmentSnapshot(includeCOrders: boolean, includeDrivers = false) {
  const before = {
    orders: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY),
    cOrders: includeCOrders ? readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY) : undefined,
    drivers: includeDrivers ? readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY) : undefined
  }
  const snapshot = readSupplierFulfillmentSnapshot(includeCOrders, includeDrivers)
  const after = {
    orders: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY),
    cOrders: includeCOrders ? readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY) : undefined,
    drivers: includeDrivers ? readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY) : undefined
  }
  return before.orders === after.orders && before.cOrders === after.cOrders && before.drivers === after.drivers
    ? { snapshot, token: after }
    : null
}

function writeSupplierFulfillmentSnapshot(snapshot: SupplierFulfillmentSnapshot, includeCOrders: boolean): boolean {
  if (!includeCOrders) return writePlatformOrders(snapshot.platformOrders)
  if (!snapshot.cOrders) return false
  const before = readSupplierFulfillmentSnapshot(true)
  if (!writePlatformOrders(snapshot.platformOrders)) return false
  if (writeCOrders(snapshot.cOrders)) return true
  writePlatformOrders(before.platformOrders)
  return false
}

function sameSupplierSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function executeStrictSupplierRecovery(journal: PlatformJournalEntry): boolean {
  if (!isSupplierFulfillmentJournal(journal)) return false
  const includeCOrders = journal.collections.includes(PLATFORM_C_ORDERS_STORAGE_KEY)
  const includeDrivers = journal.collections.includes(PLATFORM_DRIVERS_STORAGE_KEY)
  const original = journal.original as SupplierFulfillmentSnapshot
  const target = journal.target as SupplierFulfillmentSnapshot
  const current = readSupplierFulfillmentSnapshot(includeCOrders, includeDrivers)
  const fields: Array<keyof SupplierFulfillmentSnapshot> = ['platformOrders', ...(includeCOrders ? ['cOrders' as const] : []), ...(includeDrivers ? ['drivers' as const] : [])]
  if (fields.some((field) => !sameSupplierSnapshot(current[field], original[field]) && !sameSupplierSnapshot(current[field], target[field]))) return false
  if (sameSupplierSnapshot(current, original) || sameSupplierSnapshot(current, target)) return true
  return writeSupplierFulfillmentSnapshot(original, includeCOrders)
}

export function createSupplierAtomicRecoveryHandlerRegistrations() {
  return [createStrictSnapshotRecoveryHandlerRegistration({
    key: SUPPLIER_FULFILLMENT_RECOVERY_HANDLER_KEY,
    fields: ['platformOrders', 'cOrders', 'drivers'] as const,
    validateJournal: isSupplierFulfillmentJournal,
    readStable: (journal) => {
      const includeCOrders = journal.collections.includes(PLATFORM_C_ORDERS_STORAGE_KEY)
      const includeDrivers = journal.collections.includes(PLATFORM_DRIVERS_STORAGE_KEY)
      return readStableSupplierFulfillmentSnapshot(includeCOrders, includeDrivers)
    },
    isStillStable: (revisions) => readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY) === revisions.orders
      && (revisions.cOrders === undefined || readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY) === revisions.cOrders)
      && (revisions.drivers === undefined || readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY) === revisions.drivers),
    writeSnapshot: (snapshot, _rollback, journal) => writeSupplierFulfillmentSnapshot(snapshot, journal.collections.includes(PLATFORM_C_ORDERS_STORAGE_KEY))
  }), createSupplierRoutingRecoveryHandlerRegistration()]
}

function timestampAfter(value?: string): string {
  const floor = value && Number.isFinite(Date.parse(value)) ? Date.parse(value) + 1 : 0
  return new Date(Math.max(Date.now(), floor)).toISOString()
}

function migrateLegacySupplierWarehouse(directory: Supplier[]): Supplier[] {
  const supplier = directory.find((item) => item.id === SUPPLIER_DEMO_ID)
  if (!supplier || supplier.warehouse) return directory
  const migrated: Supplier = {
    ...supplier,
    warehouse: {
      address: `湖南省${supplierInfo.region}仓点`, longitude: supplierInfo.longitude, latitude: supplierInfo.latitude, coordinateSystem: 'GCJ-02'
    }
  }
  if (!upsertPlatformEntity('suppliers', migrated.id, migrated)) throw new Error('仓点迁移失败，请重试')
  return directory.map((item) => item.id === migrated.id ? migrated : item)
}

function supplierStoreIds(orders: readonly Order[], supplierId: string): string[] {
  void orders
  void supplierId
  return Object.keys(storeDirectory).sort()
}

async function migrateLegacyDriverScopes(drivers: readonly DriverAccount[], orders: readonly Order[]): Promise<void> {
  const persistedDrivers = new Set((readPlatformDrivers() || []).map((driver) => driver.id))
  const missing = drivers.filter((driver) => persistedDrivers.has(driver.id) && !readDriverStoreScopes(driver.supplierId, driver.id).length)
  if (!missing.length) return
  const collections = [PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
  const original = readSupplierRoutingSnapshot(collections)
  let scopeState = original.driverScopes
  const scopes = missing.map((driver) => {
    const scope: DriverStoreScope = { supplierId: driver.supplierId, driverId: driver.id, storeIds: supplierStoreIds(orders, driver.supplierId), updatedAt: timestampAfter(scopeState?.updatedAt) }
    scopeState = nextScopeState(scopeState, scope)
    return scope
  })
  const target: SupplierRoutingSnapshot = {
    ...cloneSeed(original), driverScopes: scopeState,
    auditLogs: routingAuditEntries(original.auditLogs, scopes.map((scope) => ({ module: 'routing', action: 'driver.scope.migrate', actorId: scope.supplierId, actorRole: 'system', targetType: 'driver', targetId: scope.driverId, metadata: { storeIds: scope.storeIds } })))
  }
  const revisions = routingRevisionToken(collections)
  const result = await runLockedPlatformTransaction({
    operationId: createId('OP-DRIVER-SCOPE-MIGRATE'), collections, lockCollections: [PLATFORM_DRIVERS_STORAGE_KEY], original, target,
    recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA,
    revisionChecks: [
      { key: PLATFORM_DRIVERS_STORAGE_KEY, expectedRevision: readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY) },
      { key: PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, expectedRevision: revisions[PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY] },
      { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }
    ],
    steps: [
      { key: 'driver-scopes', apply: () => writePlatformJson(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, target.driverScopes, revisions[PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, original.driverScopes, target.driverScopes) },
      { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
    ]
  })
  if (!result.ok) throw new Error(result.message)
}

function seedDemoNamedRoutes() {
  if (readNamedDeliveryRoutes().length) return
  let revision = readNamedDeliveryRouteState()?.revision ?? 0
  let updatedAt = readNamedDeliveryRouteState()?.updatedAt
  for (const route of demoNamedDeliveryRoutes) {
    const next = { ...route, updatedAt: timestampAfter(updatedAt) }
    const saved = saveNamedDeliveryRoute(next, revision)
    if (!saved.ok) return
    revision += 1
    updatedAt = next.updatedAt
  }
}

function routeMetrics(origin: { longitude?: number; latitude?: number }, stops: readonly RouteStop[]): { segments: RouteSegment[]; totalDistanceKm: number; estimatedDurationMinutes: number } {
  const segments: RouteSegment[] = []
  let previous = origin
  let fromId = 'origin'
  for (const stop of stops) {
    if (previous.longitude === undefined || previous.latitude === undefined || stop.longitude === undefined || stop.latitude === undefined) continue
    const distanceKm = Math.round(haversineKm(previous.latitude, previous.longitude, stop.latitude, stop.longitude) * 1000) / 1000
    segments.push({ fromId, toStoreId: stop.storeId, distanceKm })
    previous = stop
    fromId = stop.storeId
  }
  const totalDistanceKm = Math.round(segments.reduce((sum, segment) => sum + segment.distanceKm, 0) * 1000) / 1000
  return { segments, totalDistanceKm, estimatedDurationMinutes: Math.ceil(totalDistanceKm / 30 * 60 + stops.length * 5) }
}

function validatedRouteOptimizationOutput(inputStops: readonly RouteStop[], value: RouteOptimizationOutput): RouteOptimizationOutput | null {
  if (!value || !Array.isArray(value.orderedStops) || value.orderedStops.length !== inputStops.length || !Array.isArray(value.segments)
    || !Number.isFinite(value.totalDistanceKm) || value.totalDistanceKm < 0
    || !Number.isFinite(value.estimatedDurationMinutes) || value.estimatedDurationMinutes < 0
    || typeof value.provider !== 'string' || !value.provider.trim()
    || !Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== 'string')) return null
  const inputByStore = new Map(inputStops.map((stop) => [stop.storeId, stop]))
  if (inputByStore.size !== inputStops.length) return null
  const seen = new Set<string>()
  const orderedStops: RouteStop[] = []
  for (const candidate of value.orderedStops) {
    const original = candidate && inputByStore.get(candidate.storeId)
    if (!original || seen.has(candidate.storeId)
      || candidate.storeName !== original.storeName || candidate.address !== original.address
      || candidate.longitude !== original.longitude || candidate.latitude !== original.latitude
      || !Array.isArray(candidate.orderIds) || JSON.stringify(candidate.orderIds) !== JSON.stringify(original.orderIds)) return null
    seen.add(candidate.storeId)
    orderedStops.push(cloneSeed(original))
  }
  const coordinateStops = orderedStops.filter((stop) => Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude))
  if (value.segments.length !== coordinateStops.length) return null
  let expectedFromId = 'origin'
  let segmentTotal = 0
  for (let index = 0; index < value.segments.length; index += 1) {
    const segment = value.segments[index]
    const stop = coordinateStops[index]
    if (!segment || segment.fromId !== expectedFromId || segment.toStoreId !== stop.storeId || !Number.isFinite(segment.distanceKm) || segment.distanceKm < 0) return null
    segmentTotal += segment.distanceKm
    expectedFromId = stop.storeId
  }
  if (Math.abs(segmentTotal - value.totalDistanceKm) > 0.01) return null
  const polyline = Array.isArray(value.polyline) && value.polyline.every((point) => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude))
    ? cloneSeed(value.polyline)
    : undefined
  return {
    orderedStops,
    segments: cloneSeed(value.segments),
    totalDistanceKm: value.totalDistanceKm,
    estimatedDurationMinutes: value.estimatedDurationMinutes,
    provider: value.provider.trim(),
    warnings: [...value.warnings],
    ...(polyline ? { polyline } : {})
  }
}

async function markRoutesStale(supplierId: string, driverIds: readonly string[], deliveryDate?: string): Promise<WriteResult<unknown>> {
  const targets = new Set(driverIds)
  if (!targets.size) return { ok: true }
  let lastResult: WriteResult<unknown> = { ok: true }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const collections = [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
    const original = readSupplierRoutingSnapshot(collections)
    const stale = staleRouteState(original.dailyRoutes, supplierId, [...targets], deliveryDate)
    if (!stale.stale.length) return { ok: true }
    const target: SupplierRoutingSnapshot = {
      ...cloneSeed(original), dailyRoutes: stale.state,
      auditLogs: routingAuditEntries(original.auditLogs, stale.stale.map((route) => ({ module: 'routing', action: 'route.stale', actorId: supplierId, actorRole: 'system', targetType: 'daily-delivery-route', targetId: route.id, metadata: { driverId: route.driverId, deliveryDate: route.deliveryDate } })))
    }
    const revisions = routingRevisionToken(collections)
    const result = await runLockedPlatformTransaction({
      operationId: createId('OP-ROUTE-STALE'), collections, original, target,
      recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA,
      revisionChecks: [
        { key: PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] },
        { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }
      ],
      steps: [
        { key: 'routes-stale', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, target.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes, target.dailyRoutes) },
        { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
      ]
    })
    if (result.ok) return result
    lastResult = result
    const latest = readDailyDeliveryRouteState()
    const stillPublished = stale.stale.some((changed) => latest?.routes.find((route) => route.id === changed.id)?.status === 'published')
    if (!stillPublished) return { ok: true }
    if (result.code !== 'revision_conflict') return result
  }
  return lastResult
}

async function reconcilePublishedRouteInputs(routes: readonly DailyDeliveryRoute[], orders: readonly Order[], suppliers: readonly Supplier[], scopes: readonly DriverStoreScope[]): Promise<WriteResult<unknown>> {
  for (const route of routes.filter((item) => item.status === 'published' && item.deliveryDate >= todayString())) {
    const sourceIds = new Set(route.sourceOrderIds)
    const currentOrderIds = orders.filter((order) => {
      const fulfillment = order.supplierFulfillment
      return order.supplierId === route.supplierId && fulfillment?.driverId === route.driverId && fulfillment.shipType === 'driver'
        && fulfillment.deliverDate === route.deliveryDate && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering' || (fulfillment.status === 'received' && sourceIds.has(order.id)))
    }).map((order) => order.id).sort()
    const sourceChanged = JSON.stringify(currentOrderIds) !== JSON.stringify([...route.sourceOrderIds].sort())
    const scope = scopes.find((item) => item.supplierId === route.supplierId && item.driverId === route.driverId)
    const scopeChanged = !!route.scopeStoreIds && JSON.stringify(scope?.storeIds || []) !== JSON.stringify(route.scopeStoreIds)
    const warehouse = supplierWarehouseOf(route.supplierId, suppliers)
    const originChanged = !!route.origin && (route.origin.longitude !== warehouse?.longitude || route.origin.latitude !== warehouse?.latitude)
    const stopChanged = route.stops.some((stop) => {
      const order = orders.find((item) => stop.orderIds.includes(item.id))
      const current = order ? resolveOrderStore(order) : undefined
      return !!current && (current.address !== stop.address || current.longitude !== stop.longitude || current.latitude !== stop.latitude)
    })
    if (sourceChanged || scopeChanged || originChanged || stopChanged) {
      const result = await markRoutesStale(route.supplierId, [route.driverId], route.deliveryDate)
      if (!result.ok) return { ...result, message: `线路过期状态保存失败：${result.message}` }
    }
  }
  return { ok: true }
}

export type SupplierRole = 'supplier' | 'driver'

interface SupplierState {
  initialized: boolean
  loading: boolean
  error: string
  routeReconcileWarning: string
  mockScenario: MockScenario
  loginError: string
  auth: { isLoggedIn: boolean; role: SupplierRole | null; account: string; name: string; supplierId: string; driverId?: string; credentialUpdatedAt?: string }
  suppliers: Supplier[]
  supplierAccounts: SupplierAccount[]
  drivers: DriverAccount[]
  orders: Order[]
  platformOrdersRevision: number
  cOrdersRevision: number
  settlements: SupplierSettlementRecord[]
  catalogProducts: CatalogProduct[]
  catalogRevision: number
  productSubmissions: CatalogProductSubmission[]
  productSubmissionRevision: number
  driverScopes: DriverStoreScope[]
  driverScopeRevision: number
  namedRoutes: NamedDeliveryRoute[]
  namedRouteRevision: number
  dailyRoutes: DailyDeliveryRoute[]
  dailyRouteRevision: number
  routeDraft: DailyDeliveryRoute | null
  activeDriverRouteId: string
}

export const useSupplierStore = defineStore('supplier', {
  state: (): SupplierState => ({
    initialized: false,
    loading: false,
    error: '',
    routeReconcileWarning: '',
    mockScenario: 'normal',
    loginError: '',
    auth: { isLoggedIn: false, role: null, account: '', name: '', supplierId: SUPPLIER_DEMO_ID },
    suppliers: [],
    supplierAccounts: [],
    drivers: [],
    orders: [],
    platformOrdersRevision: 0,
    cOrdersRevision: 0,
    settlements: [],
    catalogProducts: [],
    catalogRevision: 0,
    productSubmissions: [],
    productSubmissionRevision: 0,
    driverScopes: [],
    driverScopeRevision: 0,
    namedRoutes: [],
    namedRouteRevision: 0,
    dailyRoutes: [],
    dailyRouteRevision: 0,
    routeDraft: null,
    activeDriverRouteId: ''
  }),
  getters: {
    currentSupplier: (state) => state.suppliers.find((supplier) => supplier.id === state.auth.supplierId),
    metrics: (state) => deriveSupplierMetrics(state.orders.filter((order) => order.supplierId === state.auth.supplierId)),
    todayFarmhouseQuantities: (state) => deriveTodayFarmhouseQuantities(
      state.orders.filter((order) => order.supplierId === state.auth.supplierId),
      (order) => resolveOrderStore(order)?.storeId
    ),
    todayDeliveryOrders: (state) => state.orders.filter((order) => order.supplierId === state.auth.supplierId && order.channel === 'purchase' && (() => {
      const fulfillment = order.supplierFulfillment
      if (!fulfillment) return false
      if (fulfillment.status === 'submitted' || fulfillment.status === 'accepted') return true
      return fulfillment.deliverDate === todayString() && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
    })()),
    visibleDrivers: (state) => state.drivers.filter((driver) => driver.supplierId === state.auth.supplierId),
    activeDrivers: (state) => state.drivers.filter((driver) => driver.supplierId === state.auth.supplierId && driver.status === 'active'),
    driverTaskCounts: (state) => driverActiveTaskCounts(state.orders.filter((order) => order.supplierId === state.auth.supplierId)),
    supplierOrders: (state) => state.orders.filter((order) => order.channel === 'purchase' && order.supplierId === state.auth.supplierId),
    supplierOrderCounts: (state) => state.orders
      .filter((order) => order.channel === 'purchase' && order.supplierId === state.auth.supplierId)
      .reduce<Record<string, number>>((counts, order) => {
        const status = order.supplierFulfillment?.status ?? 'submitted'
        counts['全部'] += 1
        counts[status] = (counts[status] ?? 0) + 1
        if (order.supplierFulfillment?.shortages.length) counts['缺货'] += 1
        return counts
      }, { '全部': 0, '缺货': 0 }),
    myTasks: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return order.supplierId === state.auth.supplierId && fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering') && fulfillment.deliverDate === todayString()
      }).sort((a, b) => {
        const origin = supplierWarehouseOf(state.auth.supplierId, state.suppliers)
        const aDistance = deliveryDistanceKm(origin || {}, storeInfoOf(a))
        const bDistance = deliveryDistanceKm(origin || {}, storeInfoOf(b))
        if (aDistance === null && bDistance === null) return a.createdAt.localeCompare(b.createdAt)
        if (aDistance === null) return 1
        if (bDistance === null) return -1
        return aDistance - bDistance || a.createdAt.localeCompare(b.createdAt)
      })
    },
    todayDriverRoutes: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      const statusRank: Record<DailyDeliveryRoute['status'], number> = { published: 0, stale: 1, draft: 2, completed: 3 }
      return state.dailyRoutes
        .filter((route) => route.supplierId === state.auth.supplierId && route.driverId === state.auth.driverId && route.deliveryDate === todayString() && (route.status === 'published' || route.status === 'stale' || route.status === 'completed'))
        .sort((left, right) => statusRank[left.status] - statusRank[right.status] || (left.publishedAt || left.generatedAt).localeCompare(right.publishedAt || right.generatedAt) || left.id.localeCompare(right.id))
    },
    currentDriverRoute: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return null
      const routes = state.dailyRoutes
        .filter((route) => route.supplierId === state.auth.supplierId && route.driverId === state.auth.driverId && route.deliveryDate === todayString() && (route.status === 'published' || route.status === 'stale' || route.status === 'completed'))
        .sort((left, right) => (left.status === 'completed' ? 1 : 0) - (right.status === 'completed' ? 1 : 0) || (left.publishedAt || left.generatedAt).localeCompare(right.publishedAt || right.generatedAt) || left.id.localeCompare(right.id))
      return routes.find((route) => route.id === state.activeDriverRouteId) || routes[0] || null
    },
    pendingRouteTasks(): Order[] {
      const publishedIds = new Set(this.todayDriverRoutes.flatMap((route) => route.sourceOrderIds))
      return this.myTasks.filter((order) => !publishedIds.has(order.id))
    },
    myHistory: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return order.supplierId === state.auth.supplierId && fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && fulfillment.status === 'received'
      })
    },
    myHandovers: (state) => {
      const mine = (operatorId?: string) => operatorId === (state.auth.driverId || state.auth.supplierId)
      return state.orders.filter((order) => order.supplierId === state.auth.supplierId).flatMap((order) => (order.supplierFulfillment?.handovers || []).filter((item) => mine(item.operatorId)).map((item) => ({ ...item, customer: order.customer })))
        .sort((a, b) => b.time.localeCompare(a.time))
    },
    allHandovers: (state) => state.orders.filter((order) => order.supplierId === state.auth.supplierId).flatMap((order) => (order.supplierFulfillment?.handovers || []).map((item) => ({ ...item, customer: order.customer })))
      .sort((a, b) => b.time.localeCompare(a.time)),
    statusText: () => (status: string) => FULFILLMENT_STATUS_TEXT[status] || status,
    mySettlements: (state) => state.settlements.filter((item) => item.supplierIds.includes(state.auth.supplierId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    myCatalogProducts: (state) => state.catalogProducts.filter((item) => item.supplierId === state.auth.supplierId),
    myProductSubmissions: (state) => state.productSubmissions.filter((item) => item.supplierId === state.auth.supplierId)
  },
  actions: {
    async submitCatalogProduct(product: CatalogProduct): Promise<WriteResult<CatalogProductSubmission>> {
      const denied = (code: string, message: string): WriteResult<CatalogProductSubmission> => ({ ok: false, code, message })
      if (!this.auth.isLoggedIn || this.auth.role !== 'supplier') return denied('permission_denied', '无权提交商品')
      const supplier = this.suppliers.find((item) => item.id === this.auth.supplierId)
      const account = this.supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
      if (!supplierCanReceiveNewOrders(supplier, account)) return denied('supplier_inactive', '供应商已暂停合作，不能提交商品')
      if (product.supplierId !== this.auth.supplierId) return denied('supplier_mismatch', '只能提交当前供应商的商品')
      const catalog = readCatalogState()
      if (!catalog) return denied('catalog_unavailable', '商品目录不可用，请刷新后重试')
      const formal = catalog.products.find((item) => item.id === product.id)
      if (formal && formal.supplierId !== this.auth.supplierId) return denied('supplier_mismatch', '不能修改其他供应商的商品')
      const state = readCatalogProductSubmissionState()
      const submittedAt = new Date(Math.max(Date.now(), Date.parse(state?.updatedAt || '') + 1 || 0)).toISOString()
      const result = await createCatalogProductSubmission({
        id: createId('SUB-PRODUCT'), source: 'supplier', supplierId: this.auth.supplierId,
        kind: formal ? 'update' : 'create', draft: product, baseCatalogRevision: catalog.revision,
        submittedBy: this.auth.supplierId, submittedAt
      }, state?.revision ?? 0, {
        module: 'products', action: formal ? 'product.submission.update' : 'product.submission.create',
        actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier',
        targetType: 'catalog-product-submission', targetId: product.id,
        metadata: { productId: product.id, name: product.name }
      })
      if (result.ok) {
        const latest = readCatalogProductSubmissionState()
        this.productSubmissions = latest?.submissions ?? []
        this.productSubmissionRevision = latest?.revision ?? 0
      }
      return result
    },
    async adjustCatalogProductStock(productId: string, changes: Array<{ skuId: string; stock: number }>): Promise<WriteResult<CatalogProduct>> {
      const denied = (code: string, message: string): WriteResult<CatalogProduct> => ({ ok: false, code, message })
      if (!this.auth.isLoggedIn || this.auth.role !== 'supplier') return denied('permission_denied', '无权调整库存')
      const supplier = this.suppliers.find((item) => item.id === this.auth.supplierId)
      const account = this.supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
      if (!supplierCanReceiveNewOrders(supplier, account)) return denied('supplier_inactive', '供应商已暂停合作，不能调整库存')
      if (!Array.isArray(changes) || !changes.length || changes.some((item) => !item || Object.keys(item).some((key) => key !== 'skuId' && key !== 'stock') || !item.skuId?.trim() || !Number.isInteger(item.stock) || item.stock < 0)) return denied('invalid_payload', '库存调整参数无效')
      const catalogCollectionRevision = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
      const catalog = readCatalogState()
      const product = catalog?.products.find((item) => item.id === productId)
      if (!catalog || !product) return denied('not_found', '正式商品不存在')
      if (product.supplierId !== this.auth.supplierId) return denied('supplier_mismatch', '不能调整其他供应商的库存')
      const ids = new Set(changes.map((item) => item.skuId))
      if (ids.size !== changes.length || changes.some((item) => !product.skus.some((sku) => sku.id === item.skuId))) return denied('invalid_payload', '库存调整参数无效')
      const stockChanges = changes.map((item) => ({ productId, skuId: item.skuId, quantity: item.stock - product.skus.find((sku) => sku.id === item.skuId)!.stock })).filter((item) => item.quantity !== 0)
      if (!stockChanges.length) return { ok: true, value: cloneSeed(product) }
      const auditCollectionRevision = readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      const auditBefore = readPlatformJson<unknown>(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      let next = catalog
      const operationId = createId('OP-SUPPLIER-PRODUCT-STOCK')
      const result = await runLockedPlatformTransaction({
        operationId, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: catalog, target: changes,
        revisionChecks: [
          { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: catalogCollectionRevision },
          { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: auditCollectionRevision }
        ],
        steps: [
          { key: 'catalog-stock', apply: () => {
            const applied = applyCatalogStockOperation(operationId, stockChanges, catalog.revision)?.state
            if (!applied) return false
            next = applied
            return true
          }, rollback: () => writeCatalogState(catalog, next.revision) },
          { key: 'audit', apply: () => appendPlatformAuditLog({ module: 'products', action: 'product.stock.adjust', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'catalog-product', targetId: productId, result: 'success', operationId, metadata: { skus: changes.map((item) => ({ skuId: item.skuId, stock: item.stock })) } }), rollback: () => auditBefore === null ? (clearPlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY), true) : writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, auditBefore) }
        ]
      })
      if (!result.ok) return result as WriteResult<CatalogProduct>
      this.catalogProducts = next.products
      this.catalogRevision = next.revision
      return { ok: true, value: cloneSeed(next.products.find((item) => item.id === productId)!), operationId }
    },
    async toggleCatalogProduct(productId: string): Promise<WriteResult<CatalogProduct>> {
      const denied = (code: string, message: string): WriteResult<CatalogProduct> => ({ ok: false, code, message })
      if (!this.auth.isLoggedIn || this.auth.role !== 'supplier') return denied('permission_denied', '无权变更商品状态')
      const supplier = this.suppliers.find((item) => item.id === this.auth.supplierId)
      const account = this.supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
      if (!supplierCanReceiveNewOrders(supplier, account)) return denied('supplier_inactive', '供应商已暂停合作，不能变更商品状态')
      const catalogCollectionRevision = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
      const catalog = readCatalogState()
      const product = catalog?.products.find((item) => item.id === productId)
      if (!catalog || !product) return denied('not_found', '正式商品不存在')
      if (product.supplierId !== this.auth.supplierId) return denied('supplier_mismatch', '不能变更其他供应商的商品')
      if (product.status !== 'active' && product.status !== 'offline') return denied('invalid_status', '商品状态不可变更')
      const payload = { ...cloneSeed(product), status: product.status === 'active' ? 'offline' as const : 'active' as const }
      const auditCollectionRevision = readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      const auditBefore = readPlatformJson<unknown>(PLATFORM_AUDIT_LOG_STORAGE_KEY)
      let next = catalog
      const operationId = createId('OP-SUPPLIER-PRODUCT-STATUS')
      const result = await runLockedPlatformTransaction({
        operationId, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: catalog, target: payload,
        revisionChecks: [
          { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: catalogCollectionRevision },
          { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: auditCollectionRevision }
        ],
        steps: [
          { key: 'catalog-product', apply: () => {
            const saved = persistCatalogProduct(payload, catalog.revision)
            if (!saved) return false
            next = saved
            return true
          }, rollback: () => writeCatalogState(catalog, next.revision) },
          { key: 'audit', apply: () => appendPlatformAuditLog({ module: 'products', action: 'product.status', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'catalog-product', targetId: productId, result: 'success', operationId, metadata: { status: payload.status } }), rollback: () => auditBefore === null ? (clearPlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY), true) : writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, auditBefore) }
        ]
      })
      if (!result.ok) return result as WriteResult<CatalogProduct>
      this.catalogProducts = next.products
      this.catalogRevision = next.revision
      return { ok: true, value: cloneSeed(payload), operationId }
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        initializePlatformRecoveryHandlers([...createSupplierAtomicRecoveryHandlerRegistrations(), createCatalogProductReviewRecoveryHandlerRegistration()])
        const productReviewReconciliation = reconcilePendingPlatformTransactions({ handlerKey: CATALOG_PRODUCT_REVIEW_RECOVERY_HANDLER_KEY })
        if (!productReviewReconciliation.ok) throw new Error(productReviewReconciliation.message)
        const routingReconciliation = reconcilePendingPlatformTransactions({ handlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, matches: isSupplierRoutingJournal })
        if (!routingReconciliation.ok) throw new Error(routingReconciliation.message)
        const reconciliation = reconcilePendingPlatformTransactions({ handlerKey: SUPPLIER_FULFILLMENT_RECOVERY_HANDLER_KEY, matches: isSupplierFulfillmentJournal })
        if (!reconciliation.ok) throw new Error(reconciliation.message)
        seedSupplierDataOnce()
        const supplierDirectory = migrateLegacySupplierWarehouse(mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers))
        const supplierAccounts = mergePlatformSupplierAccounts(buildSupplierAccountSeeds(supplierDirectory), readPlatformSupplierAccounts())
        const drivers = mergePlatformDrivers(cloneSeed(demoDrivers), readPlatformDrivers())
        const platformOrders = readPlatformOrders()
        const orders = platformOrders
          ? Object.values(platformOrders).filter((order) => order.channel === 'purchase' && order.status !== 'pending-payment').map((order) => ({ ...order, supplierFulfillment: order.supplierFulfillment ? { ...order.supplierFulfillment, handovers: [...(order.supplierFulfillment.handovers || [])], shortages: [...(order.supplierFulfillment.shortages || [])] } : undefined }))
          : []
        orders.forEach((order) => {
          if (!order.supplierFulfillment) order.supplierFulfillment = ensureSupplierFulfillment(order)
          const fulfillment = order.supplierFulfillment
          if (fulfillment.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering') && !fulfillment.deliverDate) {
            fulfillment.deliverDate = todayString()
          }
        })
        orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        await migrateLegacyDriverScopes(drivers, orders)
        seedDemoNamedRoutes()
        const settlements = Object.values(readPlatformSupplierSettlements() || {})
        const catalog = readCatalogState()
        const productSubmissionState = readCatalogProductSubmissionState()
        const driverScopeState = readDriverStoreScopeState()
        const dailyRouteState = readDailyDeliveryRouteState()
        this.$patch({
          suppliers: supplierDirectory, supplierAccounts, drivers, orders, settlements,
          platformOrdersRevision: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY),
          cOrdersRevision: readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY),
          catalogProducts: catalog?.products ?? [],
          catalogRevision: catalog?.revision ?? 0,
          productSubmissions: productSubmissionState?.submissions ?? [],
          productSubmissionRevision: productSubmissionState?.revision ?? 0,
          driverScopes: driverScopeState?.scopes ?? [],
          driverScopeRevision: readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY),
          namedRoutes: readNamedDeliveryRoutes(),
          namedRouteRevision: readNamedDeliveryRouteState()?.revision ?? 0,
          dailyRoutes: dailyRouteState?.routes ?? [],
          dailyRouteRevision: readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY),
          initialized: true
        })
        if (this.auth.isLoggedIn) {
          const account = supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
          const supplier = supplierDirectory.find((item) => item.id === this.auth.supplierId)
          if (this.auth.role === 'supplier') {
            if (!supplierCanLogin(supplier, account) || account?.account !== this.auth.account || account.updatedAt !== this.auth.credentialUpdatedAt) this.logout()
            else this.auth.name = supplier!.name
          } else {
            const driver = drivers.find((item) => item.id === this.auth.driverId && item.supplierId === this.auth.supplierId)
            if (!supplierCanLogin(supplier, account) || !driver || driver.status !== 'active' || driver.account !== this.auth.account) this.logout()
            else this.auth.name = driver.name
          }
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    async refreshSharedState() {
      await this.initialize(true)
      const reconciled = await reconcilePublishedRouteInputs(this.dailyRoutes, this.orders, this.suppliers, this.driverScopes)
      this.routeReconcileWarning = reconciled.ok ? '' : reconciled.message
      const routeState = readDailyDeliveryRouteState()
      this.dailyRoutes = routeState?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
    },
    selectDriverRoute(routeId: string): boolean {
      if (this.auth.role !== 'driver' || !this.todayDriverRoutes.some((route) => route.id === routeId)) return false
      this.activeDriverRouteId = routeId
      return true
    },
    invalidateRoutePreview() {
      this.routeDraft = null
    },
    assignableDriversForOrder(order: Order): DriverAccount[] {
      if (this.auth.role !== 'supplier' || order.supplierId !== this.auth.supplierId) return []
      const destination = resolveOrderStore(order)
      if (!destination) {
        this.error = '门店缺少稳定编号，请先维护门店资料'
        return []
      }
      return this.drivers.filter((driver) => driver.supplierId === this.auth.supplierId && driver.status === 'active'
        && this.driverAssignableStoreIds(driver.id).includes(destination.storeId))
    },
    driverAssignableStoreIds(driverId: string): string[] {
      const named = this.namedRoutes.find((route) => route.supplierId === this.auth.supplierId && route.driverId === driverId)
      if (named) return named.storeIds
      return this.driverScopes.find((scope) => scope.supplierId === this.auth.supplierId && scope.driverId === driverId)?.storeIds || []
    },
    async updateDriverScope(driverId: string, storeIds: string[]): Promise<WriteResult<DriverStoreScope>> {
      const denied = (code: string, message: string): WriteResult<DriverStoreScope> => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier') return denied('permission_denied', '无权配置司机范围')
      const driver = this.drivers.find((item) => item.id === driverId && item.supplierId === this.auth.supplierId)
      const normalizedIds = [...new Set(storeIds.map((id) => id.trim()).filter(Boolean))].sort()
      if (!driver || normalizedIds.some((id) => !storeDirectory[id])) return denied('invalid_scope', '司机或门店范围无效')
      const current = this.driverScopes.find((scope) => scope.supplierId === this.auth.supplierId && scope.driverId === driverId)
      if (readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY) !== this.driverScopeRevision) return denied('revision_conflict', '数据已更新，请刷新后重试')
      if (current && JSON.stringify(current.storeIds) === JSON.stringify(normalizedIds)) return { ok: true, value: cloneSeed(current) }
      const routeRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      const routeState = readDailyDeliveryRouteState()
      const stalePreview = staleRouteState(routeState, this.auth.supplierId, [driverId], todayString(), 'from')
      const collections = [PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(stalePreview.stale.length ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
      const original = readSupplierRoutingSnapshot(collections)
      const scope: DriverStoreScope = { supplierId: this.auth.supplierId, driverId, storeIds: normalizedIds, updatedAt: timestampAfter(original.driverScopes?.updatedAt) }
      const stale = stalePreview.stale.length ? staleRouteState(original.dailyRoutes, this.auth.supplierId, [driverId], todayString(), 'from') : stalePreview
      const target: SupplierRoutingSnapshot = {
        ...cloneSeed(original), driverScopes: nextScopeState(original.driverScopes, scope), ...(stale.stale.length ? { dailyRoutes: stale.state } : {}),
        auditLogs: routingAuditEntries(original.auditLogs, [
          { module: 'routing', action: 'driver.scope.update', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'driver', targetId: driverId, metadata: { storeIds: normalizedIds } },
          ...stale.stale.map((route) => ({ module: 'routing', action: 'route.stale', actorId: this.auth.supplierId, actorRole: 'system', targetType: 'daily-delivery-route', targetId: route.id, metadata: { driverId: route.driverId, deliveryDate: route.deliveryDate } }))
        ])
      }
      const revisions = routingRevisionToken(collections)
      const result = await runLockedPlatformTransaction({
        operationId: createId('OP-DRIVER-SCOPE'), collections, lockCollections: [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY], original, target,
        recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA, value: scope,
        revisionChecks: [
          { key: PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, expectedRevision: this.driverScopeRevision },
          { key: PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: routeRevision },
          { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }
        ],
        steps: [
          { key: 'driver-scope', apply: () => writePlatformJson(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, target.driverScopes, revisions[PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, original.driverScopes, target.driverScopes) },
          ...(stale.stale.length ? [{ key: 'routes-stale', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, target.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes, target.dailyRoutes) }] : []),
          { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
        ]
      })
      if (!result.ok) return result as WriteResult<DriverStoreScope>
      const state = readDriverStoreScopeState()
      this.driverScopes = state?.scopes ?? []
      this.driverScopeRevision = readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)
      const namedRoutes = namedRoutesForDriver(this.auth.supplierId, driverId)
      if (namedRoutes.length === 1) {
        const named = namedRoutes[0]
        const namedState = readNamedDeliveryRouteState()
        saveNamedDeliveryRoute({ ...named, storeIds: normalizedIds, updatedAt: timestampAfter(namedState?.updatedAt) }, namedState?.revision ?? 0)
      }
      this.namedRoutes = readNamedDeliveryRoutes()
      this.namedRouteRevision = readNamedDeliveryRouteState()?.revision ?? 0
      const routes = readDailyDeliveryRouteState()
      this.dailyRoutes = routes?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return { ok: true, value: cloneSeed(scope), operationId: result.operationId }
    },
    async saveNamedRoute(input: { id?: string; name: string; storeIds: string[]; driverId?: string }): Promise<WriteResult<NamedDeliveryRoute>> {
      const denied = (code: string, message: string): WriteResult<NamedDeliveryRoute> => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier') return denied('permission_denied', '无权维护线路')
      const name = input.name.trim()
      const storeIds = [...new Set(input.storeIds.map((id) => id.trim()).filter(Boolean))]
      if (!name || storeIds.some((id) => !storeDirectory[id])) return denied('invalid_route', '线路名称或门店无效')
      if (input.driverId) {
        const driver = this.drivers.find((item) => item.id === input.driverId && item.supplierId === this.auth.supplierId && item.status === 'active')
        if (!driver) return denied('invalid_driver', '只能指派启用中的司机')
      }
      const previous = input.id ? this.namedRoutes.find((route) => route.id === input.id && route.supplierId === this.auth.supplierId) : undefined
      const route: NamedDeliveryRoute = {
        id: previous?.id || createId('NR'),
        supplierId: this.auth.supplierId,
        name,
        storeIds,
        ...(input.driverId ? { driverId: input.driverId } : {}),
        updatedAt: timestampAfter(readNamedDeliveryRouteState()?.updatedAt)
      }
      const saved = saveNamedDeliveryRoute(route, this.namedRouteRevision)
      if (!saved.ok) {
        if (saved.code === 'route_store_conflict') {
          const conflict = saved.message.match(/门店「([^」]+)」已在线路「([^」]+)」中/)
          const storeId = conflict?.[1]
          const routeName = conflict?.[2]
          const conflictStore = storeId ? storeDirectory[storeId]?.storeName : undefined
          if (conflictStore && routeName) return denied(saved.code, `门店「${conflictStore}」已在线路「${routeName}」中`)
        }
        return denied(saved.code, saved.message)
      }
      if (!saved.value) return denied('write_failed', '线路保存失败')
      const affectedDrivers = [...new Set([previous?.driverId, route.driverId].filter(Boolean))] as string[]
      if (affectedDrivers.length) {
        const routeState = readDailyDeliveryRouteState()
        const stale = staleRouteState(routeState, this.auth.supplierId, affectedDrivers, todayString(), 'from')
        if (stale.stale.length) writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, stale.state)
      }
      this.namedRoutes = readNamedDeliveryRoutes()
      this.namedRouteRevision = readNamedDeliveryRouteState()?.revision ?? 0
      const routes = readDailyDeliveryRouteState()
      this.dailyRoutes = routes?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      this.invalidateRoutePreview()
      return { ok: true, value: cloneSeed(saved.value) }
    },
    async optimizeNamedRoute(input: { namedRouteId: string; driverId: string; deliveryDate: string }): Promise<WriteResult<DailyDeliveryRoute>> {
      const failed = (code: string, message: string): WriteResult<DailyDeliveryRoute> => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier') return failed('permission_denied', '无权规划线路')
      const baselineRevisions = {
        routes: readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY),
        orders: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY),
        scopes: readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY),
        entities: readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY),
        namedRoutes: readPlatformCollectionRevision(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY),
        drivers: readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY)
      }
      const inputsStillCurrent = () => baselineRevisions.routes === readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
        && baselineRevisions.orders === readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
        && baselineRevisions.entities === readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
        && baselineRevisions.namedRoutes === readPlatformCollectionRevision(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY)
        && baselineRevisions.drivers === readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY)
      const named = this.namedRoutes.find((route) => route.id === input.namedRouteId && route.supplierId === this.auth.supplierId)
      const driver = this.drivers.find((item) => item.id === input.driverId && item.supplierId === this.auth.supplierId && item.status === 'active')
      if (!named || !driver || !/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) return failed('invalid_route_input', '线路、司机或配送日期无效')
      if (named.driverId && named.driverId !== driver.id) return failed('invalid_driver', '请选择该线路已绑定的司机')
      const warehouse = supplierWarehouseOf(this.auth.supplierId, mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers))
      if (warehouse?.longitude === undefined || warehouse.latitude === undefined) return failed('warehouse_coordinates_missing', '请先维护仓点坐标')
      const resolved = Object.values(readPlatformOrders() || {}).flatMap((order) => {
        const fulfillment = order.supplierFulfillment
        if (order.supplierId !== this.auth.supplierId || fulfillment?.status !== 'accepted' || fulfillment.driverId
          || order.supplierOrderLink?.source === 'c-mall' || order.supplierOrderLink?.source === 'farmhouse-courier') return []
        const destination = resolveOrderStore(order)
        return destination && named.storeIds.includes(destination.storeId) ? [{ order, store: destination }] : []
      })
      if (!inputsStillCurrent()) return failed('revision_conflict', '线路输入已更新，请重新生成')
      if (!resolved.length) return failed('no_tasks', '该线路没有待配送订单')
      const stops = orderStopsByNamedRoute(named.storeIds, mergeDeliveryOrdersByStore(resolved.map(({ order, store }) => ({
        orderId: order.id, storeId: store.storeId, storeName: store.storeName, address: store.address,
        longitude: store.longitude, latitude: store.latitude
      })))).stops
      let optimized
      try {
        optimized = await getPlatformProviders().routeOptimization.optimize({
          origin: { longitude: warehouse.longitude, latitude: warehouse.latitude }, stops, preserveStopOrder: true
        })
      } catch {
        return failed('route_provider_failed', '线路服务不可用，请重试')
      }
      if (!optimized.ok) return failed(optimized.code, optimized.message)
      if (!optimized.value) return failed('route_provider_failed', '线路规划失败，请重试')
      if (!inputsStillCurrent()) return failed('revision_conflict', '线路输入已更新，请重新生成')
      const validated = validatedRouteOptimizationOutput(stops, optimized.value)
      if (!validated || validated.orderedStops.some((stop, index) => stop.storeId !== stops[index]?.storeId)) return failed('route_provider_invalid', '线路服务返回了无效任务顺序，请重试')
      const generatedAt = timestampAfter(this.routeDraft?.generatedAt)
      const draft = snapshotDailyDeliveryRoute({
        id: `ROUTE-${this.auth.supplierId}-${named.id}-${input.deliveryDate}`,
        supplierId: this.auth.supplierId, driverId: driver.id, deliveryDate: input.deliveryDate, status: 'draft',
        namedRouteId: named.id,
        stops: validated.orderedStops, totalDistanceKm: validated.totalDistanceKm, estimatedDurationMinutes: validated.estimatedDurationMinutes,
        sourceOrderIds: resolved.map(({ order }) => order.id).sort(), provider: validated.provider, segments: validated.segments,
        warnings: validated.warnings, origin: { longitude: warehouse.longitude, latitude: warehouse.latitude },
        polyline: validated.polyline, scopeStoreIds: cloneSeed(named.storeIds), baselineRevisions, generatedAt
      })
      this.routeDraft = draft
      appendPlatformAuditLog({ module: 'routing', action: 'route.optimize', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'daily-delivery-route', targetId: draft.id, result: 'success', metadata: { namedRouteId: named.id, driverId: driver.id, deliveryDate: input.deliveryDate, sourceOrderIds: draft.sourceOrderIds } })
      return { ok: true, value: cloneSeed(draft) }
    },
    async optimizeDriverRoute(driverId: string, deliveryDate: string): Promise<WriteResult<DailyDeliveryRoute>> {
      const failed = (code: string, message: string): WriteResult<DailyDeliveryRoute> => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier') return failed('permission_denied', '无权规划线路')
      const baselineRevisions = {
        routes: readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY),
        orders: readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY),
        scopes: readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY),
        entities: readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      }
      const inputsStillCurrent = () => baselineRevisions.routes === readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
        && baselineRevisions.orders === readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
        && baselineRevisions.scopes === readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)
        && baselineRevisions.entities === readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const driver = this.drivers.find((item) => item.id === driverId && item.supplierId === this.auth.supplierId && item.status === 'active')
      if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return failed('invalid_route_input', '司机或配送日期无效')
      const supplierDirectory = mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers)
      const warehouse = supplierWarehouseOf(this.auth.supplierId, supplierDirectory)
      if (warehouse?.longitude === undefined || warehouse.latitude === undefined) return failed('warehouse_coordinates_missing', '请先维护仓点坐标')
      const orders = Object.values(readPlatformOrders() || {}).filter((order) => {
        const fulfillment = order.supplierFulfillment
        return order.supplierId === this.auth.supplierId && fulfillment?.driverId === driverId && fulfillment.shipType === 'driver'
          && fulfillment.deliverDate === deliveryDate && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
      })
      const named = namedRouteForDriver(this.auth.supplierId, driverId)
      const scopeStoreIds = cloneSeed(named?.storeIds || readDriverStoreScopes(this.auth.supplierId, driverId)[0]?.storeIds || [])
      if (!inputsStillCurrent()) return failed('revision_conflict', '线路输入已更新，请重新生成')
      if (!orders.length) return failed('no_tasks', '该司机当天没有待配送任务')
      const resolved = orders.map((order) => ({ order, store: resolveOrderStore(order) }))
      if (resolved.some((item) => !item.store)) return failed('store_identity_missing', '门店缺少稳定编号，请先维护门店资料')
      const mergedStops = mergeDeliveryOrdersByStore(resolved.map(({ order, store }) => ({
        orderId: order.id, storeId: store!.storeId, storeName: store!.storeName, address: store!.address,
        longitude: store!.longitude, latitude: store!.latitude
      })))
      const namedOrder = named ? orderStopsByNamedRoute(named.storeIds, mergedStops) : { stops: mergedStops, warnings: [] as string[] }
      const stops = namedOrder.stops
      let optimized
      try {
        optimized = await getPlatformProviders().routeOptimization.optimize({ origin: { longitude: warehouse.longitude, latitude: warehouse.latitude }, stops })
      } catch {
        return failed('route_provider_failed', '线路服务不可用，请重试')
      }
      if (!optimized.ok) return failed(optimized.code || 'route_provider_failed', optimized.message || '线路规划失败，请重试')
      if (!optimized.value) return failed('route_provider_failed', '线路规划失败，请重试')
      if (!inputsStillCurrent()) return failed('revision_conflict', '线路输入已更新，请重新生成')
      const validated = validatedRouteOptimizationOutput(stops, optimized.value)
      if (!validated) return failed('route_provider_invalid', '线路服务返回了无效任务顺序，请重试')
      const ordered = named ? orderStopsByNamedRoute(named.storeIds, validated.orderedStops) : { stops: validated.orderedStops, warnings: [] as string[] }
      const metrics = routeMetrics({ longitude: warehouse.longitude, latitude: warehouse.latitude }, ordered.stops)
      const generatedAt = timestampAfter(this.routeDraft?.generatedAt)
      const draft = snapshotDailyDeliveryRoute({
        id: `ROUTE-${this.auth.supplierId}-${driverId}-${deliveryDate}`, supplierId: this.auth.supplierId, driverId, deliveryDate, status: 'draft',
        stops: ordered.stops, totalDistanceKm: metrics.totalDistanceKm, estimatedDurationMinutes: metrics.estimatedDurationMinutes,
        sourceOrderIds: orders.map((order) => order.id).sort(), provider: validated.provider, segments: metrics.segments,
        warnings: [...new Set([...(validated.warnings || []), ...namedOrder.warnings, ...ordered.warnings])], origin: { longitude: warehouse.longitude, latitude: warehouse.latitude },
        polyline: validated.polyline, scopeStoreIds, baselineRevisions, generatedAt
      })
      this.routeDraft = draft
      appendPlatformAuditLog({ module: 'routing', action: 'route.optimize', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'daily-delivery-route', targetId: draft.id, result: 'success', metadata: { driverId, deliveryDate, sourceOrderIds: draft.sourceOrderIds } })
      return { ok: true, value: cloneSeed(draft) }
    },
    moveRouteStop(index: number, direction: -1 | 1): boolean {
      if (this.auth.role !== 'supplier' || !this.routeDraft) return false
      const target = index + direction
      if (index < 0 || target < 0 || index >= this.routeDraft.stops.length || target >= this.routeDraft.stops.length) return false
      const stops = cloneSeed(this.routeDraft.stops)
      ;[stops[index], stops[target]] = [stops[target], stops[index]]
      const warehouse = supplierWarehouseOf(this.auth.supplierId, this.suppliers) || {}
      const metrics = routeMetrics(warehouse, stops)
      const next = snapshotDailyDeliveryRoute({ ...this.routeDraft, stops, ...metrics, provider: 'manual', polyline: undefined, generatedAt: timestampAfter(this.routeDraft.generatedAt) })
      if (!appendPlatformAuditLog({ module: 'routing', action: 'route.reorder', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'daily-delivery-route', targetId: next.id, result: 'success', metadata: { storeIds: stops.map((stop) => stop.storeId) } })) return false
      this.routeDraft = next
      return true
    },
    async publishRoute(): Promise<WriteResult<DailyDeliveryRoute>> {
      const failed = (code: string, message: string): WriteResult<DailyDeliveryRoute> => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier' || !this.routeDraft || this.routeDraft.supplierId !== this.auth.supplierId) return failed('invalid_route', '没有可发布的线路草稿')
      const draft = cloneSeed(this.routeDraft)
      if (!draft.baselineRevisions) return failed('revision_conflict', '线路草稿已过期，请重新生成')
      if (draft.namedRouteId) {
        const named = readNamedDeliveryRoutes(draft.supplierId).find((route) => route.id === draft.namedRouteId)
        if (!named || JSON.stringify(named.storeIds) !== JSON.stringify(draft.scopeStoreIds || [])) return failed('revision_conflict', '线路或订单已更新，请重新生成')
      }
      const liveDriversRevision = readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY)
      const liveNamedRoutesRevision = readPlatformCollectionRevision(PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY)
      const activeDriver = (readPlatformDrivers() || []).find((driver) => driver.id === draft.driverId && driver.supplierId === draft.supplierId && driver.status === 'active')
      if (!activeDriver) return failed('invalid_driver', '线路司机已停用，请重新选择')
      const liveOrders = readPlatformOrders() || {}
      const sourceOrders = draft.sourceOrderIds.map((orderId) => liveOrders[orderId])
      if (sourceOrders.some((order) => !order)) return failed('revision_conflict', '线路订单已更新，请重新生成')
      const routeFirstPublish = sourceOrders.every((order) => order.supplierFulfillment?.status === 'accepted' && !order.supplierFulfillment.driverId)
      const legacyPublish = sourceOrders.every((order) => order.supplierFulfillment?.driverId === draft.driverId
        && order.supplierFulfillment.shipType === 'driver' && order.supplierFulfillment.deliverDate === draft.deliveryDate
        && ['shipped', 'delivering'].includes(order.supplierFulfillment.status))
      if (!routeFirstPublish && !legacyPublish) return failed('revision_conflict', '部分订单已被其他线路处理，请重新生成')
      const collections = [...(routeFirstPublish ? [PLATFORM_ORDERS_STORAGE_KEY] : []), PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
      const original = readSupplierRoutingSnapshot(collections)
      const publishedAt = timestampAfter(original.dailyRoutes?.updatedAt)
      const published: DailyDeliveryRoute = { ...draft, status: 'published', generatedAt: publishedAt, publishedAt }
      const routes = cloneSeed(original.dailyRoutes?.routes || [])
      const routeIndex = routes.findIndex((route) => route.id === published.id)
      if (routeIndex >= 0) routes[routeIndex] = published
      else routes.push(published)
      routes.sort((left, right) => left.id.localeCompare(right.id))
      const routeState: DailyDeliveryRouteState = { schemaVersion: 1, revision: (original.dailyRoutes?.revision ?? 0) + 1, routes, updatedAt: publishedAt }
      const assignedOrders = routeFirstPublish
        ? Object.fromEntries(sourceOrders.map((order) => {
          const assigned = assignSupplierDriver(order, activeDriver, this.auth.name || supplierInfo.name, draft.deliveryDate)
          return [order.id, assigned]
        }))
        : {}
      if (routeFirstPublish && Object.values(assignedOrders).some((order) => !order)) return failed('invalid_route', '线路订单无法进入配送')
      const target: SupplierRoutingSnapshot = {
        ...cloneSeed(original),
        ...(routeFirstPublish ? { platformOrders: { ...original.platformOrders, ...assignedOrders } as Record<string, Order> } : {}),
        dailyRoutes: routeState,
        auditLogs: routingAuditEntries(original.auditLogs, [{ module: 'routing', action: 'route.publish', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'daily-delivery-route', targetId: published.id, metadata: { driverId: published.driverId, deliveryDate: published.deliveryDate, revision: routeState.revision } }])
      }
      const revisions = routingRevisionToken(collections)
      const result = await runLockedPlatformTransaction({
        operationId: createId('OP-ROUTE-PUBLISH'), collections, lockCollections: [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY], original, target,
        recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA, value: published,
        revisionChecks: [
          { key: PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: draft.baselineRevisions.routes },
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: draft.baselineRevisions.orders },
          { key: PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, expectedRevision: draft.baselineRevisions.scopes },
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: draft.baselineRevisions.entities },
          { key: PLATFORM_DRIVERS_STORAGE_KEY, expectedRevision: draft.baselineRevisions.drivers ?? liveDriversRevision },
          { key: PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: draft.baselineRevisions.namedRoutes ?? liveNamedRoutesRevision },
          { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }
        ],
        steps: [
          ...(routeFirstPublish ? [{ key: 'platform-orders', apply: () => writePlatformOrders(target.platformOrders), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_ORDERS_STORAGE_KEY, original.platformOrders, target.platformOrders) }] : []),
          { key: 'route', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, target.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes, target.dailyRoutes) },
          { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
        ]
      })
      if (!result.ok) return failed(result.code, result.message)
      if (!result.value) return failed('write_failed', '线路发布失败')
      const state = readDailyDeliveryRouteState()
      this.dailyRoutes = state?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      if (routeFirstPublish) {
        this.orders = Object.values(readPlatformOrders() || {}).filter((order) => order.channel === 'purchase').sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        this.platformOrdersRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
      }
      this.routeDraft = cloneSeed(result.value)
      return { ok: true, value: cloneSeed(result.value) }
    },
    async ensureTodayRoutes(): Promise<WriteResult<{ generated: number }>> {
      const failed = (code: string, message: string): WriteResult<{ generated: number }> => ({ ok: false, code, message })
      if (!this.auth.isLoggedIn || !this.auth.supplierId) return failed('not_logged_in', '请先登录')
      const warehouse = supplierWarehouseOf(this.auth.supplierId, this.suppliers)
      const result = await ensurePublishedRoutesForDate({
        supplierId: this.auth.supplierId,
        date: todayString(),
        drivers: this.drivers,
        orders: this.orders,
        warehouse: warehouse?.longitude !== undefined && warehouse.latitude !== undefined
          ? { longitude: warehouse.longitude, latitude: warehouse.latitude }
          : undefined,
        scopes: this.driverScopes,
        namedRoutes: this.namedRoutes,
        resolveStore: (order) => resolveOrderStore(order)
      })
      const state = readDailyDeliveryRouteState()
      this.dailyRoutes = state?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return { ok: true, value: { generated: result.generated.length } }
    },
    async updateWarehouse(input: { address: string; longitude?: number; latitude?: number; contactName?: string; contactPhone?: string }): Promise<WriteResult> {
      const failed = (code: string, message: string): WriteResult => ({ ok: false, code, message })
      if (this.auth.role !== 'supplier') return failed('permission_denied', '无权维护仓点')
      const address = input.address.trim()
      const contactName = input.contactName?.trim() || ''
      const contactPhone = input.contactPhone?.trim() || ''
      const hasLongitude = input.longitude !== undefined
      const hasLatitude = input.latitude !== undefined
      if (!address || (!!contactPhone && !validatePhone(contactPhone)) || hasLongitude !== hasLatitude || (hasLongitude && (!Number.isFinite(input.longitude) || !Number.isFinite(input.latitude) || input.longitude! < -180 || input.longitude! > 180 || input.latitude! < -90 || input.latitude! > 90))) return failed('invalid_warehouse', contactPhone && !validatePhone(contactPhone) ? '请输入正确的11位联系人手机号' : '仓点地址或坐标无效')
      const locked = await runLockedPlatformCollectionTask<{ result: WriteResult; updated?: Supplier }>({
        collections: [
          PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY,
          PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY
        ],
        execute: () => {
          const routeRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
          const routeState = readDailyDeliveryRouteState()
          const routeDriverIds = (routeState?.routes || []).filter((route) => route.supplierId === this.auth.supplierId).map((route) => route.driverId)
          const stalePreview = staleRouteState(routeState, this.auth.supplierId, routeDriverIds, todayString(), 'from')
          const collections = [PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(stalePreview.stale.length ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
          const original = readSupplierRoutingSnapshot(collections)
          const persistedSupplier = original.entities?.suppliers?.[this.auth.supplierId]
          if (!persistedSupplier) return { result: failed('supplier_not_found', '供应商资料不存在') }
          const updated: Supplier = { ...persistedSupplier, warehouse: { address, ...(contactName ? { contactName } : {}), ...(contactPhone ? { contactPhone } : {}), ...(hasLongitude ? { longitude: input.longitude, latitude: input.latitude } : {}), coordinateSystem: 'GCJ-02' } }
          const entities: PlatformEntities = {
            ...(original.entities || { updatedAt: '' }),
            suppliers: { ...(original.entities?.suppliers || {}), [updated.id]: updated },
            updatedAt: timestampAfter(original.entities?.updatedAt)
          }
          const stale = stalePreview.stale.length ? staleRouteState(original.dailyRoutes, this.auth.supplierId, routeDriverIds, todayString(), 'from') : stalePreview
          const target: SupplierRoutingSnapshot = {
            ...cloneSeed(original), entities, ...(stale.stale.length ? { dailyRoutes: stale.state } : {}),
            auditLogs: routingAuditEntries(original.auditLogs, [
              { module: 'routing', action: 'warehouse.update', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'supplier', targetId: updated.id, metadata: { address, hasCoordinates: hasLongitude, contactName, contactPhone } },
              ...stale.stale.map((route) => ({ module: 'routing', action: 'route.stale', actorId: this.auth.supplierId, actorRole: 'system', targetType: 'daily-delivery-route', targetId: route.id, metadata: { driverId: route.driverId, deliveryDate: route.deliveryDate } }))
            ])
          }
          const revisions = routingRevisionToken(collections)
          const operationId = createId('OP-WAREHOUSE')
          const transaction = runPlatformTransaction({
            operationId, collections, original, target,
            recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA,
            revisionChecks: [
              { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: revisions[PLATFORM_ENTITIES_STORAGE_KEY] },
              { key: PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: routeRevision },
              { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }
            ],
            steps: [
              { key: 'warehouse', apply: () => writePlatformJson(PLATFORM_ENTITIES_STORAGE_KEY, target.entities, revisions[PLATFORM_ENTITIES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_ENTITIES_STORAGE_KEY, original.entities, target.entities) },
              ...(stale.stale.length ? [{ key: 'routes-stale', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, target.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes, target.dailyRoutes) }] : []),
              { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
            ]
          })
          if (!transaction.ok) {
            return { result: {
              ok: false, code: transaction.reason === 'revision-conflict' ? 'revision_conflict' : (transaction.reason || 'transaction-failed').replace(/-/g, '_'),
              message: transaction.reason === 'revision-conflict' ? '数据已更新，请刷新后重试' : '事务未完成，请重试或在恢复中心处理',
              operationId, failedStep: transaction.failedStep, recoveryQueued: transaction.recoveryQueued, fatal: transaction.fatal
            } }
          }
          return { result: { ok: true, operationId }, updated }
        }
      })
      if (!locked.ok) return failed(locked.code, locked.message)
      if (!locked.value) return failed('write_failed', '仓点保存失败')
      if (!locked.value.result.ok) return locked.value.result
      const updated = locked.value.updated
      if (!updated) return failed('write_failed', '仓点保存失败')
      this.suppliers = this.suppliers.map((item) => item.id === updated.id ? updated : item)
      const routes = readDailyDeliveryRouteState()
      this.dailyRoutes = routes?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return { ok: true }
    },
    loginSupplier(account: string, password: string) {
      const result = authenticateSupplier(this.supplierAccounts, this.suppliers, account, password)
      if (!result.ok) {
        this.loginError = result.reason === 'inactive' ? '账号暂不可登录，请联系平台管理员' : '账号或密码错误'
        return false
      }
      this.auth = {
        isLoggedIn: true,
        role: 'supplier',
        account: result.account.account,
        name: result.supplier.name,
        supplierId: result.supplier.id,
        credentialUpdatedAt: result.account.updatedAt
      }
      this.loginError = ''
      return true
    },
    loginDriver(account: string, password: string) {
      const driver = findDriverByAccount(this.drivers, account)
      if (driver && driver.status === 'disabled') {
        this.loginError = '账号已停用，请联系供应商'
        return false
      }
      const active = findActiveDriver(this.drivers, account, password)
      if (!active) {
        this.loginError = '账号或密码错误'
        return false
      }
      const supplier = this.suppliers.find((item) => item.id === active.supplierId)
      const supplierAccount = this.supplierAccounts.find((item) => item.supplierId === active.supplierId)
      if (!supplierCanLogin(supplier, supplierAccount)) {
        this.loginError = '所属供应商账号已冻结，请联系平台管理员'
        return false
      }
      this.auth = { isLoggedIn: true, role: 'driver', account: active.account, name: active.name, supplierId: active.supplierId, driverId: active.id }
      this.activeDriverRouteId = ''
      this.loginError = ''
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, role: null, account: '', name: '', supplierId: SUPPLIER_DEMO_ID }
      this.loginError = ''
      this.activeDriverRouteId = ''
    },
    async markShortageHandled(orderId: string, skuId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      return order ? await this.commitOrder(markShortageHandled(order, skuId, this.auth.name || supplierInfo.name)) : false
    },
    async resetDemoData() {
      clearPlatformJson(PLATFORM_ORDERS_STORAGE_KEY)
      clearPlatformJson(PLATFORM_DRIVERS_STORAGE_KEY)
      await this.initialize(true)
    },
    async commitOrder(next: Order | null, requestedOperationId?: string) {
      if (!next) return false
      if (next.supplierId && next.supplierId !== this.auth.supplierId) return false
      const index = this.orders.findIndex((order) => order.id === next.id)
      const link = next.supplierOrderLink
      const declaredCMallLink = link?.source === 'c-mall'
      const sourceOrderId = declaredCMallLink ? link.sourceOrderId?.trim() : undefined
      const sourceSubOrderId = declaredCMallLink ? link.sourceSubOrderId?.trim() : undefined
      if (declaredCMallLink && (!sourceOrderId || !sourceSubOrderId)) return false
      const usesDriver = next.supplierFulfillment?.shipType === 'driver' && !!next.supplierFulfillment.driverId
      const driversRevision = usesDriver ? readPlatformCollectionRevision(PLATFORM_DRIVERS_STORAGE_KEY) : 0
      const routesRevision = usesDriver ? readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY) : 0
      let syncsCOrder = false
      const routingInputs = usesDriver ? readSupplierRoutingSnapshot([
        PLATFORM_ORDERS_STORAGE_KEY, ...(declaredCMallLink ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), PLATFORM_DRIVERS_STORAGE_KEY,
        PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY
      ]) : null
      const original: SupplierFulfillmentSnapshot = routingInputs
        ? { platformOrders: routingInputs.platformOrders, ...(declaredCMallLink ? { cOrders: routingInputs.cOrders } : {}), drivers: routingInputs.drivers }
        : readSupplierFulfillmentSnapshot(declaredCMallLink, false)
      if (usesDriver) {
        const assigned = original.drivers?.find((driver) => driver.id === next.supplierFulfillment?.driverId && driver.supplierId === this.auth.supplierId && driver.status === 'active')
        if (!assigned || assigned.name !== next.supplierFulfillment?.driverName) return false
      }
      const target: SupplierFulfillmentSnapshot = { platformOrders: { ...original.platformOrders, [next.id]: cloneSeed(next) }, ...(usesDriver ? { drivers: cloneSeed(original.drivers!) } : {}) }
      if (declaredCMallLink) {
        const cOrder = original.cOrders?.[sourceOrderId!]
        const subOrder = cOrder?.subOrders.find((item) => item.id === sourceSubOrderId)
        if (!cOrder || !subOrder) return false
        const nextCOrder = syncCSubOrderFromSupplier(cOrder, subOrder, next)
        target.cOrders = { ...(original.cOrders || {}), [nextCOrder.id]: nextCOrder }
        syncsCOrder = true
      }
      const transactionOriginal: SupplierFulfillmentSnapshot = { platformOrders: original.platformOrders, ...(syncsCOrder ? { cOrders: original.cOrders } : {}), ...(usesDriver ? { drivers: original.drivers } : {}) }
      const transactionTarget: SupplierFulfillmentSnapshot = { platformOrders: target.platformOrders, ...(syncsCOrder ? { cOrders: target.cOrders } : {}), ...(usesDriver ? { drivers: target.drivers } : {}) }
      const operationId = requestedOperationId || `supplier-fulfillment:${next.id}:${next.supplierFulfillment?.updatedAt || next.status}`
      const previousFulfillment = original.platformOrders[next.id]?.supplierFulfillment
      const previousDriverId = previousFulfillment?.driverId
      const nextDriverId = next.supplierFulfillment?.driverId
      const assignmentChanged = usesDriver && previousDriverId !== nextDriverId
      const receivesDriverOrder = usesDriver && previousFulfillment?.status === 'delivering' && next.supplierFulfillment?.status === 'received'
      const routeProgress = routingInputs && receivesDriverOrder ? completeRouteOrderState(routingInputs.dailyRoutes, next) : { state: routingInputs?.dailyRoutes || null, route: null }
      if (routingInputs && (assignmentChanged || routeProgress.route)) {
        const stale = assignmentChanged
          ? staleRouteState(routingInputs.dailyRoutes, this.auth.supplierId, [nextDriverId!, ...(previousDriverId ? [previousDriverId] : [])], next.supplierFulfillment?.deliverDate || todayString())
          : { state: routingInputs.dailyRoutes, stale: [] as DailyDeliveryRoute[] }
        const auditEntries: Array<Omit<PlatformAuditLogEntry, 'id' | 'createdAt' | 'result'>> = [
          ...(assignmentChanged ? [
            { module: 'routing', action: previousDriverId ? 'order.driver.reassign' : 'order.driver.assign', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'order', targetId: next.id, operationId, metadata: { driverId: nextDriverId, previousDriverId } },
            ...stale.stale.map((route) => ({ module: 'routing', action: 'route.stale', actorId: this.auth.supplierId, actorRole: 'system', targetType: 'daily-delivery-route', targetId: route.id, operationId, metadata: { driverId: route.driverId, deliveryDate: route.deliveryDate } }))
          ] : []),
          ...(routeProgress.route ? [{ module: 'routing', action: routeProgress.route.status === 'completed' ? 'route.complete' : 'route.progress', actorId: this.auth.driverId || this.auth.supplierId, actorName: this.auth.name, actorRole: this.auth.role || 'driver', targetType: 'daily-delivery-route', targetId: routeProgress.route.id, operationId, metadata: { orderId: next.id, driverId: nextDriverId, deliveryDate: routeProgress.route.deliveryDate } }] : [])
        ]
        const changesRoute = stale.stale.length > 0 || !!routeProgress.route
        const collections = [PLATFORM_ORDERS_STORAGE_KEY, ...(syncsCOrder ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), PLATFORM_AUDIT_LOG_STORAGE_KEY, ...(changesRoute ? [PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY] : [])]
        const routingOriginal = selectSupplierRoutingSnapshot(routingInputs, collections)
        const routingTarget: SupplierRoutingSnapshot = {
          ...cloneSeed(routingOriginal), platformOrders: transactionTarget.platformOrders,
          ...(syncsCOrder ? { cOrders: transactionTarget.cOrders! } : {}), ...(changesRoute ? { dailyRoutes: routeProgress.route ? routeProgress.state : stale.state } : {}),
          auditLogs: auditEntries.length ? routingAuditEntries(routingOriginal.auditLogs, auditEntries) : routingOriginal.auditLogs
        }
        const revisions = routingRevisionToken(collections)
        const result = await runLockedPlatformTransaction({
          operationId, collections, lockCollections: [PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY], original: routingOriginal, target: routingTarget,
          recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA,
          revisionChecks: [
            { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: this.platformOrdersRevision },
            ...(syncsCOrder ? [{ key: PLATFORM_C_ORDERS_STORAGE_KEY, expectedRevision: this.cOrdersRevision }] : []),
            { key: PLATFORM_DRIVERS_STORAGE_KEY, expectedRevision: driversRevision },
            { key: PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, expectedRevision: this.driverScopeRevision },
            { key: PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, expectedRevision: routesRevision },
            ...(auditEntries.length ? [{ key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY] }] : [])
          ],
          validate: () => {
            const persisted = readPlatformOrders()?.[next.id]
            if (routeProgress.route) {
              const fulfillment = persisted?.supplierFulfillment
              const route = readDailyDeliveryRouteState()?.routes.find((item) => item.id === routeProgress.route?.id)
              return fulfillment?.status === 'delivering' && fulfillment.shipType === 'driver' && fulfillment.driverId === nextDriverId && !!route && (route.status === 'published' || route.status === 'stale') && route.sourceOrderIds.includes(next.id)
            }
            const destination = resolveOrderStore(persisted || next)
            const proposedDestination = resolveOrderStore(next)
            if (!nextDriverId) return false
            const assigned = (readPlatformDrivers() || []).find((driver) => driver.id === nextDriverId && driver.supplierId === this.auth.supplierId && driver.status === 'active')
            const named = namedRouteForDriver(this.auth.supplierId, nextDriverId)
            const scope = readDriverStoreScopes(this.auth.supplierId, nextDriverId)[0]
            const storeIds = named?.storeIds || scope?.storeIds || []
            return !!destination && destination.storeId === proposedDestination?.storeId && !!assigned && assigned.name === next.supplierFulfillment?.driverName && storeIds.includes(destination.storeId)
          },
          steps: [
            { key: 'platform-orders', apply: () => writePlatformOrders(routingTarget.platformOrders), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_ORDERS_STORAGE_KEY, routingOriginal.platformOrders, routingTarget.platformOrders) },
            ...(syncsCOrder ? [{ key: 'c-orders', apply: () => writeCOrders(routingTarget.cOrders), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_C_ORDERS_STORAGE_KEY, routingOriginal.cOrders, routingTarget.cOrders) }] : []),
            ...(changesRoute ? [{ key: routeProgress.route ? 'route-progress' : 'routes-stale', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, routingTarget.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, routingOriginal.dailyRoutes, routingTarget.dailyRoutes) }] : []),
            ...(auditEntries.length ? [{ key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, routingTarget.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, routingOriginal.auditLogs, routingTarget.auditLogs) }] : [])
          ]
        })
        if (!result.ok) {
          if (result.fatal) this.error = '履约事务恢复失败，请联系平台处理'
          return false
        }
        this.platformOrdersRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
        if (syncsCOrder) this.cOrdersRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
        if (changesRoute) {
          const routes = readDailyDeliveryRouteState()
          this.dailyRoutes = routes?.routes ?? []
          this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
        }
        if (index >= 0) this.orders[index] = next
        else this.orders.unshift(next)
        return true
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: [PLATFORM_ORDERS_STORAGE_KEY, ...(syncsCOrder ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []), ...(usesDriver ? [PLATFORM_DRIVERS_STORAGE_KEY] : [])],
        original: transactionOriginal,
        target: transactionTarget,
        recoveryHandlerKey: SUPPLIER_FULFILLMENT_RECOVERY_HANDLER_KEY,
        recoverySchema: SUPPLIER_FULFILLMENT_RECOVERY_SCHEMA,
        revisionChecks: [
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: this.platformOrdersRevision },
          ...(syncsCOrder ? [{ key: PLATFORM_C_ORDERS_STORAGE_KEY, expectedRevision: this.cOrdersRevision }] : []),
          ...(usesDriver ? [{ key: PLATFORM_DRIVERS_STORAGE_KEY, expectedRevision: driversRevision }] : [])
        ],
        steps: [
          { key: 'platform-orders', apply: () => writePlatformOrders(transactionTarget.platformOrders), rollback: () => writePlatformOrders(transactionOriginal.platformOrders) },
          ...(syncsCOrder ? [{ key: 'c-orders', apply: () => writeCOrders(transactionTarget.cOrders!), rollback: () => writeCOrders(transactionOriginal.cOrders!) }] : [])
        ]
      })
      if (!result.ok) {
        if (result.fatal) this.error = '履约事务恢复失败，请联系平台处理'
        return false
      }
      this.platformOrdersRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
      if (syncsCOrder) this.cOrdersRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
      if (index >= 0) this.orders[index] = next
      else this.orders.unshift(next)
      return true
    },
    async acceptOrder(id: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === id)
      return order ? await this.commitOrder(acceptSupplierOrder(order, this.auth.name || supplierInfo.name)) : false
    },
    async batchAcceptOrders(ids: string[]) {
      if (this.auth.role !== 'supplier') return 0
      let count = 0
      for (const id of ids) if (await this.acceptOrder(id)) count += 1
      return count
    },
    async assignDriver(orderId: string, driverId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      const driver = order ? this.assignableDriversForOrder(order).find((item) => item.id === driverId) : undefined
      if (!order || !driver) return false
      const saved = await this.commitOrder(assignSupplierDriver(order, driver, this.auth.name || supplierInfo.name), `supplier-fulfillment:${order.id}:assign-driver:${driver.id}`)
      return saved
    },
    async reassignDriver(orderId: string, driverId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      const driver = order ? this.assignableDriversForOrder(order).find((item) => item.id === driverId) : undefined
      if (!order || !driver) return false
      const saved = await this.commitOrder(reassignSupplierDriver(order, driver, this.auth.name || supplierInfo.name), `supplier-fulfillment:${order.id}:reassign-driver:${driver.id}`)
      return saved
    },
    async shipCourier(orderId: string, _trackingNo = '') {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return false
      const link = order.supplierOrderLink
      const linkedAddress = link?.deliveryAddress
      const cAddress = !linkedAddress && link?.source === 'c-mall' && link.sourceOrderId ? readCOrders()?.[link.sourceOrderId]?.address : undefined
      const recipientAddress = linkedAddress || cAddress
      const isRecipientCourier = link?.source === 'c-mall' || link?.source === 'farmhouse-courier'
      const address = recipientAddress
        ? `${recipientAddress.region} ${recipientAddress.detail}`.replace(/\s+/g, ' ').trim()
        : isRecipientCourier ? '' : resolveOrderStore(order)?.address?.trim()
      if (!address) return false
      const operationId = `supplier-fulfillment:${order.id}:ship-courier`
      let shipment
      try {
        shipment = await getPlatformProviders().logistics.createShipment({ orderId: order.id, address, operationId })
      } catch {
        this.error = '物流结果待确认，请重试查询'
        return false
      }
      if (!shipment.ok || !shipment.value?.trackingNo?.trim()) {
        this.error = shipment.ok ? '物流服务未返回运单号' : shipment.message
        return false
      }
      return this.commitOrder(shipSupplierCourier(order, shipment.value.trackingNo.trim(), this.auth.name || supplierInfo.name), operationId)
    },
    async commitRouteOrdersAndRoute(nextRoute: DailyDeliveryRoute, nextOrders: Order[]) {
      const currentRouteState = readDailyDeliveryRouteState()
      const currentOrders = readPlatformOrders()
      if (!currentRouteState || !currentOrders) return false
      const routeUpdatedAt = timestampAfter(currentRouteState.updatedAt)
      const normalizedRoute = snapshotDailyDeliveryRoute({ ...nextRoute, generatedAt: routeUpdatedAt })
      const nextRouteState: DailyDeliveryRouteState = {
        ...currentRouteState,
        revision: currentRouteState.revision + 1,
        routes: currentRouteState.routes.map((route) => route.id === normalizedRoute.id ? normalizedRoute : route),
        updatedAt: routeUpdatedAt
      }
      const nextPlatformOrders = { ...currentOrders }
      const currentCOrders = readCOrders()
      let nextCOrders: Record<string, COrder> | undefined
      for (const order of nextOrders) {
        nextPlatformOrders[order.id] = cloneSeed(order)
        const link = order.supplierOrderLink
        if (link?.source !== 'c-mall') continue
        const sourceOrderId = link.sourceOrderId?.trim()
        const sourceSubOrderId = link.sourceSubOrderId?.trim()
        const cOrder = sourceOrderId ? currentCOrders?.[sourceOrderId] : undefined
        const subOrder = cOrder?.subOrders.find((entry) => entry.id === sourceSubOrderId)
        if (!currentCOrders || !cOrder || !subOrder) return false
        if (!nextCOrders) nextCOrders = { ...currentCOrders }
        const synced = syncCSubOrderFromSupplier(cOrder, subOrder, order)
        nextCOrders[synced.id] = synced
      }
      const collections = [
        PLATFORM_ORDERS_STORAGE_KEY,
        ...(nextCOrders ? [PLATFORM_C_ORDERS_STORAGE_KEY] : []),
        PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY
      ]
      const original = {
        platformOrders: currentOrders,
        ...(nextCOrders ? { cOrders: currentCOrders } : {}),
        dailyRoutes: currentRouteState
      }
      const target = {
        platformOrders: nextPlatformOrders,
        ...(nextCOrders ? { cOrders: nextCOrders } : {}),
        dailyRoutes: nextRouteState
      }
      const revisions = Object.fromEntries(collections.map((key) => [key, readPlatformCollectionRevision(key)]))
      const result = await runLockedPlatformTransaction({
        operationId: createId('OP-ROUTE-HANDOVER'),
        collections,
        original,
        target,
        revisionChecks: collections.map((key) => ({ key, expectedRevision: revisions[key] })),
        steps: [
          { key: 'platform-orders', apply: () => writePlatformOrders(target.platformOrders), rollback: () => writePlatformOrders(original.platformOrders) },
          ...(nextCOrders ? [{ key: 'c-orders', apply: () => writeCOrders(target.cOrders!), rollback: () => writeCOrders(original.cOrders!) }] : []),
          { key: 'daily-routes', apply: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, target.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]), rollback: () => writePlatformJson(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes, revisions[PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY]) }
        ]
      })
      if (!result.ok) return false
      this.orders = this.orders.map((order) => nextPlatformOrders[order.id] || order)
      this.platformOrdersRevision = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      if (nextCOrders) this.cOrdersRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
      return true
    },
    async checkInWarehouse(routeId: string, location: RouteOrigin): Promise<WriteResult<{ distanceM: number }>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可到仓打卡' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const validated = validateWarehouseCheckIn(route.origin, location)
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message }
      const next = snapshotDailyDeliveryRoute({
        ...cloneSeed(route),
        warehouseCheckIn: {
          at: new Date().toISOString(),
          type: 'normal' as const,
          longitude: location.longitude,
          latitude: location.latitude,
          distanceM: validated.distanceM
        }
      })
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '仓点打卡保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return { ok: true, value: { distanceM: validated.distanceM } }
    },
    async checkInWarehouseAbnormal(routeId: string, input: { reasonCode: 'location_failed' | 'device_issue' | 'warehouse_coordinate_error' | 'other'; reasonNote?: string; location?: RouteOrigin }): Promise<WriteResult<RouteWarehouseCheckIn>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可到仓打卡' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const checkIn = createAbnormalWarehouseCheckIn(input.reasonCode, input.reasonNote, input.location)
      if (!checkIn) return { ok: false, code: 'invalid_reason', message: input.reasonCode === 'other' ? '请填写其他异常原因' : '异常打卡原因无效' }
      const next = snapshotDailyDeliveryRoute({ ...cloneSeed(route), warehouseCheckIn: checkIn })
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '异常打卡保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return { ok: true, value: checkIn }
    },
    async submitRouteOutbound(routeId: string, input: { actuals: Record<string, number>; proofImages: string[]; note?: string }): Promise<WriteResult<DailyDeliveryRoute>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可发起出仓交接' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const orders = this.orders.filter((order) => route.sourceOrderIds.includes(order.id))
      const next = createRouteOutboundHandoverState(route, orders, { id: this.auth.driverId, name: this.auth.name, role: 'driver' }, input)
      if (!next) return { ok: false, code: 'invalid_handover', message: input.proofImages?.length ? '请先完成到仓打卡并检查实发数量' : '请至少上传 1 张出仓凭证' }
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '出仓交接保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return saved
    },
    async reviewRouteOutbound(routeId: string, input: { decision: 'confirm' | 'reject'; actuals?: Record<string, number>; note?: string; reason?: string }): Promise<WriteResult<DailyDeliveryRoute>> {
      if (this.auth.role !== 'supplier') return { ok: false, code: 'permission_denied', message: '仅供应商可审核出仓交接' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在' }
      const operator = { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' as const }
      const next = input.decision === 'reject'
        ? rejectRouteOutboundHandoverState(route, input.reason || '', operator)
        : reviewRouteOutboundHandoverState(route, { actuals: input.actuals || {}, note: input.note }, operator)
      if (!next) return { ok: false, code: 'invalid_handover', message: input.decision === 'reject' ? '请填写驳回原因' : '交接单已处理、凭证缺失或实发数量无效' }
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '交接审核保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return saved
    },
    async markRouteShortages(routeId: string, allocations: RouteOutboundShortageAllocation[]): Promise<WriteResult<DailyDeliveryRoute>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可标记门店缺货' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const orders = this.orders.filter((order) => route.sourceOrderIds.includes(order.id))
      const next = applyRouteOutboundShortages(route, orders, allocations)
      if (!next) return { ok: false, code: 'invalid_shortages', message: '每个商品的缺货数量必须全部分配到门店' }
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '缺货标记保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return saved
    },
    async reorderRouteStops(routeId: string, orderedStoreIds: string[]): Promise<WriteResult<DailyDeliveryRoute>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可调整门店顺序' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      if (route.outboundHandover?.status !== 'dispatched') return { ok: false, code: 'not_dispatched', message: '发车后才能调整门店顺序' }
      const next = reorderRouteStopState(route, orderedStoreIds)
      if (!next) return { ok: false, code: 'invalid_order', message: '门店顺序数据无效' }
      const saved = persistSupplierRoute(next)
      if (!saved.ok || !saved.value) return { ok: false, code: saved.ok ? 'write_failed' : saved.code, message: saved.ok ? '门店顺序保存失败' : saved.message }
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      return saved
    },
    async dispatchRoute(routeId: string): Promise<WriteResult<{ route: DailyDeliveryRoute; orderIds: string[] }>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可发车' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const orders = this.orders.filter((order) => route.sourceOrderIds.includes(order.id))
      const dispatched = dispatchRouteOutboundState(route, orders, { id: this.auth.driverId, name: this.auth.name, role: 'driver' })
      if (!dispatched) return { ok: false, code: 'not_ready', message: '请先完成供应商审核和全部缺货标记' }
      const saved = await this.commitRouteOrdersAndRoute(dispatched.route, dispatched.orders)
      if (!saved) return { ok: false, code: 'write_failed', message: '发车状态保存失败，请刷新后重试' }
      return { ok: true, value: { route: dispatched.route, orderIds: dispatched.orders.map((order) => order.id) } }
    },
    async handoverRouteStop(routeId: string, storeId: string, note?: string): Promise<WriteResult<{ route: DailyDeliveryRoute; orderIds: string[] }>> {
      if (this.auth.role !== 'driver' || !this.auth.driverId) return { ok: false, code: 'permission_denied', message: '仅司机可完成到店交接' }
      const route = this.dailyRoutes.find((item) => item.id === routeId && item.supplierId === this.auth.supplierId && item.driverId === this.auth.driverId)
      if (!route) return { ok: false, code: 'no_route', message: '线路不存在或不属于当前司机' }
      const orders = this.orders.filter((order) => route.sourceOrderIds.includes(order.id))
      const completed = completeRouteStopHandoverState(route, orders, storeId, { id: this.auth.driverId, name: this.auth.name, role: 'driver' }, note)
      if (!completed) return { ok: false, code: 'not_ready', message: '请先到店打卡，并确认门店内订单均为配送中' }
      const saved = await this.commitRouteOrdersAndRoute(completed.route, completed.orders)
      if (!saved) return { ok: false, code: 'write_failed', message: '到店交接保存失败，请刷新后重试' }
      return { ok: true, value: { route: completed.route, orderIds: completed.orders.map((order) => order.id) } }
    },
    async handoverOut(orderId: string, actuals: Record<string, number>, note?: string): Promise<{ ok: boolean; shortages: ShortageItem[] }> {
      if (this.auth.role !== 'supplier') return { ok: false, shortages: [] }
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { ok: false, shortages: [] }
      const next = handoverSupplierOut(order, actuals, { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' }, note)
      if (!next) return { ok: false, shortages: [] }
      if (!await this.commitOrder(next)) return { ok: false, shortages: [] }
      return { ok: true, shortages: next.supplierFulfillment?.shortages || [] }
    },
    async checkInStop(storeId: string, location: RouteOrigin): Promise<WriteResult<{ distanceM: number }>> {
      const failed = (code: string, message: string): WriteResult<{ distanceM: number }> => {
        this.error = message
        return { ok: false, code, message }
      }
      if (this.auth.role !== 'driver' || !this.auth.driverId) return failed('permission_denied', '仅司机可到店打卡')
      const route = this.currentDriverRoute
      if (!route) return failed('no_route', '今日线路尚未发布')
      const stop = route.stops.find((item) => item.storeId === storeId)
      if (!stop) return failed('unknown_stop', '当前线路没有该站点')
      const validated = validateStopCheckIn(stop, location)
      if (!validated.ok) return failed(validated.code, validated.message)
      const next: DailyDeliveryRoute = snapshotDailyDeliveryRoute({
        ...cloneSeed(route),
        stops: route.stops.map((item) => item.storeId === storeId
          ? { ...item, checkIn: { at: new Date().toISOString(), latitude: location.latitude, longitude: location.longitude, distanceM: validated.distanceM } }
          : item),
        generatedAt: timestampAfter(readDailyDeliveryRouteState()?.updatedAt)
      })
      const saved = saveDailyDeliveryRoute(next, this.dailyRouteRevision)
      if (!saved.ok) return failed(saved.code, saved.message)
      if (!saved.value) return failed('write_failed', '打卡保存失败')
      this.dailyRoutes = readDailyDeliveryRouteState()?.routes ?? []
      this.dailyRouteRevision = readPlatformCollectionRevision(PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
      this.error = ''
      return { ok: true, value: { distanceM: validated.distanceM } }
    },
    async handoverIn(orderId: string, note?: string) {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order || this.auth.role !== 'driver' || !this.auth.driverId) return false
      const stop = this.currentDriverRoute?.stops.find((item) => item.orderIds.includes(orderId))
      if (stop && !stop.checkIn) {
        this.error = '请先到店打卡后再交接'
        return false
      }
      return this.commitOrder(handoverSupplierIn(order, { id: this.auth.driverId, name: this.auth.name, role: 'driver' }, note))
    },
    async markCourierDelivered(orderId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return false
      return this.commitOrder(confirmCourierDelivered(order, { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' }))
    },
    async addDriver(input: { name: string; phone: string; account: string; password: string }): Promise<{ ok: boolean; error?: string }> {
      if (this.auth.role !== 'supplier') return { ok: false, error: '无权管理司机' }
      const supplier = this.suppliers.find((item) => item.id === this.auth.supplierId)
      const supplierAccount = this.supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
      if (!supplierCanReceiveNewOrders(supplier, supplierAccount)) return { ok: false, error: '供应商已暂停合作，不能新增司机' }
      const name = input.name.trim()
      const account = input.account.trim()
      const phone = input.phone.trim()
      if (!name || name.length > 20) return { ok: false, error: '姓名必填且不超过 20 字' }
      if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, error: '手机号格式不正确' }
      if (!/^[a-zA-Z0-9]{4,20}$/.test(account)) return { ok: false, error: '账号需 4-20 位字母或数字' }
      if (input.password.length < 6 || input.password.length > 20) return { ok: false, error: '密码需 6-20 位' }
      const collections = [PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]
      const locked = await runLockedPlatformCollectionTask({
        collections: [...collections, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY],
        execute: () => {
          const original = readSupplierRoutingSnapshot(collections)
          if (original.drivers.some((driver) => driver.account === account)) return { ok: false as const, error: '账号已存在' }
          const driver: DriverAccount = {
            id: createId('D'), supplierId: this.auth.supplierId, name, account, password: input.password, phone,
            status: 'active', createdAt: new Date().toISOString()
          }
          const scope: DriverStoreScope = { supplierId: this.auth.supplierId, driverId: driver.id, storeIds: [], updatedAt: timestampAfter(original.driverScopes?.updatedAt) }
          const target: SupplierRoutingSnapshot = {
            ...cloneSeed(original), drivers: [...original.drivers, driver], driverScopes: nextScopeState(original.driverScopes, scope),
            auditLogs: routingAuditEntries(original.auditLogs, [{ module: 'routing', action: 'driver.scope.create', actorId: this.auth.supplierId, actorName: this.auth.name, actorRole: 'supplier', targetType: 'driver', targetId: driver.id, metadata: { storeIds: [] } }])
          }
          const revisions = routingRevisionToken(collections)
          const operationId = createId('OP-DRIVER-CREATE')
          const transaction = runPlatformTransaction({
            operationId, collections, original, target,
            recoveryHandlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY, recoverySchema: SUPPLIER_ROUTING_RECOVERY_SCHEMA,
            revisionChecks: collections.map((key) => ({ key, expectedRevision: revisions[key] })),
            steps: [
              { key: 'drivers', apply: () => writePlatformJson(PLATFORM_DRIVERS_STORAGE_KEY, target.drivers, revisions[PLATFORM_DRIVERS_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DRIVERS_STORAGE_KEY, original.drivers, target.drivers) },
              { key: 'driver-scope', apply: () => writePlatformJson(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, target.driverScopes, revisions[PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, original.driverScopes, target.driverScopes) },
              { key: 'audit', apply: () => writePlatformJson(PLATFORM_AUDIT_LOG_STORAGE_KEY, target.auditLogs, revisions[PLATFORM_AUDIT_LOG_STORAGE_KEY]), rollback: () => rollbackPlatformCollectionSnapshot(PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs, target.auditLogs) }
            ]
          })
          if (!transaction.ok && !transaction.recoveryQueued) {
            const journalPending = resolvePlatformJournal(operationId, 'recovery-pending')
            const recoveryQueued = journalPending && enqueuePlatformRecovery({
              operationId,
              failedStep: transaction.failedStep || 'unknown',
              reason: transaction.reason || 'supplier routing transaction failed',
              handlerKey: SUPPLIER_ROUTING_RECOVERY_HANDLER_KEY
            })
            transaction.recoveryQueued = recoveryQueued
            transaction.fatal = !recoveryQueued || undefined
          }
          return transaction.ok
            ? { ok: true as const, driver }
            : { ok: false as const, error: transaction.fatal ? '数据恢复失败，请联系平台处理' : '数据未完成，请重试' }
        }
      })
      if (!locked.ok) return { ok: false, error: locked.message || '数据未完成，请重试' }
      if (!locked.value) return { ok: false, error: '数据未完成，请重试' }
      if (!locked.value.ok) return locked.value
      this.drivers = readPlatformDrivers() || []
      this.driverScopes = readDriverStoreScopeState()?.scopes ?? []
      this.driverScopeRevision = readPlatformCollectionRevision(PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY)
      return { ok: true }
    },
    updateDriver(id: string, patch: { name?: string; phone?: string }) {
      if (this.auth.role !== 'supplier') return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      if (patch.name !== undefined && (!patch.name.trim() || patch.name.trim().length > 20)) return false
      if (patch.phone !== undefined && !/^1[3-9]\d{9}$/.test(patch.phone.trim())) return false
      const nextDrivers = this.drivers.map((item) => item.id === id ? { ...item, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}) } : item)
      if (!writePlatformDrivers(nextDrivers)) return false
      this.drivers = nextDrivers
      return true
    },
    resetDriverPassword(id: string, password: string) {
      if (this.auth.role !== 'supplier') return false
      if (password.length < 6 || password.length > 20) return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      const nextDrivers = this.drivers.map((item) => item.id === id ? { ...item, password } : item)
      if (!writePlatformDrivers(nextDrivers)) return false
      this.drivers = nextDrivers
      return true
    },
    toggleDriverStatus(id: string) {
      if (this.auth.role !== 'supplier') return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      if (driver.status === 'active') {
        const hasUnfinished = this.orders.some((order) => {
          const fulfillment = order.supplierFulfillment
          return fulfillment?.driverId === id && fulfillment.shipType === 'driver' && ['shipped', 'delivering'].includes(fulfillment.status)
        })
        if (hasUnfinished) return false
      }
      const nextStatus: DriverAccount['status'] = driver.status === 'active' ? 'disabled' : 'active'
      const nextDrivers = this.drivers.map((item) => item.id === id ? { ...item, status: nextStatus } : item)
      if (!writePlatformDrivers(nextDrivers)) return false
      this.drivers = nextDrivers
      return true
    }
  }
})
