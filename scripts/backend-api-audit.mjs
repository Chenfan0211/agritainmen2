#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function surefireTotals() {
  const totals = { suites: 0, tests: 0, failures: 0, errors: 0, skipped: 0 }
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'target' || entry.name === 'node_modules' || entry.name === '.git') {
          if (entry.name !== 'target') continue
        }
        visit(path)
        continue
      }
      if (!entry.name.startsWith('TEST-') || !entry.name.endsWith('.xml')) continue
      if (!path.includes(`${join('surefire-reports')}`)) continue
      const xml = readFileSync(path, 'utf8')
      const suite = /<testsuite\b[^>]*>/u.exec(xml)?.[0] || ''
      const number = (name) => Number(new RegExp(`${name}="(\\d+)"`, 'u').exec(suite)?.[1] || 0)
      totals.suites += 1
      totals.tests += number('tests')
      totals.failures += number('failures')
      totals.errors += number('errors')
      totals.skipped += number('skipped')
    }
  }
  visit(join(process.cwd(), 'backend'))
  return totals
}

const contract = spawnSync(process.execPath, ['scripts/backend-api-contract.mjs'], { stdio: 'inherit' })
const maven = spawnSync(process.execPath, [
  'scripts/backend-maven.mjs',
  '-Papi-audit',
  '-Dmaven.test.failure.ignore=true',
  'clean',
  'test',
], { stdio: 'inherit' })
const totals = surefireTotals()
const testsPassed = maven.status === 0 && totals.tests > 0 && totals.failures === 0 && totals.errors === 0

console.log('\n== 后端 API 审计汇总 ==')
console.log(`OpenAPI 契约核对: ${contract.status === 0 ? 'PASS' : 'FAIL'} (exit ${contract.status ?? 1})`)
console.log(`Surefire: suites=${totals.suites}, tests=${totals.tests}, failures=${totals.failures}, errors=${totals.errors}, skipped=${totals.skipped}`)
console.log(`逐接口审计测试: ${testsPassed ? 'PASS' : 'FAIL'} (maven exit ${maven.status ?? 1})`)
process.exit(contract.status === 0 && testsPassed ? 0 : 1)