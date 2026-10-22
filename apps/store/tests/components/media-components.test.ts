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
const businessImageWxss = read('../../src/components/BusinessImage/index.wxss')

describe('门店端 BusinessImage 统一契约', () => {
  it('只做平台绑定，行为来自三端共享实现', () => {
    expect(businessImageTs).toContain("import { createBusinessImageComponent } from '@agritainment/shared'")
    expect(businessImageTs).toContain('Component(createBusinessImageComponent())')
    expect(businessImageTs).not.toMatch(forbiddenScripts)
  })

  it('模板包含 binderror 回退、点击与失败提示', () => {
    expect(businessImageWxml).toContain('src="{{resolved}}"')
    expect(businessImageWxml).toContain('bindtap="onTap"')
    expect(businessImageWxml).toContain('binderror="onImageError"')
    expect(businessImageWxml).toContain('{{failed && showError}}')
    expect(businessImageWxml).toContain('数据异常')
  })

  it('样式只用 CSS 变量，不写死颜色', () => {
    expect(businessImageWxss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(businessImageWxss).toContain('var(--mobile-surface-subtle)')
  })

  it('三端 BusinessImage 模板与样式完全一致', () => {
    for (const app of ['supplier', 'user']) {
      const folder = app === 'user' ? ['..', '..', '..', app, 'src', 'components'] : ['..', '..', '..', app, 'src', 'components', 'BusinessImage']
      const template = app === 'user' ? 'BusinessImage.wxml' : 'index.wxml'
      const style = app === 'user' ? 'BusinessImage.wxss' : 'index.wxss'
      expect(read(...folder, template), `${app} 模板`).toBe(businessImageWxml)
      expect(read(...folder, style), `${app} 样式`).toBe(businessImageWxss)
    }
  })
})