// 用户端商城首页：首页 / 分类 / 购物车 / 我的 + 规格、结算、地址、物流、售后、到店套餐弹层。
// 计算、可选链、toFixed、reduce 与条件拼接全部在页面 TS 完成，WXML 只读预计算字段与简单布尔条件。
import type { BusinessMediaValue, CAddress, COrder, CProduct, CProductSku, CSubOrder, CUserLevel, MediaReference, PaymentAttempt, Product } from '@agritainment/shared'
import {
  createPlatformDictionaryCache,
  defaultProductCategoryImage,
  displayProductTags,
  normalizeMinimumOrderQuantity,
  productCategoryImage,
  readCDistributorProfiles,
  readCOrders,
  readPlatformDictionaries,
  readUserBindings,
  resolveProductChannels,
  validateCatalogSkuOrderQuantity
} from '@agritainment/shared'
import { isDemoOrderId } from '../../data/demo-orders'
import { projectDistributorOperations } from '../../services/distributor-operations'
import { shouldRefreshUserIdentity } from '../../services/user-identity'
import { useUserStore } from '../../stores/user'

type CartDeliveryMode = 'pickup' | 'courier'
type SheetName = 'detail' | 'cart' | 'checkout' | 'address' | 'logistics' | 'after-sale' | 'package' | null

const AFTER_SALE_REASONS = ['运输破损', '质量问题', '少发漏发', '七天无理由', '其他']
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: '待支付', paid: '备货中', shipped: '已发货', received: '已收货', cancelled: '已取消',
  after_sale: '售后处理中', partially_shipped: '部分发货', partially_received: '部分收货', partially_after_sale: '部分售后'
}
const WITHDRAWAL_STATUS_LABEL: Record<string, string> = { pending: '处理中', approved: '已通过', rejected: '已驳回' }
const LEVEL_LABELS: Record<CUserLevel, string> = { normal: '普通用户', level1: '一级团长', level2: '二级团长' }
const SHEET_TITLES: Record<string, string> = {
  detail: '选择规格', cart: '购物车结算', checkout: '确认订单', address: '收货地址', logistics: '物流详情', 'after-sale': '申请售后', package: '到店套餐'
}

const store = useUserStore()
const dictCache = createPlatformDictionaryCache()

const launchQuery: Record<string, string> = {}
let dictionaryState = readPlatformDictionaries()
let selectedProduct: CProduct | null = null
let selectedSubOrder: CSubOrder | null = null
let afterSaleTarget: { order: COrder; sub: CSubOrder } | null = null
let currentShareProductId = ''

const cartLineKey = (line: { productId: string; skuId: string }) => `${line.productId}-${line.skuId}`

function moneyText(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2)
}

