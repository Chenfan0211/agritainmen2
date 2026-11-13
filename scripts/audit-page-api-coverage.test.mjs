import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditPageApiCoverage } from './audit-page-api-coverage.mjs'

function fixture(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'page-api-p0-'))
  const write = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text, 'utf8') }
  write('docs/backend/openapi.yaml', `openapi: 3.1.0\npaths:\n  /catalog/products:\n    get:\n      responses:\n        "200":\n          description: ok\n`)
  write('apps/admin/src/pages/index/index.vue', `<script setup>\nstore.loadProducts()\nstore.saveCatalogProduct()\nstore.can('x')\n</script>`)
  write('apps/admin/src/stores/admin.ts', `actions: {\n  loadProducts() {},\n  saveCatalogProduct() {},\n  can() {},\n  hiddenInternal() {}\n}\n`)
  const page = {
    app: 'admin', page: 'products', actions: [
      { action: 'loadProducts', owner: 'page', status: 'done', api: ['GET', '/catalog/products'] },
      { action: 'saveCatalogProduct', owner: 'page', status: 'planned', stage: 'P2', dataDomain: 'catalog-write', api: ['POST', '/catalog/products'] },
      { action: 'can', owner: 'internal', status: 'internal', reason: '权限判定读方法，不是页面动作' },
      { action: 'hiddenInternal', owner: 'internal', status: 'internal', reason: '内部事务辅助' }
    ]
  }
  const matrix = { schemaVersion: 2, requireAllApps: true, pages: [page], ...extra }
  write('scripts/page-api-matrix.json', JSON.stringify(matrix))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }), write }
}

describe('P0 page API coverage gate', () => {
  it('requires done actions to exist in OpenAPI', () => {
    const { root, cleanup } = fixture()
    try {
      const report = auditPageApiCoverage(root)
      expect(report.missingApis).toEqual([])
      expect(report.ok).toBe(false) // planned 不影响退出码，但未声明动作仍失败
    } finally { cleanup() }
  })

  it('does not validate planned actions against OpenAPI', () => {
    const { root, cleanup } = fixture()
    try {
      const report = auditPageApiCoverage(root)
      expect(report.missingApis.filter((x) => x.includes('saveCatalogProduct'))).toEqual([])
      expect(report.plannedActions.some((x) => x.action === 'saveCatalogProduct' && x.stage === 'P2')).toBe(true)
    } finally { cleanup() }
  })

  it('rejects frontend-only without reason', () => {
    const { root, cleanup, write } = fixture()
    try {
      const matrix = JSON.parse(readFileSync(join(root, 'scripts/page-api-matrix.json'), 'utf8'))
      matrix.pages[0].actions[0] = { action: 'loadProducts', owner: 'page', status: 'frontend-only' }
      write('scripts/page-api-matrix.json', JSON.stringify(matrix))
      const report = auditPageApiCoverage(root)
      expect(report.invalidEntries.some((x) => x.includes('reason'))).toBe(true)
    } finally { cleanup() }
  })

  it('rejects planned without stage', () => {
    const { root, cleanup, write } = fixture()
    try {
      const matrix = JSON.parse(readFileSync(join(root, 'scripts/page-api-matrix.json'), 'utf8'))
      matrix.pages[0].actions[0] = { action: 'loadProducts', owner: 'page', status: 'planned', dataDomain: 'catalog' }
      write('scripts/page-api-matrix.json', JSON.stringify(matrix))
      const report = auditPageApiCoverage(root)
      expect(report.invalidEntries.some((x) => x.includes('stage'))).toBe(true)
    } finally { cleanup() }
  })

  it('reports source actions missing from the matrix', () => {
    const { root, cleanup, write } = fixture()
    try {
      write('apps/admin/src/pages/index/index.vue', `<script setup>\nstore.newAction()\n</script>`)
      const report = auditPageApiCoverage(root)
      expect(report.unmappedActions).toContain('admin:newAction')
    } finally { cleanup() }
  })

  it('reports stale matrix entries absent from source', () => {
    const { root, cleanup, write } = fixture()
    try {
      const matrix = JSON.parse(readFileSync(join(root, 'scripts/page-api-matrix.json'), 'utf8'))
      matrix.pages[0].actions.push({ action: 'ghostAction', owner: 'page', status: 'done', api: ['GET', '/catalog/products'] })
      write('scripts/page-api-matrix.json', JSON.stringify(matrix))
      const report = auditPageApiCoverage(root)
      expect(report.invalidEntries.some((x) => x.includes('stale-entry'))).toBe(true)
    } finally { cleanup() }
  })

  it('rejects invalid status', () => {
    const { root, cleanup, write } = fixture()
    try {
      const matrix = JSON.parse(readFileSync(join(root, 'scripts/page-api-matrix.json'), 'utf8'))
      matrix.pages[0].actions[0].status = 'unknown'
      write('scripts/page-api-matrix.json', JSON.stringify(matrix))
      const report = auditPageApiCoverage(root)
      expect(report.invalidEntries.some((x) => x.includes('invalid-status'))).toBe(true)
    } finally { cleanup() }
  })

  it('passes when every non-internal action is planned or done and internally declared', () => {
    const { root, cleanup, write } = fixture()
    try {
      const matrix = JSON.parse(readFileSync(join(root, 'scripts/page-api-matrix.json'), 'utf8'))
      matrix.requireAllApps = false
      matrix.pages = [
        { app: 'admin', page: 'products', actions: [
          { action: 'loadProducts', owner: 'page', status: 'planned', stage: 'P1', dataDomain: 'catalog' },
          { action: 'saveCatalogProduct', owner: 'page', status: 'planned', stage: 'P2', dataDomain: 'catalog-write' },
          { action: 'can', owner: 'internal', status: 'internal', reason: '权限判定读方法' },
          { action: 'hiddenInternal', owner: 'internal', status: 'internal', reason: '内部事务辅助' }
        ] }
      ]
      write('scripts/page-api-matrix.json', JSON.stringify(matrix))
      const report = auditPageApiCoverage(root)
      expect(report.ok).toBe(true)
    } finally { cleanup() }
  })
})
