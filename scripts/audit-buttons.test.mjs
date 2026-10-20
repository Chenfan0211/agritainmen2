import { describe, expect, it } from 'vitest'
import { AUDIT_FILES, auditButtons, auditButtonsSource, isHandlerDeclaredInPage } from './audit-buttons.mjs'

const onlyButton = (attributes) => `<template><button ${attributes}>提交</button></template>`

describe('auditButtonsSource', () => {
  it('recognizes handlers behind click modifiers such as @click.stop', () => {
    const result = auditButtonsSource(onlyButton('class="cat-add" @click.stop="addProduct(product)"'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix.surface).toBe(1)
  })

  it('classifies quantity stepper handlers as surface behaviour', () => {
    const result = auditButtonsSource([
      '<template>',
      '<button @click="changeCartQuantity(item, -1)">-</button>',
      '<button @click="changeDetailQuantity(1)">+</button>',
      '</template>'
    ].join('\n'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix.surface).toBe(2)
  })

  it('still reports buttons that carry no click binding at all', () => {
    const result = auditButtonsSource(onlyButton('class="submit"'), 'sample.vue')

    expect(result.failures).toEqual(['sample.vue:1 <button class="submit">'])
  })

  it('still reports handlers that only raise a toast', () => {
    const result = auditButtonsSource(onlyButton('@click="toast(\'敬请期待\')"'), 'sample.vue')

    expect(result.failures).toEqual(['sample.vue:1 仅显示提示，未产生数据或界面变化'])
  })

  it('separates store calls, surface functions and local state mutations', () => {
    const result = auditButtonsSource([
      '<template>',
      '<button @click="store.toggleCheckoutSelection(item)">选</button>',
      '<button @click="openDetail(product.id)">详情</button>',
      '<button @click="quantity++">加</button>',
      '<button @click="changeCartQuantity(item, 1)">加购</button>',
      '</template>'
    ].join('\n'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix).toEqual({ store: 1, surface: 2, localState: 1 })
  })
})


describe('page-declared handlers', () => {
  it('accepts handlers declared in the page even when they miss the prefix table', () => {
    const result = auditButtonsSource([
      '<template><button @click="authorize">微信登录</button></template>',
      '<script setup lang="ts">async function authorize() { await store.login() }</script>'
    ].join('\n'), 'sample.vue')

    expect(result.failures).toEqual([])
    expect(result.matrix.surface).toBe(1)
  })

  it('still reports handlers that are not declared anywhere in the page', () => {
    const result = auditButtonsSource('<template><button @click="doSomething()">提交</button></template>', 'sample.vue')

    expect(result.failures).toEqual(['sample.vue:1 点击行为无法归类: doSomething()'])
  })

  it('exempts statically disabled buttons but keeps dynamic :disabled buttons under audit', () => {
    const result = auditButtonsSource([
      '<template>',
      '<button class="outline-small" disabled>售后处理中</button>',
      '<button :disabled="busy" >提交</button>',
      '</template>'
    ].join('\n'), 'sample.vue')

    expect(result.disabled).toBe(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('<button :disabled="busy" >')
  })
})

describe('isHandlerDeclaredInPage', () => {
  it('recognizes function, const, import and destructured declarations', () => {
    expect(isHandlerDeclaredInPage('async function authorize() {}', 'authorize')).toBe(true)
    expect(isHandlerDeclaredInPage('const payPackage = async () => {}', 'payPackage(item)')).toBe(true)
    expect(isHandlerDeclaredInPage("import { openLogistics } from './x'", 'openLogistics(sub)')).toBe(true)
    expect(isHandlerDeclaredInPage('const { runAction } = store', 'runAction(action.key, order)')).toBe(true)
    expect(isHandlerDeclaredInPage('const a = 1', 'missingHandler()')).toBe(false)
  })

  it('ignores member calls such as store.payOrder()', () => {
    expect(isHandlerDeclaredInPage('const payOrder = 1', 'store.payOrder(id)')).toBe(false)
  })
})
describe('auditButtons', () => {
  it('keeps every audited page free of unhandled buttons', () => {
    const { failures, matrix, fileCount } = auditButtons()

    expect(failures).toEqual([])
    expect(fileCount).toBe(AUDIT_FILES.length)
    expect(matrix.store + matrix.surface + matrix.localState).toBeGreaterThan(0)
  })
})