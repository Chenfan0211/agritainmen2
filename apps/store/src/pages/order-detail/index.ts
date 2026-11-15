import { getApiClientConfig, money, readPlatformAfterSaleStatus } from '@agritainment/shared'
import type { PurchaseStatus } from '@agritainment/shared'
import { canCancelStoreOrder, storeOrderStatusLabel } from '../../order-status'
import type { StoreOrderStatus } from '../../stores/store'
import { useStoreStore } from '../../stores/store'

const store = useStoreStore()
const purchaseSteps: PurchaseStatus[] = ['submitted', 'accepted', 'shipped', 'delivering', 'received', 'completed']

function initialData() {
  return {
    orderId: '',
    orderNo: '',
    order: null as any,
    displayStatus: '',
    countdownText: '00:00',
    fulfillmentStatus: null as PurchaseStatus | null,
    purchaseSteps: [] as Array<Record<string, unknown>>,
    afterSaleStatus: null as string | null,
    canAdvance: false,
    canCancel: false,
    canReceipt: false,
    canAfterSale: false,
    canPay: false
  }
}

Page({
  data: initialData(),
  timer: null as ReturnType<typeof setInterval> | null,
  disposeStore: null as null | (() => void),

  onLoad(query: any) {
    this.setData({ orderId: typeof query?.id === 'string' ? decodeURIComponent(query.id) : '' })
    this.disposeStore = store.$subscribe(() => this.syncFromStore())
    this.syncFromStore()
    if (getApiClientConfig().dataMode === 'api') void (async () => {
      if (!store.auth.isLoggedIn && !await store.restoreApiSession()) return
      await store.loadApiOrderDetail(this.data.orderId)
      this.syncFromStore()
    })()
  },

  onReady() {
    this.timer = setInterval(() => {
      this.syncFromStore()
      const order = this.data.order
      if (order?.status === 'pending-payment' && this.remainingSeconds() <= 0) void store.sweepExpiredPaymentOrders()
    }, 1000)
  },

  onShow() {
    void store.sweepExpiredPaymentOrders()
    this.syncFromStore()
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.disposeStore?.()
    this.disposeStore = null
  },

  remainingSeconds() {
    const order = this.data.order
    if (!order || order.status !== 'pending-payment' || !order.paymentDeadlineAt) return 0
    return Math.max(0, Math.ceil((Date.parse(order.paymentDeadlineAt) - Date.now()) / 1000))
  },

  syncFromStore() {
    const rawOrder = store.orders.find((item) => item.id === this.data.orderId) || null
    if (!rawOrder) {
      this.setData({ order: null, orderNo: this.data.orderId, displayStatus: '', afterSaleStatus: null })
      return
    }
    const displayStatus = storeOrderStatusLabel(rawOrder.status)
    const fulfillmentStatus = rawOrder.status === 'pending-payment' || rawOrder.status === 'paid-cancelled' || rawOrder.status === 'unpaid-cancelled' ? null : rawOrder.status
    const stepIndex = fulfillmentStatus ? purchaseSteps.indexOf(fulfillmentStatus) : -1
    const remaining = this.remainingSeconds()
    this.setData({
      order: {
        ...rawOrder,
        key: rawOrder.id,
        amountText: money(rawOrder.amount),
        savedText: money(rawOrder.saved),
        statusLabel: displayStatus,
        items: rawOrder.items.map((item) => ({
          ...item,
          key: `${item.productId}-${item.skuId}`,
          priceText: money(item.price),
          subtotalText: money(item.price * item.quantity)
        })),
        logistics: rawOrder.logistics.map((event) => ({ ...event, key: `${event.time}-${event.title}` }))
      },
      orderNo: rawOrder.orderNo || rawOrder.id,
      displayStatus,
      fulfillmentStatus,
      purchaseSteps: purchaseSteps.map((step, index) => ({
        key: step,
        label: storeOrderStatusLabel(step as StoreOrderStatus),
        number: index + 1,
        done: stepIndex >= index,
        current: step === fulfillmentStatus
      })),
      countdownText: `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`,
      afterSaleStatus: getApiClientConfig().dataMode === 'api' ? null : this.data.orderId ? readPlatformAfterSaleStatus(this.data.orderId) : null,
      canCancel: getApiClientConfig().dataMode !== 'api' && canCancelStoreOrder(rawOrder.status),
      canReceipt: getApiClientConfig().dataMode !== 'api' && rawOrder.status === 'delivering',
      canAfterSale: getApiClientConfig().dataMode !== 'api' && (rawOrder.status === 'received' || rawOrder.status === 'completed'),
      canPay: getApiClientConfig().dataMode !== 'api' && rawOrder.status === 'pending-payment',
      canAdvance: getApiClientConfig().dataMode !== 'api' && ['submitted', 'accepted', 'shipped', 'delivering', 'received'].includes(rawOrder.status)
    })
  },

  toast(title: string) {
    wx.showToast({ title, icon: 'none' })
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 })
    else wx.reLaunch({ url: '/pages/index/index?view=orders' })
  },

  payOrder() {
    const order = this.data.order
    if (!order) return
    wx.showModal({
      title: '模拟支付',
      content: `确认支付 ${money(order.amount)}？`,
      success: async (res: any) => {
        if (!res.confirm) return
        if (!await store.payOrder(order.id)) return this.toast(store.checkoutError || '订单当前无法支付')
        this.syncFromStore()
        this.toast('支付成功，订单已进入待接单')
      }
    })
  },

  cancelOrder() {
    const order = this.data.order
    if (!order) return
    const paid = order.status !== 'pending-payment'
    wx.showModal({
      title: '取消订单',
      content: paid ? '确认取消该已支付订单？库存将释放，退款按平台规则处理。' : '确认取消该待付款订单？',
      success: async (res: any) => {
        if (!res.confirm) return
        if (!await store.cancelOrder(order.id)) return this.toast('当前订单状态不可取消')
        this.syncFromStore()
        this.toast(paid ? '订单已取消，已标记为已支付取消' : '订单已取消，已标记为未支付取消')
      }
    })
  },

  async confirmReceipt() {
    const order = this.data.order
    if (!order || !await store.confirmReceipt(order.id)) return this.toast('当前订单状态无法确认收货')
    this.syncFromStore()
    this.toast('已确认收货')
  },

  submitAfterSale() {
    const order = this.data.order
    if (!order) return
    wx.showModal({
      title: '发起售后',
      content: '确认对这笔进货单发起售后？',
      success: (res: any) => {
        if (!res.confirm) return
        if (!store.initiateAfterSale(order.id)) return this.toast('该订单已发起售后或状态不可售后')
        this.syncFromStore()
        this.toast('售后已发起，等待平台处理')
      }
    })
  },

  repeatOrder() {
    const order = this.data.order
    if (!order || !store.repeatOrder(order.id)) return this.toast(store.checkoutError || '订单商品当前无库存')
    wx.reLaunch({ url: '/pages/index/index?view=cart' })
  },

  async advanceOrder() {
    const order = this.data.order
    if (!order || !await store.advanceOrder(order.id)) return this.toast('订单已全部完成')
    this.syncFromStore()
    this.toast('订单状态已推进')
  }
})
