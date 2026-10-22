import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildNativeApp, compileStyles, lockedDirectoryMessage, parseNativeBuildArgs, replaceDirectoryAtomically, resolveNativeOutput, rewriteCommonJsImports } from './build-native-mp.mjs'

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'native-mp-build-'))
}

function writeFile(path, contents) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, contents, 'utf8')
}

describe('native mini program build plan', () => {
  it('parses app, mode and watch flags', () => {
    expect(parseNativeBuildArgs(['store', '--mode', 'build', '--watch'])).toEqual({
      app: 'store', mode: 'build', watch: true, errors: []
    })
    expect(parseNativeBuildArgs(['supplier'])).toMatchObject({ app: 'supplier', mode: 'dev', watch: false })
    expect(parseNativeBuildArgs(['admin']).errors.join('|')).toContain('未知端')
    expect(parseNativeBuildArgs(['user', '--mode', 'preview']).errors.join('|')).toContain('未知模式')
  })

  it('maps native output paths to the existing developer-tools contract', () => {
    const root = resolve('E:/project/agritainmen2')
    expect(resolveNativeOutput(root, 'store', 'dev')).toBe(resolve(root, 'apps/store/dist/dev/mp-weixin'))
    expect(resolveNativeOutput(root, 'user', 'build')).toBe(resolve(root, 'apps/user/dist/build/mp-weixin'))
  })

  it('rewrites shared and extensionless CommonJS imports', () => {
    const source = 'const a = require("@agritainment/shared"); const b = require("./stores/store"); const c = require("./x.js")'
    expect(rewriteCommonJsImports(source, '../../shared/')).toBe(
      'const a = require("../../shared/index.js"); const b = require("./stores/store.js"); const c = require("./x.js")'
    )
  })
})

describe('native mini program build output', () => {
  it('清空旧产物后再整体替换，不残留历史文件', () => {
    const root = makeTempDir()
    const outputDir = join(root, 'out')
    const stagingDir = join(root, 'staging')
    writeFile(join(outputDir, 'stale.js'), 'stale')
    writeFile(join(stagingDir, 'fresh.js'), 'fresh')

    replaceDirectoryAtomically(stagingDir, outputDir)

    expect(existsSync(stagingDir)).toBe(false)
    expect(readdirSync(outputDir)).toEqual(['fresh.js'])
    expect(readdirSync(root).some((name) => name.includes('.backup-'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('目标目录被占用时抛错并提示先关闭开发者工具，不回落覆盖写入', () => {
    const root = makeTempDir()
    const outputDir = join(root, 'out')
    const stagingDir = join(root, 'staging')
    writeFile(join(outputDir, 'stale.js'), 'stale')
    writeFile(join(stagingDir, 'fresh.js'), 'fresh')
    const rename = () => {
      const error = new Error('resource busy or locked')
      error.code = 'EBUSY'
      throw error
    }

    expect(() => replaceDirectoryAtomically(stagingDir, outputDir, { rename })).toThrow(/关闭微信开发者工具/)
    expect(lockedDirectoryMessage(outputDir)).toContain('不再退回覆盖写入')
    expect(readFileSync(join(outputDir, 'stale.js'), 'utf8')).toBe('stale')
    rmSync(root, { recursive: true, force: true })
  })

  it('整目录构建：写入 app/共享代码与重写后的 WXSS，且不含 TS/SCSS/VUE', () => {
    const root = makeTempDir()
    writeFile(join(root, 'packages/shared/src/index.ts'), 'export const sharedValue = 1\n')
    writeFile(join(root, 'packages/ui/src/design-tokens.css'), ':root { --color-brand-primary: #C8322B; }\n')
    writeFile(join(root, 'apps/store/src/app.json'), JSON.stringify({ pages: ['pages/index/index'] }))
    writeFile(join(root, 'apps/store/src/app.ts'), 'import { sharedValue } from "@agritainment/shared"\nApp({ onLaunch() { void sharedValue } })\n')
    writeFile(join(root, 'apps/store/src/app.wxss'), '@import "./styles/global.wxss";\n')
    writeFile(join(root, 'apps/store/src/styles/global.scss'), '@import "../../../../packages/ui/src/design-tokens.css";\n.page { color: red; }\n')
    writeFile(join(root, 'apps/store/src/pages/index/index.ts'), 'Page({ data: {} })\n')
    writeFile(join(root, 'apps/store/src/pages/index/index.json'), '{}')
    writeFile(join(root, 'apps/store/src/pages/index/index.wxml'), '<view class="page"></view>\n')

    const result = buildNativeApp({ root, app: 'store', mode: 'build' })
    const outputDir = resolveNativeOutput(root, 'store', 'build')
    expect(result.outputDir).toBe(outputDir)
    expect(existsSync(join(outputDir, 'app.json'))).toBe(true)
    expect(existsSync(join(outputDir, 'app.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'design-tokens.wxss'))).toBe(true)
    expect(existsSync(join(outputDir, 'shared/index.js'))).toBe(true)
    expect(readFileSync(join(outputDir, 'styles/global.wxss'), 'utf8')).toContain('@import "../design-tokens.wxss";')
    const emitted = readdirSync(outputDir, { recursive: true }).map(String)
    expect(emitted.some((file) => /\.(ts|scss|vue|webp|map)$/.test(file))).toBe(false)
    expect(readdirSync(join(root, 'apps/store/dist/build')).some((name) => name.includes('.tmp-') || name.includes('.backup-'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('SCSS 编译使用传入的 root 解析共享令牌', () => {
    const root = makeTempDir()
    const sourceDir = join(root, 'apps/user/src')
    const outputDir = join(root, 'out')
    writeFile(join(root, 'packages/ui/src/design-tokens.css'), ':root { --color-user-brand: #C8322B; }\n')
    writeFile(join(sourceDir, 'styles/global.scss'), '@import "../../../../packages/ui/src/design-tokens.css";\npage { color: var(--color-user-brand); }\n')
    compileStyles(sourceDir, outputDir, 'build', root)
    expect(readFileSync(join(outputDir, 'styles/global.wxss'), 'utf8')).toContain('@import "../design-tokens.wxss";')
    rmSync(root, { recursive: true, force: true })
  })
})
