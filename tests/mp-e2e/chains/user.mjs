// L2 用户端链路：测试 OpenID 自动识别一级团长 → 分类/商品详情 → 加购 → 购物车结算/新增地址/提交订单 → 模拟支付 → 我的收入。
// 选择器来源：
// - apps/user/src/pages/index/index.wxml（.c-mall/.role-chip/.product-card/.category-grid-item/.cart-checkout/.orders-page/.order-actions/.operations-grid/.warnrow/.address-form/.sheet-foot）
// - apps/user/src/pages/operations/index.wxml（.operation-page/.income-hero）
import { count, cur, seedStorage, shot, sleep, tapSel, tapText, textOf, waitForRoute, waitForSelector, waitForText } from '../harness.mjs'

async function enterWithOpenId(mp, openid) {
  await seedStorage(mp, { 'agritainment-mock-openid': openid })
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  const home = await waitForSelector(mp, '.c-mall', { timeoutMs: 25000 })
  return { ok: !!home, home, reason: home ? '' : 'OpenID 自动识别后未渲染商城首页' }
}

async function verifyIdentityRole(mp, openid, expectedLabel) {
  const entered = await enterWithOpenId(mp, openid)
  if (!entered.ok) return { ok: false, role: '', operationsVisible: false }
  const home = await waitForSelector(mp, '.c-mall', { timeoutMs: 10000 })
  const role = home ? await textOf(home, '.role-chip') : ''
  const operationsVisible = home ? (await count(home, '.operations-grid')) > 0 : false
  return { ok: !!home && role.includes(expectedLabel) && !operationsVisible, role, operationsVisible }
}

async function tapBottomTab(mp, label) {
  const page = await cur(mp)
  const tapped = await tapText(page, '.bottom-tabs .tab-item', label)
  await sleep(900)
  return tapped
}

async function addFirstOrderableProduct(mp, cartBefore) {
  const home = await waitForSelector(mp, '.c-mall', { timeoutMs: 10000 })
  if (!home) return { ok: false, name: '', price: '', totalAfter: null }
  const total = await count(home, '.product-card')
  let last = { name: '', price: '' }
  for (let index = 0; index < total; index += 1) {
    const current = await cur(mp)
    const cards = await current.$$('.product-card')
    if (!cards[index]) continue
    const nameEl = await cards[index].$('.product-name')
    if (nameEl) await nameEl.tap()
    else await cards[index].tap()
    await sleep(800)
    const detail = await waitForSelector(mp, '.product-view', { timeoutMs: 7000 })
    if (!detail) continue
    last = { name: await textOf(detail, '.pv-name'), price: await textOf(detail, '.pv-meta .val') }
    const addTapped = await tapText(detail, '.product-detail-actions button', '加入购物车')
    await sleep(900)
    const sheetDeadline = Date.now() + 1800
    while (Date.now() < sheetDeadline) {
      if ((await count(await cur(mp), '.sheet-foot .primary-btn')) > 0) {
        await tapText(await cur(mp), '.sheet-foot .primary-btn', '加入购物车')
        await sleep(1000)
        break
      }
      await sleep(200)
    }
    if ((await count(await cur(mp), '.sheet')) > 0) {
      const sheet = await cur(mp)
      const close = await sheet.$('.sheet-head button')
      if (close) await close.tap()
      await sleep(500)
    }
    if ((await count(await cur(mp), '.product-view')) > 0) {
      await tapSel(await cur(mp), '.product-view .page-back')
      await sleep(700)
    }
    const homeAfter = await waitForSelector(mp, '.c-mall', { timeoutMs: 7000 })
    const totalAfter = homeAfter ? await textOf(homeAfter, '.cart-bar-total .val') : null
    if (addTapped && !!totalAfter && totalAfter !== cartBefore) return { ok: true, ...last, totalAfter, index }
  }
  return { ok: false, ...last, totalAfter: null }
}

async function openCartAndCheckout(mp) {
  const tabTapped = await tapBottomTab(mp, '购物车')
  const cart = await waitForSelector(mp, '.cart-page', { timeoutMs: 10000 })
  if (!cart) return { ok: false, tabTapped }
  const lineCount = await count(cart, '.cart-line')
  const checkoutTapped = await tapText(cart, '.cart-checkout button', '结算')
  const checkout = checkoutTapped ? await waitForSelector(mp, '.checkout-content', { timeoutMs: 10000 }) : null
  return { ok: !!checkout, tabTapped, lineCount, checkoutTapped, checkout }
}

