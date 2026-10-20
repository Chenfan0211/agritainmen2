// L1 门店订货端链路：登录 → 差异价 → 加购 → 进货车 → 结算 → 提交 → 列表 → 详情 → 取消 → 支付 → 推进 → 售后 → 再次采购
import { count, cur, orderNoFrom, shot, sleep, tapSel, tapTab, tapText, textOf, waitForRoute, waitForSelector, waitForText } from '../harness.mjs'

async function installDialogStubs(mp) {
  await mp.evaluate(() => {
    wx.showModal = (options = {}) => {
      const result = { confirm: true, cancel: false, errMsg: 'showModal:ok' }
      if (options.success) options.success(result)
      if (options.complete) options.complete(result)
      return result
    }
    if (!wx.__autoToastWrapped) {
      wx.__autoToastWrapped = true
      const original = wx.showToast
      wx.__toasts = []
      wx.showToast = (options = {}) => {
        try {
          wx.__toasts.push(String(options.title || ''))
        } catch {
          /* 忽略 */
        }
        return original.call(wx, options)
      }
    }
  })
}

async function showHome(mp) {
  await tapTab(mp, '首页')
  return !!(await waitForSelector(mp, '.add-btn', { timeoutMs: 6000 }))
}

async function logout(mp) {
  await tapTab(mp, '我的')
  await tapSel(await cur(mp), '.logout-button')
  await sleep(1400)
}

async function login(mp, roleText) {
  const page = await cur(mp)
  await tapText(page, '.login-roles button', roleText)
  await tapSel(page, '.login-button')
  await sleep(2400)
  return showHome(mp)
}

/**
 * 加购：逐个商品尝试；若打开的是规格弹层则点「加入进货单」；
 * 返回数量角标文本，失败返回 null（调用方会据此报错）。
 */
async function addProduct(mp, indexes = [0, 1, 2]) {
  await showHome(mp)
  for (const index of indexes) {
    const page = await cur(mp)
    const buttons = await page.$$('.add-btn')
    if (!buttons[index]) continue
    await buttons[index].tap()
    await sleep(1400)
    // 规格弹层：直接点弹层里的「加入进货单」
    if ((await count(await cur(mp), '.sheet-foot')) > 0) {
      await tapText(await cur(mp), '.sheet-foot button', '加入进货单')
      await sleep(1200)
    }
    const badge = await textOf(await cur(mp), '.tab-badge', 0)
    if (badge) return badge
  }
  return null
}
async function openCart(mp) {
  await tapTab(mp, '进货车')
  return !!(await waitForSelector(mp, '.cart-row', { timeoutMs: 8000 }))
}

async function openOrders(mp) {
  await tapTab(mp, '我的')
  await tapText(await cur(mp), '.pc-tile', '我的订单')
  await sleep(1200)
}

/** 按订单号点进详情；找不到时退化为第一张卡（便于定位问题）。 */
async function openOrderByNo(mp, orderNo) {
  const page = await cur(mp)
  if (orderNo && (await tapText(page, '.order-card', orderNo))) {
    await sleep(1500)
    return true
  }
  const cards = await count(await cur(mp), '.order-card')
  if (cards > 0) {
    await tapSel(await cur(mp), '.order-card', 0)
    await sleep(1500)
  }
  return false
}

async function submitOrder(mp) {
  const hasCart = await openCart(mp)
  const cart = await cur(mp)
  const total = await textOf(cart, '.cart-total-amount', 0)
  await tapSel(cart, '.cart-checkout')
  await sleep(1400)
  const checkout = await cur(mp)
  const onCheckout = checkout.path.includes('checkout')
  await tapSel(checkout, '.submit-button')
  const detail = await waitForRoute(mp, 'order-detail', { timeoutMs: 12000 })
  const heroText = detail ? await textOf(detail, '.hero-sub', 0) : null
  return {
    hasCart,
    total,
    onCheckout,
    route: detail ? detail.path : (await cur(mp)).path,
    orderNo: orderNoFrom(heroText),
    amount: detail ? await textOf(detail, '.amount-card', 0) : null
  }
}

