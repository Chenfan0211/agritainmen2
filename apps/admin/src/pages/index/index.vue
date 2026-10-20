<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import type { AdminAccount, AdminMenuKey, AdminPermissionCode, AdminRole, AfterSale, AfterSaleStatus, BusinessMediaValue, CatalogProduct, CatalogProductSubmission, CatalogSku, Category, CommissionRule, DictGroup, DictItem, FarmStore, MediaReference, OperationalReportDimension, Order, OrderFlowEvent, OrderItem, OrderStatus, PlatformAuditLogEntry, PlatformDictionaryState, PricePolicy, Product, ProductType, Promoter, StoreAccount, StorePriceLevel, StoreRole, Supplier, WithdrawalRequest } from '@agritainment/shared'
import { ALL_ADMIN_ACTION_PERMISSIONS, ALL_ADMIN_MENU_KEYS, PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, aggregateOperationalReport, catalogChannelFlags, catalogProductStockWarnings, createId, dashboardRegionChildren, dashboardRegionPath, DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS, defaultProductCategoryImage, derivePlatformMetrics, dictLabel, focusFirstInteractive, formatNumber, getDictOptions, installKeyboardButtonSupport, compareTrendWindows, money, normalizeMediaReference, pendingShareAmount, productCategoryImage, readPlatformAuditLogs, readPlatformDrivers, readPlatformRecoveryQueue, readCatalogStockLogs, readPlatformWithdrawals, readShareConfig, readShareRecords, round2, STORE_PRICE_LEVELS, subscribePlatformChanges, summarizeOperationalReport, todayString, toXlsx, validatePhone, validatePricePolicy } from '@agritainment/shared'
import { BusinessImage, ImageUploader, UI_TYPOGRAPHY, designTokens, getMediaRuntime } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import SearchableSelect from '../../components/SearchableSelect.vue'
import DatePicker from '../../components/DatePicker.vue'
import AdminUsersPanel from '../../components/AdminUsersPanel.vue'
import AdminLeadersPanel from '../../components/AdminLeadersPanel.vue'
import { buildAdminLeaders, buildAdminUsers, buildLeaderCommissionLedger } from '../../data/user-operations'
import type { SearchableSelectOption } from '../../components/searchable-select'
import {
  accountPromotionOptions,
  accountRoleOptions,
  afterSaleTypeOptions,
  afterStatusFilterOptions,
  afterTypeFilterOptions,
  catalogChannelFilterOptions,
  catalogProductSourceOptions,
  catalogProductTypeOptions,
  categoryTypeFilterOptions,
  categoryTypeOptions,
  commissionStatusOptions,
  enabledOptions,
  expressDeliveryOptions,
  farmStatusFilterOptions,
  farmStatusOptions,
  orderAfterOptions,
  orderChannelOptions,
  orderStatusOptions,
  policyTypeOptions,
  productStatusOptions,
  promoterSettleFilterOptions,
  supplierStatusOptions,
  supplierTypeOptions,
  trendRangeOptions
} from './select-options'

import { ADMIN_PERMISSION_GROUPS, matchesAdminTodoItem, useAdminStore } from '../../stores/admin'
import type { AdminTodo } from '../../stores/admin'
import { AdminMediaFinalizeError, catalogProductMediaBindings, dictionaryItemMediaBindings, dictionaryOperationMessage, dictionaryUiPermissions, farmMediaBindings, inheritCatalogSkuImages, persistAndFinalizeAdminMedia, readSupplierQualificationFields, supplierMediaBindings, validateCatalogMedia, validateDictionaryItemImage } from '../../media-dictionary'

type ModuleKey = AdminMenuKey

const store = useAdminStore()
const adminPermissionGroups = ADMIN_PERMISSION_GROUPS
const active = ref<ModuleKey>('dashboard')
const keyword = ref('')
const page = ref(1)
const pageSize = 10
const dialog = ref<'supplier' | 'supplier-edit' | 'supplier-pause' | 'recovery-verify' | 'policy' | 'policy-edit' | 'farm' | 'farm-edit' | 'category' | 'category-edit'  | 'promoter' | 'promoter-edit' | 'after-sale-init' | 'commission' | 'withdrawal-reject' | 'dict' | 'dict-edit' | 'dict-group' | 'dict-group-edit' | 'store-account' | 'store-account-edit' | null>(null)
type WorkPage = { type: 'supplier' | 'supplier-account' | 'role' | 'admin-account'; mode: 'create' | 'edit'; id?: string }
const workPage = ref<WorkPage | null>(null)
const supplierPauseId = ref('')
const supplierPauseReason = ref('')
const supplierAccountForm = reactive({ supplierId: '', account: '', password: '', enabled: true, freezeReason: '' })
const supplierAccountOriginalEnabled = ref(true)
const roleForm = reactive({ id: '', code: '', name: '', menuPermissions: [] as AdminMenuKey[], actionPermissions: [] as AdminPermissionCode[], enabled: true })
const adminAccountForm = reactive({ id: '', account: '', password: '', name: '', roleId: '', enabled: true })
const logKeyword = ref('')
const logResult = ref<'all' | 'success' | 'failure'>('all')
const logFrom = ref('')
const logTo = ref('')
const logActor = ref('')
const logRole = ref('')
const logModule = ref('')
const recoveryTaskId = ref('')
const recoveryResolutionNote = ref('')
const recoveryOutcome = ref<'committed' | 'aborted'>('aborted')
const recoveryOutcomeOptions: SearchableSelectOption[] = [{ value: 'aborted', label: '已恢复原始快照' }, { value: 'committed', label: '已确认目标快照' }]
const platformVersion = ref(0)
type DetailType = 'todos' | 'supplier' | 'order' | 'afterSale' | 'farm' | 'auditLog'
type TierFormRow = { minQty: number; maxQty: number | null | ''; price: number; discountOff: number }
const detail = ref<{ type: DetailType; id?: string } | null>(null)
const form = ref({ id: '', skuId: '', name: '', category: '综合品类', type: 'group' as PricePolicy['type'], scope: '全部门店', discount: 8, tiers: [] as TierFormRow[], spec: '', image: null as BusinessMediaValue | null, images: [] as BusinessMediaValue[], region: '湖南省', address: '', farmCityCode: '', farmDistrictCode: '', farmDetail: '', price: 59.9, cost: 42, stock: 100, source: 'platform' as Product['source'], supplier: '平台自营', result: 'refund' as AfterSale['type'], refundMethod: 'return' as 'return' | 'only', refundMode: 'full' as 'full' | 'ratio' | 'custom', refundRatio: 100, refundAmount: 0, rate: 10, enabled: true, contactPhone: '', brands: '', serviceRegions: '', contact: '', supplierPassword: '', businessLicenseNumber: '', businessLicense: null as BusinessMediaValue | null, permitNumber: '', permit: null as BusinessMediaValue | null, validUntil: '', reviewNote: '运营邀请入驻，等待供应商补充资质', city: '', tags: '', rating: 5, averageSpend: 0, coop: false, farmStatus: 'pending' as FarmStore['status'], categoryType: 'product' as Category['type'], categoryImage: null as BusinessMediaValue | null, level: '', promoterType: '业务员', promoterRegion: '', promoterStatus: 'active' as Promoter['status'], dictCode: '', dictLabel: '', dictSort: 0, dictTone: 'default' as NonNullable<DictItem['tone']>, dictImage: null as BusinessMediaValue | null, dictGroupName: '', dictGroupType: '', accountFarmId: '', accountName: '', accountPhone: '', accountPassword: '', accountRole: 'staff' as StoreRole, accountPromo: false, accountPriceLevel: 'C' as StorePriceLevel, initIssue: '', productType: 'goods' as ProductType, expressDelivery: false, commissionRate: 0, staffCommissionRate: 0, channels: { store: true } })
const period = ref('本月')
const dashboardRange = computed(() => {
  const to = todayString()
  if (period.value === '本周') {
    const date = new Date(`${to}T12:00:00`)
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    const from = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { from, to }
  }
  return { from: `${to.slice(0, 8)}01`, to }
})
const metrics = computed(() => derivePlatformMetrics({ orders: store.orders, products: store.products, farms: store.farms, suppliers: store.suppliers, afterSales: store.afterSales, promoters: store.promoters, filter: dashboardRange.value }))
const supplierResponsibilityTop = computed(() => metrics.value.afterSaleStats.supplierResponsibility[0])
const supplierResponsibilitySummary = computed(() => {
  const list = metrics.value.afterSaleStats.supplierResponsibility
  if (!list.length) return '暂无责任归属'
  return `共 ${list.length} 家责任供应商 · 最高占比 ${list[0].rate}%`
})
const adminTodos = computed(() => store.queryAdminTodos())
const activeTodoFilter = ref<AdminTodo | null>(null)
function matchesActiveTodo(route: ModuleKey, item: { id: string; status?: string; date?: string; amount?: number; trackingNo?: string; skus?: Array<{ stock: number; warningThreshold?: number }>; supplierFulfillment?: { shipType?: string; driverId?: string; trackingNo?: string } }) {
  platformVersion.value
  return matchesAdminTodoItem(activeTodoFilter.value, route, item, readPlatformDrivers() || [])
}
const trendRange = ref<'7d' | '1m' | '3m' | '1y'>('7d')
const nowText = ref('')
const reportToday = todayString()
const reportFrom = ref(`${reportToday.slice(0, 8)}01`)
const reportTo = ref(reportToday)
const reportStoreFilter = ref('')
const reportSupplierFilter = ref('')
const reportCategoryFilter = ref('')
const reportDimension = ref<OperationalReportDimension>('day')
const reportDimensionOptions: SearchableSelectOption[] = [{ value: 'day', label: '按日' }, { value: 'store', label: '按门店' }, { value: 'supplier', label: '按供应商' }, { value: 'category', label: '按品类' }]
const reportFilterError = computed(() => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(reportFrom.value) || !datePattern.test(reportTo.value)) return '请选择有效的起止日期'
  if (reportFrom.value > reportTo.value) return '开始日期不能晚于结束日期'
  return ''
})
function refreshNow() {
  nowText.value = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}
function switchPeriod(value: string) {
  period.value = value
  showToast(`已切换统计周期：${value}`)
}
const supplierKeyword = ref('')
const supplierStatusFilter = ref('全部')
const supplierCategoryFilter = ref('全部')
const orderKeyword = ref('')
const orderStatusFilter = ref('全部')
const orderChannelFilter = ref('全部来源')
const orderAfterFilter = ref('全部')
const orderStoreFilter = ref('')
const afterKeyword = ref('')
const settlementKeyword = ref('')
const settlementSupplierFilter = ref('')
const afterTypeFilter = ref('全部')
const afterStatusFilter = ref('全部')
const farmKeyword = ref('')
const farmStatusFilter = ref('全部门店')
const farmCityFilter = ref('全部城市')
const promoterKeyword = ref('')
const promoterTypeFilter = ref('全部')
const promoterLevelFilter = ref('全部')
const promoterSettleFilter = ref('全部')
const commissionTab = ref('佣金结算')
const commissionTabOptions: { label: string; value: string }[] = ['佣金结算', '提现审核', '供应商结算', '佣金规则', '团长分成', '消费分成'].map((v) => ({ label: v, value: v }))
const commissionKeyword = ref('')
const commissionStatusFilter = ref('全部')
const commissionHistoryPage = ref(1)
const withdrawalStatusFilter = ref('全部')
const withdrawalKeyword = ref('')
const withdrawalVersion = ref(0)
const withdrawalRejectId = ref('')
const withdrawalNote = ref('')
const withdrawalStatusOptions: SearchableSelectOption[] = [{ label: '全部', value: '全部' }, { label: '待审核', value: 'pending' }, { label: '已通过', value: 'approved' }, { label: '已驳回', value: 'rejected' }]
const supplierSettleKeyword = ref('')
const supplierSettleSupplierFilter = ref('')
const ruleKeyword = ref('')
const categoryKeyword = ref('')
const categoryTypeFilter = ref('全部')
const dictTypeTab = ref<string>('productCategory')
const dictKeyword = ref('')
const dictStatusFilter = ref('全部')
const farmTab = ref('门店列表')
const farmAccountFilter = ref('全部')
const storeAccountKeyword = ref('')
const storeAccountStatusFilter = ref('全部')
const roleKeyword = ref('')
const roleStatusFilter = ref('全部')
const roleStatusOptions: SearchableSelectOption[] = [{ label: '全部', value: '全部' }, { label: '启用', value: '启用' }, { label: '停用', value: '停用' }]
const accountKeyword = ref('')
const accountRoleFilter = ref('全部')
const accountStatusFilter = ref('全部')
const accountStatusOptions: SearchableSelectOption[] = [{ label: '全部', value: '全部' }, { label: '启用', value: '启用' }, { label: '停用', value: '停用' }]
const policyKeyword = ref('')
const logResultOptions: SearchableSelectOption[] = [{ label: '全部', value: 'all' }, { label: '成功', value: 'success' }, { label: '失败', value: 'failure' }]
const afterReasonFilter = ref('全部')
const productKeyword = ref('')
const productSupplierFilter = ref('')
const productSourceFilter = ref('全部')
const productCategoryFilter = ref('全部')
const productStatusFilter = ref('全部')
const productChannelFilter = ref<'all' | 'store' | 'live'>('all')
const productReviewFilter = ref<'正式商品' | '待审核' | '已驳回'>('正式商品')
const productReviewFilters = ['正式商品', '待审核', '已驳回'] as const
const productReviewOptions: { label: string; value: string }[] = productReviewFilters.map((v) => ({ label: v, value: v }))
/** 库存预警筛选（清单「库存预警」）：与待办 stock-warning 跳转共用同一判定。 */
const productStockFilter = ref<'全部' | '仅预警'>('全部')
const productStockFilterOptions: SearchableSelectOption[] = [{ value: '全部', label: '全部库存' }, { value: '仅预警', label: '仅库存预警' }]
const stockLogVersion = ref(0)
const editingProductStockLogs = computed(() => {
  stockLogVersion.value
  const productId = catalogProductForm.id
  if (!productId) return []
  return readCatalogStockLogs().filter((entry) => entry.productId === productId).slice(0, 8)
})
const productRejectTarget = ref<CatalogProductSubmission | null>(null)
const productRejectReason = ref('')
const catalogProductDialog = ref(false)
const persistedCatalogSkuIds = ref<Set<string>>(new Set())
type CatalogSkuDraft = Omit<CatalogSku, 'image'> & { image: BusinessMediaValue | null }
type CatalogProductDraft = Omit<CatalogProduct, 'tags' | 'skus' | 'image' | 'images'> & { image: BusinessMediaValue | null; images: BusinessMediaValue[]; tags: string; skus: CatalogSkuDraft[] }
const catalogProductForm = reactive<CatalogProductDraft>({ id: '', name: '', category: '土特产', supplierId: '', supplierName: '', source: 'platform', status: 'active', image: null, images: [], tags: '', productType: 'goods', expressDelivery: false, channel: 'store', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3, skus: [] })
const pricingDefaultsForm = reactive({ promoterCommissionRate: 5, storeCommissionRate: 3, level1Amount: 10, level2Amount: 15 })
/** 门店 / 业务员档位折让表单（百分数，保存时折算为系数写入价格默认值）。 */
const storePriceLevelForm = reactive<Record<StorePriceLevel, number>>({ A: 95, B: 97, C: 100 })
const afterTab = ref('售后工单')
const busy = ref(false)
const operationKeys = ref<Record<string, boolean>>({})
let pendingCreateMediaRetry: { dialog: 'supplier' | 'supplier-edit' | 'farm' | 'farm-edit' | 'category' | 'category-edit' | 'dict' | 'dict-edit'; retryFinalize: () => Promise<void> } | null = null
let overlayTrigger: HTMLElement | null = null
let disposeKeyboardButtons: () => void = () => undefined
let disposeStorageSync: (() => void) | null = null
let disposePlatformChanges: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null
const trendEl = ref<HTMLElement | null>(null)
const categoryEl = ref<HTMLElement | null>(null)
let trendChart: ECharts | null = null
let categoryChart: ECharts | null = null

const navItems: Array<{ key: ModuleKey; label: string; icon: string; badge?: () => number }> = [
  { key: 'dashboard', label: '数据看板', icon: 'layout-dashboard' },
  { key: 'reports', label: '经营报表', icon: 'chart-no-axes-combined' },
  { key: 'suppliers', label: '供应商管理', icon: 'factory', badge: () => store.pendingSuppliers },
  { key: 'products', label: '商品库管理', icon: 'package', badge: () => store.pendingProducts },
  { key: 'categories', label: '品类管理', icon: 'list-tree' },
  { key: 'prices', label: '价格体系', icon: 'tags' },
  { key: 'orders', label: '订单履约', icon: 'truck', badge: () => store.pendingOrders },
  { key: 'afterSales', label: '售后结算', icon: 'headset', badge: () => store.pendingAfterSales },
  { key: 'farms', label: '门店管理', icon: 'store' },
  { key: 'promoters', label: '业务员管理', icon: 'megaphone' },
  { key: 'commissions', label: '佣金结算', icon: 'badge-percent' },
  { key: 'users', label: '用户信息', icon: 'user-round' },
  { key: 'leaders', label: '团长管理', icon: 'users' },
  { key: 'dict', label: '字典数据', icon: 'book-open' },
  { key: 'logs', label: '操作日志', icon: 'book-open' },
  { key: 'roles', label: '角色管理', icon: 'shield-check' },
  { key: 'accounts', label: '账号管理', icon: 'users' }
]

const navGroupDefinitions = [
  { name: '平台总览', items: navItems.filter((item) => ['dashboard', 'reports'].includes(item.key)) },
  { name: '供应链', items: navItems.filter((item) => ['suppliers', 'products', 'categories', 'prices', 'orders', 'afterSales', 'farms', 'promoters', 'commissions'].includes(item.key)) },
  { name: '用户运营', items: navItems.filter((item) => ['users', 'leaders'].includes(item.key)) },
  { name: '系统', items: navItems.filter((item) => ['dict', 'logs', 'roles', 'accounts'].includes(item.key)) }
]
const navGroups = computed(() => navGroupDefinitions.map((group) => ({ ...group, items: group.items.filter((item) => store.canMenu(item.key)) })).filter((group) => group.items.length))

const titles: Record<ModuleKey, { title: string; subtitle: string }> = {
  dashboard: { title: '数据看板', subtitle: '平台经营全景与实时待办' },
  reports: { title: '经营报表', subtitle: '按时间、门店、供应商与品类分析有效订单' },
  suppliers: { title: '供应商管理', subtitle: '供应商入驻、资质审核与合作状态' },
  products: { title: '商品库管理', subtitle: '按展示端维护商品 · 覆盖门店订货端与用户端' },
  categories: { title: '品类管理', subtitle: '商品品类与供应商品类统一维护 · 支持新增、修改与删除' },
  prices: { title: '价格体系', subtitle: '阶梯价格与分销价格统一维护 · 帮助门店降低采购成本' },
  orders: { title: '订单履约', subtitle: '订单、库存、发货、配送统一管理 · 支持批量发货' },
  afterSales: { title: '售后结算', subtitle: '统一售后服务与结算分账 · 减少门店履约压力' },
  farms: { title: '门店管理', subtitle: '门店入驻、经营状态与门店账号' },
  promoters: { title: '业务员管理', subtitle: '业务员资源、负责区域与拓店效果统计' },
  commissions: { title: '佣金结算', subtitle: '佣金规则配置与结算流水 · 含供应商结算记录' },
  users: { title: '用户信息', subtitle: '用户资料、团长绑定链路与消费记录' },
  leaders: { title: '团长管理', subtitle: '一级 / 二级团长资料、下级关系、团长价格与分佣提现' },
  dict: { title: '字典数据', subtitle: '城市信息 · 售后原因 · 数据状态统一维护' },
  logs: { title: '操作日志', subtitle: '业务操作、认证、权限拒绝与写入失败记录' },
  roles: { title: '角色管理', subtitle: '按单角色配置后台菜单和按钮权限' },
  accounts: { title: '账号管理', subtitle: '后台账号、角色绑定和启停状态' }
}

