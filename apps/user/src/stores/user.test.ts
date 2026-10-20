import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CUserLevel } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_DISTRIBUTORS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, acceptSupplierOrder, catalogProductToProduct, cloneSeed, configurePlatformProviders, demoCDistributorProfiles, enqueuePlatformRecovery, normalizeMediaReference, preparePlatformJournal, readCAddresses, readCatalogTransactionJournal, readCCommissionRecords, readCOrders, readCUserSession, readCatalogState, readPaymentAttempts, readPendingCatalogTransactions, readPlatformCollectionRevision, readPlatformCommissionLedger, readPlatformAfterSales, readPlatformJournal, readPlatformOrders, readPlatformRecoveryQueue, readPlatformVoucherOrders, readPlatformWithdrawals, readStoreCatalogSelectionState, readUserBindings, readUserCommercePurchaseIntents, resolvePlatformJournal, retryPlatformRecoveryTask, saveStoreCatalogSelection, shipSupplierCourier, suppliers, todayString, transitionPlatformWithdrawal, updateCatalogStock, upsertPlatformEntity, upsertUserBinding, writeCAddresses, writeCCommissionRecords, readCDistributorProfiles, writeCDistributorProfiles, writeCOrders, writeCUserSession, writeCatalogState, writePlatformCommissionLedger, writePlatformOrder, writePlatformWithdrawal, writeUserCommercePurchaseIntents } from '@agritainment/shared'
import { readStorePackageProjection } from '../services/repository'
import { migrateUserCommerceData, useUserStore } from './user'

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

