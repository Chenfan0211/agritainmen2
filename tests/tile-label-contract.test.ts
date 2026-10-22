import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

const pages = [
  'apps/user/src/pages/index/index.wxml',
  'apps/store/src/pages/index/index.wxml',
  'apps/supplier/src/pages/index/index.wxml'
]

function tileLabels(page: string) {
  return [...page.matchAll(/pc-tile-label">([^<{]+)</g)].map((match) => match[1].trim())
}

function workItemLabels(page: string) {
  const block = page.match(/const supplierWorkItems[\s\S]*?^=]/m)?.[0] || page.match(/const supplierWorkItems[\s\S]*?\n\]/)?.[0] || ''
  return [...block.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1])
}

function hanLength(label: string) {
  return [...label.replace(/\s/g, '')].length
}

describe('宫格入口名最多四字', () => {
  it('各端 pc-tile-label 静态文案不超过四个字', () => {
    for (const path of pages) {
      const labels = tileLabels(source(path))
      if (path.includes('/supplier/')) {
        expect(labels, path).toEqual([])
        continue
      }
      expect(labels.length, path).toBeGreaterThan(0)
      for (const label of labels) {
        expect(hanLength(label), `${path} ${label}`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('供应商工作台 supplierWorkItems 标题不超过四个字', () => {
    const labels = workItemLabels(source('apps/supplier/src/pages/index/index.ts'))
    expect(labels).toEqual(['司机管理', '线路规划', '出仓交接', '结算账单', '交接日志', '仓点设置'])
    for (const label of labels) {
      expect(hanLength(label), label).toBeLessThanOrEqual(4)
    }
  })
})