const auditLogEntries = computed(() => {
  platformVersion.value
  return readPlatformAuditLogs()
})
const filteredAuditLogs = computed<PlatformAuditLogEntry[]>(() => {
  const keyword = logKeyword.value.trim().toLowerCase()
  return auditLogEntries.value.filter((entry) => {
    const localDate = new Date(entry.createdAt)
    const date = Number.isNaN(localDate.getTime()) ? '' : `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
    return (logResult.value === 'all' || entry.result === logResult.value)
      && (!logFrom.value || date >= logFrom.value)
      && (!logTo.value || date <= logTo.value)
      && (!logActor.value || entry.actorId === logActor.value)
      && (!logRole.value || entry.actorRole === logRole.value)
      && (!logModule.value || entry.module === logModule.value)
      && (!keyword || `${entry.actorName || ''}${entry.actorId}${entry.module}${entry.action}${entry.targetId || ''}${entry.reason || ''}`.toLowerCase().includes(keyword))
  })
})
const logActorOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '全部操作人' }, ...[...new Map(auditLogEntries.value.map((entry) => [entry.actorId, entry.actorName || entry.actorId])).entries()].map(([value, label]) => ({ value, label }))])
const logRoleOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '全部角色' }, ...[...new Set(auditLogEntries.value.map((entry) => entry.actorRole).filter(Boolean))].map((value) => ({ value: value!, label: value! }))])
const logModuleOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '全部模块' }, ...[...new Set(auditLogEntries.value.map((entry) => entry.module).filter(Boolean))].map((value) => ({ value, label: value }))])
const adminRoleOptions = computed<SearchableSelectOption[]>(() => store.adminRoles.filter((role) => role.enabled).map((role) => ({ value: role.id, label: role.name })))
const adminMenuLabels: Record<AdminMenuKey, string> = Object.fromEntries(navItems.map((item) => [item.key, item.label])) as Record<AdminMenuKey, string>

const filteredSuppliers = computed(() => store.suppliers.filter((item) => {
  const matchesGlobal = `${item.name}${item.region}${item.category}`.includes(keyword.value)
  const q = supplierKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || item.name.toLowerCase().includes(q)
  const matchesCategory = supplierCategoryFilter.value === '全部' || item.category === supplierCategoryFilter.value
  const matchesStatus = supplierStatusFilter.value === '全部' || (supplierStatusFilter.value === '待审核' && item.status === 'pending') || (supplierStatusFilter.value === '已合作' && item.status === 'cooperating') || (supplierStatusFilter.value === '已停用' && item.status === 'paused') || (supplierStatusFilter.value === '供销社' && item.coop)
  return matchesGlobal && matchesKeyword && matchesCategory && matchesStatus && matchesActiveTodo('suppliers', item)
}))
const filteredProducts = computed(() => store.products.filter((item) => {
  const matchesGlobal = `${item.name}${item.category}${item.supplier}`.includes(keyword.value)
  const q = productKeyword.value.trim().toLowerCase()
  const matchesProductKeyword = !q || item.name.toLowerCase().includes(q)
  const matchesSource = productSourceFilter.value === '全部' || item.source === productSourceFilter.value
  const matchesCategory = productCategoryFilter.value === '全部' || item.category === productCategoryFilter.value
  const matchesStatus = productStatusFilter.value === '全部' || item.status === productStatusFilter.value
  return matchesGlobal && matchesProductKeyword && matchesSource && matchesCategory && matchesStatus && matchesActiveTodo('products', item)
}))
const filteredOrders = computed(() => store.orders.filter((item) => {
  const matchesGlobal = `${item.id}${item.productName}${item.customer}`.includes(keyword.value)
  const q = orderKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.id}${item.productName}${item.customer}`.toLowerCase().includes(q)
  const matchesStore = !orderStoreFilter.value || item.customer === orderStoreFilter.value
  const channelMap = { '商城': 'shop', '用户端': 'live', '进货': 'purchase' } as Record<string, Order['channel']>
  const matchesChannel = orderChannelFilter.value === '全部来源' || item.channel === channelMap[orderChannelFilter.value]
  const after = store.afterSales.find((a) => a.orderId === item.id)
  const afterStatusMap = { '未发起': 'none', '售后中': 'processing', '售后拒绝': 'rejected', '待退款': 'refund-pending', '待退货': 'return-pending', '已退款': 'refunded', '退款失败': 'refund-failed' } as Record<string, string>
  const matchesAfter = orderAfterFilter.value === '全部' || (orderAfterFilter.value === '未发起' ? !after : after?.status === afterStatusMap[orderAfterFilter.value])
  return matchesGlobal && matchesKeyword && matchesStore && matchesChannel && matchesAfter && matchesActiveTodo('orders', item)
}))
const visibleOrders = computed(() => {
  if (orderStatusFilter.value === '待发货') return filteredOrders.value.filter((item) => item.status === 'pending')
  if (orderStatusFilter.value === '已发货') return filteredOrders.value.filter((item) => item.status === 'shipping')
  if (orderStatusFilter.value === '已完成') return filteredOrders.value.filter((item) => item.status === 'delivered' || item.status === 'after-sale')
  if (orderStatusFilter.value === '已支付取消') return filteredOrders.value.filter((item) => item.status === 'paid-cancelled')
  if (orderStatusFilter.value === '未支付取消') return filteredOrders.value.filter((item) => item.status === 'unpaid-cancelled')
  return filteredOrders.value
})
const filteredPolicies = computed(() => store.policies.filter((item) => {
  const matchesGlobal = `${item.name}${item.scope}${item.type}`.includes(keyword.value)
  const q = policyKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.scope}${item.type}`.toLowerCase().includes(q)
  return matchesGlobal && matchesKeyword
}))
const filteredRoles = computed(() => store.adminRoles.filter((item) => {
  const q = roleKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.code}`.toLowerCase().includes(q)
  const matchesStatus = roleStatusFilter.value === '全部' || (roleStatusFilter.value === '启用' ? item.enabled : !item.enabled)
  return matchesKeyword && matchesStatus
}))
const filteredAdminAccounts = computed(() => store.adminAccounts.filter((item) => {
  const q = accountKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.account}${item.name}`.toLowerCase().includes(q)
  const matchesRole = accountRoleFilter.value === '全部' || item.roleId === accountRoleFilter.value
  const matchesStatus = accountStatusFilter.value === '全部' || (accountStatusFilter.value === '启用' ? item.enabled : !item.enabled)
  return matchesKeyword && matchesRole && matchesStatus
}))
const accountRoleFilterOptions = computed<SearchableSelectOption[]>(() => [{ value: '全部', label: '全部角色' }, ...store.adminRoles.map((role) => ({ value: role.id, label: role.name }))])
/** 业务员档位选项：折让来自价格体系「分销价层级折让」。 */
const accountPriceLevelOptions = computed<SearchableSelectOption[]>(() => {
  const discounts = store.pricingDefaults.storePriceLevelDiscounts || DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS
  return STORE_PRICE_LEVELS.map((level) => ({ value: level, label: `业务员 ${level} 档 · 按 ${Math.round((discounts[level] ?? 1) * 100)}% 计价` }))
})
const dictionaryState = computed<PlatformDictionaryState>(() => ({
  schemaVersion: 2,
  revision: store.dictionaryRevision,
  groups: store.dictGroups,
  items: store.dictItems,
  updatedAt: store.dictionaryUpdatedAt
}))
const dictionaryItems = (type: string) => getDictOptions(type, { state: dictionaryState.value })
const filteredAfterSales = computed(() => store.afterSales.filter((item) => {
  const matchesGlobal = `${item.id}${item.orderId}${item.productName}${item.applicant}`.includes(keyword.value)
  const q = afterKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.id}${item.orderId}${item.productName}${item.applicant}`.toLowerCase().includes(q)
  const matchesType = afterTypeFilter.value === '全部' || item.type === afterTypeFilter.value
  const matchesReason = afterReasonFilter.value === '全部' || (item.issue || '').includes(afterReasonFilter.value)
  const matchesStatus = afterStatusFilter.value === '全部' || item.status === afterStatusFilter.value
  return matchesGlobal && matchesKeyword && matchesType && matchesReason && matchesStatus && matchesActiveTodo('afterSales', item)
}))
const afterReasonOptions = computed(() => dictionaryItems('afterSaleReason').map((item) => item.label))
const filteredFarms = computed(() => store.farms.filter((item) => {
  if (item.id === 'F004') return false
  const matchesGlobal = `${item.name}${item.region}${item.tags.join('')}`.includes(keyword.value)
  const q = farmKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || item.name.toLowerCase().includes(q)
  const matchesStatus = farmStatusFilter.value === '全部门店' || (farmStatusFilter.value === '试点样板' && item.id === 'F001') || (farmStatusFilter.value === '经营中' && item.status === 'active') || (farmStatusFilter.value === '筹备中' && item.status === 'pending') || (farmStatusFilter.value === '已停用' && item.status === 'paused')
  const matchesCity = farmCityFilter.value === '全部城市' || item.city === farmCityFilter.value
  return matchesGlobal && matchesKeyword && matchesStatus && matchesCity
}))
const farmCityOptions = computed(() => dashboardRegionChildren('43').map((item) => item.name))
const filteredPromoters = computed(() => store.promoters.filter((item) => {
  const matchesGlobal = `${item.name}${item.level}`.includes(keyword.value)
  const q = promoterKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || item.name.toLowerCase().includes(q)
  const matchesType = promoterTypeFilter.value === '全部' || item.type === promoterTypeFilter.value
  const matchesLevel = promoterLevelFilter.value === '全部' || item.level === promoterLevelFilter.value
  const matchesSettle = promoterSettleFilter.value === '全部' || (promoterSettleFilter.value === '已结算') === !!item.settled
  return matchesGlobal && matchesKeyword && matchesType && matchesLevel && matchesSettle
}))
const visiblePromoters = computed(() => [...filteredPromoters.value].sort((a, b) => b.commission - a.commission))
const pagedSuppliers = computed(() => filteredSuppliers.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const productRows = computed(() => filteredProducts.value.flatMap((product) => {
  const skus = product.skus?.length ? product.skus : [{ id: `${product.id}-DEFAULT`, name: product.spec || '默认规格', price: product.price, cost: product.cost, stock: product.stock }]
  return skus.map((sku) => ({ key: `${product.id}-${sku.id}`, product, sku }))
}))
const pagedProductRows = computed(() => productRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const unifiedProductRows = computed(() => {
  const q = productKeyword.value.trim().toLowerCase()
  const category = productCategoryFilter.value
  const status = productStatusFilter.value
  const channel = productChannelFilter.value
  return store.catalogProducts.filter((product) => {
    const channels = catalogChannelFlags(product.channel)
    const matchesChannel = channel === 'all' || (channel === 'store' ? channels.store : channels.live)
    const matchesKeyword = !q || product.name.toLowerCase().includes(q)
    const matchesSupplier = !productSupplierFilter.value || product.supplierId === productSupplierFilter.value
    const matchesCategory = category === '全部' || product.category === category
    const matchesStatus = status === '全部' || product.status === status
    const matchesStock = productStockFilter.value === '全部' || catalogProductStockWarnings(product).length > 0
    return matchesChannel && matchesKeyword && matchesSupplier && matchesCategory && matchesStatus && matchesStock && matchesActiveTodo('products', product)
  })
})
const pagedUnifiedProductRows = computed(() => unifiedProductRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const visibleProductSubmissions = computed(() => store.productSubmissions.filter((submission) => {
  const q = productKeyword.value.trim().toLowerCase()
  const matchesReview = productReviewFilter.value === '待审核' ? submission.status === 'pending' : submission.status === 'rejected'
  const matchesKeyword = !q || submission.draft.name.toLowerCase().includes(q)
  const matchesSupplier = !productSupplierFilter.value || submission.supplierId === productSupplierFilter.value || submission.draft.supplierId === productSupplierFilter.value
  return matchesReview && matchesKeyword && matchesSupplier && matchesActiveTodo('products', submission)
}))
const pagedOrders = computed(() => visibleOrders.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const reportStoreOptions = computed<SearchableSelectOption[]>(() => {
  const options = new Map<string, SearchableSelectOption>()
  store.farms.forEach((farm) => options.set(farm.id, { value: farm.id, label: farm.name }))
  store.orders.filter((order) => order.storeId || order.storeName).forEach((order) => {
    const value = order.storeId || order.storeName!
    if (!options.has(value)) options.set(value, { value, label: order.storeName || order.customer })
  })
  return [{ value: '', label: '全部门店' }, ...options.values()]
})
const reportSupplierOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '全部供应商' }, ...store.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))])
const reportCategoryOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '全部品类', image: productCategoryImage('全部', dictionaryState.value), imageFallback: defaultProductCategoryImage('全部'), imageErrorFallback: defaultProductCategoryImage() }, ...Array.from(new Set(store.products.map((product) => product.category).filter(Boolean))).map((category) => ({ value: category, label: category, image: productCategoryImage(category, dictionaryState.value), imageFallback: defaultProductCategoryImage(category), imageErrorFallback: defaultProductCategoryImage() }))])
const reportFilter = computed(() => ({ from: reportFrom.value, to: reportTo.value, store: reportStoreFilter.value || undefined, supplierId: reportSupplierFilter.value || undefined, category: reportCategoryFilter.value || undefined }))
const reportRows = computed(() => reportFilterError.value ? [] : aggregateOperationalReport(store.orders, store.products, reportFilter.value, reportDimension.value))
const reportSummary = computed(() => reportFilterError.value ? { orderCount: 0, itemCount: 0, gmv: 0 } : summarizeOperationalReport(store.orders, store.products, reportFilter.value))
const pagedAfterSales = computed(() => filteredAfterSales.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedFarms = computed(() => filteredFarms.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const filteredStoreAccounts = computed(() => store.storeAccounts.filter((item) => {
  const matchesFarm = farmAccountFilter.value === '全部' || item.farmId === farmAccountFilter.value
  const q = storeAccountKeyword.value.trim().toLowerCase()
  const matchesKeyword = !q || `${item.name}${item.account}`.toLowerCase().includes(q)
  const matchesStatus = storeAccountStatusFilter.value === '全部' || (storeAccountStatusFilter.value === '启用' ? item.enabled : !item.enabled)
  return matchesFarm && matchesKeyword && matchesStatus
}))
const pagedStoreAccounts = computed(() => filteredStoreAccounts.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedPromoters = computed(() => visiblePromoters.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const pagedPolicies = computed(() => filteredPolicies.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const policyGroups = computed(() => {
  const order: PricePolicy['type'][] = ['group', 'ladder']
  return order.map((type) => ({ type, items: pagedPolicies.value.filter((p) => p.type === type) })).filter((g) => g.items.length > 0)
})
const settlementRecords = computed(() => [
  ...store.supplierSettlementRecords.map((r) => ({ ...r, kind: 'supplier' as const })),
  ...store.commissionSettlementRecords.map((r) => ({ ...r, kind: 'commission' as const })),
])
const filteredSettlementRecords = computed(() => {
  const q = settlementKeyword.value.trim().toLowerCase()
  const supplierId = settlementSupplierFilter.value
  return settlementRecords.value.filter((record) => {
    const orders = [
      ...(record.kind === 'supplier' ? record.orderIds : []),
      ...record.items.flatMap((item) => 'orderIds' in item ? item.orderIds : [])
    ]
    const matchesOrder = !q || orders.some((id) => id.toLowerCase().includes(q))
    const matchesSupplier = !supplierId || record.items.some((item) => 'supplierId' in item && item.supplierId === supplierId)
    return matchesOrder && matchesSupplier
  })
})
const pagedSettlementRecords = computed(() => filteredSettlementRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const filteredCommissionRecords = computed(() => {
  const q = commissionKeyword.value.trim().toLowerCase()
  return store.commissionSettlementRecords.filter((record) => {
    const matchesQ = !q || `${record.id}${record.amount}${record.items.map((item) => item.promoterName).join('')}`.toLowerCase().includes(q)
    return matchesQ && matchesActiveTodo('commissions', record)
  })
})
const filteredSupplierRecords = computed(() => {
  const q = supplierSettleKeyword.value.trim().toLowerCase()
  return store.supplierSettlementRecords.filter((record) => {
    const matchesQ = !q || `${record.id}${record.amount}`.toLowerCase().includes(q)
    const matchesSupplier = !supplierSettleSupplierFilter.value || record.items.some((item) => item.supplierId === supplierSettleSupplierFilter.value)
    return matchesQ && matchesSupplier && matchesActiveTodo('commissions', record)
  })
})
const filteredRules = computed(() => {
  const q = ruleKeyword.value.trim().toLowerCase()
  return store.commissionRules.filter((rule) => {
    return !q || rule.name.toLowerCase().includes(q)
  })
})
const pagedCommissionRecords = computed(() => filteredCommissionRecords.value.slice((commissionHistoryPage.value - 1) * pageSize, commissionHistoryPage.value * pageSize))
const filteredPromoterCommissionRows = computed(() => {
  const q = commissionKeyword.value.trim().toLowerCase()
  return store.promoters.filter((item) => {
    const matchesKeyword = !q || `${item.name}${item.level}`.toLowerCase().includes(q)
    const pending = pendingShareAmount(item.id)
    const matchesStatus = commissionStatusFilter.value === '全部' || (commissionStatusFilter.value === '未结算' && pending > 0) || (commissionStatusFilter.value === '已结算' && pending <= 0)
    return matchesKeyword && matchesStatus && matchesActiveTodo('commissions', item)
  })
})
const pagedPromoterCommissionRows = computed(() => filteredPromoterCommissionRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const filteredWithdrawals = computed<WithdrawalRequest[]>(() => {
  withdrawalVersion.value
  const q = withdrawalKeyword.value.trim().toLowerCase()
  return Object.values(readPlatformWithdrawals() || {}).filter((item) => {
    const matchesKeyword = !q || `${item.id}${item.requesterType}${item.requesterId}${item.amount}${item.method}${item.reviewedNote || ''}`.toLowerCase().includes(q)
    const matchesStatus = withdrawalStatusFilter.value === '全部' || item.status === withdrawalStatusFilter.value
    return matchesKeyword && matchesStatus && matchesActiveTodo('commissions', item)
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
})
function withdrawalStatusText(status: WithdrawalRequest['status']) { return status === 'pending' ? '待审核' : status === 'approved' ? '已通过' : '已驳回' }
async function approveWithdrawal(id: string) {
  const result = await store.reviewWithdrawal(id, 'approved')
  if (!result) return showToast(store.error || '该提现申请已处理或不存在')
  withdrawalVersion.value++
  showToast('提现申请已通过')
}
function openWithdrawalReject(id: string) {
  withdrawalRejectId.value = id
  withdrawalNote.value = ''
  dialog.value = 'withdrawal-reject'
}
const pagedSupplierSettlementRecords = computed(() => filteredSupplierRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize))
function settlementLabel(record: (typeof settlementRecords.value)[number]) {
  return record.kind === 'supplier'
    ? `供应商结算 · ${record.items.length} 家供应商 · ${record.orderIds.length} 笔订单`
    : `佣金结算 · ${record.items.length} 位业务员`
}
const selectedSupplier = computed<Supplier | undefined>(() => store.suppliers.find((item) => item.id === detail.value?.id))
const selectedSupplierQualification = computed(() => selectedSupplier.value ? readSupplierQualificationFields(selectedSupplier.value.qualification) : null)
const selectedSupplierAccount = computed(() => store.supplierAccounts.find((item) => item.supplierId === selectedSupplier.value?.id))
const selectedOrder = computed<Order | undefined>(() => store.orders.find((item) => item.id === detail.value?.id))
const selectedAfterSale = computed<AfterSale | undefined>(() => store.afterSales.find((item) => item.id === detail.value?.id))
const selectedAuditLog = computed<PlatformAuditLogEntry | undefined>(() => auditLogEntries.value.find((entry) => entry.id === detail.value?.id))
const selectedFarm = computed<FarmStore | undefined>(() => store.farms.find((item) => item.id === detail.value?.id))
const editingFarm = computed<FarmStore | undefined>(() => store.farms.find((item) => item.id === form.value.id))
const editingDictionaryCategory = computed(() => store.dictItems.some((item) => item.id === form.value.id && item.type === 'productCategory'))
const supplierOptions = computed(() => ['平台自营', ...Array.from(new Set([...store.suppliers.map((item) => item.name), ...store.products.map((item) => item.supplier)]))])
const productCategories = computed(() => dictionaryItems('productCategory').map((item) => ({ id: item.id, name: item.label, type: 'product' as const, image: productCategoryImage(item.code, dictionaryState.value) })))
const managedProductCategories = computed<Category[]>(() => store.dictItems
  .filter((item) => item.type === 'productCategory')
  .sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label))
  .map((item) => ({ id: item.id, name: item.label, type: 'product' })))
const supplierCategories = computed(() => dictionaryItems('supplierCategory').map((item) => ({ id: item.code, name: item.label, type: 'supplier' as const })))
const productCategoryFilterOptions = computed<SearchableSelectOption[]>(() => [
  { value: '全部', label: '全品类', image: productCategoryImage('全部', dictionaryState.value), imageFallback: defaultProductCategoryImage('全部'), imageErrorFallback: defaultProductCategoryImage() },
  ...productCategories.value.map((option) => ({ value: option.name, label: option.name, image: option.image, imageFallback: defaultProductCategoryImage(option.name), imageErrorFallback: defaultProductCategoryImage() }))
])
const productCategoryOptions = computed<SearchableSelectOption[]>(() => productCategories.value.map((option) => ({ value: option.name, label: option.name, image: option.image, imageFallback: defaultProductCategoryImage(option.name), imageErrorFallback: defaultProductCategoryImage() })))
const supplierCategoryOptions = computed<SearchableSelectOption[]>(() => supplierCategories.value.map((option) => ({ value: option.name, label: option.name })))
const supplierCategoryFilterOptions = computed<SearchableSelectOption[]>(() => [{ value: '全部', label: '全部品类' }, ...supplierCategoryOptions.value])
const promoterTypeOptions = computed<SearchableSelectOption[]>(() => [{ value: '全部', label: '全部类型' }, ...dictionaryItems('promoterType').map((item) => ({ value: item.label, label: item.label }))])
const promoterFormTypeOptions = computed<SearchableSelectOption[]>(() => dictionaryItems('promoterType').map((item) => ({ value: item.label, label: item.label })))
const promoterLevelOptions = computed<SearchableSelectOption[]>(() => dictionaryItems('promoterLevel').map((item) => ({ value: item.label, label: item.label })))
const promoterLevelFilterOptions = computed<SearchableSelectOption[]>(() => [{ value: '全部', label: '全部等级' }, ...promoterLevelOptions.value])
const promoterStatusOptions = computed<SearchableSelectOption[]>(() => dictionaryItems('promoterStatus').map((item) => ({ value: item.code, label: item.label })))
const dictionaryToneOptions: SearchableSelectOption[] = [
  { value: 'default', label: '默认' }, { value: 'success', label: '成功' }, { value: 'warning', label: '提醒' }, { value: 'danger', label: '危险' }
]
const afterReasonFilterSelectOptions = computed<SearchableSelectOption[]>(() => [
  { value: '全部', label: '全部原因' },
  ...afterReasonOptions.value.map((reason) => ({ value: reason, label: reason }))
])
const afterReasonSelectOptions = computed<SearchableSelectOption[]>(() => [
  { value: '', label: '请选择原因' },
  ...afterReasonOptions.value.map((reason) => ({ value: reason, label: reason }))
])
const farmCityFilterOptions = computed<SearchableSelectOption[]>(() => [
  { value: '全部城市', label: '全部城市' },
  ...farmCityOptions.value.map((city) => ({ value: city, label: city }))
])
const farmCitySelectOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '请选择城市' }, ...dashboardRegionChildren('43').map((city) => ({ value: city.code, label: city.name }))])
const farmDistrictSelectOptions = computed<SearchableSelectOption[]>(() => [{ value: '', label: '请选择县区' }, ...dashboardRegionChildren(form.value.farmCityCode).map((district) => ({ value: district.code, label: district.name }))])
watch(() => form.value.farmCityCode, (cityCode) => {
  if (form.value.farmDistrictCode && !dashboardRegionChildren(cityCode).some((district) => district.code === form.value.farmDistrictCode)) form.value.farmDistrictCode = ''
})
const farmAccountSelectOptions = computed<SearchableSelectOption[]>(() => [
  { value: '全部', label: '全部门店' },
  ...store.farms.map((farm) => ({ value: farm.id, label: farm.name }))
])
const accountFarmSelectOptions = computed<SearchableSelectOption[]>(() => [
  { value: '', label: '请选择门店' },
  ...store.farms.map((farm) => ({ value: farm.id, label: farm.name }))
])
const catalogSupplierOptions = computed<SearchableSelectOption[]>(() => [
  { value: '', label: '请选择供应商' },
  ...store.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
])
const productSupplierFilterOptions = computed<SearchableSelectOption[]>(() => [
  { value: '', label: '全部供应商' },
  ...store.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
])
const supplierSettleSupplierOptions = computed<SearchableSelectOption[]>(() => {
  const names = new Map<string, string>()
  store.supplierSettlementRecords.forEach((record) => {
    record.items.forEach((item) => names.set(item.supplierId, item.supplierName))
  })
  return [{ value: '', label: '全部供应商' }, ...[...names.entries()].map(([value, label]) => ({ value, label }))]
})
const catalogProductChannelOptions = computed<SearchableSelectOption[]>(() => [
  { value: 'store', label: '门店商品' },
  { value: 'live', label: '用户端商品', disabled: catalogProductForm.productType === 'package' },
  { value: 'all', label: '全部商品', disabled: catalogProductForm.productType === 'package' }
])
const filteredCategories = computed(() => {
  const q = categoryKeyword.value.trim().toLowerCase()
  const managedCategories: Category[] = [
    ...managedProductCategories.value,
    ...store.categories.filter((item) => item.type !== 'product')
  ]
  return managedCategories.filter((item) => {
    const matchesKeyword = !q || item.name.toLowerCase().includes(q)
    const matchesType = categoryTypeFilter.value === '全部' || item.type === categoryTypeFilter.value
    return matchesKeyword && matchesType
  })
})
const pagedCategories = computed(() => filteredCategories.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const activeDictGroup = computed(() => store.dictGroups.find((group) => group.type === dictTypeTab.value))
const activeDictionaryPermissions = computed(() => dictionaryUiPermissions(activeDictGroup.value))
const filteredDictItems = computed(() => {
  const q = dictKeyword.value.trim().toLowerCase()
  return store.dictItems.filter((item) => {
    const matchesType = item.type === dictTypeTab.value
    const matchesKeyword = !q || `${item.code}${item.label}`.toLowerCase().includes(q)
    const matchesStatus = dictStatusFilter.value === '全部' || (dictStatusFilter.value === '启用' ? item.enabled : !item.enabled)
    return matchesType && matchesKeyword && matchesStatus
  })
})
const pagedDictItems = computed(() => filteredDictItems.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const supplierStatCounts = computed(() => ({
  cooperating: store.suppliers.filter((item) => item.status === 'cooperating').length,
  pending: store.suppliers.filter((item) => item.status === 'pending').length,
  coop: store.suppliers.filter((item) => item.coop).length
}))

function isOperating(key: string) {
  return operationKeys.value[key] === true
}

function showToast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function retryLoad() {
  store.setMockScenario('normal')
  store.initialize(true)
}

function selectModule(key: ModuleKey) {
  if (!store.canMenu(key)) return showToast('当前角色无权访问该菜单')
  active.value = key
  activeTodoFilter.value = null
  workPage.value = null
  dialog.value = null
  keyword.value = ''
  page.value = 1
}

function promoterTypeLabel(type?: string) {
  // 本版本只保留「业务员」：推客 / 主播 / 达人 均为历史持久化数据的只读映射。
  return !type || ['推客', '主播', '达人'].includes(type) ? '业务员' : type
}

const batchShipCandidates = computed(() => store.orders.filter((item) => item.status === 'pending'))
const promoterBizStats = computed(() => {
  const farmsWithOrders = new Set(store.orders.map((item) => item.storeId).filter(Boolean))
  return {
    developedStores: store.farms.length,
    dealStores: farmsWithOrders.size,
    orderAmount: round2(store.orders.reduce((sum, item) => sum + item.amount, 0)),
    commissionContribution: round2(store.promoters.reduce((sum, item) => sum + item.commission, 0))
  }
})
const leaderShareForm = reactive({ level1Rate: 0, level2Rate: 0 })
const leaderCommissionLedger = computed(() => buildLeaderCommissionLedger())
function syncLeaderShareForm() {
  const share = readShareConfig() as { leaderLevel1Rate?: number; leaderLevel2Rate?: number }
  leaderShareForm.level1Rate = Number(share.leaderLevel1Rate ?? 0)
  leaderShareForm.level2Rate = Number(share.leaderLevel2Rate ?? 0)
}
async function saveLeaderShareRates() {
  const saved = await store.updateLeaderShareRates({ level1Rate: Number(leaderShareForm.level1Rate) || 0, level2Rate: Number(leaderShareForm.level2Rate) || 0 })
  showToast(saved ? '团长分成比例已保存' : store.error || '团长分成保存失败或当前角色无权限')
}
async function batchShipOrders() {
  const ids = batchShipCandidates.value.map((item) => item.id)
  if (!ids.length) return showToast('当前没有可批量发货的订单')
  const count = await store.batchShipOrders(ids)
  showToast(count > 0 ? `已批量发货 ${count} 笔订单` : store.error || '批量发货失败或当前角色无权限')
}
watch(commissionTab, () => { if (commissionTab.value === '团长分成') syncLeaderShareForm() })
syncLeaderShareForm()

function resetFiltersForModule(route: ModuleKey) {
  keyword.value = ''
  page.value = 1
  if (route === 'suppliers') {
    supplierKeyword.value = ''
    supplierStatusFilter.value = '全部'
    supplierCategoryFilter.value = '全部'
  }
  if (route === 'products') {
    productKeyword.value = ''
    productSupplierFilter.value = ''
    productSourceFilter.value = '全部'
    productCategoryFilter.value = '全部'
    productStatusFilter.value = '全部'
    productChannelFilter.value = 'all'
    productReviewFilter.value = '正式商品'
    productStockFilter.value = '全部'
  }
  if (route === 'orders') {
    orderKeyword.value = ''
    orderStatusFilter.value = '全部'
    orderChannelFilter.value = '全部来源'
    orderAfterFilter.value = '全部'
    orderStoreFilter.value = ''
  }
  if (route === 'afterSales') {
    afterKeyword.value = ''
    settlementKeyword.value = ''
    settlementSupplierFilter.value = ''
    afterTypeFilter.value = '全部'
    afterStatusFilter.value = '全部'
    afterReasonFilter.value = '全部'
    afterTab.value = '售后工单'
  }
  if (route === 'farms') {
    storeAccountStatusFilter.value = '全部'
  }
  if (route === 'promoters') {
    promoterSettleFilter.value = '全部'
  }
  if (route === 'dict') {
    dictStatusFilter.value = '全部'
  }
  if (route === 'commissions') {
    commissionTab.value = '佣金结算'
    commissionKeyword.value = ''
    commissionStatusFilter.value = '全部'
    supplierSettleKeyword.value = ''
    supplierSettleSupplierFilter.value = ''
    withdrawalKeyword.value = ''
    withdrawalStatusFilter.value = '全部'
    commissionHistoryPage.value = 1
  }
}

function openTodo(todo: AdminTodo) {
  selectModule(todo.route)
  resetFiltersForModule(todo.route)
  activeTodoFilter.value = { ...todo, filters: { ...(todo.filters || {}) }, objectIds: [...(todo.objectIds || [])] }
  const filters = todo.filters || {}
  if (todo.route === 'suppliers') supplierStatusFilter.value = filters.status === 'pending' ? '待审核' : '全部'
  if (todo.route === 'products') {
    productReviewFilter.value = filters.review === 'pending' ? '待审核' : '正式商品'
    productStatusFilter.value = filters.review === 'pending' ? '全部' : filters.status || '全部'
    productStockFilter.value = filters.stock === 'warning' ? '仅预警' : '全部'
  }
  if (todo.route === 'orders') {
    orderStatusFilter.value = filters.status === 'pending' ? '待发货' : filters.status === 'shipping' ? '已发货' : '全部'
    orderKeyword.value = ''
  }
  if (todo.route === 'afterSales') {
    afterTab.value = '售后工单'
    afterKeyword.value = ''
  }
  if (todo.route === 'commissions' && filters.view === 'withdrawals') {
    commissionTab.value = '提现审核'
    withdrawalStatusFilter.value = filters.status || '全部'
    withdrawalKeyword.value = ''
  }
  if (todo.route === 'commissions' && filters.settlementType === 'supplier') {
    commissionTab.value = '供应商结算'
    supplierSettleKeyword.value = ''
    supplierSettleSupplierFilter.value = ''
  }
  if (todo.route === 'commissions' && filters.settlementType === 'commission') {
    commissionTab.value = '佣金结算'
    commissionKeyword.value = ''
  }
  if (todo.route === 'dashboard' && filters.detail === 'todos') openDetail('todos')
}

function clearTodoFilter() {
  const route = activeTodoFilter.value?.route
  activeTodoFilter.value = null
  if (route) resetFiltersForModule(route)
}

function rememberOverlayTrigger() {
  overlayTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function closeOverlay() {
  dialog.value = null
  detail.value = null
  workPage.value = null
  nextTick(() => overlayTrigger?.focus())
}

function markAllRead() {
  store.markNotificationsRead()
  closeOverlay()
  showToast('已全部标为已读')
}

const recoveryTasks = computed(() => {
  platformVersion.value
  return readPlatformRecoveryQueue().filter((item) => item.status === 'pending' && matchesActiveTodo('dashboard', item))
})
const selectedRecoveryTask = computed(() => recoveryTasks.value.find((item) => item.id === recoveryTaskId.value))
function openRecoveryVerification(id: string) {
  recoveryTaskId.value = id
  recoveryResolutionNote.value = ''
  recoveryOutcome.value = 'aborted'
  dialog.value = 'recovery-verify'
  focusOverlay()
}
function formatAuditMetadata(metadata: unknown) {
  if (metadata == null) return '无附加数据'
  try { return JSON.stringify(metadata, null, 2) }
  catch { return '附加数据无法展示' }
}
async function completeRecovery() {
  const task = recoveryTasks.value.find((item) => item.id === recoveryTaskId.value)
  if (!task) return showToast('恢复任务不存在或已处理')
  if (!task.handlerKey && !recoveryResolutionNote.value.trim()) return showToast('旧恢复任务必须填写人工核验说明')
  const resolved = await store.resolveRecoveryTask(task.id, { note: recoveryResolutionNote.value.trim(), outcome: recoveryOutcome.value })
  if (!resolved) return showToast(store.error || (task.handlerKey ? '自动恢复失败，任务已保留，请查看失败原因' : '人工核验结果保存失败'))
  dialog.value = null
  await store.initialize(true)
  showToast(task.handlerKey ? '恢复任务已重试并完成回读确认' : '人工核验结果已保存')
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const root = event.currentTarget as HTMLElement
  const focusable = [...root.querySelectorAll<HTMLElement>('uni-button:not([disabled]), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function focusOverlay() {
  nextTick(() => {
    const root = document.querySelector<HTMLElement>('.modal, .drawer')
    if (!root) return
    focusFirstInteractive(root)
  })
}

async function runOperation(key: string, action: () => boolean | void | Promise<boolean | void>, success: string, failure = '当前没有可处理的数据') {
  if (isOperating(key)) return
  operationKeys.value[key] = true
  try {
    await new Promise((resolve) => setTimeout(resolve, 180))
    const result = await action()
    if (success || result === false) showToast(result === false ? (store.error || failure) : success)
  } finally {
    delete operationKeys.value[key]
  }
}

function auditSupplier(id: string, approved: boolean) {
  return runOperation(`supplier-${id}`, () => store.auditSupplier(id, approved), approved ? '审核通过' : '已驳回')
}

function openSupplierPause(supplier: Supplier) {
  supplierPauseId.value = supplier.id
  supplierPauseReason.value = ''
  dialog.value = 'supplier-pause'
  focusOverlay()
}

function restoreSupplierPending(supplier: Supplier) {
  return runOperation(`supplier-${supplier.id}`, () => store.restoreSupplierPending(supplier.id), '已恢复待处理')
}

function resumeSupplier(supplier: Supplier) {
  return runOperation(`supplier-${supplier.id}`, () => store.resumeSupplier(supplier.id), '已恢复合作')
}

function openSupplierAccount(supplier: Supplier) {
  const account = store.supplierAccounts.find((item) => item.supplierId === supplier.id)
  if (!account) return showToast('供应商尚未认证，没有可配置账号')
  Object.assign(supplierAccountForm, { supplierId: supplier.id, account: account.account, password: '', enabled: account.enabled, freezeReason: '' })
  supplierAccountOriginalEnabled.value = account.enabled
  workPage.value = { type: 'supplier-account', mode: 'edit', id: supplier.id }
}

async function saveSupplierAccount() {
  const result = await store.updateSupplierAccount(supplierAccountForm.supplierId, { account: supplierAccountForm.account, password: supplierAccountForm.password || undefined, enabled: supplierAccountForm.enabled === supplierAccountOriginalEnabled.value ? undefined : supplierAccountForm.enabled, freezeReason: supplierAccountForm.freezeReason })
  if (!result.ok) return showToast(result.error || '供应商账号保存失败')
  workPage.value = null
  showToast('供应商账号已保存')
}

function openRole(role?: AdminRole) {
  Object.assign(roleForm, role ? { id: role.id, code: role.code, name: role.name, menuPermissions: [...role.menuPermissions], actionPermissions: [...role.actionPermissions], enabled: role.enabled } : { id: '', code: '', name: '', menuPermissions: ['dashboard'], actionPermissions: [], enabled: true })
  workPage.value = { type: 'role', mode: role ? 'edit' : 'create', id: role?.id }
}

function openAdminAccount(account?: AdminAccount) {
  Object.assign(adminAccountForm, account ? { id: account.id, account: account.account, password: '', name: account.name, roleId: account.roleId, enabled: account.enabled } : { id: '', account: '', password: '', name: '', roleId: adminRoleOptions.value[0]?.value || '', enabled: true })
  workPage.value = { type: 'admin-account', mode: account ? 'edit' : 'create', id: account?.id }
}

function toggleRoleMenu(menu: AdminMenuKey) {
  roleForm.menuPermissions = roleForm.menuPermissions.includes(menu) ? roleForm.menuPermissions.filter((item) => item !== menu) : [...roleForm.menuPermissions, menu]
  if (!roleForm.menuPermissions.includes(menu)) {
    const owned = new Set(adminPermissionGroups.find((group) => group.key === menu)?.permissions.map((item) => item.code) || [])
    roleForm.actionPermissions = roleForm.actionPermissions.filter((permission) => !owned.has(permission))
  }
}

function toggleRoleAction(permission: AdminPermissionCode) {
  roleForm.actionPermissions = roleForm.actionPermissions.includes(permission) ? roleForm.actionPermissions.filter((item) => item !== permission) : [...roleForm.actionPermissions, permission]
}

function setRoleActionGroup(group: typeof adminPermissionGroups[number], selected: boolean) {
  if (!roleForm.menuPermissions.includes(group.key)) return
  const codes = new Set(group.permissions.map((permission) => permission.code))
  roleForm.actionPermissions = selected
    ? [...new Set([...roleForm.actionPermissions, ...codes])]
    : roleForm.actionPermissions.filter((permission) => !codes.has(permission))
}

async function saveRole() {
  let result = workPage.value?.mode === 'edit'
    ? await store.updateAdminRole(roleForm.id, { name: roleForm.name, enabled: roleForm.enabled })
    : await store.createAdminRole({ code: roleForm.code, name: roleForm.name, menuPermissions: roleForm.menuPermissions, actionPermissions: roleForm.actionPermissions })
  if (result.ok && workPage.value?.mode === 'edit') result = await store.updateAdminRolePermissions(roleForm.id, { menuPermissions: roleForm.menuPermissions, actionPermissions: roleForm.actionPermissions })
  if (!result.ok) return showToast(result.error || '角色保存失败')
  workPage.value = null
  showToast('角色已保存')
}

async function saveAdminAccount() {
  const result = workPage.value?.mode === 'edit'
    ? await store.updateAdminAccount(adminAccountForm.id, { account: adminAccountForm.account, password: adminAccountForm.password || undefined, name: adminAccountForm.name, roleId: adminAccountForm.roleId })
    : await store.createAdminAccount({ account: adminAccountForm.account, password: adminAccountForm.password, name: adminAccountForm.name, roleId: adminAccountForm.roleId })
  if (!result.ok) return showToast(result.error || '后台账号保存失败')
  workPage.value = null
  showToast('后台账号已保存')
}

function setAdminAccountEnabled(account: AdminAccount) {
  const enabled = !account.enabled
  confirmAction(`确认${enabled ? '启用' : '停用'}后台账号「${account.account}」？`, async () => {
    const result = await store.setAdminAccountEnabled(account.id, enabled)
    showToast(result.ok ? `账号已${enabled ? '启用' : '停用'}` : result.error || '账号状态修改失败')
  })
}


function openDialog(type: 'supplier' | 'policy' | 'farm') {
  rememberOverlayTrigger()
  pendingCreateMediaRetry = null
  form.value = { id: '', skuId: '', name: '', category: '综合品类', type: 'group', scope: '全部门店', discount: 8, tiers: [], spec: '', image: null, images: [], region: type === 'farm' ? '' : '湖南省', address: '', farmCityCode: '', farmDistrictCode: '', farmDetail: '', price: 59.9, cost: 42, stock: 100, source: 'platform', supplier: '平台自营', result: 'refund', refundMethod: 'return', refundMode: 'full', refundRatio: 100, refundAmount: 0, rate: 10, enabled: true, contactPhone: '', brands: '', serviceRegions: '', contact: '', supplierPassword: '', businessLicenseNumber: '', businessLicense: null, permitNumber: '', permit: null, validUntil: '', reviewNote: '运营邀请入驻，等待供应商补充资质', city: '', tags: '', rating: 5, averageSpend: 0, coop: false, farmStatus: 'pending', categoryType: 'product', categoryImage: null, level: '', promoterType: '业务员', promoterRegion: '', promoterStatus: 'active', dictCode: '', dictLabel: '', dictSort: 0, dictTone: 'default', dictImage: null, dictGroupName: '', dictGroupType: '', accountFarmId: '', accountName: '', accountPhone: '', accountPassword: '', accountRole: 'staff', accountPromo: false, accountPriceLevel: 'C' as StorePriceLevel, initIssue: '', productType: 'goods' as ProductType, expressDelivery: false, commissionRate: 0, staffCommissionRate: 0, channels: { store: true } }
  if (type === 'supplier') form.value.category = '生鲜农产'
  dialog.value = type
  if (type === 'supplier') workPage.value = { type: 'supplier', mode: 'create' }
  focusOverlay()
}

function openCatalogProductDialog(product?: CatalogProduct) {
  const defaults = store.pricingDefaults
  const levelTotal = defaults.level1Amount + defaults.level2Amount
  const supplier = store.suppliers[0]
  Object.assign(catalogProductForm, product ? {
    ...product,
    images: [...product.images],
    tags: product.tags.join(','),
    farmIds: [...product.farmIds],
    skus: product.skus.map((sku) => ({ ...sku, status: sku.status === 'retired' ? 'retired' : 'active' }))
  } : {
    id: createId('P'), name: '', category: productCategories.value[0]?.name || '综合品类',
    supplierId: supplier?.id || '', supplierName: supplier?.name || '', source: 'platform', status: 'active',
    image: null, images: [], tags: '', productType: 'goods', expressDelivery: false, channel: 'store', farmIds: [],
    promoterCommissionRate: defaults.promoterCommissionRate, storeCommissionRate: defaults.storeCommissionRate,
    skus: [{ id: createId('SKU'), name: '默认规格', image: null, retailPrice: Math.max(59.9, levelTotal), cost: 42, stock: 100, level1Amount: defaults.level1Amount, level2Amount: defaults.level2Amount, minimumOrderQuantity: 1, status: 'active' }]
  })
  persistedCatalogSkuIds.value = new Set(product?.skus.map((sku) => sku.id) || [])
  catalogProductDialog.value = true
}

function addCatalogSku() {
  const defaults = store.pricingDefaults
  catalogProductForm.skus.push({ id: createId('SKU'), name: `规格${catalogProductForm.skus.length + 1}`, image: null, retailPrice: Math.max(59.9, defaults.level1Amount + defaults.level2Amount), cost: 42, stock: 0, level1Amount: defaults.level1Amount, level2Amount: defaults.level2Amount, minimumOrderQuantity: 1, status: 'active' })
}

function removeCatalogSku(index: number) {
  const sku = catalogProductForm.skus[index]
  if (!sku) return
  if (catalogProductForm.skus.filter((item) => item.status !== 'retired').length <= 1) return showToast('商品至少保留一个有效 SKU')
  if (persistedCatalogSkuIds.value.has(sku.id)) sku.status = 'retired'
  else catalogProductForm.skus.splice(index, 1)
}

function restoreCatalogSku(index: number) {
  const sku = catalogProductForm.skus[index]
  if (sku) sku.status = 'active'
}

function validateCatalogProductDraft() {
  const mediaError = validateCatalogMedia(catalogProductForm)
  if (mediaError) return mediaError
  if (!catalogProductForm.name.trim() || !catalogProductForm.supplierId || !catalogProductForm.skus.some((sku) => sku.status !== 'retired')) return '请完善商品、供应商和有效 SKU 配置'
  const rates = [Number(catalogProductForm.promoterCommissionRate), Number(catalogProductForm.storeCommissionRate)]
  if (rates.some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 100)) return '佣金率必须在 0-100% 之间'
  for (const sku of catalogProductForm.skus) {
    const values = [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].map(Number)
    if (!sku.name.trim() || values.some((value) => !Number.isFinite(value) || value < 0)) return 'SKU 金额和库存不能为负数'
    if (!Number.isInteger(Number(sku.minimumOrderQuantity)) || Number(sku.minimumOrderQuantity) < 1) return '起订量必须为大于等于 1 的整数'
    if (Number(sku.retailPrice) < Number(sku.level1Amount) + Number(sku.level2Amount)) return '零售价不能低于一级与二级分销金额之和'
    if (sku.warningThreshold !== undefined && sku.warningThreshold !== null && String(sku.warningThreshold) !== '' && (!Number.isFinite(Number(sku.warningThreshold)) || Number(sku.warningThreshold) < 0)) return '库存预警阈值不能为负数'
  }
  if (catalogProductForm.productType === 'package' && (catalogProductForm.channel !== 'store' || catalogProductForm.expressDelivery)) return '套餐券只允许门店渠道且不支持快递直发'
  if (catalogProductForm.productType === 'goods' && catalogProductForm.channel !== 'store' && !catalogProductForm.expressDelivery) return '用户端商品和全部商品必须支持快递直发'
  return ''
}

async function persistCatalogProductDraft() {
  const creating = !store.catalogProducts.some((item) => item.id === catalogProductForm.id)
  const supplier = store.suppliers.find((item) => item.id === catalogProductForm.supplierId)
  if (supplier) catalogProductForm.supplierName = supplier.name
  const error = validateCatalogProductDraft()
  if (error) return showToast(error)
  const product = inheritCatalogSkuImages({
    ...catalogProductForm,
    name: catalogProductForm.name.trim(),
    tags: splitTags(catalogProductForm.tags),
    skus: catalogProductForm.skus.map((sku) => ({ ...sku, image: sku.image ?? catalogProductForm.image }))
  } as CatalogProduct)
  const previousBindings = catalogProductMediaBindings(store.catalogProducts.find((item) => item.id === product.id))
  try {
    const result = await persistAndFinalizeAdminMedia(
      getMediaRuntime().storage,
      previousBindings,
      () => catalogProductMediaBindings(store.catalogProducts.find((item) => item.id === product.id)),
      () => store.saveCatalogProduct(product),
      (saved) => saved.ok
    )
    if (!result.ok) return showToast(result.error)
  } catch (error) {
    return showToast(error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试')
  }
  catalogProductDialog.value = false
  stockLogVersion.value += 1
  showToast(creating ? '商品已提交审核' : '商品已保存')
}

async function auditProductSubmission(submission: CatalogProductSubmission) {
  const result = await store.approveCatalogProductSubmission(submission.id)
  showToast(result.ok ? '商品审核通过' : result.message)
}

function openRejectProductSubmission(submission: CatalogProductSubmission) {
  productRejectTarget.value = submission
  productRejectReason.value = ''
}

async function confirmRejectProductSubmission() {
  if (!productRejectTarget.value) return
  const result = await store.rejectCatalogProductSubmission(productRejectTarget.value.id, productRejectReason.value)
  if (!result.ok) return showToast(result.message)
  productRejectTarget.value = null
  productRejectReason.value = ''
  showToast('商品已驳回')
}

function saveCatalogProductDialog() {
  const error = validateCatalogProductDraft()
  if (error) return showToast(error)
  const negativeMargin = catalogProductForm.skus.filter((sku) => sku.status !== 'retired' && Number(sku.cost) >= Number(sku.retailPrice))
  if (!negativeMargin.length) return void persistCatalogProductDraft()
  uni.showModal({
    title: '确认负毛利商品',
    content: `${negativeMargin.map((sku) => sku.name).join('、')} 的供货价不低于零售价，保存后可能产生负毛利。是否继续？`,
    confirmText: '继续保存',
    success: ({ confirm }) => { if (confirm) void persistCatalogProductDraft() }
  })
}

function activeCatalogSkus(product: CatalogProduct) {
  return product.skus.filter((sku) => sku.status !== 'retired')
}

async function savePricingDefaults() {
  const saved = await store.updatePricingDefaults({
    promoterCommissionRate: Number(pricingDefaultsForm.promoterCommissionRate),
    storeCommissionRate: Number(pricingDefaultsForm.storeCommissionRate),
    level1Amount: Number(pricingDefaultsForm.level1Amount),
    level2Amount: Number(pricingDefaultsForm.level2Amount)
  })
  showToast(saved ? '默认价格配置已保存，仅影响后续新增商品' : '请检查默认佣金率和分销金额')
}

watch(() => catalogProductForm.productType, (productType) => {
  if (productType === 'package') {
    catalogProductForm.channel = 'store'
    catalogProductForm.expressDelivery = false
  }
})

const orderStoreOptions = computed(() => Array.from(new Set(store.orders.map((item) => item.customer))))
const orderStoreSelectOptions = computed<SearchableSelectOption[]>(() => [
  { value: '', label: '全部门店' },
  ...orderStoreOptions.value.map((name) => ({ value: name, label: name }))
])

function orderItems(order: Order): Array<{ name: string; quantity: number; image?: BusinessMediaValue }> {
  if (order.items?.length) return order.items
  return [{ name: order.productName, quantity: order.quantity, image: '' }]
}

function orderTotalQty(order: Order) {
  if (order.items?.length) return order.items.reduce((sum, p) => sum + p.quantity, 0)
  return order.quantity
}

function orderFulfillmentText(status: OrderStatus) {
  return ({ 'pending-payment': '待付款', pending: '待发货', shipping: '已发货', delivered: '已完成', 'after-sale': '已完成', 'paid-cancelled': '已支付取消', 'unpaid-cancelled': '未支付取消' } as Record<OrderStatus, string>)[status]
}

function orderFlow(order: Order): OrderFlowEvent[] {
  if (order.flow?.length) return order.flow
  const base: OrderFlowEvent[] = [
    { time: order.createdAt, action: '用户下单', operator: order.customer },
    { time: order.createdAt, action: '订单支付成功', operator: order.customer }
  ]
  if (order.status === 'paid-cancelled') return [...base, { time: order.createdAt, action: '已支付取消', operator: order.customer }]
  if (order.status === 'unpaid-cancelled') return [base[0], { time: order.createdAt, action: '未支付取消', operator: order.customer }]
  if (order.status === 'shipping') return [...base, { time: order.createdAt, action: '已发货 · 已安排司机配送', operator: '运营管理员' }]
  if (order.status === 'delivered' || order.status === 'after-sale') return [...base, { time: order.createdAt, action: '已发货 · 已安排司机配送', operator: '运营管理员' }, { time: order.createdAt, action: '已确认收货', operator: '运营管理员' }]
  return base
}

function orderCarrier(order: Order): string {
  const fulfillment = order.supplierFulfillment
  if (fulfillment?.shipType === 'driver') return `司机配送${fulfillment.driverName ? ' · ' + fulfillment.driverName : ''}`
  if (fulfillment?.shipType === 'courier') return '快递直发'
  return order.channel === 'purchase' ? '中台直配到店' : '快递直发'
}

function orderLogisticsEvents(order: Order) {
  return order.logistics || []
}

function orderSignResult(order: Order): string {
  const signed = [...orderLogisticsEvents(order)].reverse().find((event) => event.title.includes('签收'))
  return signed ? `${signed.title} · ${signed.time}` : '待签收'
}

function orderPaidAmount(order: Order) {
  return order.status === 'unpaid-cancelled' ? 0 : order.amount
}

function afterSaleStatusText(status: AfterSaleStatus) {
  return ({ processing: '售后中', rejected: '售后拒绝', 'refund-pending': '待退款', 'return-pending': '待退货', refunded: '已退款', 'refund-failed': '退款失败' } as Record<AfterSaleStatus, string>)[status]
}

function orderAfterStatus(order: Order) {
  const after = store.afterSales.find((a) => a.orderId === order.id)
  return after ? afterSaleStatusText(after.status) : '未发起'
}

function openPolicyEdit(policy: PricePolicy) {
  openDialog('policy')
  Object.assign(form.value, policy, { tiers: policy.tiers ? policy.tiers.map((t) => ({ ...t })) : [] })
  dialog.value = 'policy-edit'
}

function addTier() {
  form.value.tiers.push({ minQty: 1, maxQty: null, price: 0, discountOff: 0 })
}

function removeTier(index: number) {
  form.value.tiers.splice(index, 1)
}

function openSupplierEdit(supplier: Supplier) {
  detail.value = null
  openDialog('supplier')
  const qualification = readSupplierQualificationFields(supplier.qualification)
  Object.assign(form.value, {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    region: supplier.region,
    contactPhone: supplier.contactPhone || '',
    brands: (supplier.brands || []).join(', '),
    serviceRegions: (supplier.serviceRegions || []).join(', '),
    businessLicenseNumber: qualification.businessLicenseNumber,
    businessLicense: qualification.businessLicense,
    permitNumber: qualification.permitNumber,
    permit: qualification.permit,
    validUntil: qualification.validUntil,
    reviewNote: qualification.reviewNote,
    coop: !!supplier.coop
  })
  dialog.value = 'supplier-edit'
  workPage.value = { type: 'supplier', mode: 'edit', id: supplier.id }
}

function openFarmEdit(farm: FarmStore) {
  detail.value = null
  openDialog('farm')
  const regionPath = dashboardRegionPath(farm.structuredAddress?.districtCode || farm.regionCode || farm.location?.adCode || '')
  const cityCode = farm.structuredAddress?.cityCode || regionPath.find((region) => region.level === 'city')?.code || ''
  const districtCode = farm.structuredAddress?.districtCode || regionPath.find((region) => region.level === 'district')?.code || ''
  Object.assign(form.value, {
    id: farm.id,
    name: farm.name,
    region: farm.region,
    address: farm.address,
    farmCityCode: cityCode,
    farmDistrictCode: districtCode,
    farmDetail: farm.structuredAddress?.detail || farm.address,
    city: farm.city,
    tags: (farm.tags || []).join('，'),
    rating: farm.rating,
    averageSpend: farm.averageSpend,
    farmStatus: farm.status,
    contact: farm.contact || '',
    contactPhone: farm.contactPhone || '',
    image: farm.image
  })
  dialog.value = 'farm-edit'
}

function splitTags(text: string) {
  return text.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
}

function farmPayload(forceGeocode = false) {
  return {
    name: form.value.name, contact: form.value.contact, contactPhone: form.value.contactPhone, region: form.value.region, address: form.value.address, city: form.value.city, districtCode: form.value.farmDistrictCode || undefined, detail: form.value.farmDetail || undefined, tags: splitTags(form.value.tags),
    rating: Number(form.value.rating), averageSpend: Number(form.value.averageSpend),
    status: form.value.farmStatus, image: form.value.image, forceGeocode
  }
}

async function retryFarmGeocode() {
  if (!form.value.farmDistrictCode || !form.value.farmDetail.trim()) return showToast('请先选择县区并填写详细地址')
  if (!form.value.id || busy.value) return
  busy.value = true
  const previousBindings = farmMediaBindings(store.farms.find((farm) => farm.id === form.value.id))
  let saved = false
  let errorMessage = ''
  try {
    saved = await persistAndFinalizeAdminMedia(
      getMediaRuntime().storage,
      previousBindings,
      () => farmMediaBindings(store.farms.find((farm) => farm.id === form.value.id)),
      () => store.updateFarm(form.value.id, farmPayload(true)),
      Boolean
    )
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
  }
  busy.value = false
  if (!saved) return showToast(errorMessage || '重新定位失败，请检查门店信息')
  showToast(editingFarm.value?.locationStatus === 'resolved' ? '定位已更新' : '未能定位，已保留详细地址')
}

function categoryUsage(category: Category) {
  return store.products.filter((product) => product.category === category.name).length + store.suppliers.filter((supplier) => supplier.category === category.name).length
}


function openCategoryDialog() {
  openDialog('farm')
  dialog.value = 'category'
}

function openCategoryEdit(category: Category) {
  openDialog('farm')
  const dictionaryItem = store.dictItems.find((item) => item.id === category.id && item.type === 'productCategory')
  Object.assign(form.value, { id: category.id, name: category.name, categoryType: category.type, categoryImage: dictionaryItem?.image || (category.type === 'product' ? productCategoryImage(category.name, dictionaryState.value) : null) })
  dialog.value = 'category-edit'
}

function openDictDialog(item?: DictItem) {
  openDialog('farm')
  if (item) {
    Object.assign(form.value, { id: item.id, dictCode: item.code, dictLabel: item.label, dictSort: item.sort, dictTone: item.tone || 'default', dictImage: item.type === 'productCategory' ? item.image || productCategoryImage(item.code, dictionaryState.value) : null, enabled: item.enabled })
    dialog.value = 'dict-edit'
  } else {
    form.value.dictCode = ''
    form.value.dictLabel = ''
    form.value.dictSort = 0
    form.value.dictTone = 'default'
    form.value.dictImage = null
    form.value.enabled = true
    dialog.value = 'dict'
  }
}

function openDictGroupDialog() {
  openDialog('farm')
  dialog.value = 'dict-group'
}

function openDictGroupEdit(group: DictGroup) {
  openDialog('farm')
  Object.assign(form.value, { id: group.id, dictGroupName: group.name, dictGroupType: group.type })
  dialog.value = 'dict-group-edit'
}

function removeDictGroup(group: DictGroup) {
  confirmAction(`确认删除分组「${group.name}」？`, async () => {
    const removed = await store.removeDictGroup(group.id)
    showToast(dictionaryOperationMessage(removed, '分组已删除', store.error, '该分组下还有字典项，请先清空'))
    if (removed && dictTypeTab.value === group.type) {
      dictTypeTab.value = store.dictGroups[0]?.type || ''
      page.value = 1
    }
  })
}

async function removeDictItem(id: string) {
  const previousItem = store.dictItems.find((item) => item.id === id)
  try {
    const removed = await persistAndFinalizeAdminMedia(
      getMediaRuntime().storage,
      dictionaryItemMediaBindings(previousItem),
      () => [],
      () => store.removeDictItem(id),
      Boolean
    )
    showToast(dictionaryOperationMessage(removed, '字典项已删除', store.error, '系统字典项不可删除'))
  } catch (error) {
    if (error instanceof AdminMediaFinalizeError) offerMediaFinalizeRetry(error)
    else showToast(error instanceof Error ? error.message : '图片资源解绑失败')
  }
}

const shareConfig = ref(readShareConfig())
const shareRecords = computed(() => readShareRecords() ?? [])
async function saveShareConfig() {
  const config = { promoterRate: Math.max(0, Math.min(100, Number(shareConfig.value.promoterRate) || 0)), staffRate: Math.max(0, Math.min(100, Number(shareConfig.value.staffRate) || 0)) }
  if (!await store.saveShareConfig(config)) return showToast(store.error || '消费分成比例保存失败或当前角色无权限')
  shareConfig.value = config
  showToast('消费分成比例已保存并发布')
}

function openAccountDialog(item?: StoreAccount) {
  openDialog('farm')
  if (item) {
    Object.assign(form.value, { id: item.id, accountFarmId: item.farmId, accountName: item.name, accountPhone: item.account, accountPassword: item.password, accountRole: item.role, accountPromo: !!item.promoEnabled, accountPriceLevel: item.priceLevel || 'C' })
    dialog.value = 'store-account-edit'
  } else {
    form.value.accountFarmId = ''
    form.value.accountName = ''
    form.value.accountPhone = ''
    form.value.accountPassword = ''
    form.value.accountRole = 'staff'
    form.value.accountPromo = false
    form.value.accountPriceLevel = 'C'
    dialog.value = 'store-account'
  }
}

function offerMediaFinalizeRetry(error: AdminMediaFinalizeError) {
  confirmAction('业务数据已保存，但图片关联尚未完成，是否立即重试？', async () => {
    try {
      await error.retryFinalize()
      showToast('图片关联已恢复')
    } catch (retryError) {
      if (retryError instanceof AdminMediaFinalizeError) offerMediaFinalizeRetry(retryError)
      else showToast(retryError instanceof Error ? retryError.message : '图片关联重试失败')
    }
  })
}

function removeCategory(category: Category) {
  confirmAction(`确认删除品类「${category.name}」？`, () => {
    runOperation(`category-${category.id}`, async () => {
      const previousItem = store.dictItems.find((item) => item.id === category.id && item.type === 'productCategory')
      try {
        const removed = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          dictionaryItemMediaBindings(previousItem),
          () => [],
          () => store.removeCategory(category.id),
          Boolean
        )
        if (!removed) return false
        showToast('品类已删除')
      } catch (error) {
        if (error instanceof AdminMediaFinalizeError) offerMediaFinalizeRetry(error)
        else showToast(error instanceof Error ? error.message : '图片资源解绑失败')
      }
    }, '', '该品类正在使用，无法删除')
  })
}


function supplierProducts(supplier: Supplier) {
  return store.products.filter((product) => product.supplier === supplier.name)
}

function openPromoterDialog() {
  openDialog('farm')
  dialog.value = 'promoter'
}

function openPromoterEdit(promoter: Promoter) {
  openDialog('farm')
  Object.assign(form.value, {
    id: promoter.id,
    name: promoter.name,
    level: promoter.level,
    promoterType: promoter.type || '业务员',
    promoterRegion: promoter.region || '',
    promoterStatus: promoter.status
  })
  dialog.value = 'promoter-edit'
}

function previewImage(src: string) {
  if (!src) return
  uni.previewImage({ current: src, urls: [src] })
}

async function confirmOrder(order: Order) {
  if (!await store.confirmOrder(order.id)) return showToast(store.error || '该订单当前不可确认收货')
  showToast('已确认收货')
}

const editingAfterSale = computed(() => store.afterSales.find((item) => item.id === form.value.id))

function openAfterSaleInit(order: Order) {
  openDialog('farm')
  form.value.id = order.id
  form.value.result = 'refund'
  form.value.initIssue = ''
  dialog.value = 'after-sale-init'
}

function openCommission(rule: CommissionRule) {
  openDialog('farm')
  form.value.id = rule.id
  form.value.name = rule.name
  form.value.rate = rule.rate
  form.value.enabled = rule.enabled
  dialog.value = 'commission'
}

async function saveDialog() {
  if (busy.value) return
  busy.value = true
  await new Promise((resolve) => setTimeout(resolve, 180))
  const recovery = pendingCreateMediaRetry
  if (recovery?.dialog === dialog.value) {
    try {
      await recovery.retryFinalize()
      pendingCreateMediaRetry = null
      busy.value = false
      dialog.value = null
      workPage.value = null
      showToast('已保存到演示数据')
    } catch (error) {
      if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: recovery.dialog, retryFinalize: error.retryFinalize }
      busy.value = false
      showToast(error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试')
    }
    return
  }
  let saved = true
  let errorMessage = ''
  if (dialog.value === 'supplier') {
    try {
      const result = await persistAndFinalizeAdminMedia(
        getMediaRuntime().storage,
        [],
        () => supplierMediaBindings(store.suppliers[0]),
        () => store.inviteSupplier({
          name: form.value.name, category: form.value.category, region: form.value.region, coop: form.value.coop,
          brands: splitTags(form.value.brands), serviceRegions: splitTags(form.value.serviceRegions),
          contactPhone: form.value.contactPhone, businessLicenseNumber: form.value.businessLicenseNumber, businessLicense: form.value.businessLicense,
          permitNumber: form.value.permitNumber, permit: form.value.permit, validUntil: form.value.validUntil
        }),
        (result) => result.ok
      )
      saved = result.ok
      errorMessage = result.error || ''
    } catch (error) {
      saved = false
      if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'supplier', retryFinalize: error.retryFinalize }
      errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
    }
  }
  if (dialog.value === 'supplier-edit') {
    const previousBindings = supplierMediaBindings(store.suppliers.find((supplier) => supplier.id === form.value.id))
    try {
      const result = await persistAndFinalizeAdminMedia(
        getMediaRuntime().storage,
        previousBindings,
        () => supplierMediaBindings(store.suppliers.find((supplier) => supplier.id === form.value.id)),
        () => store.updateSupplier(form.value.id, {
          name: form.value.name, category: form.value.category, region: form.value.region, coop: form.value.coop,
          brands: splitTags(form.value.brands), serviceRegions: splitTags(form.value.serviceRegions),
          contactPhone: form.value.contactPhone, businessLicenseNumber: form.value.businessLicenseNumber, businessLicense: form.value.businessLicense,
          permitNumber: form.value.permitNumber, permit: form.value.permit, validUntil: form.value.validUntil
        }),
        (result) => result.ok
      )
      saved = result.ok
      errorMessage = result.error || ''
    } catch (error) {
      saved = false
      errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
    }
  }
  if (dialog.value === 'category') {
    const categoryImage = normalizeMediaReference(form.value.categoryImage) || undefined
    const imageError = validateDictionaryItemImage(form.value.categoryType === 'product' ? 'productCategory' : '', categoryImage)
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写品类名称' }
    else if (imageError) { saved = false; errorMessage = imageError }
    else if (form.value.categoryType !== 'product') saved = await store.addCategory(form.value.name, form.value.categoryType)
    else {
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          [],
          () => dictionaryItemMediaBindings(store.dictItems.find((item) => item.type === 'productCategory' && item.label === form.value.name.trim())),
          () => store.addCategory(form.value.name, 'product', categoryImage),
          Boolean
        )
      } catch (error) {
        saved = false
        if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'category', retryFinalize: error.retryFinalize }
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
      if (!saved && !errorMessage) errorMessage = store.error
    }
  }
  if (dialog.value === 'category-edit') {
    const previousItem = store.dictItems.find((item) => item.id === form.value.id && item.type === 'productCategory')
    const categoryImage = normalizeMediaReference(form.value.categoryImage) || undefined
    const imageError = validateDictionaryItemImage(previousItem ? 'productCategory' : '', categoryImage)
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写品类名称' }
    else if (imageError) { saved = false; errorMessage = imageError }
    else if (!previousItem) saved = await store.updateCategory(form.value.id, form.value.name, form.value.categoryType)
    else {
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          dictionaryItemMediaBindings(previousItem),
          () => dictionaryItemMediaBindings(store.dictItems.find((item) => item.id === form.value.id)),
          () => store.updateCategory(form.value.id, form.value.name, 'product', categoryImage),
          Boolean
        )
      } catch (error) {
        saved = false
        if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'category-edit', retryFinalize: error.retryFinalize }
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
      if (!saved && !errorMessage) errorMessage = store.error
    }
  }
  if (dialog.value === 'dict') {
    const dictImage = normalizeMediaReference(form.value.dictImage) || undefined
    const imageError = validateDictionaryItemImage(dictTypeTab.value, dictImage)
    if (!form.value.dictCode.trim() || !form.value.dictLabel.trim()) { saved = false; errorMessage = '请填写字典编码和名称' }
    else if (imageError) { saved = false; errorMessage = imageError }
    else {
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          [],
          () => dictionaryItemMediaBindings(store.dictItems.find((item) => item.type === dictTypeTab.value && item.code === form.value.dictCode.trim())),
          () => store.addDictItem({ type: dictTypeTab.value, code: form.value.dictCode, label: form.value.dictLabel, enabled: form.value.enabled, sort: Number(form.value.dictSort), tone: form.value.dictTone, image: dictImage }),
          Boolean
        )
      } catch (error) {
        saved = false
        if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'dict', retryFinalize: error.retryFinalize }
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
      if (!saved && !errorMessage) errorMessage = store.error
    }
  }
  if (dialog.value === 'dict-edit') {
    const previousItem = store.dictItems.find((item) => item.id === form.value.id)
    const dictImage = normalizeMediaReference(form.value.dictImage) || undefined
    const imageError = validateDictionaryItemImage(previousItem?.type || dictTypeTab.value, dictImage)
    if (!form.value.dictCode.trim() || !form.value.dictLabel.trim()) { saved = false; errorMessage = '请填写字典编码和名称' }
    else if (imageError) { saved = false; errorMessage = imageError }
    else {
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          dictionaryItemMediaBindings(previousItem),
          () => dictionaryItemMediaBindings(store.dictItems.find((item) => item.id === form.value.id)),
          () => store.updateDictItem(form.value.id, { code: form.value.dictCode, label: form.value.dictLabel, enabled: form.value.enabled, sort: Number(form.value.dictSort), tone: form.value.dictTone, image: dictImage }),
          Boolean
        )
      } catch (error) {
        saved = false
        if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'dict-edit', retryFinalize: error.retryFinalize }
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
      if (!saved && !errorMessage) errorMessage = store.error
    }
  }
  if (dialog.value === 'dict-group') {
    if (!form.value.dictGroupName.trim() || !form.value.dictGroupType.trim()) { saved = false; errorMessage = '请填写分组名称和类型编码' }
    else {
      saved = await store.addDictGroup({ type: form.value.dictGroupType, name: form.value.dictGroupName })
      if (!saved) errorMessage = store.error
      if (saved) {
        dictTypeTab.value = form.value.dictGroupType.trim()
        page.value = 1
      }
    }
  }
  if (dialog.value === 'dict-group-edit') {
    if (!form.value.dictGroupName.trim()) { saved = false; errorMessage = '请填写分组名称' }
    else {
      saved = await store.updateDictGroup(form.value.id, { name: form.value.dictGroupName })
      if (!saved) errorMessage = store.error
    }
  }
  if (dialog.value === 'store-account') {
    if (!form.value.accountFarmId || !form.value.accountName.trim() || !form.value.accountPhone.trim() || !form.value.accountPassword.trim()) { saved = false; errorMessage = '请填写门店、姓名、账号和密码' }
    else saved = await store.addStoreAccount({ farmId: form.value.accountFarmId, name: form.value.accountName, account: form.value.accountPhone, password: form.value.accountPassword, role: form.value.accountRole, promoEnabled: form.value.accountPromo, priceLevel: form.value.accountRole === 'staff' ? form.value.accountPriceLevel : undefined })
  }
  if (dialog.value === 'store-account-edit') {
    if (!form.value.accountName.trim() || !form.value.accountPhone.trim()) { saved = false; errorMessage = '请填写姓名和账号' }
    else saved = await store.updateStoreAccount(form.value.id, { name: form.value.accountName, account: form.value.accountPhone, password: form.value.accountPassword || undefined, role: form.value.accountRole, promoEnabled: form.value.accountPromo, priceLevel: form.value.accountRole === 'staff' ? form.value.accountPriceLevel : undefined })
  }
  if (dialog.value === 'policy' || dialog.value === 'policy-edit') {
    const tiers = form.value.tiers.map((t) => ({
      minQty: Number(t.minQty),
      maxQty: t.maxQty === '' || t.maxQty == null ? null : Number(t.maxQty),
      price: Number(t.price),
      discountOff: Number(t.discountOff)
    }))
    const policyErrors = validatePricePolicy({ name: form.value.name, type: form.value.type, discount: Number(form.value.discount), tiers })
    if (policyErrors.length) { saved = false; errorMessage = policyErrors[0] }
    else if (dialog.value === 'policy') saved = await store.createPolicy(form.value.name, form.value.type, form.value.scope, Number(form.value.discount), tiers)
    else saved = await store.updatePolicy(form.value.id, form.value.name, form.value.scope, Number(form.value.discount), form.value.enabled, tiers)
  }
  if (dialog.value === 'farm') {
    if (!form.value.name.trim() || !form.value.farmDistrictCode || !form.value.farmDetail.trim()) { saved = false; errorMessage = '请选择县区并填写门店名称和详细地址' }
    else if (form.value.contactPhone.trim() && !validatePhone(form.value.contactPhone)) { saved = false; errorMessage = '请输入正确的11位门店联系人手机号' }
    else {
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          [],
          () => farmMediaBindings(store.farms[0]),
          () => store.addFarm(farmPayload()),
          Boolean
        )
      } catch (error) {
        saved = false
        if (error instanceof AdminMediaFinalizeError) pendingCreateMediaRetry = { dialog: 'farm', retryFinalize: error.retryFinalize }
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
    }
  }
  if (dialog.value === 'farm-edit') {
    if (!form.value.name.trim() || !form.value.farmDistrictCode || !form.value.farmDetail.trim()) { saved = false; errorMessage = '请选择县区并填写门店名称和详细地址' }
    else if (form.value.contactPhone.trim() && !validatePhone(form.value.contactPhone)) { saved = false; errorMessage = '请输入正确的11位门店联系人手机号' }
    else {
      const previousBindings = farmMediaBindings(store.farms.find((farm) => farm.id === form.value.id))
      try {
        saved = await persistAndFinalizeAdminMedia(
          getMediaRuntime().storage,
          previousBindings,
          () => farmMediaBindings(store.farms.find((farm) => farm.id === form.value.id)),
          () => store.updateFarm(form.value.id, farmPayload()),
          Boolean
        )
      } catch (error) {
        saved = false
        errorMessage = error instanceof Error ? error.message : '媒体资源关联失败，业务数据已保存，请重试'
      }
    }
  }
  if (dialog.value === 'after-sale-init') {
    if (!form.value.initIssue) { saved = false; errorMessage = '请选择售后原因' }
    else saved = await store.initiateAfterSale(form.value.id, form.value.result, form.value.initIssue)
  }
  if (dialog.value === 'promoter') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写业务员姓名' }
    else saved = await store.addPromoter({ name: form.value.name, level: form.value.level, type: form.value.promoterType, region: form.value.promoterRegion, status: form.value.promoterStatus })
  }
  if (dialog.value === 'promoter-edit') {
    if (!form.value.name.trim()) { saved = false; errorMessage = '请填写业务员姓名' }
    else saved = await store.updatePromoter(form.value.id, { name: form.value.name, level: form.value.level, type: form.value.promoterType, region: form.value.promoterRegion, status: form.value.promoterStatus })
  }
  if (dialog.value === 'commission') saved = await store.updateCommissionRule(form.value.id, Number(form.value.rate), true)
  if (dialog.value === 'withdrawal-reject') {
    const result = await store.reviewWithdrawal(withdrawalRejectId.value, 'rejected', withdrawalNote.value)
    saved = Boolean(result)
    if (saved) { withdrawalVersion.value++; withdrawalRejectId.value = ''; withdrawalNote.value = '' }
  }
  if (dialog.value === 'recovery-verify') {
    busy.value = false
    await completeRecovery()
    return
  }
  if (dialog.value === 'supplier-pause') {
    saved = await store.pauseSupplier(supplierPauseId.value, supplierPauseReason.value)
    if (!saved) errorMessage = '请填写暂停合作原因'
  }
  busy.value = false
  if (!saved) return showToast(errorMessage || '请检查必填项和数值范围')
  dialog.value = null
  workPage.value = null
  showToast('已保存到演示数据')
}

