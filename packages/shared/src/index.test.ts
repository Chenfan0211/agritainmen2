import { beforeEach, describe, expect, it } from 'vitest'
import { appendCatalogStockLogs, catalogProductStockWarnings, catalogSkuNeedsRestock, cPriceBreakdown, formatNumber, money, normalizeCCommissionRecords, orderStatusText, readUserLinks, round2, validateSupplierAccount, readCatalogStockLogs, writeCatalogStockLogs, SUPPLIER_DEMO_ACCOUNT, SUPPLIER_DEMO_PASSWORD, CATALOG_SCHEMA_VERSION, C_COMMERCE_SCHEMA_VERSION, DEFAULT_PRICING_DEFAULTS, DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS, normalizeStorePriceLevelDiscounts, readStorePriceLevelDiscounts, writeStorePriceLevelDiscounts, PLATFORM_CONFIG_STORAGE_KEY, PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, allocateCatalogCommissions, allocateStoreCatalogCommission, applyCatalogStockOperation, buildPortalUrl, catalogPriceForSku, catalogProductToCProduct, catalogProductToProduct, catalogProductsForAudience, categoryIconName, commitCatalogTransaction, deriveCOrderStatus, ensureCatalogState, ensureCCommerceSchemaVersion, ensureStoreCatalogSelectionDefaults, markCatalogTransactionStockApplied, mergeCSubOrderFulfillment, migrateLegacyCatalog, normalizeCAddresses, normalizeCOrders, normalizeCProducts, PLATFORM_C_INVENTORY_STORAGE_KEY, PLATFORM_C_PRODUCTS_STORAGE_KEY, prepareCatalogTransaction, readCAddresses, readCatalogState, readCatalogTransactionJournal, readCCommerceSchemaVersion, readCInventoryState, readCProducts, readCCommissionRecords, readPendingCatalogTransactions, readPricingDefaults, readShareConfig, readStoreCatalogSelectionState, readStoreCatalogSelections, removeCAddress, resolveCReferralChain, saveCatalogProduct, saveStoreCatalogSelection, seedCCommerceData, updateCatalogStock, upsertStoreCatalogSelection, writeCatalogState, writeCAddresses, writeCCommissionRecords, writeCInventoryState, writePricingDefaults, writeShareConfig, publishCSubOrderToSupplier, syncCSubOrderFromSupplier, readVersionedRecord, writeVersionedRecord, normalizeMinimumOrderQuantity, validateCatalogSkuOrderQuantity } from './index'
import type { AdminMenuKey, AdminPermissionCode, CProduct, CProductSku, CatalogProduct, CatalogState, Order, OrderItem, OrderStatus, PlatformMedia, SupplierFulfillment } from './index'

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
import { PERSISTENCE_VERSION, afterSales, allocateCCommissions, calcCartTotal, calcMargin, cPriceForSku, cProducts, derivePlatformMetrics, farms, markShareSettled, mergeEntitySeeds, migratePersistedState, nextCOrderStatus, nextPurchaseStatus, orders, pendingShareAmount, pendingShareTotal, readPlatformAfterSaleStatus, resolveShare, getOrCreateUserId, resolveUserIdentity, resolveUserIdByOpenid, simulateWechatLogin, splitCOrderItems, writePlatformAfterSale, writeShareRecords, writeUserLink, persistedEnvelope, products, promoters, selectPersistedState, applyPlatformMedia, emptyPlatformMedia, mergePersistedDefaults, mergePlatformStoreAccounts, upsertPlatformFarm, upsertPlatformProduct, suppliers, toCsv, validateAccountPassword, validatePhone, validatePricePolicy, validateSmsCode, acceptSupplierOrder, assignSupplierDriver, authenticateSupplier, buildSupplierAccountSeeds, computeShortage, confirmCourierDelivered, demoDrivers, deriveSupplierMetrics, deriveTodayFarmhouseQuantities, driverActiveTaskCounts, ensureSupplierFulfillment, findActiveDriver, findDriverByAccount, handoverSupplierIn, handoverSupplierOut, mergePlatformDrivers, mergePlatformSupplierAccounts, readPlatformDrivers, reassignSupplierDriver, shipSupplierCourier, writePlatformDrivers, todayString, clearPlatformJson, markShortageHandled, PLATFORM_ORDERS_STORAGE_KEY, readPlatformOrders, writePlatformOrder, CHANNEL_TAG_STORE, EXPRESS_DELIVERY_TAG, displayProductTags, isExpressDeliverable, productChannelTags, resolveProductChannels, storeCommissionAmount, storeGrossMargin } from './index'
import { ALL_ADMIN_ACTION_PERMISSIONS, ALL_ADMIN_MENU_KEYS, RETIRED_PLATFORM_STORAGE_KEYS, clearRetiredPlatformData, defaultAdminAccounts, defaultAdminRoles, readPlatformAdminRoles, seedPlatformAdminSecurity, writePlatformAdminAccounts, writePlatformAdminRoles } from './index'
import { createId, createPlatformAuditLogEntry, mergePlatformAfterSales, catalogChannelFlags, readNamedDeliveryRouteState, readNamedDeliveryRoutes, saveNamedDeliveryRoute, buildTencentNavigationUrl, buildTencentMapSearchUrl, dashboardRegion, formatFarmAdministrativeAddress, buildFarmAdministrativeAddress, DEFAULT_PLATFORM_OPERATION_RETENTION_MS } from './index'

