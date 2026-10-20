<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import type { BusinessMediaValue, CAddress, COrder, CProduct, CProductSku, CSubOrder, CUserLevel, PaymentAttempt, Product } from '@agritainment/shared'
import { PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, createPlatformDictionaryCache, defaultProductCategoryImage, displayProductTags, installKeyboardButtonSupport, money, normalizeMinimumOrderQuantity, productCategoryImage, readCDistributorProfiles, readCOrders, readPlatformDictionaries, readUserBindings, resolveProductChannels, subscribePlatformChanges, validateCatalogSkuOrderQuantity } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { isDemoOrderId } from '../../data/demo-orders'
import { projectDistributorOperations } from '../../services/distributor-operations'
import { useUserStore } from '../../stores/user'

const store = useUserStore()
const loading = ref(true)
const authorizing = ref(false)
const activeTab = ref<'home' | 'category' | 'cart' | 'me'>('home')
const meSection = ref<'main' | 'orders'>('main')
const operationsTick = ref(0)
const shareProductId = ref('')
const searchText = ref('')
const activeCategory = ref('全部')
const sheet = ref<'detail' | 'cart' | 'checkout' | 'address' | 'logistics' | 'after-sale' | 'package' | null>(null)
const loginLevel = ref<CUserLevel>('normal')
const selectedProduct = ref<CProduct | null>(null)
const productView = ref(false)
const selectedSkuId = ref('')
const selectedQty = ref(1)
const selectedSubOrder = ref<CSubOrder | null>(null)
const afterSaleTarget = ref<{ order: COrder; sub: CSubOrder } | null>(null)
const afterSaleEvidence = ref<BusinessMediaValue[]>([])
const afterSaleReason = ref('运输破损')
const addressEditing = ref(false)
const addressReturnToCheckout = ref(false)
const launchQuery: Record<string, string | undefined> = {}
const addressDraft = reactive<Omit<CAddress, 'id' | 'userId'>>({ receiver: '', phone: '', region: '', detail: '', isDefault: true })
let disposeStorageSync: (() => void) | null = null
const dictCache = createPlatformDictionaryCache()
const dictionaryState = ref(readPlatformDictionaries())
let disposeDictionaryImages: () => void = () => undefined

type CartDeliveryMode = 'pickup' | 'courier'
const cartDeliveryMode = ref<CartDeliveryMode>('courier')
const selectedCartLineKeys = reactive(new Set<string>())
const checkoutLineRefs = ref<Array<{ productId: string; skuId: string; quantity?: number }>>([])
const cartLineKey = (line: { productId: string; skuId: string }) => `${line.productId}-${line.skuId}`
const cartLineDeliveryMode = (line: { productId: string }) => {
  const product = store.cProducts.find((item) => item.id === line.productId)
  return product && (product.shippingType === 'courier' || product.expressDelivery) ? 'courier' as const : 'pickup' as const
}
const cartCategoryItems = computed(() => store.cart.filter((line) => cartLineDeliveryMode(line) === cartDeliveryMode.value))
const selectedCartItems = computed(() => cartCategoryItems.value.filter((line) => selectedCartLineKeys.has(cartLineKey(line))))
const selectedCartCount = computed(() => selectedCartItems.value.reduce((sum, line) => sum + line.quantity, 0))
const selectedCartTotal = computed(() => Math.round(selectedCartItems.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100)
const cartCategoryAllSelected = computed(() => !!cartCategoryItems.value.length && cartCategoryItems.value.every((line) => selectedCartLineKeys.has(cartLineKey(line))))
const cartCategoryHasUnavailable = computed(() => selectedCartItems.value.some((line) => line.unavailable))
const cartCategoryCount = (mode: CartDeliveryMode) => store.cart.filter((line) => cartLineDeliveryMode(line) === mode).reduce((sum, line) => sum + line.quantity, 0)
const checkoutItems = computed(() => checkoutLineRefs.value.map((ref) => {
  const line = store.cart.find((candidate) => candidate.productId === ref.productId && candidate.skuId === ref.skuId)
  return line ? { ...line, quantity: ref.quantity ?? line.quantity } : null
}).filter((line): line is typeof store.cart[number] => !!line))
const checkoutTotal = computed(() => Math.round(checkoutItems.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100)

function toggleCartLine(line: { productId: string; skuId: string }) {
  const key = cartLineKey(line)
  if (selectedCartLineKeys.has(key)) selectedCartLineKeys.delete(key)
  else selectedCartLineKeys.add(key)
}

function toggleAllCartLines() {
  if (cartCategoryAllSelected.value) cartCategoryItems.value.forEach((line) => selectedCartLineKeys.delete(cartLineKey(line)))
  else cartCategoryItems.value.forEach((line) => selectedCartLineKeys.add(cartLineKey(line)))
}

function syncSelectedCartLines() {
  const currentKeys = new Set(store.cart.map(cartLineKey))
  store.cart.forEach((line) => {
    const key = cartLineKey(line)
    if (!selectedCartLineKeys.has(key)) selectedCartLineKeys.add(key)
  })
  Array.from(selectedCartLineKeys).forEach((key) => { if (!currentKeys.has(key)) selectedCartLineKeys.delete(key) })
  if (!store.cart.some((line) => cartLineDeliveryMode(line) === cartDeliveryMode.value)) {
    cartDeliveryMode.value = store.cart.some((line) => cartLineDeliveryMode(line) === 'courier') ? 'courier' : 'pickup'
  }
}

watch(() => store.cart, (cart) => {
  syncSelectedCartLines()
  if (!cart.length) { cartDeliveryMode.value = 'courier'; checkoutLineRefs.value = [] }
}, { deep: true })

onLoad((options) => Object.assign(launchQuery, options || {}))

const categories = computed(() => ['全部', ...Array.from(new Set(store.cProducts.map((item) => item.category)))])
const visibleProducts = computed(() => store.cProducts.filter((product) => {
  const matchesCategory = activeCategory.value === '全部' || product.category === activeCategory.value
  const keyword = searchText.value.trim().toLowerCase()
  return matchesCategory && product.status === 'active' && product.shippingType === 'courier' && product.productType !== 'package' && product.expressDelivery === true && resolveProductChannels(product).live && (!keyword || `${product.name}${product.supplierName}${product.tags.join('')}`.toLowerCase().includes(keyword))
}))
const selectedSku = computed(() => selectedProduct.value?.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value?.skus[0] || null)
const selectedSubtotal = computed(() => selectedPrice.value * selectedQty.value)
const selectedPrice = computed(() => selectedSku.value ? store.priceForSku(selectedSku.value) : 0)
const levelLabels: Record<CUserLevel, string> = { normal: '普通用户', level1: '一级团长', level2: '二级团长' }
const roleLabel = computed(() => levelLabels[store.level])
const loginLevelLabel = computed(() => levelLabels[loginLevel.value])
/** 到店套餐：门店在订货端上架的套餐商品，按门店归组，用户端到店自提核销 */
const packageGroups = computed(() => {
  const groups = new Map<string, { farmId: string; farmName: string; packages: Product[] }>()
  store.products.forEach((product) => {
    if (product.productType !== 'package') return
    const farmId = product.farmIds[0] || 'F001'
    const farmName = store.farms.find((farm) => farm.id === farmId)?.name || '平台门店'
    const group = groups.get(farmId) || { farmId, farmName, packages: [] }
    group.packages.push(product)
    groups.set(farmId, group)
  })
  return [...groups.values()].filter((group) => group.packages.some((item) => item.skus.some((sku) => canStartOrder(sku))))
})
const packageCount = computed(() => packageGroups.value.reduce((sum, group) => sum + group.packages.length, 0))
const withdrawalRequests = computed(() => Array.isArray(store.withdrawalRequests) ? store.withdrawalRequests : [])
const operations = computed(() => {
  void operationsTick.value
  return projectDistributorOperations({ promoterId: store.currentDistributor?.promoterId || '', orders: Object.values(readCOrders() || {}), bindings: readUserBindings() || {}, profiles: readCDistributorProfiles() || {} })
})
const orderStatusLabel = (status: COrder['status']) => ({ pending_payment: '待支付', paid: '备货中', shipped: '已发货', received: '已收货', cancelled: '已取消', after_sale: '售后处理中', partially_shipped: '部分发货', partially_received: '部分收货', partially_after_sale: '部分售后' }[status])
const subStatusLabel = (status: COrder['subOrders'][number]['status']) => orderStatusLabel(status)
const formatDate = (value: string) => value.replace('T', ' ').slice(0, 16)
const withdrawalStatusLabel = (status: 'pending' | 'approved' | 'rejected') => ({ pending: '处理中', approved: '已通过', rejected: '已驳回' }[status])

function minimumOrderQuantity(sku: Pick<CProductSku, 'minimumOrderQuantity'> | null | undefined) {
  return normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
}

function canStartOrder(sku: Pick<CProductSku, 'stock' | 'minimumOrderQuantity'> | null | undefined) {
  return !!sku && validateCatalogSkuOrderQuantity(sku, minimumOrderQuantity(sku)).ok
}

function canStartProductOrder(product: CProduct) {
  return product.skus.some((sku) => canStartOrder(sku))
}

function toast(title: string) { uni.showToast({ title, icon: 'none' }) }

function productSharePath(product: CProduct) {
  if (!store.currentDistributor) return '/pages/index/index'
  return `/pages/index/index?promoter=${store.currentDistributor.promoterId}&product=${product.id}`
}

function shareProduct(product: CProduct) {
  shareProductId.value = product.id
  uni.setClipboardData({ data: productSharePath(product), success: () => toast('商品分享链接已复制') })
}

function openOperations(type: 'income' | 'fans' | 'orders' | 'performance') {
  uni.navigateTo({ url: `/pages/operations/index?type=${type}` })
}

function openMyOrders() {
  activeTab.value = 'me'
  meSection.value = 'orders'
}

onShareAppMessage(() => {
  const product = store.cProducts.find((item) => item.id === shareProductId.value) || selectedProduct.value || store.cProducts[0]
  return { title: product ? `${product.name}｜产地好物` : '商城', path: product ? productSharePath(product) : '/pages/index/index' }
})

async function authorize() {
  if (authorizing.value) return
  authorizing.value = true
  loading.value = true
  try {
    await store.wechatLogin()
    store.applyLaunch(launchQuery)
    store.setDemoDistributorLevel(loginLevel.value)
    store.seedDemoData()
    await store.initialize(true)
  } finally {
    authorizing.value = false
    loading.value = false
  }
}

function resetSelectedQty(sku?: CProductSku | null) {
  selectedQty.value = minimumOrderQuantity(sku)
}

function openProduct(product: CProduct) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus[0]?.id || ''
  resetSelectedQty(product.skus[0])
  productView.value = true
  sheet.value = null
}

function openSkuSheet(product: CProduct) {
  selectedProduct.value = product
  selectedSkuId.value = product.skus[0]?.id || ''
  resetSelectedQty(product.skus[0])
  sheet.value = 'detail'
}

function selectSku(id: string) {
  selectedSkuId.value = id
  resetSelectedQty(selectedProduct.value?.skus.find((sku) => sku.id === id))
}

function changeSelectedQty(delta: number) {
  const sku = selectedSku.value
  if (!sku) return
  const next = selectedQty.value + delta
  const min = minimumOrderQuantity(sku)
  if (next < min || next > sku.stock) return
  selectedQty.value = next
}

function closeProductView() {
  productView.value = false
}

function addProduct(product: CProduct) {
  if (product.skus.length > 1) return openSkuSheet(product)
  const sku = product.skus[0]
  if (!sku || !canStartOrder(sku)) return toast('库存不足或数量未达要求')
  if (store.addToCart(product.id, sku.id)) toast('已加入购物车')
  else toast(store.checkoutError || '暂时无法加入购物车')
}

function addSelectedToCart() {
  if (!selectedProduct.value || !selectedSku.value) return
  if (store.addToCart(selectedProduct.value.id, selectedSku.value.id, selectedQty.value)) {
    sheet.value = null
    toast('已加入购物车')
  } else toast(store.checkoutError || '暂时无法加入购物车')
}

function changeLine(productId: string, skuId: string, delta: number) {
  if (!store.changeCart(productId, skuId, delta)) toast(store.checkoutError || '库存不足')
}

function openCheckout() {
  if (!selectedCartItems.value.length) return toast('请先选择要结算的商品')
  checkoutLineRefs.value = selectedCartItems.value.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: line.quantity }))
  sheet.value = 'checkout'
}

