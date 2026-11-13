import { apiRequest, configureApiClient, readMiniProgramRuntimeConfig, resolveRuntimeDataMode } from '@agritainment/shared'

const ACCESS_KEY = 'agritainmen-supplier-access-token'
const REFRESH_KEY = 'agritainmen-supplier-refresh-token'
function storage() {
  return (globalThis as { wx?: { getStorageSync?: (key: string) => unknown; setStorageSync?: (key: string, value: unknown) => void; removeStorageSync?: (key: string) => void } }).wx
}

function readToken(key: string) {
  return String(storage()?.getStorageSync?.(key) || '')
}

function writeToken(key: string, value: string) {
  storage()?.setStorageSync?.(key, value)
}

function removeToken(key: string) {
  const wx = storage()
  if (wx?.removeStorageSync) wx.removeStorageSync(key)
  else wx?.setStorageSync?.(key, '')
}

export function readSupplierAccessToken() { return readToken(ACCESS_KEY) }
export function readSupplierRefreshToken() { return readToken(REFRESH_KEY) }

export function configureSupplierApiRuntime() {
  const runtime = readMiniProgramRuntimeConfig()
  configureApiClient({
    baseUrl: runtime.apiBaseUrl,
    dataMode: resolveRuntimeDataMode(runtime.dataMode, 'mock'),
    appId: runtime.appId || 'supplier',
    getAccessToken: readSupplierAccessToken,
    refreshAccessToken: async () => {
      const refreshToken = readSupplierRefreshToken()
      if (!refreshToken) return
      try {
        const token = await apiRequest<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken }, retryOnUnauthorized: false })
        saveSupplierTokens(token.accessToken, token.refreshToken)
      } catch (error) {
        clearSupplierTokens()
        throw error
      }
    },
  })
  return runtime
}

export function saveSupplierTokens(accessToken: string, refreshToken: string) {
  writeToken(ACCESS_KEY, accessToken)
  writeToken(REFRESH_KEY, refreshToken)
}

export function clearSupplierTokens() {
  removeToken(ACCESS_KEY)
  removeToken(REFRESH_KEY)
}
