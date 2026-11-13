import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexTemplate = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxml'), 'utf8')
const indexStyle = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxss'), 'utf8')
const indexScript = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.ts'), 'utf8')
const operationsTemplate = readFileSync(resolve(import.meta.dirname, '../../../src/pages/operations/index.wxml'), 'utf8')
const operationsStyle = readFileSync(resolve(import.meta.dirname, '../../../src/pages/operations/index.wxss'), 'utf8')
const operationsScript = readFileSync(resolve(import.meta.dirname, '../../../src/pages/operations/index.ts'), 'utf8')
const userChain = readFileSync(resolve(import.meta.dirname, '../../../../../tests/mp-e2e/chains/user.mjs'), 'utf8')
// 单源：app.wxss 只 import 全局样式，token 值来自 packages/ui，端内别名收在 styles/global.scss。
const appWxss = readFileSync(resolve(import.meta.dirname, '../../../src/app.wxss'), 'utf8')
const globalStyle = [
  appWxss,
  readFileSync(resolve(import.meta.dirname, '../../../src/styles/global.scss'), 'utf8'),
  readFileSync(resolve(import.meta.dirname, '../../../../../packages/ui/src/design-tokens.css'), 'utf8'),
  readFileSync(resolve(import.meta.dirname, '../../../../../packages/ui/src/typography.scss'), 'utf8')
].join('\n')
const decorativeEmoji = ['🏪', '🏬', '📍', '⭐', '🎯', '🧑‍💼', '🧑‍🍳', '👑', '💰', '🔗', '🎁', '📦']

/** 原生 WXML 没有 <template> 包裹层，直接返回整份模板。 */
function templateOf(source: string) {
  return source
}

