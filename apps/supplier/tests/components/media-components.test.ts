import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 原生运行时只允许 wx.* 能力：组件脚本不得再出现旧框架 / 浏览器 / 本地存储分支。 */
const forbiddenScripts = /\buni\.|\bwindow\.|\bdocument\.|localStorage/

function read(...segments: string[]): string {
  return readFileSync(resolve(import.meta.dirname, ...segments), 'utf8')
}
const businessImageTs = read('../../src/components/BusinessImage/index.ts')
const businessImageWxml = read('../../src/components/BusinessImage/index.wxml')
const imageUploaderTs = read('../../src/components/ImageUploader/index.ts')
const imageUploaderWxml = read('../../src/components/ImageUploader/index.wxml')
const imageUploaderJson = read('../../src/components/ImageUploader/index.json')
const runtime = read('../../src/media/runtime.ts')

describe('供应商端媒体组件统一契约', () => {
  it('BusinessImage 只做平台绑定，行为来自三端共享实现', () => {
    expect(businessImageTs).toContain("import { createBusinessImageComponent } from '@agritainment/shared'")
    expect(businessImageTs).toContain('Component(createBusinessImageComponent())')
    expect(businessImageTs).not.toMatch(forbiddenScripts)
    expect(businessImageWxml).toContain('binderror="onImageError"')
    expect(businessImageWxml).toContain('bindtap="onTap"')
  })

  it('ImageUploader 与用户端同源，不再自制存储分叉', () => {
    expect(imageUploaderTs).toContain("import { createImageUploaderComponent } from '@agritainment/shared'")
    expect(imageUploaderTs).toContain('Component(createImageUploaderComponent())')
    expect(imageUploaderTs).not.toMatch(forbiddenScripts)
    expect(imageUploaderTs).not.toContain('agritainment-supplier-media')
    expect(imageUploaderWxml).toContain('bindtap="choose"')
    expect(imageUploaderWxml).toContain('bind:click="preview"')
    expect(imageUploaderJson).toContain('"business-image": "../BusinessImage/index"')
  })

  it('供应商端与用户端 ImageUploader 模板一致', () => {
    const userTemplate = read('..', '..', '..', 'user', 'src', 'components', 'ImageUploader.wxml')
    expect(imageUploaderWxml).toBe(userTemplate)
  })

  it('媒体运行时只注入共享配置，历史映射仅保留一次性迁移', () => {
    expect(runtime).toContain('createMiniProgramMediaRuntime')
    expect(runtime).toContain('migrateSupplierLegacyMedia')
    expect(runtime).toContain('importLegacyMediaAsset')
    expect(runtime).toContain('LEGACY_SUPPLIER_MEDIA_PREFIX')
    expect(runtime).not.toMatch(forbiddenScripts)
  })
})