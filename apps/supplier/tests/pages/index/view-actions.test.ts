import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('supplier WXS order actions', () => {
  it('shows assignment and shipment actions for accepted API orders', () => {
    const source = readFileSync(resolve(process.cwd(), 'apps/supplier/src/pages/index/view.wxs'), 'utf8')
    const context = { module: { exports: {} as Record<string, (...args: any[]) => unknown> } }
    runInNewContext(source, context)
    const actions = context.module.exports.e74
    const order = { supplierFulfillment: { status: 'accepted', driverId: 'D1' } }
    expect(actions({ apiMode: true }, order)).toEqual([
      { key: 'courier', label: '快递直发' },
      { key: 'assign-driver', label: '更换司机' },
      { key: 'driver-ship', label: '司机配送发货', primary: true },
    ])
    expect(actions({ apiMode: true }, { supplierFulfillment: { status: 'accepted' } })).toEqual([
      { key: 'courier', label: '快递直发' },
      { key: 'assign-driver', label: '指派司机' },
    ])
    expect(context.module.exports.e778({ apiMode: true, selectedOrder: order })).toEqual(actions({ apiMode: true }, order))
    expect(actions({ apiMode: false }, { supplierFulfillment: { status: 'accepted' }, supplierOrderLink: { source: 'c-mall' } })).toEqual([
      { key: 'courier', label: '快递直发' },
    ])
  })
})
