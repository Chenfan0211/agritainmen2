import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DailyDeliveryRoute, DailyDeliveryRouteState, DriverStoreScope, DriverStoreScopeState, Order, PlatformAuditLogEntry, RouteStop, WriteResult } from '@agritainment/shared'
import * as shared from '@agritainment/shared'
import * as repository from '../services/repository'
import { useSupplierStore } from './supplier'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

type RoutingStore = ReturnType<typeof useSupplierStore> & {
  driverScopes?: DriverStoreScope[]
  routeDraft?: DailyDeliveryRoute | null
  currentDriverRoute?: DailyDeliveryRoute | null
  todayDriverRoutes?: DailyDeliveryRoute[]
  activeDriverRouteId?: string
  pendingRouteTasks?: Order[]
  updateDriverScope?: (driverId: string, storeIds: string[]) => Promise<WriteResult<DriverStoreScope>>
  checkInStop?: (storeId: string, location: { latitude: number; longitude: number }) => Promise<WriteResult<{ distanceM: number }>>
  assignableDriversForOrder?: (order: Order) => Array<{ id: string }>
  optimizeDriverRoute?: (driverId: string, deliveryDate: string) => Promise<WriteResult<DailyDeliveryRoute>>
  optimizeNamedRoute?: (input: { namedRouteId: string; driverId: string; deliveryDate: string }) => Promise<WriteResult<DailyDeliveryRoute>>
  moveRouteStop?: (index: number, direction: -1 | 1) => boolean
  publishRoute?: () => Promise<WriteResult<DailyDeliveryRoute>>
  selectDriverRoute?: (routeId: string) => boolean
  invalidateRoutePreview?: () => void
  ensureTodayRoutes?: () => Promise<WriteResult<{ generated: number }>>
  dailyRouteRevision: number
  updateWarehouse?: (input: { address: string; longitude?: number; latitude?: number }) => Promise<WriteResult>
}

function failStorageWrites(keyToFail: string) {
  const originalSetItem = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (key, value) => {
    if (key === keyToFail) throw new Error(`forced write failure: ${key}`)
    originalSetItem(key, value)
  }
  return () => { localStorage.setItem = originalSetItem }
}

function publishedRoute(driverId = 'D001', sourceOrderId = 'ROUTE-BASE'): DailyDeliveryRoute {
  const now = new Date().toISOString()
  return {
    id: `ROUTE-S002-${driverId}-${shared.todayString()}`, supplierId: 'S002', driverId, deliveryDate: shared.todayString(), status: 'published',
    stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [sourceOrderId] }],
    totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: [sourceOrderId], provider: 'test', generatedAt: now, publishedAt: now
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function routeOrder(input: Partial<Order> & Pick<Order, 'id' | 'customer'>): Order {
  const at = new Date().toISOString()
  return {
    productName: '线路测试商品', quantity: 2, amount: 20, channel: 'purchase', status: 'shipping', createdAt: at,
    supplierId: 'S002', storeId: 'F001', storeName: input.customer,
    items: [{ productId: 'P-ROUTE', skuId: 'SKU-ROUTE', name: '线路测试商品', skuName: '标准装', image: '/static/images/field.webp', quantity: 2, price: 10 }],
    supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: shared.todayString(), shortages: [], handovers: [], updatedAt: at },
    ...input
  }
}