async function submitOrder() {
  const selectedKeys = checkoutLineRefs.value.map((ref) => `${ref.productId}-${ref.skuId}`)
  if (!await store.submitOrder('', selectedKeys)) return toast(store.checkoutError || '请完善订单信息')
  checkoutLineRefs.value = []
  sheet.value = null
  openMyOrders()
  toast('订单已提交，请模拟支付')
}

function editAddress(address?: CAddress) {
  Object.assign(addressDraft, address ? { receiver: address.receiver, phone: address.phone, region: address.region, detail: address.detail, isDefault: address.isDefault, id: address.id } : { receiver: '', phone: '', region: '', detail: '', isDefault: !store.addresses.length })
  addressEditing.value = true
  sheet.value = 'address'
}

function editAddressFromContext(address?: CAddress) {
  editAddress(address)
}

function openAddressManager(returnToCheckout = false) {
  addressEditing.value = false
  addressReturnToCheckout.value = returnToCheckout
  sheet.value = 'address'
}

function chooseAddress(id: string) {
  if (store.setDefaultAddress(id)) {
    sheet.value = addressReturnToCheckout.value ? 'checkout' : 'address'
    toast('已选择收货地址')
  }
}

function removeAddress(id: string) {
  if (store.removeAddress(id)) toast('地址已删除')
}

function saveAddress() {
  const input = addressDraft as Omit<CAddress, 'userId'> & { id?: string }
  if (!store.setAddress(input)) return toast('请填写正确的收货信息')
  sheet.value = 'address'
  addressEditing.value = false
  toast('地址已保存')
}

function toggleDefault() { addressDraft.isDefault = !addressDraft.isDefault }

async function pay(order: COrder) { await store.payOrder(order.id) ? toast('模拟支付成功') : toast(store.checkoutError || '当前订单不能支付') }
async function cancelPendingOrder(order: COrder) { await store.cancelOrder(order.id) ? toast('订单已取消，库存已释放') : toast('当前订单不能取消') }
function paymentAttempt(order: COrder): PaymentAttempt | null { return store.paymentAttemptForOrder(order.id) }
function paymentConfirmationPending(order: COrder) { return ['created', 'unknown', 'confirmed'].includes(paymentAttempt(order)?.status || '') }
function paymentConfirmationQueryable(order: COrder) { return ['unknown', 'confirmed'].includes(paymentAttempt(order)?.status || '') }
async function receive(order: COrder, sub: CSubOrder) { await store.confirmSubOrderReceipt(order.id, sub.id) ? toast('已确认收货，佣金已到账') : toast(store.error || '当前订单不能收货') }
function afterSale(order: COrder, sub: CSubOrder) {
  afterSaleTarget.value = { order, sub }
  afterSaleEvidence.value = []
  sheet.value = 'after-sale'
}
async function confirmAfterSale() {
  const target = afterSaleTarget.value
  if (!target) return
  const status = target.sub.status
  if (!await store.requestSubOrderAfterSale(target.order.id, target.sub.id, afterSaleEvidence.value.length ? afterSaleEvidence.value : undefined)) return toast(store.checkoutError || '当前订单不支持售后')
  sheet.value = null
  afterSaleTarget.value = null
  toast(status === 'paid' ? '已提交售后，库存已释放，待结算佣金已撤销' : status === 'shipped' ? '已提交售后，库存不再恢复' : '已提交售后，佣金已冲正')
}
function openLogistics(sub: CSubOrder) { selectedSubOrder.value = sub; sheet.value = 'logistics' }
function copyTrackingNo() {
  const trackingNo = selectedSubOrder.value?.trackingNo
  if (!trackingNo) return toast('暂无运单号')
  uni.setClipboardData({ data: trackingNo, success: () => toast('运单号已复制') })
}
async function withdrawCommission() {
  const result = await store.withdrawCommission('微信提现')
  toast(result === 'pending' ? '提现申请已提交' : result === 'duplicate' ? '已有提现申请处理中' : result === 'invalid' ? '暂无可提现佣金' : '提现申请失败')
}

async function logout() {
  store.logout()
  activeTab.value = 'home'
  toast('已退出登录')
}

function openPackages() {
  if (!packageCount.value) return toast('当前暂无到店套餐')
  sheet.value = 'package'
}

async function buyPackage(item: Product) {
  const sku = item.skus.find((candidate) => canStartOrder(candidate)) || item.skus[0]
  if (!sku) return toast('该套餐暂无可售规格')
  if (!await store.buyLivePackage(item.id, sku.id)) return toast(store.checkoutError || '套餐购买失败')
  toast('套餐已购买，可在订单页查看')
}

onMounted(async () => {
  installKeyboardButtonSupport()
  Object.assign(launchQuery, uni.getLaunchOptionsSync().query || {})
  store.applyLaunch(launchQuery)
  store.seedDemoData()
  await store.initialize()
  const launchProduct = store.cProducts.find((product) => product.id === store.launchProductId)
  if (launchProduct) openProduct(launchProduct)
  if (typeof window !== 'undefined') {
    const keys = new Set([PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, 'agritainment-platform-c-orders', 'agritainment-platform-c-addresses', 'agritainment-platform-c-commissions', 'agritainment-platform-orders'])
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) { operationsTick.value += 1; void store.refreshSharedState() } }
    window.addEventListener('storage', onStorage)
    const unsubscribePlatformChanges = subscribePlatformChanges(() => { operationsTick.value += 1; void store.refreshSharedState() }, [...keys])
    disposeStorageSync = () => { window.removeEventListener('storage', onStorage); unsubscribePlatformChanges() }
  }
  loading.value = false
  disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })
})

onBeforeUnmount(() => {
  disposeStorageSync?.(); disposeStorageSync = null
  disposeDictionaryImages()
  dictCache.dispose()
})
</script>

