
import { cloneForView, computed, getRootValuePath, onBeforeUnmount, onMounted, reactive, ref, runMountedCallbacks, runUnmountedCallbacks, runWatchers, setRootPath, snapshotRoots, watch } from '../../native/reactive'
import type { CatalogProduct, CatalogProductSubmission, DailyDeliveryRoute, DriverAccount, Order, PlatformDictionaryState, RouteOrigin, RouteOutboundHandoverItem, RouteOutboundShortageAllocation, RouteStop, RouteWarehouseCheckInReason, ShortageItem } from '@agritainment/shared'
import { PLATFORM_DICTIONARIES_STORAGE_KEY, aggregateRouteOutboundItems, defaultProductCategoryImage, distanceMeters, productCategoryImage, readPlatformDictionaries, validatePhone } from '@agritainment/shared'
import { PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, configurePlatformProviders, createDrivingRouteOptimizationProvider, createGeocodeProviders, createId, geocodeAddress, getApiClientConfig, installKeyboardButtonSupport, money, subscribePlatformChanges, todayString } from '@agritainment/shared'


import { routeOptimizationWarningText } from '../../delivery-map'


import { deliveryDistanceKm, resolveOrderStore, seedSupplierDemoRouteOnce, storeDirectory, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../../services/repository'
import { useSupplierStore } from '../../stores/supplier'
import { createSharedRefreshRunner } from './shared-refresh'
import { buildProductCategoryOptions } from './product-categories'

const store = useSupplierStore()
const apiMode = ref('apiMode', getApiClientConfig().dataMode === 'api')
let disposeKeyboardButtons: () => void = () => undefined
let disposePlatformChanges: (() => void) | null = null
const platformChangeKeys = [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY]
const refreshSharedState = createSharedRefreshRunner(
  async () => { await store.refreshSharedState(); refreshProductCategoryLabels() },
  (error) => { store.error = error instanceof Error ? error.message : '数据加载失败' }
)
const busy = ref('busy', false)
const busyAction = ref('busyAction', '')
const toastMsg = ref('toastMsg', '')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(text: string) {
  toastMsg.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2200)
}

async function runBusy<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (busyAction.value) return
  busyAction.value = key
  try {
    return await fn()
  } finally {
    busyAction.value = ''
  }
}

// ---------- 登录（自动填充）----------
const loginRole = ref<'supplier' | 'driver'>('loginRole', 'supplier')
const loginAccount = ref('loginAccount', getApiClientConfig().dataMode === 'api' ? '' : '13787366688')
const loginPassword = ref('loginPassword', getApiClientConfig().dataMode === 'api' ? '' : '13787366688')

function switchLoginRole(role: 'supplier' | 'driver') {
  loginRole.value = role
  store.loginError = ''
  loginAccount.value = getApiClientConfig().dataMode === 'api' ? '' : role === 'supplier' ? '13787366688' : 'driver01'
  loginPassword.value = getApiClientConfig().dataMode === 'api' ? '' : role === 'supplier' ? '13787366688' : '123456'
}

async function submitLogin() {
  if (!loginAccount.value.trim() || !loginPassword.value) {
    store.loginError = '请输入账号和密码'
    return
  }
  busy.value = true
  let ok = false
  try {
    ok = getApiClientConfig().dataMode === 'api'
      ? await (loginRole.value === 'supplier'
        ? store.loginSupplierApi(loginAccount.value, loginPassword.value)
        : store.loginDriverApi(loginAccount.value, loginPassword.value))
      : loginRole.value === 'supplier'
        ? store.loginSupplier(loginAccount.value, loginPassword.value)
        : store.loginDriver(loginAccount.value, loginPassword.value)
  } finally { busy.value = false }
  if (ok) {
    toast(loginRole.value === 'supplier' ? '供应商登录成功' : `司机 ${store.auth.name} 登录成功`)
    active.value = 'orders'
    secondaryWorkspace.value = null
    if (getApiClientConfig().dataMode !== 'api') void store.ensureTodayRoutes()
  }
}

async function logout() {
  if (getApiClientConfig().dataMode === 'api') await store.logoutApi().catch(() => { toast('退出请求未送达，请重新登录前确认网络') })
  else store.logout()
  closeSheet()
}

// ---------- 底部 tab（按角色）----------
type SupplierTab = 'orders' | 'products' | 'mine'
const active = ref<SupplierTab>('active', 'orders')
const supplierTabs = [
  { key: 'orders' as const, label: '订单', icon: 'package', badge: () => store.metrics.toAcceptCount },
  { key: 'products' as const, label: '商品', icon: 'package-check', badge: () => pendingProductCount.value },
  { key: 'mine' as const, label: '我的', icon: 'user-round', badge: () => 0 }
]
type SecondaryWorkspace = 'drivers' | 'routes' | 'outbound' | 'settlements' | 'handovers' | 'warehouse'
const secondaryWorkspace = ref<SecondaryWorkspace | null>('secondaryWorkspace', null)
const currentTabs = supplierTabs
function isTabActive(key: string) {
  return active.value === key
}
function switchTab(key: string) {
  secondaryWorkspace.value = null
  active.value = key as SupplierTab
  if (key === 'products') openProductWorkspace()
}
function openSecondaryWorkspace(key: SecondaryWorkspace) {
  active.value = 'mine'
  secondaryWorkspace.value = key
  if (key === 'warehouse') {
    const warehouse = supplierWarehouseOf(store.auth.supplierId, store.suppliers)
    warehouseForm.address = warehouse?.address || ''
    warehouseForm.contactName = warehouse?.contactName || ''
    warehouseForm.contactPhone = warehouse?.contactPhone || ''
  }
}
function closeSecondaryWorkspace() { secondaryWorkspace.value = null }