function deliveryDateOffset(days: number): string {
  return new Date(Date.parse(`${shared.todayString()}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

async function checkInAtFarm(store: RoutingStore, storeId = 'F001') {
  const destination = repository.storeDirectory[storeId]
  expect(await store.checkInStop?.(storeId, { latitude: destination.latitude!, longitude: destination.longitude! })).toMatchObject({ ok: true })
}

describe('supplier routing workflow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    shared.configurePlatformProviders()
    vi.unstubAllGlobals()
  })

  it('migrates only the S002 legacy warehouse and resolves a stable store identity without fuzzy matching', async () => {
    const store = useSupplierStore()
    await store.initialize()

    expect(store.suppliers.find((item) => item.id === 'S002')).toMatchObject({
      warehouse: { address: expect.any(String), longitude: 109.8542, latitude: 28.6267, coordinateSystem: 'GCJ-02' }
    })
    expect(store.suppliers.find((item) => item.id === 'S004')).not.toHaveProperty('warehouse')
    expect(repository.resolveOrderStore?.({ storeId: 'F002', customer: '错误旧名称' } as Order)).toMatchObject({ storeId: 'F002' })
    expect(repository.resolveOrderStore?.({ id: 'LEGACY', customer: '石板溪农家乐·门店' } as Order)).toMatchObject({ storeId: 'F001' })
    expect(repository.resolveOrderStore?.({ id: 'FUZZY', customer: '石板溪' } as Order)).toBeUndefined()
  })

  it('migrates existing drivers to their supplier store set, creates new drivers with an empty scope, and stays tenant isolated', async () => {
    shared.writePlatformDrivers([
      ...shared.demoDrivers,
      { id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456', phone: '13900004004', status: 'active', createdAt: '2026-08-31T08:00:00.000Z' }
    ])
    shared.writePlatformOrder(routeOrder({ id: 'S004-ROUTE', supplierId: 'S004', storeId: 'F002', customer: '云上人家·门店', supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D-S004', driverName: '炎陵司机', deliverDate: shared.todayString(), shortages: [], handovers: [], updatedAt: '2026-08-31T08:00:00.000Z' } }))
    const store = useSupplierStore() as RoutingStore
    await store.initialize()

    expect(shared.readDriverStoreScopes('S002', 'D001')[0]?.storeIds).toEqual(['F001', 'F002', 'F003'])
    expect(shared.readDriverStoreScopes('S004', 'D-S004')[0]?.storeIds).toEqual(['F001', 'F002', 'F003'])
    expect(shared.readDriverStoreScopes('S002').some((scope) => scope.driverId === 'D-S004')).toBe(false)
    const revision = shared.readDriverStoreScopeState()?.revision
    await store.initialize(true)
    expect(shared.readDriverStoreScopeState()?.revision).toBe(revision)

    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(await store.addDriver({ name: '新司机', phone: '13900008888', account: 'newdriver', password: '123456' })).toMatchObject({ ok: true })
    const created = store.drivers.find((driver) => driver.account === 'newdriver')!
    expect(shared.readDriverStoreScopes('S002', created.id)[0]?.storeIds).toEqual([])
    expect(shared.readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'driver.scope.create', targetId: created.id }))
  })

  it('creates a driver, empty scope, and audit atomically and leaves all three unchanged when audit fails', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const beforeDrivers = shared.cloneSeed(shared.readPlatformDrivers())
    const beforeScopes = shared.cloneSeed(shared.readDriverStoreScopeState())
    const beforeAudits = shared.cloneSeed(shared.readPlatformAuditLogs())
    const restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    let result
    try {
      result = await store.addDriver({ name: '原子司机', phone: '13900008881', account: 'atomicdriver', password: '123456' })
    } finally {
      restore()
    }

    expect(result).toMatchObject({ ok: false })
    expect(shared.readPlatformDrivers()).toEqual(beforeDrivers)
    expect(shared.readDriverStoreScopeState()).toEqual(beforeScopes)
    expect(shared.readPlatformAuditLogs()).toEqual(beforeAudits)
    expect(store.drivers.some((driver) => driver.account === 'atomicdriver')).toBe(false)
    const recovery = shared.readPlatformRecoveryQueue().find((task) => task.handlerKey === 'supplier-routing-atomic-v1' && task.failedStep === 'audit')
    expect(recovery).toMatchObject({ status: 'pending' })
    expect(await shared.retryPlatformRecoveryTask(recovery!.id, store.auth.supplierId)).toMatchObject({ ok: true })
    expect(shared.readPlatformDrivers()).toEqual(beforeDrivers)
    expect(shared.readDriverStoreScopeState()).toEqual(beforeScopes)
  })

  it('recovers a failed driver creation after an untouched orders collection changes', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      expect(await store.addDriver({ name: '恢复司机', phone: '13900008882', account: 'recoverydriver', password: '123456' })).toMatchObject({ ok: false })
    } finally {
      restore()
    }
    const unrelated = routeOrder({ id: 'RECOVERY-UNTOUCHED-ORDER', customer: '石板溪农家乐·门店' })
    expect(shared.writePlatformOrder(unrelated)).toBe(true)
    const recovery = shared.readPlatformRecoveryQueue().find((task) => task.handlerKey === 'supplier-routing-atomic-v1' && task.failedStep === 'audit')

    expect(await shared.retryPlatformRecoveryTask(recovery!.id, store.auth.supplierId)).toMatchObject({ ok: true })
    expect(shared.readPlatformOrders()?.[unrelated.id]).toEqual(unrelated)
  })

  it('preserves a third-party scope state when audit failure triggers rollback and queues recovery', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let injected = false
    localStorage.setItem = (key, value) => {
      if (!injected && key === shared.PLATFORM_AUDIT_LOG_STORAGE_KEY) {
        injected = true
        const state = shared.readDriverStoreScopeState()!
        const current = state.scopes.find((scope) => scope.supplierId === 'S002' && scope.driverId === 'D001')!
        expect(shared.saveDriverStoreScope({ ...current, storeIds: ['F003'], updatedAt: new Date(Date.parse(state.updatedAt) + 1).toISOString() }, state.revision)).toMatchObject({ ok: true })
        throw new Error('force audit failure after third-party scope write')
      }
      originalSetItem(key, value)
    }
    let result
    try {
      result = await store.updateDriverScope!('D001', ['F002'])
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(result).toMatchObject({ ok: false, recoveryQueued: true })
    expect(shared.readDriverStoreScopes('S002', 'D001')[0]?.storeIds).toEqual(['F003'])
    expect(shared.readPlatformRecoveryQueue()).toContainEqual(expect.objectContaining({ handlerKey: 'supplier-routing-atomic-v1', status: 'pending' }))
  })

  it('merges concurrent driver creations from stale stores and accepts a duplicate account only once', async () => {
    const first = useSupplierStore() as RoutingStore
    await first.initialize()
    expect(first.loginSupplier('13787366688', '13787366688')).toBe(true)
    setActivePinia(createPinia())
    const second = useSupplierStore() as RoutingStore
    await second.initialize()
    expect(second.loginSupplier('13787366688', '13787366688')).toBe(true)

    const distinct = await Promise.all([
      first.addDriver({ name: '并发甲', phone: '13900008101', account: 'concurrenta', password: '123456' }),
      second.addDriver({ name: '并发乙', phone: '13900008102', account: 'concurrentb', password: '123456' })
    ])
    expect(distinct).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })])
    expect(shared.readPlatformDrivers()?.filter((driver) => ['concurrenta', 'concurrentb'].includes(driver.account)).map((driver) => driver.account).sort()).toEqual(['concurrenta', 'concurrentb'])

    const duplicate = await Promise.all([
      first.addDriver({ name: '重复甲', phone: '13900008103', account: 'sameaccount', password: '123456' }),
      second.addDriver({ name: '重复乙', phone: '13900008104', account: 'sameaccount', password: '123456' })
    ])
    expect(duplicate.filter((result) => result.ok)).toHaveLength(1)
    expect(duplicate.filter((result) => !result.ok)).toEqual([expect.objectContaining({ error: '账号已存在' })])
    expect(shared.readPlatformDrivers()?.filter((driver) => driver.account === 'sameaccount')).toHaveLength(1)
  })

  it('uses the observed scope revision as CAS and rejects an assignment after another store removes that destination', async () => {
    const first = useSupplierStore() as RoutingStore
    await first.initialize()
    expect(first.loginSupplier('13787366688', '13787366688')).toBe(true)
    const secondPinia = createPinia()
    setActivePinia(secondPinia)
    const second = useSupplierStore() as RoutingStore
    await second.initialize()
    expect(second.loginSupplier('13787366688', '13787366688')).toBe(true)

    expect(await first.updateDriverScope!('D001', ['F001', 'F002'])).toMatchObject({ ok: true })
    expect(await second.updateDriverScope!('D001', ['F002'])).toMatchObject({ ok: false, code: 'revision_conflict' })
    await second.refreshSharedState()
    expect(await second.updateDriverScope!('D001', ['F002'])).toMatchObject({ ok: true })

    const accepted = routeOrder({ id: 'SCOPE-RACE', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    shared.writePlatformOrder(accepted)
    await first.refreshSharedState()
    await second.refreshSharedState()
    expect(await second.updateDriverScope!('D001', ['F002'])).toMatchObject({ ok: true })
    expect(await first.assignDriver(accepted.id, 'D001')).toBe(false)
    expect(shared.readPlatformOrders()?.[accepted.id]?.supplierFulfillment?.driverId).toBeUndefined()
  })

  it('allows assignment after another store restores the selected driver scope', async () => {
    const first = useSupplierStore() as RoutingStore
    await first.initialize()
    expect(first.loginSupplier('13787366688', '13787366688')).toBe(true)
    const secondPinia = createPinia()
    setActivePinia(secondPinia)
    const second = useSupplierStore() as RoutingStore
    await second.initialize()
    expect(second.loginSupplier('13787366688', '13787366688')).toBe(true)

    expect(await first.updateDriverScope!('D001', ['F001', 'F002'])).toMatchObject({ ok: true })
    const accepted = routeOrder({ id: 'SCOPE-RESTORE-RETRY', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    expect(shared.writePlatformOrder(accepted)).toBe(true)
    await second.refreshSharedState()
    expect(await second.updateDriverScope!('D001', ['F002'])).toMatchObject({ ok: true })
    await first.refreshSharedState()
    expect(await first.assignDriver(accepted.id, 'D001')).toBe(false)

    await second.refreshSharedState()
    expect(await second.updateDriverScope!('D001', ['F001', 'F002'])).toMatchObject({ ok: true })
    await first.refreshSharedState()

    expect(await first.assignDriver(accepted.id, 'D001')).toBe(true)
    expect(shared.readPlatformOrders()?.[accepted.id]?.supplierFulfillment?.driverId).toBe('D001')
  })

  it('rejects an out-of-scope reassign at the locked order boundary, including direct commitOrder calls', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001'])
    await store.updateDriverScope!('D002', ['F002'])
    const order = routeOrder({ id: 'REASSIGN-SCOPE', storeId: 'F001', customer: '石板溪农家乐·门店' })
    shared.writePlatformOrder(order)
    await store.refreshSharedState()
    const next = shared.reassignSupplierDriver(order, store.drivers.find((driver) => driver.id === 'D002')!, store.auth.name)

    expect(await store.reassignDriver(order.id, 'D002')).toBe(false)
    expect(await store.commitOrder(next)).toBe(false)
    expect(shared.readPlatformOrders()?.[order.id]?.supplierFulfillment?.driverId).toBe('D001')
  })

  it('rolls back scope and warehouse changes when audit or stale persistence fails', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    shared.writePlatformOrder(routeOrder({ id: 'ROUTE-BASE', customer: '石板溪农家乐·门店' }))
    expect(shared.saveDailyDeliveryRoute(publishedRoute(), 0)).toMatchObject({ ok: true })
    await store.refreshSharedState()
    const beforeScope = shared.cloneSeed(shared.readDriverStoreScopeState())
    const beforeEntities = shared.cloneSeed(shared.readPlatformEntities())
    const beforeRoute = shared.cloneSeed(shared.readDailyDeliveryRoutes('S002', 'D001')[0])

    let restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      expect(await store.updateDriverScope!('D001', ['F002'])).toMatchObject({ ok: false })
    } finally {
      restore()
    }
    expect(shared.readDriverStoreScopeState()).toEqual(beforeScope)
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toEqual(beforeRoute)

    restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      expect(await store.updateWarehouse!({ address: '新仓点', longitude: 110, latitude: 29 })).toMatchObject({ ok: false })
    } finally {
      restore()
    }
    expect(shared.readPlatformEntities()).toEqual(beforeEntities)
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toEqual(beforeRoute)
  })

  it('does not report assignment success when route stale or its audit cannot be persisted', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001'])
    const accepted = routeOrder({ id: 'ASSIGN-STALE-FAIL', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    shared.writePlatformOrder(accepted)
    await store.refreshSharedState()
    expect(shared.saveDailyDeliveryRoute(publishedRoute(), 0)).toMatchObject({ ok: true })
    const restore = failStorageWrites(shared.PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY)
    try {
      expect(await store.assignDriver(accepted.id, 'D001')).toBe(false)
    } finally {
      restore()
    }
    expect(shared.readPlatformOrders()?.[accepted.id]?.supplierFulfillment?.driverId).toBeUndefined()
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'published' })
  })

  it('rejects out-of-scope assignment and only exposes active in-scope drivers without weakening unfinished-task disable protection', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(store.updateDriverScope).toBeTypeOf('function')
    await store.updateDriverScope!('D001', ['F002'])
    await store.updateDriverScope!('D002', ['F001'])
    const accepted = routeOrder({ id: 'SCOPE-ASSIGN', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    shared.writePlatformOrder(accepted)
    await store.refreshSharedState()

    expect(store.assignableDriversForOrder?.(accepted).map((driver) => driver.id)).toEqual(expect.arrayContaining(['D002']))
    expect(store.assignableDriversForOrder?.(accepted).map((driver) => driver.id)).not.toContain('D001')
    expect(await store.assignDriver(accepted.id, 'D001')).toBe(false)
    expect(await store.assignDriver(accepted.id, 'D002')).toBe(true)
    expect(store.toggleDriverStatus('D002')).toBe(false)
  })

  it('merges same-store orders, retains a draft on provider failure, moves stops, publishes with CAS, and marks it stale after task changes', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope?.('D001', ['F001', 'F002', 'F003'])
    shared.writePlatformOrder(routeOrder({ id: 'ROUTE-A1', storeId: 'F001', customer: '石板溪农家乐·门店' }))
    shared.writePlatformOrder(routeOrder({ id: 'ROUTE-A2', storeId: 'F001', customer: '石板溪农家乐·门店', createdAt: new Date(Date.now() + 1).toISOString() }))
    shared.writePlatformOrder(routeOrder({ id: 'ROUTE-MISSING', storeId: 'F003', customer: '稻香村生态农庄·门店', createdAt: new Date(Date.now() + 2).toISOString() }))
    await store.refreshSharedState()

    expect(store.optimizeDriverRoute).toBeTypeOf('function')
    const first = await store.optimizeDriverRoute!('D001', shared.todayString())
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) throw new Error('expected route optimization to succeed')
    expect(first.value?.warnings).toEqual(expect.arrayContaining(['missing_coordinates:F003']))
    expect(store.routeDraft?.stops.find((stop: RouteStop) => stop.storeId === 'F001')?.orderIds).toEqual(expect.arrayContaining(['ROUTE-A1', 'ROUTE-A2']))
    expect(store.routeDraft?.stops.at(-1)?.storeId).toBe('F003')
    const beforeFailure = shared.cloneSeed(store.routeDraft)
    shared.configurePlatformProviders({ routeOptimization: { optimize: async () => ({ ok: false, code: 'route_timeout', message: '线路服务超时，请重试' }) } })
    expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toEqual({ ok: false, code: 'route_timeout', message: '线路服务超时，请重试' })
    expect(store.routeDraft).toEqual(beforeFailure)

    const beforeMove = store.routeDraft!.stops.map((stop: RouteStop) => stop.storeId)
    expect(store.moveRouteStop?.(1, -1)).toBe(true)
    expect(store.routeDraft!.stops.map((stop: RouteStop) => stop.storeId)).toEqual([beforeMove[1], beforeMove[0], ...beforeMove.slice(2)])
    expect(await store.publishRoute!()).toMatchObject({ ok: true, value: { status: 'published', publishedAt: expect.any(String) } })
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')).toHaveLength(1)
    expect(shared.readPlatformAuditLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'route.reorder', targetId: store.routeDraft?.id }),
      expect.objectContaining({ action: 'route.publish', targetId: store.routeDraft?.id })
    ]))

    const accepted = routeOrder({ id: 'ROUTE-NEW', status: 'pending', storeId: 'F002', customer: '云上人家·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    shared.writePlatformOrder(accepted)
    await store.refreshSharedState()
    expect(await store.assignDriver(accepted.id, 'D001')).toBe(true)
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'stale' })
  })

  it('rejects route drafts whose route, order, or scope baseline became stale', async () => {
    const setupDraft = async () => {
      setActivePinia(createPinia())
      const store = useSupplierStore() as RoutingStore
      await store.initialize()
      expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
      await store.updateDriverScope!('D001', ['F001'])
      shared.writePlatformOrder(routeOrder({ id: 'DRAFT-BASE', customer: '石板溪农家乐·门店' }))
      await store.refreshSharedState()
      expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toMatchObject({ ok: true })
      return store
    }

    let store = await setupDraft()
    shared.writePlatformOrder(routeOrder({ id: 'DRAFT-ORDER-CHANGED', customer: '石板溪农家乐·门店' }))
    expect(await store.publishRoute!()).toMatchObject({ ok: false, code: 'revision_conflict' })

    localStorage.clear()
    store = await setupDraft()
    const scopeState = shared.readDriverStoreScopeState()!
    expect(shared.saveDriverStoreScope({ supplierId: 'S002', driverId: 'D001', storeIds: ['F001', 'F002'], updatedAt: new Date(Date.parse(scopeState.updatedAt) + 1).toISOString() }, scopeState.revision)).toMatchObject({ ok: true })
    expect(await store.publishRoute!()).toMatchObject({ ok: false, code: 'revision_conflict' })

    localStorage.clear()
    store = await setupDraft()
    expect(shared.saveDailyDeliveryRoute(publishedRoute('D002'), 0)).toMatchObject({ ok: true })
    expect(await store.publishRoute!()).toMatchObject({ ok: false, code: 'revision_conflict' })

    localStorage.clear()
    store = await setupDraft()
    const entities = shared.readPlatformEntities()!
    expect(shared.upsertPlatformEntity('suppliers', 'S002', { ...entities.suppliers?.S002, warehouse: { address: '外部新仓', longitude: 111, latitude: 30, coordinateSystem: 'GCJ-02' } })).toBe(true)
    expect(await store.publishRoute!()).toMatchObject({ ok: false, code: 'revision_conflict' })
  })

  it.each(['orders', 'scope', 'warehouse', 'routes'] as const)('rejects optimization when %s changes while the Provider is pending and preserves the previous draft', async (changedInput) => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001', 'F002'])
    shared.writePlatformOrder(routeOrder({ id: 'PROVIDER-BASE', storeId: 'F001', customer: '石板溪农家乐·门店' }))
    await store.refreshSharedState()
    expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toMatchObject({ ok: true })
    const previousDraft = shared.cloneSeed(store.routeDraft)
    const providerCalled = deferred<void>()
    const providerResult = deferred<WriteResult<{ orderedStops: RouteStop[]; segments: []; totalDistanceKm: number; estimatedDurationMinutes: number; provider: string; warnings: string[] }>>()
    shared.configurePlatformProviders({ routeOptimization: { optimize: async (input) => {
      providerCalled.resolve()
      const result = await providerResult.promise
      if (result.ok && result.value) result.value.orderedStops = [...shared.cloneSeed(input.stops)]
      return result
    } } })
    const optimizing = store.optimizeDriverRoute!('D001', shared.todayString())
    await providerCalled.promise

    if (changedInput === 'orders') {
      shared.writePlatformOrder(routeOrder({ id: 'PROVIDER-NEW-ORDER', storeId: 'F002', customer: '云上人家·门店' }))
    } else if (changedInput === 'scope') {
      const state = shared.readDriverStoreScopeState()!
      const current = state.scopes.find((scope) => scope.supplierId === 'S002' && scope.driverId === 'D001')!
      shared.saveDriverStoreScope({ ...current, storeIds: ['F001'], updatedAt: new Date(Date.parse(state.updatedAt) + 1).toISOString() }, state.revision)
    } else if (changedInput === 'warehouse') {
      const entities = shared.readPlatformEntities()!
      shared.upsertPlatformEntity('suppliers', 'S002', { ...entities.suppliers?.S002, warehouse: { address: 'Provider 期间新仓', longitude: 112, latitude: 31, coordinateSystem: 'GCJ-02' } })
    } else {
      expect(shared.saveDailyDeliveryRoute(publishedRoute('D002', 'PROVIDER-OTHER-ROUTE'), shared.readDailyDeliveryRouteState()?.revision ?? 0)).toMatchObject({ ok: true })
    }
    providerResult.resolve({ ok: true, value: { orderedStops: [], segments: [], totalDistanceKm: 1, estimatedDurationMinutes: 10, provider: 'deferred-test', warnings: [] } })

    expect(await optimizing).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(store.routeDraft).toEqual(previousDraft)
  })

  it('rejects a Provider response that is not a strict permutation of the assigned stops', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001'])
    shared.writePlatformOrder(routeOrder({ id: 'PROVIDER-INTEGRITY', storeId: 'F001', customer: '石板溪农家乐·门店' }))
    await store.refreshSharedState()
    expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toMatchObject({ ok: true })
    const previousDraft = shared.cloneSeed(store.routeDraft)
    shared.configurePlatformProviders({ routeOptimization: { optimize: async () => ({
      ok: true,
      value: { orderedStops: [], segments: [], totalDistanceKm: 0, estimatedDurationMinutes: 0, provider: 'malformed-test', warnings: [] }
    }) } })

    expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toMatchObject({ ok: false, code: 'route_provider_invalid' })
    expect(store.routeDraft).toEqual(previousDraft)
  })

  it('surfaces stale-route transaction failures and can mark the route stale after retry', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001'])
    shared.writePlatformOrder(routeOrder({ id: 'STALE-BASE', storeId: 'F001', customer: '石板溪农家乐·门店' }))
    await store.refreshSharedState()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const route = {
      ...publishedRoute('D001', 'STALE-BASE'),
      scopeStoreIds: ['F001'],
      origin: { longitude: supplier.warehouse!.longitude!, latitude: supplier.warehouse!.latitude! }
    }
    expect(shared.saveDailyDeliveryRoute(route, shared.readDailyDeliveryRouteState()?.revision ?? 0)).toMatchObject({ ok: true })
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'published' })
    shared.writePlatformOrder(routeOrder({ id: 'STALE-NEW', storeId: 'F001', customer: '石板溪农家乐·门店' }))

    const restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      await expect(store.refreshSharedState()).resolves.toBeUndefined()
      expect(store.routeReconcileWarning).toContain('线路过期状态保存失败')
      expect(store.error).toBe('')
    } finally {
      restore()
    }
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'published' })

    await store.refreshSharedState()
    expect(store.routeReconcileWarning).toBe('')
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'stale' })
    await expect(store.refreshSharedState()).resolves.toBeUndefined()
  })

  it('merges a warehouse update into the latest persisted supplier instead of overwriting administrator changes from a stale page', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const persisted = shared.readPlatformEntities()!
    expect(shared.upsertPlatformEntity('suppliers', 'S002', { ...persisted.suppliers?.S002, name: '管理员最新名称', status: 'paused', contactName: '管理员联系人' })).toBe(true)

    expect(await store.updateWarehouse!({ address: '页面新仓点', longitude: 110, latitude: 29 })).toMatchObject({ ok: true })
    expect(shared.readPlatformEntities()?.suppliers?.S002).toMatchObject({
      name: '管理员最新名称', status: 'paused', contactName: '管理员联系人',
      warehouse: { address: '页面新仓点', longitude: 110, latitude: 29, coordinateSystem: 'GCJ-02' }
    })
  })

  it('captures the warehouse transaction snapshot only after acquiring the collection locks', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const lockAcquired = deferred<void>()
    const releaseLock = deferred<void>()
    const holdingLock = shared.runLockedPlatformCollectionTask({
      collections: [shared.PLATFORM_ENTITIES_STORAGE_KEY, shared.PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, shared.PLATFORM_AUDIT_LOG_STORAGE_KEY],
      execute: async () => {
        lockAcquired.resolve()
        await releaseLock.promise
      }
    })
    await lockAcquired.promise

    const saving = store.updateWarehouse!({ address: '锁后页面仓点', longitude: 110, latitude: 29 })
    const persisted = shared.readPlatformEntities()!
    expect(shared.upsertPlatformEntity('suppliers', 'S002', { ...persisted.suppliers?.S002, name: '锁等待期间管理员名称', status: 'paused', contactName: '锁等待期间管理员联系人' })).toBe(true)
    releaseLock.resolve()
    expect(await holdingLock).toMatchObject({ ok: true })

    expect(await saving).toMatchObject({ ok: true })
    expect(shared.readPlatformEntities()?.suppliers?.S002).toMatchObject({
      name: '锁等待期间管理员名称', status: 'paused', contactName: '锁等待期间管理员联系人',
      warehouse: { address: '锁后页面仓点', longitude: 110, latitude: 29, coordinateSystem: 'GCJ-02' }
    })
  })

  it('rolls back a published route on audit failure and preserves the original draft when reorder audit fails', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    await store.updateDriverScope!('D001', ['F001', 'F002'])
    shared.writePlatformOrder(routeOrder({ id: 'AUDIT-ROUTE-A', storeId: 'F001', customer: '石板溪农家乐·门店' }))
    shared.writePlatformOrder(routeOrder({ id: 'AUDIT-ROUTE-B', storeId: 'F002', customer: '云上人家·门店' }))
    await store.refreshSharedState()
    expect(await store.optimizeDriverRoute!('D001', shared.todayString())).toMatchObject({ ok: true })
    const originalDraft = shared.cloneSeed(store.routeDraft)
    let restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      expect(store.moveRouteStop!(1, -1)).toBe(false)
    } finally {
      restore()
    }
    expect(store.routeDraft).toEqual(originalDraft)

    restore = failStorageWrites(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY)
    try {
      expect(await store.publishRoute!()).toMatchObject({ ok: false })
    } finally {
      restore()
    }
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')).toEqual([])
    expect(store.routeDraft).toEqual(originalDraft)
  })

  it('shows only the signed-in driver published or stale route and separates tasks added after publication', async () => {
    const now = new Date().toISOString()
    const route: DailyDeliveryRoute = {
      id: `ROUTE-S002-D001-${shared.todayString()}`, supplierId: 'S002', driverId: 'D001', deliveryDate: shared.todayString(), status: 'published',
      stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: ['DRIVER-PUBLISHED'] }],
      totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: ['DRIVER-PUBLISHED'], provider: 'test', generatedAt: now, publishedAt: now,
      segments: [{ fromId: 'origin', toStoreId: 'F001', distanceKm: 1 }], warnings: []
    }
    expect(shared.saveDailyDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    expect(shared.saveDailyDeliveryRoute({ ...route, id: `ROUTE-S002-D002-${shared.todayString()}`, driverId: 'D002', generatedAt: new Date(Date.now() + 1).toISOString() }, 1)).toMatchObject({ ok: true })
    shared.writePlatformOrder(routeOrder({ id: 'DRIVER-PUBLISHED', customer: '石板溪农家乐·门店' }))
    shared.writePlatformOrder(routeOrder({ id: 'DRIVER-PENDING', storeId: 'F002', customer: '云上人家·门店' }))
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginDriver('driver01', '123456')).toBe(true)

    expect(store.currentDriverRoute).toMatchObject({ id: route.id, driverId: 'D001' })
    expect(store.pendingRouteTasks?.map((order) => order.id)).toContain('DRIVER-PENDING')
    expect(store.pendingRouteTasks?.map((order) => order.id)).not.toContain('DRIVER-PUBLISHED')
  })

  it('marks a published route stale when a subscribed refresh observes a changed task set and keeps audit evidence', async () => {
    const base = routeOrder({ id: 'EXTERNAL-BASE', customer: '石板溪农家乐·门店' })
    shared.writePlatformOrder(base)
    const now = new Date().toISOString()
    expect(shared.saveDailyDeliveryRoute({
      id: `ROUTE-EXTERNAL-${shared.todayString()}`, supplierId: 'S002', driverId: 'D001', deliveryDate: shared.todayString(), status: 'published',
      stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [base.id] }],
      totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: [base.id], provider: 'test', generatedAt: now, publishedAt: now
    }, 0)).toMatchObject({ ok: true })
    const store = useSupplierStore()
    await store.initialize()
    shared.writePlatformOrder(routeOrder({ id: 'EXTERNAL-NEW', customer: '云上人家·门店', storeId: 'F002' }))

    await store.refreshSharedState()

    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ status: 'stale', publishedAt: now })
    expect(shared.readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ module: 'routing', action: 'route.stale', targetId: `ROUTE-EXTERNAL-${shared.todayString()}` }))
  })

  it('marks today and future published routes stale after a scope change while preserving historical routes', async () => {
    const dates = { past: deliveryDateOffset(-1), today: shared.todayString(), future: deliveryDateOffset(1) }
    for (const [index, [label, deliveryDate]] of Object.entries(dates).entries()) {
      const order = routeOrder({
        id: `SCOPE-${label.toUpperCase()}`, customer: '石板溪农家乐·门店',
        supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: deliveryDate, shortages: [], handovers: [], updatedAt: new Date().toISOString() }
      })
      expect(shared.writePlatformOrder(order)).toBe(true)
      const generatedAt = new Date(Date.now() + index + 1).toISOString()
      const route = { ...publishedRoute('D001', order.id), id: `ROUTE-SCOPE-${label.toUpperCase()}`, deliveryDate, sourceOrderIds: [order.id], stops: [{ ...publishedRoute().stops[0], orderIds: [order.id] }], generatedAt, publishedAt: generatedAt }
      expect(shared.saveDailyDeliveryRoute(route, shared.readDailyDeliveryRouteState()?.revision ?? 0)).toMatchObject({ ok: true })
    }
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    expect(await store.updateDriverScope!('D001', ['F001'])).toMatchObject({ ok: true })

    const routes = Object.fromEntries(shared.readDailyDeliveryRoutes('S002', 'D001').map((route) => [route.id, route]))
    expect(routes['ROUTE-SCOPE-PAST']).toMatchObject({ status: 'published' })
    expect(routes['ROUTE-SCOPE-TODAY']).toMatchObject({ status: 'stale' })
    expect(routes['ROUTE-SCOPE-FUTURE']).toMatchObject({ status: 'stale' })
  })

  it('persists stop progress on driver handover and completes the route after its final order', async () => {
    const first = routeOrder({ id: 'ROUTE-COMPLETE-A', customer: '石板溪农家乐·门店' })
    const second = routeOrder({ id: 'ROUTE-COMPLETE-B', customer: '石板溪农家乐·门店', createdAt: new Date(Date.now() + 1).toISOString() })
    expect(shared.writePlatformOrder(first)).toBe(true)
    expect(shared.writePlatformOrder(second)).toBe(true)
    const now = new Date().toISOString()
    const route: DailyDeliveryRoute = {
      id: `ROUTE-COMPLETE-${shared.todayString()}`, supplierId: 'S002', driverId: 'D001', deliveryDate: shared.todayString(), status: 'published',
      stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [first.id, second.id] }],
      totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: [first.id, second.id], provider: 'test', generatedAt: now, publishedAt: now
    }
    expect(shared.saveDailyDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginDriver('driver01', '123456')).toBe(true)

    await checkInAtFarm(store)
    expect(await store.handoverIn(first.id)).toBe(true)
    const afterFirst = shared.readDailyDeliveryRoutes('S002', 'D001')[0]
    expect(afterFirst).toMatchObject({ status: 'published', stops: [expect.objectContaining({ completedOrderIds: [first.id] })] })
    expect(afterFirst.stops[0].completedAt).toBeUndefined()

    expect(await store.handoverIn(second.id)).toBe(true)
    const completed = shared.readDailyDeliveryRoutes('S002', 'D001')[0]
    expect(completed).toMatchObject({
      status: 'completed', completedAt: expect.any(String),
      stops: [expect.objectContaining({ completedOrderIds: [first.id, second.id], completedAt: expect.any(String) })]
    })
    expect(store.currentDriverRoute).toMatchObject({ id: route.id, status: 'completed' })
  })

  it('rejects a committed route-progress recovery whose target completes unhandled orders', async () => {
    const first = routeOrder({ id: 'RECOVERY-ROUTE-A', customer: '石板溪农家乐·门店' })
    const second = routeOrder({ id: 'RECOVERY-ROUTE-B', customer: '石板溪农家乐·门店', createdAt: new Date(Date.now() + 1).toISOString() })
    expect(shared.writePlatformOrder(first)).toBe(true)
    expect(shared.writePlatformOrder(second)).toBe(true)
    const now = new Date().toISOString()
    const route: DailyDeliveryRoute = {
      id: `ROUTE-RECOVERY-${shared.todayString()}`, supplierId: 'S002', driverId: 'D001', deliveryDate: shared.todayString(), status: 'published',
      stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [first.id, second.id] }],
      totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: [first.id, second.id], provider: 'test', generatedAt: now, publishedAt: now
    }
    expect(shared.saveDailyDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    await checkInAtFarm(store as RoutingStore)
    const existingOperationIds = new Set(Object.keys(shared.readPlatformJournal()))
    expect(await store.handoverIn(first.id)).toBe(true)

    const journal = Object.values(shared.readPlatformJournal()).find((entry) => !existingOperationIds.has(entry.operationId) && entry.recoveryHandlerKey === 'supplier-routing-atomic-v1')!
    expect(journal).toMatchObject({ status: 'committed' })
    const tamperedJournal = shared.cloneSeed(journal)
    const tamperedTarget = tamperedJournal.target as { dailyRoutes: DailyDeliveryRouteState }
    const tamperedRoute = tamperedTarget.dailyRoutes.routes.find((item) => item.id === route.id)!
    tamperedRoute.status = 'completed'
    tamperedRoute.completedAt = new Date(Date.now() + 10_000).toISOString()
    tamperedRoute.stops[0].completedOrderIds = [first.id, second.id]
    tamperedRoute.stops[0].completedAt = tamperedRoute.completedAt
    const original = journal.original as { platformOrders: Record<string, Order>; dailyRoutes: DailyDeliveryRouteState; auditLogs: PlatformAuditLogEntry[] }
    expect(shared.writePlatformOrders(original.platformOrders)).toBe(true)
    expect(shared.writePlatformJson(shared.PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes)).toBe(true)
    expect(shared.writePlatformJson(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs)).toBe(true)
    localStorage.setItem(shared.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({ ...shared.readPlatformJournal(), [journal.operationId]: tamperedJournal }))
    expect(shared.enqueuePlatformRecovery({ operationId: journal.operationId, failedStep: 'tampered-route-target', reason: 'test recovery validation', handlerKey: 'supplier-routing-atomic-v1' })).toBe(true)
    const task = shared.readPlatformRecoveryQueue().find((item) => item.operationId === journal.operationId)!
    const beforeRetry = {
      platformOrders: shared.cloneSeed(shared.readPlatformOrders()),
      dailyRoutes: shared.cloneSeed(shared.readDailyDeliveryRouteState()),
      auditLogs: shared.cloneSeed(shared.readPlatformAuditLogs())
    }

    expect(await shared.retryPlatformRecoveryTask(task.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect(shared.readPlatformOrders()).toEqual(beforeRetry.platformOrders)
    expect(shared.readDailyDeliveryRouteState()).toEqual(beforeRetry.dailyRoutes)
    expect(shared.readPlatformAuditLogs()).toEqual(beforeRetry.auditLogs)
  })

  it.each([
    ['flow action', (order: Order) => { order.flow!.at(-1)!.action = '伪造交接完成' }],
    ['flow operator', (order: Order) => { order.flow!.at(-1)!.operator = '伪造操作人' }],
    ['fulfillment orderId', (order: Order) => { order.fulfillmentEvents!.at(-1)!.orderId = 'FORGED-ORDER' }],
    ['fulfillment from', (order: Order) => { order.fulfillmentEvents!.at(-1)!.from = 'submitted' }],
    ['fulfillment to', (order: Order) => { order.fulfillmentEvents!.at(-1)!.to = 'cancelled' }],
    ['fulfillment operatorId', (order: Order) => { order.fulfillmentEvents!.at(-1)!.operatorId = 'FORGED-DRIVER' }],
    ['fulfillment operatorRole', (order: Order) => { order.fulfillmentEvents!.at(-1)!.operatorRole = 'supplier' }],
    ['fulfillment createdAt', (order: Order) => { order.fulfillmentEvents!.at(-1)!.createdAt = '2000-01-01T00:00:00.000Z' }],
    ['handover operatorName', (order: Order) => { order.supplierFulfillment!.handovers.at(-1)!.operatorName = '伪造操作人' }],
    ['handover operatorRole', (order: Order) => { order.supplierFulfillment!.handovers.at(-1)!.operatorRole = 'supplier' }],
    ['handover time', (order: Order) => { order.supplierFulfillment!.handovers.at(-1)!.time = '2000-01-01T00:00:00.000Z' }],
    ['handover id', (order: Order) => { order.supplierFulfillment!.handovers.at(-1)!.id = order.supplierFulfillment!.handovers[0].id }]
  ])('rejects a route recovery with a forged %s', async (_label, tamper) => {
    const order = routeOrder({ id: 'RECOVERY-EVENT-CONTRACT', customer: '石板溪农家乐·门店' })
    order.supplierFulfillment!.handovers = [{
      id: 'H-EXISTING', type: 'out', orderId: order.id, time: order.createdAt,
      operatorId: 'S002', operatorName: '湘西腊味合作社', operatorRole: 'supplier'
    }]
    expect(shared.writePlatformOrder(order)).toBe(true)
    const now = new Date().toISOString()
    const route: DailyDeliveryRoute = {
      id: `ROUTE-EVENT-CONTRACT-${shared.todayString()}`, supplierId: 'S002', driverId: 'D001', deliveryDate: shared.todayString(), status: 'published',
      stops: [{ storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [order.id] }],
      totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: [order.id], provider: 'test', generatedAt: now, publishedAt: now
    }
    expect(shared.saveDailyDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    await checkInAtFarm(store as RoutingStore)
    const existingOperationIds = new Set(Object.keys(shared.readPlatformJournal()))
    expect(await store.handoverIn(order.id)).toBe(true)

    const journal = Object.values(shared.readPlatformJournal()).find((entry) => !existingOperationIds.has(entry.operationId) && entry.recoveryHandlerKey === 'supplier-routing-atomic-v1')!
    const tamperedJournal = shared.cloneSeed(journal)
    const tamperedTarget = tamperedJournal.target as { platformOrders: Record<string, Order> }
    tamper(tamperedTarget.platformOrders[order.id])
    const original = journal.original as { platformOrders: Record<string, Order>; dailyRoutes: DailyDeliveryRouteState; auditLogs: PlatformAuditLogEntry[] }
    expect(shared.writePlatformOrders(original.platformOrders)).toBe(true)
    expect(shared.writePlatformJson(shared.PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, original.dailyRoutes)).toBe(true)
    expect(shared.writePlatformJson(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs)).toBe(true)
    localStorage.setItem(shared.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({ ...shared.readPlatformJournal(), [journal.operationId]: tamperedJournal }))
    expect(shared.enqueuePlatformRecovery({ operationId: journal.operationId, failedStep: 'tampered-event-target', reason: 'test recovery validation', handlerKey: 'supplier-routing-atomic-v1' })).toBe(true)
    const task = shared.readPlatformRecoveryQueue().find((item) => item.operationId === journal.operationId)!

    expect(await shared.retryPlatformRecoveryTask(task.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a committed scope recovery whose target changes an unrelated driver scope', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const existingOperationIds = new Set(Object.keys(shared.readPlatformJournal()))
    expect(await store.updateDriverScope!('D001', ['F001'])).toMatchObject({ ok: true })

    const journal = Object.values(shared.readPlatformJournal()).find((entry) => !existingOperationIds.has(entry.operationId) && entry.recoveryHandlerKey === 'supplier-routing-atomic-v1')!
    expect(journal).toMatchObject({ status: 'committed' })
    const tamperedJournal = shared.cloneSeed(journal)
    const tamperedTarget = tamperedJournal.target as { driverScopes: DriverStoreScopeState }
    const unrelatedScope = tamperedTarget.driverScopes.scopes.find((scope) => scope.supplierId === 'S002' && scope.driverId === 'D002')!
    unrelatedScope.storeIds = ['F-TAMPERED']
    const original = journal.original as { driverScopes: DriverStoreScopeState; auditLogs: PlatformAuditLogEntry[] }
    expect(shared.writePlatformJson(shared.PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, original.driverScopes)).toBe(true)
    expect(shared.writePlatformJson(shared.PLATFORM_AUDIT_LOG_STORAGE_KEY, original.auditLogs)).toBe(true)
    localStorage.setItem(shared.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({ ...shared.readPlatformJournal(), [journal.operationId]: tamperedJournal }))
    expect(shared.enqueuePlatformRecovery({ operationId: journal.operationId, failedStep: 'tampered-scope-target', reason: 'test recovery validation', handlerKey: 'supplier-routing-atomic-v1' })).toBe(true)
    const task = shared.readPlatformRecoveryQueue().find((item) => item.operationId === journal.operationId)!
    const beforeRetry = {
      driverScopes: shared.cloneSeed(shared.readDriverStoreScopeState()),
      auditLogs: shared.cloneSeed(shared.readPlatformAuditLogs())
    }

    expect(await shared.retryPlatformRecoveryTask(task.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect(shared.readDriverStoreScopeState()).toEqual(beforeRetry.driverScopes)
    expect(shared.readPlatformAuditLogs()).toEqual(beforeRetry.auditLogs)
  })

  it('keeps a published today route when ensuring daily snapshots and records stopCount on new drafts', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const publishedAt = new Date(Date.now() - 2000).toISOString()
    const published = { ...publishedRoute('D001', 'ENSURE-KEEP'), generatedAt: publishedAt, publishedAt }
    expect(shared.saveDailyDeliveryRoute(published, store.dailyRouteRevision)).toMatchObject({ ok: true })
    expect(await store.ensureTodayRoutes!()).toMatchObject({ ok: true, value: { generated: 2 } })
    expect(shared.readDailyDeliveryRoutes('S002', 'D001')[0]).toMatchObject({ id: published.id, provider: 'test' })
    expect(shared.readDailyDeliveryRoutes('S002', 'D002')[0]).toMatchObject({ driverId: 'D002', status: 'published', stopCount: 1 })
    expect(shared.readDailyDeliveryRoutes('S002', 'D003')[0]).toMatchObject({ driverId: 'D003', status: 'published', stopCount: 1 })
    expect(await store.ensureTodayRoutes!()).toMatchObject({ ok: true, value: { generated: 0 } })
  })

  it('publishes a named route and batches accepted store orders onto its driver', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const route = store.namedRoutes.find((item) => item.id === 'NR-S002-EAST')!
    const at = new Date().toISOString()
    const accepted = [
      routeOrder({ id: 'BATCH-ROUTE-1', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: at } }),
      routeOrder({ id: 'BATCH-ROUTE-2', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: at } })
    ]
    accepted.forEach((order) => { expect(shared.writePlatformOrder(order)).toBe(true) })
    await store.refreshSharedState()

    expect(await store.optimizeNamedRoute!({ namedRouteId: route.id, driverId: 'D001', deliveryDate: shared.todayString() })).toMatchObject({ ok: true })
    expect(await store.publishRoute!()).toMatchObject({ ok: true, value: { driverId: 'D001', status: 'published' } })
    expect(shared.readPlatformOrders()?.['BATCH-ROUTE-1']?.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', deliverDate: shared.todayString() })
    expect(shared.readPlatformOrders()?.['BATCH-ROUTE-2']?.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', deliverDate: shared.todayString() })
    expect(shared.readDailyDeliveryRoutes('S002', 'D001').find((item) => item.sourceOrderIds.includes('BATCH-ROUTE-1'))?.stops.filter((stop) => stop.storeId === 'F001')).toHaveLength(1)
  })

  it('lets one driver switch between multiple routes on the same day', async () => {
    const firstOrder = routeOrder({ id: 'MULTI-ROUTE-A', storeId: 'F001', customer: '石板溪农家乐·门店' })
    const secondOrder = routeOrder({ id: 'MULTI-ROUTE-B', storeId: 'F002', customer: '云上人家·门店' })
    expect(shared.writePlatformOrder(firstOrder)).toBe(true)
    expect(shared.writePlatformOrder(secondOrder)).toBe(true)
    // 同一用例内固定日期快照与时间基准，避免跨毫秒/跨天导致发布顺序与「今日线路」判定抖动
    const today = shared.todayString()
    const base = Date.parse(new Date().toISOString())
    const first: DailyDeliveryRoute = {
      ...publishedRoute('D001', firstOrder.id),
      id: `ROUTE-S002-D001-${today}`, deliveryDate: today,
      generatedAt: new Date(base).toISOString(), publishedAt: new Date(base).toISOString()
    }
    const second: DailyDeliveryRoute = {
      ...publishedRoute('D001', secondOrder.id),
      id: `ROUTE-S002-D001-SECOND-${today}`,
      deliveryDate: today,
      stops: [{ storeId: 'F002', storeName: '云上人家·门店', address: '湖南省张家界市武陵源区云上村', longitude: 110.4792, latitude: 29.1171, orderIds: [secondOrder.id] }],
      sourceOrderIds: [secondOrder.id], generatedAt: new Date(base + 60000).toISOString(), publishedAt: new Date(base + 60000).toISOString()
    }
    expect(shared.saveDailyDeliveryRoute(first, 0)).toMatchObject({ ok: true })
    expect(shared.saveDailyDeliveryRoute(second, 1)).toMatchObject({ ok: true })

    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.todayDriverRoutes?.map((route) => route.id)).toEqual([first.id, second.id])
    expect(store.currentDriverRoute?.id).toBe(first.id)
    expect(store.pendingRouteTasks?.map((order) => order.id)).not.toEqual(expect.arrayContaining([firstOrder.id, secondOrder.id]))
    expect(store.selectDriverRoute?.(second.id)).toBe(true)
    expect(store.currentDriverRoute?.id).toBe(second.id)
    expect(await store.checkInStop?.('F002', { longitude: 110.4792, latitude: 29.1171 })).toMatchObject({ ok: true })
    expect(shared.readDailyDeliveryRoutes('S002', 'D001').find((route) => route.id === second.id)?.stops[0].checkIn).toEqual(expect.objectContaining({ distanceM: 0 }))
    expect(shared.readDailyDeliveryRoutes('S002', 'D001').find((route) => route.id === first.id)?.stops[0].checkIn).toBeUndefined()
  })

  it('invalidates a route preview so the old draft cannot be published', async () => {
    const store = useSupplierStore() as RoutingStore
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const route = store.namedRoutes.find((item) => item.id === 'NR-S002-EAST')!
    const at = new Date().toISOString()
    const accepted = routeOrder({ id: 'PREVIEW-INVALIDATED', status: 'pending', storeId: 'F001', customer: '石板溪农家乐·门店', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: at } })
    expect(shared.writePlatformOrder(accepted)).toBe(true)
    await store.refreshSharedState()
    expect(await store.optimizeNamedRoute!({ namedRouteId: route.id, driverId: 'D001', deliveryDate: shared.todayString() })).toMatchObject({ ok: true })
    expect(store.routeDraft).toBeTruthy()
    store.invalidateRoutePreview?.()
    expect(store.routeDraft).toBeNull()
    expect(await store.publishRoute!()).toMatchObject({ ok: false, code: 'invalid_route' })
  })
})
