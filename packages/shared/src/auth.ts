/**
 * 登录演示辅助（纯前端工程、无后端）：
 * 账号密码 / 手机号 / 验证码 / 微信 openid 均本地模拟。
 */

export const DEMO_ACCOUNT = 'admin'
export const DEMO_PASSWORD = '123456'
export const DEMO_PHONE = '13800000000'
export const DEMO_SMS_CODE = '123456'

export function validateAccountPassword(account: string, password: string): boolean {
  return account.trim() === DEMO_ACCOUNT && password === DEMO_PASSWORD
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim())
}

export function validateSmsCode(code: string): boolean {
  return code.trim() === DEMO_SMS_CODE
}

interface WechatUni {
  getSystemInfoSync?: () => { uniPlatform?: string }
  login?: (options: {
    provider?: string
    success: (result: { code?: string }) => void
    fail?: (error: unknown) => void
  }) => void
}

declare const wx: unknown

export const MOCK_OPENID_STORAGE_KEY = 'agritainment-mock-openid'

function readMockOpenid(): string {
  try {
    const scope = globalThis as { localStorage?: Storage }
    if (scope.localStorage) {
      const value = scope.localStorage.getItem(MOCK_OPENID_STORAGE_KEY)
      if (value) return value
    }
    const uniRef = (globalThis as unknown as { uni?: { getStorageSync?: (key: string) => unknown } }).uni
    const stored = uniRef?.getStorageSync?.(MOCK_OPENID_STORAGE_KEY)
    if (typeof stored === 'string' && stored) return stored
    const wxRef = typeof wx !== 'undefined' ? wx as { getStorageSync?: (key: string) => unknown } : undefined
    const wxStored = wxRef?.getStorageSync?.(MOCK_OPENID_STORAGE_KEY)
    if (typeof wxStored === 'string' && wxStored) return wxStored
  } catch {
    // 忽略
  }
  return ''
}

function writeMockOpenid(openid: string): void {
  try {
    const scope = globalThis as { localStorage?: Storage }
    if (scope.localStorage) {
      scope.localStorage.setItem(MOCK_OPENID_STORAGE_KEY, openid)
      return
    }
    const uniRef = (globalThis as unknown as { uni?: { setStorageSync?: (key: string, value: unknown) => void } }).uni
    if (uniRef?.setStorageSync) {
      uniRef.setStorageSync(MOCK_OPENID_STORAGE_KEY, openid)
      return
    }
    const wxRef = typeof wx !== 'undefined' ? wx as { setStorageSync?: (key: string, value: unknown) => void } : undefined
    wxRef?.setStorageSync?.(MOCK_OPENID_STORAGE_KEY, openid)
  } catch {
    // 忽略
  }
}

/**
 * 模拟微信授权登录（设备级稳定）：
 * - 微信小程序端先 uni.login 取 code，再本地映射为 mock openid；
 * - H5 / 测试环境直接返回 mock openid；
 * - openid 首次生成后持久化，同一设备/同一端重复登录返回同一 openid。
 */
export function simulateWechatLogin(): Promise<{ openid: string }> {
  return new Promise((resolve) => {
    const finish = (code?: string) => {
      const existing = readMockOpenid()
      if (existing) {
        resolve({ openid: existing })
        return
      }
      const seed = (code || 'h5').slice(0, 10).replace(/[^a-zA-Z0-9]/g, '') || 'h5'
      const openid = `mock_openid_${seed}_${Math.random().toString(36).slice(2, 8)}`
      writeMockOpenid(openid)
      resolve({ openid })
    }
    const uniRef = (globalThis as unknown as { uni?: WechatUni }).uni
    const wxRef = typeof wx !== 'undefined' ? wx as WechatUni : undefined
    const isMpWeixin = uniRef?.getSystemInfoSync?.().uniPlatform === 'mp-weixin'
    if (isMpWeixin && typeof uniRef?.login === 'function') {
      uniRef.login({
        provider: 'weixin',
        success: (result) => finish(result.code),
        fail: () => finish()
      })
    } else if (typeof wxRef?.login === 'function') {
      wxRef.login({
        success: (result) => finish(result.code),
        fail: () => finish()
      })
    } else {
      finish()
    }
  })
}
