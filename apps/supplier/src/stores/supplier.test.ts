import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { COrder, CatalogProduct } from '@agritainment/shared'
import { buildSupplierAccountSeeds, publishCSubOrderToSupplier, readCOrders, readPlatformDrivers, readPlatformJournal, readPlatformOrders, suppliers, todayString, upsertPlatformEntity, writeCOrders, writePlatformDrivers, writePlatformOrder, writePlatformSupplierAccounts } from '@agritainment/shared'
import { buildNavigationUrl, deliveryDistanceKm, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../services/repository'
import { useSupplierStore } from './supplier'
import * as shared from '@agritainment/shared'

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

describe('supplier store interactions', () => {
  beforeEach(async () => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals(); shared.configurePlatformProviders() })
  afterEach(() => { vi.unstubAllGlobals(); shared.configurePlatformProviders() })

  function seedSupplierCatalog(id = 'CAT-SUPPLIER-FORMAL') {
    const product: CatalogProduct = {
      id, name: '供应商正式商品', category: '土特产', supplierId: 'S002', supplierName: '湘西腊味合作社',
      source: 'platform', status: 'active', image: '/static/images/bacon.webp', images: [], tags: ['线上'], productType: 'goods', expressDelivery: true,
      channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: `${id}-SKU`, name: '标准装', image: '/static/images/bacon.webp', retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }]
    }
    expect(shared.writeCatalogState({ schemaVersion: shared.CATALOG_SCHEMA_VERSION, revision: 0, products: [product] })).toBe(true)
    return product
  }

  function seedLinkedCMallOrder(suffix: string) {
    const item = { productId: `P-${suffix}`, skuId: `SKU-${suffix}`, name: '联调商品', skuName: '标准装', image: '/static/images/field.webp', quantity: 1, unitPrice: 100, basePrice: 75, level1Commission: 10, level2Commission: 15, supplierId: 'S002' }
    const sub = { id: `CSO-${suffix}`, supplierId: 'S002', supplierName: '湘西腊味合作社', items: [item], amount: 100, status: 'paid' as const, logistics: [] }
    const cOrder: COrder = {
      id: `CO-${suffix}`, userId: `U-${suffix}`, level: 'normal',
      address: { id: `ADDR-${suffix}`, userId: `U-${suffix}`, receiver: '联调用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [item], subOrders: [sub], commissionAllocations: [], status: 'paid', createdAt: '2026-08-29T10:00:00.000Z', paidAt: '2026-08-29T10:01:00.000Z'
    }
    const supplierOrder = publishCSubOrderToSupplier(cOrder, sub)
    expect(writeCOrders({ [cOrder.id]: cOrder })).toBe(true)
    expect(writePlatformOrder(supplierOrder)).toBe(true)
    return supplierOrder
  }

  it('submits a supplier product update without changing the formal catalog', async () => {
    const formal: CatalogProduct = {
      id: 'CAT-SUPPLIER-UPDATE', name: '供应商线上商品', category: '土特产', supplierId: 'S002', supplierName: '湘西腊味合作社',
      source: 'platform', status: 'active', image: '/static/images/bacon.webp', images: [], tags: ['线上'], productType: 'goods', expressDelivery: true,
      channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: 'CAT-SUPPLIER-UPDATE-SKU', name: '标准装', image: '/static/images/bacon.webp', retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }]
    }
    expect(shared.writeCatalogState({ schemaVersion: shared.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const before = shared.cloneSeed(shared.readCatalogState()!)
    const draft: CatalogProduct = { ...shared.cloneSeed(formal), name: `${formal.name} 待审核修改` }

    const result = await (store as unknown as { submitCatalogProduct?: (product: CatalogProduct) => Promise<unknown> }).submitCatalogProduct?.(draft)

    expect(shared.readCatalogState()).toEqual(before)
    expect(result).toMatchObject({ ok: true })
    expect(shared.readCatalogProductSubmissions()).toEqual([
      expect.objectContaining({ source: 'supplier', supplierId: store.auth.supplierId, kind: 'update', status: 'pending', productId: formal.id, draft: expect.objectContaining({ name: draft.name }) })
    ])
  })

  it('loads owned catalog products and submissions and creates a supplier submission', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-BASE-CREATE')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const template = shared.cloneSeed(seeded)
    const draft: CatalogProduct = {
      ...template, id: 'CAT-SUPPLIER-CREATE', name: '供应商新商品', status: 'active',
      skus: template.skus.map((sku, index) => ({ ...sku, id: `CAT-SUPPLIER-CREATE-SKU-${index + 1}`, minimumOrderQuantity: 3 }))
    }

    expect(await store.submitCatalogProduct(draft)).toMatchObject({ ok: true, value: expect.objectContaining({ kind: 'create', status: 'pending' }) })
    await store.refreshSharedState()

    expect((store as unknown as { catalogProducts: CatalogProduct[] }).catalogProducts.some((item) => item.id === draft.id)).toBe(false)
    expect((store as unknown as { productSubmissions: Array<{ productId: string; status: string }> }).productSubmissions).toContainEqual(expect.objectContaining({ productId: draft.id, status: 'pending' }))
  })

  it('rejects cross-supplier and paused supplier product submissions', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-BASE-BOUNDARY')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const template = shared.cloneSeed(seeded)
    const crossSupplier = { ...template, id: 'CAT-CROSS-SUPPLIER', supplierId: 'S-OTHER' }

    expect(await store.submitCatalogProduct(crossSupplier)).toMatchObject({ ok: false, code: 'supplier_mismatch' })

    const current = store.suppliers.find((item) => item.id === store.auth.supplierId)!
    current.status = 'paused'
    expect(await store.submitCatalogProduct({ ...template, id: 'CAT-PAUSED-SUPPLIER', supplierId: store.auth.supplierId })).toMatchObject({ ok: false, code: 'supplier_inactive' })
  })

  it('allows a rejected product to be corrected and resubmitted with a new submission id', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-BASE-RESUBMIT')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const template = shared.cloneSeed(seeded)
    const draft = { ...template, id: 'CAT-SUPPLIER-RESUBMIT', skus: template.skus.map((sku) => ({ ...sku, id: `RESUBMIT-${sku.id}` })) }
    const first = await store.submitCatalogProduct(draft)
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) throw new Error(first.message)
    const state = shared.readCatalogProductSubmissionState()!
    expect(await shared.rejectCatalogProductSubmission({
      submissionId: first.value!.id, reviewedBy: 'ADMIN-1', reviewedAt: new Date(Date.parse(state.updatedAt) + 1).toISOString(), note: '请补充资料', expectedSubmissionRevision: state.revision
    })).toMatchObject({ ok: true })

    const second = await store.submitCatalogProduct({ ...draft, name: '补充资料后的商品' })

    expect(second).toMatchObject({ ok: true })
    if (!second.ok) throw new Error(second.message)
    expect(second.value?.id).not.toBe(first.value?.id)
    expect(shared.readCatalogProductSubmissions()).toContainEqual(expect.objectContaining({ id: first.value?.id, status: 'rejected', reviewNote: '请补充资料' }))
    expect(shared.readCatalogProductSubmissions()).toContainEqual(expect.objectContaining({ id: second.value?.id, status: 'pending', draft: expect.objectContaining({ name: '补充资料后的商品' }) }))
  })

  it('adjusts only owned formal SKU stock with catalog CAS and rejects profile-field smuggling', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-STOCK')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const formal = shared.cloneSeed(seeded)
    const adjust = (store as unknown as { adjustCatalogProductStock: (productId: string, changes: unknown[]) => Promise<unknown> }).adjustCatalogProductStock.bind(store)
    const beforeName = formal.name
    const targetStock = formal.skus[0].stock + 7

    expect(await adjust(formal.id, [{ skuId: formal.skus[0].id, stock: targetStock, name: '偷改名称' }])).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(shared.readCatalogState()!.products.find((item) => item.id === formal.id)).toMatchObject({ name: beforeName, skus: [expect.objectContaining({ stock: formal.skus[0].stock })] })

    expect(await adjust(formal.id, [{ skuId: formal.skus[0].id, stock: targetStock }])).toMatchObject({ ok: true })
    expect(shared.readCatalogState()!.products.find((item) => item.id === formal.id)).toMatchObject({ name: beforeName, skus: [expect.objectContaining({ stock: targetStock })] })
    expect(shared.readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'product.stock.adjust', actorRole: 'supplier', result: 'success' }))
  })

  it('rejects a stock adjustment when the catalog changes while waiting for its lock', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-STOCK-CONCURRENT')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const concurrent = shared.cloneSeed(shared.readCatalogState()!)
    concurrent.revision += 1
    concurrent.products[0].name = '并发更新后的商品'
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (!injected && name === `agritainment-platform:${shared.PLATFORM_CATALOG_STORAGE_KEY}`) {
        injected = true
        expect(shared.writeCatalogState(concurrent, concurrent.revision - 1)).toBe(true)
      }
      return callback()
    } } })

    const result = await store.adjustCatalogProductStock(seeded.id, [{ skuId: seeded.skus[0].id, stock: seeded.skus[0].stock + 5 }])

    expect(result).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(shared.readCatalogState()).toEqual(concurrent)
  })

  it('toggles only owned active or offline formal products and rejects inactive suppliers', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-STATUS')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const formal = shared.cloneSeed(seeded)
    const toggle = (store as unknown as { toggleCatalogProduct: (productId: string) => Promise<unknown> }).toggleCatalogProduct.bind(store)

    expect(await toggle('SUBMISSION-ONLY-ID')).toMatchObject({ ok: false, code: 'not_found' })
    expect(await toggle(formal.id)).toMatchObject({ ok: true })
    expect(shared.readCatalogState()!.products.find((item) => item.id === formal.id)?.status).not.toBe(formal.status)

    store.suppliers.find((item) => item.id === store.auth.supplierId)!.status = 'paused'
    expect(await toggle(formal.id)).toMatchObject({ ok: false, code: 'supplier_inactive' })
  })

  it('rejects a product status toggle when audit changes while waiting for its lock', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-STATUS-CONCURRENT')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const catalogBefore = shared.cloneSeed(shared.readCatalogState()!)
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (!injected && name === `agritainment-platform:${shared.PLATFORM_AUDIT_LOG_STORAGE_KEY}`) {
        injected = true
        expect(shared.appendPlatformAuditLog({ module: 'products', action: 'concurrent.audit', actorId: 'SYSTEM', result: 'success' })).toBe(true)
      }
      return callback()
    } } })

    const result = await store.toggleCatalogProduct(seeded.id)

    expect(result).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(shared.readCatalogState()).toEqual(catalogBefore)
    expect(shared.readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'concurrent.audit' }))
  })

  it('aborts a product submission cleanly when its audit write fails before changing audit state', async () => {
    const seeded = seedSupplierCatalog('CAT-SUPPLIER-AUDIT-BASE')
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const draft = { ...seeded, id: 'CAT-SUPPLIER-AUDIT-ROLLBACK', skus: seeded.skus.map((sku) => ({ ...sku, id: `AUDIT-${sku.id}` })) }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = (key, value) => {
      if (key === shared.PLATFORM_AUDIT_LOG_STORAGE_KEY) throw new Error('force submission audit failure')
      originalSetItem(key, value)
    }
    let result: Awaited<ReturnType<typeof store.submitCatalogProduct>>
    try {
      result = await store.submitCatalogProduct(draft)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(result!).toMatchObject({ ok: false, code: 'audit_failed', failedStep: 'audit', recoveryQueued: false })

    expect(shared.readCatalogProductSubmissions()).toEqual([])
    const journal = Object.values(readPlatformJournal()).find((item) => item.operationId === result!.operationId)
    expect(journal).toMatchObject({ recoveryHandlerKey: 'catalog-product-review-v1', status: 'aborted' })
    expect(shared.readPlatformRecoveryQueue().some((item) => item.operationId === result!.operationId)).toBe(false)
  })

  it('keeps fulfillment unchanged when a rejected courier Provider call has an uncertain result', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    const before = { platform: shared.cloneSeed(readPlatformOrders()), memory: shared.cloneSeed(store.orders) }
    const createShipment = vi.fn().mockRejectedValue(new Error('network timeout'))
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })

    expect(await store.shipCourier(accepted.id, 'MANUAL-IGNORED')).toBe(false)

    expect(createShipment).toHaveBeenCalledOnce()
    expect(readPlatformOrders()).toEqual(before.platform)
    expect(store.orders).toEqual(before.memory)
  })

  it('keeps fulfillment unchanged when the courier Provider explicitly rejects shipment creation', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    const before = { platform: shared.cloneSeed(readPlatformOrders()), memory: shared.cloneSeed(store.orders) }
    shared.configurePlatformProviders({ logistics: { createShipment: vi.fn().mockResolvedValue({ ok: false, code: 'provider-rejected', message: '物流服务拒绝' }), queryShipment: vi.fn() } })

    expect(await store.shipCourier(accepted.id)).toBe(false)

    expect(store.error).toBe('物流服务拒绝')
    expect(readPlatformOrders()).toEqual(before.platform)
    expect(store.orders).toEqual(before.memory)
  })

  it('rejects courier shipment without a persisted delivery address', async () => {
    expect(writePlatformOrder({
      id: 'COURIER-NO-ADDRESS', productName: '无地址商品', quantity: 1, amount: 10, customer: '未知门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-30T10:00:00.000Z', supplierId: 'S002',
      supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '2026-08-30T10:00:00.000Z' }
    })).toBe(true)
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const createShipment = vi.fn().mockResolvedValue({ ok: true, value: { trackingNo: 'PROVIDER-TRACKING' } })
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })
    const before = shared.cloneSeed(readPlatformOrders()?.['COURIER-NO-ADDRESS'])

    expect(await store.shipCourier('COURIER-NO-ADDRESS', 'MANUAL-IGNORED')).toBe(false)

    expect(createShipment).not.toHaveBeenCalled()
    expect(readPlatformOrders()?.['COURIER-NO-ADDRESS']).toEqual(before)
    expect(store.orders.find((order) => order.id === 'COURIER-NO-ADDRESS')).toEqual(before)
  })

  it('creates a farmhouse courier shipment from the immutable recipient snapshot', async () => {
    expect(writePlatformOrder({
      id: 'FARMHOUSE-COURIER-ADDRESS', productName: '农家腊味', quantity: 1, amount: 88, customer: '石板溪农家乐', channel: 'purchase', status: 'shipping', createdAt: '2026-08-30T10:00:00.000Z', supplierId: 'S002', storeId: 'F001', storeName: '石板溪农家乐',
      supplierOrderLink: {
        source: 'farmhouse-courier', sourceOrderId: 'FH-SO-ADDRESS', customerUserId: 'U-FARMHOUSE-RECIPIENT',
        deliveryAddress: { id: 'FH-SO-ADDRESS-ADDR', userId: 'U-FARMHOUSE-RECIPIENT', receiver: '周女士', phone: '13900000009', region: '湖南省 湘西州 永顺县', detail: '石板溪村 18 号', isDefault: false }
      },
      supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '2026-08-30T10:00:00.000Z' }
    })).toBe(true)
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const createShipment = vi.fn().mockResolvedValue({ ok: true, value: { trackingNo: 'SF-FARMHOUSE-001' } })
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })

    expect(await store.shipCourier('FARMHOUSE-COURIER-ADDRESS')).toBe(true)
    expect(createShipment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'FARMHOUSE-COURIER-ADDRESS',
      address: '湖南省 湘西州 永顺县 石板溪村 18 号'
    }))
  })

  it('does not fall back to the farmhouse store address when a courier snapshot is missing', async () => {
    expect(writePlatformOrder({
      id: 'FARMHOUSE-COURIER-NO-SNAPSHOT', productName: '缺少快照商品', quantity: 1, amount: 66, customer: '石板溪农家乐', channel: 'purchase', status: 'shipping', createdAt: '2026-08-30T10:00:00.000Z', supplierId: 'S002', storeId: 'F001', storeName: '石板溪农家乐',
      supplierOrderLink: { source: 'farmhouse-courier', sourceOrderId: 'FH-SO-NO-SNAPSHOT', customerUserId: 'U-NO-SNAPSHOT' },
      supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '2026-08-30T10:00:00.000Z' }
    })).toBe(true)
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const createShipment = vi.fn().mockResolvedValue({ ok: true, value: { trackingNo: 'SHOULD-NOT-CREATE' } })
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })

    expect(await store.shipCourier('FARMHOUSE-COURIER-NO-SNAPSHOT')).toBe(false)
    expect(createShipment).not.toHaveBeenCalled()
  })

  it('rejects a fulfillment revision changed after lock acquisition without committing Pinia', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    const beforeMemory = shared.cloneSeed(store.orders)
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writePlatformOrder({ ...submitted, productName: '锁内外部更新' })).toBe(true)
      }
      return callback()
    } } })

    expect(await store.acceptOrder(submitted.id)).toBe(false)

    expect(readPlatformOrders()?.[submitted.id]?.productName).toBe('锁内外部更新')
    expect(store.orders).toEqual(beforeMemory)
  })

  it('rejects a driver assignment when the persisted driver is removed after lock acquisition', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    const beforeOrder = shared.cloneSeed(readPlatformOrders()?.[accepted.id])
    const beforeMemory = shared.cloneSeed(store.orders)
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writePlatformDrivers((readPlatformDrivers() || []).filter((driver) => driver.id !== 'D001'))).toBe(true)
      }
      return callback()
    } } })

    expect(await store.assignDriver(accepted.id, 'D001')).toBe(false)

    expect(readPlatformDrivers()?.some((driver) => driver.id === 'D001')).toBe(false)
    expect(readPlatformOrders()?.[accepted.id]).toEqual(beforeOrder)
    expect(store.orders).toEqual(beforeMemory)
  })

  it('does not backfill a missing driver deliverDate during initialize', async () => {
    const store = useSupplierStore()
    await store.initialize()
    const legacy = store.orders.find((order) => order.supplierFulfillment?.shipType === 'driver' && ['shipped', 'delivering'].includes(order.supplierFulfillment.status))!
    const persisted = shared.cloneSeed(legacy)
    delete persisted.supplierFulfillment!.deliverDate
    expect(writePlatformOrder(persisted)).toBe(true)
    const revisionBefore = shared.readPlatformCollectionRevision(shared.PLATFORM_ORDERS_STORAGE_KEY)

    await store.initialize(true)

    expect(readPlatformOrders()?.[legacy.id]?.supplierFulfillment?.deliverDate).toBeUndefined()
    expect(shared.readPlatformCollectionRevision(shared.PLATFORM_ORDERS_STORAGE_KEY)).toBe(revisionBefore)
  })

  it('provides warehouse and store coordinates plus navigation URLs', () => {
    expect(supplierInfo).toMatchObject({ longitude: expect.any(Number), latitude: expect.any(Number) })
    const store = storeInfoOf('石板溪农家乐·门店')
    expect(store).toMatchObject({ longitude: expect.any(Number), latitude: expect.any(Number) })
    expect(deliveryDistanceKm(supplierInfo, store)).toBe(0)
    const navigation = new URL(buildNavigationUrl('石板溪农家乐·门店', store))
    expect(`${navigation.origin}${navigation.pathname}`).toBe('https://apis.map.qq.com/uri/v1/routeplan')
    expect(Object.fromEntries(navigation.searchParams)).toMatchObject({ type: 'drive', to: '石板溪农家乐·门店', tocoord: `${store.latitude},${store.longitude}`, referer: 'agritainment-supplier' })
    const search = new URL(buildNavigationUrl('未知门店', { address: '湖南省湘西州测试路', contact: '', phone: '' }))
    expect(`${search.origin}${search.pathname}`).toBe('https://apis.map.qq.com/uri/v1/search')
    expect(Object.fromEntries(search.searchParams)).toMatchObject({ keyword: '湖南省湘西州测试路', referer: 'agritainment-supplier' })
    expect(supplierWarehouseOf('S002')).toMatchObject({ longitude: supplierInfo.longitude, latitude: supplierInfo.latitude })
    expect(supplierWarehouseOf('S004')).toBeUndefined()
  })

  it('sorts a driver\'s today tasks by warehouse distance then creation time, with unknown coordinates last', async () => {
    const store = useSupplierStore()
    await store.initialize()
    const createdAt = `${todayString()} 10:00`
    const makeOrder = (id: string, customer: string, at: string) => writePlatformOrder({
      id, productName: '测试商品', quantity: 1, amount: 10, customer, channel: 'purchase', status: 'shipping', createdAt: at, supplierId: 'S002',
      supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: todayString(), shortages: [], handovers: [], updatedAt: at }
    })
    makeOrder('DIST-FAR', '云上人家·门店', `${createdAt}:02`)
    makeOrder('DIST-NEAR-LATE', '石板溪农家乐·门店', `${createdAt}:03`)
    makeOrder('DIST-NEAR-EARLY', '石板溪农家乐·门店', `${createdAt}:01`)
    makeOrder('DIST-UNKNOWN', '未知门店', `${createdAt}:00`)
    await store.refreshSharedState()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    const ids = store.myTasks.map((order) => order.id)
    expect(ids.indexOf('DIST-NEAR-EARLY')).toBeLessThan(ids.indexOf('DIST-NEAR-LATE'))
    expect(ids.indexOf('DIST-NEAR-LATE')).toBeLessThan(ids.indexOf('DIST-FAR'))
    expect(ids[ids.length - 1]).toBe('DIST-UNKNOWN')
  })

  it('logs suppliers in by phone and exposes the linked supplier profile', async () => {
    const store = useSupplierStore()
    await store.initialize()

    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(store.currentSupplier).toMatchObject({ id: 'S002', name: '湘西腊味合作社', region: '湘西州' })
    store.logout()
    expect(store.loginSupplier('supplier', '123456')).toBe(false)
  })

  it('does not expose login accounts for suppliers that are not certified', async () => {
    const store = useSupplierStore()
    await store.initialize()

    expect(store.loginSupplier('13973015588', '13973015588')).toBe(false)
    expect(store.loginError).toBe('账号或密码错误')
  })

  it('invalidates an active supplier session when its credentials change', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    const accounts = buildSupplierAccountSeeds(suppliers)
    writePlatformSupplierAccounts(accounts.map((item) => item.supplierId === 'S002' ? { ...item, account: '13900008881', updatedAt: '2026-08-24T12:00:00.000Z' } : item))
    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(false)
  })

  it('keeps a paused supplier session for existing fulfillment but blocks new drivers', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'paused' })
    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(true)
    expect(await store.addDriver({ name: '暂停期间司机', phone: '13900007771', account: 'paused-driver', password: '123456' })).toEqual({ ok: false, error: '供应商已暂停合作，不能新增司机' })
  })

  it('invalidates supplier and driver sessions when the supplier account is frozen', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    const accounts = buildSupplierAccountSeeds(suppliers).map((item) => item.supplierId === 'S002' ? { ...item, enabled: false } : item)
    expect(writePlatformSupplierAccounts(accounts)).toBe(true)
    await store.refreshSharedState()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.loginDriver('driver01', '123456')).toBe(false)
    expect(store.loginError).toBe('所属供应商账号已冻结，请联系平台管理员')

    expect(writePlatformSupplierAccounts(accounts.map((item) => item.supplierId === 'S002' ? { ...item, enabled: true } : item))).toBe(true)
    await store.refreshSharedState()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(writePlatformSupplierAccounts(accounts)).toBe(true)
    await store.refreshSharedState()
    expect(store.auth.isLoggedIn).toBe(false)
  })

  it('refreshes the active supplier name from the latest supplier profile', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], name: '更新后的供应商名称' })
    await store.refreshSharedState()

    expect(store.auth.name).toBe('更新后的供应商名称')
  })

  it('loads C-mall fulfillment orders and isolates them by supplier account', async () => {
    writePlatformOrder({ id: 'C-MALL-CSO-A', productName: '腊肉', quantity: 1, amount: 45, customer: '甲 · C端商城', channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S002', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-A', sourceSubOrderId: 'CSO-A', customerUserId: 'U-A' } })
    writePlatformOrder({ id: 'C-MALL-CSO-B', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城', channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-B', sourceSubOrderId: 'CSO-B', customerUserId: 'U-B' } })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.orders.some((item) => item.id === 'C-MALL-CSO-A')).toBe(true)
    expect(store.orders.some((item) => item.id === 'C-MALL-CSO-B')).toBe(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(store.supplierOrders.every((item) => item.supplierId === 'S002')).toBe(true)
    expect(store.supplierOrderCounts['全部']).toBe(store.supplierOrders.length)
    expect(store.supplierOrderCounts.submitted).toBe(store.supplierOrders.filter((item) => item.supplierFulfillment?.status === 'submitted').length)
    expect(store.loginSupplier('13574902233', '13574902233')).toBe(true)
    expect(store.supplierOrders).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'C-MALL-CSO-B', supplierId: 'S004' })]))
    expect(store.supplierOrders.some((item) => item.supplierId === 'S002')).toBe(false)
    expect(store.supplierOrderCounts['全部']).toBe(store.supplierOrders.length)
  })

  it('allows only the owning supplier role to operate and locks after-sale orders', async () => {
    writePlatformOrder({ id: 'C-MALL-GUARD', productName: '腊肉', quantity: 1, amount: 45, customer: '甲 · C端商城', channel: 'purchase', status: 'after-sale', createdAt: new Date().toISOString(), supplierId: 'S002', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-GUARD', sourceSubOrderId: 'CSO-GUARD', customerUserId: 'U-A' }, supplierFulfillment: { status: 'cancelled', shipType: 'courier', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    const store = useSupplierStore()
    await store.initialize(true)
    const submitted = store.orders.find((order) => order.supplierId === 'S002' && order.supplierFulfillment?.status === 'submitted')!
    expect(await store.acceptOrder(submitted.id)).toBe(false)
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(await store.acceptOrder(submitted.id)).toBe(false)
    store.logout()
    expect(store.loginSupplier('13574902233', '13574902233')).toBe(true)
    expect(await store.acceptOrder(submitted.id)).toBe(false)
    store.logout()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(await store.acceptOrder('C-MALL-GUARD')).toBe(false)
    expect(await store.shipCourier('C-MALL-GUARD', 'SF-GUARD')).toBe(false)
    expect(await store.markCourierDelivered('C-MALL-GUARD')).toBe(false)
  })

  it('isolates visible drivers and task counts by the current supplier', async () => {
    writePlatformDrivers([{
      id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456',
      phone: '13900004004', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'S004-DRIVER-TASK', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城',
      channel: 'purchase', status: 'shipping', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierFulfillment: {
        status: 'shipped', shipType: 'driver', driverId: 'D-S004', driverName: '炎陵司机',
        deliverDate: todayString(), shortages: [], handovers: [], updatedAt: new Date().toISOString()
      }
    })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13574902233', '13574902233')).toBe(true)

    expect(store.visibleDrivers.map((driver) => driver.id)).toEqual(['D-S004'])
    expect(store.activeDrivers.map((driver) => driver.id)).toEqual(['D-S004'])
    expect(store.driverTaskCounts).toEqual({ 'D-S004': 1 })
  })

  it('allows suppliers to manage only their own drivers and assigns new drivers to the current supplier', async () => {
    writePlatformDrivers([{
      id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456',
      phone: '13900004004', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'S004-ASSIGN-GUARD', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城',
      channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() }
    })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13574902233', '13574902233')).toBe(true)

    expect(store.updateDriver('D001', { name: '越权修改' })).toBe(false)
    expect(store.resetDriverPassword('D001', 'newpass')).toBe(false)
    expect(store.toggleDriverStatus('D001')).toBe(false)
    expect(await store.assignDriver('S004-ASSIGN-GUARD', 'D001')).toBe(false)
    expect((await store.addDriver({ name: '新增司机', phone: '13900004005', account: 'driver05', password: '123456' })).ok).toBe(true)

    const persisted = readPlatformDrivers() || []
    expect(persisted.find((driver) => driver.account === 'driver05')?.supplierId).toBe('S004')
    expect(persisted.find((driver) => driver.id === 'D001')?.name).toBe('张伟')

    store.logout()
    expect(store.updateDriver('D-S004', { name: '未登录修改' })).toBe(false)
    expect(store.resetDriverPassword('D-S004', 'another')).toBe(false)
    expect(store.toggleDriverStatus('D-S004')).toBe(false)
    expect((await store.addDriver({ name: '未登录司机', phone: '13900004006', account: 'driver06', password: '123456' })).ok).toBe(false)

    expect(store.loginDriver('driver04', '123456')).toBe(true)
    expect(store.updateDriver('D-S004', { name: '司机越权修改' })).toBe(false)
    expect(store.resetDriverPassword('D-S004', 'driverpass')).toBe(false)
    expect(store.toggleDriverStatus('D-S004')).toBe(false)
    expect((await store.addDriver({ name: '司机新增账号', phone: '13900004008', account: 'driver08', password: '123456' })).ok).toBe(false)
  })

  it('does not disable a driver with unfinished delivery tasks', async () => {
    writePlatformDrivers([{
      id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456',
      phone: '13900004004', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'S004-ACTIVE-TASK', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城',
      channel: 'purchase', status: 'shipping', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D-S004', shortages: [], handovers: [], updatedAt: new Date().toISOString() }
    })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13574902233', '13574902233')).toBe(true)
    expect(store.toggleDriverStatus('D-S004')).toBe(false)
    expect(store.drivers.find((driver) => driver.id === 'D-S004')?.status).toBe('active')
  })

  it('refreshes drivers and orders written by another H5 page', async () => {
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.orders.some((order) => order.id === 'C-MALL-EXTERNAL')).toBe(false)
    expect(store.drivers.some((driver) => driver.id === 'D-EXTERNAL')).toBe(false)

    writePlatformDrivers([...(readPlatformDrivers() || []), {
      id: 'D-EXTERNAL', supplierId: 'S004', name: '外部司机', account: 'external04', password: '123456',
      phone: '13900004007', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'C-MALL-EXTERNAL', productName: '黄桃', quantity: 1, amount: 45, customer: '外部用户 · C端商城',
      channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-EXTERNAL', sourceSubOrderId: 'CSO-EXTERNAL', customerUserId: 'U-EXTERNAL' }
    })

    await store.refreshSharedState()

    expect(store.orders.some((order) => order.id === 'C-MALL-EXTERNAL')).toBe(true)
    expect(store.drivers.some((driver) => driver.id === 'D-EXTERNAL')).toBe(true)
  })

  it('F0: keeps warehouse contacts when the supplier saves the depot', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const saved = await store.updateWarehouse({ address: '湖南省湘西州永顺县石板溪村 1 号', longitude: 110.1, latitude: 28.7, contactName: '王仓管', contactPhone: '13900001234' })
    expect(saved.ok).toBe(true)
    expect(shared.readPlatformEntities()?.suppliers?.S002?.warehouse).toMatchObject({ address: '湖南省湘西州永顺县石板溪村 1 号', contactName: '王仓管', contactPhone: '13900001234' })
    expect(supplierWarehouseOf('S002', store.suppliers)).toMatchObject({ contact: '王仓管', phone: '13900001234' })
    expect(await store.updateWarehouse({ address: '湖南省湘西州永顺县石板溪村 1 号', contactName: '王仓管', contactPhone: '1390000123' })).toMatchObject({ ok: false })
  })

  it('F0-read: scopes orders, handovers, settlements and catalog to the current supplier', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    store.$patch({
      orders: [
        { id: 'SO-R1', supplierId: 'S002', channel: 'purchase', customer: '甲店', productName: '腊肉', quantity: 1, amount: 10, status: 'accepted', createdAt: '2026-10-16T09:00:00.000Z', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [{ id: 'H-R1', orderId: 'SO-R1', time: '2026-10-16T10:00:00.000Z', operatorId: 'D001', operatorName: '张伟', operatorRole: 'driver' }], updatedAt: '2026-10-16T10:00:00.000Z' } },
        { id: 'SO-R2', supplierId: 'S003', channel: 'purchase', customer: '乙店', productName: '茶叶', quantity: 1, amount: 10, status: 'accepted', createdAt: '2026-10-16T09:00:00.000Z', supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: '2026-10-16T10:00:00.000Z' } }
      ] as never,
      settlements: [
        { id: 'ST-R1', period: '2026-10', supplierIds: ['S002'], orderIds: ['SO-R1'], amount: 10, createdAt: '2026-10-16T09:00:00.000Z', items: [] },
        { id: 'ST-R2', period: '2026-10', supplierIds: ['S003'], orderIds: ['SO-R2'], amount: 10, createdAt: '2026-10-17T09:00:00.000Z', items: [] }
      ] as never,
      catalogProducts: [
        { id: 'CP-R1', supplierId: 'S002', skus: [] },
        { id: 'CP-R2', supplierId: 'S003', skus: [] }
      ] as never,
      productSubmissions: [
        { id: 'SUB-R1', supplierId: 'S002' },
        { id: 'SUB-R2', supplierId: 'S003' }
      ] as never
    })

    expect(store.statusText('accepted')).toBe('待发货')
    expect(store.statusText('unknown-status')).toBe('unknown-status')
    expect(store.allHandovers.map((item) => item.id)).toEqual(['H-R1'])
    expect(store.allHandovers[0]).toMatchObject({ customer: '甲店' })
    expect(store.mySettlements.map((item) => item.id)).toEqual(['ST-R1'])
    expect(store.myCatalogProducts.map((item) => item.id)).toEqual(['CP-R1'])
    expect(store.myProductSubmissions.map((item) => item.id)).toEqual(['SUB-R1'])
    expect(store.todayDeliveryOrders.every((order) => order.supplierId === 'S002' && order.channel === 'purchase')).toBe(true)
  })

  it('F0-deny: rejects route actions across roles and unknown routes', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(await store.checkInWarehouse('ROUTE-MISSING', { longitude: 110, latitude: 28 })).toMatchObject({ ok: false, code: 'permission_denied' })
    expect(await store.markRouteShortages('ROUTE-MISSING', [])).toMatchObject({ ok: false, code: 'permission_denied' })
    expect(await store.reorderRouteStops('ROUTE-MISSING', [])).toMatchObject({ ok: false, code: 'permission_denied' })
    expect(await store.dispatchRoute('ROUTE-MISSING')).toMatchObject({ ok: false, code: 'permission_denied' })

    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(await store.reviewRouteOutbound('ROUTE-MISSING', { decision: 'confirm' })).toMatchObject({ ok: false, code: 'permission_denied' })
    expect(await store.checkInWarehouse('ROUTE-MISSING', { longitude: 110, latitude: 28 })).toMatchObject({ ok: false, code: 'no_route' })
    expect(await store.reorderRouteStops('ROUTE-MISSING', [])).toMatchObject({ ok: false, code: 'no_route' })
  })

  it('F0-route: saves, updates and rejects conflicting named delivery routes', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)

    // 演示目录只有 F001~F003 三个门店，先释放西线占用的 F003 再验证新建路径
    expect(await store.saveNamedRoute({ id: 'NR-S002-WEST', name: '西线', storeIds: [], driverId: 'D002' })).toMatchObject({ ok: true })
    const created = await store.saveNamedRoute({ name: '联调线路', storeIds: ['F003'], driverId: 'D001' })
    expect(created).toMatchObject({ ok: true })
    const route = store.namedRoutes.find((item) => item.name === '联调线路')!
    expect(route.storeIds).toEqual(['F003'])

    expect(await store.saveNamedRoute({ id: route.id, name: '联调线路（改）', storeIds: ['F003'], driverId: 'D002' })).toMatchObject({ ok: true })
    expect(store.namedRoutes.find((item) => item.id === route.id)).toMatchObject({ name: '联调线路（改）', driverId: 'D002' })

    expect(await store.saveNamedRoute({ name: '冲突线路', storeIds: ['F001'] })).toMatchObject({ ok: false, code: 'route_store_conflict' })
    expect(await store.saveNamedRoute({ name: '   ', storeIds: ['F003'] })).toMatchObject({ ok: false, code: 'invalid_route' })
    expect(await store.saveNamedRoute({ name: '无效司机线路', storeIds: ['F003'], driverId: 'D-MISSING' })).toMatchObject({ ok: false, code: 'invalid_driver' })
  })

  it('F1: logs in as supplier and active driver, rejects disabled driver and wrong password', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(store.auth.role).toBe('supplier')
    store.logout()
    expect(store.loginSupplier('13787366688', 'bad')).toBe(false)
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.auth.role).toBe('driver')
    store.logout()
    expect(store.loginDriver('driver01', 'bad')).toBe(false)
    expect(store.loginDriver('no-such', '123456')).toBe(false)
    store.loginSupplier('13787366688', '13787366688')
    expect(store.toggleDriverStatus('D002')).toBe(false)
    store.logout()
    expect(store.loginDriver('driver02', '123456')).toBe(true)
  })

  it('F2: accepts, assigns driver, hands over with shortage, driver sees task and completes', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    expect(await store.acceptOrder(submitted.id)).toBe(true)
    const accepted = store.orders.find((order) => order.id === submitted.id)!
    expect(accepted.supplierFulfillment?.status).toBe('accepted')
    expect(await store.assignDriver(accepted.id, 'D001')).toBe(true)
    const shipped = store.orders.find((order) => order.id === submitted.id)!
    expect(shipped.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟' })
    const actuals: Record<string, number> = {}
    shipped.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
    actuals[shipped.items![0].skuId] = Math.max(0, shipped.items![0].quantity - 1)
    const result = await store.handoverOut(shipped.id, actuals)
    expect(result.ok).toBe(true)
    expect(result.shortages.length).toBeGreaterThan(0)
    const delivering = store.orders.find((order) => order.id === submitted.id)!
    expect(delivering.supplierFulfillment?.status).toBe('delivering')
    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === submitted.id)).toBe(true)
    const destination = store.currentDriverRoute?.stops.find((stop) => stop.orderIds.includes(submitted.id))
    if (destination?.latitude !== undefined && destination.longitude !== undefined) {
      expect(await store.checkInStop(destination.storeId, { latitude: destination.latitude, longitude: destination.longitude })).toMatchObject({ ok: true })
    }
    expect(await store.handoverIn(submitted.id)).toBe(true)
    const received = store.orders.find((order) => order.id === submitted.id)!
    expect(received.supplierFulfillment?.status).toBe('received')
    expect(received.status).toBe('delivered')
    expect(store.myTasks.some((order) => order.id === submitted.id)).toBe(false)
    const persisted = readPlatformOrders()?.[submitted.id]
    expect(persisted?.status).toBe('delivered')
    expect(persisted?.supplierFulfillment?.handovers).toHaveLength(2)
  })

  it('F3: courier flow ships directly and confirms delivery', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    const createShipment = vi.fn().mockResolvedValue({ ok: true, value: { trackingNo: 'PROVIDER-SF-TEST-01' } })
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })
    expect(await store.shipCourier(accepted.id, 'MANUAL-IGNORED')).toBe(true)
    const shipped = store.orders.find((order) => order.id === accepted.id)!
    expect(shipped.supplierFulfillment).toMatchObject({ shipType: 'courier', trackingNo: 'PROVIDER-SF-TEST-01' })
    const operationId = `supplier-fulfillment:${accepted.id}:ship-courier`
    expect(createShipment).toHaveBeenCalledWith(expect.objectContaining({ orderId: accepted.id, operationId }))
    expect(readPlatformJournal()[operationId]).toMatchObject({ operationId, status: 'committed' })
    expect(readPlatformOrders()?.[accepted.id]?.supplierFulfillment?.trackingNo).toBe('PROVIDER-SF-TEST-01')
    const out = await store.handoverOut(shipped.id, {})
    expect(out.ok).toBe(true)
    expect(await store.markCourierDelivered(accepted.id)).toBe(true)
    expect(store.orders.find((order) => order.id === accepted.id)?.supplierFulfillment?.status).toBe('received')
  })

  it('reuses one courier operation after a local revision conflict and persists the same Provider tracking number', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    const shipments = new Map<string, string>()
    let creations = 0
    const operationIds: string[] = []
    const createShipment = vi.fn(async (input: { operationId?: string }) => {
      const operationId = input.operationId || ''
      operationIds.push(operationId)
      if (!shipments.has(operationId)) {
        creations += 1
        shipments.set(operationId, `IDEMPOTENT-TRACKING-${creations}`)
      }
      return { ok: true as const, value: { trackingNo: shipments.get(operationId)! } }
    })
    shared.configurePlatformProviders({ logistics: { createShipment, queryShipment: vi.fn() } })
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(shared.writePlatformOrders(shared.cloneSeed(readPlatformOrders() || {}))).toBe(true)
      }
      return callback()
    } } })

    expect(await store.shipCourier(accepted.id)).toBe(false)
    await store.initialize(true)
    expect(await store.shipCourier(accepted.id)).toBe(true)

    const operationId = `supplier-fulfillment:${accepted.id}:ship-courier`
    expect(operationIds).toEqual([operationId, operationId])
    expect(creations).toBe(1)
    expect(readPlatformOrders()?.[accepted.id]?.supplierFulfillment?.trackingNo).toBe('IDEMPOTENT-TRACKING-1')
    expect(readPlatformJournal()[operationId]).toMatchObject({ status: 'committed' })
  })

  it('returns failure and keeps order unchanged when handover persistence fails', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    expect(await store.assignDriver(accepted.id, 'D001')).toBe(true)
    const shipped = store.orders.find((order) => order.id === accepted.id)!
    const actuals: Record<string, number> = {}
    shipped.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
    const write = vi.spyOn(shared, 'writePlatformOrders').mockReturnValue(false)
    const result = await store.handoverOut(shipped.id, actuals)
    expect(result.ok).toBe(false)
    expect(store.orders.find((order) => order.id === shipped.id)?.supplierFulfillment?.status).toBe('shipped')
    write.mockRestore()
  })

  it('rejects a stale supplier fulfillment revision before writing either linked order snapshot', async () => {
    const supplierOrder = seedLinkedCMallOrder('STALE')
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const beforeCOrders = shared.cloneSeed(readCOrders())
    const beforeMemory = shared.cloneSeed(store.orders)
    expect(writePlatformOrder({ ...supplierOrder, productName: '外部更新' })).toBe(true)

    expect(await store.acceptOrder(supplierOrder.id)).toBe(false)

    expect(readPlatformOrders()?.[supplierOrder.id]).toMatchObject({ productName: '外部更新', supplierFulfillment: { status: 'submitted' } })
    expect(readCOrders()).toEqual(beforeCOrders)
    expect(store.orders).toEqual(beforeMemory)
  })

  it.each([
    ['missing link ids', (order: ReturnType<typeof seedLinkedCMallOrder>) => ({ ...order, supplierOrderLink: { source: 'c-mall' as const } })],
    ['missing C main order', (order: ReturnType<typeof seedLinkedCMallOrder>) => ({ ...order, supplierOrderLink: { ...order.supplierOrderLink!, sourceOrderId: 'CO-NOT-FOUND' } })],
    ['missing C sub-order', (order: ReturnType<typeof seedLinkedCMallOrder>) => ({ ...order, supplierOrderLink: { ...order.supplierOrderLink!, sourceSubOrderId: 'CSO-NOT-FOUND' } })]
  ])('rejects a declared c-mall link with %s before writing any fulfillment snapshot', async (_label, breakLink) => {
    const seeded = seedLinkedCMallOrder(`BROKEN-${_label}`)
    const broken = breakLink(seeded)
    expect(writePlatformOrder(broken)).toBe(true)
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const before = { platform: shared.cloneSeed(readPlatformOrders()), cOrders: shared.cloneSeed(readCOrders()), memory: shared.cloneSeed(store.orders), journal: shared.cloneSeed(readPlatformJournal()) }

    expect(await store.acceptOrder(broken.id)).toBe(false)

    expect(readPlatformOrders()).toEqual(before.platform)
    expect(readCOrders()).toEqual(before.cOrders)
    expect(store.orders).toEqual(before.memory)
    expect(readPlatformJournal()).toEqual(before.journal)
  })

  it('rolls back the platform and supplier snapshots when the linked C-order write fails', async () => {
    const supplierOrder = seedLinkedCMallOrder('C-WRITE-FAIL')
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const beforePlatform = shared.cloneSeed(readPlatformOrders())
    const beforeCOrders = shared.cloneSeed(readCOrders())
    const beforeMemory = shared.cloneSeed(store.orders)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === 'agritainment-platform-c-orders') {
        failed = true
        throw new Error('C-order write failed')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.acceptOrder(supplierOrder.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readPlatformOrders()).toEqual(beforePlatform)
    expect(readCOrders()).toEqual(beforeCOrders)
    expect(store.orders).toEqual(beforeMemory)
  })

  it('keeps compound supplier recovery pending without a half-written snapshot when its C-order retry write fails', async () => {
    const supplierOrder = seedLinkedCMallOrder('RECOVERY-C-WRITE-FAIL')
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const originalPlatform = shared.cloneSeed(readPlatformOrders() || {})
    const originalCOrders = shared.cloneSeed(readCOrders())
    expect(await store.acceptOrder(supplierOrder.id)).toBe(true)
    const targetPlatform = shared.cloneSeed(readPlatformOrders() || {})
    const targetCOrders = shared.cloneSeed(readCOrders())
    const completedJournal = Object.values(readPlatformJournal()).find((entry) => entry.operationId.startsWith(`supplier-fulfillment:${supplierOrder.id}:`))!
    const operationId = `supplier-fulfillment-retry:${supplierOrder.id}`
    const recoveryJournal = {
      ...completedJournal,
      operationId,
      status: 'recovery-pending' as const,
      completedSteps: ['platform-orders', 'c-orders'],
      original: { platformOrders: originalPlatform, cOrders: originalCOrders },
      target: { platformOrders: targetPlatform, cOrders: targetCOrders }
    }
    expect(shared.writePlatformOrders(targetPlatform)).toBe(true)
    expect(writeCOrders(originalCOrders || {})).toBe(true)
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({ [operationId]: recoveryJournal }))
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{
      id: 'REC-SUPPLIER-C-WRITE-FAIL', operationId, failedStep: 'c-orders', reason: 'test recovery',
      handlerKey: 'supplier-fulfillment-sync-v1', retryCount: 0, createdAt: '2026-08-29T10:00:00.000Z', status: 'pending'
    }]))
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let cOrderWriteFailed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!cOrderWriteFailed && key === 'agritainment-platform-c-orders') {
        cOrderWriteFailed = true
        throw new Error('C-order recovery write failed')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await shared.retryPlatformRecoveryTask('REC-SUPPLIER-C-WRITE-FAIL', 'SUPPLIER-TEST')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readPlatformOrders()).toEqual(targetPlatform)
    expect(readCOrders()).toEqual(originalCOrders)
    expect(shared.readPlatformRecoveryQueue().find((task) => task.id === 'REC-SUPPLIER-C-WRITE-FAIL')).toMatchObject({ status: 'pending', retryCount: 1 })
    expect(await shared.retryPlatformRecoveryTask('REC-SUPPLIER-C-WRITE-FAIL', 'SUPPLIER-TEST')).toMatchObject({ ok: true })
    expect(readPlatformOrders()).toEqual(originalPlatform)
    expect(readCOrders()).toEqual(originalCOrders)
  })

  it('rejects a third-state supplier recovery without writing linked order snapshots', async () => {
    const supplierOrder = seedLinkedCMallOrder('RECOVERY-THIRD-STATE')
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(await store.acceptOrder(supplierOrder.id)).toBe(true)
    const operationId = Object.values(readPlatformJournal()).find((entry) => entry.operationId.startsWith(`supplier-fulfillment:${supplierOrder.id}:`))!.operationId
    expect(writePlatformOrder({ ...supplierOrder, id: 'SUPPLIER-UNRELATED-THIRD-STATE', productName: '外部新增订单' })).toBe(true)
    const thirdStatePlatform = shared.cloneSeed(readPlatformOrders())
    const beforeCOrders = shared.cloneSeed(readCOrders())
    expect(shared.enqueuePlatformRecovery({ operationId, failedStep: 'test-third-state', reason: 'test', handlerKey: 'supplier-fulfillment-sync-v1' })).toBe(true)
    const recovery = shared.readPlatformRecoveryQueue().find((task) => task.operationId === operationId)!
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let businessWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (['agritainment-platform-orders', 'agritainment-platform-c-orders', 'agritainment-platform-drivers'].includes(key)) businessWrites += 1
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await shared.retryPlatformRecoveryTask(recovery.id, 'SUPPLIER-TEST')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(businessWrites).toBe(0)
    expect(readPlatformOrders()).toEqual(thirdStatePlatform)
    expect(readCOrders()).toEqual(beforeCOrders)
    expect(shared.readPlatformRecoveryQueue().find((task) => task.id === recovery.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('surfaces a fatal recovery failure without changing supplier memory', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const order = store.orders.find((item) => item.supplierFulfillment?.status === 'submitted')!
    const beforePlatform = shared.cloneSeed(readPlatformOrders())
    const beforeMemory = shared.cloneSeed(store.orders)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-orders' || key === 'agritainment-platform-recovery-queue') throw new Error('forced recovery failure')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.acceptOrder(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readPlatformOrders()).toEqual(beforePlatform)
    expect(store.orders).toEqual(beforeMemory)
    expect(store.error).toBe('履约事务恢复失败，请联系平台处理')
  })

  it('stores no C-order snapshot for a non-C fulfillment journal', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    const order = store.orders.find((item) => item.supplierFulfillment?.status === 'submitted')!
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-transaction-journal' && ++journalWrites === 2) throw new Error('journal step write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.acceptOrder(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    const journal = Object.values(readPlatformJournal()).find((entry) => entry.operationId.startsWith(`supplier-fulfillment:${order.id}:`))!
    expect(journal.collections).toEqual(['agritainment-platform-orders', 'agritainment-platform-recovery-queue', 'agritainment-platform-transaction-journal'])
    expect(journal.original).toEqual(expect.not.objectContaining({ cOrders: expect.anything() }))
    expect(journal.target).toEqual(expect.not.objectContaining({ cOrders: expect.anything() }))
  })

  it('F5: manages drivers — add, duplicate reject, reset password, reassign visibility', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')
    expect((await store.addDriver({ name: '测试司机', phone: '13900001111', account: 'driver09', password: 'abc123' })).ok).toBe(true)
    expect((await store.addDriver({ name: '重复', phone: '13900002222', account: 'driver09', password: 'abc123' })).error).toBe('账号已存在')
    expect((await store.addDriver({ name: '坏手机', phone: '123', account: 'driver10', password: 'abc123' })).error).toContain('手机号')

    const shipped = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped' && order.supplierFulfillment?.driverId === 'D001')
    if (shipped) {
      expect(await store.reassignDriver(shipped.id, 'D003')).toBe(true)
      expect(store.orders.find((order) => order.id === shipped.id)?.supplierFulfillment?.driverName).toBe('王芳')
      store.logout()
      expect(store.loginDriver('driver03', '123456')).toBe(true)
      expect(store.myTasks.some((order) => order.id === shipped.id)).toBe(true)
      store.logout()
      expect(store.loginDriver('driver01', '123456')).toBe(true)
      expect(store.myTasks.some((order) => order.id === shipped.id)).toBe(false)
    }

    store.logout()
    store.loginSupplier('13787366688', '13787366688')
    expect(store.resetDriverPassword('D001', 'newpass')).toBe(true)
    store.logout()
    expect(store.loginDriver('driver01', 'newpass')).toBe(true)
  })

  it('guards: wrong-state actions return false and batch accept counts', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')
    const submitted = store.orders.filter((order) => order.supplierFulfillment?.status === 'submitted')
    const ids = submitted.map((order) => order.id)
    expect(await store.batchAcceptOrders(ids)).toBe(ids.length)
    expect(await store.acceptOrder(ids[0])).toBe(false)
    const shipped = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped')
    if (shipped) expect(await store.assignDriver(shipped.id, 'D001')).toBe(false)
    const another = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped')
    if (another) {
      const actuals: Record<string, number> = {}
      another.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
      expect((await store.handoverOut(another.id, actuals)).ok).toBe(true)
      expect((await store.handoverOut(another.id, actuals)).ok).toBe(false)
    }
  })

  it('filters myTasks by deliverDate, marks shortage handled, and resets demo data', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.metrics.shortageOrderCount).toBe(2)
    expect(store.todayFarmhouseQuantities).toMatchObject({
      storeCount: 2, itemCount: 45, pendingShipItemCount: 24, shortageItemCount: 4, deliveringItemCount: 52
    })
    store.loginSupplier('13787366688', '13787366688')

    // accept + assign an order -> deliverDate today
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    await store.acceptOrder(submitted.id)
    await store.assignDriver(submitted.id, 'D001')

    // mark the seeded shortage (SO-S007, driver D003) as handled and persist
    const shortOrder = store.orders.find((order) => (order.supplierFulfillment?.shortages.length || 0) > 0)!
    const sku = shortOrder.supplierFulfillment!.shortages[0].skuId
    expect(await store.markShortageHandled(shortOrder.id, sku)).toBe(true)
    expect(readPlatformOrders()?.[shortOrder.id]?.supplierFulfillment?.shortages[0].handled).toBe(true)

    // driver03 sees SO-S007 today (deliverDate = today)
    store.logout()
    expect(store.loginDriver('driver03', '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === shortOrder.id)).toBe(true)

    // a task dated in the past is excluded from today tasks
    store.logout()
    store.loginSupplier('13787366688', '13787366688')
    const assigned = store.orders.find((order) => order.supplierFulfillment?.driverId === 'D001')!
    assigned.supplierFulfillment!.deliverDate = '2000-01-01'
    store.logout()
    store.loginDriver('driver01', '123456')
    expect(store.myTasks.some((order) => order.id === assigned.id)).toBe(false)

    // reset demo data -> shortage unhandled again, 3 drivers
    store.logout()
    store.loginSupplier('13787366688', '13787366688')
    await store.resetDemoData()
    const resetShort = store.orders.find((order) => (order.supplierFulfillment?.shortages.length || 0) > 0)!
    expect(resetShort.supplierFulfillment?.shortages[0].handled).toBeFalsy()
    expect(store.drivers.length).toBe(3)
  })

  it('projects a missing driver deliverDate in memory without persisting it and includes the store on my handovers', async () => {
    const store = useSupplierStore()
    await store.initialize()

    const legacy = store.orders.find((order) => {
      const fulfillment = order.supplierFulfillment
      return fulfillment?.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
    })!
    const persistedLegacy = JSON.parse(JSON.stringify(legacy)) as typeof legacy
    delete persistedLegacy.supplierFulfillment!.deliverDate
    writePlatformOrder(persistedLegacy)

    await store.initialize(true)

    expect(store.orders.find((order) => order.id === legacy.id)?.supplierFulfillment?.deliverDate).toBe(todayString())
    expect(readPlatformOrders()?.[legacy.id]?.supplierFulfillment?.deliverDate).toBeUndefined()
    const legacyDriver = store.drivers.find((driver) => driver.id === legacy.supplierFulfillment?.driverId)!
    expect(store.loginDriver(legacyDriver.account, '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === legacy.id)).toBe(true)

    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    const handoverOrder = store.orders.find((order) => order.supplierFulfillment?.handovers.some((item) => item.operatorId === 'D001'))!
    expect(store.myHandovers.find((item) => item.orderId === handoverOrder.id)).toMatchObject({ customer: handoverOrder.customer })
  })

  it('projects only missing dates for active driver shipments without changing persisted orders', async () => {
    const store = useSupplierStore()
    await store.initialize()
    const source = store.orders.find((order) => order.supplierFulfillment?.shipType === 'driver' && order.supplierFulfillment.status === 'shipped')!
    const clone = (id: string, fulfillment: Partial<NonNullable<typeof source.supplierFulfillment>>) => ({
      ...JSON.parse(JSON.stringify(source)),
      id,
      supplierFulfillment: { ...source.supplierFulfillment, ...fulfillment }
    }) as typeof source

    writePlatformOrder(clone('LEGACY-SHIPPED', { deliverDate: undefined }))
    writePlatformOrder(clone('LEGACY-DELIVERING', { status: 'delivering', deliverDate: undefined }))
    writePlatformOrder(clone('DATED-SHIPPED', { deliverDate: '2000-01-01' }))
    writePlatformOrder(clone('COURIER-SHIPPED', { shipType: 'courier', deliverDate: undefined }))
    writePlatformOrder(clone('RECEIVED-DRIVER', { status: 'received', deliverDate: undefined }))
    const persistedBefore = shared.cloneSeed(readPlatformOrders())
    const revisionBefore = shared.readPlatformCollectionRevision(shared.PLATFORM_ORDERS_STORAGE_KEY)

    await store.initialize(true)

    const projected = Object.fromEntries(store.orders.map((order) => [order.id, order]))
    expect(projected['LEGACY-SHIPPED'].supplierFulfillment?.deliverDate).toBe(todayString())
    expect(projected['LEGACY-DELIVERING'].supplierFulfillment?.deliverDate).toBe(todayString())
    expect(projected['DATED-SHIPPED'].supplierFulfillment?.deliverDate).toBe('2000-01-01')
    expect(projected['COURIER-SHIPPED'].supplierFulfillment?.deliverDate).toBeUndefined()
    expect(projected['RECEIVED-DRIVER'].supplierFulfillment?.deliverDate).toBeUndefined()
    expect(readPlatformOrders()).toEqual(persistedBefore)
    expect(shared.readPlatformCollectionRevision(shared.PLATFORM_ORDERS_STORAGE_KEY)).toBe(revisionBefore)

    await store.initialize(true)

    expect(readPlatformOrders()).toEqual(persistedBefore)
    expect(shared.readPlatformCollectionRevision(shared.PLATFORM_ORDERS_STORAGE_KEY)).toBe(revisionBefore)
  })

  it('seeds incrementally: missing demo orders/drivers merged without overwriting existing data', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('13787366688', '13787366688')

    // progress one order (submitted -> accepted) so it diverges from seed
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    await store.acceptOrder(submitted.id)
    const acceptedId = submitted.id
    expect(readPlatformOrders()?.[acceptedId]?.supplierFulfillment?.status).toBe('accepted')

    // re-seed (simulates next launch): must NOT overwrite the progressed order, and merges missing demo data
    await store.initialize(true)
    store.loginSupplier('13787366688', '13787366688')
    expect(readPlatformOrders()?.[acceptedId]?.supplierFulfillment?.status).toBe('accepted')
    expect(store.orders.length).toBeGreaterThanOrEqual(18)
    expect(store.drivers.length).toBe(3)

    // driver03 王芳: today task SO-S007 + history SO-S016
    store.logout()
    expect(store.loginDriver('driver03', '123456')).toBe(true)
    expect(store.myTasks.some((o) => o.id === 'SO-S007')).toBe(true)
    expect(store.myHistory.some((o) => o.id === 'SO-S016')).toBe(true)

    // driver01 张伟: >=3 today tasks + history SO-S017
    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.myTasks.length).toBeGreaterThanOrEqual(3)
    expect(store.myHistory.some((o) => o.id === 'SO-S017')).toBe(true)
  })

  it('requires a nearby check-in before driver handover', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('13787366688', '13787366688')).toBe(true)
    expect(store.namedRoutes.map((route) => route.name)).toEqual(expect.arrayContaining(['东线', '西线']))
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    expect(await store.acceptOrder(submitted.id)).toBe(true)
    expect(await store.assignDriver(submitted.id, 'D001')).toBe(true)
    const actuals: Record<string, number> = {}
    store.orders.find((order) => order.id === submitted.id)!.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
    expect((await store.handoverOut(submitted.id, actuals)).ok).toBe(true)
    expect((await store.ensureTodayRoutes()).ok).toBe(true)
    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    const stop = store.currentDriverRoute?.stops.find((item) => item.orderIds.includes(submitted.id))
    expect(stop).toBeTruthy()
    expect(await store.handoverIn(submitted.id)).toBe(false)
    expect(store.error).toContain('打卡')
    if (!stop?.latitude || !stop.longitude) return
    expect(await store.checkInStop(stop.storeId, { latitude: stop.latitude + 0.005, longitude: stop.longitude })).toMatchObject({ ok: false, code: 'too_far' })
    expect(await store.checkInStop(stop.storeId, { latitude: stop.latitude, longitude: stop.longitude })).toMatchObject({ ok: true })
    expect(await store.handoverIn(submitted.id)).toBe(true)
  })

})