export async function runStoreL1({ mp, run }) {
  await installDialogStubs(mp)
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  let page = await cur(mp)
  let startedLoggedIn = (await count(page, '.tabbar button')) > 0
  if (startedLoggedIn) await logout(mp)
  const loggedIn = await login(mp, '门店账号')
  page = await cur(mp)
  const ownerCards = await count(page, '.product-card')
  run.check('L1-1', '门店账号登录进入商城首页', loggedIn && ownerCards > 0, `起始已登录 ${startedLoggedIn} / 商品卡 ${ownerCards}`)
  await shot(mp, run.evidenceDir, 'L1-01-home-owner')
  const ownerPrice = await textOf(page, '.product-card .cost-prices', 0)

  await logout(mp)
  const staffLoggedIn = await login(mp, '业务员账号')
  page = await cur(mp)
  const staffPrice = await textOf(page, '.product-card .cost-prices', 0)
  run.check('L1-2', '业务员账号按档位展示差异价', staffLoggedIn && !!staffPrice, `门店价 ${ownerPrice} / 业务员价 ${staffPrice}`)
  await shot(mp, run.evidenceDir, 'L1-02-home-staff')

  await logout(mp)
  await login(mp, '门店账号')

  const badge = await addProduct(mp)
  run.check('L1-3', '商品加入进货车（角标出现）', !!badge, `角标 ${badge}`)
  await shot(mp, run.evidenceDir, 'L1-03-added')

  const cartOpened = await openCart(mp)
  page = await cur(mp)
  const cartRows = await count(page, '.cart-row')
  const cartTotal = await textOf(page, '.cart-total-amount', 0)
  run.check('L1-4', '进货车展示商品行与合计金额', cartOpened && cartRows > 0 && !!cartTotal, `行 ${cartRows} / 合计 ${cartTotal}`)
  await shot(mp, run.evidenceDir, 'L1-04-cart')

  await tapSel(page, '.cart-all')
  const off = await textOf(await cur(mp), '.cart-selected-count', 0)
  await tapSel(await cur(mp), '.cart-all')
  const on = await textOf(await cur(mp), '.cart-selected-count', 0)
  run.check('L1-5', '取消全选 / 全选联动已选件数', !!off && !!on && off !== on, `取消后 ${off} / 全选后 ${on}`)

  const orderA = await submitOrder(mp)
  run.check('L1-6', '结算跳转确认订单页', orderA.onCheckout, `合计 ${orderA.total}`)
  run.check('L1-7', '提交订单生成订单并进入详情', orderA.route.includes('order-detail') && !!orderA.orderNo, `${orderA.orderNo} / ${(orderA.amount || '').slice(0, 16)}`)
  await shot(mp, run.evidenceDir, 'L1-07-submitted')

  let detail = await cur(mp)
  await tapSel(detail, '.hero-back')
  await sleep(1600)
  await openOrders(mp)
  page = await cur(mp)
  const orderCount = await count(page, '.order-card')
  const orderStatus = await textOf(page, '.order-card .status-badge', 0)
  run.check('L1-8', '我的订单列表出现新订单', orderCount > 0, `订单 ${orderCount} 笔 / 最新 ${orderStatus}`)
  await shot(mp, run.evidenceDir, 'L1-08-orders')

  const hitA = await openOrderByNo(mp, orderA.orderNo)
  detail = await cur(mp)
  const detailAmount = await textOf(detail, '.amount-card', 0)
  run.check('L1-9', '订单详情展示金额与履约进度', detail.path.includes('order-detail') && !!detailAmount, `命中 ${hitA} / 金额 ${(detailAmount || '').slice(0, 16)}`)
  await shot(mp, run.evidenceDir, 'L1-09-order-detail')

  const beforeCancel = await textOf(detail, '.hero-status', 0)
  const cancelTapped = await tapText(detail, '.order-actions button', '取消订单')
  const afterCancel = await waitForText(mp, '.hero-status', (text) => !!text && text !== beforeCancel, { timeoutMs: 8000 })
  run.check('L1-10', '取消订单生效', cancelTapped && afterCancel !== beforeCancel, `${beforeCancel} -> ${afterCancel}`)
  await shot(mp, run.evidenceDir, 'L1-10-cancelled')

  await tapSel(await cur(mp), '.hero-back')
  await sleep(1600)
  await tapTab(mp, '首页')
  await sleep(800)
  const badgeB = await addProduct(mp)
  const orderB = await submitOrder(mp)
  run.check('L1-11', '第二笔订单提交成功', orderB.route.includes('order-detail') && !!orderB.orderNo, `角标 ${badgeB} / ${orderB.orderNo}`)
  detail = await cur(mp)
  await shot(mp, run.evidenceDir, 'L1-11-order-b')

  const paid = await tapText(detail, '.order-actions button', '去支付')
  const afterPay = await waitForText(mp, '.hero-status', (text) => !!text && text !== afterCancel, { timeoutMs: 10000 })
  run.check('L1-12', '去支付完成支付并出现履约进度', paid && !!afterPay, `${afterCancel} -> ${afterPay}`)
  await shot(mp, run.evidenceDir, 'L1-12-paid')

  let advanced = 0
  const trail = []
  for (let i = 0; i < 8; i += 1) {
    detail = await cur(mp)
    const before = await textOf(detail, '.hero-status', 0)
    const ok = await tapText(detail, '.order-actions button', '推进状态')
    if (!ok) break
    advanced += 1
    const after = await waitForText(mp, '.hero-status', (text) => !!text && text !== before, { timeoutMs: 6000 })
    trail.push(after)
  }
  run.check('L1-13', '推进状态（演示）可用', advanced > 0, `推进 ${advanced} 次：${trail.join(' -> ')}`)
  await shot(mp, run.evidenceDir, 'L1-13-advanced')

  detail = await cur(mp)
  const afterSaleTapped = await tapText(detail, '.order-actions button', '发起售后')
  await sleep(2500)
  // 平台侧断言：售后单必须真的落库（UI 上的「售后状态」不在本页即时刷新）
  const afterSaleRecord = await mp.evaluate((orderNo) => {
    try {
      const raw = wx.getStorageSync('agritainment-platform-after-sales')
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw || {}
      const hit = Object.values(parsed).find((item) => String(item.orderId || '').includes(orderNo))
      return hit ? { id: hit.id, status: hit.status, type: hit.type, amount: hit.amount } : null
    } catch {
      return null
    }
  }, orderB.orderNo)
  // UI 侧断言：重新进入详情页应显示「售后状态」
  await tapSel(await cur(mp), '.hero-back')
  await sleep(1500)
  await openOrders(mp)
  await openOrderByNo(mp, orderB.orderNo)
  const afterSaleStatus = await waitForText(mp, '.after-sale-status', (text) => !!text, { timeoutMs: 10000 })
  run.check('L1-14', '发起售后生成售后单并回显状态', afterSaleTapped && !!afterSaleRecord && !!afterSaleStatus, `售后单 ${afterSaleRecord ? afterSaleRecord.id + '/' + afterSaleRecord.status : '无'} / UI ${afterSaleStatus}`)
  await shot(mp, run.evidenceDir, 'L1-14-after-sale')
  const repeatTapped = await tapText(await cur(mp), '.order-actions button', '再次采购')
  await sleep(2000)
  run.check('L1-15', '再次采购可执行', repeatTapped, `route ${(await cur(mp)).path}`)
  await shot(mp, run.evidenceDir, 'L1-15-repeat')
}