<template>
  <view class="app-shell" :class="{ 'has-cart-bar': store.cart.length && activeTab !== 'cart' }">
    <view v-if="loading" class="loading-state pc-loading">正在准备商城...</view>

    <view v-else-if="store.entryRestricted" class="auth-page">
      <view class="auth-deco auth-deco1"></view>
      <view class="auth-deco auth-deco2"></view>
      <view class="auth-brand">
        <view class="auth-mark"><UiIcon name="shield-check" :size="30" /></view>
        <text class="auth-brand-name">该入口暂不可访问</text>
        <text class="auth-brand-sub">请通过有效团长分享链接进入商城</text>
      </view>
      <view class="auth-card">
        <view class="auth-wxbadge"><UiIcon name="message-circle" :size="26" /></view>
        <button v-if="!store.auth.isLoggedIn" class="auth-btn" :disabled="authorizing" @click="authorize"><UiIcon name="door-open" :size="18" />{{ authorizing ? '身份识别中...' : '已绑定用户登录' }}</button>
      </view>
    </view>

    <view v-else-if="!store.auth.isLoggedIn" class="auth-page">
      <view class="auth-deco auth-deco1"></view>
      <view class="auth-deco auth-deco2"></view>
      <view class="auth-brand">
        <view class="auth-mark"><UiIcon name="shopping-bag" :size="30" /></view>
        <text class="auth-brand-name">商城</text>
        <text class="auth-brand-sub">产地好物，快递直发到家</text>
      </view>
      <view class="auth-card">
        <view class="auth-wxbadge"><UiIcon name="message-circle" :size="26" /></view>
        <view class="auth-roles" role="radiogroup" aria-label="登录身份">
          <button :class="{ active: loginLevel === 'normal' }" role="radio" :aria-checked="loginLevel === 'normal'" @click="loginLevel = 'normal'">普通用户</button>
          <button :class="{ active: loginLevel === 'level1' }" role="radio" :aria-checked="loginLevel === 'level1'" @click="loginLevel = 'level1'">一级团长</button>
          <button :class="{ active: loginLevel === 'level2' }" role="radio" :aria-checked="loginLevel === 'level2'" @click="loginLevel = 'level2'">二级团长</button>
        </view>
        <button class="auth-btn" :disabled="authorizing" @click="authorize"><UiIcon name="door-open" :size="18" />{{ authorizing ? '授权中...' : '微信一键授权' }}</button>
        <text class="auth-tip">当前身份：{{ loginLevelLabel }} · 演示环境，授权后可查看商品与订单</text>
      </view>
    </view>

    <template v-else>
      <view v-if="productView && selectedProduct" class="product-view" data-visual-view="product">
        <view class="page-heading heading-with-back theme-head"><button class="page-back" aria-label="返回" @click="closeProductView"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">商品详情</text><text class="page-sub">产地直发 · 快递到家</text></view></view>
        <view class="page-content product-detail" data-visual-state="user-detail">
          <view class="gallery">
            <BusinessImage class="gallery-image" :src="selectedProduct.image" mode="aspectFill" />
            <text class="gallery-dots">1 / 1</text>
          </view>
          <text class="pv-name">{{ selectedProduct.name }}</text>
          <view class="pv-meta"><text class="sup">{{ selectedProduct.supplierName }}</text><strong class="val">¥{{ selectedPrice.toFixed(2) }}</strong></view>
          <view class="pv-tags"><text v-for="tag in displayProductTags(selectedProduct, 'store').filter((tag) => tag !== '门店商品')" :key="tag" class="tag">{{ tag }}</text></view>
          <view class="shipnote"><UiIcon name="truck" :size="15" />快递配送 · 运费 ¥0 · 产地直发</view>
          <view class="product-detail-actions"><button class="outline-btn" @click="shareProduct(selectedProduct)"><UiIcon name="link" :size="16" />分享商品</button><button class="primary-btn" :disabled="!canStartProductOrder(selectedProduct)" @click="addProduct(selectedProduct)">加入购物车</button></view>
        </view>
      </view>
      <template v-else>
      <view v-if="activeTab === 'home'" class="c-mall" data-visual-view="user-home">
        <view class="mall-header theme-head">
          <view>
            <text class="eyebrow">ORIGIN GOODS</text>
            <text class="mall-title">优选商城</text>
          </view>
          <view class="role-chip" @click="activeTab = 'me'"><UiIcon name="user-round" :size="15" />{{ roleLabel }}</view>
        </view>

        <view class="search-box"><UiIcon name="search" :size="16" /><input v-model="searchText" class="search-input" placeholder="搜索商品、供应商或标签" /></view>
        <view class="package-banner" @click="openPackages">
          <view class="package-banner-mark"><UiIcon name="store" :size="26" /></view>
          <view>
            <text class="banner-kicker">门店套餐</text>
            <text class="banner-title">{{ packageCount ? `${packageCount} 款到店套餐` : '暂无到店套餐' }}</text>
            <text class="banner-sub">门店自提 · 到店核销 · 支持团长分佣</text>
          </view>
          <view class="banner-play"><UiIcon name="chevron-right" :size="17" /></view>
        </view>

        <view class="section-line"><text>推荐好物</text><small class="meta-text meta">{{ visibleProducts.length }} 件</small></view>
        <view class="waterfall-grid">
          <view v-for="product in visibleProducts" :key="product.id" class="product-card" @click="openProduct(product)">
            <view class="product-image-wrap">
              <BusinessImage class="product-image" :src="product.image" mode="aspectFill" />
            </view>
            <view class="product-body"><text class="product-name">{{ product.name }}</text><text class="product-meta">库存 {{ product.skus.reduce((sum, sku) => sum + sku.stock, 0) }}</text><view class="product-foot"><view class="product-price-box"><text class="product-price">¥{{ store.priceForSku(product.skus[0]).toFixed(2) }}</text><del v-if="(product.skus[0]?.basePrice ?? 0) > store.priceForSku(product.skus[0])" class="product-original">¥{{ (product.skus[0]?.basePrice ?? 0).toFixed(2) }}</del></view><button class="product-action" :aria-label="`加入${product.name}到购物车`" :disabled="!canStartProductOrder(product)" @click.stop="addProduct(product)"><UiIcon name="plus" :size="15" /></button></view></view>
          </view>
        </view>
        <view v-if="!visibleProducts.length" class="empty-block pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="24" /></view><text>没有找到匹配的商品</text></view>
      </view>

      <view v-else-if="activeTab === 'category'" class="page-content category-page" data-visual-view="user-category">
        <view class="page-heading theme-head"><text class="page-title">商品分类</text><text class="page-sub">产地好物 · 按品类挑选</text></view>
        <view class="search-box"><UiIcon name="search" :size="16" /><input v-model="searchText" class="search-input" placeholder="搜索商品、供应商或标签" /></view>
        <view class="category-grid"><button v-for="category in categories" :key="category" class="category-grid-item" :class="{ active: activeCategory === category }" :aria-label="category" :title="category" @click="activeCategory = category"><BusinessImage class="category-grid-img" :src="productCategoryImage(category, dictionaryState)" :fallback="defaultProductCategoryImage(category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text class="category-grid-label">{{ category }}</text></button></view>
        <view class="section-line"><text>全部商品</text><small class="meta-text meta">{{ visibleProducts.length }} 件</small></view>
        <view class="waterfall-grid compact-feed">
          <view v-for="product in visibleProducts" :key="product.id" class="product-card" @click="openProduct(product)">
            <view class="product-image-wrap"><BusinessImage class="product-image" :src="product.image" mode="aspectFill" /></view>
            <view class="product-body"><text class="product-name">{{ product.name }}</text><text class="product-meta">库存 {{ product.skus.reduce((sum, sku) => sum + sku.stock, 0) }}</text><view class="product-foot"><view class="product-price-box"><text class="product-price">¥{{ store.priceForSku(product.skus[0]).toFixed(2) }}</text><del v-if="(product.skus[0]?.basePrice ?? 0) > store.priceForSku(product.skus[0])" class="product-original">¥{{ (product.skus[0]?.basePrice ?? 0).toFixed(2) }}</del></view><button class="product-action" :aria-label="`加入${product.name}到购物车`" :disabled="!canStartProductOrder(product)" @click.stop="addProduct(product)"><UiIcon name="plus" :size="15" /></button></view></view>
          </view>
        </view>
        <view v-if="!visibleProducts.length" class="empty-block pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-bag" :size="24" /></view><text>该分类暂无商品</text></view>
      </view>

      <view v-else-if="activeTab === 'cart'" class="page-content cart-page" :class="{ 'cart-page--has-checkout': store.cart.length > 0 }" data-visual-view="user-cart">
        <view class="page-heading cart-heading theme-head"><view><text class="page-title">购物车</text><text class="page-sub">共 {{ store.cartCount }} 件 · 产地好物</text></view></view>
        <view class="cart-content cart-page-content">
          <view v-if="!store.cart.length" class="empty-block large pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="26" /></view><text>购物车还是空的</text><button class="outline-btn" @click="activeTab = 'home'">去逛逛</button></view>
          <template v-else>
            <view class="cart-category-tabs cart-page-tabs"><button :class="{ active: cartDeliveryMode === 'pickup' }" @click="cartDeliveryMode = 'pickup'">到店自提 · {{ cartCategoryCount('pickup') }} 件</button><button :class="{ active: cartDeliveryMode === 'courier' }" @click="cartDeliveryMode = 'courier'">快递直发 · {{ cartCategoryCount('courier') }} 件</button></view>
            <view class="cart-page-card">
              <button class="cart-select-all" @click="toggleAllCartLines"><span class="cart-check" :class="{ checked: cartCategoryAllSelected }"><UiIcon v-if="cartCategoryAllSelected" name="check" :size="12" /></span><text>{{ cartDeliveryMode === 'courier' ? '快递商品' : '普通商品' }} · {{ cartCategoryItems.length }} 款</text><small @click.stop="toggleAllCartLines" class="meta">{{ cartCategoryAllSelected ? '取消全选' : '全选' }}</small></button>
              <view v-if="!cartCategoryItems.length" class="empty cart-category-empty"><view class="pc-state-icon"><UiIcon :name="cartDeliveryMode === 'courier' ? 'truck' : 'store'" :size="25" /></view><text>{{ cartDeliveryMode === 'courier' ? '暂无快递直发商品' : '暂无到店自提商品' }}</text></view>
              <view v-for="line in cartCategoryItems" :key="line.productId + line.skuId" class="cart-line cart-page-line" :class="{ unavailable: line.unavailable }">
                <button class="cart-line-check" :aria-label="selectedCartLineKeys.has(cartLineKey(line)) ? `取消选择${line.name}` : `选择${line.name}`" @click="toggleCartLine(line)"><span class="cart-check" :class="{ checked: selectedCartLineKeys.has(cartLineKey(line)) }"><UiIcon v-if="selectedCartLineKeys.has(cartLineKey(line))" name="check" :size="12" /></span></button>
                <BusinessImage :src="line.image" mode="aspectFill" />
                <view class="cart-line-main">
                  <view class="cart-line-head"><text>{{ line.name }}</text><text class="cart-stock">剩余库存 {{ line.stock }}</text></view>
                  <small class="meta-text meta">{{ line.skuName }}</small>
                  <small v-if="line.unavailable" class="stock-warning meta">库存不足或购买数量未达要求</small>
                  <view class="cart-line-foot"><strong class="strong-text val">¥{{ line.unitPrice.toFixed(2) }}</strong><view class="stepper"><button @click="changeLine(line.productId, line.skuId, -1)">−</button><text>{{ line.quantity }}</text><button @click="changeLine(line.productId, line.skuId, 1)">+</button></view></view>
                </view>
              </view>
            </view>
          </template>
        </view>
        <view v-if="store.cart.length" class="cart-checkout cart-page-checkout">
          <button class="cart-select-all" @click="toggleAllCartLines"><span class="cart-check" :class="{ checked: cartCategoryAllSelected }"><UiIcon v-if="cartCategoryAllSelected" name="check" :size="12" /></span><text>全选</text></button>
          <view class="cart-checkout-total"><text>合计：</text><strong class="val">¥{{ selectedCartTotal.toFixed(2) }}</strong></view>
          <button class="cart-delete-btn" :disabled="!selectedCartItems.length" @click="selectedCartItems.forEach((line) => store.removeFromCart(line.productId, line.skuId))">删除</button>
          <button class="primary-btn" :disabled="!selectedCartItems.length || cartCategoryHasUnavailable" @click="openCheckout">结算({{ selectedCartCount }})</button>
        </view>
      </view>

      <view v-else-if="activeTab === 'me' && meSection === 'orders'" class="page-content orders-page" data-visual-view="user-orders">
        <view class="page-heading heading-with-back theme-head"><button class="page-back" aria-label="返回我的" @click="meSection = 'main'"><UiIcon name="arrow-left" :size="20" /></button><view><text class="page-title">我的订单</text><text class="page-sub">每个供应商独立发货</text></view></view>
        <view v-if="!store.orders.length" class="empty-block large pc-empty"><view class="pc-state-icon"><UiIcon name="package" :size="26" /></view><text>还没有订单</text><button class="outline-btn" @click="activeTab = 'home'">去逛逛</button></view>
        <view v-for="order in store.orders" :key="order.id" class="order-card">
          <view class="order-head"><view><view class="order-id-line"><text class="order-id">{{ order.id }}</text><text v-if="isDemoOrderId(order.id)" class="demo-badge">演示订单</text></view><text class="order-time">{{ formatDate(order.createdAt) }}</text></view><text class="order-status" :class="{ 'is-done': order.status === 'received' }">{{ orderStatusLabel(order.status) }}</text></view>
          <view v-for="sub in order.subOrders" :key="sub.id" class="sub-order"><view class="sub-head"><text>{{ sub.supplierName }}</text><text>{{ subStatusLabel(sub.status) }}</text></view><view v-for="item in sub.items" :key="item.skuId" class="order-item"><BusinessImage :src="item.image" mode="aspectFill" /><view><text>{{ item.name }}</text><small class="meta-text meta">{{ item.skuName }} × {{ item.quantity }}</small></view><strong class="strong-text val">¥{{ (item.unitPrice * item.quantity).toFixed(2) }}</strong></view><view v-if="sub.trackingNo" class="tracking-row"><UiIcon name="truck" :size="13" />{{ sub.courier }} <text class="tracking-code">{{ sub.trackingNo }}</text></view><view class="sub-actions"><text v-if="sub.status === 'paid'" class="waiting-copy">{{ isDemoOrderId(order.id) ? '演示订单不参与真实履约' : '等待供应商发货' }}</text><button v-if="!isDemoOrderId(order.id) && sub.status === 'shipped'" class="primary-small" @click="receive(order, sub)">确认收货</button><button v-if="sub.status === 'after_sale'" class="outline-small" disabled>售后处理中</button><button v-if="!isDemoOrderId(order.id) && (sub.status === 'paid' || sub.status === 'shipped' || sub.status === 'received')" class="outline-small" @click="afterSale(order, sub)">申请售后</button><button v-if="sub.status !== 'cancelled'" class="outline-small" @click="openLogistics(sub)">查看物流</button></view></view>
          <view class="order-bottom"><text>共 {{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</text><strong class="strong-text val">实付 ¥{{ order.amount.toFixed(2) }}</strong></view>
          <view v-if="!isDemoOrderId(order.id) && order.status === 'pending_payment' && paymentConfirmationPending(order)" class="payment-confirmation">支付结果确认中</view>
          <view v-if="!isDemoOrderId(order.id)" class="order-actions"><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="primary-small" @click="pay(order)">模拟支付</button><button v-if="order.status === 'pending_payment' && paymentConfirmationQueryable(order)" class="primary-small" @click="pay(order)">查询支付结果</button><button v-if="order.status === 'pending_payment' && !paymentConfirmationPending(order)" class="outline-small" @click="cancelPendingOrder(order)">取消订单</button></view>
        </view>
        <view v-if="store.vouchers.length" class="order-card voucher-card"><view class="order-head"><view><text class="order-id">券订单</text><text class="order-time">门店套餐</text></view><text class="order-status muted">共 {{ store.vouchers.length }} 张</text></view><view v-for="voucher in store.vouchers" :key="voucher.id" class="vrow"><view class="voucher-thumb"><UiIcon name="badge-percent" :size="19" /></view><view class="vrow-main"><text>{{ voucher.id }}</text><small class="meta-text meta">数量 {{ voucher.quantity }} · ¥{{ voucher.amount.toFixed(2) }} · {{ voucher.status === 'paid' ? '待核销' : voucher.status === 'redeemed' ? '已核销' : '已退款' }}</small></view><strong class="strong-text val">¥{{ voucher.amount.toFixed(2) }}</strong></view></view>
      </view>

      <view v-else class="page-content me-page" data-visual-view="user-me">
        <view class="page-heading theme-head"><text class="page-title">我的</text><text class="page-sub">团长与订单都在这里管理</text></view>
        <view class="profile-panel"><view class="avatar">{{ roleLabel.slice(0, 1) }}</view><view class="profile-main"><text class="profile-role">{{ roleLabel }}</text><text class="profile-id">用户 {{ store.userId || '演示用户' }}</text></view><text class="profile-state">已登录</text></view>
        <view class="role-switch">
          <button :class="{ active: store.level === 'normal' }" @click="store.setDemoDistributorLevel('normal')">普通用户</button>
          <button :class="{ active: store.level === 'level1' }" @click="store.setDemoDistributorLevel('level1')">一级团长</button>
          <button :class="{ active: store.level === 'level2' }" @click="store.setDemoDistributorLevel('level2')">二级团长</button>
        </view>
        <view v-if="store.currentDistributor" class="operations-hero commission-summary"><text>销售统计</text><view><view><strong class="val">¥{{ store.pendingCommission.toFixed(2) }}</strong><small class="meta">待结算收入</small></view><view><strong class="val">¥{{ store.availableCommission.toFixed(2) }}</strong><small class="meta">可提现收入</small></view><view><strong class="val">¥{{ operations.personalPerformance.toFixed(2) }}</strong><small class="meta">个人业绩</small></view><view><strong class="val">¥{{ operations.teamPerformance.toFixed(2) }}</strong><small class="meta">团队业绩</small></view></view></view>
<view v-if="store.currentDistributor" class="operations-grid pc-tile-grid"><button class="pc-tile pc-tile--coral" @click="openOperations('income')"><view class="pc-tile-icon"><UiIcon name="badge-dollar-sign" :size="26" /></view><text class="pc-tile-label">我的收入</text></button><button class="pc-tile pc-tile--blue" @click="openOperations('fans')"><view class="pc-tile-icon"><UiIcon name="user-round-check" :size="26" /><text v-if="operations.directFans.length" class="pc-tile-badge">{{ operations.directFans.length > 99 ? '99+' : operations.directFans.length }}</text></view><text class="pc-tile-label">下级用户</text></button><button class="pc-tile pc-tile--green" @click="openOperations('orders')"><view class="pc-tile-icon"><UiIcon name="package-check" :size="26" /><text v-if="operations.teamOrders.length" class="pc-tile-badge">{{ operations.teamOrders.length > 99 ? '99+' : operations.teamOrders.length }}</text></view><text class="pc-tile-label">团队订单</text></button><button class="pc-tile pc-tile--amber" @click="openOperations('performance')"><view class="pc-tile-icon"><UiIcon name="chart-no-axes-combined" :size="26" /></view><text class="pc-tile-label">团队业绩</text></button></view>
        <view v-else class="normal-summary"><UiIcon name="shield-check" :size="19" /><view><text>安心购物</text><small class="meta">订单、地址与售后服务都在这里</small></view></view>
        <view class="order-entry" @click="openMyOrders"><view><text>我的订单</text><small class="meta">查看全部订单</small></view><UiIcon name="chevron-right" :size="17" /></view>
        <template v-if="store.currentDistributor">
          <view class="referral-panel"><view><text>{{ store.level === 'normal' ? '推荐关系' : '我的上级' }}</text><small class="meta-text meta">{{ store.level === 'normal' ? (store.referralPromoterId ? `已绑定推荐人 ${store.referralPromoterId}` : '暂无有效推荐关系') : (store.currentDistributor?.parentPromoterId ? `一级团长 ${store.currentDistributor.parentPromoterId}` : '平台直营团长') }}</small></view><UiIcon name="chevron-right" :size="16" /></view>
          <view class="section-line"><text>佣金明细</text><small class="meta-text meta">{{ store.myCommissionRecords.length }} 笔</small></view>
          <view v-if="!store.myCommissionRecords.length" class="empty-block compact pc-empty"><view class="pc-state-icon"><UiIcon name="badge-dollar-sign" :size="24" /></view><text>确认收货后，团长分佣会在这里显示</text></view>
          <view v-for="record in store.myCommissionRecords" :key="record.id" class="commission-row"><view><text>{{ record.beneficiaryLevel === 'level1' ? '一级团长分佣' : '二级团长分佣' }}</text><small class="meta-text meta">{{ formatDate(record.createdAt) }} · {{ record.status === 'available' ? '可用' : record.status === 'pending' ? '待结算' : record.status === 'withdrawn' ? '已提现' : '已冲正' }}</small></view><strong class="strong-text val" :class="{ reversed: record.status === 'reversed' }">{{ record.amount < 0 ? '' : '+' }}¥{{ record.amount.toFixed(2) }}</strong></view>
          <view v-if="withdrawalRequests.length" class="withdrawal-history"><view class="section-line"><text>提现申请</text><small class="meta-text meta">{{ withdrawalRequests.length }} 笔</small></view><view v-for="request in withdrawalRequests" :key="request.id" class="commission-row"><view><text>{{ request.method }} · {{ withdrawalStatusLabel(request.status) }}</text><small class="meta-text meta">{{ formatDate(request.createdAt) }}<text v-if="request.reviewedNote"> · {{ request.reviewedNote }}</text></small></view><strong class="strong-text val">¥{{ request.amount.toFixed(2) }}</strong></view></view>
        </template>
        <view class="settings-list"><view @click="openAddressManager(false)"><UiIcon name="map-pin" :size="17" /><text>收货地址</text><small class="meta-text meta">{{ store.defaultAddress ? store.defaultAddress.region : '未设置' }}</small><UiIcon name="chevron-right" :size="15" /></view><view class="package-entry" @click="openPackages"><UiIcon name="store" :size="17" /><text>到店套餐</text><small class="meta-text meta">门店自提 · 到店核销</small><UiIcon name="chevron-right" :size="15" /></view></view>
        <button class="logout-button logout-danger" @click="logout">退出登录</button>
      </view>

      <view v-if="store.cart.length && activeTab !== 'cart'" class="cart-bar" @click="activeTab = 'cart'"><view class="cart-bar-icon"><UiIcon name="shopping-cart" :size="19" /><small class="meta">{{ store.cartCount }}</small></view><view class="cart-bar-total"><text>购物车合计</text><strong class="val">¥{{ store.cartTotal.toFixed(2) }}</strong></view><button @click.stop="activeTab = 'cart'">去购物车</button></view>
      </template>
      <view v-if="!productView" class="bottom-tabs">
        <view class="tab-item" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'"><view class="tab-icon"><UiIcon name="house" :size="20" /></view><text>首页</text></view>
        <view class="tab-item" :class="{ active: activeTab === 'category' }" @click="activeTab = 'category'"><view class="tab-icon"><UiIcon name="layout-dashboard" :size="20" /></view><text>分类</text></view>
        <view class="tab-item" :class="{ active: activeTab === 'cart' }" @click="activeTab = 'cart'"><view class="tab-icon tab-icon-wrap"><UiIcon name="shopping-cart" :size="20" /><small v-if="store.cartCount" class="meta">{{ store.cartCount }}</small></view><text>购物车</text></view>
        <view class="tab-item" :class="{ active: activeTab === 'me' }" @click="activeTab = 'me'; meSection = 'main'"><view class="tab-icon"><UiIcon name="user-round" :size="20" /></view><text>我的</text></view>
      </view>
    </template>

    <view v-if="sheet" class="sheet-mask" @click.self="sheet = null"><view class="sheet">
      <view class="sheet-head"><text>{{ sheet === 'detail' ? '选择规格' : sheet === 'cart' ? '购物车结算' : sheet === 'checkout' ? '确认订单' : sheet === 'address' ? '收货地址' : sheet === 'logistics' ? '物流详情' : sheet === 'after-sale' ? '申请售后' : '到店套餐' }}</text><button aria-label="关闭" @click="sheet = null"><UiIcon name="x" :size="16" /></button></view>
      <scroll-view class="sheet-scroll" scroll-y>
      <view v-if="sheet === 'detail' && selectedProduct && selectedSku" class="detail-content product-detail" data-visual-state="user-detail">
        <view class="sku-sum">
          <BusinessImage :src="selectedProduct.image" mode="aspectFill" />
          <view>
            <text class="sku-sum-name">{{ selectedProduct.name }}</text>
            <text class="sku-sum-price">¥{{ selectedPrice.toFixed(2) }}</text>
            <text class="sku-sum-meta">库存 {{ selectedSku.stock }} · 已选：{{ selectedSku.name }}</text>
          </view>
        </view>
        <text class="sku-label">选择规格</text>
        <view class="sku-list">
          <view v-for="sku in selectedProduct.skus" :key="sku.id" class="sku-option" :class="{ active: selectedSkuId === sku.id }" @click="selectSku(sku.id)">
            <text>{{ sku.name }}</text>
            <small class="meta">¥{{ store.priceForSku(sku).toFixed(2) }} · 库存 {{ sku.stock }}</small>
          </view>
        </view>
        <view class="qty-row">
          <view class="qty-copy"><text>购买数量</text><small class="meta">起订 {{ minimumOrderQuantity(selectedSku) }} 件 · 当前库存 {{ selectedSku.stock }}</small></view>
          <view class="stepper"><button @click="changeSelectedQty(-1)">−</button><text>{{ selectedQty }}</text><button @click="changeSelectedQty(1)">+</button></view>
        </view>
        <view class="pv-sum">当前小计<strong class="val">¥{{ selectedSubtotal.toFixed(2) }}</strong></view>
      </view>
      <view v-else-if="sheet === 'cart'" class="cart-content cart-sheet-list" data-visual-state="user-cart">
        <view v-if="!store.cart.length" class="empty-block compact pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="24" /></view><text>购物车为空</text></view>
        <template v-else>
          <view class="cart-category-tabs cart-channel-segment"><button :class="{ active: cartDeliveryMode === 'pickup' }" @click="cartDeliveryMode = 'pickup'">到店自提 · {{ cartCategoryCount('pickup') }} 件</button><button :class="{ active: cartDeliveryMode === 'courier' }" @click="cartDeliveryMode = 'courier'">快递直发 · {{ cartCategoryCount('courier') }} 件</button></view>
          <view class="cart-group-card">
            <button class="cart-select-all" @click="toggleAllCartLines"><span class="cart-check" :class="{ checked: cartCategoryAllSelected }"><UiIcon v-if="cartCategoryAllSelected" name="check" :size="12" /></span><text>{{ cartDeliveryMode === 'courier' ? '快递商品' : '普通商品' }} · {{ cartCategoryItems.length }} 款</text><small class="meta">{{ cartCategoryAllSelected ? '取消全选' : '全选' }}</small></button>
            <view v-if="!cartCategoryItems.length" class="empty cart-category-empty"><view class="pc-state-icon"><UiIcon :name="cartDeliveryMode === 'courier' ? 'truck' : 'store'" :size="25" /></view><text>{{ cartDeliveryMode === 'courier' ? '暂无快递直发商品' : '暂无到店自提商品' }}</text><small class="meta">{{ cartDeliveryMode === 'courier' ? '支持快递的商品会显示在这里' : '普通商品请到农家乐自提' }}</small></view>
            <view v-for="line in cartCategoryItems" :key="line.productId + line.skuId" class="cart-line" :class="{ unavailable: line.unavailable }">
              <button class="cart-line-check" :aria-label="selectedCartLineKeys.has(cartLineKey(line)) ? `取消选择${line.name}` : `选择${line.name}`" @click="toggleCartLine(line)"><span class="cart-check" :class="{ checked: selectedCartLineKeys.has(cartLineKey(line)) }"><UiIcon v-if="selectedCartLineKeys.has(cartLineKey(line))" name="check" :size="12" /></span></button>
              <BusinessImage :src="line.image" mode="aspectFill" />
              <view class="cart-line-main">
                <text>{{ line.name }}</text>
                <small class="meta-text meta">{{ line.skuName }} · <span class="cart-fulfillment-tag" :class="cartLineDeliveryMode(line)">{{ cartLineDeliveryMode(line) === 'courier' ? '快递直发' : '到店自提' }}</span></small>
                <small v-if="line.unavailable" class="stock-warning meta">库存不足或购买数量未达要求</small>
                <view class="cart-line-foot"><strong class="strong-text val">¥{{ line.unitPrice.toFixed(2) }}</strong><view class="stepper"><button @click="changeLine(line.productId, line.skuId, -1)">−</button><text>{{ line.quantity }}</text><button @click="changeLine(line.productId, line.skuId, 1)">+</button></view></view>
              </view>
              <button class="cart-remove" @click="store.removeFromCart(line.productId, line.skuId)">删除</button>
            </view>
          </view>
          <text class="cart-hint">到店自提满 ¥99 免配送费 · 快递直发按重量计费</text>
          <text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text>
        </template>
      </view>
      <view v-else-if="sheet === 'checkout'" class="checkout-content" data-visual-state="user-checkout">
        <view v-if="!store.defaultAddress" class="warnrow" @click="openAddressManager(true)">
          <UiIcon name="map-pin" :size="20" />
          <view><text>请选择收货地址</text><small class="meta">至少设置一条地址才能提交订单</small></view>
          <text class="warnrow-act">去新增</text>
        </view>
        <view v-else class="address-select" @click="openAddressManager(true)"><view><text>{{ store.defaultAddress.receiver }} {{ store.defaultAddress.phone }}</text><small class="meta-text meta">{{ store.defaultAddress.region }} {{ store.defaultAddress.detail }}</small></view><UiIcon name="chevron-right" :size="17" /></view>
        <view class="payrow"><UiIcon name="credit-card" :size="20" /><view><text>微信支付</text><small class="meta">当前端仅支持微信支付</small></view><text class="payrow-sel">已选择</text></view>
        <text class="sku-label">已选商品</text>
        <view class="checkout-items"><view v-for="line in checkoutItems" :key="line.productId + line.skuId" class="order-item"><BusinessImage :src="line.image" mode="aspectFill" /><view><text>{{ line.name }}</text><small class="meta-text meta">{{ line.skuName }} × {{ line.quantity }}</small></view><strong class="strong-text val">¥{{ (line.unitPrice * line.quantity).toFixed(2) }}</strong></view></view>
        <view class="kv">
          <view class="kvrow"><text>商品金额</text><text>¥{{ checkoutTotal.toFixed(2) }}</text></view>
          <view class="kvrow"><text>快递配送</text><text>¥0.00</text></view>
          <view class="kvrow kvrow-total"><text>应付金额</text><strong class="val">¥{{ checkoutTotal.toFixed(2) }}</strong></view>
        </view>
      </view>
      <view v-else-if="sheet === 'address'" class="address-content" data-visual-state="user-address"><view v-if="!addressEditing" class="address-list"><view v-if="!store.addresses.length" class="empty-sheet"><view class="pc-state-icon"><UiIcon name="map-pin" :size="28" /></view><text>还没有收货地址</text><small class="meta">新增地址后即可提交订单<br>产地好物将快递直发到家</small></view><view v-for="address in store.addresses" :key="address.id" class="address-row" @click="chooseAddress(address.id)"><view><text>{{ address.receiver }} {{ address.phone }}</text><small class="meta-text meta">{{ address.region }} {{ address.detail }}</small></view><view class="address-actions"><text v-if="address.isDefault" class="default-label" data-typography-compact>默认</text><button class="outline-small" @click.stop="editAddressFromContext(address)">编辑</button><button class="outline-small" @click.stop="removeAddress(address.id)">删除</button></view></view></view><view v-else class="address-form"><input v-model="addressDraft.receiver" placeholder="收货人姓名" /><input v-model="addressDraft.phone" type="number" placeholder="手机号码" /><input v-model="addressDraft.region" placeholder="所在地区" /><input v-model="addressDraft.detail" placeholder="详细地址" /><view class="default-line" @click="toggleDefault"><text>设为默认地址</text><view class="toggle" :class="{ on: addressDraft.isDefault }"><view></view></view></view></view></view>
      <view v-else-if="sheet === 'logistics' && selectedSubOrder" class="logistics-content" data-visual-state="user-logistics">
        <view class="ship-head">
          <BusinessImage :src="selectedSubOrder.items[0]?.image" mode="aspectFill" />
          <view><text>{{ selectedSubOrder.items[0]?.name || selectedSubOrder.supplierName }} × {{ selectedSubOrder.items[0]?.quantity || 1 }}</text><small class="meta-text meta">{{ selectedSubOrder.courier || '快递配送' }} · {{ subStatusLabel(selectedSubOrder.status) }}</small></view>
          <view class="ship-sup"><text>{{ selectedSubOrder.supplierName }}</text><small class="meta">快递配送</small></view>
        </view>
        <view class="kv">
          <view class="kvrow"><text>承运快递</text><text>{{ selectedSubOrder.courier || '快递配送' }}</text></view>
          <view class="kvrow"><text>运单号</text><text>{{ selectedSubOrder.trackingNo || '暂无运单号' }}</text></view>
        </view>
        <view v-if="!selectedSubOrder.logistics.length" class="empty-block compact pc-empty"><view class="pc-state-icon"><UiIcon name="truck" :size="24" /></view><text>暂无物流信息</text></view>
        <view v-else class="steps2">
          <view v-for="(event, index) in selectedSubOrder.logistics" :key="event.time + event.title" class="step" :class="{ on: index === 0 }"><text>{{ event.title }}</text><small class="meta">{{ formatDate(event.time) }} · {{ event.detail }}</small></view>
        </view>
        <view class="notecard"><UiIcon name="headset" :size="14" />每个供应商独立发货，物流信息以子订单为单位更新</view>
      </view>
      <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="after-sale-content" data-visual-state="user-after-sale">
        <view class="after-sale-order"><text>{{ afterSaleTarget.sub.supplierName }}</text><small class="meta-text meta">申请售后：{{ afterSaleTarget.sub.items[0]?.name || afterSaleTarget.sub.supplierName }}</small></view>
        <view class="after-sale-reason"><text>售后原因</text><view class="after-sale-chips"><button v-for="reason in ['运输破损', '质量问题', '少发漏发', '七天无理由', '其他']" :key="reason" :class="{ active: afterSaleReason === reason }" @click="afterSaleReason = reason">{{ reason }}</button></view></view>
        <view class="after-sale-evidence"><text>上传凭证（1-6 张，可选）</text><ImageUploader v-model="afterSaleEvidence" multiple :max-count="6" purpose="after-sale" profile="license" /></view>
        <text class="after-sale-tip">提交后客服将结合凭证审核</text>
      </view>
      <view v-else-if="sheet === 'package'" class="package-sheet" data-visual-state="user-package">
        <view v-if="!packageCount" class="empty-sheet"><view class="pc-state-icon"><UiIcon name="store" :size="28" /></view><text>当前暂无到店套餐</text><small class="meta">门店在订货端上架套餐后<br>可在此下单到店自提核销</small><button class="outline-btn" @click="sheet = null"><UiIcon name="house" :size="15" />返回商城逛逛</button></view>
        <view v-for="group in packageGroups" :key="group.farmId" class="package-group">
          <text class="sku-label">{{ group.farmName }}</text>
          <view v-for="item in group.packages" :key="item.id" class="package-row">
            <view><text>{{ item.name }}</text><small class="meta-text meta">{{ item.skus.filter((sku) => canStartOrder(sku)).length }} 个可售规格 · 到店自提</small><small v-if="!item.skus.some((sku) => canStartOrder(sku))" class="stock-warning meta">库存不足或购买数量未达要求</small></view>
            <view class="package-actions"><strong class="strong-text val">¥{{ item.price.toFixed(2) }}</strong><button class="outline-btn package-buy-btn" :disabled="!item.skus.some((sku) => canStartOrder(sku))" @click="buyPackage(item)">立即购买</button></view>
          </view>
        </view>
      </view>
      </scroll-view>
      <view v-if="sheet === 'detail' && selectedProduct && selectedSku" class="product-detail-actions sheet-foot"><button class="primary-btn" :disabled="!canStartOrder(selectedSku)" @click="addSelectedToCart"><UiIcon name="shopping-cart" :size="16" />加入购物车</button></view>
      <view v-else-if="sheet === 'cart' && store.cart.length" class="sheet-foot cart-sheet-foot"><view class="sheet-total"><text>{{ cartDeliveryMode === 'courier' ? '快递直发' : '到店自提' }} · 已选 {{ selectedCartCount }} 件</text><strong class="strong-text val">¥{{ selectedCartTotal.toFixed(2) }}</strong></view><button class="primary-btn" :disabled="!selectedCartItems.length || cartCategoryHasUnavailable" @click="openCheckout">去结算</button></view>
      <view v-else-if="sheet === 'checkout'" class="sheet-foot"><button class="primary-btn" :disabled="store.cartHasUnavailable" @click="submitOrder">提交订单</button></view>
      <view v-else-if="sheet === 'address'" class="sheet-foot"><button v-if="!addressEditing" class="primary-btn" @click="editAddressFromContext()"><UiIcon name="plus" :size="16" />新增地址</button><button v-else class="primary-btn" @click="saveAddress">保存地址</button></view>
      <view v-else-if="sheet === 'logistics' && selectedSubOrder" class="sheet-foot"><button class="outline-btn" @click="copyTrackingNo">复制运单号</button></view>
      <view v-else-if="sheet === 'after-sale' && afterSaleTarget" class="sheet-foot"><button class="primary-btn" @click="confirmAfterSale">提交售后申请</button></view>
    </view></view>
  </view>
</template>

<style lang="scss">
.app-shell {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  padding-bottom: 0;
  box-sizing: border-box;
  background: var(--mobile-bg);
  color: var(--mobile-text);
}

.c-mall,
.page-content {
  min-width: 0;
  padding-bottom: calc(var(--mobile-tab-height) + 28px + var(--mobile-bottom-safe));
}

.app-shell.has-cart-bar .c-mall,
.app-shell.has-cart-bar .page-content {
  padding-bottom: calc(var(--mobile-tab-height) + var(--mobile-action-bar-height) + 28px + var(--mobile-bottom-safe));
}

.loading-state,
.auth-page { min-height: 100vh; }

.loading-state {
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--mobile-muted);
  font-size: 14px;
}

.auth-page {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--mobile-login-grad);
}

