import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { storeOrderFilterKeys, storeOrderStatusLabel } from '../../src/order-status'

const src = resolve(import.meta.dirname, '../../src')
const indexSource = readFileSync(resolve(src, 'pages/index/index.wxml'), 'utf8')
const indexTs = readFileSync(resolve(src, 'pages/index/index.ts'), 'utf8')
const checkoutSource = readFileSync(resolve(src, 'pages/checkout/index.wxml'), 'utf8')
const checkoutTs = readFileSync(resolve(src, 'pages/checkout/index.ts'), 'utf8')
const orderDetailSource = readFileSync(resolve(src, 'pages/order-detail/index.wxml'), 'utf8')
const orderDetailTs = readFileSync(resolve(src, 'pages/order-detail/index.ts'), 'utf8')
const appJson = readFileSync(resolve(src, 'app.json'), 'utf8')

describe('门店订货结算与订单详情页面契约', () => {
  it('商品结算入口使用新页面且不再使用确认下单弹层', () => {
    expect(indexSource).toContain('去结算')
    expect(indexTs).toContain("wx.navigateTo({ url: '/pages/checkout/index' })")
    expect(indexSource).not.toContain("sheet === 'checkout'")
    expect(indexSource).not.toContain("sheet === 'order'")
  })

  it('结算页展示门店、商品、备注、支付和提交订单', () => {
    expect(checkoutSource).toContain('确认订单')
    expect(checkoutSource).toContain('商品明细')
    expect(checkoutSource).toContain('微信支付（演示）')
    expect(checkoutSource).toContain('订单备注')
    expect(checkoutTs).toContain("submitText: '提交订单'")
  })

  it('订单详情页承担待付款倒计时、支付和取消操作', () => {
    expect(orderDetailSource).toContain('countdownText')
    expect(orderDetailSource).toContain('去支付')
    expect(orderDetailSource).toContain('取消订单')
    expect(orderDetailTs).toContain('paid-cancelled')
    expect(orderDetailTs).toContain('unpaid-cancelled')
  })

  it('订单状态使用配送中和待收货口径', () => {
    expect(storeOrderStatusLabel('shipped')).toBe('配送中')
    expect(storeOrderStatusLabel('delivering')).toBe('待收货')
    expect(storeOrderFilterKeys.map((key) => key === 'all' ? '全部' : storeOrderStatusLabel(key))).not.toContain('已发货')
  })

  it('购物车和商品详情数量支持手动输入，商品信息卡已删除', () => {
    expect(indexSource).toContain('class="cart-quantity-input"')
    expect(indexSource).toContain('class="detail-quantity-input"')
    expect(indexSource).not.toContain('class="detail-product-info')
    expect(indexSource).toContain('取消全选')
  })

  it('app.json 注册结算和订单详情页面', () => {
    const app = JSON.parse(appJson) as { pages: string[] }
    expect(app.pages).toEqual(['pages/index/index', 'pages/checkout/index', 'pages/order-detail/index'])
  })
})
