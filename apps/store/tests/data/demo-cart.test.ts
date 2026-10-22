import { describe, expect, it } from 'vitest'
import { seedDemoStoreCart } from '../../src/data/demo-cart'

const product = {
  id: 'P001', name: '湘西烟熏柴火腊肉', image: '/static/images/bacon.jpg', price: 59.9,
  skus: [{ id: 'P001-500', name: '500g', cost: 39.9, stock: 20, minimumOrderQuantity: 1 }]
}

describe('store demo cart seed', () => {
  it('prefill one line when cart is empty and stays idempotent', () => {
    const first = seedDemoStoreCart([], [product as never], 'normal')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ productId: 'P001', skuId: 'P001-500' })
    expect(seedDemoStoreCart(first, [product as never], 'normal')).toEqual(first)
    expect(seedDemoStoreCart([], [product as never], 'empty')).toEqual([])
  })
})
