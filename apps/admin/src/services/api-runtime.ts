import { apiRequest, configureApiClient, resolveRuntimeDataMode } from '@agritainment/shared'

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {})
const ACCESS_KEY = 'agritainmen-admin-access-token'
let pendingRefresh: Promise<void> | null = null

export function configureAdminApiRuntime() {
  configureApiClient({
    baseUrl: env.VITE_API_BASE_URL || '',
    dataMode: resolveRuntimeDataMode(env.VITE_DATA_MODE, 'mock'),
    appId: 'admin',
    getAccessToken: () => typeof sessionStorage === 'undefined' ? undefined : sessionStorage.getItem(ACCESS_KEY) || undefined,
    refreshAccessToken: () => {
      if (!pendingRefresh) pendingRefresh = apiRequest<{ accessToken: string }>('/api/v1/auth/refresh', { method: 'POST', retryOnUnauthorized: false })
        .then(token => saveAdminAccessToken(token.accessToken))
        .finally(() => { pendingRefresh = null })
      return pendingRefresh
    },
  })
}

export function saveAdminAccessToken(token: string) {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ACCESS_KEY, token)
}

export function clearAdminAccessToken() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ACCESS_KEY)
}
