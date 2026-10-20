import type { SearchableSelectOption, SearchableSelectValue } from '../../components/searchable-select'

function options<T extends SearchableSelectValue>(items: Array<[value: T, label: string, keywords?: string[]]>): SearchableSelectOption[] {
  return items.map(([value, label, keywords]) => ({ value, label, keywords }))
}

export const trendRangeOptions = options([
  ['7d', '最近7天'], ['1m', '最近一个月'], ['3m', '最近三个月'], ['1y', '最近一年']
])
export const supplierStatusOptions = options([
  ['全部', '全部状态'], ['待审核', '待审核'], ['已合作', '已合作'], ['已停用', '已停用'], ['供销社', '供销社']
])
export const categoryTypeFilterOptions = options([
  ['全部', '全部类型'], ['product', '商品品类'], ['supplier', '供应商品类'], ['general', '通用']
])
export const catalogChannelFilterOptions = options([
  ['all', '全部商品', ['all', '全部渠道']], ['store', '门店商品', ['store']], ['live', '用户端商品', ['live', 'user']]
])
export const productStatusOptions = options([
  ['全部', '全部状态'], ['active', '已上架'], ['offline', '已下架'], ['pending', '待审核']
])
export const orderChannelOptions = options([
  ['全部来源', '全部来源'], ['商城', '商城'], ['用户端', '用户端'], ['进货', '进货']
])
export const orderStatusOptions = options([
  ['全部', '全部状态'], ['待发货', '待发货'], ['已发货', '已发货'], ['已完成', '已完成'], ['已支付取消', '已支付取消'], ['未支付取消', '未支付取消']
])
export const orderAfterOptions = options([
  ['全部', '全部售后'], ['未发起', '未发起'], ['售后中', '售后中'], ['售后拒绝', '售后拒绝'], ['待退款', '待退款'], ['待退货', '待退货'], ['已退款', '已退款'], ['退款失败', '退款失败']
])
export const afterTypeFilterOptions = options([
  ['全部', '全部类型'], ['reship', '破损补寄'], ['refund', '退货退款'], ['claim', '质量理赔']
])
export const afterStatusFilterOptions = options([
  ['全部', '全部状态'], ['processing', '售后中'], ['rejected', '售后拒绝'], ['refund-pending', '待退款'], ['return-pending', '待退货'], ['refunded', '已退款'], ['refund-failed', '退款失败']
])
export const promoterSettleFilterOptions = options([
  ['全部', '全部状态'], ['待结算', '待结算'], ['已结算', '已结算']
])
export const farmStatusFilterOptions = options([
  ['全部门店', '全部门店'], ['经营中', '经营中'], ['筹备中', '筹备中'], ['已停用', '已停用'], ['试点样板', '试点样板']
])
export const commissionStatusOptions = options([
  ['全部', '全部结算状态'], ['未结算', '未结算'], ['已结算', '已结算']
])
export const supplierTypeOptions = options<boolean>([
  [false, '合作供应商'], [true, '供销社渠道']
])
export const categoryTypeOptions = options([
  ['product', '商品品类'], ['supplier', '供应商品类'], ['general', '通用']
])
export const enabledOptions = options<boolean>([
  [true, '启用'], [false, '停用']
])
export const accountRoleOptions = options([
  ['owner', '店主'], ['staff', '店员']
])
export const accountPromotionOptions = options<boolean>([
  [true, '开启（可生成推广码）'], [false, '关闭']
])
export const policyTypeOptions = options([
  ['group', '分销价格'], ['ladder', '阶梯价']
])
export const afterSaleTypeOptions = options([
  ['refund', '退款'], ['reship', '补发'], ['claim', '理赔']
])
export const promoterStatusOptions = options([
  ['active', '启用'], ['paused', '停用']
])
export const farmStatusOptions = options([
  ['pending', '筹备中'], ['active', '经营中'], ['paused', '已停用']
])
export const catalogProductTypeOptions = options([
  ['goods', '实物商品'], ['package', '套餐券']
])
export const expressDeliveryOptions = options<boolean>([
  [true, '支持'], [false, '不支持']
])
export const catalogProductSourceOptions = options([
  ['platform', '中台商品'], ['farmhouse', '门店自有']
])
