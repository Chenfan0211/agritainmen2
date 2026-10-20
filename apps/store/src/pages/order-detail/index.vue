<template>
  <view class="store-subpage order-detail-page">
    <view class="subpage-hero">
      <button class="hero-back" aria-label="返回" @click="goBack"><UiIcon name="arrow-left" :size="20" /></button>
      <view class="hero-copy"><text class="hero-title">订单详情</text><text class="hero-sub">订单号 {{ orderId || '--' }}</text></view>
      <text v-if="order" class="hero-status">{{ displayStatus }}</text>
    </view>

    <view v-if="order" class="page-body">
      <view v-if="order.status === 'pending-payment'" class="detail-card payment-countdown">
        <text class="countdown-title">等待付款</text>
        <strong class="countdown-time val">{{ countdownText }}</strong>
        <text class="countdown-tip">请在 15 分钟内完成支付，超时订单将自动取消并释放库存</text>
      </view>

      <view v-else-if="fulfillmentStatus" class="detail-card">
        <view class="steps">
          <view v-for="(step, index) in purchaseSteps" :key="step" class="step" :class="{ done: stepIndex >= index, current: step === fulfillmentStatus }"><view class="step-dot">{{ index + 1 }}</view><small class="meta">{{ storeOrderStatusLabel(step as StoreOrderStatus) }}</small></view>
        </view>
      </view>

      <view class="detail-card">
        <view class="section-head"><text class="card-title">商品明细</text><text class="section-meta">{{ order.items.length }} 款 · {{ order.itemCount }} 件</text></view>
        <view class="order-lines">
          <view v-for="item in order.items" :key="`${item.productId}-${item.skuId}`" class="order-line"><BusinessImage class="line-image" :src="item.image" mode="aspectFill" /><view class="line-main"><text class="line-name">{{ item.name }}</text><text class="line-spec">{{ item.skuName }} × {{ item.quantity }}</text><text class="line-unit">{{ money(item.price) }} / 件</text></view><strong class="line-amount val">{{ money(item.price * item.quantity) }}</strong></view>
        </view>
      </view>

      <view class="detail-card amount-card">
        <view class="amount-row"><text>商品合计</text><strong class="val">{{ money(order.amount) }}</strong></view>
        <view v-if="order.saved" class="amount-row"><text>较零售节省</text><strong class="saving val">-{{ money(order.saved) }}</strong></view>
        <view v-if="order.remark" class="amount-row remark-row"><text>订单备注</text><strong class="val">{{ order.remark }}</strong></view>
        <view v-if="order.trackingNo" class="amount-row"><text>运单号</text><strong class="val">{{ order.trackingNo }}</strong></view>
      </view>

      <view class="detail-card">
        <view class="section-head"><text class="card-title">订单进度</text><text class="section-meta">{{ displayStatus }}</text></view>
        <view class="logistics">
          <view v-for="event in order.logistics" :key="`${event.time}-${event.title}`" class="log-event"><view class="log-dot"></view><view><text>{{ event.title }}</text><small class="meta">{{ event.time }} · {{ event.detail }}</small></view></view>
        </view>
      </view>

      <view v-if="afterSaleStatus" class="after-sale-status">售后状态：{{ afterSaleStatus }}</view>
    </view>
    <view v-else class="empty-order"><UiIcon name="package" :size="28" /><text>订单不存在或已失效</text><button @click="goBack">返回</button></view>

    <view v-if="order" class="order-actions">
      <button class="outline-action" @click="repeatOrder">再次采购</button>
      <button v-if="canCancelStoreOrder(order.status)" class="outline-action danger" @click="cancelOrder">取消订单</button>
      <button v-if="order.status === 'delivering'" class="primary-action" @click="confirmReceipt">确认收货</button>
      <button v-if="order.status === 'received' || order.status === 'completed'" class="primary-action" @click="submitAfterSale">发起售后</button>
      <button v-if="order.status === 'pending-payment'" class="primary-action" @click="payOrder">去支付</button>
      <button v-if="canAdvance" class="outline-action" @click="advanceOrder">推进状态（演示）</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { money, readPlatformAfterSaleStatus } from '@agritainment/shared'
import type { PurchaseStatus } from '@agritainment/shared'
import { BusinessImage } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { canCancelStoreOrder, storeOrderStatusLabel } from '../../order-status'
import type { StoreOrderStatus } from '../../stores/store'
import { useStoreStore } from '../../stores/store'

