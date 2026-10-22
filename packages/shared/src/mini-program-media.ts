// 三端共享的微信小程序媒体运行时与媒体组件行为。
// 约定：本文件只依赖 wx.* 与 packages/shared 的媒体存储适配器；门店 / 供应商 / 用户三端共用同一份实现，
// 端内只传入命名空间等差异，组件文件仅保留平台绑定（Component({...}) + wxml/wxss）。
import { LocalFileMediaStorageAdapter, normalizeMediaReference } from './media'
import type { MediaAssetRepository, MediaFileSystem, MediaMimeType, MediaReference, MediaSaveOptions } from './media'
import type { PlatformOperationRetentionOptions, PlatformRepository, PlatformRepositoryEntry, PlatformRepositoryTransaction, PlatformTransactionResult } from './platform-repository'

export type MediaCompressionKind = 'normal' | 'license'

/** 三端统一的兜底图：内置静态图，无需媒体运行时即可解析。 */
export const DEFAULT_BUSINESS_IMAGE_FALLBACK: MediaReference = { source: 'builtin', path: '/static/images/farmhouse.jpg' }

/** 默认命名空间：三个端运行在各自的小程序存储空间，沿用同一命名空间即可让既有资产继续可解析。 */
export const DEFAULT_MEDIA_NAMESPACE = 'agritainment'
export const DEFAULT_MEDIA_DIRECTORY_NAME = 'agritainment-media'
export const DEFAULT_MEDIA_REPOSITORY_STORAGE_KEY = 'agritainment-platform-repository'

interface PreparedMediaDimensions {
  width: number
  height: number
}

export type PreparedMediaFile = PreparedMediaDimensions & { bytes: Uint8Array; mimeType: MediaMimeType }

export interface ChooseMediaOptions {
  count: number
  profile: MediaCompressionKind
}

export interface MediaRuntime {
  storage: MediaAssetRepository
  chooseImages(options: ChooseMediaOptions): Promise<PreparedMediaFile[]>
  fallback: MediaReference
  digest: (data: Uint8Array) => Promise<string>
}

export interface MiniProgramMediaRuntimeOptions {
  /** 端内命名空间，用于推导落盘目录名与仓储存储键。 */
  namespace?: string
  directoryName?: string
  repositoryStorageKey?: string
  fallback?: MediaReference
}

/** 小程序最小能力声明：避免 packages/shared 依赖端内类型声明或第三方 typings。 */
interface MiniProgramFileSystemManager {
  mkdir(options: { dirPath: string; recursive?: boolean; success?: () => void; fail?: (error: unknown) => void; complete?: () => void }): void
  writeFile(options: { filePath: string; data: ArrayBuffer | string; encoding?: string; success?: () => void; fail?: (error: unknown) => void }): void
  readFile(options: { filePath: string; encoding?: string; success?: (result: { data: ArrayBuffer | string }) => void; fail?: (error: unknown) => void }): void
  unlink(options: { filePath: string; success?: () => void; fail?: (error: unknown) => void }): void
}

interface MiniProgramApi {
  env: { USER_DATA_PATH: string }
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  getFileSystemManager(): MiniProgramFileSystemManager
  chooseMedia(options: {
    count?: number
    mediaType?: string[]
    sourceType?: string[]
    sizeType?: string[]
    success?: (result: { tempFiles?: Array<{ tempFilePath?: string; path?: string; size?: number; fileType?: string }> }) => void
    fail?: (error: unknown) => void
    complete?: () => void
  }): void
  getImageInfo(options: { src: string; success?: (result: { width: number; height: number; path?: string; type?: string }) => void; fail?: (error: unknown) => void }): void
  previewImage(options: { current?: string; urls: string[] }): void
  showToast(options: { title: string; icon?: string; duration?: number }): void
}

/** 原生运行时统一入口：只使用 globalThis.wx，不写死端内全局声明。 */
export function miniProgramApi(): MiniProgramApi {
  const api = (globalThis as unknown as { wx?: MiniProgramApi }).wx
  if (!api) throw new Error('当前运行环境不支持微信小程序媒体能力')
  return api
}

const unsupportedImageMessage = '仅支持 jpeg/png/webp 图片'

