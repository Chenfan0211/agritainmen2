import type { CCartItem, CCommissionAllocation, CDistributorProfile, MockScenario } from '@agritainment/shared'
import { readCCommissionRecords, readCDistributorProfiles, readCUserSession, seedPlatformDemoData, writeCCommissionRecords, writeCDistributorProfiles, writeCUserSession } from '@agritainment/shared'

const demoCommissions: CCommissionAllocation[] = [
  { id: 'DEMO-COMM-T001-001', orderId: 'DEMO-ORD-T001-001', subOrderId: 'DEMO-CSO-T001-001', beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 18.6, status: 'available', createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'DEMO-COMM-T001-002', orderId: 'DEMO-ORD-T001-002', subOrderId: 'DEMO-CSO-T001-002', beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 12.4, status: 'pending', createdAt: '2026-09-02T11:20:00.000Z' },
  { id: 'DEMO-COMM-T001-003', orderId: 'DEMO-ORD-T001-003', subOrderId: 'DEMO-CSO-T001-003', beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 8, status: 'withdrawn', createdAt: '2026-08-28T09:10:00.000Z' }
]

const demoCartItems: CCartItem[] = [
  { productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.jpg', quantity: 1, unitPrice: 59.9, basePrice: 34.9, level1Commission: 10, level2Commission: 15, supplierId: 'S002', lockedLevel: 'level1', minimumOrderQuantity: 1 }
]

export function seedDemoUserDistributor(userId: string): boolean {
  if (!userId) return false
  seedPlatformDemoData()
  const profiles = { ...(readCDistributorProfiles() || {}) }
  let changed = false
  if (!profiles[userId]) {
    const profile: CDistributorProfile = { userId, promoterId: 'T001', level: 'level1', status: 'active' }
    profiles[userId] = profile
    if (!writeCDistributorProfiles(profiles)) return false
    changed = true
  }
  const current = readCCommissionRecords() || []
  const ids = new Set(current.map((item) => item.id))
  const missing = demoCommissions.filter((item) => !ids.has(item.id))
  if (missing.length) {
    if (!writeCCommissionRecords([...current, ...missing])) return false
    changed = true
  }
  return changed
}

export function seedDemoUserCart(userId: string, scenario: MockScenario = 'normal'): boolean {
  if (!userId || scenario !== 'normal') return false
  const session = readCUserSession(userId)
  if (session.cart.length) return false
  return writeCUserSession(userId, { ...session, cart: demoCartItems })
}