describe('C端分销商城 helpers', () => {
  beforeEach(() => localStorage.clear())
  const sku: CProductSku = { id: 'C001-SKU', name: '500g', image: '/static/images/bacon.webp', stock: 20, basePrice: 20, level1Commission: 10, level2Commission: 15 }

  it('derives cumulative prices by user level', () => {
    expect(cPriceForSku(sku, 'level1')).toBe(20)
    expect(cPriceForSku(sku, 'level2')).toBe(30)
    expect(cPriceForSku(sku, 'normal')).toBe(45)
  })

  it('allocates fixed commissions by quantity and two-level chain', () => {
    const items = [{ productId: 'C001', skuId: sku.id, name: '腊肉', skuName: sku.name, image: sku.image, quantity: 2, unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: 'S002' }]
    expect(allocateCCommissions(items, { level1Id: 'T001', level2Id: 'T002' }, 'normal')).toMatchObject([
      { beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 20 },
      { beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 30 }
    ])
    expect(allocateCCommissions(items, { level2Id: 'T002' }, 'normal')[0]).toMatchObject({ beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 30 })
    expect(allocateCCommissions(items, { level1Id: 'T001', level2Id: 'SELF' }, 'level2')[0]).toMatchObject({ beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 20 })
    expect(allocateCCommissions(items, { level2Id: 'SELF' }, 'level1')).toEqual([])
  })

  it('splits C order items by supplier and advances statuses', () => {
    const items = [
      { productId: 'C001', skuId: 'A', name: 'A', skuName: 'A', image: '', quantity: 1, unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: 'S001' },
      { productId: 'C002', skuId: 'B', name: 'B', skuName: 'B', image: '', quantity: 2, unitPrice: 30, basePrice: 12, level1Commission: 8, level2Commission: 10, supplierId: 'S002' }
    ]
    expect(splitCOrderItems(items).map((group) => [group.supplierId, group.items.length])).toEqual([['S001', 1], ['S002', 1]])
    expect(nextCOrderStatus('pending_payment')).toBe('paid')
    expect(nextCOrderStatus('shipped')).toBe('received')
    expect(nextCOrderStatus('partially_shipped')).toBe('partially_received')
    expect(nextCOrderStatus('received')).toBe('received')
  })

  it('builds same-origin portal links without accepting userId as a parameter', () => {
    expect(buildPortalUrl('user', 'pages/index/index', { promoter: 'T001', live: 'L001', userId: 'U-ATTACK' }, 'http://127.0.0.1:8780'))
      .toBe('http://127.0.0.1:8780/user/#/pages/index/index?promoter=T001&live=L001')
    expect(buildPortalUrl('user', 'pages/index/index', { promoter: 'T001', userId: 'U-ATTACK' }))
      .toBe('/user/#/pages/index/index?promoter=T001')
  })

  it('publishes a paid C sub-order once and maps supplier courier status back', () => {
    const order = {
      id: 'CO-1', userId: 'U-1', level: 'normal' as const,
      address: { id: 'A-1', userId: 'U-1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true },
      amount: 45, items: [], status: 'paid' as const, createdAt: '2026-08-21T10:00:00.000Z', commissionAllocations: [],
      subOrders: [{ id: 'CSO-1', supplierId: 'S002', supplierName: '供应商 A', items: [{ productId: 'C001', skuId: 'C001-500', name: '腊肉', skuName: '500g', image: '', quantity: 1, unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: 'S002' }], amount: 45, status: 'paid' as const, logistics: [] }]
    }
    const first = publishCSubOrderToSupplier(order, order.subOrders[0])
    const second = publishCSubOrderToSupplier(order, order.subOrders[0])
    expect(first.id).toBe('C-MALL-CSO-1')
    expect(second.id).toBe(first.id)
    expect(first.supplierOrderLink).toMatchObject({ source: 'c-mall', sourceOrderId: 'CO-1', sourceSubOrderId: 'CSO-1', customerUserId: 'U-1' })
    const next = syncCSubOrderFromSupplier(order, order.subOrders[0], { ...first, status: 'shipping', trackingNo: 'SF001', supplierFulfillment: { status: 'shipped', shipType: 'courier', trackingNo: 'SF001', shortages: [], handovers: [], updatedAt: '2026-08-21T11:00:00.000Z' } })
    expect(next.subOrders[0]).toMatchObject({ status: 'shipped', trackingNo: 'SF001', courier: '快递配送' })
  })

  it('does not regress terminal C sub-order states from stale supplier snapshots', () => {
    const sub = { id: 'CSO-1', supplierId: 'S002', supplierName: '供应商 A', items: [], amount: 0, status: 'received' as const, logistics: [{ time: '2026-08-21T12:00:00.000Z', title: '已签收', detail: '用户确认收货' }] }
    const stale = { status: 'shipped' as const, trackingNo: 'OLD', logistics: [{ time: '2026-08-21T10:00:00.000Z', title: '已发货', detail: '旧快照' }] }
    expect(mergeCSubOrderFulfillment(sub, stale)).toMatchObject({ status: 'received', trackingNo: 'OLD', logistics: sub.logistics })
    expect(mergeCSubOrderFulfillment({ ...sub, status: 'after_sale' }, stale).status).toBe('after_sale')
    expect(mergeCSubOrderFulfillment({ ...sub, status: 'cancelled' }, stale).status).toBe('cancelled')
  })

  it('does not regress a shipped sub-order to paid from an accepted snapshot', () => {
    const current = {
      id: 'CSO-SHIPPED', supplierId: 'S002', supplierName: '供应商 A', items: [], amount: 0,
      status: 'shipped' as const, trackingNo: 'SF-CURRENT', courier: '顺丰速运',
      logistics: [{ time: '2026-08-21T11:00:00.000Z', title: '已发货', detail: '顺丰速运已揽收' }]
    }

    expect(mergeCSubOrderFulfillment(current, { status: 'accepted', shipType: 'courier', trackingNo: '' })).toEqual(current)
  })

  it('keeps newer logistics when a same-state snapshot contains an older shorter history', () => {
    const submitted = { time: '2026-08-21T09:00:00.000Z', title: '订单已提交', detail: '等待供应商接单' }
    const shipped = { time: '2026-08-21T10:00:00.000Z', title: '已发货', detail: '顺丰速运已揽收' }
    const transporting = { time: '2026-08-21T12:00:00.000Z', title: '运输中', detail: '包裹已到达长沙转运中心' }
    const current = {
      id: 'CSO-LOGISTICS', supplierId: 'S002', supplierName: '供应商 A', items: [], amount: 0,
      status: 'shipped' as const, trackingNo: 'SF-CURRENT', courier: '顺丰速运',
      logistics: [submitted, shipped, transporting]
    }

    expect(mergeCSubOrderFulfillment(current, {
      status: 'shipped', shipType: 'courier', trackingNo: '', logistics: [submitted, shipped]
    })).toEqual(current)
  })

  it('merges repeated fulfillment snapshots idempotently without duplicate logistics', () => {
    const submitted = { time: '2026-08-21T09:00:00.000Z', title: '订单已提交', detail: '等待供应商接单' }
    const shipped = { time: '2026-08-21T10:00:00.000Z', title: '已发货', detail: '顺丰速运已揽收' }
    const transporting = { time: '2026-08-21T12:00:00.000Z', title: '运输中', detail: '包裹已到达长沙转运中心' }
    const current = {
      id: 'CSO-IDEMPOTENT', supplierId: 'S002', supplierName: '供应商 A', items: [], amount: 0,
      status: 'shipped' as const, trackingNo: 'SF-CURRENT', courier: '顺丰速运', logistics: [submitted, transporting]
    }
    const snapshot = { status: 'shipped' as const, shipType: 'courier' as const, trackingNo: 'SF-CURRENT', logistics: [submitted, shipped] }
    const first = mergeCSubOrderFulfillment(current, snapshot)
    const second = mergeCSubOrderFulfillment(first, snapshot)

    expect(first.logistics).toEqual([submitted, shipped, transporting])
    expect(second).toEqual(first)
  })

  it('validates active referral chains and rejects invalid or paused promoters', () => {
    expect(resolveCReferralChain('T002', promoters, {
      'U-DEMO-L2': { userId: 'U-DEMO-L2', promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' }
    })).toEqual({ level1Id: 'T001', level2Id: 'T002' })
    expect(resolveCReferralChain('missing', promoters, {})).toBeNull()
    expect(resolveCReferralChain('T002', promoters.map((item) => item.id === 'T002' ? { ...item, status: 'paused' as const } : item), {
      'U-DEMO-L2': { userId: 'U-DEMO-L2', promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' }
    })).toBeNull()
    expect(resolveCReferralChain('T002', promoters, {
      'U-DEMO-L2': { userId: 'U-DEMO-L2', promoterId: 'T002', level: 'level2', status: 'active' }
    })).toEqual({ level2Id: 'T002' })
    expect(resolveCReferralChain('T001', promoters, {})).toEqual({ level2Id: 'T001' })
  })

  it('derives aggregate status from independently fulfilled sub-orders', () => {
    const sub = (status: 'paid' | 'shipped' | 'received' | 'after_sale') => ({ status } as never)
    expect(deriveCOrderStatus([sub('paid'), sub('shipped')])).toBe('partially_shipped')
    expect(deriveCOrderStatus([sub('received'), sub('shipped')])).toBe('partially_received')
    expect(deriveCOrderStatus([sub('after_sale'), sub('received')])).toBe('partially_after_sale')
  })

  it('persists and replaces the complete address collection', () => {
    writeCAddresses({ A: { id: 'A', userId: 'U1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true } })
    expect(readCAddresses()?.A.receiver).toBe('甲')
    writeCAddresses({ B: { id: 'B', userId: 'U1', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true } })
    expect(readCAddresses()).toEqual({ B: expect.objectContaining({ receiver: '乙' }) })
  })

  it('rejects stale C inventory writes by revision', () => {
    const products = [{
      id: 'C-INV', name: '库存测试', category: '测试', supplierId: 'S1', supplierName: '供应商', image: '', tags: [], status: 'active' as const, shippingType: 'courier' as const,
      skus: [{ id: 'C-INV-SKU', name: '默认', image: '', stock: 2, basePrice: 1, level1Commission: 1, level2Commission: 1 }]
    }]
    expect(writeCInventoryState({ revision: 1, products }, 0)).toBe(true)
    expect(writeCInventoryState({ revision: 2, products: [{ ...products[0], skus: [{ ...products[0].skus[0], stock: 1 }] }] }, 0)).toBe(false)
    expect(readCInventoryState()).toMatchObject({ revision: 1, products })
  })

  it('accepts only the next revision for generic shared records', () => {
    expect(writeVersionedRecord('versioned-test', { revision: 1, updatedAt: '2026-08-21T10:00:00.000Z', data: { value: 'first' } }, 0)).toBe(true)
    expect(writeVersionedRecord('versioned-test', { revision: 2, updatedAt: '2026-08-21T11:00:00.000Z', data: { value: 'stale' } }, 0)).toBe(false)
    expect(writeVersionedRecord('versioned-test', { revision: 2, updatedAt: '2026-08-21T09:00:00.000Z', data: { value: 'older' } }, 1)).toBe(false)
    expect(readVersionedRecord<{ value: string }>('versioned-test')).toMatchObject({ revision: 1, data: { value: 'first' } })
  })

  it('migrates legacy C product arrays to revisioned inventory storage', () => {
    const products = [{
      id: 'C-LEGACY', name: '旧商品', category: '测试', supplierId: 'S1', supplierName: '供应商', image: '', tags: [], status: 'active' as const, shippingType: 'courier' as const,
      skus: [{ id: 'C-LEGACY-SKU', name: '默认', image: '', stock: 2, basePrice: 1, level1Commission: 1, level2Commission: 1 }]
    }]
    localStorage.setItem(PLATFORM_C_PRODUCTS_STORAGE_KEY, JSON.stringify(products))
    expect(readCInventoryState()).toMatchObject({ revision: 0, products })
    expect(JSON.parse(localStorage.getItem(PLATFORM_C_INVENTORY_STORAGE_KEY) || '{}')).toMatchObject({ revision: 0, products })
  })

  it('normalizes invalid C products and monetary fields before storage', () => {
    const valid = { ...cProducts[0], skus: [{ ...cProducts[0].skus[0], stock: 2.9, basePrice: 20.126, level1Commission: 10.004, level2Commission: 15.005 }] }
    const invalid = { ...valid, id: 'BAD', skus: [{ ...valid.skus[0], stock: -1 }] }
    expect(normalizeCProducts([valid, invalid])).toMatchObject([{ id: valid.id, skus: [{ stock: 2, basePrice: 20.13, level1Commission: 10, level2Commission: 15.01 }] }])
  })

  it('keeps one latest default address and drops malformed addresses', () => {
    const normalized = normalizeCAddresses({
      old: { id: 'old', userId: 'U1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z' },
      latest: { id: 'latest', userId: 'U1', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true, updatedAt: '2026-02-01T00:00:00.000Z' },
      invalid: { id: 'invalid', userId: '', receiver: '', phone: 'bad', region: '', detail: '', isDefault: true }
    })
    expect(normalized).toEqual(expect.objectContaining({ latest: expect.objectContaining({ isDefault: true }), old: expect.objectContaining({ isDefault: false }) }))
    expect(normalized.invalid).toBeUndefined()
  })

  it('normalizes order times, logistics and commission sub-order ownership', () => {
    const order = {
      id: 'CO-NORMALIZE', userId: 'U1', level: 'normal' as const, address: { id: 'A', userId: 'U1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true }, amount: 45.126,
      items: [], subOrders: [{ id: 'SO-1', supplierId: 'S1', supplierName: '供应商', items: [{ productId: 'P', skuId: 'S', name: '商品', skuName: '规格', image: '', quantity: 1, unitPrice: 45.126, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: 'S1' }], amount: 45.126, status: 'paid' as const, logistics: [{ time: 'invalid', title: '订单已提交', detail: '' }] }],
      commissionAllocations: [{ id: 'CC-1', orderId: 'CO-NORMALIZE', subOrderId: 'SO-1', beneficiaryId: 'T1', beneficiaryLevel: 'level1' as const, amount: 10.126, status: 'pending' as const, createdAt: 'invalid' }], status: 'paid' as const, createdAt: 'invalid'
    }
    const normalized = normalizeCOrders({ [order.id]: order })[order.id]
    expect(normalized.amount).toBe(45.13)
    expect(normalized.subOrders[0].items[0].unitPrice).toBe(45.13)
    expect(normalized.subOrders[0].logistics[0].time).toMatch(/T/)
    expect(normalized.commissionAllocations[0].subOrderId).toBe('SO-1')
  })

  it('initializes an independent C commerce schema version', () => {
    expect(readCCommerceSchemaVersion()).toBe(0)
    ensureCCommerceSchemaVersion()
    expect(readCCommerceSchemaVersion()).toBe(C_COMMERCE_SCHEMA_VERSION)
  })

  it('rejects orders whose address belongs to another user', () => {
    const order = {
      id: 'CO-OWNER', userId: 'U1', level: 'normal' as const,
      address: { id: 'A', userId: 'U2', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true },
      amount: 1, items: [], subOrders: [{ id: 'SO-OWNER', supplierId: 'S1', supplierName: '供应商', items: [{ productId: 'P', skuId: 'S', name: '商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 1, level1Commission: 0, level2Commission: 0, supplierId: 'S1' }], amount: 1, status: 'paid' as const, logistics: [] }],
      commissionAllocations: [], status: 'paid' as const, createdAt: new Date().toISOString()
    }
    expect(normalizeCOrders({ [order.id]: order })).toEqual({})
  })

  it('rejects duplicate sub-order ids instead of deriving an ambiguous order', () => {
    const item = { productId: 'P', skuId: 'S', name: '商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 1, level1Commission: 0, level2Commission: 0, supplierId: 'S1' }
    const order = {
      id: 'CO-DUP', userId: 'U1', level: 'normal' as const,
      address: { id: 'A', userId: 'U1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true }, amount: 2, items: [item, item],
      subOrders: [{ id: 'SO-DUP', supplierId: 'S1', supplierName: '供应商', items: [item], amount: 1, status: 'paid' as const, logistics: [] }, { id: 'SO-DUP', supplierId: 'S2', supplierName: '供应商2', items: [item], amount: 1, status: 'paid' as const, logistics: [] }],
      commissionAllocations: [], status: 'paid' as const, createdAt: new Date().toISOString()
    }
    expect(normalizeCOrders({ [order.id]: order })).toEqual({})
  })

  it('reseeds the C catalog when persisted inventory is empty', () => {
    localStorage.setItem(PLATFORM_C_INVENTORY_STORAGE_KEY, JSON.stringify({ revision: 9, products: [] }))
    seedCCommerceData()
    expect(readCProducts()).toHaveLength(cProducts.length)
  })

  it('normalizes commission writes and excludes invalid records', () => {
    writeCCommissionRecords([
      { id: 'CC-VALID', orderId: 'CO1', subOrderId: 'SO1', beneficiaryId: 'T1', beneficiaryLevel: 'level1', amount: 10.126, status: 'pending', createdAt: '2026-01-01' },
      { id: 'CC-INVALID', orderId: '', subOrderId: '', beneficiaryId: 'T1', beneficiaryLevel: 'level1', amount: 20, status: 'pending', createdAt: '2026-01-01' }
    ])
    expect(readCCommissionRecords()).toEqual([expect.objectContaining({ id: 'CC-VALID', amount: 10.13 })])
  })

  it('promotes the first remaining address after deleting the default', () => {
    writeCAddresses({
      first: { id: 'first', userId: 'U1', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: false, updatedAt: '2026-01-01' },
      second: { id: 'second', userId: 'U1', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: false, updatedAt: '2026-02-01' },
      selected: { id: 'selected', userId: 'U1', receiver: '丙', phone: '13700000000', region: '湖南', detail: '三号', isDefault: true, updatedAt: '2026-03-01' }
    })
    removeCAddress('selected')
    expect(readCAddresses()?.first?.isDefault).toBe(true)
    expect(readCAddresses()?.second?.isDefault).toBe(false)
  })
})

describe('shared business helpers', () => {
  it('calculates cart totals without floating point drift', () => {
    expect(calcCartTotal([{ price: 59.9, quantity: 2 }, { price: 39.9, quantity: 1 }])).toBe(159.7)
  })

  it('calculates retail margin', () => {
    expect(calcMargin(42, 59.9)).toEqual({ amount: 17.9, rate: 29.9 })
  })

  it('advances purchase status and stops when complete', () => {
    expect(nextPurchaseStatus('submitted')).toBe('accepted')
    expect(nextPurchaseStatus('completed')).toBe('completed')
  })

  it('serializes export rows as UTF-8 CSV', () => {
    expect(toCsv([['名称', '说明'], ['石板溪', '含"引号"']])).toBe('\ufeff"名称","说明"\n"石板溪","含""引号"""')
  })

  it('migrates legacy and versioned local state without dropping user values', () => {
    const defaults = { balance: 0, versionedField: 'new', rows: [{ id: 'A', count: 0, enabled: true }] }
    const legacy = migratePersistedState({ balance: 88, rows: [{ id: 'A', count: 3 }] }, defaults)
    expect(legacy).toEqual({ balance: 88, versionedField: 'new', rows: [{ id: 'A', count: 3, enabled: true }] })
    expect(migratePersistedState(persistedEnvelope(legacy), defaults)).toEqual(legacy)
  })

  it('runs versioned member migration and excludes transient state', () => {
    const defaults = { member: { id: 'M1', name: '会员', level: 'gold', phone: '1', balance: 0, points: 0 }, loading: false, error: '', initialized: false, mockScenario: 'normal', rows: [] }
    const migrated = migratePersistedState({ version: 1, state: { balance: 88, points: 9, loading: true, error: '旧错误', initialized: true } }, defaults)
    expect(migrated.member).toMatchObject({ id: 'M1', balance: 88, points: 9 })
    expect(migrated).toMatchObject({ loading: false, error: '', initialized: false })
    const envelope = persistedEnvelope({ ...defaults, loading: true, error: '失败', initialized: true })
    expect(envelope.version).toBe(PERSISTENCE_VERSION)
    expect(envelope.state).not.toHaveProperty('loading')
    expect(selectPersistedState(defaults)).not.toHaveProperty('mockScenario')
  })

  it('persists only explicitly whitelisted business fields', () => {
    const state = { rows: [{ id: 'A' }], city: '湘西州', loading: true, openSheet: 'detail' }
    expect(persistedEnvelope(state, ['rows', 'city'] as const).state).toEqual({ rows: [{ id: 'A' }], city: '湘西州' })
  })

  it('migrates legacy purchase and settlement details into version 6', () => {
    const defaults = {
      purchaseOrders: [] as Array<{ id: string; items: Array<{ productId: string; skuId: string; skuName: string; image: string }> }>,
      supplierSettlementRecords: [] as Array<{ id: string; supplierIds: string[]; orderIds: string[]; amount: number; items: unknown[] }>,
      commissionSettlementRecords: [] as Array<{ id: string; promoterIds: string[]; amount: number; items: unknown[] }>
    }
    const migrated = migratePersistedState({ version: 5, state: {
      purchaseOrders: [{ id: 'PO1', items: [{ productId: 'P1' }] }],
      supplierSettlementRecords: [{ id: 'SS1', supplierIds: ['S1'], orderIds: ['O1'], amount: 88 }],
      commissionSettlementRecords: [{ id: 'CS1', promoterIds: ['T1'], amount: 10 }]
    } }, defaults)
    expect(migrated.purchaseOrders[0].items[0]).toMatchObject({ skuId: 'P1-DEFAULT', skuName: '默认规格' })
    expect(migrated.supplierSettlementRecords[0].items[0]).toMatchObject({ supplierId: 'S1', orderIds: ['O1'], amount: 88 })
    expect(migrated.commissionSettlementRecords[0].items[0]).toMatchObject({ promoterId: 'T1', amount: 10 })
  })

  it('merges new seed entities with persisted values and custom rows', () => {
    const defaults = [{ id: 'A', count: 0, enabled: true }, { id: 'B', count: 2, enabled: true }]
    const saved = [{ id: 'A', count: 5 } as (typeof defaults)[number], { id: 'X', count: 1, enabled: false }]
    expect(mergeEntitySeeds(defaults, saved)).toEqual([
      { id: 'A', count: 5, enabled: true },
      { id: 'B', count: 2, enabled: true },
      { id: 'X', count: 1, enabled: false }
    ])
  })

  it('removes generated SKU, placeholder qualification and redundant withdrawal state', () => {
    const defaults = { products: [] as Array<{ id: string; skus?: Array<{ id: string }> }>, suppliers: [] as Array<{ id: string; qualification?: object }> }
    const migrated = migratePersistedState({ version: 3, state: { products: [{ id: 'P1', skus: [{ id: 'P1-DEFAULT' }] }], suppliers: [{ id: 'S1', qualification: { businessLicense: '待补充', reviewNote: '旧版演示数据' } }], withdrawalRecords: [{ amount: 10 }] } }, defaults)
    expect(migrated.products).toEqual([{ id: 'P1' }])
    expect(migrated.suppliers).toEqual([{ id: 'S1' }])
    expect(migrated).not.toHaveProperty('withdrawalRecords')
  })
})

describe('auth demo helpers', () => {
  it('validates the fixed demo account and password', () => {
    expect(validateAccountPassword('admin', '123456')).toBe(true)
    expect(validateAccountPassword(' admin ', '123456')).toBe(true)
    expect(validateAccountPassword('admin', 'wrong')).toBe(false)
    expect(validateAccountPassword('root', '123456')).toBe(false)
  })

  it('validates mainland mobile phone numbers', () => {
    expect(validatePhone('13800000000')).toBe(true)
    expect(validatePhone(' 13800000000 ')).toBe(true)
    expect(validatePhone('12800000000')).toBe(false)
    expect(validatePhone('1380000000')).toBe(false)
    expect(validatePhone('23800000000')).toBe(false)
  })

  it('validates the fixed sms code', () => {
    expect(validateSmsCode('123456')).toBe(true)
    expect(validateSmsCode('1234567')).toBe(false)
  })

  it('simulates a wechat openid login without a backend', async () => {
    const { openid } = await simulateWechatLogin()
    expect(openid).toMatch(/^mock_openid_/)
    const second = await simulateWechatLogin()
    expect(second.openid).toMatch(/^mock_openid_/)
  })

describe('validatePricePolicy', () => {
  it('accepts a valid ladder policy with contiguous tiers', () => {
    expect(validatePricePolicy({ name: '腊味阶梯采购', type: 'ladder', discount: 24, tiers: [
      { minQty: 1, maxQty: 49, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 199, price: 39, discountOff: 35 },
      { minQty: 500, maxQty: null, price: 35, discountOff: 42 }
    ] })).toEqual([])
  })

  it('rejects missing name and out-of-range discount', () => {
    const errors = validatePricePolicy({ name: '', type: 'group', discount: 120 })
    expect(errors).toContain('请填写策略名称')
    expect(errors).toContain('优惠比例需在 1-100 之间')
  })

  it('requires at least one tier for ladder type', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [] })).toContain('阶梯价至少需要 1 个档位')
  })

  it('rejects overlapping tier ranges', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 1, maxQty: 100, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 200, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('区间不能重叠'))).toBe(true)
  })

  it('rejects tiers out of ascending order', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 50, maxQty: 100, price: 42, discountOff: 30 },
      { minQty: 1, maxQty: 49, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('区间不能重叠'))).toBe(true)
  })

  it('rejects non-positive unit price', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 1, maxQty: null, price: 0, discountOff: 30 }] }).some((e) => e.includes('阶梯单价需大于 0'))).toBe(true)
  })

  it('rejects discount off outside 0-100', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 1, maxQty: null, price: 42, discountOff: 120 }] }).some((e) => e.includes('让利比例需在 0-100 之间'))).toBe(true)
  })

  it('rejects an unbounded tier that is not last', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 1, maxQty: null, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 100, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('必须排在最后'))).toBe(true)
  })

  it('rejects invalid maxQty below minQty', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 100, maxQty: 50, price: 42, discountOff: 30 }] }).some((e) => e.includes('上限数量需为 ≥ 起始数量的整数'))).toBe(true)
  })

  it('reads and writes store price level discounts behind pricing defaults', () => {
    expect(DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS).toEqual({ A: 0.95, B: 0.97, C: 1 })
    expect(readStorePriceLevelDiscounts()).toEqual({ A: 0.95, B: 0.97, C: 1 })
    expect(writeStorePriceLevelDiscounts({ A: 0.9 })).toBe(true)
    expect(readStorePriceLevelDiscounts()).toEqual({ A: 0.9, B: 0.97, C: 1 })
    expect(readPricingDefaults().storePriceLevelDiscounts).toEqual({ A: 0.9, B: 0.97, C: 1 })
    expect(writeStorePriceLevelDiscounts({ B: 1.4 })).toBe(false)
    expect(readStorePriceLevelDiscounts()).toEqual({ A: 0.9, B: 0.97, C: 1 })
    expect(normalizeStorePriceLevelDiscounts({ A: 0, B: Number.NaN })).toEqual({ A: 0.95, B: 0.97, C: 1 })
  })
})

