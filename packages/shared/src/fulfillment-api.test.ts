import { describe, expect, it, vi } from 'vitest'
import { createFulfillmentApiClient, type FulfillmentRequest } from './fulfillment-api'

describe('fulfillment api client', () => {
  it('maps snake_case fulfillment rows into workbench orders', async () => {
    const request = vi.fn(async () => ({ items: [{ id: 'F1', order_id: 'O1', supplier_id: 'S1', status: 'ACCEPTED', ship_type: 'driver', tracking_no: 'T1', driver_id: 'D1' }], page: 1, pageSize: 20, total: 1 }))
    const result = await createFulfillmentApiClient(request as unknown as FulfillmentRequest).listOrders({ supplierId: 'S1' })
    expect(result.items[0]).toMatchObject({ id: 'F1', orderId: 'O1', supplierId: 'S1', status: 'pending', supplierFulfillment: { status: 'accepted', shipType: 'driver' } })
  })
  it('rejects page size above maximum', async () => {
    const request = vi.fn()
    await expect(createFulfillmentApiClient(request).listOrders({ pageSize: 201 })).rejects.toThrow(/pageSize/)
    expect(request).not.toHaveBeenCalled()
  })
})
