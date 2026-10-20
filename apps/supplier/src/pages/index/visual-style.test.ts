import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const supplierRoot = resolve(import.meta.dirname, '../../..')
const uiRoot = resolve(supplierRoot, '../../packages/ui/src')
const pageSource = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const globalStyles = readFileSync(resolve(supplierRoot, 'src/styles/global.scss'), 'utf8')
const pageConfig = readFileSync(resolve(supplierRoot, 'src/pages.json'), 'utf8')
const tokenCss = readFileSync(resolve(uiRoot, 'design-tokens.css'), 'utf8')
const tokenTs = readFileSync(resolve(uiRoot, 'design-tokens.ts'), 'utf8')
const mapSource = readFileSync(resolve(supplierRoot, 'src/components/DeliveryRouteMap.vue'), 'utf8')
const iconRoot = resolve(supplierRoot, 'src/static/icons')
const iconNames = readdirSync(iconRoot)
const svgIconNames = iconNames.filter((name) => name.endsWith('.svg')).map((name) => name.replace(/\.svg$/, ''))
const pngIconNames = iconNames.filter((name) => name.endsWith('.png')).map((name) => name.replace(/\.png$/, ''))
const template = pageSource.slice(pageSource.indexOf('<template>'), pageSource.indexOf('<script setup'))
const styles = pageSource.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''
const allStyles = `${globalStyles}\n${styles}`
const businessStyles = allStyles
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

const visualViews = [
  'supplier-orders',
  'supplier-products',
  'supplier-mine',
  'driver-today',
  'driver-data',
  'driver-handovers',
  'workspace-drivers',
  'workspace-routes',
  'workspace-outbound',
  'driver-route-detail',
  'workspace-settlements',
  'workspace-handovers',
  'workspace-warehouse'
]

const visualSheets = [
  'order',
  'courier',
  'handover-out',
  'handover-in',
  'driver-form-edit',
  'driver-reset',
  'driver-toggle-confirm',
  'reset-confirm',
  'category-picker'
]

const figmaHex = [
  '#2F7A4D',
  '#245E3B',
  '#E9F3ED',
  '#DE8A3B',
  '#3D7CB0',
  '#C9553F',
  '#F4F7F2',
  '#1D2A22',
  '#5E6F64',
  '#D2543C'
]

