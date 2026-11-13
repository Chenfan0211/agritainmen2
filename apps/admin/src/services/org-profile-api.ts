import { apiRequest, buildFarmAdministrativeAddress, getApiClientConfig, normalizeMediaReference } from '@agritainment/shared'
import { getMediaRuntime } from '../../../../packages/ui/src/runtime'
import type { BusinessMediaValue, FarmStore, MediaAssetRepository, Supplier } from '@agritainment/shared'
import { buildSupplierQualification } from '../media-dictionary'

export interface SupplierDto {
  id: string
  name: string
  region?: string
  category?: string
  contactPhone?: string
  status?: Supplier['status']
  certified?: boolean
  cooperationPauseReason?: string | null
  profile?: {
    coop?: boolean
    brands?: string[]
    serviceRegions?: string[]
    businessLicenseNumber?: string
    businessLicense?: BusinessMediaValue | null
    permitNumber?: string
    permit?: BusinessMediaValue | null
    validUntil?: string
    reviewNote?: string
  }
}

export interface FarmDto {
  id: string
  name: string
  region?: string
  contact?: string
  contactPhone?: string
  status?: FarmStore['status']
  profile?: {
    city?: string
    districtCode?: string
    detail?: string
    address?: string
    structuredAddress?: FarmStore['structuredAddress']
    tags?: string[]
    rating?: number
    averageSpend?: number
    image?: BusinessMediaValue | null
    location?: FarmStore['location']
    locationStatus?: FarmStore['locationStatus']
    locationError?: string
  }
}

export function supplierFromDto(dto: SupplierDto): Supplier {
  const profile = dto.profile || {}
  return {
    id: dto.id,
    name: dto.name,
    region: dto.region || '',
    category: dto.category || '综合品类',
    contactPhone: dto.contactPhone || '',
    status: dto.status || 'pending',
    certified: dto.certified ?? dto.status === 'cooperating',
    cooperationPauseReason: dto.cooperationPauseReason || undefined,
    coop: profile.coop ?? false,
    brands: profile.brands || [],
    serviceRegions: profile.serviceRegions || [],
    productCount: 0,
    qualification: buildSupplierQualification(profile)
  }
}

export function farmFromDto(dto: FarmDto): FarmStore {
  const profile = dto.profile || {}
  let structuredAddress = profile.structuredAddress
  if (!structuredAddress && profile.districtCode && profile.detail) {
    try { structuredAddress = buildFarmAdministrativeAddress(profile.districtCode, profile.detail) }
    catch { /* Older records may contain an unrecognized district code. */ }
  }
  return {
    id: dto.id,
    name: dto.name,
    region: dto.region || '',
    contact: dto.contact || '',
    contactPhone: dto.contactPhone || '',
    status: dto.status || 'pending',
    city: profile.city || '',
    address: profile.address || '',
    regionCode: profile.districtCode,
    structuredAddress,
    tags: profile.tags || ['新入驻'],
    rating: profile.rating ?? 5,
    averageSpend: profile.averageSpend ?? 0,
    image: profile.image || { source: 'builtin', path: '/static/images/farmhouse.jpg' },
    location: profile.location,
    locationStatus: profile.locationStatus || 'failed',
    locationError: profile.locationError,
    distance: 0,
    monthlySales: 0,
    selectedCount: 0,
    gmv: 0,
    availability: 'bookable'
  }
}

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024
const SERVER_MEDIA_PREFIX = 'ORG-MEDIA-'

export async function portableProfileImage(value: BusinessMediaValue | null | undefined, storage?: MediaAssetRepository, purpose = 'farm-cover'): Promise<BusinessMediaValue | null> {
  if (!value) return null
  if (typeof value === 'object' && value.source === 'asset' && value.assetId.startsWith(SERVER_MEDIA_PREFIX)) return value
  const local = typeof value === 'object' && value.source === 'asset'
  const blobUrl = typeof value === 'string' ? value.startsWith('blob:') : value.source === 'legacy' && value.url.startsWith('blob:')
  const dataUrl = typeof value === 'string' ? value : value.source === 'legacy' ? value.url : ''
  if (!local && !blobUrl && !dataUrl.startsWith('data:')) return value
  let mimeType = ''
  let base64 = ''
  if (dataUrl.startsWith('data:')) {
    const parsed = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!parsed) throw new Error('仅支持 JPEG、PNG、WebP 图片')
    mimeType = parsed[1]
    base64 = parsed[2]
  }
  const mediaStorage = storage ?? (local ? getMediaRuntime().storage : undefined)
  if (!base64) {
    const url = local ? await mediaStorage!.resolve(value) : typeof value === 'string' ? value : value.source === 'legacy' ? value.url : ''
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('图片读取失败，请重新上传')
      const blob = await response.blob()
      if (blob.size > MAX_PROFILE_IMAGE_BYTES) throw new Error('图片不能超过 2MB')
      mimeType = blob.type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('仅支持 JPEG、PNG、WebP 图片')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const chunks: string[] = []
      for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
      base64 = btoa(chunks.join(''))
    } finally {
      if (local) mediaStorage!.release(url)
    }
  }
  if (base64.length > Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3) * 4) throw new Error('图片不能超过 2MB')
  const uploaded = await apiRequest<{ assetId: string }>('/api/v1/org/media', { method: 'POST', body: { mimeType, purpose, base64 } })
  return { source: 'asset', assetId: uploaded.assetId }
}

export function createAdminOrgMediaStorage(base: MediaAssetRepository, options: {
  fetcher?: typeof fetch
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
} = {}): MediaAssetRepository {
  const serverUrls = new Set<string>()
  const fetcher = options.fetcher ?? fetch
  return {
    save: (file, purpose, saveOptions) => base.save(file, purpose, saveOptions),
    saveBytes: base.saveBytes ? (data, mimeType, purpose, saveOptions) => base.saveBytes!(data, mimeType, purpose, saveOptions) : undefined,
    async resolve(value) {
      const reference = normalizeMediaReference(value)
      if (reference?.source !== 'asset' || !reference.assetId.startsWith(SERVER_MEDIA_PREFIX)) return base.resolve(value)
      const config = getApiClientConfig()
      const token = config.getAccessToken?.()
      if (!token) throw new Error('登录已失效，请重新登录')
      const response = await fetcher(`${config.baseUrl}/api/v1/org/media/${encodeURIComponent(reference.assetId)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('图片读取失败')
      const url = (options.createObjectURL ?? URL.createObjectURL)(await response.blob())
      serverUrls.add(url)
      return url
    },
    remove: (assetId) => base.remove(assetId),
    release(url) {
      if (serverUrls.delete(url)) (options.revokeObjectURL ?? URL.revokeObjectURL)(url)
      else base.release(url)
    },
    runAssetTransaction: (execute) => base.runAssetTransaction(execute)
  }
}