describe('platform primitive interfaces', () => {
  beforeEach(() => localStorage.clear())

  it('creates ids and rejects malformed audit log entries', () => {
    expect(createId('OP')).toMatch(/^OP/)
    expect(createPlatformAuditLogEntry({ module: '', action: '', actorId: '', actorName: '', actorRole: '', targetType: '', targetId: '', result: 'success' })).toBeNull()
    const entry = createPlatformAuditLogEntry({
      module: 'orders', action: 'order.ship', actorId: 'A1', actorName: '管理员', actorRole: 'admin', targetType: 'order', targetId: 'O1', result: 'success'
    })
    expect(entry).toMatchObject({ module: 'orders', action: 'order.ship', targetId: 'O1' })
    expect(entry?.id).toBeTruthy()
  })

  it('merges published after-sales snapshots over defaults', () => {
    const base = [{ id: 'AS-1', orderId: 'O1', productName: '破损礼盒', applicant: '甲店', type: 'refund' as const, amount: 10, status: 'processing' as const }]
    expect(mergePlatformAfterSales(base, null)).toBe(base)
    const merged = mergePlatformAfterSales(base, {
      'AS-1': { ...base[0], status: 'refunded' },
      'AS-2': { ...base[0], id: 'AS-2' }
    })
    expect(merged.map((item) => item.id)).toEqual(['AS-2', 'AS-1'])
    expect(merged.find((item) => item.id === 'AS-1')?.status).toBe('refunded')
  })

  it('maps catalog channels and round-trips named delivery routes', () => {
    expect(catalogChannelFlags('store')).toEqual({ store: true, live: false })
    expect(catalogChannelFlags('live')).toEqual({ store: false, live: true })
    expect(catalogChannelFlags('all')).toEqual({ store: true, live: true })
    expect(readNamedDeliveryRouteState()).toBeNull()
    expect(readNamedDeliveryRoutes()).toEqual([])

    const route = { id: 'NR-TEST', supplierId: 'S002', name: '测试线路', storeIds: ['F001'], updatedAt: '2026-10-16T00:00:00.000Z' }
    expect(saveNamedDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    expect(readNamedDeliveryRoutes('S002').map((item) => item.id)).toEqual(['NR-TEST'])
    expect(readNamedDeliveryRouteState()?.revision).toBe(1)
    expect(readNamedDeliveryRoutes('S999')).toEqual([])
  })

  it('exposes tencent map deep links, region lookup and address formatting', () => {
    expect(buildTencentNavigationUrl({ longitude: 112.9388, latitude: 28.2282, name: '石板溪门店' })).toContain('tocoord=28.2282%2C112.9388')
    expect(buildTencentMapSearchUrl('湘西腊味')).toContain('keyword=')
    expect(dashboardRegion('430104')).toMatchObject({ level: 'district', name: '岳麓区' })
    expect(formatFarmAdministrativeAddress(buildFarmAdministrativeAddress('430104', '潇湘中路1号'))).toBe('湖南省长沙市岳麓区潇湘中路1号')
    expect(DEFAULT_PLATFORM_OPERATION_RETENTION_MS).toBeGreaterThan(0)
  })
})

describe('shared projection helpers', () => {
  beforeEach(() => localStorage.clear())

  it('formats numbers, money and order status labels', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.344)).toBe(2.34)
    expect(formatNumber(1234.567)).toBe('1,234.57')
    expect(money(1234.5)).toBe('¥1,234.5')
    expect(orderStatusText('pending')).toBe('待发货')
    expect(orderStatusText('not-a-status' as never)).toBe('not-a-status')
  })

  it('projects C-end price breakdown and normalizes commission records', () => {
    const sku = { id: 'C1', name: '500g', image: '', stock: 10, basePrice: 20, level1Commission: 10, level2Commission: 15 }
    expect(cPriceBreakdown(sku)).toEqual({ level1: 20, level2: 30, normal: 45 })

    const normalized = normalizeCCommissionRecords([
      { id: 'CC-1', orderId: 'CO-1', subOrderId: 'CSO-1', beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 12.345, status: 'unknown', createdAt: '2026-10-15T10:00:00.000Z' }
    ] as never)
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ id: 'CC-1', amount: 12.35, status: 'pending' })
    expect(normalizeCCommissionRecords([null, { id: 'BROKEN' }] as never)).toEqual([])
  })

  it('round-trips user links and validates the demo supplier account', () => {
    expect(readUserLinks()).toBeNull()
    expect(writeUserLink('openid-1', 'U-1')).toBe(true)
    expect(readUserLinks()).toEqual({ 'openid-1': 'U-1' })
    expect(writeUserLink('', 'U-1')).toBe(false)
    expect(validateSupplierAccount(SUPPLIER_DEMO_ACCOUNT, SUPPLIER_DEMO_PASSWORD)).toBe(true)
    expect(validateSupplierAccount('bad', 'bad')).toBe(false)
  })
})