.auth-deco {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.auth-deco1 {
  top: -90px;
  right: -110px;
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, rgba(var(--color-on-brand-rgb), 0.12), transparent 68%);
}
.auth-deco2 {
  top: 220px;
  left: -120px;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(var(--color-on-brand-rgb), 0.08), transparent 68%);
}

.auth-brand {
  position: relative;
  padding: calc(150px + env(safe-area-inset-top)) 24px 0;
  text-align: center;
}
.auth-mark {
  display: grid;
  width: 66px;
  height: 66px;
  margin: 0 auto 16px;
  place-items: center;
  border: 1px solid rgba(var(--color-on-brand-rgb), 0.32);
  border-radius: 18px;
  background: rgba(var(--color-on-brand-rgb), 0.18);
  color: var(--color-on-brand);
}
.auth-brand-name { display: block; color: var(--color-on-brand); font-size: 24px; font-weight: 800; letter-spacing: 1px; }
.auth-brand-sub { display: block; margin-top: 10px; color: rgba(var(--color-on-brand-rgb), 0.85); font-size: 13px; }

.auth-card {
  position: relative;
  margin-top: auto;
  padding: 30px 24px 34px;
  border-radius: var(--radius-user-login) var(--radius-user-login) 0 0;
  background: var(--mobile-surface);
  box-shadow: 0 -18px 50px rgba(var(--color-user-brand-deep-rgb), 0.25);
  text-align: center;
}
.auth-wxbadge {
  display: grid;
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  place-items: center;
  border-radius: 50%;
  background: var(--mobile-wx-soft);
  color: var(--mobile-wx);
}
.auth-btn {
  display: flex;
  width: 100%;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  border: 0;
  border-radius: var(--mobile-radius-pill);
  background: var(--mobile-hero-grad);
  box-shadow: var(--mobile-shadow-button);
  color: var(--color-on-brand);
  font-size: 15.5px;
  font-weight: 800;
}
.auth-tip { display: block; margin-top: 16px; color: var(--mobile-muted); font-size: 12px; }

