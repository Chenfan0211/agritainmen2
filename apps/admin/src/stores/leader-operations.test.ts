import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, demoCDistributorProfiles, configurePlatformProviders, readCDistributorProfiles, readPricingDefaults, readShareConfig, readPlatformAuditLogs, writeCOrder, writeCCommissionRecords, writeUserBindings, writePlatformJson } from '@agritainment/shared'
import type { CCommissionAllocation, COrder, UserBinding } from '@agritainment/shared'
import { useAdminStore } from './admin'
import { buildAdminLeaders, buildAdminUsers, buildLeaderCommissionLedger } from '../data/user-operations'

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

const order = (id: string, userId: string, amount: number, level: COrder['level'] = 'normal'): COrder => {
  const item = { productId: `P-${id}`, skuId: `SKU-${id}`, name: `商品${id}`, skuName: '标准装', image: '', quantity: 1, unitPrice: amount, basePrice: amount, level1Commission: 0, level2Commission: 0, supplierId: 'S001' }
  return {
    id, userId, level,
    address: { id: `ADDR-${id}`, userId, receiver: '演示用户', phone: '13800000000', region: '湖南', detail: '演示地址', isDefault: true },
    amount, items: [item],
    subOrders: [{ id: `CSO-${id}`, supplierId: 'S001', supplierName: '供应商', items: [item], amount, status: 'received', logistics: [] }],
    commissionAllocations: [], status: 'received', createdAt: '2026-09-10T02:00:00.000Z'
  } as COrder
}

const commission = (id: string, beneficiaryId: string, beneficiaryLevel: CCommissionAllocation['beneficiaryLevel'], amount: number, status: CCommissionAllocation['status']): CCommissionAllocation => ({
  id, orderId: `O-${id}`, subOrderId: `S-${id}`, beneficiaryId, beneficiaryLevel, amount, status, createdAt: '2026-09-11T02:00:00.000Z'
})

afterEach(() => {
  vi.restoreAllMocks()
  configurePlatformProviders()
})

describe('admin leader and user operations', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    configurePlatformProviders()
    await useAdminStore().login('admin', '123456')
  })

  it('projects users with leader bindings and consumption totals', () => {
    writeUserBindings({ 'U-DEMO-NORMAL': { userId: 'U-DEMO-NORMAL', promoterId: 'T001', status: 'bound' } as UserBinding })
    expect(writeCOrder(order('O-U1', 'U-DEMO-L1', 128.5))).toBe(true)
    expect(writeCOrder(order('O-U2', 'U-DEMO-L1', 71.5))).toBe(true)
    expect(writeCOrder(order('O-U3', 'U-NO-AVATAR', 10))).toBe(true)

    const rows = buildAdminUsers()
    const leader = rows.find((row) => row.id === 'U-DEMO-L1')
    expect(leader).toMatchObject({ levelLabel: '一级团长', level1Leader: '张同学', orderCount: 2 })
    expect(leader?.consumedAmount).toBe(200)
    const bound = rows.find((row) => row.id === 'U-DEMO-NORMAL')
    expect(bound).toMatchObject({ levelLabel: '普通用户', level1Leader: '张同学', bindingStatusLabel: '已绑定' })
    // 用户资料含头像（清单「用户信息 / 用户资料」）：演示目录用户带头像，未登记用户走首字兜底
    expect(leader).toMatchObject({ avatar: '/static/images/field.webp' })
    expect(bound).toMatchObject({ avatar: '/static/images/peach.webp' })
    expect(rows.find((row) => row.id === 'U-NO-AVATAR')).toMatchObject({ name: '用户 U-NO-AVATAR', avatar: undefined })
  })

  it('aggregates leader subordinates and commission buckets', () => {
    expect(writeCCommissionRecords([
      commission('C-1', 'T001', 'level1', 18.6, 'available'),
      commission('C-2', 'T001', 'level1', 12.4, 'pending'),
      commission('C-3', 'T001', 'level1', 8, 'withdrawn'),
      commission('C-4', 'T002', 'level2', 6, 'available')
    ])).toBe(true)

    const leaders = buildAdminLeaders()
    const level1 = leaders.find((row) => row.promoterId === 'T001')
    expect(level1).toMatchObject({ levelLabel: '一级团长', availableCommission: 18.6, pendingCommission: 12.4, withdrawnCommission: 8, commissionCount: 3 })
    expect(level1?.directUserCount).toBeGreaterThan(0)
    expect(leaders.find((row) => row.promoterId === 'T002')).toMatchObject({ levelLabel: '二级团长', directLeaderCount: 0 })
    const ledger = buildLeaderCommissionLedger()
    expect(ledger[0]).toMatchObject({ leaderName: expect.any(String), levelLabel: expect.stringMatching(/团长/) })
  })

  it('keeps leader prices and share rates persisted with audit entries', async () => {
    const store = useAdminStore()
    await store.initialize()

    await expect(store.updateLeaderPricing({ ...readPricingDefaults(), level1Amount: 12, level2Amount: 18 })).resolves.toBe(true)
    expect(readPricingDefaults().level1Amount).toBe(12)
    expect(readPricingDefaults().level2Amount).toBe(18)
    expect(readPlatformAuditLogs().some((entry) => entry.action === 'leader.price.update' && entry.result === 'success')).toBe(true)

    await expect(store.updateLeaderShareRates({ level1Rate: 8, level2Rate: 4 })).resolves.toBe(true)
    const share = readShareConfig() as { leaderLevel1Rate?: number; leaderLevel2Rate?: number }
    expect(share.leaderLevel1Rate).toBe(8)
    expect(share.leaderLevel2Rate).toBe(4)
  })

  it('rejects invalid leader share rates without writing', async () => {
    const store = useAdminStore()
    await store.initialize()
    await expect(store.updateLeaderShareRates({ level1Rate: 120, level2Rate: 4 })).resolves.toBe(false)
    const share = readShareConfig() as { leaderLevel1Rate?: number }
    expect(share.leaderLevel1Rate ?? 0).toBe(0)
  })

  it('toggles a leader status and refuses unknown leaders', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(writePlatformJson(PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, demoCDistributorProfiles)).toBe(true)

    const paused = await store.setLeaderStatus('U-DEMO-L1', false)
    expect(paused?.status).toBe('paused')
    expect(readCDistributorProfiles()?.['U-DEMO-L1'].status).toBe('paused')
    await expect(store.setLeaderStatus('U-DEMO-L1', true)).resolves.toMatchObject({ status: 'active' })
    await expect(store.setLeaderStatus('U-MISSING', true)).resolves.toBeNull()
    expect(readPlatformAuditLogs().some((entry) => entry.action === 'leader.disable')).toBe(true)
  })
})
