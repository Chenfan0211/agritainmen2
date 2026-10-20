import { defineStore } from 'pinia'
import type { AfterSale, BusinessMediaValue, CatalogState, MockScenario, Order, OrderItem, OrderStatus, PlatformJournalEntry, PlatformRecoveryHandlerKey, PlatformPrincipal, Product, PurchaseStatus, StoreAccount, StoreRole } from '@agritainment/shared'
import { abortCatalogTransaction, applyCatalogStockOperation, applyPlatformMedia, buildSupplierAccountSeeds, buildSupplierPlatformOrders, calcCartTotal, catalogProductToProduct, catalogProductsForAudience, cProducts, cloneSeed, commitCatalogTransaction, createId, createStrictSnapshotRecoveryHandlerRegistration, enqueuePlatformRecovery, ensureCatalogState, initializePlatformRecoveryHandlers, initialCatalogOrderQuantity, markCatalogTransactionStockApplied, mediaValueToImage, mergeEntitySeeds, mergePersistedDefaults, mergePlatformEntities, mergePlatformStoreAccounts, mergePlatformSupplierAccounts, nextPurchaseStatus, normalizeMinimumOrderQuantity, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, prepareCatalogTransaction, pricePolicies, purchaseSteps, readCatalogState, readCatalogTransactionJournal, readPendingCatalogTransactions, readPlatformAfterSales, readPlatformCollectionRevision, readPlatformEntities, readPlatformMedia, readPlatformOrders, readPlatformRecoveryQueue, readPlatformStoreAccounts, readPlatformSupplierAccounts, reconcilePendingPlatformTransactions, resolvePlatformJournal, round2, runLockedPlatformTransaction, storeAccounts, supplierCanReceiveNewOrders, suppliers as supplierSeeds, tieredUnitPrice, validateCatalogSkuOrderQuantity, validateSmsCode, writeCatalogState, writePlatformAfterSale, writePlatformAfterSales, writePlatformOrder, writePlatformOrders } from '@agritainment/shared'
import { storeInfo, storeInfoForFarm, storeRepository } from '../services/repository'
import { businessPriceLevelDiscount, businessPriceLevelLabel, resolveBusinessPriceLevel, type BusinessPriceLevel } from '../price-level'

interface CartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: BusinessMediaValue
  price: number
  retail: number
  stock: number
  quantity: number
  minimumOrderQuantity: number
  unavailable?: boolean
}

export function readStorePricePolicies() {
  const policies = readPlatformEntities()?.policies
  return policies === undefined ? pricePolicies : Object.values(policies).filter((policy) => policy?.enabled)
}

function storeUnitPrice(product: Product, sku: Product['skus'][number], quantity: number): number {
  return tieredUnitPrice({ category: product.category, name: product.name, basePrice: sku.cost, quantity }, readStorePricePolicies()).unitPrice
}

function unavailableSupplierName(supplierIds: string[]): string | null {
  const directory = mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers)
  const accounts = mergePlatformSupplierAccounts(buildSupplierAccountSeeds(directory), readPlatformSupplierAccounts())
  for (const supplierId of new Set(supplierIds)) {
    const supplier = directory.find((item) => item.id === supplierId)
    if (supplier && !supplierCanReceiveNewOrders(supplier, accounts.find((item) => item.supplierId === supplierId))) return supplier.name
  }
  return null
}

export interface LogisticsEvent {
  time: string
  title: string
  detail: string
}

export type StoreOrderStatus = 'pending-payment' | Exclude<PurchaseStatus, 'cancelled'> | 'paid-cancelled' | 'unpaid-cancelled'

export interface StoreOrder {
  id: string
  amount: number
  saved: number
  itemCount: number
  items: OrderItem[]
  status: StoreOrderStatus
  createdAt: string
  paidAt?: string
  paymentDeadlineAt?: string
  cancelledAt?: string
  trackingNo?: string
  logistics: LogisticsEvent[]
  remark?: string
  inventoryReleased?: boolean
  afterSaleType?: 'refund' | 'return'
  platformOrderIds?: string[]
  farmId?: string
}

interface StoreAuthState {
  isLoggedIn: boolean
  phone: string
  principal: PlatformPrincipal | null
  accountId: string
  farmId: string
  tenantId: string
  role: StoreRole | null
  /** 业务员档位；门店账号为 null，代表按门店价（基准分销价）下单 */
  priceLevel: BusinessPriceLevel | null
}

interface StoreTenantSession {
  cart: CartLine[]
  orders: StoreOrder[]
}

interface StoreState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  info: typeof storeInfo
  products: Product[]
  catalogRevision: number
  cart: CartLine[]
  checkoutLineKeys: string[]
  orders: StoreOrder[]
  checkoutError: string
  auth: StoreAuthState
  tenantSessions: Record<string, StoreTenantSession>
}

const purchaseToOrderStatus: Record<StoreOrderStatus, OrderStatus> = {
  'pending-payment': 'pending-payment', submitted: 'pending', accepted: 'pending', shipped: 'shipping', delivering: 'shipping', received: 'delivered', completed: 'delivered', 'paid-cancelled': 'paid-cancelled', 'unpaid-cancelled': 'unpaid-cancelled'
}

const cartLineKey = (line: Pick<CartLine, 'productId' | 'skuId'>) => `${line.productId}:${line.skuId}`

function toPlatformOrders(order: StoreOrder, products: Product[], info: typeof storeInfo, farmId: string): Order[] {
  const orders = buildSupplierPlatformOrders({
    items: order.items, products, customer: info.name, channel: 'purchase', source: 'store',
    sourceOrderId: order.id, status: purchaseToOrderStatus[order.status], createdAt: order.createdAt, customerUserId: farmId,
    storeId: farmId, storeName: info.name.replace(/·门店$/, '')
  })
  if (orders.length) return orders
  return [{
    id: order.id, productName: '进货商品', quantity: order.itemCount, amount: order.amount,
    customer: info.name, channel: 'purchase', status: purchaseToOrderStatus[order.status],
    createdAt: order.createdAt, items: order.items, storeId: farmId, storeName: info.name.replace(/·门店$/, ''),
    supplierOrderLink: { source: 'store', sourceOrderId: order.id, customerUserId: farmId }
  }]
}

function syncStorePlatformOrders(order: StoreOrder, products: Product[], info: typeof storeInfo, farmId: string): boolean {
  const ids = order.platformOrderIds?.length ? order.platformOrderIds : [order.id]
  const existing = readPlatformOrders() || {}
  const original = cloneSeed(existing)
  const ok = ids.every((id) => {
    const current = existing[id]
    const next = toPlatformOrders(order, products, info, farmId).find((candidate) => candidate.id === id) || current
    if (!next) return false
    return writePlatformOrder({ ...current, ...next, id, supplierFulfillment: current?.supplierFulfillment, flow: current?.flow, logistics: current?.logistics || next.logistics })
  })
  if (!ok) writePlatformOrders(original)
  return ok
}

function nextStorePlatformOrders(order: StoreOrder, products: Product[], info: typeof storeInfo, farmId: string, existing: Record<string, Order>): Record<string, Order> | null {
  const nextOrders = cloneSeed(existing)
  const ids = order.platformOrderIds?.length ? order.platformOrderIds : [order.id]
  const projected = toPlatformOrders(order, products, info, farmId)
  for (const id of ids) {
    const current = existing[id]
    const next = projected.find((candidate) => candidate.id === id) || current
    if (!next) return null
    const supplierFulfillment = current?.supplierFulfillment && ['paid-cancelled', 'unpaid-cancelled'].includes(order.status)
      ? { ...current.supplierFulfillment, status: 'cancelled' as const, updatedAt: new Date().toISOString() }
      : current?.supplierFulfillment
    nextOrders[id] = { ...current, ...next, id, supplierFulfillment, flow: current?.flow, logistics: current?.logistics || next.logistics }
  }
  return nextOrders
}