describe('supplier mobile visual contract', () => {
  it('locks Figma 竹青绿 hex only in shared token files', () => {
    expect(tokenCss).toMatch(/:root,\s*page/)
    expect(tokenCss).toContain('--gradient-brand')
    expect(tokenCss).toContain('--radius-card: 14px')
    expect(tokenCss).toContain('--space-page: 16px')
    expect(tokenCss).toContain('--control-size: 44px')
    expect(tokenCss).toContain('0.35')
    for (const hex of figmaHex) {
      expect(tokenCss).toContain(hex)
      expect(tokenTs).toContain(hex)
    }
  })

  it('keeps business styles on CSS variables without hardcoded colors or gradients', () => {
    expect(allStyles).not.toMatch(/(?:linear|radial)-gradient\s*\(/)
    expect(tokenCss).toMatch(/(?:linear)-gradient\s*\(/)
    expect(allStyles).toMatch(/var\(--color-/)
    expect(allStyles).toMatch(/var\(--radius-card\)/)
    expect(allStyles).toMatch(/var\(--space-page\)/)
    expect(businessStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(template).not.toMatch(/\sstyle="/)
  })

  it('renders every product image with a stable aspect-fill crop', () => {
    const productImages = [...template.matchAll(/<BusinessImage\b[^>]*>/g)].map(([tag]) => tag)

    expect(productImages.length).toBeGreaterThan(0)
    for (const tag of productImages) expect(tag).toContain('mode="aspectFill"')
  })

  it('keeps touch targets at least 44px and cards on radius-card', () => {
    expect(globalStyles).toMatch(/\.primary-button\s*\{[^}]*min-height:\s*var\(--control-size\)/)
    expect(globalStyles).toMatch(/\.outline-button\s*\{[^}]*min-height:\s*var\(--control-size\)/)
    expect(globalStyles).toMatch(/\.mini-button\s*\{[^}]*min-height:\s*var\(--control-size\)/)
    expect(globalStyles).toMatch(/\.chip\s*\{[^}]*min-height:\s*var\(--control-size\)/)
    expect(globalStyles).toMatch(/\.icon-button\s*\{[^}]*width:\s*var\(--control-size\);\s*height:\s*var\(--control-size\)/)
    expect(allStyles).toMatch(/\.sku-card-head button\s*\{[^}]*min-height:\s*\$control/)
    expect(allStyles).toMatch(/\.checkbox-field\s*\{[^}]*min-height:\s*\$control/)
    expect(globalStyles).toMatch(/\.list-card\s*\{[^}]*border-radius:\s*var\(--radius-card\)/)
    expect(styles).toMatch(/\.supplier-product-card\s*\{[^}]*border-radius:\$radius-card/)
  })

  it('defines semantic status colors through tokens and protects narrow mobile layouts', () => {
    expect(globalStyles).toContain('var(--color-info)')
    expect(globalStyles).toContain('var(--color-warning-dark)')
    expect(globalStyles).toContain('var(--color-brand-primary)')
    expect(globalStyles).toContain('var(--color-danger)')
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/)
    expect(styles).toContain('@media (max-width: 375px)')
  })

  it('marks every supplier, driver and secondary workspace for visual regression', () => {
    for (const view of visualViews) expect(template).toContain(`data-visual-view="${view}"`)
  })

  it('marks every business sheet and category picker for visual regression', () => {
    for (const sheet of visualSheets) expect(template).toContain(`data-visual-sheet="${sheet}"`)
  })

  it('keeps fixed navigation and sheets clear of content and mobile safe areas', () => {
    expect(globalStyles).toMatch(/\.page-pad\s*\{[^}]*padding:[^;}]*calc\(var\(--mobile-tab-height\)/)
    expect(globalStyles).toMatch(/\.tabbar\s*\{[^}]*min-height:\s*var\(--mobile-tab-height\)/)
    expect(globalStyles).toMatch(/\.hero \{[^}]*padding: 0 var\(--space-page\)/)
    expect(globalStyles).toMatch(/\.tabbar\s*\{[^}]*position:\s*fixed[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/)
    expect(globalStyles).toMatch(/\.sheet-panel\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)[^}]*overflow:\s*hidden/)
    expect(globalStyles).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/)
    expect(styles).toMatch(/\.secondary-workspace\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/)
    expect(styles).toMatch(/\.secondary-body\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/)
    expect(styles).toMatch(/\.product-work-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/)
    expect(styles).toMatch(/\.product-work-body\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/)
  })

  it('订单页五项经营指标默认 3+2，不再依赖视口 390', () => {
    expect(globalStyles).toMatch(/\.hero-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(globalStyles).toMatch(/\.hero-stat:nth-child\(4\)\s*\{[^}]*border-left:\s*0/)
    expect(template).toContain('data-visual-view="supplier-orders"')
    expect(template).toContain('今日门店')
  })

  it('shrinks long business text without pushing status and action controls away', () => {
    expect(allStyles).toMatch(/\.row-top\s*\{[^}]*min-width:\s*0/)
    expect(allStyles).toMatch(/\.row-top\s*>\s*(?:text|\.order-no)[^{]*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/)
    expect(allStyles).toMatch(/\.work-link\s+\.row-main\s*\{[^}]*min-width:\s*0/)
    expect(allStyles).toMatch(/\.sheet-title\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/)
  })

  it('uses the shared mobile background in H5 and mini program page configuration', () => {
    expect(JSON.parse(pageConfig).globalStyle.backgroundColor).toBe('#F4F7F2')
    expect(globalStyles).not.toMatch(/(^|,)\s*select(?:\s|,|\{)/m)
  })

  it('页头和二级工作台避开小程序胶囊', () => {
    expect(globalStyles).toMatch(/\.hero \{ padding-top: calc\(12px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toMatch(/\.product-work-head,\s*\.secondary-head \{[\s\S]*padding-right: 96px;/)
    expect(pageSource).toMatch(/\.login-page \{ padding-top: calc\(24px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toContain('class="pc-login-hero"')
    expect(pageSource).not.toContain('class="login-banner"')
    expect(pageSource).toMatch(/\.login-card \{[^}]*max-width: 340px/)
    expect(pageSource).toMatch(/\.login-body \{ padding: \$space-page; \}/)
    expect(globalStyles).not.toMatch(/\.secondary-workspace \{[^}]*left:\s*50%/)
    expect(globalStyles).not.toMatch(/\.secondary-workspace \{[^}]*transform:\s*translateX\(-50%\)/)
  })

  it('全屏态避开胶囊，商品管理和二级页不再叠两层状态栏', () => {
    expect(globalStyles).toMatch(/\.page-state \{ padding-top: calc\(80px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.product-work-page \{ padding-top: 16px; \}/)
    expect(pageSource).not.toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.product-work-page \{ padding-top: calc\(16px \+ var\(--status-bar-height\)\)/)
    expect(pageSource).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.secondary-workspace \{[\s\S]*min-height: calc\(100vh/)
    expect(pageSource).not.toMatch(/\.secondary-head \{[^}]*margin: -14px/)
  })

  it('订单页展示当日农家乐数量，二级页留在框内且返回是方箭头', () => {
    expect(template).toContain('今日门店')
    expect(template).toContain('今日件数')
    expect(template).toContain('待发货件')
    expect(template).toContain('缺货件数')
    expect(template).toContain('配送中件')
    expect(template).toContain('todayFarmhouseQuantities')
    expect(template).not.toMatch(/hero-stat-label">今日缺货/)
    expect(template).not.toContain('data-visual-view="supplier-dashboard"')
    expect(template).not.toContain('data-visual-view="workspace-account"')
    expect(pageSource).not.toContain("label: '首页'")
    expect(pageSource).not.toContain('账号信息')
    expect(styles).not.toMatch(/\.secondary-workspace\s*\{[^}]*position:\s*fixed/)
    expect(styles).toMatch(/\.secondary-workspace\s*\{[^}]*min-height:\s*calc\(100vh/)
    expect(template).toMatch(/class="page-back" aria-label="返回"/)
    expect(template).not.toMatch(/<text>返回<\/text>/)
    expect(globalStyles).toMatch(/\.hero-logout \{[^}]*background: var\(--color-danger\)/)
  })

  it('我的业务入口一行三个，空态不再撑满半屏', () => {
    expect(pageSource).toMatch(/\.mine-tile-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: var\(--space-gap\)/)
    expect(pageSource).toContain("label: '出仓交接'")
    expect(pageSource).toMatch(/\.mine-tile-grid \.work-link \{ flex-direction: column/)
    expect(globalStyles).toMatch(/\.empty-state \{[^}]*min-height: 120px/)
    expect(pageSource).toMatch(/class="empty-state compact-empty pc-empty"/)
    expect(pageSource).toMatch(/class="empty-state compact-empty pc-empty"[\s\S]*暂无交接记录/)
    expect(globalStyles).toMatch(/\.sheet-panel \{[^}]*padding: var\(--space-card\) var\(--space-card\) 0/)
    expect(pageSource).toMatch(/:class="driverStatusTarget\.status === 'active' \? 'danger-button' : 'primary-button'"/)
  })

  it('业务弹层操作贴底，标题不再负 margin，品类选择器左右 12px', () => {
    expect(pageSource).toMatch(/class="sheet-actions sheet-foot"/)
    expect(globalStyles).toMatch(/\.sheet-head \{[^}]*margin: 0/)
    expect(globalStyles).not.toMatch(/\.sheet-head \{[^}]*margin: -14px/)
    expect(styles).not.toMatch(/\.sheet-actions \{[^}]*position:\s*relative/)
    expect(styles).toMatch(/\.category-picker-sheet > \.sheet-head \{ padding: 6px 12px/)
  })

  it('短弹层和品类选择器随内容收缩，不再写死 80vh 高度', () => {
    expect(globalStyles).toMatch(/\.sheet-scroll \{[^}]*height: auto;[^}]*max-height: calc\(80vh/)
    expect(styles).toMatch(/\.category-picker-list \{[^}]*height: auto;[^}]*max-height: calc\(80vh/)
    expect(globalStyles).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
    expect(styles).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
  })

  it('二级页和商品编辑是 head / 内容滚动 / 主按钮贴底', () => {
    expect(template).toMatch(/class="secondary-head"[\s\S]*class="secondary-body"[\s\S]*class="secondary-foot"/)
    expect(template).toMatch(/class="product-work-head"[\s\S]*class="product-work-body"[\s\S]*class="product-form-actions"/)
    expect(styles).toMatch(/\.secondary-foot\s*\{[^}]*flex:\s*none/)
    expect(styles).toMatch(/\.product-form-actions\s*\{[^}]*flex:\s*none/)
    expect(styles).not.toMatch(/\.secondary-workspace\s*\{[^}]*overflow-y:\s*auto/)
    expect(styles).not.toMatch(/\.product-work-page\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('订单与交接弹层是 head / scroll-view / foot 三段式', () => {
    expect(template).toMatch(/data-visual-sheet="order"[\s\S]*class="sheet-head"[\s\S]*<scroll-view class="sheet-scroll"[\s\S]*class="sheet-actions sheet-foot"/)
    expect(template).not.toContain("key: 'assign'")
    expect(template).not.toContain("key: 'reassign'")
    expect(template).not.toContain('data-visual-sheet="assign-reassign"')
    expect(template).toMatch(/data-visual-sheet="handover-out"[\s\S]*<scroll-view class="sheet-scroll"/)
    expect(globalStyles).not.toMatch(/\.sheet-panel > view,\s*\.sheet-panel > scroll-view \{[^}]*overflow-y:\s*auto/)
    expect(template).toContain('class="sheet-handle"')
    expect(globalStyles).toMatch(/\.compact-empty \{[^}]*min-height:\s*96px/)
  })

  it('线路规划提供地图预览、道路摘要和站点顺序调整', () => {
    expect(template).toContain('route-planning-map')
    expect(template).toContain('生成路线预览')
    expect(template).toContain('发布配送线路')
    expect(template).toContain('总距离')
    expect(pageSource).toContain('routeProviderLabel')
    expect(pageSource).toContain('optimizeNamedRoute')
    expect(template).toContain('route-workbench-status')
    expect(template).toContain('route-bottom-actions')
    expect(pageSource).toContain('invalidateRoutePreview')
    expect(styles).toMatch(/\.named-route-form \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(styles).toMatch(/\.route-bottom-actions \{[^}]*grid-template-columns:\s*repeat\(2/)
    expect(styles).not.toContain('min-width: 701px')
  })

  it('出仓交接商品突出展示图片、规格和应发数量', () => {
    expect(template).toContain('data-visual-state="supplier-outbound-item"')
    expect(template).toContain('data-visual-state="driver-outbound-item"')
    expect(template).toContain('data-visual-state="driver-store-item"')
    expect(template).toContain("规格 {{ item.skuName || '规格待维护' }}")
    expect(template).toContain('class="outbound-item-image"')
    expect(template).toContain('mode="aspectFill"')
    expect(template).not.toMatch(/data-visual-sheet="handover-out"[\s\S]*司机发起/)
  })

  it('司机今日线路使用状态筛选、摘要卡片并进入独立详情页', () => {
    expect(template).toContain('filteredTodayDriverRoutes')
    expect(template).toContain('driverRouteFilterOptions')
    expect(template).toContain('driver-route-metrics')
    expect(template).toContain('openDriverRoute(route)')
    expect(template).toContain('data-visual-view="driver-route-detail"')
    expect(template).toContain('DeliveryRouteMap')
    expect(template).toContain('data-visual-state="driver-stop-card"')
    expect(pageSource).toContain('openDriverStore(stop.storeId)')
    expect(styles).toMatch(/\.driver-route-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/)
  })

  it('司机端包含独立打卡、凭证审核、缺货备注和门店排序流程', () => {
    expect(template).toContain('driverWarehouseView')
    expect(template).toContain('warehouseDistanceM')
    expect(template).toContain('ImageUploader')
    expect(template).toContain('driverHandoverProofs')
    expect(template).toContain('驳回修改')
    expect(template).toContain('重新提交出仓交接')
    expect(template).toContain('driverShortageView')
    expect(template).toContain('driverShortageNotes')
    expect(template).toContain('moveDriverStop')
    expect(template).toContain('地图模式')
    expect(pageSource).toContain("store.reorderRouteStops(route.id, ids)")
  })

  it('司机作业页使用细分状态、缺货提醒、配送进度和门店时间轴', () => {
    expect(pageSource).toContain('driverRouteStageText')
    expect(pageSource).toContain('driverStopStageText')
    expect(template).toContain('待标记缺货')
    expect(template).toContain('本次配送存在缺货')
    expect(template).toContain('driver-route-progress')
    expect(template).toContain('driver-timeline')
    expect(template).toContain('outbound-quantity-grid')
    expect(styles).toMatch(/\.driver-hero-panel\s*\{/)
    expect(styles).toMatch(/\.driver-timeline\s*\{/)
  })

  it('司机二级页隐藏品牌头并统一下一站、门店明细和历史记录', () => {
    expect(template).toContain("store.auth.role === 'driver' && !driverRouteDetailId")
    expect(pageSource).toContain('driverNextStop')
    expect(pageSource).toContain('driverSelectedStopId')
    expect(pageSource).toContain('expandedOutboundItems')
    expect(template).toContain('下一站')
    expect(template).toContain('门店明细')
    expect(template).toContain('driver-data-route')
    expect(template).toContain('driver-handover-card')
    expect(styles).toMatch(/\.driver-timeline-item\.is-selected\b/)
    expect(styles).toMatch(/\.outbound-store-breakdown\s*\{/)
    expect(template).not.toContain('待排线路')
    expect(pageSource).toContain('warehouseAbnormalOptions')
    expect(pageSource).toContain('checkInWarehouseAbnormal')
    expect(template).toContain('异常打卡')
    expect(pageSource).toContain('定位失败')
    expect(pageSource).toContain('设备异常')
  })

  it('司机角色使用统一视觉层与交互状态', () => {
    expect(template).toContain('driver-role-page')
    expect(styles).toMatch(/\.driver-role-page\s*\{/)
    expect(styles).toMatch(/\.driver-role-page\s+\.driver-section-card\s*\{/)
    expect(styles).toMatch(/\.driver-role-page\s+\.driver-action-secondary\s*\{/)
    expect(styles).toMatch(/\.driver-role-page\s+\.badge\.pending_review\s*\{/)
    expect(styles).toMatch(/transition:\s*[^;]*160ms/)
    expect(styles).not.toMatch(/\.driver-role-page[\s\S]*?#[0-9a-fA-F]{3,8}/)
  })

  it('司机记录页修复顶部拉伸并提升线路卡片可读性', () => {
    expect(styles).toMatch(/\.driver-aux-page\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/s)
    expect(styles).toMatch(/\.driver-role-page\s+\.driver-route-card\.driver-section-card\s*\{[^}]*padding:\s*0/s)
    expect(styles).toMatch(/\.driver-route-name\s*\{[^}]*font-size:\s*var\(--text-title\)/s)
    expect(styles).toMatch(/\.driver-route-metrics \.meta\s*\{[^}]*font-size:\s*var\(--text-body\)/s)
    expect(styles).toMatch(/\.driver-route-metrics \.val\s*\{[^}]*font-size:\s*var\(--text-subtitle\)/s)
    expect(styles).toMatch(/\.driver-hero-warehouse\s*\{[^}]*color:\s*var\(--color-on-brand\)[^}]*font-size:\s*var\(--text-body\)/s)
    expect(styles).toMatch(/\.driver-handover-note\s*\{/)
    const handoverBlock = template.match(/data-visual-view="driver-handovers"[\s\S]*?<\/view>\s*<\/view>/)?.[0] || ''
    expect(handoverBlock).toContain('driver-handover-note')
    expect(handoverBlock).not.toContain('store-readonly-note')
  })

  it('共享主题不引入小程序不支持的裸 select 标签选择器', () => {
    const mobileTheme = readFileSync(resolve(uiRoot, 'mobile-theme.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(mobileTheme).not.toMatch(/(^|[,{}])\s*select\s*(?=[,{])/m)
  })

  it('共享主题与页面样式都不引入小程序不支持的标签选择器', () => {
    const mobileTheme = readFileSync(resolve(uiRoot, 'mobile-theme.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(mobileTheme).not.toMatch(/^\s*\.pc-[\w-]+\s+small\s*(?=[,{])/m)
    expect(mobileTheme).not.toMatch(/^\s*\.pc-[\w-]+\s+strong\s*(?=[,{])/m)
    // 小程序会把 small/strong/span/del 编译成 view，标签选择器必须改用语义 class
    expect(businessStyles).not.toMatch(/(^|[\s,>+~])(small|strong|span|del)(?=[.:#[\s,>+~{]|$)/m)
  })

  it('供应商图标统一来自 Lucide 且 PNG 均有 Lucide SVG 源', () => {
    for (const name of pngIconNames) expect(svgIconNames).toContain(name)
    for (const name of svgIconNames) {
      const source = readFileSync(resolve(iconRoot, `${name}.svg`), 'utf8')
      expect(source).toContain('lucide-static')
      expect(source).toContain('lucide lucide-')
    }
  })

  it('地图标注走 design-tokens.ts，不写死旧绿', () => {
    expect(mapSource).toContain('designTokens')
    expect(mapSource).toContain('colorBrandPrimary')
    expect(mapSource).toContain('colorInfo')
    expect(mapSource).not.toContain('#17633f')
    expect(mapSource).not.toContain('#2f5bb3')
  })

  it('hover 仅写在 hover 媒体查询里', () => {
    expect(globalStyles).toMatch(/@media \(hover: hover\)/)
    expect(styles).toMatch(/@media \(hover: hover\)/)
  })

  it('异步按钮用 is-loading 转圈，加载态不整页淡出', () => {
    expect(globalStyles).toMatch(/button\.is-loading::before/)
    expect(globalStyles).toMatch(/@keyframes\s+button-spin/)
    expect(globalStyles).toMatch(/button\.is-loading::before\s*\{[^}]*border-radius:\s*50%/)
    expect(globalStyles).toMatch(/button\.is-loading::before\s*\{[^}]*animation:[^;}]*button-spin/)
    expect(globalStyles).toMatch(/button\.is-loading:disabled\s*\{[^}]*opacity:\s*1/)
    expect(template).toMatch(/login-button[^>]*is-loading/)
    expect(template).toContain("is-loading': routeBusy")
    expect(template).toContain("is-loading': routePreviewBusy")
    expect(template).toContain("is-loading': routePublishing")
    expect(template).toContain("is-loading': busyAction === 'batch-accept'")
    expect(template).toContain("is-loading': busyAction === action.key")
    expect(template).toContain("is-loading': busyAction === 'warehouse'")
    expect(template).toContain("is-loading': busyAction === 'checkin'")
    expect(template).toContain("is-loading': busyAction === 'save-route'")
    expect(template).toContain("is-loading': busyAction === 'toggle-product'")
    expect(template).toContain("is-loading': busyAction === 'save-stock'")
    expect(template).toContain("is-loading': busyAction === 'submit-product'")
    expect(template).toContain("is-loading': busyAction === 'mark-handled'")
    expect(template).toContain("is-loading': busyAction === 'courier'")
    expect(template).toContain("is-loading': busyAction === 'handover-out'")
    expect(template).toContain("is-loading': busyAction === 'handover-in'")
    expect(template).toContain("is-loading': busyAction === 'save-driver'")
    expect(template).toContain("is-loading': busyAction === 'reset-password'")
    expect(template).toContain("is-loading': busyAction === 'reset-demo'")
    expect(pageSource).toContain("const busyAction = ref('')")
    expect(pageSource).toContain('async function runBusy')
  })

  it('仓点只填地址并走 geocodeAddress，不展示经纬度', () => {
    expect(template).toContain('仓点地址')
    expect(template).not.toContain('经度')
    expect(template).not.toContain('纬度')
    expect(pageSource).toContain('geocodeAddress')
    expect(pageSource).toContain('createGeocodeProviders')
    expect(globalStyles).toMatch(/\.list-card\s*\{[^}]*padding:\s*var\(--space-card\)/)
  })
})