describe('supplier master data', () => {
  beforeEach(() => localStorage.clear())

  it('seeds promoter regions, single business-rep type and farm contacts', () => {
    const promoter = promoters.find((item) => item.id === 'T003')!
    expect(promoter.type).toBe('业务员')
    expect(promoter.region).toBe('长沙市')
    expect(promoters.every((item) => item.type === '业务员' && !!item.region)).toBe(true)
    const farm = farms.find((item) => item.id === 'F001')!
    expect(farm.contact).toBe('王店长')
    expect(farm.contactPhone).toBe('13900000001')
    expect(farms.every((item) => !!item.contact && !!item.contactPhone)).toBe(true)
  })

  it('flags sku restock warnings and keeps a stock change log', () => {
    expect(catalogSkuNeedsRestock({ stock: 10, warningThreshold: 20 })).toBe(true)
    expect(catalogSkuNeedsRestock({ stock: 20, warningThreshold: 20 })).toBe(true)
    expect(catalogSkuNeedsRestock({ stock: 21, warningThreshold: 20 })).toBe(false)
    expect(catalogSkuNeedsRestock({ stock: 1 })).toBe(false)

    const product = {
      skus: [
        { stock: 5, warningThreshold: 10 },
        { stock: 50, warningThreshold: 10 },
        { stock: 0 }
      ]
    }
    expect(catalogProductStockWarnings(product)).toHaveLength(1)

    expect(readCatalogStockLogs()).toEqual([])
    expect(appendCatalogStockLogs([{ id: 'SL-1', productId: 'P1', skuId: 'SKU-1', skuName: '标准装', before: 10, after: 4, delta: -6, reason: '商品库库存调整', operator: 'admin', createdAt: '2026-10-15T10:00:00.000Z' }])).toBe(true)
    expect(readCatalogStockLogs()[0]).toMatchObject({ id: 'SL-1', before: 10, after: 4, delta: -6 })

    const late = { id: 'SL-LATE', productId: 'P1', skuId: 'SKU-1', skuName: '标准装', before: 20, after: 12, delta: -8, reason: '商品库库存调整', operator: 'admin', createdAt: '2026-10-15T12:00:00.000Z' }
    const early = { ...late, id: 'SL-EARLY', before: 12, after: 6, delta: -6, createdAt: '2026-10-15T09:00:00.000Z' }
    expect(writeCatalogStockLogs([early, late])).toBe(true)
    expect(readCatalogStockLogs().map((entry) => entry.id)).toEqual(['SL-LATE', 'SL-EARLY'])
    expect(writeCatalogStockLogs([])).toBe(true)
    expect(readCatalogStockLogs()).toEqual([])
  })

  it('seeds supplier brands and service regions for 供应品类管理', () => {
    const supplier = suppliers.find((item) => item.id === 'S002')!
    expect(supplier.brands).toEqual(['湘西腊味', '柴火腊味'])
    expect(supplier.serviceRegions).toEqual(['湘西州'])
    const crossRegion = suppliers.find((item) => item.id === 'S005')!
    expect(crossRegion.serviceRegions).toEqual(['常德', '益阳', '长沙'])
    expect(suppliers.every((item) => Array.isArray(item.brands) && Array.isArray(item.serviceRegions))).toBe(true)
  })
})

describe('derivePlatformMetrics', () => {
  it('keeps entity and after-sale metrics sourced from actual platform data', () => {
    const m = derivePlatformMetrics({ orders: [], products: [], farms, suppliers, afterSales, promoters })
    expect(m.farmCount).toBe(farms.length)
    expect(m.supplierCount).toBe(suppliers.length)
    expect(m.afterSaleStats.count).toBe(afterSales.length)
  })

  it('includes local date boundaries and excludes invalid order statuses', () => {
    const metricOrders = [
      { id: 'O-MON', productName: '苹果', quantity: 1, amount: 10, customer: '甲', channel: 'shop' as const, status: 'pending' as const, createdAt: '2026-08-24T00:00:00', items: [{ productId: 'P1', skuId: 'S1', name: '苹果', skuName: '份', image: '', quantity: 1, price: 10 }] },
      { id: 'O-TODAY', productName: '苹果', quantity: 2, amount: 20, customer: '乙', channel: 'shop' as const, status: 'delivered' as const, createdAt: '2026-08-30T23:59:59', items: [{ productId: 'P1', skuId: 'S1', name: '苹果', skuName: '份', image: '', quantity: 2, price: 10 }] },
      { id: 'O-OUTSIDE', productName: '苹果', quantity: 3, amount: 30, customer: '丙', channel: 'shop' as const, status: 'shipping' as const, createdAt: '2026-08-23T23:59:59', items: [{ productId: 'P1', skuId: 'S1', name: '苹果', skuName: '份', image: '', quantity: 3, price: 10 }] },
      { id: 'O-INVALID', productName: '苹果', quantity: 9, amount: 90, customer: '丁', channel: 'shop' as const, status: 'after-sale' as const, createdAt: '2026-08-25T10:00:00', items: [{ productId: 'P1', skuId: 'S1', name: '苹果', skuName: '份', image: '', quantity: 9, price: 10 }] }
    ]
    const product = { ...products[0], id: 'P1', name: '苹果', category: '水果', supplier: '果园', sales: 999 }

    const metrics = derivePlatformMetrics({ orders: metricOrders, products: [product], farms: [], suppliers: [], afterSales: [], promoters: [], filter: { from: '2026-08-24', to: '2026-08-30' } })

    expect(metrics).toMatchObject({ gmv: 30, orderCount: 2, orderStats: { total: 2, pending: 1, shipping: 0 } })
    expect(metrics.dailyTrend).toEqual([
      { label: '8/24', amount: 10, count: 1 },
      { label: '8/30', amount: 20, count: 1 }
    ])
  })

  it('aggregates hot products and category GMV from real order lines only', () => {
    const apple = { ...products[0], id: 'P-APPLE', name: '苹果', category: '水果', supplier: '果园', sales: 999, image: '/apple.png' }
    const metricOrders = [
      { id: 'O-LINES', productName: '混合订单', quantity: 3, amount: 35, customer: '甲', channel: 'shop' as const, status: 'shipping' as const, createdAt: '2026-08-30T10:00:00', items: [
        { productId: 'P-APPLE', skuId: 'A', name: '苹果', skuName: '份', image: '/apple.png', quantity: 2, price: 10 },
        { productId: 'P-MISSING', skuId: 'M', name: '山货', skuName: '份', image: '/mountain.png', quantity: 1, price: 15 }
      ] },
      { id: 'O-LEGACY', productName: '旧订单商品', quantity: 50, amount: 500, customer: '乙', channel: 'shop' as const, status: 'pending' as const, createdAt: '2026-08-30T11:00:00' }
    ]

    const metrics = derivePlatformMetrics({ orders: metricOrders, products: [apple], farms: [], suppliers: [], afterSales: [], promoters: [], filter: { from: '2026-08-01', to: '2026-08-30' } })

    expect(metrics.gmv).toBe(535)
    expect(metrics.hotProducts).toEqual([
      { name: '苹果', supplier: '果园', amount: 20, units: 2, image: '/apple.png' },
      { name: '山货', supplier: '未知供应商', amount: 15, units: 1, image: '/mountain.png' }
    ])
    expect(metrics.categoryShares).toEqual([
      { name: '水果', value: 20 },
      { name: '未分类', value: 15 }
    ])
  })

  it('accepts an explicit valid status set', () => {
    const metricOrders = [
      { id: 'O-PENDING', productName: '苹果', quantity: 1, amount: 10, customer: '甲', channel: 'shop' as const, status: 'pending' as const, createdAt: '2026-08-30T10:00:00' },
      { id: 'O-DONE', productName: '苹果', quantity: 1, amount: 20, customer: '乙', channel: 'shop' as const, status: 'delivered' as const, createdAt: '2026-08-30T11:00:00' }
    ]
    const metrics = derivePlatformMetrics({ orders: metricOrders, products: [], farms: [], suppliers: [], afterSales: [], promoters: [], filter: { from: '2026-08-30', to: '2026-08-30', validStatuses: ['delivered'] } })
    expect(metrics).toMatchObject({ gmv: 20, orderCount: 1 })
  })

  it('computes after-sale settlement and rate from refunds', () => {
    const m = derivePlatformMetrics({
      orders: [], products: [], farms: [], suppliers: [], promoters: [],
      afterSales: [
        { id: 'A1', orderId: 'O1', productName: 'X', applicant: '甲', type: 'refund' as const, amount: 100, status: 'refunded' as const, refundAmount: 50 },
        { id: 'A2', orderId: 'O2', productName: 'Y', applicant: '乙', type: 'claim' as const, amount: 200, status: 'processing' as const },
        { id: 'A3', orderId: 'O3', productName: 'Z', applicant: '丙', type: 'refund' as const, amount: 300, status: 'refunded' as const, refundAmount: 300 },
      ],
    })
    expect(m.afterSaleStats.count).toBe(3)
    expect(m.afterSaleStats.processing).toBe(1)
    expect(m.afterSaleStats.resolved).toBe(2)
    expect(m.afterSaleStats.settlement).toBe(350)
    expect(m.afterSaleStats.rate).toBe('66.7%')
  })

  it('aggregates after-sale responsibility by supplier with order ownership fallback', () => {
    const m = derivePlatformMetrics({
      orders: [{ ...orders[0], id: 'O-S1', supplierId: 'S002' }],
      products: [], farms: [], promoters: [],
      suppliers: suppliers.filter((item) => item.id === 'S002' || item.id === 'S003'),
      afterSales: [
        { id: 'A1', orderId: 'O-S1', productName: 'X', applicant: '甲', type: 'refund' as const, amount: 100, status: 'refunded' as const, refundAmount: 60 },
        { id: 'A2', orderId: 'O-S1', productName: 'Y', applicant: '乙', type: 'claim' as const, amount: 40, status: 'processing' as const },
        { id: 'A3', orderId: 'O-UNKNOWN', productName: 'Z', applicant: '丙', type: 'refund' as const, amount: 10, status: 'processing' as const, responsibleSupplierId: 'S003' },
      ],
    })
    expect(m.afterSaleStats.supplierResponsibility).toEqual([
      { supplierId: 'S002', supplierName: '湘西腊味合作社', count: 2, amount: 100, rate: 66.7 },
      { supplierId: 'S003', supplierName: '安化茶业集团', count: 1, amount: 10, rate: 33.3 }
    ])
  })

  it('seeds responsible suppliers on supply-side after-sale cases', () => {
    const caseItem = afterSales.find((item) => item.id === 'SH20609')!
    expect(caseItem.responsibleSupplierId).toBe('S009')
    expect(afterSales.some((item) => item.issue === '客户取消')).toBe(true)
  })
})
})

