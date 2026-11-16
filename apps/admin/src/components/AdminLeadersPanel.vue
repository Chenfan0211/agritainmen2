<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getApiClientConfig, readPlatformWithdrawals, readPricingDefaults } from '@agritainment/shared'
import type { WithdrawalRequest } from '@agritainment/shared'
import { useAdminStore } from '../stores/admin'
import { buildAdminLeaders, buildLeaderCommissionRows } from '../data/user-operations'
import PaginationBar from './PaginationBar.vue'
import type { AdminLeaderCommissionRow, AdminLeaderRow } from '../data/user-operations'

const store = useAdminStore()

const keyword = ref('')
const levelFilter = ref<'全部' | '一级团长' | '二级团长'>('全部')
const statusFilter = ref<'全部' | '启用' | '停用'>('全部')
const selectedId = ref('')
const rows = ref<AdminLeaderRow[]>([])
const commissions = ref<AdminLeaderCommissionRow[]>([])
const withdrawals = ref<WithdrawalRequest[]>([])
const selectedWithdrawalPage = ref(1)
const selectedWithdrawalTotal = ref(0)
let selectedWithdrawalRequestId = 0
const priceForm = reactive({ level1Amount: 0, level2Amount: 0 })
const message = ref('')
const apiMode = getApiClientConfig().dataMode === 'api'
const canReview = computed(() => store.can('leader.withdrawal.review') || store.can('withdrawal.review'))
const serverWithdrawals = computed(() => store.apiWithdrawals)

async function reload(loadServer = true) {
  rows.value = buildAdminLeaders()
  const defaults = readPricingDefaults()
  priceForm.level1Amount = defaults.level1Amount
  priceForm.level2Amount = defaults.level2Amount
  if (apiMode && canReview.value && loadServer) await store.loadWithdrawals()
  if (apiMode) {
    if (selectedId.value && canReview.value) await loadSelectedWithdrawals(selectedWithdrawalPage.value)
    else withdrawals.value = []
  } else {
    const allWithdrawals = Object.values(readPlatformWithdrawals() || {})
    withdrawals.value = selectedId.value
      ? allWithdrawals.filter((item) => item.requesterId === selectedId.value).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : []
  }
  commissions.value = selectedId.value ? buildLeaderCommissionRows(selectedId.value) : []
}

async function loadSelectedWithdrawals(page: number) {
  const requesterId = selectedId.value
  const requestId = ++selectedWithdrawalRequestId
  const result = await store.loadWithdrawalsForRequester(requesterId, page)
  if (requestId !== selectedWithdrawalRequestId || selectedId.value !== requesterId) return
  withdrawals.value = result?.items || []
  selectedWithdrawalPage.value = result?.page || 1
  selectedWithdrawalTotal.value = result?.total || 0
}

onMounted(async () => {
  if (apiMode && canReview.value) await store.loadWithdrawals({ page: 1, status: '', keyword: '' })
  await reload(false)
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (levelFilter.value !== '全部' && row.levelLabel !== levelFilter.value) return false
    if (statusFilter.value !== '全部' && row.statusLabel !== statusFilter.value) return false
    if (!q) return true
    return `${row.name}${row.promoterId}${row.account}`.toLowerCase().includes(q)
  })
})

const selected = computed(() => rows.value.find((row) => row.promoterId === selectedId.value) || null)
const pendingWithdrawals = computed(() => withdrawals.value.filter((item) => item.status === 'pending'))

function openDetail(row: AdminLeaderRow) {
  selectedId.value = row.promoterId
  selectedWithdrawalPage.value = 1
  reload()
}

function closeDetail() {
  selectedId.value = ''
  selectedWithdrawalRequestId++
  selectedWithdrawalTotal.value = 0
  reload()
}

async function savePrice() {
  message.value = ''
  const saved = await store.updateLeaderPricing({
    ...readPricingDefaults(),
    level1Amount: Number(priceForm.level1Amount) || 0,
    level2Amount: Number(priceForm.level2Amount) || 0
  })
  message.value = saved ? '团长价格已保存' : store.error || '团长价格保存失败或当前角色无权限'
  reload()
}

async function toggleStatus(row: AdminLeaderRow) {
  message.value = ''
  const next = row.status !== 'active'
  const result = await store.setLeaderStatus(row.promoterId, next)
  message.value = result ? `团长「${row.name}」已${next ? '启用' : '停用'}` : store.error || '团长状态修改失败或当前角色无权限'
  reload()
}

async function reviewWithdrawal(item: WithdrawalRequest, status: 'approved' | 'rejected') {
  message.value = ''
  const result = await store.reviewWithdrawal(item.id, status, status === 'rejected' ? '团长提现资料不符合要求' : undefined, 'leader.withdrawal.review')
  const resultMessage = result ? `提现「${item.id}」已${status === 'approved' ? '通过' : '驳回'}` : store.error || '提现审核失败或当前角色无权限'
  await reload(!apiMode)
  message.value = resultMessage
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}
</script>

