import { afterEach, expect, it, vi } from 'vitest'
import { clearSupplierTokens, readSupplierAccessToken, saveSupplierTokens } from '../../src/services/api-runtime'

afterEach(() => { vi.unstubAllGlobals(); clearSupplierTokens() })

it('clears mini program tokens even when removeStorageSync is unavailable', () => {
  const values = new Map<string, unknown>()
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
  })
  saveSupplierTokens('access', 'refresh')
  expect(readSupplierAccessToken()).toBe('access')
  clearSupplierTokens()
  expect(readSupplierAccessToken()).toBe('')
})