function supportedImageMime(value?: string): MediaMimeType | null {
  const normalized = value?.trim().toLowerCase().replace(/^\./, '')
  if (normalized === 'jpg' || normalized === 'jpeg' || normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg'
  if (normalized === 'png' || normalized === 'image/png') return 'image/png'
  if (normalized === 'webp' || normalized === 'image/webp') return 'image/webp'
  return null
}

/** 由临时文件路径与 getImageInfo 的 type 推导 MIME，非法格式统一抛 unsupportedImageMessage。 */
export function miniProgramImageMime(path: string, infoType?: string): MediaMimeType {
  const metadata = [infoType].filter((value): value is string => Boolean(value?.trim()))
  const candidates: MediaMimeType[] = metadata.map((value) => {
    const mime = supportedImageMime(value)
    if (!mime) throw new Error(unsupportedImageMessage)
    return mime
  })
  const cleanPath = path.split(/[?#]/, 1)[0]
  const extension = cleanPath.match(/\.([^./\\]+)$/)?.[1]
  if (extension) {
    const extensionMime = supportedImageMime(extension)
    if (extensionMime) candidates.push(extensionMime)
    else if (!metadata.length || /^(?:gif|svg|svgz|bmp|heic|heif|avif|tif|tiff)$/i.test(extension)) throw new Error(unsupportedImageMessage)
  }
  if (!candidates.length) throw new Error(unsupportedImageMessage)
  const [first] = candidates
  return candidates.every((candidate) => candidate === first) ? first : candidates[1]
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

/** 小程序没有 crypto.subtle，用纯 JS SHA-256 提供媒体资产摘要。 */
export async function miniProgramSha256(data: Uint8Array): Promise<string> {
  const paddedLength = Math.ceil((data.byteLength + 9) / 64) * 64
  const message = new Uint8Array(paddedLength)
  message.set(data)
  message[data.byteLength] = 0x80
  const bitLength = data.byteLength * 8
  const view = new DataView(message.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]
      const y = words[index - 2]
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3)
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

export function createMediaFileSystem(manager: MiniProgramFileSystemManager, directory: string): MediaFileSystem {
  let directoryReady: Promise<void> | null = null
  const ensureDirectory = () => {
    directoryReady ||= new Promise<void>((resolve, reject) => manager.mkdir({
      dirPath: directory,
      recursive: true,
      success: () => resolve(),
      fail: (error) => {
        const detail = error instanceof Error ? error.message : String((error as { errMsg?: unknown })?.errMsg ?? error)
        if (/exist|已存在/i.test(detail)) resolve()
        else reject(error)
      }
    }))
    return directoryReady
  }
  return {
    writeFile: async (path, data) => {
      await ensureDirectory()
      const copy = Uint8Array.from(data)
      return new Promise<void>((resolve, reject) => manager.writeFile({ filePath: path, data: copy.buffer, success: () => resolve(), fail: reject }))
    },
    readFile: (path) => new Promise((resolve) => manager.readFile({
      filePath: path,
      success: ({ data }) => resolve(new Uint8Array(data as ArrayBuffer)),
      fail: () => resolve(null)
    })),
    removeFile: (path) => new Promise<void>((resolve, reject) => manager.unlink({ filePath: path, success: () => resolve(), fail: reject }))
  }
}

interface StoredRepositoryOperation {
  fingerprint: string
  collections: string
  completedAt: string
  value?: unknown
}

interface MiniProgramRepositoryState {
  records: Record<string, Record<string, unknown>>
  operations: Record<string, StoredRepositoryOperation>
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

/** wx 同步存储上的平台仓储实现：媒体资产元数据与操作幂等记录都落在这里。 */
export class MiniProgramStoragePlatformRepository implements PlatformRepository {
  constructor(
    private readonly storageKey = DEFAULT_MEDIA_REPOSITORY_STORAGE_KEY,
    private readonly api: MiniProgramApi = miniProgramApi()
  ) {}

  async get<T>(collection: string, key: string): Promise<T | null> {
    const value = this.read().records[collection]?.[key]
    return value === undefined ? null : cloneValue(value as T)
  }

  async put<T>(collection: string, key: string, value: T): Promise<void> {
    const state = this.read()
    state.records[collection] ||= {}
    state.records[collection][key] = cloneValue(value)
    this.write(state)
  }

  async delete(collection: string, key: string): Promise<void> {
    const state = this.read()
    if (state.records[collection]) delete state.records[collection][key]
    this.write(state)
  }

  async list<T>(collection: string): Promise<PlatformRepositoryEntry<T>[]> {
    return Object.entries(this.read().records[collection] || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value: cloneValue(value as T) }))
  }

  async runTransaction<T>(
    operationId: string,
    requestFingerprint: string,
    collections: string[],
    execute: (transaction: PlatformRepositoryTransaction) => Promise<T> | T
  ): Promise<PlatformTransactionResult<T>> {
    if (!operationId.trim() || !requestFingerprint.trim()) throw new Error('operationId and requestFingerprint are required')
    const names = [...new Set(collections.map((name) => name.trim()).filter(Boolean))].sort()
    if (!names.length) throw new Error('A transaction requires at least one collection')
    const signature = names.join('\u0000')
    const state = this.read()
    const existing = state.operations[operationId]
    if (existing) {
      if (existing.fingerprint !== requestFingerprint || existing.collections !== signature) throw new Error(`operationId "${operationId}" was already used for a different request`)
      return { applied: false, value: cloneValue(existing.value as T) }
    }
    const staged = cloneValue(state)
    const allowed = new Set(names)
    const assertAllowed = (collection: string) => {
      if (!allowed.has(collection)) throw new Error(`Collection "${collection}" is not part of this transaction`)
    }
    const transaction: PlatformRepositoryTransaction = {
      get: async <V>(collection: string, key: string) => {
        assertAllowed(collection)
        const value = staged.records[collection]?.[key]
        return value === undefined ? null : cloneValue(value as V)
      },
      put: async <V>(collection: string, key: string, value: V) => {
        assertAllowed(collection)
        staged.records[collection] ||= {}
        staged.records[collection][key] = cloneValue(value)
      },
      delete: async (collection: string, key: string) => {
        assertAllowed(collection)
        if (staged.records[collection]) delete staged.records[collection][key]
      },
      list: async <V>(collection: string) => {
        assertAllowed(collection)
        return Object.entries(staged.records[collection] || {}).map(([key, value]) => ({ key, value: cloneValue(value as V) }))
      }
    }
    const value = await execute(transaction)
    staged.operations[operationId] = { fingerprint: requestFingerprint, collections: signature, completedAt: new Date().toISOString(), value: cloneValue(value) }
    this.write(staged)
    return { applied: true, value: cloneValue(value) }
  }

  async compactOperations(options: PlatformOperationRetentionOptions): Promise<number> {
    const now = options.now === undefined ? Date.now() : new Date(options.now).getTime()
    if (!Number.isFinite(now) || !Number.isFinite(options.retentionMs) || options.retentionMs < 0) throw new Error('Invalid operation retention options')
    const cutoff = now - options.retentionMs
    const state = this.read()
    let removed = 0
    for (const [id, operation] of Object.entries(state.operations)) {
      if (Date.parse(operation.completedAt) < cutoff) {
        delete state.operations[id]
        removed += 1
      }
    }
    if (removed) this.write(state)
    return removed
  }

  private read(): MiniProgramRepositoryState {
    const saved = this.api.getStorageSync(this.storageKey)
    if (!saved) return { records: {}, operations: {} }
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved
      if (!parsed || typeof parsed !== 'object') return { records: {}, operations: {} }
      const state = parsed as Partial<MiniProgramRepositoryState>
      return { records: cloneValue(state.records || {}), operations: cloneValue(state.operations || {}) }
    } catch {
      return { records: {}, operations: {} }
    }
  }

  private write(state: MiniProgramRepositoryState): void {
    this.api.setStorageSync(this.storageKey, cloneValue(state))
  }
}

export function savePreparedMediaFile(
  runtime: MediaRuntime,
  file: PreparedMediaFile,
  purpose: string
): Promise<Extract<MediaReference, { source: 'asset' }>> {
  const options: MediaSaveOptions = { width: file.width, height: file.height, digest: runtime.digest }
  if (!runtime.storage.saveBytes) return Promise.reject(new Error('当前媒体存储不支持字节保存'))
  return runtime.storage.saveBytes(file.bytes, file.mimeType, purpose, options)
}

export function createMiniProgramMediaRuntime(options: MiniProgramMediaRuntimeOptions = {}): MediaRuntime {
  const api = miniProgramApi()
  const namespace = (options.namespace || DEFAULT_MEDIA_NAMESPACE).trim() || DEFAULT_MEDIA_NAMESPACE
  const directoryName = (options.directoryName || `${namespace}-media`).trim() || DEFAULT_MEDIA_DIRECTORY_NAME
  const storageKey = options.repositoryStorageKey || DEFAULT_MEDIA_REPOSITORY_STORAGE_KEY
  const manager = api.getFileSystemManager()
  const directory = `${api.env.USER_DATA_PATH}/${directoryName}`
  const fileSystem = createMediaFileSystem(manager, directory)
  const storage = new LocalFileMediaStorageAdapter(new MiniProgramStoragePlatformRepository(storageKey, api), fileSystem, directory)
  return {
    storage,
    fallback: { ...(options.fallback ?? DEFAULT_BUSINESS_IMAGE_FALLBACK) },
    digest: miniProgramSha256,
    chooseImages(input) {
      return new Promise<PreparedMediaFile[]>((resolve, reject) => {
        api.chooseMedia({
          count: Math.max(1, Math.floor(input.count || 1)),
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (result) => {
            const files = result.tempFiles || []
            if (!files.length) {
              resolve([])
              return
            }
            Promise.all(files.map((file) => new Promise<PreparedMediaFile>((done, fail) => {
              const tempPath = String(file.tempFilePath || file.path || '')
              if (!tempPath) {
                fail(new Error('图片读取失败'))
                return
              }
              api.getImageInfo({
                src: tempPath,
                success: (info) => {
                  void fileSystem.readFile(tempPath).then((bytes) => {
                    if (!bytes) {
                      fail(new Error('图片读取失败'))
                      return
                    }
                    done({ bytes: Uint8Array.from(bytes), mimeType: miniProgramImageMime(tempPath, info.type), width: info.width, height: info.height })
                  }, fail)
                },
                fail
              })
            }))).then(resolve, reject)
          },
          fail: reject
        })
      })
    }
  }
}

let currentRuntime: MediaRuntime | null = null

export function configureMediaRuntime(runtime: MediaRuntime): void {
  currentRuntime = runtime
}

export function isMediaRuntimeConfigured(): boolean {
  return currentRuntime !== null
}

export function getMediaRuntime(): MediaRuntime {
  if (!currentRuntime) throw new Error('媒体运行时尚未配置')
  return currentRuntime
}

/** 静态图（builtin/legacy）与本地文件路径不需要运行时即可解析；只有上传资产需要媒体存储。 */
export function directMediaUrl(value: MediaReference | string | null | undefined): string {
  const reference = normalizeMediaReference(value)
  if (!reference) return ''
  if (reference.source === 'builtin') return reference.path.startsWith('/') ? reference.path : `/${reference.path}`
  if (reference.source === 'legacy') return reference.url
  return ''
}

/** 业务图片组件的最小宿主契约：三端 Component 实例都满足它。 */
export interface BusinessImageHost {
  data: { src?: unknown; fallback?: unknown; errorFallback?: unknown; resolved?: string; failed?: boolean }
  setData(patch: Record<string, unknown>): void
  triggerEvent(name: string, detail?: unknown): void
  _businessImageVersion?: number
  _businessImageDetached?: boolean
  _businessImageRetry?: number
  _businessImageUsedErrorFallback?: boolean
}

const BUSINESS_IMAGE_MAX_RETRY = 3

/** 回退地址按需计算：observers 可能早于 attached 触发。 */
export function businessImageFallbackUrls(host: Pick<BusinessImageHost, 'data'>): { fallbackUrl: string; errorFallbackUrl: string } {
  const runtimeFallback = isMediaRuntimeConfigured() ? directMediaUrl(getMediaRuntime().fallback) : ''
  const fallbackUrl = directMediaUrl(host.data.fallback as MediaReference | string | null | undefined)
    || runtimeFallback
    || directMediaUrl(DEFAULT_BUSINESS_IMAGE_FALLBACK)
  const errorFallbackUrl = directMediaUrl(host.data.errorFallback as MediaReference | string | null | undefined) || fallbackUrl
  return { fallbackUrl, errorFallbackUrl }
}

/**
 * 解析 src：asset 走媒体存储，builtin/legacy 与本地文件路径（wx.env.USER_DATA_PATH、wxfile:// 等）直接作为 image src。
 * 解析不出来的 asset 回退到 errorFallback，并把 failed 置为 true。
 */
export function applyBusinessImageReference(host: BusinessImageHost, value: unknown): void {
  const version = (host._businessImageVersion || 0) + 1
  host._businessImageVersion = version
  host._businessImageUsedErrorFallback = false
  const { fallbackUrl, errorFallbackUrl } = businessImageFallbackUrls(host)
  const direct = directMediaUrl(value as MediaReference | string | null | undefined)
  host.setData({ resolved: direct || fallbackUrl, failed: false })
  const reference = normalizeMediaReference(value as MediaReference | string | null | undefined)
  if (!reference || reference.source !== 'asset') return
  if (!isMediaRuntimeConfigured()) {
    // 运行时由 app.ts 的 onLaunch 配置；极端情况下让位一个事件循环，最多重试 BUSINESS_IMAGE_MAX_RETRY 次。
    const attempt = host._businessImageRetry || 0
    if (attempt >= BUSINESS_IMAGE_MAX_RETRY) {
      host.setData({ resolved: errorFallbackUrl || fallbackUrl, failed: true })
      return
    }
    host._businessImageRetry = attempt + 1
    setTimeout(() => {
      if (host._businessImageDetached || host._businessImageVersion !== version) return
      applyBusinessImageReference(host, value)
    }, 0)
    return
  }
  host._businessImageRetry = 0
  getMediaRuntime().storage.resolve(reference).then(
    (url) => {
      if (host._businessImageDetached || host._businessImageVersion !== version) return
      host.setData({ resolved: url, failed: false })
    },
    () => {
      if (host._businessImageDetached || host._businessImageVersion !== version) return
      host.setData({ resolved: errorFallbackUrl || fallbackUrl, failed: true })
    }
  )
}

/**
 * binderror 回退链路：先回退到 errorFallback（只回退一次），errorFallback 也失败时只置失败态，不再来回切换。
 */
export function failBusinessImage(host: BusinessImageHost, resolvedUrl?: string): void {
  const current = host.data.resolved || ''
  const failedUrl = resolvedUrl || current
  if (failedUrl && current && failedUrl !== current) return
  const { errorFallbackUrl } = businessImageFallbackUrls(host)
  if (!host._businessImageUsedErrorFallback && errorFallbackUrl && errorFallbackUrl !== failedUrl) {
    host._businessImageUsedErrorFallback = true
    host.setData({ resolved: errorFallbackUrl, failed: true })
    return
  }
  host.setData({ failed: true })
}

/** 点击事件会带上可直接传给 wx.previewImage 的 url。 */
export function businessImageClickDetail(host: Pick<BusinessImageHost, 'data'>): { url: string } {
  return { url: host.data.resolved || '' }
}

export function createBusinessImageComponent(): Record<string, unknown> {
  return {
    options: { addGlobalClass: true },
    properties: {
      src: { type: null, value: null },
      fallback: { type: null, value: null },
      errorFallback: { type: null, value: null },
      mode: { type: String, value: 'aspectFill' },
      showError: { type: Boolean, value: true }
    },
    data: {
      resolved: '',
      failed: false
    },
    observers: {
      'src, fallback, errorFallback'(this: BusinessImageHost, value: unknown) {
        applyBusinessImageReference(this, value)
      }
    },
    lifetimes: {
      attached(this: BusinessImageHost) {
        this._businessImageDetached = false
        this._businessImageVersion = 0
        this._businessImageRetry = 0
        applyBusinessImageReference(this, this.data.src)
      },
      detached(this: BusinessImageHost) {
        this._businessImageDetached = true
        this._businessImageVersion = (this._businessImageVersion || 0) + 1
      }
    },
    methods: {
      onTap(this: BusinessImageHost) {
        this.triggerEvent('click', businessImageClickDetail(this))
      },
      onImageError(this: BusinessImageHost) {
        failBusinessImage(this, this.data.resolved || '')
      }
    }
  }
}

const BUSINESS_UPLOADER_MAX_COUNT = 1

export interface ImageUploaderItem {
  key: string
  reference: MediaReference
  url: string
}

/** 图片上传组件的最小宿主契约：三端 Component 实例都满足它。 */
export interface ImageUploaderHost {
  data: {
    value?: unknown
    modelValue?: unknown
    multiple?: boolean
    maxCount?: number
    purpose?: string
    profile?: string
    disabled?: boolean
    items?: ImageUploaderItem[]
    uploading?: boolean
    canChoose?: boolean
  }
  setData(patch: Record<string, unknown>): void
  triggerEvent(name: string, detail?: unknown): void
}

/** value 为主线属性，modelValue 作为历史绑定名的别名，两端页面绑定都能继续工作。 */
export function imageUploaderValue(host: Pick<ImageUploaderHost, 'data'>): unknown {
  if (host.data.value !== undefined && host.data.value !== null) return host.data.value
  return host.data.modelValue
}

export function normalizeImageUploaderValue(value: unknown): MediaReference[] {
  const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
  return list.flatMap((item) => {
    const reference = normalizeMediaReference(item as MediaReference | string | null | undefined)
    return reference ? [reference] : []
  })
}

function imageUploaderItem(reference: MediaReference, index: number): ImageUploaderItem {
  const key = reference.source === 'asset' ? reference.assetId : reference.source === 'builtin' ? reference.path : `${reference.url}#${index}`
  return { key, reference, url: directMediaUrl(reference) }
}

export function imageUploaderLimit(host: Pick<ImageUploaderHost, 'data'>): number {
  const raw = Number(host.data.maxCount)
  return Math.max(BUSINESS_UPLOADER_MAX_COUNT, Number.isFinite(raw) ? Math.floor(raw) : BUSINESS_UPLOADER_MAX_COUNT)
}

export function imageUploaderItems(host: Pick<ImageUploaderHost, 'data'>, references: MediaReference[]): ImageUploaderItem[] {
  const limited = host.data.multiple ? references.slice(0, imageUploaderLimit(host)) : references.slice(0, 1)
  return limited.map((reference, index) => imageUploaderItem(reference, index))
}

export function syncImageUploaderItems(host: ImageUploaderHost): void {
  const references = normalizeImageUploaderValue(imageUploaderValue(host))
  const items = imageUploaderItems(host, references)
  host.setData({ items, canChoose: items.length < imageUploaderLimit(host) })
}

/** 回写 change：三端统一为 detail.value（门店/供应商/用户页面的读取方式一致）。 */
export function emitImageUploaderValue(host: ImageUploaderHost, references: MediaReference[]): void {
  const items = imageUploaderItems(host, references)
  const value = host.data.multiple ? items.map((item) => item.reference) : items.length ? items[0].reference : null
  host.setData({ items, canChoose: items.length < imageUploaderLimit(host) })
  host.triggerEvent('change', { value })
}

export function createImageUploaderComponent(): Record<string, unknown> {
  return {
    options: { addGlobalClass: true },
    properties: {
      value: { type: null, value: null },
      modelValue: { type: null, value: null },
      multiple: { type: Boolean, value: false },
      maxCount: { type: Number, value: 1 },
      purpose: { type: String, value: 'media' },
      profile: { type: String, value: 'normal' },
      disabled: { type: Boolean, value: false }
    },
    data: {
      items: [] as ImageUploaderItem[],
      uploading: false,
      canChoose: true
    },
    observers: {
      'value, modelValue, multiple, maxCount'() {
        syncImageUploaderItems(this as unknown as ImageUploaderHost)
      }
    },
    lifetimes: {
      attached(this: ImageUploaderHost) {
        syncImageUploaderItems(this)
      }
    },
    methods: {
      syncItems(this: ImageUploaderHost) {
        syncImageUploaderItems(this)
      },
      async choose(this: ImageUploaderHost) {
        if (this.data.disabled || this.data.uploading || !this.data.canChoose) return
        this.setData({ uploading: true })
        try {
          const runtime = getMediaRuntime()
          const current = normalizeImageUploaderValue(imageUploaderValue(this))
          const limit = imageUploaderLimit(this)
          const files = await runtime.chooseImages({
            count: this.data.multiple ? Math.max(1, limit - current.length) : 1,
            profile: this.data.profile === 'license' ? 'license' : 'normal'
          })
          const saved = await Promise.all(files.map((file) => savePreparedMediaFile(runtime, file, this.data.purpose || 'media')))
          const merged = this.data.multiple ? [...current, ...saved].slice(0, limit) : saved.length ? [saved[0]] : current.slice(0, 1)
          emitImageUploaderValue(this, merged)
        } catch (error) {
          const message = error instanceof Error && error.message ? error.message : '图片上传失败'
          this.triggerEvent('error', { message })
          miniProgramApi().showToast({ title: message, icon: 'none' })
        } finally {
          this.setData({ uploading: false })
        }
      },
      remove(this: ImageUploaderHost, event: { currentTarget?: { dataset?: Record<string, unknown> } }) {
        if (this.data.disabled) return
        const index = Number(event?.currentTarget?.dataset?.index)
        if (!Number.isInteger(index) || index < 0) return
        const remaining = normalizeImageUploaderValue(imageUploaderValue(this)).filter((_item, itemIndex) => itemIndex !== index)
        emitImageUploaderValue(this, remaining)
      },
      preview(this: ImageUploaderHost, event: { detail?: { url?: string }; currentTarget?: { dataset?: Record<string, unknown> } }) {
        const urls = (this.data.items || []).map((item) => item.url).filter(Boolean)
        const detailUrl = event?.detail?.url
        const index = Number(event?.currentTarget?.dataset?.index)
        const datasetUrl = Number.isInteger(index) && index >= 0 ? this.data.items?.[index]?.url : undefined
        const current = detailUrl || datasetUrl || urls[0]
        if (!current) return
        miniProgramApi().previewImage({ current, urls: urls.length ? urls : [current] })
      }
    }
  }
}

export interface ImportLegacyMediaAssetInput {
  assetId: string
  filePath: string
  mimeType: MediaMimeType
  bytes: Uint8Array
  width?: number
  height?: number
  purpose?: string
  digest?: (data: Uint8Array) => Promise<string>
  now?: string | number | Date
}

/**
 * 历史导入资产已绑定到业务数据（`legacy-import:<assetId>`）。
 * 这类资产不能算 pending：业务记录里保存的就是它的 assetId，
 * 若被 cleanupPendingMediaAssets 当成无引用资产回收，会直接丢用户已上传的图。
 */
const LEGACY_IMPORT_BINDING_PREFIX = 'legacy-import:'

/**
 * 把历史自制存储（端内 key -> 本地路径）里已有的资产登记进共享媒体仓储，
 * 沿用原 assetId，保证业务数据里既有的 asset 引用继续可解析；登记即视为已绑定。
 */
export async function importLegacyMediaAsset(
  storage: MediaAssetRepository,
  input: ImportLegacyMediaAssetInput
): Promise<MediaReference> {
  const assetId = input.assetId.trim()
  if (!assetId) throw new Error('assetId is required')
  const now = input.now === undefined ? new Date().toISOString() : new Date(input.now).toISOString()
  const hash = await (input.digest ?? miniProgramSha256)(Uint8Array.from(input.bytes))
  return storage.runAssetTransaction(async (transaction) => {
    const existing = await transaction.get(assetId)
    if (existing) return { source: 'asset', assetId }
    await transaction.put({
      id: assetId,
      purpose: input.purpose || 'legacy-import',
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      width: Math.max(1, Math.floor(input.width || 1)),
      height: Math.max(1, Math.floor(input.height || 1)),
      sha256: hash,
      status: 'bound',
      bindings: [LEGACY_IMPORT_BINDING_PREFIX + assetId],
      pendingBindings: [],
      createdAt: now,
      updatedAt: now,
      filePath: input.filePath
    })
    return { source: 'asset', assetId }
  })
}