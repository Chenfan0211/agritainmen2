import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 原生运行时只允许 wx.* 能力：组件脚本不得再出现旧框架 / 浏览器 / 本地存储分支。 */
const forbiddenScripts = /\buni\.|\bwindow\.|\bdocument\.|localStorage/

function read(...segments: string[]): string {
  return readFileSync(resolve(import.meta.dirname, ...segments), 'utf8')
}
const businessImageTs = read('../../src/components/BusinessImage.ts')
const businessImageWxml = read('../../src/components/BusinessImage.wxml')
const imageUploaderTs = read('../../src/components/ImageUploader.ts')
const imageUploaderWxml = read('../../src/components/ImageUploader.wxml')
const imageUploaderWxss = read('../../src/components/ImageUploader.wxss')
const imageUploaderJson = read('../../src/components/ImageUploader.json')

describe('用户端媒体组件统一契约', () => {
  it('BusinessImage 只做平台绑定，行为来自三端共享实现', () => {
    expect(businessImageTs).toContain("import { createBusinessImageComponent } from '@agritainment/shared'")
    expect(businessImageTs).toContain('Component(createBusinessImageComponent())')
    expect(businessImageTs).not.toMatch(forbiddenScripts)
    expect(businessImageWxml).toContain('binderror="onImageError"')
    expect(businessImageWxml).toContain('bindtap="onTap"')
  })

  it('ImageUploader 只做平台绑定，行为来自三端共享实现', () => {
    expect(imageUploaderTs).toContain("import { createImageUploaderComponent } from '@agritainment/shared'")
    expect(imageUploaderTs).toContain('Component(createImageUploaderComponent())')
    expect(imageUploaderTs).not.toMatch(forbiddenScripts)
    expect(imageUploaderWxml).toContain('bindtap="choose"')
    expect(imageUploaderWxml).toContain('bindtap="remove"')
    expect(imageUploaderWxml).toContain('bind:click="preview"')
    expect(imageUploaderJson).toContain('"business-image": "./BusinessImage"')
    expect(imageUploaderWxss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('用户端不再自带媒体运行时实现，只注入共享配置', () => {
    const runtime = read('../../src/media/runtime.ts')
    expect(runtime).toContain('createMiniProgramMediaRuntime')
    expect(runtime).not.toContain('LocalFileMediaStorageAdapter')
    expect(runtime).not.toMatch(forbiddenScripts)
  })
})