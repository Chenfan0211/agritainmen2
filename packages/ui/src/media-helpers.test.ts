import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { MediaReference } from '@agritainment/shared'

const helperUrl = new URL('./media-helpers.ts', import.meta.url)

async function loadHelpers() {
  expect(existsSync(helperUrl), '共享媒体 helper 尚未实现').toBe(true)
  return import('./media-helpers')
}

describe('shared media helpers', () => {
  it('allows compact thumbnails to hide the visible error badge without changing the default', () => {
    const source = readFileSync(new URL('./BusinessImage.vue', import.meta.url), 'utf8')
    expect(source).toContain('showError?: boolean')
    expect(source).toContain('errorFallback?: MediaReference | string | null')
    expect(source).toContain("showError: true")
    expect(source).toContain('v-if="failed && showError"')
    expect(source).toContain('watch(() => props.fallback')
    expect(source).toContain('controller?.dispose()')
  })

  it('媒体运行时接管前可直接显示内置图和旧 URL', async () => {
    const { initialResolvedMediaUrl } = await loadHelpers()
    expect(initialResolvedMediaUrl('/static/images/tea.jpg')).toBe('/static/images/tea.jpg')
    expect(initialResolvedMediaUrl({ source: 'legacy', url: 'https://example.com/tea.jpg' })).toBe('https://example.com/tea.jpg')
    expect(initialResolvedMediaUrl({ source: 'asset', assetId: 'A1' })).toBe('')
  })

  it('普通图和证照使用不同的压缩边界', async () => {
    const { mediaCompressionProfile } = await loadHelpers()
    expect(mediaCompressionProfile('normal')).toEqual({ maxEdge: 1600, quality: 0.82 })
    expect(mediaCompressionProfile('license')).toEqual({ maxEdge: 2400, quality: 0.9 })
  })

  it('按最长边等比计算压缩尺寸且不放大小图', async () => {
    const { fitMediaDimensions } = await loadHelpers()
    expect(fitMediaDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitMediaDimensions(800, 1200, 1600)).toEqual({ width: 800, height: 1200 })
  })

  it('读取兼容 legacy string，但新增值只接收 MediaReference 并限制数量', async () => {
    const { mergeUploadedMedia, normalizeUploaderValue, uploaderCanChoose } = await loadHelpers()
    expect(normalizeUploaderValue('/static/images/tea.jpg')).toEqual([{ source: 'builtin', path: '/static/images/tea.jpg' }])
    const current: MediaReference[] = [{ source: 'asset', assetId: 'A1' }]
    const incoming: MediaReference[] = [{ source: 'asset', assetId: 'A2' }, { source: 'asset', assetId: 'A3' }]
    expect(mergeUploadedMedia(current, incoming, true, 2)).toEqual(current.concat(incoming[0]))
    expect(mergeUploadedMedia(current, incoming, false, 1)).toEqual([incoming[0]])
    expect(uploaderCanChoose(0, false, 1)).toBe(true)
    expect(uploaderCanChoose(1, false, 1)).toBe(false)
    expect(uploaderCanChoose(2, true, 2)).toBe(false)
  })

  it('支持图库稳定排序并拒绝越界移动', async () => {
    const { moveUploadedMedia } = await loadHelpers()
    const values: MediaReference[] = [
      { source: 'asset', assetId: 'A1' },
      { source: 'asset', assetId: 'A2' },
      { source: 'asset', assetId: 'A3' }
    ]
    expect(moveUploadedMedia(values, 2, 0).map((item: MediaReference) => item.source === 'asset' ? item.assetId : '')).toEqual(['A3', 'A1', 'A2'])
    expect(moveUploadedMedia(values, -1, 1)).toEqual(values)
  })

  it('切换和销毁时释放 URL，过期异步结果不会覆盖新图', async () => {
    const { createResolvedMediaController } = await loadHelpers()
    const pending = new Map<string, (url: string) => void>()
    const release = vi.fn()
    const resolved: string[] = []
    const controller = createResolvedMediaController({
      fallbackUrl: '/static/images/fallback.jpg',
      resolve: (reference: MediaReference) => new Promise<string>((done) => {
        pending.set(reference.source === 'asset' ? reference.assetId : reference.source, done)
      }),
      release,
      onChange: (url: string) => resolved.push(url)
    })
    const first = controller.set({ source: 'asset', assetId: 'A1' })
    expect(resolved.at(-1)).toBe('/static/images/fallback.jpg')
    const second = controller.set({ source: 'asset', assetId: 'A2' })
    pending.get('A2')?.('blob:new')
    await second
    pending.get('A1')?.('blob:stale')
    await first
    expect(resolved.at(-1)).toBe('blob:new')
    expect(release).toHaveBeenCalledWith('blob:stale')
    controller.dispose()
    expect(release).toHaveBeenCalledWith('blob:new')
  })

  it.each([
    { label: 'builtin', reference: { source: 'builtin', path: '/static/images/tea.jpg' } as const, expected: '/static/images/tea.jpg' },
    { label: 'legacy URL', reference: { source: 'legacy', url: 'https://legacy.example/tea.jpg' } as const, expected: 'https://legacy.example/tea.jpg' }
  ])('解析并显示 $label 引用', async ({ reference, expected }) => {
    const { createResolvedMediaController } = await loadHelpers()
    const onChange = vi.fn()
    const controller = createResolvedMediaController({
      fallbackUrl: '/static/images/fallback.jpg',
      resolve: async (value: MediaReference) => value.source === 'builtin' ? value.path : value.source === 'legacy' ? value.url : `blob:${value.assetId}`,
      release: () => undefined,
      onChange
    })

    await controller.set(reference)

    expect(onChange).toHaveBeenLastCalledWith(expected)
  })

  it('解析失败时显示 builtin fallback', async () => {
    const { createResolvedMediaController } = await loadHelpers()
    const onChange = vi.fn()
    const onError = vi.fn()
    const controller = createResolvedMediaController({
      fallbackUrl: '/static/images/fallback.jpg',
      resolve: async () => { throw new Error('missing') },
      release: () => undefined,
      onChange,
      onError
    })
    await controller.set({ source: 'asset', assetId: 'missing' })
    expect(onChange).toHaveBeenLastCalledWith('/static/images/fallback.jpg')
    expect(onError).toHaveBeenLastCalledWith(true)
  })

  it('builtin fallback 自身加载失败时继续显示最终兜底图', async () => {
    const { createResolvedMediaController } = await loadHelpers()
    const onChange = vi.fn()
    const controller = createResolvedMediaController({
      fallbackUrl: '/static/images/categories/agricultural-products.jpg',
      errorFallbackUrl: '/static/images/categories/fallback.jpg',
      resolve: async (reference: MediaReference) => reference.source === 'builtin' ? reference.path : reference.source === 'legacy' ? reference.url : `blob:${reference.assetId}`,
      release: () => undefined,
      onChange
    })

    await controller.set({ source: 'builtin', path: '/static/images/categories/agricultural-products.jpg' })
    controller.fail('/static/images/categories/agricultural-products.jpg')

    expect(onChange).toHaveBeenLastCalledWith('/static/images/categories/fallback.jpg')
  })

  it('图片加载失败时释放当前 object URL，并忽略旧 URL 的迟到错误', async () => {
    const { createResolvedMediaController } = await loadHelpers()
    const release = vi.fn()
    const onChange = vi.fn()
    const onError = vi.fn()
    const controller = createResolvedMediaController({
      fallbackUrl: '/static/images/fallback.jpg',
      resolve: async (reference: MediaReference) => reference.source === 'asset' ? `blob:${reference.assetId}` : '',
      release,
      onChange,
      onError
    })
    await controller.set({ source: 'asset', assetId: 'A1' })
    await controller.set({ source: 'asset', assetId: 'A2' })

    controller.fail('blob:A1')
    expect(onChange).toHaveBeenLastCalledWith('blob:A2')
    controller.fail('blob:A2')

    expect(release).toHaveBeenCalledWith('blob:A2')
    expect(onChange).toHaveBeenLastCalledWith('/static/images/fallback.jpg')
    expect(onError).toHaveBeenLastCalledWith(true)
  })
})

describe('shared media source boundaries', () => {
  it('导出 BusinessImage、ImageUploader 和 H5/小程序 runtime', () => {
    const indexUrl = new URL('./index.ts', import.meta.url)
    expect(existsSync(indexUrl), 'packages/ui 入口尚未实现').toBe(true)
    if (!existsSync(indexUrl)) return
    const source = readFileSync(indexUrl, 'utf8')
    expect(source).toContain("export { default as BusinessImage } from './BusinessImage.vue'")
    expect(source).toContain("export { default as ImageUploader } from './ImageUploader.vue'")
    expect(source).toContain("export * from './runtime'")
    expect(source).not.toContain("export * from './h5-runtime'")
    expect(source).not.toContain("export * from './mp-runtime'")
  })
})
