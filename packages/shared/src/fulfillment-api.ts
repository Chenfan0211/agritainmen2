import { apiRequest } from './api-client'

export interface FulfillmentOrderDto {
  id: string
  order_id: string
  supplier_id: string
  status: string
  ship_type?: string
  tracking_no?: string
  driver_id?: string
}

export interface FulfillmentPageDto<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface FulfillmentOrderView {
  id: string
  orderId: string
  supplierId: string
  status: 'pending' | 'shipping' | 'delivered'
  supplierFulfillment: { status: 'submitted' | 'accepted' | 'shipped' | 'received'; shipType?: 'courier' | 'driver'; trackingNo?: string; driverId?: string }
  createdAt: string
  amount: number
}

export interface FulfillmentQuery {
  supplierId?: string
  page?: number
  pageSize?: number
}

export type FulfillmentRequest = <T>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string; headers?: Record<string, string> }) => Promise<T>

function normalizePage(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function mapStatus(status: string): FulfillmentOrderView['status'] {
  if (status === 'SHIPPED') return 'shipping'
  if (status === 'RECEIVED') return 'delivered'
  return 'pending'
}

function mapFulfillmentStatus(status: string): FulfillmentOrderView['supplierFulfillment']['status'] {
  if (status === 'ACCEPTED') return 'accepted'
  if (status === 'SHIPPED') return 'shipped'
  if (status === 'RECEIVED') return 'received'
  return 'submitted'
}

export function createFulfillmentApiClient(request: FulfillmentRequest = apiRequest) {
  return {
    async listOrders(query: FulfillmentQuery = {}): Promise<FulfillmentPageDto<FulfillmentOrderView>> {
      const page = normalizePage(query.page, 1)
      const pageSize = normalizePage(query.pageSize, 20)
      if (pageSize > 200) throw new Error('pageSize 必须在 1-200 之间')
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (query.supplierId?.trim()) params.set('supplierId', query.supplierId.trim())
      const result = await request<FulfillmentPageDto<FulfillmentOrderDto>>(`/api/v1/fulfillment/orders?${params.toString()}`)
      return {
        ...result,
        items: (result.items || []).map((row) => ({
          id: row.id,
          orderId: row.order_id,
          supplierId: row.supplier_id,
          status: mapStatus(row.status),
          supplierFulfillment: {
            status: mapFulfillmentStatus(row.status),
            ...(row.ship_type === 'courier' || row.ship_type === 'driver' ? { shipType: row.ship_type } : {}),
            ...(row.tracking_no ? { trackingNo: row.tracking_no } : {}),
            ...(row.driver_id ? { driverId: row.driver_id } : {}),
          },
          createdAt: '',
          amount: 0,
        }))
      }
    }
  }
}
