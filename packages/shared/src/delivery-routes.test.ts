import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DRIVER_CHECK_IN_MAX_METERS,
  configurePlatformProviders,
  distanceMeters,
  ensurePublishedRoutesForDate,
  filterStopsWithOrders,
  namedRouteForDriver,
  namedRoutesForDriver,
  optimizeDeliveryRoute,
  orderStopsByNamedRoute,
  saveDailyDeliveryRoute,
  saveNamedDeliveryRoute,
  snapshotDailyDeliveryRoute,
  validateStopCheckIn,
  type DailyDeliveryRoute,
  type DriverAccount,
  type Order,
  type RouteStop
} from './index'

const memory = new Map<string, string>()
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
    removeItem: (key: string) => { memory.delete(key) },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size }
  } as Storage
}

const driver: DriverAccount = {
  id: 'D-1', supplierId: 'S-1', name: '张伟', account: 'driver-1', password: '123456', status: 'active', createdAt: '2026-09-01T00:00:00.000Z'
}

function stop(storeId: string, orderIds: string[], extra: Partial<RouteStop> = {}): RouteStop {
  return { storeId, storeName: storeId, address: `${storeId} 路`, longitude: 109.85, latitude: 28.62, orderIds, ...extra }
}

function orderOf(id: string, storeId: string): Order {
  return {
    id, productName: '腊肉', quantity: 1, amount: 10, customer: storeId, channel: 'purchase', status: 'shipping',
    createdAt: '2026-09-07T08:00:00.000Z', supplierId: 'S-1', storeId, storeName: storeId,
    items: [{ productId: 'P1', skuId: 'P1-1', name: '腊肉', skuName: '500g', image: '/x.jpg', quantity: 1, price: 10 }],
    supplierFulfillment: {
      status: 'delivering', shipType: 'driver', driverId: 'D-1', driverName: '张伟', deliverDate: '2026-09-07',
      shortages: [], handovers: [], updatedAt: '2026-09-07T08:00:00.000Z'
    }
  }
}

function published(overrides: Partial<DailyDeliveryRoute> = {}): DailyDeliveryRoute {
  return {
    id: 'ROUTE-S-1-D-1-2026-09-07', supplierId: 'S-1', driverId: 'D-1', deliveryDate: '2026-09-07', status: 'published',
    stops: [stop('F001', ['O-1'])], totalDistanceKm: 1, estimatedDurationMinutes: 10, sourceOrderIds: ['O-1'],
    provider: 'demo-seed', generatedAt: '2026-09-07T00:00:00.000Z', publishedAt: '2026-09-07T00:00:00.000Z',
    stopCount: 1, ...overrides
  }
}

