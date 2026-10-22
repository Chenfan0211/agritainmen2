import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(workspaceRoot, path), 'utf8')

describe('admin H5 media runtime', () => {
  it('configures the H5 runtime before App.vue is created', () => {
    const main = read('apps/admin/src/main.ts')
    expect(main).toContain('configureMediaRuntime(h5MediaRuntime)')
    expect(main).toContain("import App from './App.vue'")
  })

  it('keeps shared Vue UI only on the admin H5 workspace', () => {
    expect(read('apps/admin/package.json')).toContain('"@agritainment/ui": "workspace:*"')
    for (const app of ['store', 'supplier', 'user']) {
      expect(read(`apps/${app}/package.json`)).not.toContain('"@agritainment/ui"')
    }
  })
})
