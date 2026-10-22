import type { MediaAssetRepository, MediaMimeType, MediaReference, MediaSaveOptions } from '@agritainment/shared'
import type { MediaCompressionKind } from './media-helpers'

export const DEFAULT_BUSINESS_IMAGE_FALLBACK: MediaReference = { source: 'builtin', path: '/static/images/farmhouse.jpg' }

interface PreparedMediaDimensions {
  width: number
  height: number
}

export type PreparedMediaFile = PreparedMediaDimensions & (
  | { blob: Blob; bytes?: never; mimeType?: never }
  | { blob?: never; bytes: Uint8Array; mimeType: MediaMimeType }
)

export interface ChooseMediaOptions {
  count: number
  profile: MediaCompressionKind
}

export interface MediaRuntime {
  storage: MediaAssetRepository
  chooseImages(options: ChooseMediaOptions): Promise<PreparedMediaFile[]>
  fallback: MediaReference
  digest?: MediaSaveOptions['digest']
}

export function savePreparedMediaFile(runtime: MediaRuntime, file: PreparedMediaFile, purpose: string): Promise<Extract<MediaReference, { source: 'asset' }>> {
  const options = { width: file.width, height: file.height, digest: runtime.digest }
  if (file.bytes) {
    if (!runtime.storage.saveBytes) return Promise.reject(new Error('当前媒体存储不支持字节保存'))
    return runtime.storage.saveBytes(file.bytes, file.mimeType, purpose, options)
  }
  return runtime.storage.save(file.blob, purpose, options)
}

const mediaRuntimeRegistryKey = Symbol.for('agritainment.ui.mediaRuntime')
type MediaRuntimeRegistry = { current: MediaRuntime | null }

const mediaRuntimeRegistry = (() => {
  const globalObject = globalThis as typeof globalThis & Record<symbol, MediaRuntimeRegistry | undefined>
  return globalObject[mediaRuntimeRegistryKey] ?? (globalObject[mediaRuntimeRegistryKey] = { current: null })
})()

export function configureMediaRuntime(runtime: MediaRuntime): void {
  mediaRuntimeRegistry.current = runtime
}

export function isMediaRuntimeConfigured(): boolean {
  return mediaRuntimeRegistry.current !== null
}

export function getMediaRuntime(): MediaRuntime {
  if (!mediaRuntimeRegistry.current) throw new Error('媒体 runtime 尚未配置')
  return mediaRuntimeRegistry.current
}
