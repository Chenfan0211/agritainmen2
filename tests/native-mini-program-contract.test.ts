import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['store', 'supplier', 'user'] as const

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function sourceFiles(app: string): string[] {
  return walk(resolve(root, 'apps', app, 'src'))
}

function readSource(app: string, extensions: string[]): string {
  return sourceFiles(app)
    .filter((file) => extensions.includes(extname(file)))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

describe('native WeChat mini program source contract', () => {
  it.each(apps)('%s only ships native app/page/component source', (app) => {
    const src = resolve(root, 'apps', app, 'src')
    for (const file of ['app.ts', 'app.json', 'app.wxss', 'project.config.json']) {
      expect(existsSync(resolve(src, file)), `${app}/${file}`).toBe(true)
    }
    expect(sourceFiles(app).filter((file) => extname(file) === '.vue')).toEqual([])
    const code = sourceFiles(app)
      .filter((file) => ['.ts', '.wxml', '.json', '.scss'].includes(extname(file)) && !file.endsWith('.test.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(code).not.toContain('@dcloudio')
    expect(code).not.toContain("from 'pinia'")
    expect(code).not.toMatch(/\buni\./)
  })

  it.each(apps)('%s src 不含测试、Vue、webp 与 uni 选择器', (app) => {
    const files = sourceFiles(app)
    expect(files.filter((file) => /\.test\.[cm]?ts$/.test(file)), `${app} src 测试文件`).toEqual([])
    expect(files.filter((file) => extname(file) === '.vue'), `${app} src Vue 文件`).toEqual([])
    expect(files.filter((file) => extname(file).toLowerCase() === '.webp'), `${app} src webp`).toEqual([])

    const stylesAndTemplates = readSource(app, ['.wxss', '.scss', '.wxml'])
    expect(stylesAndTemplates).not.toMatch(/uni-(?:button|view|input|image|scroll-view|swiper|text)/)
    const scripts = readSource(app, ['.ts'])
    expect(scripts).not.toMatch(/\bwindow\.|\bdocument\.|localStorage/)
  })

  it.each(apps)('%s app.wxss 只 import 全局样式，业务样式收在 global.scss', (app) => {
    const src = resolve(root, 'apps', app, 'src')
    expect(readFileSync(resolve(src, 'app.wxss'), 'utf8').trim()).toBe('@import "./styles/global.wxss";')
    const globalScss = readFileSync(resolve(src, 'styles/global.scss'), 'utf8')
    expect(globalScss).toContain('packages/ui/src/design-tokens.css')
    expect(globalScss).toContain('mobile-theme.scss')
    expect(readFileSync(resolve(src, 'app.wxss'), 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)

    const appJson = JSON.parse(readFileSync(resolve(src, 'app.json'), 'utf8')) as { window?: { backgroundColor?: string } }
    expect(appJson.window?.backgroundColor, `${app} app.json 启动底色`).toBe('#FBF7F4')
  })

  it.each(apps)('%s package scripts and dependencies use the native builder', (app) => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'apps', app, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.scripts?.['dev:mp-weixin']).toContain('build-native-mp.mjs')
    expect(pkg.scripts?.['dev:mp-weixin']).toContain('--watch')
    expect(pkg.scripts?.['build:mp-weixin']).toContain('build-native-mp.mjs')
    expect(pkg.scripts?.['build:mp-weixin']).toContain('--mode build')
    expect(pkg.scripts?.['build:mp-weixin']).not.toContain('clean-native-output')
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const key of Object.keys(deps)) {
      expect(key.startsWith('@dcloudio/'), `${app} dependency ${key}`).toBe(false)
    }
    expect(deps.vue, `${app} vue dependency`).toBeUndefined()
    expect(deps.pinia, `${app} pinia dependency`).toBeUndefined()
    expect(deps.vite, `${app} vite dependency`).toBeUndefined()
  })

  it.each(apps)('%s 小程序配置与另两端对齐（app.json / project.config.json / sitemap.json）', (app) => {
    const src = resolve(root, 'apps', app, 'src')
    const appJson = JSON.parse(readFileSync(resolve(src, 'app.json'), 'utf8')) as {
      style?: string
      sitemapLocation?: string
      window?: { navigationStyle?: string; backgroundColor?: string; backgroundTextStyle?: string }
    }
    expect(appJson.style).toBe('v2')
    expect(appJson.sitemapLocation).toBe('sitemap.json')
    expect(appJson.window?.navigationStyle).toBe('custom')
    expect(appJson.window?.backgroundColor).toBe('#FBF7F4')
    expect(appJson.window?.backgroundTextStyle).toBe('light')
    expect(existsSync(resolve(src, 'sitemap.json')), app + ' sitemap.json').toBe(true)

    const project = JSON.parse(readFileSync(resolve(src, 'project.config.json'), 'utf8')) as {
      compileType?: string
      libVersion?: string
      setting?: Record<string, unknown>
    }
    const storeProject = JSON.parse(readFileSync(resolve(root, 'apps/store/src/project.config.json'), 'utf8')) as {
      libVersion?: string
      setting: Record<string, unknown>
    }
    expect(project.compileType, app + ' compileType').toBe('miniprogram')
    expect(project.libVersion, app + ' libVersion').toBe(storeProject.libVersion)
    for (const key of ['urlCheck', 'es6', 'enhance', 'postcss', 'minified', 'uglifyFileName']) {
      expect(project.setting?.[key], app + ' 与 store 的 setting.' + key + ' 不一致').toEqual(storeProject.setting[key])
    }
  })

  it.each(apps)('%s src 不再保留平台条件分支（#ifdef / #endif）', (app) => {
    const offenders = sourceFiles(app)
      .filter((file) => ['.ts', '.wxml', '.scss', '.wxss', '.json', '.wxs'].includes(extname(file)))
      .filter((file) => /#ifdef|#endif/.test(readFileSync(file, 'utf8')))
    expect(offenders.map((file) => file.replace(root, '')), app + ' 平台条件分支').toEqual([])
  })

  it('keeps the one-off store clean script removed and exposes the wxs gate', () => {
    expect(existsSync(resolve(root, 'apps/store/scripts/clean-native-output.mjs'))).toBe(false)
    const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    expect(rootPackage.scripts?.['audit:mp-wxs']).toContain('audit-mp-wxs.mjs')
    expect(rootPackage.scripts?.['dev:store']).toContain('--watch')
    expect(rootPackage.scripts?.['dev:user']).toContain('--watch')
  })

  it.each(apps)('%s declares existing page route files', (app) => {
    const src = resolve(root, 'apps', app, 'src')
    const appJson = JSON.parse(readFileSync(resolve(src, 'app.json'), 'utf8')) as { pages: string[] }
    expect(appJson.pages.length).toBeGreaterThan(0)
    for (const page of appJson.pages) {
      for (const extension of ['.ts', '.wxml', '.json']) {
        expect(existsSync(resolve(src, `${page}${extension}`)), `${app}/${page}${extension}`).toBe(true)
      }
      expect(existsSync(resolve(src, `${page}.wxss`)) || existsSync(resolve(src, `${page}.scss`)), `${app}/${page}.wxss|scss`).toBe(true)
    }
  })

  it.each(apps)('%s registers every native component referenced by page WXML', (app) => {
    const src = resolve(root, 'apps', app, 'src')
    for (const file of sourceFiles(app).filter((path) => path.endsWith('.json') && path.includes(`${resolve(src, 'pages')}`))) {
      const wxml = file.replace(/\.json$/, '.wxml')
      if (!existsSync(wxml)) continue
      const template = readFileSync(wxml, 'utf8')
      const config = JSON.parse(readFileSync(file, 'utf8')) as { usingComponents?: Record<string, string> }
      for (const tag of ['business-image', 'image-uploader', 'ui-icon', 'delivery-route-map']) {
        if (template.includes(`<${tag}`)) expect(config.usingComponents?.[tag], `${file}:${tag}`).toBeTruthy()
      }
    }
  })

  it.each(apps)('%s product assets are wx-compatible and source pages never reference webp', (app) => {
    const images = walk(resolve(root, 'apps', app, 'src/static/images'))
    expect(images.filter((file) => extname(file).toLowerCase() === '.webp')).toEqual([])
    const imageRefs = sourceFiles(app)
      .filter((file) => ['.ts', '.wxml', '.json', '.scss'].includes(extname(file)))
      .filter((file) => readFileSync(file, 'utf8').includes('.webp'))
    expect(imageRefs).toEqual([])
  })
})