const store = useStoreStore()
const orderId = ref('')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const order = computed(() => store.orders.find((item) => item.id === orderId.value) || null)
const displayStatus = computed(() => order.value ? storeOrderStatusLabel(order.value.status) : '')
const remainingSeconds = computed(() => order.value?.status === 'pending-payment' && order.value.paymentDeadlineAt ? Math.max(0, Math.ceil((Date.parse(order.value.paymentDeadlineAt) - now.value) / 1000)) : 0)
const countdownText = computed(() => `${String(Math.floor(remainingSeconds.value / 60)).padStart(2, '0')}:${String(remainingSeconds.value % 60).padStart(2, '0')}`)
const purchaseSteps: PurchaseStatus[] = ['submitted', 'accepted', 'shipped', 'delivering', 'received', 'completed']
const fulfillmentStatus = computed<PurchaseStatus | null>(() => {
  if (!order.value || order.value.status === 'pending-payment' || order.value.status === 'paid-cancelled' || order.value.status === 'unpaid-cancelled') return null
  return order.value.status
})
const stepIndex = computed(() => fulfillmentStatus.value ? purchaseSteps.indexOf(fulfillmentStatus.value) : -1)
const afterSaleStatus = computed(() => orderId.value ? readPlatformAfterSaleStatus(orderId.value) : null)
const canAdvance = computed(() => !!order.value && ['submitted', 'accepted', 'shipped', 'delivering', 'received'].includes(order.value.status))

onLoad((query) => { orderId.value = typeof query?.id === 'string' ? decodeURIComponent(query.id) : '' })
onShow(() => { void store.sweepExpiredPaymentOrders(); now.value = Date.now() })
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); if (remainingSeconds.value <= 0 && order.value?.status === 'pending-payment') void store.sweepExpiredPaymentOrders() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