describe('C端商城 user store', () => {
  beforeEach(async () => { localStorage.clear(); localStorage.setItem('agritainment-user-demo-orders-disabled', '1'); await migrateUserCommerceData(); setActivePinia(createPinia()) })
  afterEach(() => { configurePlatformProviders(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('coalesces concurrent commerce bootstraps and preserves a write made while waiting for the lock', async () => {
    localStorage.clear()
    expect(writeCCommissionRecords([{ id: 'CC-BOOTSTRAP-LEGACY', orderId: 'CO-BOOTSTRAP', subOrderId: 'CSO-BOOTSTRAP', beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 10, status: 'available', createdAt: '2026-08-30T00:00:00.000Z' }])).toBe(true)
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writePlatformCommissionLedger({ LATER: { id: 'LATER', sourceOrderId: 'CO-LATER', beneficiaryType: 'promoter', beneficiaryId: 'T002', role: 'promoter', amount: 5, status: 'pending', createdAt: '2026-08-30T00:00:01.000Z' } })).toBe(true)
      }
      return callback()
    } } })

    const first = migrateUserCommerceData()
    const second = migrateUserCommerceData()
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(readPlatformCommissionLedger()).toMatchObject({
      'CC-BOOTSTRAP-LEGACY': { amount: 10, beneficiaryId: 'T001' },
      LATER: { amount: 5, beneficiaryId: 'T002' }
    })
  })

  it('waits for the startup commerce bootstrap before initializing store projections', async () => {
    localStorage.clear()
    let releaseLock: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { releaseLock = resolve })
    let gated = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!gated) { gated = true; await gate }
      return callback()
    } } })
    const bootstrap = migrateUserCommerceData()
    const store = allowedStore()
    const initialization = store.initialize()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.initialized).toBe(false)
    releaseLock()
    await bootstrap
    await initialization
    expect(store.initialized).toBe(true)
  })

  it('restarts commerce bootstrap after the latest startup promise rejects', async () => {
    localStorage.clear()
    vi.stubGlobal('navigator', { locks: { request: vi.fn().mockRejectedValue(new Error('lock unavailable')) } })
    await expect(migrateUserCommerceData()).rejects.toThrow('lock unavailable')

    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => callback() } })
    setActivePinia(createPinia())
    const store = allowedStore()
    await store.initialize()

    expect(store.initialized).toBe(true)
    expect(store.error).toBe('')
  })

  it('授权期间保持 loading，初始化完成后才恢复商城展示', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    const authorize = source.slice(source.indexOf('async function authorize()'), source.indexOf('\n}\n\nfunction openProduct'))
    expect(authorize).toContain('loading.value = true')
    expect(authorize).toContain('loading.value = false')
    expect(authorize.indexOf('await store.initialize(true)')).toBeLessThan(authorize.lastIndexOf('loading.value = false'))
  })

  it('renders MOQ states and blocks unavailable cart checkout in the user page', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    expect(source).toContain('minimumOrderQuantity(')
    expect(source).toContain('库存不足或购买数量未达要求')
    expect(source).toContain(':disabled="!canStartOrder(selectedSku)"')
    expect(source).toContain(':class="{ unavailable: line.unavailable }"')
    expect(source).toContain(':disabled="store.cartHasUnavailable"')
  })

  const catalogProduct = (id: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
    id,
    name: `目录商品-${id}`,
    category: '农特产',
    supplierId: 'SUP-CATALOG',
    supplierName: '目录供应商',
    source: 'platform',
    status: 'active',
    image: '/static/images/field.webp',
    images: [],
    tags: ['目录'],
    productType: 'goods',
    expressDelivery: true,
    channel: 'live',
    farmIds: [],
    promoterCommissionRate: 5,
    storeCommissionRate: 3,
    skus: [{ id: `${id}-SKU`, name: '标准装', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15 }],
    ...overrides
  })

  const allowedStore = () => {
    const allowed = useUserStore()
    allowed.applyLaunch({ promoter: 'T002' })
    return allowed
  }

  function shipFromSupplier(store: ReturnType<typeof useUserStore>, orderId: string, subOrderId: string) {
    const key = `C-MALL-${subOrderId}`
    const supplierOrder = readPlatformOrders()?.[key]
    const accepted = supplierOrder ? acceptSupplierOrder(supplierOrder, '供应商演示') : null
    const shipped = accepted ? shipSupplierCourier(accepted, `SF-${subOrderId}`, '供应商演示') : null
    expect(shipped).toBeTruthy()
    writePlatformOrder(shipped!)
    store.refreshFulfillment()
    return store.orders.find((order) => order.id === orderId)!
  }

  it('projects only active live/all express goods from the unified catalog and keeps its revision', async () => {
    expect(writeCatalogState({
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 7,
      products: [
        catalogProduct('LIVE'),
        catalogProduct('ALL', { channel: 'all' }),
        catalogProduct('STORE', { channel: 'store' }),
        catalogProduct('PICKUP', { channel: 'store', expressDelivery: false }),
        catalogProduct('PACKAGE', { channel: 'store', productType: 'package', expressDelivery: false }),
        catalogProduct('OFFLINE', { status: 'offline' })
      ]
    })).toBe(true)
    const store = allowedStore()

    await store.initialize()

    expect(store.cProducts.map((product) => product.id)).toEqual(['LIVE', 'ALL'])
    expect(store.inventoryRevision).toBe(7)
    expect(store.cProducts[0].skus[0]).toMatchObject({ basePrice: 75, level1Commission: 10, level2Commission: 15, stock: 8 })
  })

  it('does not write normalized shared data during initialize', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('INIT-READONLY')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-INIT-READONLY', auth: { isLoggedIn: true, openid: 'openid-init-readonly' } })
    const writes = vi.spyOn(localStorage, 'setItem')

    await store.initialize()

    expect(writes).not.toHaveBeenCalled()
    expect(store.cProducts.map((item) => item.id)).toEqual(['INIT-READONLY'])
  })

  it('reserves stock and releases it through the locked platform transaction only', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [catalogProduct('TX')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TX', auth: { isLoggedIn: true, openid: 'openid-tx' } })
    store.applyLaunch({ promoter: 'T002' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('TX', 'TX-SKU', 2)

    expect(await store.submitOrder()).toBe(true)
    expect(readCatalogState()?.revision).toBe(4)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(6)
    const orderId = store.orders[0].id
    const acquiredLocks: string[] = []
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => { acquiredLocks.push(name); return callback() } } })
    expect(await store.cancelOrder(orderId)).toBe(true)
    expect(readCatalogState()?.revision).toBe(5)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(acquiredLocks).toEqual(expect.arrayContaining([
      `agritainment-platform:${PLATFORM_CATALOG_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_ORDERS_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_COMMISSIONS_STORAGE_KEY}`
    ]))
    expect(readPlatformJournal()[`cancel:${orderId}`]).toMatchObject({ status: 'committed' })
    expect(readCatalogTransactionJournal()[`${orderId}:release`]).toBeUndefined()
  })

  it('exposes distributor profiles from the shared store and rejects invalid cart or address input', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-NEG', auth: { isLoggedIn: true, openid: 'openid-neg' } })
    await store.initialize()
    expect(store.distributorProfiles).toEqual(readCDistributorProfiles() || {})
    expect(writeCDistributorProfiles({ 'U-NEG': { userId: 'U-NEG', promoterId: 'T001', level: 'level1', status: 'active' } })).toBe(true)
    store.distributorTick += 1
    expect(store.distributorProfiles['U-NEG']).toMatchObject({ promoterId: 'T001' })

    expect(store.changeCart('MISSING', 'MISSING-SKU', 1)).toBe(false)
    expect(store.changeCart(store.cProducts[0].id, store.cProducts[0].skus[0].id, 0)).toBe(false)
    expect(store.setDefaultAddress('ADDR-MISSING')).toBe(false)
  })

  it('removes cart lines idempotently and persists the trimmed cart', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [catalogProduct('RM-A'), catalogProduct('RM-B')] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-RM', auth: { isLoggedIn: true, openid: 'openid-rm' } })
    await store.initialize()
    expect(store.addToCart('RM-A', 'RM-A-SKU')).toBe(true)
    expect(store.addToCart('RM-B', 'RM-B-SKU')).toBe(true)

    store.removeFromCart('RM-A', 'RM-A-SKU')
    expect(store.cart.map((line) => line.productId)).toEqual(['RM-B'])
    store.removeFromCart('RM-A', 'RM-A-SKU')
    expect(store.cart.map((line) => line.productId)).toEqual(['RM-B'])
    expect(readCUserSession('U-RM')?.cart.map((line) => line.productId)).toEqual(['RM-B'])
  })

  it('signs in through the WeChat entry point, reuses the mock openid and clears session-bound state', async () => {
    const store = useUserStore()
    store.$patch({
      cart: [{ productId: 'STALE', skuId: 'STALE-SKU', name: '旧商品', skuName: '默认', image: '', quantity: 1, unitPrice: 10, basePrice: 6, level1Commission: 2, level2Commission: 2, supplierId: 'S002' }] as never,
      orders: [{ id: 'STALE-ORDER' }] as never
    })

    const first = await store.wechatLogin()
    expect(store.auth).toEqual({ isLoggedIn: true, openid: first.openid })
    expect(first.userId).toBe(store.userId)
    expect(first.userId).toBeTruthy()
    expect(store.cart).toEqual([])
    expect(store.orders).toEqual([])
    expect(store.addresses).toEqual([])

    const second = await store.wechatLogin()
    expect(second.openid).toBe(first.openid)
    expect(second.userId).toBe(first.userId)
  })

  it('recovers a confirmed payment attempt through the direct recovery entry point', async () => {
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-DIRECT-RECOVER' } })
    const queryPayment = vi.fn().mockResolvedValue({ ok: true, value: { status: 'confirmed', transactionId: 'PAY-DIRECT-RECOVER' } })
    configurePlatformProviders({ payment: { createPayment, queryPayment } })
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-DIRECT-RECOVER', auth: { isLoggedIn: true, openid: 'openid-direct-recover' } })
    store.setAddress({ receiver: '直接恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`

    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_ORDERS_STORAGE_KEY) { failed = true; throw new Error('supplier write failed') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.payOrder(order.id)).toBe(false)
    localStorage.setItem = originalSetItem
    const attempt = readPaymentAttempts()[operationId]
    expect(attempt).toMatchObject({ status: 'confirmed', providerTransactionId: 'PAY-DIRECT-RECOVER' })

    expect(await store.recoverConfirmedPaymentAttempt(attempt!)).toBe(true)
    expect(readCOrders()![order.id]).toMatchObject({ status: 'paid', providerTransactionId: 'PAY-DIRECT-RECOVER' })
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'synchronized' })
    expect(readPlatformRecoveryQueue().filter((task) => task.operationId === `payment-confirmation:${operationId}` && task.status === 'pending')).toEqual([])
  })

  it('uses the SKU MOQ for first add and snapshots it on the order item', async () => {
    const product = catalogProduct('MOQ-FIRST', { skus: [{ id: 'MOQ-FIRST-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [product] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-MOQ-FIRST', auth: { isLoggedIn: true, openid: 'openid-moq-first' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })

    expect(store.addToCart(product.id, product.skus[0].id)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3, unavailable: false })
    expect(store.changeCart(product.id, product.skus[0].id, -1)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 3, unavailable: true })
    expect(store.changeCart(product.id, product.skus[0].id, 1)).toBe(true)
    expect(await store.submitOrder()).toBe(true)
    expect(store.orders[0].items[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3 })
  })

  it('keeps a below-MOQ cart line and rejects checkout after catalog MOQ rises', async () => {
    const product = catalogProduct('MOQ-RAISED', { skus: [{ id: 'MOQ-RAISED-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }] })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [product] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-MOQ-RAISED', auth: { isLoggedIn: true, openid: 'openid-moq-raised' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    expect(store.addToCart(product.id, product.skus[0].id)).toBe(true)
    const latest = cloneSeed(readCatalogState()!)
    latest.revision += 1
    latest.products[0].skus[0].minimumOrderQuantity = 4
    expect(writeCatalogState(latest)).toBe(true)

    expect(await store.submitOrder()).toBe(false)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 4, unavailable: true })
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('rejects first add when stock is below the SKU MOQ', async () => {
    const product = catalogProduct('MOQ-STOCK', { skus: [{ id: 'MOQ-STOCK-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 2, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [product] })).toBe(true)
    const store = allowedStore()
    await store.initialize()

    expect(store.addToCart(product.id, product.skus[0].id)).toBe(false)
    expect(store.cart).toHaveLength(0)
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('keeps Pinia unchanged when a stock revision conflicts before checkout', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [catalogProduct('STALE')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-STALE', auth: { isLoggedIn: true, openid: 'openid-stale' } })
    store.applyLaunch({ promoter: 'T002' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('STALE', 'STALE-SKU')
    const before = cloneSeed(store.$state)
    expect(updateCatalogStock([{ productId: 'STALE', skuId: 'STALE-SKU', quantity: -1 }], 2)).toBeTruthy()

    expect(await store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('库存已更新，请刷新后重试')
    expect(store.$state).toEqual({ ...before, checkoutError: '库存已更新，请刷新后重试' })
  })

  it('rejects checkout when catalog revision changes after lock acquisition', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [catalogProduct('LOCK-CONFLICT')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-LOCK-CONFLICT', auth: { isLoggedIn: true, openid: 'openid-lock-conflict' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('LOCK-CONFLICT', 'LOCK-CONFLICT-SKU')
    const ordersBefore = cloneSeed(readCOrders() || {})
    const cartBefore = cloneSeed(store.cart)
    let advanced = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!advanced) {
        advanced = true
        updateCatalogStock([{ productId: 'LOCK-CONFLICT', skuId: 'LOCK-CONFLICT-SKU', quantity: -1 }], 2)
      }
      return callback()
    } } })

    expect(await store.submitOrder()).toBe(false)
    expect(readCOrders() || {}).toEqual(ordersBefore)
    expect(store.orders).toEqual([])
    expect(store.cart).toEqual(cartBefore)
    expect(store.checkoutError).toBe('库存已更新，请刷新后重试')
  })

  it('restricts unshared new users but lets a formally bound user revisit without replacing the binding', async () => {
    const restricted = useUserStore()
    restricted.applyLaunch({})
    await restricted.initialize()
    expect(restricted.entryRestricted).toBe(true)
    expect(restricted.cProducts).toHaveLength(0)

    upsertUserBinding({ userId: 'U-BOUND', promoterId: 'T003', status: 'bound', boundAt: new Date().toISOString() })
    setActivePinia(createPinia())
    const returning = useUserStore()
    returning.$patch({ userId: 'U-BOUND', auth: { isLoggedIn: true, openid: 'openid-bound' } })
    returning.applyLaunch({ promoter: 'T002' })
    await returning.initialize()
    expect(returning.entryRestricted).toBe(false)
    expect(returning.referralPromoterId).toBe('T003')
    expect(returning.cProducts.length).toBeGreaterThan(0)
  })

  it('lets a logged-in user reopen without query when last promoter is stored', async () => {
    vi.stubGlobal('uni', {
      getStorageSync: (key: string) => key === 'agritainment-user-promoter-id' ? 'T002' : '',
      setStorageSync: () => undefined
    })
    const returning = useUserStore()
    returning.$patch({ userId: 'U-STORED', auth: { isLoggedIn: true, openid: 'openid-stored' } })
    returning.applyLaunch({})
    await returning.initialize()
    expect(returning.entryRestricted).toBe(false)
    expect(returning.promoterId).toBe('T002')
    expect(returning.cProducts.length).toBeGreaterThan(0)
  })

  it('restricts initialize when launch handling did not provide a referral', async () => {
    const unshared = useUserStore()

    await unshared.initialize()

    expect(unshared.entryRestricted).toBe(true)
    expect(unshared.cProducts).toHaveLength(0)
  })

  it('binds a direct level2 promoter without an upstream and allocates only its level2 amount', async () => {
    writeCDistributorProfiles({
      ...demoCDistributorProfiles,
      'U-NO-PARENT': { userId: 'U-NO-PARENT', promoterId: 'T003', level: 'level2', status: 'active' }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-DIRECT', auth: { isLoggedIn: true, openid: 'openid-direct' } })
    store.applyLaunch({ promoter: 'T003' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)

    expect(await store.submitOrder()).toBe(true)
    expect(store.orders[0].commissionAllocations).toEqual([
      expect.objectContaining({ beneficiaryId: 'T003', beneficiaryLevel: 'level2', amount: product.skus[0].level2Commission })
    ])
    expect(readUserBindings()?.['U-DIRECT']).toMatchObject({ promoterId: 'T003', status: 'bound' })
  })

  it('uses formal profile prices and the direct-level2 referral chain for all buyer levels', async () => {
    const identities: Array<{ userId: string; level: CUserLevel; beneficiaries: string[] }> = [
      { userId: 'U-ROLE-NORMAL', level: 'normal', beneficiaries: ['T001', 'T002'] },
      { userId: 'U-DEMO-L2', level: 'level2', beneficiaries: ['T001'] },
      { userId: 'U-DEMO-L1', level: 'level1', beneficiaries: [] }
    ]
    writeCDistributorProfiles(demoCDistributorProfiles)

    for (const identity of identities) {
      setActivePinia(createPinia())
      const store = allowedStore()
      store.$patch({ userId: identity.userId, auth: { isLoggedIn: true, openid: `openid-${identity.level}` } })
      store.applyLaunch({ promoter: 'T002' })
      await store.initialize()
      store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
      const product = store.cProducts[0]
      const expectedPrice = store.priceFor(product.skus[0], identity.level)
      store.addToCart(product.id, product.skus[0].id)
      expect(store.cart[0]).toMatchObject({ unitPrice: expectedPrice, lockedLevel: identity.level })
      expect(await store.submitOrder()).toBe(true)
      expect(store.orders[0].commissionAllocations.map((item) => item.beneficiaryId)).toEqual(identity.beneficiaries)
    }
  })

  it('loads the user projection of the catalog and derives prices from formal profiles', async () => {
    writeCDistributorProfiles(demoCDistributorProfiles)
    const store = allowedStore()
    await store.initialize()
    const product = store.cProducts[0]
    expect(readCatalogState()?.products.some((item) => item.id === product.id)).toBe(true)
    expect(store.priceFor(product.skus[0])).toBe(45)
    store.$patch({ userId: 'U-DEMO-L2' })
    expect(store.priceFor(product.skus[0])).toBe(30)
    store.$patch({ userId: 'U-DEMO-L1' })
    expect(store.priceFor(product.skus[0])).toBe(20)
  })

  it('derives formal prices from the active distributor profile and never persists a role override', async () => {
    writeCDistributorProfiles({
      ...demoCDistributorProfiles,
      'U-FORMAL-L2': { userId: 'U-FORMAL-L2', promoterId: 'T002', parentPromoterId: 'T001', level: 'level2', status: 'active' }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-FORMAL-L2', auth: { isLoggedIn: true, openid: 'openid-formal-l2' } })
    await store.initialize()

    const sku = store.cProducts[0].skus[0]
    expect(store.level).toBe('level2')
    expect(store.priceFor(sku)).toBe(30)
    store.persistSession()
    expect(JSON.stringify(readCUserSession('U-FORMAL-L2'))).not.toContain('roleOverride')
  })

  it('rolls back checkout atomically when order persistence fails and allows retry', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECOVER')] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVER', auth: { isLoggedIn: true, openid: 'openid-recover' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '恢复测试', isDefault: true })
    store.addToCart('RECOVER', 'RECOVER-SKU')
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key.includes('c-orders')) { failed = true; throw new Error('quota') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.submitOrder()).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(readPendingCatalogTransactions('user')).toEqual([])
    expect(readCOrders() || {}).toEqual({})

    expect(await store.submitOrder()).toBe(true)
    expect(store.orders).toHaveLength(1)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
  })

  it('projects store packages from current store selections and hides them after unlisting', async () => {
    const pkg = catalogProduct('PKG-LISTED', { channel: 'store', productType: 'package', expressDelivery: false })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [pkg] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: pkg.id, listed: true, skuRetailPrices: { 'PKG-LISTED-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = allowedStore()
    store.applyLaunch({ promoter: 'T002' })
    await store.initialize()
    expect(readStorePackageProjection().map((item) => item.id)).toEqual([pkg.id])
    const selection = readStoreCatalogSelectionState()
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: pkg.id, listed: false, skuRetailPrices: { 'PKG-LISTED-SKU': 118 } }, selection.revision)).toBeTruthy()
    store.refreshSharedState()
    expect(store.products.filter((item) => item.productType === 'package')).toEqual([])
  })

  it('keeps a valid launch referral before the catalog seed finishes', () => {
    const store = allowedStore()
    store.applyLaunch({ promoter: 'T002' })
    expect(store.referralPromoterId).toBe('T002')
  })

  it('does not let a URL userId replace the authorized identity', () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-A', auth: { isLoggedIn: true, openid: 'openid-a' } })
    store.applyLaunch({ userId: 'U-B', promoter: 'T001' })
    expect(store.userId).toBe('U-A')
  })

  it('checks stock, splits multi-supplier checkout and records price snapshots', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const first = store.cProducts[0]
    const second = store.cProducts.find((item) => item.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id, 2)
    expect(store.cartCount).toBe(3)
    expect(store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })).toBe(true)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(order.subOrders).toHaveLength(2)
    expect(order.items[0].unitPrice).toBe(45)
    expect(order.createdAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10))
    expect(readCOrders()?.[order.id]?.subOrders).toHaveLength(2)
  })

  it('publishes paid C sub-orders to supplier fulfillment and blocks direct user shipping', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    expect(readPlatformOrders()?.[`C-MALL-${sub.id}`]).toMatchObject({ supplierOrderLink: { source: 'c-mall', sourceOrderId: order.id, sourceSubOrderId: sub.id } })
    expect(store.shipSubOrder(order.id, sub.id)).toBe(false)
    expect(await store.payOrder(order.id)).toBe(false)
  })

  it('keeps shared and Pinia order state unchanged when payment provider fails', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAYMENT-FAIL', auth: { isLoggedIn: true, openid: 'openid-payment-fail' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付失败用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const before = {
      storeOrder: cloneSeed(order),
      orders: cloneSeed(readCOrders() || {}),
      supplierOrders: cloneSeed(readPlatformOrders() || {}),
      ledger: cloneSeed(readPlatformCommissionLedger() || {})
    }
    const createPayment = vi.fn().mockResolvedValue({ ok: false, code: 'provider_down', message: '支付通道暂不可用' })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.payOrder(order.id)).toBe(false)
    expect(createPayment).toHaveBeenCalledWith({ orderId: order.id, amount: order.amount, operationId: `payment:${order.id}` })
    expect(order).toEqual(before.storeOrder)
    expect(readCOrders() || {}).toEqual(before.orders)
    expect(readPlatformOrders() || {}).toEqual(before.supplierOrders)
    expect(readPlatformCommissionLedger() || {}).toEqual(before.ledger)
    expect(store.checkoutError).toBe('支付通道暂不可用')
    expect(readPaymentAttempts()[`payment:${order.id}`]).toMatchObject({ orderId: order.id, userId: order.userId, amount: order.amount, status: 'failed', failureReason: '支付通道暂不可用' })
  })

  it('starts a new provider attempt after an explicit failure and keeps the business journal stable', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAYMENT-RETRY', auth: { isLoggedIn: true, openid: 'openid-payment-retry' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付重试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const businessOperationId = `payment:${order.id}`
    const createPayment = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'declined', message: '用户取消支付' })
      .mockResolvedValueOnce({ ok: true, value: { transactionId: 'PAY-RETRY-SUCCESS' } })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.payOrder(order.id)).toBe(false)
    expect(await store.payOrder(order.id)).toBe(true)

    const attempts = Object.values(readPaymentAttempts()).filter((attempt) => attempt.orderId === order.id)
    expect(attempts).toHaveLength(2)
    expect(readPaymentAttempts()[businessOperationId]).toMatchObject({ status: 'failed', failureReason: '用户取消支付' })
    const retry = attempts.find((attempt) => attempt.operationId !== businessOperationId)!
    expect(retry).toMatchObject({ status: 'synchronized', providerTransactionId: 'PAY-RETRY-SUCCESS' })
    expect(createPayment.mock.calls[1]?.[0].operationId).toBe(retry.operationId)
    expect(store.paymentAttemptForOrder(order.id)?.operationId).toBe(retry.operationId)
    expect(readPlatformJournal()[businessOperationId]).toMatchObject({ status: 'committed' })
  })

  it('shares one retry attempt across concurrent user tabs', async () => {
    const first = allowedStore()
    await first.initialize()
    first.$patch({ userId: 'U-PAYMENT-RETRY-TABS', auth: { isLoggedIn: true, openid: 'openid-payment-retry-tabs-1' } })
    const product = first.cProducts[0]
    first.setAddress({ receiver: '支付多标签用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    first.addToCart(product.id, product.skus[0].id)
    expect(await first.submitOrder()).toBe(true)
    const order = first.orders[0]
    const businessOperationId = `payment:${order.id}`
    configurePlatformProviders({ payment: { createPayment: vi.fn().mockResolvedValue({ ok: false, code: 'declined', message: '用户取消支付' }) } })
    expect(await first.payOrder(order.id)).toBe(false)

    setActivePinia(createPinia())
    const second = allowedStore()
    second.$patch({ userId: order.userId, auth: { isLoggedIn: true, openid: 'openid-payment-retry-tabs-2' } })
    await second.initialize(true)
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-RETRY-TABS' } })
    configurePlatformProviders({ payment: { createPayment } })

    const results = await Promise.all([first.payOrder(order.id), second.payOrder(order.id)])
    expect(results).toContain(true)
    const attempts = Object.values(readPaymentAttempts()).filter((attempt) => attempt.orderId === order.id)
    expect(attempts).toHaveLength(2)
    const retryOperationIds = createPayment.mock.calls.map(([input]) => input.operationId)
    expect(new Set(retryOperationIds).size).toBe(1)
    expect(retryOperationIds[0]).not.toBe(businessOperationId)
    expect(first.paymentAttemptForOrder(order.id)?.operationId).toBe(retryOperationIds[0])
    expect(readPlatformJournal()[businessOperationId]).toMatchObject({ status: 'committed' })
  })

  it('persists an unknown attempt before invoking the payment provider', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-ATTEMPT-FIRST', auth: { isLoggedIn: true, openid: 'openid-pay-attempt-first' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付记录用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`
    const createPayment = vi.fn(async () => {
      expect(readPaymentAttempts()[operationId]).toMatchObject({ orderId: order.id, userId: order.userId, amount: order.amount, status: 'created' })
      return { ok: false as const, code: 'declined', message: '用户取消支付' }
    })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.payOrder(order.id)).toBe(false)
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'failed', failureReason: '用户取消支付' })
  })

  it('queries the same operation after a lost payment response and synchronizes a confirmed result', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-QUERY-CONFIRMED', auth: { isLoggedIn: true, openid: 'openid-pay-query-confirmed' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付查询用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`
    const createPayment = vi.fn().mockRejectedValue(new Error('response lost'))
    const queryPayment = vi.fn().mockResolvedValue({ ok: true, value: { status: 'confirmed', transactionId: 'PAY-QUERY-CONFIRMED' } })
    configurePlatformProviders({ payment: { createPayment, queryPayment } })

    expect(await store.payOrder(order.id)).toBe(true)
    expect(queryPayment).toHaveBeenCalledWith({ operationId })
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'synchronized', providerTransactionId: 'PAY-QUERY-CONFIRMED' })
    expect(readCOrders()?.[order.id]).toMatchObject({ status: 'paid', providerTransactionId: 'PAY-QUERY-CONFIRMED' })
  })

  it('keeps an unknown attempt visible when a lost response cannot be confirmed', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-QUERY-UNKNOWN', auth: { isLoggedIn: true, openid: 'openid-pay-query-unknown' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付待确认用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`
    configurePlatformProviders({ payment: {
      createPayment: vi.fn().mockRejectedValue(new Error('response lost')),
      queryPayment: vi.fn().mockResolvedValue({ ok: true, value: { status: 'unknown' } })
    } })

    expect(await store.payOrder(order.id)).toBe(false)
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'unknown' })
    expect(store.paymentAttemptForOrder(order.id)).toMatchObject({ operationId, userId: order.userId, status: 'unknown' })
    expect(store.checkoutError).toBe('支付结果确认中，请稍后查询')
  })

  it('retains a confirmed attempt across a business transaction failure and retries without another charge', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-SYNC-RETRY', auth: { isLoggedIn: true, openid: 'openid-pay-sync-retry' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付同步重试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-SYNC-RETRY' } })
    configurePlatformProviders({ payment: { createPayment } })
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_ORDERS_STORAGE_KEY) { failed = true; throw new Error('supplier write failed') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.payOrder(order.id)).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'confirmed', providerTransactionId: 'PAY-SYNC-RETRY' })

    expect(await store.payOrder(order.id)).toBe(true)
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(readPaymentAttempts()[operationId]).toMatchObject({ status: 'synchronized', providerTransactionId: 'PAY-SYNC-RETRY' })
  })

  it('persists confirmed payment recovery and completes it from current snapshots on refresh', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-PERSISTED-RECOVERY', auth: { isLoggedIn: true, openid: 'openid-pay-persisted-recovery' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付持久恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const attemptOperationId = `payment:${order.id}`
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-PERSISTED-RECOVERY' } })
    const queryPayment = vi.fn().mockResolvedValue({ ok: true, value: { status: 'confirmed', transactionId: 'PAY-PERSISTED-RECOVERY' } })
    configurePlatformProviders({ payment: { createPayment, queryPayment } })
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_ORDERS_STORAGE_KEY) { failed = true; throw new Error('supplier write failed') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.payOrder(order.id)).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readPaymentAttempts()[attemptOperationId]).toMatchObject({ status: 'confirmed', providerTransactionId: 'PAY-PERSISTED-RECOVERY' })
    expect(readPlatformRecoveryQueue()).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: `payment-confirmation:${attemptOperationId}`, handlerKey: 'user-payment-confirmation-v1', status: 'pending' })
    ]))

    const concurrent = cloneSeed(readCOrders()![order.id])
    concurrent.id = 'CO-PAY-UNRELATED'
    concurrent.commissionAllocations.forEach((allocation) => { allocation.orderId = concurrent.id })
    expect(writeCOrders({ ...readCOrders(), [concurrent.id]: concurrent })).toBe(true)
    let recoveryWriteFailed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!recoveryWriteFailed && key === PLATFORM_ORDERS_STORAGE_KEY) { recoveryWriteFailed = true; throw new Error('recovery supplier write failed') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    await store.refreshSharedState()
    localStorage.setItem = originalSetItem

    expect(readPaymentAttempts()[attemptOperationId]).toMatchObject({ status: 'confirmed', providerTransactionId: 'PAY-PERSISTED-RECOVERY' })
    expect(readPlatformRecoveryQueue().find((task) => task.operationId === `payment-confirmation:${attemptOperationId}`)).toMatchObject({ status: 'pending', retryCount: 1, lastError: 'payment-confirmation-write-failed' })
    await store.refreshSharedState()

    expect(queryPayment).toHaveBeenCalledWith({ operationId: attemptOperationId })
    expect(readCOrders()![order.id]).toMatchObject({ status: 'paid', providerTransactionId: 'PAY-PERSISTED-RECOVERY' })
    expect(readCOrders()![concurrent.id]).toMatchObject({ id: concurrent.id, userId: concurrent.userId, amount: concurrent.amount, status: 'pending_payment' })
    expect(readCOrders()![concurrent.id].commissionAllocations).toHaveLength(concurrent.commissionAllocations.length)
    expect(readPaymentAttempts()[attemptOperationId]).toMatchObject({ status: 'synchronized', providerTransactionId: 'PAY-PERSISTED-RECOVERY' })
    const resolvedRecovery = readPlatformRecoveryQueue().find((task) => task.operationId === `payment-confirmation:${attemptOperationId}`)
    expect(resolvedRecovery).toMatchObject({ status: 'resolved', retryCount: 2 })
    expect(resolvedRecovery).not.toHaveProperty('lastError')
    expect(createPayment).toHaveBeenCalledTimes(1)
  })

  it('keeps a paid order successful when attempt synchronization fails and reconciles it on refresh', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-SYNC-RECOVERY', auth: { isLoggedIn: true, openid: 'openid-pay-sync-recovery' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付记录恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    configurePlatformProviders({ payment: { createPayment: vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-SYNC-RECOVERY' } }) } })
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let blocked = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!blocked && key === PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY && value.includes('"status":"synchronized"')) {
        blocked = true
        throw new Error('payment attempt write failed')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.payOrder(order.id)).toBe(true)
    localStorage.setItem = originalSetItem
    expect(order).toMatchObject({ status: 'paid', providerTransactionId: 'PAY-SYNC-RECOVERY' })
    expect(store.checkoutError).toBe('支付已成功，支付记录待恢复')
    expect(store.paymentAttemptForOrder(order.id)).toMatchObject({ status: 'confirmed', providerTransactionId: 'PAY-SYNC-RECOVERY' })

    await store.refreshSharedState()
    expect(store.paymentAttemptForOrder(order.id)).toMatchObject({ status: 'synchronized', providerTransactionId: 'PAY-SYNC-RECOVERY' })
  })

  it('does not reuse a confirmed payment attempt owned by another user', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-OWNER', auth: { isLoggedIn: true, openid: 'openid-pay-owner' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付归属用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `payment:${order.id}`
    const forgedAttempt = {
      operationId, orderId: order.id, userId: 'U-OTHER', amount: order.amount, status: 'confirmed', providerTransactionId: 'PAY-FORGED',
      createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z'
    }
    localStorage.setItem(PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, JSON.stringify({ [operationId]: forgedAttempt }))
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-OWNER' } })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.payOrder(order.id)).toBe(false)
    expect(createPayment).not.toHaveBeenCalled()
    expect(store.checkoutError).toBe('支付记录归属异常，请联系客服')
    expect(readPaymentAttempts()[operationId]).toMatchObject({ userId: 'U-OTHER', status: 'confirmed', providerTransactionId: 'PAY-FORGED' })
  })

  it('uses the persisted order amount when Pinia payment data is stale', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-PERSISTED', auth: { isLoggedIn: true, openid: 'openid-pay-persisted' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '持久化金额用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const persistedAmount = readCOrders()![order.id].amount
    order.amount = 0.01
    const createPayment = vi.fn().mockResolvedValue({ ok: true, value: { transactionId: 'PAY-PERSISTED-AMOUNT' } })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.payOrder(order.id)).toBe(true)
    expect(createPayment).toHaveBeenCalledWith({ orderId: order.id, amount: persistedAmount, operationId: `payment:${order.id}` })
    expect(readCOrders()![order.id]).toMatchObject({ amount: persistedAmount, providerTransactionId: 'PAY-PERSISTED-AMOUNT' })
  })

  it('converts a rejected order payment promise into a visible unknown attempt without business writes', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-PAY-REJECT', auth: { isLoggedIn: true, openid: 'openid-pay-reject' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '支付异常用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const before = { order: cloneSeed(store.orders[0]), orders: cloneSeed(readCOrders()), supplier: cloneSeed(readPlatformOrders()), ledger: cloneSeed(readPlatformCommissionLedger()) }
    configurePlatformProviders({ payment: { createPayment: vi.fn().mockRejectedValue(new Error('network down')) } })

    expect(await store.payOrder(store.orders[0].id)).toBe(false)
    expect(cloneSeed(store.orders[0])).toEqual(before.order)
    expect(store.checkoutError).toBe('支付结果确认中，请稍后查询')
    expect(readPaymentAttempts()[`payment:${store.orders[0].id}`]).toMatchObject({ status: 'unknown' })
    expect(readCOrders()).toEqual(before.orders)
    expect(readPlatformOrders()).toEqual(before.supplier)
    expect(readPlatformCommissionLedger()).toEqual(before.ledger)
  })

  it('refreshes a C sub-order from supplier platform fulfillment', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    const supplierOrder = readPlatformOrders()?.[`C-MALL-${sub.id}`]!
    writePlatformOrder(shipSupplierCourier({ ...supplierOrder, supplierFulfillment: { ...supplierOrder.supplierFulfillment!, status: 'accepted' } }, 'SF-REFRESH', '供应商 A')!)
    await store.refreshFulfillment()
    expect(store.orders[0].subOrders[0]).toMatchObject({ status: 'shipped', trackingNo: 'SF-REFRESH' })
  })

  it('projects supplier fulfillment during shared refresh without writing C orders', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-SHARED-REFRESH', auth: { isLoggedIn: true, openid: 'openid-shared-refresh' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    const supplierOrder = readPlatformOrders()?.[`C-MALL-${sub.id}`]!
    writePlatformOrder(shipSupplierCourier({ ...supplierOrder, supplierFulfillment: { ...supplierOrder.supplierFulfillment!, status: 'accepted' } }, 'SF-SHARED-REFRESH', '供应商 A')!)

    const beforeRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
    await store.refreshSharedState()

    expect(store.orders[0].subOrders[0]).toMatchObject({ status: 'shipped', trackingNo: 'SF-SHARED-REFRESH' })
    expect(readCOrders()?.[order.id].subOrders[0]).toMatchObject({ status: 'paid' })
    expect(readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)).toBe(beforeRevision)
  })

  it('persists fulfillment through an explicit idempotent synchronization transaction', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-FULFILLMENT-SYNC', auth: { isLoggedIn: true, openid: 'openid-fulfillment-sync' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '履约同步用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    const supplierOrder = readPlatformOrders()?.[`C-MALL-${sub.id}`]!
    expect(writePlatformOrder(shipSupplierCourier({ ...supplierOrder, supplierFulfillment: { ...supplierOrder.supplierFulfillment!, status: 'accepted' } }, 'SF-EXPLICIT-SYNC', '供应商 A')!)).toBe(true)
    const beforeRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)

    expect(await store.syncFulfillmentProjection()).toBe(true)
    const synchronizedRevision = readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)
    expect(synchronizedRevision).toBe(beforeRevision + 1)
    expect(readCOrders()?.[order.id].subOrders[0]).toMatchObject({ status: 'shipped', trackingNo: 'SF-EXPLICIT-SYNC' })

    expect(await store.syncFulfillmentProjection()).toBe(false)
    expect(readPlatformCollectionRevision(PLATFORM_C_ORDERS_STORAGE_KEY)).toBe(synchronizedRevision)
  })

  it('reloads addresses and inventory changed by another H5 page', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-OTHER', auth: { isLoggedIn: true, openid: 'openid-other' } })
    const inventory = readCatalogState()!
    const address = { id: 'ADDR-OTHER', userId: 'U-C-OTHER', receiver: '跨页用户', phone: '13800000000', region: '湖南', detail: '跨页地址', isDefault: true }
    writeCAddresses({ [address.id]: address })
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    store.refreshSharedState()
    expect(store.addresses).toEqual([expect.objectContaining({ id: address.id })])
    expect(store.inventoryRevision).toBe(inventory.revision + 1)
  })

  it('keeps confirmed receipt after refreshing the supplier fulfillment snapshot', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const subId = store.orders[0].subOrders[0].id
    expect(await store.payOrder(orderId)).toBe(true)
    shipFromSupplier(store, orderId, subId)
    expect(await store.confirmSubOrderReceipt(orderId, subId)).toBe(true)
    expect(store.refreshFulfillment().find((order) => order.id === orderId)?.subOrders[0].status).toBe('received')
  })

  it('keeps a sub-order in after-sale after refreshing supplier fulfillment', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '售后测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const subId = store.orders[0].subOrders[0].id
    expect(await store.payOrder(orderId)).toBe(true)
    shipFromSupplier(store, orderId, subId)
    expect(await store.confirmSubOrderReceipt(orderId, subId)).toBe(true)
    expect(await store.requestSubOrderAfterSale(orderId, subId)).toBe(true)
    expect(readPlatformOrders()?.[`C-MALL-${subId}`]).toMatchObject({ status: 'after-sale', supplierFulfillment: { status: 'cancelled' } })
    expect(store.refreshFulfillment().find((order) => order.id === orderId)?.subOrders[0].status).toBe('after_sale')
  })
  it('persists after-sale evidence images to the shared platform after-sale', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-EVID-TEST', auth: { isLoggedIn: true, openid: 'openid-evid' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '证据用户', phone: '13800000001', region: '湖南', detail: '售后测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const subId = store.orders[0].subOrders[0].id
    expect(await store.payOrder(orderId)).toBe(true)
    const evidence = [{ source: 'asset' as const, assetId: 'evid-1' }, { source: 'asset' as const, assetId: 'evid-2' }]
    expect(await store.requestSubOrderAfterSale(orderId, subId, evidence)).toBe(true)
    const persisted = Object.values(readPlatformAfterSales() || {}).find((work) => work.orderId === orderId)
    expect(persisted?.evidenceImages).toEqual(evidence)
  })

  it('persists stable user portal source links for a processing after-sale request', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-AFTER-SALE-SOURCE', auth: { isLoggedIn: true, openid: 'openid-after-sale-source' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '售后用户', phone: '13800000000', region: '湖南', detail: '售后地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(await store.payOrder(order.id)).toBe(true)

    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    const persisted = Object.values(readPlatformAfterSales() || {}).find((work) => work.orderId === order.id)
    expect(persisted).toMatchObject({
      sourcePortal: 'user', masterOrderId: order.id, subOrderId: sub.id,
      supplierOrderId: `C-MALL-${sub.id}`, operationId: `after-sale:${sub.id}`, status: 'processing'
    })
    expect(persisted?.providerRefundId).toBeUndefined()
  })

  it('pays only the upstream level1 for a level2 buyer and settles a referred order after receipt', async () => {
    const store = allowedStore()
    await store.initialize()
    writeCDistributorProfiles(demoCDistributorProfiles)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    const sku = store.cProducts[0].skus[0]
    store.addToCart(store.cProducts[0].id, sku.id)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    expect(await store.submitOrder()).toBe(true)
    expect(store.orders[0].commissionAllocations).toEqual([
      expect.objectContaining({ beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: sku.level1Commission })
    ])

    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setReferral('T002')).toBe(true)
    store.setAddress({ receiver: '王女士', phone: '13900000000', region: '湖南省湘西州', detail: '另一测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, sku.id)
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    expect(await store.payOrder(orderId)).toBe(true)
    const subOrderId = store.orders[0].subOrders[0].id
    const shippedOrder = shipFromSupplier(store, orderId, subOrderId)
    expect(await store.confirmSubOrderReceipt(orderId, subOrderId)).toBe(true)
    expect(shippedOrder.status).toBe('received')
    expect(shippedOrder.commissionAllocations.every((item) => item.status === 'available')).toBe(true)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    expect(await store.withdrawCommission()).toBe('pending')
    const withdrawal = Object.values(readPlatformWithdrawals() || {}).find((item) => item.requesterId === 'U-DEMO-L2')!
    expect(transitionPlatformWithdrawal(withdrawal.id, 'approved', 'admin')).toMatchObject({ status: 'approved' })
    await store.syncWithdrawals()
    expect(store.availableCommission).toBe(0)
    expect(await store.requestSubOrderAfterSale(orderId, subOrderId)).toBe(true)
    const afterSaleOrder = store.orders.find((item) => item.id === orderId)!
    expect(afterSaleOrder.status).toBe('after_sale')
    expect(afterSaleOrder.commissionAllocations.some((item) => item.amount === -15 && item.status === 'reversed')).toBe(true)
  })

  it('persists address defaults, inventory reservations and pending cancellation rollback', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const sku = store.cProducts[0].skus[0]
    const originalStock = sku.stock
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const firstAddress = store.addresses[0]
    expect(store.setAddress({ receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true })).toBe(true)
    expect(store.addresses.filter((item) => item.isDefault)).toHaveLength(1)
    expect(readCAddresses()).toMatchObject({ [store.addresses[0].id]: { isDefault: true } })
    store.addToCart(store.cProducts[0].id, sku.id)
    expect(await store.submitOrder()).toBe(true)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock - 1)
    const orderId = store.orders[0].id
    expect(await store.cancelOrder(orderId)).toBe(true)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
    expect(await store.cancelOrder(orderId)).toBe(false)
    expect(store.removeAddress(firstAddress.id)).toBe(true)
    expect(readCAddresses()?.[firstAddress.id]).toBeUndefined()
    expect(readCatalogState()?.products.find((item) => item.id === store.cProducts[0].id)?.skus.find((item) => item.id === sku.id)?.stock).toBe(originalStock)
  })

  it('normalizes multiple persisted default addresses on initialization', async () => {
    writeCAddresses({
      A: { id: 'A', userId: 'U-C-TEST', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true },
      B: { id: 'B', userId: 'U-C-TEST', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.addresses.filter((item) => item.isDefault)).toHaveLength(1)
    expect(readCAddresses()).toEqual(expect.objectContaining({ B: expect.objectContaining({ isDefault: true }) }))
  })

  it('rejects non-courier products before adding them to cart', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = { ...store.cProducts[0], shippingType: 'pickup' as never }
    store.cProducts = [product]
    expect(store.addToCart(product.id, product.skus[0].id)).toBe(false)
    expect(store.cart).toHaveLength(0)
  })

  it('supports paid sub-order after-sale and releases inventory once', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const product = store.cProducts[0]
    const sku = product.skus[0]
    const originalStock = sku.stock
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, sku.id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    expect(sub.status).toBe('after_sale')
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(false)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
  })

  it('supports shipped sub-order after-sale without restoring inventory', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const product = store.cProducts[0]
    const sku = product.skus[0]
    const originalStock = sku.stock
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, sku.id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const shippedOrder = shipFromSupplier(store, order.id, sub.id)
    const shippedSub = shippedOrder.subOrders.find((item) => item.id === sub.id)!
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    expect(shippedSub.status).toBe('after_sale')
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock - 1)
  })

  it('keeps every after-sale snapshot and Pinia state unchanged when supplier publication fails', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('AFTER-SALE-ROLLBACK')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-AFTER-SALE-ROLLBACK', auth: { isLoggedIn: true, openid: 'openid-after-sale-rollback' } })
    await store.initialize()
    store.setAddress({ receiver: '回滚测试', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('AFTER-SALE-ROLLBACK', 'AFTER-SALE-ROLLBACK-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    expect(readCOrders()?.[order.id].providerTransactionId).toBe(`mock-pay-payment:${order.id}`)
    const sub = order.subOrders[0]
    expect(await store.syncFulfillmentProjection()).toBe(true)

    const before = {
      catalog: readCatalogState(),
      orders: readCOrders(),
      commissions: readCCommissionRecords(),
      afterSales: readPlatformAfterSales(),
      supplierOrders: readPlatformOrders(),
      memoryOrders: JSON.parse(JSON.stringify(store.orders)),
      memoryProducts: JSON.parse(JSON.stringify(store.cProducts)),
      memoryCommissions: JSON.parse(JSON.stringify(store.commissionRecords))
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === 'agritainment-platform-orders') { failed = true; throw new Error('supplier publication failed') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readCOrders()).toEqual(before.orders)
    expect(readCCommissionRecords()).toEqual(before.commissions)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readPlatformOrders()).toEqual(before.supplierOrders)
    expect(store.orders).toEqual(before.memoryOrders)
    expect(store.cProducts).toEqual(before.memoryProducts)
    expect(store.commissionRecords).toEqual(before.memoryCommissions)
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    expect(store.orders[0].subOrders[0].status).toBe('after_sale')
  })

  it('does not restore inventory when Pinia says paid but the persisted sub-order is shipped', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('AFTER-SALE-PERSISTED')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-AFTER-SALE-PERSISTED', auth: { isLoggedIn: true, openid: 'openid-after-sale-persisted' } })
    await store.initialize()
    store.setAddress({ receiver: '持久化测试', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('AFTER-SALE-PERSISTED', 'AFTER-SALE-PERSISTED-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    expect(sub.status).toBe('paid')
    const persisted = readCOrders()!
    persisted[order.id].subOrders[0].status = 'shipped'
    expect(writeCOrders(persisted)).toBe(true)
    const stockBefore = readCatalogState()!.products[0].skus[0].stock

    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)

    expect(readCatalogState()!.products[0].skus[0].stock).toBe(stockBefore)
    expect(store.orders[0].subOrders[0]).toMatchObject({ status: 'after_sale', inventoryReleased: false })
  })

  it('does not overwrite another users persisted addresses', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const otherAddress = { id: 'ADDR-OTHER', userId: 'U-OTHER', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true }
    const allAddresses = readCAddresses() || {}
    allAddresses[otherAddress.id] = otherAddress
    writeCAddresses(allAddresses)
    expect(store.setDefaultAddress(store.addresses[0].id)).toBe(true)
    expect(readCAddresses()?.[otherAddress.id]).toMatchObject({ userId: 'U-OTHER' })
  })

  it('preserves a same-user address added by another tab when changing the default', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const firstId = store.addresses[0].id
    const all = readCAddresses() || {}
    all['ADDR-EXTERNAL'] = { id: 'ADDR-EXTERNAL', userId: 'U-C-TEST', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: false, updatedAt: new Date(Date.now() + 1000).toISOString() }
    writeCAddresses(all)

    expect(store.setDefaultAddress(firstId)).toBe(true)

    expect(readCAddresses()).toMatchObject({ [firstId]: { isDefault: true }, 'ADDR-EXTERNAL': { userId: 'U-C-TEST' } })
  })

  it('isolates persisted carts by user session', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-A', auth: { isLoggedIn: true, openid: 'openid-a' } })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    store.persistSession()
    store.$patch({ userId: 'U-B', cart: [] })
    store.restoreSession()
    expect(store.cart).toHaveLength(0)
    store.$patch({ userId: 'U-A' })
    store.restoreSession()
    expect(store.cart).toHaveLength(1)
    expect(readCUserSession('U-B').cart).toHaveLength(0)
  })

  it('rejects checkout when another session advances inventory revision', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    const inventory = readCatalogState()!
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    expect(await store.submitOrder()).toBe(false)
    expect(store.checkoutError).toContain('库存已更新')
    expect(store.orders).toHaveLength(0)
    expect(store.cart).toHaveLength(1)
  })

  it('rejects invalid referrals and keeps a bound referral immutable', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setReferral('missing')).toBe(false)
    expect(store.setReferral('T002')).toBe(true)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    expect(readUserBindings()?.['U-C-TEST']).toMatchObject({ promoterId: 'T002', status: 'bound' })
    expect(store.setReferral('T001')).toBe(false)
    expect(store.referralPromoterId).toBe('T002')
  })

  it('fulfills and reverses only the selected supplier sub-order', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const first = store.cProducts[0]
    const second = store.cProducts.find((item) => item.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const firstSub = order.subOrders[0]
    const secondSub = order.subOrders[1]
    shipFromSupplier(store, order.id, firstSub.id)
    const syncedOrder = store.orders.find((item) => item.id === order.id)!
    const syncedFirstSub = syncedOrder.subOrders.find((item) => item.id === firstSub.id)!
    const syncedSecondSub = syncedOrder.subOrders.find((item) => item.id === secondSub.id)!
    expect(await store.confirmSubOrderReceipt(order.id, syncedFirstSub.id)).toBe(true)
    expect(syncedFirstSub.status).toBe('received')
    expect(syncedSecondSub.status).toBe('paid')
    expect(await store.requestSubOrderAfterSale(order.id, syncedFirstSub.id)).toBe(true)
    expect(syncedFirstSub.status).toBe('after_sale')
    expect(syncedSecondSub.status).toBe('paid')
    expect(store.orders[0].commissionAllocations.filter((item) => item.subOrderId === syncedFirstSub.id).every((item) => item.status === 'reversed')).toBe(true)
  })

  it('restores a logged-in users orders and addresses after reinitialization', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders).toHaveLength(1)
    expect(store.addresses).toHaveLength(1)
  })

  it('does not restore an order whose address snapshot belongs to another user', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const raw = JSON.parse(localStorage.getItem(PLATFORM_C_ORDERS_STORAGE_KEY) || '{}')
    raw[store.orders[0].id].address.userId = 'U-OTHER'
    localStorage.setItem(PLATFORM_C_ORDERS_STORAGE_KEY, JSON.stringify(raw))
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders).toHaveLength(0)
  })

  it('keeps historical price and commission snapshots after current catalog changes', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const inventory = readCatalogState()!
    const changed = inventory.products.map((item) => item.id === product.id ? { ...item, skus: item.skus.map((sku) => sku.id === product.skus[0].id ? { ...sku, retailPrice: 99, level1Amount: 1, level2Amount: 1 } : sku) } : item)
    expect(writeCatalogState({ ...inventory, revision: inventory.revision + 1, products: changed }, inventory.revision)).toBe(true)
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders.find((order) => order.id === orderId)?.items[0]).toMatchObject({ unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15 })
  })

  it('does not cancel a pending order when a reserved SKU is missing', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const inventory = readCatalogState()!
    localStorage.setItem(PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify({ ...inventory, products: inventory.products.map((product) => product.id === store.cProducts[0].id ? { ...product, skus: [] } : product) }))
    expect(await store.cancelOrder(order.id)).toBe(false)
    expect(order.status).toBe('pending_payment')
    expect(order.inventoryReleased).toBeUndefined()
  })

  it('keeps paid after-sale unchanged when inventory revision is stale', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const inventory = readCatalogState()!
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(false)
    expect(sub.status).toBe('paid')
    expect(sub.afterSale).toBeUndefined()
  })

  it('restores only valid cart session lines', async () => {
    const store = allowedStore()
    await store.initialize(true)
    const product = store.cProducts[0]
    writeCUserSession('U-C-TEST', {
      referralPromoterId: '',
      cart: [
        { productId: product.id, skuId: product.skus[0].id, name: product.name, skuName: product.skus[0].name, image: '', quantity: 0, unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: product.supplierId, lockedLevel: 'normal' },
        { productId: 'missing', skuId: 'missing', name: '脏数据', skuName: '脏数据', image: '', quantity: 1, unitPrice: -1, basePrice: -1, level1Commission: 0, level2Commission: 0, supplierId: 'S1', lockedLevel: 'normal' }
      ]
    })
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.restoreSession()
    expect(store.cart).toHaveLength(0)
  })

  it('creates a negative withdrawn commission only for the selected sub-order', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const first = store.cProducts[0]
    const second = store.cProducts.find((product) => product.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    for (const sub of order.subOrders) {
      shipFromSupplier(store, order.id, sub.id)
      expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    }
    writeCDistributorProfiles(demoCDistributorProfiles)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    expect(await store.withdrawCommission()).toBe('pending')
    const withdrawal = Object.values(readPlatformWithdrawals() || {}).find((item) => item.requesterId === 'U-DEMO-L2')!
    expect(transitionPlatformWithdrawal(withdrawal.id, 'approved', 'admin')).toMatchObject({ status: 'approved' })
    await store.syncWithdrawals()
    const target = order.subOrders[0]
    const other = order.subOrders[1]
    expect(await store.requestSubOrderAfterSale(order.id, target.id)).toBe(true)
    const settledOrder = store.orders.find((item) => item.id === order.id)!
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === target.id && item.amount < 0).length).toBeGreaterThan(0)
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === other.id && item.amount < 0)).toHaveLength(0)
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === other.id && item.beneficiaryId === 'T002').every((item) => item.status === 'withdrawn')).toBe(true)
  })

  it('preserves commission records added by another tab before a local status update', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    const external = { ...order.commissionAllocations[0], id: 'CC-EXTERNAL', orderId: 'CO-EXTERNAL', subOrderId: 'CSO-EXTERNAL' }
    writeCCommissionRecords([...(readCCommissionRecords() || []), external])

    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    expect(readCCommissionRecords()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'CC-EXTERNAL' })]))
  })

  it('blocks checkout and payment when the supplier can no longer receive new orders', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 1, products: [catalogProduct('SUPPLIER-GUARD', { supplierId: 'S002', supplierName: suppliers[1].name })] })
    const store = allowedStore()
    store.$patch({ userId: 'U-SUPPLIER-GUARD', auth: { isLoggedIn: true, openid: 'openid-supplier-guard' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('SUPPLIER-GUARD', 'SUPPLIER-GUARD-SKU')
    expect(upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'paused', cooperationPauseReason: '暂停接单' })).toBe(true)

    expect(await store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('湘西腊味合作社已暂停接单，请选择其他商品')

    expect(upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'cooperating' })).toBe(true)
    expect(await store.submitOrder()).toBe(true)
    expect(upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'paused', cooperationPauseReason: '再次暂停' })).toBe(true)
    expect(await store.payOrder(store.orders[0].id)).toBe(false)
    expect(store.checkoutError).toBe('湘西腊味合作社已暂停接单，暂时无法支付')
  })

  it('restores C-order and commission snapshots when supplier receipt publication fails', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-FAIL')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-FAIL', auth: { isLoggedIn: true, openid: 'openid-receipt-fail' } })
    await store.initialize()
    store.setAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-FAIL', 'RECEIPT-FAIL-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    expect(await store.syncFulfillmentProjection()).toBe(true)
    const beforeOrder = readCOrders()?.[order.id]
    const beforeCommissions = readCCommissionRecords()
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-orders') throw new Error('supplier write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readCOrders()?.[order.id]).toEqual(beforeOrder)
    expect(readCCommissionRecords()).toEqual(beforeCommissions)
    expect(store.orders[0].subOrders[0].status).toBe('shipped')
  })

  it('records an owned recoverable receipt transaction only after all C-order snapshots are committed', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-OWNED')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-OWNED', auth: { isLoggedIn: true, openid: 'openid-receipt-owned' } })
    await store.initialize()
    store.setAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-OWNED', 'RECEIPT-OWNED-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)

    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)

    expect(readPlatformJournal()[`receipt:${order.id}:${sub.id}`]).toMatchObject({
      status: 'committed', recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1',
      collections: ['agritainment-platform-c-commissions', 'agritainment-platform-c-orders', 'agritainment-platform-orders', PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY]
    })
  })

  it('rejects a receipt when its persisted C-order snapshot changes while revisions are captured', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-REVISION')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-REVISION', auth: { isLoggedIn: true, openid: 'openid-receipt-revision' } })
    await store.initialize()
    store.setAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-REVISION', 'RECEIPT-REVISION-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    expect(await store.syncFulfillmentProjection()).toBe(true)

    const originalGetItem = localStorage.getItem.bind(localStorage)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let injected = false
    let cOrderReads = 0
    localStorage.getItem = ((key: string) => {
      const value = originalGetItem(key)
      if (key === PLATFORM_C_ORDERS_STORAGE_KEY) cOrderReads += 1
      if (!injected && key === PLATFORM_C_ORDERS_STORAGE_KEY && cOrderReads === 2 && value) {
        injected = true
        const concurrent = JSON.parse(value) as Record<string, Record<string, unknown>>
        const concurrentOrder = concurrent[order.id] as { subOrders: Array<Record<string, unknown>> }
        concurrentOrder.subOrders[0] = { ...concurrentOrder.subOrders[0], trackingNo: 'CONCURRENT-WRITE' }
        originalSetItem(key, JSON.stringify(concurrent))
        const revisionKey = `${key}:revision`
        originalSetItem(revisionKey, JSON.stringify(Number(originalGetItem(revisionKey) || '0') + 1))
      }
      return value
    }) as Storage['getItem']
    try {
      expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(false)
    } finally {
      localStorage.getItem = originalGetItem
    }
    expect(readCOrders()?.[order.id]?.subOrders[0].trackingNo).toBe('CONCURRENT-WRITE')
    expect(store.orders[0].subOrders[0].status).toBe('shipped')
  })

  it('rejects a user recovery journal whose collections do not match its snapshot variant', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVERY-SHAPE', auth: { isLoggedIn: true, openid: 'openid-recovery-shape' } })
    await store.initialize()
    const snapshot = { variant: 'withdrawal', ownerUserId: 'U-RECOVERY-SHAPE', orders: {}, commissions: [] }
    expect(preparePlatformJournal({ operationId: 'USER-WRONG-COLLECTIONS', collections: ['wrong-collection'], original: snapshot, target: snapshot, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal('USER-WRONG-COLLECTIONS', 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId: 'USER-WRONG-COLLECTIONS', failedStep: 'test', reason: 'test recovery', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it.each([
    ['wrong schema', 'wrong-schema', { variant: 'withdrawal', ownerUserId: 'U-RECOVERY-SCHEMA', orders: {}, commissions: [] }],
    ['malformed catalog', 'user-commerce-snapshot-v1', { variant: 'after-sale-catalog', ownerUserId: 'U-RECOVERY-SCHEMA', orders: {}, commissions: [], supplierOrders: {}, afterSales: {}, catalog: { revision: 0, products: 'invalid' } }]
  ])('rejects a user recovery journal with %s', async (_label, recoverySchema, snapshot) => {
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVERY-SCHEMA', auth: { isLoggedIn: true, openid: 'openid-recovery-schema' } })
    await store.initialize()
    const collections = snapshot.variant === 'withdrawal'
      ? [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY]
      : ['agritainment-platform-aftersales', PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY]
    const operationId = `USER-INVALID-${_label}`
    expect(preparePlatformJournal({ operationId, collections, original: snapshot, target: snapshot, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'invalid recovery', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a user recovery journal with a changed supplier order owned by another user', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECOVERY-CROSS-USER')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVERY-CROSS-USER', auth: { isLoggedIn: true, openid: 'openid-recovery-cross-user' } })
    await store.initialize()
    store.setAddress({ receiver: '恢复测试', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECOVERY-CROSS-USER', 'RECOVERY-CROSS-USER-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const supplierOrders = readPlatformOrders() || {}
    const original = { variant: 'after-sale', ownerUserId: store.userId, orders: readCOrders()!, commissions: readCCommissionRecords() || [], supplierOrders, afterSales: readPlatformAfterSales() }
    const target = JSON.parse(JSON.stringify(original))
    target.orders[order.id].remark = 'changed by recovery'
    const supplier = Object.values(supplierOrders)[0]!
    target.supplierOrders['CROSS-USER-SUPPLIER'] = { ...supplier, id: 'CROSS-USER-SUPPLIER', supplierOrderLink: { ...supplier.supplierOrderLink, sourceOrderId: 'OTHER-ORDER', sourceSubOrderId: 'OTHER-SUB', customerUserId: 'U-OTHER' } }
    const operationId = 'USER-CROSS-SECONDARY'
    expect(preparePlatformJournal({ operationId, collections: ['agritainment-platform-aftersales', PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'cross user secondary', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a withdrawal recovery journal that forges beneficiary, amount, and status on the same order', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVERY-FINANCE', auth: { isLoggedIn: true, openid: 'openid-recovery-finance' } })
    await store.initialize()
    const allocation = { id: 'CC-FINANCE', orderId: 'CO-FINANCE', subOrderId: 'CSO-FINANCE', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const order = {
      id: allocation.orderId, userId: store.userId, level: 'normal' as const,
      address: { id: 'ADDR-FINANCE', userId: store.userId, receiver: '财务用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [], amount: 100, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    const original = { variant: 'withdrawal', ownerUserId: store.userId, orders: readCOrders()!, commissions: readCCommissionRecords()! }
    const target = { ...original, commissions: [{ ...allocation, beneficiaryId: 'T-EVIL', amount: 999, status: 'pending' as const }] }
    const operationId = 'USER-FORGED-FINANCE'
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'forged finance', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a receipt recovery that releases commission without receiving the persisted sub-order', async () => {
    const store = allowedStore()
    const userId = 'U-RECEIPT-STATE-BINDING'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-receipt-state-binding' } })
    await store.initialize()
    const allocation = { id: 'CC-RECEIPT-STATE-BINDING', orderId: 'CO-RECEIPT-STATE-BINDING', subOrderId: 'CSO-RECEIPT-STATE-BINDING', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'pending' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-RECEIPT-BINDING', userId, receiver: '收货用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [], amount: 100, status: 'shipped' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'shipped' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    const original = { variant: 'receipt', ownerUserId: userId, orders: { [order.id]: order }, commissions: [allocation], supplierOrders: {} }
    const target = { ...cloneSeed(original), commissions: [{ ...allocation, status: 'available' as const }] }
    const operationId = `receipt:${order.id}:${allocation.subOrderId}`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'commission without receipt', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a withdrawal recovery journal whose encoded request key is not a persisted approved user request', async () => {
    const store = allowedStore()
    const userId = 'U-WITHDRAW-FAKE-REQUEST'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-fake-request' } })
    await store.initialize()
    const allocation = { id: 'CC-WITHDRAW-FAKE-REQUEST', orderId: 'CO-WITHDRAW-FAKE-REQUEST', subOrderId: 'CSO-WITHDRAW-FAKE-REQUEST', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-WITHDRAW-FAKE-REQUEST', userId, receiver: '提现用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [], amount: 100, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-REAL-REQUEST', requesterType: 'user', requesterId: userId, amount: 10, method: '微信提现', status: 'approved', requestKey: 'WD-REAL-REQUEST', createdAt: '2026-08-01T00:00:00.000Z' })).toBe(true)
    const withdrawn = { ...allocation, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-NOT-PERSISTED'] }
    const original = { variant: 'withdrawal', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, withdrawals: readPlatformWithdrawals()! }
    const target = { ...cloneSeed(original), orders: { [order.id]: { ...cloneSeed(order), commissionAllocations: [withdrawn] } }, commissions: [withdrawn] }
    const operationId = `withdrawal-sync:${userId}:WD-NOT-PERSISTED`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'fake withdrawal request', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a receipt recovery journal that mutates immutable target sub-order fields', async () => {
    const store = allowedStore()
    const userId = 'U-RECEIPT-IMMUTABLE'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-receipt-immutable' } })
    await store.initialize()
    const allocation = { id: 'CC-RECEIPT-IMMUTABLE', orderId: 'CO-RECEIPT-IMMUTABLE', subOrderId: 'CSO-RECEIPT-IMMUTABLE', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'pending' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const item = { productId: 'P-RECEIPT-IMMUTABLE', skuId: 'SKU-RECEIPT-IMMUTABLE', name: '原商品', skuName: '规格', image: '', quantity: 1, unitPrice: 100, basePrice: 60, level1Commission: 10, level2Commission: 0, supplierId: 'S001' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-RECEIPT-IMMUTABLE', userId, receiver: '收货用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [item], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [item], amount: 100, status: 'shipped' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'shipped' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    const released = { ...allocation, status: 'available' as const }
    const targetOrder = cloneSeed(order)
    targetOrder.subOrders[0] = { ...targetOrder.subOrders[0], status: 'received', supplierId: 'S-EVIL', amount: 999, items: [{ ...item, quantity: 9, supplierId: 'S-EVIL' }] } as never
    targetOrder.commissionAllocations = [released] as never
    const original = { variant: 'receipt', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, supplierOrders: readPlatformOrders() || {} }
    const target = { ...cloneSeed(original), orders: { [order.id]: targetOrder }, commissions: [released] }
    const operationId = `receipt:${order.id}:${allocation.subOrderId}`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'forged receipt fields', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a paid after-sale recovery journal whose catalog release follows forged target items', async () => {
    const store = allowedStore()
    const userId = 'U-AFTER-SALE-IMMUTABLE'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-after-sale-immutable' } })
    await store.initialize()
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('AFTER-SALE-IMMUTABLE')] })).toBe(true)
    const allocation = { id: 'CC-AFTER-SALE-IMMUTABLE', orderId: 'CO-AFTER-SALE-IMMUTABLE', subOrderId: 'CSO-AFTER-SALE-IMMUTABLE', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const item = { productId: 'AFTER-SALE-IMMUTABLE', skuId: 'AFTER-SALE-IMMUTABLE-SKU', name: '原商品', skuName: '标准装', image: '', quantity: 1, unitPrice: 100, basePrice: 60, level1Commission: 10, level2Commission: 0, supplierId: 'S001' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-AFTER-SALE-IMMUTABLE', userId, receiver: '售后用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [item], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [item], amount: 100, status: 'paid' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'paid' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    const reversed = { ...allocation, status: 'reversed' as const }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    const original = { variant: 'after-sale-catalog', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, supplierOrders: readPlatformOrders() || {}, afterSales: readPlatformAfterSales(), catalog: readCatalogState()! }
    const target = cloneSeed(original)
    target.orders[order.id].subOrders[0] = { ...target.orders[order.id].subOrders[0], status: 'after_sale', supplierId: 'S-EVIL', inventoryReleased: true, afterSale: { type: 'refund', status: 'processing', requestedAt: '2026-08-01T01:00:00.000Z' }, items: [{ ...item, quantity: 9, supplierId: 'S-EVIL' }] } as never
    target.orders[order.id].commissionAllocations = [reversed]
    target.commissions = [reversed]
    target.afterSales = { AS: { id: 'AS', orderId: order.id, subOrderId: allocation.subOrderId, type: 'refund', reason: '测试', status: 'processing', createdAt: '2026-08-01T01:00:00.000Z' } } as never
    target.catalog.revision += 1
    target.catalog.products[0].skus[0].stock += 9
    const operationId = `after-sale:${allocation.subOrderId}`
    target.catalog.appliedOperations = { [operationId]: { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes: [{ productId: item.productId, skuId: item.skuId, quantity: 9 }] }), changes: [], appliedAt: '2026-08-01T01:00:00.000Z' } }
    expect(preparePlatformJournal({ operationId, collections: ['agritainment-platform-aftersales', PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'forged after-sale items', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a withdrawal recovery snapshot with duplicate nested order allocation ids', async () => {
    const store = allowedStore()
    const userId = 'U-WITHDRAW-NESTED-DUPLICATE-ID'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-nested-duplicate-id' } })
    await store.initialize()
    const allocation = { id: 'CC-WITHDRAW-NESTED-DUPLICATE-ID', orderId: 'CO-WITHDRAW-NESTED-DUPLICATE-ID', subOrderId: 'CSO-WITHDRAW-NESTED-DUPLICATE-ID', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 0.3, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const split = { ...allocation, id: `${allocation.id}:withdrawn:WD-NESTED-DUPLICATE-ID`, amount: 0.1, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-NESTED-DUPLICATE-ID'] }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-WITHDRAW-NESTED-DUPLICATE', userId, receiver: '提现用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [], amount: 100, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    const current = { ...allocation, amount: 0.2 }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-DECIMAL', requesterType: 'user', requesterId: userId, amount: 0.1, method: '微信提现', status: 'approved', requestKey: 'WD-DECIMAL', createdAt: '2026-08-01T00:00:00.000Z' })).toBe(true)
    const original = { variant: 'withdrawal', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, withdrawals: readPlatformWithdrawals()! }
    const target = { ...cloneSeed(original), orders: { [order.id]: { ...cloneSeed(order), commissionAllocations: [current, split, cloneSeed(split)] } }, commissions: [current, split] }
    const operationId = `withdrawal-sync:${userId}:WD-NESTED-DUPLICATE-ID`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'duplicate nested allocation ids', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a withdrawal recovery snapshot with duplicate commission ids', async () => {
    const store = allowedStore()
    const userId = 'U-WITHDRAW-DUPLICATE-ID'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-duplicate-id' } })
    await store.initialize()
    const allocation = { id: 'CC-WITHDRAW-DUPLICATE-ID', orderId: 'CO-WITHDRAW-DUPLICATE-ID', subOrderId: 'CSO-WITHDRAW-DUPLICATE-ID', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 0.3, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const split = { ...allocation, id: `${allocation.id}:withdrawn:WD-DUPLICATE-ID`, amount: 0.1, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-DUPLICATE-ID'] }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-WITHDRAW-DUPLICATE', userId, receiver: '提现用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 100, items: [], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [], amount: 100, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    const original = { variant: 'withdrawal', ownerUserId: userId, orders: { [order.id]: order }, commissions: [allocation] }
    const current = { ...allocation, amount: 0.2 }
    const target = { ...cloneSeed(original), orders: { [order.id]: { ...cloneSeed(order), commissionAllocations: [current, split] } }, commissions: [current, split, cloneSeed(split)] }
    const operationId = `withdrawal-sync:${userId}:WD-DUPLICATE-ID`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'duplicate commission ids', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('accepts a decimal-conserving withdrawal split', async () => {
    const store = allowedStore()
    const userId = 'U-WITHDRAW-DECIMAL'
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-decimal' } })
    await store.initialize()
    const allocation = { id: 'CC-WITHDRAW-DECIMAL', orderId: 'CO-WITHDRAW-DECIMAL', subOrderId: 'CSO-WITHDRAW-DECIMAL', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 0.3, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const item = { productId: 'P-WITHDRAW-DECIMAL', skuId: 'SKU-WITHDRAW-DECIMAL', name: '小数商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 0.7, level1Commission: 0.3, level2Commission: 0, supplierId: 'S001' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-WITHDRAW-DECIMAL', userId, receiver: '小数提现用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 1, items: [item], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [item], amount: 1, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-DECIMAL', requesterType: 'user', requesterId: userId, amount: 0.1, method: '微信提现', status: 'approved', requestKey: 'WD-DECIMAL', createdAt: '2026-08-01T00:00:00.000Z' })).toBe(true)
    const original = { variant: 'withdrawal', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, withdrawals: readPlatformWithdrawals()! }
    const persistedAllocation = original.commissions[0]
    const current = { ...persistedAllocation, amount: 0.2 }
    const persistedSplit = { ...persistedAllocation, id: `${persistedAllocation.id}:withdrawn:WD-DECIMAL`, amount: 0.1, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-DECIMAL'] }
    const target = { ...cloneSeed(original), orders: { [order.id]: { ...cloneSeed(original.orders[order.id]), commissionAllocations: [current, persistedSplit] } }, commissions: [current, persistedSplit] }
    const operationId = `withdrawal-sync:${userId}:WD-DECIMAL`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'decimal split', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
  })

  it('restores the original user snapshot when retrying an aborted fully-marked journal', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVERY-ABORT', auth: { isLoggedIn: true, openid: 'openid-recovery-abort' } })
    await store.initialize()
    const targetAllocation = { id: 'TARGET', orderId: 'O', subOrderId: 'S', beneficiaryId: 'T', beneficiaryLevel: 'level1' as const, amount: 1, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const ownedOrder = {
      id: 'O', userId: 'U-RECOVERY-ABORT', level: 'normal' as const,
      address: { id: 'ADDR-O', userId: 'U-RECOVERY-ABORT', receiver: '恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 1,
      items: [{ productId: 'P', skuId: 'SKU', name: '商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 1, level1Commission: 0, level2Commission: 0, supplierId: 'S001' }],
      subOrders: [{ id: 'S', supplierId: 'S001', supplierName: '供应商', items: [{ productId: 'P', skuId: 'SKU', name: '商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 1, level1Commission: 0, level2Commission: 0, supplierId: 'S001' }], amount: 1, status: 'received' as const, logistics: [] }],
      commissionAllocations: [targetAllocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [ownedOrder.id]: ownedOrder })).toBe(true)
    expect(writeCCommissionRecords([targetAllocation])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-RECOVERY', requesterType: 'user', requesterId: 'U-RECOVERY-ABORT', amount: 1, method: '微信提现', status: 'approved', requestKey: 'WD-RECOVERY', createdAt: '2026-08-01T00:00:00.000Z' })).toBe(true)
    const orders = readCOrders()!
    const original = { variant: 'withdrawal', ownerUserId: 'U-RECOVERY-ABORT', orders, commissions: readCCommissionRecords()!, withdrawals: readPlatformWithdrawals()! }
    const withdrawn = { ...targetAllocation, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-RECOVERY'] }
    const target = { variant: 'withdrawal', ownerUserId: 'U-RECOVERY-ABORT', orders: { ...orders, O: { ...cloneSeed(orders.O), commissionAllocations: [withdrawn] } }, commissions: [withdrawn], withdrawals: original.withdrawals }
    const operationId = 'withdrawal-sync:U-RECOVERY-ABORT:WD-RECOVERY'
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({ ...readPlatformJournal(), [operationId]: { ...readPlatformJournal()[operationId], completedSteps: ['c-commissions', 'c-orders'], status: 'aborted' } }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'journal', reason: 'commit failed', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readCCommissionRecords()).toEqual([targetAllocation])
    expect(readPlatformJournal()[operationId].status).toBe('aborted')
  })

  it('retries receipt successfully after a transient supplier-order write failure', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-RETRY')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-RETRY', auth: { isLoggedIn: true, openid: 'openid-receipt-retry' } })
    await store.initialize()
    store.setAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-RETRY', 'RECEIPT-RETRY-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_ORDERS_STORAGE_KEY) { failed = true; throw new Error('transient supplier failure') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(false)
    localStorage.setItem = originalSetItem

    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    expect(store.orders[0].subOrders[0].status).toBe('received')
  })

  it('surfaces a fatal receipt error when recovery queue persistence fails', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-FATAL')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-FATAL', auth: { isLoggedIn: true, openid: 'openid-receipt-fatal' } })
    await store.initialize()
    store.setAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-FATAL', 'RECEIPT-FATAL-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_ORDERS_STORAGE_KEY || key === PLATFORM_RECOVERY_QUEUE_STORAGE_KEY) throw new Error('recovery unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(store.error).toBe('确认收货事务恢复失败，请联系平台处理')
    expect(store.orders[0].subOrders[0].status).toBe('shipped')
  })

  it('creates a pending user withdrawal, then consumes approval under all shared collection locks', async () => {
    writeCDistributorProfiles({ 'U-WITHDRAW': { userId: 'U-WITHDRAW', promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    writeCCommissionRecords([{ id: 'CC-WITHDRAW', orderId: 'CO-WITHDRAW', subOrderId: 'CSO-WITHDRAW', beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 25, status: 'available', createdAt: '2026-08-01T10:00:00.000Z' }])
    const store = useUserStore()
    store.$patch({ userId: 'U-WITHDRAW', auth: { isLoggedIn: true, openid: 'openid-withdraw' }, commissionRecords: readCCommissionRecords() || [] })

    expect(await store.withdrawCommission('微信提现')).toBe('pending')
    const request = Object.values(readPlatformWithdrawals() || {}).find((item) => item.requesterId === 'U-WITHDRAW')
    expect(request).toMatchObject({ requesterType: 'user', requesterId: 'U-WITHDRAW', amount: 25, method: '微信提现', status: 'pending' })
    expect(store.withdrawalRequests).toHaveLength(1)
    expect(store.myCommissionRecords[0].status).toBe('available')
    expect(store.availableCommission).toBe(0)
    expect(await store.withdrawCommission('微信提现')).toBe('duplicate')

    expect(request && transitionPlatformWithdrawal(request.id, 'approved', 'admin')).toMatchObject({ status: 'approved' })
    const acquiredLocks: string[] = []
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => { acquiredLocks.push(name); return callback() } } })
    const synchronization = store.syncWithdrawals()
    expect(synchronization).toBeInstanceOf(Promise)
    expect(await synchronization).toBe(true)
    expect(acquiredLocks).toEqual(expect.arrayContaining([
      `agritainment-platform:${PLATFORM_WITHDRAWALS_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_COMMISSIONS_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_ORDERS_STORAGE_KEY}`
    ]))
    expect(store.myCommissionRecords[0].status).toBe('withdrawn')
    expect(store.availableCommission).toBe(0)
    const recordCount = store.myCommissionRecords.length
    expect(await store.syncWithdrawals()).toBe(false)
    expect(store.myCommissionRecords).toHaveLength(recordCount)
  })

  it('consumes an approved withdrawal during initialization exactly once', async () => {
    const userId = 'U-WITHDRAW-INITIALIZE'
    const commission = { id: 'CC-WITHDRAW-INITIALIZE', orderId: 'CO-WITHDRAW-INITIALIZE', subOrderId: 'CSO-WITHDRAW-INITIALIZE', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 25, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords([commission])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-WITHDRAW-INITIALIZE', requesterType: 'user', requesterId: userId, amount: 25, method: '微信提现', status: 'approved', requestKey: 'WD-WITHDRAW-INITIALIZE', createdAt: '2026-08-01T11:00:00.000Z' })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-initialize' } })

    await store.initialize(true)

    expect(store.myCommissionRecords).toHaveLength(1)
    expect(store.myCommissionRecords[0]).toMatchObject({ id: commission.id, amount: 25, status: 'withdrawn', withdrawalRequestKeys: ['WD-WITHDRAW-INITIALIZE'] })

    await store.initialize(true)

    expect(store.myCommissionRecords).toHaveLength(1)
    expect(store.myCommissionRecords[0]).toMatchObject({ id: commission.id, amount: 25, status: 'withdrawn', withdrawalRequestKeys: ['WD-WITHDRAW-INITIALIZE'] })
  })

  it('waits for withdrawal synchronization before initialization resolves', async () => {
    const userId = 'U-WITHDRAW-INITIALIZE-GATE'
    const commission = { id: 'CC-WITHDRAW-INITIALIZE-GATE', orderId: 'CO-WITHDRAW-INITIALIZE-GATE', subOrderId: 'CSO-WITHDRAW-INITIALIZE-GATE', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 25, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords([commission])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-WITHDRAW-INITIALIZE-GATE', requesterType: 'user', requesterId: userId, amount: 25, method: '微信提现', status: 'approved', requestKey: 'WD-WITHDRAW-INITIALIZE-GATE', createdAt: '2026-08-01T11:00:00.000Z' })).toBe(true)
    let releaseWithdrawalLock: () => void = () => undefined
    let signalWithdrawalLock: () => void = () => undefined
    const withdrawalLockReached = new Promise<void>((resolve) => { signalWithdrawalLock = resolve })
    const withdrawalLockGate = new Promise<void>((resolve) => { releaseWithdrawalLock = resolve })
    let gated = false
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (!gated && name === `agritainment-platform:${PLATFORM_WITHDRAWALS_STORAGE_KEY}`) {
        gated = true
        signalWithdrawalLock()
        await withdrawalLockGate
      }
      return callback()
    } } })
    const store = allowedStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-initialize-gate' } })
    let resolved = false
    const initialization = store.initialize(true).then(() => { resolved = true })

    await withdrawalLockReached
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      expect(resolved).toBe(false)
      expect(readCCommissionRecords()?.[0]).toMatchObject({ status: 'available' })
    } finally {
      releaseWithdrawalLock()
    }
    await initialization
    expect(readCCommissionRecords()?.[0]).toMatchObject({ status: 'withdrawn', withdrawalRequestKeys: ['WD-WITHDRAW-INITIALIZE-GATE'] })
  })

  it('creates only one pending withdrawal across concurrent user tabs', async () => {
    const userId = 'U-WITHDRAW-CONCURRENT'
    const records = [{ id: 'CC-WITHDRAW-CONCURRENT', orderId: 'CO-WITHDRAW-CONCURRENT', subOrderId: 'CSO-WITHDRAW-CONCURRENT', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 25, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }]
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords(records)).toBe(true)
    const first = useUserStore()
    first.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-concurrent-1' }, commissionRecords: records })
    setActivePinia(createPinia())
    const second = useUserStore()
    second.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-concurrent-2' }, commissionRecords: records })
    const acquiredLocks: string[] = []
    const lockTails = new Map<string, Promise<unknown>>()
    vi.stubGlobal('navigator', { locks: { request: (name: string, callback: () => Promise<unknown>) => {
      acquiredLocks.push(name)
      const execution = (lockTails.get(name) || Promise.resolve()).then(callback)
      lockTails.set(name, execution.catch(() => undefined))
      return execution
    } } })

    const firstRequest = first.withdrawCommission('微信提现')
    const secondRequest = second.withdrawCommission('微信提现')
    expect(firstRequest).toBeInstanceOf(Promise)
    expect(secondRequest).toBeInstanceOf(Promise)
    expect((await Promise.all([firstRequest, secondRequest])).sort()).toEqual(['duplicate', 'pending'])
    expect(Object.values(readPlatformWithdrawals() || {}).filter((request) => request.requesterId === userId && request.status === 'pending')).toHaveLength(1)
    expect(acquiredLocks).toEqual(expect.arrayContaining([
      `agritainment-platform:${PLATFORM_WITHDRAWALS_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_COMMISSIONS_STORAGE_KEY}`,
      `agritainment-platform:${PLATFORM_C_DISTRIBUTORS_STORAGE_KEY}`
    ]))
  })

  it('uses locked shared commissions instead of a stale local withdrawal balance', async () => {
    const userId = 'U-WITHDRAW-SHARED-BALANCE'
    const sharedRecord = { id: 'CC-WITHDRAW-SHARED-BALANCE', orderId: 'CO-WITHDRAW-SHARED-BALANCE', subOrderId: 'CSO-WITHDRAW-SHARED-BALANCE', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 12, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords([sharedRecord])).toBe(true)
    const store = useUserStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-shared-balance' }, commissionRecords: [{ ...sharedRecord, amount: 99 }] })

    expect(await store.withdrawCommission()).toBe('pending')
    expect(Object.values(readPlatformWithdrawals() || {}).find((request) => request.requesterId === userId)).toMatchObject({ amount: 12 })
  })

  it('does not open another withdrawal while an approval is not yet consumed', async () => {
    const userId = 'U-WITHDRAW-APPROVED-WINDOW'
    const record = { id: 'CC-WITHDRAW-APPROVED-WINDOW', orderId: 'CO-WITHDRAW-APPROVED-WINDOW', subOrderId: 'CSO-WITHDRAW-APPROVED-WINDOW', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 25, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords([record])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-APPROVED-WINDOW', requesterType: 'user', requesterId: userId, amount: 20, method: '微信提现', status: 'approved', requestKey: 'WD-APPROVED-WINDOW', createdAt: '2026-08-01T11:00:00.000Z' })).toBe(true)
    const store = useUserStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-approved-window' }, commissionRecords: [record] })

    expect(await store.withdrawCommission()).toBe('duplicate')
    expect(Object.values(readPlatformWithdrawals() || {}).filter((request) => request.requesterId === userId)).toHaveLength(1)
  })

  it('keeps available commission and restores balance when a withdrawal is rejected', async () => {
    writeCDistributorProfiles({ 'U-WITHDRAW-REJECT': { userId: 'U-WITHDRAW-REJECT', promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    writeCCommissionRecords([{ id: 'CC-WITHDRAW-REJECT', orderId: 'CO-WITHDRAW-REJECT', subOrderId: 'CSO-WITHDRAW-REJECT', beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 18, status: 'available', createdAt: '2026-08-02T10:00:00.000Z' }])
    const store = useUserStore()
    store.$patch({ userId: 'U-WITHDRAW-REJECT', auth: { isLoggedIn: true, openid: 'openid-withdraw-reject' }, commissionRecords: readCCommissionRecords() || [] })

    expect(await store.withdrawCommission()).toBe('pending')
    const request = Object.values(readPlatformWithdrawals() || {}).find((item) => item.requesterId === 'U-WITHDRAW-REJECT')
    expect(request && transitionPlatformWithdrawal(request.id, 'rejected', 'admin', '资料不完整')).toMatchObject({ status: 'rejected', reviewedNote: '资料不完整' })
    await store.syncWithdrawals()
    expect(store.myCommissionRecords[0].status).toBe('available')
    expect(store.availableCommission).toBe(18)
  })

  it('does not commit withdrawal commission changes when an order snapshot write fails', async () => {
    const userId = 'U-WITHDRAW-ORDER-FAIL'
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    const commission = { id: 'CC-WITHDRAW-ORDER-FAIL', orderId: 'CO-WITHDRAW-ORDER-FAIL', subOrderId: 'CSO-WITHDRAW-ORDER-FAIL', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 25, status: 'available' as const, createdAt: '2026-08-03T10:00:00.000Z' }
    writeCCommissionRecords([commission])
    const store = useUserStore()
    store.$patch({
      userId,
      auth: { isLoggedIn: true, openid: 'openid-withdraw-order-fail' },
      commissionRecords: [commission],
      orders: [{ id: commission.orderId, commissionAllocations: [commission] } as never]
    })
    expect(await store.withdrawCommission()).toBe('pending')
    const request = store.withdrawalRequests[0]
    expect(transitionPlatformWithdrawal(request.id, 'approved', 'admin')).toMatchObject({ status: 'approved' })

    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_C_ORDERS_STORAGE_KEY) { failed = true; throw new Error('quota') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.syncWithdrawals()).toBe(false)

    localStorage.setItem = originalSetItem
    expect(store.myCommissionRecords[0]).toMatchObject({ id: commission.id, amount: 25, status: 'available' })
    expect(readCCommissionRecords()?.[0]).toMatchObject({ id: commission.id, amount: 25, status: 'available' })
    expect(await store.syncWithdrawals()).toBe(true)
    expect(store.myCommissionRecords[0]).toMatchObject({ id: commission.id, amount: 25, status: 'withdrawn' })
  })
  it('consumes multiple approved withdrawals in creation order without double splitting', async () => {
    const userId = 'U-WITHDRAW-MULTI'
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    const records = [{ id: 'CC-MULTI', orderId: 'CO-MULTI', subOrderId: 'CSO-MULTI', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 30, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }]
    writeCCommissionRecords(records)
    writePlatformWithdrawal({ id: 'WD-MULTI-1', requesterType: 'user', requesterId: userId, amount: 10, method: '微信提现', status: 'approved', requestKey: 'WD-MULTI-1', createdAt: '2026-08-01T11:00:00.000Z' })
    writePlatformWithdrawal({ id: 'WD-MULTI-2', requesterType: 'user', requesterId: userId, amount: 20, method: '微信提现', status: 'approved', requestKey: 'WD-MULTI-2', createdAt: '2026-08-01T12:00:00.000Z' })
    const store = useUserStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-multi' }, commissionRecords: records })
    expect(await store.syncWithdrawals()).toBe(true)
    expect(store.myCommissionRecords.filter((item) => item.status === 'withdrawn').reduce((sum, item) => sum + item.amount, 0)).toBe(30)
    const count = store.myCommissionRecords.length
    expect(await store.syncWithdrawals()).toBe(false)
    expect(store.myCommissionRecords).toHaveLength(count)
  })
  it.each([
    ['skips an already-marked request', [{ id: 'CC-MARKED', orderId: 'CO-MARKED', subOrderId: 'CSO-MARKED', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z', withdrawalRequestKeys: ['WD-SKIP-A'] }], 10],
    ['skips an insufficient request', [{ id: 'CC-INSUFFICIENT', orderId: 'CO-INSUFFICIENT', subOrderId: 'CSO-INSUFFICIENT', beneficiaryId: 'T002', beneficiaryLevel: 'level2' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-01T10:00:00.000Z' }], 30]
  ])('encodes only the newly consumed withdrawal key when it %s', async (_label, records, skippedAmount) => {
    const userId = `U-WITHDRAW-${_label}`
    writeCDistributorProfiles({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } })
    expect(writeCCommissionRecords(records)).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-SKIP-A', requesterType: 'user', requesterId: userId, amount: skippedAmount, method: '微信提现', status: 'approved', requestKey: 'WD-SKIP-A', createdAt: '2026-08-01T11:00:00.000Z' })).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-SKIP-B', requesterType: 'user', requesterId: userId, amount: 10, method: '微信提现', status: 'approved', requestKey: 'WD-SKIP-B', createdAt: '2026-08-01T12:00:00.000Z' })).toBe(true)
    const store = useUserStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: `openid-${userId}` }, commissionRecords: records })

    expect(await store.syncWithdrawals()).toBe(true)
    expect(readPlatformJournal()['withdrawal-sync:' + userId + ':WD-SKIP-B']).toMatchObject({ status: 'committed' })
  })
  it('buys a live package voucher and writes a pending promoter commission', async () => {
    const pkg = catalogProduct('PKG-LIVE', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    const store = allowedStore()
    store.$patch({ userId: 'U-VOUCHER', auth: { isLoggedIn: true, openid: 'openid-voucher' }, referralPromoterId: 'T002' })
    await store.initialize()
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: store.inventoryRevision + 1, products: [pkg] })
    store.applyCatalogState(readCatalogState()!)
    store.products = [catalogProductToProduct(pkg)]

    expect(await store.buyLivePackage('PKG-LIVE', 'PKG-LIVE-SKU', 1)).toBe(true)
    const voucher = Object.values(readPlatformVoucherOrders() || {})[0]
    expect(voucher).toMatchObject({ productId: 'PKG-LIVE', status: 'paid', promoterId: 'T002', providerTransactionId: expect.stringContaining('mock-pay-package-payment:') })
    expect(readPlatformCommissionLedger()?.[voucher.id + ':commission']).toMatchObject({ beneficiaryId: 'T002', farmId: 'F001', status: 'pending' })
  })

  it('uses the package SKU MOQ when quantity is omitted', async () => {
    const pkg = catalogProduct('PKG-MOQ', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'], skus: [{ id: 'PKG-MOQ-SKU', name: '三张起购', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 4, products: [pkg] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-MOQ', auth: { isLoggedIn: true, openid: 'openid-pkg-moq' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id, 2)).toBe(false)
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
    expect(readPlatformVoucherOrders()).toEqual(null)
    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(true)
    expect(Object.values(readPlatformVoucherOrders() || {})[0]).toMatchObject({ productId: pkg.id, quantity: 3, amount: 300 })
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(5)
  })

  it('does not reserve package stock or write voucher data when payment provider fails', async () => {
    const pkg = catalogProduct('PKG-PAY-FAIL', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 4, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-PAY-FAIL', auth: { isLoggedIn: true, openid: 'openid-pkg-pay-fail' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const before = {
      catalog: cloneSeed(readCatalogState()),
      vouchers: cloneSeed(readPlatformVoucherOrders() || {}),
      ledger: cloneSeed(readPlatformCommissionLedger() || {}),
      products: cloneSeed(store.products)
    }
    const createPayment = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'declined', message: '套餐支付失败' })
      .mockResolvedValueOnce({ ok: true, value: { transactionId: 'TX-AFTER-DECLINE' } })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id, 1)).toBe(false)
    const failedOperationId = (createPayment.mock.calls[0][0] as { operationId: string }).operationId
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, operationId: expect.stringContaining('package-payment:') }))
    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformVoucherOrders() || {}).toEqual(before.vouchers)
    expect(readPlatformCommissionLedger() || {}).toEqual(before.ledger)
    expect(store.products).toEqual(before.products)
    expect(store.checkoutError).toBe('套餐支付失败')
    expect(readUserCommercePurchaseIntents()).toEqual({})

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id, 1)).toBe(true)
    expect((createPayment.mock.calls[1][0] as { operationId: string }).operationId).not.toBe(failedOperationId)
    expect(Object.values(readPlatformVoucherOrders() || {})).toEqual([
      expect.objectContaining({ providerTransactionId: 'TX-AFTER-DECLINE' })
    ])
    expect(readUserCommercePurchaseIntents()).toEqual({})
  })

  it('reuses a persisted package purchase intent after reload and creates a new intent after success', async () => {
    const pkg = catalogProduct('PKG-INTENT', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 5, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-INTENT', auth: { isLoggedIn: true, openid: 'openid-pkg-intent' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const transactions = new Map<string, string>()
    const createPayment = vi.fn(async ({ operationId }: { operationId?: string }) => {
      const key = operationId || ''
      const transactionId = transactions.get(key) || `TX-${transactions.size + 1}`
      transactions.set(key, transactionId)
      return { ok: true as const, value: { transactionId } }
    })
    configurePlatformProviders({ payment: { createPayment } })
    let conflicted = false
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (!conflicted && createPayment.mock.calls.length > 0 && name.includes(PLATFORM_CATALOG_STORAGE_KEY)) {
        conflicted = true
        const changed = readCatalogState()!
        changed.products[0].skus[0].retailPrice = 150
        changed.revision += 1
        expect(writeCatalogState(changed, changed.revision - 1)).toBe(true)
      }
      return callback()
    } } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)
    const persistedIntent = Object.values(readUserCommercePurchaseIntents())[0]
    expect(persistedIntent).toMatchObject({ ownerUserId: 'U-PKG-INTENT', productId: pkg.id, skuId: pkg.skus[0].id, quantity: 1, amount: 100, operationId: expect.stringContaining('package-payment:') })
    expect(Object.keys(persistedIntent).sort()).toEqual(['amount', 'operationId', 'ownerUserId', 'productId', 'quantity', 'skuId'])
    setActivePinia(createPinia())
    const reloaded = allowedStore()
    reloaded.$patch({ userId: 'U-PKG-INTENT', auth: { isLoggedIn: true, openid: 'openid-pkg-intent' }, referralPromoterId: 'T002' })
    await reloaded.initialize()
    reloaded.refreshCatalog()
    reloaded.products = [catalogProductToProduct(readCatalogState()!.products[0])]
    expect(await reloaded.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(true)
    const firstTwo = createPayment.mock.calls.slice(0, 2).map(([input]) => input as { operationId: string; amount: number })
    expect(firstTwo[0].operationId).toBe(firstTwo[1].operationId)
    expect(firstTwo.map((input) => input.amount)).toEqual([100, 100])
    expect(transactions.size).toBe(1)
    expect(Object.values(readPlatformVoucherOrders() || {})[0]).toMatchObject({ amount: 100, providerTransactionId: 'TX-1' })
    expect(readUserCommercePurchaseIntents()).toEqual({})

    setActivePinia(createPinia())
    const nextPurchase = allowedStore()
    nextPurchase.$patch({ userId: 'U-PKG-INTENT', auth: { isLoggedIn: true, openid: 'openid-pkg-intent' }, referralPromoterId: 'T002' })
    await nextPurchase.initialize()
    nextPurchase.refreshCatalog()
    nextPurchase.products = [catalogProductToProduct(readCatalogState()!.products[0])]
    expect(await nextPurchase.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(true)
    expect((createPayment.mock.calls[2][0] as { operationId: string }).operationId).not.toBe(firstTwo[0].operationId)
    expect((createPayment.mock.calls[2][0] as { amount: number }).amount).toBe(150)
    expect(transactions.size).toBe(2)
    expect(Object.values(readPlatformVoucherOrders() || {}).map((voucher) => voucher.amount).sort((a, b) => a - b)).toEqual([100, 150])
    expect(readUserCommercePurchaseIntents()).toEqual({})
  })

  it('keeps a package intent after a lost payment response and reuses it after reload', async () => {
    const pkg = catalogProduct('PKG-REJECT', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-REJECT', auth: { isLoggedIn: true, openid: 'openid-pkg-reject' } })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const before = { pinia: cloneSeed(store.$state), catalog: cloneSeed(readCatalogState()), vouchers: cloneSeed(readPlatformVoucherOrders()), ledger: cloneSeed(readPlatformCommissionLedger()) }
    const transactions = new Map<string, string>()
    let loseResponse = true
    const createPayment = vi.fn(async ({ operationId }: { operationId?: string }) => {
      const key = operationId || ''
      const transactionId = transactions.get(key) || `TX-${transactions.size + 1}`
      transactions.set(key, transactionId)
      if (loseResponse) { loseResponse = false; throw new Error('response lost') }
      return { ok: true as const, value: { transactionId } }
    })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)
    expect(store.$state).toEqual({ ...before.pinia, checkoutError: '支付结果待确认，请重试查询' })
    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformVoucherOrders()).toEqual(before.vouchers)
    expect(readPlatformCommissionLedger()).toEqual(before.ledger)
    const pendingIntent = Object.values(readUserCommercePurchaseIntents())[0]
    expect(pendingIntent).toMatchObject({ ownerUserId: 'U-PKG-REJECT', productId: pkg.id, skuId: pkg.skus[0].id, quantity: 1, amount: 100 })

    setActivePinia(createPinia())
    const reloaded = allowedStore()
    reloaded.$patch({ userId: 'U-PKG-REJECT', auth: { isLoggedIn: true, openid: 'openid-pkg-reject' } })
    await reloaded.initialize()
    reloaded.products = [catalogProductToProduct(pkg)]

    expect(await reloaded.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(true)
    const calls = createPayment.mock.calls.map(([input]) => input as { operationId: string; amount: number })
    expect(calls.map((input) => input.operationId)).toEqual([pendingIntent.operationId, pendingIntent.operationId])
    expect(calls.map((input) => input.amount)).toEqual([100, 100])
    expect(transactions.size).toBe(1)
    expect(Object.values(readPlatformVoucherOrders() || {})).toEqual([
      expect.objectContaining({ providerTransactionId: 'TX-1', amount: 100 })
    ])
    expect(readUserCommercePurchaseIntents()).toEqual({})
  })

  it('keeps the old package intent and stops retries when explicit failure cleanup cannot be written', async () => {
    const pkg = catalogProduct('PKG-CLEANUP-WRITE-FAIL', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-CLEANUP-WRITE-FAIL', auth: { isLoggedIn: true, openid: 'openid-pkg-cleanup-write-fail' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const before = { pinia: cloneSeed(store.$state), catalog: cloneSeed(readCatalogState()), vouchers: cloneSeed(readPlatformVoucherOrders()), ledger: cloneSeed(readPlatformCommissionLedger()) }
    let paymentFinished = false
    const createPayment = vi.fn(async (_input: { operationId?: string }) => {
      paymentFinished = true
      return { ok: false as const, code: 'declined', message: '套餐支付失败' }
    })
    configurePlatformProviders({ payment: { createPayment } })
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (paymentFinished && key === PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY) throw new Error('quota')
      originalSetItem(key, value)
    }) as Storage['setItem']

    try {
      expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    const operationId = (createPayment.mock.calls[0][0] as { operationId: string }).operationId
    expect(store.$state).toEqual({ ...before.pinia, checkoutError: '支付失败记录未清理，请停止重试并联系平台' })
    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformVoucherOrders()).toEqual(before.vouchers)
    expect(readPlatformCommissionLedger()).toEqual(before.ledger)
    expect(readUserCommercePurchaseIntents()).toEqual({
      [operationId]: expect.objectContaining({ operationId, amount: 100 })
    })
  })

  it('keeps the old package intent when explicit failure cleanup repeatedly conflicts', async () => {
    const pkg = catalogProduct('PKG-CLEANUP-CONFLICT', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-CLEANUP-CONFLICT', auth: { isLoggedIn: true, openid: 'openid-pkg-cleanup-conflict' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const before = { pinia: cloneSeed(store.$state), catalog: cloneSeed(readCatalogState()), vouchers: cloneSeed(readPlatformVoucherOrders()), ledger: cloneSeed(readPlatformCommissionLedger()) }
    const createPayment = vi.fn().mockResolvedValue({ ok: false, code: 'declined', message: '套餐支付失败' })
    configurePlatformProviders({ payment: { createPayment } })
    let cleanupConflicts = 0
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (createPayment.mock.calls.length > 0 && name === `agritainment-platform:${PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY}`) {
        cleanupConflicts += 1
        expect(writeUserCommercePurchaseIntents(readUserCommercePurchaseIntents())).toBe(true)
      }
      return callback()
    } } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)

    const operationId = (createPayment.mock.calls[0][0] as { operationId: string }).operationId
    expect(cleanupConflicts).toBe(3)
    expect(store.$state).toEqual({ ...before.pinia, checkoutError: '支付失败记录未清理，请停止重试并联系平台' })
    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformVoucherOrders()).toEqual(before.vouchers)
    expect(readPlatformCommissionLedger()).toEqual(before.ledger)
    expect(readUserCommercePurchaseIntents()).toEqual({
      [operationId]: expect.objectContaining({ operationId, amount: 100 })
    })
  })

  it('does not delete a different valid package intent stored under the same key', async () => {
    const pkg = catalogProduct('PKG-CLEANUP-REPLACED', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PKG-CLEANUP-REPLACED', auth: { isLoggedIn: true, openid: 'openid-pkg-cleanup-replaced' } })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const createPayment = vi.fn().mockResolvedValue({ ok: false, code: 'declined', message: '套餐支付失败' })
    configurePlatformProviders({ payment: { createPayment } })
    let replaced = false
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      if (!replaced && createPayment.mock.calls.length > 0 && name === `agritainment-platform:${PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY}`) {
        replaced = true
        const operationId = (createPayment.mock.calls[0][0] as { operationId: string }).operationId
        const original = readUserCommercePurchaseIntents()[operationId]
        expect(writeUserCommercePurchaseIntents({ [operationId]: { ...original, amount: 125 } })).toBe(true)
      }
      return callback()
    } } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)

    const operationId = (createPayment.mock.calls[0][0] as { operationId: string }).operationId
    expect(store.checkoutError).toBe('支付失败记录未清理，请停止重试并联系平台')
    expect(readUserCommercePurchaseIntents()).toEqual({
      [operationId]: expect.objectContaining({ operationId, amount: 125 })
    })
    expect(readPlatformVoucherOrders() || {}).toEqual({})
    expect(readPlatformCommissionLedger() || {}).toEqual({})
  })

  it('does not pass a corrupted persisted package operationId to the payment provider', async () => {
    const pkg = catalogProduct('PKG-CORRUPT-INTENT', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [pkg] })
    localStorage.setItem(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, JSON.stringify({
      evil: { ownerUserId: 'U-CORRUPT-INTENT', productId: pkg.id, skuId: pkg.skus[0].id, quantity: 1, amount: 100, operationId: 'javascript:alert(1)' }
    }))
    const store = allowedStore()
    store.$patch({ userId: 'U-CORRUPT-INTENT', auth: { isLoggedIn: true, openid: 'openid-corrupt-intent' } })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    const createPayment = vi.fn().mockResolvedValue({ ok: false, code: 'declined', message: '支付失败' })
    configurePlatformProviders({ payment: { createPayment } })

    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(false)
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ operationId: expect.stringMatching(/^package-payment:[A-Za-z0-9._-]+$/), amount: 100 }))
    expect((createPayment.mock.calls[0][0] as { operationId: string }).operationId).not.toBe('javascript:alert(1)')
  })

  it('rejects a checkout recovery target that tampers with the persisted order amount', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-CHECKOUT-RECOVERY-TAMPER', auth: { isLoggedIn: true, openid: 'openid-checkout-recovery-tamper' } })
    await store.initialize()
    store.setAddress({ receiver: '恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `${order.id}:reserve`
    const journals = readPlatformJournal()
    const target = cloneSeed(journals[operationId].target) as { orders: Record<string, { amount: number }> }
    target.orders[order.id].amount = 0.01
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({
      ...journals,
      [operationId]: { ...journals[operationId], target, status: 'recovery-pending' }
    }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'tampered checkout amount', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)
    const before = { catalog: readCatalogState(), orders: readCOrders(), commissions: readCCommissionRecords(), bindings: readUserBindings() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ catalog: readCatalogState(), orders: readCOrders(), commissions: readCCommissionRecords(), bindings: readUserBindings() }).toEqual(before)
  })

  it('rejects a payment recovery target that tampers with paid order financial fields', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-PAYMENT-RECOVERY-TAMPER', auth: { isLoggedIn: true, openid: 'openid-payment-recovery-tamper' } })
    await store.initialize()
    store.setAddress({ receiver: '支付恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const operationId = `payment:${order.id}`
    const journals = readPlatformJournal()
    const target = cloneSeed(journals[operationId].target) as { orders: Record<string, { amount: number; providerTransactionId?: string }> }
    target.orders[order.id].amount = 0.01
    target.orders[order.id].providerTransactionId = 'TX-EVIL'
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({
      ...journals,
      [operationId]: { ...journals[operationId], target, status: 'recovery-pending' }
    }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'tampered payment target', handlerKey: 'user-payment-v1' })).toBe(true)
    const before = { orders: readCOrders(), supplierOrders: readPlatformOrders(), ledger: readPlatformCommissionLedger() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ orders: readCOrders(), supplierOrders: readPlatformOrders(), ledger: readPlatformCommissionLedger() }).toEqual(before)
  })

  it('rejects a package recovery target that tampers with voucher financial fields', async () => {
    const pkg = catalogProduct('PKG-RECOVERY-TAMPER', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [pkg] })
    const store = allowedStore()
    store.$patch({ userId: 'U-PACKAGE-RECOVERY-TAMPER', auth: { isLoggedIn: true, openid: 'openid-package-recovery-tamper' }, referralPromoterId: 'T002' })
    await store.initialize()
    store.products = [catalogProductToProduct(pkg)]
    expect(await store.buyLivePackage(pkg.id, pkg.skus[0].id)).toBe(true)
    const voucher = Object.values(readPlatformVoucherOrders() || {})[0]
    const operationId = Object.keys(readPlatformJournal()).find((key) => key.startsWith('package-payment:'))!
    const journals = readPlatformJournal()
    const target = cloneSeed(journals[operationId].target) as { vouchers: Record<string, { amount: number; providerTransactionId?: string }> }
    target.vouchers[voucher.id].amount = 0.01
    target.vouchers[voucher.id].providerTransactionId = 'TX-EVIL'
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({
      ...journals,
      [operationId]: { ...journals[operationId], target, status: 'recovery-pending' }
    }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'tampered package target', handlerKey: 'user-package-v1' })).toBe(true)
    const before = { catalog: readCatalogState(), vouchers: readPlatformVoucherOrders(), ledger: readPlatformCommissionLedger() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ catalog: readCatalogState(), vouchers: readPlatformVoucherOrders(), ledger: readPlatformCommissionLedger() }).toEqual(before)
  })

  it('does not roll back a valid checkout journal over a later unrelated order write', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-STALE-RECOVERY', auth: { isLoggedIn: true, openid: 'openid-stale-recovery' } })
    await store.initialize()
    store.setAddress({ receiver: '过期恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const operationId = `${order.id}:reserve`
    const unrelated = { ...cloneSeed(order), id: 'CO-LATER-UNRELATED', userId: 'U-LATER-UNRELATED', address: { ...cloneSeed(order.address), id: 'ADDR-LATER', userId: 'U-LATER-UNRELATED' } }
    expect(writeCOrders({ ...(readCOrders() || {}), [unrelated.id]: unrelated })).toBe(true)
    const journals = readPlatformJournal()
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({
      ...journals,
      [operationId]: { ...journals[operationId], status: 'recovery-pending' }
    }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'stale recovery snapshot', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)
    const before = { catalog: readCatalogState(), orders: readCOrders(), commissions: readCCommissionRecords(), bindings: readUserBindings() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ catalog: readCatalogState(), orders: readCOrders(), commissions: readCCommissionRecords(), bindings: readUserBindings() }).toEqual(before)
  })

  it('does not roll back a receipt recovery over a later unrelated order write', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECEIPT-STALE')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-RECEIPT-STALE', auth: { isLoggedIn: true, openid: 'openid-receipt-stale' } })
    await store.initialize()
    store.setAddress({ receiver: '收货恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('RECEIPT-STALE', 'RECEIPT-STALE-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    expect(await store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    const operationId = `receipt:${order.id}:${sub.id}`
    const unrelated = { ...cloneSeed(readCOrders()![order.id]), id: 'CO-LATER-RECEIPT', userId: 'U-LATER-RECEIPT', address: { ...cloneSeed(order.address), id: 'ADDR-LATER-RECEIPT', userId: 'U-LATER-RECEIPT' } }
    expect(writeCOrders({ ...(readCOrders() || {}), [unrelated.id]: unrelated })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'stale receipt recovery', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)
    const before = { orders: readCOrders(), commissions: readCCommissionRecords(), supplierOrders: readPlatformOrders() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ orders: readCOrders(), commissions: readCCommissionRecords(), supplierOrders: readPlatformOrders() }).toEqual(before)
  })

  it('does not roll back an after-sale recovery over a later unrelated order write', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('AFTER-SALE-STALE')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-AFTER-SALE-STALE', auth: { isLoggedIn: true, openid: 'openid-after-sale-stale' } })
    await store.initialize()
    store.setAddress({ receiver: '售后恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('AFTER-SALE-STALE', 'AFTER-SALE-STALE-SKU')
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(await store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    expect(await store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    const operationId = `after-sale:${sub.id}`
    const unrelated = { ...cloneSeed(readCOrders()![order.id]), id: 'CO-LATER-AFTER-SALE', userId: 'U-LATER-AFTER-SALE', address: { ...cloneSeed(order.address), id: 'ADDR-LATER-AFTER-SALE', userId: 'U-LATER-AFTER-SALE' } }
    expect(writeCOrders({ ...(readCOrders() || {}), [unrelated.id]: unrelated })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'stale after-sale recovery', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)
    const before = { afterSales: readPlatformAfterSales(), orders: readCOrders(), commissions: readCCommissionRecords(), supplierOrders: readPlatformOrders() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ afterSales: readPlatformAfterSales(), orders: readCOrders(), commissions: readCCommissionRecords(), supplierOrders: readPlatformOrders() }).toEqual(before)
  })

  it('does not roll back a withdrawal recovery over a later unrelated order write', async () => {
    const userId = 'U-WITHDRAW-STALE'
    const store = allowedStore()
    store.$patch({ userId, auth: { isLoggedIn: true, openid: 'openid-withdraw-stale' } })
    await store.initialize()
    const allocation = { id: 'CC-WITHDRAW-STALE', orderId: 'CO-WITHDRAW-STALE', subOrderId: 'CSO-WITHDRAW-STALE', beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 0.3, status: 'available' as const, createdAt: '2026-08-01T00:00:00.000Z' }
    const item = { productId: 'P-WITHDRAW-STALE', skuId: 'SKU-WITHDRAW-STALE', name: '提现商品', skuName: '规格', image: '', quantity: 1, unitPrice: 1, basePrice: 0.7, level1Commission: 0.3, level2Commission: 0, supplierId: 'S001' }
    const order = {
      id: allocation.orderId, userId, level: 'normal' as const,
      address: { id: 'ADDR-WITHDRAW-STALE', userId, receiver: '提现恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 1, items: [item], subOrders: [{ id: allocation.subOrderId, supplierId: 'S001', supplierName: '供应商', items: [item], amount: 1, status: 'received' as const, logistics: [] }],
      commissionAllocations: [allocation], status: 'received' as const, createdAt: '2026-08-01T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([allocation])).toBe(true)
    expect(writePlatformWithdrawal({ id: 'WD-WITHDRAW-STALE', requesterType: 'user', requesterId: userId, amount: 0.1, method: '微信提现', status: 'approved', requestKey: 'WD-WITHDRAW-STALE', createdAt: '2026-08-01T01:00:00.000Z' })).toBe(true)
    const original = { variant: 'withdrawal', ownerUserId: userId, orders: readCOrders()!, commissions: readCCommissionRecords()!, withdrawals: readPlatformWithdrawals()! }
    const current = { ...allocation, amount: 0.2 }
    const split = { ...allocation, id: `${allocation.id}:withdrawn:WD-WITHDRAW-STALE`, amount: 0.1, status: 'withdrawn' as const, withdrawalRequestKeys: ['WD-WITHDRAW-STALE'] }
    const target = { ...cloneSeed(original), orders: { [order.id]: { ...cloneSeed(original.orders[order.id]), commissionAllocations: [current, split] } }, commissions: [current, split] }
    const operationId = `withdrawal-sync:${userId}:WD-WITHDRAW-STALE`
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_C_COMMISSIONS_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY], original, target, recoveryHandlerKey: 'user-commerce-recovery-v1', recoverySchema: 'user-commerce-snapshot-v1' })).toBe(true)
    expect(writeCOrders({ ...target.orders, 'CO-LATER-WITHDRAWAL': { ...cloneSeed(original.orders[order.id]), id: 'CO-LATER-WITHDRAWAL', userId: 'U-LATER-WITHDRAWAL', address: { ...cloneSeed(order.address), id: 'ADDR-LATER-WITHDRAWAL', userId: 'U-LATER-WITHDRAWAL' } } })).toBe(true)
    expect(writeCCommissionRecords(target.commissions)).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'stale withdrawal recovery', handlerKey: 'user-commerce-recovery-v1' })).toBe(true)
    const before = { orders: readCOrders(), commissions: readCCommissionRecords(), withdrawals: readPlatformWithdrawals() }

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect({ orders: readCOrders(), commissions: readCCommissionRecords(), withdrawals: readPlatformWithdrawals() }).toEqual(before)
  })

  it('rolls back a live voucher atomically and reuses its provider operation on retry', async () => {
    const pkg = catalogProduct('PKG-RECOVER', { productType: 'package', channel: 'store', expressDelivery: false, farmIds: ['F001'] })
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [pkg] })
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: pkg.id, listed: true, skuRetailPrices: { 'PKG-RECOVER-SKU': 100 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    const store = allowedStore()
    store.$patch({ userId: 'U-VOUCHER-RECOVER', auth: { isLoggedIn: true, openid: 'openid-voucher-recover' }, referralPromoterId: 'T002' })
    await store.initialize()
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key.includes('platform-vouchers')) { failed = true; throw new Error('quota') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(await store.buyLivePackage('PKG-RECOVER', 'PKG-RECOVER-SKU')).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(readPendingCatalogTransactions('user')).toEqual([])
    expect(readPlatformVoucherOrders() || {}).toEqual({})

    expect(await store.buyLivePackage('PKG-RECOVER', 'PKG-RECOVER-SKU')).toBe(true)
    const voucher = Object.values(readPlatformVoucherOrders() || {})[0]
    expect(voucher).toMatchObject({ productId: 'PKG-RECOVER', status: 'paid', promoterId: 'T002' })
    expect(readPlatformCommissionLedger()?.[voucher.id + ':commission']).toMatchObject({ beneficiaryId: 'T002', farmId: 'F001', status: 'pending' })
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
  })
  it('seeds demo C orders and voucher orders once when enabled', async () => {
    localStorage.removeItem('agritainment-user-demo-orders-disabled')
    const store = allowedStore()
    store.$patch({ userId: 'U-DEMO-SEED', auth: { isLoggedIn: true, openid: 'openid-demo-seed' } })
    store.seedDemoData()
    await store.initialize()
    const demoOrders = store.orders.filter((item) => item.id.startsWith('DEMO-ORD'))
    const demoVouchers = store.vouchers.filter((item) => item.id.startsWith('DEMO-VOUCHER'))
    expect(demoOrders).toHaveLength(4)
    expect(demoOrders.map((item) => item.status)).toEqual(expect.arrayContaining(['pending_payment', 'paid', 'shipped', 'partially_after_sale']))
    expect(demoOrders.every((item) => item.userId === 'U-DEMO-SEED' && item.address.userId === 'U-DEMO-SEED')).toBe(true)
    expect(demoOrders.every((item) => item.subOrders.length >= 1 && item.subOrders.length <= 2)).toBe(true)
    expect(demoOrders.flatMap((item) => item.subOrders).every((item) => item.logistics.length > 0)).toBe(true)
    expect(demoOrders.flatMap((item) => item.items).every((item) => normalizeMediaReference(item.image) !== null)).toBe(true)
    expect(demoVouchers).toHaveLength(2)
    expect(demoVouchers.some((item) => item.status === 'paid')).toBe(true)
    expect(demoVouchers.some((item) => item.status === 'refunded' && item.redeemedAt && item.refundedAt)).toBe(true)
    expect(Object.values(readPlatformOrders() || {}).some((item) => item.supplierOrderLink?.source === 'c-mall' && item.supplierOrderLink.sourceOrderId?.startsWith('DEMO-ORD'))).toBe(false)
    const countAfterReload = store.orders.filter((item) => item.id.startsWith('DEMO-ORD')).length
    await store.initialize(true)
    expect(store.orders.filter((item) => item.id.startsWith('DEMO-ORD')).length).toBe(countAfterReload)
  })

  it('hides a listed store package when every SKU is out of stock', async () => {
    const soldOut = catalogProduct('PKG-SOLD-OUT', {
      productType: 'package', channel: 'store', expressDelivery: false,
      skus: [{ id: 'PKG-SOLD-OUT-SKU', name: '售罄规格', image: '', retailPrice: 88, cost: 50, stock: 0, level1Amount: 8, level2Amount: 12 }]
    })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [soldOut] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: soldOut.id, listed: true, skuRetailPrices: { 'PKG-SOLD-OUT-SKU': 88 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()

    expect(readStorePackageProjection()).toEqual([])
  })

  it('exposes a listed store package with saleable stock to the user catalog', async () => {
    const store = allowedStore()
    await store.initialize()
    const farm = store.farms[0]
    const pkg = catalogProduct('PKG-AVAILABLE', {
      productType: 'package', channel: 'store', expressDelivery: false, farmIds: [farm.id]
    })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [pkg] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: farm.id, productId: pkg.id, listed: true, skuRetailPrices: { 'PKG-AVAILABLE-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()

    expect(readStorePackageProjection().map((item) => item.id)).toEqual([pkg.id])
  })

  it('keeps each users demo orders isolated when a second user is seeded', async () => {
    localStorage.removeItem('agritainment-user-demo-orders-disabled')
    const first = allowedStore()
    first.$patch({ userId: 'U-DEMO-FIRST', auth: { isLoggedIn: true, openid: 'openid-demo-first' } })
    first.seedDemoData()
    await first.initialize()

    setActivePinia(createPinia())
    const second = allowedStore()
    second.$patch({ userId: 'U-DEMO-SECOND', auth: { isLoggedIn: true, openid: 'openid-demo-second' } })
    second.seedDemoData()
    await second.initialize()

    const orders = Object.values(readCOrders() || {})
    expect(orders.filter((item) => item.userId === 'U-DEMO-FIRST')).toHaveLength(4)
    expect(orders.filter((item) => item.userId === 'U-DEMO-SECOND')).toHaveLength(4)
  })
  describe('分销角色演示切换', () => {
    it('切到一级/二级分销商会写入当前用户分销档案并解除 entry 限制', () => {
      const store = allowedStore()
      store.setDemoDistributorLevel('level1')
      expect(store.level).toBe('level1')
      expect(store.currentDistributor?.promoterId).toBe('T001')
      expect(store.entryRestricted).toBe(false)
      store.setDemoDistributorLevel('level2')
      expect(store.level).toBe('level2')
      expect(store.currentDistributor?.promoterId).toBe('T002')
      expect(store.currentDistributor?.parentPromoterId).toBe('T001')
    })

    it('切回普通用户移除档案并恢复普通用户身份', () => {
      const store = allowedStore()
      store.setDemoDistributorLevel('level1')
      expect(store.level).toBe('level1')
      store.setDemoDistributorLevel('normal')
      expect(store.level).toBe('normal')
      expect(store.currentDistributor).toBeNull()
    })

    it('重复切换不产生多余分销档案', () => {
      const store = allowedStore()
      store.setDemoDistributorLevel('level1')
      store.setDemoDistributorLevel('level1')
      const profiles = readCDistributorProfiles() || {}
      expect(Object.values(profiles).filter((item) => item.userId === store.userId)).toHaveLength(1)
    })
  })
})
