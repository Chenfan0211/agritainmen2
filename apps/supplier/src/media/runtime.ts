// 供应商端媒体运行时：三端共用实现收在 @agritainment/shared，本文件只注入端内命名空间与历史数据迁移。
import { createMiniProgramMediaRuntime, importLegacyMediaAsset, miniProgramImageMime, miniProgramSha256 } from '@agritainment/shared'
import type { MediaMimeType, MediaRuntime } from '@agritainment/shared'

/** 命名空间沿用 agritainment-media 目录与 agritainment-platform-repository 仓储键，既有资产继续可解析。 */
export const SUPPLIER_MEDIA_NAMESPACE = 'agritainment'

/** 历史版本的文件映射前缀：迁移完成后不再写入，只保留一次性读取能力。 */
export const LEGACY_SUPPLIER_MEDIA_PREFIX = 'agritainment-supplier-media:'

export function createSupplierMediaRuntime(): MediaRuntime {
  return createMiniProgramMediaRuntime({ namespace: SUPPLIER_MEDIA_NAMESPACE })
}

interface SupplierStorageApi {
  getStorageInfoSync?(): { keys?: string[] }
  getStorageSync(key: string): unknown
  removeStorageSync(key: string): void
  getFileSystemManager?(): {
    readFile(options: { filePath: string; success?: (result: { data: ArrayBuffer | string }) => void; fail?: (error: unknown) => void }): void
  }
  getImageInfo?(options: { src: string; success?: (result: { width: number; height: number; type?: string }) => void; fail?: (error: unknown) => void }): void
}

function readLocalFile(api: SupplierStorageApi, filePath: string): Promise<Uint8Array | null> {
  const manager = api.getFileSystemManager?.()
  if (!manager) return Promise.resolve(null)
  return new Promise((resolve) => manager.readFile({
    filePath,
    success: ({ data }) => resolve(typeof data === 'string' ? null : new Uint8Array(data)),
    fail: () => resolve(null)
  }))
}

function readImageInfo(api: SupplierStorageApi, filePath: string): Promise<{ width: number; height: number; type?: string } | null> {
  if (!api.getImageInfo) return Promise.resolve(null)
  return new Promise((resolve) => api.getImageInfo!({
    src: filePath,
    success: (info) => resolve(info),
    fail: () => resolve(null)
  }))
}

function legacyMimeType(filePath: string, infoType?: string): MediaMimeType {
  try {
    return miniProgramImageMime(filePath, infoType)
  } catch {
    return 'image/jpeg'
  }
}

/**
 * 一次性迁移：把 'agritainment-supplier-media:<assetId>' -> 本地路径 的自制映射登记进共享媒体仓储，
 * 沿用原 assetId，保证业务数据里既有的 asset 引用继续可解析；登记成功后删除旧键。
 * 单个资产迁移失败时保留旧键（下次启动重试），不影响启动流程。
 */
export async function migrateSupplierLegacyMedia(runtime: MediaRuntime): Promise<number> {
  const api = (globalThis as unknown as { wx?: SupplierStorageApi }).wx
  const keys = api?.getStorageInfoSync?.().keys
  if (!api || !Array.isArray(keys)) return 0
  let migrated = 0
  for (const key of keys) {
    if (!key.startsWith(LEGACY_SUPPLIER_MEDIA_PREFIX)) continue
    const assetId = key.slice(LEGACY_SUPPLIER_MEDIA_PREFIX.length).trim()
    const filePath = String(api.getStorageSync(key) || '')
    if (!assetId || !filePath) continue
    try {
      const bytes = await readLocalFile(api, filePath)
      if (!bytes || !bytes.byteLength) {
        api.removeStorageSync(key)
        continue
      }
      const info = await readImageInfo(api, filePath)
      await importLegacyMediaAsset(runtime.storage, {
        assetId,
        filePath,
        bytes,
        mimeType: legacyMimeType(filePath, info?.type),
        width: info?.width,
        height: info?.height,
        purpose: 'supplier-legacy-import',
        digest: miniProgramSha256
      })
      api.removeStorageSync(key)
      migrated += 1
    } catch {
      // 失败时保留旧键，下一次启动重试。
    }
  }
  return migrated
}