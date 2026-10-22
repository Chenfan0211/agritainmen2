import { describe, expect, it } from 'vitest'
import type { CDistributorProfile, COrder, UserBinding } from '@agritainment/shared'
import { projectDistributorOperations } from '../../src/services/distributor-operations'

const order = (id: string, chain: string[], status: COrder['subOrders'][number]['status'], amount = 100): COrder => ({
  id,
  userId: `U-${id}`,
  level: 'normal',
  address: { id: `A-${id}`, userId: `U-${id}`, receiver: '测试用户', phone: '13800000000', region: '湖南省', detail: '测试地址', isDefault: true },
  amount,
  items: [],
  subOrders: [{ id: `S-${id}`, supplierId: 'SUP-1', supplierName: '供应商', items: [], amount, status, logistics: [] }],
  distributorChain: chain,
  commissionAllocations: [],
  status,
  createdAt: '2026-09-01T08:00:00.000Z'
})

describe('分销运营数据投影', () => {
  const profiles: Record<string, CDistributorProfile> = {
    U1: { userId: 'U1', promoterId: 'P1', level: 'level1', status: 'active' },
    U2: { userId: 'U2', promoterId: 'P2', parentPromoterId: 'P1', level: 'level2', status: 'active' },
    U3: { userId: 'U3', promoterId: 'P3', parentPromoterId: 'P2', level: 'level2', status: 'active' }
  }
  const bindings: Record<string, UserBinding> = {
    FAN1: { userId: 'FAN1', promoterId: 'P1', status: 'bound' },
    FAN2: { userId: 'FAN2', promoterId: 'P2', status: 'bound' },
    PENDING: { userId: 'PENDING', promoterId: 'P1', status: 'pending' }
  }

  it('区分个人与团队订单，并排除待支付、取消和售后金额', () => {
    const result = projectDistributorOperations({
      promoterId: 'P1',
      profiles,
      bindings,
      orders: [
        order('PERSONAL', ['P1'], 'paid', 120),
        order('TEAM', ['P1', 'P2'], 'shipped', 230),
        order('DEEP', ['P1', 'P2', 'P3'], 'received', 310),
        order('UNPAID', ['P1'], 'pending_payment', 90),
        order('CANCELLED', ['P1', 'P2'], 'cancelled', 80),
        order('AFTERSALE', ['P1', 'P2'], 'after_sale', 70)
      ]
    })

    expect(result.personalOrders.map((item) => item.id)).toEqual(['PERSONAL'])
    expect(result.teamOrders.map((item) => item.id)).toEqual(['TEAM', 'DEEP'])
    expect(result.personalPerformance).toBe(120)
    expect(result.teamPerformance).toBe(540)
    expect(result.directFans.map((item) => item.userId)).toEqual(['FAN1'])
    expect(result.teamPromoterIds).toEqual(['P2', 'P3'])
  })

  it('混合状态订单只累计仍有效的子订单金额', () => {
    const mixed = order('MIXED', ['P1', 'P2'], 'paid', 300)
    mixed.subOrders = [
      { ...mixed.subOrders[0], id: 'S-VALID', amount: 180, status: 'received' },
      { ...mixed.subOrders[0], id: 'S-AFTER', amount: 120, status: 'after_sale' }
    ]
    mixed.status = 'partially_after_sale'

    const result = projectDistributorOperations({ promoterId: 'P1', profiles, bindings, orders: [mixed] })
    expect(result.teamOrders).toHaveLength(1)
    expect(result.teamPerformance).toBe(180)
  })
})