function confirmAction(content: string, action: () => void) {
  uni.showModal({ title: '操作确认', content, success: ({ confirm }) => { if (confirm) action() } })
}

function openDetail(type: DetailType, id?: string) {
  rememberOverlayTrigger()
  detail.value = { type, id }
  if (type === 'afterSale') returnTrackingDraft.value = ''
  focusOverlay()
}

function detailModule(key: ModuleKey) {
  detail.value = null
  selectModule(key)
}

/** 退回运单号草稿 + 登记（清单「退款与退货：…退货物流」）。 */
const returnTrackingDraft = ref('')
async function saveReturnTracking() {
  const work = selectedAfterSale.value
  if (!work) return
  const saved = await store.recordAfterSaleReturnTracking(work.id, returnTrackingDraft.value)
  if (!saved) return showToast(store.error || '退回运单号登记失败')
  returnTrackingDraft.value = ''
  showToast('已登记退回运单号')
}

async function exportCurrent() {
  if (active.value === 'reports' && reportFilterError.value) return showToast(reportFilterError.value)
  const exports: Record<ModuleKey, Array<Array<string | number>>> = {
    dashboard: [['指标', '数值'], ['平台交易额', round2(store.totalGmv)], ['入驻门店', store.farms.length], ['合作供应商', store.activeSupplierCount], ['履约订单', store.shippedOrderCount]],
    reports: [['聚合维度', '名称', '订单数', '商品件数', 'GMV'], ...reportRows.value.map((row) => [reportDimension.value === 'day' ? '日期' : reportDimension.value === 'store' ? '门店' : reportDimension.value === 'supplier' ? '供应商' : '品类', row.label, row.orderCount, row.itemCount, round2(row.gmv)])],
    suppliers: [['供应商', '区域', '品类', '商品数', '状态'], ...filteredSuppliers.value.map((item) => [item.name, item.region, item.category, supplierProducts(item).length, statusText(item.status)])],
    products: [['商品', '规格', '品类', '供应商', '采购价', '建议零售', '库存', '状态'], ...productRows.value.map((row) => [row.product.name, row.sku.name, row.product.category, row.product.supplier, row.product.source === 'platform' ? round2(row.sku.cost) : '', round2(row.sku.price), row.sku.stock, statusText(row.product.status)])],
    categories: [['品类', '类型', '使用数量'], ...filteredCategories.value.map((item) => [item.name, item.type === 'product' ? '商品品类' : item.type === 'supplier' ? '供应商品类' : '通用', categoryUsage(item)])],
    prices: [['策略', '类型', '范围', '优惠比例', '状态'], ...filteredPolicies.value.map((item) => [item.name, item.type, item.scope, item.discount, item.enabled ? '启用' : '停用'])],
    orders: [['订单号', '商品', '数量', '客户', '渠道', '金额', '实付金额', '状态', '售后状态'], ...visibleOrders.value.map((item) => [item.id, item.items?.map((p) => p.name).join('、') || item.productName, orderTotalQty(item), item.customer, channelText(item.channel), round2(item.amount), round2(orderPaidAmount(item)), orderFulfillmentText(item.status), orderAfterStatus(item)])],
    afterSales: [['工单', '订单', '商品', '申请方', '类型', '金额', '状态'], ...filteredAfterSales.value.map((item) => [item.id, item.orderId, item.productName, item.applicant, item.type, round2(item.amount), afterSaleStatusText(item.status)])],
    farms: [['门店', '区域', '联系人', '选品数', 'GMV', '状态'], ...filteredFarms.value.map((item) => [item.name, item.region, item.contact ? `${item.contact}${item.contactPhone ? ' ' + item.contactPhone : ''}` : '待补充', item.selectedCount, round2(item.gmv), statusText(item.status)])],
    promoters: [['业务员', '等级', '负责区域', '下级用户', '订单', 'GMV', '佣金'], ...filteredPromoters.value.map((item) => [item.name, item.level, item.region || '待补充', item.fans, item.orders, round2(item.gmv), round2(item.commission)])],
    users: [['用户', '手机号', '团长等级', '一级团长', '二级团长', '订单数', '累计消费', '来源渠道'], ...buildAdminUsers().map((item) => [item.name, item.phone, item.levelLabel, item.level1Leader, item.level2Leader, item.orderCount, item.consumedAmount, item.sourceChannel])],
    leaders: [['团长', '编号', '等级', '下级用户', '下级团长', '待结算佣金', '可提现佣金', '已提现佣金', '状态'], ...buildAdminLeaders().map((item) => [item.name, item.promoterId, item.levelLabel, item.directUserCount, item.directLeaderCount, item.pendingCommission, item.availableCommission, item.withdrawnCommission, item.statusLabel])],
    commissions: [['类型', '单号', '金额', '时间'], ...store.commissionSettlementRecords.map((r) => ['佣金结算', r.id, round2(r.amount), r.createdAt]), ...store.supplierSettlementRecords.map((r) => ['供应商结算', r.id, round2(r.amount), r.createdAt])],
    dict: [['编码', '名称', '分组', '排序', '启用'], ...store.dictItems.map((item) => [item.code, item.label, store.dictGroups.find((group) => group.type === item.type)?.name || item.type, item.sort, item.enabled ? '启用' : '停用'])],
    logs: [['时间', '操作人', '角色', '模块', '动作', '结果', '原因'], ...filteredAuditLogs.value.map((item) => [item.createdAt, item.actorName || item.actorId, item.actorRole || '', item.module, item.action, item.result, item.reason || ''])],
    roles: [['角色编码', '角色名称', '菜单数', '按钮权限数', '状态'], ...store.adminRoles.map((item) => [item.code, item.name, item.menuPermissions.length, item.actionPermissions.length, item.enabled ? '启用' : '停用'])],
    accounts: [['账号', '姓名', '角色', '状态', '最后登录'], ...store.adminAccounts.map((item) => [item.account, item.name, store.adminRoles.find((role) => role.id === item.roleId)?.name || item.roleId, item.enabled ? '启用' : '停用', item.lastLoginAt || ''])]
  }
  const rows = exports[active.value]
  const recorded = active.value === 'logs'
    ? await store.recordAuditExport(titles[active.value].title, rows.length - 1)
    : await store.recordExport(titles[active.value].title, rows.length - 1)
  if (!recorded) return showToast(store.error || '当前角色无导出权限或导出日志保存失败')
  // #ifdef H5
  const url = URL.createObjectURL(new Blob([toXlsx(rows, { sheetName: titles[active.value].title })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${titles[active.value].title}-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
  // #endif
  showToast(`已导出 ${rows.length - 1} 条数据`)
}

function syncStorePriceLevelForm() {
  const discounts = store.pricingDefaults.storePriceLevelDiscounts || DEFAULT_STORE_PRICE_LEVEL_DISCOUNTS
  STORE_PRICE_LEVELS.forEach((level) => { storePriceLevelForm[level] = Math.round((discounts[level] ?? 1) * 10000) / 100 })
}

async function saveStorePriceLevelDiscounts() {
  const payload = {} as Record<StorePriceLevel, number>
  STORE_PRICE_LEVELS.forEach((level) => { payload[level] = Number(storePriceLevelForm[level]) / 100 })
  const saved = await store.updatePricingDefaults({ ...store.pricingDefaults, storePriceLevelDiscounts: payload })
  if (saved) {
    syncStorePriceLevelForm()
    showToast('分销价层级折让已保存，门店端按新系数取价')
  } else showToast(store.error || '请检查各档位折让比例（1-100%）')
}

function policyDesc(type: PricePolicy['type']) {
  const skuCount = store.products.length
  const ladderTiers = store.policies.filter((p) => p.type === 'ladder').reduce((sum, p) => sum + (p.tiers?.length || 0), 0)
  return ({
    group: `按门店 / 业务员层级配置的分销供货价，所有门店均可享受。已覆盖 ${skuCount} 个 SKU`,
    ladder: `按采购量分档定价，量越大单价越低，鼓励集中采购。已配置 ${skuCount} 个 SKU · 共 ${ladderTiers} 个档位`
  } as Record<PricePolicy['type'], string>)[type]
}

function policyIcon(type: PricePolicy['type']) {
  return ({ group: 'shopping-bag', ladder: 'list-tree' } as Record<PricePolicy['type'], string>)[type]
}

function policyLabel(type: PricePolicy['type']) {
  return ({ group: '分销价格', ladder: '阶梯价' } as Record<PricePolicy['type'], string>)[type]
}

function commissionRuleIcon(targetType: string) {
  return targetType === 'farm' ? 'house' : targetType === 'product' ? 'package' : 'radio'
}

function productSkuNo(item: Product) {
  const n = Number(item.id.replace(/\D/g, '')) || 0
  return `SKU·${100000 + n * 26 + 260}`
}

function orderProductFallback(name = '') {
  const map: Array<[string, string]> = [
    ['腊肉', '/static/images/bacon.webp'],
    ['黄桃', '/static/images/peach.webp'],
    ['黑茶', '/static/images/tea.webp'],
    ['蜂蜜', '/static/images/honey.webp'],
    ['剁辣椒', '/static/images/chili.webp'],
    ['富硒米', '/static/images/rice.webp']
  ]
  return map.find(([keyword]) => name.includes(keyword))?.[1] || '/static/images/field.webp'
}

function statusText(status: string) {
  const type = ['supplierStatus', 'productStatus', 'farmStatus', 'orderStatus', 'afterSaleStatus', 'promoterStatus', 'commissionStatus']
    .find((candidate) => getDictOptions(candidate, { state: dictionaryState.value, includeDisabled: true }).some((item) => item.code === status))
  if (type) return dictLabel(type, status, dictionaryState.value)
  return ({ pending: '待处理', cooperating: '合作中', paused: '已暂停', active: '已上架', offline: '已下架', rejected: '已驳回', shipping: '已发货', delivered: '已完成', 'after-sale': '售后中', processing: '处理中', resolved: '已解决' } as Record<string, string>)[status] || status
}

function supplierLoginStatus(supplier: Supplier) {
  if (supplier.certified && (supplier.status === 'cooperating' || supplier.status === 'paused')) return '可登录'
  return supplier.status === 'pending' ? '待审核' : '无账号'
}

function channelText(channel: string) {
  return ({ shop: '商城', live: '用户端', purchase: '进货' } as Record<string, string>)[channel] || channel
}

type TrendBucket = { key: string; label: string; amount: number; count: number }
type TrendRange = '7d' | '1m' | '3m' | '1y'

/** 按范围生成趋势分桶；offsetPeriods=1 表示同一长度的上一期，用于「较上期」环比对比。 */
function buildTrendBuckets(range: TrendRange, offsetPeriods = 0): TrendBucket[] {
  const validStatuses = new Set<OrderStatus>(['pending', 'shipping', 'delivered'])
  const orders = store.orders.filter((order) => validStatuses.has(order.status))
  const latest = orders.reduce((value, order) => Math.max(value, new Date(order.createdAt.replace(' ', 'T')).getTime() || 0), 0) || Date.now()
  const end = new Date(latest)
  const keyOf = (date: Date, kind: 'day' | 'week' | 'month') => {
    if (kind === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (kind === 'week') {
      const d = new Date(date)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const labelOf = (date: Date, kind: 'day' | 'week' | 'month') => {
    if (kind === 'month') return `${date.getMonth() + 1}月`
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
  const buckets: TrendBucket[] = []
  const kind = range === '1y' ? 'month' : range === '3m' ? 'week' : 'day'
  const windowSize = range === '1y' ? 12 : range === '3m' ? 13 : range === '1m' ? 30 : 7
  const shift = offsetPeriods * windowSize
  if (range === '1y') {
    for (let i = 11 + shift; i >= shift; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
      buckets.push({ key: keyOf(d, 'month'), label: labelOf(d, 'month'), amount: 0, count: 0 })
    }
  } else if (range === '3m') {
    const start = new Date(end)
    const day = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - day)
    for (let i = 12 + shift; i >= shift; i--) {
      const d = new Date(start)
      d.setDate(d.getDate() - i * 7)
      buckets.push({ key: keyOf(d, 'week'), label: labelOf(d, 'week'), amount: 0, count: 0 })
    }
  } else {
    const total = (range === '1m' ? 29 : 6) + shift
    for (let i = total; i >= shift; i--) {
      const d = new Date(end)
      d.setDate(d.getDate() - i)
      buckets.push({ key: keyOf(d, 'day'), label: labelOf(d, 'day'), amount: 0, count: 0 })
    }
  }
  const map = new Map(buckets.map((b) => [b.key, b]))
  orders.forEach((order) => {
    const date = new Date(order.createdAt.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return
    const bucket = map.get(keyOf(date, kind))
    if (bucket) { bucket.amount = round2(bucket.amount + order.amount); bucket.count += 1 }
  })
  return buckets
}

const trendSeries = computed(() => buildTrendBuckets(trendRange.value))
const previousTrendSeries = computed(() => buildTrendBuckets(trendRange.value, 1))
const trendComparison = computed(() => compareTrendWindows(
  trendSeries.value.map((item) => ({ amount: item.amount, orderCount: item.count })),
  previousTrendSeries.value.map((item) => ({ amount: item.amount, orderCount: item.count }))
))
const trendComparisonText = computed(() => {
  const format = (value: number | null) => value === null ? '--' : `${value > 0 ? '+' : ''}${value}%`
  return `较上期 交易额 ${format(trendComparison.value.amountDeltaPercent)} · 订单量 ${format(trendComparison.value.orderDeltaPercent)}`
})

function renderCharts() {
  if (active.value !== 'dashboard' || !trendEl.value || !categoryEl.value) return
  trendChart?.dispose()
  categoryChart?.dispose()
  trendChart = echarts.init(trendEl.value)
  categoryChart = echarts.init(categoryEl.value)
  const trend = trendSeries.value
  trendChart.setOption({
    grid: { left: 52, right: 46, top: 34, bottom: 30 },
    tooltip: { trigger: 'axis', confine: true, textStyle: { fontSize: UI_TYPOGRAPHY.chartTooltip } },
    legend: { top: 4, left: 'center', itemWidth: 9, itemHeight: 9, textStyle: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } },
    xAxis: { type: 'category', data: trend.map((item) => item.label), axisLine: { lineStyle: { color: designTokens.colorLine } }, axisLabel: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } },
    yAxis: [
      { type: 'value', name: '交易额', splitLine: { lineStyle: { color: designTokens.colorLineLight } }, axisLabel: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } },
      { type: 'value', name: '订单量', splitLine: { show: false }, axisLabel: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } }
    ],
    series: [
      { name: '交易额', type: 'line', yAxisIndex: 0, smooth: true, data: trend.map((item) => item.amount), symbolSize: 7, lineStyle: { width: 3, color: designTokens.colorBrandPrimary }, itemStyle: { color: designTokens.colorBrandPrimary }, areaStyle: { color: designTokens.colorChartFill } },
      { name: '订单量', type: 'bar', yAxisIndex: 1, data: trend.map((item) => item.count), barWidth: 11, itemStyle: { color: designTokens.colorGold, borderRadius: [3, 3, 0, 0] } },
      { name: '上一期交易额', type: 'line', yAxisIndex: 0, smooth: true, data: previousTrendSeries.value.map((item) => item.amount), symbolSize: 5, lineStyle: { width: 2, type: 'dashed', color: designTokens.colorInk2 }, itemStyle: { color: designTokens.colorInk2 } }
    ]
  })
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const narrowCategoryChart = viewportWidth <= 768
  const lowCategoryChart = !narrowCategoryChart && viewportHeight <= 700
  const categoryNames = metrics.value.categoryShares.map((item) => item.name)
  const categoryLegend = narrowCategoryChart
    ? { orient: 'horizontal' as const, left: 'center', right: 8, bottom: 0, itemWidth: 9, itemHeight: 9, itemGap: 10, textStyle: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } }
    : lowCategoryChart
      ? [
          { orient: 'vertical' as const, left: '58%', top: 18, data: categoryNames.filter((_, index) => index % 2 === 0), itemWidth: 8, itemHeight: 8, itemGap: 7, textStyle: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } },
          { orient: 'vertical' as const, left: '78%', top: 18, data: categoryNames.filter((_, index) => index % 2 === 1), itemWidth: 8, itemHeight: 8, itemGap: 7, textStyle: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } }
        ]
      : { orient: 'vertical' as const, right: 6, top: 'middle', itemWidth: 9, itemHeight: 9, textStyle: { color: designTokens.colorInk2, fontSize: UI_TYPOGRAPHY.chartLabel } }
  const categoryCenter: [string, string] = narrowCategoryChart ? ['50%', '38%'] : lowCategoryChart ? ['30%', '50%'] : ['38%', '50%']
  categoryChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%', textStyle: { fontSize: UI_TYPOGRAPHY.chartTooltip } },
    title: { text: `${metrics.value.categoryShares.length} 类`, left: categoryCenter[0], top: categoryCenter[1], textAlign: 'center', textVerticalAlign: 'middle', textStyle: { fontSize: UI_TYPOGRAPHY.subtitle, fontWeight: 700, color: designTokens.colorInk }, subtext: '商品品类', subtextStyle: { fontSize: UI_TYPOGRAPHY.chartLabel, color: designTokens.colorInk2 } },
    legend: categoryLegend,
    series: [{ type: 'pie', radius: narrowCategoryChart ? ['32%', '48%'] : ['38%', '58%'], center: categoryCenter, label: { show: false }, data: metrics.value.categoryShares.map((item, index) => ({ value: item.value, name: item.name, itemStyle: { color: [designTokens.colorBrandPrimary, designTokens.colorGold, designTokens.colorWarningDark, designTokens.colorInfoDark, designTokens.colorInk3][index % 5] } })) }]
  })
}

