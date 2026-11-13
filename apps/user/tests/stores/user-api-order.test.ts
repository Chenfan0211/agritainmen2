import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { createUserStore } from '../../src/stores/user'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function catalogResponse() {
  return { status: 200, body: { code: 'OK', message: 'ok', data: { items: [{ id: 'P1', supplierId: 'S1', name: '商城商品', category: 'fresh', channel: 'live', enabled: true, skus: [{ id: 'SKU1', name: '500g', priceCents: 5990, enabled: true }] }], page: 1, pageSize: 200, total: 1 } } }
}

describe('user api order submit', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('posts the mall cart to the order API and keeps the cart on failure', async () => {
    const transport = vi.fn(async (request) => {
      if (request.url.includes('/catalog/products')) return catalogResponse()
      if (request.url.includes('/inventory/available')) return { status: 200, body: { code: 'OK', message: 'ok', data: { SKU1: 9 } } }
      expect(request.method).toBe('POST')
      expect(request.headers['Idempotency-Key']).toMatch(/^order-/)
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: '下单失败' } }
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = createUserStore()
    await store.initialize()
    store.cProducts = store.products.map((product) => ({ id: product.id, supplierId: product.supplierId || 'S1', name: product.name, category: product.category, status: 'active', shippingType: 'courier', image: product.image, skus: product.skus.map((sku) => ({ id: sku.id, name: sku.name, basePrice: sku.price, level1Commission: 0, level2Commission: 0, stock: sku.stock })) } as never))
    store.userId = 'U1'
    store.addresses = [{ id: 'A1', userId: 'U1', receiver: '张三', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true, updatedAt: '' }]
    store.addToCart('P1', 'SKU1')
    if (!store.addToCart('P1', 'SKU1')) throw new Error('add failed: ' + store.checkoutError)
    const result = await store.submitOrder()
    expect(result).toBe(false)
    expect(store.checkoutError).toContain('下单失败')
    expect(store.cart).toHaveLength(1)
  })
})
