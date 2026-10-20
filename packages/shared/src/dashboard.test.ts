import { describe, expect, it } from 'vitest'
import { buildDashboardSnapshot, compareTrendWindows, dashboardModulesForRole, type DashboardDataSource } from './dashboard'

const now = new Date('2026-08-25T12:00:00+08:00')

function source(): DashboardDataSource {
  return {
    farms: [
      {
        id: 'F-CS', name: '长沙示范门店', region: '长沙市岳麓区', city: '长沙市', status: 'active',
        address: '麓景路 1 号', locationStatus: 'resolved',
        location: {
          longitude: 112.93, latitude: 28.23, coordinateSystem: 'GCJ-02', adCode: '430104',
          province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区麓景路 1 号',
          provider: 'amap', geocodedAt: '2026-08-24T08:00:00.000Z'
        }
      },
      {
        id: 'F-ZZ', name: '株洲待定位门店', region: '株洲市天元区', city: '株洲市', status: 'pending',
        address: '神农大道 1 号', locationStatus: 'failed', locationError: 'NO_RESULT'
      }
    ] as DashboardDataSource['farms'],
    storeAccounts: [
      { id: 'SA1', farmId: 'F-CS', name: '店员甲', account: 'staff1', password: 'x', role: 'staff', enabled: true },
      { id: 'SA2', farmId: 'F-CS', name: '店主', account: 'owner', password: 'x', role: 'owner', enabled: true },
      { id: 'SA3', farmId: 'F-ZZ', name: '停用店员', account: 'staff2', password: 'x', role: 'staff', enabled: false }
    ],
    suppliers: [
      {
        id: 'S1', name: '供应商甲', region: '湖南', category: '蔬菜', certified: true, status: 'cooperating',
        productCount: 1, qualification: { businessLicense: 'ok', permit: 'ok', validUntil: '2026-09-10', reviewNote: '' }
      }
    ],
    promoters: [{ id: 'P1', name: '业务员甲', level: '金牌', fans: 100, orders: 12, gmv: 900, commission: 30, status: 'active' }],
    catalog: {
      schemaVersion: 2,
      revision: 1,
      products: [
        {
          id: 'CP1', name: '有机蔬菜', category: '蔬菜', supplierId: 'S1', supplierName: '供应商甲', source: 'platform',
          status: 'active', image: '', images: [], tags: [], productType: 'goods', expressDelivery: true, channel: 'all',
          farmIds: ['F-CS'], promoterCommissionRate: 5, storeCommissionRate: 3,
          skus: [{ id: 'SKU1', name: '标准份', image: '', retailPrice: 20, cost: 12, stock: 5, level1Amount: 1, level2Amount: 2 }]
        }
      ]
    },
    cOrders: [
      { id: 'CO1', farmId: 'F-CS', amount: 200, status: 'received', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 20 }] },
      { id: 'DEMO-CO2', farmId: 'F-CS', amount: 999, status: 'paid', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 99 }] },
      { id: 'CO3', farmId: 'F-CS', amount: 88, status: 'cancelled', createdAt: '2026-08-24T10:00:00.000Z', items: [] },
      { id: 'CO4', farmId: 'F-ZZ', amount: 150, status: 'paid', createdAt: '2026-08-24T10:00:00.000Z', items: [] }
    ],
    voucherOrders: [
      { id: 'VO1', userId: 'U1', farmId: 'F-CS', productId: 'CP1', skuId: 'SKU1', quantity: 1, amount: 100, status: 'redeemed', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'VO2', userId: 'U1', farmId: 'F-CS', productId: 'CP1', skuId: 'SKU1', quantity: 1, amount: 100, status: 'refunded', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'DEMO-VO3', userId: 'U1', farmId: 'F-CS', productId: 'CP1', skuId: 'SKU1', quantity: 1, amount: 100, status: 'paid', createdAt: '2026-08-24T10:00:00.000Z' }
    ],
    fulfillmentOrders: [
      { id: 'PO1', farmId: 'F-CS', amount: 100, status: 'delivered', createdAt: '2026-08-23T10:00:00.000Z' },
      { id: 'PO2', farmId: 'F-CS', amount: 100, status: 'pending', createdAt: '2026-08-20T10:00:00.000Z' }
    ],
    afterSales: [{ id: 'AS1', orderId: 'CO1', status: 'processing', amount: 10 }]
  }
}

