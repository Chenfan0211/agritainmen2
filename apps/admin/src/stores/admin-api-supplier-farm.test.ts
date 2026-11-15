import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient, defaultAdminRoles } from '@agritainment/shared'
import { useAdminStore } from './admin'
import type { Supplier, FarmStore } from '@agritainment/shared'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function envelope(data: unknown) { return { status: 200, body: { code: 'OK', message: 'ok', data } } }

function assumeAdminSession(store: ReturnType<typeof useAdminStore>) {
  store.apiRole = defaultAdminRoles()[0]
  store.auth = { isLoggedIn: true, account: 'admin', accountId: 'A1', roleId: store.apiRole.id, roleCode: store.apiRole.code, name: '超级管理员' }
}

function supplierSeed(): Supplier {
  return {
    id: 'S1', name: '湘西腊味', region: '湘西', category: '腊味', certified: false, status: 'pending',
    productCount: 0, coop: false, contactPhone: '13787366688', brands: [], serviceRegions: ['湘西'],
    qualification: { businessLicense: { source: 'builtin', path: '' }, permit: { source: 'builtin', path: '' }, validUntil: '', reviewNote: '' }
  } as never
}

function farmSeed(): FarmStore {
  return {
    id: 'F1', name: '石板溪', contact: '王店长', contactPhone: '13800000000', region: '吉首市', distance: 0,
    rating: 5, monthlySales: 0, averageSpend: 0, status: 'pending', selectedCount: 0, gmv: 0,
    image: { source: 'builtin', path: '' }, tags: ['新入驻'], city: '湘西州', availability: 'bookable', address: ''
  } as never
}

