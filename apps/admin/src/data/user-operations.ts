import {
  demoCDistributorProfiles,
  promoters as promoterSeeds,
  readCCommissionRecords,
  readCDistributorProfiles,
  readCOrders,
  readPlatformPromoterAccounts,
  readPlatformPromoters,
  readUserBindings
} from '@agritainment/shared'
import type { CCommissionAllocation, CDistributorProfile, COrder, Promoter } from '@agritainment/shared'

export interface AdminUserRow {
  id: string
  name: string
  phone: string
  registeredAt: string
  sourceChannel: string
  /** 用户头像（清单「用户资料」：昵称、手机号、头像、注册时间、来源渠道）；缺省时列表回退首字头像。 */
  avatar?: string
  levelLabel: string
  bindingStatusLabel: string
  level1Leader: string
  level2Leader: string
  orderCount: number
  consumedAmount: number
}

export interface AdminLeaderRow {
  promoterId: string
  name: string
  account: string
  level: 'level1' | 'level2'
  levelLabel: string
  status: 'active' | 'paused'
  statusLabel: string
  directUserCount: number
  directLeaderCount: number
  availableCommission: number
  pendingCommission: number
  withdrawnCommission: number
  commissionCount: number
}

export interface AdminLeaderCommissionRow {
  id: string
  orderId: string
  subOrderId: string
  levelLabel: string
  amount: number
  statusLabel: string
  createdAt: string
}

export interface AdminUserConsumptionRow {
  id: string
  createdAt: string
  amount: number
  statusLabel: string
  levelLabel: string
}

// 演示环境没有服务端用户目录，这里给出可演示的昵称 / 手机号 / 注册信息，未登记的用户按 ID 兜底展示。
const demoUserDirectory: Record<string, { name: string; phone: string; registeredAt: string; sourceChannel: string; avatar?: string }> = {
  'U-DEMO-L1': { name: '李湘云', phone: '13873001122', registeredAt: '2026-06-12 10:20', sourceChannel: '团长推广', avatar: '/static/images/field.webp' },
  'U-DEMO-L2': { name: '周巧云', phone: '13873003344', registeredAt: '2026-06-18 15:40', sourceChannel: '上级团长推荐', avatar: '/static/images/tea.webp' },
  'U-DEMO-NORMAL': { name: '王小满', phone: '13873005566', registeredAt: '2026-07-02 09:05', sourceChannel: '自然流量', avatar: '/static/images/peach.webp' }
}

const orderStatusLabels: Record<string, string> = {
  'pending-payment': '待支付',
  pending: '备货中',
  shipping: '已发货',
  'delivered': '已收货',
  'after-sale': '售后中',
  'paid-cancelled': '已取消',
  'unpaid-cancelled': '未支付取消'
}

const commissionStatusLabels: Record<string, string> = {
  pending: '待结算',
  available: '可提现',
  withdrawn: '已提现',
  reversed: '已冲正'
}

export function leaderLevelLabel(level: 'level1' | 'level2'): string {
  return level === 'level1' ? '一级团长' : '二级团长'
}

function activeProfiles(): Record<string, CDistributorProfile> {
  return readCDistributorProfiles() || demoCDistributorProfiles
}

function promoterMap(): Record<string, Promoter> {
  // 演示环境里 promoter 主数据可能尚未落库，用种子兜底，保证名称始终可读。
  return { ...Object.fromEntries(promoterSeeds.map((promoter) => [promoter.id, promoter])), ...readPlatformPromoters() }
}

function promoterAccounts(): Map<string, string> {
  return new Map(readPlatformPromoterAccounts().map((account) => [account.promoterId, account.account]))
}

function cOrders(): COrder[] {
  return Object.values(readCOrders() || {})
}

function cCommissions(): CCommissionAllocation[] {
  return readCCommissionRecords() || []
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function leaderNameFor(promoterId: string, promoters: Record<string, Promoter>): string {
  return promoters[promoterId]?.name || promoterId
}

export function buildAdminUsers(): AdminUserRow[] {
  const profiles = activeProfiles()
  const bindings = readUserBindings() || {}
  const orders = cOrders()
  const promoterList = promoterMap()
  const userIds = new Set<string>([
    ...Object.keys(profiles),
    ...Object.keys(bindings),
    ...orders.map((order) => order.userId).filter(Boolean)
  ])
  return [...userIds].sort().map((userId) => {
    const profile = profiles[userId]
    const binding = bindings[userId]
    const userOrders = orders.filter((order) => order.userId === userId)
    const directory = demoUserDirectory[userId]
    const level1Leader = profile ? (profile.level === 'level1' ? profile.promoterId : profile.parentPromoterId) : binding?.promoterId
    const level2Leader = profile?.level === 'level2' ? profile.promoterId : undefined
    const fallbackBindingTime = binding?.boundAt || userOrders.map((order) => order.createdAt).sort()[0]
    return {
      id: userId,
      name: directory?.name || `用户 ${userId}`,
      phone: directory?.phone || '—',
      registeredAt: directory?.registeredAt || fallbackBindingTime || '—',
      sourceChannel: directory?.sourceChannel || (binding?.promoterId ? '团长推广' : binding?.staffAccountId ? '门店业务员推广' : '自然流量'),
      avatar: directory?.avatar,
      levelLabel: profile ? leaderLevelLabel(profile.level) : '普通用户',
      bindingStatusLabel: profile ? (profile.status === 'active' ? '已绑定' : '已停用') : binding?.status === 'bound' ? '已绑定' : binding?.status === 'pending' ? '待绑定' : '未绑定',
      level1Leader: level1Leader ? leaderNameFor(level1Leader, promoterList) : '—',
      level2Leader: level2Leader ? leaderNameFor(level2Leader, promoterList) : '—',
      orderCount: userOrders.length,
      consumedAmount: round2(userOrders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.amount, 0))
    }
  })
}