describe('compareTrendWindows', () => {
  it('computes period-over-period deltas for the same window length', () => {
    const current = [{ amount: 120, orderCount: 12 }, { amount: 80, orderCount: 8 }]
    const previous = [{ amount: 100, orderCount: 10 }, { amount: 0, orderCount: 0 }]
    expect(compareTrendWindows(current, previous)).toEqual({
      currentAmount: 200, currentOrders: 20, previousAmount: 100, previousOrders: 10,
      amountDeltaPercent: 100, orderDeltaPercent: 100
    })
  })

  it('returns null deltas for an empty previous window and handles flat or declining windows', () => {
    expect(compareTrendWindows([{ amount: 50, orderCount: 5 }], [])).toMatchObject({
      currentAmount: 50, previousAmount: 0, amountDeltaPercent: null, orderDeltaPercent: null
    })
    expect(compareTrendWindows([{ amount: 75, orderCount: 3 }], [{ amount: 100, orderCount: 4 }])).toMatchObject({
      amountDeltaPercent: -25, orderDeltaPercent: -25
    })
    expect(compareTrendWindows([{ amount: 100, orderCount: 4 }], [{ amount: 100, orderCount: 4 }])).toMatchObject({
      amountDeltaPercent: 0, orderDeltaPercent: 0
    })
  })
})

