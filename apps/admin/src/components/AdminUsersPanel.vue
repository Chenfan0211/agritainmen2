<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '../stores/admin'
import { BusinessImage } from '@agritainment/ui'
import { buildAdminUsers, buildUserConsumptionRows } from '../data/user-operations'
import type { AdminUserConsumptionRow, AdminUserRow } from '../data/user-operations'

const store = useAdminStore()
const { initialized } = storeToRefs(store)

const keyword = ref('')
const leaderFilter = ref('全部')
const sourceFilter = ref('全部')
const selectedId = ref('')
const rows = ref<AdminUserRow[]>([])
const consumption = ref<AdminUserConsumptionRow[]>([])

function reload() {
  rows.value = buildAdminUsers()
  consumption.value = selectedId.value ? buildUserConsumptionRows(selectedId.value) : []
}

onMounted(reload)

const leaderOptions = computed(() => ['全部', ...[...new Set(rows.value.flatMap((row) => [row.level1Leader, row.level2Leader]).filter((item) => item && item !== '—'))]])
const sourceOptions = computed(() => ['全部', ...[...new Set(rows.value.map((row) => row.sourceChannel))]])

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (leaderFilter.value !== '全部' && row.level1Leader !== leaderFilter.value && row.level2Leader !== leaderFilter.value) return false
    if (sourceFilter.value !== '全部' && row.sourceChannel !== sourceFilter.value) return false
    if (!q) return true
    return `${row.name}${row.phone}${row.id}`.toLowerCase().includes(q)
  })
})

const selected = computed(() => rows.value.find((row) => row.id === selectedId.value) || null)
const totalConsumed = computed(() => Math.round(filtered.value.reduce((sum, row) => sum + row.consumedAmount, 0) * 100) / 100)

function openDetail(row: AdminUserRow) {
  selectedId.value = row.id
  consumption.value = buildUserConsumptionRows(row.id)
}

function closeDetail() {
  selectedId.value = ''
  consumption.value = []
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}
</script>

