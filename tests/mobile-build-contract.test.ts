import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['user', 'store', 'supplier'] as const

describe('native mobile portal build contract', () => {
  it.each(apps)('%s ships a native WeChat mini program only', (app) => {
    const pkg = JSON.parse(readFileSync(resolve(root, `apps/${app}/package.json`), 'utf8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.scripts?.['build:mp-weixin']).toContain('build-native-mp.mjs')
    expect(pkg.scripts?.['dev:mp-weixin']).toContain('build-native-mp.mjs')
    expect(pkg.scripts?.['build:h5']).toBeUndefined()
    expect(pkg.scripts?.['dev:h5']).toBeUndefined()
    expect({ ...pkg.dependencies, ...pkg.devDependencies }['@dcloudio/uni-mp-weixin']).toBeUndefined()
    expect(existsSync(resolve(root, `apps/${app}/src/app.json`)), `${app} app.json`).toBe(true)
    expect(existsSync(resolve(root, `apps/${app}/src/app.ts`)), `${app} app.ts`).toBe(true)
  })

  it('keeps the operations console on uni-app H5', () => {
    const adminManifest = JSON.parse(readFileSync(resolve(root, 'apps/admin/src/manifest.json'), 'utf8')) as Record<string, unknown>
    const adminPackage = JSON.parse(readFileSync(resolve(root, 'apps/admin/package.json'), 'utf8')) as { scripts?: Record<string, string> }
    expect(adminManifest.h5).toBeTruthy()
    expect(adminManifest['mp-weixin']).toBeUndefined()
    expect(adminPackage.scripts?.['build:h5']).toContain('uni build -p h5')
  })

  it('keeps removed single-origin suites and points root mobile builds at the native builder', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> }
    for (const script of ['build:single-origin', 'serve:single-origin', 'dev:single-origin', 'check:single-origin', 'test:e2e', 'test:e2e:user', 'test:e2e:supplier', 'test:e2e:integration', 'test:e2e:operational-report']) {
      expect(rootPackage.scripts?.[script], `${script} removed`).toBeUndefined()
    }
    expect(rootPackage.scripts?.build).toContain('build:admin')
    for (const app of apps) expect(rootPackage.scripts?.[`build:${app}`]).toContain('build-native-mp.mjs')
    expect(rootPackage.devDependencies?.['@playwright/test'], 'playwright removed').toBeUndefined()
  })
})