describe('用户端商城设计稿视觉契约', () => {

  it('页面样式不引入小程序不支持的 em/small/strong/span/del 标签选择器', () => {
    for (const styles of [indexStyle, operationsStyle]) {
      expect(styles).not.toMatch(/(?:^|[,{}])\s*(?:[.#]?[\w-]+(?:\s+[>.]?[.#]?[\w-]+)*\s+)?em\s*[,{]/m)
      // 小程序会把 small/strong/span/del 编译成 view，标签选择器必须改用语义 class
      expect(styles).not.toMatch(/(^|[\s,>+~])(small|strong|span|del)(?=[.:#[\s,>+~{]|$)/m)
    }
  })

  it('全局样式不引入小程序不支持的裸 select 标签选择器', () => {
    const globalStyles = globalStyle.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(globalStyles).not.toMatch(/(^|[,{}])\s*select\s*(?=[,{])/m)
  })

  it('用户端 --mobile-* 指向用户端 token，不锁全站主色', () => {
    // 设计 token 单源在 packages/ui，端内 app.wxss 只 import、别名收在 styles/global.scss。
    expect(appWxss.trim()).toBe('@import "./styles/global.wxss";')
    expect(globalStyle).toContain('--color-user-brand: #C8322B')
    expect(globalStyle).toContain('--font-ui:')
    expect(globalStyle).toContain('--mobile-brand: var(--color-user-brand)')
    expect(globalStyle).toContain('--mobile-price: var(--color-user-price)')
    expect(globalStyle).toContain('--mobile-hero-grad: var(--gradient-user)')
    expect(globalStyle).toContain('--mobile-radius-pill: var(--radius-user-pill)')
    expect(globalStyle).toContain('--mobile-wx: var(--color-user-wx)')
    expect(globalStyle).toContain('--mobile-wx-soft: var(--color-user-wx-soft)')
    for (const page of [indexStyle, operationsStyle]) {
      expect(page).toContain('var(--mobile-brand)')
      expect(page).toContain('var(--mobile-price)')
      expect(page).toContain('var(--mobile-bg)')
    }
  })

  it('页头用品牌渐变和底切口，主按钮满圆', () => {
    expect(indexStyle).toMatch(/\.theme-head\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexStyle).toMatch(/\.theme-head::after\s*\{[^}]*border-radius:\s*22px 22px 0 0/s)
    expect(indexStyle).toMatch(/\.primary-btn\s*\{[^}]*border-radius:\s*var\(--mobile-radius-pill\)/s)
    expect(indexStyle).toMatch(/\.primary-btn\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexStyle).toMatch(/\.auth-btn\s*\{[^}]*min-height:\s*50px/s)
    expect(indexStyle).toMatch(/\.auth-btn\s*\{[^}]*border-radius:\s*var\(--mobile-radius-pill\)/s)
    expect(operationsStyle).toMatch(/\.operation-header\.theme-head\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(operationsStyle).toMatch(/\.income-hero,\s*\.performance-hero\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
  })

  it('商品、订单、弹层圆角走 token', () => {
    expect(indexStyle).toMatch(/\.product-card\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(indexStyle).toMatch(/\.order-card\s*\{[^}]*border-radius:\s*16px/s)
    expect(indexStyle).toMatch(/\.sheet\s*\{[^}]*border-radius:\s*var\(--mobile-radius-sheet\) var\(--mobile-radius-sheet\) 0 0/s)
    expect(operationsStyle).toMatch(/\.metric-grid[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(operationsStyle).toMatch(/\.list-row[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
  })

  it('主要购买、结算、授权具备可点热区，加购外观跟稿', () => {
    expect(indexStyle).toMatch(/\.product-action\s*\{[^}]*width:\s*30px[^}]*border-radius:\s*50%/s)
    expect(indexStyle).toMatch(/\.product-action\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexStyle).toMatch(/\.product-action:disabled/s)
    expect(indexStyle).toMatch(/\.primary-btn\s*\{[^}]*min-height:\s*46px/s)
    expect(indexStyle).toMatch(/\.cart-page-checkout\s*\.primary-btn\s*\{[^}]*min-height:\s*36px/s)
    expect(operationsStyle).toMatch(/\.income-hero button\s*\{[^}]*min-height:\s*44px/s)
  })

  it('375 到 430px 视口保持单列边界且长内容可收缩', () => {
    expect(indexStyle).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(indexStyle).toMatch(/\.product-body\s*\{[^}]*min-width:\s*0/s)
    expect(indexStyle).toMatch(/\.cart-line-main\s*\{[^}]*min-width:\s*0/s)
    expect(operationsStyle).toMatch(/\.operation-page\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(operationsStyle).toMatch(/\.order-row\s*\{[^}]*word-break:\s*break-all/s)
  })

  it('分类用横向图片宫格，商品卡按方图+库存+价格脚排列', () => {
    expect(indexTemplate).not.toContain('class="product-name-row"')
    expect(indexTemplate).toContain('class="category-grid"')
    expect(indexTemplate).toContain('class="category-grid-item ')
    expect(indexTemplate).toContain('class="category-grid-img"')
    expect(indexTemplate).toContain('class="category-grid-label"')
    expect(indexScript).toContain('productCategoryImage')
    expect(indexTemplate).not.toContain('class="category-pills"')
    expect(indexTemplate).not.toContain('class="category-pill"')
    expect(indexTemplate).not.toMatch(/class="product-body"><view class="tag-row"/)
    expect(indexTemplate).toMatch(/class="product-body"[\s\S]*\{\{item\.stockText\}\}/)
    expect(indexScript).toContain("stockText: `库存 ${product.skus.reduce((sum, item) => sum + (Number(item.stock) || 0), 0)}`")
    expect(indexTemplate).not.toMatch(/class="product-body"[\s\S]{0,800}省/)
    expect(indexStyle).toMatch(/\.product-body\s*\{[^}]*flex-direction:\s*column/s)
    expect(indexStyle).toMatch(/\.product-name\s*\{[^}]*-webkit-line-clamp:\s*2/s)
  })

  it('商城和分类页使用双列等宽网格且商品卡不直接展示起订量', () => {
    expect(indexTemplate).toContain('class="waterfall-grid"')
    expect(templateOf(indexTemplate)).not.toContain('waterfall-column')
    expect(indexTemplate).not.toMatch(/class="product-body"[\s\S]{0,800}起订/)
    expect(indexTemplate).toContain('起订 {{minOrderText}} 件 · 当前库存 {{selectedSku.stock}}')
    expect(indexStyle).toMatch(/\.waterfall-grid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s)
    expect(indexStyle).toMatch(/\.waterfall-grid\s*\{[^}]*padding:\s*0 16px/s)
    expect(indexStyle).not.toMatch(/\.waterfall-grid\s*\{[^}]*padding:\s*0 16px 90px/s)
    expect(indexStyle).not.toMatch(/\.compact-feed\s*\{[^}]*padding-bottom:\s*28px/)
  })

  it('为商品、购物车、结算、订单、地址、物流、售后和到店套餐提供视觉验收入口', () => {
    for (const view of ['home', 'category', 'cart', 'orders', 'me']) {
      expect(indexTemplate).toContain(`data-visual-view="user-${view}"`)
    }
    for (const state of ['detail', 'cart', 'checkout', 'address', 'logistics', 'after-sale', 'package']) {
      expect(indexTemplate).toContain(`data-visual-state="user-${state}"`)
    }
  })

  it('四个运营视图共享稳定的长文本和金额布局', () => {
    expect(operationsTemplate).toContain('data-visual-view="user-operations-{{type}}"')
    for (const type of ['income', 'fans', 'orders', 'performance']) {
      expect(operationsTemplate).toContain(`data-operation-view="${type}"`)
    }
    expect(operationsStyle).toMatch(/\.list-row\s*>\s*\.val\s*\{[^}]*max-width:/s)
    expect(operationsStyle).toMatch(/\.metric-grid \.val,[\s\S]*?word-break:\s*break-all/s)
  })

  it('普通用户直接打开运营页时只显示无推广身份空态', () => {
    expect(operationsTemplate).toContain('wx:if="{{identityLoading}}"')
    expect(operationsTemplate).toContain('wx:elif="{{!hasDistributor}}"')
    expect(operationsTemplate).toContain('data-visual-state="user-operations-no-distributor"')
    expect(operationsScript).toContain('projectDistributorOperations')
    expect(indexTemplate).toContain('<block wx:if="{{hasDistributor}}">')
    expect(operationsStyle).toMatch(/\.no-distributor \.primary-btn\s*\{[^}]*min-height:\s*44px[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
    expect(operationsStyle).toMatch(/\.no-distributor \.meta\s*\{[^}]*font-size:\s*12px/s)
  })

  it('弹层无拖条，底部固定区不遮挡内容', () => {
    expect(indexTemplate).not.toContain('class="sheet-handle"')
    expect(indexStyle).toMatch(/\.sheet\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(indexStyle).toMatch(/\.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)/s)
    expect(indexStyle).toMatch(/\.app-shell\.has-cart-bar \.c-mall,[\s\S]*?\.app-shell\.has-cart-bar \.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)/s)
    expect(indexStyle).toMatch(/\.bottom-tabs\s*\{[^}]*background:\s*var\(--mobile-surface\)/s)
    expect(indexTemplate).toContain('wx:if="{{!productView}}"')
    expect(indexStyle).toMatch(/\.product-view\s*\{[^}]*min-height:\s*100vh/s)
    expect(indexStyle).not.toMatch(/\.product-view\s*\{[^}]*--mobile-tab-height/s)
    expect(indexStyle).toMatch(/\.product-detail-actions\s*\{[^}]*bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom\)\)/s)
    expect(indexStyle).not.toMatch(/\.product-detail-actions\s*\{[^}]*--mobile-tab-height/s)
  })

  it('小程序端固定层全屏铺满，不再保留 H5 430px 预览框', () => {
    expect(indexStyle).toMatch(/\.app-shell,\s*\.bottom-tabs,\s*\.sheet-mask,\s*\.sheet \{\s*left: 0;\s*right: 0;\s*width: 100%;\s*max-width: none;\s*transform: none;\s*\}/)
    expect(indexStyle).not.toContain('min-width: 431px')
    expect(indexStyle).not.toContain('width: min(430px, 100vw)')
    expect(indexStyle).not.toContain('max-width: 430px')
  })

  it('可见模板使用 UiIcon 或业务图片而不是装饰 Emoji', () => {
    for (const template of [indexTemplate, operationsTemplate]) {
      expect(template).toContain('<ui-icon')
      for (const emoji of decorativeEmoji) expect(template).not.toContain(emoji)
    }
  })

  it('登录全屏渐变底卡，首页分类购物车用渐变页头', () => {
    expect(indexTemplate).toMatch(/class="mall-header theme-head"/)
    expect(indexTemplate).toMatch(/class="page-heading theme-head">[\s\S]*商品分类/)
    expect(indexTemplate).toMatch(/class="page-heading theme-head">[\s\S]*购物车/)
    expect(indexTemplate).toMatch(/class="page-heading heading-with-back theme-head">[\s\S]*我的订单/)
    expect(indexTemplate).toMatch(/class="page-back" aria-label="返回我的"/)
    expect(indexTemplate).toContain('data-visual-view="product"')
    expect(indexTemplate).toMatch(/class="page-back" aria-label="返回"/)
    expect(indexScript).toContain("detail: '选择规格'")
    expect(indexTemplate).toMatch(/class="page-heading theme-head">[\s\S]*我的</)
    expect(indexTemplate).not.toContain('>选购<')
    expect(indexTemplate).toContain('<ui-icon name="plus"')
    expect(indexTemplate).toContain('分享商品')
    expect(indexTemplate).toContain('class="auth-brand"')
    expect(indexTemplate).toContain('class="auth-wxbadge"')
    expect(indexTemplate).toContain('name="message-circle"')
    expect(indexTemplate).toContain('name="door-open"')
    expect(indexStyle).toMatch(/\.auth-wxbadge\s*\{[^}]*background:\s*var\(--mobile-wx-soft\)/s)
    expect(indexStyle).toMatch(/\.auth-wxbadge\s*\{[^}]*color:\s*var\(--mobile-wx\)/s)
    expect(indexTemplate).not.toContain('class="pc-login-hero"')
    expect(indexStyle).toMatch(/\.auth-page\s*\{[^}]*background:\s*var\(--mobile-login-grad\)/s)
    expect(indexStyle).toMatch(/\.gallery\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*0\.82/s)
  })
  it('身份由 OpenID 自动识别，旧登录与切换契约不会回归', () => {
    expect(indexTemplate).toContain('身份资料仅由 OpenID 自动识别')
    expect(indexTemplate).toContain('userAvatarUrl')
    expect(indexTemplate).not.toContain('class="role-switch"')
    expect(indexTemplate).not.toContain('class="auth-roles"')
    expect(indexTemplate).not.toContain('微信一键授权')
    expect(indexScript).not.toContain('store.setDemoDistributorLevel(')
    expect(indexScript).toContain('await store.authenticate()')
    expect(indexScript).toContain('shouldRefreshUserIdentity(store.identityCheckedAt)')
    expect(indexStyle).not.toContain('.role-switch')
    expect(indexStyle).not.toContain('.logout-button')
    expect(userChain).toContain("agritainment-mock-openid")
    expect(userChain).toContain('mock_openid_demo_level1')
    expect(userChain).not.toContain('.auth-roles')
    expect(userChain).not.toContain('.auth-btn')
  })

  it('订单和我的页不覆盖底栏占位，运营页窄屏不冲掉胶囊', () => {
    expect(indexStyle).not.toMatch(/\.orders-page[\s\S]{0,80}padding-bottom:\s*14px/)
    expect(indexStyle).not.toMatch(/\.me-page[\s\S]{0,40}padding-bottom:\s*14px/)
    expect(indexStyle).not.toMatch(/\.logout-button\s*\{[^}]*margin:\s*14px 16px 90px/s)
    expect(operationsStyle).toMatch(/\.operation-page \{\s*padding-top: calc\(10px \+ var\(--status-bar-height\)\);\s*padding-right: 96px;\s*\}/)
    expect(operationsStyle).not.toMatch(/@media \(max-width: 375px\) \{[\s\S]*?\.operation-page \{[\s\S]*?padding-right:\s*14px/)
  })

  it('搜索与资料卡按设计稿 16px 页边', () => {
    expect(indexTemplate).toMatch(/class="empty-block large pc-empty"[\s\S]*还没有订单/)
    expect(indexStyle).toMatch(/\.search-box\s*\{[^}]*margin:\s*12px 16px 0/s)
    expect(indexStyle).toMatch(/\.order-card\s*\{[^}]*margin:\s*10px 16px 0/s)
    expect(indexStyle).toMatch(/\.profile-panel\s*\{[^}]*margin:\s*12px 16px 0/s)
    expect(indexStyle).toMatch(/\.sheet-head \{[^}]*justify-content:\s*center/)
  })

  it('短弹层随内容收缩，不再写死 80vh 高度', () => {
    expect(indexStyle).toMatch(/\.sheet-scroll\s*\{[\s\S]*height:\s*auto/)
    expect(indexStyle).toMatch(/\.sheet-scroll\s*\{[\s\S]*max-height:\s*calc\(80vh/)
    expect(indexStyle).not.toMatch(/\.sheet-scroll\s*\{[^}]*(?<!max-)height:\s*calc\(80vh/)
  })

  it('购物车删除、地址操作和到店套餐在 375px 不再挤成一列', () => {
    expect(indexStyle).toMatch(/\.cart-remove\s*\{[^}]*margin-left:\s*auto/)
    expect(indexStyle).toMatch(/@media \(max-width: 375px\)[\s\S]*\.address-actions \{[^}]*width:\s*100%/)
    expect(indexStyle).toMatch(/\.package-row\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(indexStyle).toMatch(/\.package-actions\s*\{[^}]*width:\s*100%/)
    expect(indexStyle).toMatch(/\.package-buy-btn\s*\{[^}]*margin-left:\s*auto/)
  })

  it('购物车结算条浮动在 Tab 之上', () => {
    expect(indexStyle).toMatch(/\.cart-checkout\s*\{[^}]*position:\s*fixed/s)
    expect(indexStyle).toMatch(/\.cart-checkout\s*\{[^}]*border-radius:\s*18px/s)
    expect(indexStyle).toMatch(/\.cart-bar\s*\{[^}]*background:\s*var\(--mobile-brand-deep\)/s)
    // 小程序端不再保留 H5 居中预览分支，结算条只按左右 12px 定宽收缩。
    expect(indexStyle).toContain('.cart-bar {')
    expect(indexStyle).not.toContain('min-width: 431px')
  })

  it('购物车、确认订单和售后主按钮贴在 sheet-foot', () => {
    const sheetStart = indexTemplate.indexOf('<view wx:if="{{sheet}}" class="sheet-mask"')
    const scrollEnd = indexTemplate.indexOf('</scroll-view>', sheetStart)
    const afterScroll = indexTemplate.slice(scrollEnd)
    expect(sheetStart).toBeGreaterThan(-1)
    expect(afterScroll).toContain('class="sheet-foot"')
    expect(afterScroll).toContain('去结算')
    expect(afterScroll).toContain('提交订单')
    expect(afterScroll).toContain('提交售后申请')
    expect(afterScroll).toContain('加入购物车')
    expect(indexStyle).toMatch(/\.sheet-foot \{[^}]*margin-top: 0/)
    expect(indexTemplate.slice(sheetStart, scrollEnd)).not.toContain('去结算')
    expect(indexTemplate.slice(sheetStart, scrollEnd)).not.toContain('bindtap="onSubmitOrder"')
  })

  it('购物车 Tab 为结算条留空，375 子单操作允许换行', () => {
    expect(indexStyle).toMatch(/\.cart-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
    expect(indexStyle).toMatch(/\.cart-page\s*\{[^}]*min-height:\s*100vh/s)
    expect(indexStyle).toMatch(/\.cart-page-content\s*\{[^}]*flex:\s*1/s)
    expect(indexStyle).toMatch(/\.page-content\.cart-page\.cart-page--has-checkout\s*\{[^}]*--mobile-action-bar-height/s)
    expect(indexStyle).toMatch(/\.cart-line-main\s*>\s*text\s*\{[^}]*text-overflow:\s*ellipsis/s)
    expect(indexTemplate).toMatch(/<\/view>\s*<view wx:if="{{hasCart}}" class="cart-checkout cart-page-checkout"/)
    expect(indexStyle).toMatch(/@media \(max-width: 375px\)[\s\S]*\.waiting-copy \{[^}]*width:\s*100%/)
    expect(indexStyle).toMatch(/@media \(max-width: 375px\)[\s\S]*\.sub-actions \{[^}]*flex-wrap:\s*wrap/)
    expect(indexStyle).toMatch(/\.empty-block\.large\s*\{[^}]*min-height:\s*160px/)
    expect(indexTemplate).toContain('cart-page-checkout')
    expect(indexTemplate).toContain('cartCategoryAllSelected')
  })

  it('运营页左右 16px，小程序端底部 Tab 与菜单保留安全区', () => {
    expect(operationsStyle).toMatch(/\.operation-page\s*\{[^}]*padding:\s*calc\(10px \+ env\(safe-area-inset-top\)\) 16px/)
    expect(operationsTemplate).toMatch(/class="operation-header theme-head"/)
    expect(indexStyle).not.toContain('/* #ifdef')
    expect(indexStyle).toMatch(/\.app-shell,\s*\.bottom-tabs,\s*\.sheet-mask,\s*\.sheet \{[\s\S]*max-width: none;/)
    expect(indexStyle).toMatch(/\.tab-item\.active \.tab-icon\s*\{[^}]*background:\s*var\(--mobile-brand-soft\)/s)
    expect(indexStyle).toMatch(/\.package-banner\s*\{[^}]*background:\s*var\(--mobile-hero-grad\)/s)
    expect(indexStyle).toMatch(/\.product-view \.product-detail[\s\S]*?padding:\s*0 0 calc\(70px \+ env\(safe-area-inset-bottom\)\)/)
  })

  it('既有 Vue 模板指令全部替换为原生小程序指令', () => {
    for (const template of [indexTemplate, operationsTemplate]) {
      expect(template).not.toMatch(/\sv-(if|else|for|model)/)
      expect(template).not.toMatch(/\s@(click|input|error|dragstart|drop)/)
      expect(template).not.toMatch(/\s:[a-z-]+ =?\s*"/)
    }
    expect(indexTemplate).toContain('catchtap="onAddProduct"')
    expect(indexTemplate).toContain('bindinput="onSearchInput"')
  })

  it('购物车库存、订单完成态、套餐横幅光斑和宫格角标对齐设计稿', () => {
    expect(indexTemplate).toContain("库存不足或购买数量未达要求")
    expect(indexScript).toContain('剩余库存')
    expect(indexTemplate).toContain('class="order-status {{order.isDone ? \'is-done\' : \'\'}}"')
    expect(indexStyle).toMatch(/\.order-status\.is-done\s*\{[^}]*color:\s*var\(--color-success\)/s)
    expect(indexStyle).toMatch(/\.package-banner::after\s*\{[^}]*width:\s*180px/s)
    expect(indexStyle).toMatch(/\.pc-tile-badge\s*\{[^}]*background:\s*var\(--mobile-badge\)/s)
    expect(operationsStyle).not.toContain('!important')
    expect(operationsStyle).toContain('.fan-row .fan-avatar')
    expect(operationsStyle).toContain('.fan-row .bound-tag')
  })
})