function resizeCharts() {
  trendChart?.resize()
  categoryChart?.resize()
}

watch(active, async () => { await nextTick(); renderCharts() })
watch([() => store.auth.isLoggedIn, () => store.auth.roleId, () => store.adminRoles.map((role) => `${role.id}:${role.updatedAt}:${role.enabled}`).join('|')], () => {
  if (!store.auth.isLoggedIn) {
    detail.value = null
    dialog.value = null
    workPage.value = null
    catalogProductDialog.value = false
    return
  }
  if (store.canMenu(active.value)) return
  active.value = navItems.find((item) => store.canMenu(item.key))?.key || 'dashboard'
  detail.value = null
  dialog.value = null
  workPage.value = null
  catalogProductDialog.value = false
})
watch([trendRange, period], async () => { if (active.value === 'dashboard') { await nextTick(); renderCharts() } })
watch([() => store.loading, () => store.auth.isLoggedIn], async () => { if (!store.loading && store.auth.isLoggedIn) { await nextTick(); renderCharts() } })
watch(keyword, () => { page.value = 1 })
watch([productKeyword, productSupplierFilter, productSourceFilter, productCategoryFilter, productStatusFilter, productChannelFilter, productReviewFilter, productStockFilter], () => { page.value = 1 })
watch([supplierKeyword, supplierStatusFilter, supplierCategoryFilter, orderKeyword, orderStatusFilter, orderChannelFilter, orderAfterFilter, orderStoreFilter, afterKeyword, settlementKeyword, settlementSupplierFilter, afterTypeFilter, afterStatusFilter, farmKeyword, farmStatusFilter, farmCityFilter, promoterKeyword, promoterTypeFilter, promoterLevelFilter, promoterSettleFilter, categoryKeyword, categoryTypeFilter, commissionKeyword, commissionStatusFilter, supplierSettleKeyword, supplierSettleSupplierFilter, ruleKeyword, dictKeyword, dictStatusFilter, farmAccountFilter, storeAccountKeyword, storeAccountStatusFilter, afterReasonFilter, withdrawalKeyword, withdrawalStatusFilter, roleKeyword, roleStatusFilter, accountKeyword, accountRoleFilter, accountStatusFilter, policyKeyword, logResult], () => { page.value = 1; commissionHistoryPage.value = 1 })
watch(orderStatusFilter, () => { page.value = 1 })
const loginAccount = ref('admin')
const loginPassword = ref('123456')
async function submitLogin() {
  if (!await store.login(loginAccount.value, loginPassword.value)) {
    showToast(store.error || '账号或密码错误（演示账号 admin / 123456）')
    return
  }
  showToast('登录成功，欢迎回来')
}
function logout() {
  store.logout()
  showToast('已退出登录')
}

onMounted(async () => {
  const scenario = new URLSearchParams(window.location.search).get('mock')
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  await store.initialize()
  Object.assign(pricingDefaultsForm, store.pricingDefaults)
  syncStorePriceLevelForm()
  await nextTick()
  renderCharts()
  refreshNow()
  nowTimer = setInterval(refreshNow, 30000)
  disposeKeyboardButtons = installKeyboardButtonSupport()
  window.addEventListener('resize', resizeCharts)
  const platformChangeKeys = [PLATFORM_ADMIN_ACCOUNTS_STORAGE_KEY, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY, PLATFORM_PRICING_DEFAULTS_STORAGE_KEY, PLATFORM_SHARE_CONFIG_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_SETTLEMENTS_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY]
  const refreshSharedState = () => {
    platformVersion.value++
    withdrawalVersion.value++
    void store.refreshSharedState()
  }
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
  const storageKeys = new Set(platformChangeKeys)
  const onStorage = (event: StorageEvent) => { if (!event.key || storageKeys.has(event.key)) refreshSharedState() }
  window.addEventListener('storage', onStorage)
  disposeStorageSync = () => window.removeEventListener('storage', onStorage)
  const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshSharedState() }
  document.addEventListener('visibilitychange', onVisibilityChange)
  disposeVisibilitySync = () => document.removeEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  disposeKeyboardButtons()
  disposePlatformChanges?.()
  disposePlatformChanges = null
  disposeStorageSync?.()
  disposeStorageSync = null
  disposeVisibilitySync?.()
  disposeVisibilitySync = null
  if (nowTimer) clearInterval(nowTimer)
  nowTimer = null
  window.removeEventListener('resize', resizeCharts)
  trendChart?.dispose()
  categoryChart?.dispose()
})
</script>

