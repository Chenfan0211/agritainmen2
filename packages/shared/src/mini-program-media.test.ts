import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BUSINESS_IMAGE_FALLBACK,
  DEFAULT_MEDIA_DIRECTORY_NAME,
  DEFAULT_MEDIA_NAMESPACE,
  MemoryMediaStorageAdapter,
  applyBusinessImageReference,
  businessImageClickDetail,
  businessImageFallbackUrls,
  cleanupPendingMediaAssets,
  configureMediaRuntime,
  createBusinessImageComponent,
  createImageUploaderComponent,
  createMediaFileSystem,
  createMiniProgramMediaRuntime,
  directMediaUrl,
  emitImageUploaderValue,
  failBusinessImage,
  imageUploaderItems,
  imageUploaderLimit,
  imageUploaderValue,
  importLegacyMediaAsset,
  miniProgramApi,
  miniProgramImageMime,
  miniProgramSha256,
  savePreparedMediaFile
} from './index'
import type { MediaAssetRepository, MediaMimeType, MediaReference, MediaRuntime } from './index'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const DIMENSIONS = { width: 640, height: 480 }

/** 本地内存版存储：补齐 saveBytes，让上传链路可以脱离微信文件系统单测。 */
class StubMediaStorageAdapter extends MemoryMediaStorageAdapter {
  saveBytes(data: Uint8Array, mimeType: MediaMimeType, purpose: string, options: { width: number; height: number }): Promise<Extract<MediaReference, { source: 'asset' }>> {
    return this.save(new Blob([Uint8Array.from(data)], { type: mimeType }), purpose, options)
  }
}

function storage(): StubMediaStorageAdapter {
  let sequence = 0
  return new StubMediaStorageAdapter({
    objectUrls: {
      createObjectURL: () => `blob:mini-program/${++sequence}`,
      revokeObjectURL: () => undefined
    }
  })
}

function mediaRuntime(overrides: Partial<MediaRuntime> = {}): MediaRuntime {
  return {
    storage: storage(),
    fallback: { ...DEFAULT_BUSINESS_IMAGE_FALLBACK },
    digest: miniProgramSha256,
    chooseImages: async () => [],
    ...overrides
  }
}

interface ComponentOptions {
  properties: Record<string, { value?: unknown }>
  data: Record<string, unknown>
  observers: Record<string, (...args: unknown[]) => void>
  lifetimes: Record<string, (this: unknown) => void>
  methods: Record<string, (...args: unknown[]) => unknown>
}

interface FakeInstance {
  data: Record<string, any>
  events: Array<{ name: string; detail: unknown }>
  setData(patch: Record<string, unknown>): void
  triggerEvent(name: string, detail?: unknown): void
  [key: string]: any
}

