import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['store', 'supplier', 'user'] as const

describe('native mobile visual contract', () => {
  it.each(apps)('%s loads the shared mobile theme through app.wxss', (app) => {
    const appWxss = resolve(root, `apps/${app}/src/app.wxss`)
    expect(existsSync(appWxss), `${app} app.wxss`).toBe(true)
    const source = readFileSync(appWxss, 'utf8')
    expect(source.includes('--mobile-') || /@import\s+["'][^"']+["']/.test(source), app).toBe(true)
  })

  it('keeps the B-side and user auth entry class contracts in WXML', () => {
    const store = readFileSync(resolve(root, 'apps/store/src/pages/index/index.wxml'), 'utf8')
    const supplier = readFileSync(resolve(root, 'apps/supplier/src/pages/index/index.wxml'), 'utf8')
    const user = readFileSync(resolve(root, 'apps/user/src/pages/index/index.wxml'), 'utf8')
    expect(store).toContain('pc-login-hero')
    expect(store).toContain('pc-login-mark')
    expect(supplier).toContain('pc-login-hero')
    expect(user).toContain('auth-page')
    expect(user).toContain('auth-btn')
    expect(user).toContain('身份识别失败')
    expect(user).toContain('重新识别')
  })
})
