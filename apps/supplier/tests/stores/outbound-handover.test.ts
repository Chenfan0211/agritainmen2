import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateRouteOutboundItems, configurePlatformProviders, readDailyDeliveryRoutes, readPlatformOrders, todayString } from '@agritainment/shared'
import { seedSupplierDemoRouteOnce } from '../../src/services/repository'
import { useSupplierStore } from '../../src/stores/supplier'

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

describe('supplier outbound handover store flow', () => {
  beforeEach(() => {
    useSupplierStore.reset()
    localStorage.clear()
    configurePlatformProviders()
    vi.unstubAllGlobals()
  })

  it('records abnormal warehouse check-in reasons and unlocks handover submission', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(seedSupplierDemoRouteOnce()).toBe(true)
    await store.refreshSharedState()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    const route = store.dailyRoutes.find((item) => item.driverId === 'D001' && item.deliveryDate === todayString())!
    expect(await store.checkInWarehouseAbnormal(route.id, { reasonCode: 'other' })).toMatchObject({ ok: false })
    expect(await store.checkInWarehouseAbnormal(route.id, { reasonCode: 'device_issue', reasonNote: '手机定位异常' })).toMatchObject({ ok: true, value: { type: 'abnormal', reasonCode: 'device_issue' } })
    const checkedIn = store.dailyRoutes.find((item) => item.id === route.id)!
    expect(checkedIn.warehouseCheckIn).toMatchObject({ type: 'abnormal', reasonCode: 'device_issue', reasonNote: '手机定位异常' })
    const items = aggregateRouteOutboundItems(store.orders.filter((order) => route.sourceOrderIds.includes(order.id)))
    expect(await store.submitRouteOutbound(route.id, { actuals: Object.fromEntries(items.map((item) => [item.skuId, item.expected])), proofImages: ['proof'] })).toMatchObject({ ok: true })
  })

  it('runs driver submission, supplier review, shortage allocation, dispatch and grouped store receipt', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(seedSupplierDemoRouteOnce()).toBe(true)
    await store.refreshSharedState()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    let route = store.dailyRoutes.find((item) => item.driverId === 'D001' && item.deliveryDate === todayString())!
    expect(route).toBeTruthy()
    expect(await store.checkInWarehouse(route.id, route.origin!)).toMatchObject({ ok: true })
    const items = aggregateRouteOutboundItems(store.orders.filter((order) => route.sourceOrderIds.includes(order.id)))
    const driverActuals = Object.fromEntries(items.map((item, index) => [item.skuId, index === 0 ? Math.max(0, item.expected - 1) : item.expected]))
    expect(await store.submitRouteOutbound(route.id, { actuals: driverActuals, proofImages: ['proof-1'], note: '司机提交' })).toMatchObject({ ok: true })

    store.logout()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    route = store.dailyRoutes.find((item) => item.id === route.id)!
    expect(await store.reviewRouteOutbound(route.id, { decision: 'reject', reason: '凭证不清晰' })).toMatchObject({ ok: true })

    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    route = store.dailyRoutes.find((item) => item.id === route.id)!
    expect(route.outboundHandover?.status).toBe('rejected')
    expect(await store.submitRouteOutbound(route.id, { actuals: driverActuals, proofImages: ['proof-2'], note: '已补充凭证' })).toMatchObject({ ok: true })

    store.logout()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    route = store.dailyRoutes.find((item) => item.id === route.id)!
    const supplierActuals = { ...driverActuals, [items[0].skuId]: Math.max(0, items[0].expected - 2) }
    expect(await store.reviewRouteOutbound(route.id, { decision: 'confirm', actuals: supplierActuals, note: '供应商复核' })).toMatchObject({ ok: true })

    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    route = store.dailyRoutes.find((item) => item.id === route.id)!
    expect(await store.markRouteShortages(route.id, [{ skuId: items[0].skuId, storeId: route.stops[0].storeId, quantity: 2, note: '包装破损' }])).toMatchObject({ ok: true })
    expect(await store.dispatchRoute(route.id)).toMatchObject({ ok: true })
    expect(store.orders.filter((order) => route.sourceOrderIds.includes(order.id)).every((order) => order.supplierFulfillment?.status === 'delivering')).toBe(true)

    const stop = route.stops[0]
    const destination = { longitude: stop.longitude!, latitude: stop.latitude! }
    expect(await store.checkInStop(stop.storeId, destination)).toMatchObject({ ok: true })
    expect(await store.handoverRouteStop(route.id, stop.storeId, '整店交接')).toMatchObject({ ok: true })
    expect(readPlatformOrders()![route.sourceOrderIds[0]].supplierFulfillment?.status).toBe('received')
    expect(readDailyDeliveryRoutes('S002', 'D001').find((item) => item.id === route.id)?.status).toBe('completed')
  })
})
