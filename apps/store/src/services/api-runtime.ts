import { apiRequest, configureApiClient, readMiniProgramRuntimeConfig, resolveRuntimeDataMode } from '@agritainment/shared'

const ACCESS_KEY = 'agritainmen-store-access-token'
const REFRESH_KEY = 'agritainmen-store-refresh-token'
function storage() {
  return (globalThis as { wx?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void; removeStorageSync?: (key: string) => void } }).wx
}

export function configureStoreApiRuntime() {
  const runtime = readMiniProgramRuntimeConfig()
  configureApiClient({
    baseUrl: runtime.apiBaseUrl,
    dataMode: resolveRuntimeDataMode(runtime.dataMode, 'mock'),
    appId: runtime.appId || 'store',
    getAccessToken: () => String(storage()?.getStorageSync?.(ACCESS_KEY) || ''),
    refreshAccessToken: async () => {
      const refreshToken = getStoreRefreshToken()
      if (!refreshToken) return
      const token = await apiRequest<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken }, retryOnUnauthorized: false })
      saveStoreTokens(token.accessToken, token.refreshToken)
    },
  })
  return runtime
}

export function saveStoreTokens(accessToken: string, refreshToken: string) {
  storage()?.setStorageSync?.(ACCESS_KEY, accessToken)
  storage()?.setStorageSync?.(REFRESH_KEY, refreshToken)
}

export function getStoreRefreshToken() {
  return String(storage()?.getStorageSync?.(REFRESH_KEY) || '')
}

export function clearStoreTokens() {
  storage()?.removeStorageSync?.(ACCESS_KEY)
  storage()?.removeStorageSync?.(REFRESH_KEY)
}