function toast(title: string) { uni.showToast({ title, icon: 'none' }) }
function goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.reLaunch({ url: '/pages/index/index?view=orders' }) }
async function payOrder() {
  if (!order.value) return
  uni.showModal({ title: '模拟支付', content: `确认支付 ${money(order.value.amount)}？`, success: async (res) => {
    if (!res.confirm) return
    if (!await store.payOrder(order.value!.id)) return toast(store.checkoutError || '订单当前无法支付')
    now.value = Date.now(); toast('支付成功，订单已进入待接单')
  } })
}
function cancelOrder() {
  if (!order.value) return
  const paid = order.value.status !== 'pending-payment'
  uni.showModal({ title: '取消订单', content: paid ? '确认取消该已支付订单？库存将释放，退款按平台规则处理。' : '确认取消该待付款订单？', success: async (res) => {
    if (!res.confirm) return
    if (!await store.cancelOrder(order.value!.id)) return toast('当前订单状态不可取消')
    toast(paid ? '订单已取消，已标记为已支付取消' : '订单已取消，已标记为未支付取消')
  } })
}
async function confirmReceipt() { if (!order.value || !await store.confirmReceipt(order.value.id)) return toast('当前订单状态无法确认收货'); toast('已确认收货') }
function submitAfterSale() {
  if (!order.value) return
  uni.showModal({ title: '发起售后', content: '确认对这笔进货单发起售后？', success: (res) => {
    if (!res.confirm) return
    if (!store.initiateAfterSale(order.value!.id)) return toast('该订单已发起售后或状态不可售后')
    toast('售后已发起，等待平台处理')
  } })
}
function repeatOrder() {
  if (!order.value || !store.repeatOrder(order.value.id)) return toast(store.checkoutError || '订单商品当前无库存')
  uni.reLaunch({ url: '/pages/index/index?view=cart' })
}
async function advanceOrder() { if (!order.value || !await store.advanceOrder(order.value.id)) return toast('订单已全部完成'); toast('订单状态已推进') }
</script>
<style scoped lang="scss">
.store-subpage { min-height:100vh;background:var(--farm-bg);padding-bottom:calc(92px + env(safe-area-inset-bottom));box-sizing:border-box; }
.subpage-hero { min-height:132px;padding:calc(14px + env(safe-area-inset-top)) 16px 38px;background:var(--store-gradient);color:var(--store-on-brand);display:flex;align-items:flex-start;gap:12px;position:relative; }
.subpage-hero::after { content:"";position:absolute;left:0;right:0;bottom:0;height:24px;background:var(--farm-bg);border-radius:24px 24px 0 0; }
.hero-back { width:44px;height:44px;border-radius:50%;background:var(--store-glass);border:1px solid var(--store-glass-line);display:grid;place-items:center;padding:0;position:relative;z-index:1; }
.hero-back .ui-icon { filter:brightness(0) invert(1); }
.hero-copy { min-width:0;position:relative;z-index:1;padding-top:2px;flex:1; }
.hero-title { display:block;font-size:20px;font-weight:800;line-height:1.2; }
.hero-sub { display:block;margin-top:6px;font-size:12px;opacity:.86;word-break:break-all; }
.hero-status { position:relative;z-index:1;align-self:center;padding:5px 10px;border-radius:var(--mobile-radius-pill);background:var(--store-glass);border:1px solid var(--store-glass-line);font-size:12px;font-weight:800; }
.page-body { padding:0 16px;display:grid;gap:12px;position:relative;z-index:2;margin-top:-18px; }
.detail-card { background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);padding:14px;box-shadow:var(--mobile-shadow-card); }
.payment-countdown { display:grid;justify-items:center;gap:8px;padding-block:20px;text-align:center; }
.countdown-title { color:var(--farm-muted);font-size:13px;font-weight:700; }
.countdown-time { color:var(--farm-red);font-size:34px;font-weight:800;line-height:1;letter-spacing:1px; }
.countdown-tip { max-width:280px;color:var(--farm-muted);font-size:12px;line-height:1.55; }
.section-head { display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px; }
.card-title { font-size:15px;font-weight:800;color:var(--farm-ink); }
.section-meta { color:var(--farm-muted);font-size:12px; }
.steps { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin-top:2px; }
.step { min-width:0;display:grid;justify-items:center;gap:5px;position:relative; }
.step:not(:last-child)::after { content:"";position:absolute;left:calc(50% + 12px);right:calc(-50% + 12px);top:11px;height:2px;background:var(--store-line); }
.step.done:not(:last-child)::after { background:var(--farm-green); }
.step-dot { width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:var(--store-line);color:var(--farm-muted);font-size:12px;font-weight:800;position:relative;z-index:1; }
.step.done .step-dot { background:var(--farm-green);color:var(--store-on-brand); }
.step.current .step-dot { box-shadow:0 0 0 4px var(--farm-green-soft); }
.step .meta { color:var(--farm-muted);font-size:12px;text-align:center;white-space:nowrap; }
.step.done .meta { color:var(--farm-green);font-weight:800; }
.order-lines { display:grid;gap:12px; }
.order-line { display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:10px;align-items:center; }
.line-image { width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--mobile-surface-subtle); }
.line-main { min-width:0; }
.line-name { display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;font-weight:800;line-height:1.4; }
.line-spec,.line-unit { display:block;margin-top:4px;color:var(--farm-muted);font-size:12px; }
.line-amount { align-self:end;color:var(--farm-red);font-size:15px;font-weight:800;white-space:nowrap; }
.amount-card { display:grid;gap:11px; }
.amount-row { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;color:var(--farm-muted);font-size:13px; }
.amount-row .val { color:var(--farm-ink);font-size:14px;font-weight:800;text-align:right; }
.amount-row .saving { color:var(--farm-green); }
.remark-row .val { max-width:68%;line-height:1.5; }
.logistics { display:grid;gap:0; }
.log-event { display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;position:relative;padding-bottom:15px; }
.log-event:not(:last-child)::after { content:"";position:absolute;left:5px;top:12px;bottom:0;width:1px;background:var(--store-line); }
.log-dot { width:11px;height:11px;margin-top:2px;border:2px solid var(--farm-green);border-radius:50%;background:var(--mobile-surface);position:relative;z-index:1; }
.log-event text { display:block;font-size:13px;font-weight:800; }
.log-event .meta { display:block;margin-top:4px;color:var(--farm-muted);font-size:12px;line-height:1.5; }
.after-sale-status { padding:12px 14px;border-radius:12px;background:var(--store-info-soft);color:var(--store-info);font-size:13px;font-weight:800; }
.empty-order { min-height:50vh;display:grid;place-items:center;align-content:center;gap:12px;color:var(--farm-muted); }
.empty-order button { min-height:40px;padding:0 18px;border-radius:var(--mobile-radius-pill);background:var(--farm-green);color:var(--store-on-brand);font-weight:800; }
.order-actions { position:fixed;left:0;right:0;bottom:0;z-index:20;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--mobile-surface);border-top:1px solid var(--store-line-light);display:flex;gap:8px;align-items:center;overflow-x:auto;box-shadow:var(--store-shadow-bar); }
.order-actions button { flex:0 0 auto;min-width:96px;min-height:43px;padding:0 12px;border-radius:var(--mobile-radius-pill);font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap; }
.outline-action { background:var(--mobile-surface);border:1px solid var(--store-line);color:var(--farm-ink); }
.outline-action.danger { color:var(--farm-red); }
.primary-action { background:var(--store-gradient);color:var(--store-on-brand);box-shadow:var(--store-shadow-cart); }
@media (min-width:431px) { .store-subpage { max-width:430px;margin:0 auto;box-shadow:var(--store-shadow-hero); } .order-actions { left:50%;right:auto;width:430px;transform:translateX(-50%); } }
/* #ifdef MP-WEIXIN */
.subpage-hero { padding-top:calc(14px + var(--status-bar-height));padding-right:96px; }
/* #endif */
</style>