describe('dashboard snapshot aggregator', () => {
  it('builds city and farm profiles from administrative codes instead of free-text city names', () => {
    const data = source()
    data.farms[0].city = '错误城市'

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D-CITY', name: '省级领导', role: 'leader', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' },
      now
    })

    expect(snapshot.cityProfiles).toEqual([
      expect.objectContaining({
        cityCode: '4301', cityName: '长沙市', storeCount: 1, activeStoreCount: 1,
        activeStaffCount: 1, transactionAmount: 300, orderCount: 2
      })
    ])
    expect(snapshot.cityMapPoints).toEqual([
      expect.objectContaining({ cityCode: '4301', cityName: '长沙市', storeCount: 1, longitude: 112.93, latitude: 28.23 })
    ])
    expect(snapshot.farmProfiles.find((item) => item.farmId === 'F-CS')).toMatchObject({
      cityCode: '4301', districtCode: '430104', cityName: '长沙市', districtName: '岳麓区',
      activeStaffCount: 1, transactionAmount: 300, orderCount: 2, voucherCount: 1
    })
  })

  it('filters authorized regions before aggregating every metric', () => {
    const snapshot = buildDashboardSnapshot(source(), {
      principal: { id: 'D1', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' },
      now
    })

    expect(snapshot.overview.storeCount).toBe(1)
    expect(snapshot.overview.activeStaffCount).toBe(1)
    expect(snapshot.overview.transactionAmount).toBe(300)
    expect(snapshot.overview.transactionOrderCount).toBe(2)
    expect(snapshot.mapPoints).toHaveLength(1)
    expect(snapshot.mapPoints[0].farmId).toBe('F-CS')
    expect(snapshot.unlocatedStoreCount).toBe(0)
    expect(snapshot.regionRanking.map((item) => [item.regionCode, item.regionName])).toEqual([['430104', '岳麓区']])
  })

  it('excludes DEMO, cancelled and refunded records and reports unresolved stores', () => {
    const snapshot = buildDashboardSnapshot(source(), {
      principal: { id: 'D2', name: '省级领导', role: 'leader', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' },
      now
    })

    expect(snapshot.overview.transactionAmount).toBe(450)
    expect(snapshot.overview.transactionOrderCount).toBe(3)
    expect(snapshot.overview.lowStockSkuCount).toBe(1)
    expect(snapshot.unlocatedStoreCount).toBe(1)
    expect(snapshot.risks.some((item) => item.rule === 'store-location-failed')).toBe(true)
    expect(snapshot.risks.some((item) => item.rule === 'supplier-qualification-expiring')).toBe(true)
    expect(snapshot.suggestions.some((item) => item.rule === 'low-fulfillment')).toBe(true)
  })

  it('returns role-specific module access and blocks disabled principals', () => {
    expect(dashboardModulesForRole('leader')).toEqual(['overview', 'regional-comparison'])
    expect(dashboardModulesForRole('regulator')).toEqual(['overview', 'regulatory-monitoring'])
    expect(dashboardModulesForRole('industry_service')).toEqual(['overview', 'industry-empowerment'])

    expect(() => buildDashboardSnapshot(source(), {
      principal: { id: 'D3', name: '停用账号', role: 'leader', regionCodes: ['43'], status: 'disabled' },
      range: { start: '2026-08-01', end: '2026-08-25' },
      now
    })).toThrow('Dashboard principal is disabled')
  })

  it('does not leak unattributed suppliers or promoters into a city scope', () => {
    const data = source()
    data.suppliers.push({
      id: 'S2', name: '未归属供应商', region: '湖南', category: '水果', certified: true, status: 'cooperating', productCount: 1,
      qualification: { businessLicense: 'ok', permit: 'ok', validUntil: '2027-12-31', reviewNote: '' }
    })
    data.catalog!.products.push({
      id: 'CP2', name: '未归属水果', category: '水果', supplierId: 'S2', supplierName: '未归属供应商', source: 'platform', status: 'active',
      image: '', images: [], tags: [], productType: 'goods', expressDelivery: true, channel: 'all', farmIds: [],
      promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: 'SKU2', name: '标准份', image: '', retailPrice: 30, cost: 18, stock: 20, level1Amount: 1, level2Amount: 2 }]
    })
    data.promoters.push({ id: 'P2', name: '未归属推客', level: '普通', fans: 10, orders: 1, gmv: 30, commission: 1, status: 'active' })

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D4', name: '长沙产业专员', role: 'industry_service', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.overview.supplierCount).toBe(1)
    expect(snapshot.overview.promoterHostCount).toBe(0)
  })

  it('counts embedded C-order after-sales and calculates period-over-period growth', () => {
    const data = source()
    ;(data.cOrders[0] as DashboardDataSource['cOrders'][number] & { subOrders: Array<{ afterSale?: { status: string } }> }).subOrders = [{ afterSale: { status: 'processing' } }]
    data.afterSales = []
    data.cOrders.push({ id: 'CO-PREV', farmId: 'F-CS', amount: 100, status: 'received', createdAt: '2026-07-20T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 2 }] })

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D5', name: '省级领导', role: 'leader', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.service.afterSaleCount).toBe(1)
    expect(snapshot.regionRanking.find((item) => item.regionCode === '4301')?.growthRate ?? 0).toBeGreaterThan(0)
    expect(snapshot.suggestions.some((item) => item.rule === 'transaction-growth')).toBe(true)
  })

  it('counts only paid C-order states as consumer transactions', () => {
    const data = source()
    data.cOrders.push(
      { id: 'CO-UNPAID', farmId: 'F-CS', amount: 999, status: 'pending_payment', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 99 }] },
      { id: 'CO-PARTIAL-AFTER-SALE', farmId: 'F-CS', amount: 50, status: 'partially_after_sale', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 1 }] }
    )

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D6', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.overview.transactionAmount).toBe(350)
    expect(snapshot.overview.transactionOrderCount).toBe(3)
    expect(snapshot.service.paidOrderCount).toBe(2)
  })

  it('does not widen district authorization to coarser city-only records', () => {
    const data = source()
    data.farms.push({
      id: 'F-CS-COARSE', name: '仅市级归属门店', region: '长沙市', city: '长沙市', status: 'active', address: '待补充',
      locationStatus: 'resolved',
      location: {
        longitude: 112.9, latitude: 28.2, coordinateSystem: 'GCJ-02', adCode: '4301', province: '湖南省', city: '长沙市',
        district: '', formattedAddress: '湖南省长沙市', provider: 'amap', geocodedAt: '2026-08-24T08:00:00.000Z'
      }
    } as DashboardDataSource['farms'][number])

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D7', name: '岳麓区监管员', role: 'regulator', regionCodes: ['430104'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.overview.storeCount).toBe(1)
    expect(snapshot.mapPoints.map((point) => point.farmId)).toEqual(['F-CS'])
  })

  it('aggregates authorized settlement exposure and reports failed supplier settlements', () => {
    const data = source()
    data.supplierSettlements = [{
      id: 'SS-FAILED', period: '2026-08', supplierIds: ['S1'], orderIds: ['PO1'], amount: 120, createdAt: '2026-08-24T10:00:00.000Z', status: 'failed',
      items: [{ supplierId: 'S1', supplierName: '供应商甲', orderIds: ['PO1'], amount: 120 }]
    }]
    data.commissionLedger = [{
      id: 'CL-PENDING', sourceOrderId: 'CO1', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter',
      amount: 18, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z'
    }]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D8', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.settlement.failedSupplierSettlementCount).toBe(1)
    expect(snapshot.settlement.pendingCommissionAmount).toBe(18)
    expect(snapshot.risks.some((item) => item.rule === 'settlement-failed')).toBe(true)
  })

  it('attributes an in-range settlement through an authorized historical fulfillment order', () => {
    const data = source()
    data.fulfillmentOrders = [{
      id: 'PO-HISTORICAL', farmId: 'F-CS', amount: 135, status: 'delivered', createdAt: '2026-07-20T10:00:00.000Z'
    }]
    data.supplierSettlements = [{
      id: 'SS-CURRENT', period: '2026-08', supplierIds: ['S1'], orderIds: ['PO-HISTORICAL'], amount: 135,
      createdAt: '2026-08-24T10:00:00.000Z', status: 'pending',
      items: [{ supplierId: 'S1', supplierName: '供应商甲', orderIds: ['PO-HISTORICAL'], amount: 135 }]
    }]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D8-HISTORICAL', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.settlement.pendingSupplierAmount).toBe(135)
  })

  it('treats inconsistent resolved locations as unlocated and identifies the farm subject', () => {
    const data = source()
    data.farms[0] = {
      ...data.farms[0],
      regionCode: '430104',
      location: { ...data.farms[0].location!, adCode: '430202' }
    }

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D9', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.mapPoints.map((point) => point.farmId)).not.toContain('F-CS')
    expect(snapshot.unlocatedStoreCount).toBe(2)
    expect(snapshot.risks.find((risk) => risk.id === 'location:F-CS')?.subjects).toMatchObject([
      { type: 'farm', id: 'F-CS', name: '长沙示范门店' }
    ])
    expect(snapshot.risks.find((risk) => risk.id === 'location:F-CS')?.rule).toBe('store-location-region-mismatch')

    const citySnapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D9-CITY', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })
    expect(citySnapshot.overview.storeCount).toBe(1)
    expect(citySnapshot.unlocatedStoreCount).toBe(1)
  })

  it('classifies a structured district and coordinate mismatch when legacy regionCode is absent', () => {
    const data = source()
    data.farms[0] = {
      ...data.farms[0],
      regionCode: undefined,
      structuredAddress: {
        provinceCode: '43', province: '湖南省', cityCode: '4301', city: '长沙市',
        districtCode: '430104', district: '岳麓区', detail: '联调路 1 号'
      },
      location: { ...data.farms[0].location!, adCode: '430202' }
    }

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D9-STRUCTURED', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.risks.find((risk) => risk.id === 'location:F-CS')?.rule).toBe('store-location-region-mismatch')
  })

  it('returns null ratios when their denominator is zero', () => {
    const data = source()
    data.cOrders = []
    data.voucherOrders = []
    data.fulfillmentOrders = []
    data.afterSales = []

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D10', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.fulfillment.rate).toBeNull()
    expect(snapshot.service.afterSaleRate).toBeNull()
    expect(snapshot.service.voucherRedemptionRate).toBeNull()
    expect(snapshot.regionRanking[0].growthRate).toBeNull()
  })

  it('nets completed sub-order refunds and excludes fully refunded C orders', () => {
    const data = source()
    data.cOrders[0].subOrders = [
      { id: 'SO-REFUNDED', amount: 80, afterSale: { status: 'completed' } },
      { id: 'SO-KEPT', amount: 120 }
    ]
    data.cOrders.push({
      id: 'CO-FULL-REFUND', farmId: 'F-CS', amount: 50, status: 'after_sale', createdAt: '2026-08-24T12:00:00.000Z',
      items: [{ productId: 'CP1', quantity: 1 }],
      subOrders: [{ id: 'SO-FULL-REFUND', amount: 50, afterSale: { status: 'completed' } }]
    })

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D12', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.overview.transactionAmount).toBe(220)
    expect(snapshot.overview.transactionOrderCount).toBe(2)
    expect(snapshot.service.paidOrderCount).toBe(1)
    expect(snapshot.mapPoints[0].transactionAmount).toBe(220)
  })

  it('aggregates settlement amounts from authorized fulfillment order ids', () => {
    const data = source()
    data.fulfillmentOrders.push({ id: 'PO-ZZ', farmId: 'F-ZZ', amount: 500, status: 'delivered', createdAt: '2026-08-23T10:00:00.000Z' })
    data.supplierSettlements = [{
      id: 'SS-MIXED', period: '2026-08', supplierIds: ['S1'], orderIds: ['PO1', 'PO-ZZ'], amount: 600,
      createdAt: '2026-08-24T10:00:00.000Z', status: 'pending',
      items: [{ supplierId: 'S1', supplierName: '供应商甲', orderIds: ['PO1', 'PO-ZZ'], amount: 600 }]
    }]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D13', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.settlement.pendingSupplierAmount).toBe(100)
  })

  it('attributes commissions by farm first and source order second', () => {
    const data = source()
    data.commissionLedger = [
      { id: 'CL-DIRECT-CS', sourceOrderId: 'UNKNOWN-1', farmId: 'F-CS', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter', amount: 5, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-DIRECT-ZZ', sourceOrderId: 'CO1', farmId: 'F-ZZ', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter', amount: 7, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-VOUCHER', sourceOrderId: 'VO1', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter', amount: 11, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-FULFILLMENT', sourceOrderId: 'PO1', beneficiaryType: 'staff', beneficiaryId: 'SA1', role: 'staff', amount: 13, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-STAFF-ACCOUNT', sourceOrderId: 'UNKNOWN-STAFF', beneficiaryType: 'staff', beneficiaryId: 'SA1', role: 'staff', amount: 23, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-C', sourceOrderId: 'CO1', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter', amount: 19, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' },
      { id: 'CL-UNKNOWN', sourceOrderId: 'UNKNOWN-2', beneficiaryType: 'promoter', beneficiaryId: 'P1', role: 'promoter', amount: 17, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z' }
    ]

    const build = (regionCodes: string[]) => buildDashboardSnapshot(data, {
      principal: { id: 'D14', name: '监管员', role: 'regulator', regionCodes, status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(build(['4301']).settlement.pendingCommissionAmount).toBe(71)
    expect(build(['43']).settlement.pendingCommissionAmount).toBe(95)
    expect(build(['4301']).unattributedDataCount).toBe(0)
    expect(build(['43']).unattributedDataCount).toBe(1)
  })

  it('reports actionable fulfillment exceptions and ignores handled shortages', () => {
    const data = source()
    data.fulfillmentOrders = [
      { id: 'PO-HANDLED', farmId: 'F-CS', amount: 10, status: 'shipping', createdAt: '2026-08-24T10:00:00.000Z', supplierFulfillment: { status: 'shipped', shortages: [{ shortage: 2, handled: true }] } },
      { id: 'PO-SHORT', farmId: 'F-CS', amount: 20, status: 'shipping', createdAt: '2026-08-24T10:00:00.000Z', supplierFulfillment: { status: 'shipped', shortages: [{ shortage: 1 }] } },
      { id: 'PO-CANCELLED', farmId: 'F-CS', amount: 30, status: 'pending', createdAt: '2026-08-24T10:00:00.000Z', supplierFulfillment: { status: 'cancelled', shortages: [] } },
      { id: 'PO-NO-TRACKING', farmId: 'F-CS', amount: 40, status: 'shipping', createdAt: '2026-08-24T10:00:00.000Z', supplierFulfillment: { status: 'shipped', shipType: 'courier', shortages: [] } },
      { id: 'PO-DELIVERING-LATE', farmId: 'F-CS', amount: 50, status: 'shipping', createdAt: '2026-08-20T10:00:00.000Z', supplierFulfillment: { status: 'delivering', shipType: 'driver', updatedAt: '2026-08-22T10:00:00.000Z', shortages: [] } }
    ]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D15', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })
    const rules = snapshot.risks.map((risk) => risk.rule)

    expect(rules).toEqual(expect.arrayContaining([
      'fulfillment-shortage-unhandled', 'fulfillment-cancelled', 'fulfillment-courier-tracking-missing', 'fulfillment-delivering-overdue'
    ]))
    expect(snapshot.risks.find((risk) => risk.rule === 'fulfillment-shortage-unhandled')?.subjects).toMatchObject([
      { type: 'order', id: 'PO-SHORT' }
    ])
    expect(snapshot.fulfillment.abnormalCount).toBe(4)
  })

  it('keeps qualifications valid through Beijing end-of-day and separates expired suppliers', () => {
    const data = source()
    data.suppliers[0].qualification.validUntil = '2026-08-25'
    data.suppliers.push({
      id: 'S-EXPIRED', name: '资质过期供应商', region: '湖南', category: '蔬菜', certified: true,
      status: 'cooperating', productCount: 0,
      qualification: { businessLicense: 'ok', permit: 'ok', validUntil: '2026-08-24', reviewNote: '' }
    })

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D16', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.risks.find((risk) => risk.id === 'qualification:S1')?.rule).toBe('supplier-qualification-expiring')
    expect(snapshot.risks.find((risk) => risk.id === 'qualification:S-EXPIRED')).toMatchObject({
      rule: 'supplier-qualification-expired', level: 'critical',
      subjects: [{ type: 'supplier', id: 'S-EXPIRED', name: '资质过期供应商' }]
    })
  })

  it('treats submitted and accepted supplier fulfillments as overdue unshipped orders', () => {
    const data = source()
    data.fulfillmentOrders = [
      { id: 'PO-SUBMITTED', farmId: 'F-CS', amount: 10, status: 'created', createdAt: '2026-08-20T10:00:00.000Z', supplierFulfillment: { status: 'submitted' } },
      { id: 'PO-ACCEPTED', farmId: 'F-CS', amount: 20, status: 'processing', createdAt: '2026-08-20T10:00:00.000Z', supplierFulfillment: { status: 'accepted' } }
    ]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D17', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.fulfillment.overdueCount).toBe(2)
    expect(snapshot.risks.find((risk) => risk.rule === 'order-overdue-unshipped')?.subjects?.map((subject) => subject.id)).toEqual([
      'PO-SUBMITTED', 'PO-ACCEPTED'
    ])
  })

  it('raises critical zero-stock risks and identifies every affected sku', () => {
    const data = source()
    data.catalog!.products[0].skus[0].stock = 0
    data.catalog!.products[0].skus.push({
      id: 'SKU-LOW', name: '小份', image: '', retailPrice: 10, cost: 6, stock: 7, level1Amount: 1, level2Amount: 2
    })

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D18', name: '长沙监管员', role: 'regulator', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.risks.find((risk) => risk.rule === 'out-of-stock')).toMatchObject({
      level: 'critical', subjects: [{ type: 'sku', id: 'SKU1' }]
    })
    expect(snapshot.risks.find((risk) => risk.rule === 'low-stock')).toMatchObject({
      level: 'warning', subjects: [{ type: 'sku', id: 'SKU-LOW' }]
    })
  })

  it('reports freshness per data domain and flags only domains older than 24 hours', () => {
    const data = source()
    data.domainUpdatedAt = {
      farms: '2026-08-25T03:00:00.000Z',
      orders: '2026-08-23T03:00:00.000Z'
    }

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D19', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.domainFreshness).toContainEqual({ domain: 'farms', updatedAt: '2026-08-25T03:00:00.000Z', stale: false })
    expect(snapshot.domainFreshness).toContainEqual({ domain: 'orders', updatedAt: '2026-08-23T03:00:00.000Z', stale: true })
    expect(snapshot.risks.find((risk) => risk.id === 'data:stale:orders')).toMatchObject({
      rule: 'stale-data', subjects: [{ type: 'dataset', id: 'orders' }]
    })
    expect(snapshot.risks.some((risk) => risk.id === 'data:stale:farms')).toBe(false)
  })

  it('keeps a missing domain timestamp unknown when legacy global freshness exists', () => {
    const data = source()
    data.updatedAt = '2026-08-25T03:00:00.000Z'
    data.domainUpdatedAt = { farms: '2026-08-25T04:00:00.000Z' }

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D19-UNKNOWN', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.domainFreshness.find((item) => item.domain === 'settlements')).toEqual({ domain: 'settlements', stale: false })
  })

  it('provides actionable subjects with names and details for every risk', () => {
    const snapshot = buildDashboardSnapshot(source(), {
      principal: { id: 'D20', name: '省级监管员', role: 'regulator', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.risks.length).toBeGreaterThan(0)
    snapshot.risks.forEach((risk) => {
      expect(risk.subjects.length).toBeGreaterThan(0)
      risk.subjects.forEach((subject) => {
        expect(subject).toEqual(expect.objectContaining({
          type: expect.any(String), id: expect.any(String), name: expect.any(String), detail: expect.any(String)
        }))
      })
    })
  })

  it('attaches evidence and affected subjects to every suggestion', () => {
    const snapshot = buildDashboardSnapshot(source(), {
      principal: { id: 'D21', name: '省级产业专员', role: 'industry_service', regionCodes: ['43'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })

    expect(snapshot.suggestions.length).toBeGreaterThan(0)
    snapshot.suggestions.forEach((suggestion) => {
      expect(suggestion.evidence.length).toBeGreaterThan(0)
      expect(suggestion.subjects.length).toBeGreaterThan(0)
    })
  })

  it('suggests joint procurement when one product reaches three stores and twenty units', () => {
    const data = source()
    data.farms.push(
      { ...data.farms[0], id: 'F-CS-2', name: '长沙二店', regionCode: '430104', location: { ...data.farms[0].location!, adCode: '430104' } },
      { ...data.farms[0], id: 'F-CS-3', name: '长沙三店', regionCode: '430104', location: { ...data.farms[0].location!, adCode: '430104' } }
    )
    data.catalog!.products[0].farmIds = ['F-CS', 'F-CS-2', 'F-CS-3']
    data.fulfillmentOrders = [
      { id: 'PO-JOINT-1', farmId: 'F-CS', amount: 70, status: 'processing', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 7 }] },
      { id: 'PO-JOINT-2', farmId: 'F-CS-2', amount: 80, status: 'processing', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 8 }] },
      { id: 'PO-JOINT-3', farmId: 'F-CS-3', amount: 90, status: 'processing', createdAt: '2026-08-24T10:00:00.000Z', items: [{ productId: 'CP1', quantity: 9 }] }
    ]

    const snapshot = buildDashboardSnapshot(data, {
      principal: { id: 'D22', name: '长沙产业专员', role: 'industry_service', regionCodes: ['4301'], status: 'active' },
      range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-25T23:59:59.999Z' }, now
    })
    const suggestion = snapshot.suggestions.find((item) => item.rule === 'joint-procurement')

    expect(suggestion?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'storeCount', value: 3, threshold: 3 }),
      expect.objectContaining({ metric: 'demandQuantity', value: 24, threshold: 20 })
    ]))
    expect(suggestion?.subjects.filter((subject) => subject.type === 'farm').map((subject) => subject.id)).toEqual([
      'F-CS', 'F-CS-2', 'F-CS-3'
    ])
    expect(suggestion?.subjects.some((subject) => subject.type === 'sku' && subject.id === 'SKU1')).toBe(true)
  })
})
