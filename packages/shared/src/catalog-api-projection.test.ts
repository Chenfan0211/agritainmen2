import { describe, expect, it } from 'vitest'
import { toProduct } from './catalog-api'

describe('catalog product projection', () => {
  it('projects server fields into the shared product model', () => {
    const product = toProduct({
      id: 'P1', supplierId: 'S1', name: '腊肉', category: 'fresh', channel: 'store', enabled: true,
      skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }]
    })
    expect(product).toMatchObject({ id: 'P1', name: '腊肉', supplierId: 'S1', status: 'active', price: 59.9 })
    expect(product.skus).toHaveLength(1)
  })
})
