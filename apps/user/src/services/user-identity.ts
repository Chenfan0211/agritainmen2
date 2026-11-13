import { apiRequest, MOCK_OPENID_STORAGE_KEY, resolveUserIdentity, simulateWechatLogin, writeUserLink } from '@agritainment/shared'
import { saveUserTokens } from './api-runtime'

export type UserIdentityLevel = 'normal' | 'level1' | 'level2'
export type UserIdentityStatus = 'active' | 'disabled'

export interface UserIdentityLookupInput {
  openid?: string
  loginCode?: string
}

export interface UserIdentityProfile {
  openid: string
  userId: string
  nickname?: string
  avatarUrl?: string
  level: UserIdentityLevel
  leaderId?: string
  parentLeaderId?: string
  status: UserIdentityStatus
}

export interface WechatLoginResult {
  openid?: string
  loginCode?: string
}

export interface WechatLoginProvider {
  login(): Promise<WechatLoginResult>
}

export interface UserIdentityResolver {
  resolve(input: UserIdentityLookupInput): Promise<UserIdentityProfile | null>
}

export const DEMO_IDENTITY_OPENIDS = {
  normal: 'mock_openid_demo_normal',
  level1: 'mock_openid_demo_level1',
  level2: 'mock_openid_demo_level2',
  pausedLeader: 'mock_openid_demo_leader_paused'
} as const

export class UserIdentityDataError extends Error {
  constructor(message = '身份资料格式异常') {
    super(message)
    this.name = 'UserIdentityDataError'
  }
}

const DEMO_IDENTITY_RECORDS: Record<string, UserIdentityProfile> = {
  [DEMO_IDENTITY_OPENIDS.normal]: {
    openid: DEMO_IDENTITY_OPENIDS.normal,
    userId: 'U-DEMO-NORMAL',
    nickname: '王小满',
    level: 'normal',
    status: 'active'
  },
  [DEMO_IDENTITY_OPENIDS.level1]: {
    openid: DEMO_IDENTITY_OPENIDS.level1,
    userId: 'U-DEMO-L1',
    nickname: '李湘云',
    level: 'level1',
    leaderId: 'T001',
    status: 'active'
  },
  [DEMO_IDENTITY_OPENIDS.level2]: {
    openid: DEMO_IDENTITY_OPENIDS.level2,
    userId: 'U-DEMO-L2',
    nickname: '周巧云',
    level: 'level2',
    leaderId: 'T002',
    parentLeaderId: 'T001',
    status: 'active'
  },
  [DEMO_IDENTITY_OPENIDS.pausedLeader]: {
    openid: DEMO_IDENTITY_OPENIDS.pausedLeader,
    userId: 'U-DEMO-PAUSED',
    nickname: '停用团长',
    level: 'level1',
    leaderId: 'T001',
    status: 'disabled'
  }
}

export const USER_IDENTITY_REFRESH_INTERVAL_MS = 5 * 60 * 1000

let configuredWechatLoginProvider: WechatLoginProvider = createDemoWechatLoginProvider()
let configuredUserIdentityResolver: UserIdentityResolver = createDemoUserIdentityResolver()

/** 安装微信登录 Provider；不传参数时恢复演示实现。 */
export function configureWechatLoginProvider(provider?: WechatLoginProvider): WechatLoginProvider {
  configuredWechatLoginProvider = provider || createDemoWechatLoginProvider()
  return configuredWechatLoginProvider
}

/** 读取当前微信登录 Provider。 */
export function getWechatLoginProvider(): WechatLoginProvider {
  return configuredWechatLoginProvider
}

/** 判断前台重新识别是否已达到节流间隔。 */
export function shouldRefreshUserIdentity(checkedAt: number, now = Date.now(), interval = USER_IDENTITY_REFRESH_INTERVAL_MS): boolean {
  return !checkedAt || now - checkedAt >= interval
}

/** 安装用户身份 Provider；不传参数时恢复演示 Provider。 */
export function configureUserIdentityResolver(resolver?: UserIdentityResolver): UserIdentityResolver {
  configuredUserIdentityResolver = resolver || createDemoUserIdentityResolver()
  return configuredUserIdentityResolver
}

/** 读取当前用户身份 Provider，供 Store 每次识别时取最新实现。 */
export function getUserIdentityResolver(): UserIdentityResolver {
  return configuredUserIdentityResolver
}

/** 将底层异常转换为用户可读且不泄露实现细节的提示。 */
export function userIdentityErrorMessage(error: unknown): string {
  if (error instanceof UserIdentityDataError) return '用户身份资料异常，请联系管理员'
  const message = error instanceof Error ? error.message : String(error || '')
  if (/timeout|timed out|network|request:fail|超时|网络/i.test(message)) return '网络异常，请稍后重试'
  return '身份识别失败，请重试'
}

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

function requireProfileField(value: unknown, field: string): string {
  const normalized = clean(value)
  if (!normalized) throw new UserIdentityDataError(`身份资料缺少 ${field}`)
  return normalized
}