describe('platform media library', () => {
  it('applies uploaded farm and product images over seeds', () => {
    const farm = { ...farms[0], image: '/static/images/farmhouse.webp' }
    const product = { ...products[0], image: '/static/images/bacon.webp', images: ['/static/images/bacon.webp'] }
    const media = {
      farms: { [farm.id]: 'data:image/jpeg;base64,AAA' },
      products: { [product.id]: { image: 'data:image/jpeg;base64,BBB', images: ['data:image/jpeg;base64,CCC'] } },
      updatedAt: '2026-08-17T00:00:00.000Z'
    }
    applyPlatformMedia([farm], [product], media)
    expect(farm.image).toBe('data:image/jpeg;base64,AAA')
    expect(product.image).toBe('data:image/jpeg;base64,BBB')
    expect(product.images).toEqual(['data:image/jpeg;base64,CCC'])
  })

  it('keeps original images when media has no record', () => {
    const farm = { ...farms[0], image: '/static/images/farmhouse.webp' }
    applyPlatformMedia([farm], [], emptyPlatformMedia())
    expect(farm.image).toBe('/static/images/farmhouse.webp')
  })

  it('upserts and removes farm media records by upload state', () => {
    let media = emptyPlatformMedia()
    media = upsertPlatformFarm(media, 'F999', 'data:image/png;base64,XXX')
    expect(media.farms['F999']).toBe('data:image/png;base64,XXX')
    media = upsertPlatformFarm(media, 'F999', '/static/images/farmhouse.webp')
    expect(media.farms['F999']).toBeUndefined()
  })

  it('upserts product media only when an uploaded image exists', () => {
    let media = emptyPlatformMedia()
    media = upsertPlatformProduct(media, 'P999', '/static/images/rice.webp')
    expect(media.products['P999']).toBeUndefined()
    media = upsertPlatformProduct(media, 'P999', 'data:image/jpeg;base64,YYY', ['/static/images/field.webp'])
    expect(media.products['P999']).toEqual({ image: 'data:image/jpeg;base64,YYY', images: [] })
    media = upsertPlatformProduct(media, 'P999', 'data:image/jpeg;base64,YYY', ['data:image/jpeg;base64,ZZZ'])
    expect(media.products['P999']).toEqual({ image: 'data:image/jpeg;base64,YYY', images: ['data:image/jpeg;base64,ZZZ'] })
  })

  it('PlatformMedia 往返保留 asset 引用并应用到业务实体', () => {
    const farmAsset = { source: 'asset', assetId: 'FARM-ASSET' } as const
    const productAsset = { source: 'asset', assetId: 'PRODUCT-ASSET' } as const
    const galleryAsset = { source: 'asset', assetId: 'GALLERY-ASSET' } as const
    let media = upsertPlatformFarm(emptyPlatformMedia(), 'F001', farmAsset)
    media = upsertPlatformProduct(media, 'P001', productAsset, [galleryAsset])
    expect(media.farms.F001).toEqual(farmAsset)
    expect(media.products.P001).toEqual({ image: productAsset, images: [galleryAsset] })

    const farm = { ...farms[0], id: 'F001' }
    const product = { ...products[0], id: 'P001' }
    applyPlatformMedia([farm], [product], media)
    expect(farm.image).toEqual(farmAsset)
    expect(product.image).toEqual(productAsset)
    expect(product.images).toEqual([galleryAsset])
  })


})

describe('platform business channels', () => {
  it('resolves consumer share by bound promoter or staff', () => {
    const config = { promoterRate: 5, staffRate: 3 }
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' }, config, 200)).toEqual({ role: 'promoter', rate: 5, amount: 10 })
    expect(resolveShare({ userId: 'U1', staffAccountId: 'SA002', status: 'bound', boundAt: 'x' }, config, 200)).toEqual({ role: 'staff', rate: 3, amount: 6 })
  })

  it('returns null for pending or unbound binding', () => {
    const config = { promoterRate: 5, staffRate: 3 }
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'pending' }, config, 200)).toBeNull()
    expect(resolveShare({ userId: 'U1', status: 'bound', boundAt: 'x' }, config, 200)).toBeNull()
    expect(resolveShare(null, config, 200)).toBeNull()
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' }, config, 0)).toBeNull()
  })

  it('uses default share config when nothing published', () => {
    expect(readShareConfig()).toEqual({ promoterRate: 5, staffRate: 3 })
  })


  it('merges published store accounts by id and keeps extra rows', () => {
    const defaults = [{ id: 'SA001', farmId: 'F1', name: 'A', account: 'a', password: '1', role: 'owner' as const, enabled: true }]
    const published = [
      { id: 'SA001', farmId: 'F1', name: 'A2', account: 'a', password: '1', role: 'owner' as const, enabled: true, promoEnabled: true },
      { id: 'SAX', farmId: 'F1', name: 'B', account: 'b', password: '1', role: 'staff' as const, enabled: true }
    ]
    const merged = mergePlatformStoreAccounts(defaults, published)
    expect(merged).toHaveLength(2)
    expect(merged[0].promoEnabled).toBe(true)
    expect(merged[1].id).toBe('SAX')
  })

  it('provides at least one package coupon per core farm', () => {
    const couponByFarm = new Map<string, number>()
    products.filter((item) => item.category === '套餐券').forEach((item) => (item.farmIds || []).forEach((farmId) => couponByFarm.set(farmId, (couponByFarm.get(farmId) || 0) + 1)))
    ;['F001', 'F002', 'F003', 'F004', 'F005', 'F006', 'F007', 'F009'].forEach((farmId) => expect(couponByFarm.get(farmId) || 0).toBeGreaterThanOrEqual(1))
  })
})

describe('user identity (openid anchor)', () => {
  beforeEach(() => localStorage.clear())

  it('keeps mock openid stable on same device', async () => {
    const first = await simulateWechatLogin()
    const second = await simulateWechatLogin()
    expect(second.openid).toBe(first.openid)
  })

  it('creates and reuses local anonymous userId', () => {
    const id1 = getOrCreateUserId()
    const id2 = getOrCreateUserId()
    expect(id1).toBe(id2)
    expect(id1.startsWith('U')).toBe(true)
  })

  it('links openid to userId on first resolve and reuses it later', () => {
    const userId = resolveUserIdentity('mock_openid_abc')
    expect(resolveUserIdByOpenid('mock_openid_abc')).toBe(userId)
    expect(resolveUserIdentity('mock_openid_abc')).toBe(userId)
  })

  it('keeps distinct openids isolated unless explicitly linked', () => {
    const a = resolveUserIdentity('openid_A')
    const b = resolveUserIdentity('openid_B')
    expect(b).not.toBe(a)
    writeUserLink('openid_C', a)
    expect(resolveUserIdByOpenid('openid_C')).toBe(a)
  })
describe('platform after-sale status text', () => {
  beforeEach(() => localStorage.clear())

  it('maps platform after-sale work order to readable status', () => {
    writePlatformAfterSale({ id: 'AS-TEST1', orderId: 'O-TEST1', productName: '测试商品', applicant: '测试门店', type: 'refund', amount: 86, status: 'processing', issue: '质量问题', quantity: 1 })
    expect(readPlatformAfterSaleStatus('O-TEST1')).toBe('售后中')
  })
})
describe('share settlement helpers', () => {
  beforeEach(() => localStorage.clear())

  it('sums pending shares and marks them settled', () => {
    writeShareRecords([
      { id: 'SR-A', userId: 'u1', orderId: 'o1', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: 5, createdAt: 'x' },
      { id: 'SR-B', userId: 'u2', orderId: 'o2', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 3, amount: 3, createdAt: 'x' }
    ])
    expect(pendingShareAmount('T1')).toBe(8)
    expect(pendingShareTotal()).toBe(8)
    markShareSettled(['SR-A'])
    expect(pendingShareAmount('T1')).toBe(3)
  })
})
})

