import { afterEach, describe, expect, it } from 'vitest'
import { MOCK_OPENID_STORAGE_KEY, simulateWechatLogin } from './auth'

const originalWx = (globalThis as { wx?: unknown }).wx

afterEach(() => {
  ;(globalThis as { wx?: unknown }).wx = originalWx
})

describe('simulateWechatLogin native wx fallback', () => {
  it('reuses an openid stored by wx', async () => {
    ;(globalThis as { wx?: unknown }).wx = {
      getStorageSync: (key: string) => key === MOCK_OPENID_STORAGE_KEY ? 'wx-openid-existing' : undefined,
      setStorageSync: () => undefined
    }
    await expect(simulateWechatLogin()).resolves.toEqual({ openid: 'wx-openid-existing' })
  })

  it('calls wx.login and persists the generated openid when storage is empty', async () => {
    let saved = ''
    ;(globalThis as { wx?: unknown }).wx = {
      getStorageSync: () => '',
      setStorageSync: (_key: string, value: string) => { saved = value },
      login: (options: { success: (result: { code: string }) => void }) => options.success({ code: 'code12345' })
    }
    const result = await simulateWechatLogin()
    expect(result.openid).toContain('mock_openid_code12345')
    expect(saved).toBe(result.openid)
  })
})