<template>
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="login-brand">
        <view class="brand-mark"><UiIcon name="sprout" :size="24" /></view>
        <view><text class="brand-title">供应链管理后台</text><text class="brand-sub">运营管理后台</text></view>
      </view>
      <view class="login-fields">
        <label class="login-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="next" /></label>
        <label class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <button class="login-button" @click="submitLogin">登 录</button>
      <text class="login-hint">演示账号：admin　密码：123456</text>
    </view>
  </view>
  <view v-else class="admin-shell">
    <aside class="sidebar">
      <view class="brand">
        <view class="brand-mark"><UiIcon name="sprout" :size="22" /></view>
        <view><text class="brand-title">供应链管理后台</text><text class="brand-sub">运营管理后台</text></view>
      </view>
      <nav class="nav-list">
        <template v-for="group in navGroups" :key="group.name">
          <text class="nav-group">{{ group.name }}</text>
          <button v-for="item in group.items" :key="item.key" class="nav-item" :class="{ active: active === item.key }" @click="selectModule(item.key)">
            <text>{{ item.label }}</text>
            <text v-if="item.badge && item.badge()" class="nav-badge">{{ item.badge() }}</text>
          </button>
        </template>
      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <view class="crumb">供应链中台 / <strong>{{ titles[active].title }}</strong></view>
        <view class="top-actions">
          <view class="filter-control topbar-search"><UiIcon name="search" :size="17" /><input v-model="keyword" placeholder="搜索商品 / 供应商 / 订单号" /></view>
          <button class="period-button" :class="{ on: period === '本月' }" @click="switchPeriod(period === '本月' ? '本周' : '本月')"><UiIcon name="calendar-days" :size="15" />{{ period }}</button>
          <button class="icon-button" aria-label="打开待办提醒" title="待办提醒" @click="openDetail('todos')"><UiIcon name="bell" :size="19" /><span v-if="!store.notificationsRead && store.pendingTodos" class="notice-dot"></span></button>
          <view class="operator">
            <view class="avatar">{{ store.auth.name.slice(0, 1) }}</view>
            <view class="operator-meta"><text>{{ store.auth.name }}</text><small>{{ store.currentAdminRole()?.name || store.auth.roleCode }} · {{ store.auth.account }}</small></view>
            <button class="logout-button" aria-label="退出登录" title="退出登录" @click="logout"><UiIcon name="door-open" :size="15" /><text>退出登录</text></button>
          </view>
        </view>
      </header>

      <view class="content admin-workspace" :data-admin-workspace="active">
        <template v-if="workPage">
          <section class="work-page">
            <view class="work-page-head"><button class="page-back" aria-label="返回" @click="closeOverlay"><UiIcon name="arrow-left" :size="16" /></button><view><h1>{{ workPage.type === 'supplier' ? (workPage.mode === 'create' ? '邀请供应商' : '修改供应商资料') : workPage.type === 'supplier-account' ? '供应商账号信息' : workPage.type === 'role' ? (workPage.mode === 'create' ? '新增角色' : '修改角色') : (workPage.mode === 'create' ? '新增后台账号' : '修改后台账号') }}</h1><p>保存后立即写入共享演示数据并记录操作日志</p></view></view>
            <view v-if="workPage?.type === 'supplier'" class="work-form-grid">
              <view class="form-card"><view class="form-card-title">基础信息</view><view class="form-card-grid">
              <label class="field"><text>供应商名称</text><input v-model="form.name" placeholder="请输入供应商名称" /></label>
              <view class="field"><text>供应商类型</text><SearchableSelect v-model="form.coop" :options="supplierTypeOptions" /></view>
              <view class="field"><text>主营品类</text><SearchableSelect v-model="form.category" :options="supplierCategoryOptions" /></view>
              <label class="field"><text>供应品牌（逗号分隔）</text><input v-model="form.brands" placeholder="如 湘西腊味, 柴火腊味" /></label>
              <label class="field"><text>服务区域（逗号分隔）</text><input v-model="form.serviceRegions" placeholder="如 湘西州, 长沙" /></label>
              <label class="field"><text>所在区域</text><input v-model="form.region" placeholder="如 怀化靖州" /></label>
              <label class="field"><text>联系人手机</text><input v-model="form.contactPhone" maxlength="11" placeholder="认证后作为初始账号和密码" /></label>
              <label class="field"><text>账号创建规则</text><input :value="workPage.mode === 'create' ? '认证通过后自动创建' : (store.supplierAccounts.some(item => item.supplierId === form.id) ? '已创建，请到账号信息修改' : '尚未认证，不创建账号')" disabled /></label>
              </view></view>
              <view class="form-card"><view class="form-card-title">资质与账号</view><view class="form-card-grid">
              <label class="field"><text>营业执照编号</text><input v-model="form.businessLicenseNumber" /></label>
              <view class="field"><text>营业执照图片</text><ImageUploader v-model="form.businessLicense" purpose="supplier-business-license" profile="license" @error="showToast" /></view>
              <label class="field"><text>生产 / 经营许可编号</text><input v-model="form.permitNumber" /></label>
              <view class="field"><text>生产 / 经营许可图片</text><ImageUploader v-model="form.permit" purpose="supplier-permit" profile="license" @error="showToast" /></view>
              <view class="field"><text>证照有效期</text><DatePicker v-model="form.validUntil" placeholder="请选择日期" /></view>
              </view></view>
            </view>
            <view v-else-if="workPage?.type === 'supplier-account'" class="work-form-grid">
              <view class="form-card"><view class="form-card-title">账号信息</view><view class="form-card-grid">
              <label class="field"><text>登录账号</text><input v-model="supplierAccountForm.account" maxlength="11" :disabled="!store.can('supplier.account.update')" /></label>
              <label class="field"><text>新密码</text><input v-model="supplierAccountForm.password" type="password" :disabled="!store.can('supplier.account.update')" placeholder="留空保留当前密码" /></label>
              <view class="field"><text>账号状态</text><SearchableSelect v-model="supplierAccountForm.enabled" :options="enabledOptions" :disabled="!store.can('supplier.account.freeze')" /></view>
              <label v-if="!supplierAccountForm.enabled" class="field full"><text>冻结原因</text><input v-model="supplierAccountForm.freezeReason" placeholder="冻结后供应商及旗下司机均无法登录" /></label>
              </view></view>
            </view>
            <view v-else-if="workPage?.type === 'role'" class="work-form-grid">
              <view class="form-card"><view class="form-card-title">角色信息</view><view class="form-card-grid">
              <label class="field"><text>角色编码</text><input v-model="roleForm.code" :disabled="workPage.mode === 'edit'" placeholder="如 regional_operator" /></label>
              <label class="field"><text>角色名称</text><input v-model="roleForm.name" /></label>
              </view></view>
              <view class="permission-section full"><h3>菜单权限</h3><view class="permission-grid"><button v-for="menu in ALL_ADMIN_MENU_KEYS" :key="menu" type="button" :class="{ selected: roleForm.menuPermissions.includes(menu) }" @click="toggleRoleMenu(menu)">{{ adminMenuLabels[menu] }}</button></view></view>
              <view class="permission-section full"><h3>按钮权限</h3><view class="permission-groups"><section v-for="group in adminPermissionGroups" :key="group.key" class="permission-group" :class="{ disabled: !roleForm.menuPermissions.includes(group.key) }"><view class="permission-group-head"><strong>{{ group.label }}</strong><view><button type="button" :disabled="!roleForm.menuPermissions.includes(group.key)" @click="setRoleActionGroup(group, true)">全选</button><button type="button" @click="setRoleActionGroup(group, false)">清空</button></view></view><view class="permission-grid actions"><button v-for="permission in group.permissions" :key="permission.code" type="button" :disabled="!roleForm.menuPermissions.includes(group.key)" :class="{ selected: roleForm.actionPermissions.includes(permission.code) }" @click="toggleRoleAction(permission.code)">{{ permission.label }}</button></view></section></view></view>
            </view>
            <view v-else-if="workPage?.type === 'admin-account'" class="work-form-grid">
              <view class="form-card"><view class="form-card-title">账号信息</view><view class="form-card-grid">
              <label class="field"><text>登录账号</text><input v-model="adminAccountForm.account" /></label>
              <label class="field"><text>姓名</text><input v-model="adminAccountForm.name" /></label>
              <label class="field"><text>{{ workPage.mode === 'create' ? '初始密码' : '新密码' }}</text><input v-model="adminAccountForm.password" type="password" :placeholder="workPage.mode === 'edit' ? '留空保留当前密码' : '请输入6-20位密码'" /></label>
              <view class="field"><text>角色</text><SearchableSelect v-model="adminAccountForm.roleId" :options="adminRoleOptions" /></view>
              <label v-if="workPage.mode === 'edit'" class="field"><text>账号状态</text><input :value="adminAccountForm.enabled ? '启用（请在账号列表单独变更）' : '停用（请在账号列表单独变更）'" disabled /></label>
              </view></view>
            </view>
            <view class="work-page-actions"><button class="button secondary" @click="closeOverlay">取消</button><button v-if="workPage.type === 'supplier'" class="button primary" :disabled="busy" @click="saveDialog">{{ busy ? '保存中...' : '保存供应商' }}</button><button v-else-if="workPage.type === 'supplier-account'" class="button primary" @click="saveSupplierAccount">保存账号</button><button v-else-if="workPage.type === 'role'" class="button primary" @click="saveRole">保存角色</button><button v-else class="button primary" @click="saveAdminAccount">保存账号</button></view>
          </section>
        </template>
        <template v-else>
        <view class="page-head">
          <view><h1>{{ titles[active].title }}</h1><p>{{ active === 'dashboard' ? '平台经营全景 · 实时更新 · ' + nowText : active === 'farms' ? `${metrics.farmStats.total} 个门店小程序统一管理 · 门店入驻、选品上架、经营数据` : titles[active].subtitle }}</p></view>
          <view class="head-actions">
            <button v-if="active === 'logs' ? store.can('audit.export') : store.can('report.export')" class="button secondary" :disabled="active === 'reports' && !!reportFilterError" @click="exportCurrent"><UiIcon name="download" :size="16" />{{ active === 'dashboard' ? '导出报表' : '导出' }}</button>
            <button v-if="active === 'suppliers' && store.can('supplier.create')" class="button primary" @click="openDialog('supplier')"><UiIcon name="plus" :size="16" />邀请供应商</button>
            <button v-if="active === 'roles' && store.can('admin.role.create')" class="button primary" @click="openRole()"><UiIcon name="plus" :size="16" />新增角色</button>
            <button v-if="active === 'accounts' && store.can('admin.account.create')" class="button primary" @click="openAdminAccount()"><UiIcon name="plus" :size="16" />新增账号</button>
            <button v-if="active === 'products' && store.can('product.create')" class="button primary" @click="openCatalogProductDialog()"><UiIcon name="plus" :size="16" />新增商品</button>
            <button v-if="active === 'categories' && store.can('category.manage')" class="button primary" @click="openCategoryDialog()"><UiIcon name="plus" :size="16" />新增品类</button>
            <button v-if="active === 'prices' && store.can('price.manage')" class="button primary" @click="openDialog('policy')"><UiIcon name="plus" :size="16" />新建价格策略</button>
            <button v-if="active === 'farms' && store.can('farm.manage')" class="button primary" @click="openDialog('farm')"><UiIcon name="plus" :size="16" />新增门店</button>
            <button v-if="active === 'promoters' && store.can('promoter.manage')" class="button primary" @click="openPromoterDialog()"><UiIcon name="plus" :size="16" />新增业务员</button>
            <button v-if="active === 'orders' && store.can('order.ship')" class="button secondary" :disabled="!batchShipCandidates.length" @click="batchShipOrders()">批量发货（{{ batchShipCandidates.length }}）</button>
            <button v-if="active === 'commissions' && store.can('commission.manage')" class="button secondary" :disabled="isOperating('supplier-settle')" @click="confirmAction('确认结算全部合作供应商的未结订单？', () => runOperation('supplier-settle', () => store.settleSuppliers(store.suppliers.map(item => item.id)), '供应商批量结算完成', '没有可结算的供应商订单'))">{{ isOperating('supplier-settle') ? '结算中...' : '供应商结算' }}</button><button v-if="active === 'commissions' && store.can('commission.manage')" class="button primary" :disabled="!store.totalCommission || isOperating('commission-settle')" @click="confirmAction('确认结算当前全部模拟佣金？', () => runOperation('commission-settle', () => store.settleCommissions(), '佣金已结算'))">{{ isOperating('commission-settle') ? '结算中...' : '发起佣金结算' }}</button><button v-if="active === 'commissions' && store.commissionRules.length && store.can('commission.manage')" class="button secondary" @click="openCommission(store.commissionRules[0])">佣金规则</button>
          </view>
        </view>

        <view v-if="activeTodoFilter?.route === active" class="todo-filter-banner">
          <view><strong>{{ activeTodoFilter.title }}</strong><small>{{ activeTodoFilter.objectIds?.join('、') }}</small></view>
          <button class="button secondary todo-filter-clear" @click="clearTodoFilter">清除筛选</button>
        </view>

        <view v-if="store.loading" class="loading">正在加载运营数据...</view>
        <view v-else-if="store.error" class="state-panel"><UiIcon name="radio" :size="28" /><strong>{{ store.error }}</strong><button class="button primary" @click="retryLoad">重新加载</button></view>

        <template v-else-if="active === 'dashboard'">
          <view class="kpi-grid">
            <view class="kpi-card"><span class="kpi-icon"><UiIcon name="badge-dollar-sign" :size="17" /></span><text>平台交易额(GMV)</text><strong>{{ money(metrics.gmv) }}</strong><small>共 {{ metrics.orderCount }} 笔订单</small></view>
            <view class="kpi-card"><span class="kpi-icon"><UiIcon name="house" :size="17" /></span><text>入驻门店</text><strong>{{ metrics.farmCount }} 家</strong><small>经营中 {{ metrics.farmStats.liveCount }} 家</small></view>
            <view class="kpi-card"><span class="kpi-icon"><UiIcon name="factory" :size="17" /></span><text>合作供应商</text><strong>{{ metrics.supplierCount }} 家</strong><small>待审核 {{ store.pendingSuppliers }} 家</small></view>
            <view class="kpi-card"><span class="kpi-icon"><UiIcon name="package-check" :size="17" /></span><text>履约订单</text><strong>{{ metrics.orderCount.toLocaleString('zh-CN') }} 单</strong><small>待发货 {{ metrics.orderStats.pending }} 单</small></view>
          </view>
          <view class="chart-grid">
            <section class="panel trend-panel"><view class="panel-head"><h2>交易与订单趋势</h2><text class="trend-compare">{{ trendComparisonText }}</text><SearchableSelect v-model="trendRange" :options="trendRangeOptions" size="small" search-placeholder="搜索时间范围" /></view><div ref="trendEl" class="chart"></div></section>
            <section class="panel"><view class="panel-head"><h2>品类销售占比</h2><text>{{ metrics.categoryShares.length }} 类商品品类</text></view><div ref="categoryEl" class="chart"></div></section>
          </view>
          <view class="lower-grid">
            <section class="panel"><view class="panel-head"><h2>热销商品 TOP 5</h2><text>{{ period }}</text></view>
              <view v-for="product in metrics.hotProducts" :key="product.name" class="rank-row">
                <BusinessImage class="hot-thumb" :src="product.image" mode="aspectFit" /><view><strong>{{ product.name }}</strong><small>供应商：{{ product.supplier }}</small></view><view class="hot-right"><b>{{ money(product.amount) }}</b><small>{{ product.units }} 件</small></view>
              </view>
              <view v-if="!metrics.hotProducts.length" class="empty-state">本月暂无动销数据</view>
            </section>
            <section class="panel"><view class="panel-head"><h2>待办事项</h2><text>{{ store.pendingTodos }} 项待处理</text></view>
              <button v-for="todo in adminTodos" :key="todo.id" class="todo-row" @click="openTodo(todo)"><span class="todo-emoji"><UiIcon name="bell-ring" :size="18" /></span><view><strong>{{ todo.title }}</strong><small>{{ todo.count }} 项 · {{ todo.objectIds?.[0] }}</small></view><span class="todo-pill" :class="{ no: todo.priority === 'high', wait: todo.priority === 'medium' }">{{ todo.priority === 'high' ? '紧急' : todo.priority === 'medium' ? '待处理' : '提醒' }}</span></button>
              <view v-if="!adminTodos.length" class="empty-state">暂无待处理事项</view>
            </section>
          </view>
        </template>

        <section v-else-if="active === 'reports'" class="data-panel report-panel">
          <view class="report-filters">
            <view class="field"><text>开始日期</text><DatePicker v-model="reportFrom" /></view>
            <view class="field"><text>结束日期</text><DatePicker v-model="reportTo" /></view>
            <view class="field"><text>门店</text><SearchableSelect v-model="reportStoreFilter" :options="reportStoreOptions" search-placeholder="筛选门店" /></view>
            <view class="field"><text>供应商</text><SearchableSelect v-model="reportSupplierFilter" :options="reportSupplierOptions" search-placeholder="筛选供应商" /></view>
            <view class="field"><text>品类</text><SearchableSelect v-model="reportCategoryFilter" :options="reportCategoryOptions" search-placeholder="筛选品类" /></view>
            <view class="field"><text>聚合维度</text><SearchableSelect v-model="reportDimension" :options="reportDimensionOptions" search-placeholder="选择维度" /></view>
          </view>
          <view v-if="reportFilterError" class="report-filter-error">{{ reportFilterError }}</view>
          <view class="stat-strip three report-summary"><view><small>有效订单</small><strong>{{ reportSummary.orderCount }} 单</strong></view><view><small>商品件数</small><strong>{{ reportSummary.itemCount }} 件</strong></view><view><small>GMV</small><strong>{{ money(reportSummary.gmv) }}</strong></view></view>
          <view class="report-table-scroll"><view class="table-row table-head report-grid"><text>聚合维度</text><text>名称</text><text>订单数</text><text>商品件数</text><text>GMV</text></view>
            <view v-for="row in reportRows" :key="row.key" class="table-row report-grid"><text>{{ reportDimension === 'day' ? '日期' : reportDimension === 'store' ? '门店' : reportDimension === 'supplier' ? '供应商' : '品类' }}</text><strong>{{ row.label }}</strong><text>{{ row.orderCount }}</text><text>{{ row.itemCount }}</text><strong>{{ money(row.gmv) }}</strong></view>
          </view>
          <view v-if="!reportRows.length" class="empty-state">当前筛选暂无有效订单</view>
        </section>

        <section v-else-if="active === 'suppliers'" class="data-panel">
          <view class="stat-strip three">
            <view><small>合作供应商</small><strong>{{ supplierStatCounts.cooperating }} 家</strong></view>
            <view><small>待审核资质</small><strong>{{ supplierStatCounts.pending }} 家</strong><span>需在 48h 内处理</span></view>
            <view><small>供销社渠道</small><strong>{{ supplierStatCounts.coop }} 家</strong></view>
          </view>
          <view class="module-toolbar"><view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="supplierKeyword" placeholder="请输入供应商名称" /></view></label><view class="field"><text>状态</text><SearchableSelect v-model="supplierStatusFilter" :options="supplierStatusOptions" class="is-wide" search-placeholder="搜索供应商状态" placeholder="请选择状态" /></view><view class="field"><text>品类</text><SearchableSelect v-model="supplierCategoryFilter" :options="supplierCategoryFilterOptions" class="is-wide" search-placeholder="搜索供应商品类" placeholder="请选择品类" /></view></view><text class="toolbar-count">共 {{ filteredSuppliers.length }} 家</text></view>
          <view class="supplier-table-scroll">
          <view class="table-row table-head supplier-grid"><text>供应商</text><text>主营品类</text><text>商品数</text><text>资质与状态</text><text>操作</text></view>
          <view v-for="item in pagedSuppliers" :key="item.id" class="table-row supplier-grid">
            <view><strong>{{ item.name }}</strong><small>{{ item.region }} · {{ item.coop ? '供销社' : (item.name.includes('合作社') ? '合作社' : '供应商') }}</small><small v-if="item.cooperationPauseReason">暂停原因：{{ item.cooperationPauseReason }}</small></view><view><strong>{{ item.category }}</strong><small>{{ item.serviceRegions?.length ? item.serviceRegions.join(' / ') : item.region }}</small><small>品牌：{{ item.brands?.length ? item.brands.join(' / ') : '待补充' }}</small></view><text>{{ supplierProducts(item).length }}</text>
             <view class="row-actions"><button @click="openDetail('supplier', item.id)">详情</button><button v-if="store.can('supplier.update')" @click="openSupplierEdit(item)">修改</button><button v-if="item.certified && (store.can('supplier.account.update') || store.can('supplier.account.freeze'))" @click="openSupplierAccount(item)">账号信息</button><button v-if="!item.certified && item.status === 'pending' && store.can('supplier.audit')" :disabled="isOperating(`supplier-${item.id}`)" @click="runOperation(`supplier-${item.id}`, () => store.auditSupplier(item.id, true), '审核通过')">{{ isOperating(`supplier-${item.id}`) ? '处理中...' : '通过' }}</button><button v-if="!item.certified && item.status === 'pending' && store.can('supplier.audit')" class="danger" :disabled="isOperating(`supplier-${item.id}`)" @click="runOperation(`supplier-${item.id}`, () => store.auditSupplier(item.id, false), '已驳回')">驳回</button><button v-if="!item.certified && item.status === 'paused' && store.can('supplier.audit')" @click="runOperation(`supplier-${item.id}`, () => store.restoreSupplierPending(item.id), '已恢复待处理')">恢复待处理</button><button v-if="item.certified && item.status === 'cooperating' && store.can('supplier.pause')" class="danger" @click="openSupplierPause(item)">暂停合作</button><button v-if="item.certified && item.status === 'paused' && store.can('supplier.pause')" @click="runOperation(`supplier-${item.id}`, () => store.resumeSupplier(item.id), '已恢复合作')">恢复合作</button></view>
          </view>
          </view>
          <view v-if="!filteredSuppliers.length" class="empty-state">没有符合条件的供应商</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredSuppliers.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'categories'" class="data-panel">
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="categoryKeyword" placeholder="请输入品类名称" /></view></label><view class="field"><text>类型</text><SearchableSelect v-model="categoryTypeFilter" :options="categoryTypeFilterOptions" search-placeholder="搜索品类类型" placeholder="请选择类型" /></view></view>
          <view class="table-row table-head category-grid"><text>品类名称</text><text>类型</text><text>使用数量</text><text>操作</text></view>
          <view v-for="item in pagedCategories" :key="item.id" class="table-row category-grid">
            <strong class="category-label"><BusinessImage v-if="item.type === 'product'" class="category-thumb" :src="productCategoryImage(item.name, dictionaryState)" :fallback="defaultProductCategoryImage(item.name)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="item.name">{{ item.name }}</text></strong>
            <span class="status" :class="item.type">{{ item.type === 'product' ? '商品品类' : item.type === 'supplier' ? '供应商品类' : '通用' }}</span>
            <text>{{ categoryUsage(item) }} 处</text>
            <view class="row-actions"><button v-if="store.can('category.manage')" @click="openCategoryEdit(item)">修改</button><button v-if="store.can('category.manage')" class="danger" @click="removeCategory(item)">删除</button></view>
          </view>
          <view v-if="!filteredCategories.length" class="empty-state">暂无品类</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredCategories.length" @change="page = $event" />
        </section>
        <section v-else-if="active === 'products'" class="data-panel">
          <view class="goods-tools"><view class="filter-bar"><view class="field"><text>审核状态</text><SearchableSelect v-model="productReviewFilter" :options="productReviewOptions" class="is-wide" search-placeholder="搜索商品审核状态" placeholder="请选择审核状态" /></view><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="productKeyword" placeholder="请输入商品名称" /></view></label><view class="field"><text>供应商</text><SearchableSelect v-model="productSupplierFilter" :options="productSupplierFilterOptions" class="is-wide" search-placeholder="搜索供应商" placeholder="请选择供应商" /></view><view class="field"><text>渠道</text><SearchableSelect v-model="productChannelFilter" :options="catalogChannelFilterOptions" search-placeholder="搜索商品渠道" placeholder="请选择渠道" /></view><view class="field"><text>品类</text><SearchableSelect v-model="productCategoryFilter" :options="productCategoryFilterOptions" search-placeholder="搜索商品品类" placeholder="请选择品类" /></view><view class="field"><text>状态</text><SearchableSelect v-model="productStatusFilter" :options="productStatusOptions" search-placeholder="搜索商品状态" placeholder="请选择状态" /></view><view class="field"><text>库存预警</text><SearchableSelect v-model="productStockFilter" :options="productStockFilterOptions" search-placeholder="搜索库存状态" placeholder="请选择库存状态" /></view></view><text class="goods-count">共 {{ unifiedProductRows.length }} 个商品 · 统一目录与共享库存</text></view>
          <view v-if="productReviewFilter === '正式商品'" class="product-table-scroll">
          <view class="table-row table-head unified-product-grid"><text>商品</text><text>渠道</text><text>品类</text><text>价格</text><text>库存</text><text>状态</text><text>操作</text></view>
          <view v-for="product in pagedUnifiedProductRows" :key="product.id" class="table-row unified-product-grid">
            <view class="product-cell"><BusinessImage class="product-thumb" :src="product.image" mode="aspectFit" /><view><strong>{{ product.name }}</strong><view class="tag-row"><span v-for="tag in product.tags.slice(0, 3)" :key="tag" class="product-tag">{{ tag }}</span></view></view></view>
            <view class="channel-tags"><span class="channel-tag" :class="{ live: product.channel === 'live', store: product.channel === 'store' }">{{ product.channel === 'store' ? '门店商品' : product.channel === 'live' ? '用户端商品' : '全部商品' }}</span></view>
            <view class="category-label"><BusinessImage class="category-thumb" :src="productCategoryImage(product.category, dictionaryState)" :fallback="defaultProductCategoryImage(product.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="product.category">{{ product.category }}</text></view>
            <view class="price-cell">
              <strong>零售 ¥{{ formatNumber(activeCatalogSkus(product)[0]?.retailPrice || 0) }}</strong><small class="sku-no">供货 ¥{{ formatNumber(activeCatalogSkus(product)[0]?.cost || 0) }} · MOQ {{ activeCatalogSkus(product)[0]?.minimumOrderQuantity || 1 }} · 一级 ¥{{ formatNumber(activeCatalogSkus(product)[0]?.level1Amount || 0) }} · 二级 ¥{{ formatNumber(activeCatalogSkus(product)[0]?.level2Amount || 0) }}</small>
            </view>
            <view class="stock-cell"><text>{{ activeCatalogSkus(product).reduce((sum, sku) => sum + sku.stock, 0).toLocaleString('zh-CN') }}</text><small v-if="catalogProductStockWarnings(product).length" class="stock-warning-text">{{ catalogProductStockWarnings(product).length }} 个规格低于预警阈值</small></view>
            <span class="status" :class="product.status">{{ product.status === 'pending' ? '待审核' : statusText(product.status) }}</span>
            <view class="row-actions">
              <button v-if="store.can('product.update')" @click="openCatalogProductDialog(product)">编辑</button>
              <button v-if="store.can('product.status') && (product.status === 'active' || product.status === 'offline')" :class="{ danger: product.status === 'active' }" :disabled="isOperating(`product-${product.id}`)" @click="runOperation(`product-${product.id}`, () => store.toggleCatalogProduct(product.id), '商品状态已更新')">{{ isOperating(`product-${product.id}`) ? '处理中...' : product.status === 'active' ? '下架' : '上架' }}</button>
            </view>
          </view>
          </view>
          <view v-if="productReviewFilter === '正式商品' && !unifiedProductRows.length" class="empty-state">没有符合条件的商品</view>
          <PaginationBar v-if="productReviewFilter === '正式商品'" :page="page" :page-size="pageSize" :total="unifiedProductRows.length" @change="page = $event" />
          <view v-if="productReviewFilter !== '正式商品'" class="product-submission-list">
            <view v-for="submission in visibleProductSubmissions" :key="submission.id" class="product-submission-card">
              <view class="product-cell"><BusinessImage class="product-thumb" :src="submission.draft.image" mode="aspectFit" /><view><strong>{{ submission.draft.name }}</strong><small>{{ submission.kind === 'create' ? '新增商品' : '资料修改' }} · {{ submission.draft.supplierName }}</small></view></view>
              <view><span class="status" :class="submission.status">{{ submission.status === 'pending' ? '待审核' : '已驳回' }}</span><small>提交时间 {{ submission.submittedAt }}</small></view>
              <view class="submission-skus"><text v-for="sku in submission.draft.skus" :key="sku.id">{{ sku.name }} · ¥{{ formatNumber(sku.retailPrice) }} · MOQ {{ sku.minimumOrderQuantity || 1 }}</text></view>
              <text v-if="submission.reviewNote" class="reject-note">驳回原因：{{ submission.reviewNote }}</text>
              <view v-if="submission.status === 'pending' && store.can('product.audit')" class="row-actions"><button @click="auditProductSubmission(submission)">通过</button><button class="danger" @click="openRejectProductSubmission(submission)">驳回</button></view>
            </view>
            <view v-if="!visibleProductSubmissions.length" class="empty-state">暂无{{ productReviewFilter }}商品</view>
          </view>
          <view v-if="productRejectTarget" class="modal-mask" @click.self="productRejectTarget = null"><view class="modal"><view class="modal-head"><h2>驳回商品</h2><button class="icon-button" aria-label="关闭" @click="productRejectTarget = null"><UiIcon name="x" :size="18" /></button></view><view class="modal-body"><view class="form-card"><label class="field"><text>驳回原因</text><textarea v-model="productRejectReason" placeholder="请填写具体原因" /></label></view></view><view class="modal-actions"><button class="button secondary" @click="productRejectTarget = null">取消</button><button class="button danger-button" @click="confirmRejectProductSubmission">确认驳回</button></view></view></view>
        </section>
        <view v-else-if="active === 'prices'" class="policy-panels">
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="policyKeyword" placeholder="请输入策略名称 / 范围 / 类型" /></view></label></view>
          <section class="panel pricing-defaults-panel">
            <view class="panel-head"><view><h2>商品默认价格配置</h2><text>保存后仅预填后续新增商品，历史商品不批量覆盖</text></view><button class="button primary" @click="savePricingDefaults">保存默认配置</button></view>
            <view class="pricing-defaults-grid">
              <label class="field"><text>业务员佣金 %</text><input v-model.number="pricingDefaultsForm.promoterCommissionRate" type="number" min="0" max="100" /></label>
              <label class="field"><text>门店佣金 %</text><input v-model.number="pricingDefaultsForm.storeCommissionRate" type="number" min="0" max="100" /></label>
              <label class="field"><text>一级分销金额</text><input v-model.number="pricingDefaultsForm.level1Amount" type="number" min="0" step="0.01" /></label>
              <label class="field"><text>二级分销金额</text><input v-model.number="pricingDefaultsForm.level2Amount" type="number" min="0" step="0.01" /></label>
            </view>
          </section>
          <section class="panel pricing-defaults-panel">
            <view class="panel-head"><view><h2>分销价层级折让</h2><text>按门店 / 业务员层级配置分销供货价系数，门店端按档位取价；100% 为基准分销价</text></view><button class="button primary" @click="saveStorePriceLevelDiscounts">保存层级折让</button></view>
            <view class="pricing-defaults-grid">
              <label class="field"><text>业务员 A 档 %</text><input v-model.number="storePriceLevelForm.A" type="number" min="1" max="100" step="0.01" /></label>
              <label class="field"><text>业务员 B 档 %</text><input v-model.number="storePriceLevelForm.B" type="number" min="1" max="100" step="0.01" /></label>
              <label class="field"><text>门店 / C 档 %</text><input v-model.number="storePriceLevelForm.C" type="number" min="1" max="100" step="0.01" /></label>
            </view>
          </section>
          <section v-for="group in policyGroups" :key="group.type" class="panel policy-group">
            <view class="panel-head policy-group-head"><view><h2><UiIcon :name="policyIcon(group.type)" :size="16" /><text>{{ policyLabel(group.type) }}</text></h2><text>{{ policyDesc(group.type) }}</text></view><text class="policy-group-count">{{ group.items.length }} 条策略</text></view>
            <view class="policy-card-grid">
              <view v-for="item in group.items" :key="item.id" class="policy-data-card">
                <view class="policy-data-top"><view><strong>{{ item.name }}</strong><text class="policy-scope">{{ item.scope }}</text></view><view v-if="store.can('price.manage')" class="policy-actions"><button class="compact-button" @click="openPolicyEdit(item)">编辑</button><button class="switch" :class="{ on: item.enabled }" :disabled="isOperating(`policy-${item.id}`)" :aria-label="item.enabled ? '停用价格策略' : '启用价格策略'" @click="runOperation(`policy-${item.id}`, () => store.togglePolicy(item.id), '价格策略状态已更新')"><span></span></button></view></view>
                <view class="policy-data-meta"><text class="policy-discount">优惠 {{ item.discount }}%</text><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span></view>
                <view v-if="item.type === 'ladder' && item.tiers && item.tiers.length" class="tier-table">
                  <view class="table-row table-head tier-grid"><text>采购数量档位</text><text>阶梯单价</text><text>让利比例</text><text>适用对象</text></view>
                  <view v-for="(tier, ti) in item.tiers" :key="ti" class="table-row tier-grid"><text>{{ tier.maxQty === null ? `≥ ${tier.minQty} 件` : `${tier.minQty} – ${tier.maxQty} 件` }}</text><strong>¥{{ formatNumber(tier.price) }}</strong><text class="tier-off">↓ {{ tier.discountOff }}%</text><text>{{ item.scope }}</text></view>
                </view>
                <view v-else-if="item.type === 'ladder'" class="tier-empty">暂未配置档位</view>
              </view>
            </view>
          </section>
          <view v-if="!filteredPolicies.length" class="empty-state">没有符合条件的价格策略</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredPolicies.length" @change="page = $event" />
        </view>

        <section v-else-if="active === 'orders'" class="data-panel">
           <view class="module-toolbar"><view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="请输入订单号 / 商品" /></view></label><view class="field"><text>门店</text><SearchableSelect v-model="orderStoreFilter" :options="orderStoreSelectOptions" search-placeholder="搜索门店" placeholder="请选择门店" /></view><view class="field"><text>来源</text><SearchableSelect v-model="orderChannelFilter" :options="orderChannelOptions" search-placeholder="搜索订单来源" placeholder="请选择来源" /></view><view class="field"><text>状态</text><SearchableSelect v-model="orderStatusFilter" :options="orderStatusOptions" search-placeholder="搜索订单状态" placeholder="请选择状态" /></view><view class="field"><text>售后</text><SearchableSelect v-model="orderAfterFilter" :options="orderAfterOptions" search-placeholder="搜索售后状态" placeholder="请选择售后状态" /></view></view><view class="toolbar-actions"><button v-if="store.can('report.export')" class="button primary" @click="exportCurrent"><UiIcon name="download" :size="15" />导出订单</button></view></view>
          <view class="fulfill-strip">
            <view class="done"><b><UiIcon name="check" :size="15" /></b><small>下单付款</small><strong>{{ metrics.orderStats.total }} 单</strong></view>
            <view class="done"><b><UiIcon name="check" :size="15" /></b><small>中台接单</small><strong class="is-wrap">自动分配供应商</strong></view>
            <view class="cur"><b>3</b><small>仓配发货</small><strong>{{ metrics.orderStats.pending }} 单处理中</strong></view>
            <view><b>4</b><small>司机配送</small><strong>在途 {{ metrics.orderStats.shipping }} 单</strong></view>
            <view><b>5</b><small>确认收货</small><strong>—</strong></view>
            <view><b>6</b><small>结算分账</small><strong>T+1 结算</strong></view>
          </view>
          <view class="order-table-scroll">
                    <view class="table-row table-head order-grid"><text>订单号</text><text>商品</text><text>数量</text><text>下单门店 / 渠道</text><text>金额</text><text>实付金额</text><text>来源</text><text>状态</text><text>售后状态</text><text>操作</text></view>
          <view v-for="item in pagedOrders" :key="item.id" class="table-row order-grid"><view class="order-id"><view><strong>{{ item.id }}</strong><small>{{ item.createdAt }}</small></view></view><view class="order-products"><view v-for="(p, idx) in orderItems(item)" :key="idx" class="order-product"><BusinessImage class="order-thumb" :src="p.image" :fallback="orderProductFallback(p.name)" :error-fallback="orderProductFallback()" :show-error="false" mode="aspectFit" @click="previewImage" /><text>{{ p.name }} ×{{ p.quantity }}</text></view></view><text class="order-qty">{{ orderTotalQty(item) }}</text><view><strong>{{ item.customer }}</strong></view><strong>¥{{ formatNumber(item.amount) }}</strong><strong>¥{{ formatNumber(orderPaidAmount(item)) }}</strong><text>{{ channelText(item.channel) }}</text><span class="status" :class="item.status">{{ orderFulfillmentText(item.status) }}</span><text>{{ orderAfterStatus(item) }}</text><view class="row-actions"><button v-if="item.status === 'delivered' && !store.afterSales.some((a) => a.orderId === item.id) && store.can('afterSale.manage')" @click="openAfterSaleInit(item)">发起售后</button><button @click="openDetail('order', item.id)">流转</button></view></view>
          </view>
          <view v-if="!visibleOrders.length" class="empty-state">没有符合筛选条件的订单</view><PaginationBar :page="page" :page-size="pageSize" :total="visibleOrders.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'afterSales'" class="data-panel">
          <view class="settle-banner">
            <view><small>本周期应结算</small><strong>{{ money(metrics.afterSaleStats.settlement) }}</strong><span>T+1 自动分账 · 含供应商货款</span></view>
            <view><small>售后工单</small><strong>{{ metrics.afterSaleStats.count }} 单</strong><span>处理中 {{ metrics.afterSaleStats.processing }} · 已完结 {{ metrics.afterSaleStats.resolved }}</span></view>
            <view><small>售后率</small><strong>{{ metrics.afterSaleStats.rate }}</strong><span class="positive">按当前工单统计</span></view>
            <view><small>供应商责任</small><strong>{{ supplierResponsibilityTop ? supplierResponsibilityTop.supplierName : '暂无' }}</strong><span>{{ supplierResponsibilitySummary }}</span></view>
          </view>
          <view v-if="metrics.afterSaleStats.supplierResponsibility.length" class="panel after-responsibility-panel">
            <view class="panel-head"><view><h2>供应商责任分布</h2><text>按售后单归属供应商统计，最多展示 5 家</text></view></view>
            <view v-for="item in metrics.afterSaleStats.supplierResponsibility.slice(0, 5)" :key="item.supplierId" class="history-row"><strong>{{ item.supplierName }} · {{ item.count }} 单</strong><small>退款金额 {{ money(item.amount) }} · 责任占比 {{ item.rate }}%</small></view>
          </view>
          <view class="summary-strip"><view><small>工单总量</small><strong>{{ store.afterSales.length }} 单</strong></view><view><small>处理中</small><strong>{{ store.pendingAfterSales }} 单</strong></view><view><small>售后金额</small><strong>{{ money(store.afterSales.reduce((sum,item) => sum + item.amount, 0)) }}</strong></view><view><small>已退款</small><strong>{{ store.afterSales.filter(item => item.status === 'refunded').length }} 单</strong></view></view>
          <view class="filter-chips"><button v-for="item in ['售后工单','结算流水']" :key="item" :class="{ active: afterTab === item }" @click="afterTab = item; page = 1">{{ item }}</button></view>
          <template v-if="afterTab === '售后工单'">
          <view class="module-toolbar after-sale-toolbar"><view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="afterKeyword" placeholder="请输入工单号 / 订单号 / 商品 / 申请方" /></view></label><view class="field"><text>类型</text><SearchableSelect v-model="afterTypeFilter" :options="afterTypeFilterOptions" search-placeholder="搜索售后类型" placeholder="请选择类型" /></view><view class="field"><text>原因</text><SearchableSelect v-model="afterReasonFilter" :options="afterReasonFilterSelectOptions" search-placeholder="搜索售后原因" placeholder="请选择原因" /></view><view class="field"><text>状态</text><SearchableSelect v-model="afterStatusFilter" :options="afterStatusFilterOptions" search-placeholder="搜索售后状态" placeholder="请选择状态" /></view></view></view>
          <view class="after-sale-table-scroll">
          <view class="table-row table-head after-grid"><text>工单</text><text>商品</text><text>数量</text><text>类型</text><text>申请金额</text><text>退款金额</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedAfterSales" :key="item.id" class="table-row after-grid"><view><strong>{{ item.id }}</strong><small>{{ item.orderId }}</small></view><view class="product-cell"><BusinessImage class="after-thumb" :src="item.image" mode="aspectFit" /><view><strong>{{ item.productName }}</strong><small>{{ item.issue || item.applicant }}</small></view></view><text>{{ item.quantity ?? '—' }}</text><text>{{ item.type === 'reship' ? '破损补寄' : item.type === 'refund' ? '退货退款' : '质量理赔' }}</text><strong>{{ money(item.amount) }}</strong><text class="refund-amount">{{ item.refundAmount != null ? money(item.refundAmount) : '—' }}</text><view class="after-status-cell"><span class="status" :class="item.status">{{ afterSaleStatusText(item.status) }}</span><small v-if="item.returnTrackingNo">退回 {{ item.returnTrackingNo }}</small></view><view class="row-actions"><template v-if="item.status === 'processing' && store.can('afterSale.manage')"><button class="danger" @click="confirmAction('确认拒绝该售后申请？', () => runOperation(`after-${item.id}`, () => store.rejectAfterSale(item.id), '已拒绝售后'))">拒绝</button><button @click="confirmAction('确认同意退款？', () => runOperation(`after-${item.id}`, () => store.approveAfterSaleRefund(item.id), '已同意退款'))">同意退款</button><button @click="confirmAction('确认同意退货？', () => runOperation(`after-${item.id}`, () => store.approveAfterSaleReturn(item.id), '已同意退货'))">同意退货</button><button @click="openDetail('afterSale', item.id)">详情</button></template><template v-else-if="['refund-pending', 'return-pending'].includes(item.status) && store.can('afterSale.manage')"><small>{{ item.status === 'return-pending' ? '等待退货验收' : '等待退款回执' }}</small><button :disabled="isOperating(`after-${item.id}`)" @click="confirmAction(item.status === 'return-pending' ? '确认已收到退货并原路退款？' : '确认发起原路退款？', () => runOperation(`after-${item.id}`, () => store.refundAfterSale(item.id), item.status === 'return-pending' ? '退货退款已完成' : '退款已完成'))">{{ isOperating(`after-${item.id}`) ? '处理中...' : item.status === 'return-pending' ? '确认退货退款' : '执行退款' }}</button><button @click="openDetail('afterSale', item.id)">详情</button></template><template v-else-if="item.status === 'refund-failed' && store.can('afterSale.manage')"><small>{{ item.failureReason || '退款渠道处理失败' }}</small><button :disabled="isOperating(`after-${item.id}`)" @click="confirmAction('确认重新发起原路退款？', () => runOperation(`after-${item.id}`, () => store.refundAfterSale(item.id), '退款已完成'))">{{ isOperating(`after-${item.id}`) ? '处理中...' : '重试退款' }}</button><button @click="openDetail('afterSale', item.id)">详情</button></template><button v-else @click="openDetail('afterSale', item.id)">记录</button></view></view><view v-if="!filteredAfterSales.length" class="empty-state">没有符合条件的售后工单</view><PaginationBar :page="page" :page-size="pageSize" :total="filteredAfterSales.length" @change="page = $event" />
          </view>
          </template>
          <template v-else-if="afterTab === '结算流水'">
            <view class="filter-bar"><label class="field is-search"><text>订单号</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="settlementKeyword" placeholder="请输入订单号" /></view></label><view class="field"><text>供应商</text><SearchableSelect v-model="settlementSupplierFilter" :options="supplierSettleSupplierOptions" class="is-wide" search-placeholder="搜索供应商" placeholder="请选择供应商" /></view></view>
            <view class="settlement-history after-flow">
              <view v-if="!filteredSettlementRecords.length" class="empty-state">{{ settlementRecords.length ? '没有符合条件的结算流水' : '暂无结算流水' }}</view>
              <view v-for="record in pagedSettlementRecords" :key="`${record.kind}-${record.id}`" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>{{ settlementLabel(record) }} · {{ record.createdAt }}</small></view>
              <PaginationBar :page="page" :page-size="pageSize" :total="filteredSettlementRecords.length" @change="page = $event" />
            </view>
          </template>
        </section>

        <section v-else-if="active === 'farms'" class="data-panel">
          <view class="filter-chips solid"><button v-for="tab in ['门店列表','门店账号']" :key="tab" :class="{ active: farmTab === tab }" @click="farmTab = tab; page = 1">{{ tab }}</button></view>
          <template v-if="farmTab === '门店列表'">
          <view class="stat-strip three">
            <view><small>入驻门店</small><strong>{{ metrics.farmStats.total }} 家</strong><span class="positive">经营中 {{ metrics.farmStats.liveCount }} 家</span></view>
            <view><small>已开通小程序</small><strong>{{ metrics.farmStats.liveCount }} 个</strong><span>{{ metrics.farmStats.configuring }} 家配置中</span></view>
            <view><small>门店自有商品</small><strong>{{ metrics.farmStats.selfProducts }} 个</strong><span class="pending-text">待审核 {{ metrics.farmStats.pendingSelfProducts }} 个</span></view>
          </view>
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="farmKeyword" placeholder="请输入门店名称" /></view></label><view class="field"><text>城市</text><SearchableSelect v-model="farmCityFilter" :options="farmCityFilterOptions" search-placeholder="搜索城市" placeholder="请选择城市" /></view><view class="field"><text>状态</text><SearchableSelect v-model="farmStatusFilter" :options="farmStatusFilterOptions" search-placeholder="搜索门店状态" placeholder="请选择状态" /></view></view>
          <view class="farm-table-scroll">
          <view class="table-row table-head farm-grid"><text>门店</text><text>区域</text><text>小程序</text><text>已选品</text><text>本月 GMV</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedFarms" :key="item.id" class="table-row farm-grid"><view class="product-cell"><BusinessImage class="farm-thumb" :src="item.image" mode="aspectFit" @click="previewImage" /><view><strong>{{ item.name }}</strong><small>{{ item.adminDesc || item.tags[0] }}</small><small>联系人：{{ item.contact || '待补充' }}{{ item.contactPhone ? ' · ' + item.contactPhone : '' }}</small></view></view><text>{{ item.region }}</text><text>{{ item.status === 'pending' ? '配置中' : '已上线' }}</text><text>{{ item.selectedCount }} SKU</text><strong>{{ money(item.gmv) }}</strong><span class="status" :class="item.status">{{ item.status === 'active' ? '经营中' : item.status === 'pending' ? '筹备中' : '已停用' }}</span><view class="row-actions"><button @click="openDetail('farm', item.id)">详情</button><button v-if="store.can('farm.manage')" @click="openFarmEdit(item)">修改</button></view></view>
          </view>
          <view v-if="!filteredFarms.length" class="empty-state">没有符合条件的门店</view><PaginationBar :page="page" :page-size="pageSize" :total="filteredFarms.length" @change="page = $event" />
          </template>
          <template v-else>
            <view class="module-toolbar"><view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="storeAccountKeyword" placeholder="请输入姓名 / 登录账号" /></view></label><view class="field"><text>门店</text><SearchableSelect v-model="farmAccountFilter" :options="farmAccountSelectOptions" search-placeholder="搜索门店" placeholder="请选择门店" /></view><view class="field"><text>状态</text><SearchableSelect v-model="storeAccountStatusFilter" :options="roleStatusOptions" search-placeholder="搜索账号状态" placeholder="请选择状态" /></view></view><view class="toolbar-actions"><button class="button primary" @click="openAccountDialog()"><UiIcon name="plus" :size="16" />新增门店账号</button></view></view>
            <view class="account-table-scroll">
            <view class="table-row table-head account-grid"><text>门店</text><text>姓名</text><text>登录账号</text><text>角色</text><text>推广</text><text>状态</text><text>操作</text></view>
            <view v-for="item in pagedStoreAccounts" :key="item.id" class="table-row account-grid"><text>{{ store.farms.find((farm) => farm.id === item.farmId)?.name || item.farmId }}</text><strong>{{ item.name }}</strong><text>{{ item.account }}</text><span class="status" :class="item.role === 'owner' ? 'active' : 'pending'">{{ item.role === 'owner' ? '店主' : '店员' }}</span><span class="status" :class="item.promoEnabled ? 'active' : 'rejected'">{{ item.promoEnabled ? '已开' : '关闭' }}</span><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span><view class="row-actions"><button @click="openAccountDialog(item)">修改</button><button class="danger" :disabled="isOperating(`store-account-${item.id}`)" @click="runOperation(`store-account-${item.id}`, () => store.toggleStoreAccount(item.id), item.enabled ? '账号已停用' : '账号已启用')">{{ isOperating(`store-account-${item.id}`) ? '处理中...' : item.enabled ? '停用' : '启用' }}</button></view></view>
            </view>
            <view v-if="!filteredStoreAccounts.length" class="empty-state">暂无门店账号</view>
            <PaginationBar :page="page" :page-size="pageSize" :total="filteredStoreAccounts.length" @change="page = $event" />
          </template>
        </section>

        <section v-else-if="active === 'promoters'" class="data-panel">
          <view class="stat-strip four">
            <view><small>发展门店</small><strong>{{ promoterBizStats.developedStores }} 家</strong><span>门店账号覆盖</span></view>
            <view><small>成交门店</small><strong>{{ promoterBizStats.dealStores }} 家</strong><span class="positive">有订货记录的门店</span></view>
            <view><small>订货金额</small><strong>¥{{ formatNumber(promoterBizStats.orderAmount) }}</strong><span>门店订货合计</span></view>
            <view><small>业绩贡献</small><strong>¥{{ formatNumber(promoterBizStats.commissionContribution) }}</strong><span>业务员佣金合计</span></view>
          </view>
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="promoterKeyword" placeholder="请输入业务员名称" /></view></label><view class="field"><text>类型</text><SearchableSelect v-model="promoterTypeFilter" :options="promoterTypeOptions" search-placeholder="搜索业务员类型" placeholder="请选择类型" /></view><view class="field"><text>等级</text><SearchableSelect v-model="promoterLevelFilter" :options="promoterLevelFilterOptions" search-placeholder="搜索业务员等级" placeholder="请选择等级" /></view><view class="field"><text>状态</text><SearchableSelect v-model="promoterSettleFilter" :options="promoterSettleFilterOptions" search-placeholder="搜索结算状态" placeholder="请选择状态" /></view></view>
          <view class="promoter-table-scroll">
          <view class="table-row table-head promoter-grid"><text>业务员</text><text>类型</text><text>下级用户数</text><text>服务订单</text><text>订货金额</text><text>佣金</text><text>状态</text><text>操作</text></view>
          <view v-for="item in pagedPromoters" :key="item.id" class="table-row promoter-grid"><view><strong>{{ item.name }}</strong><small>{{ item.level }}</small><small>负责区域：{{ item.region || '待补充' }}</small></view><text>{{ promoterTypeLabel(item.type) }}</text><text>{{ item.fans }}</text><text>{{ item.orders }}</text><strong>{{ money(item.gmv) }}</strong><strong class="commission">{{ money(item.commission) }}</strong><span class="status" :class="item.settled ? 'delivered' : 'pending'">{{ item.settled ? '已结算' : '待结算' }}</span><view class="row-actions"><button v-if="store.can('promoter.manage')" @click="openPromoterEdit(item)">修改</button></view></view>
          </view>
          <view v-if="!visiblePromoters.length" class="empty-state">没有符合条件的业务员</view><PaginationBar :page="page" :page-size="pageSize" :total="visiblePromoters.length" @change="page = $event" />
        </section>

        <section v-else-if="active === 'users'" class="data-panel"><AdminUsersPanel /></section>

        <section v-else-if="active === 'leaders'" class="data-panel"><AdminLeadersPanel /></section>

        <section v-else-if="active === 'commissions'" class="data-panel">
          <view class="filter-chips commission-filter-tabs"><button v-for="item in commissionTabOptions" :key="item.value" :class="{ active: commissionTab === item.value }" @click="commissionTab = item.value; page = 1">{{ item.label }}</button></view>
          <template v-if="commissionTab === '佣金结算'">
            <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="commissionKeyword" placeholder="请输入单号 / 金额 / 业务员" /></view></label><view class="field"><text>状态</text><SearchableSelect v-model="commissionStatusFilter" :options="commissionStatusOptions" search-placeholder="搜索结算状态" placeholder="请选择状态" /></view></view>
            <view class="commission-status-table">
              <view class="panel-head"><h2>业务员结算状态</h2><text>未结算 {{ store.promoters.filter((p) => pendingShareAmount(p.id) > 0).length }} 人 · 已结算 {{ store.promoters.filter((p) => pendingShareAmount(p.id) <= 0).length }} 人</text></view>
              <view class="table-row table-head commission-status-grid"><text>业务员</text><text>类型</text><text>待结佣金</text><text>结算状态</text></view>
              <view v-for="item in pagedPromoterCommissionRows" :key="item.id" class="table-row commission-status-grid" :class="pendingShareAmount(item.id) <= 0 ? 'status-settled' : 'status-unsettled'">
                <view><strong>{{ item.name }}</strong><small>{{ item.level }}</small></view>
                <text>{{ item.type || '业务员' }}</text>
                <strong>{{ money(pendingShareAmount(item.id)) }}</strong>
                <span class="status" :class="pendingShareAmount(item.id) <= 0 ? 'delivered' : 'pending'">{{ pendingShareAmount(item.id) <= 0 ? '已结算' : '未结算' }}</span>
              </view>
              <view v-if="!filteredPromoterCommissionRows.length" class="empty-state">暂无业务员结算数据</view>
              <PaginationBar :page="page" :page-size="pageSize" :total="filteredPromoterCommissionRows.length" @change="page = $event" />
            </view>
            <view class="settlement-history"><view class="panel-head"><h2>佣金结算记录</h2><text>累计 {{ money(filteredCommissionRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!filteredCommissionRecords.length" class="empty-state">暂无佣金流水</view>
              <view v-for="record in pagedCommissionRecords" :key="record.id" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>佣金结算 · {{ record.items.length }} 位业务员 · {{ record.createdAt }}</small><view class="history-items"><view v-for="item in record.items" :key="item.promoterId"><span>{{ item.promoterName }}</span><small>{{ item.promoterId }}</small><b>{{ money(item.amount) }}</b></view></view></view>
              <PaginationBar :page="commissionHistoryPage" :page-size="pageSize" :total="filteredCommissionRecords.length" @change="commissionHistoryPage = $event" />
            </view>
          </template>
          <template v-else-if="commissionTab === '提现审核'">
            <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="withdrawalKeyword" placeholder="请输入申请人 / 提现单号 / 方式" /></view></label><view class="field"><text>状态</text><SearchableSelect v-model="withdrawalStatusFilter" :options="withdrawalStatusOptions" search-placeholder="筛选状态" placeholder="请选择状态" /></view></view>
            <view class="withdrawal-table">
              <view class="withdrawal-table-scroll">
              <view class="table-row table-head withdrawal-grid"><text>申请人</text><text>金额</text><text>方式</text><text>申请时间</text><text>状态</text><text>备注</text><text>操作</text></view>
              <view v-for="item in filteredWithdrawals" :key="item.id" class="table-row withdrawal-grid">
                <view><strong>{{ item.requesterType === 'user' ? '用户' : '业务员' }} · {{ item.requesterId }}</strong><small>{{ item.id }}</small></view><strong>{{ money(item.amount) }}</strong><text>{{ item.method }}</text><text>{{ item.createdAt }}</text><span class="status" :class="item.status">{{ withdrawalStatusText(item.status) }}</span><text>{{ item.reviewedNote || '—' }}</text>
                <view class="row-actions"><template v-if="item.status === 'pending' && store.can('withdrawal.review')"><button @click="confirmAction('确认通过该提现申请？', () => approveWithdrawal(item.id))">通过</button><button class="danger" @click="openWithdrawalReject(item.id)">驳回</button></template><text v-else>—</text></view>
              </view>
              </view>
              <view v-if="!filteredWithdrawals.length" class="empty-state">暂无提现申请</view>
            </view>
          </template>
          <template v-else-if="commissionTab === '供应商结算'">
            <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="supplierSettleKeyword" placeholder="请输入单号 / 金额" /></view></label><view class="field"><text>供应商</text><SearchableSelect v-model="supplierSettleSupplierFilter" :options="supplierSettleSupplierOptions" class="is-wide" search-placeholder="搜索供应商" placeholder="请选择供应商" /></view></view>
            <view class="settlement-history"><view class="panel-head"><h2>供应商结算记录</h2><text>累计 {{ money(filteredSupplierRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!filteredSupplierRecords.length" class="empty-state">暂无供应商结算记录</view>
              <view v-for="record in pagedSupplierSettlementRecords" :key="record.id" class="history-row"><strong>{{ record.id }} · {{ money(record.amount) }}</strong><small>{{ record.period }} · {{ record.items.length }} 家供应商 · {{ record.orderIds.length }} 笔订单 · {{ record.createdAt }}</small><view class="history-items"><view v-for="item in record.items" :key="item.supplierId"><span>{{ item.supplierName }}</span><small>{{ item.orderIds.join('、') || '无关联订单' }}</small><b>{{ money(item.amount) }}</b></view></view></view>
              <PaginationBar :page="page" :page-size="pageSize" :total="filteredSupplierRecords.length" @change="page = $event" />
            </view>
          </template>
          <template v-else-if="commissionTab === '佣金规则'">
            <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="ruleKeyword" placeholder="请输入规则名称" /></view></label></view>
            <view class="commission-rules"><view class="panel-head"><h2>佣金规则</h2><text>本地模拟配置 · 点击编辑调整比例</text></view><view class="commission-rule-grid"><view v-for="rule in filteredRules" :key="rule.id" class="commission-rule-card"><view class="rule-top"><view class="rule-icon"><UiIcon :name="commissionRuleIcon(rule.targetType)" :size="17" /></view><button v-if="store.can('commission.manage')" class="compact-button" @click="openCommission(rule)">编辑</button></view><strong class="rule-name">{{ rule.name }}</strong><view class="rule-rate">{{ rule.rate }}<small>%</small></view><small class="rule-meta">{{ rule.targetType === 'farm' ? '门店推广' : rule.targetType === 'product' ? '商品推广' : '门店推广' }} · 更新于 {{ rule.updatedAt }}</small></view></view></view>
          </template>
          <template v-else-if="commissionTab === '消费分成'">
            <view class="commission-rules"><view class="panel-head"><h2>消费分成设置</h2><text>用户消费后按正式绑定给业务员 / 店员分成 · 全局比例</text></view><view class="share-config-row"><label class="field"><text>业务员分成比例（%）</text><input v-model.number="shareConfig.promoterRate" type="number" min="0" max="100" /></label><label class="field"><text>店员分成比例（%）</text><input v-model.number="shareConfig.staffRate" type="number" min="0" max="100" /></label><button v-if="store.can('commission.manage')" class="button primary" @click="saveShareConfig">保存比例</button></view></view>
            <view class="settlement-history"><view class="panel-head"><h2>消费分成记录</h2><text>共 {{ shareRecords.length }} 笔 · 累计 {{ money(shareRecords.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!shareRecords.length" class="empty-state">暂无消费分成记录</view>
              <view v-for="record in shareRecords" :key="record.id" class="history-row"><strong>{{ record.userId }} · {{ record.orderId }} · 消费 {{ money(record.orderAmount) }}</strong><small>{{ record.role === 'promoter' ? '业务员' : '店员' }} 分成 {{ record.rate }}% · {{ money(record.amount) }} · {{ record.createdAt }}</small></view>
            </view>
          </template>
          <template v-else-if="commissionTab === '团长分成'">
            <view class="commission-rules"><view class="panel-head"><h2>团长分成设置</h2><text>下级用户下单后按比例分成给一级 / 二级团长 · 商品级覆盖在商品库维护</text></view><view class="share-config-row"><label class="field"><text>一级团长分成比例（%）</text><input v-model.number="leaderShareForm.level1Rate" type="number" min="0" max="100" /></label><label class="field"><text>二级团长分成比例（%）</text><input v-model.number="leaderShareForm.level2Rate" type="number" min="0" max="100" /></label><button v-if="store.can('leader.manage')" class="button primary" @click="saveLeaderShareRates">保存比例</button></view></view>
            <view class="settlement-history"><view class="panel-head"><h2>团长分成记录</h2><text>共 {{ leaderCommissionLedger.length }} 笔 · 累计 {{ money(leaderCommissionLedger.reduce((sum, item) => sum + item.amount, 0)) }}</text></view>
              <view v-if="!leaderCommissionLedger.length" class="empty-state">暂无团长分成记录</view>
              <view v-for="record in leaderCommissionLedger" :key="record.id" class="history-row"><strong>{{ record.leaderName }} · {{ record.orderId }} · {{ money(record.amount) }}</strong><small>{{ record.levelLabel }} · {{ record.statusLabel }} · {{ record.createdAt }}</small></view>
            </view>
          </template>
        </section>

        <section v-else-if="active === 'dict'" class="data-panel">
          <view class="dict-toolbar">
            <view class="dict-tabs">
              <view v-for="group in store.dictGroups" :key="group.type" class="dict-tab" :class="{ active: dictTypeTab === group.type }">
                <button class="dict-tab-btn" @click="dictTypeTab = group.type; page = 1">{{ group.name }}</button>
              </view>
            </view>
            <view class="dict-tool-actions">
              <template v-if="activeDictGroup">
                <button v-if="activeDictionaryPermissions.editType" class="button secondary" @click="openDictGroupEdit(activeDictGroup)">编辑分组</button>
                <button v-if="activeDictionaryPermissions.deleteGroup" class="button danger-button" @click="removeDictGroup(activeDictGroup)">删除分组</button>
              </template>
              <button v-if="store.can('dictionary.manage')" class="button secondary" @click="openDictGroupDialog()"><UiIcon name="plus" :size="16" />新增分组</button>
              <button v-if="activeDictionaryPermissions.addItem && store.can('dictionary.manage')" class="button primary" @click="openDictDialog()"><UiIcon name="plus" :size="16" />新增字典项</button>
            </view>
          </view>
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="dictKeyword" placeholder="请输入编码 / 名称" /></view></label><view class="field"><text>状态</text><SearchableSelect v-model="dictStatusFilter" :options="roleStatusOptions" search-placeholder="搜索字典状态" placeholder="请选择状态" /></view></view>
          <view class="dict-table"><view class="table-row table-head dict-grid"><text>编码</text><text>名称</text><text>启用</text><text>排序</text><text>操作</text></view><view v-for="item in pagedDictItems" :key="item.id" class="table-row dict-grid"><strong>{{ item.code }}</strong><view class="category-label"><BusinessImage v-if="dictTypeTab === 'productCategory'" class="category-thumb" :src="productCategoryImage(item.code, dictionaryState)" :fallback="defaultProductCategoryImage(item.label)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="item.label">{{ item.label }}</text></view><span class="status" :class="item.enabled ? 'active' : 'rejected'">{{ item.enabled ? '启用' : '停用' }}</span><text>{{ item.sort }}</text><view class="row-actions"><button v-if="store.can('dictionary.manage')" @click="openDictDialog(item)">修改</button><button v-if="activeDictionaryPermissions.deleteItem && store.can('dictionary.manage')" class="danger" @click="removeDictItem(item.id)">删除</button></view></view></view>
          <view v-if="!filteredDictItems.length" class="empty-state">暂无字典项</view>
          <PaginationBar :page="page" :page-size="pageSize" :total="filteredDictItems.length" @change="page = $event" />
        </section>
        <section v-else-if="active === 'logs'" class="data-panel system-table-panel">
          <view class="audit-filters"><view class="field"><text>开始日期</text><DatePicker v-model="logFrom" placeholder="请选择日期" /></view><view class="field"><text>结束日期</text><DatePicker v-model="logTo" placeholder="请选择日期" /></view><view class="field"><text>操作人</text><SearchableSelect v-model="logActor" :options="logActorOptions" /></view><view class="field"><text>角色</text><SearchableSelect v-model="logRole" :options="logRoleOptions" /></view><view class="field"><text>模块</text><SearchableSelect v-model="logModule" :options="logModuleOptions" /></view></view>
          <view class="filter-bar log-filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="logKeyword" placeholder="请输入动作 / 目标 / 失败原因" /></view></label><view class="field"><text>结果</text><SearchableSelect v-model="logResult" :options="logResultOptions" search-placeholder="搜索结果" placeholder="请选择结果" /></view></view>
          <view class="system-table-scroll"><view class="table-row table-head audit-grid"><text>时间</text><text>操作人</text><text>角色</text><text>模块 / 动作</text><text>目标</text><text>结果</text><text>原因</text><text>详情</text></view><view v-for="entry in filteredAuditLogs" :key="entry.id" class="table-row audit-grid"><text>{{ new Date(entry.createdAt).toLocaleString('zh-CN') }}</text><view><strong>{{ entry.actorName || entry.actorId }}</strong><small>{{ entry.actorId }}</small></view><text>{{ entry.actorRole || '—' }}</text><view><strong>{{ entry.module }}</strong><small>{{ entry.action }}</small></view><text>{{ entry.targetId || '—' }}</text><span class="status" :class="entry.result === 'success' ? 'active' : 'rejected'">{{ entry.result === 'success' ? '成功' : '失败' }}</span><text>{{ entry.reason || '—' }}</text><view class="row-actions"><button @click="openDetail('auditLog', entry.id)">查看</button></view></view></view>
          <view v-if="!filteredAuditLogs.length" class="empty-state">暂无符合条件的操作日志</view>
        </section>
        <section v-else-if="active === 'roles'" class="data-panel system-table-panel">
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="roleKeyword" placeholder="请输入角色名称 / 编码" /></view></label><view class="field"><text>状态</text><SearchableSelect v-model="roleStatusFilter" :options="roleStatusOptions" search-placeholder="搜索角色状态" placeholder="请选择状态" /></view></view>
          <view class="role-table-scroll">
          <view class="table-row table-head role-grid"><text>角色</text><text>编码</text><text>菜单权限</text><text>按钮权限</text><text>状态</text><text>操作</text></view><view v-for="role in filteredRoles" :key="role.id" class="table-row role-grid"><view><strong>{{ role.name }}</strong><small>{{ role.system ? '系统角色' : '自定义角色' }}</small></view><text>{{ role.code }}</text><text>{{ role.menuPermissions.length }} 项</text><text>{{ role.actionPermissions.length }} 项</text><span class="status" :class="role.enabled ? 'active' : 'rejected'">{{ role.enabled ? '启用' : '停用' }}</span><view class="row-actions"><button v-if="store.can('admin.role.update') && role.id !== 'AR-SUPER'" @click="openRole(role)">修改权限</button><text v-else>—</text></view></view>
          </view>
        </section>
        <section v-else-if="active === 'accounts'" class="data-panel system-table-panel">
          <view class="filter-bar"><label class="field is-search"><text>关键词</text><view class="filter-control"><UiIcon name="search" :size="16" /><input v-model="accountKeyword" placeholder="请输入账号 / 姓名" /></view></label><view class="field"><text>角色</text><SearchableSelect v-model="accountRoleFilter" :options="accountRoleFilterOptions" search-placeholder="搜索账号角色" placeholder="请选择角色" /></view><view class="field"><text>状态</text><SearchableSelect v-model="accountStatusFilter" :options="accountStatusOptions" search-placeholder="搜索账号状态" placeholder="请选择状态" /></view></view>
          <view class="admin-account-table-scroll">
          <view class="table-row table-head admin-account-grid"><text>账号</text><text>姓名</text><text>角色</text><text>状态</text><text>最后登录</text><text>操作</text></view><view v-for="account in filteredAdminAccounts" :key="account.id" class="table-row admin-account-grid"><strong>{{ account.account }}</strong><text>{{ account.name }}</text><text>{{ store.adminRoles.find(role => role.id === account.roleId)?.name || account.roleId }}</text><span class="status" :class="account.enabled ? 'active' : 'rejected'">{{ account.enabled ? '启用' : '停用' }}</span><text>{{ account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString('zh-CN') : '从未登录' }}</text><view class="row-actions"><button v-if="store.can('admin.account.update')" @click="openAdminAccount(account)">修改资料</button><button v-if="store.can('admin.account.status')" :class="{ danger: account.enabled }" @click="setAdminAccountEnabled(account)">{{ account.enabled ? '停用' : '启用' }}</button></view></view>
          </view>
        </section>
        </template>
      </view>
    </main>

     <view v-if="dialog && !workPage" class="modal-mask" :class="{ 'work-modal-mask': !['withdrawal-reject', 'supplier-pause', 'recovery-verify'].includes(dialog) }" @click.self="closeOverlay">
       <view class="modal" role="dialog" aria-modal="true" @keydown="trapFocus">
          <view class="modal-head"><view><h2>{{ dialog === 'withdrawal-reject' ? '驳回提现申请' : dialog === 'supplier-pause' ? '暂停供应商合作' : dialog === 'recovery-verify' ? (selectedRecoveryTask?.handlerKey ? '重试恢复任务' : '人工核验恢复任务') : dialog === 'supplier' ? '邀请供应商入驻' : dialog === 'supplier-edit' ? '编辑供应商' : dialog === 'category' ? '新增品类' : dialog === 'category-edit' ? '编辑品类' : dialog === 'policy' ? '新建价格策略' : dialog === 'policy-edit' ? '编辑价格策略' : dialog === 'after-sale-init' ? '发起售后' : dialog === 'commission' ? '编辑佣金规则' : dialog === 'promoter' ? '新增业务员' : dialog === 'promoter-edit' ? '编辑业务员' : dialog === 'farm-edit' ? '编辑门店' : dialog === 'dict' ? '新增字典项' : dialog === 'dict-edit' ? '编辑字典项' : dialog === 'dict-group' ? '新增分组' : dialog === 'dict-group-edit' ? '编辑分组' : dialog === 'store-account' ? '新增门店账号' : dialog === 'store-account-edit' ? '编辑门店账号' : '新增门店' }}</h2><p>{{ dialog === 'recovery-verify' ? '只有重试成功或人工回读确认后，任务才会关闭' : dialog === 'supplier-pause' ? '暂停后供应商和司机仍可登录并处理存量订单，但不能接收新订单或新增司机' : '保存后立即写入本地演示数据' }}</p></view><button class="icon-button" aria-label="关闭弹窗" @click="closeOverlay"><UiIcon name="x" :size="18" /></button></view>
        <view class="modal-body">
        <template v-if="dialog === 'withdrawal-reject'"><view class="form-card"><label class="field"><text>驳回备注（可选）</text><input v-model="withdrawalNote" placeholder="请输入驳回原因" /></label></view></template>
        <template v-if="dialog === 'supplier-pause'"><view class="form-card"><label class="field"><text>暂停合作原因</text><input v-model="supplierPauseReason" placeholder="必填，恢复合作后仍保留在审计日志" /></label></view></template>
        <template v-if="dialog === 'recovery-verify'">
          <view class="form-card">
          <view class="form-card-grid">
          <view class="recovery-verification-summary full"><strong>{{ selectedRecoveryTask?.failedStep || '未知步骤' }}</strong><text>{{ selectedRecoveryTask?.operationId }}</text><small>{{ selectedRecoveryTask?.lastError || selectedRecoveryTask?.reason }}</small></view>
          <view class="field"><text>核验结果</text><SearchableSelect v-model="recoveryOutcome" :options="recoveryOutcomeOptions" /></view>
          <label class="field full"><text>处理说明</text><textarea v-model="recoveryResolutionNote" maxlength="300" placeholder="自动重试可选；人工核验或处理器未加载时必填，并说明已核对的数据快照" /></label>
          </view>
          </view>
        </template>
        <template v-if="dialog === 'supplier' || dialog === 'supplier-edit'">
          <view class="form-card full"><view class="form-card-title">基础信息</view><view class="form-card-grid">
          <label class="field"><text>供应商名称</text><input v-model="form.name" placeholder="请输入供应商名称" /></label>
          <view class="field"><text>供应商类型</text><SearchableSelect v-model="form.coop" :options="supplierTypeOptions" search-placeholder="搜索供应商类型" /></view>
          <view class="field"><text>主营品类</text><SearchableSelect v-model="form.category" :options="supplierCategoryOptions" search-placeholder="搜索主营品类" /></view>
          <label class="field"><text>供应品牌（逗号分隔）</text><input v-model="form.brands" placeholder="如 湘西腊味, 柴火腊味" /></label>
          <label class="field"><text>服务区域（逗号分隔）</text><input v-model="form.serviceRegions" placeholder="如 湘西州, 长沙" /></label>
          <label class="field"><text>所在区域</text><input v-model="form.region" placeholder="如 怀化靖州" /></label>
          <label class="field"><text>联系人手机</text><input v-model="form.contactPhone" maxlength="11" placeholder="请输入11位手机号" /></label>
          <label class="field"><text>登录账号</text><input :value="form.contactPhone" disabled placeholder="保存后自动生成" /></label>
          <label v-if="dialog === 'supplier-edit'" class="field"><text>新密码</text><input v-model="form.supplierPassword" type="password" maxlength="20" placeholder="留空则保留原密码" /></label>
          </view></view>
          <view class="form-card full"><view class="form-card-title">资质与账号</view><view class="form-card-grid">
          <label class="field"><text>营业执照编号</text><input v-model="form.businessLicenseNumber" placeholder="请输入营业执照编号" /></label>
          <view class="field"><text>营业执照图片</text><ImageUploader v-model="form.businessLicense" purpose="supplier-business-license" profile="license" @error="showToast" /></view>
          <label class="field"><text>生产 / 经营许可编号</text><input v-model="form.permitNumber" placeholder="请输入许可编号" /></label>
          <view class="field"><text>生产 / 经营许可图片</text><ImageUploader v-model="form.permit" purpose="supplier-permit" profile="license" @error="showToast" /></view>
          <view class="field"><text>证照有效期</text><DatePicker v-model="form.validUntil" placeholder="请选择日期" /></view>
          </view></view>
        </template>
        <template v-if="dialog === 'category' || dialog === 'category-edit'">
          <view class="form-card full"><view class="form-card-title">品类信息</view><view class="form-card-grid">
          <label class="field"><text>品类名称</text><input v-model="form.name" placeholder="请输入品类名称" /></label>
          <view class="field"><text>品类类型</text><SearchableSelect v-model="form.categoryType" :options="categoryTypeOptions" search-placeholder="搜索品类类型" :disabled="dialog === 'category-edit' && editingDictionaryCategory" /></view>
          <view v-if="form.categoryType === 'product'" class="field full"><text>品类图片（必传）</text><ImageUploader v-model="form.categoryImage" purpose="product-category" @error="showToast" /></view>
          </view></view>
        </template>
        <template v-if="dialog === 'dict' || dialog === 'dict-edit'">
          <view class="form-card full"><view class="form-card-title">字典项信息</view><view class="form-card-grid">
          <label class="field"><text>字典编码</text><input v-model="form.dictCode" placeholder="如 pending / transport" :disabled="!activeDictionaryPermissions.editCode" /></label>
          <label class="field"><text>显示名称</text><input v-model="form.dictLabel" placeholder="如 待处理" /></label>
          <view v-if="dictTypeTab === 'productCategory'" class="field full"><text>品类图片（必传）</text><ImageUploader v-model="form.dictImage" purpose="product-category" @error="showToast" /></view>
          <label class="field"><text>排序</text><input v-model.number="form.dictSort" type="number" min="0" /></label>
          <view class="field"><text>显示色调</text><SearchableSelect v-model="form.dictTone" :options="dictionaryToneOptions" search-placeholder="搜索色调" /></view>
          <view class="field"><text>启用状态</text><SearchableSelect v-model="form.enabled" :options="enabledOptions" search-placeholder="搜索启用状态" /></view>
          </view></view>
        </template>
        <template v-if="dialog === 'dict-group' || dialog === 'dict-group-edit'">
          <view class="form-card full"><view class="form-card-title">分组信息</view><view class="form-card-grid">
          <label class="field"><text>分组名称</text><input v-model="form.dictGroupName" placeholder="如 城市信息 / 数据状态" /></label>
          <label class="field"><text>类型编码</text><input v-model="form.dictGroupType" placeholder="如 productTag（英文，唯一）" :disabled="dialog === 'dict-group-edit' && !activeDictionaryPermissions.editType" /></label>
          </view></view>
        </template>
        <template v-if="dialog === 'store-account' || dialog === 'store-account-edit'">
          <view class="form-card full"><view class="form-card-title">账号信息</view><view class="form-card-grid">
          <view class="field"><text>所属门店</text><SearchableSelect v-model="form.accountFarmId" :options="accountFarmSelectOptions" :disabled="dialog === 'store-account-edit'" search-placeholder="搜索所属门店" /></view>
          <label class="field"><text>姓名</text><input v-model="form.accountName" placeholder="如 王店长" /></label>
          <label class="field"><text>登录账号（手机号）</text><input v-model="form.accountPhone" placeholder="如 13800000001" /></label>
          <label class="field"><text>登录密码</text><input v-model="form.accountPassword" placeholder="如 123456" /></label>
          <view class="field"><text>角色</text><SearchableSelect v-model="form.accountRole" :options="accountRoleOptions" search-placeholder="搜索账号角色" /></view><view v-if="form.accountRole === 'staff'" class="field"><text>业务员档位</text><SearchableSelect v-model="form.accountPriceLevel" :options="accountPriceLevelOptions" search-placeholder="搜索业务员档位" /></view><view v-if="form.accountRole === 'staff'" class="field"><text>店员推广权限</text><SearchableSelect v-model="form.accountPromo" :options="accountPromotionOptions" search-placeholder="搜索推广权限" /></view>
          </view></view>
        </template>
        <template v-if="dialog === 'policy' || dialog === 'policy-edit'"><view class="form-card full"><view class="form-card-title">基本信息</view><view class="form-card-grid"><label class="field"><text>名称</text><input v-model="form.name" placeholder="请输入名称" /></label><view class="field"><text>策略类型</text><SearchableSelect v-model="form.type" :options="policyTypeOptions" :disabled="dialog === 'policy-edit'" search-placeholder="搜索策略类型" /></view><label class="field"><text>适用范围</text><input v-model="form.scope" /></label><label class="field"><text>优惠比例（1-100%）</text><input v-model.number="form.discount" type="number" min="1" max="100" /></label><view v-if="dialog === 'policy-edit'" class="field"><text>规则状态</text><SearchableSelect v-model="form.enabled" :options="enabledOptions" search-placeholder="搜索规则状态" /></view></view></view><view v-if="form.type === 'ladder'" class="form-card full"><view class="form-card-title">阶梯档位</view><view class="tier-editor"><view class="tier-editor-head"><button class="mini-button" type="button" @click="addTier">＋ 添加档位</button></view><view v-for="(tier, ti) in form.tiers" :key="ti" class="tier-editor-row"><label class="field"><text>起始数量</text><input v-model.number="tier.minQty" type="number" min="1" placeholder="如 1" /></label><label class="field"><text>上限数量（留空=无上限）</text><input v-model.number="tier.maxQty" type="number" min="1" placeholder="留空为无上限" /></label><label class="field"><text>阶梯单价</text><input v-model.number="tier.price" type="number" min="0" step="0.1" placeholder="如 42" /></label><label class="field"><text>让利 %</text><input v-model.number="tier.discountOff" type="number" min="0" max="100" placeholder="如 30" /></label><button class="compact-button danger" type="button" @click="removeTier(ti)">删除</button></view></view></view></template>
        <template v-if="dialog === 'after-sale-init'"><view class="form-card full"><view class="form-card-title">售后信息</view><view class="form-card-grid"><label class="field"><text>售后订单</text><input :value="form.id" disabled /></label><view class="field"><text>售后类型</text><SearchableSelect v-model="form.result" :options="afterSaleTypeOptions" search-placeholder="搜索售后类型" /></view><view class="field"><text>售后原因</text><SearchableSelect v-model="form.initIssue" :options="afterReasonSelectOptions" search-placeholder="搜索售后原因" /></view></view></view></template>
        <template v-if="dialog === 'commission'"><view class="form-card full"><view class="form-card-title">佣金规则</view><view class="form-card-grid"><label class="field"><text>佣金比例（1-100%）</text><input v-model.number="form.rate" type="number" min="1" max="100" /></label></view></view></template>
        <template v-if="dialog === 'promoter' || dialog === 'promoter-edit'">
          <view class="form-card full"><view class="form-card-title">业务员信息</view><view class="form-card-grid">
          <label class="field"><text>业务员姓名</text><input v-model="form.name" placeholder="请输入业务员姓名" /></label>
          <view class="field"><text>等级标签</text><SearchableSelect v-model="form.level" :options="promoterLevelOptions" search-placeholder="搜索业务员等级" /></view>
          <label class="field"><text>负责区域</text><input v-model="form.promoterRegion" placeholder="如 湘西州 / 长沙市" /></label>
          <view class="field"><text>类型</text><SearchableSelect v-model="form.promoterType" :options="promoterFormTypeOptions" search-placeholder="搜索业务员类型" /></view>
          <view class="field"><text>状态</text><SearchableSelect v-model="form.promoterStatus" :options="promoterStatusOptions" search-placeholder="搜索业务员状态" /></view>
          </view></view>
        </template>
        <template v-if="dialog === 'farm' || dialog === 'farm-edit'">
          <view class="form-card full"><view class="form-card-title">基础信息</view><view class="form-card-grid">
          <label class="field"><text>门店名称</text><input v-model="form.name" placeholder="请输入门店名称" /></label>
          <view class="field"><text>门店封面</text><ImageUploader v-model="form.image" purpose="farm-cover" @error="showToast" /></view>
          <label class="field"><text>门店联系人</text><input v-model="form.contact" placeholder="如 王店长" /></label>
          <label class="field"><text>联系人手机号</text><input v-model="form.contactPhone" maxlength="11" placeholder="请输入11位手机号" /></label>
          </view></view>
          <view class="form-card full"><view class="form-card-title">位置信息</view><view class="form-card-grid">
          <label class="field"><text>省份</text><input value="湖南省" disabled /></label>
          <view class="field"><text>城市</text><SearchableSelect v-model="form.farmCityCode" :options="farmCitySelectOptions" search-placeholder="搜索城市" /></view>
          <view class="field"><text>县区</text><SearchableSelect v-model="form.farmDistrictCode" :options="farmDistrictSelectOptions" :disabled="!form.farmCityCode" search-placeholder="搜索县区" /></view>
          <label class="field"><text>详细地址</text><input v-model="form.farmDetail" placeholder="如 潇湘中路123号" /></label>
          </view></view>
          <view v-if="dialog === 'farm-edit'" class="location-info full">
            <view class="location-info-head"><text>定位状态</text><strong :class="editingFarm?.locationStatus || 'failed'">{{ editingFarm?.locationStatus === 'resolved' ? '已定位' : editingFarm?.locationStatus === 'pending' ? '定位中' : '定位失败' }}</strong><button class="compact-button" :disabled="busy" @click="retryFarmGeocode"><UiIcon name="map-pin" :size="14" />重新定位</button></view>
            <template v-if="editingFarm?.location">
              <text>标准地址：{{ editingFarm.location.formattedAddress }}</text>
              <text>省 / 市 / 区：{{ editingFarm.location.province }} / {{ editingFarm.location.city }} / {{ editingFarm.location.district }}</text>
              <text>GCJ-02：{{ editingFarm.location.longitude.toFixed(6) }}, {{ editingFarm.location.latitude.toFixed(6) }}</text>
            </template>
            <text v-else>暂无有效坐标{{ editingFarm?.locationError ? `（${editingFarm.locationError}）` : '' }}</text>
          </view>
          <view class="form-card full"><view class="form-card-title">经营数据</view><view class="form-card-grid">
          <label class="field"><text>门店标签</text><input v-model="form.tags" placeholder="逗号分隔，如 柴火土菜,临溪包厢" /></label>
          <label class="field"><text>评分</text><input v-model.number="form.rating" type="number" min="0" max="5" step="0.1" /></label>
          <label class="field"><text>平均客单价</text><input v-model.number="form.averageSpend" type="number" min="0" /></label>
          <view class="field"><text>经营状态</text><SearchableSelect v-model="form.farmStatus" :options="farmStatusOptions" search-placeholder="搜索经营状态" /></view>
          </view></view>
        </template>
        </view>
        <view class="modal-actions"><button class="button secondary" :disabled="busy" @click="closeOverlay">取消</button><button class="button primary" :class="{ 'danger-button': dialog === 'supplier-pause' || dialog === 'withdrawal-reject' }" :disabled="busy" @click="saveDialog">{{ busy ? '处理中...' : dialog === 'withdrawal-reject' ? '确认驳回' : dialog === 'supplier-pause' ? '确认暂停合作' : dialog === 'recovery-verify' ? (selectedRecoveryTask?.handlerKey ? '重试并核验' : '保存核验结果') : dialog === 'supplier' ? '发送邀请' : dialog === 'supplier-edit' || dialog === 'farm-edit' ? '保存修改' : '保存' }}</button></view>
      </view>
    </view>

    <view v-if="catalogProductDialog" class="modal-mask work-modal-mask" @click.self="catalogProductDialog = false">
      <view class="modal catalog-product-modal" role="dialog" aria-modal="true">
        <view class="modal-head"><view><h2>{{ store.catalogProducts.some((item) => item.id === catalogProductForm.id) ? '编辑商品' : '新增商品' }}</h2><p>门店订货端、用户端与全部商品使用同一商品目录</p></view><button class="icon-button" aria-label="关闭弹窗" @click="catalogProductDialog = false"><UiIcon name="x" :size="18" /></button></view>
        <view class="modal-body catalog-product-body">
        <view class="form-card"><view class="form-card-title">基础信息</view><view class="form-card-grid">
          <label class="field"><text>商品名称</text><input v-model="catalogProductForm.name" placeholder="请输入商品名称" /></label>
          <view class="field"><text>商品渠道</text><SearchableSelect v-model="catalogProductForm.channel" :options="catalogProductChannelOptions" search-placeholder="搜索商品渠道" /></view>
          <view class="field"><text>商品类型</text><SearchableSelect v-model="catalogProductForm.productType" :options="catalogProductTypeOptions" search-placeholder="搜索商品类型" /></view>
          <view class="field"><text>快递直发</text><SearchableSelect v-model="catalogProductForm.expressDelivery" :options="expressDeliveryOptions" :disabled="catalogProductForm.productType === 'package'" search-placeholder="搜索快递方式" /></view>
          <view class="field"><text>商品分类</text><SearchableSelect v-model="catalogProductForm.category" :options="productCategoryOptions" search-placeholder="搜索商品分类" /></view>
          <view class="field"><text>供应商</text><SearchableSelect v-model="catalogProductForm.supplierId" :options="catalogSupplierOptions" search-placeholder="搜索供应商" /></view>
          <view class="field"><text>商品来源</text><SearchableSelect v-model="catalogProductForm.source" :options="catalogProductSourceOptions" search-placeholder="搜索商品来源" /></view>
        </view></view>
        <view class="form-card"><view class="form-card-title">图片与标签 · 推广佣金</view><view class="form-card-grid">
          <view class="field"><text>商品主图（必传）</text><ImageUploader v-model="catalogProductForm.image" purpose="catalog-main" @error="showToast" /></view>
          <view class="field"><text>商品图库（最多 9 张）</text><ImageUploader v-model="catalogProductForm.images" purpose="catalog-gallery" multiple :max-count="9" @error="showToast" /></view>
          <label class="field"><text>标签（逗号分隔）</text><input v-model="catalogProductForm.tags" placeholder="产地直发,精选" /></label>
          <label class="field"><text>业务员佣金率 %</text><input v-model.number="catalogProductForm.promoterCommissionRate" type="number" min="0" max="100" /></label>
          <label class="field"><text>门店佣金率 %</text><input v-model.number="catalogProductForm.storeCommissionRate" type="number" min="0" max="100" /></label>
        </view></view>
        <view class="form-card"><view class="form-card-title">SKU 明细</view>
        <view class="c-sku-editor"><view class="tier-editor-head"><text>SKU 价格、起订量与共享库存</text><button class="mini-button" type="button" @click="addCatalogSku">＋ 添加 SKU</button></view><view class="catalog-sku-labels"><text>规格名称</text><text>规格图片</text><text>零售价</text><text>供货价</text><text>库存</text><text>起订量</text><text>一级金额</text><text>二级金额</text><text>预警阈值</text><text>操作</text></view><view v-for="(sku, index) in catalogProductForm.skus" :key="sku.id" class="c-sku-row" :class="{ retired: sku.status === 'retired' }"><input v-model="sku.name" :disabled="sku.status === 'retired'" placeholder="规格名称" /><ImageUploader v-model="sku.image" :purpose="`catalog-sku-${sku.id}`" :disabled="sku.status === 'retired'" @error="showToast" /><input v-model.number="sku.retailPrice" :disabled="sku.status === 'retired'" type="number" min="0" step="0.01" placeholder="零售价" /><input v-model.number="sku.cost" :disabled="sku.status === 'retired'" type="number" min="0" step="0.01" placeholder="供货价" /><input v-model.number="sku.stock" :disabled="sku.status === 'retired'" type="number" min="0" placeholder="库存" /><input v-model.number="sku.minimumOrderQuantity" :disabled="sku.status === 'retired'" type="number" min="1" step="1" placeholder="起订量" /><input v-model.number="sku.level1Amount" :disabled="sku.status === 'retired'" type="number" min="0" step="0.01" placeholder="一级金额" /><input v-model.number="sku.level2Amount" :disabled="sku.status === 'retired'" type="number" min="0" step="0.01" placeholder="二级金额" /><input v-model.number="sku.warningThreshold" :disabled="sku.status === 'retired'" type="number" min="0" step="1" placeholder="预警阈值" /><button v-if="sku.status === 'retired'" class="compact-button" type="button" @click="restoreCatalogSku(index)">恢复</button><button v-else class="compact-button danger" type="button" @click="removeCatalogSku(index)">{{ persistedCatalogSkuIds.has(sku.id) ? '停用' : '删除' }}</button></view></view>
        </view>
        </view>
        <view v-if="editingProductStockLogs.length" class="form-card full"><view class="form-card-title">库存变动记录</view><view v-for="log in editingProductStockLogs" :key="log.id" class="history-row"><strong>{{ log.skuName }} · {{ log.before }} → {{ log.after }}（{{ log.delta > 0 ? '+' : '' }}{{ log.delta }}）</strong><small>{{ log.reason }} · {{ log.operator }} · {{ log.createdAt.slice(0, 16).replace('T', ' ') }}</small></view></view>
        <view class="modal-actions"><button class="button secondary" @click="catalogProductDialog = false">取消</button><button class="button primary" @click="saveCatalogProductDialog">保存商品</button></view>
      </view>
    </view>

     <view v-if="detail" class="drawer-mask" @click.self="closeOverlay">
       <aside class="drawer" role="dialog" aria-modal="true" @keydown="trapFocus">
         <view class="drawer-head"><view class="drawer-head-icon"><UiIcon :name="detail.type === 'todos' ? 'bell-ring' : detail.type === 'supplier' ? 'factory' : detail.type === 'order' ? 'list-tree' : detail.type === 'afterSale' ? 'headset' : detail.type === 'auditLog' ? 'book-open' : 'store'" :size="18" /></view><view><small>本地演示数据</small><h2>{{ detail.type === 'todos' ? '待办中心' : detail.type === 'supplier' ? '供应商详情' : detail.type === 'order' ? '订单流转记录' : detail.type === 'afterSale' ? '售后处理记录' : detail.type === 'auditLog' ? '操作日志详情' : '门店经营数据' }}</h2></view><view class="drawer-head-actions"><button v-if="detail.type === 'todos'" class="mark-read-button" @click="markAllRead"><UiIcon name="check" :size="15" />全部已读</button><button class="icon-button" aria-label="关闭抽屉" @click="closeOverlay"><UiIcon name="x" :size="18" /></button></view></view>
        <view v-if="detail.type === 'todos'" class="drawer-list todo-detail">
          <button v-for="todo in adminTodos" :key="todo.id" @click="openTodo(todo)"><span>{{ todo.title }}</span><b>{{ todo.count }}</b></button>
           <view class="recovery-section"><view class="recovery-head"><span>待恢复事务</span><b>{{ store.pendingRecovery }}</b></view><view v-if="!recoveryTasks.length" class="drawer-muted">暂无待恢复任务</view><view v-for="task in recoveryTasks" :key="task.id" class="recovery-row"><view><strong>{{ task.failedStep }}</strong><small>{{ task.operationId }} · {{ task.lastError || task.reason }}</small></view><button v-if="store.can('recovery.resolve')" class="compact-button" @click="openRecoveryVerification(task.id)">{{ task.handlerKey ? '重试' : '人工核验' }}</button></view></view>
          <view class="export-history"><strong>最近导出</strong><text v-if="!store.exportRecords.length">暂无导出记录</text><text v-for="item in store.exportRecords.slice(0, 3)" :key="item.id">{{ item.module }} · {{ item.count }} 条 · {{ item.createdAt }}</text></view>
        </view>
        <view v-else-if="detail.type === 'supplier' && selectedSupplier" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="factory" :size="25" /></view><view><h3>{{ selectedSupplier.name }}</h3><text>{{ selectedSupplier.region }} · {{ selectedSupplier.category }}</text></view></view>
           <view class="detail-grid"><view><small>合作状态</small><strong>{{ statusText(selectedSupplier.status) }}</strong></view><view><small>账号状态</small><strong>{{ supplierLoginStatus(selectedSupplier) }}</strong></view><view><small>供应商类型</small><strong>{{ selectedSupplier.coop ? '供销社渠道' : '合作供应商' }}</strong></view><view><small>供应品牌</small><strong>{{ selectedSupplier.brands?.length ? selectedSupplier.brands.join(' / ') : '待补充' }}</strong></view><view><small>服务区域</small><strong>{{ selectedSupplier.serviceRegions?.length ? selectedSupplier.serviceRegions.join(' / ') : selectedSupplier.region }}</strong></view><view><small>供应商品</small><strong>{{ supplierProducts(selectedSupplier).length }} 款</strong></view><view><small>联系人手机</small><strong>{{ selectedSupplier.contactPhone || '—' }}</strong></view><view><small>登录账号</small><strong>{{ selectedSupplierAccount?.account || selectedSupplier.contactPhone || '—' }}</strong></view><view><small>营业执照编号</small><strong>{{ selectedSupplierQualification?.businessLicenseNumber || '待补充' }}</strong><BusinessImage class="license-thumb" :src="selectedSupplierQualification?.businessLicense" mode="aspectFit" @click="previewImage" /></view><view><small>生产 / 经营许可编号</small><strong>{{ selectedSupplierQualification?.permitNumber || '待补充' }}</strong><BusinessImage class="license-thumb" :src="selectedSupplierQualification?.permit" mode="aspectFit" @click="previewImage" /></view><view><small>证照有效期</small><strong>{{ selectedSupplierQualification?.validUntil }}</strong></view><view><small>审核说明</small><strong>{{ selectedSupplierQualification?.reviewNote }}</strong></view></view>
           <view class="supplier-products">
             <view class="panel-head"><h2>供应商品</h2><text>{{ supplierProducts(selectedSupplier).length }} 款</text></view>
             <view v-if="!supplierProducts(selectedSupplier).length" class="empty-state">该供应商暂无商品</view>
             <view v-for="product in supplierProducts(selectedSupplier)" :key="product.id" class="supplier-product-row">
               <BusinessImage class="supplier-thumb" :src="product.image" mode="aspectFit" @click="previewImage" />
                <view class="sp-name"><strong>{{ product.name }}</strong><small class="category-label"><BusinessImage class="category-thumb category-thumb--small" :src="productCategoryImage(product.category, dictionaryState)" :fallback="defaultProductCategoryImage(product.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="`${product.category} · ${product.supplier}`">{{ product.category }} · {{ product.supplier }}</text></small></view>
                <strong>¥{{ formatNumber(product.price) }}</strong>
               <span class="status" :class="product.status">{{ product.status === 'pending' ? '待审核' : statusText(product.status) }}</span>
             </view>
           </view>
           <view class="drawer-actions"><button v-if="store.can('supplier.update')" class="button secondary" @click="openSupplierEdit(selectedSupplier)">修改资料</button><button v-if="selectedSupplier.certified && (store.can('supplier.account.update') || store.can('supplier.account.freeze'))" class="button secondary" @click="openSupplierAccount(selectedSupplier)">账号信息</button><template v-if="!selectedSupplier.certified && selectedSupplier.status === 'pending' && store.can('supplier.audit')"><button class="button primary" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="auditSupplier(selectedSupplier.id, true)">{{ isOperating(`supplier-${selectedSupplier.id}`) ? '处理中...' : '通过资质' }}</button><button class="button danger-button" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="auditSupplier(selectedSupplier.id, false)">驳回</button></template><button v-if="!selectedSupplier.certified && selectedSupplier.status === 'paused' && store.can('supplier.audit')" class="button primary" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="restoreSupplierPending(selectedSupplier)">恢复待处理</button><button v-if="selectedSupplier.certified && selectedSupplier.status === 'cooperating' && store.can('supplier.pause')" class="button danger-button" @click="openSupplierPause(selectedSupplier)">暂停合作</button><button v-if="selectedSupplier.certified && selectedSupplier.status === 'paused' && store.can('supplier.pause')" class="button primary" :disabled="isOperating(`supplier-${selectedSupplier.id}`)" @click="resumeSupplier(selectedSupplier)">恢复合作</button></view>
        </view>
        <view v-else-if="detail.type === 'order' && selectedOrder" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="list-tree" :size="25" /></view><view><h3>{{ selectedOrder.id }}</h3><text>{{ selectedOrder.customer }} · {{ selectedOrder.productName }}</text></view></view>
          <view class="detail-grid"><view><small>下单时间</small><strong>{{ selectedOrder.createdAt }}</strong></view><view><small>订单状态</small><strong>{{ orderFulfillmentText(selectedOrder.status) }}</strong></view><view><small>实付金额</small><strong>¥{{ formatNumber(orderPaidAmount(selectedOrder)) }}</strong></view><view><small>订单渠道</small><strong>{{ channelText(selectedOrder.channel) }}</strong></view></view>
          <view class="detail-grid"><view><small>配送方式</small><strong>{{ orderCarrier(selectedOrder) }}</strong></view><view><small>运单号</small><strong>{{ selectedOrder.trackingNo || selectedOrder.supplierFulfillment?.trackingNo || '待承运' }}</strong></view><view><small>签收结果</small><strong>{{ orderSignResult(selectedOrder) }}</strong></view></view>
          <template v-if="orderLogisticsEvents(selectedOrder).length">
          <h3>物流轨迹</h3>
          <view class="timeline-list"><view v-for="(event, index) in orderLogisticsEvents(selectedOrder)" :key="`${event.time}-${index}`"><span></span><view><strong>{{ event.title }}</strong><small>{{ event.time }}</small><text v-if="event.detail">{{ event.detail }}</text></view></view></view>
          </template>
          <view v-else class="tracking-number"><small>物流轨迹</small><strong>暂无物流轨迹，等待供应商发货</strong></view>
          <h3>订单流转记录</h3>
          <view class="timeline-list"><view v-for="(event, index) in orderFlow(selectedOrder)" :key="`${event.time}-${index}`"><span></span><view><strong>{{ event.action }}</strong><small>{{ event.time }} · {{ event.operator }}</small><text v-if="event.note">{{ event.note }}</text></view></view></view>
        </view>
        <view v-if="detail.type === 'order' && selectedOrder && selectedOrder.status === 'shipping' && store.can('order.confirm')" class="drawer-actions"><button class="button primary wide" @click="confirmOrder(selectedOrder)">确认收货</button></view>
        <view v-else-if="detail.type === 'afterSale' && selectedAfterSale" class="drawer-list">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="headset" :size="25" /></view><view><h3>{{ selectedAfterSale.id }}</h3><text>{{ selectedAfterSale.productName }} · {{ money(selectedAfterSale.amount) }}</text></view></view>
          <view class="detail-grid"><view><small>工单创建</small><strong>{{ selectedAfterSale.applicant }} 提交申请</strong></view><view v-if="selectedAfterSale.refundAmount != null"><small>{{ selectedAfterSale.refundMethod === 'return' ? '退货退款' : '仅退款' }}</small><strong>退款金额 {{ money(selectedAfterSale.refundAmount) }} · {{ selectedAfterSale.refundMode === 'full' ? '全额退款' : selectedAfterSale.refundMode === 'ratio' ? '按比例退款' : '自定义退款' }}</strong></view></view>
          <view class="tracking-number"><small>退货物流</small><strong>{{ selectedAfterSale.returnTrackingNo || '未登记退回运单号' }}</strong></view>
          <view v-if="['processing', 'return-pending'].includes(selectedAfterSale.status) && store.can('afterSale.manage')" class="return-tracking-form"><label class="field"><text>登记退回运单号</text><input v-model="returnTrackingDraft" maxlength="32" placeholder="请输入退回运单号" /></label><button class="button primary" :disabled="returnTrackingDraft.trim().length < 6" @click="saveReturnTracking">保存运单号</button></view>
          <view v-for="item in selectedAfterSale.history || []" :key="item.time" class="history-row"><strong>{{ item.action }}</strong><small>{{ item.operator }} · {{ item.time }}</small></view>
           <view v-if="(selectedAfterSale.evidenceImages || []).length" class="history-row"><strong>上传凭证</strong><view class="after-evidence-grid"><BusinessImage v-for="(img, i) in selectedAfterSale.evidenceImages" :key="i" :src="img" mode="aspectFill" class="after-evidence-thumb" @click="previewImage" /></view></view>
        </view>
        <view v-else-if="detail.type === 'farm' && selectedFarm" class="drawer-list">
          <BusinessImage class="farm-cover" :src="selectedFarm.image" mode="aspectFit" @click="previewImage" /><h3>{{ selectedFarm.name }}</h3><text class="drawer-muted">{{ selectedFarm.region }} · {{ selectedFarm.tags.join(' · ') }}</text>
          <view class="detail-grid"><view><small>本月 GMV</small><strong>{{ money(selectedFarm.gmv) }}</strong></view><view><small>选品数量</small><strong>{{ selectedFarm.selectedCount }} SKU</strong></view><view><small>月订单</small><strong>{{ selectedFarm.monthlySales }} 单</strong></view><view><small>门店评分</small><strong>{{ selectedFarm.rating }} 分</strong></view></view>
          <view class="drawer-actions"><button v-if="store.can('farm.manage')" class="button secondary" @click="openFarmEdit(selectedFarm)">修改资料</button></view>
        </view>
        <view v-else-if="detail.type === 'auditLog' && selectedAuditLog" class="drawer-list audit-detail">
          <view class="detail-hero"><view class="detail-icon"><UiIcon name="book-open" :size="25" /></view><view><h3>{{ selectedAuditLog.module }} / {{ selectedAuditLog.action }}</h3><text>{{ new Date(selectedAuditLog.createdAt).toLocaleString('zh-CN') }}</text></view></view>
          <view class="detail-grid"><view><small>操作人</small><strong>{{ selectedAuditLog.actorName || selectedAuditLog.actorId }}</strong></view><view><small>角色</small><strong>{{ selectedAuditLog.actorRole || '—' }}</strong></view><view><small>结果</small><strong>{{ selectedAuditLog.result === 'success' ? '成功' : '失败' }}</strong></view><view><small>目标</small><strong>{{ selectedAuditLog.targetType || '—' }} / {{ selectedAuditLog.targetId || '—' }}</strong></view><view><small>operationId</small><strong>{{ selectedAuditLog.operationId || '—' }}</strong></view><view><small>失败原因</small><strong>{{ selectedAuditLog.reason || '—' }}</strong></view></view>
          <view class="audit-metadata"><small>metadata（已脱敏）</small><pre>{{ formatAuditMetadata(selectedAuditLog.metadata) }}</pre></view>
        </view>
      </aside>
    </view>
  </view>
</template>

<style scoped lang="scss">
.admin-shell { min-height: 100vh; display: flex; background: var(--admin-bg); }
.sidebar { position: fixed; inset: 0 auto 0 0; width:var(--admin-sidebar-width); background: var(--color-sidebar-bg); color: var(--color-ink); display: flex; flex-direction: column; z-index: 10; box-shadow: var(--shadow-card); }
.brand { height: 76px; padding: 0 18px; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid var(--color-line); }
.brand-mark { flex: none; width: 38px; height: 38px; aspect-ratio: 1; overflow: hidden; border-radius: var(--radius-icon); display: grid; place-items: center; background: var(--gradient-brand); color: var(--color-on-brand); }
.brand-mark .ui-icon { flex: none; max-width: 100%; max-height: 100%; filter: brightness(0) invert(1); }
.brand-title, .brand-sub { display: block; } .brand-title { font-size: 16px; font-weight: 800; } .brand-sub { color: var(--color-ink-3); font-size: 12px; margin-top: 3px; }
.nav-list { min-height:0;padding:8px 12px 16px;flex:1;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--color-line) transparent; } .nav-group { display: block; color: var(--color-ink-3); font-size: var(--text-body); letter-spacing: 0; font-weight: 500; padding: 16px 10px 6px; } .nav-list > .nav-group:first-child { padding-top: 8px; }
.nav-item { width: 100%; min-height: 40px; padding: 0 10px; display: flex; align-items: center; gap: 10px; color: var(--color-text-nav); background: transparent; border-radius: var(--radius-nav); cursor: pointer; text-align: left; margin-bottom: 2px; font-size: var(--text-subtitle); font-weight: 500; position: relative; }
.nav-item::before { content: ''; width: 7px; height: 7px; flex: none; background: currentColor; transform: rotate(45deg); }
.nav-item.active { background: var(--color-sidebar-active-bg); color: var(--color-brand-primary-dark); font-weight: 600; }
.nav-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--color-line-light); color: var(--color-ink-2); display: grid; place-items: center; font-size: var(--text-caption); font-weight: 600; }
.operator { display:flex;align-items:center;gap:10px;flex:none;padding:0;border:0;font-size:13px; } .operator-meta { min-width:0; } .operator-meta text, .operator small { display: block; } .operator small { color: var(--color-ink-2); margin-top: 2px; font-size: 12px; } .avatar { width: 32px; height: 32px; border-radius: var(--radius-icon); background: var(--color-brand-primary); color: var(--color-on-brand); display: grid; place-items: center; flex: none; }
.main { width: calc(100% - var(--admin-sidebar-width)); min-height: 100vh; margin-left: var(--admin-sidebar-width); } .topbar { height: 60px; padding: 0 24px; background:var(--color-card); border-bottom: 1px solid var(--admin-line); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 8; }
.crumb { font-size: 13px; color: var(--admin-muted); } .crumb strong { color: var(--admin-ink); } .top-actions, .head-actions, .row-actions { display: flex; align-items: center; gap: 8px; }
.filter-control{width:100%;height:var(--admin-control-height);padding:0 12px;display:flex;align-items:center;gap:8px;background: var(--color-card);border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);box-sizing:border-box;color:var(--admin-ink);font-size:13px}.filter-control.placeholder{color:var(--admin-muted)}.filter-control input{min-width:0;flex:1;height:100%;border:0;outline:0;background:transparent;font-size:13px}.filter-control .ui-icon{flex:none}.topbar-search{width:240px;flex:none}
.icon-button { width: var(--admin-control-height); height: var(--admin-control-height); position:relative; display: grid; place-items: center; background: var(--color-card-alt); border: 1px solid var(--admin-line); border-radius: var(--admin-radius-control); cursor: pointer; }.notice-dot{position:absolute;right:6px;top:6px;width:7px;height:7px;border-radius:50%;background:var(--color-danger);border:1px solid var(--color-card)}
.content { padding: var(--space-section); } .page-head { min-height: 58px; margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
h1,h2,p { margin: 0; letter-spacing: 0; } .page-head h1 { font-size: 24px; } .page-head p { margin-top: 6px; color: var(--admin-muted); font-size: 13px; }
.todo-filter-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:-6px 0 16px;padding:11px 14px;border:1px solid var(--color-line);border-radius:var(--admin-radius-panel);background:var(--admin-green-soft);color:var(--admin-ink)}.todo-filter-banner>view{min-width:0}.todo-filter-banner strong,.todo-filter-banner small{display:block}.todo-filter-banner small{margin-top:3px;color:var(--admin-muted);overflow-wrap:anywhere}.todo-filter-banner .button{margin:0;flex:none}
.button { min-height: 40px; padding: 0 14px; border-radius: var(--admin-radius-control); display: inline-flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; font-weight: 700; font-size: 13px; } .button.primary { background: var(--admin-green-2); color:var(--color-on-brand); min-height: 44px; box-shadow: var(--shadow-button-primary); } .button.secondary { background:var(--color-card); color: var(--admin-ink); border: 1px solid var(--admin-line); } .button:disabled { opacity: .45; cursor: default; }.button.wide{width:100%;margin-top:18px}
.loading { min-height: 420px; display: grid; place-items: center; color: var(--admin-muted); }
.kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 12px; } .kpi-card { min-width:0;padding: 13px 16px; background:var(--color-card); border: 1px solid var(--admin-line); border-radius: var(--admin-radius-panel); box-shadow: var(--shadow-card); display:grid; grid-template-columns:40px minmax(0,1fr); column-gap:13px; align-items:center; } .kpi-card .kpi-icon { grid-row:1 / span 3; align-self:center; } .kpi-card text,.kpi-card small { display:block; color: var(--admin-muted); font-size: var(--text-caption); } .kpi-card strong { display:block; margin: 2px 0; font-size: 21px; font-weight: 700; color: var(--color-ink); overflow-wrap:anywhere; } .kpi-card .positive { color: var(--color-success); }
.chart-grid { display: grid; grid-template-columns: 2.2fr 1fr; gap: 12px; margin-bottom: 12px; } .panel,.data-panel { background:var(--color-card); border: 1px solid var(--admin-line); border-radius: var(--admin-radius-panel); overflow: hidden; box-shadow: var(--shadow-card); } .data-panel{overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--color-line) transparent}.panel { padding: var(--space-card-pc); } .panel-head { display:flex; align-items:center; justify-content:space-between; } .panel-head h2 { font-size: 15px; } .panel-head text { color:var(--admin-muted); font-size:12px; } .chart { height: 280px; width: 100%; }
.lower-grid { display:grid; grid-template-columns:1.2fr 1fr; gap:12px; } .rank-row { display:flex; align-items:center; gap:10px; padding:11px 0; border-bottom:1px solid var(--color-line); } .rank-row .hot-emoji { width:34px; height:34px; border-radius:var(--radius-icon); background:var(--color-brand-primary-soft); display:grid; place-items:center; font-size:18px; flex-shrink:0; } .rank-row>view:nth-child(2) { flex:1; min-width:0; } .rank-row .hot-right { text-align:right; flex-shrink:0; } .rank-row .hot-right b { color:var(--admin-green-2); } .rank-row .hot-right small { color:var(--admin-muted); font-size:12px; margin-top:2px; } .rank-row:last-child { border:0; } .rank-row image { width:42px;height:42px;border-radius:var(--radius-icon); } .rank-row strong,.rank-row small { display:block; } .rank-row strong { font-size:12px; } .rank-row small { color:var(--admin-muted);font-size:12px;margin-top:3px; } .rank-row b { color:var(--admin-green-2);font-size:12px; } .rank-no { font-weight:800;color:var(--admin-gold); }
.todo-row { width:100%;min-height:46px;padding:7px 0;display:flex;align-items:center;gap:11px;background:transparent;border-bottom:1px solid var(--color-line-light);cursor:pointer;text-align:left;color:var(--admin-ink); } .todo-row .todo-emoji { width:28px; height:28px; border-radius:var(--radius-icon); background:var(--color-brand-primary-soft); display:grid; place-items:center; font-size:14px; flex-shrink:0; } .todo-row>view { flex:1; min-width:0; } .todo-row strong,.todo-row small { display:block; } .todo-row strong { font-size:13px; } .todo-row small { color:var(--admin-muted); font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .todo-pill { font-size:12px; font-weight:600; border-radius:var(--radius-nav); padding:3px 10px; background:var(--color-line-light); color:var(--color-ink-2); flex-shrink:0; } .todo-pill.wait { background:var(--color-warning-soft); color:var(--color-warning-dark); } .todo-pill.no { background:var(--color-danger-soft); color:var(--color-danger); }
.table-row { min-height:var(--admin-row-height); padding:0 17px; display:grid; align-items:center; gap:12px; border-bottom:1px solid var(--color-line-light); font-size:12px; } .table-row:last-of-type { border-bottom:0; } .table-head { min-height:40px; background:var(--color-card-alt); color:var(--admin-muted);font-size:12px;font-weight:700; }
.report-filters{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:12px;padding:16px;border-bottom:1px solid var(--admin-line)}.report-filters .field{display:flex;flex-direction:column;gap:6px;min-width:0}.report-filters .field>text{font-size:12px;color:var(--admin-muted)}.report-filters .picker-field,.audit-filters .picker-field{height:var(--admin-control-height);padding:0 9px;border:1px solid var(--color-line);border-radius:var(--admin-radius-control);background:var(--color-card);box-sizing:border-box}.report-filter-error{margin:10px 16px 0;padding:8px 10px;color:var(--color-danger);background:var(--color-danger-soft);border:1px solid var(--color-danger-soft);border-radius:var(--admin-radius-control);font-size:12px}.report-summary{margin:16px}.report-table-scroll{overflow-x:auto;margin:0 16px 16px;border:1px solid var(--color-line);border-radius:var(--admin-radius-panel)}.report-grid{grid-template-columns:1fr 2fr .8fr .9fr 1fr;min-width:620px}.report-panel{overflow:visible}
@media (max-width: 900px){.report-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.report-filters .field{min-width:0;}.report-filters :deep(.searchable-select){min-width:0;}}
.supplier-table-scroll{overflow-x:auto;max-width:100%}.order-table-scroll{overflow-x:auto;max-width:100%}.farm-table-scroll{overflow-x:auto;max-width:100%}.product-table-scroll{overflow-x:auto;max-width:100%}.promoter-table-scroll{overflow-x:auto;max-width:100%}.account-table-scroll{overflow-x:auto;max-width:100%}.withdrawal-table-scroll{overflow-x:auto;max-width:100%}.role-table-scroll{overflow-x:auto;max-width:100%}.admin-account-table-scroll{overflow-x:auto;max-width:100%}.supplier-grid { grid-template-columns:1.4fr 1.3fr .55fr 1fr minmax(240px, 1.4fr);min-width:980px; }.supplier-grid .row-actions{flex-wrap:wrap}.dict-grid { grid-template-columns:1.4fr 1.6fr .7fr .6fr 1fr; }.dict-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;flex-wrap:wrap}.dict-tabs{display:flex;flex-wrap:wrap;gap:7px}.dict-tab{display:flex;align-items:center;min-height:32px;padding:0 4px 0 12px;border-radius:var(--admin-radius-control);border:1px solid var(--color-line);background:var(--color-card);color:var(--color-ink)}.dict-tab.active{background:var(--color-brand-primary-soft);border-color:var(--color-line);color:var(--color-brand-primary)}.dict-tab-btn{min-height:28px;padding:0 8px;border:0;background:transparent;color:inherit;font-size:13px;cursor:pointer}.dict-tab.active .dict-tab-btn{font-weight:700}.dict-tool-actions{display:flex;align-items:center;gap:8px}.dict-table{border:1px solid var(--color-line);border-radius:var(--admin-radius-panel);overflow:hidden}.dict-table .table-row{min-height:var(--admin-row-height);padding:0 14px}.dict-table .table-row:nth-child(even){background:var(--color-card-alt)}.dict-table .table-head{min-height:40px;background:var(--color-line-light)}.account-grid { grid-template-columns:1.3fr 1fr 1.3fr .6fr .7fr .7fr 1.2fr; }.product-grid { grid-template-columns:1.6fr .8fr .7fr .8fr .6fr .7fr .6fr .6fr .6fr .8fr; }.order-grid{grid-template-columns:1.2fr 1.4fr .45fr .75fr .6fr .6fr .55fr .6fr .6fr .8fr;min-width:1080px}.farm-grid{grid-template-columns:1.3fr 1.2fr .7fr .8fr .85fr .7fr .8fr;min-width:860px}
.after-sale-table-scroll{overflow-x:auto;max-width:100%}.after-grid { grid-template-columns:1fr 1.4fr .5fr .7fr .7fr .7fr .7fr minmax(220px,1.2fr);min-width:1040px }.after-grid .row-actions{min-width:220px;flex-wrap:wrap}.after-grid .row-actions button{white-space:nowrap}.promoter-grid { grid-template-columns:1.2fr 1.1fr .65fr .65fr .9fr .8fr .6fr .8fr;min-width:900px }
.table-row strong,.table-row small { display:block; } .table-row small { color:var(--admin-muted);font-size:12px;margin-top:2px; } .product-cell { display:flex;align-items:center;gap:10px;min-width:0; } .product-cell image { width:42px;height:42px;border-radius:var(--radius-icon);flex:none; } .product-cell view { min-width:0; } .product-cell strong { overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere; }
/* 订单表金额/实付列右对齐（order-grid 直接子级 strong 恰为两列金额） */
.order-grid>strong{text-align:right}
.order-grid.table-head>text:nth-child(5),.order-grid.table-head>text:nth-child(6){text-align:right}
.status { width:max-content;max-width:100%;padding:5px 8px;border-radius:var(--radius-nav);background:var(--color-line-light);color:var(--color-ink-2);font-size:12px;white-space:nowrap; }.status.active,.status.cooperating,.status.delivered,.status.resolved { background:var(--color-success-soft);color:var(--color-success); }.status.pending,.status.processing { background:var(--color-warning-soft);color:var(--color-warning-dark); }.status.rejected,.status.after-sale { background:var(--color-danger-soft);color:var(--color-danger); }.status.shipping { background:var(--color-info-soft);color:var(--color-info-dark); }
.row-actions button { min-height:32px;padding:5px 9px;background:var(--color-card);color:var(--color-brand-primary);border:1px solid var(--color-line);border-radius:var(--radius-nav);cursor:pointer;font-size:13px; }.row-actions button:first-child:not(.danger){background:var(--color-brand-primary);color:var(--color-on-brand);border-color:var(--color-brand-primary)}.row-actions button.danger { background:var(--color-card);color:var(--color-danger);border-color:var(--color-danger-soft); }

.policy-panels { display:flex;flex-direction:column;gap:14px; }.policy-group { padding:0;overflow:hidden; }.policy-group-head { padding:14px 16px;border-bottom:1px solid var(--admin-line);display:flex;align-items:flex-start;justify-content:space-between;gap:12px; }.policy-group-head h2 { display:flex;align-items:center;gap:7px;font-size:15px;margin:0; }.policy-group-head h2>text{margin:0;color:var(--admin-ink);font-size:15px}.policy-group-head>view>text { display:block;color:var(--admin-muted);font-size:12px;margin-top:3px; }.policy-group-count { white-space:nowrap;font-size:12px;color:var(--admin-muted); }.policy-card-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:16px; }.policy-data-card { min-width:0;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:14px;background:var(--color-card); }.policy-data-top { display:flex;align-items:flex-start;justify-content:space-between;gap:10px; }.policy-data-top strong { font-size:14px;overflow-wrap:anywhere; }.policy-scope { display:block;margin-top:4px;color:var(--admin-muted);font-size:12px;overflow-wrap:anywhere; }.policy-data-meta { display:flex;align-items:center;gap:10px;margin-top:10px; }.policy-discount { font-size:13px;font-weight:700;color:var(--admin-green-2); }.tier-table { margin-top:12px;border:1px solid var(--color-line-light);border-radius:var(--admin-radius-panel);overflow:hidden; }.tier-table .table-row { min-height:34px;padding:0 12px;font-size:12px; }.tier-table .tier-grid { grid-template-columns:1.3fr .8fr .7fr 1.2fr; }.tier-off { color:var(--admin-green-2);font-weight:700; }.tier-empty { margin-top:12px;padding:10px;border-radius:var(--admin-radius-panel);background:var(--color-card-alt);color:var(--admin-muted);font-size:12px;text-align:center; }.switch { width:42px;height:23px;padding:3px;border-radius:var(--radius-nav);background:var(--color-line);cursor:pointer; }.switch span { display:block;width:17px;height:17px;border-radius:50%;background:var(--color-card);transition:.2s; }.switch.on { background:var(--admin-green-2); }.switch.on span { transform:translateX(19px); }
.summary-strip { display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--admin-line);background:var(--color-card-alt); }.summary-strip view { padding:15px 18px;border-right:1px solid var(--admin-line); }.summary-strip view:last-child { border:0; }.summary-strip small,.summary-strip strong { display:block; }.summary-strip small { color:var(--admin-muted);font-size:12px; }.summary-strip strong { margin-top:4px;font-size:16px; }.commission-banner { min-height:84px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;background:var(--color-gold-soft);border-bottom:1px solid var(--color-gold-soft); }.commission-banner small,.commission-banner strong,.commission-banner text { display:block; }.commission-banner small { color:var(--color-gold-dark);font-size:12px; }.commission-banner strong { margin:4px 0;font-size:22px;color:var(--color-gold-dark); }.commission-banner text { color:var(--color-ink-2);font-size:12px; }.gold { color:var(--color-gold-dark); }
.modal-mask { position:fixed;inset:0;background:var(--color-overlay);z-index:30;display:grid;place-items:center; }.modal,.catalog-product-modal { max-width:92vw;max-height:86vh;background:var(--color-card);border-radius:var(--admin-radius-panel);padding:22px;box-shadow:0 18px 48px var(--color-overlay); }.modal-head { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px; }.modal-head>view{min-width:0}.modal-head h2 { font-size:17px;overflow-wrap:anywhere; }.modal-head p { margin-top:5px;color:var(--admin-muted);font-size:12px;overflow-wrap:anywhere; }.field { display:block;margin-bottom:14px;min-width:0; }.field text { display:block;margin-bottom:6px;font-size:12px;font-weight:700; }.field>input { width:100%;height:var(--admin-control-height);padding:0 11px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);outline:0;background:var(--color-card); }.modal-actions { display:flex;justify-content:flex-end;gap:9px;margin-top:20px; }
.location-info{display:flex;flex-direction:column;gap:6px;margin:-2px 0 14px;padding:10px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card-alt);color:var(--admin-muted);font-size:12px;line-height:1.45}.location-info-head{display:flex;align-items:center;gap:8px;color:var(--admin-ink);font-weight:700}.location-info-head strong.resolved{color:var(--admin-green-2)}.location-info-head strong.failed{color:var(--color-danger)}.location-info-head .compact-button{margin-left:auto;display:inline-flex;align-items:center;gap:4px}
.drawer-mask{position:fixed;inset:0;background:var(--color-overlay);z-index:35;display:flex;justify-content:flex-end}.drawer{max-width:100vw;height:100%;max-height:100vh;padding:22px;background:var(--color-card);box-shadow:-18px 0 48px var(--color-overlay);overflow-y:auto}.drawer-head{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--admin-line)}.drawer-head small{display:block;color:var(--admin-muted);font-size:12px;margin-bottom:4px}.drawer-head h2{font-size:18px}.drawer-list{padding-top:16px}.todo-detail>button{width:100%;min-height:52px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;background:var(--color-card-alt);border-bottom:1px solid var(--admin-line);color:var(--admin-ink);text-align:left}.todo-detail b{color:var(--admin-green-2)}.export-history{margin-top:20px;padding:14px;background:var(--color-gold-soft);border-radius:var(--admin-radius-panel)}.export-history strong,.export-history text{display:block}.export-history text{margin-top:8px;color:var(--admin-muted);font-size:12px}.detail-hero{display:flex;align-items:center;gap:12px;padding:14px;background:var(--color-hover-bg);border-radius:var(--admin-radius-panel)}.detail-icon{width:46px;height:46px;border-radius:var(--radius-icon);background:var(--admin-green-soft);display:grid;place-items:center}.detail-hero h3,.drawer-list>h3{margin:0;font-size:17px}.detail-hero text,.drawer-muted{display:block;margin-top:5px;color:var(--admin-muted);font-size:12px}.detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}.detail-grid view{padding:13px;background:var(--color-card-alt);border:1px solid var(--color-line-light);border-radius:var(--admin-radius-panel)}.detail-grid small,.detail-grid strong{display:block}.detail-grid small{color:var(--admin-muted);font-size:12px}.detail-grid strong{margin-top:5px;font-size:14px}.tracking-number{margin:16px 0;padding:13px;border:1px dashed var(--color-line);border-radius:var(--admin-radius-panel)}.tracking-number small,.tracking-number strong{display:block}.tracking-number small{color:var(--admin-muted);font-size:12px}.tracking-number strong{margin-top:5px;font-size:14px}.timeline-list>view{position:relative;display:grid;grid-template-columns:16px 1fr;gap:9px;padding-bottom:18px}.timeline-list>view>span{width:10px;height:10px;margin-top:4px;border-radius:50%;background:var(--admin-green-2);box-shadow:0 0 0 4px var(--admin-green-soft)}.timeline-list>view:not(:last-child)::after{content:"";position:absolute;left:4px;top:16px;bottom:2px;width:1px;background:var(--color-line)}.timeline-list strong,.timeline-list small,.timeline-list text{display:block}.timeline-list small,.timeline-list text{margin-top:4px;color:var(--admin-muted);font-size:12px}.history-row{padding:13px 0;border-bottom:1px solid var(--color-line-light)}.history-row strong,.history-row small{display:block}.history-row small{margin-top:5px;color:var(--admin-muted);font-size:12px}.history-items{margin-top:9px;display:grid;gap:6px}.history-items>view{display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,2fr) auto;gap:12px;align-items:center;padding:8px 10px;border-radius:var(--admin-radius-panel);background:var(--color-hover-bg)}.history-items span{font-size:12px;font-weight:700}.history-items small{margin:0;overflow-wrap:anywhere}.history-items b{color:var(--admin-green-2);font-size:12px}.farm-cover{width:100%;height:180px;border-radius:var(--radius-icon);margin-bottom:14px;cursor:zoom-in}
@media(max-width:1280px){.admin-shell{--admin-sidebar-width:var(--admin-sidebar-compact-width)}}
@media(max-width:1180px){.commission-rule-grid{grid-template-columns:repeat(2,1fr)}.sidebar{width:var(--admin-sidebar-width)}.main{width:calc(100% - var(--admin-sidebar-width));margin-left:var(--admin-sidebar-width)}.brand{padding:0 12px}.brand-title{font-size:13px}.nav-item{padding:0 8px;gap:8px}.content{padding:var(--space-section)}.topbar{padding:0 18px}.topbar-search{width:210px}.kpi-grid{grid-template-columns:repeat(2,1fr)}.chart-grid,.lower-grid{grid-template-columns:1fr}.supplier-grid{min-width:760px}.product-grid,.order-grid,.after-grid,.farm-grid{min-width:860px}.promoter-grid{min-width:900px}}
.filter-bar{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;min-width:0}.filter-bar .field{margin:0;min-width:0;flex:1 1 128px;max-width:190px}.filter-bar .field>text{display:block;margin-bottom:6px;font-size:12px;font-weight:400;color:var(--admin-muted)}.filter-bar .searchable-select{min-width:160px}.filter-bar .searchable-select.is-wide{min-width:180px}.filter-bar .button{margin:0 0 1px}.row-actions button,.compact-button{min-height:32px}.state-panel{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--admin-muted)}.empty-state{min-height:120px;display:grid;place-items:center;color:var(--admin-muted);font-size:12px}.module-toolbar{padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;border-bottom:1px solid var(--admin-line);background:var(--color-card)}.module-toolbar .searchable-select{min-width:160px}.module-toolbar .button{margin-left:auto}.order-id{display:flex;align-items:center;gap:9px}.order-id input{width:16px;height:16px}
.module-toolbar .filter-bar{flex:1 1 auto;flex-wrap:nowrap;min-width:0}
.module-toolbar .filter-bar .field.is-search{width:var(--admin-toolbar-search);min-width:0;flex:none;max-width:none}
.module-toolbar .filter-bar .searchable-select{min-width:0;flex:1 1 128px;max-width:170px}
.module-toolbar .filter-bar .searchable-select.is-wide{min-width:0;flex:1 1 150px;max-width:190px}
@media(max-width:1180px){.module-toolbar .filter-bar{flex-wrap:wrap}.module-toolbar .filter-bar .field.is-search{min-width:200px;width:min(280px,100%)}.module-toolbar .filter-bar .searchable-select{flex:1 1 130px;max-width:none}}.policy-actions{display:flex;align-items:center;gap:8px}.compact-button{padding:0 9px;border-radius:var(--admin-radius-control);background:var(--admin-green-soft);color:var(--admin-green-2);font-size:13px}.compact-button.danger { background: var(--color-danger-soft); color: var(--color-danger); border: 1px solid var(--color-danger-soft); }.banner-actions,.drawer-actions{display:flex;flex-wrap:wrap;gap:9px}.danger-button{background:var(--color-danger);color:var(--color-on-brand)}.share-config-row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;padding:4px 0 8px}.share-config-row .field{min-width:160px}.share-config-row .button{margin:0 0 4px}.commission-rules{margin:18px;padding:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card-alt)}.commission-rules>button{width:100%;min-height:40px;padding:0 10px;display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;border-bottom:1px solid var(--admin-line);background:transparent;text-align:left}.commission-rules>button:last-child{border:0}.commission-rules small{color:var(--admin-muted)}
.order-select{width:24px;height:24px;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card);display:grid;place-items:center;flex:none}.order-select.selected{background:var(--admin-green-2);border-color:var(--admin-green-2)}.order-select.selected .ui-icon{filter:brightness(0) invert(1)}
.settlement-history{margin:18px;padding:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card)}.settlement-history .empty-state{min-height:72px}
.row-actions button:disabled,.switch:disabled{opacity:.5;cursor:default}.drawer-actions{margin-top:18px}.detail-grid strong{overflow-wrap:anywhere}

