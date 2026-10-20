import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexPage = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const operationsPage = readFileSync(resolve(import.meta.dirname, '../operations/index.vue'), 'utf8')
const globalStyle = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8')
const decorativeEmoji = ['🏪', '🏬', '📍', '⭐', '🎯', '🧑‍💼', '🧑‍🍳', '👑', '💰', '🔗', '🎁', '📦']

function templateOf(source: string) {
  return source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
}

describe('用户端商城设计稿视觉契约', () => {

  it('页面样式不引入小程序不支持的 em/small/strong/span/del 标签选择器', () => {
    for (const page of [indexPage, operationsPage]) {
      const styles = page.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''
      expect(styles).not.toMatch(/(?:^|[,{}])\s*(?:[.#]?[\w-]+(?:\s+[>.]?[.#]?[\w-]+)*\s+)?em\s*[,{]/m)
      // 小程序会把 small/strong/span/del 编译成 view，标签选择器必须改用语义 class
      expect(styles).not.toMatch(/(^|[\s,>+~])(small|strong|span|del)(?=[.:#[\s,>+~{]|$)/m)
    }
  })

  it('全局样式不引入小程序不支持的裸 select 标签选择器', () => {
    const globalStyles = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(globalStyles).not.toMatch(/(^|[,{}])\s*select\s*(?=[,{])/m)
  })
  it('用户端 --mobile-* 指向用户端 token，不锁全站主色', () => {
    expect(globalStyle).toContain('packages/ui/src/mobile-theme.scss')
    expect(globalStyle).toContain('design-tokens.css')
    expect(globalStyle).toContain('--mobile-brand: var(--color-user-brand)')
    expect(globalStyle).toContain('--mobile-price: var(--color-user-price)')
    expect(globalStyle).toContain('--mobile-hero-grad: var(--gradient-user)')
    expect(globalStyle).toContain('--mobile-radius-pill: var(--radius-user-pill)')
    expect(globalStyle).toContain('--mobile-wx: var(--color-user-wx)')
    expect(globalStyle).toContain('--mobile-wx-soft: var(--color-user-wx-soft)')
    for (const page of [indexPage, operationsPage]) {
      expect(page).toContain('var(--mobile-brand)')
      expect(page).toContain('var(--mobile-price)')
      expect(page).toContain('var(--mobile-bg)')
    }
  })

  it('页头用品牌渐变和底切口，主按钮满圆', () => {
    expect(indexPage).toMatch(/\.theme-head\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexPage).toMatch(/\.theme-head::after\s*\{[^}]*border-radius:\s*22px 22px 0 0/s)
    expect(indexPage).toMatch(/\.primary-btn\s*\{[^}]*border-radius:\s*var\(--mobile-radius-pill\)/s)
    expect(indexPage).toMatch(/\.primary-btn\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexPage).toMatch(/\.auth-btn\s*\{[^}]*min-height:\s*50px/s)
    expect(indexPage).toMatch(/\.auth-btn\s*\{[^}]*border-radius:\s*var\(--mobile-radius-pill\)/s)
    expect(operationsPage).toMatch(/\.operation-header\.theme-head\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(operationsPage).toMatch(/\.income-hero,\s*\.performance-hero\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
  })

  it('商品、订单、弹层圆角走 token', () => {
    expect(indexPage).toMatch(/\.product-card\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(indexPage).toMatch(/\.order-card\s*\{[^}]*border-radius:\s*16px/s)
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*border-radius:\s*var\(--mobile-radius-sheet\) var\(--mobile-radius-sheet\) 0 0/s)
    expect(operationsPage).toMatch(/\.metric-grid[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(operationsPage).toMatch(/\.list-row[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
  })

  it('主要购买、结算、授权具备可点热区，加购外观跟稿', () => {
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*width:\s*30px[^}]*border-radius:\s*50%/s)
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexPage).toMatch(/\.product-action:disabled/s)
    expect(indexPage).toMatch(/\.primary-btn\s*\{[^}]*min-height:\s*46px/s)
    expect(indexPage).toMatch(/\.cart-page-checkout\s*\.primary-btn\s*\{[^}]*min-height:\s*36px/s)
    expect(operationsPage).toMatch(/\.income-hero button\s*\{[^}]*min-height:\s*44px/s)
  })

  it('375 到 430px 视口保持单列边界且长内容可收缩', () => {
    expect(indexPage).toContain('max-width: 430px')
    expect(indexPage).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(indexPage).toMatch(/\.product-body\s*\{[^}]*min-width:\s*0/s)
    expect(indexPage).toMatch(/\.cart-line-main\s*\{[^}]*min-width:\s*0/s)
    expect(operationsPage).toMatch(/\.operation-page\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(operationsPage).toMatch(/\.order-row\s*\{[^}]*word-break:\s*break-all/s)
  })

  it('分类用横向图片宫格，商品卡按方图+库存+价格脚排列', () => {
    expect(indexPage).not.toContain('class="product-name-row"')
    expect(indexPage).toContain('class="category-grid"')
    expect(indexPage).toContain('class="category-grid-item"')
    expect(indexPage).toContain('class="category-grid-img"')
    expect(indexPage).toContain('class="category-grid-label"')
    expect(indexPage).toContain('productCategoryImage')
    expect(indexPage).not.toContain('class="category-pills"')
    expect(indexPage).not.toContain('class="category-pill"')
    expect(indexPage).not.toMatch(/class="product-body"><view class="tag-row"/)
    expect(indexPage).toMatch(/class="product-body"[\s\S]*库存 \{\{ product\.skus\.reduce/)
    expect(indexPage).not.toMatch(/class="product-body"[\s\S]{0,800}省/)
    expect(indexPage).toMatch(/\.product-body\s*\{[^}]*flex-direction:\s*column/s)
    expect(indexPage).toMatch(/\.product-name\s*\{[^}]*-webkit-line-clamp:\s*2/s)
  })

  it('商城和分类页使用双列等宽网格且商品卡不直接展示起订量', () => {
    expect(indexPage).toContain('class="waterfall-grid"')
    expect(templateOf(indexPage)).not.toContain('waterfall-column')
    expect(indexPage).not.toMatch(/class="product-body"[\s\S]{0,800}起订/)
    expect(indexPage).toContain('起订 {{ minimumOrderQuantity(selectedSku) }} 件 · 当前库存 {{ selectedSku.stock }}')
    expect(indexPage).toMatch(/\.waterfall-grid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s)
    expect(indexPage).toMatch(/\.waterfall-grid\s*\{[^}]*padding:\s*0 16px/s)
    expect(indexPage).not.toMatch(/\.waterfall-grid\s*\{[^}]*padding:\s*0 16px 90px/s)
    expect(indexPage).not.toMatch(/\.compact-feed\s*\{[^}]*padding-bottom:\s*28px/)
  })

  it('为商品、购物车、结算、订单、地址、物流、售后和到店套餐提供视觉验收入口', () => {
    for (const view of ['home', 'category', 'cart', 'orders', 'me']) {
      expect(indexPage).toContain(`data-visual-view="user-${view}"`)
    }
    for (const state of ['detail', 'cart', 'checkout', 'address', 'logistics', 'after-sale', 'package']) {
      expect(indexPage).toContain(`data-visual-state="user-${state}"`)
    }
  })

  it('四个运营视图共享稳定的长文本和金额布局', () => {
    expect(operationsPage).toContain(':data-visual-view="`user-operations-${type}`"')
    for (const type of ['income', 'fans', 'orders', 'performance']) {
      expect(operationsPage).toContain(`data-operation-view="${type}"`)
    }
    expect(operationsPage).toMatch(/\.list-row\s*>\s*\.val\s*\{[^}]*max-width:/s)
    expect(operationsPage).toMatch(/\.metric-grid \.val,[\s\S]*?word-break:\s*break-all/s)
  })

  it('普通用户直接打开运营页时只显示无推广身份空态', () => {
    expect(operationsPage).toContain('v-if="!store.currentDistributor"')
    expect(operationsPage).toContain('data-visual-state="user-operations-no-distributor"')
    expect(operationsPage).toContain('projectDistributorOperations')
    expect(indexPage).toContain('<template v-if="store.currentDistributor">')
    expect(operationsPage).toMatch(/\.no-distributor \.primary-btn\s*\{[^}]*min-height:\s*44px[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
    expect(operationsPage).toMatch(/\.no-distributor \.meta\s*\{[^}]*font-size:\s*12px/s)
  })

  it('弹层无拖条，底部固定区不遮挡内容', () => {
    expect(indexPage).not.toContain('class="sheet-handle"')
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(indexPage).toMatch(/\.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)/s)
    expect(indexPage).toMatch(/\.app-shell\.has-cart-bar \.c-mall,[\s\S]*?\.app-shell\.has-cart-bar \.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)/s)
    expect(indexPage).toMatch(/\.bottom-tabs\s*\{[^}]*background:\s*var\(--mobile-surface\)/s)
    expect(indexPage).toContain('v-if="!productView"')
    expect(indexPage).toMatch(/\.product-view\s*\{[^}]*min-height:\s*100vh/s)
    expect(indexPage).not.toMatch(/\.product-view\s*\{[^}]*--mobile-tab-height/s)
    expect(indexPage).toMatch(/\.product-detail-actions\s*\{[^}]*bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom\)\)/s)
    expect(indexPage).not.toMatch(/\.product-detail-actions\s*\{[^}]*--mobile-tab-height/s)
  })

  it('H5 固定层以可用容器宽度为准，避免可见滚动条引发横向偏移', () => {
    expect(indexPage).toMatch(/@media \(min-width:\s*431px\)[\s\S]*?\.app-shell,[\s\S]*?\.sheet-mask\s*\{[^}]*max-width:\s*430px/s)
    expect(indexPage).not.toContain('width: min(430px, 100vw)')
  })

  it('可见模板使用 UiIcon 或业务图片而不是装饰 Emoji', () => {
    for (const page of [indexPage, operationsPage]) {
      const template = templateOf(page)
      expect(template).toContain('<UiIcon')
      for (const emoji of decorativeEmoji) expect(template).not.toContain(emoji)
    }
  })

  it('登录全屏渐变底卡，首页分类购物车用渐变页头', () => {
    expect(indexPage).toMatch(/class="mall-header theme-head"/)
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*商品分类/)
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*购物车/)
    expect(indexPage).toMatch(/class="page-heading heading-with-back theme-head">[\s\S]*我的订单/)
    expect(indexPage).toMatch(/class="page-back" aria-label="返回我的"/)
    expect(indexPage).toContain('data-visual-view="product"')
    expect(indexPage).toMatch(/class="page-back" aria-label="返回"/)
    expect(indexPage).toContain("sheet === 'detail' ? '选择规格'")
    expect(indexPage).toContain('logout-danger')
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*我的</)
    expect(indexPage).not.toContain('>选购<')
    expect(indexPage).toContain('<UiIcon name="plus"')
    expect(indexPage).toContain('分享商品')
    expect(indexPage).toContain('class="auth-brand"')
    expect(indexPage).toContain('class="auth-wxbadge"')
    expect(indexPage).toContain('name="message-circle"')
    expect(indexPage).toContain('name="door-open"')
    expect(indexPage).toMatch(/\.auth-wxbadge\s*\{[^}]*background:\s*var\(--mobile-wx-soft\)/s)
    expect(indexPage).toMatch(/\.auth-wxbadge\s*\{[^}]*color:\s*var\(--mobile-wx\)/s)
    expect(indexPage).not.toContain('class="pc-login-hero"')
    expect(indexPage).toMatch(/\.auth-page\s*\{[^}]*background:\s*var\(--mobile-login-grad\)/s)
    expect(indexPage).toMatch(/\.gallery\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*0\.82/s)
  })

  it('“我的”页提供一二三级用户分销角色演示切换入口', () => {
    expect(indexPage).toContain('class="role-switch"')
    expect(indexPage).toContain("store.setDemoDistributorLevel('normal')")
    expect(indexPage).toContain("store.setDemoDistributorLevel('level1')")
    expect(indexPage).toContain("store.setDemoDistributorLevel('level2')")
    expect(indexPage).toMatch(/\.role-switch\s*\{[^}]*display:\s*grid/s)
  })

  it('订单和我的页不覆盖底栏占位，运营页窄屏不冲掉胶囊', () => {
    expect(indexPage).not.toMatch(/\.orders-page[\s\S]{0,80}padding-bottom:\s*14px/)
    expect(indexPage).not.toMatch(/\.me-page[\s\S]{0,40}padding-bottom:\s*14px/)
    expect(indexPage).not.toMatch(/\.logout-button\s*\{[^}]*margin:\s*14px 16px 90px/s)
    expect(operationsPage).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.operation-page \{[\s\S]*padding-right: 96px/)
    expect(operationsPage).not.toMatch(/@media \(max-width: 375px\) \{[\s\S]*?\.operation-page \{[\s\S]*?padding-right:\s*14px/)
  })

  it('搜索与资料卡按设计稿 16px 页边', () => {
    expect(indexPage).toMatch(/class="empty-block large pc-empty"[\s\S]*还没有订单/)
    expect(indexPage).toMatch(/\.search-box\s*\{[^}]*margin:\s*12px 16px 0/s)
    expect(indexPage).toMatch(/\.order-card\s*\{[^}]*margin:\s*10px 16px 0/s)
    expect(indexPage).toMatch(/\.profile-panel\s*\{[^}]*margin:\s*12px 16px 0/s)
    expect(indexPage).toMatch(/\.sheet-head \{[^}]*justify-content:\s*center/)
  })

  it('短弹层随内容收缩，不再写死 80vh 高度', () => {
    expect(indexPage).toMatch(/\.sheet-scroll\s*\{[\s\S]*height:\s*auto/)
    expect(indexPage).toMatch(/\.sheet-scroll\s*\{[\s\S]*max-height:\s*calc\(80vh/)
    expect(indexPage).not.toMatch(/\.sheet-scroll\s*\{[^}]*(?<!max-)height:\s*calc\(80vh/)
  })

  it('购物车删除、地址操作和到店套餐在 375px 不再挤成一列', () => {
    expect(indexPage).toMatch(/\.cart-remove\s*\{[^}]*margin-left:\s*auto/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.address-actions \{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/\.package-row\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(indexPage).toMatch(/\.package-actions\s*\{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/\.package-buy-btn\s*\{[^}]*margin-left:\s*auto/)
  })

  it('购物车结算条浮动在 Tab 之上', () => {
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*position:\s*fixed/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*border-radius:\s*18px/s)
    expect(indexPage).toMatch(/\.cart-bar\s*\{[^}]*background:\s*var\(--mobile-brand-deep\)/s)
    expect(indexPage).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*@media \(min-width: 431px\)[\s\S]*\.cart-bar \{ left:50%; right:auto; width:406px; transform:translateX\(-50%\)/)
  })

  it('购物车、确认订单和售后主按钮贴在 sheet-foot', () => {
    const sheetStart = indexPage.indexOf('<view v-if="sheet" class="sheet-mask"')
    const scrollEnd = indexPage.indexOf('</scroll-view>', sheetStart)
    const afterScroll = indexPage.slice(scrollEnd)
    expect(afterScroll).toContain('class="sheet-foot"')
    expect(afterScroll).toContain('去结算')
    expect(afterScroll).toContain('提交订单')
    expect(afterScroll).toContain('提交售后申请')
    expect(afterScroll).toContain('加入购物车')
    expect(indexPage).toMatch(/\.sheet-foot \.primary-btn \{ width: 100%; margin-top: 0; \}/)
    expect(indexPage.slice(sheetStart, scrollEnd)).not.toContain('去结算')
    expect(indexPage.slice(sheetStart, scrollEnd)).not.toContain('@click="submitOrder"')
  })

  it('购物车 Tab 为结算条留空，375 子单操作允许换行', () => {
    expect(indexPage).toMatch(/\.cart-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
    expect(indexPage).toMatch(/\.cart-page\s*\{[^}]*min-height:\s*100vh/s)
    expect(indexPage).toMatch(/\.cart-page-content\s*\{[^}]*flex:\s*1/s)
    expect(indexPage).toMatch(/\.page-content\.cart-page\.cart-page--has-checkout\s*\{[^}]*--mobile-action-bar-height/s)
    expect(indexPage).toMatch(/\.cart-line-main\s*>\s*text\s*\{[^}]*text-overflow:\s*ellipsis/s)
    expect(indexPage).toMatch(/<\/view>\s*<view v-if="store.cart.length" class="cart-checkout cart-page-checkout"/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.waiting-copy \{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.sub-actions \{[^}]*flex-wrap:\s*wrap/)
    expect(indexPage).toMatch(/\.empty-block\.large\s*\{[^}]*min-height:\s*160px/)
    expect(indexPage).toContain('cart-page-checkout')
    expect(indexPage).toContain('cartCategoryAllSelected')
  })

  it('运营页左右 16px，小程序端底部 Tab 与菜单保留安全区', () => {
    expect(operationsPage).toMatch(/\.operation-page\s*\{[^}]*padding:\s*calc\(10px \+ env\(safe-area-inset-top\)\) 16px/)
    expect(operationsPage).toMatch(/class="operation-header theme-head"/)
    expect(indexPage).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.sheet \{ left: 0; right: 0; width: 100%; max-width: none; transform: none; \}/)
    expect(indexPage).toMatch(/\.tab-item\.active \.tab-icon\s*\{[^}]*background:\s*var\(--mobile-brand-soft\)/s)
    expect(indexPage).toMatch(/\.package-banner\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexPage).toMatch(/\.product-view \.product-detail[\s\S]*?padding:\s*0 0 calc\(70px \+ env\(safe-area-inset-bottom\)\)/)
  })

  it('购物车库存、订单完成态、套餐横幅光斑和宫格角标对齐设计稿', () => {
    expect(indexPage).toContain("库存不足或购买数量未达要求")
    expect(indexPage).toContain('剩余库存')
    expect(indexPage).toContain(":class=\"{ 'is-done': order.status === 'received' }\"")
    expect(indexPage).toMatch(/\.order-status\.is-done\s*\{[^}]*color:\s*var\(--color-success\)/s)
    expect(indexPage).toMatch(/\.package-banner::after\s*\{[^}]*width:\s*180px/s)
    expect(indexPage).toMatch(/\.pc-tile-badge\s*\{[^}]*background:\s*var\(--mobile-badge\)/s)
    expect(operationsPage).not.toContain('!important')
    expect(operationsPage).toContain('.fan-row .fan-avatar')
    expect(operationsPage).toContain('.fan-row .bound-tag')
  })
})