describe('supplier fulfillment helpers', () => {
  beforeEach(() => localStorage.clear())

  const item = (skuId: string, name: string, quantity: number): OrderItem => ({ productId: skuId, skuId, name, skuName: name, image: '/static/images/bacon.webp', quantity, price: 10 })

  it('computes shortage from actual quantities and clamps out-of-range inputs', () => {
    const items = [item('S1', '腊肉', 10), item('S2', '辣椒酱', 5)]
    expect(computeShortage(items, { S1: 8 })).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }])
    expect(computeShortage(items, { S1: 12, S2: 0 })).toEqual([{ skuId: 'S2', name: '辣椒酱', ordered: 5, actual: 0, shortage: 5 }])
    expect(computeShortage(items, { S1: 10, S2: 5 })).toEqual([])
    expect(computeShortage(items, { S1: -3 })).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 0, shortage: 10 }])
  })

  it('derives supplier metrics across statuses and today counts', () => {
    const today = todayString()
    const order = (id: string, status: OrderStatus, amount: number, createdAt: string, fulfillment?: Partial<SupplierFulfillment>): Order => ({ id, productName: 'x', quantity: 1, amount, customer: 's', channel: 'purchase', status, createdAt, ...(fulfillment ? { supplierFulfillment: { status: 'submitted', shortages: [], handovers: [], updatedAt: '', ...fulfillment } } : {}) })
    const orders = [
      order('A', 'pending', 10, `${today} 09:00`),
      order('B', 'pending', 20, `${today} 09:10`),
      order('C', 'pending', 30, `${today} 09:20`, { status: 'accepted' }),
      order('D', 'shipping', 40, '2026-08-01 09:00', { status: 'shipped', deliverDate: today, shortages: [{ skuId: 'S0', name: '腊肉', ordered: 4, actual: 3, shortage: 1, handled: true }] }),
      order('E', 'shipping', 50, '2026-08-01 09:00', { status: 'delivering', deliverDate: today, shortages: [{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }] }),
      order('F', 'delivered', 60, '2026-08-01 09:00', { status: 'received', deliverDate: today, shortages: [{ skuId: 'S2', name: '辣椒酱', ordered: 5, actual: 3, shortage: 2 }] }),
      order('G', 'shipping', 70, '2026-08-01 09:00', { status: 'delivering', deliverDate: '2026-08-01', shortages: [{ skuId: 'S3', name: '土蜂蜜', ordered: 5, actual: 4, shortage: 1 }] })
    ]
    const metrics = deriveSupplierMetrics(orders)
    expect(metrics.toAcceptCount).toBe(2)
    expect(metrics.toDispatchCount).toBe(1)
    expect(metrics.toHandoverCount).toBe(1)
    expect(metrics.deliveringCount).toBe(2)
    expect(metrics.shortageOrderCount).toBe(2)
    expect(metrics.todayOrderCount).toBe(3)
    expect(metrics.todayAmount).toBe(60)
  })

  it('derives today farmhouse quantities by store resolver and item counts', () => {
    const today = todayString()
    const order = (id: string, extras: Partial<Order>): Order => ({
      id, productName: 'x', quantity: extras.quantity ?? 1, amount: 1, customer: extras.customer ?? '游客',
      channel: extras.channel ?? 'purchase', status: extras.status ?? 'pending', createdAt: extras.createdAt ?? `${today} 09:00`,
      ...extras
    })
    const storeKeyOf = (item: Order) => item.storeId || (item.customer === '石板溪农家乐·门店' ? 'F001' : item.customer === '云上人家·门店' ? 'F002' : item.customer)
    const quantities = deriveTodayFarmhouseQuantities([
      order('A', { customer: '石板溪农家乐·门店', createdAt: `${today} 09:00`, items: [{ productId: 'P', skuId: 'S1', name: '腊肉', skuName: '500g', image: '', quantity: 5, price: 1 }, { productId: 'P', skuId: 'S2', name: '辣椒', skuName: '瓶', image: '', quantity: 10, price: 1 }] }),
      order('B', { customer: '石板溪农家乐·门店', createdAt: `${today} 10:00`, items: [{ productId: 'P', skuId: 'S3', name: '蜂蜜', skuName: '瓶', image: '', quantity: 6, price: 1 }] }),
      order('C', { customer: '云上人家·门店', createdAt: `${today} 11:00`, supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '' }, items: [{ productId: 'P', skuId: 'S4', name: '蛋', skuName: '盒', image: '', quantity: 20, price: 1 }] }),
      order('D', { customer: '云上人家·门店', createdAt: '2026-08-01 09:00', status: 'shipping', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '' }, items: [{ productId: 'P', skuId: 'S5', name: '米', skuName: '袋', image: '', quantity: 4, price: 1 }] }),
      order('E', { customer: '石板溪农家乐·门店', createdAt: '2026-08-01 09:00', status: 'shipping', supplierFulfillment: { status: 'delivering', deliverDate: today, shortages: [{ skuId: 'S6', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }], handovers: [], updatedAt: '' }, items: [{ productId: 'P', skuId: 'S6', name: '腊肉', skuName: '500g', image: '', quantity: 10, price: 1 }, { productId: 'P', skuId: 'S7', name: '辣椒', skuName: '瓶', image: '', quantity: 5, price: 1 }] }),
      order('F', { customer: '游客', channel: 'shop', createdAt: `${today} 12:00`, supplierOrderLink: { source: 'c-mall' }, items: [{ productId: 'P', skuId: 'S8', name: '散单', skuName: '份', image: '', quantity: 99, price: 1 }] }),
      order('G', { customer: '石板溪农家乐·门店', channel: 'shop', createdAt: `${today} 13:00`, supplierOrderLink: { source: 'farmhouse-courier' }, items: [{ productId: 'P', skuId: 'S9', name: '代发', skuName: '份', image: '', quantity: 3, price: 1 }] })
    ], storeKeyOf)
    expect(quantities.storeCount).toBe(2)
    expect(quantities.itemCount).toBe(44)
    expect(quantities.pendingShipItemCount).toBe(24)
    expect(quantities.shortageItemCount).toBe(2)
    expect(quantities.deliveringItemCount).toBe(15)
  })

  it('ensures fulfillment from order status for store-submitted orders', () => {
    const order = (status: OrderStatus): Order => ({ id: 'x', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status, createdAt: 'x' })
    expect(ensureSupplierFulfillment(order('pending')).status).toBe('submitted')
    expect(ensureSupplierFulfillment(order('shipping')).status).toBe('shipped')
    expect(ensureSupplierFulfillment(order('delivered')).status).toBe('received')
    expect(ensureSupplierFulfillment(order('unpaid-cancelled')).status).toBe('cancelled')
  })

  it('runs full accept→assign→handover-out→handover-in lifecycle and mirrors order status', () => {
    let order: Order = { id: 'O1', productName: '腊肉', quantity: 10, amount: 380, customer: '石板溪门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-20 09:00', items: [item('S1', '腊肉', 10)] }
    order = acceptSupplierOrder(order, '湘西腊味合作社')!
    expect(order.supplierFulfillment?.status).toBe('accepted')
    order = assignSupplierDriver(order, demoDrivers[0], '湘西腊味合作社')!
    expect(order.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟' })
    expect(order.status).toBe('shipping')
    order = handoverSupplierOut(order, { S1: 8 }, { id: 'sup', name: '湘西腊味合作社', role: 'supplier' })!
    expect(order.supplierFulfillment?.status).toBe('delivering')
    expect(order.supplierFulfillment?.shortages).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }])
    expect(order.supplierFulfillment?.handovers).toHaveLength(1)
    order = handoverSupplierIn(order, { id: 'D001', name: '张伟', role: 'driver' })!
    expect(order.supplierFulfillment?.status).toBe('received')
    expect(order.status).toBe('delivered')
    expect(order.supplierFulfillment?.handovers).toHaveLength(2)
    expect(order.flow?.some((event) => event.action.includes('到店交接完成'))).toBe(true)
  })

  it('rejects out-of-order transitions and guards reassign', () => {
    let order: Order = { id: 'O2', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    expect(assignSupplierDriver(order, demoDrivers[0], 'sup')).toBeNull()
    order = acceptSupplierOrder(order, 'sup')!
    order = assignSupplierDriver(order, demoDrivers[0], 'sup')!
    expect(acceptSupplierOrder(order, 'sup')).toBeNull()
    expect(handoverSupplierIn(order, { id: 'D001', name: '张伟', role: 'driver' })).toBeNull()
    order = handoverSupplierOut(order, { S1: 1 }, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(handoverSupplierOut(order, { S1: 1 }, { id: 'sup', name: 'sup', role: 'supplier' })).toBeNull()
    expect(reassignSupplierDriver(order, demoDrivers[0], 'sup')).toBeNull()
    const reassigned = reassignSupplierDriver(order, demoDrivers[1], 'sup')!
    expect(reassigned.supplierFulfillment?.driverName).toBe('李强')
    expect(reassigned.flow?.some((event) => event.action.includes('改派司机'))).toBe(true)
  })

  it('ships courier with tracking number and confirms delivered', () => {
    let order: Order = { id: 'O3', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    order = acceptSupplierOrder(order, 'sup')!
    expect(shipSupplierCourier(order, '', 'sup')).toBeNull()
    order = shipSupplierCourier(order, 'SF001', 'sup')!
    expect(order.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'courier', trackingNo: 'SF001' })
    expect(new Date(order.supplierFulfillment!.updatedAt).toISOString()).toBe(order.supplierFulfillment!.updatedAt)
    expect(new Date(order.flow!.at(-1)!.time).toISOString()).toBe(order.flow!.at(-1)!.time)
    expect(order.trackingNo).toBe('SF001')
    expect(order.logistics?.some((event) => event.title === '商品已发货' && event.detail.includes('SF001'))).toBe(true)
    order = handoverSupplierOut(order, {}, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(order.supplierFulfillment?.status).toBe('delivering')
    expect(order.logistics?.some((event) => event.title === '运输中')).toBe(true)
    order = confirmCourierDelivered(order, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(order.status).toBe('delivered')
    expect(order.supplierFulfillment?.status).toBe('received')
    expect(order.logistics?.some((event) => event.title === '已签收')).toBe(true)
  })

  it('manages driver storage and active-task counts', () => {
    expect(readPlatformDrivers()).toBeNull()
    writePlatformDrivers(demoDrivers)
    expect(readPlatformDrivers()).toHaveLength(3)
    expect(mergePlatformDrivers(demoDrivers, readPlatformDrivers())).toHaveLength(3)
    expect(mergePlatformDrivers(demoDrivers, [{ ...demoDrivers[0], name: '张师傅' }])).toHaveLength(3)
    expect(mergePlatformDrivers([], readPlatformDrivers())).toHaveLength(3)
    const orders: Order[] = [
      { id: 'A', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'shipping', createdAt: 'x', supplierFulfillment: { status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } },
      { id: 'B', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'shipping', createdAt: 'x', supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } },
      { id: 'C', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'delivered', createdAt: 'x', supplierFulfillment: { status: 'received', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } }
    ]
    expect(driverActiveTaskCounts(orders)).toEqual({ D001: 2 })
    expect(findActiveDriver(demoDrivers, 'driver01', '123456')?.id).toBe('D001')
    expect(findActiveDriver(demoDrivers, 'driver01', 'bad')).toBeNull()
    expect(findDriverByAccount(demoDrivers, 'driver01')?.status).toBe('active')
  })
})

describe('admin menu contract migration', () => {
  beforeEach(() => localStorage.clear())

  it('ships seventeen menu keys with user operations and without booking or route menus', () => {
    expect(ALL_ADMIN_MENU_KEYS).toHaveLength(17)
    expect(ALL_ADMIN_MENU_KEYS).toEqual(expect.arrayContaining(['users', 'leaders']))
    expect(ALL_ADMIN_MENU_KEYS as string[]).not.toContain('bookings')
    expect(ALL_ADMIN_MENU_KEYS as string[]).not.toContain('routes')
    expect(ALL_ADMIN_ACTION_PERMISSIONS).toEqual(expect.arrayContaining(['user.view', 'leader.manage', 'leader.price.manage', 'leader.withdrawal.review']))
    expect(ALL_ADMIN_ACTION_PERMISSIONS).not.toContain('route.manage')
    expect(ALL_ADMIN_ACTION_PERMISSIONS).not.toContain('booking.confirm')
  })

  it('grants the user operations menus to the operational and finance roles', () => {
    const roles = defaultAdminRoles()
    const operations = roles.find((item) => item.code === 'operations')!
    expect(operations.menuPermissions).toEqual(expect.arrayContaining(['users', 'leaders']))
    expect(operations.actionPermissions).toEqual(expect.arrayContaining(['user.view', 'leader.manage', 'leader.price.manage']))
    expect(roles.find((item) => item.code === 'reviewer')?.menuPermissions as string[]).not.toContain('bookings')
    expect(roles.find((item) => item.code === 'finance')?.actionPermissions).toContain('leader.withdrawal.review')
  })

  it('prunes retired booking and route menus from persisted roles and leaves a custom role menus untouched', () => {
    const legacyRoles = defaultAdminRoles().map((role) => ({
      ...role,
      menuPermissions: [...role.menuPermissions, 'bookings', 'routes'] as unknown as AdminMenuKey[],
      actionPermissions: [...role.actionPermissions, 'booking.confirm', 'booking.complete', 'booking.cancel', 'route.manage']
    }))
    const customRole = { ...legacyRoles[4], id: 'AR-CUSTOM', code: 'custom', name: '自定义', system: false, menuPermissions: ['dashboard'] as AdminMenuKey[], actionPermissions: [] as AdminPermissionCode[] }
    expect(writePlatformAdminRoles([...legacyRoles, { ...customRole, menuPermissions: [...customRole.menuPermissions] }])).toBe(true)
    expect(writePlatformAdminAccounts(defaultAdminAccounts())).toBe(true)

    expect(seedPlatformAdminSecurity()).toBe(true)

    const migrated = readPlatformAdminRoles()
    const migratedOperations = migrated.find((role) => role.code === 'operations')!
    expect(migratedOperations.menuPermissions as string[]).not.toContain('bookings')
    expect(migratedOperations.menuPermissions as string[]).not.toContain('routes')
    expect(migratedOperations.actionPermissions).not.toContain('booking.confirm')
    expect(migratedOperations.actionPermissions).not.toContain('route.manage')
    expect(migrated.find((role) => role.code === 'custom')).toMatchObject({ menuPermissions: ['dashboard'], actionPermissions: [] })
  })
})

describe('retired platform data cleanup', () => {
  beforeEach(() => localStorage.clear())

  it('purges the retired booking, route and live collections exactly once', () => {
    RETIRED_PLATFORM_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify({ legacy: true })))
    expect(localStorage.getItem(RETIRED_PLATFORM_STORAGE_KEYS[0])).not.toBeNull()

    expect(clearRetiredPlatformData()).toBe(true)
    RETIRED_PLATFORM_STORAGE_KEYS.forEach((key) => expect(localStorage.getItem(key), key).toBeNull())

    // 幂等：清理完成后写入标记键，重放的遗留数据不会再次触发清理
    localStorage.setItem(RETIRED_PLATFORM_STORAGE_KEYS[1], JSON.stringify({ legacy: true }))
    expect(clearRetiredPlatformData()).toBe(true)
    expect(localStorage.getItem(RETIRED_PLATFORM_STORAGE_KEYS[1])).not.toBeNull()
  })

  it('drops retired keys from persisted state while migrating an older envelope', () => {
    const migrated = migratePersistedState(
      { version: 7, state: { bookings: ['B1'], routes: ['R1'], lives: ['L1'], travelRoutes: ['T1'], liveRooms: ['L1'], keep: 'ok' } },
      { keep: 'default' }
    ) as Record<string, unknown>
    expect(migrated.keep).toBe('ok')
    for (const key of ['bookings', 'routes', 'lives', 'travelRoutes', 'liveRooms']) {
      expect(migrated, key).not.toHaveProperty(key)
    }
  })
})

describe('supplier account helpers', () => {
  const createdAt = '2026-08-24T09:00:00.000Z'

  it('builds default phone accounts only for certified suppliers with a valid phone', () => {
    const accounts = buildSupplierAccountSeeds(suppliers.slice(0, 2), createdAt)

    expect(accounts).toEqual([
      { id: 'SA001', supplierId: 'S002', supplierName: suppliers[1].name, account: '13787366688', password: '13787366688', enabled: true, createdAt, updatedAt: createdAt }
    ])
  })

  it('keeps a persisted password when merging regenerated default accounts', () => {
    const defaults = buildSupplierAccountSeeds([suppliers[1]], createdAt)
    const saved = [{ ...defaults[0], password: 'custom123', updatedAt: '2026-08-24T10:00:00.000Z' }]

    expect(mergePlatformSupplierAccounts(defaults, saved)).toEqual(saved)
  })

  it('authenticates only cooperating suppliers with matching credentials', () => {
    const accounts = buildSupplierAccountSeeds(suppliers.slice(0, 2), createdAt)
    const legacyPendingAccount = { id: 'SA-LEGACY', supplierId: 'S001', supplierName: suppliers[0].name, account: '13973015588', password: '13973015588', enabled: true, createdAt, updatedAt: createdAt }

    expect(authenticateSupplier(accounts, suppliers, '13787366688', '13787366688')).toMatchObject({ ok: true, supplier: { id: 'S002' } })
    expect(authenticateSupplier(accounts, suppliers, '13787366688', 'wrong')).toEqual({ ok: false, reason: 'invalid-credentials' })
    expect(authenticateSupplier([...accounts, legacyPendingAccount], suppliers, '13973015588', '13973015588')).toEqual({ ok: false, reason: 'inactive' })
  })
})

