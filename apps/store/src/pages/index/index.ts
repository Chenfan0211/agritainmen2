import type { BusinessMediaValue, PriceTier, Product, StoreRole } from '@agritainment/shared'
import {
  PLATFORM_AFTERSALES_STORAGE_KEY,
  PLATFORM_CATALOG_STORAGE_KEY,
  PLATFORM_ENTITIES_STORAGE_KEY,
  PLATFORM_MEDIA_STORAGE_KEY,
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_STORE_ACCOUNTS_STORAGE_KEY,
  PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY,
  PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY,
  createPlatformDictionaryCache,
  defaultProductCategoryImage,
  getApiClientConfig,
  matchesPolicyScope,
  mediaValueToImage,
  money,
  normalizeMinimumOrderQuantity,
  productCategoryImage,
  readPlatformAfterSaleStatus,
  readPlatformDictionaries,
  subscribePlatformChanges,
  tieredUnitPrice,
  validateCatalogSkuOrderQuantity,
  validatePhone
} from '@agritainment/shared'
import { seedDemoStoreCart } from '../../data/demo-cart'
import { deriveStoreMetrics } from '../../services/repository'
import { readStorePricePolicies, useStoreStore, type StoreOrderStatus } from '../../stores/store'
import { storeOrderFilterKeys, storeOrderStatusLabel } from '../../order-status'

type TabKey = 'home' | 'category' | 'cart' | 'mine'
type SheetKey = 'product' | 'cart' | 'address' | 'contact' | null

const store = useStoreStore()
const dictCache = createPlatformDictionaryCache()
const platformChangeKeys = [
  PLATFORM_CATALOG_STORAGE_KEY,
  PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY,
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_AFTERSALES_STORAGE_KEY,
  PLATFORM_ENTITIES_STORAGE_KEY,
  PLATFORM_STORE_ACCOUNTS_STORAGE_KEY,
  PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY,
  PLATFORM_MEDIA_STORAGE_KEY
]
const tabs = [
  { key: 'home', label: '首页', icon: 'house' },
  { key: 'category', label: '商品分类', icon: 'layout-dashboard' },
  { key: 'cart', label: '进货车', icon: 'shopping-cart' },
  { key: 'mine', label: '我的', icon: 'user-round' }
]

let dictionaryState = readPlatformDictionaries()
let activePolicies = readStorePricePolicies()
let paymentSweepTimer: ReturnType<typeof setInterval> | null = null
let codeTimer: ReturnType<typeof setInterval> | null = null
let disposeStore: (() => void) | null = null
let disposePlatformChanges: (() => void) | null = null
let disposeDictionary: (() => void) | null = null

function cartLineKey(item: { productId: string; skuId: string }) {
  return `${item.productId}:${item.skuId}`
}

function levelPrice(base: number) {
  return Math.round(base * store.priceDiscount * 100) / 100
}

function savePercent(product: Product) {
  return Math.max(0, Math.round((1 - product.cost / product.price) * 100))
}

function totalStock(product: Product) {
  return product.skus.reduce((sum, sku) => sum + sku.stock, 0)
}

function canStartOrder(sku: Product['skus'][number] | null | undefined) {
  return !!sku && validateCatalogSkuOrderQuantity(sku, Math.max(1, normalizeMinimumOrderQuantity(sku.minimumOrderQuantity))).ok
}

function canStartProductOrder(product: Product) {
  return product.skus.some((sku) => canStartOrder(sku))
}

function stockText(product: Product) {
  const stock = totalStock(product)
  if (stock <= 0) return '已售罄'
  if (stock < 50) return `库存紧张 ${stock.toLocaleString('zh-CN')}`
  return `库存 ${stock.toLocaleString('zh-CN')}`
}

