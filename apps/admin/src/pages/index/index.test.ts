import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchesAdminTodoItem } from '../../stores/admin'

describe('admin supplier and RBAC page', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
  const mainSource = readFileSync(resolve(import.meta.dirname, '../../main.ts'), 'utf8')
  const globalSource = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8')

  it('renders permission-filtered system management menus', () => {
    expect(source).toContain("{ key: 'logs', label: '操作日志'")
    expect(source).toContain("{ key: 'roles', label: '角色管理'")
    expect(source).toContain("{ key: 'accounts', label: '账号管理'")
    expect(source).toContain('store.canMenu(item.key)')
  })

  it('provides supplier status, account and pause reason actions', () => {
    expect(source).toContain('store.restoreSupplierPending(item.id)')
    expect(source).toContain('openSupplierPause(item)')
    expect(source).toContain('store.resumeSupplier(item.id)')
    expect(source).toContain('openSupplierAccount(item)')
    expect(source).toContain('item.cooperationPauseReason')
  })

  it('exposes supplier brands and service regions for 供应品类管理', () => {
    expect(source).toContain('供应品牌（逗号分隔）')
    expect(source).toContain('服务区域（逗号分隔）')
    expect(source).toContain('brands: splitTags(form.value.brands), serviceRegions: splitTags(form.value.serviceRegions)')
    expect(source).toContain('selectedSupplier.brands')
    expect(source).toContain('selectedSupplier.serviceRegions')
  })

  it('renders after-sale supplier responsibility and order logistics tracking', () => {
    expect(source).toContain('metrics.afterSaleStats.supplierResponsibility')
    expect(source).toContain('供应商责任分布')
    expect(source).toContain('orderCarrier(selectedOrder)')
    expect(source).toContain('orderSignResult(selectedOrder)')
    expect(source).toContain('orderLogisticsEvents(selectedOrder)')
    expect(source).toContain('物流轨迹')
  })

  it('keeps 分销价 wording and configurable price level discounts', () => {
    expect(source).toContain('分销价层级折让')
    expect(source).toContain('saveStorePriceLevelDiscounts')
    expect(source).toContain('accountPriceLevelOptions')
    expect(source).not.toContain('集采价')
    expect(source).not.toContain('集采单价')
  })

  it('removes the 主播/达人 wording and keeps a single business-rep ranking', () => {
    expect(source).not.toContain('主播排行')
    expect(source).not.toContain("type === '主播'")
    expect(source).toContain("['推客', '主播', '达人'].includes(type) ? '业务员' : type")
  })

  it('exposes promoter region, farm contact and inventory warning capabilities', () => {
    expect(source).toContain('负责区域')
    expect(source).toContain('form.promoterRegion')
    expect(source).toContain('门店联系人')
    expect(source).toContain('库存预警')
    expect(source).toContain('预警阈值')
    expect(source).toContain('库存变动记录')
    expect(source).toContain('退回运单号')
    expect(source).toContain('较上期')
  })

  it('uses full-width work pages for supplier, role and account forms', () => {
    expect(source).toContain('class="work-page"')
    expect(source).toContain('work-modal-mask')
    expect(source).toContain("workPage?.type === 'supplier-account'")
    expect(source).toContain("workPage?.type === 'role'")
    expect(source).toContain("workPage?.type === 'admin-account'")
  })

  it('keeps persistence wiring in main without post-action audit or permission wrappers', () => {
    expect(mainSource).not.toContain('store.$onAction')
    expect(mainSource).not.toContain('ADMIN_AUDITED_ACTIONS')
    expect(mainSource).not.toContain('ADMIN_ACTION_PERMISSIONS')
    expect(mainSource).not.toContain('appendPlatformAuditLog')
    expect(mainSource).toContain('store.$subscribe')
  })

  it('does not let the legacy main wrapper override product create versus update permissions', () => {
    expect(mainSource).not.toContain("saveCatalogProduct: 'product.update'")
  })

  it('does not expose the generic supplier toggle or fake settlement action', () => {
    expect(source).not.toContain('store.toggleSupplier')
    expect(source).not.toContain("store.recordExport('售后结算'")
    expect(source).not.toContain('confirmShip')
    expect(source).toContain('批量发货')
    expect(source).toContain('batchShipOrders()')
    expect(source).toContain('batchShipCandidates')
    expect(source).not.toContain('>发货</button>')
    expect(source).toContain("store.can('report.export')")
    expect(source).toContain("openDetail('order', item.id)")
  })

  it('provides audit log dimensions and a read-only details drawer', () => {
    expect(source).toContain('logFrom')
    expect(source).toContain('logTo')
    expect(source).toContain('logActor')
    expect(source).toContain('logRole')
    expect(source).toContain('logModule')
    expect(source).toContain("detail.type === 'auditLog'")
    expect(source).toContain('operationId')
    expect(source).toContain('metadata')
  })

  it('requires explicit recovery verification instead of one-click dismissal', () => {
    expect(source).not.toContain('标记已处理</button>')
    expect(source).toContain('人工核验')
    expect(source).toContain('recoveryResolutionNote')
    expect(source).toContain('recoveryOutcome')
  })

  it('renders Chinese grouped role permissions with group select and clear controls', () => {
    expect(source).toContain('adminPermissionGroups')
    expect(source).toContain('group.label')
    expect(source).toContain('全选')
    expect(source).toContain('清空')
    expect(source).not.toContain('{{ permission }}</button>')
  })

  it('keeps the after-sale action column readable inside its own horizontal scroller', () => {
    expect(source).toContain('class="after-sale-table-scroll"')
    expect(source).toContain('.after-sale-table-scroll{overflow-x:auto')
    expect(source).toContain('.after-grid .row-actions{min-width:')
    expect(source).toContain('.after-grid .row-actions button{white-space:nowrap')
  })

  it('stacks report filters to a single column on narrow breakpoints', () => {
    const at768 = source.match(/@media\(max-width:768px\)\{([^}]*)\}/s)?.[0] || ''
    const at420 = source.match(/@media\(max-width:420px\)\{([^}]*)\}/s)?.[0] || ''
    expect(at768).toContain('.report-filters{grid-template-columns:1fr}')
    expect(at420).toContain('.report-filters{grid-template-columns:1fr}')
    expect(source).toContain('.report-filters .field{min-width:0')
  })

  it('offers a provider retry for refund-failed after-sales', () => {
    expect(source).toContain("item.status === 'refund-failed'")
    expect(source).toContain('重试退款')
  })

  it('uses a two-column 375px report summary with GMV spanning the second row', () => {
    expect(source).toContain('@media(max-width:420px)')
    expect(source).toContain('.report-summary{grid-template-columns:repeat(2,minmax(0,1fr))')
    expect(source).toContain('.report-summary>view:last-child{grid-column:1/-1')
    expect(source).not.toContain('.summary-strip{min-width:720px}')
  })

  it('keeps the logout control in the topbar on a light surface', () => {
    expect(source).toContain('class="operator"')
    expect(source).toContain('.logout-button .ui-icon')
    expect(source).toContain('.logout-button .ui-icon{filter:none}')
    expect(source).toContain('<UiIcon name="door-open"')
    expect(source).not.toContain('<UiIcon name="log-out"')
  })

  it('lays out audit filters as a responsive grid', () => {
    expect(source).toContain('.audit-filters{display:grid')
    expect(source).toContain('grid-template-columns:repeat(5,minmax(0,1fr))')
    expect(source).toContain('.audit-filters{grid-template-columns:repeat(2,minmax(0,1fr))}')
  })

  it('subscribes to every shared collection read by the admin page and store', () => {
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    for (const key of [
      'PLATFORM_DICTIONARIES_STORAGE_KEY',
      'PLATFORM_PRICING_DEFAULTS_STORAGE_KEY',
      'PLATFORM_SHARE_CONFIG_STORAGE_KEY',
      'PLATFORM_SHARES_STORAGE_KEY',
      'PLATFORM_SETTLEMENTS_STORAGE_KEY',
      'PLATFORM_STORE_ACCOUNTS_STORAGE_KEY',
      'PLATFORM_COMMISSION_RULES_STORAGE_KEY',
      'PLATFORM_COMMISSION_SETTLEMENT_RECORDS_STORAGE_KEY'
    ]) expect(subscribed).toContain(key)
    expect(source).toContain("document.visibilityState === 'visible'")
    expect(source).toContain('store.refreshSharedState()')
  })

  it('renders the user operations workspaces with the leader commission tab', () => {
    expect(source).toContain("{ key: 'users', label: '用户信息'")
    expect(source).toContain("{ key: 'leaders', label: '团长管理'")
    expect(source).toContain("active === 'users'")
    expect(source).toContain("active === 'leaders'")
    expect(source).toContain('<AdminUsersPanel />')
    expect(source).toContain('<AdminLeadersPanel />')
    expect(source).toContain("'团长分成'")
    expect(source).toContain('store.updateLeaderShareRates')
    expect(source).toContain('buildLeaderCommissionLedger')
    expect(source).toContain('batchShipOrders')
    expect(source).not.toContain("label: '预约管理'")
    expect(source).not.toContain("label: '旅游线路'")
  })

  it('uses the selected local week or month range for dashboard metrics', () => {
    expect(source).toContain('const dashboardRange = computed')
    expect(source).toContain("period.value === '本周'")
    expect(source).toContain('filter: dashboardRange.value')
    expect(source).toContain("new Set<OrderStatus>(['pending', 'shipping', 'delivered'])")
    expect(source).toContain("{{ metrics.categoryShares.length }} 类商品品类")
    expect(source).not.toContain('8 类商品品类')
  })

  it('renders unified todos and navigates with filters and object ids', () => {
    expect(source).toContain('const adminTodos = computed(() => store.queryAdminTodos())')
    expect(source).toContain('v-for="todo in adminTodos"')
    expect(source).toContain('<UiIcon name="bell-ring" :size="18" />')
    expect(source).not.toContain('name="circle-alert"')
    expect(source).toContain('openTodo(todo)')
    expect(source).toContain('todo.filters')
    expect(source).toContain('todo.objectIds')
    expect(source).not.toContain('靖州杨梅专业合作社 等')
    expect(source).not.toContain('黄桃礼盒破损理赔 等')
  })

  it('subscribes leader and driver changes for cross-portal consistency', () => {
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_STORE_ACCOUNTS_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_DRIVERS_STORAGE_KEY')
  })

  it('renders product submission review views with audit-only actions and rejection reasons', () => {
    expect(source).toContain('productReviewFilter')
    expect(source).toContain('待审核')
    expect(source).toContain('已驳回')
    expect(source).toContain('store.approveCatalogProductSubmission(submission.id)')
    expect(source).toContain('store.rejectCatalogProductSubmission(productRejectTarget.value.id, productRejectReason.value)')
    expect(source).toContain("store.can('product.audit')")
    expect(source).toContain('submission.reviewNote')
  })
  it('renders product review filters as searchable dropdowns and keeps commission tabs visible', () => {
    expect(source).not.toContain('product-review-tabs')
    expect(source).toContain('SearchableSelect v-model="productReviewFilter"')
    expect(source).toMatch(/class="goods-tools"><view class="filter-bar">[\s\S]*SearchableSelect v-model="productReviewFilter"/)
    expect(source).toContain('productReviewFilters')
    expect(source).toContain('productSupplierFilter')
    expect(source).toContain('placeholder="请输入商品名称"')
    expect(source).not.toContain('搜索商品名称 / 供应商')
    expect(source).toContain('class="filter-chips commission-filter-tabs"')
    expect(source).toContain('v-for="item in commissionTabOptions"')
    expect(source).not.toContain('SearchableSelect v-model="commissionTab"')
    expect(source).toContain('commissionTabOptions')
  })


  it('opens submission and legacy product todos on their exact non-empty row subsets', () => {
    const submissionTodo = { route: 'products' as const, filters: { review: 'pending' }, objectIds: ['SUB-VISIBLE'] }
    const legacyTodo = { route: 'products' as const, filters: { review: 'legacy', status: 'pending' }, objectIds: ['P-LEGACY-VISIBLE'] }
    const reviewFilter = submissionTodo.filters.review === 'pending' ? '待审核' : '正式商品'
    const submissions = [{ id: 'SUB-VISIBLE', status: 'pending' }, { id: 'SUB-OTHER', status: 'pending' }, { id: 'SUB-REJECTED', status: 'rejected' }]
    const products = [{ id: 'P-LEGACY-VISIBLE', status: 'pending' }, { id: 'P-LEGACY-OTHER', status: 'pending' }, { id: 'P-ACTIVE', status: 'active' }]
    const visibleSubmissions = submissions.filter((submission) => reviewFilter === '待审核' && submission.status === 'pending' && matchesAdminTodoItem(submissionTodo, 'products', submission))
    const visibleLegacyProducts = products.filter((product) => product.status === legacyTodo.filters.status && matchesAdminTodoItem(legacyTodo, 'products', product))

    expect(reviewFilter).toBe('待审核')
    expect(visibleSubmissions.map((submission) => submission.id)).toEqual(['SUB-VISIBLE'])
    expect(visibleLegacyProducts.map((product) => product.id)).toEqual(['P-LEGACY-VISIBLE'])
    expect(source).toContain("productReviewFilter.value = filters.review === 'pending' ? '待审核'")
    expect(source).toContain("productStatusFilter.value = filters.review === 'pending' ? '全部' : filters.status || '全部'")
    expect(source).toContain("matchesActiveTodo('products', submission)")
  })

  it('shows and validates MOQ while subscribing to product submissions', () => {
    expect(source).toContain('minimumOrderQuantity')
    expect(source).toContain('起订量')
    expect(source).toContain('起订量必须为大于等于 1 的整数')
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY')
  })

  it('keeps short-height sidebar controls compact and scroll-safe', () => {
    expect(source).toContain('@media (max-height:768px)')
    expect(source).toContain('.nav-list{padding-bottom:')
    expect(source).toContain('aria-label="退出登录" title="退出登录"')
  })

  it('keeps the compact desktop topbar account readable', () => {
    expect(source).toMatch(/@media\(max-width:1180px\)[\s\S]*\.operator-meta\{display:none\}/)
    expect(source).toMatch(/@media\(max-width:1180px\)[\s\S]*\.operator \.logout-button text\{display:none\}/)
    expect(source).toMatch(/@media\(max-width:1180px\)[\s\S]*\.operator \.logout-button\{width:32px/)
  })

  it('keeps mobile toast above the bottom safe area', () => {
    expect(globalSource).toContain('@media (max-width: 420px)')
    expect(globalSource).toContain('.uni-sample-toast')
    expect(globalSource).toContain('env(safe-area-inset-bottom)')
  })

  it('shows the store login error before the demo credential fallback', () => {
    expect(source).toContain("showToast(store.error || '账号或密码错误（演示账号 admin / 123456）')")
  })

  it('shows the store recovery error before the generic recovery fallback', () => {
    expect(source).toContain("showToast(store.error || (task.handlerKey ? '自动恢复失败，任务已保留，请查看失败原因' : '人工核验结果保存失败'))")
  })

  it('bounds wide tables, work actions and drawers to their local viewport', () => {
    expect(source).toContain('.table-scroll{overflow-x:auto')
    expect(source).toContain('env(safe-area-inset-bottom)')
    expect(source).toContain('.drawer{width:min(var(--admin-drawer-width),100vw)')
    expect(source).toContain('max-width:100vw')
  })

  it('uses uploaded product category images across admin product surfaces', () => {
    expect(source).toContain('productCategoryImage')
    expect(source).not.toContain('categoryIconName')
    expect(source).toContain("image: productCategoryImage('全部', dictionaryState.value)")
    expect(source).toContain('image: productCategoryImage(category, dictionaryState.value)')
    expect(source).toContain(':src="productCategoryImage(product.category, dictionaryState)"')
    expect(source).toContain(':src="productCategoryImage(item.name, dictionaryState)"')
    expect(source).toContain("dictTypeTab === 'productCategory'")
    expect(source).toContain('.category-thumb{width:32px;height:32px')
    expect(source).toContain(':show-error="false"')
  })

  it('adds required image models and uploaders only to product category forms', () => {
    expect(source).toContain('categoryImage: null as BusinessMediaValue | null')
    expect(source).toContain('dictImage: null as BusinessMediaValue | null')
    expect(source).toContain('v-if="form.categoryType === \'product\'" class="field full"')
    expect(source).toContain('v-model="form.categoryImage" purpose="product-category"')
    expect(source).toContain('v-if="dictTypeTab === \'productCategory\'" class="field full"')
    expect(source).toContain('v-model="form.dictImage" purpose="product-category"')
    expect(source).not.toContain('v-model="form.categoryImage" purpose="supplier-category"')
  })

  it('persists category-form images through the shared dictionary media lifecycle', () => {
    expect(source).toContain('dictionaryItemMediaBindings')
    expect(source).toContain('validateDictionaryItemImage')
    expect(source).toContain("store.addCategory(form.value.name, 'product', categoryImage)")
    expect(source).toContain('image: dictImage')
    expect(source).toContain("store.categories.filter((item) => item.type !== 'product')")
  })

  it('filters roles, admin accounts, price policies and store accounts by local keywords', () => {
    const roles = [{ name: '运营', code: 'ops', enabled: true }, { name: '财务', code: 'finance', enabled: false }]
    const accounts = [{ account: 'ops01', name: '李运营', roleId: 'AR-OPS', enabled: true }, { account: 'fin01', name: '王财务', roleId: 'AR-FIN', enabled: false }]
    const policies = [{ name: '周末团购', scope: '全部农家乐', type: 'group' }, { name: '会员价', scope: '试点门店', type: 'member' }]
    const storeAccounts = [{ name: '店主张三', account: 'store01', farmId: 'F001' }, { name: '店员李四', account: 'staff02', farmId: 'F002' }]
    const match = (haystack: string, keyword: string) => !keyword || haystack.toLowerCase().includes(keyword.toLowerCase())

    expect(roles.filter((item) => match(`${item.name}${item.code}`, '运营')).map((item) => item.code)).toEqual(['ops'])
    expect(accounts.filter((item) => match(`${item.account}${item.name}`, 'fin01')).map((item) => item.account)).toEqual(['fin01'])
    expect(policies.filter((item) => match(`${item.name}${item.scope}${item.type}`, '会员')).map((item) => item.name)).toEqual(['会员价'])
    expect(storeAccounts.filter((item) => match(`${item.name}${item.account}`, 'staff02')).map((item) => item.account)).toEqual(['staff02'])

    expect(source).toContain('const roleKeyword = ref')
    expect(source).toContain('const accountKeyword = ref')
    expect(source).toContain('const policyKeyword = ref')
    expect(source).toContain('const storeAccountKeyword = ref')
    expect(source).toContain('v-for="role in filteredRoles"')
    expect(source).toContain('v-for="account in filteredAdminAccounts"')
    expect(source).toContain('policyKeyword.value')
    expect(source).toContain('storeAccountKeyword.value')
    expect(source).toContain('roleStatusFilter')
    expect(source).toContain('accountRoleFilter')
    expect(source).toContain('accountStatusFilter')
  })

  it('filters after-sale settlement records by order id and supplier dropdown', () => {
    const records = [
      { id: 'ST20260806', kind: 'supplier', orderIds: ['NJ202608110842'], items: [{ supplierId: 'S001', supplierName: '靖州杨梅专业合作社', orderIds: ['NJ202608110842'] }] },
      { id: 'ST20260720', kind: 'supplier', orderIds: ['NJ202607201000'], items: [{ supplierId: 'S002', supplierName: '溆浦脐橙合作社', orderIds: ['NJ202607201000'] }] },
      { id: 'CS20260801', kind: 'commission', items: [{ promoterName: '李推客' }] }
    ]
    const match = (item: typeof records[number], keyword: string, supplierId: string) => {
      const q = keyword.trim().toLowerCase()
      const orders = [
        ...('orderIds' in item && item.orderIds ? item.orderIds : []),
        ...item.items.flatMap((row) => 'orderIds' in row && row.orderIds ? row.orderIds : [])
      ]
      const matchesOrder = !q || orders.some((id) => id.toLowerCase().includes(q))
      const matchesSupplier = !supplierId || item.items.some((row) => 'supplierId' in row && row.supplierId === supplierId)
      return matchesOrder && matchesSupplier
    }

    expect(records.filter((item) => match(item, 'NJ202608110842', '')).map((item) => item.id)).toEqual(['ST20260806'])
    expect(records.filter((item) => match(item, '', 'S002')).map((item) => item.id)).toEqual(['ST20260720'])
    expect(records.filter((item) => match(item, '靖州', '')).map((item) => item.id)).toEqual([])

    expect(source).toContain('const settlementKeyword = ref')
    expect(source).toContain('const settlementSupplierFilter = ref')
    expect(source).toContain('v-model="settlementKeyword"')
    expect(source).toContain('v-model="settlementSupplierFilter"')
    expect(source).toContain('placeholder="请输入订单号"')
    expect(source).toContain('filteredSettlementRecords')
    expect(source).toMatch(/afterTab === '结算流水'[\s\S]*class="filter-bar"[\s\S]*请输入订单号[\s\S]*settlementSupplierFilter/)
  })

  it('filters after-sale tickets, store accounts, promoters and dictionary items by status dropdown', () => {
    const tickets = [
      { id: 'AS1', status: 'processing' },
      { id: 'AS2', status: 'refunded' },
      { id: 'AS3', status: 'rejected' }
    ]
    const storeAccounts = [
      { account: 'store01', enabled: true },
      { account: 'staff02', enabled: false }
    ]
    const promoters = [
      { name: '李推客', settled: false },
      { name: '张伟', settled: true }
    ]
    const dictItems = [
      { code: 'CITY-A', enabled: true },
      { code: 'CITY-B', enabled: false }
    ]
    const matchEnabled = (enabled: boolean, status: string) => status === '全部' || (status === '启用' ? enabled : !enabled)
    const matchSettled = (settled: boolean, status: string) => status === '全部' || (status === '已结算') === settled

    expect(tickets.filter((item) => item.status === 'processing').map((item) => item.id)).toEqual(['AS1'])
    expect(storeAccounts.filter((item) => matchEnabled(item.enabled, '停用')).map((item) => item.account)).toEqual(['staff02'])
    expect(promoters.filter((item) => matchSettled(!!item.settled, '已结算')).map((item) => item.name)).toEqual(['张伟'])
    expect(dictItems.filter((item) => matchEnabled(item.enabled, '停用')).map((item) => item.code)).toEqual(['CITY-B'])

    expect(source).toContain('const afterStatusFilter = ref')
    expect(source).toContain('const storeAccountStatusFilter = ref')
    expect(source).toContain('const promoterSettleFilter = ref')
    expect(source).toContain('const dictStatusFilter = ref')
    expect(source).toContain('v-model="afterStatusFilter"')
    expect(source).toContain('v-model="storeAccountStatusFilter"')
    expect(source).toContain('v-model="promoterSettleFilter"')
    expect(source).toContain('v-model="dictStatusFilter"')
    expect(source).toMatch(/afterTab === '售后工单'[\s\S]*class="filter-bar"[\s\S]*afterStatusFilter/)
    expect(source).toMatch(/storeAccountKeyword[\s\S]*storeAccountStatusFilter/)
    expect(source).toMatch(/promoterKeyword[\s\S]*promoterSettleFilter/)
    expect(source).toMatch(/dictKeyword[\s\S]*dictStatusFilter/)
  })
  it('exports the current module as a real xlsx workbook instead of csv', () => {
    expect(source).toContain('toXlsx(rows, { sheetName: titles[active.value].title })')
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(source).toContain('.xlsx')
    expect(source).not.toContain('text/csv')
  })
})