<template>
  <section class="data-panel leader-ops-panel">
    <view class="leader-config">
      <view class="panel-head"><view><h2>团长价格</h2><text>一级 / 二级团长在用户端展示的固定加价，商品级可在商品库覆盖</text></view></view>
      <view class="config-row">
        <label class="field"><text>一级团长加价（元）</text><input v-model.number="priceForm.level1Amount" type="number" min="0" step="0.01" /></label>
        <label class="field"><text>二级团长加价（元）</text><input v-model.number="priceForm.level2Amount" type="number" min="0" step="0.01" /></label>
        <button class="button primary" :disabled="!store.can('leader.price.manage')" @click="savePrice">保存团长价格</button>
      </view>
      <text v-if="message" class="config-message">{{ message }}</text>
    </view>

    <view v-if="apiMode && canReview" class="leader-detail-drawer">
      <view class="panel-head"><view><h2>提现审核</h2><text>服务端申请 · 待审核 {{ store.pendingWithdrawals }} 笔</text></view><button class="button secondary" @click="reload()">刷新</button></view>
      <text v-if="message" class="config-message">{{ message }}</text>
      <view v-if="store.error" class="empty-state">{{ store.error }}</view>
      <view v-if="!serverWithdrawals.length && !store.error" class="empty-state">暂无提现申请</view>
      <view v-for="item in serverWithdrawals" :key="item.id" class="history-row withdrawal-row">
        <view><strong>{{ item.requesterId }} · {{ item.id }} · {{ money(item.amount) }}</strong><small>{{ item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已通过' : '已驳回' }} · {{ item.createdAt }}</small></view>
        <view v-if="item.status === 'pending'" class="row-actions"><button @click="reviewWithdrawal(item, 'approved')">通过</button><button class="danger" @click="reviewWithdrawal(item, 'rejected')">驳回</button></view>
      </view>
      <PaginationBar :page="store.apiWithdrawalPage" :page-size="store.apiWithdrawalPageSize" :total="store.apiWithdrawalTotal" @change="store.loadWithdrawals({ page: $event })" />
    </view>

    <view class="filter-bar">
      <label class="field is-search"><text>关键词</text><view class="filter-control"><input v-model="keyword" placeholder="请输入团长昵称 / 编号 / 账号" /></view></label>
      <label class="field"><text>等级</text><select v-model="levelFilter"><option value="全部">全部等级</option><option value="一级团长">一级团长</option><option value="二级团长">二级团长</option></select></label>
      <label class="field"><text>状态</text><select v-model="statusFilter"><option value="全部">全部状态</option><option value="启用">启用</option><option value="停用">停用</option></select></label>
    </view>

    <view v-if="!store.can('leader.manage')" class="empty-state">当前角色无维护团长的权限</view>
    <template v-else>
      <view class="table-row table-head leader-grid"><text>团长</text><text>等级 / 状态</text><text>下级用户</text><text>下级团长</text><text>佣金（待结算 / 可提现 / 已提现）</text><text>操作</text></view>
      <view v-for="row in filtered" :key="row.promoterId" class="table-row leader-grid">
        <view><strong>{{ row.name }}</strong><small>{{ row.promoterId }} · {{ row.account }}</small></view>
        <view><span class="status" :class="row.status === 'active' ? 'active' : 'paused'">{{ row.statusLabel }}</span><small>{{ row.levelLabel }}</small></view>
        <text>{{ row.directUserCount }} 人</text>
        <text>{{ row.directLeaderCount }} 人</text>
        <view><strong>{{ money(row.pendingCommission) }} / {{ money(row.availableCommission) }} / {{ money(row.withdrawnCommission) }}</strong><small>{{ row.commissionCount }} 笔分佣记录</small></view>
        <view class="row-actions"><button @click="openDetail(row)">详情</button><button :disabled="!store.can('leader.manage')" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</button></view>
      </view>
      <view v-if="!filtered.length" class="empty-state">没有符合条件的团长</view>
    </template>

    <view v-if="selected" class="leader-detail-drawer">
      <view class="panel-head"><view><h2>{{ selected.name }}</h2><text>{{ selected.promoterId }} · {{ selected.levelLabel }} · {{ selected.statusLabel }}</text></view><button class="button secondary" @click="closeDetail">关闭</button></view>
      <view class="detail-block">
        <view><small>登录账号</small><strong>{{ selected.account }}</strong></view>
        <view><small>下级用户</small><strong>{{ selected.directUserCount }} 人</strong></view>
        <view><small>下级团长</small><strong>{{ selected.directLeaderCount }} 人</strong></view>
        <view><small>可提现佣金</small><strong>{{ money(selected.availableCommission) }}</strong></view>
      </view>
      <view class="panel-head"><h2>分佣记录</h2><text>共 {{ commissions.length }} 笔</text></view>
      <view v-if="!commissions.length" class="empty-state">暂无分佣记录</view>
      <view v-for="item in commissions" :key="item.id" class="history-row"><strong>{{ item.orderId }} · {{ money(item.amount) }}</strong><small>{{ item.levelLabel }} · {{ item.statusLabel }} · {{ item.createdAt }}</small></view>
      <view class="panel-head"><h2>提现申请</h2><text>{{ apiMode ? `共 ${selectedWithdrawalTotal} 笔` : `待审核 ${pendingWithdrawals.length} 笔` }}</text></view>
      <view v-if="apiMode && store.error" class="empty-state">{{ store.error }}</view>
      <view v-if="!withdrawals.length && (!apiMode || !store.error)" class="empty-state">暂无提现申请</view>
      <view v-for="item in withdrawals" :key="item.id" class="history-row withdrawal-row">
        <view><strong>{{ item.id }} · {{ money(item.amount) }}</strong><small>{{ item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已通过' : item.status === 'rejected' ? '已驳回' : item.status }} · {{ item.createdAt }}</small></view>
        <view v-if="item.status === 'pending'" class="row-actions">
          <button :disabled="!canReview" @click="reviewWithdrawal(item, 'approved')">通过</button>
          <button class="danger" :disabled="!canReview" @click="reviewWithdrawal(item, 'rejected')">驳回</button>
        </view>
      </view>
      <PaginationBar v-if="apiMode" :page="selectedWithdrawalPage" :page-size="20" :total="selectedWithdrawalTotal" @change="loadSelectedWithdrawals($event)" />
    </view>
  </section>
</template>

<style scoped>
.leader-ops-panel{display:block}
.leader-config{padding:16px;border-bottom:1px solid var(--admin-line);background:var(--color-card)}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.panel-head h2{margin:0;font-size:15px}
.panel-head text{color:var(--admin-muted);font-size:12px}
.config-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px}
.config-row .field{display:flex;flex-direction:column;gap:6px;min-width:180px}
.config-row .field>text{font-size:12px;color:var(--admin-muted)}
.config-row input{height:var(--admin-control-height);padding:0 12px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);font-size:13px}
.config-message{display:block;color:var(--admin-muted);font-size:12px}
.filter-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:12px 16px;border-bottom:1px solid var(--admin-line);background:var(--color-card)}
.filter-bar .field{display:flex;flex-direction:column;gap:6px;min-width:160px}
.filter-bar .field>text{font-size:12px;color:var(--admin-muted)}
.filter-bar .field.is-search{flex:1 1 260px}
.filter-control,.filter-bar select{height:var(--admin-control-height);padding:0 12px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);font-size:13px}
.filter-control{display:flex;align-items:center}
.filter-control input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:13px}
.table-row{min-height:var(--admin-row-height);padding:0 17px;display:grid;align-items:center;gap:12px;border-bottom:1px solid var(--color-line-light);font-size:13px}
.table-head{min-height:40px;background:var(--color-card-alt);color:var(--admin-muted);font-weight:700;font-size:12px}
.table-row strong,.table-row small{display:block}
.table-row small{color:var(--admin-muted);font-size:12px;margin-top:2px}
.leader-grid{grid-template-columns:1.3fr 1fr .7fr .7fr 1.6fr .9fr}
.status{display:inline-block;padding:2px 8px;border-radius:var(--radius-pill);font-size:12px;background:var(--color-brand-primary-soft);color:var(--color-brand-primary-dark)}
.status.paused{background:var(--color-warning-soft);color:var(--color-warning-dark)}
.row-actions{display:flex;gap:8px;align-items:center}
.row-actions button{min-height:32px;padding:0 12px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);cursor:pointer}
.row-actions button.danger{color:var(--color-danger);border-color:var(--color-danger-soft)}
.row-actions button:disabled{cursor:not-allowed;opacity:.5}
.empty-state{min-height:120px;display:grid;place-items:center;color:var(--admin-muted);font-size:13px}
.leader-detail-drawer{margin:16px;padding:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card);box-shadow:var(--shadow-card)}
.detail-block{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:12px 0;border-bottom:1px solid var(--color-line-light)}
.detail-block small{display:block;color:var(--admin-muted);font-size:12px}
.detail-block strong{display:block;margin-top:4px;font-size:13px}
.history-row{padding:10px 0;border-bottom:1px solid var(--color-line-light)}
.history-row strong{display:block;font-size:13px}
.history-row small{color:var(--admin-muted);font-size:12px}
.withdrawal-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
@media (max-width:768px){.leader-grid{grid-template-columns:1fr 1fr}}
</style>
