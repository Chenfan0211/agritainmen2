import { apiRequest, configureApiClient, readMiniProgramRuntimeConfig, resolveRuntimeDataMode } from '@agritainment/shared'

const ACCESS_KEY = 'agritainmen-user-access-token'
const REFRESH_KEY = 'agritainmen-user-refresh-token'

function storage() {
  return (globalThis as { wx?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void; removeStorageSync?: (key: string) => void } }).wx
}

export function getStoredAccessToken(): string {
  return String(storage()?.getStorageSync?.(ACCESS_KEY) || '')
}

export function getStoredRefreshToken(): string {
  return String(storage()?.getStorageSync?.(REFRESH_KEY) || '')
}

export function saveUserTokens(accessToken: string, refreshToken: string): void {
  storage()?.setStorageSync?.(ACCESS_KEY, accessToken)
  storage()?.setStorageSync?.(REFRESH_KEY, refreshToken)
}

export function clearUserTokens(): void {
  storage()?.removeStorageSync?.(ACCESS_KEY)
  storage()?.removeStorageSync?.(REFRESH_KEY)
}

export function configureUserApiRuntime() {
  const runtime = readMiniProgramRuntimeConfig()
  configureApiClient({
    baseUrl: runtime.apiBaseUrl,
    dataMode: resolveRuntimeDataMode(runtime.dataMode, 'mock'),
    appId: runtime.appId || 'user',
    getAccessToken: getStoredAccessToken,
    refreshAccessToken: async () => {
      const refreshToken = getStoredRefreshToken()
      if (!refreshToken) return
      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        retryOnUnauthorized: false,
      })
      saveUserTokens(payload.accessToken, payload.refreshToken)
    },
  })
  return runtime
}
