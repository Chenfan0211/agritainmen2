import { beforeEach, describe, expect, it } from 'vitest'
import { readCCommissionRecords, readCDistributorProfiles, readCUserSession, readUserBindings } from '@agritainment/shared'
import { seedDemoUserCart, seedDemoUserDistributor } from '../../src/data/demo-distributor'
import { createUserStore } from '../../src/stores/user'

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

describe('user demo distributor and cart seeds', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes an active L1 profile, T001 commissions and bindings without duplicating ids', () => {
    expect(seedDemoUserDistributor('U-SEED')).toBe(true)
    expect(seedDemoUserDistributor('U-SEED')).toBe(false)
    expect(readCDistributorProfiles()?.['U-SEED']).toMatchObject({ userId: 'U-SEED', promoterId: 'T001', level: 'level1', status: 'active' })
    const commissions = (readCCommissionRecords() || []).filter((item) => item.beneficiaryId === 'T001' && item.id.startsWith('DEMO-COMM-'))
    expect(commissions.length).toBeGreaterThanOrEqual(2)
    expect(Object.values(readUserBindings() || {}).some((item) => item.promoterId === 'T001' && item.status === 'bound')).toBe(true)
  })

  it('seeds a session cart once and leaves empty scenario untouched', () => {
    expect(seedDemoUserCart('U-SEED')).toBe(true)
    expect(seedDemoUserCart('U-SEED')).toBe(false)
    expect(readCUserSession('U-SEED').cart.length).toBeGreaterThanOrEqual(1)

    const store = createUserStore()
    store.$patch({ userId: 'U-EMPTY', mockScenario: 'empty', auth: { isLoggedIn: true, openid: 'openid-empty' } })
    expect(store.seedDemoData()).toBe(false)
    expect(readCDistributorProfiles()?.['U-EMPTY']).toBeUndefined()
    expect(readCUserSession('U-EMPTY').cart).toEqual([])
  })
})