export function buildAdminLeaders(): AdminLeaderRow[] {
  const profiles = activeProfiles()
  const promoters = promoterMap()
  const accounts = promoterAccounts()
  const commissions = cCommissions()
  const bindings = readUserBindings() || {}
  const rows = new Map<string, AdminLeaderRow>()
  const ensure = (promoterId: string): AdminLeaderRow => {
    const existing = rows.get(promoterId)
    if (existing) return existing
    const related = commissions.filter((item) => item.beneficiaryId === promoterId)
    const sumByStatus = (status: CCommissionAllocation['status']) => round2(related.filter((item) => item.status === status).reduce((total, item) => total + item.amount, 0))
    const row: AdminLeaderRow = {
      promoterId,
      name: leaderNameFor(promoterId, promoters),
      account: accounts.get(promoterId) || '—',
      level: 'level1',
      levelLabel: '一级团长',
      status: 'active',
      statusLabel: '启用',
      directUserCount: 0,
      directLeaderCount: 0,
      availableCommission: sumByStatus('available'),
      pendingCommission: sumByStatus('pending'),
      withdrawnCommission: sumByStatus('withdrawn'),
      commissionCount: related.length
    }
    rows.set(promoterId, row)
    return row
  }
  Object.values(profiles).forEach((profile) => {
    const row = ensure(profile.promoterId)
    row.level = profile.level
    row.levelLabel = leaderLevelLabel(profile.level)
    row.status = profile.status
    row.statusLabel = profile.status === 'active' ? '启用' : '停用'
    if (profile.level === 'level1') row.directUserCount += 1
    if (profile.level === 'level2') row.directUserCount += 1
    if (profile.parentPromoterId) ensure(profile.parentPromoterId).directLeaderCount += 1
  })
  Object.entries(bindings).forEach(([userId, binding]) => {
    if (!binding.promoterId) return
    const row = ensure(binding.promoterId)
    if (!profiles[userId]) row.directUserCount += 1
  })
  Object.values(promoters).forEach((promoter) => {
    if (commissions.some((item) => item.beneficiaryId === promoter.id) || profiles[promoter.id]) ensure(promoter.id)
  })
  return [...rows.values()].sort((a, b) => a.level === b.level ? a.promoterId.localeCompare(b.promoterId) : a.level === 'level1' ? -1 : 1)
}

export function buildLeaderCommissionRows(promoterId: string): AdminLeaderCommissionRow[] {
  return cCommissions()
    .filter((item) => item.beneficiaryId === promoterId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      id: item.id,
      orderId: item.orderId,
      subOrderId: item.subOrderId,
      levelLabel: leaderLevelLabel(item.beneficiaryLevel),
      amount: round2(item.amount),
      statusLabel: commissionStatusLabels[item.status] || item.status,
      createdAt: item.createdAt
    }))
}

export function buildUserConsumptionRows(userId: string): AdminUserConsumptionRow[] {
  return cOrders()
    .filter((order) => order.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      amount: round2(order.amount),
      statusLabel: orderStatusLabels[order.status] || order.status,
      levelLabel: order.level === 'level1' ? '一级团长价' : order.level === 'level2' ? '二级团长价' : '普通用户价'
    }))
}

export interface AdminLeaderCommissionLedgerRow {
  id: string
  orderId: string
  promoterId: string
  leaderName: string
  levelLabel: string
  amount: number
  statusLabel: string
  createdAt: string
}

export function buildLeaderCommissionLedger(): AdminLeaderCommissionLedgerRow[] {
  const promoters = promoterMap()
  return cCommissions()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      id: item.id,
      orderId: item.orderId,
      promoterId: item.beneficiaryId,
      leaderName: leaderNameFor(item.beneficiaryId, promoters),
      levelLabel: leaderLevelLabel(item.beneficiaryLevel),
      amount: round2(item.amount),
      statusLabel: commissionStatusLabels[item.status] || item.status,
      createdAt: item.createdAt
    }))
}
