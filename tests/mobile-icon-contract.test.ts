import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const apps = ['store', 'supplier', 'user'] as const

describe('native mobile icon contract', () => {
  it.each(apps)('%s ships a local native UiIcon component', (app) => {
    const dir = resolve(root, `apps/${app}/src/components/UiIcon`)
    const flat = resolve(root, `apps/${app}/src/components`)
    const files = existsSync(dir)
      ? ['index.ts', 'index.wxml', 'index.wxss', 'index.json'].map((file) => resolve(dir, file))
      : ['UiIcon.ts', 'UiIcon.wxml', 'UiIcon.wxss', 'UiIcon.json'].map((file) => resolve(flat, file))
    for (const file of files) {
      expect(existsSync(file), `${app}/${file}`).toBe(true)
    }
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(source).toContain('.png')
  })

  it.each(apps)('%s keeps SVG and PNG icon assets paired', (app) => {
    const dir = resolve(root, `apps/${app}/src/static/icons`)
    const names = readdirSync(dir)
    const svg = new Set(names.filter((name) => name.endsWith('.svg')).map((name) => name.replace(/\.svg$/, '')))
    const png = new Set(names.filter((name) => name.endsWith('.png')).map((name) => name.replace(/\.png$/, '')))
    expect([...svg].filter((name) => !png.has(name))).toEqual([])
  })
})