<template>
  <section class="data-panel user-ops-panel">
    <view class="stat-strip three">
      <view><small>用户总数</small><strong>{{ filtered.length }} 人</strong></view>
      <view><small>累计消费</small><strong>{{ money(totalConsumed) }}</strong></view>
      <view><small>已绑定团长</small><strong>{{ filtered.filter((row) => row.levelLabel !== '普通用户').length }} 人</strong></view>
    </view>
    <view class="filter-bar">
      <label class="field is-search"><text>关键词</text><view class="filter-control"><input v-model="keyword" placeholder="请输入用户昵称 / 手机号 / ID" /></view></label>
      <label class="field"><text>团长归属</text><select v-model="leaderFilter"><option v-for="item in leaderOptions" :key="item" :value="item">{{ item }}</option></select></label>
      <label class="field"><text>来源渠道</text><select v-model="sourceFilter"><option v-for="item in sourceOptions" :key="item" :value="item">{{ item }}</option></select></label>
    </view>
    <view v-if="!store.can('user.view')" class="empty-state">当前角色无查看用户信息的权限</view>
    <template v-else>
      <view class="table-row table-head user-grid"><text>用户</text><text>手机号</text><text>团长归属</text><text>订单 / 累计消费</text><text>来源渠道</text><text>操作</text></view>
      <view v-for="row in filtered" :key="row.id" class="table-row user-grid">
        <view class="user-cell"><BusinessImage v-if="row.avatar" class="user-avatar" :src="row.avatar" mode="aspectFill" /><span v-else class="user-avatar user-avatar--fallback">{{ row.name.slice(0, 1) }}</span><view><strong>{{ row.name }}</strong><small>{{ row.id }} · {{ row.levelLabel }}</small></view></view>
        <text>{{ row.phone }}</text>
        <view><strong>一级：{{ row.level1Leader }}</strong><small>二级：{{ row.level2Leader }}</small></view>
        <view><strong>{{ row.orderCount }} 单 · {{ money(row.consumedAmount) }}</strong><small>注册 {{ row.registeredAt }}</small></view>
        <text>{{ row.sourceChannel }}</text>
        <view class="row-actions"><button @click="openDetail(row)">详情</button></view>
      </view>
      <view v-if="!filtered.length" class="empty-state">{{ initialized ? '没有符合条件的用户' : '正在准备用户数据...' }}</view>
    </template>

    <view v-if="selected" class="user-detail-drawer">
      <view class="panel-head"><view class="user-head"><BusinessImage v-if="selected.avatar" class="user-avatar" :src="selected.avatar" mode="aspectFill" /><span v-else class="user-avatar user-avatar--fallback">{{ selected.name.slice(0, 1) }}</span><view><h2>{{ selected.name }}</h2><text>{{ selected.id }} · {{ selected.levelLabel }} · {{ selected.bindingStatusLabel }}</text></view></view><button class="button secondary" @click="closeDetail">关闭</button></view>
      <view class="detail-block">
        <view><small>用户昵称</small><strong>{{ selected.name }}</strong></view>
        <view><small>头像</small><strong>{{ selected.avatar ? '演示头像' : '默认首字头像' }}</strong></view>
        <view><small>手机号</small><strong>{{ selected.phone }}</strong></view>
        <view><small>注册时间</small><strong>{{ selected.registeredAt }}</strong></view>
        <view><small>来源渠道</small><strong>{{ selected.sourceChannel }}</strong></view>
        <view><small>累计消费</small><strong>{{ money(selected.consumedAmount) }}</strong></view>
      </view>
      <view class="detail-block">
        <view><small>一级团长</small><strong>{{ selected.level1Leader }}</strong></view>
        <view><small>二级团长</small><strong>{{ selected.level2Leader }}</strong></view>
      </view>
      <view class="panel-head"><h2>消费记录</h2><text>共 {{ consumption.length }} 笔</text></view>
      <view v-if="!consumption.length" class="empty-state">暂无消费记录</view>
      <view v-for="item in consumption" :key="item.id" class="history-row"><strong>{{ item.id }} · {{ money(item.amount) }}</strong><small>{{ item.statusLabel }} · {{ item.levelLabel }} · {{ item.createdAt }}</small></view>
    </view>
  </section>
</template>

<style scoped>
.user-ops-panel{display:block}
.stat-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px;border-bottom:1px solid var(--admin-line)}
.stat-strip>view{display:flex;flex-direction:column;gap:4px}
.stat-strip small{color:var(--admin-muted);font-size:12px}
.stat-strip strong{color:var(--admin-ink);font-size:16px}
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
.user-grid{grid-template-columns:1.3fr .9fr 1.4fr 1.2fr .8fr .5fr}
.user-cell,.user-head{display:flex;align-items:center;gap:10px}
.user-avatar{width:36px;height:36px;border-radius:50%;flex:none}
.user-avatar--fallback{display:grid;place-items:center;background:var(--color-brand-primary-soft);color:var(--color-brand-primary-dark);font-weight:800}
.row-actions button{min-height:32px;padding:0 12px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-control);background:var(--color-card);color:var(--admin-ink);cursor:pointer}
.empty-state{min-height:120px;display:grid;place-items:center;color:var(--admin-muted);font-size:13px}
.user-detail-drawer{margin:16px;padding:16px;border:1px solid var(--admin-line);border-radius:var(--admin-radius-panel);background:var(--color-card);box-shadow:var(--shadow-card)}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.panel-head h2{margin:0;font-size:15px}
.panel-head text{color:var(--admin-muted);font-size:12px}
.detail-block{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:12px 0;border-bottom:1px solid var(--color-line-light)}
.detail-block small{display:block;color:var(--admin-muted);font-size:12px}
.detail-block strong{display:block;margin-top:4px;font-size:13px}
.history-row{padding:10px 0;border-bottom:1px solid var(--color-line-light)}
.history-row strong{display:block;font-size:13px}
.history-row small{color:var(--admin-muted);font-size:12px}
@media (max-width:768px){.user-grid{grid-template-columns:1fr 1fr}.stat-strip{grid-template-columns:1fr}}
</style>
