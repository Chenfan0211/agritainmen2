import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeAppId, replaceWeixinAppId } from './set-mp-appid.mjs'

const storeManifest = readFileSync(resolve(import.meta.dirname, '../apps/store/src/manifest.json'), 'utf8')

describe('normalizeAppId', () => {
  it('accepts test/formal appids and tourist mode', () => {
    expect(normalizeAppId('wx1234567890abcdef')).toBe('wx1234567890abcdef')
    expect(normalizeAppId('  wx1234567890abcdef  ')).toBe('wx1234567890abcdef')
    expect(normalizeAppId('touristappid')).toBe('touristappid')
  })

  it('rejects malformed appids', () => {
    expect(() => normalizeAppId('wx1234')).toThrow(/不合法/)
    expect(() => normalizeAppId('')).toThrow(/不合法/)
    expect(() => normalizeAppId('WX1234567890ABCDEF')).toThrow(/不合法/)
  })
})

describe('replaceWeixinAppId', () => {
  it('only rewrites the mp-weixin appid and keeps the rest of the manifest intact', () => {
    const updated = replaceWeixinAppId(storeManifest, 'wx1234567890abcdef')
    expect(updated).toContain('"appid": "wx1234567890abcdef"')
    expect(updated).toContain('"name": "门店订货商城"')
    expect(updated).toContain('"appid": "__UNI__AGRITAINMENT_STORE"')
    const parsed = JSON.parse(updated)
    expect(parsed['mp-weixin'].appid).toBe('wx1234567890abcdef')
    expect(parsed.appid).toBe('__UNI__AGRITAINMENT_STORE')
  })

  it('can switch back to tourist mode', () => {
    const updated = replaceWeixinAppId(replaceWeixinAppId(storeManifest, 'wx1234567890abcdef'), 'touristappid')
    expect(JSON.parse(updated)['mp-weixin'].appid).toBe('touristappid')
  })

  it('rejects manifests without the mp-weixin block', () => {
    expect(() => replaceWeixinAppId('{"appid":"__UNI__X"}', 'touristappid')).toThrow(/mp-weixin/)
  })
})