async function createAddressAndSubmit(mp) {
  const checkout = await waitForSelector(mp, '.checkout-content', { timeoutMs: 8000 })
  if (!checkout) return { ok: false, reason: '未进入确认订单页' }
  const warn = await checkout.$('.warnrow')
  if (!warn) return { ok: false, reason: '确认订单页未出现收货地址缺口提示' }
  await warn.tap()
  const addressSheet = await waitForSelector(mp, '.address-content', { timeoutMs: 8000 })
  if (!addressSheet) return { ok: false, reason: '未打开收货地址面板' }

  const addTapped = await tapText(await cur(mp), '.sheet-foot button', '新增地址')
  const form = addTapped ? await waitForSelector(mp, '.address-form', { timeoutMs: 8000 }) : null
  if (!form) return { ok: false, reason: '地址表单未渲染', addTapped }
  const inputs = await form.$$('input')
  if (inputs.length < 4) return { ok: false, reason: `地址输入框不足：${inputs.length}` }
  const values = ['E2E用户', '13800000000', '湖南省湘西州', '测试地址 1 号']
  for (let index = 0; index < 4; index += 1) {
    await inputs[index].input(values[index])
    await sleep(180)
  }

  const saved = await tapText(await cur(mp), '.sheet-foot button', '保存地址')
  await sleep(1000)
  let chosen = false
  if (saved) {
    chosen = await tapText(await cur(mp), '.address-row .meta-text', '测试地址')
    if (!chosen && (await count(await cur(mp), '.address-row')) > 0) {
      await tapSel(await cur(mp), '.address-row', 0)
      chosen = true
    }
  }
  const backToCheckout = chosen ? await waitForSelector(mp, '.checkout-content', { timeoutMs: 10000 }) : null
  if (!backToCheckout) return { ok: false, reason: '地址保存或选中失败', saved, chosen }

  const submitted = await tapText(await cur(mp), '.sheet-foot button', '提交订单')
  const orders = submitted ? await waitForSelector(mp, '.orders-page', { timeoutMs: 20000 }) : null
  return { ok: !!orders, saved, chosen, submitted, orders }
}

async function findPayableOrder(mp) {
  const page = await waitForSelector(mp, '.orders-page', { timeoutMs: 10000 })
  if (!page) return null
  const cards = await page.$$('.order-card')
  for (let index = 0; index < cards.length; index += 1) {
    const text = ((await cards[index].text()) || '').replace(/\s+/g, ' ').trim()
    if (!text.includes('模拟支付')) continue
    const id = (text.match(/(?:CO|DEMO-ORD)[A-Z0-9-]+/i) || [])[0] || ''
    return { index, id, status: await textOf(page, '.order-status', index) }
  }
  return null
}