.mall-header,
.page-heading {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: calc(12px + env(safe-area-inset-top)) 16px 28px;
}

.page-heading { display: block; }
.theme-head {
  background: var(--mobile-hero-grad);
  color: var(--color-on-brand);
}
.theme-head::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 22px;
  border-radius: 22px 22px 0 0;
  background: var(--mobile-bg);
}
.theme-head .page-sub,
.theme-head .eyebrow { color: rgba(var(--color-on-brand-rgb), 0.85); }
.eyebrow { display: block; font-size: 12px; font-weight: 800; letter-spacing: 2.5px; }
.mall-title,
.page-title { display: block; margin-top: 3px; font-size: 21px; font-weight: 800; line-height: 1.25; }
.page-sub { display: block; margin-top: 4px; font-size: 12px; }

.role-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: 32px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(var(--color-on-brand-rgb), 0.28);
  border-radius: 16px;
  background: rgba(var(--color-on-brand-rgb), 0.16);
  color: var(--color-on-brand);
  font-size: 12px;
  font-weight: 700;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  margin: 12px 16px 0;
  padding: 0 14px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-pill);
  background: var(--mobile-surface);
  color: var(--mobile-muted);
  box-shadow: 0 1px 2px rgba(var(--color-user-brand-deep-rgb), 0.04);
}
.search-input { min-width: 0; flex: 1; height: 100%; color: var(--mobile-text); font-size: 13px; }

