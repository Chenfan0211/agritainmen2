<template>
  <view class="store-subpage checkout-page">
    <view class="subpage-hero">
      <button class="hero-back" aria-label="返回" @click="goBack"><UiIcon name="arrow-left" :size="20" /></button>
      <view class="hero-copy"><text class="hero-title">确认订单</text><text class="hero-sub">供应链 · 中台直配到店</text></view>
    </view>

    <view class="page-body">
      <view class="detail-card store-card">
        <view class="store-icon"><UiIcon name="store" :size="20" /></view>
        <view class="store-main">
          <view class="card-title-row"><text class="card-title">{{ store.info.name }}</text><text class="store-tag">农庄店</text></view>
          <text class="card-line">{{ store.info.region }} · {{ store.info.address }}</text>
          <text class="card-line">{{ store.info.phone }} · 营业 {{ store.info.hours }}</text>
        </view>
      </view>

      <view class="detail-card">
        <view class="section-head"><text class="card-title">商品明细</text><text class="section-meta">{{ store.checkoutLines.length }} 款 · {{ store.checkoutCount }} 件</text></view>
        <view class="checkout-lines">
          <view v-for="item in store.checkoutLines" :key="`${item.productId}-${item.skuId}`" class="checkout-line">
            <BusinessImage class="line-image" :src="item.image" mode="aspectFill" />
            <view class="line-main"><text class="line-name">{{ item.name }}</text><text class="line-spec">{{ item.skuName }} × {{ item.quantity }}</text><text class="line-unit">{{ money(item.price) }} / 件</text></view>
            <strong class="line-amount val">{{ money(item.price * item.quantity) }}</strong>
          </view>
        </view>
      </view>

      <view class="detail-card">
        <view class="section-head"><text class="card-title">订单备注</text><text class="section-meta">选填</text></view>
        <textarea v-model="remark" class="remark-input" maxlength="120" placeholder="例如：请周三前送达，到货后电话联系" adjust-position />
      </view>

      <view class="detail-card">
        <view class="section-head"><text class="card-title">支付方式</text><text class="section-meta">仅支持微信支付</text></view>
        <view class="payment-row"><view class="payment-icon"><UiIcon name="credit-card" :size="19" /></view><view class="payment-main"><text>微信支付（演示）</text><small class="meta">提交后 15 分钟内完成支付，支付后进入待接单</small></view><text class="payment-selected">已选</text></view>
      </view>

      <view class="detail-card amount-card">
        <view class="amount-row"><text>商品金额</text><strong class="val">{{ money(store.checkoutTotal) }}</strong></view>
        <view class="amount-row"><text>较零售节省</text><strong class="saving val">-{{ money(store.checkoutSaved) }}</strong></view>
        <view class="amount-row"><text>配送费</text><strong class="val">¥0</strong></view>
        <view class="amount-row total"><text>应付金额</text><strong class="val">{{ money(store.checkoutTotal) }}</strong></view>
      </view>
    </view>

    <view class="submit-bar">
      <view class="submit-total"><small class="meta">应付金额</small><strong class="val">{{ money(store.checkoutTotal) }}</strong></view>
      <button class="submit-button" :disabled="submitting || !store.checkoutCount || store.checkoutHasUnavailable" @click="submit">{{ submitting ? '提交中...' : '提交订单' }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { money } from '@agritainment/shared'
import { BusinessImage } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { useStoreStore } from '../../stores/store'

const store = useStoreStore()
const remark = ref('')
const submitting = ref(false)

onLoad(() => {
  if (!store.checkoutLines.length) uni.redirectTo({ url: '/pages/index/index?view=cart' })
})

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index?view=cart' })
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    const orderId = await store.submitOrder(remark.value, store.checkoutLineKeys)
    if (!orderId) {
      toast(store.checkoutError || '订单提交失败，请重试')
      return
    }
    uni.redirectTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(orderId)}` })
  } finally {
    submitting.value = false
  }
}
</script>
<style scoped lang="scss">
.store-subpage { min-height:100vh;background:var(--farm-bg);padding-bottom:calc(88px + env(safe-area-inset-bottom));box-sizing:border-box; }
.subpage-hero { min-height:132px;padding:calc(14px + env(safe-area-inset-top)) 16px 38px;background:var(--store-gradient);color:var(--store-on-brand);display:flex;align-items:flex-start;gap:12px;position:relative; }
.subpage-hero::after { content:"";position:absolute;left:0;right:0;bottom:0;height:24px;background:var(--farm-bg);border-radius:24px 24px 0 0; }
.hero-back { width:44px;height:44px;border-radius:50%;background:var(--store-glass);border:1px solid var(--store-glass-line);display:grid;place-items:center;padding:0;position:relative;z-index:1; }
.hero-back .ui-icon { filter:brightness(0) invert(1); }
.hero-copy { min-width:0;position:relative;z-index:1;padding-top:2px; }
.hero-title { display:block;font-size:20px;font-weight:800;line-height:1.2; }
.hero-sub { display:block;margin-top:6px;font-size:12px;opacity:.86; }
.page-body { padding:0 16px;display:grid;gap:12px;position:relative;z-index:2;margin-top:-18px; }
.detail-card { background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);padding:14px;box-shadow:var(--mobile-shadow-card); }
.store-card { display:grid;grid-template-columns:44px minmax(0,1fr);gap:11px;align-items:flex-start; }
.store-icon { width:44px;height:44px;border-radius:12px;background:var(--mobile-surface-subtle);color:var(--farm-green);display:grid;place-items:center; }
.store-main { min-width:0; }
.card-title-row { display:flex;align-items:center;gap:8px;min-width:0; }
.card-title { font-size:15px;font-weight:800;color:var(--farm-ink); }
.store-tag { flex:none;padding:2px 7px;border-radius:var(--mobile-radius-pill);background:var(--farm-green-soft);color:var(--farm-green);font-size:12px;font-weight:800; }
.card-line { display:block;margin-top:6px;color:var(--farm-muted);font-size:12px;line-height:1.5; }
.section-head { display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px; }
.section-meta { color:var(--farm-muted);font-size:12px; }
.checkout-lines { display:grid;gap:12px; }
.checkout-line { display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:10px;align-items:center; }
.line-image { width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--mobile-surface-subtle); }
.line-main { min-width:0; }
.line-name { display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;font-weight:800;line-height:1.4; }
.line-spec,.line-unit { display:block;margin-top:4px;color:var(--farm-muted);font-size:12px; }
.line-amount { align-self:end;color:var(--farm-red);font-size:15px;font-weight:800;white-space:nowrap; }
.remark-input { width:100%;min-height:94px;padding:11px 12px;border:1px solid var(--store-line);border-radius:12px;background:var(--mobile-surface-subtle);font-size:13px;line-height:1.6;box-sizing:border-box; }
.payment-row { min-height:58px;padding:10px 12px;border:1.5px solid var(--farm-green);border-radius:12px;background:var(--farm-green-soft);display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;box-sizing:border-box; }
.payment-icon { width:34px;height:34px;border-radius:10px;background:var(--mobile-surface);color:var(--farm-green);display:grid;place-items:center; }
.payment-main text,.payment-main .meta { display:block; }
.payment-main text { font-size:13px;font-weight:800; }
.payment-main .meta { margin-top:3px;color:var(--farm-muted);font-size:12px;line-height:1.4; }
.payment-selected { color:var(--farm-green);font-size:13px;font-weight:800; }
.amount-card { display:grid;gap:11px; }
.amount-row { display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--farm-muted);font-size:13px; }
.amount-row .val { color:var(--farm-ink);font-size:14px;font-weight:800; }
.amount-row .saving { color:var(--farm-green); }
.amount-row.total { padding-top:11px;border-top:1px solid var(--store-line-light);color:var(--farm-ink);font-weight:800; }
.amount-row.total .val { color:var(--farm-red);font-size:19px; }
.submit-bar { position:fixed;left:0;right:0;bottom:0;z-index:20;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--mobile-surface);border-top:1px solid var(--store-line-light);display:flex;align-items:center;gap:14px;box-shadow:var(--store-shadow-bar); }
.submit-total { flex:1;min-width:0; }
.submit-total .meta { display:block;color:var(--farm-muted);font-size:12px; }
.submit-total .val { display:block;margin-top:2px;color:var(--farm-red);font-size:19px;font-weight:800; }
.submit-button { min-width:160px;height:46px;padding:0 20px;border-radius:var(--mobile-radius-pill);background:var(--store-gradient);color:var(--store-on-brand);font-size:15px;font-weight:800;display:inline-flex;align-items:center;justify-content:center; }
@media (min-width:431px) { .store-subpage { max-width:430px;margin:0 auto;box-shadow:var(--store-shadow-hero); } .submit-bar { left:50%;right:auto;width:430px;transform:translateX(-50%); } }
/* #ifdef MP-WEIXIN */
.subpage-hero { padding-top:calc(14px + var(--status-bar-height));padding-right:96px; }
/* #endif */
</style>