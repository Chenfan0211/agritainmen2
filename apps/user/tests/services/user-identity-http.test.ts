import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('@agritainment/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agritainment/shared')>()
  return { ...actual, apiRequest }
})
vi.mock('../../src/services/api-runtime', () => ({ saveUserTokens: vi.fn() }))

import { apiRequest as mockedApiRequest } from '@agritainment/shared'
import { createHttpUserIdentityResolver, createHttpWechatLoginProvider } from '../../src/services/user-identity'

describe('HTTP user identity providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { wx?: unknown }).wx = {
      login: ({ success }: { success: (result: { code: string }) => void }) => success({ code: 'wx-code' }),
    }
  })

  it('exchanges login code on the server and maps profile', async () => {
    ;(mockedApiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      profile: { userId: 'U-API', nickname: '接口用户', level: 'level1', leaderId: 'T001' },
    })
    const login = await createHttpWechatLoginProvider().login()
    const profile = await createHttpUserIdentityResolver().resolve({ loginCode: login.loginCode })
    expect(login).toEqual({ loginCode: 'wx-code' })
    expect(profile).toMatchObject({ userId: 'U-API', level: 'level1', leaderId: 'T001' })
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/v1/auth/wechat/exchange', expect.objectContaining({ method: 'POST' }))
  })
})
