import { describe, expect, it, vi } from 'vitest'
import { createAdminOrgMediaStorage, farmFromDto, portableProfileImage, supplierFromDto } from './org-profile-api'
import { configureApiClient } from '@agritainment/shared'
import type { ApiTransportRequest, MediaAssetRepository } from '@agritainment/shared'

describe('org profile API mapping', () => {
  it('restores supplier qualification and farm address after a fresh list read', () => {
    const supplier = supplierFromDto({ id: 'S1', name: '腊味', region: '湘西', category: '食品', contactPhone: '13900000000', status: 'paused', cooperationPauseReason: '资质复核', profile: { brands: ['山里香'], serviceRegions: ['长沙'], businessLicenseNumber: 'BL1', businessLicense: 'data:image/png;base64,YQ==', permitNumber: 'PM1', validUntil: '2030-01-01' } })
    expect(supplier.brands).toEqual(['山里香'])
    expect(supplier.cooperationPauseReason).toBe('资质复核')
    expect(supplier.qualification.attachments?.[0]).toMatchObject({ number: 'BL1', image: { source: 'legacy', url: 'data:image/png;base64,YQ==' } })

    const farm = farmFromDto({ id: 'F1', name: '山溪门店', region: '吉首市', contact: '王店长', contactPhone: '13800000000', status: 'pending', profile: { city: '湘西州', districtCode: '433101', detail: '矮寨镇1号', address: '湖南省湘西州吉首市矮寨镇1号', image: 'data:image/png;base64,YQ==', tags: ['重点'], locationStatus: 'failed' } })
    expect(farm.structuredAddress?.detail).toBe('矮寨镇1号')
    expect(farm.regionCode).toBe('433101')
    expect(farm.image).toBe('data:image/png;base64,YQ==')
    expect(farm.locationStatus).toBe('failed')
  })

  it('uploads a local asset and persists only its stable media reference', async () => {
    const requests: ApiTransportRequest[] = []
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async (request) => {
      requests.push(request)
      return { status: 200, body: { code: 'OK', data: { assetId: 'ORG-MEDIA-1' } } }
    } })
    const storage = { resolve: vi.fn(async () => 'blob:local-image'), release: vi.fn() } as unknown as MediaAssetRepository
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['image-content'], { type: 'image/png' }))) as typeof fetch
    try {
      const result = await portableProfileImage({ source: 'asset', assetId: 'local-1' }, storage)
      expect(result).toEqual({ source: 'asset', assetId: 'ORG-MEDIA-1' })
      expect(requests[0]).toMatchObject({ url: 'https://api.example.com/api/v1/org/media', body: { mimeType: 'image/png', base64: 'aW1hZ2UtY29udGVudA==' } })
      expect(storage.release).toHaveBeenCalledWith('blob:local-image')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('uploads a legacy blob URL before persisting it', async () => {
    configureApiClient({ dataMode: 'api', baseUrl: 'https://api.example.com', transport: async () => ({ status: 200, body: { code: 'OK', data: { assetId: 'ORG-MEDIA-2' } } }) })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['cover'], { type: 'image/png' }))) as typeof fetch
    try {
      expect(await portableProfileImage('blob:temporary-cover')).toEqual({ source: 'asset', assetId: 'ORG-MEDIA-2' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('keeps an uploaded media reference on later edits without a second upload', async () => {
    expect(await portableProfileImage({ source: 'asset', assetId: 'ORG-MEDIA-3' })).toEqual({ source: 'asset', assetId: 'ORG-MEDIA-3' })
  })

  it('resolves server images with an admin token and releases the preview URL', async () => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAccessToken: () => 'admin-token' })
    const base = { resolve: vi.fn(async () => 'blob:local'), release: vi.fn(), save: vi.fn(), remove: vi.fn(), runAssetTransaction: vi.fn() } as unknown as MediaAssetRepository
    const fetcher = vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' })))
    const revoke = vi.fn()
    const storage = createAdminOrgMediaStorage(base, { fetcher, createObjectURL: () => 'blob:server', revokeObjectURL: revoke })
    expect(await storage.resolve({ source: 'asset', assetId: 'ORG-MEDIA-4' })).toBe('blob:server')
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/api/v1/org/media/ORG-MEDIA-4', { headers: { Authorization: 'Bearer admin-token' } })
    storage.release('blob:server')
    expect(revoke).toHaveBeenCalledWith('blob:server')
    expect(await storage.resolve({ source: 'asset', assetId: 'local-1' })).toBe('blob:local')
  })
})
