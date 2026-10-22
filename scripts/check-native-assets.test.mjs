import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  auditNativeAssets,
  buildArtifactViolations,
  collectStaticRefs,
  countImageSlots,
  missingComponentFiles,
  resolveComponentTarget,
  tempArtifactViolations,
  unboundImageTags,
  validateStaticRefs
} from './check-native-assets.mjs'

describe('countImageSlots / unboundImageTags', () => {
  it('只统计 <image> 与 <business-image>，不会把 <image-uploader> 当图片', () => {
    const template = '<image-uploader src="a" /><image src="b" binderror="onErr"></image><business-image src="{{x}}" />'
    expect(countImageSlots(template)).toEqual({ rawImages: 1, businessImages: 1 })
    expect(unboundImageTags(template)).toEqual([])
  })

  it('报出未绑定 binderror 的 <image>', () => {
    const template = '<image src="/static/a.png"></image><image src="/static/b.png" binderror="onErr" />'
    const found = unboundImageTags(template)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('/static/a.png')
  })
})

describe('missingComponentFiles', () => {
  it('支持 / 绝对路径与相对页面路径两种写法', () => {
    const owner = resolve('E:/app/src/pages/index/index.json')
    const srcRoot = resolve('E:/app/src')
    expect(resolveComponentTarget(owner, srcRoot, '/components/A/index')).toBe(resolve('E:/app/src/components/A/index'))
    expect(resolveComponentTarget(owner, srcRoot, '../../components/B/index')).toBe(resolve('E:/app/src/components/B/index'))
  })

  it('缺实现 / wxml / json 都会报出', () => {
    const exists = (file) => file.endsWith('ui-icon.wxml')
    const failures = missingComponentFiles(
      { 'ui-icon': '/components/ui-icon' },
      'E:/app/src/pages/index/index.json',
      'E:/app/src',
      exists
    )
    expect(failures).toHaveLength(2)
    expect(failures.join('|')).toContain('缺少实现文件')
    expect(failures.join('|')).toContain('缺少 json')
  })
})

describe('collectStaticRefs / validateStaticRefs', () => {
  it('收集 /static 静态引用并忽略运行时拼接路径', () => {
    const sources = [
      "const a = '/static/images/a.jpg'",
      'const b = `/static/icons/${name}.png`',
      "const c = '/static/images/a.jpg'",
      "const d = '/static/data/x.json'"
    ]
    expect(collectStaticRefs(sources)).toEqual(['/static/images/a.jpg'])
  })

  it('缺失与非 JPEG 字节都会报出', () => {
    const failures = validateStaticRefs(['/static/images/missing.jpg', '/static/images/broken.jpg'], (ref) => {
      if (ref.includes('missing')) return null
      return new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    })
    expect(failures).toHaveLength(2)
    expect(failures[0]).toContain('静态资源缺失')
    expect(failures[1]).toContain('不是合法 JPEG')
  })
})

describe('buildArtifactViolations / tempArtifactViolations', () => {
  it('禁止源码、测试文件与旧描述文件进入产物', () => {
    const failures = buildArtifactViolations([
      'app.js',
      'components/BusinessImage/index.wxml',
      'components/BusinessImage/index.webp',
      'pages/index/index.scss',
      'pages/index/index.vue',
      'shared/index.test.js',
      'manifest.json'
    ])
    expect(failures).toHaveLength(5)
    expect(failures.join('|')).toContain('.webp')
    expect(failures.join('|')).toContain('.test.js')
    expect(failures.join('|')).toContain('manifest.json')
  })

  it('报出临时与备份目录残留', () => {
    expect(tempArtifactViolations(['mp-weixin', 'mp-weixin.tmp-123', 'mp-weixin.backup-1-2'])).toHaveLength(2)
    expect(tempArtifactViolations(['mp-weixin', 'dev'])).toEqual([])
  })
})

describe('auditNativeAssets', () => {
  it('当前仓库三端图片与产物门禁通过', () => {
    const { failures, summary } = auditNativeAssets()
    expect(failures).toEqual([])
    for (const app of ['store', 'supplier', 'user']) expect(summary).toContain(app)
  })
})
