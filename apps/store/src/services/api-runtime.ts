import { apiRequest, configureApiClient, readMiniProgramRuntimeConfig, resolveRuntimeDataMode } from '@agritainment/shared'

const ACCESS_KEY = 'agritainmen-store-access-token'
const REFRESH_KEY = 'agritainmen-store-refresh-token'
const wxRef = (globalThis as { wx?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void } }).wx

export function configureStoreApiRuntime() {
  const runtime = readMiniProgramRuntimeConfig()
  configureApiClient({
    baseUrl: runtime.apiBaseUrl,
    dataMode: resolveRuntimeDataMode(runtime.dataMode, 'mock'),
    appId: runtime.appId || 'store',
    getAccessToken: () => String(wxRef?.getStorageSync?.(ACCESS_KEY) || ''),
    refreshAccessToken: async () => {
      const refreshToken = String(wxRef?.getStorageSync?.(REFRESH_KEY) || '')
      if (!refreshToken) return
      const token = await apiRequest<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken }, retryOnUnauthorized: false })
      wxRef?.setStorageSync?.(ACCESS_KEY, token.accessToken)
      wxRef?.setStorageSync?.(REFRESH_KEY, token.refreshToken)
    },
  })
  return runtime
}

export function saveStoreTokens(accessToken: string, refreshToken: string) {
  wxRef?.setStorageSync?.(ACCESS_KEY, accessToken)
  wxRef?.setStorageSync?.(REFRESH_KEY, refreshToken)
}
