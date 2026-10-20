import { beforeEach, describe, expect, it } from 'vitest'
import { writeStorePriceLevelDiscounts } from '@agritainment/shared'
import { BUSINESS_PRICE_LEVELS, businessPriceLevelDiscount, businessPriceLevelLabel, isBusinessPriceLevel, resolveBusinessPriceLevel } from './price-level'

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

describe('business price level', () => {
  beforeEach(() => localStorage.clear())

  it('discounts the distribution price per sales-rep level', () => {
    expect(businessPriceLevelDiscount('A')).toBe(0.95)
    expect(businessPriceLevelDiscount('B')).toBe(0.97)
    expect(businessPriceLevelDiscount('C')).toBe(1)
  })

  it('falls back to the store price when no level is given', () => {
    expect(businessPriceLevelDiscount()).toBe(1)
    expect(businessPriceLevelDiscount(null)).toBe(1)
    expect(businessPriceLevelLabel(null)).toBe('门店价')
    expect(businessPriceLevelLabel('A')).toBe('业务员 A 档')
  })

  it('reads the distribution discounts published by the platform', () => {
    expect(businessPriceLevelDiscount('A')).toBe(0.95)
    expect(writeStorePriceLevelDiscounts({ A: 0.9, B: 0.98 })).toBe(true)
    expect(businessPriceLevelDiscount('A')).toBe(0.9)
    expect(businessPriceLevelDiscount('B')).toBe(0.98)
    expect(businessPriceLevelDiscount('C')).toBe(1)
  })

  it('exposes the three supported levels', () => {
    expect([...BUSINESS_PRICE_LEVELS]).toEqual(['A', 'B', 'C'])
    expect(isBusinessPriceLevel('A')).toBe(true)
    expect(isBusinessPriceLevel('D')).toBe(false)
    expect(isBusinessPriceLevel(undefined)).toBe(false)
  })

  it('only derives a level for staff accounts', () => {
    expect(resolveBusinessPriceLevel({ role: 'owner', priceLevel: 'A' })).toBeNull()
    expect(resolveBusinessPriceLevel({ role: 'staff', priceLevel: 'B' })).toBe('B')
    expect(resolveBusinessPriceLevel({ role: 'staff' })).toBe('C')
    expect(resolveBusinessPriceLevel({ role: 'staff', priceLevel: 'D' })).toBe('C')
    expect(resolveBusinessPriceLevel(null)).toBeNull()
  })
})