// ---------- 订单 ----------
const orderFilter = ref('orderFilter', '全部')
const orderKeyword = ref('orderKeyword', '')
const orderStatusKeys = ['全部', 'submitted', 'accepted', 'shipped', 'delivering', 'received', 'cancelled', '缺货'] as const
const orderFilters = computed('orderFilters', () => orderStatusKeys.map((key) => ({
  key,
  label: key === '全部' ? '全部' : key === '缺货' ? '缺货' : store.statusText(key),
  count: store.supplierOrderCounts[key] ?? 0
})))
const filteredOrders = computed('filteredOrders', () => store.supplierOrders.filter((order) => {
  const matchesFilter = orderFilter.value === '全部' || (orderFilter.value === '缺货' ? orderShortage(order).length > 0 : orderFulfillment(order).status === orderFilter.value)
  const keyword = orderKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${order.id}${order.customer}`.toLowerCase().includes(keyword)
  return matchesFilter && matchesKeyword
}))
const selectedOrder = ref<Order | null>('selectedOrder', null)
const selectedOrderIds = ref<string[]>('selectedOrderIds', [])
const sheet = ref<null | 'order' | 'courier' | 'handover-out' | 'handover-in' | 'driver-form' | 'driver-edit' | 'driver-reset' | 'driver-toggle-confirm' | 'reset-confirm'>('sheet', null)

function orderFulfillment(order: Order) {
  return order.supplierFulfillment || { status: 'submitted', shortages: [], handovers: [], updatedAt: order.createdAt }
}

// ---------- 商品二级工作页 ----------
const productWorkspace = ref('productWorkspace', false)
const productFilter = ref<'全部' | '待审核' | '已驳回' | '已下架' | '已上架'>('productFilter', '全部')
const productFilters = ['全部', '待审核', '已驳回', '已下架', '已上架'] as const
const productChannelOptions: CatalogProduct['channel'][] = ['store', 'live', 'all']
const productChannelLabels = ['门店采购', '用户商城', '全渠道']
const productEditor = ref<CatalogProduct | null>('productEditor', null)
const productEditorFormalId = ref('productEditorFormalId', '')
const productFormError = ref('productFormError', '')
const productKeyword = ref('productKeyword', '')
const productTagText = ref('productTagText', '')
const persistedSupplierSkuIds = ref<Set<string>>('persistedSupplierSkuIds', new Set())
const categoryPickerOpen = ref('categoryPickerOpen', false)
const productCategoryState = ref<PlatformDictionaryState>('productCategoryState', readPlatformDictionaries())
const productCategoryOptions = computed('productCategoryOptions', () => buildProductCategoryOptions(productCategoryState.value, productEditor.value?.category))

function refreshProductCategoryLabels() {
  productCategoryState.value = readPlatformDictionaries()
}

function selectProductCategory(label: string) {
  if (productEditor.value) productEditor.value.category = label
  categoryPickerOpen.value = false
}

type SupplierProductRow = { key: string; product: CatalogProduct; status: 'pending' | 'rejected' | 'active' | 'offline'; submission?: CatalogProductSubmission }
const allSupplierProductRows = computed<SupplierProductRow[]>('allSupplierProductRows', () => {
  const formal = store.myCatalogProducts.map((product) => ({ key: `formal:${product.id}`, product, status: product.status as 'active' | 'offline' }))
  const submissions = store.myProductSubmissions.filter((item) => item.status !== 'approved').map((submission) => ({ key: `submission:${submission.id}`, product: submission.draft, status: submission.status as 'pending' | 'rejected', submission }))
  const submissionProductIds = new Set(submissions.map((row) => row.product.id))
  return [...submissions, ...formal.filter((row) => !submissionProductIds.has(row.product.id))]
})
const supplierProductRows = computed<SupplierProductRow[]>('supplierProductRows', () => {
  const keyword = productKeyword.value.trim().toLowerCase()
  return allSupplierProductRows.value.filter((row) => (productFilter.value === '全部'
    || (productFilter.value === '待审核' && row.status === 'pending')
    || (productFilter.value === '已驳回' && row.status === 'rejected')
    || (productFilter.value === '已下架' && row.status === 'offline')
    || (productFilter.value === '已上架' && row.status === 'active'))
    && (!keyword || `${row.product.name}${row.product.category}${row.product.tags.join('')}`.toLowerCase().includes(keyword)))
})
const productStatusCount = (status: SupplierProductRow['status']) => allSupplierProductRows.value.filter((row) => row.status === status).length
const productFilterStats = computed('productFilterStats', () => productFilters.map((label) => ({ label, count: label === '全部' ? allSupplierProductRows.value.length : productStatusCount(label === '待审核' ? 'pending' : label === '已驳回' ? 'rejected' : label === '已下架' ? 'offline' : 'active') })))

function openProductWorkspace() {
  active.value = 'products'
  productWorkspace.value = true
  productEditor.value = null
}

function closeProductWorkspace() {
  productWorkspace.value = false
  productEditor.value = null
  productFormError.value = ''
  if (active.value === 'products') active.value = 'orders'
}

function openNewProduct() {
  refreshProductCategoryLabels()
  const supplier = store.currentSupplier
  productEditorFormalId.value = ''
  productEditor.value = {
    id: createId('P'), name: '', category: productCategoryOptions.value[0]?.label || '农产品', supplierId: store.auth.supplierId, supplierName: supplier?.name || store.auth.name,
    source: 'platform', status: 'active', image: '', images: [], tags: [], productType: 'goods', expressDelivery: true,
    channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: createId('SKU'), name: '默认规格', image: '', retailPrice: 59.9, cost: 30, stock: 0, minimumOrderQuantity: 1, level1Amount: 10, level2Amount: 15, status: 'active' }]
  }
  productTagText.value = ''
  persistedSupplierSkuIds.value = new Set()
  productFormError.value = ''
}

function openProductEditor(product: CatalogProduct, submission?: CatalogProductSubmission) {
  refreshProductCategoryLabels()
  productEditor.value = JSON.parse(JSON.stringify(submission?.draft || product)) as CatalogProduct
  productEditorFormalId.value = store.myCatalogProducts.some((item) => item.id === product.id) ? product.id : ''
  productTagText.value = productEditor.value.tags.join('，')
  persistedSupplierSkuIds.value = new Set(product.skus.map((sku) => sku.id))
  productFormError.value = ''
}

function cancelProductEditor() {
  categoryPickerOpen.value = false
  productEditor.value = null
  productFormError.value = ''
}

function addSupplierSku() {
  if (!productEditor.value) return
  productEditor.value.skus.push({ id: createId('SKU'), name: `规格 ${productEditor.value.skus.length + 1}`, image: productEditor.value.image, retailPrice: 0, cost: 0, stock: 0, minimumOrderQuantity: 1, level1Amount: 0, level2Amount: 0, status: 'active' })
}

function removeSupplierSku(index: number) {
  if (!productEditor.value) return
  const activeSkus = productEditor.value.skus.filter((sku) => sku.status !== 'retired')
  if (activeSkus.length <= 1) { productFormError.value = 'SKU 至少保留一个有效规格'; return }
  const sku = productEditor.value.skus[index]
  if (!sku) return
  if (persistedSupplierSkuIds.value.has(sku.id)) sku.status = 'retired'
  else productEditor.value.skus.splice(index, 1)
}

function restoreSupplierSku(index: number) {
  const sku = productEditor.value?.skus[index]
  if (sku) sku.status = 'active'
}

function setProductChannel(event: { detail: { value: string | number } }) {
  if (productEditor.value) productEditor.value.channel = productChannelOptions[Number(event.detail.value)] || 'store'
}

function productChannelLabel(channel: CatalogProduct['channel']) {
  return channel === 'store' ? '门店采购' : channel === 'live' ? '用户商城' : '全渠道'
}

function setProductFilter(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  productFilter.value = productFilters[index] || productFilter.value
}

function validateSupplierProduct(product: CatalogProduct) {
  if (!product.image) return '请上传商品主图'
  if (!product.name.trim() || !product.category.trim() || !product.skus.some((sku) => sku.status !== 'retired')) return '请完善商品名称、品类和有效 SKU'
  for (const sku of product.skus.filter((item) => item.status !== 'retired')) {
    if (!sku.name.trim() || [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'SKU 金额和库存不能为负数'
    if (!Number.isInteger(Number(sku.minimumOrderQuantity)) || Number(sku.minimumOrderQuantity) < 0) return '起订量必须为大于等于 0 的整数'
    if (Number(sku.retailPrice) < Number(sku.level1Amount) + Number(sku.level2Amount)) return '零售价不能低于分销金额合计'
  }
  return ''
}

async function submitSupplierProduct() {
  if (!productEditor.value) return
  const draft: CatalogProduct = {
    ...productEditor.value,
    name: productEditor.value.name.trim(),
    category: productEditor.value.category.trim(),
    tags: productTagText.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    skus: productEditor.value.skus.map((sku) => ({ ...sku, name: sku.name.trim(), image: sku.image || productEditor.value!.image }))
  }
  const error = validateSupplierProduct(draft)
  if (error) { productFormError.value = error; return }
  await runBusy('submit-product', async () => {
    const result = await store.submitCatalogProduct(draft)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('商品已提交审核')
  })
}

async function saveSupplierProductStock() {
  if (!productEditor.value || !productEditorFormalId.value) return
  const changes = productEditor.value.skus.filter((sku) => persistedSupplierSkuIds.value.has(sku.id)).map((sku) => ({ skuId: sku.id, stock: Number(sku.stock) }))
  await runBusy('save-stock', async () => {
    const result = await store.adjustCatalogProductStock(productEditorFormalId.value, changes)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('库存已更新')
  })
}

async function toggleSupplierProduct(product: CatalogProduct) {
  await runBusy('toggle-product', async () => {
    const result = await store.toggleCatalogProduct(product.id)
    toast(result.ok ? (product.status === 'active' ? '商品已下架' : '商品已上架') : result.message)
  })
}

// ---------- 命名线路、每日线路与仓点 ----------
const pendingProductCount = computed('pendingProductCount', () => store.myProductSubmissions.filter((item) => item.status === 'pending').length)
const routeBusy = ref('routeBusy', false)
const warehouseForm = reactive<{ address: string; contactName: string; contactPhone: string }>('warehouseForm', { address: '', contactName: '', contactPhone: '' })
const supplierWorkItems: Array<{ key: SecondaryWorkspace; label: string; icon: string; detail: string }> = [
  { key: 'drivers', label: '司机管理', icon: 'users', detail: '账号与启用状态' },
  { key: 'routes', label: '线路规划', icon: 'navigation', detail: '命名线路、门店顺序与派司机' },
  { key: 'outbound', label: '出仓交接', icon: 'package-check', detail: '司机发起、供应商审核与缺货标记' },
  { key: 'settlements', label: '结算账单', icon: 'package-check', detail: '查看账期和关联订单' },
  { key: 'handovers', label: '交接日志', icon: 'list-tree', detail: '出库和到店交接记录' },
  { key: 'warehouse', label: '仓点设置', icon: 'map-pin', detail: '按地址解析仓点坐标' }
]
const outboundDate = ref('outboundDate', todayString())
const outboundRouteId = ref('outboundRouteId', '')
const outboundActuals = reactive<Record<string, number>>('outboundActuals', {})
const outboundNote = ref('outboundNote', '')
const driverRouteDetailId = ref('driverRouteDetailId', '')
const driverStoreDetailId = ref('driverStoreDetailId', '')
const driverOutboundView = ref('driverOutboundView', false)
const driverHandoverActuals = reactive<Record<string, number>>('driverHandoverActuals', {})
const driverHandoverNote = ref('driverHandoverNote', '')
const driverHandoverProofs = ref<string[]>('driverHandoverProofs', [])
const driverShortageDraft = reactive<Record<string, number>>('driverShortageDraft', {})
const driverShortageNotes = reactive<Record<string, string>>('driverShortageNotes', {})
const driverWarehouseView = ref('driverWarehouseView', false)
const driverShortageView = ref('driverShortageView', false)
type DriverRouteFilter = '待配送' | '配送中' | '已完成'
type DriverRouteStage = 'pending_checkin' | 'pending_submission' | 'pending_review' | 'rejected' | 'pending_shortage' | 'ready_to_dispatch' | 'delivering' | 'completed'
type DriverStopStage = 'waiting' | 'in_transit' | 'checked_in' | 'completed'
const driverRouteFilter = ref<DriverRouteFilter>('driverRouteFilter', '待配送')
const driverRouteFilterOptions = ['待配送', '配送中', '已完成'] as const
const driverRouteDisplayMode = ref<'list' | 'map'>('driverRouteDisplayMode', 'list')
const driverSelectedStopId = ref('driverSelectedStopId', '')
const driverAuxView = ref<'data' | 'handovers' | null>('driverAuxView', null)
const driverDataDate = ref('driverDataDate', todayString())
const driverDataKeyword = ref('driverDataKeyword', '')
const warehouseAbnormalMode = ref('warehouseAbnormalMode', false)
const warehouseAbnormalReason = ref<RouteWarehouseCheckInReason | ''>('warehouseAbnormalReason', '')
const warehouseAbnormalNote = ref('warehouseAbnormalNote', '')
const warehouseAbnormalOptions: Array<{ value: RouteWarehouseCheckInReason; label: string }> = [
  { value: 'location_failed', label: '定位失败' },
  { value: 'device_issue', label: '设备异常' },
  { value: 'warehouse_coordinate_error', label: '仓点坐标错误' },
  { value: 'other', label: '其他' }
]
const expandedOutboundItems = ref<string[]>('expandedOutboundItems', [])
const warehouseDistanceM = ref<number | null>('warehouseDistanceM', null)
const warehouseLocationError = ref('warehouseLocationError', '')
const outboundShowDifferences = ref('outboundShowDifferences', false)
const outboundKeyword = ref('outboundKeyword', '')
const supplierRejectMode = ref('supplierRejectMode', false)
const supplierRejectionReason = ref('supplierRejectionReason', '')
const filteredTodayDriverRoutes = computed('filteredTodayDriverRoutes', () => store.todayDriverRoutes.filter((route) => routeExecutionStatus(route) === driverRouteFilter.value))
const driverTodayRouteCount = computed('driverTodayRouteCount', () => store.todayDriverRoutes.length)
const driverCompletedStoreCount = computed('driverCompletedStoreCount', () => store.todayDriverRoutes.reduce((sum, route) => sum + driverRouteProgress(route).completed, 0))
const driverPendingShortageRouteCount = computed('driverPendingShortageRouteCount', () => store.todayDriverRoutes.filter((route) => driverRouteStage(route) === 'pending_shortage').length)
const driverWarehouseHistory = computed('driverWarehouseHistory', () => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId && route.warehouseCheckIn)
  .sort((left, right) => (right.warehouseCheckIn?.at || '').localeCompare(left.warehouseCheckIn?.at || '')))
const supplierOutboundRoutes = computed('supplierOutboundRoutes', () => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.deliveryDate === outboundDate.value)
  .sort((left, right) => {
    const rank = (route: DailyDeliveryRoute) => route.outboundHandover?.status === 'pending_supplier' ? 0 : route.outboundHandover?.status === 'pending_dispatch' ? 1 : route.status === 'completed' ? 3 : 2
    return rank(left) - rank(right) || left.id.localeCompare(right.id)
  }))
const selectedOutboundRoute = computed('selectedOutboundRoute', () => store.dailyRoutes.find((route) => route.id === outboundRouteId.value && route.supplierId === store.auth.supplierId) || null)
const selectedOutboundOrders = computed('selectedOutboundOrders', () => outboundRouteOrders(selectedOutboundRoute.value))
const selectedOutboundItems = computed<RouteOutboundHandoverItem[]>('selectedOutboundItems', () => {
  const handover = selectedOutboundRoute.value?.outboundHandover
  return handover?.items.length ? handover.items : aggregateRouteOutboundItems(selectedOutboundOrders.value)
})
const selectedDriverRoute = computed('selectedDriverRoute', () => store.dailyRoutes.find((route) => route.id === driverRouteDetailId.value && route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId) || store.currentDriverRoute)
const selectedDriverRouteOrders = computed('selectedDriverRouteOrders', () => outboundRouteOrders(selectedDriverRoute.value))
const driverNextStop = computed('driverNextStop', () => selectedDriverRoute.value?.stops.find((stop) => !stop.completedAt && stop.completedOrderIds?.length !== stop.orderIds.length) || null)
const selectedDriverRouteItems = computed<RouteOutboundHandoverItem[]>('selectedDriverRouteItems', () => selectedDriverRoute.value?.outboundHandover?.items.length ? selectedDriverRoute.value.outboundHandover.items : aggregateRouteOutboundItems(selectedDriverRouteOrders.value))
const selectedDriverStop = computed('selectedDriverStop', () => selectedDriverRoute.value?.stops.find((stop) => stop.storeId === driverStoreDetailId.value) || null)
const selectedDriverStopOrders = computed('selectedDriverStopOrders', () => selectedDriverStop.value ? stopOrders(selectedDriverStop.value) : [])
const selectedDriverStopItems = computed('selectedDriverStopItems', () => aggregateRouteOutboundItems(selectedDriverStopOrders.value))
const filteredSelectedOutboundItems = computed('filteredSelectedOutboundItems', () => selectedOutboundItems.value.filter((item) => {
  const keyword = outboundKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${item.name}${item.skuName}`.toLowerCase().includes(keyword)
  const matchesDifference = !outboundShowDifferences.value || item.expected !== outboundItemActual(item)
  return matchesKeyword && matchesDifference
}))
const filteredSelectedDriverRouteItems = computed('filteredSelectedDriverRouteItems', () => selectedDriverRouteItems.value.filter((item) => {
  const keyword = outboundKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${item.name}${item.skuName}`.toLowerCase().includes(keyword)
  const matchesDifference = !outboundShowDifferences.value || item.expected !== outboundItemActual(item)
  return matchesKeyword && matchesDifference
}))
const driverDataRoutes = computed('driverDataRoutes', () => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId && route.status !== 'draft')
  .sort((left, right) => right.deliveryDate.localeCompare(left.deliveryDate) || (right.publishedAt || right.generatedAt).localeCompare(left.publishedAt || left.generatedAt) || right.id.localeCompare(left.id)))
const filteredDriverDataRoutes = computed('filteredDriverDataRoutes', () => {
  const keyword = driverDataKeyword.value.trim().toLowerCase()
  return driverDataRoutes.value.filter((route) => {
    const matchesDate = !driverDataDate.value || route.deliveryDate === driverDataDate.value
    const searchable = [
      driverRouteName(route),
      route.deliveryDate,
      driverRouteStageText(route),
      routeDriverName(route),
      warehouseName(route),
      ...route.stops.flatMap((stop) => [stop.storeName, ...stop.orderIds])
    ].join(' ').toLowerCase()
    return matchesDate && (!keyword || searchable.includes(keyword))
  })
})
const driverDataTitle = computed('driverDataTitle', () => driverDataDate.value === todayString()
  ? '今天配送数据'
  : driverDataDate.value ? `${driverDataDate.value} 配送数据` : '全部配送数据')
const driverDataEmptyText = computed('driverDataEmptyText', () => driverDataKeyword.value.trim()
  ? '没有符合条件的配送数据'
  : driverDataDate.value ? '该配送日暂无配送数据' : '暂无配送数据')
const driverDeliverySummary = computed('driverDeliverySummary', () => {
  const routes = filteredDriverDataRoutes.value
  const routeOrders = routes.flatMap((route) => outboundRouteOrders(route))
  const storeIds = new Set(routes.flatMap((route) => route.stops.map((stop) => stop.storeId)))
  return {
    routeCount: routes.length,
    storeCount: storeIds.size,
    itemCount: routeOrders.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0),
    shortageCount: routes.reduce((sum, route) => sum + (route.outboundHandover?.shortageAllocations || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0),
    completionRate: routes.length ? Math.round(routes.filter((route) => route.status === 'completed').length / routes.length * 100) : 0
  }
})
const driverDeliveryGroups = computed('driverDeliveryGroups', () => {
  const groups = new Map<string, DailyDeliveryRoute[]>()
  for (const route of filteredDriverDataRoutes.value) {
    const list = groups.get(route.deliveryDate) || []
    list.push(route)
    groups.set(route.deliveryDate, list)
  }
  return [...groups.entries()].map(([date, routes]) => ({ date, routes }))
})
const canDispatchRoute = computed('canDispatchRoute', () => {
  const route = selectedDriverRoute.value
  const handover = route?.outboundHandover
  if (!route || !handover || handover.status !== 'pending_dispatch') return false
  return handover.items.every((item) => driverShortageRemaining(route, item) === 0)
})
function resetNumberRecord(record: Record<string, number>) {
  Object.keys(record).forEach((key) => { delete record[key] })
}
function driverRouteStage(route: DailyDeliveryRoute): DriverRouteStage {
  if (route.status === 'completed') return 'completed'
  const handover = route.outboundHandover
  if (!route.warehouseCheckIn) return 'pending_checkin'
  if (!handover) return 'pending_submission'
  if (handover.status === 'pending_supplier') return 'pending_review'
  if (handover.status === 'rejected') return 'rejected'
  if (handover.status === 'pending_dispatch') return outboundHasShortage(route) ? 'pending_shortage' : 'ready_to_dispatch'
  return 'delivering'
}
function driverRouteStageText(route: DailyDeliveryRoute) {
  const stage = driverRouteStage(route)
  return stage === 'pending_checkin' ? '待到仓打卡'
    : stage === 'pending_submission' ? '待提交交接'
      : stage === 'pending_review' ? '审核中'
        : stage === 'rejected' ? '审核不通过'
          : stage === 'pending_shortage' ? '待标记缺货'
            : stage === 'ready_to_dispatch' ? '待发车'
              : stage === 'completed' ? '已完成' : '配送中'
}
function driverStopStage(route: DailyDeliveryRoute, stop: RouteStop): DriverStopStage {
  if (stop.completedAt || stop.completedOrderIds?.length === stop.orderIds.length) return 'completed'
  if (stop.checkIn) return 'checked_in'
  return route.outboundHandover?.status === 'dispatched' ? 'in_transit' : 'waiting'
}
function driverStopStageText(route: DailyDeliveryRoute, stop: RouteStop) {
  const stage = driverStopStage(route, stop)
  return stage === 'completed' ? '已完成' : stage === 'checked_in' ? '已到店' : stage === 'in_transit' ? '配送中' : '待配送'
}
function driverRouteProgress(route: DailyDeliveryRoute) {
  const total = route.stops.length
  const completed = route.stops.filter((stop) => driverStopStage(route, stop) === 'completed').length
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 }
}
function setDriverDataDate(event: { detail: { value: string } }) {
  driverDataDate.value = event.detail.value
}
function saveDriverAuxFilters() {
  driverAuxFilterSnapshot = { date: driverDataDate.value, dataKeyword: driverDataKeyword.value, handoverKeyword: handoverKeyword.value }
}
function restoreDriverAuxFilters() {
  driverDataDate.value = driverAuxFilterSnapshot.date
  driverDataKeyword.value = driverAuxFilterSnapshot.dataKeyword
  handoverKeyword.value = driverAuxFilterSnapshot.handoverKeyword
}
function openDriverAux(view: 'data' | 'handovers') {
  restoreDriverAuxFilters()
  driverAuxView.value = view
}
function closeDriverAux() {
  saveDriverAuxFilters()
  driverAuxView.value = null
}
function warehouseCheckInLabel(route: DailyDeliveryRoute) {
  const checkIn = route.warehouseCheckIn
  if (!checkIn) return '到仓后完成打卡，才能发起出仓交接'
  if (checkIn.type === 'abnormal') return `异常打卡 · ${warehouseReasonLabel(checkIn.reasonCode)}`
  return `已打卡 · 距仓点 ${checkIn.distanceM ?? 0} 米`
}
function canMoveDriverStop(route: DailyDeliveryRoute, index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (selectedDriverRoute.value?.outboundHandover?.status !== 'dispatched') return false
  if (nextIndex < 0 || nextIndex >= route.stops.length) return false
  const current = route.stops[index]
  const target = route.stops[nextIndex]
  return !current.completedAt && !target.completedAt
}
function warehouseCheckInBadgeClass(route: DailyDeliveryRoute) {
  if (isAbnormalWarehouseCheckIn(route)) return 'rejected'
  return route.warehouseCheckIn ? 'received' : 'warning-tag'
}
function warehouseCheckInStatusText(route: DailyDeliveryRoute) {
  if (isAbnormalWarehouseCheckIn(route)) return '异常打卡'
  return route.warehouseCheckIn ? '已打卡' : '待打卡'
}
function warehouseReasonLabel(reason?: RouteWarehouseCheckInReason) {
  return warehouseAbnormalOptions.find((item) => item.value === reason)?.label || '异常'
}
function isAbnormalWarehouseCheckIn(route: DailyDeliveryRoute) {
  return route.warehouseCheckIn?.type === 'abnormal'
}
function routeExecutionStatus(route: DailyDeliveryRoute): DriverRouteFilter {
  const stage = driverRouteStage(route)
  if (stage === 'delivering') return '配送中'
  if (stage === 'completed') return '已完成'
  return '待配送'
}
function routeWarehouse(route: DailyDeliveryRoute) {
  return supplierWarehouseOf(route.supplierId, store.suppliers)
}
function warehouseName(route: DailyDeliveryRoute) {
  return routeWarehouse(route)?.contact || store.currentSupplier?.name || '供应商仓库'
}
function warehouseAddress(route: DailyDeliveryRoute) {
  return routeWarehouse(route)?.address || '仓库地址待维护'
}
function outboundHasShortage(route: DailyDeliveryRoute) {
  return (route.outboundHandover?.items || []).some((item) => item.expected > outboundItemActual(item))
}
function routeActionLabel(route: DailyDeliveryRoute) {
  if (!route.warehouseCheckIn) return '到仓打卡'
  const handover = route.outboundHandover
  if (!handover) return '提交出仓交接'
  if (handover.status === 'pending_supplier') return '查看审核'
  if (handover.status === 'rejected') return '重新提交'
  if (handover.status === 'pending_dispatch') return outboundHasShortage(route) ? '标记缺货' : '发车'
  return route.status === 'completed' ? '配送记录' : '配送门店'
}
function toggleOutboundItem(skuId: string) {
  const index = expandedOutboundItems.value.indexOf(skuId)
  if (index >= 0) expandedOutboundItems.value.splice(index, 1)
  else expandedOutboundItems.value.push(skuId)
}
function isOutboundItemExpanded(skuId: string) {
  return expandedOutboundItems.value.includes(skuId)
}
function outboundItemStoreExpected(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  return storeSkuQuantity(stop, item.skuId)
}
function outboundItemStoreActualText(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  const handover = route.outboundHandover
  if (!handover) return '待提交'
  if (handover.status === 'pending_supplier') return '待审核'
  if (handover.status === 'rejected') return '待重提'
  const expected = outboundItemStoreExpected(route, item, stop)
  const shortage = item.expected - outboundItemActual(item)
  if (shortage <= 0) return String(expected)
  const allocation = handover.shortageAllocations.find((entry) => entry.skuId === item.skuId && entry.storeId === stop.storeId)
  return allocation ? String(expected - allocation.quantity) : '待分配'
}
function outboundItemStoreNote(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  return route.outboundHandover?.shortageAllocations.find((entry) => entry.skuId === item.skuId && entry.storeId === stop.storeId)?.note || ''
}
function openDriverRouteAction(route: DailyDeliveryRoute) {
  if (!route.warehouseCheckIn) { openDriverWarehouse(route); return }
  const handover = route.outboundHandover
  if (!handover || handover.status === 'rejected') { openDriverOutbound(route); return }
  if (handover.status === 'pending_supplier') { openDriverRoute(route); openDriverOutbound(route); return }
  if (handover.status === 'pending_dispatch') {
    if (outboundHasShortage(route)) openDriverShortage(route)
    else void dispatchDriverRoute(route)
    return
  }
  openDriverRoute(route)
}
function storeSkuShortage(route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return (route.outboundHandover?.shortageAllocations || [])
    .filter((allocation) => allocation.storeId === stop.storeId && allocation.skuId === skuId)
    .reduce((sum, allocation) => sum + allocation.quantity, 0)
}
function storeSkuShortageNote(route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return (route.outboundHandover?.shortageAllocations || []).find((allocation) => allocation.storeId === stop.storeId && allocation.skuId === skuId)?.note || ''
}
function outboundRouteOrders(route: DailyDeliveryRoute | null | undefined) {
  if (!route) return []
  const ids = new Set(route.sourceOrderIds)
  return store.orders.filter((order) => ids.has(order.id))
}
function routeGoodsQuantity(route: DailyDeliveryRoute) {
  return outboundRouteOrders(route).reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0)
}
function routeGoodsKinds(route: DailyDeliveryRoute) {
  return new Set(outboundRouteOrders(route).flatMap((order) => (order.items || []).map((item) => item.skuId))).size
}
function routeDriverName(route: DailyDeliveryRoute) {
  return store.visibleDrivers.find((driver) => driver.id === route.driverId)?.name || route.driverId
}
function driverOrderRoute(order: Order) {
  return store.dailyRoutes.find((route) => route.sourceOrderIds.includes(order.id)) || null
}
function driverOrderRouteName(order: Order) {
  const route = driverOrderRoute(order)
  return route ? driverRouteName(route) : '配送线路'
}
function driverOrderCompletedAt(order: Order) {
  const route = driverOrderRoute(order)
  const stop = route?.stops.find((item) => item.orderIds.includes(order.id))
  return stop?.completedAt?.replace('T', ' ').slice(0, 16) || order.supplierFulfillment?.updatedAt?.replace('T', ' ').slice(0, 16) || ''
}
function outboundStatusText(route: DailyDeliveryRoute) {
  const handover = route.outboundHandover
  if (!route.warehouseCheckIn) return '待到仓打卡'
  if (!handover) return '待提交交接'
  if (handover.status === 'pending_supplier') return '待供应商审核'
  if (handover.status === 'rejected') return '审核不通过'
  if (handover.status === 'pending_dispatch') return handover.items.some((item) => item.expected > (item.supplierActual ?? item.driverActual)) ? '待标记缺货' : '待司机发车'
  return route.status === 'completed' ? '已完成' : '配送中'
}
function outboundItemActual(item: RouteOutboundHandoverItem) {
  return item.supplierActual ?? item.driverActual
}
function openOutboundRoute(route: DailyDeliveryRoute) {
  outboundRouteId.value = route.id
  outboundNote.value = route.outboundHandover?.supplierNote || route.outboundHandover?.driverNote || ''
  supplierRejectMode.value = false
  supplierRejectionReason.value = ''
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(outboundActuals)
  const items = route.outboundHandover?.items.length ? route.outboundHandover.items : aggregateRouteOutboundItems(outboundRouteOrders(route))
  items.forEach((item) => { outboundActuals[item.skuId] = outboundItemActual(item) })
}
function closeOutboundRoute() {
  outboundRouteId.value = ''
  outboundNote.value = ''
  supplierRejectMode.value = false
  supplierRejectionReason.value = ''
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(outboundActuals)
}
function openDriverRoute(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverSelectedStopId.value = route.stops.find((stop) => !stop.completedAt && stop.completedOrderIds?.length !== stop.orderIds.length)?.storeId || ''
  driverStoreDetailId.value = ''
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverRouteDisplayMode.value = 'list'
  expandedOutboundItems.value = []
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
  selectDriverRoute(route.id)
}
function openDriverStore(storeId: string) {
  driverStoreDetailId.value = storeId
}
function closeDriverStore() { driverStoreDetailId.value = '' }
function closeDriverRoute() {
  driverAuxView.value = null
  driverRouteDetailId.value = ''
  driverStoreDetailId.value = ''
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverSelectedStopId.value = ''
  expandedOutboundItems.value = []
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
}
function driverAllocationKey(skuId: string, storeId: string) {
  return `${skuId}\u0000${storeId}`
}
function stopContainsSku(_route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return store.orders.some((order) => stop.orderIds.includes(order.id) && (order.items || []).some((item) => item.skuId === skuId))
}
function initializeDriverShortageDraft(route: DailyDeliveryRoute) {
  resetNumberRecord(driverShortageDraft)
  Object.keys(driverShortageNotes).forEach((key) => { delete driverShortageNotes[key] })
  const handover = route.outboundHandover
  if (!handover || handover.status !== 'pending_dispatch') return
  handover.shortageAllocations.forEach((allocation) => {
    driverShortageDraft[driverAllocationKey(allocation.skuId, allocation.storeId)] = allocation.quantity
    if (allocation.note) driverShortageNotes[driverAllocationKey(allocation.skuId, allocation.storeId)] = allocation.note
  })
  for (const item of handover.items) {
    const shortage = item.expected - outboundItemActual(item)
    if (shortage <= 0) continue
    const eligible = route.stops.filter((stop) => stopContainsSku(route, stop, item.skuId))
    if (eligible.length === 1) driverShortageDraft[driverAllocationKey(item.skuId, eligible[0].storeId)] = shortage
  }
}
function openDriverOutbound(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverStoreDetailId.value = ''
  driverOutboundView.value = true
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverHandoverNote.value = route.outboundHandover?.driverNote || ''
  driverHandoverProofs.value = [...(route.outboundHandover?.proofImages || [])]
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(driverHandoverActuals)
  const items = route.outboundHandover?.items.length ? route.outboundHandover.items : aggregateRouteOutboundItems(outboundRouteOrders(route))
  items.forEach((item) => { driverHandoverActuals[item.skuId] = outboundItemActual(item) })
  initializeDriverShortageDraft(route)
}
function closeDriverOutbound() {
  driverOutboundView.value = false
  driverHandoverNote.value = ''
  driverHandoverProofs.value = []
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(driverHandoverActuals)
}
function driverShortageRemaining(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem) {
  const shortage = item.expected - outboundItemActual(item)
  if (shortage <= 0) return 0
  const allocated = route.stops.reduce((sum, stop) => sum + Number(driverShortageDraft[driverAllocationKey(item.skuId, stop.storeId)] || 0), 0)
  return shortage - allocated
}
function driverItemStores(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem) {
  return route.stops.filter((stop) => stopContainsSku(route, stop, item.skuId))
}
function storeSkuQuantity(stop: RouteStop, skuId: string) {
  const ids = new Set(stop.orderIds)
  return store.orders.filter((order) => ids.has(order.id)).reduce((sum, order) => sum + (order.items || []).filter((item) => item.skuId === skuId).reduce((lineSum, item) => lineSum + item.quantity, 0), 0)
}
function getCurrentLocation() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    wx.getLocation({ type: 'gcj02', success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }), fail: reject })
  })
}
function openDriverWarehouse(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  warehouseAbnormalMode.value = false
  warehouseAbnormalReason.value = ''
  warehouseAbnormalNote.value = ''
  driverWarehouseView.value = true
  driverOutboundView.value = false
  driverShortageView.value = false
  driverStoreDetailId.value = ''
  void refreshWarehouseDistance(route)
}
function closeDriverWarehouse() {
  driverWarehouseView.value = false
  warehouseAbnormalMode.value = false
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
}
function openDriverShortage(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverShortageView.value = true
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverStoreDetailId.value = ''
  initializeDriverShortageDraft(route)
}
function closeDriverShortage() {
  driverShortageView.value = false
  resetNumberRecord(driverShortageDraft)
  Object.keys(driverShortageNotes).forEach((key) => { delete driverShortageNotes[key] })
}
async function refreshWarehouseDistance(route: DailyDeliveryRoute) {
  warehouseLocationError.value = ''
  try {
    const location = await getCurrentLocation()
    if (!route.origin) { warehouseDistanceM.value = null; warehouseLocationError.value = '仓点坐标待维护'; return }
    warehouseDistanceM.value = distanceMeters(route.origin, location)
  } catch {
    warehouseDistanceM.value = null
    warehouseLocationError.value = '无法获取定位，请开启定位权限'
  }
}
async function checkInWarehouse(route: DailyDeliveryRoute) {
  await runBusy('warehouse-checkin', async () => {
    try {
      const location = await getCurrentLocation()
      if (route.origin) warehouseDistanceM.value = distanceMeters(route.origin, location)
      const result = await store.checkInWarehouse(route.id, location)
      toast(result.ok ? `到仓打卡成功，距仓点 ${result.value?.distanceM} 米` : result.message)
    } catch {
      warehouseLocationError.value = '无法获取定位，请开启定位权限'
      toast(warehouseLocationError.value)
    }
  })
}
async function submitAbnormalWarehouseCheckIn(route: DailyDeliveryRoute) {
  if (!warehouseAbnormalReason.value) { toast('请选择异常打卡原因'); return }
  if (warehouseAbnormalReason.value === 'other' && !warehouseAbnormalNote.value.trim()) { toast('请填写其他异常原因'); return }
  await runBusy('warehouse-abnormal-checkin', async () => {
    let location: RouteOrigin | undefined
    try { location = await getCurrentLocation() } catch { location = undefined }
    const result = await store.checkInWarehouseAbnormal(route.id, { reasonCode: warehouseAbnormalReason.value as RouteWarehouseCheckInReason, reasonNote: warehouseAbnormalNote.value.trim() || undefined, location })
    if (result.ok) {
      warehouseAbnormalMode.value = false
      warehouseAbnormalReason.value = ''
      warehouseAbnormalNote.value = ''
      toast('异常打卡已提交，可继续出仓交接')
    } else toast(result.message)
  })
}
async function submitDriverOutbound(route: DailyDeliveryRoute) {
  if (!driverHandoverProofs.value.length) { toast('请至少上传 1 张出仓凭证'); return }
  await runBusy('submit-outbound', async () => {
    const result = await store.submitRouteOutbound(route.id, { actuals: { ...driverHandoverActuals }, proofImages: [...driverHandoverProofs.value], note: driverHandoverNote.value.trim() || undefined })
    toast(result.ok ? '出仓交接已提交，等待供应商审核' : result.message)
  })
}
async function reviewSupplierOutbound(route: DailyDeliveryRoute) {
  await runBusy('review-outbound', async () => {
    const result = await store.reviewRouteOutbound(route.id, { decision: 'confirm', actuals: { ...outboundActuals }, note: outboundNote.value.trim() || undefined })
    if (result.ok) { toast('交接单已审核锁定'); closeOutboundRoute() }
    else toast(result.message)
  })
}
async function rejectSupplierOutbound(route: DailyDeliveryRoute) {
  if (!supplierRejectionReason.value.trim()) { toast('请填写驳回原因'); return }
  await runBusy('reject-outbound', async () => {
    const result = await store.reviewRouteOutbound(route.id, { decision: 'reject', reason: supplierRejectionReason.value.trim() })
    if (result.ok) { toast('已驳回，等待司机重新提交'); closeOutboundRoute() }
    else toast(result.message)
  })
}
async function markDriverShortages(route: DailyDeliveryRoute) {
  await runBusy('mark-outbound-shortages', async () => {
    const allocations: RouteOutboundShortageAllocation[] = []
    for (const item of route.outboundHandover?.items || []) {
      for (const stop of driverItemStores(route, item)) {
        const quantity = Number(driverShortageDraft[driverAllocationKey(item.skuId, stop.storeId)] || 0)
        if (quantity > 0) {
          const note = driverShortageNotes[driverAllocationKey(item.skuId, stop.storeId)]?.trim()
          allocations.push({ skuId: item.skuId, storeId: stop.storeId, quantity, ...(note ? { note } : {}) })
        }
      }
    }
    const result = await store.markRouteShortages(route.id, allocations)
    if (result.ok) { toast('门店缺货已标记，可以发车'); closeDriverShortage() }
    else toast(result.message)
  })
}
async function moveDriverStop(route: DailyDeliveryRoute, index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= route.stops.length) return
  const current = route.stops[index]
  const target = route.stops[nextIndex]
  if (current.completedAt || target.completedAt) { toast('已完成门店不可调整顺序'); return }
  const ids = route.stops.map((stop) => stop.storeId)
  ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
  await runBusy('reorder-stops', async () => {
    const result = await store.reorderRouteStops(route.id, ids)
    toast(result.ok ? '门店顺序已更新' : result.message)
  })
}
function callStore(phone?: string) {
  if (!phone) { toast('门店电话待维护'); return }
  wx.makePhoneCall({ phoneNumber: phone })
}
async function dispatchDriverRoute(route: DailyDeliveryRoute) {
  await runBusy('dispatch-route', async () => {
    const result = await store.dispatchRoute(route.id)
    if (result.ok) { toast('已发车，线路进入配送中'); closeDriverShortage(); closeDriverOutbound() }
    else toast(result.message)
  })
}
async function handoverDriverStop(route: DailyDeliveryRoute, stop: RouteStop) {
  await runBusy('store-handover', async () => {
    const result = await store.handoverRouteStop(route.id, stop.storeId)
    if (result.ok) { toast('到店交接完成'); closeDriverStore() }
    else toast(result.message)
  })
}
const routeOrderCount = computed('routeOrderCount', () => store.currentDriverRoute?.sourceOrderIds.length || 0)
const routeCompletedOrderCount = computed('routeCompletedOrderCount', () => store.currentDriverRoute?.stops.reduce((count, stop) => count + (stop.completedOrderIds?.length || 0), 0) || 0)
const nextRouteStop = computed('nextRouteStop', () => store.currentDriverRoute?.stops.find((stop) => (stop.completedOrderIds?.length || 0) < stop.orderIds.length) || null)
const storeOptions = Object.values(storeDirectory)

const namedRouteDraft = ref<{ id?: string; name: string; storeIds: string[]; driverId?: string } | null>('namedRouteDraft', null)
const routePlanId = ref('routePlanId', '')
const routePreviewId = ref('routePreviewId', '')
const routePlanDate = ref('routePlanDate', todayString())
const routePlanDriverId = ref('routePlanDriverId', '')
const selectedRouteStopId = ref('selectedRouteStopId', '')
const routePreviewBusy = ref('routePreviewBusy', false)
const routePublishing = ref('routePublishing', false)
const supplierNamedRoutes = computed('supplierNamedRoutes', () => store.namedRoutes.filter((route) => route.supplierId === store.auth.supplierId))
const namedRouteDriverOptions = computed('namedRouteDriverOptions', () => ['', ...store.activeDrivers.map((driver) => driver.id)])
const namedRouteDriverLabels = computed('namedRouteDriverLabels', () => namedRouteDriverOptions.value.map((id) => namedRouteDriverName(id)))
function namedRouteDriverName(driverId?: string) {
  if (!driverId) return '未指派'
  return store.visibleDrivers.find((driver) => driver.id === driverId)?.name || driverId
}
function namedRouteLabelForDriver(driverId: string) {
  const routes = store.namedRoutes.filter((item) => item.supplierId === store.auth.supplierId && item.driverId === driverId)
  return routes.length ? `${routes.length} 条线路 · ${routes.reduce((sum, route) => sum + route.storeIds.length, 0)} 家门店` : '尚未配置线路'
}
function routePublishedStatus(routeId: string) {
  const published = store.dailyRoutes.find((route) => route.namedRouteId === routeId && route.deliveryDate === routePlanDate.value && ['published', 'stale', 'completed'].includes(route.status))
  return published ? (published.status === 'completed' ? '已完成' : published.status === 'stale' ? '需复核' : '已发布') : '未发布'
}
function invalidateRoutePreview() {
  store.invalidateRoutePreview()
  routePreviewId.value = ''
  selectedRouteStopId.value = ''
}
function openNamedRouteEditor(route?: { id: string; name: string; storeIds: string[]; driverId?: string }) {
  namedRouteDraft.value = route
    ? { id: route.id, name: route.name, storeIds: [...route.storeIds], driverId: route.driverId }
    : { name: '', storeIds: [], driverId: '' }
  routePlanId.value = route?.id || ''
  invalidateRoutePreview()
  routePlanDate.value = todayString()
  routePlanDriverId.value = route?.driverId || ''
  selectedRouteStopId.value = ''
}
function closeNamedRouteEditor() {
  if (namedRouteDraft.value) { namedRouteDraft.value = null; return }
  closeSecondaryWorkspace()
}
function toggleNamedRouteStore(storeId: string) {
  if (!namedRouteDraft.value) return
  namedRouteDraft.value.storeIds = namedRouteDraft.value.storeIds.includes(storeId)
    ? namedRouteDraft.value.storeIds.filter((id) => id !== storeId)
    : [...namedRouteDraft.value.storeIds, storeId]
  invalidateRoutePreview()
}
function moveNamedRouteStore(index: number, direction: -1 | 1) {
  if (!namedRouteDraft.value) return
  const target = index + direction
  const storeIds = [...namedRouteDraft.value.storeIds]
  if (target < 0 || target >= storeIds.length) return
  ;[storeIds[index], storeIds[target]] = [storeIds[target], storeIds[index]]
  namedRouteDraft.value.storeIds = storeIds
  invalidateRoutePreview()
}
async function saveNamedRouteDraft() {
  if (!namedRouteDraft.value) return
  await runBusy('save-route', async () => {
    const result = await store.saveNamedRoute({ ...namedRouteDraft.value!, driverId: routePlanDriverId.value || namedRouteDraft.value!.driverId || undefined })
    if (!result.ok) { toast(result.message); return }
    if (result.value) {
      namedRouteDraft.value = { id: result.value.id, name: result.value.name, storeIds: [...result.value.storeIds], driverId: result.value.driverId }
      routePlanId.value = result.value.id
      routePlanDriverId.value = result.value.driverId || ''
    }
    invalidateRoutePreview()
    toast('线路模板已保存')
  })
}
function setRoutePlanDriver(event: { detail: { value: string | number } }) {
  routePlanDriverId.value = namedRouteDriverOptions.value[Number(event.detail.value)] || ''
  if (namedRouteDraft.value) namedRouteDraft.value.driverId = routePlanDriverId.value || undefined
  invalidateRoutePreview()
}
watch(() => routePlanDate.value, () => invalidateRoutePreview())
watch(() => [namedRouteDraft.value?.name, namedRouteDraft.value?.storeIds.join(',')], () => {
  if (routePreviewId.value) invalidateRoutePreview()
})
async function previewNamedRoute() {
  const namedRouteId = namedRouteDraft.value?.id
  const driverId = routePlanDriverId.value || namedRouteDraft.value?.driverId || ''
  if (!namedRouteId || !driverId) { toast('请先保存线路并选择启用中的司机'); return }
  routePreviewBusy.value = true
  selectedRouteStopId.value = ''
  const result = await store.optimizeNamedRoute({ namedRouteId, driverId, deliveryDate: routePlanDate.value })
  routePreviewBusy.value = false
  if (!result.ok) { toast(result.message); return }
  routePlanId.value = namedRouteId
  routePreviewId.value = result.value?.id || ''
  toast('路线预览已生成')
}
const selectedRouteStop = computed('selectedRouteStop', () => store.routeDraft?.id === routePreviewId.value
  ? store.routeDraft.stops.find((stop) => stop.storeId === selectedRouteStopId.value) || null
  : null)
function selectRouteStop(storeId: string) {
  selectedRouteStopId.value = storeId
}
function movePreviewStop(index: number, direction: -1 | 1) {
  if (!store.moveRouteStop(index, direction)) return
  selectedRouteStopId.value = store.routeDraft?.stops[index + direction]?.storeId || selectedRouteStopId.value
  toast('已调整门店顺序，距离已重新估算')
}
function routeProviderLabel(provider: string) {
  return provider === 'tencent-direction' ? '腾讯驾车距离' : provider === 'manual' ? '人工顺序 · 直线估算' : '直线估算'
}
async function publishNamedRoute() {
  if (!store.routeDraft || store.routeDraft.id !== routePreviewId.value) return
  routePublishing.value = true
  const result = await store.publishRoute()
  routePublishing.value = false
  toast(result.ok ? '配送线路已发布，订单已批量关联司机' : result.message)
}
function selectDriverRoute(routeId: string) {
  if (!store.selectDriverRoute(routeId)) return
  selectedRouteStopId.value = ''
}
function driverRouteName(route: { namedRouteId?: string; id: string; driverId?: string }) {
  const named = store.namedRoutes.find((item) => item.id === route.namedRouteId)
    || (route.driverId ? store.namedRoutes.find((item) => item.supplierId === store.auth.supplierId && item.driverId === route.driverId) : undefined)
  return named?.name || '今日配送线路'
}
function routeStatusText(order: Order) {
  if (isCourierOrder(order)) return ''
  const storeId = resolveOrderStore(order)?.storeId
  if (!storeId) return '门店资料待维护'
  const route = supplierNamedRoutes.value.find((item) => item.storeIds.includes(storeId))
  return route ? `已在线路中 · ${route.name}` : '待加入线路'
}
function handoverCheckInText(orderId: string) {
  const checkIn = store.dailyRoutes.flatMap((route) => route.stops).find((stop) => stop.orderIds.includes(orderId))?.checkIn
  return checkIn ? `打卡 ${checkIn.distanceM} 米 · ${checkIn.at.replace('T', ' ').slice(0, 16)}` : ''
}
async function checkInAtStop(stop: RouteStop) {
  await runBusy('checkin', async () => {
    const locate = () => new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      wx.getLocation({ type: 'gcj02', success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }), fail: reject })
    })
    try {
      const location = await locate()
      const result = await store.checkInStop(stop.storeId, location)
      toast(result.ok ? `打卡成功，距门店 ${result.value?.distanceM} 米` : result.message)
    } catch {
      toast('无法获取定位，请开启定位权限')
    }
  })
}
async function generateTodayRoutes() {
  routeBusy.value = true
  const result = await store.ensureTodayRoutes()
  routeBusy.value = false
  toast(result.ok ? (result.value?.generated ? `已补生成 ${result.value.generated} 条今日线路` : '今日线路已是最新') : result.message)
}
async function saveWarehouse() {
  const address = warehouseForm.address.trim()
  if (!address) { toast('请输入仓点地址'); return }
  const contactPhone = warehouseForm.contactPhone.trim()
  if (contactPhone && !validatePhone(contactPhone)) { toast('请输入正确的11位联系人手机号'); return }
  await runBusy('warehouse', async () => {
    const located = await geocodeAddress({ address }, createGeocodeProviders({
      tencentProxy: '/api/tencent-map/geocode'
    }))
    if (located.status !== 'resolved') {
      toast(located.reason === 'NOT_CONFIGURED' ? '地址解析未配置' : located.reason === 'TIMEOUT' ? '地址解析超时' : located.reason === 'INVALID_COORDINATE' ? '地址解析坐标无效' : '无法解析该地址')
      return
    }
    const result = await store.updateWarehouse({ address, longitude: located.coordinate.longitude, latitude: located.coordinate.latitude, contactName: warehouseForm.contactName, contactPhone })
    toast(result.ok ? '仓点已保存' : result.message)
  })
}
function stopItemCount(stop: RouteStop) {
  return store.orders.filter((order) => stop.orderIds.includes(order.id)).reduce((sum, order) => sum + (order.items || []).reduce((count, item) => count + item.quantity, 0), 0)
}
function stopOrders(stop: RouteStop) { return store.orders.filter((order) => stop.orderIds.includes(order.id)) }
function stopSegment(route: DailyDeliveryRoute, stop: RouteStop) {
  return route.segments?.find((segment) => segment.toStoreId === stop.storeId)?.distanceKm
}
function stopEstimatedMinutes(route: DailyDeliveryRoute, index: number) {
  return Math.ceil(route.estimatedDurationMinutes * (index + 1) / Math.max(1, route.stops.length))
}
function navigateToDestination(name: string, destination: { address: string; longitude?: number; latitude?: number }) {
  if (destination.longitude !== undefined && destination.latitude !== undefined) {
    wx.openLocation({ longitude: destination.longitude, latitude: destination.latitude, name, address: destination.address })
  } else {
    wx.showToast({ title: '坐标待维护，请按地址搜索导航', icon: 'none' })
  }
}

function navigateToStop(stop: RouteStop) { navigateToDestination(stop.storeName, stop) }

function taskDistanceText(order: Order) {
  const distance = deliveryDistanceKm(supplierWarehouseOf(store.auth.supplierId, store.suppliers) || {}, storeInfoOf(order))
  return distance === null ? '距离待补充' : `约 ${distance.toFixed(1)} km`
}

function navigateToStore(order: Order) {
  navigateToDestination(order.storeName || order.customer, storeInfoOf(order))
}
function orderShortage(order: Order): ShortageItem[] {
  return order.supplierFulfillment?.shortages || []
}
function handoversOf(order: Order) {
  return order.supplierFulfillment?.handovers || []
}
function isCourierOrder(order: Order) {
  const source = order.supplierOrderLink?.source
  return source === 'c-mall' || source === 'farmhouse-courier'
}
function courierSourceLabel(order: Order) {
  return order.supplierOrderLink?.source === 'farmhouse-courier' ? '门店快递' : 'C端商城'
}
function recipientLabel(order: Order) {
  return isCourierOrder(order) ? order.supplierOrderLink?.deliveryAddress?.receiver || order.customer.replace(/ · C端商城$/, '') : order.customer
}
function addressLabel(order: Order) {
  const address = order.supplierOrderLink?.deliveryAddress
  return address ? `${address.region} ${address.detail} · ${address.receiver} ${address.phone}` : `${storeInfoOf(order).address} · ${storeInfoOf(order).contact} ${storeInfoOf(order).phone}`
}
function statusText(status: string, order?: Order) {
  if (order && isCourierOrder(order) && status === 'cancelled' && order.status === 'after-sale') return '售后处理中'
  return store.statusText(status)
}
const fulfillmentSteps = ['submitted', 'accepted', 'shipped', 'delivering', 'received']
function stepIndex(order: Order) {
  return fulfillmentSteps.indexOf(orderFulfillment(order).status)
}
function stepLabel(step: string) {
  return store.statusText(step)
}

async function runAction(key: string, order: Order) {
  if (key === 'accept') {
    await runBusy('accept', async () => {
      if (await store.acceptOrder(order.id)) toast('已接单')
      closeSheet()
    })
    return
  }
  if (key === 'courier') { openCourier(order); return }
  if (key === 'assign-driver') { selectDriverForOrder(order); return }
  if (key === 'driver-ship') {
    await runBusy('driver-ship', async () => {
      if (await store.shipDriverApi(order.id)) toast('已交由司机配送')
      else toast(store.error || '司机配送发货失败')
    })
    return
  }
  if (key === 'handover-out') { openHandoverOut(order); return }
  if (key === 'courier-delivered') {
    await runBusy('courier-delivered', async () => {
      if (await store.markCourierDelivered(order.id)) toast('已确认快递签收')
      closeSheet()
    })
  }
}

function selectDriverForOrder(order: Order, offset = 0) {
  const drivers = store.assignableDriversForOrder(order)
  if (!drivers.length) { toast('请先创建并启用司机账号'); return }
  const pageSize = 4
  const page = drivers.slice(offset, offset + pageSize)
  const previous = offset > 0
  const next = offset + pageSize < drivers.length
  const choices = [...(previous ? ['上一页'] : []), ...page.map((driver) => `${driver.name}（${driver.account}）`), ...(next ? ['下一页'] : [])]
  wx.showActionSheet({ itemList: choices, success: ({ tapIndex }: { tapIndex: number }) => {
    if (previous && tapIndex === 0) { selectDriverForOrder(order, offset - pageSize); return }
    const index = tapIndex - Number(previous)
    if (next && index === page.length) { selectDriverForOrder(order, offset + pageSize); return }
    const selected = page[index]
    if (!selected) return
    void runBusy('assign-driver', async () => {
      const assigned = order.supplierFulfillment?.driverId
        ? await store.reassignDriver(order.id, selected.id)
        : await store.assignDriver(order.id, selected.id)
      toast(assigned ? '司机已指派' : store.error || '指派司机失败')
    })
  } })
}

function toggleSelect(id: string) {
  const index = selectedOrderIds.value.indexOf(id)
  if (index >= 0) selectedOrderIds.value.splice(index, 1)
  else selectedOrderIds.value.push(id)
}
async function batchAccept() {
  await runBusy('batch-accept', async () => {
    const count = await store.batchAcceptOrders([...selectedOrderIds.value])
    selectedOrderIds.value = []
    toast(`已批量接单 ${count} 单`)
  })
}
function openOrder(order: Order) {
  selectedOrder.value = order
  sheet.value = 'order'
}
function hasUnhandledShortage(order: Order) {
  return orderShortage(order).some((item) => !item.handled)
}
async function markHandled(skuId: string) {
  const orderId = selectedOrder.value?.id
  if (!orderId) return
  await runBusy('mark-handled', async () => {
    if (await store.markShortageHandled(orderId, skuId)) {
      selectedOrder.value = store.orders.find((order) => order.id === orderId) || selectedOrder.value
      toast('已标记补发')
    }
  })
}
function askResetDemo() {
  sheet.value = 'reset-confirm'
}
async function confirmResetDemo() {
  await runBusy('reset-demo', async () => {
    await store.resetDemoData()
    closeSheet()
    active.value = 'orders'
    toast('演示数据已重置')
  })
}
function closeSheet() {
  sheet.value = null
  selectedOrder.value = null
  courierTracking.value = ''
  handoverNote.value = ''
  handoverResult.value = null
  driverFormError.value = ''
  editingDriver.value = null
  resetPassword.value = ''
  driverStatusTarget.value = null
  resetActuals()
}

const courierTracking = ref('courierTracking', '')
function openCourier(order: Order) {
  selectedOrder.value = order
  courierTracking.value = ''
  sheet.value = 'courier'
}
async function confirmCourier() {
  if (!selectedOrder.value) return
  await runBusy('courier', async () => {
    if (await store.shipCourier(selectedOrder.value!.id)) {
      toast('已快递直发')
      closeSheet()
    }
  })
}

const actuals = reactive<Record<string, number>>('actuals', {})
const handoverNote = ref('handoverNote', '')
const handoverResult = ref<{ shortages: ShortageItem[] } | null>('handoverResult', null)
function resetActuals() {
  Object.keys(actuals).forEach((key) => { delete actuals[key] })
}
function openHandoverOut(order: Order) {
  selectedOrder.value = order
  handoverResult.value = null
  resetActuals()
  order.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
  handoverNote.value = ''
  sheet.value = 'handover-out'
}
async function confirmHandoverOut() {
  if (!selectedOrder.value) return
  await runBusy('handover-out', async () => {
    const result = await store.handoverOut(selectedOrder.value!.id, { ...actuals }, handoverNote.value.trim() || undefined)
    if (result.ok) {
      handoverResult.value = { shortages: result.shortages }
      toast(result.shortages.length ? `交接完成，缺货 ${result.shortages.length} 项` : '出库交接完成')
    }
  })
}
async function confirmHandoverIn() {
  if (!selectedOrder.value) return
  await runBusy('handover-in', async () => {
    if (await store.handoverIn(selectedOrder.value!.id, handoverNote.value.trim() || undefined)) {
      toast('到店交接完成')
      closeSheet()
    }
  })
}
function openDriverHandover(order: Order) {
  selectedOrder.value = order
  handoverNote.value = ''
  sheet.value = 'handover-in'
}

// ---------- 司机管理 ----------
const driverSearch = ref('driverSearch', '')
const driverStatusFilter = ref('driverStatusFilter', '全部')
const driverStatusFilters = ['全部', '启用', '停用']
const filteredDrivers = computed('filteredDrivers', () => store.visibleDrivers.filter((driver) => {
  const matchesStatus = driverStatusFilter.value === '全部' || (driverStatusFilter.value === '启用' ? driver.status === 'active' : driver.status === 'disabled')
  const keyword = driverSearch.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${driver.name}${driver.account}${driver.phone || ''}`.toLowerCase().includes(keyword)
  return matchesStatus && matchesKeyword
}))
const driverForm = reactive('driverForm', { name: '', phone: '', account: '', password: '' })
const driverFormError = ref('driverFormError', '')
const editingDriver = ref<DriverAccount | null>('editingDriver', null)
const resetPassword = ref('resetPassword', '')
const driverStatusTarget = ref<DriverAccount | null>('driverStatusTarget', null)