describe('admin api P2 supplier farm commission', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('uses server admin login and its permissions in API mode', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
    const transport = vi.fn(async (request) => {
      if (request.url.endsWith('/api/v1/auth/admin/login')) return envelope({ accessToken: 'server-token', refreshToken: 'refresh', profile: { actorType: 'admin', actorId: 'A1', tenantId: 'PLATFORM', displayName: '审核员', roles: ['reviewer'], permissions: ['supplier.audit'] } })
      throw new Error('unexpected ' + request.url)
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport, getAccessToken: () => storage.get('agritainmen-admin-access-token') })
    const store = useAdminStore()
    expect(await store.login('reviewer', 'secret')).toBe(true)
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', body: { account: 'reviewer', password: 'secret' } }))
    expect(storage.get('agritainmen-admin-access-token')).toBe('server-token')
    expect(store.auth).toMatchObject({ isLoggedIn: true, account: 'reviewer', accountId: 'A1', name: '审核员' })
    expect(store.can('supplier.audit')).toBe(true)
    expect(store.can('supplier.create')).toBe(false)
    store.logout()
    expect(storage.has('agritainmen-admin-access-token')).toBe(false)
  })

  it('invites supplier with complete profile through API', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      return envelope({ id: 'S1', name: '湘西腊味', region: '湘西', category: '腊味', contactPhone: '13787366688', status: 'pending', certified: false, profile: { coop: true, brands: ['柴火腊味'], serviceRegions: ['湘西'] } })
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    const result = await store.inviteSupplier({ name: '湘西腊味', category: '腊味', region: '湘西', contactPhone: '13787366688', coop: true, brands: ['柴火腊味'], serviceRegions: ['湘西'], businessLicenseNumber: 'BL-001', permitNumber: 'PM-001', validUntil: '2030-12-31' })
    if (!result.ok) throw new Error('invite failed: ' + result.error + ' calls=' + calls.map((c) => c.method + ' ' + c.url).join(','))
    expect(result.ok).toBe(true)
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/org/suppliers'))
    expect(post).toBeTruthy()
    expect(post.body).toMatchObject({ name: '湘西腊味', region: '湘西', contactPhone: '13787366688', category: '腊味', profile: { coop: true, brands: ['柴火腊味'], serviceRegions: ['湘西'], businessLicenseNumber: 'BL-001', permitNumber: 'PM-001', validUntil: '2030-12-31' } })
    expect(store.suppliers[0]).toMatchObject({ id: 'S1', name: '湘西腊味', region: '湘西', category: '腊味', contactPhone: '13787366688', coop: true })
    expect(store.suppliers[0]?.brands).toEqual(['柴火腊味'])
    expect(store.suppliers[0]?.serviceRegions).toEqual(['湘西'])
  })

  it('updates supplier profile and local state through API', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      return envelope({ id: 'S1', name: '湘西腊味2', region: '长沙', category: '腊味', contactPhone: '13787366688', status: 'cooperating', certified: true, profile: { coop: true, brands: ['A'], serviceRegions: ['长沙'] } })
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [supplierSeed()]
    const result = await store.updateSupplier('S1', { name: '湘西腊味2', category: '腊味', region: '长沙', contactPhone: '13787366688', coop: true, brands: ['A'], serviceRegions: ['长沙'] })
    if (!result.ok) throw new Error('update failed: ' + result.error + ' calls=' + calls.map((c) => c.method + ' ' + c.url).join(','))
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/api/v1/org/suppliers/S1'))
    expect(put).toBeTruthy()
    expect(put.body).toMatchObject({ name: '湘西腊味2', region: '长沙', contactPhone: '13787366688', category: '腊味', profile: { coop: true, brands: ['A'], serviceRegions: ['长沙'] } })
    expect(store.suppliers[0]).toMatchObject({ name: '湘西腊味2', region: '长沙', contactPhone: '13787366688', coop: true })
    expect(store.suppliers[0]?.brands).toEqual(['A'])
  })

  it('audits supplier and keeps cooperate or paused status', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.method === 'POST' && request.url.endsWith('/api/v1/org/suppliers/S1/audit')) {
        return envelope({ id: 'S1', name: '湘西腊味', contactPhone: '13787366688', status: request.body.approved ? 'cooperating' : 'paused', certified: request.body.approved, profile: {} })
      }
      if (request.url.endsWith('/supplier-accounts')) return envelope({ id: 'A1', supplierId: 'S1', account: '13787366688', displayName: '湘西腊味', enabled: true, initialPassword: 'one-time-secret' })
      return envelope({ id: 'S1', status: 'cooperating', certified: true, profile: {} })
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [supplierSeed()]
    expect(await store.auditSupplier('S1', true)).toBe(true)
    expect(calls.find((call) => call.url.endsWith('/audit'))?.body).toEqual({ approved: true })
    expect(store.suppliers[0]).toMatchObject({ status: 'cooperating', certified: true })
    expect(await store.auditSupplier('S1', false)).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/audit')).at(-1)?.body).toEqual({ approved: false })
    expect(store.suppliers[0]).toMatchObject({ status: 'paused', certified: false })
  })

  it('provisions a supplier login after approval and keeps the one-time password in memory', async () => {
    const calls: any[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/audit')) return envelope({ id: 'S1', name: '湘西腊味', contactPhone: '13787366688', status: 'cooperating', certified: true, profile: {} })
      if (request.url.endsWith('/supplier-accounts')) return envelope({ id: 'A1', supplierId: 'S1', account: '13787366688', displayName: '湘西腊味', enabled: true, initialPassword: 'one-time-secret' })
      return envelope({})
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [supplierSeed()]
    expect(await store.auditSupplier('S1', true)).toBe(true)
    expect(calls.map((call) => call.url)).toContain('https://api.example.com/api/v1/auth/admin/supplier-accounts')
    expect(store.supplierAccounts[0]).toMatchObject({ supplierId: 'S1', account: '13787366688', enabled: true })
    expect(store.newSupplierCredential).toEqual({ account: '13787366688', password: 'one-time-secret' })
  })

  it('reports partial approval and retries account creation without repeating the audit', async () => {
    const calls: any[] = []
    let accountFailures = 1
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/audit')) return envelope({ id: 'S1', name: '湘西腊味', contactPhone: '13787366688', status: 'cooperating', certified: true, profile: {} })
      if (request.url.endsWith('/supplier-accounts') && accountFailures-- > 0) return { status: 503, body: { code: 'UNAVAILABLE', message: '账号服务暂不可用', data: null } }
      if (request.url.endsWith('/supplier-accounts')) return envelope({ id: 'A1', supplierId: 'S1', account: '13787366688', displayName: '湘西腊味', enabled: true, initialPassword: 'one-time-secret' })
      return envelope({})
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [supplierSeed()]
    expect(await store.auditSupplier('S1', true)).toBe(false)
    expect(store.suppliers[0]).toMatchObject({ status: 'cooperating', certified: true })
    expect(store.error).toContain('账号开通失败')
    expect(store.supplierAccounts).toHaveLength(0)
    expect(await store.retrySupplierAccountProvision('S1')).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/audit'))).toHaveLength(1)
    expect(store.supplierAccounts[0]?.supplierId).toBe('S1')
  })

  it('updates an API supplier account on the server and preserves local state on failure', async () => {
    let fail = false
    const calls: any[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (fail) return { status: 503, body: { code: 'UNAVAILABLE', message: '账号服务暂不可用', data: null } }
      return envelope({ id: 'A1', supplierId: 'S1', account: '13787366688', displayName: '湘西腊味', enabled: false, freezeReason: (request.body as { freezeReason?: string } | undefined)?.freezeReason || '停用' })
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [{ ...supplierSeed(), status: 'cooperating', certified: true }]
    store.supplierAccounts = [{ id: 'A1', supplierId: 'S1', supplierName: '湘西腊味', account: '13787366688', password: '', enabled: true, createdAt: '', updatedAt: '' }]
    expect(await store.updateSupplierAccount('S1', { enabled: false, freezeReason: '停用' })).toEqual({ ok: true })
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', url: 'https://api.example.com/api/v1/auth/admin/supplier-accounts/S1', body: { enabled: false, freezeReason: '停用' } })
    expect(store.supplierAccounts[0]?.enabled).toBe(false)
    expect(store.supplierAccounts[0]).toMatchObject({ freezeReason: '停用' })
    expect(await store.updateSupplierAccount('S1', { freezeReason: '资质复核' })).toEqual({ ok: true })
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { freezeReason: '资质复核' } })
    expect(store.supplierAccounts[0]).toMatchObject({ freezeReason: '资质复核' })
    fail = true
    expect((await store.updateSupplierAccount('S1', { enabled: true })).ok).toBe(false)
    expect(store.supplierAccounts[0]?.enabled).toBe(false)
  })

  it('pauses and resumes supplier through API', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.method === 'POST' && request.url.endsWith('/pause')) return envelope({ id: 'S1', status: 'paused', certified: true, cooperationPauseReason: '质量问题', profile: {} })
      if (request.method === 'POST' && request.url.endsWith('/resume')) return envelope({ id: 'S1', status: 'cooperating', certified: true, profile: {} })
      return envelope({})
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [{ ...supplierSeed(), certified: true, status: 'cooperating' }]
    expect(await store.pauseSupplier('S1', '质量问题')).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/org/suppliers/S1/pause') && c.body?.reason === '质量问题')).toBe(true)
    expect(store.suppliers[0]?.status).toBe('paused')
    expect(store.suppliers[0]?.cooperationPauseReason).toBe('质量问题')
    expect(await store.resumeSupplier('S1')).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/org/suppliers/S1/resume'))).toBe(true)
    expect(store.suppliers[0]?.status).toBe('cooperating')
  })

  it('creates farm with complete profile through API', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      return envelope({ id: 'F1', name: '石板溪', region: '吉首市', contact: '王店长', contactPhone: '13800000000', status: 'pending', profile: { address: '湖南省湘西州吉首市矮寨镇1号', city: '湘西州', tags: ['新入驻'], rating: 5, averageSpend: 60 } })
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    const saved = await store.addFarm({ name: '石板溪', contact: '王店长', contactPhone: '13800000000', region: '吉首市', districtCode: '433101', detail: '矮寨镇1号', tags: ['新入驻'], rating: 5, averageSpend: 60, status: 'pending' }, async () => ({ status: 'failed', reason: 'REQUEST_FAILED' }))
    if (!saved) throw new Error('farm create failed: ' + store.error + ' calls=' + calls.map((c) => c.method + ' ' + c.url).join(','))
    expect(saved).toBe(true)
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/org/farms'))
    expect(post).toBeTruthy()
    expect(post.body).toMatchObject({ name: '石板溪', region: '吉首市', contact: '王店长', contactPhone: '13800000000', status: 'pending', profile: { city: '湘西州', detail: '矮寨镇1号', tags: ['新入驻'], rating: 5, averageSpend: 60 } })
    expect(post.body.profile.locationStatus).toBe('failed')
    expect(store.farms[0]).toMatchObject({ id: 'F1', name: '石板溪', region: '吉首市', contact: '王店长', contactPhone: '13800000000', status: 'pending', city: '湘西州', address: '湖南省湘西州吉首市矮寨镇1号' })
    expect(store.farms[0]?.tags).toEqual(['新入驻'])
  })

  it('provisions store login after creating the organization account without keeping its password', async () => {
    const calls: any[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/api/v1/org/farm-accounts')) return envelope({ id: 'FACC-1', farm_id: 'F1', account: '13900000001', display_name: '店主', role: 'owner', enabled: true })
      if (request.url.endsWith('/api/v1/auth/admin/store-accounts')) return envelope({ id: 'AUTH-1', storeAccountId: 'FACC-1', farmId: 'F1', account: '13900000001', enabled: true })
      throw new Error('unexpected ' + request.url)
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    expect(await store.addStoreAccount({ farmId: 'F1', name: '店主', account: '13900000001', password: 'secret-1', role: 'owner' })).toBe(true)
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.com/api/v1/org/farm-accounts',
      'https://api.example.com/api/v1/auth/admin/store-accounts'
    ])
    expect(calls[1].body).toEqual({ storeAccountId: 'FACC-1', password: 'secret-1' })
    expect(store.storeAccounts[0]).toMatchObject({ id: 'FACC-1', farmId: 'F1', account: '13900000001', provisioned: true })
    expect(store.storeAccounts[0].password).toBe('')
  })

  it('retries a failed store login provision without creating a second organization account', async () => {
    const calls: any[] = []
    let fail = true
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      if (request.url.endsWith('/api/v1/org/farm-accounts')) return envelope({ id: 'FACC-2', farm_id: 'F1', account: '13900000002', display_name: '店员', role: 'staff', enabled: true })
      if (request.url.endsWith('/api/v1/auth/admin/store-accounts')) {
        if (fail) return { status: 503, body: { code: 'UNAVAILABLE', message: '账号服务暂不可用' } }
        return envelope({ id: 'AUTH-2', storeAccountId: 'FACC-2', farmId: 'F1', account: '13900000002', enabled: true })
      }
      throw new Error('unexpected ' + request.url)
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    const payload = { farmId: 'F1', name: '店员', account: '13900000002', password: 'secret-2', role: 'staff' as const }
    expect(await store.addStoreAccount(payload)).toBe(false)
    expect(store.error).toContain('组织账号已创建')
    expect(store.storeAccounts[0]).toMatchObject({ id: 'FACC-2', provisioned: false })
    fail = false
    expect(await store.addStoreAccount(payload)).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/api/v1/org/farm-accounts'))).toHaveLength(1)
    expect(store.storeAccounts[0]).toMatchObject({ id: 'FACC-2', provisioned: true })
    expect(store.storeAccounts[0].password).toBe('')
  })

  it('rejects unsupported credential and role edits in API mode', async () => {
    const calls: any[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      calls.push(request)
      return envelope({ id: 'FACC-1', farm_id: 'F1', account: '13900000001', display_name: '新店主', role: 'owner', enabled: true })
    } })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.storeAccounts = [{ id: 'FACC-1', farmId: 'F1', name: '店主', account: '13900000001', password: '', role: 'owner', enabled: true }]
    expect(await store.updateStoreAccount('FACC-1', { account: '13900000002' })).toBe(false)
    expect(await store.updateStoreAccount('FACC-1', { password: 'new-secret' })).toBe(false)
    expect(await store.updateStoreAccount('FACC-1', { role: 'staff' })).toBe(false)
    expect(calls).toHaveLength(0)
    expect(await store.updateStoreAccount('FACC-1', { name: '新店主' })).toBe(true)
    expect(store.storeAccounts[0].name).toBe('新店主')
    expect(store.storeAccounts[0].account).toBe('13900000001')
  })

  it('updates farm profile and local state through API', async () => {
    const calls: any[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      return envelope({ id: 'F1', name: '石板溪2', region: '吉首市', contact: '李店长', contactPhone: '13800000001', status: 'active', profile: { address: '湖南省湘西州吉首市矮寨镇2号', city: '湘西州', tags: ['重点'], rating: 4, averageSpend: 55 } })
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.farms = [{ ...farmSeed(), locationStatus: 'resolved', location: { coordinateSystem: 'GCJ-02', longitude: 109.7, latitude: 28.3 } } as FarmStore]
    const saved = await store.updateFarm('F1', { name: '石板溪2', contact: '李店长', contactPhone: '13800000001', region: '吉首市', districtCode: '433101', detail: '矮寨镇2号', tags: ['重点'], rating: 4, averageSpend: 55, status: 'active' }, async () => ({ status: 'failed', reason: 'REQUEST_FAILED' }))
    if (!saved) throw new Error('farm update failed: ' + store.error + ' calls=' + calls.map((c) => c.method + ' ' + c.url).join(','))
    expect(saved).toBe(true)
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/api/v1/org/farms/F1'))
    expect(put).toBeTruthy()
    expect(put.body).toMatchObject({ name: '石板溪2', region: '吉首市', contact: '李店长', contactPhone: '13800000001', status: 'active', profile: { city: '湘西州', detail: '矮寨镇2号', tags: ['重点'], rating: 4, averageSpend: 55 } })
    expect(put.body.profile.locationStatus).toBe('failed')
    expect(put.body.profile.location).toBeUndefined()
    expect(store.farms[0]).toMatchObject({ name: '石板溪2', contact: '李店长', contactPhone: '13800000001', status: 'active', city: '湘西州', address: '湖南省湘西州吉首市矮寨镇2号' })
  })

  it('surfaces API failure without mutating local supplier or farm state', async () => {
    const transport = vi.fn(async () => ({ status: 409, body: { code: 'CONFLICT', message: '名称已存在', data: null } }))
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    assumeAdminSession(store)
    store.suppliers = [supplierSeed()]
    store.farms = [farmSeed()]
    const before = JSON.stringify({ suppliers: store.suppliers, farms: store.farms })
    const invite = await store.inviteSupplier({ name: '新供应商', category: '腊味', contactPhone: '13900000000' })
    expect(invite).toEqual({ ok: false, error: '名称已存在' })
    const update = await store.updateSupplier('S1', { name: '改名供应商', category: '腊味', contactPhone: '13787366688' })
    expect(update).toEqual({ ok: false, error: '名称已存在' })
    const farm = await store.addFarm({ name: '新门店', region: '吉首市', districtCode: '433101', detail: '矮寨镇1号' }, async () => ({ status: 'failed', reason: 'REQUEST_FAILED' }))
    expect(farm).toBe(false)
    expect(store.error).toBe('名称已存在')
    expect(JSON.stringify({ suppliers: store.suppliers, farms: store.farms })).toBe(before)
  })
})