function productView(product: Product) {
  const price = levelPrice(product.cost)
  const canOrder = canStartProductOrder(product)
  return {
    ...product,
    key: product.id,
    levelPriceText: money(price),
    priceText: money(product.price),
    showRetail: product.price > product.cost,
    savePercent: savePercent(product),
    saveText: `省 ${savePercent(product)}%`,
    salesText: product.sales.toLocaleString('zh-CN'),
    stockText: canOrder ? stockText(product) : '库存不足',
    canOrder,
    isPlatform: product.source === 'platform',
    tagsPreview: product.tags.slice(0, 2)
  }
}

function uniqueMedia(items: Array<BusinessMediaValue | undefined>) {
  const seen = new Set<string>()
  const result: Array<{ key: string; src: BusinessMediaValue }> = []
  for (const item of items) {
    if (!item) continue
    const key = mediaValueToImage(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({ key, src: item })
  }
  return result
}

function orderView(order: any) {
  return {
    ...order,
    key: order.id,
    statusLabel: storeOrderStatusLabel(order.status),
    amountText: money(order.amount),
    savedText: money(order.saved),
    firstImage: order.items[0]?.image || '',
    title: order.items[0] ? `${order.items[0].name} ×${order.items[0].quantity}` : '',
    itemsText: `共 ${order.itemCount} 件 · ${order.items.length} 款商品`,
    trackingText: order.trackingNo ? ` · 运单 ${order.trackingNo}` : ''
  }
}

function buildCategories(current: string) {
  const products = store.products
  const keys = ['全部', ...new Set(products.map((item) => item.category))]
  return keys.map((key) => ({
    key,
    label: key,
    count: key === '全部' ? products.length : products.filter((product) => product.category === key).length,
    displayLabel: key === '全部' ? '所有商品' : key,
    active: key === current
  }))
}

function buildVisibleProducts(category: string, keyword: string) {
  const kw = keyword.trim()
  return store.products
    .filter((item) => {
      const matchesCategory = category === '全部' || item.category === category
      const matchesKeyword = !kw || item.name.includes(kw) || item.supplier.includes(kw) || item.tags.some((tag) => tag.includes(kw))
      return matchesCategory && matchesKeyword
    })
    .map(productView)
}

function buildOrderFilters(current: string) {
  return storeOrderFilterKeys.map((key) => ({
    key,
    label: key === 'all' ? '全部' : storeOrderStatusLabel(key as StoreOrderStatus),
    count: key === 'all' ? store.orders.length : store.orders.filter((order) => order.status === key).length,
    active: key === current
  }))
}

function buildStoreMetrics() {
  const metrics = deriveStoreMetrics(store.products)
  return {
    ...metrics,
    monthAmountText: money(store.orderMetrics.monthAmount),
    savedAmountText: money(store.orderMetrics.savedAmount),
    hotOrders: metrics.hotOrders.map((item) => ({ ...item, key: item.id, amountText: money(item.amount) }))
  }
}

function buildCartLines() {
  return store.cart.map((item) => ({
    ...item,
    key: cartLineKey(item),
    selected: store.isCheckoutSelected(item),
    priceText: money(item.price),
    quantityText: String(item.quantity),
    canIncrease: item.quantity < item.stock
  }))
}

function initialData() {
  return {
    isLoggedIn: false,
    store: {
      loading: true,
      error: '',
      info: store.info,
      cartCount: 0,
      checkoutCount: 0,
      checkoutTotalText: money(0),
      checkoutHasUnavailable: false,
      orderMetrics: { monthAmountText: money(0), orderCount: 0, pendingReceipt: 0, savedAmountText: money(0) },
      priceLevelLabel: '门店价',
      isStoreOwner: false,
      cart: [] as Array<Record<string, unknown>>,
      orders: [] as Array<Record<string, unknown>>
    },
    tabs,
    activeTab: 'home' as TabKey,
    mineSection: 'main',
    category: '全部',
    keyword: '',
    orderFilter: 'all',
    sheet: null as SheetKey,
    sheetTitle: '',
    productView: false,
    selectedProduct: null as any,
    selectedSkuId: '',
    detailGallery: [] as Array<Record<string, unknown>>,
    detailGalleryIndex: 0,
    detailGalleryCountText: '',
    detail: null as any,
    detailQuantity: 1,
    detailQuantityText: '1',
    detailMinimumQuantity: 1,
    detailRemainingStock: 0,
    detailSubtotalText: money(0),
    detailCanAdd: false,
    detailLadderTiers: [] as Array<Record<string, unknown>>,
    detailNextTierText: '',
    detailRichImages: [] as Array<Record<string, unknown>>,
    categories: [] as Array<Record<string, unknown>>,
    homeCategories: [] as Array<Record<string, unknown>>,
    visibleProducts: [] as Array<Record<string, unknown>>,
    orderFilters: [] as Array<Record<string, unknown>>,
    filteredOrders: [] as Array<Record<string, unknown>>,
    storeMetrics: { hotOrders: [] as Array<Record<string, unknown>> },
    cartAllSelected: false,
    loginTab: 'password',
    loginRole: 'owner' as StoreRole,
    loginPhone: '13800000001',
    loginPassword: '123456',
    loginCode: '123456',
    loginPlaceholder: '请输入门店账号手机号',
    loginHint: '门店演示账号 13800000001 / 123456　验证码 123456',
    codeCountdown: 0,
    codeButtonText: '发送验证码',
    codeDisabled: false
  }
}

Page({
  data: initialData(),
  cartQuantityDrafts: {} as Record<string, string>,

  onLoad(query: any) {
    const next: Record<string, unknown> = {}
    if (query?.view === 'orders') {
      next.activeTab = 'mine'
      next.mineSection = 'orders'
    }
    if (query?.view === 'cart') next.activeTab = 'cart'
    if (Object.keys(next).length) this.setData(next)
    disposeStore = store.$subscribe(() => this.syncFromStore())
    this.syncFromStore()
  },

  onShow() {
    this.cartQuantityDrafts = {}
    void store.sweepExpiredPaymentOrders()
    this.syncFromStore()
  },

  async onReady() {
    disposeDictionary = dictCache.subscribe((state: any) => {
      dictionaryState = state
      this.syncFromStore()
    })
    const scenario = wx.getLaunchOptionsSync().query?.mock
    if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
    if (getApiClientConfig().dataMode === 'api' && store.auth.isLoggedIn) await store.refreshSharedState()
    else await store.initialize()
    if (store.auth.isLoggedIn) {
      store.cart = seedDemoStoreCart(store.cart, store.products, store.mockScenario)
      store.repriceCart()
      if (!store.checkoutLineKeys.length) store.toggleAllCheckoutSelection()
      store.saveCurrentTenantSession()
    }
    disposePlatformChanges = subscribePlatformChanges(() => {
      activePolicies = readStorePricePolicies()
      void store.refreshSharedState()
    }, platformChangeKeys)
    paymentSweepTimer = setInterval(() => { void store.sweepExpiredPaymentOrders() }, 30_000)
    this.syncFromStore()
  },

  onUnload() {
    disposeStore?.()
    disposeStore = null
    disposePlatformChanges?.()
    disposePlatformChanges = null
    disposeDictionary?.()
    disposeDictionary = null
    dictCache.dispose()
    if (paymentSweepTimer) clearInterval(paymentSweepTimer)
    if (codeTimer) clearInterval(codeTimer)
  },

  onShareAppMessage() {
    return { title: '门店订货商城', path: '/pages/index/index' }
  },

  onShareTimeline() {
    return { title: '门店订货商城' }
  },

  syncFromStore() {
    const cart = buildCartLines()
    const categories = buildCategories(this.data.category)
    const visibleProducts = buildVisibleProducts(this.data.category, this.data.keyword)
    const orderFilters = buildOrderFilters(this.data.orderFilter)
    const filteredOrders = (this.data.orderFilter === 'all' ? store.orders : store.orders.filter((order) => order.status === this.data.orderFilter)).map(orderView)
    const selected = this.data.selectedProduct ? store.products.find((item) => item.id === this.data.selectedProduct.id) || null : null
    const selectedSku = selected ? selected.skus.find((sku) => sku.id === this.data.selectedSkuId) || selected.skus[0] || null : null
    const detail = selected ? this.buildDetail(selected, selectedSku) : null
    const sheetTitle = this.data.sheet === 'product' ? '选择规格' : this.data.sheet === 'cart' ? '进货单' : this.data.sheet === 'address' ? '收货信息' : this.data.sheet === 'contact' ? '联系客服' : ''
    this.setData({
      isLoggedIn: store.auth.isLoggedIn,
      hasCartBar: !!store.cartCount && (this.data.activeTab === 'home' || this.data.activeTab === 'category'),
      store: {
        loading: store.loading,
        error: store.error,
        info: store.info,
        cartCount: store.cartCount,
        checkoutCount: store.checkoutCount,
        checkoutTotalText: money(store.checkoutTotal),
        checkoutHasUnavailable: store.checkoutHasUnavailable,
        orderMetrics: {
          monthAmountText: money(store.orderMetrics.monthAmount),
          orderCount: store.orderMetrics.orderCount,
          pendingReceipt: store.orderMetrics.pendingReceipt,
          savedAmountText: money(store.orderMetrics.savedAmount)
        },
        priceLevelLabel: store.priceLevelLabel,
        isStoreOwner: store.isStoreOwner,
        cart,
        orders: store.orders.map(orderView)
      },
      categories,
      homeCategories: categories.filter((item: any) => item.key !== '全部').slice(0, 10).map((item: any) => ({
        ...item,
        image: productCategoryImage(item.key, dictionaryState),
        fallback: defaultProductCategoryImage(item.key),
        errorFallback: defaultProductCategoryImage()
      })),
      visibleProducts,
      orderFilters,
      filteredOrders,
      storeMetrics: buildStoreMetrics(),
      cartAllSelected: cart.filter((item) => !item.unavailable).length > 0 && cart.filter((item) => !item.unavailable).every((item) => item.selected),
      selectedProduct: selected,
      selectedSkuId: selectedSku?.id || '',
      detail,
      detailGallery: detail?.gallery || [],
      detailGalleryCountText: detail && detail.gallery.length > 1 ? `${this.data.detailGalleryIndex + 1} / ${detail.gallery.length}` : '',
      detailQuantity: detail?.quantity || 1,
      detailQuantityText: detail?.quantityText || '1',
      detailMinimumQuantity: detail?.minimumQuantity || 1,
      detailRemainingStock: detail?.remainingStock || 0,
      detailSubtotalText: detail?.subtotalText || money(0),
      detailCanAdd: detail?.canAdd || false,
      detailLadderTiers: detail?.ladderTiers || [],
      detailNextTierText: detail?.nextTierText || '',
      detailRichImages: detail?.richImages || [],
      sheetTitle,
      loginPlaceholder: this.data.loginRole === 'owner' ? '请输入门店账号手机号' : '请输入业务员账号手机号',
      loginHint: this.data.loginRole === 'owner' ? '门店演示账号 13800000001 / 123456　验证码 123456' : '业务员演示账号 13800000002 / 123456　验证码 123456',
      codeButtonText: this.data.codeCountdown > 0 ? `${this.data.codeCountdown}s` : '发送验证码',
      codeDisabled: this.data.codeCountdown > 0
    })
  },

  buildDetail(product: Product, sku: Product['skus'][number] | null) {
    const minimumQuantity = Math.max(1, normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity))
    const cartQuantity = store.cart.find((line) => line.productId === product.id && line.skuId === sku?.id)?.quantity || 0
    const remainingStock = Math.max(0, (sku?.stock || 0) - cartQuantity)
    const pricingQuantity = cartQuantity + this.data.detailQuantity
    const pricing = sku ? tieredUnitPrice({ category: product.category, name: product.name, basePrice: sku.cost, quantity: pricingQuantity }, activePolicies) : null
    const unitPrice = pricing?.unitPrice ?? sku?.cost ?? product.cost ?? 0
    const retail = sku?.price ?? product.price ?? 0
    const gallery = uniqueMedia([sku?.image, product.image, ...(product.images || [])])
    const richImages = uniqueMedia(product.images || []).filter((image) => mediaValueToImage(image.src) !== mediaValueToImage(product.image))
    const ladderTiers = (activePolicies.find((policy) => policy.enabled && policy.type === 'ladder' && matchesPolicyScope(policy.scope, product.category, product.name))?.tiers || []).map((tier) => ({
      ...tier,
      key: tier.minQty,
      rangeText: tier.maxQty === null ? `${tier.minQty} 件以上` : `${tier.minQty}–${tier.maxQty} 件`,
      priceText: money(tier.price),
      active: pricing?.tier?.minQty === tier.minQty
    }))
    const nextTier = ladderTiers.find((tier) => tier.minQty > pricingQuantity)
    return {
      product: productView(product),
      sku: sku ? {
        ...sku,
        key: sku.id,
        active: sku.id === this.data.selectedSkuId,
        disabled: !canStartOrder(sku),
        levelPriceText: money(levelPrice(sku.cost)),
        minimumOrderText: String(Math.max(1, normalizeMinimumOrderQuantity(sku.minimumOrderQuantity))),
        stockText: String(sku.stock)
      } : null,
      skus: product.skus.map((item) => ({
        ...item,
        key: item.id,
        active: item.id === sku?.id,
        disabled: !canStartOrder(item),
        levelPriceText: money(levelPrice(item.cost)),
        minimumOrderText: String(Math.max(1, normalizeMinimumOrderQuantity(item.minimumOrderQuantity)))
      })),
      unitPriceText: money(unitPrice),
      strikePriceText: money(levelPrice(sku?.cost || product.cost)),
      showStrike: !!sku && unitPrice !== levelPrice(sku.cost),
      savePercent: retail > 0 ? Math.max(0, Math.round((1 - unitPrice / retail) * 100)) : 0,
      retailPriceText: money(retail),
      stock: sku?.stock || 0,
      minimumQuantity,
      remainingStock,
      quantity: this.data.detailQuantity,
      quantityText: this.data.detailQuantityText,
      subtotalText: money(Math.round(unitPrice * this.data.detailQuantity * 100) / 100),
      canAdd: !!sku && this.data.detailQuantity <= remainingStock && validateCatalogSkuOrderQuantity(sku, this.data.detailQuantity).ok,
      gallery,
      richImages,
      ladderTiers,
      nextTierText: nextTier ? `再购 ${nextTier.minQty - pricingQuantity} 件，可享 ${nextTier.priceText} / 件` : ''
    }
  },

  toast(title: string) {
    wx.showToast({ title, icon: 'none' })
  },

  retryLoad() {
    store.setMockScenario('normal')
    void store.initialize(true)
  },

  chooseTab(event: any) {
    this.setActiveTab(event.currentTarget.dataset.key)
  },

  setActiveTab(key: TabKey) {
    this.setData({ activeTab: key, sheet: null, mineSection: key === 'mine' ? 'main' : this.data.mineSection })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    this.syncFromStore()
  },

  goShop() {
    this.setActiveTab('home')
  },

  goOrders() {
    this.setData({ activeTab: 'mine', mineSection: 'orders', orderFilter: 'all' })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    this.syncFromStore()
  },

  onSearchInput(event: any) {
    this.setData({ keyword: String(event.detail.value || '') })
    this.syncFromStore()
  },

  selectCategory(event: any) {
    this.setData({ category: String(event.currentTarget.dataset.key || '全部') })
    this.syncFromStore()
  },

  selectOrderFilter(event: any) {
    this.setData({ orderFilter: String(event.currentTarget.dataset.key || 'all') })
    this.syncFromStore()
  },

  openSheet(event: any) {
    this.setData({ sheet: event.currentTarget.dataset.sheet as SheetKey })
    this.syncFromStore()
  },

  closeSheet() {
    this.setData({ sheet: null })
    this.syncFromStore()
  },

  noop() {},

  setMineSection(event: any) {
    this.setData({ mineSection: String(event.currentTarget.dataset.next || 'main') })
    this.syncFromStore()
  },

  openProduct(event: any) {
    const product = store.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product) return
    const sku = product.skus.find((item) => canStartOrder(item)) || product.skus[0]
    this.setData({ selectedProduct: product, selectedSkuId: sku?.id || '', productView: true, sheet: null, detailGalleryIndex: 0, detailQuantity: Math.max(1, normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)), detailQuantityText: String(Math.max(1, normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity))) })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    this.syncFromStore()
  },

  openSkuSheet(event: any) {
    const product = store.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product) return
    const sku = product.skus.find((item) => canStartOrder(item)) || product.skus[0]
    this.setData({ selectedProduct: product, selectedSkuId: sku?.id || '', sheet: 'product', detailQuantity: Math.max(1, normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)), detailQuantityText: String(Math.max(1, normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity))) })
    this.syncFromStore()
  },

  closeProductView() {
    this.setData({ productView: false })
  },

  goProductHome() {
    this.setData({ productView: false })
    this.setActiveTab('home')
  },

  goProductCart() {
    this.setData({ productView: false })
    this.setActiveTab('cart')
  },

  onDetailGalleryChange(event: any) {
    this.setData({ detailGalleryIndex: Number(event.detail.current) || 0 })
    this.syncFromStore()
  },

  selectDetailSku(event: any) {
    const skuId = String(event.currentTarget.dataset.skuId || '')
    const product = this.data.selectedProduct
    const sku = product?.skus.find((item: any) => item.id === skuId)
    if (!sku || !canStartOrder(sku)) return
    const minimum = Math.max(1, normalizeMinimumOrderQuantity(sku.minimumOrderQuantity))
    this.setData({ selectedSkuId: skuId, detailQuantity: minimum, detailQuantityText: String(minimum), detailGalleryIndex: 0 })
    this.syncFromStore()
  },

  changeDetailQuantity(event: any) {
    const delta = Number(event.currentTarget.dataset.delta)
    const next = this.data.detailQuantity + delta
    if (next < this.data.detailMinimumQuantity || next > this.data.detailRemainingStock) return
    this.setData({ detailQuantity: next, detailQuantityText: String(next) })
    this.syncFromStore()
  },

  onDetailQuantityInput(event: any) {
    this.setData({ detailQuantityText: String(event.detail.value || '').replace(/\D/g, '') })
  },

  commitDetailQuantity() {
    const raw = this.data.detailQuantityText
    if (!raw || !/^\d+$/.test(raw)) {
      this.setData({ detailQuantityText: String(this.data.detailQuantity) })
      return this.toast('请输入有效的采购数量')
    }
    const parsed = Number(raw)
    const minimum = this.data.detailMinimumQuantity
    const maximum = this.data.detailRemainingStock
    if (maximum < minimum) {
      this.setData({ detailQuantityText: String(this.data.detailQuantity) })
      return this.toast('当前库存不足')
    }
    const normalized = Math.min(maximum, Math.max(minimum, parsed))
    if (normalized !== parsed) this.toast(parsed < minimum ? `数量不能低于起订量 ${minimum} 件` : `数量不能超过可采库存 ${maximum} 件`)
    this.setData({ detailQuantity: normalized, detailQuantityText: String(normalized) })
    this.syncFromStore()
  },

  addProduct(event: any) {
    const product = store.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product) return
    const result = store.addToCart(product)
    if (result === 'sku-required') return this.openSkuSheet(event)
    if (result === 'out-of-stock') return this.toast(store.checkoutError || '该规格库存不足')
    this.toast('已加入进货单')
    this.syncFromStore()
  },

  addDetailProduct() {
    const product = this.data.selectedProduct
    const skuId = this.data.selectedSkuId
    if (!product || !skuId) return
    const result = store.addToCart(product, skuId, this.data.detailQuantity)
    if (result === 'sku-required') return this.toast('请先选择商品规格')
    if (result === 'out-of-stock') return this.toast(store.checkoutError || '库存不足或购买数量未达要求')
    this.toast(`已加入 ${this.data.detailQuantity} 件`)
    this.syncFromStore()
  },

  addSelected() {
    if (!this.data.selectedProduct) return
    const result = store.addToCart(this.data.selectedProduct, this.data.selectedSkuId, this.data.detailQuantity)
    if (result === 'sku-required') return this.toast('请先选择商品规格')
    if (result === 'out-of-stock') return this.toast(store.checkoutError || '该规格库存不足')
    this.setData({ sheet: null })
    this.toast('已加入进货单')
    this.syncFromStore()
  },

  openCart() {
    this.setData({ sheet: 'cart' })
    this.syncFromStore()
  },

  toggleCartAll() {
    store.toggleAllCheckoutSelection()
    this.syncFromStore()
  },

  toggleCartSelection(event: any) {
    const line = store.cart.find((item) => item.productId === event.currentTarget.dataset.productId && item.skuId === event.currentTarget.dataset.skuId)
    if (line) store.toggleCheckoutSelection(line)
    this.syncFromStore()
  },

  changeCartQuantity(event: any) {
    const { productId, skuId, delta } = event.currentTarget.dataset
    delete this.cartQuantityDrafts[`${productId}:${skuId}`]
    store.changeCart(productId, skuId, Number(delta))
    this.syncFromStore()
  },

  onCartQuantityInput(event: any) {
    const { productId, skuId } = event.currentTarget.dataset
    const key = `${productId}:${skuId}`
    this.cartQuantityDrafts[key] = String(event.detail.value || '').replace(/\D/g, '')
    this.updateCartInput(productId, skuId, this.cartQuantityDrafts[key])
  },

  commitCartQuantity(event: any) {
    const { productId, skuId } = event.currentTarget.dataset
    const key = `${productId}:${skuId}`
    const raw = this.cartQuantityDrafts[key]
    if (raw === undefined) return
    const line = store.cart.find((item) => item.productId === productId && item.skuId === skuId)
    if (!line || !raw || !/^\d+$/.test(raw)) {
      delete this.cartQuantityDrafts[key]
      this.toast('请输入有效的商品数量')
      this.syncFromStore()
      return
    }
    const parsed = Number(raw)
    const minimum = Math.max(1, normalizeMinimumOrderQuantity(line.minimumOrderQuantity))
    const maximum = Math.max(0, line.stock)
    if (maximum < minimum) {
      delete this.cartQuantityDrafts[key]
      this.toast('该商品库存不足')
      this.syncFromStore()
      return
    }
    const normalized = Math.min(maximum, Math.max(minimum, parsed))
    if (normalized !== parsed) this.toast(parsed < minimum ? `数量不能低于起订量 ${minimum} 件` : `数量不能超过库存 ${maximum} 件`)
    if (store.setCartQuantity(line.productId, line.skuId, normalized)) delete this.cartQuantityDrafts[key]
    this.syncFromStore()
  },

  updateCartInput(productId: string, skuId: string, value: string) {
    const cart = this.data.store.cart.map((item: any) => item.productId === productId && item.skuId === skuId ? { ...item, quantityText: value } : item)
    this.setData({ 'store.cart': cart })
  },

  removeSelectedCart() {
    if (!store.checkoutLineKeys.length) return this.toast('请先选择要删除的商品')
    const keys = [...store.checkoutLineKeys]
    keys.forEach((key) => {
      const [productId, skuId] = key.split(':')
      store.removeLine(productId, skuId)
    })
    this.cartQuantityDrafts = {}
    this.toast('已删除选中商品')
    this.syncFromStore()
  },

  goCheckout() {
    if (!store.checkoutCount) return this.toast('请先选择要结算的商品')
    if (store.checkoutHasUnavailable) return this.toast('选中商品存在库存不足或起订量限制')
    this.setData({ sheet: null })
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  openOrder(event: any) {
    wx.navigateTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
  },

  makePhoneCall() {
    wx.makePhoneCall({ phoneNumber: store.info.phone, fail: () => this.toast('当前环境不支持拨号，请复制联系电话') })
  },

  copyAddress() {
    wx.setClipboardData({ data: `${store.info.name} ${store.info.contact} ${store.info.phone} ${store.info.address}`, success: () => this.toast('收货信息已复制') })
  },

  copyPhone() {
    wx.setClipboardData({ data: store.info.phone, success: () => this.toast('客服电话已复制') })
  },

  switchLoginRole(event: any) {
    const role = event.currentTarget.dataset.role as StoreRole
    if (this.data.loginRole === role) return
    this.setData({ loginRole: role, loginPhone: role === 'owner' ? '13800000001' : '13800000002', loginPassword: '123456', loginCode: '123456' })
    this.syncFromStore()
  },

  switchLoginTab(event: any) {
    this.setData({ loginTab: event.currentTarget.dataset.tab })
    this.syncFromStore()
  },

  onLoginInput(event: any) {
    this.setData({ [event.currentTarget.dataset.field]: String(event.detail.value || '') })
  },

  sendCode() {
    if (getApiClientConfig().dataMode === 'api') return this.toast('当前环境暂不支持验证码登录，请使用密码登录')
    if (!validatePhone(this.data.loginPhone)) return this.toast('请输入正确的手机号')
    if (this.data.codeCountdown > 0) return
    this.setData({ codeCountdown: 60, codeButtonText: '60s', codeDisabled: true })
    codeTimer = setInterval(() => {
      const countdown = this.data.codeCountdown - 1
      this.setData({ codeCountdown: countdown, codeButtonText: countdown > 0 ? `${countdown}s` : '发送验证码', codeDisabled: countdown > 0 })
      if (countdown <= 0 && codeTimer) clearInterval(codeTimer)
    }, 1000)
    this.toast('验证码已发送（演示码 123456）')
  },

  async submitLogin() {
    const ok = this.data.loginTab === 'password'
      ? await store.loginWithPassword(this.data.loginPhone, this.data.loginPassword, this.data.loginRole)
      : store.loginWithCode(this.data.loginPhone, this.data.loginCode, this.data.loginRole)
    if (!ok) {
      if (getApiClientConfig().dataMode === 'api') return this.toast(store.error || '登录失败')
      const role = store.storeAccountRole(this.data.loginPhone)
      if (role && role !== this.data.loginRole) return this.toast(role === 'owner' ? '该手机号是门店账号，请切换为门店账号登录' : '该手机号是业务员账号，请切换为业务员账号登录')
      return this.toast(this.data.loginTab === 'password' ? '手机号或密码错误（演示 13800000001 / 123456）' : '手机号或验证码错误（演示验证码 123456）')
    }
    if (getApiClientConfig().dataMode !== 'api') store.cart = seedDemoStoreCart(store.cart, store.products, store.mockScenario)
    store.repriceCart()
    if (!store.checkoutLineKeys.length) store.toggleAllCheckoutSelection()
    store.saveCurrentTenantSession()
    this.toast('登录成功')
    this.syncFromStore()
  },

  async logout() {
    await store.logout()
    this.toast('已退出登录')
    this.syncFromStore()
  }
})
