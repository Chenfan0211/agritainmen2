// L3 供应商/司机端链路：供应商登录 → 订单筛选/详情/接单 → 司机登录 → 今日线路/线路详情。
// 选择器来源：
// - apps/supplier/src/pages/index/index.wxml:2（.login-page/.role-tabs/.login-button/.order-filter-scroll/.list-card/.order-detail/.order-actions/.driver-today-page/.driver-route-card-main/.driver-route-page/.warehouse-checkin-card）
// - apps/supplier/src/pages/index/index.ts:50（switchLoginRole）、:57（submitLogin）、:75（logout）、:579（openDriverRouteAction）、:1125（orderActions）、:1137（runAction）、:1167（openOrder）
import { count, cur, shot, sleep, tapSel, tapTab, tapText, textOf, waitForSelector, waitForText } from '../harness.mjs'

async function logoutIfNeeded(mp) {
  const page = await cur(mp)
  if ((await count(page, '.tabbar')) === 0) return false
  await tapTab(mp, '我的')
  const logout = await waitForSelector(mp, '.hero-logout', { timeoutMs: 6000 })
  if (!logout) return false
  await tapSel(await cur(mp), '.hero-logout')
  await sleep(1300)
  return !!(await waitForSelector(mp, '.login-page', { timeoutMs: 12000 }))
}

async function login(mp, roleText) {
  const loginPage = await waitForSelector(mp, '.login-page', { timeoutMs: 15000 })
  if (!loginPage) return false
  const roleTapped = await tapText(await cur(mp), '.role-tabs button', roleText)
  await sleep(300)
  await tapSel(await cur(mp), '.login-button')
  await sleep(1300)
  const target = roleText === '司机' ? '.driver-today-page' : '.order-filter-scroll'
  return roleTapped && !!(await waitForSelector(mp, target, { timeoutMs: 15000 }))
}

async function openFirstOrderSheet(mp, orderNo) {
  const page = await cur(mp)
  const tapped = await tapText(page, '.list-card .order-no', orderNo)
  if (!tapped) return null
  await sleep(800)
  return waitForSelector(mp, '.order-detail', { timeoutMs: 8000 })
}

async function findOrderCard(mp, orderNo) {
  const page = await cur(mp)
  const cards = await page.$$('.list-card')
  for (const card of cards) {
    const noEl = await card.$('.order-no')
    if (!noEl) continue
    const no = ((await noEl.text()) || '').replace(/\s+/g, ' ').trim()
    if (no !== orderNo) continue
    const badgeEl = await card.$('.badge')
    const badge = badgeEl ? ((await badgeEl.text()) || '').replace(/\s+/g, ' ').trim() : ''
    return { badge }
  }
  return null
}

async function waitForOrderBadge(mp, orderNo, predicate, { timeoutMs = 12000, pollMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await findOrderCard(mp, orderNo).catch(() => null)
    if (last && predicate(last.badge)) return last
    await sleep(pollMs)
  }
  return last
}

export async function runSupplierL3({ mp, run }) {
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  await logoutIfNeeded(mp)

  const loginPage = await waitForSelector(mp, '.login-page', { timeoutMs: 15000 })
  if (!loginPage) {
    run.check('L3-1', '供应商账号登录并进入订单列表', false, '未进入供应商登录页')
    return
  }

  const supplierLoggedIn = await login(mp, '供应商')
  const ordersPage = supplierLoggedIn ? await waitForSelector(mp, '.order-filter-scroll', { timeoutMs: 12000 }) : null
  const allCount = ordersPage ? await count(ordersPage, '.list-card') : 0
  run.check('L3-1', '供应商账号登录并进入订单列表', !!ordersPage && allCount > 0, `订单卡 ${allCount}`)
  await shot(mp, run.evidenceDir, 'L3-01-supplier-orders')
  if (!ordersPage) return

  const filterTapped = await tapText(ordersPage, '.order-filter-scroll button', '待接单')
  await sleep(1000)
  const filteredPage = await cur(mp)
  const submittedCount = await count(filteredPage, '.list-card')
  const firstNo = await textOf(filteredPage, '.list-card .order-no', 0)
  const firstBadge = await textOf(filteredPage, '.list-card .badge', 0)
  run.check('L3-2', '订单筛选“待接单”后列表收敛且首单状态正确', filterTapped && submittedCount > 0 && submittedCount < allCount && !!firstNo && firstBadge === '待接单', `全部 ${allCount} -> 待接单 ${submittedCount}；首单 ${firstNo}/${firstBadge}`)

  const detailPage = firstNo ? await openFirstOrderSheet(mp, firstNo) : null
  const detailItems = detailPage ? await count(detailPage, '.order-item-line') : 0
  const detailStore = detailPage ? await textOf(detailPage, '.store-line') : null
  run.check('L3-3', '订单详情展示商品明细与收货门店', !!detailPage && detailItems > 0 && !!detailStore, `商品行 ${detailItems} / 门店 ${detailStore}`)
  await shot(mp, run.evidenceDir, 'L3-03-order-detail')
  if (detailPage) {
    await tapSel(await cur(mp), '.order-detail .sheet-head button')
    await sleep(900)
  }

  const acceptTapped = await tapText(await cur(mp), '.order-actions button', '接单')
  await sleep(1000)
  const allTapped = await tapText(await cur(mp), '.order-filter-scroll button', '全部')
  const accepted = await waitForOrderBadge(mp, firstNo, (badge) => badge === '待发货')
  run.check('L3-4', '待接单订单执行接单后状态变为待发货', acceptTapped && allTapped && accepted?.badge === '待发货', `${firstBadge} -> ${accepted?.badge || '未回读'}`)
  await shot(mp, run.evidenceDir, 'L3-04-order-accepted')

  await tapTab(mp, '我的')
  const logoutReady = await waitForSelector(mp, '.hero-logout', { timeoutMs: 8000 })
  if (logoutReady) {
    await tapSel(await cur(mp), '.hero-logout')
    await sleep(1300)
  }
  const driverLoggedIn = await login(mp, '司机')
  const driverPage = driverLoggedIn ? await waitForSelector(mp, '.driver-today-page', { timeoutMs: 12000 }) : null
  const routeCount = driverPage ? await count(driverPage, '.driver-route-card-main') : 0
  const driverName = driverPage ? await textOf(driverPage, '.hero-title') : null
  run.check('L3-5', '司机账号登录并渲染今日配送线路', !!driverPage && routeCount > 0, `司机 ${driverName || '未回读'} / 线路卡 ${routeCount}`)
  await shot(mp, run.evidenceDir, 'L3-05-driver-today')

  const detailLinkTapped = driverPage ? await tapText(driverPage, '.driver-action-secondary', '线路详情') : false
  const routeDetail = detailLinkTapped ? await waitForSelector(mp, '.driver-route-page', { timeoutMs: 10000 }) : null
  const routeTitle = routeDetail ? await textOf(routeDetail, '.secondary-head text') : null
  const warehouseCards = routeDetail ? await count(routeDetail, '.warehouse-checkin-card') : 0
  run.check('L3-6', '司机进入线路详情并可查看仓点/配送节点', detailLinkTapped && !!routeDetail && warehouseCards > 0, `线路 ${routeTitle || '未回读'} / 仓点卡 ${warehouseCards}`)
  await shot(mp, run.evidenceDir, 'L3-06-driver-route-detail')

}