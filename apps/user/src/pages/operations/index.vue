<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { readCDistributorProfiles, readCOrders, readUserBindings } from '@agritainment/shared'
import UiIcon from '../../components/UiIcon.vue'
import { projectDistributorOperations } from '../../services/distributor-operations'
import { useUserStore } from '../../stores/user'

type OperationType = 'income' | 'fans' | 'orders' | 'performance'

const store = useUserStore()
const type = ref<OperationType>('income')
onLoad((query) => {
  if (['income', 'fans', 'orders', 'performance'].includes(query?.type || '')) type.value = query!.type as OperationType
})

const title = computed(() => ({ income: '我的收入', fans: '我的下级用户', orders: '团队订单', performance: '团队业绩' })[type.value])
const data = computed(() => projectDistributorOperations({
  promoterId: store.currentDistributor?.promoterId || '',
  orders: Object.values(readCOrders() || {}),
  bindings: readUserBindings() || {},
  profiles: readCDistributorProfiles() || {}
}))
const settledIncome = computed(() => store.myCommissionRecords.filter((item) => item.status === 'available' || item.status === 'withdrawn').reduce((sum, item) => sum + item.amount, 0))
const withdrawnIncome = computed(() => store.myCommissionRecords.filter((item) => item.status === 'withdrawn').reduce((sum, item) => sum + item.amount, 0))
const formatDate = (value?: string) => value ? value.replace('T', ' ').slice(0, 16) : '绑定时间未记录'
const orderStatus = (value: string) => ({ paid: '备货中', shipped: '配送中', received: '已完成', partially_shipped: '部分发货', partially_received: '部分完成', partially_after_sale: '部分售后' }[value] || value)

function back() { uni.navigateBack() }
function withdraw() {
  void store.withdrawCommission('微信提现').then((result) => uni.showToast({ title: result === 'pending' ? '提现申请已提交' : result === 'duplicate' ? '已有申请处理中' : '暂无可提现收入', icon: 'none' }))
}
</script>

