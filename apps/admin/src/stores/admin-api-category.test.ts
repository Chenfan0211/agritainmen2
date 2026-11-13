import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient } from '@agritainment/shared'
import type { ApiTransportRequest } from '@agritainment/shared'
import { useAdminStore } from './admin'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) }, clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

function okSheet() {
  return { status: 200, body: { code: 'OK', message: 'ok', data: [] } }
}

describe('admin api P2 category writes', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('posts category create and surfaces api failure', async () => {
    const calls: ApiTransportRequest[] = []
    const transport = vi.fn(async (request) => {
      calls.push(request)
      if (request.url.includes('/catalog/categories') && request.method === 'POST') {
        return { status: 200, body: { code: 'OK', message: 'ok', data: { id: 'C1', code: 'fresh', name: '生鲜' } } }
      }
      return okSheet()
    })
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport })
    const store = useAdminStore()
    await store.login('admin', '123456')
    const result = await store.addCategory('生鲜', 'product')
    if (!result) throw new Error('addCategory failed: ' + store.error + ' calls=' + calls.map((c) => c.method + ' ' + c.url).join(','))
    expect(result).toBe(true)
    const post = calls.find((c) => c.url.endsWith('/api/v1/catalog/categories') && c.method === 'POST')
    expect(post, 'must POST category').toBeTruthy()
    expect(post?.body).toMatchObject({ name: '生鲜' })
  })
})
