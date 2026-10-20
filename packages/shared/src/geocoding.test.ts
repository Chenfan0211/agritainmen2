import { describe, expect, it, vi } from 'vitest'
import { farms } from './index'
import { createGeocodeProviders, createTencentGeocodeProvider, geocodeAddress, translateTencentCoordinates } from './geocoding'
import type { FarmLocation } from './index'
import type { GeocodeProvider } from './geocoding'
import { isValidChinaCoordinate } from './geocoding'

function location(provider: FarmLocation['provider'], longitude: number, latitude: number): FarmLocation {
  return { longitude, latitude, coordinateSystem: 'GCJ-02', provider, geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路' }
}

describe('geocodeAddress', () => {
  it('为每个演示门店预置地址和 GCJ-02 坐标', () => {
    expect(farms).not.toHaveLength(0)
    for (const farm of farms) {
      expect(farm.address).toEqual(expect.any(String))
      expect(farm.address.trim()).not.toBe('')
      expect(farm.locationStatus).toBe('resolved')
      expect(farm.location?.coordinateSystem).toBe('GCJ-02')
      expect(farm.location?.longitude).toEqual(expect.any(Number))
      expect(farm.location?.latitude).toEqual(expect.any(Number))
      expect(farm.location).toMatchObject({
        provider: 'amap', geocodedAt: expect.any(String), adCode: expect.any(String),
        province: '湖南省', city: expect.any(String), district: expect.any(String), formattedAddress: farm.address
      })
    }
  })

  it('只调用已配置的供应商', async () => {
    const skipped: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => false,
      geocode: vi.fn()
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 112.9388, 28.2282))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [skipped, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 112.9388, latitude: 28.2282 }
    })
    expect(skipped.geocode).not.toHaveBeenCalled()
    expect(tencent.geocode).toHaveBeenCalledWith({ address: '湖南省长沙市岳麓区' })
  })

  it('高德失败后按顺序回退到腾讯', async () => {
    const amap: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockRejectedValue(new Error('高德不可用'))
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 109.7397, 28.3189))
    }

    await expect(geocodeAddress('湖南省湘西州永顺县石板溪村', [amap, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 109.7397, latitude: 28.3189 }
    })
  })

  it('新地址解析只创建腾讯同源网关 provider', () => {
    expect(createGeocodeProviders({ amapKey: 'legacy-amap-key', tencentProxy: '/api/tencent-map/geocode', order: ['amap', 'tencent'] }).map((provider) => provider.name)).toEqual(['tencent'])
  })

  it('所有已配置供应商失败时返回 failed', async () => {
    const failed: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockRejectedValue(new Error('不可用'))
    }

    await expect(geocodeAddress('湖南省长沙市', [failed])).resolves.toEqual({ status: 'failed', reason: 'REQUEST_FAILED' })
  })

  it('高德返回非法中国境外坐标时回退腾讯', async () => {
    const amap: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('amap', 0, 0))
    }
    const tencent: GeocodeProvider = {
      name: 'tencent',
      isConfigured: () => true,
      geocode: vi.fn().mockResolvedValue(location('tencent', 112.9388, 28.2282))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [amap, tencent])).resolves.toMatchObject({
      status: 'resolved', provider: 'tencent'
    })
    expect(tencent.geocode).toHaveBeenCalledTimes(1)
  })

  it('解析腾讯完整行政区元数据', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'tencent',
      adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区',
      formattedAddress: '湖南省长沙市岳麓区潇湘中路', geocodedAt: '2026-09-02T08:00:00.000Z'
    }), { status: 200 }))
    const provider = createTencentGeocodeProvider({
      tencentProxy: '/api/tencent-map/geocode',
      fetch: request
    })

    await expect(provider.geocode({ address: '湖南省长沙市岳麓区潇湘中路' })).resolves.toMatchObject({
      longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'tencent', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路'
    })
    expect(request).toHaveBeenCalledWith('/api/tencent-map/geocode', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ address: '湖南省长沙市岳麓区潇湘中路' })
    }))
    expect(JSON.stringify(request.mock.calls)).not.toContain('test-key')
  })

  it('每个 provider 超时五秒后标记 TIMEOUT', async () => {
    const slow: GeocodeProvider = {
      name: 'amap',
      isConfigured: () => true,
      geocode: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(location('amap', 112.9388, 28.2282)), 20)))
    }

    await expect(geocodeAddress('湖南省长沙市岳麓区', [slow], { timeoutMs: 5 })).resolves.toEqual({ status: 'failed', reason: 'TIMEOUT' })
  })

  it('未配置 provider 与非法坐标分别返回可诊断原因', async () => {
    await expect(geocodeAddress('湖南省长沙市')).resolves.toEqual({ status: 'failed', reason: 'NOT_CONFIGURED' })
    const invalid: GeocodeProvider = { name: 'amap', isConfigured: () => true, geocode: vi.fn().mockResolvedValue(location('amap', 0, 0)) }
    await expect(geocodeAddress('湖南省长沙市', [invalid])).resolves.toEqual({ status: 'failed', reason: 'INVALID_COORDINATE' })
  })
})

describe('translateTencentCoordinates', () => {
  it('keeps GCJ-02 input unchanged and declares the output coordinate system', async () => {
    const request = vi.fn()
    await expect(translateTencentCoordinates({
      source: 'GCJ-02',
      locations: [{ longitude: 112.9388, latitude: 28.2282 }]
    }, { fetch: request })).resolves.toEqual({
      coordinateSystem: 'GCJ-02',
      locations: [{ longitude: 112.9388, latitude: 28.2282 }]
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('posts external coordinates to the same-origin Tencent gateway', async () => {
    const response = { coordinateSystem: 'GCJ-02' as const, locations: [{ longitude: 112.94, latitude: 28.23 }] }
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    await expect(translateTencentCoordinates({
      source: 'WGS84',
      locations: [{ longitude: 112.93, latitude: 28.22 }]
    }, { proxy: '/api/tencent-map/translate', fetch: request })).resolves.toEqual(response)
    expect(request).toHaveBeenCalledWith('/api/tencent-map/translate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source: 'WGS84', locations: [{ longitude: 112.93, latitude: 28.22 }] })
    }))
  })

  it('forwards Sogou Mercator values without treating them as geographic degrees', async () => {
    const response = { coordinateSystem: 'GCJ-02' as const, locations: [{ longitude: 112.94, latitude: 28.23 }] }
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    await expect(translateTencentCoordinates({
      source: 'SOGOU_MERCATOR',
      locations: [{ longitude: 12958160, latitude: 4825907 }]
    }, { fetch: request })).resolves.toEqual(response)
  })

  it('rejects malformed gateway output', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ coordinateSystem: 'WGS84', locations: [] }), { status: 200 }))
    await expect(translateTencentCoordinates({ source: 'BAIDU', locations: [{ longitude: 112.93, latitude: 28.22 }] }, { fetch: request })).rejects.toThrow('坐标转换响应无效')
  })
})

describe('isValidChinaCoordinate', () => {
  it('accepts inside-China coordinates and rejects out-of-range or non-numeric input', () => {
    expect(isValidChinaCoordinate(112.9388, 28.2282)).toBe(true)
    expect(isValidChinaCoordinate('112.9388', '28.2282')).toBe(true)
    expect(isValidChinaCoordinate(10, 28)).toBe(false)
    expect(isValidChinaCoordinate(112.9, 60)).toBe(false)
    expect(isValidChinaCoordinate('abc', 28)).toBe(false)
  })
})
