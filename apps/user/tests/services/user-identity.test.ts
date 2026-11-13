import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEMO_IDENTITY_OPENIDS,
  UserIdentityDataError,
  configureUserIdentityResolver,
  configureWechatLoginProvider,
  createDemoUserIdentityResolver,
  getUserIdentityResolver,
  getWechatLoginProvider,
  shouldRefreshUserIdentity,
  loadUserIdentityProfile,
  normalizeUserIdentityProfile,
  userIdentityErrorMessage
} from '../../src/services/user-identity'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

describe('用户 OpenID 身份适配层', () => {
  beforeEach(() => localStorage.clear())

  it('按测试 OpenID 返回普通用户、一级团长和二级团长', async () => {
    const resolver = createDemoUserIdentityResolver()
    await expect(resolver.resolve({ openid: DEMO_IDENTITY_OPENIDS.normal })).resolves.toMatchObject({
      userId: 'U-DEMO-NORMAL', level: 'normal', status: 'active'
    })
    await expect(resolver.resolve({ openid: DEMO_IDENTITY_OPENIDS.level1 })).resolves.toMatchObject({
      userId: 'U-DEMO-L1', level: 'level1', leaderId: 'T001', status: 'active'
    })
    await expect(resolver.resolve({ openid: DEMO_IDENTITY_OPENIDS.level2 })).resolves.toMatchObject({
      userId: 'U-DEMO-L2', level: 'level2', leaderId: 'T002', parentLeaderId: 'T001', status: 'active'
    })
  })

  it('未知 OpenID 建立稳定 userId 并降级为普通用户', async () => {
    const resolver = createDemoUserIdentityResolver()
    const first = await loadUserIdentityProfile(resolver, { openid: 'mock_openid_unknown' })
    const second = await loadUserIdentityProfile(resolver, { openid: 'mock_openid_unknown' })

    expect(first).toMatchObject({ openid: 'mock_openid_unknown', level: 'normal', status: 'active' })
    expect(first.userId).toMatch(/^U/)
    expect(second.userId).toBe(first.userId)
  })

  it('停用团长按普通用户进入且不保留团长运营身份', async () => {
    const resolver = createDemoUserIdentityResolver()
    const profile = await loadUserIdentityProfile(resolver, { openid: DEMO_IDENTITY_OPENIDS.pausedLeader })

    expect(profile).toMatchObject({ userId: 'U-DEMO-PAUSED', level: 'normal', status: 'disabled' })
    expect(profile.leaderId).toBeUndefined()
    expect(profile.parentLeaderId).toBeUndefined()
  })

  it('身份接口失败时拒绝静默降级', async () => {
    const resolver = { resolve: vi.fn().mockRejectedValue(new Error('identity timeout')) }
    await expect(loadUserIdentityProfile(resolver, { openid: 'mock_openid_failing' })).rejects.toThrow('identity timeout')
  })

  it('默认安装演示 Provider，显式配置后读取新 Provider', () => {
    const defaultResolver = getUserIdentityResolver()
    expect(defaultResolver).toBeTypeOf('object')
    const customResolver = createDemoUserIdentityResolver()
    expect(configureUserIdentityResolver(customResolver)).toBe(customResolver)
    expect(getUserIdentityResolver()).toBe(customResolver)
    configureUserIdentityResolver()
    expect(getUserIdentityResolver()).not.toBe(customResolver)
  })

  it('默认登录 Provider 可用，显式配置后读取新 Provider', async () => {
    const defaultProvider = getWechatLoginProvider()
    await expect(defaultProvider.login()).resolves.toMatchObject({ openid: expect.stringMatching(/^mock_openid_/) })
    const customProvider = { login: async () => ({ loginCode: 'wx-code-1' }) }
    expect(configureWechatLoginProvider(customProvider)).toBe(customProvider)
    expect(getWechatLoginProvider()).toBe(customProvider)
    await expect(getWechatLoginProvider().login()).resolves.toEqual({ loginCode: 'wx-code-1' })
    configureWechatLoginProvider()
  })

  it('loginCode-only 可由服务端返回完整身份档案，缺少凭证时报错', async () => {
    const resolve = vi.fn().mockResolvedValue({ openid: 'openid-server', userId: 'U-SERVER', level: 'normal', status: 'active' })
    await expect(loadUserIdentityProfile({ resolve }, { loginCode: 'wx-code-2' })).resolves.toMatchObject({ openid: 'openid-server', userId: 'U-SERVER' })
    expect(resolve).toHaveBeenCalledWith({ loginCode: 'wx-code-2' })
    await expect(loadUserIdentityProfile({ resolve: async () => null }, {})).rejects.toBeInstanceOf(UserIdentityDataError)
    await expect(loadUserIdentityProfile({ resolve: async () => null }, { loginCode: 'wx-code-3' })).rejects.toBeInstanceOf(UserIdentityDataError)
  })

  it('前台刷新按五分钟节流', () => {
    const now = 10_000_000
    expect(shouldRefreshUserIdentity(0, now)).toBe(true)
    expect(shouldRefreshUserIdentity(now - 4 * 60 * 1000, now)).toBe(false)
    expect(shouldRefreshUserIdentity(now - 5 * 60 * 1000, now)).toBe(true)
  })

  it('身份错误转换为用户可读文案', () => {
    expect(userIdentityErrorMessage(new UserIdentityDataError())).toContain('用户身份资料异常')
    expect(userIdentityErrorMessage(new Error('request:fail timeout'))).toContain('网络异常')
    expect(userIdentityErrorMessage(new Error('unexpected'))).toContain('身份识别失败')
  })

it('非法身份响应返回可重试的数据错误', () => {
    expect(() => normalizeUserIdentityProfile({
      openid: 'mock_openid_invalid',
      userId: 'U-INVALID',
      level: 'level1',
      status: 'active'
    }, {
      openid: 'mock_openid_invalid',
      fallbackUserId: 'U-INVALID'
    })).toThrow(UserIdentityDataError)
  })
})
