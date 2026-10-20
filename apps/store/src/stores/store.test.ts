import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CatalogState } from '@agritainment/shared'
import { applyCatalogStockOperation, catalogProductToProduct, cloneSeed, enqueuePlatformRecovery, markCatalogTransactionStockApplied, prepareCatalogTransaction, readCatalogState, readPendingCatalogTransactions, readPlatformAfterSales, readPlatformEntities, readPlatformOrders, readPlatformRecoveryQueue, retryPlatformRecoveryTask, storeAccounts, suppliers, updateCatalogStock, upsertPlatformEntity, upsertStoreCatalogSelection, writeCatalogState, writePlatformOrder, writePlatformStoreAccounts } from '@agritainment/shared'
import { deriveStoreMetrics, storeCatalog } from '../services/repository'
import { useStoreStore } from './store'
import * as shared from '@agritainment/shared'

const catalogProduct = (input: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'channel'>): CatalogProduct => ({
  id: input.id,
  name: input.name || input.id,
  category: input.category || '测试分类',
  supplierId: input.supplierId || 'S-TEST',
  supplierName: input.supplierName || '测试供应商',
  source: 'platform',
  status: input.status || 'active',
  image: '/static/images/field.webp',
  images: [],
  tags: [],
  productType: input.productType || 'goods',
  expressDelivery: input.expressDelivery ?? input.channel !== 'store',
  channel: input.channel,
  farmIds: [],
  promoterCommissionRate: 5,
  storeCommissionRate: 3,
  skus: input.skus || [{ id: `${input.id}-SKU`, name: '默认规格', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15 }]
})

const writeCatalog = (products: CatalogProduct[], revision = 0) => {
  const state: CatalogState = { schemaVersion: 1, revision, products }
  expect(writeCatalogState(state)).toBe(true)
  return state
}

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