.package-banner {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  gap: 12px;
  margin: 12px 16px 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--mobile-hero-grad);
  color: var(--color-on-brand);
}
.package-banner::after {
  content: "";
  position: absolute;
  top: -70px;
  right: -50px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--color-on-brand-rgb), 0.14), transparent 70%);
}
.package-banner > view:not(.banner-play) { position: relative; z-index: 1; min-width: 0; flex: 1; }
.package-banner-mark { position: relative; z-index: 1; display: grid; width: 42px; height: 42px; flex: none; place-items: center; border-radius: 50%; background: rgba(var(--color-on-brand-rgb), 0.20); }
.banner-kicker,
.banner-title,
.banner-sub { display: block; }
.banner-kicker { color: rgba(var(--color-on-brand-rgb), 0.75); font-size: 12px; letter-spacing: 1px; }
.banner-title { margin-top: 3px; font-size: 16.5px; font-weight: 800; }
.banner-sub { margin-top: 3px; color: rgba(var(--color-on-brand-rgb), 0.85); font-size: 12px; }
.banner-play {
  position: relative;
  z-index: 1;
  display: grid;
  width: 42px;
  height: 42px;
  flex: none;
  place-items: center;
  border: 1px solid rgba(var(--color-on-brand-rgb), 0.32);
  border-radius: 50%;
  background: rgba(var(--color-on-brand-rgb), 0.20);
  color: var(--color-on-brand);
}

.section-line {
  display: flex;
  align-items: baseline;
  margin: 16px 16px 10px;
  font-size: 15.5px;
  font-weight: 800;
}
.section-line .meta-text { margin-left: auto; color: var(--mobile-muted); font-size: 12px; font-weight: 400; }

.waterfall-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: start;
  padding: 0 16px;
}

.product-card {
  overflow: hidden;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
  box-shadow: 0 1px 2px rgba(var(--color-user-brand-deep-rgb), 0.05);
}
.product-image-wrap { position: relative; }
.product-image { display: block; width: 100%; aspect-ratio: 1 / 1; background: var(--mobile-surface-subtle); object-fit: cover; }
.product-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 9px 10px 11px;
}
.tag-row,
.pv-tags { display: flex; flex-wrap: wrap; gap: 4px; overflow: hidden; }
.tag {
  display: inline-flex;
  height: 20px;
  align-items: center;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.product-name {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 6px;
  font-size: 13.5px;
  font-weight: 800;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.supplier-name,
.product-meta {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--mobile-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-foot { display: flex; min-width: 0; align-items: center; margin-top: 8px; }
.product-price,
.pv-meta .val,
.sku-sum-price,
.commission-row .strong-text,
.cart-checkout .val { color: var(--mobile-price); font-variant-numeric: tabular-nums; }
.product-price { flex: 1; font-size: 17px; font-weight: 800; }
.product-price-box { display: inline-flex; min-width: 0; flex: 1; align-items: baseline; gap: 4px; }
.product-original { color: var(--mobile-muted); font-size: 12px; }

.product-action {
  display: inline-flex;
  width: 30px;
  min-width: 30px;
  height: 30px;
  min-height: 44px;
  flex: none;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--mobile-hero-grad);
  box-shadow: var(--mobile-shadow-button);
  color: var(--color-on-brand);
}
.product-action:disabled { opacity: .45; transform: none; }
.product-action .ui-icon { filter: brightness(0) invert(1); }

.category-grid {
  display: flex;
  gap: 12px 2px;
  overflow-x: auto;
  padding: 12px 16px 0;
  scrollbar-width: none;
}
.category-grid::-webkit-scrollbar { display: none; }
.category-grid .category-grid-item {
  min-width: 0;
  flex: none;
  padding: 0;
  background: transparent;
}
.category-grid .category-grid-img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--mobile-surface-subtle);
}
.category-grid .category-grid-label {
  height: calc(12px * 1.25 * 2);
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  color: var(--mobile-muted);
  word-break: keep-all;
}
.category-grid .category-grid-item.active .category-grid-img {
  box-shadow: 0 0 0 2px var(--mobile-brand);
}
.category-grid .category-grid-item.active .category-grid-label {
  color: var(--mobile-brand);
  font-weight: 800;
}

.empty-block {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 24px;
  color: var(--mobile-muted);
  font-size: 13px;
  text-align: center;
}
.empty-block.large { min-height: 160px; flex-direction: column; }
.empty-block.compact { min-height: 96px; flex-direction: column; }
.empty-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 0 10px;
  text-align: center;
}
.empty-sheet text { font-size: 14.5px; font-weight: 800; color: var(--mobile-text); }
.empty-sheet .meta { color: var(--mobile-muted); font-size: 12px; line-height: 1.7; }

.order-card {
  margin: 10px 16px 0;
  padding: 13px 14px;
  border: 1px solid var(--mobile-border);
  border-radius: 16px;
  background: var(--mobile-surface);
  box-shadow: 0 1px 2px rgba(var(--color-user-brand-deep-rgb), 0.04);
}
.order-head,
.sub-head,
.order-bottom,
.sheet-total { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }
.order-id-line { display: flex; min-width: 0; align-items: center; gap: 6px; }
.order-id { display: block; min-width: 0; word-break: break-all; font-size: 12.5px; font-weight: 800; }
.order-time { display: block; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; }
.order-status { flex: none; color: var(--mobile-warning); font-size: 12.5px; font-weight: 800; }
.order-status.is-done { color: var(--color-success); }
.order-status.muted { color: var(--mobile-muted); }
.demo-badge,
.default-label { flex: none; padding: 0 6px; border-radius: 5px; background: var(--mobile-surface-subtle); color: var(--mobile-muted); font-size: 12px; font-weight: 700; }
.sub-order { margin-top: 11px; padding: 11px 12px; border-radius: 12px; background: var(--mobile-surface-subtle); }
.sub-head { font-size: 12.5px; font-weight: 800; }
.sub-head text:last-child { margin-left: auto; color: var(--mobile-muted); font-size: 12px; font-weight: 700; }

.order-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  margin-top: 9px;
}
.order-item .business-image { width: 46px; height: 46px; flex: none; border-radius: 9px; background: var(--mobile-surface); object-fit: cover; }
.order-item > view:not(.voucher-thumb) { min-width: 0; flex: 1; }
.order-item text,
.cart-line-main > text { display: block; color: var(--mobile-text); font-size: 12.5px; font-weight: 800; }
.order-item .meta-text,
.cart-line-main .meta-text { display: block; margin-top: 2px; color: var(--mobile-muted); font-size: 12px; }
.order-item > .strong-text { flex: none; color: var(--mobile-price); font-size: 13px; font-weight: 800; }
.tracking-row { display: flex; min-width: 0; align-items: center; gap: 6px; margin-top: 9px; color: var(--mobile-muted); font-size: 12px; }
.tracking-code { padding: 2px 6px; border: 1px solid var(--mobile-border); border-radius: 6px; background: var(--mobile-surface); color: var(--mobile-text); font-size: 12px; font-weight: 700; }
.order-bottom { margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--mobile-border); color: var(--mobile-muted); font-size: 12px; }
.order-bottom .strong-text { color: var(--mobile-price); font-size: 14px; font-weight: 800; }
.sub-actions,
.order-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.waiting-copy { min-width: 120px; flex: 1; margin-right: auto; color: var(--mobile-muted); font-size: 12px; }
.payment-confirmation { margin-top: 10px; color: var(--mobile-warning); font-size: 12px; font-weight: 700; }

.vrow { display: flex; align-items: center; gap: 9px; margin-top: 9px; }
.vrow-main { min-width: 0; flex: 1; }
.vrow-main text { display: block; font-size: 12.5px; font-weight: 800; }
.voucher-thumb {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 11px;
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand);
}

.primary-small,
.outline-small,
.outline-btn {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
}
.primary-small {
  border: 0;
  background: var(--mobile-hero-grad);
  box-shadow: var(--mobile-shadow-button);
  color: var(--color-on-brand);
}
.outline-small,
.outline-btn {
  border: 1.5px solid var(--mobile-border);
  background: var(--mobile-surface);
  color: var(--mobile-muted);
}

.primary-btn {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 16px;
  border: 0;
  border-radius: var(--mobile-radius-pill);
  background: var(--mobile-hero-grad);
  box-shadow: var(--mobile-shadow-button);
  color: var(--color-on-brand);
  font-size: 14.5px;
  font-weight: 800;
}

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  margin: 10px 16px 0;
  padding: 4px;
  border-radius: 12px;
  background: var(--mobile-surface-subtle);
}
.role-switch button {
  height: 36px;
  min-height: 44px;
  border-radius: 9px;
  color: var(--mobile-muted);
  font-size: 13px;
  font-weight: 700;
}
.role-switch button.active {
  background: var(--mobile-surface);
  box-shadow: 0 1px 3px rgba(var(--color-user-brand-deep-rgb), 0.10);
  color: var(--mobile-brand);
  font-weight: 800;
}

.profile-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 16px 0;
  padding: 14px;
  border: 1px solid var(--mobile-border);
  border-radius: 16px;
  background: var(--mobile-surface);
}
.avatar {
  display: grid;
  width: 50px;
  height: 50px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--mobile-hero-grad);
  color: var(--color-on-brand);
  font-size: 19px;
  font-weight: 800;
}
.profile-main { min-width: 0; flex: 1; }
.profile-role { display: block; font-size: 15.5px; font-weight: 800; }
.profile-id { display: block; overflow: hidden; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.profile-state {
  display: flex;
  height: 24px;
  align-items: center;
  padding: 0 10px;
  border-radius: 12px;
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-size: 12px;
  font-weight: 800;
}

.operations-hero,
.operations-grid,
.order-entry,
.normal-summary,
.referral-panel,
.settings-list { margin: 10px 16px 0; border: 1px solid var(--mobile-border); border-radius: 16px; background: var(--mobile-surface); }
.operations-hero { padding: 14px; }
.operations-hero > text { display: block; margin-bottom: 12px; font-size: 13.5px; font-weight: 800; }
.operations-hero > view { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 8px; }
.operations-hero > view > view { min-width: 0; padding: 11px 12px; border-radius: 12px; background: var(--mobile-surface-subtle); }
.operations-hero .val,
.operations-hero .meta { display: block; }
.operations-hero .val { color: var(--mobile-price); font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
.operations-hero .meta { margin-top: 3px; color: var(--mobile-muted); font-size: 12px; }

.operations-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 0; border: 0; background: transparent; }
.operations-grid .pc-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px 10px;
  border: 1px solid var(--mobile-border);
  border-radius: 14px;
  background: var(--mobile-surface);
  color: var(--mobile-text);
  font-size: 12px;
  font-weight: 700;
}
.operations-grid .pc-tile-icon { width: 40px; height: 40px; border-radius: 13px; }
.operations-grid .pc-tile-label {
  display: -webkit-box;
  overflow: hidden;
  max-width: 100%;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: normal;
}
.pc-tile-badge { background: var(--mobile-badge); }
.pc-tile--coral .pc-tile-icon { background: var(--color-danger-soft); color: var(--color-user-danger); }
.pc-tile--blue .pc-tile-icon { background: var(--color-info-soft); color: var(--color-info-dark); }
.pc-tile--green .pc-tile-icon { background: var(--color-user-brand-soft); color: var(--color-user-brand); }
.pc-tile--amber .pc-tile-icon { background: var(--color-gold-soft); color: var(--color-gold-dark); }

