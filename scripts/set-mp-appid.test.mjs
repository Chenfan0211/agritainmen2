import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeAppId, replaceProjectAppId } from './set-mp-appid.mjs'

const storeManifest = readFileSync(resolve(import.meta.dirname, '../apps/store/src/project.config.json'), 'utf8')

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

describe('replaceProjectAppId', () => {
  it('only rewrites the mini-program appid and keeps the rest of the project config intact', () => {
    const updated = replaceProjectAppId(storeManifest, 'wx1234567890abcdef')
    expect(updated).toContain('"appid": "wx1234567890abcdef"')
    const parsed = JSON.parse(updated)
    expect(parsed.appid).toBe('wx1234567890abcdef')
    expect(parsed.projectname).toBe('agritainment-store')
  })

  it('can switch back to tourist mode', () => {
    const updated = replaceProjectAppId(replaceProjectAppId(storeManifest, 'wx1234567890abcdef'), 'touristappid')
    expect(JSON.parse(updated).appid).toBe('touristappid')
  })

  it('rejects project configs without an appid', () => {
    expect(() => replaceProjectAppId('{"projectname":"store"}', 'touristappid')).toThrow(/appid/)
  })
})