describe('store ordering store interactions', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals() })

  it('renders MOQ states and blocks unavailable procurement checkout in the store page', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    expect(source).toContain('minimumOrderQuantity(')
    expect(source).toContain('库存不足或购买数量未达要求')
    expect(source).toContain(':disabled="!canStartOrder(selectedSku)"')
    expect(source).toContain(':class="{ shortage: item.unavailable, selected: store.isCheckoutSelected(item) }"')
    expect(source).toContain(':disabled="!store.checkoutCount || store.checkoutHasUnavailable"')
  })

  it('keeps procurement snapshots unchanged when catalog revision changes after the lock request', async () => {
    writeCatalog([catalogProduct({ id: 'LOCK-CONFLICT', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    const beforeMemory = { cart: cloneSeed(store.cart), orders: cloneSeed(store.orders), products: cloneSeed(store.products) }
    const changed = cloneSeed(readCatalogState()!)
    changed.revision += 1
    changed.products[0].skus[0].stock = 6
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writeCatalogState(changed)).toBe(true)
      }
      return callback()
    } } })

    expect(await store.submitOrder()).toBe(null)

    expect(readCatalogState()).toEqual(changed)
    expect(readPlatformOrders()).toEqual(null)
    expect(store.cart).toEqual(beforeMemory.cart)
    expect(store.orders).toEqual(beforeMemory.orders)
    expect(store.products).toEqual(beforeMemory.products)
  })

  it('keeps procurement snapshots unchanged when pricing changes after the lock request', async () => {
    const product = catalogProduct({
      id: 'PRICE-LOCK-CONFLICT',
      channel: 'store',
      category: '价格并发测试',
      skus: [{ id: 'PRICE-LOCK-CONFLICT-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10 }]
    })
    writeCatalog([product])
    expect(upsertPlatformEntity('policies', 'PRICE-LOCK-POLICY', {
      id: 'PRICE-LOCK-POLICY', name: '价格并发阶梯价', type: 'ladder', scope: '价格并发测试类目', discount: 20, enabled: true,
      tiers: [{ minQty: 1, maxQty: null, price: 80, discountOff: 20 }]
    })).toBe(true)
    const store = useStoreStore()
    await store.initialize()
    expect(store.addToCart(store.products[0], product.skus[0].id, 10)).toBe('added')
    const beforeMemory = { cart: cloneSeed(store.cart), orders: cloneSeed(store.orders), products: cloneSeed(store.products) }
    const beforeCatalog = cloneSeed(readCatalogState())
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(upsertPlatformEntity('policies', 'PRICE-LOCK-POLICY', {
          id: 'PRICE-LOCK-POLICY', name: '价格并发阶梯价', type: 'ladder', scope: '价格并发测试类目', discount: 30, enabled: true,
          tiers: [{ minQty: 1, maxQty: null, price: 70, discountOff: 30 }]
        })).toBe(true)
      }
      return callback()
    } } })

    expect(await store.submitOrder()).toBe(null)

    expect(readCatalogState()).toEqual(beforeCatalog)
    expect(readPlatformOrders()).toEqual(null)
    expect(store.cart).toEqual(beforeMemory.cart)
    expect(store.orders).toEqual(beforeMemory.orders)
    expect(store.products).toEqual(beforeMemory.products)
  })

  it('rolls back procurement storage and Pinia when platform order persistence fails', async () => {
    writeCatalog([catalogProduct({ id: 'ORDER-WRITE-FAIL', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    const before = { catalog: cloneSeed(readCatalogState()), orders: cloneSeed(readPlatformOrders()), cart: cloneSeed(store.cart), memoryOrders: cloneSeed(store.orders), products: cloneSeed(store.products) }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-orders') throw new Error('platform order unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.submitOrder()).toBe(null)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformOrders()).toEqual(before.orders)
    expect(store.cart).toEqual(before.cart)
    expect(store.orders).toEqual(before.memoryOrders)
    expect(store.products).toEqual(before.products)
  })

  it('initializes ordering products from active store and all catalog channels', async () => {
    writeCatalog([
      catalogProduct({ id: 'STORE', channel: 'store' }),
      catalogProduct({ id: 'ALL', channel: 'all' }),
      catalogProduct({ id: 'LIVE', channel: 'live' }),
      catalogProduct({ id: 'OFFLINE', channel: 'store', status: 'offline' })
    ], 4)
    const store = useStoreStore()

    await store.initialize()

    expect(store.products.map((item) => item.id)).toEqual(['STORE', 'ALL'])
    expect(store.catalogRevision).toBe(4)
  })

  it('submits orders through the shared catalog stock transaction', async () => {
    writeCatalog([catalogProduct({ id: 'ORDERING', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])

    expect(await store.submitOrder()).toBeTruthy()
    expect(readCatalogState()).toMatchObject({ revision: 1, products: [{ id: 'ORDERING', skus: [{ id: 'ORDERING-SKU', stock: 7 }] }] })
    expect(store.catalogRevision).toBe(1)
  })

  it('keeps the current store order after a forced shared-state refresh', async () => {
    writeCatalog([catalogProduct({ id: 'REFRESHED-ORDER', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const orderId = store.orders[0].id

    await store.initialize(true)

    expect(store.orders[0].id).toBe(orderId)
    expect(store.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: orderId, farmId: 'F001', status: 'pending-payment' })
    ]))
  })

  it('blocks store procurement when the supplier is paused', async () => {
    writeCatalog([catalogProduct({ id: 'SUPPLIER-GUARD', channel: 'store', supplierId: 'S002', supplierName: suppliers[1].name })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    expect(upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'paused', cooperationPauseReason: '暂停接单' })).toBe(true)

    expect(await store.submitOrder()).toBe(null)
    expect(store.checkoutError).toBe('湘西腊味合作社已暂停接单，请选择其他商品')
    expect(store.cart).toHaveLength(1)
  })

  it('does not replay a legacy catalog ordering journal during initialize', async () => {
    writeCatalog([catalogProduct({ id: 'ORDER-RECOVER', channel: 'store' })])
    const order = { id: 'SO-RECOVER', amount: 20, saved: 25, itemCount: 1, status: 'submitted' as const, createdAt: '2026-08-24 12:00', logistics: [], items: [{ productId: 'ORDER-RECOVER', skuId: 'ORDER-RECOVER-SKU', name: '恢复进货单', skuName: '默认规格', image: '', quantity: 1, price: 20 }] }
    const inventoryChanges = [{ productId: 'ORDER-RECOVER', skuId: 'ORDER-RECOVER-SKU', quantity: -1 }]
    expect(prepareCatalogTransaction({ id: 'SO-RECOVER:reserve', channel: 'store', action: 'reserve', inventoryChanges, payload: { order } })).toBe(true)
    expect(applyCatalogStockOperation('SO-RECOVER:reserve', inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied('SO-RECOVER:reserve')).toBe(true)
    const store = useStoreStore()
    store.orders = []

    await store.initialize()

    expect(store.orders.some((item) => item.id === order.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPendingCatalogTransactions('store')).toEqual([expect.objectContaining({ id: 'SO-RECOVER:reserve', status: 'stock-applied' })])
  })

  it('exposes the checkout saving amount for the selected lines', async () => {
    const store = useStoreStore()
    await store.initialize()
    const product = store.products[0]
    store.addToCart(product, product.skus[0].id)
    expect(store.cart).toHaveLength(1)
    const line = store.cart[0]
    store.$patch({ checkoutLineKeys: [`${line.productId}:${line.skuId}`] })
    expect(store.checkoutSaved).toBe(Math.round((line.retail - line.price) * line.quantity * 100) / 100)
    store.$patch({ checkoutLineKeys: [] })
    expect(store.checkoutSaved).toBe(0)
  })

  it('replays a prepared catalog ordering journal through the store recovery entry point', async () => {
    writeCatalog([catalogProduct({ id: 'ORDER-RECOVER-ENTRY', channel: 'store' })])
    const order = { id: 'SO-RECOVER-ENTRY', amount: 20, saved: 25, itemCount: 1, status: 'submitted' as const, createdAt: '2026-08-24 12:00', logistics: [], items: [{ productId: 'ORDER-RECOVER-ENTRY', skuId: 'ORDER-RECOVER-ENTRY-SKU', name: '恢复订单', skuName: '默认规格', image: '', quantity: 1, price: 20 }] }
    const inventoryChanges = [{ productId: 'ORDER-RECOVER-ENTRY', skuId: 'ORDER-RECOVER-ENTRY-SKU', quantity: -1 }]
    expect(prepareCatalogTransaction({ id: 'SO-RECOVER-ENTRY:reserve', channel: 'store', action: 'reserve', inventoryChanges, payload: { order } })).toBe(true)
    const store = useStoreStore()
    await store.initialize()
    store.orders = []

    store.recoverCatalogTransactions()

    expect(store.orders.some((item) => item.id === order.id)).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPendingCatalogTransactions('store')).toEqual([])
    expect(Object.values(readPlatformOrders() || {}).some((platformOrder) => platformOrder.supplierOrderLink?.sourceOrderId === order.id)).toBe(true)
  })

  it('does not replay a legacy catalog return journal during initialize', async () => {
    writeCatalog([catalogProduct({ id: 'RETURN-RECOVER', channel: 'store' })])
    const order = {
      id: 'SO-RETURN-RECOVER', amount: 20, saved: 25, itemCount: 1, status: 'received' as const,
      createdAt: '2026-08-24 12:00', logistics: [], inventoryReleased: true, afterSaleType: 'return' as const,
      items: [{ productId: 'RETURN-RECOVER', skuId: 'RETURN-RECOVER-SKU', name: '恢复退货单', skuName: '默认规格', image: '', quantity: 1, price: 20 }]
    }
    const afterSale = {
      id: 'AS-RETURN-RECOVER', orderId: order.id, productName: order.items[0].name, applicant: '石板溪农庄',
      type: 'return' as const, amount: order.amount, status: 'refunded' as const,
      history: [{ time: '2026-08-24 12:30', action: '退货确认完成，库存已回补', operator: '石板溪农庄' }]
    }
    localStorage.setItem('agritainment-platform-after-sales', JSON.stringify({ [afterSale.id]: { ...afterSale, status: 'return-pending' } }))
    const inventoryChanges = [{ productId: 'RETURN-RECOVER', skuId: 'RETURN-RECOVER-SKU', quantity: 1 }]
    expect(prepareCatalogTransaction({
      id: `${order.id}:return-release`, channel: 'store', action: 'release', inventoryChanges, payload: { order, afterSale }
    })).toBe(true)
    expect(applyCatalogStockOperation(`${order.id}:return-release`, inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied(`${order.id}:return-release`)).toBe(true)
    const store = useStoreStore()
    store.orders = []

    await store.initialize()

    expect(store.orders.some((item) => item.id === order.id)).toBe(false)
    expect(readPlatformAfterSales()?.[afterSale.id]).toMatchObject({ status: 'return-pending' })
    expect(readPendingCatalogTransactions('store')).toEqual([expect.objectContaining({ id: `${order.id}:return-release`, status: 'stock-applied' })])
  })

  it('refreshes externally maintained catalog inventory', async () => {
    writeCatalog([catalogProduct({ id: 'CONFLICT', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    expect(updateCatalogStock([{ productId: 'CONFLICT', skuId: 'CONFLICT-SKU', quantity: -1 }], 0)?.revision).toBe(1)

    store.refreshCatalog()

    expect(store.catalogRevision).toBe(1)
    expect(store.products[0].skus[0].stock).toBe(7)
    expect(store.checkoutError).toBe('')
  })

  it('adds single-SKU products directly and requires SKU selection for multi-SKU', () => {
    const store = useStoreStore()
    store.$patch({ products: cloneSeed(storeCatalog), cart: [], checkoutError: '' })
    const tea = store.products.find((item) => item.id === 'P003')!
    const bacon = store.products.find((item) => item.id === 'P001')!
    expect(store.addToCart(tea)).toBe('added')
    expect(store.addToCart(bacon)).toBe('sku-required')
    expect(store.cartCount).toBe(1)
    expect(store.cartTotal).toBe(tea.skus[0].cost)
    expect(store.cart[0].retail).toBe(tea.price)
  })

  it('adds an explicit SKU quantity and prices the accumulated line by its ladder tier', () => {
    const product = catalogProduct({
      id: 'TIER-ADD',
      channel: 'store',
      category: '测试阶梯',
      skus: [{ id: 'TIER-ADD-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10, minimumOrderQuantity: 2 }]
    })
    expect(upsertPlatformEntity('policies', 'TIER-ADD-POLICY', {
      id: 'TIER-ADD-POLICY', name: '测试阶梯价', type: 'ladder', scope: '测试阶梯类目', discount: 20, enabled: true,
      tiers: [
        { minQty: 1, maxQty: 9, price: 90, discountOff: 10 },
        { minQty: 10, maxQty: null, price: 80, discountOff: 20 }
      ]
    })).toBe(true)
    const store = useStoreStore()
    const orderingProduct = catalogProductToProduct(product)
    store.$patch({ products: [orderingProduct], cart: [], checkoutError: '' })

    expect(store.addToCart(orderingProduct, 'TIER-ADD-SKU', 6)).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 6, price: 90 })
    expect(store.addToCart(orderingProduct, 'TIER-ADD-SKU', 4)).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 10, price: 80 })
    expect(store.cartTotal).toBe(800)
  })

  it('falls back to SKU cost when the published matching ladder policy is disabled', () => {
    const product = catalogProduct({
      id: 'DISABLED-TIER',
      channel: 'store',
      category: '腊味',
      skus: [{ id: 'DISABLED-TIER-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10 }]
    })
    expect(upsertPlatformEntity('policies', 'R002', { ...cloneSeed(shared.pricePolicies.find((policy) => policy.id === 'R002')!), enabled: false })).toBe(true)
    const store = useStoreStore()
    const orderingProduct = catalogProductToProduct(product)
    store.$patch({ products: [orderingProduct], cart: [], checkoutError: '' })

    expect(store.addToCart(orderingProduct, product.skus[0].id, 10)).toBe('added')

    expect(store.cart[0]).toMatchObject({ quantity: 10, price: 100 })
    expect(store.cartTotal).toBe(1000)
  })

  it('rejects invalid explicit quantities without changing the cart', () => {
    const product = catalogProduct({
      id: 'DETAIL-QUANTITY',
      channel: 'store',
      skus: [{ id: 'DETAIL-QUANTITY-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }]
    })
    const store = useStoreStore()
    const orderingProduct = catalogProductToProduct(product)
    store.$patch({ products: [orderingProduct], cart: [], checkoutError: '' })

    expect(store.addToCart(orderingProduct, 'DETAIL-QUANTITY-SKU', 2)).toBe('out-of-stock')
    expect(store.addToCart(orderingProduct, 'DETAIL-QUANTITY-SKU', 3.5)).toBe('out-of-stock')
    expect(store.addToCart(orderingProduct, 'DETAIL-QUANTITY-SKU', 9)).toBe('out-of-stock')
    expect(store.cart).toEqual([])
  })

  it('recalculates the ladder unit price when cart quantity moves between tiers', () => {
    const product = catalogProduct({ id: 'TIER-STEP', channel: 'store', category: '阶梯步进', skus: [{ id: 'TIER-STEP-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10 }] })
    expect(upsertPlatformEntity('policies', 'TIER-STEP-POLICY', {
      id: 'TIER-STEP-POLICY', name: '步进阶梯价', type: 'ladder', scope: '阶梯步进类目', discount: 20, enabled: true,
      tiers: [{ minQty: 1, maxQty: 9, price: 90, discountOff: 10 }, { minQty: 10, maxQty: null, price: 80, discountOff: 20 }]
    })).toBe(true)
    const store = useStoreStore()
    const orderingProduct = catalogProductToProduct(product)
    store.$patch({ products: [orderingProduct], cart: [], checkoutError: '' })

    expect(store.addToCart(orderingProduct, 'TIER-STEP-SKU', 10)).toBe('added')
    expect(store.cart[0].price).toBe(80)
    expect(store.changeCart('TIER-STEP', 'TIER-STEP-SKU', -1)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 9, price: 90 })
    expect(store.cartTotal).toBe(810)
  })

  it('reprices cart lines restored outside addToCart with the active ladder policy', () => {
    const product = catalogProduct({ id: 'TIER-RESTORE', channel: 'store', category: '恢复阶梯', skus: [{ id: 'TIER-RESTORE-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10 }] })
    expect(upsertPlatformEntity('policies', 'TIER-RESTORE-POLICY', {
      id: 'TIER-RESTORE-POLICY', name: '恢复阶梯价', type: 'ladder', scope: '恢复阶梯类目', discount: 20, enabled: true,
      tiers: [{ minQty: 1, maxQty: 9, price: 90, discountOff: 10 }, { minQty: 10, maxQty: null, price: 80, discountOff: 20 }]
    })).toBe(true)
    const store = useStoreStore()
    const orderingProduct = catalogProductToProduct(product)
    store.$patch({
      products: [orderingProduct],
      cart: [{ productId: product.id, skuId: product.skus[0].id, skuName: '整箱', name: product.name, image: product.image, price: 100, retail: 120, stock: 100, quantity: 10, minimumOrderQuantity: 0, unavailable: false }],
      checkoutError: ''
    })

    store.repriceCart()

    expect(store.cart[0].price).toBe(80)
    expect(store.cartTotal).toBe(800)
  })

  it('uses the latest ladder price at checkout and keeps the order price snapshot immutable', async () => {
    const product = catalogProduct({ id: 'TIER-ORDER', channel: 'store', category: '订单阶梯', skus: [{ id: 'TIER-ORDER-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 120, cost: 100, stock: 100, level1Amount: 10, level2Amount: 10 }] })
    writeCatalog([product])
    expect(upsertPlatformEntity('policies', 'TIER-ORDER-POLICY', {
      id: 'TIER-ORDER-POLICY', name: '订单阶梯价', type: 'ladder', scope: '订单阶梯类目', discount: 25, enabled: true,
      tiers: [{ minQty: 1, maxQty: 9, price: 90, discountOff: 10 }, { minQty: 10, maxQty: null, price: 80, discountOff: 20 }]
    })).toBe(true)
    const store = useStoreStore()
    await store.initialize()
    expect(store.addToCart(store.products[0], 'TIER-ORDER-SKU', 10)).toBe('added')
    expect(upsertPlatformEntity('policies', 'TIER-ORDER-POLICY', {
      id: 'TIER-ORDER-POLICY', name: '订单阶梯价', type: 'ladder', scope: '订单阶梯类目', discount: 30, enabled: true,
      tiers: [{ minQty: 1, maxQty: 9, price: 90, discountOff: 10 }, { minQty: 10, maxQty: null, price: 75, discountOff: 25 }]
    })).toBe(true)

    expect(await store.submitOrder()).toBeTruthy()
    expect(store.orders[0]).toMatchObject({ amount: 750, saved: 450 })
    expect(store.orders[0].items[0]).toMatchObject({ quantity: 10, price: 75 })
    expect(upsertPlatformEntity('policies', 'TIER-ORDER-POLICY', {
      id: 'TIER-ORDER-POLICY', name: '订单阶梯价', type: 'ladder', scope: '订单阶梯类目', discount: 40, enabled: true,
      tiers: [{ minQty: 1, maxQty: 9, price: 85, discountOff: 15 }, { minQty: 10, maxQty: null, price: 65, discountOff: 35 }]
    })).toBe(true)
    expect(store.orders[0].items[0].price).toBe(75)
  })

  it('uses the SKU MOQ for first add and snapshots it on the procurement item', async () => {
    const product = catalogProduct({ id: 'MOQ-FIRST', channel: 'store', skus: [{ id: 'MOQ-FIRST-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()

    expect(store.addToCart(store.products[0])).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3, unavailable: false })
    expect(store.changeCart(product.id, product.skus[0].id, -1)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 3, unavailable: true })
    expect(store.changeCart(product.id, product.skus[0].id, 1)).toBe(true)
    expect(await store.submitOrder()).toBeTruthy()
    expect(store.orders[0].items[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3 })
  })

  it('starts a zero-MOQ procurement line at one item and keeps the zero snapshot', async () => {
    const product = catalogProduct({ id: 'MOQ-ZERO', channel: 'store', skus: [{ id: 'MOQ-ZERO-SKU', name: '散装', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 0 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()

    expect(store.addToCart(store.products[0])).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 1, minimumOrderQuantity: 0, unavailable: false })
  })

  it('keeps a below-MOQ cart line and rejects procurement after catalog MOQ rises', async () => {
    const product = catalogProduct({ id: 'MOQ-RAISED', channel: 'store', skus: [{ id: 'MOQ-RAISED-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()
    expect(store.addToCart(store.products[0])).toBe('added')
    const latest = cloneSeed(readCatalogState()!)
    latest.revision += 1
    latest.products[0].skus[0].minimumOrderQuantity = 4
    expect(writeCatalogState(latest)).toBe(true)

    expect(await store.submitOrder()).toBe(null)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 4, unavailable: true })
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('rejects first add when stock is below the SKU MOQ', async () => {
    const product = catalogProduct({ id: 'MOQ-STOCK', channel: 'store', skus: [{ id: 'MOQ-STOCK-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 2, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()

    expect(store.addToCart(store.products[0])).toBe('out-of-stock')
    expect(store.cart).toHaveLength(0)
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('blocks increments at the stock limit', () => {
    const store = useStoreStore()
    const seeded = cloneSeed(storeCatalog).filter((item) => item.id === 'P003')
    seeded[0].skus[0].stock = 1
    seeded[0].stock = 1
    store.$patch({ products: seeded, cart: [], checkoutError: '' })
    expect(store.addToCart(seeded[0])).toBe('added')
    expect(store.addToCart(seeded[0])).toBe('out-of-stock')
    expect(store.checkoutError).toContain('库存不足')
  })

  it('submits a multi-item order, deducts stock and computes savings', async () => {
    const store = useStoreStore()
    const catalog = [
      catalogProduct({ id: 'TEA', channel: 'store' }),
      catalogProduct({ id: 'BOX', channel: 'store', skus: [{ id: 'BOX-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 30, cost: 10, stock: 20, level1Amount: 10, level2Amount: 10 }] })
    ]
    writeCatalog(catalog)
    const seeded = catalog.map(catalogProductToProduct)
    const tea = seeded[0]
    const box = seeded[1]
    const teaStockBefore = tea.skus[0].stock
    store.$patch({ products: seeded, catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(tea)
    store.addToCart(box)
    store.changeCart(box.id, box.skus[0].id, 1)
    expect(store.cartCount).toBe(3)
    expect(await store.submitOrder('请周三前送达')).toBeTruthy()
    expect(store.orders[0]).toMatchObject({ status: 'pending-payment', amount: 40, saved: 65, itemCount: 3, remark: '请周三前送达' })
    expect(store.orders[0].items).toHaveLength(2)
    expect(store.cart).toHaveLength(0)
    expect(store.products.find((item) => item.id === 'TEA')?.skus[0].stock).toBe(teaStockBefore - 1)
    expect(store.products.find((item) => item.id === 'BOX')?.skus[0].stock).toBe(18)
    expect(await store.submitOrder()).toBe(null)
    expect(store.checkoutError).toBe('进货单为空')
  })

  it('advances order status step by step and confirms receipt only when delivering', async () => {
    writeCatalog([])
    const store = useStoreStore()
    const order = {
      id: 'SO-TEST', amount: 10, saved: 0, itemCount: 1,
      items: [], status: 'submitted' as const, createdAt: '2026-08-15 10:00', logistics: []
    }
    store.$patch({ orders: [cloneSeed(order)] })
    expect(writePlatformOrder({ id: order.id, productName: '进货商品', quantity: 1, amount: 10, customer: '石板溪农庄·门店', channel: 'purchase', status: 'pending', createdAt: order.createdAt })).toBe(true)
    expect(await store.confirmReceipt('SO-TEST')).toBe(false)
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('accepted')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('shipped')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('delivering')
    expect(await store.confirmReceipt('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('received')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('completed')
    expect(await store.advanceOrder('SO-TEST')).toBe(false)
    expect(store.orders[0].logistics).toHaveLength(5)
  })

  it('does not commit local order status when shared fulfillment write fails', async () => {
    const store = useStoreStore()
    store.$patch({ orders: [{ id: 'SO-FAIL', amount: 10, saved: 0, itemCount: 1, items: [], status: 'submitted', createdAt: '2026-08-15 10:00', logistics: [] }] })
    const write = vi.spyOn(shared, 'writePlatformOrder').mockReturnValue(false)
    expect(await store.advanceOrder('SO-FAIL')).toBe(false)
    expect(store.orders[0].status).toBe('submitted')
    expect(store.orders[0].logistics).toHaveLength(0)
    write.mockRestore()
  })

  it('re-adds order items into the cart on repeat', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'REPEAT', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    const tea = store.products[0]
    store.addToCart(tea)
    await store.submitOrder()
    const orderId = store.orders[0].id
    expect(store.repeatOrder(orderId)).toBe(true)
    expect(store.cartCount).toBe(1)
    expect(store.cart[0].productId).toBe('REPEAT')
  })

  it('computes month metrics from current month orders', () => {
    const store = useStoreStore()
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    store.$patch({ orders: [
      { id: 'A', amount: 100, saved: 20, itemCount: 1, items: [], status: 'delivering', createdAt: `${month}-10 09:00`, logistics: [] },
      { id: 'B', amount: 50, saved: 10, itemCount: 1, items: [], status: 'received', createdAt: `${month}-01 09:00`, logistics: [] },
      { id: 'C', amount: 200, saved: 30, itemCount: 1, items: [], status: 'completed', createdAt: '2025-01-01 09:00', logistics: [] }
    ] })
    expect(store.orderMetrics.monthAmount).toBe(150)
    expect(store.orderMetrics.orderCount).toBe(3)
    expect(store.orderMetrics.pendingReceipt).toBe(1)
    expect(store.orderMetrics.savedAmount).toBe(60)
  })
})

describe('store auth', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('logs in only with an enabled platform store account and records its principal', () => {
    const store = useStoreStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.loginWithPassword('13800000001', 'wrong')).toBe(false)
    expect(store.loginWithPassword('13800000000', '123456')).toBe(false)
    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    expect(store.auth).toMatchObject({
      isLoggedIn: true,
      phone: '13800000001',
      accountId: 'SA001',
      farmId: 'F001',
      tenantId: 'F001',
      role: 'owner',
      principal: { actorType: 'store', actorId: 'SA001', tenantId: 'F001', status: 'active' }
    })
    expect(store.info.name).toContain('石板溪')
  })

  it('仅接受与所选身份一致的门店/业务员账号', () => {
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA002' ? { ...item, role: 'staff' as const, priceLevel: 'A' as const } : item))
    const store = useStoreStore()
    expect(store.loginWithPassword('13800000002', '123456', 'owner')).toBe(false)
    expect(store.loginWithPassword('13800000001', '123456', 'staff')).toBe(false)
    expect(store.storeAccountRole('13800000002')).toBe('staff')
    expect(store.loginWithPassword('13800000002', '123456', 'staff')).toBe(true)
    expect(store.auth).toMatchObject({ accountId: 'SA002', role: 'staff', priceLevel: 'A' })
    expect(store.isStoreOwner).toBe(false)
    expect(store.priceLevelLabel).toBe('业务员 A 档')
  })

  it('业务员按档位展示差异化分销价，门店账号按门店价下单', async () => {
    writeCatalog([catalogProduct({ id: 'LEVEL-P', channel: 'store' })])
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA002' ? { ...item, role: 'staff' as const, priceLevel: 'A' as const } : item))
    const store = useStoreStore()
    await store.initialize()
    const product = store.products.find((item) => item.id === 'LEVEL-P')!

    expect(store.loginWithPassword('13800000001', '123456', 'owner')).toBe(true)
    expect(store.priceDiscount).toBe(1)
    expect(store.unitPriceFor(product, product.skus[0], 1)).toBe(20)

    expect(store.loginWithPassword('13800000002', '123456', 'staff')).toBe(true)
    expect(store.priceDiscount).toBe(0.95)
    expect(store.unitPriceFor(product, product.skus[0], 1)).toBe(19)
    store.addToCart(product)
    expect(store.cart[0].price).toBe(19)
    expect(store.cartTotal).toBe(19)
  })

  it('验证码登录同样按身份校验账号角色', () => {
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA002' ? { ...item, role: 'staff' as const, priceLevel: 'C' as const } : item))
    const store = useStoreStore()
    expect(store.loginWithCode('13800000002', '123456', 'owner')).toBe(false)
    expect(store.loginWithCode('13800000002', '123456', 'staff')).toBe(true)
    expect(store.auth).toMatchObject({ accountId: 'SA002', role: 'staff', priceLevel: 'C' })
  })

  it('rejects disabled accounts for password and sms login', () => {
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA003' ? { ...item, enabled: false } : item))
    const store = useStoreStore()
    expect(store.loginWithPassword('13800000003', '123456')).toBe(false)
    expect(store.loginWithCode('13800000003', '123456')).toBe(false)
  })

  it('resolves sms login to the same enabled account and clears the principal on logout', () => {
    const store = useStoreStore()
    expect(store.loginWithCode('13800000003', '000000')).toBe(false)
    expect(store.loginWithCode('13800000000', '123456')).toBe(false)
    expect(store.loginWithCode('13800000003', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ accountId: 'SA003', farmId: 'F002', role: 'owner' })
    expect(store.info.name).toContain('云上人家')
    store.logout()
    expect(store.auth).toMatchObject({ isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null })
  })

  it('isolates cart and orders when switching between F001 and F002 accounts', async () => {
    writeCatalog([catalogProduct({ id: 'TENANT-P', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()

    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    store.addToCart(store.products[0])
    store.orders = [{ id: 'F001-ORDER', farmId: 'F001', amount: 20, saved: 0, itemCount: 1, items: [], status: 'submitted', createdAt: '2026-08-24 10:00', logistics: [] }]

    expect(store.loginWithPassword('13800000003', '123456')).toBe(true)
    expect(store.cart).toEqual([])
    expect(store.orders).toEqual([])
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const f002Order = store.orders[0]
    expect(f002Order.farmId).toBe('F002')
    expect(readPlatformOrders()?.[f002Order.id]).toMatchObject({ customer: expect.stringContaining('云上人家'), supplierOrderLink: { source: 'store', customerUserId: 'F002' } })

    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    expect(store.cart).toHaveLength(1)
    expect(store.orders.map((item) => item.id)).toEqual(['F001-ORDER'])
  })

  it('invalidates the current session when the shared store account is disabled', async () => {
    const store = useStoreStore()
    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA001' ? { ...item, enabled: false } : item))

    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(false)
  })

describe('deriveStoreMetrics', () => {
  it('derives in-sale count, savings and hot orders from the real catalog', () => {
    const m = deriveStoreMetrics(storeCatalog)
    expect(m.activeCount).toBe(storeCatalog.filter((p) => p.status === 'active').length)
    expect(m.savedTotal).toBe(Math.round(storeCatalog.reduce((s, p) => s + (p.price - p.cost) * p.sales, 0) * 100) / 100)
    expect(m.hotOrders).toHaveLength(3)
    expect(m.hotOrders[0].times).toBe(Math.max(...storeCatalog.map((p) => p.sales)))
    expect(m.hotOrders[0].amount).toBe(Math.round(m.hotOrders[0].times * storeCatalog.find((p) => p.id === m.hotOrders[0].id)!.price))
  })
})
  it('cancels pending orders and initiates store after-sale', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'CANCEL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    const tea = store.products[0]
    store.addToCart(tea)
    expect(await store.submitOrder('')).toBeTruthy()
    const orderId = store.orders[0].id
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPlatformOrders()?.[orderId]?.status).toBe('pending-payment')
    expect(await store.cancelOrder(orderId)).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(store.orders[0].status).toBe('unpaid-cancelled')
    expect(readPlatformOrders()?.[orderId]?.status).toBe('unpaid-cancelled')
    expect(store.initiateAfterSale(orderId)).toBe(false)
    store.orders[0].status = 'received'
    expect(store.initiateAfterSale(orderId)).toBe(true)
    const works = readPlatformAfterSales() || {}
    expect(Object.values(works)[0]?.status).toBe('processing')
  })
  it('exposes the shared catalog as a read-only procurement source', () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'STOCK', channel: 'store' })
    writeCatalog([catalog])
    const tea = catalogProductToProduct(catalog)
    store.$patch({ products: [tea], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    expect('setSkuStock' in store).toBe(false)
    expect('toggleListed' in store).toBe(false)
    expect(store.products[0].skus[0].stock).toBe(catalog.skus[0].stock)
    expect(readPlatformEntities()?.products?.[tea.id]).toBeUndefined()
  })
  it('does not restore stock for a refund and restores it once when a return completes', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const refundOrder = store.orders[0]
    refundOrder.status = 'received'
    expect(store.initiateAfterSale(refundOrder.id, 'refund')).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)

    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const returnOrder = store.orders[0]
    returnOrder.status = 'received'
    expect(store.initiateAfterSale(returnOrder.id, 'return')).toBe(true)
    expect(await store.completeReturn(returnOrder.id)).toBe(true)
    expect(await store.completeReturn(returnOrder.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
  })

  it.each([
    ['agritainment-platform-after-sales', 1, '售后单'],
    ['agritainment-platform-orders', 1, '平台履约订单']
  ])('rolls back every return snapshot when %s write fails', async (failedKey, failAt) => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: `RETURN-ROLLBACK-${failedKey}`, channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const before = {
      catalog: cloneSeed(readCatalogState()),
      afterSales: cloneSeed(readPlatformAfterSales()),
      platformOrders: cloneSeed(readPlatformOrders()),
      memoryOrders: cloneSeed(store.orders),
      memoryProducts: cloneSeed(store.products),
      revision: store.catalogRevision
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let writeCount = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === failedKey && ++writeCount === failAt) {
        throw new Error(`${failedKey} write failed`)
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readPlatformOrders()).toEqual(before.platformOrders)
    expect(store.orders).toEqual(before.memoryOrders)
    expect(store.products).toEqual(before.memoryProducts)
    expect(store.catalogRevision).toBe(before.revision)
  })

  it('rolls back the locked return transaction when its first catalog write fails', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-FIRST-STEP-FAIL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const before = { catalog: cloneSeed(readCatalogState()), afterSales: cloneSeed(readPlatformAfterSales()), orders: cloneSeed(readPlatformOrders()) }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === 'agritainment-platform-catalog') {
        failed = true
        throw new Error('catalog first step failed')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    setActivePinia(createPinia())
    const reloaded = useStoreStore()
    await reloaded.initialize(true)

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readPlatformOrders()).toEqual(before.orders)
    expect(reloaded.orders.find((item) => item.id === order.id)?.inventoryReleased).toBeFalsy()
  })

  it('rejects a third-state return recovery without writing business snapshots', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-COMMIT-RECOVERY', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    expect(await store.completeReturn(order.id)).toBe(true)
    const operationId = `${order.id}:return-release`
    const thirdState = cloneSeed(readCatalogState()!)
    thirdState.products[0].name = '外部第三状态'
    expect(writeCatalogState(thirdState)).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test-third-state', reason: 'test', handlerKey: 'store-return-completion-v1' })).toBe(true)
    const recovery = readPlatformRecoveryQueue().find((task) => task.operationId === operationId)!
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let businessWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (['agritainment-platform-catalog', 'agritainment-platform-after-sales', 'agritainment-platform-orders'].includes(key)) businessWrites += 1
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await retryPlatformRecoveryTask(recovery.id, 'STORE-TEST')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(businessWrites).toBe(0)
    expect(readCatalogState()).toEqual(thirdState)
    expect(readPlatformRecoveryQueue().find((task) => task.id === recovery.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('surfaces a fatal return recovery failure without changing Pinia snapshots', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-FATAL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBeTruthy()
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const beforeOrders = cloneSeed(store.orders)
    const beforeProducts = cloneSeed(store.products)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-catalog' || key === 'agritainment-platform-recovery-queue') throw new Error('fatal recovery write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(store.orders).toEqual(beforeOrders)
    expect(store.products).toEqual(beforeProducts)
    expect(store.error).toBe('退货事务恢复失败，请联系平台处理')
  })
})

describe('store order payment lifecycle', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals() })

  it('starts a pending-payment order for selected cart lines only', async () => {
    writeCatalog([
      catalogProduct({ id: 'PARTIAL-A', channel: 'store' }),
      catalogProduct({ id: 'PARTIAL-B', channel: 'store' })
    ])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    store.addToCart(store.products[1])
    const selectedKey = `${store.cart[0].productId}:${store.cart[0].skuId}`
    store.setCheckoutSelection([selectedKey])

    expect(store.checkoutLines.map((item) => item.productId)).toEqual(['PARTIAL-A'])
    const orderId = await store.submitOrder('只订第一件', [selectedKey])
    const order = store.orders.find((item) => item.id === orderId)

    expect(order).toMatchObject({ status: 'pending-payment', amount: 20, itemCount: 1, remark: '只订第一件' })
    expect(order?.paidAt).toBeUndefined()
    expect(Date.parse(order?.paymentDeadlineAt || '')).toBeGreaterThan(Date.now())
    expect(store.cart.map((item) => item.productId)).toEqual(['PARTIAL-B'])
    expect(readPlatformOrders()?.[orderId!]?.status).toBe('pending-payment')
  })
})

describe('store order payment and cancellation rules', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals() })

  async function createPendingOrder(id: string) {
    writeCatalog([catalogProduct({ id, channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    const orderId = await store.submitOrder()
    return { store, orderId: orderId! }
  }

  it('pays a pending order and then exposes it as awaiting acceptance', async () => {
    const { store, orderId } = await createPendingOrder('PAY-ORDER')

    expect(await store.payOrder(orderId)).toBe(true)
    expect(store.orders[0]).toMatchObject({ id: orderId, status: 'submitted' })
    expect(store.orders[0].paidAt).toBeTruthy()
    expect(readPlatformOrders()?.[orderId]?.status).toBe('pending')
  })

  it('cancels a paid order before shipment and releases stock exactly once', async () => {
    const { store, orderId } = await createPendingOrder('PAID-CANCEL')
    expect(await store.payOrder(orderId)).toBe(true)

    expect(await store.cancelOrder(orderId)).toBe(true)
    expect(store.orders[0].status).toBe('paid-cancelled')
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(readPlatformOrders()?.[orderId]?.status).toBe('paid-cancelled')
    expect(await store.cancelOrder(orderId)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
  })

  it('expires an unpaid order after the payment deadline and releases its stock', async () => {
    const { store, orderId } = await createPendingOrder('EXPIRE-ORDER')
    store.orders[0].paymentDeadlineAt = new Date(Date.now() - 1000).toISOString()

    expect(await store.sweepExpiredPaymentOrders()).toBe(1)
    expect(store.orders[0].status).toBe('unpaid-cancelled')
    expect(store.orders[0].inventoryReleased).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(readPlatformOrders()?.[orderId]?.status).toBe('unpaid-cancelled')
    expect(store.orders[0].logistics.at(-1)?.title).toContain('超时')
  })

  it('does not cancel an order after it has shipped', async () => {
    const { store, orderId } = await createPendingOrder('SHIPPED-CANCEL')
    expect(await store.payOrder(orderId)).toBe(true)
    store.orders[0].status = 'shipped'

    expect(await store.cancelOrder(orderId)).toBe(false)
    expect(store.orders[0].status).toBe('shipped')
  })
})

describe('store cart quantity controls', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals() })

  it('sets an explicit cart quantity and reprices the line', async () => {
    const product = catalogProduct({
      id: 'MANUAL-QTY',
      channel: 'store',
      category: '手工数量测试',
      skus: [{ id: 'MANUAL-QTY-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 50, cost: 20, stock: 20, level1Amount: 10, level2Amount: 10, minimumOrderQuantity: 2 }]
    })
    writeCatalog([product])
    expect(upsertPlatformEntity('policies', 'MANUAL-QTY-POLICY', {
      id: 'MANUAL-QTY-POLICY', name: '手工数量阶梯价', type: 'ladder', scope: '手工数量测试类目', discount: 20, enabled: true,
      tiers: [{ minQty: 1, maxQty: 4, price: 20, discountOff: 0 }, { minQty: 5, maxQty: null, price: 16, discountOff: 20 }]
    })).toBe(true)
    const store = useStoreStore()
    await store.initialize()
    expect(store.addToCart(store.products[0], 'MANUAL-QTY-SKU', 2)).toBe('added')

    expect(store.setCartQuantity('MANUAL-QTY', 'MANUAL-QTY-SKU', 5)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 5, price: 16 })
    expect(store.checkoutTotal).toBe(80)

    expect(store.setCartQuantity('MANUAL-QTY', 'MANUAL-QTY-SKU', 1)).toBe(false)
    expect(store.setCartQuantity('MANUAL-QTY', 'MANUAL-QTY-SKU', 21)).toBe(false)
    expect(store.cart[0].quantity).toBe(5)
  })
})
