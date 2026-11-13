export type RuntimeDataMode = 'mock' | 'api'

export interface ApiEnvelope<T> {
  code: string
  message: string
  data: T
  traceId?: string
  timestamp?: string
}

export interface ApiTransportRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
  timeoutMs: number
}

export interface ApiTransportResponse {
  status: number
  body: unknown
}

export type ApiTransport = (request: ApiTransportRequest) => Promise<ApiTransportResponse>

export interface ApiClientConfig {
  baseUrl: string
  dataMode: RuntimeDataMode
  appId?: string
  timeoutMs: number
  getAccessToken?: () => string | undefined
  refreshAccessToken?: () => Promise<void>
  transport?: ApiTransport
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly traceId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const defaultConfig: ApiClientConfig = { baseUrl: '', dataMode: 'mock', timeoutMs: 10000 }
let currentConfig: ApiClientConfig = { ...defaultConfig }

export function configureApiClient(config: Partial<ApiClientConfig>): ApiClientConfig {
  currentConfig = { ...currentConfig, ...config, baseUrl: resolveRuntimeApiBase(config.baseUrl ?? currentConfig.baseUrl) }
  return currentConfig
}

export function getApiClientConfig(): ApiClientConfig { return { ...currentConfig } }

export function createIdempotencyKey(prefix = 'idem'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function resolveRuntimeDataMode(value: unknown, fallback: RuntimeDataMode = 'mock'): RuntimeDataMode {
  return value === 'api' || value === 'mock' ? value : fallback
}

export function resolveRuntimeApiBase(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
  if (!text) return ''
  if (!/^https?:\/\//i.test(text)) throw new Error(`API base URL must start with http:// or https://: ${text}`)
  return text
}

export async function apiRequest<T>(path: string, options: {
  method?: string
  body?: unknown
  idempotencyKey?: string
  headers?: Record<string, string>
  retryOnUnauthorized?: boolean
} = {}): Promise<T> {
  if (currentConfig.dataMode !== 'api') throw new ApiError('API_MODE_DISABLED', '当前为 mock 数据模式')
  if (!currentConfig.baseUrl) throw new ApiError('API_BASE_URL_MISSING', '未配置 API_BASE_URL')
  const request = buildRequest(path, options)
  let response = await send(request)
  if (response.status === 401 && options.retryOnUnauthorized !== false && currentConfig.refreshAccessToken) {
    await currentConfig.refreshAccessToken()
    response = await send(buildRequest(path, options))
  }
  return unwrap<T>(response)
}

function buildRequest(path: string, options: { method?: string; body?: unknown; idempotencyKey?: string; headers?: Record<string, string> }): ApiTransportRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const accessToken = currentConfig.getAccessToken?.()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  if (currentConfig.appId) headers['X-Client-App'] = currentConfig.appId
  return {
    url: `${currentConfig.baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
    method: options.method || 'GET',
    headers,
    body: options.body,
    timeoutMs: currentConfig.timeoutMs,
  }
}

async function send(request: ApiTransportRequest): Promise<ApiTransportResponse> {
  if (currentConfig.transport) return currentConfig.transport(request)
  if (typeof fetch === 'function') {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const timer = controller ? setTimeout(() => controller.abort(), request.timeoutMs) : undefined
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body === undefined ? undefined : JSON.stringify(request.body), signal: controller?.signal, credentials: 'include' })
      return { status: response.status, body: await response.json().catch(() => null) }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return wxRequest(request)
}

function wxRequest(request: ApiTransportRequest): Promise<ApiTransportResponse> {
  const wxRef = (globalThis as { wx?: { request?: (options: Record<string, unknown>) => void } }).wx
  if (!wxRef?.request) throw new ApiError('TRANSPORT_MISSING', '当前运行时不支持 fetch 或 wx.request')
  return new Promise((resolve, reject) => {
    wxRef.request!({
      url: request.url,
      method: request.method,
      header: request.headers,
      data: request.body,
      timeout: request.timeoutMs,
      success: (response: { statusCode: number; data: unknown }) => resolve({ status: response.statusCode, body: response.data }),
      fail: (error: unknown) => reject(new ApiError('NETWORK_ERROR', String(error))),
    })
  })
}

function unwrap<T>(response: ApiTransportResponse): T {
  const envelope = response.body as Partial<ApiEnvelope<T>> | null
  if (response.status < 200 || response.status >= 300 || !envelope || envelope.code !== 'OK') {
    throw new ApiError(envelope?.code || `HTTP_${response.status}`, envelope?.message || '接口请求失败', response.status, envelope?.traceId)
  }
  return envelope.data as T
}
