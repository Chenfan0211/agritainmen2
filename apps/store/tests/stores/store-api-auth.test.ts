import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '@agritainment/shared'
import { resetStoreStore, useStoreStore } from '../../src/stores/store'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function envelope(data: unknown) { return { status: 200, body: { code: 'OK', data } } }

describe('store API authentication', () => {
  const tokens = new Map<string, string>()
  beforeEach(() => {
    resetStoreStore()
    localStorage.clear()
    tokens.clear()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => tokens.get(key),
      setStorageSync: (key: string, value: string) => { tokens.set(key, value) },
      removeStorageSync: (key: string) => { tokens.delete(key) }
    })
  })

  it('logs in through Auth and stores server tokens, then revokes refresh on logout', async () => {
    const calls: any[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/api/v1/auth/store/login')) return envelope({ accessToken: 'access-a', refreshToken: 'refresh-a', profile: { actorType: 'store', actorId: 'AUTH-1', tenantId: 'PLATFORM', displayName: '王店长', farmId: 'F001', roles: ['store', 'owner'] } })
      if (request.url.endsWith('/api/v1/auth/store/farm')) return envelope({ farmId: 'F001', name: '石板溪', contact: '王店长', contactPhone: '13900000111', address: '湖南省门店1号', priceLevel: null })
      if (request.url.includes('/api/v1/catalog/products')) return envelope({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/api/v1/orders?')) return envelope({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.endsWith('/api/v1/auth/logout')) return envelope(true)
      throw new Error('unexpected ' + request.url)
    } })
    const store = useStoreStore()
    expect(await store.loginWithPassword('13900000001', 'secret', 'owner')).toBe(true)
    expect(calls[0]).toMatchObject({ method: 'POST', body: { account: '13900000001', password: 'secret' } })
    expect(store.auth).toMatchObject({ isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F001', role: 'owner' })
    expect(store.info).toMatchObject({ name: '石板溪·门店', phone: '13900000111', address: '湖南省门店1号' })
    expect(tokens.get('agritainmen-store-access-token')).toBe('access-a')
    expect(tokens.get('agritainmen-store-refresh-token')).toBe('refresh-a')
    store.orders = [{ id: 'O1', farmId: 'F001' } as (typeof store.orders)[number]]
    await store.logout()
    expect(calls[1].url).toContain('/api/v1/auth/store/farm')
    expect(calls.find((call) => call.url.endsWith('/api/v1/auth/logout'))?.body).toEqual({ refreshToken: 'refresh-a' })
    expect(tokens.size).toBe(0)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.orders).toHaveLength(0)
  })

  it('rejects mismatched role and server login failure without using local demo accounts', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => envelope({ accessToken: 'wrong', refreshToken: 'wrong-refresh', profile: { actorType: 'store', actorId: 'AUTH-2', tenantId: 'PLATFORM', farmId: 'F002', roles: ['store', 'staff'] } }) })
    const store = useStoreStore()
    expect(await store.loginWithPassword('13900000002', 'secret', 'owner')).toBe(false)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(tokens.size).toBe(0)
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => ({ status: 401, body: { code: 'UNAUTHORIZED', message: '账号或密码错误' } }) })
    expect(await store.loginWithPassword('13800000001', '123456')).toBe(false)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.error).toContain('账号或密码错误')
  })

  it('uses the server price level for a staff login', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.endsWith('/api/v1/auth/store/login')) return envelope({ accessToken: 'access-b', refreshToken: 'refresh-b', profile: { actorType: 'store', actorId: 'AUTH-2', tenantId: 'PLATFORM', farmId: 'F002', roles: ['store', 'staff'] } })
      if (request.url.endsWith('/api/v1/auth/store/farm')) return envelope({ farmId: 'F002', name: '茶园店', contact: '李店员', contactPhone: '13900000222', address: '湖南省门店2号', priceLevel: 'B' })
      if (request.url.includes('/api/v1/catalog/products')) return envelope({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/api/v1/orders?')) return envelope({ items: [], page: 1, pageSize: 200, total: 0 })
      throw new Error('unexpected ' + request.url)
    } })
    const store = useStoreStore()
    expect(await store.loginWithPassword('13900000002', 'secret', 'staff')).toBe(true)
    expect(store.auth).toMatchObject({ farmId: 'F002', role: 'staff', priceLevel: 'B' })
    expect(store.info).toMatchObject({ phone: '13900000222', address: '湖南省门店2号' })
  })

  it('disables demo SMS login and clears a stale API session', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => ({ status: 401, body: { code: 'UNAUTHORIZED', message: '已失效' } }) })
    const store = useStoreStore()
    expect(store.loginWithCode('13800000001', '123456')).toBe(false)
    expect(store.error).toContain('验证码')
    store.auth = { isLoggedIn: true, phone: '13900000001', principal: null, accountId: 'AUTH-1', farmId: 'F001', tenantId: 'PLATFORM', role: 'owner', priceLevel: null }
    tokens.set('agritainmen-store-access-token', 'stale')
    tokens.set('agritainmen-store-refresh-token', 'stale-refresh')
    await store.refreshSharedState()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(tokens.size).toBe(0)
  })

  it('does not establish an API session when farm profile lookup fails', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      if (request.url.endsWith('/api/v1/auth/store/login')) return envelope({ accessToken: 'access', refreshToken: 'refresh', profile: { actorType: 'store', actorId: 'AUTH-3', tenantId: 'PLATFORM', farmId: 'F003', roles: ['store', 'staff'] } })
      return { status: 503, body: { code: 'UNAVAILABLE', message: '门店资料暂不可用' } }
    } })
    const store = useStoreStore()
    expect(await store.loginWithPassword('13900000003', 'secret', 'staff')).toBe(false)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(tokens.size).toBe(0)
  })

  it('restores a saved API token through Auth and reloads that farm history', async () => {
    tokens.set('agritainmen-store-access-token', 'saved-access')
    tokens.set('agritainmen-store-refresh-token', 'saved-refresh')
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => tokens.get('agritainmen-store-access-token'), transport: async (request) => {
      if (request.url.endsWith('/auth/me')) {
        expect(request.headers.Authorization).toBe('Bearer saved-access')
        return envelope({ actorType: 'store', actorId: 'AUTH-1', tenantId: 'PLATFORM', farmId: 'F001', roles: ['store', 'owner'] })
      }
      if (request.url.endsWith('/auth/store/farm')) return envelope({ farmId: 'F001', name: '石板溪', contact: '王店长', contactPhone: '13900000111', address: '湖南省门店1号', priceLevel: null })
      if (request.url.includes('/catalog/products')) return envelope({ items: [], page: 1, pageSize: 200, total: 0 })
      if (request.url.includes('/api/v1/orders?')) return envelope({ items: [{ id: 'O-RESTORED', orderNo: 'NO-1', buyerId: 'F001', status: 'PAID', amountCents: 100, receiver: '王店长', receiverPhone: '13900000111', address: '湖南省门店1号', createdAt: '2026-11-15T10:00:00Z', items: [{ skuId: 'SKU1', productId: 'P1', name: '腊肉', unitPriceCents: 100, quantity: 1 }] }], page: 1, pageSize: 200, total: 1 })
      throw new Error(`unexpected ${request.url}`)
    } })
    const store = useStoreStore()
    expect(await store.restoreApiSession()).toBe(true)
    expect(store.auth).toMatchObject({ isLoggedIn: true, accountId: 'AUTH-1', farmId: 'F001' })
    expect(store.orders.map((item) => item.id)).toEqual(['O-RESTORED'])
  })

  it('rejects a stored identity when no server token remains', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com' })
    const store = useStoreStore()
    store.auth = { ...store.auth, isLoggedIn: true, accountId: 'OLD', farmId: 'F001', tenantId: 'PLATFORM', role: 'owner' }
    store.orders = [{ id: 'OLD' } as (typeof store.orders)[number]]
    expect(await store.restoreApiSession()).toBe(false)
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.orders).toHaveLength(0)
  })
})