.order-entry,
.normal-summary,
.referral-panel { display: flex; min-height: 64px; align-items: center; gap: 10px; padding: 13px 14px; border-radius: 14px; }
.order-entry { justify-content: space-between; }
.order-entry text,
.normal-summary text,
.referral-panel text { display: block; font-size: 13.5px; font-weight: 800; }
.order-entry .meta,
.normal-summary .meta,
.referral-panel .meta-text { display: block; overflow: hidden; margin-top: 2px; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.commission-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 16px 0;
  padding: 11px 14px;
  border: 1px solid var(--mobile-border);
  border-radius: 13px;
  background: var(--mobile-surface);
}
.commission-row > view { min-width: 0; flex: 1; }
.commission-row text,
.commission-row .meta-text { display: block; }
.commission-row text { font-size: 13px; font-weight: 800; }
.commission-row .meta-text { margin-top: 2px; color: var(--mobile-muted); font-size: 12px; }
.commission-row .strong-text { flex: none; color: var(--color-user-brand); font-size: 15px; }
.commission-row .strong-text.reversed { color: var(--mobile-muted); }

.settings-list { overflow: hidden; border-radius: 14px; }
.settings-list > view { display: flex; min-height: 56px; align-items: center; gap: 10px; padding: 13px 14px; border-bottom: 1px solid var(--mobile-line-light); }
.settings-list > view:last-child { border-bottom: 0; }
.settings-list text { flex: none; font-size: 13.5px; font-weight: 800; }
.settings-list .meta-text { min-width: 0; flex: 1; overflow: hidden; color: var(--mobile-muted); font-size: 12px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }

.logout-button {
  width: calc(100% - 32px);
  min-height: 46px;
  margin: 14px 16px 16px;
  border: 1.5px solid var(--color-danger-soft);
  border-radius: 23px;
  background: var(--color-danger-soft);
  color: var(--color-user-danger);
  font-size: 14px;
  font-weight: 800;
}

.cart-page { display: flex; flex-direction: column; min-height: 100vh; box-sizing: border-box; }
.page-content.cart-page.cart-page--has-checkout {
  padding-bottom: calc(var(--mobile-tab-height) + var(--mobile-action-bar-height) + 16px + var(--mobile-bottom-safe));
}
.cart-page-content { display: flex; min-height: 0; flex: 1; flex-direction: column; overflow-y: auto; padding: 0; }
.cart-line {
  display: flex;
  gap: 11px;
  min-width: 0;
  margin: 10px 16px 0;
  padding: 11px;
  border: 1px solid var(--mobile-border);
  border-radius: 14px;
  background: var(--mobile-surface);
}
.cart-line.unavailable { opacity: .64; }
.cart-line .business-image { width: 74px; height: 74px; flex: none; border-radius: 11px; object-fit: cover; }
.cart-line-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.cart-line-main > text { overflow: hidden; font-size: 13.5px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.cart-line-foot { display: flex; align-items: center; margin-top: auto; }
.cart-line-foot .strong-text { color: var(--mobile-price); font-size: 16px; font-weight: 800; }
.cart-remove { margin-left: auto; padding: 0; border: 0; background: transparent; color: var(--mobile-muted); font-size: 12px; }

.cart-sheet-list { padding-top: 6px; }
.cart-category-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0 16px 12px;
  padding: 4px;
  border-radius: 12px;
  background: var(--mobile-surface-subtle);
}
.cart-category-tabs button {
  height: 36px;
  min-height: 44px;
  border-radius: 9px;
  color: var(--mobile-muted);
  font-size: 13px;
  font-weight: 700;
}
.cart-category-tabs button.active {
  background: var(--mobile-surface);
  box-shadow: 0 1px 3px rgba(var(--color-user-brand-deep-rgb), 0.10);
  color: var(--mobile-brand);
  font-weight: 800;
}
.cart-group-card {
  margin: 0 16px 10px;
  padding: 10px 12px 12px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
}
.cart-select-all {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 10px;
  padding: 0 0 10px;
  border: 0;
  border-bottom: 1px solid var(--mobile-line-light);
  border-radius: 0;
  background: transparent;
  color: var(--mobile-text);
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}
.cart-select-all text { flex: 1; }
.cart-select-all .meta { color: var(--mobile-muted); font-size: 13px; font-weight: 600; }
.cart-check {
  display: grid;
  width: 18px;
  height: 18px;
  flex: none;
  place-items: center;
  border: 1.5px solid var(--mobile-border);
  border-radius: 50%;
  background: var(--mobile-surface);
  color: var(--color-on-brand);
}
.cart-check.checked {
  border-color: var(--mobile-brand);
  background: var(--mobile-brand);
}
.cart-line-check {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
.cart-line-check .cart-check { width: 18px; height: 18px; }
.cart-fulfillment-tag {
  display: inline-flex;
  height: 17px;
  align-items: center;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-size: 12px;
  font-weight: 700;
}
.cart-fulfillment-tag.courier {
  background: var(--color-info-soft);
  color: var(--color-info-dark);
}
.cart-hint {
  display: block;
  margin: 0 16px 10px;
  color: var(--mobile-muted);
  font-size: 12px;
}
.cart-error {
  display: block;
  margin: 0 16px 10px;
  color: var(--mobile-danger);
  font-size: 12px;
  font-weight: 700;
}
.cart-category-empty {
  min-height: 120px;
  flex-direction: column;
  padding: 18px 0 8px;
}
.cart-category-empty text { margin-top: 8px; font-size: 13px; font-weight: 800; color: var(--mobile-text); }
.cart-category-empty .meta { color: var(--mobile-muted); font-size: 12px; }
.cart-sheet-foot .sheet-total { margin-bottom: 10px; }
.cart-sheet-foot .sheet-total text { display: block; color: var(--mobile-muted); font-size: 12px; }
.cart-sheet-foot .sheet-total .val { display: block; margin-top: 2px; font-size: 19px; }

.cart-heading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: var(--mobile-price);
}
.cart-heading.theme-head::after { background: var(--mobile-bg); }
.cart-heading .page-title,
.cart-heading .page-sub { color: var(--color-on-brand); }
.cart-heading .page-sub { opacity: .85; }
.cart-page-tabs { margin: 12px 16px 0; }
.cart-page-card {
  margin: 12px 16px 16px;
  padding: 12px 14px 14px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
}
.cart-page-line { margin: 0 0 10px; }
.cart-page-line:last-child { margin-bottom: 0; }
.cart-line-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.cart-line-head text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cart-stock {
  flex: none;
  margin-left: 8px;
  color: var(--mobile-price);
  font-size: 12px;
  font-weight: 700;
}
.cart-page-checkout {
  gap: 8px;
  padding: 10px 12px;
}
.cart-page-checkout .cart-select-all {
  width: auto;
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  gap: 6px;
}
.cart-page-checkout .cart-select-all text { flex: none; font-size: 13px; color: var(--mobile-muted); }
.cart-checkout-total {
  display: flex;
  align-items: baseline;
  flex: 1;
  min-width: 0;
}
.cart-checkout-total text { color: var(--mobile-muted); font-size: 12px; }
.cart-checkout-total .val { color: var(--mobile-price); font-size: 17px; font-weight: 800; }
.cart-delete-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--mobile-border);
  border-radius: 18px;
  background: var(--mobile-surface);
  color: var(--mobile-muted);
  font-size: 13px;
  font-weight: 700;
}
.cart-page-checkout .primary-btn {
  min-height: 36px;
  margin: 0;
  padding: 0 16px;
  border-radius: 18px;
  background: var(--mobile-price);
  box-shadow: 0 8px 16px -8px rgba(var(--color-user-price-rgb), 0.45);
  color: var(--color-on-brand);
  font-size: 13px;
  font-weight: 800;
}
.cart-page-checkout .primary-btn:disabled { opacity: .5; }

.stepper {
  display: flex;
  overflow: hidden;
  align-items: center;
  margin-left: auto;
  border: 1px solid var(--mobile-border);
  border-radius: 15px;
}
.stepper button {
  display: grid;
  width: 28px;
  height: 26px;
  min-height: 44px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--mobile-muted);
  font-size: 14px;
  font-weight: 700;
}
.stepper text { min-width: 28px; text-align: center; font-size: 12.5px; font-weight: 800; }

.cart-checkout {
  position: fixed;
  z-index: 8;
  right: 12px;
  bottom: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom) + 10px);
  left: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 406px;
  margin: 0 auto;
  padding: 10px 12px;
  border: 1px solid var(--mobile-border);
  border-radius: 18px;
  background: var(--mobile-surface);
  box-shadow: 0 14px 34px -14px rgba(var(--color-user-brand-deep-rgb), 0.35);
}
.cart-checkout text { color: var(--mobile-muted); font-size: 12px; }
.cart-checkout .val { margin-left: 4px; font-size: 17px; font-weight: 800; }
.cart-checkout button {
  width: auto;
  min-height: 38px;
  margin: 0 0 0 auto;
  padding: 0 20px;
  border-radius: 19px;
  font-size: 13.5px;
}

.cart-bar {
  position: fixed;
  z-index: 8;
  right: 12px;
  bottom: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom) + 10px);
  left: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 406px;
  margin: 0 auto;
  padding: 9px 10px;
  box-sizing: border-box;
  border-radius: 24px;
  background: var(--mobile-brand-deep);
  box-shadow: var(--mobile-shadow-cart);
  color: var(--color-on-brand);
}
.cart-bar-icon {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: rgba(var(--color-on-brand-rgb), 0.18);
  color: var(--color-on-brand);
}
.cart-bar-icon .meta {
  position: absolute;
  top: -6px;
  right: -4px;
  display: grid;
  min-width: 17px;
  height: 17px;
  place-items: center;
  padding: 0 4px;
  border: 1.5px solid var(--mobile-brand-deep);
  border-radius: 9px;
  background: var(--mobile-badge);
  color: var(--color-on-brand);
  font-size: 10.5px;
  font-weight: 800;
}
.cart-bar-total { min-width: 0; flex: 1; }
.cart-bar-total text,
.cart-bar-total .val { display: block; }
.cart-bar-total text { color: rgba(var(--color-on-brand-rgb), 0.85); font-size: 12px; }
.cart-bar-total .val { font-size: 16px; font-weight: 800; color: var(--color-on-brand); }
.cart-bar > button {
  height: 36px;
  min-height: 36px;
  flex: none;
  margin: 0 0 0 auto;
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  background: var(--color-on-brand);
  color: var(--mobile-brand-deep);
  font-size: 13.5px;
  font-weight: 800;
}

.product-view { position: relative; min-height: 100vh; background: var(--mobile-bg); }
.product-view .product-detail,
.app-shell.has-cart-bar .product-view .page-content {
  padding: 0 0 calc(70px + env(safe-area-inset-bottom));
}
.gallery {
  position: relative;
  overflow: hidden;
  margin: 12px 16px 0;
  aspect-ratio: 1 / 0.82;
  border: 1px solid var(--mobile-border);
  border-radius: 18px;
}
.gallery-image { display: block; width: 100%; height: 100%; object-fit: cover; }
.gallery-dots {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  height: 20px;
  align-items: center;
  padding: 0 8px;
  border-radius: 10px;
  background: rgba(var(--color-user-brand-deep-rgb), 0.50);
  color: var(--color-on-brand);
  font-size: 12px;
  font-weight: 700;
}
.pv-name {
  display: -webkit-box;
  overflow: hidden;
  margin: 12px 16px 0;
  font-size: 17px;
  font-weight: 800;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.pv-meta { display: flex; min-width: 0; align-items: baseline; margin: 6px 16px 0; }
.pv-meta .sup { min-width: 0; overflow: hidden; color: var(--mobile-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.pv-meta .val { margin-left: auto; font-size: 20px; font-weight: 800; }
.pv-tags { margin: 9px 16px 0; gap: 6px; }
.shipnote {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 10px 16px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-size: 12px;
  font-weight: 700;
}
.product-detail-actions {
  position: fixed;
  z-index: 8;
  right: 12px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  left: 12px;
  display: flex;
  gap: 9px;
  max-width: 406px;
  margin: 0 auto;
}
.product-detail-actions .outline-btn,
.product-detail-actions .primary-btn { flex: 1; min-height: 46px; margin-top: 0; border-radius: 23px; }
.product-detail-actions.sheet-foot { position: static; display: flex; margin-top: 0; }

.heading-with-back { display: flex; align-items: center; gap: 8px; }
.page-back,
.sheet-head button,

.bottom-tabs {
  position: fixed;
  z-index: 7;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  height: calc(var(--mobile-tab-height) + env(safe-area-inset-bottom));
  padding: 7px 0 18px;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--mobile-line-light);
  box-sizing: border-box;
  background: var(--mobile-surface);
}
.tab-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--mobile-muted);
  font-size: 13px;
  font-weight: 600;
}
.tab-item.active { color: var(--mobile-brand); font-weight: 800; }
.tab-icon {
  display: grid;
  width: 42px;
  height: 26px;
  place-items: center;
  border-radius: 13px;
}
.tab-item.active .tab-icon { background: var(--mobile-brand-soft); }
.tab-icon-wrap { position: relative; }
.tab-icon-wrap > .meta {
  position: absolute;
  top: -7px;
  right: 2px;
  display: grid;
  min-width: 17px;
  height: 17px;
  place-items: center;
  padding: 0 4px;
  border: 1.5px solid var(--color-on-brand);
  border-radius: 9px;
  background: var(--mobile-badge);
  color: var(--color-on-brand);
  font-size: 10.5px;
  font-weight: 800;
}