/** 将服务端身份资料规范化为用户端唯一可消费的角色模型。 */
export function normalizeUserIdentityProfile(
  profile: UserIdentityProfile | null,
  input: { openid: string; fallbackUserId: string }
): UserIdentityProfile {
  const openid = requireProfileField(input.openid, 'openid')
  const fallbackUserId = requireProfileField(input.fallbackUserId, 'userId')
  if (!profile) return { openid, userId: fallbackUserId, level: 'normal', status: 'active' }
  if (typeof profile !== 'object') throw new UserIdentityDataError()
  if (requireProfileField(profile.openid, 'openid') !== openid) throw new UserIdentityDataError('身份资料 openid 不一致')
  const userId = requireProfileField(profile.userId, 'userId')
  const level = profile.level
  const status = profile.status
  if (level !== 'normal' && level !== 'level1' && level !== 'level2') throw new UserIdentityDataError('身份资料 level 无效')
  if (status !== 'active' && status !== 'disabled') throw new UserIdentityDataError('身份资料 status 无效')
  const nickname = clean(profile.nickname) || undefined
  const avatarUrl = clean(profile.avatarUrl) || undefined
  if (status === 'disabled') return { openid, userId, nickname, avatarUrl, level: 'normal', status }
  if (level === 'normal') return { openid, userId, nickname, avatarUrl, level, status }
  const leaderId = requireProfileField(profile.leaderId, 'leaderId')
  const parentLeaderId = level === 'level2' ? clean(profile.parentLeaderId) || undefined : undefined
  return { openid, userId, nickname, avatarUrl, level, leaderId, parentLeaderId, status }
}

/** 演示 Provider：仅根据固定测试 OpenID 返回身份，不读取任何页面可篡改的身份选项。 */
/** 演示登录 Provider 包装现有 mock openid 登录逻辑。 */
export function createDemoWechatLoginProvider(): WechatLoginProvider {
  return {
    login: () => simulateWechatLogin()
  }
}

export function createDemoUserIdentityResolver(): UserIdentityResolver {
  return {
    async resolve(input: UserIdentityLookupInput): Promise<UserIdentityProfile | null> {
      const openid = clean(input.openid)
      if (!openid) return null
      const record = DEMO_IDENTITY_RECORDS[openid]
      if (!record) return null
      writeUserLink(openid, record.userId)
      return { ...record }
    }
  }
}

/** 加载并规范化身份；网络、格式异常直接向上抛出，由启动页提供重试。 */
export async function loadUserIdentityProfile(
  resolver: UserIdentityResolver,
  input: UserIdentityLookupInput
): Promise<UserIdentityProfile> {
  const openid = clean(input.openid)
  const loginCode = clean(input.loginCode)
  if (!openid && !loginCode) throw new UserIdentityDataError('身份资料缺少登录凭证')
  const lookup = {
    ...(openid ? { openid } : {}),
    ...(loginCode ? { loginCode } : {})
  }
  const profile = await resolver.resolve(lookup)
  if (profile) {
    const resolvedOpenid = requireProfileField(profile.openid, 'openid')
    return normalizeUserIdentityProfile(profile, {
      openid: resolvedOpenid,
      fallbackUserId: resolveUserIdentity(resolvedOpenid)
    })
  }
  if (!openid) throw new UserIdentityDataError('身份资料缺少 openid')
  return normalizeUserIdentityProfile(null, {
    openid,
    fallbackUserId: resolveUserIdentity(openid)
  })
}

/** 生产/测试 API Provider：微信登录 code 由服务端换取身份和 JWT。 */
export function createHttpWechatLoginProvider(): WechatLoginProvider {
  return {
    login(): Promise<WechatLoginResult> {
      return new Promise((resolve) => {
        const wxRef = (globalThis as { wx?: { getStorageSync?: (key: string) => unknown; login?: (options: { success: (result: { code?: string }) => void; fail?: () => void }) => void } }).wx
        const mockOpenid = String(wxRef?.getStorageSync?.(MOCK_OPENID_STORAGE_KEY) || '')
        if (mockOpenid) { resolve({ loginCode: mockOpenid }); return }
        if (!wxRef?.login) {
          resolve({})
          return
        }
        wxRef.login({
          success: (result) => resolve({ loginCode: result.code || '' }),
          fail: () => resolve({})
        })
      })
    }
  }
}

export function createHttpUserIdentityResolver(): UserIdentityResolver {
  return {
    async resolve(input: UserIdentityLookupInput): Promise<UserIdentityProfile | null> {
      if (!input.loginCode) return null
      const token = await apiRequest<{
        accessToken: string
        refreshToken: string
        profile: {
          userId?: string
          nickname?: string
          level?: UserIdentityLevel
          leaderId?: string
          parentLeaderId?: string
        }
      }>('/api/v1/auth/wechat/exchange', {
        method: 'POST',
        body: { app: 'user', code: input.loginCode }
      })
      saveUserTokens(token.accessToken, token.refreshToken)
      const userId = clean(token.profile?.userId)
      if (!userId) throw new UserIdentityDataError('身份资料缺少 userId')
      return {
        openid: clean(input.openid) || `server:${userId}`,
        userId,
        nickname: clean(token.profile?.nickname) || undefined,
        level: token.profile?.level || 'normal',
        leaderId: clean(token.profile?.leaderId) || undefined,
        parentLeaderId: clean(token.profile?.parentLeaderId) || undefined,
        status: 'active'
      }
    }
  }
}
