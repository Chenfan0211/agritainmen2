import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_OPENID_STORAGE_KEY } from '@agritainment/shared'
import type { UserIdentityProfile, UserIdentityResolver } from '../../src/services/user-identity'
import { configureUserIdentityResolver, configureWechatLoginProvider } from '../../src/services/user-identity'
import { createUserStore } from '../../src/stores/user'

const originalWx = (globalThis as { wx?: unknown }).wx

describe('用户 Store OpenID 自动识别', () => {
  const storage = new Map<string, unknown>()

  beforeEach(() => {
    storage.clear()
    ;(globalThis as { wx?: unknown }).wx = {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => { storage.set(key, value) }
    }
  })

  afterEach(() => {
    configureWechatLoginProvider()
    configureUserIdentityResolver()
    ;(globalThis as { wx?: unknown }).wx = originalWx
  })

  it('authenticate 根据 OpenID 激活团长身份且不写入可切换角色', async () => {
    storage.set(MOCK_OPENID_STORAGE_KEY, 'mock_openid_store_level1')
    const resolver: UserIdentityResolver = {
      resolve: async () => ({ openid: 'mock_openid_store_level1', userId: 'U-STORE-L1', nickname: '测试团长', level: 'level1', leaderId: 'T001', status: 'active' })
    }
    configureUserIdentityResolver(resolver)
    const store = createUserStore()

    await expect(store.authenticate()).resolves.toMatchObject({ userId: 'U-STORE-L1', level: 'level1' })
    expect(store.level).toBe('level1')
    expect(store.currentDistributor).toMatchObject({ promoterId: 'T001', level: 'level1' })
  })

  it('authenticate 身份接口异常时进入可重试错误态而不降级', async () => {
    storage.set(MOCK_OPENID_STORAGE_KEY, 'mock_openid_store_failure')
    const resolver: UserIdentityResolver = { resolve: async () => { throw new Error('identity unavailable') } }
    configureUserIdentityResolver(resolver)
    const store = createUserStore()

    await expect(store.authenticate()).resolves.toBeNull()
    expect(store.identityStatus).toBe('error')
    expect(store.identityError).toBe('身份识别失败，请重试')
    expect(store.level).toBe('normal')
  })

  it('authenticate 透传 openid/loginCode 并记录识别时间', async () => {
    const login = vi.fn().mockResolvedValue({ openid: 'openid-custom', loginCode: 'wx-code-custom' })
    const resolve = vi.fn().mockResolvedValue({ openid: 'openid-custom', userId: 'U-CUSTOM', level: 'normal', status: 'active' })
    configureWechatLoginProvider({ login })
    configureUserIdentityResolver({ resolve })
    const before = Date.now()
    const store = createUserStore()

    await expect(store.authenticate()).resolves.toMatchObject({ userId: 'U-CUSTOM' })
    expect(login).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ openid: 'openid-custom', loginCode: 'wx-code-custom' })
    expect(store.identityCheckedAt).toBeGreaterThanOrEqual(before)
  })

  it('并发 authenticate 复用同一个识别请求', async () => {
    storage.set(MOCK_OPENID_STORAGE_KEY, 'mock_openid_store_concurrent')
    let release!: (profile: UserIdentityProfile) => void
    const pending = new Promise<UserIdentityProfile>((resolve) => { release = resolve })
    const resolve = vi.fn(() => pending)
    configureUserIdentityResolver({ resolve })
    const store = createUserStore()

    const first = store.authenticate()
    const second = store.authenticate()
    await Promise.resolve()
    expect(resolve).toHaveBeenCalledTimes(1)
    release({ openid: 'mock_openid_store_concurrent', userId: 'U-STORE-CONCURRENT', level: 'normal', status: 'active' })

    await expect(first).resolves.toMatchObject({ userId: 'U-STORE-CONCURRENT' })
    await expect(second).resolves.toMatchObject({ userId: 'U-STORE-CONCURRENT' })
  })

  it('authenticate(false) 复用已识别身份，authenticate(true) 强制刷新', async () => {
    storage.set(MOCK_OPENID_STORAGE_KEY, 'mock_openid_store_refresh')
    const resolve = vi.fn()
      .mockResolvedValueOnce({ openid: 'mock_openid_store_refresh', userId: 'U-STORE-L1', level: 'level1', leaderId: 'T001', status: 'active' })
      .mockResolvedValueOnce({ openid: 'mock_openid_store_refresh', userId: 'U-STORE-L2', level: 'level2', leaderId: 'T002', parentLeaderId: 'T001', status: 'active' })
    configureUserIdentityResolver({ resolve })
    const store = createUserStore()

    await expect(store.authenticate()).resolves.toMatchObject({ userId: 'U-STORE-L1' })
    await expect(store.authenticate()).resolves.toMatchObject({ userId: 'U-STORE-L1' })
    expect(resolve).toHaveBeenCalledTimes(1)
    await expect(store.authenticate(true)).resolves.toMatchObject({ userId: 'U-STORE-L2', level: 'level2' })
    expect(resolve).toHaveBeenCalledTimes(2)
  })
})