<template>
  <view class="operation-page" :data-visual-view="`user-operations-${type}`">
    <view class="operation-header theme-head"><button class="page-back" aria-label="返回" @click="back"><UiIcon name="arrow-left" :size="21" /></button><text>{{ title }}</text><view></view></view>

    <view v-if="!store.currentDistributor" class="empty no-distributor pc-empty" data-visual-state="user-operations-no-distributor"><view class="pc-state-icon"><UiIcon name="shield-check" :size="28" /></view><text>当前身份暂无推广数据</text><small class="meta">成为一级/二级团长后可查看收入、下级用户和团队业绩</small><button class="primary-btn" @click="back">返回个人中心</button></view>

    <template v-else>
    <template v-if="type === 'income'">
      <view class="income-hero" data-operation-view="income"><small class="meta">可提现金额（元）</small><strong class="val">{{ store.availableCommission.toFixed(2) }}</strong><button :disabled="store.availableCommission <= 0" @click="withdraw">提现</button></view>
      <view class="metric-grid"><view><small class="meta">累计收入</small><strong class="val">¥{{ (settledIncome + store.pendingCommission).toFixed(2) }}</strong></view><view><small class="meta">已结算</small><strong class="val">¥{{ settledIncome.toFixed(2) }}</strong></view><view><small class="meta">待结算</small><strong class="val">¥{{ store.pendingCommission.toFixed(2) }}</strong></view><view><small class="meta">已提现</small><strong class="val">¥{{ withdrawnIncome.toFixed(2) }}</strong></view></view>
      <view class="section-title">收入明细</view>
      <view v-if="!store.myCommissionRecords.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="badge-dollar-sign" :size="26" /></view><text>暂无收入记录</text></view>
      <view v-for="record in store.myCommissionRecords" :key="record.id" class="list-row"><view><text>{{ record.beneficiaryLevel === 'level1' ? '一级团长分佣' : '二级团长分佣' }}</text><small class="meta">{{ formatDate(record.createdAt) }} · {{ record.status === 'available' ? '可提现' : record.status === 'pending' ? '待结算' : record.status === 'withdrawn' ? '已提现' : '已冲正' }}</small></view><strong class="val">¥{{ record.amount.toFixed(2) }}</strong></view>
    </template>

    <template v-else-if="type === 'fans'">
      <view class="summary-line" data-operation-view="fans"><view><strong class="val">{{ data.directFans.length }}</strong><small class="meta">直属用户</small></view><view><strong class="val">{{ data.teamPromoterIds.length }}</strong><small class="meta">下级团长</small></view></view>
      <view v-if="!data.directFans.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="user-round-check" :size="26" /></view><text>暂无已绑定下级用户</text></view>
      <view v-for="fan in data.directFans" :key="fan.userId" class="fan-row"><view class="fan-avatar">{{ fan.userId.slice(-1) }}</view><view><text>用户 {{ fan.userId }}</text><small class="meta">{{ formatDate(fan.boundAt) }}</small></view><text class="bound-tag">已绑定</text></view>
    </template>

    <template v-else-if="type === 'orders'">
      <view class="summary-line" data-operation-view="orders"><view><strong class="val">{{ data.personalOrders.length }}</strong><small class="meta">个人订单</small></view><view><strong class="val">{{ data.teamOrders.length }}</strong><small class="meta">团队订单</small></view></view>
      <view v-if="!data.teamOrders.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>暂无有效团队订单</text></view>
      <view v-for="order in data.teamOrders" :key="order.id" class="order-row"><view class="row-head"><text>{{ order.id }}</text><text>{{ orderStatus(order.status) }}</text></view><small class="meta">{{ formatDate(order.createdAt) }} · 推广链 {{ order.distributorChain?.join(' → ') }}</small><view class="row-foot"><text>有效业绩</text><strong class="val">¥{{ order.effectiveAmount.toFixed(2) }}</strong></view></view>
    </template>

    <template v-else>
      <view class="performance-hero" data-operation-view="performance"><small class="meta">累计团队业绩（元）</small><strong class="val">{{ data.teamPerformance.toFixed(2) }}</strong><view><text>{{ data.teamOrders.length }} 笔有效订单</text><text>{{ data.teamPromoterIds.length }} 名下级团长</text></view></view>
      <view class="metric-grid performance-grid"><view><small class="meta">个人业绩</small><strong class="val">¥{{ data.personalPerformance.toFixed(2) }}</strong></view><view><small class="meta">团队业绩</small><strong class="val">¥{{ data.teamPerformance.toFixed(2) }}</strong></view></view>
      <view class="section-title">业绩订单</view>
      <view v-if="!data.teamOrders.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="chart-no-axes-combined" :size="26" /></view><text>暂无团队业绩</text></view>
      <view v-for="order in data.teamOrders" :key="order.id" class="list-row"><view><text>{{ order.id }}</text><small class="meta">{{ formatDate(order.createdAt) }}</small></view><strong class="val">¥{{ order.effectiveAmount.toFixed(2) }}</strong></view>
    </template>
    </template>
  </view>
</template>

<style lang="scss">
.operation-page {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  padding: calc(10px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--mobile-bg);
  color: var(--mobile-text);
}

.operation-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  min-width: 0;
  align-items: center;
  min-height: 48px;
}

.operation-header.theme-head {
  position: relative;
  margin: calc(-10px - env(safe-area-inset-top)) -16px 0;
  padding: calc(10px + env(safe-area-inset-top)) 16px 28px;
  background: var(--mobile-hero-grad);
  color: var(--color-on-brand);
}

.operation-header.theme-head::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 18px;
  border-radius: 22px 22px 0 0;
  background: var(--mobile-bg);
}

.operation-header.theme-head text {
  color: var(--color-on-brand);
}

.page-back {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.operation-header text {
  overflow: hidden;
  text-align: center;
  font-size: 17px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.income-hero,
.performance-hero {
  margin-top: 16px;
  padding: 16px;
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-hero-grad);
  color: var(--color-on-brand);
  box-shadow: var(--mobile-shadow-card);
}

.income-hero .meta,
.performance-hero .meta {
  display: block;
  color: var(--color-user-hero-muted);
  font-size: 12px;
}

.income-hero .val,
.performance-hero .val {
  display: block;
  overflow: hidden;
  margin-top: 10px;
  font-size: 34px;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  text-overflow: ellipsis;
}

.income-hero button {
  width: 112px;
  min-height: 44px;
  margin: 18px 0 0;
  border: 0;
  border-radius: var(--mobile-radius-pill);
  background: var(--color-card);
  color: var(--mobile-brand-deep);
  font-size: 14px;
  font-weight: 800;
}

.metric-grid,
.summary-line {
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  margin-top: 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
  box-shadow: var(--mobile-shadow-card);
}

.metric-grid view,
.summary-line view {
  min-width: 0;
  padding: 12px 8px;
  text-align: center;
}

.metric-grid view:nth-child(even),
.summary-line view + view {
  border-left: 1px solid var(--mobile-border);
}

.metric-grid view:nth-child(n + 3) {
  border-top: 1px solid var(--mobile-border);
}

.metric-grid .meta,
.metric-grid .val,
.summary-line .meta,
.summary-line .val {
  display: block;
}

.metric-grid .meta,
.summary-line .meta {
  color: var(--mobile-muted);
  font-size: 12px;
}

.metric-grid .val,
.summary-line .val {
  max-width: 100%;
  overflow: hidden;
  margin-top: 6px;
  color: var(--mobile-brand);
  font-size: 19px;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
  text-overflow: ellipsis;
}

.section-title {
  margin: 22px 2px 10px;
  color: var(--mobile-text);
  font-size: 16px;
  font-weight: 900;
}

.list-row,
.fan-row,
.order-row {
  min-width: 0;
  margin-bottom: 10px;
  padding: 10px 11px;
  border: 1px solid var(--color-line);
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-surface);
  box-shadow: var(--mobile-shadow-card);
}

