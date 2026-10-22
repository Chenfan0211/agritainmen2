import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditMobileWxs, auditWxsSource, findRegexLiterals, maskStringsAndComments } from './audit-mp-wxs.mjs'

describe('maskStringsAndComments', () => {
  it('blanks string literals and comments but keeps newlines', () => {
    const source = 'var a = "for (x in y)"\n// /\nvar b = 1'
    const masked = maskStringsAndComments(source)
    expect(masked).not.toContain('for (x in y)')
    expect(masked.split('\n')).toHaveLength(source.split('\n').length)
  })
})

describe('findRegexLiterals', () => {
  it('detects regex literals in expression position', () => {
    expect(findRegexLiterals('var ok = /ab+c/i.test(value)')).toHaveLength(1)
    expect(findRegexLiterals('return /x/.test(v);')).toHaveLength(1)
  })

  it('ignores division and comment-looking slashes', () => {
    expect(findRegexLiterals('var ratio = total / count;')).toEqual([])
    expect(findRegexLiterals('var ratio = (a + b) / count;')).toEqual([])
  })
})

describe('auditWxsSource', () => {
  it('flags unsupported WXS syntax', () => {
    const cases = [
      ['for (var key in obj) { total += obj[key] }', 'for...in'],
      ['var ok = /ab+c/.test(value)', '正则字面量'],
      ['function tap(e) { return e.$event }', '$event'],
      ['var fn = function () { return 1 }', null],
      ['items.map((item) => item.id)', '箭头函数'],
      ['var text = `a${b}`', '模板字符串'],
      ['var value = data?.list', '可选链'],
      ['var value = input ?? 0', '空值合并'],
      ['let total = 0', 'var 声明'],
      ['const total = 0', 'var 声明'],
      ['var next = [...items]', '展开运算符'],
      ['async function load() { await run() }', 'async/await']
    ]
    for (const [source, expected] of cases) {
      const findings = auditWxsSource(source, 'apps/store/src/a.wxs')
      if (expected) expect(findings.join('\n'), source).toContain(expected)
      else expect(findings, source).toEqual([])
    }
  })

  it('reports line numbers', () => {
    const source = ['var a = 1', 'for (var k in a) {}'].join('\n')
    expect(auditWxsSource(source, 'apps/user/src/a.wxs')[0]).toContain('apps/user/src/a.wxs:2')
  })

  it('does not flag literals or comments that only mention the syntax', () => {
    const source = ['// for (var k in a) {}', 'var text = "for (var k in a) {}"', 'var more = \'a => b\''].join('\n')
    expect(auditWxsSource(source, 'apps/supplier/src/a.wxs')).toEqual([])
  })
})

describe('wxs contract', () => {
  it('keeps every mobile wxs file inside the ES5 subset', () => {
    expect(auditMobileWxs()).toEqual([])
  })

  it('accepts the real supplier view helper file', () => {
    const source = readFileSync('apps/supplier/src/pages/index/view.wxs', 'utf8')
    expect(auditWxsSource(source, 'apps/supplier/src/pages/index/view.wxs')).toEqual([])
  })
})
