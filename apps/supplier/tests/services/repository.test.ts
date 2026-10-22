import { beforeEach, describe, expect, it } from 'vitest'
import { readDailyDeliveryRoutes, readPlatformSupplierSettlements, todayString } from '@agritainment/shared'
import { seedSupplierDataOnce, seedSupplierDemoRouteOnce } from '../../src/services/repository'

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

describe('supplier demo seed', () => {
  beforeEach(() => localStorage.clear())

  it('merges S002 settlements by id and does not duplicate on rerun', () => {
    seedSupplierDataOnce()
    seedSupplierDataOnce()
    const records = Object.values(readPlatformSupplierSettlements() || {})
    const demo = records.filter((item) => item.id.startsWith('SST-DEMO-'))
    expect(demo.length).toBeGreaterThanOrEqual(2)
    expect(demo.some((item) => item.supplierIds.includes('S002'))).toBe(true)
  })

  it('publishes one today route for D001 without duplicating', () => {
    expect(seedSupplierDemoRouteOnce()).toBe(true)
    expect(seedSupplierDemoRouteOnce()).toBe(false)
    const routes = readDailyDeliveryRoutes('S002', 'D001').filter((item) => item.deliveryDate === todayString() && item.status === 'published')
    expect(routes).toHaveLength(1)
    expect(routes[0].stops.map((stop) => stop.storeId)).toEqual(['F001'])
    expect(routes[0]).toMatchObject({ stopCount: 1, provider: 'demo-seed' })
    expect(routes[0].polyline?.length).toBeGreaterThan(1)
  })
})