.list-row,
.fan-row {
  display: flex;
  align-items: center;
  gap: 11px;
}

.list-row > view,
.fan-row > view:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.list-row text,
.list-row .meta,
.fan-row text,
.fan-row .meta {
  display: block;
}

.list-row text,
.fan-row text {
  word-break: break-all;
  color: var(--mobile-text);
  font-size: 13px;
  font-weight: 800;
}

.list-row .meta,
.fan-row .meta,
.order-row .meta {
  display: block;
  margin-top: 5px;
  color: var(--mobile-muted);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-all;
}

.list-row > .val {
  max-width: 42%;
  overflow: hidden;
  flex: none;
  color: var(--mobile-price);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fan-row .fan-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: var(--mobile-radius-card);
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-weight: 900;
}

.fan-row .bound-tag {
  flex: none;
  padding: 4px 7px;
  border-radius: var(--mobile-radius-control);
  background: var(--mobile-brand-soft);
  color: var(--mobile-brand-deep);
  font-size: 12px;
  font-weight: 800;
}

.empty {
  display: flex;
  min-height: 160px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--mobile-muted);
  font-size: 13px;
  text-align: center;
}

.no-distributor {
  min-height: 220px;
  padding: 24px 16px;
}

.no-distributor .meta {
  max-width: 280px;
  color: var(--mobile-muted);
  font-size: 12px;
  line-height: 1.6;
}

.no-distributor .primary-btn {
  width: min(100%, 220px);
  min-height: 44px;
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0;
  border-radius: var(--mobile-radius-pill);
  background: var(--mobile-hero-grad);
  box-shadow: var(--mobile-shadow-button);
  color: var(--color-on-brand);
  font-size: 14px;
  font-weight: 800;
}

.empty .ui-icon {
  color: var(--mobile-brand);
}

.order-row {
  word-break: break-all;
}

.row-head,
.row-foot,
.performance-hero > view {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row-head text:first-child {
  min-width: 0;
  word-break: break-all;
  color: var(--mobile-text);
  font-size: 12px;
  font-weight: 800;
}

.row-head text:last-child {
  flex: none;
  color: var(--mobile-price);
  font-size: 12px;
  font-weight: 800;
}

.row-foot {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--mobile-border);
  color: var(--mobile-muted);
  font-size: 12px;
}

.row-foot .val {
  color: var(--mobile-price);
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.performance-hero > view {
  margin-top: 15px;
  color: var(--color-user-hero-muted);
  font-size: 12px;
}

.performance-grid view:nth-child(n + 3) {
  border-top: 0;
}

/* #ifdef H5 */
body,
#app {
  background: var(--color-bg);
}

.operation-page {
  max-width: 430px;
  margin: 0 auto;
  box-shadow: var(--shadow-card);
}
/* #endif */

/* #ifdef MP-WEIXIN */
.operation-page {
  padding-top: calc(10px + var(--status-bar-height));
  padding-right: 96px;
}

.operation-header.theme-head {
  margin-top: calc(-10px - var(--status-bar-height));
  padding-top: calc(10px + var(--status-bar-height));
  padding-right: 96px;
}
/* #endif */

@media (max-width: 375px) {
  .income-hero,
  .performance-hero {
    padding: 18px;
  }

  .income-hero .val,
  .performance-hero .val {
    font-size: 31px;
  }

  .metric-grid view,
  .summary-line view {
    padding-right: 7px;
    padding-left: 7px;
  }
}
</style>
