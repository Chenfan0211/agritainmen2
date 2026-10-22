import { money } from '@agritainment/shared'
import { useStoreStore } from '../../stores/store'

const store = useStoreStore()

function initialData() {
  return {
    store: {
      info: store.info,
      checkoutLines: [] as Array<Record<string, unknown>>,
      checkoutCount: 0,
      checkoutTotal: 0,
      checkoutSaved: 0,
      checkoutHasUnavailable: false
    },
    remark: '',
    submitting: false,
    submitText: '提交订单',
    submitDisabled: true,
    totalText: money(0),
    savedText: money(0)
  }
}

Page({
  data: initialData(),
  disposeStore: null as null | (() => void),

  onLoad() {
    if (!store.checkoutLines.length) {
      wx.redirectTo({ url: '/pages/index/index?view=cart' })
      return
    }
    this.disposeStore = store.$subscribe(() => this.syncFromStore())
    this.syncFromStore()
  },

  onUnload() {
    this.disposeStore?.()
    this.disposeStore = null
  },

  syncFromStore() {
    const checkoutLines = store.checkoutLines.map((item) => ({
      ...item,
      key: `${item.productId}-${item.skuId}`,
      priceText: money(item.price),
      subtotalText: money(item.price * item.quantity)
    }))
    this.setData({
      store: {
        info: store.info,
        checkoutLines,
        checkoutCount: store.checkoutCount,
        checkoutTotal: store.checkoutTotal,
        checkoutSaved: store.checkoutSaved,
        checkoutHasUnavailable: store.checkoutHasUnavailable
      },
      totalText: money(store.checkoutTotal),
      savedText: money(store.checkoutSaved),
      submitDisabled: this.data.submitting || !store.checkoutCount || store.checkoutHasUnavailable
    })
  },

  onRemarkInput(event: any) {
    this.setData({ remark: String(event.detail.value || '') })
  },

  async submit() {
    if (this.data.submitting) return
    this.setData({ submitting: true, submitText: '提交中...' })
    try {
      const orderId = await store.submitOrder(this.data.remark, store.checkoutLineKeys)
      if (!orderId) {
        wx.showToast({ title: store.checkoutError || '订单提交失败，请重试', icon: 'none' })
        return
      }
      wx.redirectTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(orderId)}` })
    } finally {
      this.setData({ submitting: false, submitText: '提交订单' })
      this.syncFromStore()
    }
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 })
    else wx.reLaunch({ url: '/pages/index/index?view=cart' })
  }
})
