import type { CAddress, CAfterSaleRequest, COrder, COrderItem, CSubOrder, VoucherOrder } from '@agritainment/shared'
import { readCOrders, readPlatformJson, writeCOrders, writePlatformJson, writePlatformVoucherOrder } from '@agritainment/shared'

export const DEMO_ORDER_SEED_DISABLED_KEY = 'agritainment-user-demo-orders-disabled'
export const demoOrderSeedMarker = (userId: string) => `agritainment-user-demo-orders-seeded-${userId}`
export const isDemoOrderId = (id: string) => id.startsWith('DEMO-ORD-') || id.startsWith('DEMO-VOUCHER-')

// 平台同步存储适配器：原生端落到 wx.getStorageSync / wx.setStorageSync，浏览器/测试环境落到 Web Storage。
// 三端源码不允许再出现 Web Storage 或 uni-app 存储分支。
function readStorageFlag(key: string): boolean {
  try { return Boolean(readPlatformJson<string>(key)) } catch { return false }
}

function writeStorageFlag(key: string): void {
  try { writePlatformJson(key, '1') } catch { /* Storage failure must not break login. */ }
}

export function seedDemoUserOrders(userId: string): boolean {
  if (!userId || readStorageFlag(DEMO_ORDER_SEED_DISABLED_KEY) || readStorageFlag(demoOrderSeedMarker(userId))) return false
  const existing = readCOrders() || {}
  if (Object.values(existing).some((order) => order.userId === userId)) return false

  const idScope = encodeURIComponent(userId)
  const now = Date.now()
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString()
  const address: CAddress = {
    id: `DEMO-ADDR-${idScope}`, userId, receiver: '演示用户', phone: '13800000000',
    region: '湖南省湘西州', detail: '演示地址 1 号', isDefault: true, updatedAt: at(96)
  }
  const item = (productId: string, skuId: string, name: string, skuName: string, image: string, supplierId: string, quantity: number, unitPrice: number): COrderItem => ({
    productId, skuId, name, skuName, image, quantity,
    unitPrice, basePrice: Math.max(0, unitPrice - 25), level1Commission: 10, level2Commission: 15, supplierId
  })
  const sub = (id: string, supplierId: string, supplierName: string, items: COrderItem[], status: COrder['status'], createdAt: string, trackingNo?: string, afterSale?: CAfterSaleRequest): CSubOrder => ({
    id, supplierId, supplierName, items,
    amount: Math.round(items.reduce((sum, orderItem) => sum + orderItem.unitPrice * orderItem.quantity, 0) * 100) / 100,
    status, trackingNo, courier: trackingNo ? '顺丰速运' : undefined,
    logistics: [{ time: createdAt, title: '订单已提交', detail: '演示订单，不参与真实履约' }], afterSale
  })
  const order = (id: string, status: COrder['status'], createdAt: string, subOrders: CSubOrder[], paidAt?: string): COrder => ({
    id, userId, level: 'normal', address,
    amount: Math.round(subOrders.reduce((sum, child) => sum + child.amount, 0) * 100) / 100,
    items: subOrders.flatMap((child) => child.items), subOrders, commissionAllocations: [], distributorChain: ['T001'], status, createdAt, paidAt,
    remark: '演示订单，不参与库存和供应商履约'
  })

  const pendingAt = at(2)
  const paidAt = at(18)
  const shippedAt = at(48)
  const completedAt = at(96)
  const orders: Record<string, COrder> = {
    [`DEMO-ORD-${idScope}-001`]: order(`DEMO-ORD-${idScope}-001`, 'pending_payment', pendingAt, [
      sub(`DEMO-CSO-${idScope}-001`, 'S002', '湘西腊味合作社', [item('P001', 'P001-500', '湘西烟熏柴火腊肉 500g', '500g', '/static/images/bacon.jpg', 'S002', 1, 59.9)], 'pending_payment', pendingAt)
    ]),
    [`DEMO-ORD-${idScope}-002`]: order(`DEMO-ORD-${idScope}-002`, 'paid', paidAt, [
      sub(`DEMO-CSO-${idScope}-002`, 'S002', '湘西腊味合作社', [item('P001', 'P001-1000', '湘西烟熏柴火腊肉 500g', '1kg家庭装', '/static/images/bacon.jpg', 'S002', 1, 109)], 'paid', paidAt)
    ], paidAt),
    [`DEMO-ORD-${idScope}-003`]: order(`DEMO-ORD-${idScope}-003`, 'shipped', shippedAt, [
      sub(`DEMO-CSO-${idScope}-003`, 'S004', '炎陵果业有限公司', [item('P002', 'P002-5J', '炎陵黄桃鲜果礼盒', '5斤礼盒', '/static/images/peach.jpg', 'S004', 2, 68)], 'shipped', shippedAt, `SF-DEMO-${idScope}-001`)
    ], shippedAt),
    [`DEMO-ORD-${idScope}-004`]: order(`DEMO-ORD-${idScope}-004`, 'partially_after_sale', completedAt, [
      sub(`DEMO-CSO-${idScope}-004`, 'S002', '湘西腊味合作社', [item('P001', 'P001-500', '湘西烟熏柴火腊肉 500g', '500g', '/static/images/bacon.jpg', 'S002', 1, 59.9)], 'received', completedAt, `SF-DEMO-${idScope}-002`),
      sub(`DEMO-CSO-${idScope}-005`, 'S004', '炎陵果业有限公司', [item('P002', 'P002-5J', '炎陵黄桃鲜果礼盒', '5斤礼盒', '/static/images/peach.jpg', 'S004', 1, 68)], 'after_sale', completedAt, `SF-DEMO-${idScope}-003`, { id: `DEMO-CAS-${idScope}-001`, reason: '演示售后', status: 'processing', createdAt: at(12) })
    ], completedAt)
  }
  if (!writeCOrders({ ...existing, ...orders })) return false

  const voucherCreatedAt = at(72)
  const vouchers: VoucherOrder[] = [
    { id: `DEMO-VOUCHER-${idScope}-001`, userId, promoterId: 'T001', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid', createdAt: voucherCreatedAt },
    { id: `DEMO-VOUCHER-${idScope}-002`, userId, promoterId: 'T001', farmId: 'F002', productId: 'P055', skuId: 'P055-1', quantity: 1, amount: 268, status: 'refunded', createdAt: at(120), redeemedAt: at(96), refundedAt: at(24) }
  ]
  if (!vouchers.every((voucher) => writePlatformVoucherOrder(voucher))) return false
  writeStorageFlag(demoOrderSeedMarker(userId))
  return true
}