describe('daily delivery route snapshot', () => {
  beforeEach(() => {
    localStorage.clear()
    configurePlatformProviders()
  })
  afterEach(() => { configurePlatformProviders() })

  it('drops farms that have no orders before counting stops', () => {
    expect(filterStopsWithOrders([
      stop('F001', ['O-1']),
      stop('F002', []),
      stop('F003', ['O-2', 'O-3'])
    ]).map((item) => item.storeId)).toEqual(['F001', 'F003'])
    expect(snapshotDailyDeliveryRoute({
      ...published({ stops: [stop('F001', ['O-1']), stop('F002', [])], sourceOrderIds: ['O-1'] })
    }).stopCount).toBe(1)
  })

  it('keeps an already published route and does not overwrite the demo seed', async () => {
    expect(saveDailyDeliveryRoute(published(), 0)).toMatchObject({ ok: true })
    const result = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07', drivers: [driver],
      orders: [orderOf('O-NEW', 'F002')],
      warehouse: { longitude: 109.85, latitude: 28.62 },
      resolveStore: (item) => ({ storeId: item.storeId!, storeName: item.storeName || item.storeId!, address: '湘西', longitude: 109.86, latitude: 28.63 })
    })
    expect(result.generated).toEqual([])
    expect(result.skipped).toEqual(['D-1'])
    expect(result.routes[0]).toMatchObject({ id: 'ROUTE-S-1-D-1-2026-09-07', provider: 'demo-seed', sourceOrderIds: ['O-1'] })
  })

  it('publishes only farms that have tasks and records stopCount', async () => {
    const result = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07',
      drivers: [driver, { ...driver, id: 'D-2', account: 'driver-2' }],
      orders: [orderOf('O-A', 'F001'), orderOf('O-B', 'F002')],
      warehouse: { longitude: 109.85, latitude: 28.62 },
      resolveStore: (item) => item.storeId === 'F003'
        ? { storeId: 'F003', storeName: '空站', address: '空' }
        : { storeId: item.storeId!, storeName: item.storeName || item.storeId!, address: '湘西', longitude: 109.86, latitude: 28.63 }
    })
    expect(result.skipped).toEqual(['D-2'])
    expect(result.generated).toHaveLength(1)
    expect(result.generated[0]).toMatchObject({
      driverId: 'D-1', status: 'published', stopCount: 2, sourceOrderIds: ['O-A', 'O-B']
    })
    expect(result.generated[0].stops.map((item) => item.storeId)).toEqual(['F001', 'F002'])
  })

  it('records the current driver scope on auto-published snapshots', async () => {
    const result = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07', drivers: [driver],
      orders: [orderOf('O-A', 'F001')],
      warehouse: { longitude: 109.85, latitude: 28.62 },
      scopes: [{ supplierId: 'S-1', driverId: 'D-1', storeIds: ['F001', 'F003'], updatedAt: '2026-09-07T00:00:00.000Z' }],
      resolveStore: (item) => ({ storeId: item.storeId!, storeName: item.storeName || item.storeId!, address: '湘西', longitude: 109.86, latitude: 28.63 })
    })
    expect(result.generated[0]).toMatchObject({ driverId: 'D-1', status: 'published', scopeStoreIds: ['F001', 'F003'] })
  })

  it('publishes multiple drivers in one pass without losing later snapshots', async () => {
    const result = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07',
      drivers: [driver, { ...driver, id: 'D-2', account: 'driver-2' }],
      orders: [orderOf('O-A', 'F001'), { ...orderOf('O-B', 'F002'), supplierFulfillment: { ...orderOf('O-B', 'F002').supplierFulfillment!, driverId: 'D-2' } }],
      warehouse: { longitude: 109.85, latitude: 28.62 }, now: '2026-09-07T00:00:00.000Z',
      resolveStore: (item) => ({ storeId: item.storeId!, storeName: item.storeName || item.storeId!, address: '湘西', longitude: 109.86, latitude: 28.63 })
    })
    expect(result.generated.map((item) => item.driverId)).toEqual(['D-1', 'D-2'])
    expect(result.generated.every((item) => item.status === 'published' && item.stopCount === 1)).toBe(true)
  })

  it('skips a driver when the warehouse or today tasks are missing', async () => {
    const noWarehouse = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07', drivers: [driver], orders: [orderOf('O-A', 'F001')],
      resolveStore: (item) => ({ storeId: item.storeId!, storeName: '店', address: '湘西', longitude: 109.86, latitude: 28.63 })
    })
    expect(noWarehouse.generated).toEqual([])
    expect(noWarehouse.skipped).toEqual(['D-1'])
    const noTasks = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07', drivers: [driver], orders: [],
      warehouse: { longitude: 109.85, latitude: 28.62 },
      resolveStore: () => undefined
    })
    expect(noTasks.generated).toEqual([])
    expect(noTasks.skipped).toEqual(['D-1'])
  })

  it('orders today stops by the named route and appends off-route farms with a warning', async () => {
    expect(saveNamedDeliveryRoute({
      id: 'NR-1', supplierId: 'S-1', name: '东线', storeIds: ['F002', 'F001'], driverId: 'D-1', updatedAt: '2026-09-07T00:00:00.000Z'
    }, 0)).toMatchObject({ ok: true })
    const result = await ensurePublishedRoutesForDate({
      supplierId: 'S-1', date: '2026-09-07', drivers: [driver],
      orders: [orderOf('O-A', 'F001'), orderOf('O-B', 'F002'), orderOf('O-C', 'F003')],
      warehouse: { longitude: 109.85, latitude: 28.62 },
      namedRoutes: [{ id: 'NR-1', supplierId: 'S-1', name: '东线', storeIds: ['F002', 'F001'], driverId: 'D-1', updatedAt: '2026-09-07T00:00:00.000Z' }],
      resolveStore: (item) => ({ storeId: item.storeId!, storeName: item.storeName || item.storeId!, address: '湘西', longitude: 109.86, latitude: 28.63 })
    })
    expect(result.generated[0].stops.map((item) => item.storeId)).toEqual(['F002', 'F001', 'F003'])
    expect(result.generated[0].warnings).toEqual(expect.arrayContaining(['off_route:F003']))
    expect(result.generated[0].scopeStoreIds).toEqual(['F002', 'F001'])
  })
})