/* ===== 原型 1:1 补充样式 ===== */
.page-time{display:block;margin-top:4px;font-size:12px;color:var(--admin-muted)}
.kpi-icon{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:var(--radius-icon);background:var(--color-brand-primary-soft);color:var(--color-brand-primary);font-size:16px;margin-bottom:0}
.period-button{min-height:32px;padding:0 10px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);font-size:13px;cursor:pointer}.period-button.on{background:var(--color-brand-primary-soft);color:var(--color-brand-primary);border-color:var(--color-line)}
.stat-strip{display:grid;gap:14px;margin-bottom:16px}.stat-strip.three{grid-template-columns:repeat(3,1fr)}.stat-strip.four{grid-template-columns:repeat(4,1fr)}.stat-strip>view{min-width:0;background:var(--color-card);border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:14px 16px}.stat-strip small{display:block;font-size:12.5px;color:var(--admin-muted)}.stat-strip strong{display:block;margin-top:4px;font-size:19px;font-weight:800;overflow-wrap:anywhere}.stat-strip span{display:block;margin-top:4px;font-size:12px;color:var(--admin-muted);line-height:1.4;overflow-wrap:anywhere}.stat-strip .positive{color:var(--admin-green-2)}.stat-strip .pending-text{color:var(--color-warning-dark)}
/* 统计条单卡三段/四段化：外层一张卡，内部分段虚线分隔 */
.stat-strip.three,.stat-strip.four{gap:0;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card);overflow:hidden;margin-bottom:12px}
.stat-strip.three>view,.stat-strip.four>view{border:0;border-radius:0;border-right:1px dashed var(--color-line);padding:11px 16px}
.stat-strip.three>view:last-child,.stat-strip.four>view:last-child{border-right:0}
.filter-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.filter-chips button{min-height:32px;padding:0 12px;border-radius:var(--admin-radius-control);border:1px solid var(--admin-line);background:var(--color-card);color:var(--admin-ink);font-size:13px;cursor:pointer}.filter-chips button.active{background:var(--color-brand-primary-soft);color:var(--color-brand-primary-dark);border-color:var(--color-line)}
.mini-button{min-height:32px;padding:0 8px;border-radius:var(--admin-radius-control);background:var(--color-brand-primary-soft);color:var(--color-brand-primary);font-size:13px;border:1px solid var(--color-line);cursor:pointer;margin-left:6px;vertical-align:2px}
.fulfill-strip{display:flex;gap:0;margin-bottom:12px;background:var(--color-card);border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:8px 6px;overflow-x:auto}.fulfill-strip>view{flex:1;min-width:96px;display:flex;align-items:center;gap:8px;position:relative;padding:2px 8px;justify-content:flex-start}.fulfill-strip>view:not(:last-child)::after{content:"→";position:absolute;right:-2px;top:50%;transform:translateY(-50%);color:var(--color-line);font-size:14px}.fulfill-strip b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--color-ink-3);color:var(--color-on-brand);font-size:12px;font-weight:800;flex:none}.fulfill-strip .done b{background:var(--admin-green-2)}.fulfill-strip .done b .ui-icon{filter:brightness(0) invert(1)}.fulfill-strip .cur b{background:var(--color-gold)}.fulfill-strip small{display:block;font-size:12px;font-weight:700;color:var(--admin-ink);text-align:left;white-space:nowrap}.fulfill-strip strong{display:block;margin-top:1px;font-size:12px;font-weight:700;line-height:1.3;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fulfill-strip strong.is-wrap{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-all}
.settle-banner{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:stretch;margin-bottom:12px}.settle-banner>view{min-width:0;background:var(--color-brand-primary-soft);border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:11px 13px}.settle-banner small{display:block;font-size:12px;color:var(--admin-muted)}.after-responsibility-panel{margin-bottom:12px;padding:14px 16px}.stock-cell small{display:block}.stock-warning-text{margin-top:3px;color:var(--color-danger);font-size:12px}.after-status-cell small{display:block;margin-top:4px;color:var(--admin-muted);font-size:12px}.return-tracking-form{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin:12px 0}.trend-compare{margin-left:10px;color:var(--admin-muted);font-size:12px}.settle-banner strong{display:block;margin-top:5px;font-size:18px;font-weight:800;overflow-wrap:anywhere}.settle-banner span{display:block;margin-top:4px;font-size:12px;color:var(--admin-muted);overflow-wrap:anywhere}.settle-banner .positive{color:var(--admin-green-2)}.settle-banner .button{min-height:var(--admin-control-height);align-self:center;white-space:nowrap}
.tier-grid{grid-template-columns:1.2fr 1fr 1fr 1.4fr 1fr}.tier-grid strong{font-weight:700}
.status.delivered{background:var(--color-success-soft);color:var(--admin-green-2)}.status.pending{background:var(--color-warning-soft);color:var(--color-warning-dark)}
.promoter-grid>view strong{display:block}.promoter-grid>view small{display:block;margin-top:3px;color:var(--admin-muted);font-size:12px}


/* ===== P1 样式调整（对照原型） ===== */
.brand{padding:0 14px;gap:8px}
.brand-title{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rank-row{padding:13px 0;border-bottom:1px solid var(--color-line)}
.filter-chips button.active{background:var(--color-brand-primary-soft);color:var(--color-brand-primary-dark);border-color:var(--color-line)}
.status{border-radius:var(--radius-nav)}
.row-actions button{background:var(--color-card);color:var(--color-brand-primary);border:1px solid var(--color-line)}
.row-actions button:first-child:not(.danger){background:var(--color-brand-primary);color:var(--color-on-brand);border-color:var(--color-brand-primary)}
.row-actions button.danger{background:var(--color-card);color:var(--color-danger);border-color:var(--color-danger-soft)}


.drawer-head-actions{display:flex;align-items:center;gap:8px}
.mark-read-button{min-height:32px;padding:0 10px;border-radius:var(--admin-radius-control);background:var(--color-brand-primary-soft);color:var(--color-brand-primary);border:1px solid var(--color-line);font-size:13px;display:inline-flex;align-items:center;gap:5px}


/* ===== 按钮靠左 + 文字居中（统一） ===== */
button, uni-button { text-align: center; }
.state-panel { align-items: flex-start; }
.page-head { justify-content: space-between; flex-wrap: wrap; }
.commission-banner { justify-content: flex-start; gap: 18px; }
.nav-item { justify-content: flex-start; text-align: left; }
.todo-row, .todo-detail button, .commission-rules button { justify-content: flex-start; text-align: left; }
.recovery-section{margin-top:12px;padding-top:12px;border-top:1px solid var(--admin-line)}.recovery-head{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700}.recovery-head b{color:var(--admin-green-2)}.recovery-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-line-light)}.recovery-row>view{flex:1;min-width:0}.recovery-row strong,.recovery-row small{display:block}.recovery-row small{margin-top:3px;color:var(--admin-muted);font-size:12px;overflow-wrap:anywhere}.recovery-row .compact-button{flex-shrink:0}
.nav-badge { margin-left: auto; }
.module-toolbar .button { margin-left: 0; }
.order-tabs{display:flex;gap:8px;flex-wrap:wrap}
.order-tabs button{min-height:32px;padding:6px 13px;border-radius:var(--admin-radius-control);background:var(--color-card-alt);border:1px solid var(--color-line);color:var(--color-ink-2);font-size:13px;font-weight:600}
.order-tabs button.active{background:var(--color-brand-primary-soft);color:var(--color-brand-primary);border-color:var(--color-line)}
.toolbar-actions{margin-left:auto;display:flex;flex-wrap:wrap;gap:10px}
.goods-tools{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.goods-tools .filter-bar{flex:1 0 auto}
.goods-count{margin-left:auto;font-size:12px;color:var(--admin-muted);white-space:nowrap}
.c-product-grid{grid-template-columns:1.7fr 1.2fr .7fr .7fr .7fr .7fr .7fr 1fr;min-width:920px}.c-sku-editor{padding:12px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card-alt);overflow-x:auto;box-shadow: inset -12px 0 12px -12px var(--color-overlay)}.after-evidence-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.after-evidence-thumb { width: 72px; height: 72px; border-radius:var(--radius-icon); }
.tier-editor { padding: 12px; border: 1px solid var(--admin-line); border-radius:var(--admin-radius-panel); }
.tier-editor-head { display: flex; justify-content: space-between; align-items: center; }
.tier-editor-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: 10px; align-items: end; }.c-sku-row,.catalog-sku-labels{display:grid;grid-template-columns:1.2fr 110px repeat(7,.8fr) auto;gap:7px;margin-top:8px;align-items:start}.catalog-sku-labels{padding:0 4px;color:var(--admin-muted);font-size:12px}.c-sku-row input{width:100%;box-sizing:border-box;height:34px;padding:0 8px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);font-size:13px}.c-sku-row.retired{opacity:.65}.c-sku-row.retired input{background:var(--color-line-light)}
.product-submission-list{display:grid;gap:10px}.product-submission-card{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(150px,.7fr) minmax(180px,1fr) minmax(180px,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-top:1px solid var(--admin-line)}.product-submission-card small,.submission-skus{display:block;color:var(--admin-muted);font-size:12px}.submission-skus{display:grid;gap:3px}.reject-note{color:var(--color-danger)}.product-submission-card .row-actions{justify-content:flex-end}
@media(max-width:1180px){.settle-banner{grid-template-columns:1fr 1fr}.settle-banner .button{grid-column:1/-1}.module-toolbar .toolbar-actions{width:100%;justify-content:flex-end}}
@media(max-width:1100px){.product-submission-card{grid-template-columns:minmax(0,1fr)}.product-submission-card .row-actions{grid-column:1/-1;justify-content:flex-start}}
.sku-no{color:var(--admin-muted);font-size:12px}
.source-pill{display:inline-block;padding:2px 8px;border-radius:var(--radius-nav);font-size:12px;font-weight:600;color:var(--admin-ink)}


/* ===== 行内 emoji（按截图） ===== */
.row-emoji{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:6px;font-size:14px;background:var(--color-line-light);border-radius:var(--radius-icon);vertical-align:-3px}
.row-emoji.big{width:38px;height:38px;font-size:20px;border-radius:var(--radius-icon);vertical-align:middle}


/* ===== 中台表格密度（按截图） ===== */
.table-row{min-height:var(--admin-row-height)}
.table-head{min-height:40px;background:var(--color-card-alt);color:var(--color-ink-3);font-weight:600}


/* ===== 业务员排行标签实底（按截图） ===== */
.filter-chips.solid button{border-radius:var(--admin-radius-control)}
.filter-chips.solid button.active{background:var(--color-brand-primary-soft);color:var(--color-brand-primary-dark);border-color:var(--color-line);font-weight:700}


/* ===== 1:1 还原（对照原型） ===== */
.promoter-grid .commission{color:var(--color-danger);font-weight:800}
.commission-status-table{margin-bottom:14px;border:1px solid var(--color-line);border-radius:var(--admin-radius-panel);overflow:hidden}
.commission-status-grid{grid-template-columns:1.4fr 1fr 1fr 1fr}
.withdrawal-table{margin:0 16px 16px;border:1px solid var(--color-line);border-radius:var(--admin-radius-panel);overflow:auto}.withdrawal-grid{grid-template-columns:1.5fr .8fr 1fr 1.4fr .8fr 1.5fr 1.2fr;min-width:980px}.withdrawal-grid>view strong{display:block}.withdrawal-grid>view small{display:block;margin-top:3px;color:var(--admin-muted);font-size:12px}
.withdrawal-grid .status.approved,.status.approved{background:var(--color-success-soft);color:var(--color-success)}
.commission-status-grid>view strong{display:block}
.commission-status-grid>view small{display:block;margin-top:3px;color:var(--admin-muted);font-size:12px}
.commission-status-grid .status{justify-self:start}
.commission-status-grid.status-unsettled{background:var(--color-warning-soft)}
.commission-status-grid.status-settled{background:var(--color-success-soft)}


/* ===== 按钮组靠左修复（uni-button 默认 margin:0 auto 会摊开） ===== */
.filter-chips uni-button, .order-tabs uni-button { margin: 0; }


.row-actions uni-button { margin: 0; }


.modal-head uni-button, .modal-actions uni-button, .order-id uni-button, .drawer-head uni-button { margin: 0; }


.drawer-actions uni-button { margin: 0; }

/* ===== 文字水平居中兜底 ===== */

.filter-chips uni-button, .order-tabs uni-button { text-align: center; }


/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐） ===== */
.filter-chips uni-button, .order-tabs uni-button,
.row-actions uni-button,
.period-button, .mini-button, .compact-button,
.modal-actions uni-button, .drawer-actions uni-button {
  display: inline-flex; align-items: center; justify-content: center;
}


/* ===== 弹层/图标按钮水平垂直居中（uni-button 默认 padding 14px 导致 grid 图标右偏） ===== */
.icon-button, .order-id uni-button { padding: 0; }
/* ===== 登录页 ===== */
.login-page{position:relative;isolation:isolate;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--color-bg);padding:24px;overflow:hidden}
.login-card{position:relative;width:min(380px,100%);background:var(--color-card);border:1px solid var(--color-line);border-radius:var(--admin-radius-panel);padding:32px 30px 26px;box-shadow:var(--shadow-card)}
.login-brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.login-brand .brand-mark{flex:none;width:46px;height:46px;aspect-ratio:1;overflow:hidden;border-radius:var(--admin-radius-panel);background:var(--gradient-brand);display:grid;place-items:center;color:var(--color-on-brand)}
.login-brand .brand-title{display:block;font-size:19px;font-weight:800;color:var(--color-ink)}
.login-brand .brand-sub{display:block;font-size:12px;color:var(--color-ink-2);margin-top:3px}
.login-fields{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.login-field{display:flex;flex-direction:column;gap:6px}
.login-field text{font-size:12px;color:var(--color-ink-2);font-weight:700}
.login-field input{height:var(--admin-control-height);border:1px solid var(--color-line);border-radius:var(--admin-radius-control);padding:0 14px;font-size:14px;background:var(--color-card-alt)}
.login-button{min-height:44px;border-radius:var(--admin-radius-control);background:var(--color-brand-primary);color:var(--color-on-brand);font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-button-primary)}
.login-hint{display:block;text-align:center;margin-top:16px;font-size:12px;color:var(--color-ink-2)}
.page-back{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:1px solid var(--color-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--color-ink);display:inline-flex;align-items:center;justify-content:center;flex:none}
.logout-button{min-height:32px;padding:0 10px;border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--color-ink-2);font-size: 13px;margin-left:0;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;flex:none;border:1px solid var(--color-line)}
.logout-button text{display:inline}
.logout-button .ui-icon{filter:none}