.sheet-mask { position: fixed; z-index: 20; inset: 0; display: flex; align-items: flex-end; background: var(--color-overlay); }
.sheet {
  display: flex;
  width: 100%;
  max-width: 100%;
  max-height: var(--mobile-sheet-max-height);
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--mobile-radius-sheet) var(--mobile-radius-sheet) 0 0;
  background: var(--mobile-surface);
}
.sheet-scroll {
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  height: auto;
  max-height: calc(80vh - var(--mobile-sheet-header-height));
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.sheet-foot {
  flex: none;
  padding: 12px 16px 22px;
  border-top: 1px solid var(--mobile-line-light);
  background: var(--mobile-surface);
}
.sheet-foot .primary-btn { width: 100%; margin-top: 0; }
.sheet-foot .sheet-total { margin-top: 0; margin-bottom: 10px; }
.sheet-foot .outline-btn { width: 100%; min-height: 46px; border-radius: 23px; color: var(--mobile-text); }
.sheet-head {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: var(--mobile-sheet-header-height);
  align-items: center;
  justify-content: center;
  padding: 10px 14px 12px;
  border-bottom: 1px solid var(--mobile-line-light);
  background: var(--mobile-surface);
  font-size: 16px;
  font-weight: 800;
}
.sheet-head button {
  position: absolute;
  top: 10px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--mobile-surface-subtle);
  color: var(--mobile-muted);
}

.detail-content,
.cart-content,
.checkout-content,
.address-content,
.address-form,
.logistics-content,
.after-sale-content { padding: 14px 16px 20px; }

.sku-sum {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--mobile-line-light);
  border-radius: 14px;
  background: var(--mobile-brand-soft);
}
.sku-sum .business-image { width: 72px; height: 72px; flex: none; border-radius: 12px; object-fit: cover; }
.sku-sum-name { display: block; font-size: 14.5px; font-weight: 800; line-height: 1.35; }
.sku-sum-price { display: block; margin-top: 4px; color: var(--mobile-price); font-size: 19px; font-weight: 800; }
.sku-sum-meta { display: block; margin-top: 4px; color: var(--mobile-muted); font-size: 12px; }
.sku-label { display: block; margin: 14px 0 0; font-size: 12px; font-weight: 800; }
.sku-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.sku-option {
  padding: 10px 12px;
  border: 1.5px solid var(--mobile-border);
  border-radius: 11px;
  background: var(--mobile-surface);
  font-size: 13px;
  font-weight: 700;
}
.sku-option .meta { display: block; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; font-weight: 600; }
.sku-option.active { border-color: var(--mobile-brand); background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); }
.qty-row {
  display: flex;
  align-items: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--mobile-line-light);
}
.qty-copy { flex: 1; }
.qty-copy text { display: block; font-size: 13.5px; font-weight: 800; }
.qty-copy .meta { display: block; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; }
.pv-sum {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--mobile-line-light);
  color: var(--mobile-muted);
  font-size: 13px;
}
.pv-sum .val { margin-left: auto; color: var(--mobile-price); font-size: 18px; font-weight: 800; }
.product-detail-actions.sheet-foot { position: static; display: flex; margin-top: 0; }
.product-detail-actions.sheet-foot .primary-btn { flex: 1; min-height: 46px; }

.warnrow,
.payrow,
.address-select,
.after-sale-order {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  padding: 11px 13px;
  border-radius: 12px;
}
.warnrow { border: 1.5px dashed var(--color-user-danger); background: var(--color-danger-soft); color: var(--color-user-danger); }
.warnrow text,
.payrow text { display: block; font-size: 13.5px; font-weight: 800; }
.warnrow .meta,
.payrow .meta { display: block; margin-top: 2px; font-size: 12px; opacity: .75; }
.warnrow-act {
  margin-left: auto;
  height: 32px;
  flex: none;
  padding: 0 12px;
  border-radius: 16px;
  background: var(--color-user-danger);
  color: var(--color-on-brand);
  font-size: 12px;
  font-weight: 800;
  line-height: 32px;
}
.payrow { border: 1.5px solid var(--mobile-brand); background: var(--mobile-brand-soft); }
.payrow-sel { margin-left: auto; color: var(--mobile-brand); font-size: 12px; font-weight: 800; }
.address-select { justify-content: space-between; border: 1px solid var(--mobile-border); background: var(--mobile-surface-subtle); }
.address-select > view { min-width: 0; flex: 1; }
.address-select text,
.after-sale-order text { display: block; font-size: 13px; font-weight: 800; }
.address-select .meta-text,
.after-sale-order .meta-text { display: block; margin-top: 5px; color: var(--mobile-muted); font-size: 13px; }

.kv {
  display: grid;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--mobile-surface-subtle);
}
.kvrow { display: flex; align-items: center; font-size: 13px; }
.kvrow text:first-child { color: var(--mobile-muted); }
.kvrow text:last-child,
.kvrow .val { margin-left: auto; font-weight: 800; }
.kvrow-total { font-weight: 800; }
.kvrow-total .val { color: var(--mobile-price); font-size: 16px; }
.checkout-items { margin-top: 8px; }
.sheet-total { color: var(--mobile-muted); font-size: 12px; }
.sheet-total .strong-text { font-size: 19px; color: var(--mobile-price); }

.address-list { display: grid; gap: 9px; }
.address-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
}
.address-row text { display: block; font-size: 13px; font-weight: 800; }
.address-row .meta-text { display: block; margin-top: 5px; color: var(--mobile-muted); font-size: 12px; }
.address-actions { display: flex; max-width: 112px; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 5px; }
.address-form input {
  display: block;
  width: 100%;
  height: 44px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  box-sizing: border-box;
  background: var(--mobile-surface);
  font-size: 14px;
}
.default-line { display: flex; min-height: 44px; align-items: center; justify-content: space-between; color: var(--mobile-muted); font-size: 13px; }
.toggle { position: relative; width: 42px; height: 24px; flex: none; border-radius: var(--mobile-radius-card); background: var(--color-line); }
.toggle > view { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--color-card); }
.toggle.on { background: var(--mobile-brand); }
.toggle.on > view { transform: translateX(18px); }

.ship-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border-radius: 14px;
  background: var(--mobile-surface-subtle);
}
.ship-head .business-image { width: 56px; height: 56px; flex: none; border-radius: 11px; object-fit: cover; }
.ship-head text { display: block; font-size: 13.5px; font-weight: 800; }
.ship-head .meta { display: block; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; }
.ship-sup { margin-left: auto; text-align: right; }
.ship-sup text { font-size: 12.5px; }
.steps2 { position: relative; margin-top: 16px; padding-left: 24px; }
.steps2::before { content: ""; position: absolute; top: 8px; bottom: 14px; left: 7px; width: 2px; background: var(--mobile-border); }
.step { position: relative; padding-bottom: 18px; }
.step:last-child { padding-bottom: 0; }
.step::before {
  content: "";
  position: absolute;
  top: 4px;
  left: -22px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--mobile-surface);
  border-radius: 50%;
  background: var(--mobile-border);
}
.step.on::before { background: var(--mobile-brand); box-shadow: 0 0 0 3px var(--mobile-brand-soft); }
.step text { display: block; font-size: 13.5px; font-weight: 800; }
.step .meta { display: block; margin-top: 3px; color: var(--mobile-muted); font-size: 12px; line-height: 1.6; }
.notecard {
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 11px;
  background: var(--mobile-surface-subtle);
  color: var(--mobile-muted);
  font-size: 12px;
  line-height: 1.7;
}

.after-sale-reason,
.after-sale-evidence { margin-top: 10px; }
.after-sale-reason > text,
.after-sale-evidence > text { display: block; font-size: 13px; font-weight: 900; }
.after-sale-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.after-sale-chips button {
  min-height: 32px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid var(--mobile-border);
  border-radius: 16px;
  background: var(--mobile-surface);
  color: var(--mobile-muted);
  font-size: 13px;
}
.after-sale-chips button.active { border-color: var(--mobile-brand); background: var(--mobile-brand-soft); color: var(--mobile-brand-deep); font-weight: 800; }
.after-sale-tip { display: block; margin-top: 12px; color: var(--mobile-muted); font-size: 12px; }
.stock-warning { display: block; margin-top: 4px; color: var(--mobile-danger); font-size: 12px; }

.package-sheet .empty-sheet .outline-btn { margin-top: 22px; height: 44px; padding: 0 34px; border-radius: 22px; color: var(--mobile-text); }
.package-group { width: 100%; margin-bottom: 18px; text-align: left; }
.package-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 9px;
  padding: 10px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
}
.package-row > view:first-child { min-width: 0; flex: 1 1 100%; }
.package-row text { display: block; font-size: 13px; font-weight: 800; }
.package-row .meta-text { display: block; margin-top: 4px; color: var(--mobile-muted); font-size: 12px; }
.package-actions { display: flex; width: 100%; flex: none; align-items: center; justify-content: space-between; gap: 8px; }
.package-actions .strong-text { color: var(--mobile-price); font-size: 15px; }
.package-buy-btn { min-height: var(--mobile-control-compact); margin-left: auto; padding: 0 11px; }

/* Mobile readability contrast */
.supplier-name,.stock-text,.order-time {
  color:var(--mobile-muted);
}

/* #ifdef H5 */
@media (min-width: 431px) {
  body,
  #app { background: var(--color-user-bg); }

  .app-shell,
  .bottom-tabs,
  .sheet-mask {
    width: 100%;
    max-width: 430px;
  }

  .app-shell { margin: 0 auto; box-shadow: var(--shadow-card); }
  .bottom-tabs,
  .sheet-mask { right: auto; left: 50%; transform: translateX(-50%); }
  .cart-bar { left:50%; right:auto; width:406px; transform:translateX(-50%); }
  .cart-checkout { left: 50%; right: auto; width: 406px; transform: translateX(-50%); }
  .product-detail-actions { left:50%; right:auto; width:406px; transform:translateX(-50%); }
  .sheet { width: 100%; max-width: 430px; }
}
/* #endif */

/* #ifdef MP-WEIXIN */
.mall-header,
.page-heading,
.loading-state { padding-top: calc(12px + var(--status-bar-height)); padding-right: 96px; }
.auth-page { padding-top: calc(24px + var(--status-bar-height)); padding-right: 96px; }
.app-shell,
.bottom-tabs,
.sheet-mask,
.sheet { left: 0; right: 0; width: 100%; max-width: none; transform: none; }
/* #endif */

@media (max-width: 375px) {
  .address-row { grid-template-columns: 1fr; }
  .address-actions { max-width: none; width: 100%; justify-content: flex-start; }
  .waiting-copy { width: 100%; flex-basis: 100%; }
  .sub-actions { flex-wrap: wrap; justify-content: flex-end; }
}

</style>