export async function runUserL2({ mp, run }) {
  const identity = await enterWithOpenId(mp, 'mock_openid_demo_level1')
  if (!identity.ok) {
    run.check('L2-1', '一级团长 OpenID 自动识别并进入商城首页', false, identity.reason || '用户端身份识别未完成')
    return
  }

  const home = await waitForSelector(mp, '.c-mall', { timeoutMs: 10000 })
  const productCount = home ? await count(home, '.product-card') : 0
  const roleLabel = home ? await textOf(home, '.role-chip') : null
  const cartBefore = home ? await textOf(home, '.cart-bar-total .val') : null
  run.check('L2-1', '一级团长 OpenID 自动识别并进入商城首页', !!home && productCount > 0 && !!roleLabel && roleLabel.includes('一级团长'), `角色 ${roleLabel || '未回读'} / 商品卡 ${productCount}`)
  await shot(mp, run.evidenceDir, 'L2-01-user-home')
  if (!home || productCount === 0) return

  const categoryTabTapped = await tapBottomTab(mp, '分类')
  const categoryPage = await waitForSelector(mp, '.category-page', { timeoutMs: 10000 })
  const categoryCount = categoryPage ? await count(categoryPage, '.category-grid-item') : 0
  const categoryProducts = categoryPage ? await count(categoryPage, '.product-card') : 0
  run.check('L2-2', '分类页展示品类入口与全部商品', categoryTabTapped && !!categoryPage && categoryCount > 0 && categoryProducts > 0, `品类 ${categoryCount} / 商品 ${categoryProducts}`)
  await shot(mp, run.evidenceDir, 'L2-02-category')

  const homeTabTapped = await tapBottomTab(mp, '首页')
  const productResult = homeTabTapped ? await addFirstOrderableProduct(mp, cartBefore) : { ok: false, name: '', price: '', totalAfter: null }
  run.check('L2-3', '商品详情展示名称、价格与加购入口', !!productResult.name && !!productResult.price, `商品 ${productResult.name || '未回读'} / 价格 ${productResult.price || '未回读'}`)
  run.check('L2-4', '可售商品加入购物车后购物车合计变化', productResult.ok && productResult.totalAfter !== cartBefore, `合计 ${cartBefore || '空'} -> ${productResult.totalAfter || '未回读'}`)
  await shot(mp, run.evidenceDir, 'L2-04-added-to-cart')
  if (!productResult.ok) return

  const cartFlow = await openCartAndCheckout(mp)
  run.check('L2-5', '购物车进入确认订单页', cartFlow.ok, `购物车 ${cartFlow.lineCount ?? 0} 行 / 结算 ${cartFlow.checkoutTapped}`)
  if (!cartFlow.ok) return

  const orderFlow = await createAddressAndSubmit(mp)
  const pending = orderFlow.ok ? await findPayableOrder(mp) : null
  run.check('L2-6', '新增地址后提交订单并生成待支付订单', orderFlow.ok && !!pending, `地址保存 ${orderFlow.saved} / 选中 ${orderFlow.chosen} / 订单 ${pending?.id || '未找到'}`)
  await shot(mp, run.evidenceDir, 'L2-06-submitted-order')
  if (!orderFlow.ok || !pending) return

  const payTapped = await tapText(await cur(mp), '.order-actions button', '模拟支付')
  const paidStatus = payTapped ? await waitForText(mp, '.order-status', (text) => text === '备货中', { timeoutMs: 22000, index: pending.index }) : null
  run.check('L2-7', '模拟支付后订单状态进入备货中', payTapped && paidStatus === '备货中', `${pending.status || '待支付'} -> ${paidStatus || '未回读'}`)
  if (!payTapped || paidStatus !== '备货中') {
    run.blocked(`模拟支付未在 22s 内完成（订单 ${pending.id}，当前 ${paidStatus || '未回读'}）；当前环境可能缺少可用支付 provider`)
  }
  await shot(mp, run.evidenceDir, 'L2-07-paid-order')

  const backToMe = await waitForSelector(mp, '.orders-page .page-back', { timeoutMs: 8000 })
  if (backToMe) await tapSel(await cur(mp), '.orders-page .page-back')
  const mePage = await waitForSelector(mp, '.me-page', { timeoutMs: 10000 })
  const operationsTapped = mePage ? await tapText(mePage, '.operations-grid .pc-tile', '我的收入') : false
  const operationsPage = operationsTapped ? await waitForRoute(mp, 'operations', { timeoutMs: 12000 }) : null
  const incomeHero = operationsPage ? await waitForSelector(mp, '.income-hero', { timeoutMs: 8000 }) : null
  const income = incomeHero ? await textOf(await cur(mp), '.income-hero .val') : null
  run.check('L2-8', '一级团长进入我的收入页并展示可提现金额', operationsTapped && !!operationsPage && !!income, `收入 ${income || '未回读'}`)
  await shot(mp, run.evidenceDir, 'L2-08-operations-income')

  const normal = await verifyIdentityRole(mp, 'mock_openid_demo_normal', '普通用户')
  run.check('L2-9', '普通用户 OpenID 直接进入且不展示团长中心', normal.ok, `角色 ${normal.role || '未回读'} / 团长入口 ${normal.operationsVisible}`)

  const paused = await verifyIdentityRole(mp, 'mock_openid_demo_leader_paused', '普通用户')
  run.check('L2-10', '停用团长 OpenID 降级普通用户且可进入商城', paused.ok, `角色 ${paused.role || '未回读'} / 团长入口 ${paused.operationsVisible}`)
}