.upload-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.upload-preview{width:64px;height:64px;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card-alt);cursor:zoom-in}
.upload-button{margin:0;min-height:32px;padding:0 11px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-green-2);font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
.upload-button.danger{color:var(--color-danger)}
.filter-bar .field.is-search{width:min(280px,100%);min-width:220px}
.product-thumb{width:42px;height:42px;border-radius:var(--radius-icon);background:var(--color-brand-primary-soft);flex:none;object-fit:contain}
.product-cell .after-thumb{width:40px;height:40px;border-radius:var(--radius-icon);background:var(--color-brand-primary-soft);flex:none;object-fit:contain}
.refund-amount{color:var(--color-danger);font-weight:700}
.refund-apply{color:var(--admin-green-2);font-size:16px}
.flow-view{display:flex;flex-direction:column;gap:16px}
.flow-view .settlement-history{margin:0}
.commission-rule-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px}
.commission-rule-card{min-width:0;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:14px;background:var(--color-card);display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow-card)}
.rule-top{display:flex;align-items:center;justify-content:space-between}
.rule-icon{width:34px;height:34px;border-radius:var(--admin-radius-control);background:var(--admin-green-soft);display:inline-grid;place-items:center}
.rule-name{font-size:14px}
.rule-rate{font-size:26px;font-weight:800;color:var(--admin-green-2);line-height:1;margin-top:2px}
.rule-rate small{font-size:13px;font-weight:700}
.rule-meta{color:var(--admin-muted);font-size:12px;line-height:1.5}
.rule-top .compact-button{margin:0}

