import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
const globalSource = readFileSync(new URL('./styles/global.scss', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
const paginationSource = readFileSync(new URL('./components/PaginationBar.vue', import.meta.url), 'utf8')
const selectSource = readFileSync(new URL('./components/SearchableSelect.vue', import.meta.url), 'utf8')
const datePickerSource = readFileSync(new URL('./components/DatePicker.vue', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('./components/UiIcon.vue', import.meta.url), 'utf8')
const sharedSource = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8')
const tokenCss = readFileSync(new URL('../../../packages/ui/src/design-tokens.css', import.meta.url), 'utf8')
const styleSource = pageSource.slice(pageSource.indexOf('<style'))
const businessStyles = [globalSource, styleSource, paginationSource, selectSource, datePickerSource]
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('admin visual contract', () => {
  it('defines a compact desktop workspace token contract', () => {
    expect(appSource).toContain('design-tokens.css')
    expect(tokenCss).toContain('--color-sidebar-bg: var(--color-card)')
    expect(tokenCss).toContain('--color-sidebar-active-bg: var(--color-brand-primary-soft)')
    for (const token of [
      '--admin-radius-panel: var(--radius-card)',
      '--admin-radius-control: var(--radius-button)',
      '--admin-control-height: 40px',
      '--admin-row-height: 48px',
      '--admin-sidebar-width: 220px',
      '--admin-sidebar-compact-width: 196px',
      '--admin-modal-sm: 400px',
      '--admin-modal-lg: 960px',
      '--admin-drawer-width: 460px',
      '--admin-toolbar-search: 230px',
      '--admin-focus-ring:',
      '--admin-green: var(--color-brand-primary-dark)',
      '--admin-bg: var(--color-bg)'
    ]) expect(globalSource).toContain(token)

    expect(pageSource).toContain(':data-admin-workspace="active"')
    expect(pageSource).toContain('class="content admin-workspace"')
    expect(pageSource).toMatch(/\.content \{ padding: var\(--space-section\); \}/)
    expect(pageSource).not.toMatch(/\.content \{[^}]*max-width:\s*1600px/)
    expect(pageSource).toContain('<view class="top-actions">')
    expect(pageSource).toMatch(/<view class="top-actions">[\s\S]*<view class="operator">/)
    expect(pageSource).not.toContain('class="operator short-sidebar-account"')
  })

  it('keeps business styles on CSS variables without hardcoded hex', () => {
    expect(businessStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(pageSource).toContain('designTokens')
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*background:\s*var\(--(?:admin-panel|color-card|color-sidebar-bg)\)/s)
    expect(pageSource).not.toMatch(/\.sidebar\s*\{[^}]*background:\s*#153e2c/s)
    expect(pageSource).not.toMatch(/\.nav-item\.active\s*\{[^}]*box-shadow:inset 3px 0 0/s)
    expect(pageSource).not.toMatch(/\.kpi-card[^{]*\{[^}]*border-left:\s*3px/s)
    expect(pageSource).toMatch(/\.kpi-icon\s*\{[^}]*background:\s*var\(--color-brand-primary-soft\)/s)
  })

  it('uses the current 17-menu contract and responsive sidebar widths', () => {
    const menuType = sharedSource.match(/export type AdminMenuKey = ([^\n]+)/)?.[1] || ''
    expect(menuType.match(/'[^']+'/g)).toHaveLength(17)
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*width:var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/\.main\s*\{[^}]*var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/@media\(max-width:1280px\)[\s\S]*?--admin-sidebar-width:var\(--admin-sidebar-compact-width\)/)
    expect(pageSource).toContain("{ name: '平台总览'")
    expect(pageSource).toContain("{ name: '用户运营'")
    expect(pageSource).toMatch(/\.nav-item::before \{[^}]*rotate\(45deg\)/)
    expect(pageSource).toMatch(/\.nav-group \{[^}]*font-size: var\(--text-body\)/)
    expect(pageSource).toMatch(/\.nav-item \{[^}]*font-size: var\(--text-subtitle\)/)
    expect(pageSource).toMatch(/\.nav-item \{[^}]*min-height: 40px/)
    expect(pageSource).toMatch(/\.brand-title \{ font-size: 16px/)
    expect(pageSource).not.toContain('size="medium"')
    expect(pageSource).toMatch(/\.filter-bar\{[^}]*gap:12px/)
    expect(pageSource).toMatch(/\.filter-control\{[^}]*height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.filter-bar \.searchable-select\{min-width:160px/)
    expect(pageSource).toMatch(/\.goods-tools \.filter-bar\{flex:1 0 auto/)
  })

  it('uses the same panel and control radii across cards, dialogs and filters', () => {
    expect(pageSource).toContain('border-radius:var(--admin-radius-panel)')
    expect(pageSource).toContain('border-radius:var(--admin-radius-control)')
    expect(pageSource).toContain('.modal,.catalog-product-modal')
    expect(pageSource).toContain('.module-toolbar,.report-filters,.audit-filters,.dict-toolbar')
  })

  it('renders operational graphics without visible emoji', () => {
    const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u
    expect(pageSource).not.toMatch(emojiPattern)
    expect(pageSource).not.toContain('rowEmoji')
    expect(pageSource).toContain('<UiIcon name="calendar-days"')
    expect(pageSource).toContain('class="kpi-icon"')
    expect(pageSource).toContain(':name="policyIcon(group.type)"')
    expect(pageSource).toContain(':name="commissionRuleIcon(rule.targetType)"')
  })

  it('uses a business image fallback for every order product thumbnail', () => {
    expect(pageSource).toContain(':fallback="orderProductFallback(p.name)"')
    expect(pageSource).toContain(':error-fallback="orderProductFallback()"')
    expect(pageSource).toContain(':show-error="false"')
    expect(pageSource).not.toContain('v-else class="row-emoji"')
  })

  it('keeps icon-only controls and pagination keyboard accessible', () => {
    expect(iconSource).toContain('aria-hidden="true"')
    expect(pageSource).toContain('aria-label="打开待办提醒"')
    expect(pageSource).toContain('aria-label="关闭抽屉"')
    expect(paginationSource).toContain(':aria-label="`第 ${p} 页`"')
    expect(paginationSource).toContain(':aria-current="p === page ? \'page\' : undefined"')
    expect(globalSource).toMatch(/button, uni-button, input, select, textarea, \[role="combobox"\] \{\s*outline: none;/)
    expect(globalSource).toMatch(/button:focus-visible[\s\S]*?box-shadow: var\(--admin-focus-ring\)/)
    expect(pageSource).not.toMatch(/\.nav-item:focus-visible/)
    expect(pageSource).not.toContain('outline:3px solid var(--color-focus-ring)')
    expect(paginationSource).toContain('box-shadow: var(--admin-focus-ring)')
    expect(paginationSource).not.toMatch(/outline: 2px solid var\(--color-focus-ring\)/)
  })

  it('keeps loading and empty states readable without expanding table layouts', () => {
    expect(pageSource).toContain('.loading,.empty-state')
    expect(pageSource).toContain('overflow-wrap:anywhere')
    expect(pageSource).toContain('.table-row>text,.table-row>strong')
    expect(paginationSource).toContain('overflow-x: auto')
  })

  it('gives primary save and confirm actions a full touch target', () => {
    expect(pageSource).toContain('.modal-actions .button.primary')
    expect(pageSource).toContain('.drawer-actions .button.primary')
    expect(pageSource).toContain('.work-page-actions .button.primary')
    expect(pageSource).toContain('min-height:44px')
  })

  it('keeps table rows compact and dialog bodies independently scrollable', () => {
    expect(pageSource).toMatch(/\.table-row\s*\{[^}]*min-height:var\(--admin-row-height\)/s)
    expect(pageSource).toMatch(/\.modal,\.catalog-product-modal\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/s)
    expect(pageSource).toMatch(/\.drawer\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/s)
    expect(pageSource).toMatch(/\.drawer-list\s*\{[^}]*overflow-y:auto/s)
  })

  it('hides empty pagination and keeps modal/drawer chrome independently scrollable', () => {
    expect(pageSource).toContain('const pageSize = 10')
    expect(paginationSource).toContain('pageSize: 10')
    expect(paginationSource).toMatch(/v-if="total > 0"/)
    expect(pageSource).not.toMatch(/\.modal,\.catalog-product-modal \{[^}]*overflow-y:auto/)
    expect(pageSource).toMatch(/\.modal,\.catalog-product-modal \{ display:flex; flex-direction:column; overflow:hidden/)
    expect(pageSource).toMatch(/\.drawer-actions\{display:flex;[^}]*flex-wrap:wrap/)
    expect(pageSource).toMatch(/\.c-sku-editor\{[^}]*box-shadow: inset/)
    expect(pageSource).toMatch(/@media\(max-width:768px\)\{\.login-page\{padding:/)
  })

  it('工作页桌面保存栏贴底，订单确认收货在 drawer-list 外', () => {
    expect(pageSource).toMatch(/\.work-page\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/)
    expect(pageSource).toMatch(/\.work-page-actions\{[^}]*flex:\s*none/)
    expect(pageSource).not.toMatch(/\.work-page-actions\{position:sticky/)
    const orderDrawer = pageSource.slice(pageSource.indexOf("v-else-if=\"detail.type === 'order' && selectedOrder\" class=\"drawer-list\""), pageSource.indexOf("v-else-if=\"detail.type === 'afterSale'\""))
    expect(orderDrawer).toContain('class="drawer-actions"')
    expect(orderDrawer).toContain('confirmOrder(selectedOrder)')
    expect(orderDrawer).toMatch(/<\/view>\s*<view v-if="detail.type === 'order'[^"]*" class="drawer-actions"/)
    expect(orderDrawer.slice(0, orderDrawer.indexOf('class="drawer-actions"'))).not.toContain('confirmOrder(selectedOrder)')
  })

  it('工作区大弹窗只让 modal-body 滚动，工具条窄屏可换行', () => {
    expect(pageSource).not.toMatch(/\.work-modal-mask\{[^}]*overflow-y:auto/)
    expect(pageSource).toMatch(/\.work-modal-mask \{[^}]*overflow:\s*hidden/)
    expect(pageSource).toMatch(/\.work-modal-mask \.modal \{[^}]*max-height:\s*100%/)
    expect(pageSource).toMatch(/\.module-toolbar\{[^}]*flex-wrap:\s*wrap/)
    expect(pageSource).toMatch(/@media\(max-width:1180px\)[\s\S]*\.settle-banner\{[^}]*grid-template-columns:\s*1fr 1fr/)
    expect(pageSource).toMatch(/@media\(max-width:1100px\)[\s\S]*\.product-submission-card\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/)
    expect(pageSource).toMatch(/@media\(max-width:768px\)\{\.login-page\{padding:32px 16px\}[\s\S]*\.login-card\{padding:24px 20px/)
    expect(pageSource).toMatch(/\.drawer \{ display:flex; flex-direction:column; overflow:hidden; padding:0/)
  })

  it('uses token sidebar width and a clean login without farm photography', () => {
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*width:var\(--admin-sidebar-width\)/s)
    expect(pageSource).not.toMatch(/\.table-row\s*\{[^}]*min-height:76px/s)
    expect(pageSource).not.toMatch(/\.status\s*\{[^}]*border-radius:999px/s)
    expect(pageSource).not.toContain("url('/static/images/farmhouse.webp')")
    expect(pageSource).toMatch(/\.login-field input\{height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.row-actions button:first-child:not\(\.danger\)\{background:var\(--(?:admin-green-2|color-brand-primary)\)/)
    expect(pageSource).not.toContain('left:184px')
    expect(pageSource).not.toMatch(/\.period-button\.on\{background:var\(--green/)
    expect(pageSource).not.toMatch(/\.filter-chips\.solid button\.active\{background:#1d6b44/)
    expect(pageSource).not.toMatch(/\.source-pill\{[^}]*border-radius:999px/)
    expect(pageSource).not.toContain('主播排行')
    expect(pageSource).not.toMatch(/item\.type === '主播'/)
    expect(pageSource).toContain('{{ promoterTypeLabel(item.type) }}')
    expect(pageSource).not.toMatch(/\.table-head\{min-height:42px\}/)
    expect(pageSource).toMatch(/\.table-head\{min-height:40px\}/)
    expect(pageSource).toMatch(/\.table-row:not\(\.table-head\)>text,\.table-row:not\(\.table-head\)>strong,\.table-row:not\(\.table-head\)>view/)
    expect(pageSource).toMatch(/\.table-head>text,\.table-head>strong,\.table-head>view\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/)
    expect(pageSource).toMatch(/\.product-tag\{[^}]*border-radius:var\(--radius-nav\)/)
    expect(pageSource).toMatch(/class="button danger-button"[^>]*>确认驳回/)
    expect(pageSource).not.toMatch(/class="button danger"/)
    expect(pageSource).toMatch(/\.product-cell strong \{[^}]*-webkit-line-clamp:2/)
    expect(pageSource).not.toMatch(/\.product-cell strong \{[^}]*white-space:nowrap/)
    expect(pageSource).toMatch(/\.switch \{[^}]*border-radius:var\(--radius-nav\)/)
    expect(pageSource).toMatch(/danger-button': dialog === 'supplier-pause' \|\| dialog === 'withdrawal-reject'/)
    expect(pageSource).toMatch(/class="danger" @click="confirmAction\('确认拒绝该售后申请/)
    expect(pageSource).toContain('<AdminUsersPanel />')
    expect(pageSource).toContain('<AdminLeadersPanel />')
    expect(pageSource).toMatch(/\.compact-button\.danger \{[^}]*background:\s*var\(--color-danger-soft\)/)
    expect(pageSource).toMatch(/\.after-evidence-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(72px, 1fr\)\)/)
    expect(pageSource).toMatch(/\.tier-editor-row \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) auto/)
    expect(pageSource).toMatch(/\.c-sku-editor\{[^}]*overflow-x:auto/)
    expect(pageSource).toMatch(/:class="\{ danger: product\.status === 'active' \}"/)
  })

  it('宽表只在内层横滑，供应商操作列可换行且筛选走 token', () => {
    for (const scroll of [
      'supplier-table-scroll',
      'order-table-scroll',
      'farm-table-scroll',
      'product-table-scroll',
      'promoter-table-scroll'
    ]) {
      expect(pageSource).toContain(`class="${scroll}"`)
      expect(pageSource).toMatch(new RegExp(`\\.${scroll}\\{[^}]*overflow-x:auto`))
    }
    expect(pageSource).toMatch(/\.supplier-grid \{ grid-template-columns:[^}]*minmax\(240px, 1\.4fr\)/)
    expect(pageSource).toMatch(/\.supplier-grid \.row-actions\{[^}]*flex-wrap:wrap/)
    expect(pageSource).toMatch(/\.after-grid \.row-actions\{[^}]*flex-wrap:wrap/)
    expect(pageSource).toContain('.fulfill-strip strong.is-wrap{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-all}')
    expect(pageSource).toMatch(/\.filter-control\{[^}]*height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.picker-field\{[^}]*height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.filter-control\{[^}]*background:\s*var\(--color-card\)/)
    expect(pageSource).toMatch(/\.brand-mark \{[^}]*flex:\s*none/)
    expect(pageSource).toMatch(/\.brand-mark \{[^}]*aspect-ratio:\s*1/)
    expect(pageSource).not.toContain('type="date"')
    expect(pageSource).not.toContain('picker mode="date"')
    expect(datePickerSource).toContain('height: var(--admin-control-height)')
    expect(datePickerSource).toContain('<UiIcon name="calendar-days"')
    for (const binding of ['reportFrom', 'reportTo', 'logFrom', 'logTo', 'form.validUntil']) {
      expect(pageSource).toContain(`<DatePicker v-model="${binding}"`)
    }
    expect(pageSource).toContain('批量发货')
    expect(pageSource).toContain('batchShipOrders()')
    expect(selectSource).toContain('height: var(--admin-control-height)')
    expect(pageSource).not.toMatch(/\.row-actions button \{ min-height:30px/)
    expect(pageSource).toMatch(/\.row-actions button \{ min-height:32px/)
    expect(pageSource).toMatch(/\.order-grid\{[^}]*min-width:1080px/)
    expect(pageSource).toMatch(/\.farm-grid\{[^}]*min-width:860px/)
    expect(pageSource).toMatch(/\.unified-product-grid\{[^}]*min-width:860px/)
    expect(pageSource).toMatch(/\.promoter-grid \{[^}]*min-width:900px/)
  })

  it('门店账号、提现、角色和后台账号表只在内层横滑', () => {
    for (const scroll of [
      'account-table-scroll',
      'withdrawal-table-scroll',
      'role-table-scroll',
      'admin-account-table-scroll'
    ]) {
      expect(pageSource).toContain(`class="${scroll}"`)
      expect(pageSource).toMatch(new RegExp(`\\.${scroll}\\{[^}]*overflow-x:auto`))
    }
    expect(pageSource).toMatch(/\.after-grid \.row-actions\{[^}]*flex-wrap:wrap/)
  })

  it('locks overlay sizes and toolbar search to admin density tokens', () => {
    expect(styleSource).toMatch(/\.modal-mask:not\(\.work-modal-mask\) \.modal\{width:var\(--admin-modal-sm\)/)
    expect(styleSource).toMatch(/\.catalog-product-modal\{width:min\(var\(--admin-modal-lg\),92vw\)/)
    expect(styleSource).toMatch(/\.drawer\{width:min\(var\(--admin-drawer-width\),100vw\)/)
    expect(styleSource).toMatch(/\.module-toolbar \.filter-bar \.field\.is-search\{width:var\(--admin-toolbar-search\)/)
    expect(styleSource).toMatch(/\.data-panel>\.filter-bar \.field\.is-search,\.goods-tools \.filter-bar \.field\.is-search\{width:var\(--admin-toolbar-search\)/)
    expect(styleSource).not.toMatch(/\.modal,\.catalog-product-modal \{ width:440px/)
    expect(styleSource).not.toMatch(/\.drawer\{width:min\(440px/)
    expect(styleSource).not.toMatch(/\.modal-actions \{ justify-content: flex-start; \}/)
    expect(styleSource).toMatch(/\.modal-actions\{justify-content:flex-end\}/)
    expect(styleSource).toMatch(/\.row-actions button \{ min-height:32px/)
    expect(styleSource).toMatch(/\.modal-actions \.button\.primary,[\s\S]*min-height: 44px/)
  })

  it('uses form-card chrome for leftover confirm dialogs and shared drawer skeleton', () => {
    const rejectModal = pageSource.slice(
      pageSource.indexOf('v-if="productRejectTarget"'),
      pageSource.indexOf('class="button danger-button" @click="confirmRejectProductSubmission"')
    )
    expect(rejectModal).toContain('class="form-card"')
    expect(rejectModal).toContain('v-model="productRejectReason"')

    const recoveryModal = pageSource.slice(
      pageSource.indexOf("dialog === 'recovery-verify'"),
      pageSource.indexOf("dialog === 'supplier' || dialog === 'supplier-edit'")
    )
    expect(recoveryModal).toContain('class="form-card"')
    expect(recoveryModal).toContain('class="form-card-grid"')

    expect(pageSource).toMatch(/detail\.type === 'todos'[\s\S]*class="drawer-list todo-detail"/)
    expect(pageSource).toMatch(/detail\.type === 'afterSale'[\s\S]*class="detail-hero"/)
    expect(pageSource).toMatch(/detail\.type === 'afterSale'[\s\S]*class="detail-grid"/)
    expect(pageSource).toMatch(/detail\.type === 'auditLog'[\s\S]*class="detail-hero"/)
    expect(pageSource).toMatch(/detail\.type === 'auditLog'[\s\S]*class="detail-grid"/)
  })

  it('applies hover states only on hover-capable pointers', () => {
    expect(styleSource).toMatch(/@media \(hover: hover\) \{[\s\S]*\.table-row:not\(\.table-head\):hover/)
    expect(styleSource).toMatch(/@media \(hover: hover\) \{[\s\S]*\.filter-chips button:hover/)
    expect(styleSource).toMatch(/@media \(hover: hover\) \{[\s\S]*\.period-button:hover/)
    expect(styleSource).toMatch(/@media \(hover: hover\) \{[\s\S]*\.dict-tab:hover/)
    expect(styleSource).toMatch(/\.login-field input\{height:var\(--admin-control-height\)/)
    expect(styleSource).toMatch(/\.login-card\{[^}]*border-radius:var\(--admin-radius-panel\)/)
    expect(styleSource).toMatch(/\.login-button\{min-height:44px/)
  })

  it('uses labeled filter-bar fields for list search and date pickers', () => {
    const listMarkup = pageSource.slice(pageSource.indexOf('active === \'suppliers\''), pageSource.indexOf('v-if="dialog && !workPage"'))
    expect(listMarkup).not.toMatch(/class="search-box"/)
    expect(listMarkup).toContain('class="filter-bar"')
    expect(listMarkup).toContain('class="filter-control"')
    expect(datePickerSource).toContain('<UiIcon name="calendar-days"')
    expect(pageSource).not.toContain('<UiIcon name="clock"')
    expect(pageSource).toContain('v-model="roleKeyword"')
    expect(pageSource).toContain('v-model="accountKeyword"')
    expect(pageSource).toContain('v-model="policyKeyword"')
    expect(pageSource).toContain('v-model="storeAccountKeyword"')
    expect(pageSource).toContain('v-model="storeAccountStatusFilter"')
    expect(pageSource).toContain('v-model="afterStatusFilter"')
    expect(pageSource).toContain('v-model="promoterSettleFilter"')
    expect(pageSource).toContain('v-model="dictStatusFilter"')
    expect(pageSource).toContain('v-model="settlementKeyword"')
    expect(pageSource).toContain('v-model="logResult"')
    expect(listMarkup).not.toContain("@click=\"logResult = 'all'\"")
    expect(styleSource).toMatch(/\.filter-bar \.field>text\{[^}]*color:var\(--admin-muted\)/)
    expect(listMarkup).toMatch(/class="module-toolbar"><view class="filter-bar">[\s\S]*v-model="storeAccountKeyword"[\s\S]*class="toolbar-actions"><button[^>]*@click="openAccountDialog\(\)"/)
  })
})
