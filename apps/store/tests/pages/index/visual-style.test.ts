import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = resolve(import.meta.dirname, '../../../src')
const page = readFileSync(resolve(src, 'pages/index/index.wxml'), 'utf8')
const pageTs = readFileSync(resolve(src, 'pages/index/index.ts'), 'utf8')
const styles = readFileSync(resolve(src, 'pages/index/index.wxss'), 'utf8')
const appWxss = readFileSync(resolve(src, 'app.wxss'), 'utf8')
const globalScss = readFileSync(resolve(src, 'styles/global.scss'), 'utf8')
const checkout = readFileSync(resolve(src, 'pages/checkout/index.wxml'), 'utf8')
const orderDetail = readFileSync(resolve(src, 'pages/order-detail/index.wxml'), 'utf8')
const businessImageJson = readFileSync(resolve(src, 'pages/index/index.json'), 'utf8')

function expectRule(selector: string, declarations: RegExp) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  expect(styles).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*${declarations.source}[^}]*\\}`, 's'))
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

describe('门店端原生小程序视觉与结构契约', () => {
  it('Design Token 只通过 CSS 变量参与业务样式', () => {
    // 单源：app.wxss 只 import 全局样式，token 与别名收在 styles/global.scss。
    expect(appWxss.trim()).toBe('@import "./styles/global.wxss";')
    expect(globalScss).toContain('packages/ui/src/design-tokens.css')
    expect(globalScss).toContain('mobile-theme.scss')
    expect(globalScss).toContain('--mobile-brand: var(--color-store-brand)')
    expect(globalScss).toContain('--store-gradient: var(--gradient-store)')
    expect(globalScss).toContain('--store-login-gradient: var(--gradient-store-login)')
    expect(globalScss).toContain('--store-line: var(--color-store-line)')
    expect(styles).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
  })

  it('首页保留关键 DOM class 并使用原生图标和图片组件', () => {
    expect(page).toContain('class="login-page"')
    expect(page).toContain('class="mall-hero"')
    expect(page).toContain('class="waterfall-grid"')
    expect(page).toContain('class="detail-gallery"')
    expect(page).toContain('class="cart-footer"')
    expect(page).toContain('class="tabbar"')
    expect(page).toContain('<ui-icon name="shopping-cart"')
    expect(page).toContain('<business-image class="product-emoji"')
    expect(page).toContain('class="category-grid-img"')
  })

  it('三个页面显式注册 BusinessImage', () => {
    expect(businessImageJson).toContain('"business-image": "/components/BusinessImage/index"')
    expect(readFileSync(resolve(src, 'pages/checkout/index.json'), 'utf8')).toContain('"business-image"')
    expect(readFileSync(resolve(src, 'pages/order-detail/index.json'), 'utf8')).toContain('"business-image"')
  })

  it('首页交互保留商品、购物车、订单、联系和详情行为', () => {
    expect(pageTs).toContain('store.addToCart')
    expect(pageTs).toContain('store.toggleCheckoutSelection')
    expect(readFileSync(resolve(src, 'pages/checkout/index.ts'), 'utf8')).toContain('store.submitOrder')
    expect(pageTs).toContain("wx.navigateTo({ url: '/pages/checkout/index' })")
    expect(pageTs).toContain('wx.navigateTo({ url: `/pages/order-detail/index?id=${encodeURIComponent')
    expect(pageTs).toContain('wx.makePhoneCall')
    expect(pageTs).toContain('wx.setClipboardData')
    expect(pageTs).toContain('selectDetailSku')
    expect(pageTs).toContain('commitCartQuantity')
  })

  it('商品详情与购物车保留关键样式约束', () => {
    expectRule('.detail-gallery-back', /width:\s*44px/)
    expectRule('.detail-gallery-back::before', /inset:\s*4px/)
    expectRule('.cart-row-main', /flex-direction:\s*column/)
    expectRule('.cart-row-bottom', /margin-top:\s*auto/)
    expectRule('.cart-row-bottom \.stepper button', /width:var\(--mobile-control-compact\)/)
    expectRule('.store-metrics', /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
  })

  it('结算与订单详情保留独立页面结构', () => {
    expect(checkout).toContain('class="store-subpage checkout-page"')
    expect(checkout).toContain('class="submit-bar"')
    expect(orderDetail).toContain('class="store-subpage order-detail-page"')
    expect(orderDetail).toContain('class="order-actions"')
    expect(orderDetail).toContain('class="steps"')
    expect(orderDetail).toContain('class="logistics"')
  })

  it('源码已脱离 Vue/uni-app 运行时', () => {
    const files = walk(src).filter((file) => /\.(ts|wxml|wxss|json)$/.test(file))
    const contents = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(contents).not.toContain('@dcloudio')
    expect(contents).not.toContain('pinia')
    expect(contents).not.toContain('uni.')
    expect(contents).not.toMatch(/\.vue\b/)
  })
})