/** 用最小宿主模拟 Component 实例：属性并入 data，方法与生命周期按 this 绑定。 */
function instantiate(component: Record<string, unknown>, properties: Record<string, unknown> = {}): FakeInstance {
  const options = component as unknown as ComponentOptions
  const data: Record<string, unknown> = {}
  for (const [name, definition] of Object.entries(options.properties)) data[name] = definition.value ?? null
  Object.assign(data, options.data, properties)
  const events: Array<{ name: string; detail: unknown }> = []
  const instance: FakeInstance = {
    data,
    events,
    setData(patch) { Object.assign(data, patch) },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  }
  for (const [name, method] of Object.entries(options.methods)) instance[name] = method.bind(instance)
  for (const [name, handler] of Object.entries({ ...options.lifetimes, ...options.observers })) instance[name] = handler.bind(instance)
  return instance
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface FakeWx {
  env: { USER_DATA_PATH: string }
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  getFileSystemManager(): {
    mkdir(options: { success?: () => void; fail?: (error: unknown) => void }): void
    writeFile(options: { filePath: string; data: ArrayBuffer; success?: () => void; fail?: (error: unknown) => void }): void
    readFile(options: { filePath: string; success?: (result: { data: ArrayBufferLike }) => void; fail?: (error: unknown) => void }): void
    unlink(options: { filePath: string; success?: () => void; fail?: (error: unknown) => void }): void
  }
  chooseMedia(options: { success?: (result: { tempFiles: Array<{ tempFilePath: string; size: number; fileType: string }> }) => void }): void
  getImageInfo(options: { src: string; success?: (result: { width: number; height: number; type: string }) => void }): void
  previewImage(options: { current?: string; urls: string[] }): void
  showToast(options: { title: string; icon?: string }): void
}

function installFakeWx(): { wx: FakeWx; files: Map<string, Uint8Array>; previews: Array<{ current?: string; urls: string[] }>; toasts: string[] } {
  const files = new Map<string, Uint8Array>()
  const previews: Array<{ current?: string; urls: string[] }> = []
  const toasts: string[] = []
  const storageValues = new Map<string, unknown>()
  const wx = {
    env: { USER_DATA_PATH: 'http://usr' },
    getStorageSync: (key: string) => storageValues.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => { storageValues.set(key, value) },
    getFileSystemManager: () => ({
      mkdir: ({ success }: { success?: () => void }) => success?.(),
      writeFile: ({ filePath, data, success }: { filePath: string; data: ArrayBuffer; success?: () => void }) => {
        files.set(filePath, new Uint8Array(data))
        success?.()
      },
      readFile: ({ filePath, success, fail }: { filePath: string; success?: (result: { data: ArrayBufferLike }) => void; fail?: (error: unknown) => void }) => {
        const data = files.get(filePath)
        if (data) success?.({ data: data.buffer })
        else fail?.(new Error('file not found'))
      },
      unlink: ({ filePath, success }: { filePath: string; success?: () => void }) => {
        files.delete(filePath)
        success?.()
      }
    }),
    chooseMedia: ({ success }: { success?: (result: { tempFiles: Array<{ tempFilePath: string; size: number; fileType: string }> }) => void }) => {
      success?.({ tempFiles: [{ tempFilePath: 'wxfile://tmp-cover.jpg', size: PNG_BYTES.byteLength, fileType: 'image' }] })
    },
    getImageInfo: ({ success }: { success?: (result: { width: number; height: number; type: string }) => void }) => {
      success?.({ width: DIMENSIONS.width, height: DIMENSIONS.height, type: 'jpg' })
    },
    previewImage: (options: { current?: string; urls: string[] }) => { previews.push(options) },
    showToast: (options: { title: string }) => { toasts.push(options.title) }
  }
  files.set('wxfile://tmp-cover.jpg', Uint8Array.from(PNG_BYTES))
  ;(globalThis as unknown as { wx?: unknown }).wx = wx
  return { wx, files, previews, toasts }
}

afterEach(() => {
  delete (globalThis as unknown as { wx?: unknown }).wx
  vi.useRealTimers()
})

describe('三端共享媒体引用解析', () => {
  it('asset 引用在运行时未配置时按兜底图占位，重试达到上限后置失败态', async () => {
    vi.useFakeTimers()
    const instance = instantiate(createBusinessImageComponent(), { src: { source: 'asset', assetId: 'media-missing' } })
    applyBusinessImageReference(instance, instance.data.src)
    expect(instance.data.resolved).toBe(directMediaUrl(DEFAULT_BUSINESS_IMAGE_FALLBACK))
    expect(instance.data.failed).toBe(false)

    vi.runAllTimers()
    expect(instance.data.failed).toBe(true)
    expect(instance.data.resolved).toBe(directMediaUrl(DEFAULT_BUSINESS_IMAGE_FALLBACK))
  })

  it('builtin / legacy / 本地文件路径都能直接作为 image src，asset 交给媒体存储解析', async () => {
    expect(directMediaUrl({ source: 'builtin', path: 'static/images/farmhouse.jpg' })).toBe('/static/images/farmhouse.jpg')
    expect(directMediaUrl({ source: 'legacy', url: 'https://cdn.example.com/farm.png' })).toBe('https://cdn.example.com/farm.png')
    expect(directMediaUrl('wxfile://tmp_upload.png')).toBe('wxfile://tmp_upload.png')
    expect(directMediaUrl(`${'http://usr'}/agritainment-media/media-1`)).toBe('http://usr/agritainment-media/media-1')
    expect(directMediaUrl({ source: 'asset', assetId: 'media-1' })).toBe('')
    expect(directMediaUrl(null)).toBe('')

    const runtime = mediaRuntime()
    configureMediaRuntime(runtime)
    const saved = await runtime.storage.save(new Blob([Uint8Array.from(PNG_BYTES)], { type: 'image/png' }), 'cover', DIMENSIONS)
    const instance = instantiate(createBusinessImageComponent(), { src: saved })
    applyBusinessImageReference(instance, instance.data.src)
    await flush()
    expect(instance.data.resolved).toBe('blob:mini-program/1')
    expect(instance.data.failed).toBe(false)
  })

  it('fallback 与 errorFallback 回退链路：属性优先，errorFallback 缺省时沿用 fallback', () => {
    configureMediaRuntime(mediaRuntime())
    const defaults = businessImageFallbackUrls({ data: {} })
    expect(defaults.fallbackUrl).toBe(directMediaUrl(DEFAULT_BUSINESS_IMAGE_FALLBACK))
    expect(defaults.errorFallbackUrl).toBe(defaults.fallbackUrl)

    const explicit = businessImageFallbackUrls({
      data: { fallback: '/static/images/fallback.jpg', errorFallback: { source: 'builtin', path: '/static/images/error.jpg' } }
    })
    expect(explicit.fallbackUrl).toBe('/static/images/fallback.jpg')
    expect(explicit.errorFallbackUrl).toBe('/static/images/error.jpg')
  })

  it('图片 binderror 只回退到 errorFallback 一次，无法回退时保持失败态', () => {
    configureMediaRuntime(mediaRuntime())
    const instance = instantiate(createBusinessImageComponent(), {
      src: 'https://cdn.example.com/broken.png',
      errorFallback: '/static/images/error.jpg'
    })
    applyBusinessImageReference(instance, instance.data.src)
    instance.onImageError()
    expect(instance.data.resolved).toBe('/static/images/error.jpg')
    expect(instance.data.failed).toBe(true)

    instance.onImageError()
    expect(instance.data.resolved).toBe('/static/images/error.jpg')
    expect(instance.data.failed).toBe(true)

    const layered = instantiate(createBusinessImageComponent(), { src: '/static/images/missing.jpg', errorFallback: '/static/images/error.jpg' })
    applyBusinessImageReference(layered, layered.data.src)
    failBusinessImage(layered, layered.data.resolved)
    expect(layered.data.resolved).toBe('/static/images/error.jpg')
    failBusinessImage(layered, layered.data.resolved)
    expect(layered.data.resolved).toBe('/static/images/error.jpg')
    expect(layered.data.failed).toBe(true)
  })

  it('asset 解析失败时回退到 errorFallback 并置失败态', async () => {
    configureMediaRuntime(mediaRuntime())
    const instance = instantiate(createBusinessImageComponent(), {
      src: { source: 'asset', assetId: 'media-not-saved' },
      errorFallback: '/static/images/error.jpg'
    })
    applyBusinessImageReference(instance, instance.data.src)
    await flush()
    expect(instance.data.resolved).toBe('/static/images/error.jpg')
    expect(instance.data.failed).toBe(true)
  })

  it('点击事件携带可直接交给 wx.previewImage 的 url', () => {
    configureMediaRuntime(mediaRuntime())
    const instance = instantiate(createBusinessImageComponent(), { src: 'wxfile://tmp_upload.png' })
    applyBusinessImageReference(instance, instance.data.src)
    expect(businessImageClickDetail(instance)).toEqual({ url: 'wxfile://tmp_upload.png' })
    instance.onTap()
    expect(instance.events).toEqual([{ name: 'click', detail: { url: 'wxfile://tmp_upload.png' } }])
  })

  it('组件契约包含 mode / showError / fallback / errorFallback 与 binderror 处理方法', () => {
    const options = createBusinessImageComponent() as unknown as ComponentOptions
    expect(Object.keys(options.properties)).toEqual(['src', 'fallback', 'errorFallback', 'mode', 'showError'])
    expect(options.properties.mode.value).toBe('aspectFill')
    expect(options.properties.showError.value).toBe(true)
    expect(Object.keys(options.observers)).toEqual(['src, fallback, errorFallback'])
    expect(Object.keys(options.methods)).toEqual(['onTap', 'onImageError'])
    expect(options.data).toEqual({ resolved: '', failed: false })
  })
})

describe('三端共享图片上传', () => {
  it('wx.chooseMedia 选取后落盘到 wx.env.USER_DATA_PATH 并生成 asset 引用', async () => {
    const fake = installFakeWx()
    const runtime = createMiniProgramMediaRuntime({ namespace: 'test' })
    configureMediaRuntime(runtime)

    const chosen = await runtime.chooseImages({ count: 1, profile: 'normal' })
    expect(chosen).toHaveLength(1)
    expect(chosen[0]).toMatchObject({ mimeType: 'image/jpeg', width: DIMENSIONS.width, height: DIMENSIONS.height })

    const reference = await savePreparedMediaFile(runtime, chosen[0], 'product-cover')
    expect(reference.source).toBe('asset')
    const written = [...fake.files.keys()].filter((path) => path.includes('/test-media/'))
    expect(written).toHaveLength(1)
    expect(written[0].startsWith(`http://usr/test-media/${reference.assetId}`)).toBe(true)

    // 默认命名空间与默认目录名保持与既有端内数据一致。
    expect(miniProgramApi().env.USER_DATA_PATH).toBe('http://usr')
    expect(DEFAULT_MEDIA_NAMESPACE).toBe('agritainment')
    const defaultRuntime = createMiniProgramMediaRuntime()
    const defaultChosen = await defaultRuntime.chooseImages({ count: 1, profile: 'normal' })
    expect(defaultChosen[0]).toMatchObject({ mimeType: 'image/jpeg' })
    const defaultReference = await defaultRuntime.storage.saveBytes!(
      Uint8Array.from([...PNG_BYTES, 7]),
      'image/png',
      'product-cover',
      { width: 1, height: 1, digest: defaultRuntime.digest }
    )
    expect([...fake.files.keys()]).toContain(`http://usr/${DEFAULT_MEDIA_DIRECTORY_NAME}/${defaultReference.assetId}`)
  })

  it('共享文件系统适配器在 wx 文件系统上完成写入 / 读取 / 删除', async () => {
    const fake = installFakeWx()
    const fileSystem = createMediaFileSystem(fake.wx.getFileSystemManager() as never, 'http://usr/manual-check')
    const path = 'http://usr/manual-check/media-1.png'
    await fileSystem.writeFile(path, Uint8Array.from(PNG_BYTES))
    expect(fake.files.get(path)).toEqual(Uint8Array.from(PNG_BYTES))
    expect(await fileSystem.readFile(path)).toEqual(Uint8Array.from(PNG_BYTES))
    expect(await fileSystem.readFile('http://usr/manual-check/missing.png')).toBeNull()
    await fileSystem.removeFile(path)
    expect(fake.files.has(path)).toBe(false)
  })

  it('选取 → change 回写 { value } → 删除 → wx.previewImage 预览，失败触发 error 事件', async () => {
    const fake = installFakeWx()
    configureMediaRuntime({ ...mediaRuntime(), chooseImages: async () => [{ bytes: Uint8Array.from(PNG_BYTES), mimeType: 'image/png', ...DIMENSIONS }] })
    const instance = instantiate(createImageUploaderComponent(), { purpose: 'after-sale', profile: 'license' })
    instance.attached()
    expect(instance.data.items).toEqual([])
    expect(instance.data.canChoose).toBe(true)

    await instance.choose()
    const changed = instance.events.filter((event) => event.name === 'change')
    expect(changed).toHaveLength(1)
    const saved = (changed[0].detail as { value: MediaReference }).value
    expect(saved.source).toBe('asset')
    expect(instance.data.items).toHaveLength(1)
    expect(instance.data.uploading).toBe(false)

    // 父页面回写 value 后组件重新同步列表，再走预览与删除。
    instance.data.value = saved
    instance.syncItems()
    expect(instance.data.items).toHaveLength(1)
    instance.preview({ detail: { url: 'blob:mini-program/1' } })
    expect(fake.previews).toEqual([{ current: 'blob:mini-program/1', urls: ['blob:mini-program/1'] }])

    instance.remove({ currentTarget: { dataset: { index: 0 } } })
    const removals = instance.events.filter((event) => event.name === 'change')
    expect((removals[1].detail as { value: unknown }).value).toBeNull()

    configureMediaRuntime({ ...mediaRuntime(), chooseImages: async () => { throw new Error('图片读取失败') } })
    const failing = instantiate(createImageUploaderComponent(), {})
    failing.attached()
    await failing.choose()
    expect(failing.events.filter((event) => event.name === 'error')).toEqual([{ name: 'error', detail: { message: '图片读取失败' } }])
    expect(fake.toasts).toEqual(['图片读取失败'])
    expect(failing.data.uploading).toBe(false)
  })

  it('modelValue 作为历史绑定别名，多图上限与 change 结构保持一致', async () => {
    installFakeWx()
    configureMediaRuntime(mediaRuntime())
    const instance = instantiate(createImageUploaderComponent(), {
      modelValue: [{ source: 'asset', assetId: 'media-a' }, { source: 'builtin', path: '/static/images/tea.jpg' }],
      multiple: true,
      maxCount: 3
    })
    instance.attached()
    expect(instance.data.items.map((item: { key: string }) => item.key)).toEqual(['media-a', '/static/images/tea.jpg'])
    expect(instance.data.canChoose).toBe(true)

    instance.syncItems()
    expect(instance.data.items).toHaveLength(2)

    // 属性别名、上限与列表推导都来自共享实现，三端行为一致。
    expect(imageUploaderValue(instance)).toBe(instance.data.modelValue)
    expect(imageUploaderLimit(instance)).toBe(3)
    expect(imageUploaderItems(instance, [{ source: 'asset', assetId: 'media-b' }]).map((item) => item.key)).toEqual(['media-b'])
    emitImageUploaderValue(instance, [{ source: 'asset', assetId: 'media-c' }])
    expect((instance.events.at(-1) as { detail: { value: MediaReference[] } }).detail.value).toEqual([{ source: 'asset', assetId: 'media-c' }])
  })
})

describe('历史自制存储迁移', () => {
  it('沿用原 assetId 登记本地文件，重复导入保持幂等', async () => {
    const target = storage()
    const input = {
      assetId: 'media-legacy-proof',
      filePath: 'http://usr/agritainment-media/media-legacy-proof.jpg',
      mimeType: 'image/jpeg' as MediaMimeType,
      bytes: Uint8Array.from(PNG_BYTES),
      width: DIMENSIONS.width,
      height: DIMENSIONS.height,
      purpose: 'supplier-legacy-import'
    }
    const reference = await importLegacyMediaAsset(target as MediaAssetRepository, input)
    expect(reference).toEqual({ source: 'asset', assetId: 'media-legacy-proof' })

    const stored = await target.runAssetTransaction((transaction) => transaction.get('media-legacy-proof'))
    expect(stored).toMatchObject({ id: 'media-legacy-proof', filePath: input.filePath, purpose: 'supplier-legacy-import', status: 'bound' })
    expect(stored?.bindings).toEqual(['legacy-import:media-legacy-proof'])
    expect(stored?.sha256).toBe(await miniProgramSha256(PNG_BYTES))

    await importLegacyMediaAsset(target as MediaAssetRepository, input)
    const all = await target.runAssetTransaction((transaction) => transaction.list())
    expect(all).toHaveLength(1)
  })

  it('历史导入资产已绑定，pending 清理不会误删', async () => {
    const target = storage()
    await importLegacyMediaAsset(target as MediaAssetRepository, {
      assetId: 'media-legacy-keep',
      filePath: 'http://usr/agritainment-media/media-legacy-keep.jpg',
      mimeType: 'image/jpeg' as MediaMimeType,
      bytes: Uint8Array.from(PNG_BYTES),
      width: DIMENSIONS.width,
      height: DIMENSIONS.height,
      purpose: 'supplier-legacy-import'
    })

    const removed = await cleanupPendingMediaAssets(target as MediaAssetRepository, { now: Date.now() + 48 * 60 * 60 * 1000 })
    expect(removed).toBe(0)
    const stored = await target.runAssetTransaction((transaction) => transaction.get('media-legacy-keep'))
    expect(stored?.status).toBe('bound')
  })

  it('由路径与 getImageInfo 类型推导受支持的 MIME，非法格式直接拒绝', () => {
    expect(miniProgramImageMime('wxfile://tmp_cover.JPG', 'jpg')).toBe('image/jpeg')
    expect(miniProgramImageMime('http://usr/agritainment-media/media-1.webp')).toBe('image/webp')
    expect(() => miniProgramImageMime('wxfile://tmp_anim.gif', 'gif')).toThrow('仅支持 jpeg/png/webp 图片')
  })
})