describe('supplier date dimension and shortage handling', () => {
  beforeEach(() => localStorage.clear())

  it('provides today string and clears platform keys', () => {
    const today = todayString()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    writePlatformOrder({ id: 'CLEAR-T1', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' })
    expect(readPlatformOrders()?.['CLEAR-T1']).toBeTruthy()
    clearPlatformJson(PLATFORM_ORDERS_STORAGE_KEY)
    expect(readPlatformOrders()).toBeNull()
  })

  it('sets deliverDate on assign and courier ship', () => {
    const today = todayString()
    let order: Order = { id: 'D1', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    order = acceptSupplierOrder(order, 'sup')!
    order = assignSupplierDriver(order, demoDrivers[0], 'sup')!
    expect(order.supplierFulfillment?.deliverDate).toBe(today)
    let courier: Order = { id: 'D2', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    courier = acceptSupplierOrder(courier, 'sup')!
    courier = shipSupplierCourier(courier, 'SF1', 'sup')!
    expect(courier.supplierFulfillment?.deliverDate).toBe(today)
  })

  it('marks shortage handled once and guards repeats', () => {
    let order: Order = { id: 'S1', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x', items: [{ productId: 'P', skuId: 'S', name: '腊肉', skuName: '500g', image: 'i', quantity: 5, price: 1 }] }
    order = acceptSupplierOrder(order, 'sup')!
    order = assignSupplierDriver(order, demoDrivers[0], 'sup')!
    order = handoverSupplierOut(order, { S: 3 }, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(order.supplierFulfillment?.shortages).toHaveLength(1)
    const handled = markShortageHandled(order, 'S', 'sup')!
    expect(handled.supplierFulfillment?.shortages[0].handled).toBe(true)
    expect(handled.flow?.some((event) => event.action.includes('已标记补发'))).toBe(true)
    expect(markShortageHandled(handled, 'S', 'sup')).toBeNull()
    expect(markShortageHandled(order, 'NO-SKU', 'sup')).toBeNull()
  })
})


describe('商品渠道标签与分佣辅助函数', () => {
  it('解析渠道标签：门店商品与用户端商品', () => {
    const storeProduct = { id: 'P1', source: 'platform' as const }
    const liveProduct: CProduct = { id: 'C1', name: '测试商品', category: '土特产', supplierId: 'S1', supplierName: '供应商', image: '', tags: [], status: 'active', shippingType: 'courier', skus: [] }
    const both = { id: 'P2', source: 'platform' as const, channels: { store: true, live: true } }
    expect(resolveProductChannels(storeProduct)).toEqual({ store: true, live: false })
    expect(resolveProductChannels(liveProduct)).toEqual({ store: false, live: true })
    expect(resolveProductChannels(both)).toEqual({ store: true, live: true })
    expect(productChannelTags(both)).toEqual(['门店商品', '用户端商品'])
  })

  it('展示标签：渠道标签 + 自由标签 + 快递直发', () => {
    const product = { id: 'P1', source: 'platform' as const, tags: ['柴火慢熏'], expressDelivery: true, productType: 'goods' as const }
    expect(displayProductTags(product, 'store')).toEqual(['门店商品', '柴火慢熏', '快递直发'])
    expect(displayProductTags(product, 'live')).toEqual(['柴火慢熏', '快递直发'])
    expect(displayProductTags({ ...product, productType: 'package' as const }, 'store')).toEqual(['门店商品', '柴火慢熏'])
    expect(isExpressDeliverable({ expressDelivery: true, productType: 'package' })).toBe(false)
    expect(isExpressDeliverable({ expressDelivery: false, productType: 'goods' })).toBe(false)
  })

  it('门店分佣按零售价比例计算并保留毛利', () => {
    expect(storeCommissionAmount(100, 18)).toBe(18)
    expect(storeCommissionAmount(100, 5.5)).toBe(5.5)
    expect(storeCommissionAmount(0, 18)).toBe(0)
    expect(storeGrossMargin(88, 38)).toBe(50)
    expect(storeGrossMargin(30, 42)).toBe(-12)
  })

  it('用户端价格按等级叠加固定加价', () => {
    const sku = { id: 'S', name: '500g', image: 'i', stock: 5, basePrice: 20, level1Commission: 10, level2Commission: 15 }
    expect(cPriceForSku(sku, 'level1')).toBe(20)
    expect(cPriceForSku(sku, 'level2')).toBe(30)
    expect(cPriceForSku(sku, 'normal')).toBe(45)
    expect(EXPRESS_DELIVERY_TAG).toBe('快递直发')
  })
})

describe('统一商品目录', () => {
  beforeEach(() => localStorage.clear())

  const catalogProduct: CatalogProduct = {
    id: 'U001', name: '统一腊肉', category: '土特产', supplierId: 'S002', supplierName: '湘西腊味合作社', source: 'platform', status: 'active', image: '/static/images/bacon.webp', images: [], tags: ['精选'], productType: 'goods', expressDelivery: true, channel: 'all', farmIds: ['F001'], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: 'U001-500', name: '500g', image: '/static/images/bacon.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15 }]
  }

  it('按零售价和两级固定金额计算三种身份价格', () => {
    const sku = catalogProduct.skus[0]
    expect(catalogPriceForSku(sku, 'normal')).toBe(45)
    expect(catalogPriceForSku(sku, 'level2')).toBe(30)
    expect(catalogPriceForSku(sku, 'level1')).toBe(20)
  })

  it('按直推二级和可选一级分配对应佣金', () => {
    const items = [{ quantity: 2, level1Amount: 10, level2Amount: 15 }]
    expect(allocateCatalogCommissions(items, { level1Id: 'L1', level2Id: 'L2' }, 'normal')).toEqual([
      { beneficiaryId: 'L1', beneficiaryLevel: 'level1', amount: 20 },
      { beneficiaryId: 'L2', beneficiaryLevel: 'level2', amount: 30 }
    ])
    expect(allocateCatalogCommissions(items, { level2Id: 'L2' }, 'normal')).toEqual([
      { beneficiaryId: 'L2', beneficiaryLevel: 'level2', amount: 30 }
    ])
    expect(allocateCatalogCommissions(items, { level1Id: 'L1', level2Id: 'SELF' }, 'level2')).toEqual([
      { beneficiaryId: 'L1', beneficiaryLevel: 'level1', amount: 20 }
    ])
    expect(allocateCatalogCommissions(items, { level2Id: 'SELF' }, 'level1')).toEqual([])
  })

  it('迁移旧目录时保留渠道且不按名称合并', () => {
    const storeProduct = { ...products[0], id: 'P-KEEP', name: '同名商品', channels: { store: true } }
    const liveProduct = { ...cProducts[0], id: 'C-KEEP', name: '同名商品', channels: { live: true } }
    const migrated = migrateLegacyCatalog([storeProduct], [liveProduct], DEFAULT_PRICING_DEFAULTS)
    expect(migrated.map((item) => [item.id, item.channel])).toEqual([['P-KEEP', 'store'], ['C-KEEP', 'live']])
    expect(migrated[1].skus[0].retailPrice).toBe(liveProduct.skus[0].basePrice + liveProduct.skus[0].level1Commission + liveProduct.skus[0].level2Commission)
  })

  it('迁移历史套餐券分类时补齐套餐商品类型', () => {
    const legacyPackage = { ...products.find((item) => item.id === 'P053')!, productType: undefined }
    const [migrated] = migrateLegacyCatalog([legacyPackage], [], DEFAULT_PRICING_DEFAULTS)
    expect(migrated).toMatchObject({ id: 'P053', productType: 'package', channel: 'store', expressDelivery: false })
  })

  it('迁移低价历史商品时不会因为默认分销金额而丢失', () => {
    const legacy = { ...products[0], id: 'P-LOW', price: 18, skus: [{ ...products[0].skus[0], price: 18, stock: 7 }] }
    const [migrated] = migrateLegacyCatalog([legacy], [], DEFAULT_PRICING_DEFAULTS)
    expect(migrated).toMatchObject({ id: 'P-LOW', skus: [{ retailPrice: 18, stock: 7 }] })
    expect(migrated.skus[0].level1Amount + migrated.skus[0].level2Amount).toBeLessThanOrEqual(18)
  })

  it('向旧三端模型投影相同商品和SKU标识', () => {
    const storeView = catalogProductToProduct(catalogProduct)
    const userView = catalogProductToCProduct(catalogProduct)
    expect(storeView).toMatchObject({ id: 'U001', channels: { store: true, live: true }, price: 45, cost: 20, stock: 8 })
    expect(userView).toMatchObject({ id: 'U001', channels: { store: true, live: true }, skus: [{ id: 'U001-500', basePrice: 20, level1Commission: 10, level2Commission: 15, stock: 8 }] })
  })

  it('使用revision阻止过期库存写入', () => {
    const initial: CatalogState = { schemaVersion: 1, revision: 0, products: [catalogProduct] }
    expect(writeCatalogState(initial)).toBe(true)
    expect(updateCatalogStock([{ productId: 'U001', skuId: 'U001-500', quantity: -2 }], 0)?.revision).toBe(1)
    expect(updateCatalogStock([{ productId: 'U001', skuId: 'U001-500', quantity: -1 }], 0)).toBeNull()
    expect(updateCatalogStock([{ productId: 'U001', skuId: 'U001-500', quantity: -99 }], 1)).toBeNull()
  })

  it('提供新增商品使用的默认价格配置', () => {
    expect(DEFAULT_PRICING_DEFAULTS).toEqual({ promoterCommissionRate: 5, storeCommissionRate: 3, level1Amount: 10, level2Amount: 15, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })
  })

  it('持久化价格默认值并从旧店员比例迁移门店佣金', () => {
    localStorage.setItem(PLATFORM_CONFIG_STORAGE_KEY, JSON.stringify({ promoterRate: 8, staffRate: 4 }))
    expect(readPricingDefaults()).toEqual({ promoterCommissionRate: 8, storeCommissionRate: 4, level1Amount: 10, level2Amount: 15, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })
    expect(writePricingDefaults({ promoterCommissionRate: 6, storeCommissionRate: 2, level1Amount: 12, level2Amount: 18 })).toBe(true)
    expect(readPricingDefaults()).toEqual({ promoterCommissionRate: 6, storeCommissionRate: 2, level1Amount: 12, level2Amount: 18, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })
    expect(writePricingDefaults({ promoterCommissionRate: 101, storeCommissionRate: 2, level1Amount: 12, level2Amount: 18 })).toBe(false)
  })

  it('价格默认值和消费分成使用独立存储且互不覆盖', () => {
    localStorage.setItem(PLATFORM_CONFIG_STORAGE_KEY, JSON.stringify({ promoterRate: 8, staffRate: 4 }))
    expect(writePricingDefaults({ promoterCommissionRate: 6, storeCommissionRate: 2, level1Amount: 12, level2Amount: 18 })).toBe(true)
    writeShareConfig({ promoterRate: 9, staffRate: 7 })

    expect(readPricingDefaults()).toEqual({ promoterCommissionRate: 6, storeCommissionRate: 2, level1Amount: 12, level2Amount: 18, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })
    expect(readShareConfig()).toEqual({ promoterRate: 9, staffRate: 7 })
    expect(localStorage.getItem(PLATFORM_PRICING_DEFAULTS_STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(PLATFORM_SHARE_CONFIG_STORAGE_KEY)).not.toBeNull()
  })

  it('读取旧 schema v1 目录时仅返回 v2 投影而不写回存储', () => {
    localStorage.setItem('agritainment-platform-catalog', JSON.stringify({ schemaVersion: 1, revision: 7, products: [catalogProduct] }))

    const migrated = readCatalogState()

    expect(migrated).toMatchObject({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 7, products: [{ id: 'U001', skus: [{ id: 'U001-500', status: 'active' }] }], appliedOperations: {} })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}').schemaVersion).toBe(1)
  })

  it('首次读取时从旧商品初始化统一目录且不会重复迁移', () => {
    const first = ensureCatalogState([products[0]], [cProducts[0]])
    expect(first).toMatchObject({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, appliedOperations: {} })
    expect(first.products.map((item) => item.id)).toEqual([products[0].id, cProducts[0].id])

    const second = ensureCatalogState([], [])
    expect(second).toEqual(first)
    expect(readCatalogState()).toEqual(first)
  })

  it('按销售端投影渠道并限制用户商城只能读取可快递实物', () => {
    const storeOnly = { ...catalogProduct, id: 'STORE', channel: 'store' as const }
    const liveOnly = { ...catalogProduct, id: 'LIVE', channel: 'live' as const }
    const all = { ...catalogProduct, id: 'ALL', channel: 'all' as const }
    const voucher = { ...catalogProduct, id: 'VOUCHER', channel: 'all' as const, productType: 'package' as const, expressDelivery: false }
    const state = { schemaVersion: 1, revision: 0, products: [storeOnly, liveOnly, all, voucher] }

    expect(catalogProductsForAudience(state, 'user').map((item) => item.id)).toEqual(['LIVE', 'ALL'])
    expect(catalogProductsForAudience(state, 'ordering').map((item) => item.id)).toEqual(['STORE', 'ALL', 'VOUCHER'])
    expect(catalogProductsForAudience(state, 'farmhouse-selection').map((item) => item.id)).toEqual(['STORE', 'ALL', 'VOUCHER'])
  })

  it('为没有选品记录的门店初始化已分配的在售商品和 SKU 零售价', () => {
    const assigned = { ...catalogProduct, id: 'ASSIGNED', channel: 'store' as const, farmIds: ['F001'] }
    const otherFarm = { ...catalogProduct, id: 'OTHER-FARM', channel: 'store' as const, farmIds: ['F002'] }
    const unassigned = { ...catalogProduct, id: 'UNASSIGNED', channel: 'store' as const, farmIds: [] }
    const liveOnly = { ...catalogProduct, id: 'LIVE-ONLY', channel: 'live' as const, farmIds: ['F001'] }
    const offline = { ...catalogProduct, id: 'OFFLINE', channel: 'store' as const, farmIds: ['F001'], status: 'offline' as const }
    const state: CatalogState = { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [assigned, otherFarm, unassigned, liveOnly, offline] }
    expect(writeCatalogState(state)).toBe(true)

    const initialized = ensureStoreCatalogSelectionDefaults('F001', state)

    expect(initialized).toMatchObject({ revision: 1, selections: [{ storeId: 'F001', productId: 'ASSIGNED', listed: true, skuRetailPrices: { 'U001-500': 45 } }] })
    expect(readStoreCatalogSelectionState()).toEqual(initialized)
  })

  it('已有本店选品记录时不覆盖主动下架状态或补充其他商品', () => {
    const first = { ...catalogProduct, id: 'FIRST', farmIds: ['F001'] }
    const second = { ...catalogProduct, id: 'SECOND', farmIds: ['F001'] }
    const state: CatalogState = { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [first, second] }
    expect(writeCatalogState(state)).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'FIRST', listed: false, retailPrice: 52 })).toBe(true)

    const initialized = ensureStoreCatalogSelectionDefaults('F001', state)

    expect(initialized.revision).toBe(1)
    expect(initialized.selections).toEqual([expect.objectContaining({ storeId: 'F001', productId: 'FIRST', listed: false, skuRetailPrices: { 'U001-500': 52 } })])
  })

  it('其他门店记录不阻止本店初始化且重复调用保持幂等', () => {
    const assigned = { ...catalogProduct, id: 'SHARED-ASSIGNED', farmIds: ['F001', 'F002'] }
    const state: CatalogState = { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [assigned] }
    expect(writeCatalogState(state)).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F002', productId: assigned.id, listed: true, retailPrice: 52 })).toBe(true)

    const initialized = ensureStoreCatalogSelectionDefaults('F001', state)
    const repeated = ensureStoreCatalogSelectionDefaults('F001', state)

    expect(initialized.revision).toBe(2)
    expect(initialized.selections.map((item) => item.storeId).sort()).toEqual(['F001', 'F002'])
    expect(repeated).toEqual(initialized)
  })

  it('按商品分类语义返回统一图标并为未知分类回退', () => {
    expect(categoryIconName('全部')).toBe('layout-dashboard')
    expect(categoryIconName('生鲜农产')).toBe('sprout')
    expect(categoryIconName('腊味/预制菜')).toBe('utensils')
    expect(categoryIconName('文旅伴手礼')).toBe('shopping-bag')
    expect(categoryIconName('民宿用品')).toBe('house')
    expect(categoryIconName('包装耗材')).toBe('package')
    expect(categoryIconName('套餐券')).toBe('badge-percent')
    expect(categoryIconName('农家体验')).toBe('map-pin')
    expect(categoryIconName('后台新建分类')).toBe('tags')
  })

  it('新增编辑商品递增revision并拒绝过期写入和非法发布', () => {
    expect(writeCatalogState({ schemaVersion: 1, revision: 0, products: [] })).toBe(true)
    const created = saveCatalogProduct(catalogProduct, 0)
    expect(created?.revision).toBe(1)
    expect(created?.products).toHaveLength(1)
    expect(saveCatalogProduct({ ...catalogProduct, name: '过期编辑' }, 0)).toBeNull()
    expect(saveCatalogProduct({ ...catalogProduct, id: 'BAD', channel: 'live', expressDelivery: false }, 1)).toBeNull()
    expect(saveCatalogProduct({ ...catalogProduct, id: 'BAD-VOUCHER', channel: 'all', productType: 'package', expressDelivery: true }, 1)).toBeNull()
  })

  it('saveCatalogProduct 在持久化边界规范化所有图片引用', () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [] })).toBe(true)
    const asset = { source: 'asset', assetId: 'ASSET-1' } as const
    const saved = saveCatalogProduct({
      ...catalogProduct,
      image: '/static/images/product.webp',
      images: ['https://cdn.example.com/gallery.jpg', asset],
      skus: catalogProduct.skus.map((sku) => ({ ...sku, image: 'data:image/png;base64,AAAA' }))
    }, 0)
    expect(saved?.products[0].image).toEqual({ source: 'builtin', path: '/static/images/product.webp' })
    expect(saved?.products[0].images).toEqual([
      { source: 'legacy', url: 'https://cdn.example.com/gallery.jpg' },
      asset
    ])
    expect(saved?.products[0].skus[0].image).toEqual({ source: 'legacy', url: 'data:image/png;base64,AAAA' })
  })

  it('门店选品独立保存本店零售价和上下架状态', () => {
    expect(writeCatalogState({ schemaVersion: 1, revision: 0, products: [catalogProduct] })).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'U001', listed: true, retailPrice: 52 })).toBe(true)
    expect(readStoreCatalogSelections('F001')).toEqual([
      expect.objectContaining({ storeId: 'F001', productId: 'U001', listed: true, skuRetailPrices: { 'U001-500': 52 } })
    ])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'U001', listed: false, retailPrice: 52 })).toBe(true)
    expect(readStoreCatalogSelections('F001')[0].listed).toBe(false)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'missing', listed: true, retailPrice: 52 })).toBe(false)
  })

  it('迁移旧门店商品级价格为逐 SKU 价格并用 revision 阻止覆盖', () => {
    const multiSku = { ...catalogProduct, skus: [catalogProduct.skus[0], { ...catalogProduct.skus[0], id: 'U001-1000', name: '1000g', retailPrice: 70 }] }
    expect(writeCatalogState({ schemaVersion: 1, revision: 0, products: [multiSku] })).toBe(true)
    localStorage.setItem(PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, JSON.stringify([{ storeId: 'F001', productId: 'U001', listed: true, retailPrice: 52, updatedAt: '2026-08-01T00:00:00.000Z' }]))

    const migrated = readStoreCatalogSelectionState()
    expect(migrated).toMatchObject({ revision: 0, selections: [{ productId: 'U001', skuRetailPrices: { 'U001-500': 52, 'U001-1000': 77 } }] })
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'U001', listed: true, skuRetailPrices: { 'U001-500': 55, 'U001-1000': 82 } }, 0)?.revision).toBe(1)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'U001', listed: false, skuRetailPrices: { 'U001-500': 56, 'U001-1000': 83 } }, 0)).toBeNull()
  })

  it('退役 SKU 不进入销售投影但仍可通过幂等操作释放库存', () => {
    const retired = { ...catalogProduct, skus: [{ ...catalogProduct.skus[0], status: 'retired' as const }] }
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [retired], appliedOperations: {} })).toBe(true)
    expect(catalogProductToProduct(readCatalogState()!.products[0]).skus).toHaveLength(0)

    const released = applyCatalogStockOperation('ORDER-1:release', [{ productId: 'U001', skuId: 'U001-500', quantity: 2 }], 0)
    expect(released?.state.products[0].skus[0].stock).toBe(10)
    const replayed = applyCatalogStockOperation('ORDER-1:release', [{ productId: 'U001', skuId: 'U001-500', quantity: 2 }], released!.state.revision)
    expect(replayed?.applied).toBe(false)
    expect(replayed?.state.products[0].skus[0].stock).toBe(10)
    expect(applyCatalogStockOperation('ORDER-2:reserve', [{ productId: 'U001', skuId: 'U001-500', quantity: -1 }], released!.state.revision)).toBeNull()
  })

  it('持久化交易日志状态并只返回需要恢复的操作', () => {
    const entry = {
      id: 'ORDER-3:reserve', channel: 'user' as const, action: 'reserve' as const,
      inventoryChanges: [{ productId: 'U001', skuId: 'U001-500', quantity: -1 }],
      payload: { orderId: 'ORDER-3' }
    }
    expect(prepareCatalogTransaction(entry)).toBe(true)
    expect(prepareCatalogTransaction(entry)).toBe(true)
    expect(readPendingCatalogTransactions('user')).toEqual([expect.objectContaining({ id: entry.id, status: 'prepared' })])
    expect(markCatalogTransactionStockApplied(entry.id)).toBe(true)
    expect(readCatalogTransactionJournal()[entry.id]).toMatchObject({ status: 'stock-applied' })
    expect(commitCatalogTransaction(entry.id)).toBe(true)
    expect(readPendingCatalogTransactions('user')).toEqual([])
    expect(readCatalogTransactionJournal()[entry.id]).toMatchObject({ status: 'committed' })
  })

  it('门店订单逐行按商品比例汇总并路由到对应角色', () => {
    const lines = [
      { unitPrice: 100, quantity: 2, promoterCommissionRate: 5, storeCommissionRate: 3 },
      { unitPrice: 49.9, quantity: 1, promoterCommissionRate: 8, storeCommissionRate: 4 }
    ]
    expect(allocateStoreCatalogCommission(lines, { type: 'promoter', beneficiaryId: 'T001' }, 'OWNER')).toEqual({ beneficiaryId: 'T001', beneficiaryType: 'promoter', amount: 13.99 })
    expect(allocateStoreCatalogCommission(lines, { type: 'staff', beneficiaryId: 'STAFF' }, 'OWNER')).toEqual({ beneficiaryId: 'STAFF', beneficiaryType: 'staff', amount: 8 })
    expect(allocateStoreCatalogCommission(lines, null, 'OWNER')).toEqual({ beneficiaryId: 'OWNER', beneficiaryType: 'owner', amount: 8 })
  })

  it('允许零起订量但继续将缺失和非法值兼容为一件', () => {
    expect(normalizeMinimumOrderQuantity(0)).toBe(0)
    expect(normalizeMinimumOrderQuantity(3)).toBe(3)
    expect(normalizeMinimumOrderQuantity(undefined)).toBe(1)
    expect(normalizeMinimumOrderQuantity(-1)).toBe(1)
  })

  it('零起订量只要求首件数量不超过库存', () => {
    expect(validateCatalogSkuOrderQuantity({ stock: 1, minimumOrderQuantity: 0 }, 1)).toMatchObject({ ok: true, minimumOrderQuantity: 0 })
    expect(validateCatalogSkuOrderQuantity({ stock: 0, minimumOrderQuantity: 0 }, 1)).toMatchObject({ ok: false, code: 'insufficient_stock' })
  })
})