function openDriverForm() {
  editingDriver.value = null
  Object.assign(driverForm, { name: '', phone: '', account: '', password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-form'
}
function openDriverEdit(driver: DriverAccount) {
  editingDriver.value = driver
  Object.assign(driverForm, { name: driver.name, phone: driver.phone || '', account: driver.account, password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-edit'
}
async function saveDriver() {
  await runBusy('save-driver', async () => {
    if (sheet.value === 'driver-form') {
      const result = await store.addDriver({ name: driverForm.name, phone: driverForm.phone, account: driverForm.account, password: driverForm.password })
      if (!result.ok) { driverFormError.value = result.error || '保存失败'; return }
      toast(`司机账号已创建：${driverForm.account}`)
    } else if (editingDriver.value) {
      const saved = getApiClientConfig().dataMode === 'api'
        ? await store.updateDriverApi(editingDriver.value.id, { name: driverForm.name, phone: driverForm.phone })
        : store.updateDriver(editingDriver.value.id, { name: driverForm.name, phone: driverForm.phone })
      if (!saved) {
        driverFormError.value = store.error || '姓名或手机号格式不正确'
        return
      }
      toast('司机信息已保存')
    }
    closeSheet()
  })
}
function openReset(driver: DriverAccount) {
  editingDriver.value = driver
  resetPassword.value = ''
  driverFormError.value = ''
  sheet.value = 'driver-reset'
}
function confirmReset() {
  if (!editingDriver.value) return
  if (resetPassword.value.length < 6 || resetPassword.value.length > 20) {
    driverFormError.value = '密码需 6-20 位'
    return
  }
  void runBusy('reset-password', async () => {
    const saved = getApiClientConfig().dataMode === 'api'
      ? await store.resetDriverPasswordApi(editingDriver.value!.id, resetPassword.value)
      : store.resetDriverPassword(editingDriver.value!.id, resetPassword.value)
    if (!saved) { driverFormError.value = store.error || '密码重置失败'; return }
    toast('密码已重置')
    closeSheet()
  })
}
function askToggle(driver: DriverAccount) {
  driverStatusTarget.value = driver
  sheet.value = 'driver-toggle-confirm'
}
function driverToggleMessage(driver: DriverAccount) {
  if (driver.status !== 'active') return `启用后「${driver.name}」可重新登录。`
  const taskCount = store.driverTaskCounts[driver.id] || 0
  return taskCount > 0
    ? `停用后「${driver.name}」将无法登录，已派任务不受影响。该司机当前有 ${taskCount} 个进行中任务，建议先改派。`
    : `停用后「${driver.name}」将无法登录，已派任务不受影响。`
}
async function confirmToggle() {
  if (!driverStatusTarget.value) return
  const wasActive = driverStatusTarget.value.status === 'active'
  const saved = getApiClientConfig().dataMode === 'api'
    ? await store.toggleDriverStatusApi(driverStatusTarget.value.id)
    : store.toggleDriverStatus(driverStatusTarget.value.id)
  if (!saved) { toast(store.error || '司机状态修改失败'); return }
  toast(wasActive ? '已停用司机' : '已启用司机')
  closeSheet()
}

// ---------- 交接日志 ----------
const handoverFilter = ref('handoverFilter', '全部')
const handoverDriverFilter = ref('handoverDriverFilter', '全部')
const handoverTypeFilters = ['全部', '出库交接', '到店交接']
const handoverDriverFilters = computed('handoverDriverFilters', () => ['全部', ...store.visibleDrivers.map((driver) => driver.name)])
const filteredHandovers = computed('filteredHandovers', () => store.allHandovers.filter((log) => {
  const matchesType = handoverFilter.value === '全部' || (handoverFilter.value === '出库交接' ? log.type === 'out' : log.type === 'in')
  const matchesDriver = handoverDriverFilter.value === '全部' || log.operatorName === handoverDriverFilter.value
  return matchesType && matchesDriver
}))
const handoverKeyword = ref('handoverKeyword', '')
type DriverAuxFilterSnapshot = { date: string; dataKeyword: string; handoverKeyword: string }
let driverAuxFilterSnapshot: DriverAuxFilterSnapshot = { date: todayString(), dataKeyword: '', handoverKeyword: '' }
const filteredMyHandovers = computed('filteredMyHandovers', () => {
  const keyword = handoverKeyword.value.trim().toLowerCase()
  if (!keyword) return store.myHandovers
  return store.myHandovers.filter((log) => [
    log.orderId,
    log.customer,
    log.operatorName,
    log.operatorRole === 'driver' ? '司机' : '供应商',
    log.type === 'out' ? '出仓交接' : '到店交接',
    log.time,
    log.note,
    log.shortageCount ? `缺货 ${log.shortageCount} 项` : ''
  ].join(' ').toLowerCase().includes(keyword))
})
const recentHandovers = computed('recentHandovers', () => store.allHandovers.slice(0, 5))

// ---------- 司机工作区 ----------
const currentDriverWarehouse = computed('currentDriverWarehouse', () => supplierWarehouseOf(store.auth.supplierId, store.suppliers))
const driverDoneToday = computed('driverDoneToday', () => {
  const today = new Date().toLocaleDateString('zh-CN')
  return store.myHistory.filter((order) => order.supplierFulfillment?.handovers.some((log) => log.type === 'in' && log.time.includes(today))).length
})

onMounted(() => {
  refreshProductCategoryLabels()
  const e2eEnabled = Boolean((globalThis as unknown as { __AGRITAINMENT_VITE_E2E__?: boolean }).__AGRITAINMENT_VITE_E2E__)
  if (e2eEnabled) {
    const e2eWindow = globalThis as typeof globalThis & { __agritainmentE2E?: { setRouteProviderFailure: (enabled: boolean) => void } }
    e2eWindow.__agritainmentE2E = {
      setRouteProviderFailure(enabled) {
        configurePlatformProviders(enabled
          ? { routeOptimization: { async optimize() { return { ok: false, code: 'e2e_route_provider_failed', message: 'E2E route provider failure' } } } }
          : {})
      }
    }
  }
  if (!e2eEnabled) configurePlatformProviders({ routeOptimization: createDrivingRouteOptimizationProvider() })
  void store.initialize().then(async () => {
    if (getApiClientConfig().dataMode !== 'api') {
      seedSupplierDemoRouteOnce()
      if (store.auth.isLoggedIn) await store.ensureTodayRoutes()
    }
  })
  disposeKeyboardButtons = installKeyboardButtonSupport()
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
})
onBeforeUnmount(() => {
  disposePlatformChanges?.()
  disposePlatformChanges = null
  disposeKeyboardButtons()
})


const handlerMap: Record<string, (...args: any[]) => any> = { addSupplierSku, addressLabel, askResetDemo, askToggle, batchAccept, callStore, canMoveDriverStop, cancelProductEditor, checkInAtStop, checkInWarehouse, closeDriverAux, closeDriverOutbound, closeDriverRoute, closeDriverShortage, closeDriverStore, closeDriverWarehouse, closeNamedRouteEditor, closeOutboundRoute, closeProductWorkspace, closeSecondaryWorkspace, closeSheet, confirmCourier, confirmHandoverIn, confirmHandoverOut, confirmReset, confirmResetDemo, confirmToggle, courierSourceLabel, dispatchDriverRoute, disposeKeyboardButtons, driverAllocationKey, driverItemStores, driverOrderCompletedAt, driverOrderRoute, driverOrderRouteName, driverRouteName, driverRouteProgress, driverRouteStage, driverRouteStageText, driverShortageRemaining, driverStopStage, driverStopStageText, driverToggleMessage, generateTodayRoutes, getCurrentLocation, handoverCheckInText, handoverDriverStop, handoversOf, hasUnhandledShortage, initializeDriverShortageDraft, invalidateRoutePreview, isAbnormalWarehouseCheckIn, isCourierOrder, isOutboundItemExpanded, isTabActive, logout, markDriverShortages, markHandled, moveDriverStop, moveNamedRouteStore, movePreviewStop, namedRouteDriverName, namedRouteLabelForDriver, navigateToDestination, navigateToStop, navigateToStore, openCourier, openDriverAux, openDriverEdit, openDriverForm, openDriverHandover, openDriverOutbound, openDriverRoute, openDriverRouteAction, openDriverShortage, openDriverStore, openDriverWarehouse, openHandoverOut, openNamedRouteEditor, openNewProduct, openOrder, openOutboundRoute, openProductEditor, openProductWorkspace, openReset, openSecondaryWorkspace, orderFulfillment, orderShortage, outboundHasShortage, outboundItemActual, outboundItemStoreActualText, outboundItemStoreExpected, outboundItemStoreNote, outboundRouteOrders, outboundStatusText, previewNamedRoute, productChannelLabel, productStatusCount, publishNamedRoute, recipientLabel, refreshProductCategoryLabels, refreshWarehouseDistance, rejectSupplierOutbound, removeSupplierSku, resetActuals, resetNumberRecord, restoreDriverAuxFilters, restoreSupplierSku, reviewSupplierOutbound, routeActionLabel, routeDriverName, routeExecutionStatus, routeGoodsKinds, routeGoodsQuantity, routeProviderLabel, routePublishedStatus, routeStatusText, routeWarehouse, runAction, runBusy, saveDriver, saveDriverAuxFilters, saveNamedRouteDraft, saveSupplierProductStock, saveWarehouse, selectDriverRoute, selectProductCategory, selectRouteStop, setDriverDataDate, setProductChannel, setProductFilter, setRoutePlanDriver, statusText, stepIndex, stepLabel, stopContainsSku, stopEstimatedMinutes, stopItemCount, stopOrders, stopSegment, storeSkuQuantity, storeSkuShortage, storeSkuShortageNote, submitAbnormalWarehouseCheckIn, submitDriverOutbound, submitLogin, submitSupplierProduct, switchLoginRole, switchTab, taskDistanceText, toast, toggleNamedRouteStore, toggleOutboundItem, toggleSelect, toggleSupplierProduct, validateSupplierProduct, warehouseAddress, warehouseCheckInBadgeClass, warehouseCheckInLabel, warehouseCheckInStatusText, warehouseName, warehouseReasonLabel }

function snapshotStore() {
  const snapshot: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(store as unknown as Record<string, unknown>)) {
    const cloned = cloneForView(value)
    if (cloned !== undefined) snapshot[key] = cloned
  }
  return snapshot
}

function staticRoots() {
  const supplierTabView = supplierTabs.map((tab) => ({ ...tab, badge: tab.badge() }))
  const warehouseBySupplier: Record<string, unknown> = {}
  for (const supplier of store.suppliers) warehouseBySupplier[supplier.id] = supplierWarehouseOf(supplier.id, store.suppliers)
  const storeInfoMap: Record<string, unknown> = {}
  for (const storeId of Object.keys(storeDirectory)) storeInfoMap[storeId] = storeInfoOf(storeId)
  const orderMap: Record<string, unknown> = {}
  for (const order of store.orders) orderMap[order.id] = order
  const categoryImages: Record<string, unknown> = {}
  for (const item of productCategoryState.value.items) categoryImages[item.label] = productCategoryImage(item.label, productCategoryState.value)
  const statusTextMap: Record<string, string> = {}
  for (const status of ['submitted','accepted','shipped','delivering','received','completed','cancelled','after-sale','pending-payment']) statusTextMap[status] = store.statusText(status)
  return {
    store: snapshotStore(), storeDirectory, storeInfoMap, warehouseBySupplier, orderMap, categoryImages,
    defaultCategoryImage: defaultProductCategoryImage(), statusTextMap, todayStringValue: todayString(), supplierInfo,
    orderStatusKeys, supplierTabs: supplierTabView, supplierWorkItems, productFilters, productChannelLabels,
    driverRouteFilterOptions, handoverTypeFilters, warehouseAbnormalOptions, fulfillmentSteps
  }
}

function buildViewModel() { return snapshotRoots(staticRoots()) }
function invokeHandler(name: string, args: any[]) { const handler = handlerMap[name]; return handler ? handler(...args) : undefined }

Page({
  data: { vm: buildViewModel() },
  disposeStore: null as null | (() => void),
  onLoad() { this.disposeStore = store.$subscribe(() => this.sync()); runMountedCallbacks(); this.sync() },
  onShow() { this.sync() },
  onUnload() { this.disposeStore?.(); this.disposeStore = null; runUnmountedCallbacks() },
  sync() { runWatchers(); this.setData({ vm: buildViewModel() }) },
  handleEvent(event: any) {
    const dataset = event.currentTarget?.dataset || {}
    if (dataset.self === '1' && event.target !== event.currentTarget) return
    const args: any[] = []
    for (let index = 0; index < 10; index += 1) {
      const key = 'arg' + index
      if (dataset[key] !== undefined) args.push(dataset[key])
      else if (dataset[key + 'Event'] !== undefined) args.push(event)
    }
    let result: unknown
    if (dataset.handler === '__set') setRootPath(dataset.field, dataset.value)
    else if (dataset.handler === '__setDetail') setRootPath(dataset.field, event.detail?.[dataset.detailKey])
    else if (dataset.handler === '__toggle') setRootPath(dataset.field, !getRootValuePath(dataset.field))
    else if (dataset.handler === '__conditional') result = invokeHandler(dataset.condition ? dataset.true : dataset.false, [])
    else if (dataset.handlerExpr) result = invokeHandler(dataset.handlerExpr, [])
    else if (dataset.handler) result = invokeHandler(dataset.handler, args)
    Promise.resolve(result).finally(() => this.sync())
  },
  handleInput(event: any) { setRootPath(event.currentTarget?.dataset?.model, event.detail?.value); this.sync() },
  handleToggleInput(event: any) { setRootPath(event.currentTarget?.dataset?.model, Boolean(event.detail?.value)); this.sync() },
  handleComponentChange(event: any) { setRootPath(event.currentTarget?.dataset?.model, event.detail?.value); this.sync() }
})
