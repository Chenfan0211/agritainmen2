// 团长运营页（我的收入 / 下级用户 / 团队订单 / 团队业绩）——原生小程序 Page。
import { readCDistributorProfiles, readCOrders, readUserBindings } from '@agritainment/shared'
import { projectDistributorOperations } from '../../services/distributor-operations'
import { useUserStore } from '../../stores/user'

type OperationType = 'income' | 'fans' | 'orders' | 'performance'

const OPERATION_TYPES: OperationType[] = ['income', 'fans', 'orders', 'performance']
const TITLES: Record<OperationType, string> = { income: '我的收入', fans: '我的下级用户', orders: '团队订单', performance: '团队业绩' }
const ORDER_STATUS: Record<string, string> = {
  paid: '备货中', shipped: '配送中', received: '已完成', partially_shipped: '部分发货', partially_received: '部分完成', partially_after_sale: '部分售后'
}

const store = useUserStore()

function formatDate(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '绑定时间未记录'
}

function operationStatusLabel(value: string): string {
  return ORDER_STATUS[value] || value
}

function moneyText(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2)
}

function commissionStatusLabel(status: string): string {
  return status === 'available' ? '可提现' : status === 'pending' ? '待结算' : status === 'withdrawn' ? '已提现' : '已冲正'
}

function buildViewModel(type: OperationType) {
  const currentDistributor = store.currentDistributor
  const projection = projectDistributorOperations({
    promoterId: currentDistributor?.promoterId || '',
    orders: Object.values(readCOrders() || {}),
    bindings: readUserBindings() || {},
    profiles: readCDistributorProfiles() || {}
  })
  const records = store.myCommissionRecords || []
  const settledIncome = records.filter((item: any) => item.status === 'available' || item.status === 'withdrawn').reduce((sum: number, item: any) => sum + item.amount, 0)
  const withdrawnIncome = records.filter((item: any) => item.status === 'withdrawn').reduce((sum: number, item: any) => sum + item.amount, 0)
  const availableCommission = Number(store.availableCommission) || 0
  const pendingCommission = Number(store.pendingCommission) || 0

  return {
    type,
    title: TITLES[type],
    hasDistributor: !!currentDistributor,
    availableCommissionText: moneyText(availableCommission),
    canWithdraw: availableCommission > 0,
    totalIncomeText: moneyText(settledIncome + pendingCommission),
    settledIncomeText: moneyText(settledIncome),
    pendingCommissionText: moneyText(pendingCommission),
    withdrawnIncomeText: moneyText(withdrawnIncome),
    hasCommissionRecords: records.length > 0,
    commissionRecords: records.map((record: any) => ({
      id: record.id,
      levelLabel: record.beneficiaryLevel === 'level1' ? '一级团长分佣' : '二级团长分佣',
      metaText: `${formatDate(record.createdAt)} · ${commissionStatusLabel(record.status)}`,
      amountText: moneyText(record.amount)
    })),
    directFanCount: projection.directFans.length,
    teamPromoterCount: projection.teamPromoterIds.length,
    hasDirectFans: projection.directFans.length > 0,
    fans: projection.directFans.map((fan: any) => ({
      userId: fan.userId,
      initial: String(fan.userId || '').slice(-1),
      boundAtText: formatDate(fan.boundAt)
    })),
    personalOrderCount: projection.personalOrders.length,
    teamOrderCount: projection.teamOrders.length,
    hasTeamOrders: projection.teamOrders.length > 0,
    teamOrders: projection.teamOrders.map((order: any) => ({
      id: order.id,
      statusLabel: operationStatusLabel(order.status),
      metaText: `${formatDate(order.createdAt)} · 推广链 ${(order.distributorChain || []).join(' → ')}`,
      createdAtText: formatDate(order.createdAt),
      effectiveAmountText: moneyText(order.effectiveAmount)
    })),
    personalPerformanceText: moneyText(projection.personalPerformance),
    teamPerformanceText: moneyText(projection.teamPerformance)
  }
}

Page({
  data: {
    ...buildViewModel('income')
  },

  render(this: any) {
    this.setData(buildViewModel(this.data.type))
  },

  onLoad(this: any, query: Record<string, string>) {
    const type = OPERATION_TYPES.includes((query?.type || '') as OperationType) ? (query.type as OperationType) : 'income'
    this.setData(buildViewModel(type))
    this.unsubscribeStore = store.$subscribe(() => this.render())
  },

  onShow(this: any) {
    this.render()
  },

  onUnload(this: any) {
    if (typeof this.unsubscribeStore === 'function') this.unsubscribeStore()
    this.unsubscribeStore = null
  },

  back() {
    wx.navigateBack()
  },

  async withdraw(this: any) {
    const result = await store.withdrawCommission('微信提现')
    const title = result === 'pending' ? '提现申请已提交' : result === 'duplicate' ? '已有申请处理中' : '暂无可提现收入'
    wx.showToast({ title, icon: 'none' })
    this.render()
  }
})