function formatDate(value: string): string {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

function minimumOrderQuantity(sku: Pick<CProductSku, 'minimumOrderQuantity'> | null | undefined): number {
  return normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
}

function canStartOrder(sku: Pick<CProductSku, 'stock' | 'minimumOrderQuantity'> | null | undefined): boolean {
  return !!sku && validateCatalogSkuOrderQuantity(sku, minimumOrderQuantity(sku)).ok
}

function canStartProductOrder(product: CProduct): boolean {
  return product.skus.some((sku) => canStartOrder(sku))
}

function cartLineDeliveryMode(line: { productId: string }): CartDeliveryMode {
  const product = (store.cProducts as CProduct[]).find((item) => item.id === line.productId)
  return product && (product.shippingType === 'courier' || product.expressDelivery) ? 'courier' : 'pickup'
}

function toast(title: string): void {
  wx.showToast({ title, icon: 'none' })
}

function productSharePath(product: CProduct): string {
  if (!store.currentDistributor) return '/pages/index/index'
  return `/pages/index/index?promoter=${store.currentDistributor.promoterId}&product=${product.id}`
}

function shareProductOf(): CProduct | null {
  const products = store.cProducts as CProduct[]
  return products.find((item) => item.id === currentShareProductId) || selectedProduct || products[0] || null
}

Page({
  data: {
    loading: true,
    identityFailed: false,
    identityError: '',
    activeTab: 'home',
    meSection: 'main',
    searchText: '',
    activeCategory: '全部',
    sheet: null as SheetName,
    productView: false,
    selectedQty: 1,
    afterSaleReason: AFTER_SALE_REASONS[0],
    addressEditing: false,
    cartDeliveryMode: 'courier' as CartDeliveryMode,
    addressDraft: { receiver: '', phone: '', region: '', detail: '', isDefault: true },
    afterSaleEvidence: [] as BusinessMediaValue[],
    appShellClass: 'app-shell',
    roleLabel: LEVEL_LABELS.normal,
    userInitial: '普',
    userAvatarUrl: '',
    userIdText: '演示用户',
    categories: [] as any[],
    visibleProducts: [] as any[],
    visibleCount: 0,
    hasVisibleProducts: false,
    packageGroups: [] as any[],
    packageCount: 0,
    hasPackages: false,
    cartCount: 0,
    cartTotalText: '0.00',
    hasCart: false,
    hasCartBar: false,
    cartPageClass: 'page-content cart-page',
    cartCategoryItems: [] as any[],
    hasCartCategoryItems: false,
    cartCategoryEmptyText: '暂无快递直发商品',
    cartCategoryEmptyHint: '支持快递的商品会显示在这里',
    cartCategoryEmptyIcon: 'truck',
    cartCategoryCountPickup: 0,
    cartCategoryCountCourier: 0,
    cartCategoryAllSelected: false,
    cartCategoryHasUnavailable: false,
    hasSelectedCartItems: false,
    selectedCartCount: 0,
    selectedCartTotalText: '0.00',
    checkoutItems: [] as any[],
    checkoutTotalText: '0.00',
    hasDefaultAddress: false,
    defaultAddress: null as any,
    addresses: [] as any[],
    hasAddresses: false,
    orders: [] as any[],
    hasOrders: false,
    vouchers: [] as any[],
    hasVouchers: false,
    commissionRecords: [] as any[],
    hasCommissionRecords: false,
    withdrawalRequests: [] as any[],
    hasWithdrawalRequests: false,
    hasDistributor: false,
    pendingCommissionText: '0.00',
    availableCommissionText: '0.00',
    personalPerformanceText: '0.00',
    teamPerformanceText: '0.00',
    directFanCount: 0,
    teamOrderCount: 0,
    referralTitle: '推荐关系',
    referralText: '暂无有效推荐关系',
    selectedProduct: null as any,
    selectedSku: null as any,
    skuOptions: [] as any[],
    selectedSkuId: '',
    selectedSubtotalText: '0.00',
    minOrderText: '1',
    afterSaleTarget: null as any,
    afterSaleReasons: AFTER_SALE_REASONS.map((reason) => ({ reason, active: reason === AFTER_SALE_REASONS[0] })),
    selectedSubOrder: null as any,
    sheetTitle: '选择规格',
    showDetailSheet: false,
    showCartSheet: false,
    showCheckoutSheet: false,
    showAddressSheet: false,
    showLogisticsSheet: false,
    showAfterSaleSheet: false,
    showPackageSheet: false
  },

  addressReturnToCheckout: false,
  selectedCartLineKeys: [] as string[],
  checkoutLineRefs: [] as Array<{ productId: string; skuId: string; quantity?: number }>,
  unsubscribeStore: null as null | (() => void),
  disposeDictionaryImages: null as null | (() => void),
  // ------------------------------------------------------------------ 视图模型
  render(this: any) {
    const selectedKeySet = new Set<string>(this.selectedCartLineKeys || [])
    const cart: any[] = store.cart || []
    const cartDeliveryMode: CartDeliveryMode = this.data.cartDeliveryMode
    const cartCategoryItems = cart.filter((line) => cartLineDeliveryMode(line) === cartDeliveryMode)
    const selectedCartItems = cartCategoryItems.filter((line) => selectedKeySet.has(cartLineKey(line)))
    const categoryAllSelected = !!cartCategoryItems.length && cartCategoryItems.every((line) => selectedKeySet.has(cartLineKey(line)))
    const categoryHasUnavailable = selectedCartItems.some((line) => line.unavailable)
    const roleLabel = LEVEL_LABELS[store.level as CUserLevel] || LEVEL_LABELS.normal
    const orders = store.orders as COrder[]
    const commissionRecords = (store.myCommissionRecords || []) as any[]
    const withdrawalRequests = (store.withdrawalRequests || []) as any[]
    const projection = projectDistributorOperations({
      promoterId: store.currentDistributor?.promoterId || '',
      orders: Object.values(readCOrders() || {}),
      bindings: readUserBindings() || {},
      profiles: readCDistributorProfiles() || {}
    })
    const keyword = String(this.data.searchText || '').trim().toLowerCase()
    const visibleProducts = (store.cProducts as CProduct[]).filter((product) => {
      const matchesCategory = this.data.activeCategory === '全部' || product.category === this.data.activeCategory
      const haystack = `${product.name}${product.supplierName}${(product.tags || []).join('')}`.toLowerCase()
      return matchesCategory && product.status === 'active' && product.shippingType === 'courier' && product.productType !== 'package'
        && product.expressDelivery === true && resolveProductChannels(product).live && (!keyword || haystack.includes(keyword))
    })
    const checkoutItems = (this.checkoutLineRefs || []).map((ref: any) => {
      const line = cart.find((candidate) => candidate.productId === ref.productId && candidate.skuId === ref.skuId)
      return line ? { ...line, quantity: ref.quantity ?? line.quantity } : null
    }).filter(Boolean)

    const packageGroupsMap = new Map<string, { farmId: string; farmName: string; packages: Product[] }>()
    ;(store.products as Product[]).forEach((product) => {
      if (product.productType !== 'package') return
      const farmId = product.farmIds[0] || 'F001'
      const farmName = (store.farms as any[]).find((farm) => farm.id === farmId)?.name || '平台门店'
      const group = packageGroupsMap.get(farmId) || { farmId, farmName, packages: [] as Product[] }
      group.packages.push(product)
      packageGroupsMap.set(farmId, group)
    })
    const packageGroups = [...packageGroupsMap.values()]
      .filter((group) => group.packages.some((item) => item.skus.some((sku) => canStartOrder(sku))))
      .map((group) => ({
        farmId: group.farmId,
        farmName: group.farmName,
        packages: group.packages.map((item) => ({
          id: item.id,
          name: item.name,
          sellableText: `${item.skus.filter((sku) => canStartOrder(sku)).length} 个可售规格 · 到店自提`,
          disabled: !item.skus.some((sku) => canStartOrder(sku)),
          priceText: moneyText(Number(item.price) || 0)
        }))
      }))

    const profile = store.identityProfile
    const displayName = profile?.nickname || store.userId || '演示用户'
    this.setData({
      identityFailed: store.identityStatus === 'error',
      identityError: store.identityError || '身份识别失败，请重试',
      roleLabel,
      userInitial: displayName.slice(0, 1),
      userAvatarUrl: profile?.avatarUrl || '',
      userIdText: displayName,
      appShellClass: cart.length && this.data.activeTab !== 'cart' ? 'app-shell has-cart-bar' : 'app-shell',
      categories: ['全部', ...Array.from(new Set((store.cProducts as CProduct[]).map((item) => item.category)))].map((name) => ({
        name,
        active: this.data.activeCategory === name,
        image: productCategoryImage(name, dictionaryState),
        fallback: defaultProductCategoryImage(name),
        errorFallback: defaultProductCategoryImage()
      })),
      visibleProducts: visibleProducts.map((product) => {
        const firstSku = product.skus[0]
        const price = firstSku ? store.priceForSku(firstSku) : 0
        const basePrice = Number(firstSku?.basePrice ?? 0)
        return {
          id: product.id,
          name: product.name,
          image: product.image,
          stockText: `库存 ${product.skus.reduce((sum, item) => sum + (Number(item.stock) || 0), 0)}`,
          priceText: moneyText(price),
          originalPriceText: moneyText(basePrice),
          showOriginal: basePrice > price,
          disabled: !canStartProductOrder(product)
        }
      }),
      visibleCount: visibleProducts.length,
      hasVisibleProducts: visibleProducts.length > 0,
      packageGroups,
      packageCount: packageGroups.reduce((sum, group) => sum + group.packages.length, 0),
      hasPackages: packageGroups.length > 0,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotalText: moneyText(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)),
      hasCart: cart.length > 0,
      checkoutError: store.checkoutError || '',
      cartHasUnavailable: !!store.cartHasUnavailable,
      hasCartBar: !!cart.length && this.data.activeTab !== 'cart',
      cartPageClass: cart.length ? 'page-content cart-page cart-page--has-checkout' : 'page-content cart-page',
      cartCategoryItems: cartCategoryItems.map((line) => ({
        key: cartLineKey(line),
        productId: line.productId,
        skuId: line.skuId,
        name: line.name,
        skuName: line.skuName,
        image: line.image,
        stockText: `剩余库存 ${line.stock}`,
        unavailable: !!line.unavailable,
        priceText: moneyText(line.unitPrice),
        quantity: line.quantity,
        selected: selectedKeySet.has(cartLineKey(line)),
        deliveryMode: cartLineDeliveryMode(line),
        deliveryLabel: cartLineDeliveryMode(line) === 'courier' ? '快递直发' : '到店自提'
      })),
      hasCartCategoryItems: cartCategoryItems.length > 0,
      cartCategoryEmptyText: cartDeliveryMode === 'courier' ? '暂无快递直发商品' : '暂无到店自提商品',
      cartCategoryEmptyHint: cartDeliveryMode === 'courier' ? '支持快递的商品会显示在这里' : '普通商品请到农家乐自提',
      cartCategoryEmptyIcon: cartDeliveryMode === 'courier' ? 'truck' : 'store',
      cartCategoryCountPickup: cart.filter((line) => cartLineDeliveryMode(line) === 'pickup').reduce((sum, line) => sum + line.quantity, 0),
      cartCategoryCountCourier: cart.filter((line) => cartLineDeliveryMode(line) === 'courier').reduce((sum, line) => sum + line.quantity, 0),
      cartCategoryAllSelected: categoryAllSelected,
      cartCategoryHasUnavailable: categoryHasUnavailable,
      hasSelectedCartItems: selectedCartItems.length > 0,
      selectedCartCount: selectedCartItems.reduce((sum, line) => sum + line.quantity, 0),
      selectedCartTotalText: moneyText(selectedCartItems.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)),
      checkoutItems: checkoutItems.map((line: any) => ({
        key: cartLineKey(line),
        name: line.name,
        skuName: line.skuName,
        image: line.image,
        quantity: line.quantity,
        amountText: moneyText(line.unitPrice * line.quantity)
      })),
      checkoutTotalText: moneyText(checkoutItems.reduce((sum: number, line: any) => sum + line.unitPrice * line.quantity, 0)),
      hasDefaultAddress: !!store.defaultAddress,
      defaultAddress: store.defaultAddress ? {
        receiver: store.defaultAddress.receiver,
        phone: store.defaultAddress.phone,
        regionText: `${store.defaultAddress.region} ${store.defaultAddress.detail}`
      } : null,
      addresses: (store.addresses as CAddress[]).map((address) => ({
        id: address.id,
        receiver: address.receiver,
        phone: address.phone,
        regionText: `${address.region} ${address.detail}`,
        isDefault: !!address.isDefault
      })),
      hasAddresses: (store.addresses as CAddress[]).length > 0,
      orders: orders.map((order) => ({
        id: order.id,
        isDemo: isDemoOrderId(order.id),
        createdAtText: formatDate(order.createdAt),
        statusLabel: ORDER_STATUS_LABEL[order.status] || order.status,
        isDone: order.status === 'received',
        totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        amountText: moneyText(order.amount),
        subOrders: order.subOrders.map((sub) => ({
          id: sub.id,
          supplierName: sub.supplierName,
          statusLabel: ORDER_STATUS_LABEL[sub.status] || sub.status,
          items: sub.items.map((item) => ({
            key: item.skuId,
            name: item.name,
            skuName: item.skuName,
            image: item.image,
            quantity: item.quantity,
            amountText: moneyText(item.unitPrice * item.quantity)
          })),
          hasTracking: !!sub.trackingNo,
          courier: sub.courier,
          trackingNo: sub.trackingNo,
          showWaitingCopy: sub.status === 'paid',
          waitingCopy: isDemoOrderId(order.id) ? '演示订单不参与真实履约' : '等待供应商发货',
          canReceive: !isDemoOrderId(order.id) && sub.status === 'shipped',
          showAfterSaleProcessing: sub.status === 'after_sale',
          canRequestAfterSale: !isDemoOrderId(order.id) && ['paid', 'shipped', 'received'].includes(sub.status),
          canViewLogistics: sub.status !== 'cancelled'
        })),
        confirmationPending: !isDemoOrderId(order.id) && order.status === 'pending_payment' && this.paymentConfirmationPending(order),
        showActions: !isDemoOrderId(order.id),
        canPay: order.status === 'pending_payment' && !this.paymentConfirmationPending(order),
        canCancel: order.status === 'pending_payment' && !this.paymentConfirmationPending(order),
        canQueryPayment: order.status === 'pending_payment' && this.paymentConfirmationQueryable(order)
      })),
      hasOrders: orders.length > 0,
      vouchers: ((store.vouchers || []) as any[]).map((voucher) => ({
        id: voucher.id,
        quantity: voucher.quantity,
        amountText: moneyText(voucher.amount),
        statusLabel: voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款'
      })),
      hasVouchers: ((store.vouchers || []) as any[]).length > 0,
      commissionRecords: commissionRecords.map((record) => ({
        id: record.id,
        levelLabel: record.beneficiaryLevel === 'level1' ? '一级团长分佣' : '二级团长分佣',
        metaText: `${formatDate(record.createdAt)} · ${record.status === 'available' ? '可用' : record.status === 'pending' ? '待结算' : record.status === 'withdrawn' ? '已提现' : '已冲正'}`,
        amountText: `${record.amount < 0 ? '' : '+'}¥${moneyText(record.amount)}`,
        reversed: record.status === 'reversed'
      })),
      hasCommissionRecords: commissionRecords.length > 0,
      withdrawalRequests: withdrawalRequests.map((request) => ({
        id: request.id,
        title: `${request.method} · ${WITHDRAWAL_STATUS_LABEL[request.status] || request.status}`,
        createdAtText: formatDate(request.createdAt),
        reviewedNote: request.reviewedNote || '',
        hasReviewedNote: !!request.reviewedNote,
        amountText: moneyText(request.amount)
      })),
      hasWithdrawalRequests: withdrawalRequests.length > 0,
      hasDistributor: !!store.currentDistributor,
      pendingCommissionText: moneyText(store.pendingCommission),
      availableCommissionText: moneyText(store.availableCommission),
      personalPerformanceText: moneyText(projection.personalPerformance),
      teamPerformanceText: moneyText(projection.teamPerformance),
      directFanCount: projection.directFans.length,
      teamOrderCount: projection.teamOrders.length,
      referralTitle: store.level === 'normal' ? '推荐关系' : '我的上级',
      referralText: store.level === 'normal'
        ? (store.referralPromoterId ? `已绑定推荐人 ${store.referralPromoterId}` : '暂无有效推荐关系')
        : (store.currentDistributor?.parentPromoterId ? `一级团长 ${store.currentDistributor.parentPromoterId}` : '平台直营团长'),
      ...this.skuViewModel(this.currentSku()),
      addressDraft: { ...this.data.addressDraft },
      afterSaleReasons: AFTER_SALE_REASONS.map((reason) => ({ reason, active: this.data.afterSaleReason === reason })),
      afterSaleTarget: afterSaleTarget ? {
        supplierName: afterSaleTarget.sub.supplierName,
        itemName: afterSaleTarget.sub.items[0]?.name || afterSaleTarget.sub.supplierName
      } : null,
      selectedSubOrder: selectedSubOrder ? {
        image: selectedSubOrder.items[0]?.image,
        title: selectedSubOrder.items[0]?.name || selectedSubOrder.supplierName,
        quantity: selectedSubOrder.items[0]?.quantity || 1,
        courierText: selectedSubOrder.courier || '快递配送',
        statusLabel: ORDER_STATUS_LABEL[selectedSubOrder.status] || selectedSubOrder.status,
        trackingNoText: selectedSubOrder.trackingNo || '暂无运单号',
        hasLogistics: selectedSubOrder.logistics.length > 0,
        logistics: selectedSubOrder.logistics.map((event, index) => ({
          key: `${event.time}${event.title}`,
          title: event.title,
          metaText: `${formatDate(event.time)} · ${event.detail}`,
          on: index === 0
        }))
      } : null,
      sheetTitle: this.data.sheet ? SHEET_TITLES[this.data.sheet] || '' : '',
      ...this.sheetFlags(this.data.sheet)
    })
  },

  currentSku(this: any): CProductSku | null {
    if (!selectedProduct) return null
    return selectedProduct.skus.find((sku) => sku.id === this.data.selectedSkuId) || selectedProduct.skus[0] || null
  },

  skuViewModel(this: any, sku: CProductSku | null) {
    const product = selectedProduct
    const quantity = Number(this.data.selectedQty) || 1
    return {
      selectedProduct: product ? {
        id: product.id,
        name: product.name,
        supplierName: product.supplierName,
        image: product.image,
        priceText: moneyText(sku ? store.priceForSku(sku) : 0),
        tags: displayProductTags(product, 'store').filter((tag) => tag !== '门店商品'),
        canOrder: canStartProductOrder(product)
      } : null,
      selectedSku: sku ? {
        id: sku.id,
        name: sku.name,
        stock: sku.stock,
        priceText: moneyText(store.priceForSku(sku)),
        canOrder: canStartOrder(sku)
      } : null,
      selectedSkuCanOrder: canStartOrder(sku),
      skuOptions: product ? product.skus.map((item) => ({
        id: item.id,
        name: item.name,
        priceText: moneyText(store.priceForSku(item)),
        stock: item.stock,
        active: item.id === (sku?.id || '')
      })) : [],
      minOrderText: String(sku ? normalizeMinimumOrderQuantity(sku.minimumOrderQuantity) : 1),
      selectedSubtotalText: moneyText((sku ? store.priceForSku(sku) : 0) * quantity)
    }
  },

  sheetFlags(this: any, sheet: SheetName) {
    return {
      showDetailSheet: sheet === 'detail' && !!selectedProduct && !!this.currentSku(),
      showCartSheet: sheet === 'cart',
      showCheckoutSheet: sheet === 'checkout',
      showAddressSheet: sheet === 'address',
      showLogisticsSheet: sheet === 'logistics' && !!selectedSubOrder,
      showAfterSaleSheet: sheet === 'after-sale' && !!afterSaleTarget,
      showPackageSheet: sheet === 'package'
    }
  },

  paymentAttempt(this: any, order: COrder): PaymentAttempt | null {
    return store.paymentAttemptForOrder(order.id)
  },

  paymentConfirmationPending(this: any, order: COrder): boolean {
    return ['created', 'unknown', 'confirmed'].includes(this.paymentAttempt(order)?.status || '')
  },

  paymentConfirmationQueryable(this: any, order: COrder): boolean {
    return ['unknown', 'confirmed'].includes(this.paymentAttempt(order)?.status || '')
  },

  syncSelectedCartLines(this: any) {
    const cart: any[] = store.cart || []
    const currentKeys = new Set(cart.map((line) => cartLineKey(line)))
    const next = new Set<string>(this.selectedCartLineKeys || [])
    cart.forEach((line) => next.add(cartLineKey(line)))
    Array.from(next).forEach((key) => { if (!currentKeys.has(key)) next.delete(key) })
    this.selectedCartLineKeys = Array.from(next)
    if (!cart.some((line) => cartLineDeliveryMode(line) === this.data.cartDeliveryMode)) {
      this.setData({ cartDeliveryMode: cart.some((line) => cartLineDeliveryMode(line) === 'courier') ? 'courier' : 'pickup' })
    }
  },

  // ------------------------------------------------------------------ 生命周期
  onLoad(this: any, query: Record<string, string>) {
    Object.assign(launchQuery, query || {})
    try {
      Object.assign(launchQuery, wx.getLaunchOptionsSync()?.query || {})
    } catch {
      // 取不到启动参数时按无参数处理。
    }
    this.unsubscribeStore = store.$subscribe(() => this.render())
    this.disposeDictionaryImages = dictCache.subscribe((state: typeof dictionaryState) => {
      dictionaryState = state
      this.render()
    })
    this.setData(this.sheetFlags(this.data.sheet))
    void this.bootstrap()
  },

  async bootstrap(this: any) {
    this.setData({ loading: true }, () => this.render())
    const profile = await store.authenticate()
    if (!profile) {
      this.setData({ loading: false }, () => this.render())
      return
    }
    store.applyLaunch(launchQuery)
    store.seedDemoData()
    await store.initialize(true)
    await store.refreshCommissionSummary()
    this.syncSelectedCartLines()
    const launchProduct = (store.cProducts as CProduct[]).find((product) => product.id === store.launchProductId)
    if (launchProduct) this.openProductById(launchProduct.id)
    this.setData({ loading: false }, () => this.render())
  },

  retryIdentity(this: any) {
    void this.bootstrap()
  },

  onShow(this: any) {
    if (this.data.loading || !store.identityProfile) return
    void (async () => {
      if (shouldRefreshUserIdentity(store.identityCheckedAt)) {
        const profile = await store.authenticate(true)
        if (!profile) {
          this.render()
          return
        }
      }
      await store.refreshSharedState()
      await store.refreshCommissionSummary()
      this.render()
    })().catch(() => this.render())
  },

  onUnload(this: any) {
    if (typeof this.unsubscribeStore === 'function') this.unsubscribeStore()
    if (typeof this.disposeDictionaryImages === 'function') this.disposeDictionaryImages()
    this.unsubscribeStore = null
    this.disposeDictionaryImages = null
    dictCache.dispose()
  },

  onShareAppMessage(this: any) {
    const product = shareProductOf()
    currentShareProductId = product ? product.id : ''
    return {
      title: product ? `${product.name}｜产地好物` : '商城',
      path: product ? productSharePath(product) : '/pages/index/index'
    }
  },

  onShareTimeline() {
    const product = shareProductOf()
    return {
      title: product ? `${product.name}｜产地好物` : '商城',
      query: product ? `promoter=${store.currentDistributor?.promoterId || ''}&product=${product.id}` : ''
    }
  },
  // ------------------------------------------------------------------ 交互
  onSearchInput(this: any, event: { detail: { value: string } }) {
    this.setData({ searchText: event.detail.value }, () => this.render())
  },

  onSelectCategory(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    this.setData({ activeCategory: String(event.currentTarget.dataset.category || '全部') }, () => this.render())
  },

  onSwitchTab(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const tab = String(event.currentTarget.dataset.tab || 'home')
    const patch: Record<string, unknown> = { activeTab: tab }
    if (tab === 'me') patch.meSection = 'main'
    this.setData(patch, () => this.render())
  },

  onOpenMyOrders(this: any) {
    this.setData({ activeTab: 'me', meSection: 'orders' }, () => this.render())
  },

  onBackToMe(this: any) {
    this.setData({ meSection: 'main' }, () => this.render())
  },



  onOpenProduct(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    this.openProductById(String(event.currentTarget.dataset.id || ''))
  },

  openProductById(this: any, id: string) {
    const product = (store.cProducts as CProduct[]).find((item) => item.id === id)
    if (!product) return
    selectedProduct = product
    selectedSubOrder = null
    this.setData({ productView: true, sheet: null, selectedSkuId: product.skus[0]?.id || '', selectedQty: minimumOrderQuantity(product.skus[0]) }, () => this.render())
  },

  onCloseProductView(this: any) {
    this.setData({ productView: false }, () => this.render())
  },

  onOpenSkuSheet(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const product = (store.cProducts as CProduct[]).find((item) => item.id === String(event.currentTarget.dataset.id || ''))
    if (!product) return
    selectedProduct = product
    this.setData({ sheet: 'detail', selectedSkuId: product.skus[0]?.id || '', selectedQty: minimumOrderQuantity(product.skus[0]) }, () => this.render())
  },

  onAddProduct(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const product = (store.cProducts as CProduct[]).find((item) => item.id === String(event.currentTarget.dataset.id || ''))
    if (!product) return
    if (product.skus.length > 1) {
      this.onOpenSkuSheet(event)
      return
    }
    const sku = product.skus[0]
    if (!sku || !canStartOrder(sku)) {
      toast('库存不足或数量未达要求')
      return
    }
    toast(store.addToCart(product.id, sku.id) ? '已加入购物车' : (store.checkoutError || '暂时无法加入购物车'))
  },

  onSelectSku(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const id = String(event.currentTarget.dataset.id || '')
    const sku = selectedProduct?.skus.find((item) => item.id === id)
    this.setData({ selectedSkuId: id, selectedQty: minimumOrderQuantity(sku) }, () => this.render())
  },

  onChangeSelectedQty(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const sku = this.currentSku()
    if (!sku) return
    const next = Number(this.data.selectedQty) + Number(event.currentTarget.dataset.delta || 0)
    const min = minimumOrderQuantity(sku)
    if (next < min || next > sku.stock) return
    this.setData({ selectedQty: next }, () => this.render())
  },

  onAddSelectedToCart(this: any) {
    const sku = this.currentSku()
    if (!selectedProduct || !sku) return
    if (store.addToCart(selectedProduct.id, sku.id, Number(this.data.selectedQty))) {
      this.setData({ sheet: null }, () => this.render())
      toast('已加入购物车')
      return
    }
    toast(store.checkoutError || '暂时无法加入购物车')
  },

  onToggleCartLine(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const key = String(event.currentTarget.dataset.key || '')
    const next = new Set<string>(this.selectedCartLineKeys || [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    this.selectedCartLineKeys = Array.from(next)
    this.render()
  },

  onToggleAllCartLines(this: any) {
    const mode: CartDeliveryMode = this.data.cartDeliveryMode
    const items = (store.cart as any[]).filter((line) => cartLineDeliveryMode(line) === mode)
    const selected = new Set<string>(this.selectedCartLineKeys || [])
    const allSelected = !!items.length && items.every((line) => selected.has(cartLineKey(line)))
    items.forEach((line) => {
      if (allSelected) selected.delete(cartLineKey(line))
      else selected.add(cartLineKey(line))
    })
    this.selectedCartLineKeys = Array.from(selected)
    this.render()
  },

  onSwitchCartDeliveryMode(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    this.setData({ cartDeliveryMode: String(event.currentTarget.dataset.mode || 'courier') === 'pickup' ? 'pickup' : 'courier' }, () => this.render())
  },

  onChangeLine(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const dataset = event.currentTarget.dataset as { productId: string; skuId: string; delta: number }
    if (!store.changeCart(dataset.productId, dataset.skuId, Number(dataset.delta))) toast(store.checkoutError || '库存不足')
    this.render()
  },

  onRemoveLine(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const dataset = event.currentTarget.dataset as { productId: string; skuId: string }
    store.removeFromCart(dataset.productId, dataset.skuId)
    this.syncSelectedCartLines()
    this.render()
  },

  onRemoveSelectedLines(this: any) {
    const mode: CartDeliveryMode = this.data.cartDeliveryMode
    const selected = new Set<string>(this.selectedCartLineKeys || [])
    ;(store.cart as any[])
      .filter((line) => cartLineDeliveryMode(line) === mode && selected.has(cartLineKey(line)))
      .forEach((line) => store.removeFromCart(line.productId, line.skuId))
    this.syncSelectedCartLines()
    this.render()
  },

  onOpenCheckout(this: any) {
    const mode: CartDeliveryMode = this.data.cartDeliveryMode
    const selected = new Set<string>(this.selectedCartLineKeys || [])
    const items = (store.cart as any[]).filter((line) => cartLineDeliveryMode(line) === mode && selected.has(cartLineKey(line)))
    if (!items.length) {
      toast('请先选择要结算的商品')
      return
    }
    this.checkoutLineRefs = items.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: line.quantity }))
    this.setData({ sheet: 'checkout' }, () => this.render())
  },

  onOpenCartSheet(this: any) {
    this.setData({ sheet: 'cart' }, () => this.render())
  },

  async onSubmitOrder(this: any) {
    const selectedKeys = (this.checkoutLineRefs || []).map((ref: any) => `${ref.productId}-${ref.skuId}`)
    if (!await store.submitOrder('', selectedKeys)) {
      toast(store.checkoutError || '请完善订单信息')
      return
    }
    this.checkoutLineRefs = []
    this.setData({ sheet: null, activeTab: 'me', meSection: 'orders' }, () => this.render())
    toast('订单已提交，请模拟支付')
  },

  onCloseSheet(this: any) {
    this.setData({ sheet: null, addressEditing: false }, () => this.render())
  },

  onSheetBodyTap() {
    // 阻止点击穿透到遮罩。
  },

  onEditAddress(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const id = String(event.currentTarget.dataset.id || '')
    const address = id ? (store.addresses as CAddress[]).find((item) => item.id === id) : undefined
    this.setData({
      addressDraft: address
        ? { receiver: address.receiver, phone: address.phone, region: address.region, detail: address.detail, isDefault: !!address.isDefault }
        : { receiver: '', phone: '', region: '', detail: '', isDefault: !(store.addresses as CAddress[]).length },
      addressEditing: true,
      sheet: 'address'
    }, () => this.render())
  },

  onOpenAddressManager(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    this.addressReturnToCheckout = String(event.currentTarget.dataset.return || '') === 'true'
    this.setData({ addressEditing: false, sheet: 'address' }, () => this.render())
  },

  onChooseAddress(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    if (!store.setDefaultAddress(String(event.currentTarget.dataset.id || ''))) return
    this.setData({ sheet: this.addressReturnToCheckout ? 'checkout' : 'address' }, () => this.render())
    toast('已选择收货地址')
  },

  onRemoveAddress(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    if (store.removeAddress(String(event.currentTarget.dataset.id || ''))) toast('地址已删除')
    this.render()
  },

  onAddressInput(this: any, event: { detail: { value: string }; currentTarget: { dataset: Record<string, unknown> } }) {
    const field = String(event.currentTarget.dataset.field || '')
    if (!field) return
    this.setData({ [`addressDraft.${field}`]: event.detail.value })
  },

  onToggleDefault(this: any) {
    this.setData({ 'addressDraft.isDefault': !this.data.addressDraft.isDefault }, () => this.render())
  },

  onSaveAddress(this: any) {
    const draft = this.data.addressDraft
    const saved = store.setAddress({
      receiver: draft.receiver,
      phone: draft.phone,
      region: draft.region,
      detail: draft.detail,
      isDefault: !!draft.isDefault
    })
    if (!saved) {
      toast('请填写正确的收货信息')
      return
    }
    this.setData({ sheet: 'address', addressEditing: false }, () => this.render())
    toast('地址已保存')
  },

  async onPayOrder(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const orderId = String(event.currentTarget.dataset.orderId || '')
    toast(await store.payOrder(orderId) ? '模拟支付成功' : (store.checkoutError || '当前订单不能支付'))
    this.render()
  },

  async onCancelOrder(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const orderId = String(event.currentTarget.dataset.orderId || '')
    toast(await store.cancelOrder(orderId) ? '订单已取消，库存已释放' : '当前订单不能取消')
    this.render()
  },

  async onReceive(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const dataset = event.currentTarget.dataset as { orderId: string; subOrderId: string }
    toast(await store.confirmSubOrderReceipt(dataset.orderId, dataset.subOrderId) ? '已确认收货，佣金已到账' : (store.error || '当前订单不能收货'))
    this.render()
  },

  onAfterSale(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const dataset = event.currentTarget.dataset as { orderId: string; subOrderId: string }
    const order = (store.orders as COrder[]).find((item) => item.id === dataset.orderId)
    const sub = order?.subOrders.find((item) => item.id === dataset.subOrderId)
    if (!order || !sub) return
    afterSaleTarget = { order, sub }
    this.setData({ sheet: 'after-sale', afterSaleEvidence: [], afterSaleReason: AFTER_SALE_REASONS[0] }, () => this.render())
  },

  onSelectAfterSaleReason(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    this.setData({ afterSaleReason: String(event.currentTarget.dataset.reason || AFTER_SALE_REASONS[0]) }, () => this.render())
  },

  onAfterSaleEvidenceChange(this: any, event: { detail: { value: BusinessMediaValue[] | null } }) {
    this.setData({ afterSaleEvidence: event.detail.value || [] })
  },

  async onConfirmAfterSale(this: any) {
    if (!afterSaleTarget) return
    const status = afterSaleTarget.sub.status
    const evidence = this.data.afterSaleEvidence || []
    const submitted = await store.requestSubOrderAfterSale(afterSaleTarget.order.id, afterSaleTarget.sub.id, evidence.length ? evidence : undefined)
    if (!submitted) {
      toast(store.checkoutError || '当前订单不支持售后')
      return
    }
    afterSaleTarget = null
    this.setData({ sheet: null, afterSaleEvidence: [] }, () => this.render())
    toast(status === 'paid' ? '已提交售后，库存已释放，待结算佣金已撤销' : status === 'shipped' ? '已提交售后，库存不再恢复' : '已提交售后，佣金已冲正')
  },

  onOpenLogistics(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const dataset = event.currentTarget.dataset as { orderId: string; subOrderId: string }
    const order = (store.orders as COrder[]).find((item) => item.id === dataset.orderId)
    const sub = order?.subOrders.find((item) => item.id === dataset.subOrderId)
    if (!sub) return
    selectedSubOrder = sub
    this.setData({ sheet: 'logistics' }, () => this.render())
  },

  onCopyTrackingNo() {
    const trackingNo = selectedSubOrder?.trackingNo
    if (!trackingNo) {
      toast('暂无运单号')
      return
    }
    wx.setClipboardData({ data: trackingNo, success: () => toast('运单号已复制') })
  },

  onShareProduct(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const product = (store.cProducts as CProduct[]).find((item) => item.id === String(event.currentTarget.dataset.id || '')) || selectedProduct
    if (!product) return
    currentShareProductId = product.id
    wx.setClipboardData({ data: productSharePath(product), success: () => toast('商品分享链接已复制') })
  },

  onOpenPackages(this: any) {
    if (!this.data.hasPackages) {
      toast('当前暂无到店套餐')
      return
    }
    this.setData({ sheet: 'package' }, () => this.render())
  },

  async onBuyPackage(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    const item = (store.products as Product[]).find((product) => product.id === String(event.currentTarget.dataset.id || ''))
    if (!item) return
    const sku = item.skus.find((candidate) => canStartOrder(candidate)) || item.skus[0]
    if (!sku) {
      toast('该套餐暂无可售规格')
      return
    }
    const purchased = await store.buyLivePackage(item.id, sku.id)
    toast(purchased ? '套餐已购买，可在订单页查看' : (store.checkoutError || '套餐购买失败'))
    this.render()
  },

  onOpenOperations(this: any, event: { currentTarget: { dataset: Record<string, unknown> } }) {
    wx.navigateTo({ url: `/pages/operations/index?type=${String(event.currentTarget.dataset.type || 'income')}` })
  },

  async onWithdrawCommission(this: any) {
    const result = await store.withdrawCommission('微信提现')
    toast(result === 'pending' ? '提现申请已提交' : result === 'duplicate' ? '已有提现申请处理中' : result === 'invalid' ? '暂无可提现佣金' : store.error || '提现申请失败')
    this.render()
  }
})
