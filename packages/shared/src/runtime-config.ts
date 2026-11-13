import type { RuntimeDataMode } from './api-client'
import { resolveRuntimeApiBase, resolveRuntimeDataMode } from './api-client'

declare const __AGRITAINMEN_API_BASE_URL__: string | undefined
declare const __AGRITAINMEN_DATA_MODE__: string | undefined
declare const __AGRITAINMEN_CLIENT_APP__: string | undefined

export interface MiniProgramRuntimeConfig {
  apiBaseUrl: string
  dataMode: RuntimeDataMode
  appId: string
}

export function readMiniProgramRuntimeConfig(): MiniProgramRuntimeConfig {
  const apiBase = typeof __AGRITAINMEN_API_BASE_URL__ === 'undefined' ? '' : __AGRITAINMEN_API_BASE_URL__
  const dataMode = typeof __AGRITAINMEN_DATA_MODE__ === 'undefined' ? 'mock' : __AGRITAINMEN_DATA_MODE__
  const appId = typeof __AGRITAINMEN_CLIENT_APP__ === 'undefined' ? '' : __AGRITAINMEN_CLIENT_APP__
  return { apiBaseUrl: resolveRuntimeApiBase(apiBase), dataMode: resolveRuntimeDataMode(dataMode), appId }
}