describe('named delivery routes', () => {
  beforeEach(() => localStorage.clear())

  it('rejects the same store on two routes for one supplier while allowing another supplier', () => {
    expect(saveNamedDeliveryRoute({
      id: 'NR-UNIQUE-EAST', supplierId: 'S-1', name: '东线', storeIds: ['F001'], updatedAt: '2026-09-07T00:00:00.000Z'
    }, 0)).toMatchObject({ ok: true })
    expect(saveNamedDeliveryRoute({
      id: 'NR-UNIQUE-WEST', supplierId: 'S-1', name: '西线', storeIds: ['F001'], updatedAt: '2026-09-07T00:00:01.000Z'
    }, 1)).toMatchObject({ ok: false, code: 'route_store_conflict' })
    expect(saveNamedDeliveryRoute({
      id: 'NR-UNIQUE-OTHER', supplierId: 'S-2', name: '西线', storeIds: ['F001'], updatedAt: '2026-09-07T00:00:02.000Z'
    }, 1)).toMatchObject({ ok: true })
  })

  it('includes the conflicting store and existing route in the rejection message', () => {
    expect(saveNamedDeliveryRoute({
      id: 'NR-FRIENDLY-EAST', supplierId: 'S-1', name: '东线', storeIds: ['F001'], updatedAt: '2026-09-07T00:00:00.000Z'
    }, 0)).toMatchObject({ ok: true })
    expect(saveNamedDeliveryRoute({
      id: 'NR-FRIENDLY-WEST', supplierId: 'S-1', name: '西线', storeIds: ['F001'], updatedAt: '2026-09-07T00:00:01.000Z'
    }, 1)).toMatchObject({ ok: false, message: '门店「F001」已在线路「东线」中' })
  })

  it('preserves farmhouse order and allows multiple routes for one driver', () => {
    expect(saveNamedDeliveryRoute({
      id: 'NR-EAST', supplierId: 'S-1', name: '东线', storeIds: ['F002', 'F001', 'F002'], driverId: 'D-1', updatedAt: '2026-09-07T00:00:00.000Z'
    }, 0)).toMatchObject({ ok: true })
    expect(saveNamedDeliveryRoute({
      id: 'NR-WEST', supplierId: 'S-1', name: '西线', storeIds: ['F003'], driverId: 'D-1', updatedAt: '2026-09-07T00:00:01.000Z'
    }, 1)).toMatchObject({ ok: true })
    expect(namedRouteForDriver('S-1', 'D-1')?.id).toBe('NR-EAST')
    expect(namedRoutesForDriver('S-1', 'D-1').map((route) => route.id)).toEqual(['NR-EAST', 'NR-WEST'])
  })

  it('keeps named-route order and appends extra farms last', () => {
    const ordered = orderStopsByNamedRoute(['F002', 'F001'], [
      stop('F001', ['O-1']),
      stop('F003', ['O-3']),
      stop('F002', ['O-2'])
    ])
    expect(ordered.stops.map((item) => item.storeId)).toEqual(['F002', 'F001', 'F003'])
    expect(ordered.warnings).toEqual(['off_route:F003'])
  })

  it('keeps the requested stop order when route optimization is used for a preview', () => {
    const result = optimizeDeliveryRoute({
      origin: { longitude: 109.85, latitude: 28.62 },
      preserveStopOrder: true,
      stops: [stop('F002', ['O-B'], { longitude: 110.2 }), stop('F001', ['O-A'], { longitude: 109.86 })]
    })
    expect(result?.orderedStops.map((item) => item.storeId)).toEqual(['F002', 'F001'])
  })
})

describe('driver check-in distance', () => {
  const origin = { latitude: 28.6267, longitude: 109.8542 }
  const offset = (meters: number) => ({ latitude: 28.6267 + meters / (6371 * 1000 * Math.PI / 180), longitude: 109.8542 })

  it('accepts 499 meters and rejects 501 meters or a store without coordinates', () => {
    expect(distanceMeters(origin, offset(499))).toBeLessThanOrEqual(DRIVER_CHECK_IN_MAX_METERS)
    expect(validateStopCheckIn({ latitude: origin.latitude, longitude: origin.longitude }, offset(499))).toMatchObject({ ok: true })
    expect(validateStopCheckIn({ latitude: origin.latitude, longitude: origin.longitude }, offset(501))).toMatchObject({ ok: false, code: 'too_far' })
    expect(validateStopCheckIn({}, origin)).toMatchObject({ ok: false, code: 'store_coordinates_missing' })
  })
})