.hot-thumb{width:34px;height:34px;border-radius:var(--radius-icon);background:var(--color-brand-primary-soft);flex:none;object-fit:contain}
.gallery-thumb{position:relative;width:64px;height:64px}
.gallery-thumb image{width:64px;height:64px;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card-alt);cursor:zoom-in}
.gallery-remove{position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:50%;background:var(--color-danger);color:var(--color-on-brand);font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.picker-field{width:100%;height:var(--admin-control-height);padding:0 11px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);display:flex;align-items:center;font-size:13px;color:var(--admin-ink)}
.picker-field.placeholder{color:var(--admin-muted)}
.license-thumb{width:56px;height:56px;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card-alt);cursor:zoom-in}
.category-grid{grid-template-columns:1.4fr 1fr 1fr 1.2fr}
.category-grid .status{justify-self:start}
.farm-thumb{width:44px;height:44px;border-radius:var(--radius-icon);border:1px solid var(--admin-line);background:var(--color-card-alt);flex:none;cursor:zoom-in}
.order-products{display:flex;flex-direction:column;gap:6px;min-width:0}
.order-product{display:flex;align-items:center;gap:8px;min-width:0}
.order-thumb{width:36px;height:36px;border-radius:var(--radius-icon);border:1px solid var(--admin-line);background:var(--color-card-alt);flex:none;cursor:zoom-in}
.supplier-thumb{width:36px;height:36px;border-radius:var(--radius-icon);border:1px solid var(--admin-line);background:var(--color-card-alt);flex:none;cursor:zoom-in}
.order-product text{font-size:12.5px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}
.order-qty{font-weight:700}
.supplier-products{margin-top:16px;padding:13px;background:var(--color-card-alt);border:1px solid var(--color-line-light);border-radius:var(--admin-radius-panel)}
.supplier-product-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--color-line-light)}
.supplier-product-row:last-child{border-bottom:0}
.sp-name strong{font-size:13px}
.sp-name small{display:block;margin-top:3px;color:var(--admin-muted);font-size:12px}
.supplier-product-row .status{font-size:12px}
@media (max-width: 768px) {
  .admin-shell { overflow-x: hidden; }
  .sidebar { width: 72px; }
  .brand { justify-content: center; padding: 0 8px; }
  .brand > view:last-child, .nav-group, .nav-item > text:not(.nav-badge) { display: none; }
  .nav-item { justify-content: center; padding: 10px 6px; }
  .nav-badge { position: absolute; top: 2px; right: 2px; margin: 0; }
  .nav-list { padding-bottom: 18px; }
  .operator-meta { display: none; }
  .operator .logout-button text { display: none; }
  .operator .logout-button { width: 36px; height: 36px; min-height: 36px; margin: 0; padding: 0; }
  .chart-grid .panel:last-child .chart { height: 340px; }
  .main { width: calc(100% - 72px); margin-left: 72px; min-width: 0; }
  .topbar { height: auto; min-height: 60px; padding: 10px 12px; flex-wrap: wrap; gap: 8px; }
  .top-actions { flex: 1 1 100%; min-width: 0; flex-wrap: wrap; }
  .top-actions .topbar-search { width: min(100%, 280px); flex: 1 1 180px; }
  .content { padding: 18px 12px 32px; min-width: 0; }
  .page-head { flex-wrap: wrap; }
  .head-actions { width: 100%; flex-wrap: wrap; }
  .data-panel { max-width: 100%; overflow-x: auto; }
  .modal { width: 92vw; padding: 18px; }
}

@media (max-width: 420px) {
  .main { width: calc(100% - 56px); margin-left: 56px; }
  .sidebar { width: 56px; }
  .brand-mark { flex: none; width: 32px; height: 32px; aspect-ratio: 1; overflow: hidden; }
  .content { padding: 14px 8px 28px; }
  .page-head h1 { font-size: 20px; }
  .button { min-height: 36px; padding: 0 9px; font-size: 13px; }
}

.unified-product-grid{grid-template-columns:minmax(220px,2.2fr) 1.1fr 1fr 1.5fr 0.8fr 0.9fr 1.2fr;min-width:860px}
.tag-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.product-tag{font-size:12px;padding:2px 7px;border-radius:var(--radius-nav);background:var(--color-brand-primary-soft);color:var(--color-brand-primary)}
.channel-tags{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.channel-tag{font-size:12px;padding:2px 8px;border-radius:var(--radius-nav);background:var(--color-gold-soft);color:var(--color-gold-dark)}
.channel-tag.live{background:var(--color-info-soft);color:var(--color-info)}
.price-cell{display:flex;flex-direction:column;gap:2px}
.checkbox-field{display:flex;align-items:center;gap:8px}
.fixed-tag{font-size:12px;color:var(--color-brand-primary);font-weight:700}
.catalog-filter{min-width:150px}.catalog-filter .muted{color:var(--admin-muted);cursor:default}.catalog-product-modal{width:min(var(--admin-modal-lg),92vw);max-height:88vh;overflow:auto}.catalog-form-grid,.pricing-defaults-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pricing-defaults-panel{padding:16px}.pricing-defaults-panel .panel-head{padding:0 0 12px}.pricing-defaults-panel .panel-head text{display:block;margin-top:4px;color:var(--admin-muted);font-size:12px}.pricing-defaults-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:768px){.catalog-form-grid,.pricing-defaults-grid{grid-template-columns:1fr}.c-sku-editor{overflow-x:auto}.c-sku-row,.catalog-sku-labels{min-width:830px}}

/* ===== 后台可读性优化 ===== */
.admin-shell { font-size: 14px; line-height: 1.5; }
.brand-sub { font-size: 12px; }
.nav-group { font-size: var(--text-body); }
.nav-item { font-size: var(--text-subtitle); line-height: 1.4; }
.nav-badge { font-size: var(--text-caption); }
.operator { font-size: 13px; }
.operator small { font-size: 12px; }
.crumb, .filter-control input { font-size: 14px; }
.page-head p { font-size: 14px; line-height: 1.55; }
.kpi-card text, .kpi-card small { font-size: 13px; }
.panel-head text { font-size: 12px; }
.rank-row strong { font-size: 13px; }
.rank-row .hot-right small, .rank-row small { font-size: 12px; }
.todo-row strong { font-size: 14px; }
.todo-row small { font-size: 12px; }
.todo-pill { font-size: 12px; }
.table-row { font-size: 13px; line-height: 1.45; }
.table-head { font-size: 12px; }
.table-row small { font-size: 12px; }
.status { font-size: 12px; }
.row-actions button { font-size: 13px; }
.report-filters .field > text, .field text { font-size: 12px; }
.report-filter-error { font-size: 13px; }
.policy-group-head text, .policy-group-count, .policy-scope, .rule-meta { font-size: 12px; }
.summary-strip small { font-size: 12px; }
.modal-head p, .location-info, .drawer-head small, .detail-grid small, .tracking-number small { font-size: 12px; }
.drawer-head h2 { font-size: 18px; }
.detail-hero text, .drawer-muted { font-size: 12px; }
.timeline-list small, .timeline-list text, .history-row small { font-size: 12px; }
.export-history text { font-size: 12px; }
.recovery-row small { font-size: 12px; }
.withdrawal-grid > view small, .commission-status-grid > view small { font-size: 12px; }
.sp-name small { font-size: 12px; }
.empty-state { font-size: 13px; }

@media (max-width: 768px) {
  .page-head p { font-size: 13px; }
  .button { font-size: 13px; }
  .table-row { line-height: 1.5; }
}

@media (max-width: 420px) {
  .page-head h1 { font-size: 21px; }
  .button { font-size: 13px; }
}

.work-page{width:100%;height:calc(100vh - 118px);min-height:calc(100vh - 118px);display:flex;flex-direction:column;overflow:hidden;background:var(--color-card);border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);padding:24px}.work-page-head{display:flex;align-items:flex-start;gap:16px;padding-bottom:20px;margin-bottom:22px;border-bottom:1px solid var(--admin-line)}.work-page-head>.button,.work-page-actions>.button{margin:0}.work-page-head>view{min-width:0;flex:1}.work-page-head h1{margin:0;font-size:24px}.work-page-head p{margin:5px 0 0;color:var(--admin-muted);font-size:13px}.work-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 22px;max-width:1120px;flex:1;min-height:0;overflow-y:auto}.work-form-grid .full,.permission-section.full{grid-column:1/-1}.work-page-actions{display:flex;justify-content:flex-end;gap:10px;flex:none;margin-top:auto;padding:18px 0 max(8px,env(safe-area-inset-bottom));border-top:1px solid var(--admin-line)}.permission-section{padding:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card-alt)}.permission-section h3{margin:0 0 12px;font-size:14px}.permission-groups{display:grid;gap:10px}.permission-group{padding:10px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card)}.permission-group.disabled{opacity:.65}.permission-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.permission-group-head>view{display:flex;gap:6px}.permission-group-head button{min-height:28px;padding:0 8px;border-radius:var(--admin-radius-control);background:var(--admin-green-soft);color:var(--admin-green-2);font-size:13px}.permission-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.permission-grid.actions{grid-template-columns:repeat(3,minmax(0,1fr))}.permission-grid button{min-height:36px;padding:7px 10px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);overflow-wrap:anywhere}.permission-grid button.selected{background:var(--admin-green-soft);border-color:var(--color-line);color:var(--admin-green-2);font-weight:700}.pause-reason{display:block;margin-top:6px;color:var(--color-danger);line-height:1.45;overflow-wrap:anywhere}.system-table-panel{overflow:hidden}.system-table-scroll{overflow-x:auto}.audit-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:16px 16px 0}.audit-filters .field{min-width:0;margin:0}.audit-grid{grid-template-columns:1.2fr 1fr .8fr 1.4fr 1fr .6fr 1.3fr .7fr;min-width:1120px}.role-grid{grid-template-columns:1.2fr 1fr .8fr .8fr .7fr 1fr;min-width:820px}.admin-account-grid{grid-template-columns:1fr 1fr 1fr .7fr 1.3fr 1fr;min-width:850px}.audit-grid>view strong,.audit-grid>view small{display:block}.audit-grid>view small{margin-top:3px;color:var(--admin-muted)}
.recovery-verification-summary{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;padding:12px;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card-alt)}.recovery-verification-summary text,.recovery-verification-summary small{color:var(--admin-muted);overflow-wrap:anywhere}.field textarea{width:100%;min-height:108px;padding:10px 11px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);outline:0;background:var(--color-card);resize:vertical;font:inherit;line-height:1.5}.audit-metadata{margin-top:16px}.audit-metadata small{display:block;margin-bottom:7px;color:var(--admin-muted)}.audit-metadata pre{max-height:320px;margin:0;padding:12px;overflow:auto;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card-alt);color:var(--admin-ink);font:12px/1.55 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.work-modal-mask{left:var(--admin-sidebar-width);top:64px;display:block;padding:24px;background:var(--admin-bg);overflow:hidden}.work-modal-mask .modal{width:100%;max-width:none;height:100%;max-height:100%;min-height:0;border-radius:var(--admin-radius-panel);box-shadow:none}.work-modal-mask .modal:not(.catalog-product-modal){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:0 22px}.work-modal-mask .modal-head,.work-modal-mask .modal-actions,.work-modal-mask .tier-editor{grid-column:1/-1}
.table-scroll{overflow-x:auto;margin:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel)}.table-grid{grid-template-columns:1fr 1.4fr 1fr .9fr 1.3fr 1.6fr;min-width:980px}.table-grid>view strong,.table-grid>view small{display:block}.table-grid>view small{margin-top:4px;color:var(--admin-muted);overflow-wrap:anywhere}.table-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.table-actions input{width:92px;height:32px;padding:0 7px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control)}.table-actions button{min-height:32px;padding:0 9px;border-radius:var(--admin-radius-control);background:var(--admin-green-soft);color:var(--admin-green-2)}.table-actions button.danger{background:var(--color-danger-soft);color:var(--color-danger)}
@media (max-height:768px) and (min-width:769px){.nav-list{padding-bottom:8px}.brand{min-height:54px}.nav-item{min-height:40px}}
@media(max-width:1180px){.audit-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.work-modal-mask{left:var(--admin-sidebar-width)}.operator-meta{display:none}.operator .logout-button text{display:none}.operator .logout-button{width:32px;height:32px;min-height:32px;margin-left:0;padding:0;flex:none}}
@media(max-width:768px){.report-filters{grid-template-columns:1fr}.audit-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.work-page{padding:18px 14px 96px}.work-page-head{flex-direction:column}.work-form-grid{grid-template-columns:1fr}.work-form-grid .full,.permission-section.full{grid-column:auto}.permission-grid,.permission-grid.actions{grid-template-columns:repeat(2,minmax(0,1fr))}.work-page-actions{flex:none;background:var(--color-card);padding:12px 0 max(12px,env(safe-area-inset-bottom))}.supplier-grid{min-width:980px}.work-modal-mask{left:72px;top:96px;padding:12px}.work-modal-mask .modal:not(.catalog-product-modal){grid-template-columns:1fr}.work-modal-mask .modal-head,.work-modal-mask .modal-actions,.work-modal-mask .tier-editor{grid-column:auto}}
@media(max-width:420px){.report-filters{grid-template-columns:1fr}.report-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.report-summary>view:last-child{grid-column:1/-1}.table-scroll{margin:10px 8px}.permission-grid,.permission-grid.actions{grid-template-columns:1fr}.permission-group-head{align-items:flex-start}.work-page-head h1{font-size:20px}.work-modal-mask{left:56px;padding:8px}}
.category-label{min-width:0;display:inline-flex;align-items:center;gap:6px}
.category-label text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.category-thumb{width:32px;height:32px;flex:none;border:1px solid var(--admin-line);border-radius:var(--radius-icon);background:var(--color-card-alt)}
.category-thumb--small{width:22px;height:22px}

/* ===== 后台桌面工作区视觉契约 ===== */
.admin-workspace{min-width:0}
.page-head>view:first-child,.panel-head>view,.filter-bar,.toolbar-actions{min-width:0}
.page-head h1,.page-head p,.work-page-head h1,.work-page-head p{overflow-wrap:anywhere}
.panel,.data-panel,.work-page,.policy-data-card,.commission-rule-card,.commission-rules,.settlement-history,.report-table-scroll,.table-scroll,.dict-table{border-radius:var(--admin-radius-panel)}
.button,.filter-control,.icon-button,.field>input,.field textarea,.picker-field,.upload-button,.compact-button,.mini-button,.period-button{border-radius:var(--admin-radius-control)}
.button{min-height:var(--admin-control-height)}
.module-toolbar,.report-filters,.audit-filters,.dict-toolbar{background:var(--color-card);border-bottom:1px solid var(--admin-line)}
.module-toolbar,.dict-toolbar{padding:12px 16px}
.data-panel>.filter-bar,.data-panel>.goods-tools,.data-panel>.filter-chips{margin:0;padding:12px 16px;border-bottom:1px solid var(--admin-line);background:var(--color-card)}
.data-panel>.filter-chips+.filter-bar{border-top:0}
.table-row{min-height:var(--admin-row-height)}
.table-head{min-height:40px}
.table-row>text,.table-row>strong,.table-row>view{min-width:0}
.table-row:not(.table-head)>text,.table-row:not(.table-head)>strong,.table-row:not(.table-head)>view,.empty-state,.loading{overflow-wrap:anywhere}
.table-head>text,.table-head>strong,.table-head>view{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.loading,.empty-state{width:100%;min-height:112px;padding:20px;display:grid;place-items:center;color:var(--admin-muted);text-align:center}
.loading{min-height:320px;background:var(--color-card);border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel)}
.state-panel{align-items:center;text-align:center;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card)}
.kpi-icon .ui-icon,.rule-icon .ui-icon,.policy-group-head .ui-icon{opacity:.82}
.modal-actions,.drawer-actions,.head-actions,.toolbar-actions{flex-wrap:wrap}
.modal-actions .button,.drawer-actions .button{margin:0}
.catalog-product-modal{width:min(var(--admin-modal-lg),92vw)}
.drawer{overflow-wrap:anywhere}
.drawer-head h2,.drawer-list>h3{overflow-wrap:normal;white-space:normal}

.sidebar { width:var(--admin-sidebar-width); }
.main { width:calc(100% - var(--admin-sidebar-width)); margin-left:var(--admin-sidebar-width); }
.work-modal-mask { left:var(--admin-sidebar-width); overflow: hidden; }
.work-modal-mask .modal { height: 100%; max-height: 100%; overflow: hidden; min-height: 0; }

.modal,.catalog-product-modal { display:flex; flex-direction:column; overflow:hidden; padding:0; }
.modal-head { min-height:68px; flex:none; margin:0; padding:16px 22px; border-bottom:1px solid var(--admin-line); }
.modal-body { flex:1; min-height:0; padding:16px 22px 4px; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; }
.modal-actions { flex:none; margin:0; padding:14px 22px 18px; border-top:1px solid var(--admin-line); background:var(--color-card); }
.catalog-product-body { padding-bottom:16px; }
.work-modal-mask .modal:not(.catalog-product-modal) { display:flex; flex-direction:column; }
.work-modal-mask .modal-body { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-content:start; gap:0 22px; width:100%; }
.work-modal-mask .modal-body>.tier-editor { grid-column:1/-1; }

.drawer { display:flex; flex-direction:column; overflow:hidden; padding:0; }
.drawer-head { flex:none; padding:22px 22px 18px; }
.drawer-list { flex:1; min-height:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; padding:0 22px 18px; }
.drawer-actions { position:sticky; bottom:0; z-index:2; padding:14px 22px; margin-top:0; border-top:1px solid var(--admin-line); background:var(--color-card); }
.drawer > .drawer-actions { flex: none; position: static; }

@media(max-width:1280px){
  .admin-shell{--admin-sidebar-width:var(--admin-sidebar-compact-width)}
  .content{padding:var(--space-section)}
}

@media(max-width:768px){.login-page{padding:32px 16px}
  .login-card{padding:24px 20px}
  .admin-shell{--admin-sidebar-width:72px}
  .work-modal-mask .modal-body{grid-template-columns:1fr}
  .work-modal-mask .modal-body>.tier-editor{grid-column:auto}
}

@media(max-width:420px){.admin-shell{--admin-sidebar-width:56px}}

/* 主要保存、确认操作保留完整触控高度，表格行内按钮继续使用紧凑尺寸。 */
.modal-actions .button.primary,
.drawer-actions .button.primary,
.work-page-actions .button.primary,
.state-panel .button.primary,
.button.wide {
  min-height: 44px;
}

@media(max-width:420px){
  .button{min-height:var(--admin-control-height)}
}

@media (hover: hover) {
  .nav-item:hover { background: var(--color-hover-bg); color: var(--color-ink); }
  .icon-button:hover { background: var(--color-hover-bg); }
  .button.primary:hover, .login-button:hover { background: var(--color-brand-primary-dark); }
  .button.secondary:hover { background: var(--color-hover-bg); }
  .row-actions button:hover { background: var(--color-brand-primary-soft); }
  .row-actions button:first-child:not(.danger):hover { background: var(--color-brand-primary-dark); }
  .row-actions button.danger:hover { background: var(--color-danger-soft); }
  .todo-detail>button:hover { background: var(--admin-green-soft); }
  .table-row:not(.table-head):hover { background: var(--color-hover-bg); }
  .filter-chips button:hover { background: var(--color-hover-bg); }
  .period-button:hover { background: var(--color-hover-bg); }
  .dict-tab:hover { background: var(--color-hover-bg); }
}

/* ===== 全模块统一落码（对照设计稿 ③④⑤⑥⑦：所有菜单/弹窗/抽屉/子页） ===== */
/* 1) 工具栏单行化：扩展到全部表格模块（此前只覆盖 orders/afterSales 的 .module-toolbar） */
.data-panel>.filter-bar,.goods-tools .filter-bar{flex:1 1 auto;flex-wrap:nowrap;min-width:0}
.data-panel>.filter-bar .field.is-search,.goods-tools .filter-bar .field.is-search{width:var(--admin-toolbar-search);min-width:0;flex:none;max-width:none}.module-toolbar.after-sale-toolbar .filter-bar .field.is-search{width:290px}.data-panel>.filter-bar.log-filter-bar .field.is-search{width:250px}
.data-panel>.filter-bar .searchable-select,.goods-tools .filter-bar .searchable-select{min-width:0;flex:1 1 128px;max-width:170px}
.data-panel>.filter-bar .searchable-select.is-wide,.goods-tools .filter-bar .searchable-select.is-wide{min-width:0;flex:1 1 150px;max-width:190px}
@media(max-width:1180px){.data-panel>.filter-bar,.goods-tools .filter-bar{flex-wrap:wrap}.data-panel>.filter-bar .field.is-search,.goods-tools .filter-bar .field.is-search{min-width:200px;width:min(280px,100%)}.data-panel>.filter-bar .searchable-select,.goods-tools .filter-bar .searchable-select{flex:1 1 130px;max-width:none}}
.policy-panels>.filter-bar{padding:12px 16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card)}
.toolbar-count{margin-left:auto;flex:none;font-size:12px;color:var(--admin-muted);white-space:nowrap}
/* 2) 表单分组卡：弹窗主体浅底画布 + 字段收白底分组卡（短表单 2 列） */
.modal-body{background:var(--color-bg)}
.form-card{min-width:0;margin-bottom:12px;padding:14px 16px 2px;background:var(--color-card);border:1px solid var(--color-line);border-radius:var(--admin-radius-panel)}
.form-card:last-child{margin-bottom:4px}
.form-card-title{margin:0 0 12px;font-size:13px;font-weight:700;color:var(--admin-ink)}
.form-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px}
.form-card-grid>.full{grid-column:1/-1}
.work-modal-mask .modal-body{display:block}
.work-form-grid>.form-card{grid-column:1/-1}
@media(max-width:768px){.form-card-grid{grid-template-columns:1fr}}
/* 3) 确认类小弹窗统一 400px 紧凑宽度；弹窗标题 15px；操作栏吸底右对齐 */
.modal-mask:not(.work-modal-mask) .modal{width:var(--admin-modal-sm)}
.modal-head h2{font-size:15px}
.modal-actions{justify-content:flex-end}
/* 4) 只读字段改浅绿提示条（账号创建规则 / 冻结状态等 disabled 输入） */
.field>input:disabled{background:var(--admin-green-soft);border-color:transparent;color:var(--admin-green-2)}
/* 5) SKU 编辑器：行序号徽标 + 44px 紧凑行 + 序号列 */
.c-sku-editor{counter-reset:sku-row}
.c-sku-row{counter-increment:sku-row;min-height:44px}
.c-sku-row::before{content:counter(sku-row);display:grid;place-items:center;width:22px;height:22px;margin-top:6px;border-radius:50%;background:var(--color-line-light);color:var(--color-ink-2);font-size:12px;font-weight:700;flex:none}
.c-sku-row,.catalog-sku-labels{grid-template-columns:26px 1.2fr 110px repeat(7,.8fr) auto}
.catalog-sku-labels::before{content:'#';font-weight:700}
/* 6) 抽屉统一 460px + 头部 36px 图标章 */
.drawer{width:min(var(--admin-drawer-width),100vw)}
.drawer-head{gap:12px}
.drawer-head-icon{flex:none;width:36px;height:36px;border-radius:var(--radius-icon);background:var(--admin-green-soft);color:var(--admin-green-2);display:grid;place-items:center}
/* 7) 抽屉信息行紧凑化（44px 行高） */
.supplier-product-row{padding:7px 0}
.detail-grid view{padding:11px 12px}
</style>
