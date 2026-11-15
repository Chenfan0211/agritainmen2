import { apiRequest, mediaValueToImage } from '@agritainment/shared'
import type { Product } from '@agritainment/shared'
import type { StoreOrder, StoreOrderStatus } from '../stores/store'

interface ApiOrderLine {
  skuId: string
  productId: string
  name: string
  unitPriceCents: number
  quantity: number
}

interface ApiOrder {
  id: string
  orderNo: string
  buyerId: string
  status: string
  amountCents: number
  receiver: string
  receiverPhone: string
  address: string
  items: ApiOrderLine[]
  createdAt: string
}

interface ApiOrderPage {
  items: ApiOrder[]
  page: number
  pageSize: number
  total: number
}

const statusMap: Record<string, StoreOrderStatus> = {
  PENDING_PAYMENT: 'pending-payment', PAID: 'submitted', ACCEPTED: 'accepted',
  SHIPPED: 'shipped', DELIVERING: 'delivering', RECEIVED: 'received',
  COMPLETED: 'completed', PAID_CANCELLED: 'paid-cancelled', UNPAID_CANCELLED: 'unpaid-cancelled'
}

function mapOrder(order: ApiOrder, farmId: string, products: Product[]): StoreOrder {
  if (!order || order.buyerId !== farmId || !order.id) throw new Error('订单与当前门店不匹配')
  const status = statusMap[order.status]
  if (!status) throw new Error(`服务端订单状态暂不支持：${order.status || '空'}`)
  const createdAt = Date.parse(order.createdAt)
  if (!Number.isFinite(createdAt) || !Number.isSafeInteger(order.amountCents) || order.amountCents < 0
    || !Array.isArray(order.items) || order.items.length === 0) throw new Error('服务端订单数据无效')
  const items = order.items.map((line) => {
    if (!line.skuId || !line.productId || !line.name || !Number.isSafeInteger(line.unitPriceCents)
      || line.unitPriceCents < 0 || !Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('服务端订单商品数据无效')
    const product = products.find((candidate) => candidate.id === line.productId)
    const sku = product?.skus.find((candidate) => candidate.id === line.skuId)
    return { productId: line.productId, skuId: line.skuId, name: line.name, skuName: sku?.name || '规格',
      image: mediaValueToImage(sku?.image || product?.image || ''), price: line.unitPriceCents / 100, quantity: line.quantity }
  })
  return {
    id: order.id, orderNo: order.orderNo, farmId, status, amount: order.amountCents / 100,
    saved: 0, itemCount: items.reduce((total, item) => total + item.quantity, 0), items,
    createdAt: new Date(createdAt).toLocaleString('zh-CN'), logistics: [],
    receiver: order.receiver, receiverPhone: order.receiverPhone, address: order.address
  }
}

export async function listStoreOrders(farmId: string, products: Product[]): Promise<StoreOrder[]> {
  const orders: Array<{ view: StoreOrder; createdAt: number }> = []
  const ids = new Set<string>()
  let page = 1
  let total = 0
  do {
    const result = await apiRequest<ApiOrderPage>(`/api/v1/orders?buyerId=${encodeURIComponent(farmId)}&page=${page}&pageSize=200`)
    if (result?.page !== page || result.pageSize !== 200 || !Number.isSafeInteger(result.total) || result.total < 0
      || !Array.isArray(result.items) || result.items.length > 200 || (result.total > orders.length && result.items.length === 0)) {
      throw new Error('服务端订单分页响应无效')
    }
    if (page === 1) total = result.total
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error('服务端订单分页包含重复订单')
      ids.add(item.id)
      orders.push({ view: mapOrder(item, farmId, products), createdAt: Date.parse(item.createdAt) })
    }
    page += 1
  } while (orders.length < total)
  if (orders.length !== total) throw new Error('服务端订单分页数量不一致')
  return orders.sort((left, right) => right.createdAt - left.createdAt || right.view.id.localeCompare(left.view.id))
    .map(({ view }) => view)
}

export async function getStoreOrder(id: string, farmId: string, products: Product[]): Promise<StoreOrder> {
  if (!id.trim()) throw new Error('订单号不能为空')
  const order = await apiRequest<ApiOrder>(`/api/v1/orders/${encodeURIComponent(id)}`)
  if (order?.id !== id) throw new Error('服务端订单数据无效')
  return mapOrder(order, farmId, products)
}
