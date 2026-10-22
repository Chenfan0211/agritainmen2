// 门店端媒体运行时：三端共用实现收在 @agritainment/shared，本文件只注入端内命名空间。
import { createMiniProgramMediaRuntime } from '@agritainment/shared'
import type { MediaRuntime } from '@agritainment/shared'

/** 命名空间沿用 agritainment-media 目录与 agritainment-platform-repository 仓储键，既有资产继续可解析。 */
export const STORE_MEDIA_NAMESPACE = 'agritainment'

export function createStoreMediaRuntime(): MediaRuntime {
  return createMiniProgramMediaRuntime({ namespace: STORE_MEDIA_NAMESPACE })
}