const STORE_RETURN_RECOVERY_HANDLER_KEY = 'store-return-completion-v1' as PlatformRecoveryHandlerKey
const STORE_RETURN_RECOVERY_SCHEMA = 'store-return-snapshot-v1'
const STORE_ORDER_RECOVERY_HANDLER_KEY = 'store-order-v1' as PlatformRecoveryHandlerKey
const STORE_ORDER_RECOVERY_SCHEMA = 'store-order-snapshot-v1'

interface StoreReturnSnapshot {
  catalog: CatalogState
  afterSales: Record<string, AfterSale> | null
  platformOrders: Record<string, Order>
}

interface StableStoreReturnSnapshot {
  snapshot: StoreReturnSnapshot
  revisions: { catalog: number; afterSales: number; platformOrders: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStoreReturnSnapshot(value: unknown): value is StoreReturnSnapshot {
  return isRecord(value) && isRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision) && (value.afterSales === null || isRecord(value.afterSales)) && isRecord(value.platformOrders)
}

function isStoreReturnJournal(journal: PlatformJournalEntry): boolean {
  const expected = [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY]
  const system = [PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY]
  const knownHandler = (journal.recoveryHandlerKey === STORE_RETURN_RECOVERY_HANDLER_KEY && journal.recoverySchema === STORE_RETURN_RECOVERY_SCHEMA)
    || (journal.recoveryHandlerKey === STORE_ORDER_RECOVERY_HANDLER_KEY && journal.recoverySchema === STORE_ORDER_RECOVERY_SCHEMA)
  return knownHandler
    && journal.collections.every((key) => expected.includes(key) || system.includes(key))
    && expected.every((key) => journal.collections.includes(key))
    && isStoreReturnSnapshot(journal.original)
    && isStoreReturnSnapshot(journal.target)
}

function sameStoreSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function executeStrictStoreRecovery(journal: PlatformJournalEntry): boolean {
  if (!isStoreReturnJournal(journal)) return false
  const original = journal.original as StoreReturnSnapshot
  const target = journal.target as StoreReturnSnapshot
  const current = readStableStoreReturnSnapshot()
  if (!current) return false
  const fields: Array<keyof StoreReturnSnapshot> = ['catalog', 'afterSales', 'platformOrders']
  if (fields.some((field) => !sameStoreSnapshot(current.snapshot[field], original[field]) && !sameStoreSnapshot(current.snapshot[field], target[field]))) return false
  if (sameStoreSnapshot(current.snapshot, original) || sameStoreSnapshot(current.snapshot, target)) return true
  if (readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY) !== current.revisions.catalog
    || readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY) !== current.revisions.afterSales
    || readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY) !== current.revisions.platformOrders) return false
  return writeStoreReturnSnapshot(original)
}

export function createStoreAtomicRecoveryHandlerRegistrations() {
  return [STORE_ORDER_RECOVERY_HANDLER_KEY, STORE_RETURN_RECOVERY_HANDLER_KEY].map((key) => createStrictSnapshotRecoveryHandlerRegistration({
    key,
    fields: ['catalog', 'afterSales', 'platformOrders'] as const,
    validateJournal: (journal) => isStoreReturnJournal(journal) && journal.recoveryHandlerKey === key,
    readStable: () => {
      const stable = readStableStoreReturnSnapshot()
      return stable ? { snapshot: stable.snapshot, token: stable.revisions } : null
    },
    isStillStable: (revisions) => readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY) === revisions.catalog
      && readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY) === revisions.afterSales
      && readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY) === revisions.platformOrders,
    writeSnapshot: (snapshot) => writeStoreReturnSnapshot(snapshot)
  }))
}

function readStoreReturnSnapshot(): StoreReturnSnapshot | null {
  const catalog = readCatalogState()
  return catalog ? { catalog: cloneSeed(catalog), afterSales: cloneSeed(readPlatformAfterSales()), platformOrders: cloneSeed(readPlatformOrders() || {}) } : null
}

function readStableStoreReturnSnapshot(): StableStoreReturnSnapshot | null {
  const catalogBefore = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
  const catalog = readCatalogState()
  const catalogAfter = readPlatformCollectionRevision(PLATFORM_CATALOG_STORAGE_KEY)
  const afterSalesBefore = readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY)
  const afterSales = readPlatformAfterSales()
  const afterSalesAfter = readPlatformCollectionRevision(PLATFORM_AFTERSALES_STORAGE_KEY)
  const ordersBefore = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
  const platformOrders = readPlatformOrders() || {}
  const ordersAfter = readPlatformCollectionRevision(PLATFORM_ORDERS_STORAGE_KEY)
  if (!catalog || catalogBefore !== catalogAfter || afterSalesBefore !== afterSalesAfter || ordersBefore !== ordersAfter) return null
  return {
    snapshot: { catalog: cloneSeed(catalog), afterSales: cloneSeed(afterSales), platformOrders: cloneSeed(platformOrders) },
    revisions: { catalog: catalogAfter, afterSales: afterSalesAfter, platformOrders: ordersAfter }
  }
}

function writeStoreReturnSnapshot(snapshot: StoreReturnSnapshot): boolean {
  const before = readStoreReturnSnapshot()
  if (!before) return false
  const steps = [
    { apply: () => writeCatalogState(snapshot.catalog), rollback: () => writeCatalogState(before.catalog) },
    { apply: () => writePlatformAfterSales(snapshot.afterSales), rollback: () => writePlatformAfterSales(before.afterSales) },
    { apply: () => writePlatformOrders(snapshot.platformOrders), rollback: () => writePlatformOrders(before.platformOrders) }
  ]
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) {
      applied.push(step)
      continue
    }
    for (const completed of [...applied].reverse()) completed.rollback()
    return false
  }
  return true
}

function queueStoreReturnRecovery(operationId: string): boolean {
  const journalResolved = resolvePlatformJournal(operationId, 'recovery-pending')
  const recoveryQueued = enqueuePlatformRecovery({
    operationId,
    failedStep: 'catalog-abort',
    reason: 'catalog return abort could not be persisted',
    handlerKey: STORE_RETURN_RECOVERY_HANDLER_KEY
  })
  return journalResolved && recoveryQueued
}

