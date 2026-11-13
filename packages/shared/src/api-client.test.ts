import { describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiRequest,
  configureApiClient,
  createIdempotencyKey,
  getApiClientConfig,
  resolveRuntimeApiBase,
  resolveRuntimeDataMode,
} from './api-client'

describe('api client', () => {
  it('resolves runtime values safely', () => {
    expect(resolveRuntimeDataMode('api')).toBe('api')
    expect(resolveRuntimeDataMode('bad', 'mock')).toBe('mock')
    expect(resolveRuntimeApiBase(' https://api.example.com/ ')).toBe('https://api.example.com')
    expect(() => resolveRuntimeApiBase('api.example.com')).toThrow()
  })

  it('creates and reads client config', () => {
    expect(createIdempotencyKey('order')).toMatch(/^order-/)
    configureApiClient({ baseUrl: 'https://api.example.com', dataMode: 'api', appId: 'store', timeoutMs: 1000 })
    expect(getApiClientConfig()).toMatchObject({ baseUrl: 'https://api.example.com', dataMode: 'api', appId: 'store' })
  })

  it('rejects requests in mock mode', async () => {
    configureApiClient({ dataMode: 'mock' })
    await expect(apiRequest('/api/v1/orders')).rejects.toMatchObject({ code: 'API_MODE_DISABLED' })
  })

  it('unwraps response, sends auth and idempotency headers', async () => {
    const transport = vi.fn(async () => ({ status: 200, body: { code: 'OK', message: 'ok', data: { id: 'O1' } } }))
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', getAccessToken: () => 'token', transport })
    await expect(apiRequest<{ id: string }>('/api/v1/orders', { method: 'POST', body: { skuId: 'S1' }, idempotencyKey: 'KEY-1' }))
      .resolves.toEqual({ id: 'O1' })
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.com/api/v1/orders',
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token', 'Idempotency-Key': 'KEY-1' }),
    }))
  })

  it('refreshes once on 401 and surfaces structured errors', async () => {
    const refreshAccessToken = vi.fn(async () => undefined)
    const transport = vi.fn()
      .mockResolvedValueOnce({ status: 401, body: { code: 'UNAUTHORIZED', message: 'expired' } })
      .mockResolvedValueOnce({ status: 200, body: { code: 'OK', message: 'ok', data: true } })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', refreshAccessToken, transport })
    await expect(apiRequest<boolean>('/api/v1/auth/me')).resolves.toBe(true)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)

    configureApiClient({ dataMode: 'api', transport: async () => ({ status: 409, body: { code: 'CONFLICT', message: '冲突' } }) })
    await expect(apiRequest('/api/v1/orders')).rejects.toBeInstanceOf(ApiError)
  })
})