const logisticsEventFor = (status: StoreOrderStatus, order: StoreOrder): LogisticsEvent => {
  const now = new Date().toLocaleString('zh-CN')
  switch (status) {
    case 'pending-payment': return { time: now, title: '订单待付款', detail: '请在 15 分钟内完成支付，支付后进入待接单' }
    case 'submitted': return { time: now, title: '订单已提交', detail: '已提交至供应链中台，等待接单' }
    case 'accepted': return { time: now, title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    case 'shipped': return { time: now, title: '商品已出库', detail: `顺丰速运 ${order.trackingNo || '待生成'} 揽收，直配到店` }
    case 'delivering': return { time: now, title: '配送中', detail: '已到达中转场，预计 1-2 天送达门店' }
    case 'received': return { time: now, title: '已签收', detail: '门店已收货并验货签收' }
    case 'completed': return { time: now, title: '订单完成', detail: '本单履约完成，期待再次合作' }
    case 'paid-cancelled': return { time: now, title: '订单已取消', detail: '已支付订单取消，平台将按规则处理退款并释放库存' }
    case 'unpaid-cancelled': return { time: now, title: '订单已取消', detail: '未支付订单已取消，锁定库存已释放' }
  }
}

const seedOrders = (farmId = 'F001'): StoreOrder[] => farmId === 'F001' ? [
  {
    id: 'SO2026081001', amount: 386, saved: 222, itemCount: 15,
    items: [
      { productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉', skuName: '500g', image: '/static/images/bacon.webp', quantity: 10, price: 38 },
      { productId: 'PP03', skuId: 'PP03-1', name: '环保打包餐盒', skuName: '300只/箱', image: '/static/images/field.webp', quantity: 5, price: 1.2 }
    ],
    status: 'delivering', createdAt: '2026-08-10 09:24', trackingNo: 'SF7788990012',
    logistics: [
      { time: '2026-08-10 09:24', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-10 11:02', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-11 08:40', title: '商品已出库', detail: '顺丰速运 SF7788990012 揽收，直配到店' },
      { time: '2026-08-12 14:20', title: '配送中', detail: '已到达湘西州中转场，预计明日送达门店' }
    ]
  },
  {
    id: 'SO2026080201', amount: 840, saved: 520, itemCount: 20,
    items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 20, price: 42 }],
    status: 'received', createdAt: '2026-08-02 15:08', trackingNo: 'SF7788900123',
    logistics: [
      { time: '2026-08-02 15:08', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-02 16:30', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-03 09:12', title: '商品已出库', detail: '顺丰速运 SF7788900123 揽收，直配到店' },
      { time: '2026-08-04 11:45', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-08-04 17:30', title: '已签收', detail: '门店已收货并验货签收' }
    ]
  },
  {
    id: 'SO2026081401', amount: 430, saved: 210, itemCount: 5,
    items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 5, price: 86 }],
    status: 'submitted', createdAt: '2026-08-14 16:42',
    logistics: [{ time: '2026-08-14 16:42', title: '订单已提交', detail: '已提交至供应链中台，等待接单' }],
    remark: '周末到货后电话联系'
  },
  {
    id: 'SO2026081301', amount: 198, saved: 126, itemCount: 3,
    items: [{ productId: 'SP02', skuId: 'SP02-2', name: '山泉土鸡汤礼盒', skuName: '2 只装', image: '/static/images/field.webp', quantity: 3, price: 66 }],
    status: 'accepted', createdAt: '2026-08-13 10:05',
    logistics: [
      { time: '2026-08-13 10:05', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-13 11:20', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081101', amount: 426, saved: 220, itemCount: 22,
    items: [
      { productId: 'SP01', skuId: 'SP01-4P', name: '中台联名·农家欢聚套餐券', skuName: '四人欢聚', image: '/static/images/farmhouse.webp', quantity: 2, price: 198 },
      { productId: 'PP02', skuId: 'PP02-1', name: '民宿一次性洗漱套装', skuName: '100 套/箱', image: '/static/images/field.webp', quantity: 20, price: 1.5 }
    ],
    status: 'shipped', createdAt: '2026-08-11 09:18', trackingNo: 'SF7788994501',
    logistics: [
      { time: '2026-08-11 09:18', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-11 10:42', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-12 08:36', title: '商品已出库', detail: '顺丰速运 SF7788994501 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026072801', amount: 1680, saved: 620, itemCount: 10,
    items: [{ productId: 'PP05', skuId: 'PP05-1', name: '生态富硒米', skuName: '25kg', image: '/static/images/rice.webp', quantity: 10, price: 168 }],
    status: 'completed', createdAt: '2026-07-28 14:30', trackingNo: 'SF7788100221',
    logistics: [
      { time: '2026-07-28 14:30', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-07-28 16:05', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-29 09:12', title: '商品已出库', detail: '顺丰速运 SF7788100221 揽收，直配到店' },
      { time: '2026-07-30 10:48', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-30 16:20', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-31 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  },
  {
    id: 'SO2026081501', amount: 640, saved: 400, itemCount: 20,
    items: [{ productId: 'SP09', skuId: 'SP09-30', name: '高山土鸡蛋', skuName: '30 枚装', image: '/static/images/field.webp', quantity: 20, price: 32 }],
    status: 'submitted', createdAt: '2026-08-15 09:12',
    logistics: [{ time: '2026-08-15 09:12', title: '订单已提交', detail: '已提交至供应链中台，等待接单' }]
  },
  {
    id: 'SO2026081502', amount: 417, saved: 303, itemCount: 5,
    items: [
      { productId: 'SP19', skuId: 'SP19-1', name: '安化黑茶砖', skuName: '1kg 砖', image: '/static/images/tea.webp', quantity: 2, price: 96 },
      { productId: 'SP17', skuId: 'SP17-1', name: '古丈毛尖绿茶', skuName: '250g 罐装', image: '/static/images/tea.webp', quantity: 3, price: 75 }
    ],
    status: 'submitted', createdAt: '2026-08-15 10:35',
    logistics: [{ time: '2026-08-15 10:35', title: '订单已提交', detail: '已提交至供应链中台，等待接单' }],
    remark: '茶叶怕压，请轻拿轻放'
  },
  {
    id: 'SO2026081402', amount: 570, saved: 335, itemCount: 15,
    items: [
      { productId: 'P001', skuId: 'P001-1000', name: '湘西烟熏柴火腊肉', skuName: '1kg家庭装', image: '/static/images/bacon.webp', quantity: 5, price: 78 },
      { productId: 'SP14', skuId: 'SP14-3', name: '手工辣椒酱', skuName: '3 瓶装', image: '/static/images/chili.webp', quantity: 10, price: 18 }
    ],
    status: 'accepted', createdAt: '2026-08-14 11:20',
    logistics: [
      { time: '2026-08-14 11:20', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-14 13:05', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081403', amount: 280, saved: 192, itemCount: 4,
    items: [{ productId: 'SP20', skuId: 'SP20-1', name: '土榨菜籽油', skuName: '5L 装', image: '/static/images/field.webp', quantity: 4, price: 70 }],
    status: 'accepted', createdAt: '2026-08-14 15:48',
    logistics: [
      { time: '2026-08-14 15:48', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-14 17:30', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081201', amount: 450, saved: 330, itemCount: 10,
    items: [{ productId: 'SP10', skuId: 'SP10-5J', name: '时令鲜果礼盒', skuName: '5 斤礼盒', image: '/static/images/peach.webp', quantity: 10, price: 45 }],
    status: 'shipped', createdAt: '2026-08-12 10:05', trackingNo: 'SF7788995502',
    logistics: [
      { time: '2026-08-12 10:05', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-12 11:40', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-13 08:50', title: '商品已出库', detail: '顺丰速运 SF7788995502 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026081202', amount: 544, saved: 320, itemCount: 8,
    items: [{ productId: 'SP11', skuId: 'SP11-2K', name: '农家土猪肉', skuName: '2kg 装', image: '/static/images/bacon.webp', quantity: 8, price: 68 }],
    status: 'delivering', createdAt: '2026-08-12 16:30', trackingNo: 'SF7788996623',
    logistics: [
      { time: '2026-08-12 16:30', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-13 09:12', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-13 15:20', title: '商品已出库', detail: '顺丰速运 SF7788996623 揽收，直配到店' },
      { time: '2026-08-14 11:45', title: '配送中', detail: '已到达湘西州中转场，预计明日送达门店' }
    ]
  },
  {
    id: 'SO2026080501', amount: 252, saved: 204, itemCount: 6,
    items: [{ productId: 'SP22', skuId: 'SP22-1', name: '杨梅果酒', skuName: '750ml 单瓶', image: '/static/images/field.webp', quantity: 6, price: 42 }],
    status: 'received', createdAt: '2026-08-05 14:22', trackingNo: 'SF7788003310',
    logistics: [
      { time: '2026-08-05 14:22', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-08-05 16:10', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-06 09:30', title: '商品已出库', detail: '顺丰速运 SF7788003310 揽收，直配到店' },
      { time: '2026-08-07 10:20', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-08-07 15:40', title: '已签收', detail: '门店已收货并验货签收' }
    ]
  },
  {
    id: 'SO2026072001', amount: 680, saved: 540, itemCount: 30,
    items: [
      { productId: 'SP23', skuId: 'SP23-1', name: '湘西苞谷酒', skuName: '2.5L 桶', image: '/static/images/field.webp', quantity: 10, price: 38 },
      { productId: 'SP26', skuId: 'SP26-1', name: '食品级保鲜袋', skuName: '500 只/箱', image: '/static/images/field.webp', quantity: 20, price: 15 }
    ],
    status: 'completed', createdAt: '2026-07-20 09:50', trackingNo: 'SF7786112201',
    logistics: [
      { time: '2026-07-20 09:50', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-07-20 11:25', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-21 08:40', title: '商品已出库', detail: '顺丰速运 SF7786112201 揽收，直配到店' },
      { time: '2026-07-22 10:15', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-22 16:30', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-23 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  },
  {
    id: 'SO2026071501', amount: 660, saved: 396, itemCount: 13,
    items: [
      { productId: 'SP24', skuId: 'SP24-1', name: '加厚浴巾三件套', skuName: '三件套', image: '/static/images/field.webp', quantity: 8, price: 45 },
      { productId: 'SP25', skuId: 'SP25-1', name: '软底防滑拖鞋', skuName: '20 双/箱', image: '/static/images/field.webp', quantity: 5, price: 60 }
    ],
    status: 'completed', createdAt: '2026-07-15 11:05', trackingNo: 'SF7785113302',
    logistics: [
      { time: '2026-07-15 11:05', title: '订单已提交', detail: '已提交至供应链中台，等待接单' },
      { time: '2026-07-15 14:20', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-16 09:10', title: '商品已出库', detail: '顺丰速运 SF7785113302 揽收，直配到店' },
      { time: '2026-07-17 10:40', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-17 15:20', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-18 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  }
] : []

function mergeStoreOrders(farmId: string, current: StoreOrder[]): StoreOrder[] {
  const seeds = seedOrders(farmId)
  const seedIds = new Set(seeds.map((order) => order.id))
  const tenantOrders = current.filter((order) => !order.farmId || order.farmId === farmId)
  const customOrders = tenantOrders.filter((order) => !seedIds.has(order.id))
  const mergedSeeds = mergeEntitySeeds(seeds, tenantOrders).filter((order) => seedIds.has(order.id))
  return [...customOrders, ...mergedSeeds].map((order) => {
    const rawStatus = String(order.status)
    const status: StoreOrderStatus = rawStatus === 'cancelled' ? 'unpaid-cancelled' : rawStatus as StoreOrderStatus
    const cancelled = status === 'paid-cancelled' || status === 'unpaid-cancelled'
    return {
      ...order,
      status,
      paidAt: order.paidAt || (!cancelled && status !== 'pending-payment' ? order.createdAt : undefined)
    }
  })
}

export const useStoreStore = defineStore('store', {
  state: (): StoreState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    info: cloneSeed(storeInfo),
    products: [],
    catalogRevision: 0,
    cart: [],
    checkoutLineKeys: [],
    orders: seedOrders(),
    checkoutError: '',
    auth: { isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null, priceLevel: null },
    tenantSessions: {}
  }),
  getters: {
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => calcCartTotal(state.cart.map(({ price, quantity }) => ({ price, quantity }))),
    cartHasUnavailable: (state) => state.cart.some((item) => item.unavailable),
    checkoutLines: (state) => state.cart.filter((item) => state.checkoutLineKeys.includes(cartLineKey(item))),
    checkoutCount: (state) => state.cart.filter((item) => state.checkoutLineKeys.includes(cartLineKey(item))).reduce((sum, item) => sum + item.quantity, 0),
    checkoutTotal: (state) => calcCartTotal(state.cart.filter((item) => state.checkoutLineKeys.includes(cartLineKey(item))).map(({ price, quantity }) => ({ price, quantity }))),
    checkoutSaved: (state) => Math.round(state.cart.filter((item) => state.checkoutLineKeys.includes(cartLineKey(item))).reduce((sum, item) => sum + (item.retail - item.price) * item.quantity, 0) * 100) / 100,
    checkoutHasUnavailable: (state) => state.cart.filter((item) => state.checkoutLineKeys.includes(cartLineKey(item))).some((item) => item.unavailable),
    orderMetrics: (state) => {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const norm = (value: string) => {
        const match = value.match(/(\d{4})[\/-](\d{1,2})/)
        return match ? `${match[1]}-${match[2].padStart(2, '0')}` : value.slice(0, 7)
      }
      const monthOrders = state.orders.filter((order) => norm(order.createdAt) === month)
      return {
        monthAmount: Math.round(monthOrders.reduce((sum, order) => sum + order.amount, 0) * 100) / 100,
        orderCount: state.orders.length,
        pendingReceipt: state.orders.filter((order) => ['submitted', 'accepted', 'shipped', 'delivering'].includes(order.status)).length,
        savedAmount: Math.round(state.orders.reduce((sum, order) => sum + (order.saved || 0), 0) * 100) / 100
      }
    },
    /** 当前登录身份的分销价折让系数（门店账号为 1） */
    priceDiscount: (state) => businessPriceLevelDiscount(state.auth.priceLevel),
    /** 当前登录身份的价格档位文案 */
    priceLevelLabel: (state) => businessPriceLevelLabel(state.auth.priceLevel),
    isStoreOwner: (state) => state.auth.role === 'owner'
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.products.length > 0
      this.loading = true
      this.error = ''
      try {
        initializePlatformRecoveryHandlers(createStoreAtomicRecoveryHandlerRegistrations())
        for (const handlerKey of [STORE_ORDER_RECOVERY_HANDLER_KEY, STORE_RETURN_RECOVERY_HANDLER_KEY]) {
          const reconciliation = reconcilePendingPlatformTransactions({ handlerKey, matches: isStoreReturnJournal })
          if (!reconciliation.ok) throw new Error(reconciliation.message)
        }
        const farmId = this.auth.farmId || 'F001'
        const account = this.currentStoreAccounts().find((item) => item.id === this.auth.accountId)
        // 运营后台可能调整了业务员档位，登录期间刷新时同步到当前会话
        if (this.auth.isLoggedIn) this.auth.priceLevel = resolveBusinessPriceLevel(account)
        const data = await storeRepository.loadStore(this.mockScenario, farmId, account)
        const catalog = ensureCatalogState(data.products, cProducts)
        this.$patch({
          info: hasPersistedData ? mergePersistedDefaults(data.info, this.info) : data.info,
          products: catalogProductsForAudience(catalog, 'ordering').map(catalogProductToProduct),
          catalogRevision: catalog.revision,
          orders: mergeStoreOrders(farmId, this.orders),
          initialized: true
        })
        applyPlatformMedia(null, this.products)
        const storeMedia = readPlatformMedia()
        if (storeMedia?.farms[farmId]) this.info.image = storeMedia.farms[farmId]
        this.cart.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (product && sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, price: this.unitPriceFor(product, sku, line.quantity), retail: product.price, stock: sku.stock })
        })
        this.orders.forEach((order) => order.items.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (product && sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, image: product.image })
        }))
        const cartKeys = this.cart.map(cartLineKey)
        const availableCartKeys = new Set(cartKeys)
        this.checkoutLineKeys = this.checkoutLineKeys.length ? this.checkoutLineKeys.filter((key) => availableCartKeys.has(key)) : cartKeys
        await this.sweepExpiredPaymentOrders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    setMockScenario(scenario: MockScenario) {
      this.mockScenario = scenario
      this.initialized = false
    },
    setCheckoutSelection(keys: string[]) {
      const available = new Set(this.cart.map(cartLineKey))
      this.checkoutLineKeys = [...new Set(keys)].filter((key) => available.has(key))
    },
    isCheckoutSelected(line: Pick<CartLine, 'productId' | 'skuId'>) {
      return this.checkoutLineKeys.includes(cartLineKey(line))
    },
    toggleCheckoutSelection(line: Pick<CartLine, 'productId' | 'skuId'>) {
      const key = cartLineKey(line)
      this.checkoutLineKeys = this.checkoutLineKeys.includes(key) ? this.checkoutLineKeys.filter((item) => item !== key) : [...this.checkoutLineKeys, key]
    },
    toggleAllCheckoutSelection() {
      const keys = this.cart.filter((line) => !line.unavailable).map(cartLineKey)
      this.checkoutLineKeys = keys.length > 0 && keys.every((key) => this.checkoutLineKeys.includes(key)) ? [] : keys
    },
    /** 分销单价 = 阶梯价基准 × 当前身份档位折让（门店账号折让系数为 1） */
    unitPriceFor(product: Product, sku: Product['skus'][number], quantity: number): number {
      return round2(storeUnitPrice(product, sku, quantity) * businessPriceLevelDiscount(this.auth.priceLevel))
    },
    repriceCart() {
      this.cart.forEach((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        if (product && sku) line.price = this.unitPriceFor(product, sku, line.quantity)
      })
    },
    addToCart(product: Product, skuId?: string, quantity?: number) {
      if (product.skus.length > 1 && !skuId) return 'sku-required' as const
      const sku = product.skus.find((item) => item.id === skuId) || product.skus[0]
      const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
      const initialQuantity = initialCatalogOrderQuantity(minimumOrderQuantity)
      if (!sku) {
        this.checkoutError = `${product.name}库存不足`
        return 'out-of-stock' as const
      }
      const line = this.cart.find((item) => item.productId === product.id && item.skuId === sku.id)
      const increment = quantity ?? (line ? 1 : initialQuantity)
      const requestedValidation = quantity === undefined ? null : validateCatalogSkuOrderQuantity(sku, increment)
      if (requestedValidation && !requestedValidation.ok) {
        this.checkoutError = requestedValidation.code === 'invalid_quantity'
          ? `${product.name}购买数量需为正整数`
          : requestedValidation.code === 'below_minimum_order_quantity'
            ? `${product.name}购买数量不能低于起订量 ${minimumOrderQuantity} 件`
            : `${product.name}（${sku.name}）库存不足`
        return 'out-of-stock' as const
      }
      const nextQuantity = (line?.quantity || 0) + increment
      const nextValidation = validateCatalogSkuOrderQuantity(sku, nextQuantity)
      if (!nextValidation.ok) {
        this.checkoutError = nextValidation.code === 'invalid_quantity'
          ? `${product.name}购买数量需为正整数`
          : nextValidation.code === 'below_minimum_order_quantity' || (quantity === undefined && !line && sku.stock < minimumOrderQuantity)
            ? `${product.name}库存不足或购买数量未达要求`
            : `${product.name}（${sku.name}）库存不足`
        return 'out-of-stock' as const
      }
      if (line) {
        line.quantity = nextQuantity
        line.price = this.unitPriceFor(product, sku, nextQuantity)
        line.stock = sku.stock
        line.minimumOrderQuantity = minimumOrderQuantity
        line.unavailable = false
      } else {
        this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: sku.image || product.image, price: this.unitPriceFor(product, sku, increment), retail: product.price, stock: sku.stock, quantity: increment, minimumOrderQuantity, unavailable: false })
      }
      const key = cartLineKey({ productId: product.id, skuId: sku.id })
      if (!this.checkoutLineKeys.includes(key)) this.checkoutLineKeys.push(key)
      this.checkoutError = ''
      return 'added' as const
    },
    setCartQuantity(productId: string, skuId: string, quantity: number) {
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      const product = this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (!line || !product || !sku) return false
      const validation = validateCatalogSkuOrderQuantity(sku, quantity)
      if (!validation.ok) {
        this.checkoutError = validation.code === 'invalid_quantity'
          ? `${line.name}购买数量需为正整数`
          : validation.code === 'below_minimum_order_quantity'
            ? `${line.name}购买数量不能低于起订量 ${validation.minimumOrderQuantity} 件`
            : `${line.name}（${line.skuName}）库存不足`
        return false
      }
      line.quantity = quantity
      line.price = this.unitPriceFor(product, sku, quantity)
      line.stock = sku.stock
      line.minimumOrderQuantity = validation.minimumOrderQuantity
      line.unavailable = false
      this.checkoutError = ''
      return true
    },
    changeCart(productId: string, skuId: string, delta: number) {
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      if (!line) return false
      const product = this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (delta > 0 && (!sku || line.quantity + delta > sku.stock)) {
        this.checkoutError = `${line.name}（${line.skuName}）库存不足`
        return false
      }
      line.quantity += delta
      if (line.quantity <= 0) {
        this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId))
        this.checkoutLineKeys = this.checkoutLineKeys.filter((key) => key !== cartLineKey({ productId, skuId }))
      } else {
        line.stock = sku?.stock ?? 0
        line.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        line.unavailable = !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
        if (product && sku) line.price = this.unitPriceFor(product, sku, line.quantity)
      }
      this.checkoutError = ''
      return true
    },
    removeLine(productId: string, skuId: string) {
      this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId))
      this.checkoutLineKeys = this.checkoutLineKeys.filter((key) => key !== cartLineKey({ productId, skuId }))
      this.checkoutError = ''
    },
    applyCatalogState(state: CatalogState) {
      this.catalogRevision = state.revision
      this.products = catalogProductsForAudience(state, 'ordering').map(catalogProductToProduct)
      const availableCartKeys = new Set(this.cart.map(cartLineKey))
      this.checkoutLineKeys = this.checkoutLineKeys.filter((key) => availableCartKeys.has(key))
      this.cart = this.cart.map((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        if (!product || !sku) return { ...line, stock: 0, minimumOrderQuantity, unavailable: true }
        return { ...line, name: product.name, image: sku.image || product.image, price: this.unitPriceFor(product, sku, line.quantity), retail: product.price, stock: sku.stock, minimumOrderQuantity, unavailable: !validateCatalogSkuOrderQuantity(sku, line.quantity).ok }
      })
      const selectableCartKeys = new Set(this.cart.filter((line) => !line.unavailable).map(cartLineKey))
      this.checkoutLineKeys = this.checkoutLineKeys.filter((key) => selectableCartKeys.has(key))
    },
    refreshCatalog(message = '') {
      const state = readCatalogState()
      if (!state) return false
      this.applyCatalogState(state)
      if (message) this.checkoutError = message
      return true
    },
    recoverCatalogTransactions() {
      const pendingRecoveryOperationIds = new Set(readPlatformRecoveryQueue()
        .filter((task) => task.status === 'pending' && task.handlerKey === STORE_RETURN_RECOVERY_HANDLER_KEY)
        .map((task) => task.operationId))
      for (const entry of readPendingCatalogTransactions('store')) {
        if (pendingRecoveryOperationIds.has(entry.id)) continue
        const payload = entry.payload as { order?: StoreOrder; afterSale?: AfterSale }
        if (!payload.order?.id) continue
        if (entry.status === 'prepared') {
      const catalog = readCatalogState()
          if (!catalog) continue
          const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, catalog.revision)
          if (!result || !markCatalogTransactionStockApplied(entry.id)) continue
          this.applyCatalogState(result.state)
        }
        const recoveredOrders = toPlatformOrders(payload.order, this.products, this.info, payload.order.farmId || this.auth.farmId || 'F001')
        if (!recoveredOrders.every((platformOrder) => writePlatformOrder(platformOrder))) continue
        payload.order.platformOrderIds = recoveredOrders.map((platformOrder) => platformOrder.id)
        if (payload.afterSale && !writePlatformAfterSale(payload.afterSale)) continue
        const existing = this.orders.find((order) => order.id === payload.order!.id)
        if (existing) Object.assign(existing, cloneSeed(payload.order))
        else this.orders.unshift(cloneSeed(payload.order))
        commitCatalogTransaction(entry.id)
      }
      const latest = readCatalogState()
      if (latest && latest.revision !== this.catalogRevision) this.applyCatalogState(latest)
    },
    async submitOrder(remark = '', lineKeys?: string[]) {
      this.checkoutError = ''
      if (!this.cart.length) {
        this.checkoutError = '进货单为空'
        return null
      }
      const selectedKeys = new Set(lineKeys?.length ? lineKeys : this.cart.map(cartLineKey))
      const selectedLines = this.cart.filter((line) => selectedKeys.has(cartLineKey(line)))
      if (!selectedLines.length) {
        this.checkoutError = '请先选择要结算的商品'
        return null
      }
      const platformEntitiesRevision = readPlatformCollectionRevision(PLATFORM_ENTITIES_STORAGE_KEY)
      const unavailableSupplier = unavailableSupplierName(selectedLines.map((line) => this.products.find((product) => product.id === line.productId)?.supplierId || ''))
      if (unavailableSupplier) {
        this.checkoutError = `${unavailableSupplier}已暂停接单，请选择其他商品`
        return null
      }
      const catalog = readCatalogState()
      if (!catalog) { this.checkoutError = '商品库存已更新，请刷新后重试'; return null }
      const revisionChanged = catalog.revision !== this.catalogRevision
      if (revisionChanged) this.applyCatalogState(catalog)
      const insufficient = selectedLines.find((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      })
      if (insufficient) {
        const sku = this.products.find((item) => item.id === insufficient.productId)?.skus.find((item) => item.id === insufficient.skuId)
        const validation = sku ? validateCatalogSkuOrderQuantity(sku, insufficient.quantity) : null
        this.checkoutError = !sku ? `${insufficient.name}（${insufficient.skuName}）规格已失效` : validation && !validation.ok && (validation.code === 'below_minimum_order_quantity' || sku.stock < normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)) ? `${insufficient.name}（${insufficient.skuName}）库存不足或购买数量未达要求` : `${insufficient.name}（${insufficient.skuName}）库存不足`
        return null
      }
      if (revisionChanged) { this.checkoutError = '商品库存已更新，请刷新后重试'; return null }
      const pricedCart = selectedLines.map((line) => {
        const product = this.products.find((item) => item.id === line.productId)!
        const sku = product.skus.find((item) => item.id === line.skuId)!
        return { ...line, price: this.unitPriceFor(product, sku, line.quantity) }
      })
      const amount = calcCartTotal(pricedCart.map(({ price, quantity }) => ({ price, quantity })))
      const saved = Math.round(pricedCart.reduce((sum, line) => sum + (line.retail - line.price) * line.quantity, 0) * 100) / 100
      const itemCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0)
      const orderItems = pricedCart.map((line) => ({ productId: line.productId, skuId: line.skuId, skuName: line.skuName, name: line.name, image: mediaValueToImage(line.image), quantity: line.quantity, price: line.price, minimumOrderQuantity: normalizeMinimumOrderQuantity(line.minimumOrderQuantity) }))
      const nowDate = new Date()
      const now = nowDate.toLocaleString('zh-CN')
      const paymentDeadlineAt = new Date(nowDate.getTime() + 15 * 60 * 1000).toISOString()
      const order: StoreOrder = {
        id: createId('SO'), farmId: this.auth.farmId || 'F001', amount, saved, itemCount, items: orderItems, status: 'pending-payment', createdAt: now, paymentDeadlineAt,
        logistics: [{ time: now, title: '订单待付款', detail: '请在 15 分钟内完成支付，支付后进入待接单' }], remark: remark.trim() || undefined
      }
      const inventoryChanges = selectedLines.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const operationId = `${order.id}:reserve`
      const stable = readStableStoreReturnSnapshot()
      if (!stable || stable.snapshot.catalog.revision !== catalog.revision) { this.checkoutError = '商品库存已更新，请刷新后重试'; return null }
      const original = stable.snapshot
      const targetCatalog = cloneSeed(original.catalog)
      for (const change of inventoryChanges) {
        const sku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((item) => item.id === change.skuId)
        if (!sku || !validateCatalogSkuOrderQuantity(sku, -change.quantity).ok) { this.checkoutError = '商品库存已更新，请刷新后重试'; return null }
        sku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = { id: operationId, action: 'reserve', requestFingerprint: JSON.stringify({ action: 'reserve', changes: inventoryChanges }), changes: [], appliedAt: new Date().toISOString() }
      const platformOrders = toPlatformOrders(order, this.products, this.info, order.farmId || this.auth.farmId || 'F001')
      order.platformOrderIds = platformOrders.map((platformOrder) => platformOrder.id)
      const targetPlatformOrders = cloneSeed(original.platformOrders)
      platformOrders.forEach((platformOrder) => { targetPlatformOrders[platformOrder.id] = platformOrder })
      const target: StoreReturnSnapshot = { catalog: targetCatalog, afterSales: cloneSeed(original.afterSales), platformOrders: targetPlatformOrders }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY],
        lockCollections: [PLATFORM_ENTITIES_STORAGE_KEY],
        original,
        target,
        recoveryHandlerKey: STORE_ORDER_RECOVERY_HANDLER_KEY,
        recoverySchema: STORE_ORDER_RECOVERY_SCHEMA,
        revisionChecks: [
          { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog },
          { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales },
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders },
          { key: PLATFORM_ENTITIES_STORAGE_KEY, expectedRevision: platformEntitiesRevision }
        ],
        steps: [
          { key: 'catalog', apply: () => writeCatalogState(targetCatalog, original.catalog.revision), rollback: () => writeCatalogState(original.catalog, targetCatalog.revision) },
          { key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(original.platformOrders) }
        ]
      })
      if (!result.ok) {
        this.checkoutError = result.code === 'revision_conflict' ? '商品或价格信息已更新，请刷新后重试' : result.fatal ? '订单事务恢复失败，请联系平台处理' : '订单处理中，请刷新后重试'
        return null
      }
      this.applyCatalogState(targetCatalog)
      this.orders.unshift(order)
      this.cart = this.cart.filter((line) => !selectedKeys.has(cartLineKey(line)))
      this.checkoutLineKeys = this.checkoutLineKeys.filter((key) => !selectedKeys.has(key))
      return order.id
    },
    async advanceOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || !['submitted', 'accepted', 'shipped', 'delivering', 'received'].includes(order.status)) return false
      const nextOrder = cloneSeed(order)
      nextOrder.status = nextPurchaseStatus(order.status as PurchaseStatus) as StoreOrderStatus
      nextOrder.logistics = [...order.logistics, logisticsEventFor(nextOrder.status, nextOrder)]
      const stable = readStableStoreReturnSnapshot()
      if (!stable) return false
      const targetPlatformOrders = nextStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001', stable.snapshot.platformOrders)
      if (!targetPlatformOrders) return false
      const target: StoreReturnSnapshot = { ...cloneSeed(stable.snapshot), platformOrders: targetPlatformOrders }
      const result = await runLockedPlatformTransaction({ operationId: `${id}:advance:${nextOrder.status}`, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original: stable.snapshot, target, recoveryHandlerKey: STORE_ORDER_RECOVERY_HANDLER_KEY, recoverySchema: STORE_ORDER_RECOVERY_SCHEMA, revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog }, { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales }, { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders }], steps: [{ key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(stable.snapshot.platformOrders) }] })
      if (!result.ok) return false
      Object.assign(order, nextOrder)
      return true
    },
    async confirmReceipt(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'delivering') return false
      const nextOrder = cloneSeed(order)
      nextOrder.status = 'received'
      nextOrder.logistics = [...order.logistics, logisticsEventFor('received', nextOrder)]
      const stable = readStableStoreReturnSnapshot()
      if (!stable) return false
      const targetPlatformOrders = nextStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001', stable.snapshot.platformOrders)
      if (!targetPlatformOrders) return false
      const target: StoreReturnSnapshot = { ...cloneSeed(stable.snapshot), platformOrders: targetPlatformOrders }
      const result = await runLockedPlatformTransaction({ operationId: `${id}:receipt`, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original: stable.snapshot, target, recoveryHandlerKey: STORE_ORDER_RECOVERY_HANDLER_KEY, recoverySchema: STORE_ORDER_RECOVERY_SCHEMA, revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog }, { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales }, { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders }], steps: [{ key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(stable.snapshot.platformOrders) }] })
      if (!result.ok) return false
      Object.assign(order, nextOrder)
      return true
    },
    async payOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'pending-payment') return false
      if (order.paymentDeadlineAt && Date.parse(order.paymentDeadlineAt) <= Date.now()) {
        await this.cancelOrder(id, 'timeout')
        this.checkoutError = '订单已超过 15 分钟支付时限，已自动取消'
        return false
      }
      const supplierId = this.products.find((product) => product.id === order.items[0]?.productId)?.supplierId || ''
      const unavailableSupplier = supplierId ? unavailableSupplierName([supplierId]) : null
      if (unavailableSupplier) { this.checkoutError = `${unavailableSupplier}已暂停接单，暂时无法支付`; return false }
      const stable = readStableStoreReturnSnapshot()
      if (!stable) return false
      const nextOrder = cloneSeed(order)
      nextOrder.status = 'submitted'
      nextOrder.paidAt = new Date().toISOString()
      nextOrder.logistics = [...order.logistics, logisticsEventFor('submitted', nextOrder)]
      const targetPlatformOrders = nextStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001', stable.snapshot.platformOrders)
      if (!targetPlatformOrders) return false
      const target: StoreReturnSnapshot = { ...cloneSeed(stable.snapshot), platformOrders: targetPlatformOrders }
      const result = await runLockedPlatformTransaction({ operationId: `${id}:payment`, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original: stable.snapshot, target, recoveryHandlerKey: STORE_ORDER_RECOVERY_HANDLER_KEY, recoverySchema: STORE_ORDER_RECOVERY_SCHEMA, revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog }, { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales }, { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders }], steps: [{ key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(stable.snapshot.platformOrders) }] })
      if (!result.ok) return false
      Object.assign(order, nextOrder)
      return true
    },
    async cancelOrder(id: string, reason: 'manual' | 'timeout' = 'manual') {
      const order = this.orders.find((item) => item.id === id)
      if (!order || !['pending-payment', 'submitted', 'accepted'].includes(order.status)) return false
      if (order.inventoryReleased) return false
      const catalog = readCatalogState()
      if (!catalog || catalog.revision !== this.catalogRevision) { this.refreshCatalog('商品库存已更新，请刷新后重试'); return false }
      const stable = readStableStoreReturnSnapshot()
      if (!stable || stable.snapshot.catalog.revision !== catalog.revision) { this.checkoutError = '商品库存已更新，请刷新后重试'; return false }
      const original = stable.snapshot
      const nextOrder = cloneSeed(order)
      nextOrder.status = order.status === 'pending-payment' ? 'unpaid-cancelled' : 'paid-cancelled'
      nextOrder.inventoryReleased = true
      nextOrder.cancelledAt = new Date().toISOString()
      nextOrder.logistics.push(reason === 'timeout'
        ? { time: new Date().toLocaleString('zh-CN'), title: '支付超时自动取消', detail: '超过 15 分钟未支付，订单已自动取消并释放库存' }
        : logisticsEventFor(nextOrder.status, nextOrder))
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:release`
      const targetCatalog = cloneSeed(original.catalog)
      for (const change of inventoryChanges) {
        const sku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((item) => item.id === change.skuId)
        if (!sku) return false
        sku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes: inventoryChanges }), changes: [], appliedAt: new Date().toISOString() }
      const targetPlatformOrders = nextStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001', original.platformOrders)
      if (!targetPlatformOrders) return false
      const target: StoreReturnSnapshot = { catalog: targetCatalog, afterSales: cloneSeed(original.afterSales), platformOrders: targetPlatformOrders }
      const result = await runLockedPlatformTransaction({ operationId, collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: STORE_ORDER_RECOVERY_HANDLER_KEY, recoverySchema: STORE_ORDER_RECOVERY_SCHEMA, revisionChecks: [{ key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog }, { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales }, { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders }], steps: [{ key: 'catalog', apply: () => writeCatalogState(targetCatalog, original.catalog.revision), rollback: () => writeCatalogState(original.catalog, targetCatalog.revision) }, { key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(original.platformOrders) }] })
      if (!result.ok) return false
      this.applyCatalogState(targetCatalog)
      Object.assign(order, nextOrder)
      return true
    },
    async sweepExpiredPaymentOrders() {
      const now = Date.now()
      const expired = this.orders.filter((order) => order.status === 'pending-payment' && !!order.paymentDeadlineAt && Date.parse(order.paymentDeadlineAt) <= now)
      let count = 0
      for (const order of expired) {
        if (await this.cancelOrder(order.id, 'timeout')) count += 1
      }
      return count
    },
    initiateAfterSale(orderId: string, type: 'refund' | 'return' = 'refund') {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order || (order.status !== 'received' && order.status !== 'completed')) return false
      if (Object.values(readPlatformAfterSales() || {}).some((work) => work.orderId === orderId)) return false
      const first = order.items[0]
      if (!writePlatformAfterSale({
        id: createId('AS'), orderId, productName: first?.name || '进货商品', applicant: this.info.name,
        type, amount: order.amount, status: 'processing', issue: '进货商品质量问题，门店申请售后',
        quantity: first?.quantity || order.itemCount, image: first?.image,
        history: [{ time: new Date().toLocaleString('zh-CN'), action: '门店发起售后，平台受理中', operator: this.info.name }]
      } as AfterSale)) return false
      order.afterSaleType = type
      return true
    },
    async completeReturn(orderId: string) {
      const order = this.orders.find((item) => item.id === orderId)
      const stable = readStableStoreReturnSnapshot()
      const work = Object.values(stable?.snapshot.afterSales || {}).find((item) => item.orderId === orderId && item.type === 'return')
      if (!order || !work || order.inventoryReleased || (work.status !== 'return-pending' && work.status !== 'processing')) return false
      if (!stable || stable.snapshot.catalog.revision !== this.catalogRevision) {
        this.refreshCatalog('商品库存已更新，请刷新后重试')
        return false
      }
      const { catalog: originalCatalog, afterSales: originalAfterSales, platformOrders: originalPlatformOrders } = stable.snapshot
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:return-release`
      const nextOrder = { ...cloneSeed(order), inventoryReleased: true }
      const nextAfterSale: AfterSale = { ...work, status: 'refunded', history: [...(work.history || []), { time: new Date().toLocaleString('zh-CN'), action: '退货确认完成，库存已回补', operator: this.info.name }] }
      const targetCatalog = cloneSeed(originalCatalog)
      for (const change of inventoryChanges) {
        const sku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((item) => item.id === change.skuId)
        if (!sku) return false
        sku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = {
        id: operationId,
        action: 'release',
        requestFingerprint: JSON.stringify({ action: 'release', changes: inventoryChanges }),
        changes: [],
        appliedAt: new Date().toISOString()
      }
      const targetPlatformOrders = nextStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001', originalPlatformOrders)
      if (!targetPlatformOrders) return false
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY],
        original: { catalog: originalCatalog, afterSales: originalAfterSales, platformOrders: originalPlatformOrders },
        target: { catalog: targetCatalog, afterSales: { ...(originalAfterSales || {}), [nextAfterSale.id]: nextAfterSale }, platformOrders: targetPlatformOrders },
        recoveryHandlerKey: STORE_RETURN_RECOVERY_HANDLER_KEY,
        recoverySchema: STORE_RETURN_RECOVERY_SCHEMA,
        revisionChecks: [
          { key: PLATFORM_CATALOG_STORAGE_KEY, expectedRevision: stable.revisions.catalog },
          { key: PLATFORM_AFTERSALES_STORAGE_KEY, expectedRevision: stable.revisions.afterSales },
          { key: PLATFORM_ORDERS_STORAGE_KEY, expectedRevision: stable.revisions.platformOrders }
        ],
        steps: [
          { key: 'catalog-stock', apply: () => writeCatalogState(targetCatalog, originalCatalog.revision), rollback: () => writeCatalogState(originalCatalog) },
          { key: 'platform-after-sales', apply: () => writePlatformAfterSales({ ...(originalAfterSales || {}), [nextAfterSale.id]: nextAfterSale }), rollback: () => writePlatformAfterSales(originalAfterSales) },
          { key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(originalPlatformOrders) }
        ]
      })
      if (!result.ok) {
        if (result.fatal) this.error = '退货事务恢复失败，请联系平台处理'
        return false
      }
      this.applyCatalogState(targetCatalog)
      Object.assign(order, nextOrder)
      return true
    },
    repeatOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order) return false
      let added = 0
      order.items.forEach((item) => {
        const product = this.products.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        if (!product || !sku || sku.stock <= 0) return
        const quantity = Math.min(item.quantity, sku.stock)
        const line = this.cart.find((candidate) => candidate.productId === item.productId && candidate.skuId === item.skuId)
        if (line) {
          const before = line.quantity
          line.quantity = Math.min(line.quantity + quantity, sku.stock)
          if (line.quantity > before) {
            line.price = this.unitPriceFor(product, sku, line.quantity)
            line.stock = sku.stock
            line.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)
            line.unavailable = !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
            added += 1
          }
        } else {
          this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: sku.image || product.image, price: this.unitPriceFor(product, sku, quantity), retail: product.price, stock: sku.stock, quantity, minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity), unavailable: !validateCatalogSkuOrderQuantity(sku, quantity).ok })
          added += 1
        }
      })
      this.checkoutError = added ? '' : '订单商品当前无可进货库存'
      return added > 0
    },
    currentStoreAccounts(): StoreAccount[] {
      return mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
    },
    saveCurrentTenantSession() {
      if (!this.auth.farmId) return
      this.tenantSessions[this.auth.farmId] = cloneSeed({ cart: this.cart, orders: this.orders })
    },
    activateStoreAccount(account: StoreAccount) {
      const previousFarmId = this.auth.farmId
      if (previousFarmId && previousFarmId !== account.farmId) this.saveCurrentTenantSession()
      const session = this.tenantSessions[account.farmId]
      if (session) {
        this.cart = cloneSeed(session.cart)
        this.orders = cloneSeed(session.orders)
      } else if (previousFarmId !== account.farmId && account.farmId !== 'F001') {
        this.cart = []
        this.orders = seedOrders(account.farmId)
      }
      const principal: PlatformPrincipal = { actorType: 'store', actorId: account.id, tenantId: account.farmId, status: 'active' }
      this.auth = {
        isLoggedIn: true,
        phone: account.account,
        principal,
        accountId: account.id,
        farmId: account.farmId,
        tenantId: account.farmId,
        role: account.role,
        priceLevel: resolveBusinessPriceLevel(account)
      }
      this.info = storeInfoForFarm(account.farmId, account)
      this.repriceCart()
      this.checkoutLineKeys = this.cart.map(cartLineKey)
      return true
    },
    /** 门店/业务员两类角色登录：传入 role 时只接受对应角色的账号 */
    loginWithPassword(phone: string, password: string, role?: StoreRole) {
      const normalized = phone.trim()
      const account = this.currentStoreAccounts().find((item) => item.account === normalized && item.password === password && item.enabled && (!role || item.role === role))
      return account ? this.activateStoreAccount(account) : false
    },
    loginWithCode(phone: string, code: string, role?: StoreRole) {
      if (!validateSmsCode(code)) return false
      const normalized = phone.trim()
      const account = this.currentStoreAccounts().find((item) => item.account === normalized && item.enabled && (!role || item.role === role))
      return account ? this.activateStoreAccount(account) : false
    },
    /** 登录页身份校验：手机号已存在但角色不符时给出明确提示 */
    storeAccountRole(phone: string): StoreRole | null {
      const normalized = phone.trim()
      return this.currentStoreAccounts().find((item) => item.account === normalized && item.enabled)?.role || null
    },
    async refreshSharedState() {
      if (!this.auth.accountId) return
      const account = this.currentStoreAccounts().find((item) => item.id === this.auth.accountId)
      if (!account?.enabled) {
        this.logout()
        return
      }
      await this.initialize(true)
    },
    logout() {
      this.saveCurrentTenantSession()
      this.checkoutLineKeys = []
      this.auth = { isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null, priceLevel: null }
    }
  }
})
