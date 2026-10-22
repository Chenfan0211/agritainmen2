export interface DeliveryMapPoint {
  longitude: number
  latitude: number
}

export function deliveryMapSummary(input: { stopCount: number; totalDistanceKm: number; estimatedDurationMinutes: number }): string {
  return `${input.stopCount} 家门店 · ${input.totalDistanceKm.toFixed(1)} km · 约 ${input.estimatedDurationMinutes} 分钟`
}

export function deliveryMapMarkers(input: {
  origin?: { longitude: number; latitude: number }
  stops: Array<{ storeId: string; longitude?: number; latitude?: number }>
}): Array<{ id: string; label: string; longitude: number; latitude: number }> {
  const markers = input.origin
    ? [{ id: 'origin', label: '仓', longitude: input.origin.longitude, latitude: input.origin.latitude }]
    : []
  input.stops.forEach((stop, index) => {
    if (stop.longitude === undefined || stop.latitude === undefined) return
    markers.push({ id: stop.storeId, label: String(index + 1), longitude: stop.longitude, latitude: stop.latitude })
  })
  return markers
}

export function routeOptimizationWarningText(warning: string): string {
  if (warning.startsWith('missing_coordinates:')) return '有门店缺少坐标，已排在末尾，请维护坐标'
  if (warning.startsWith('off_route:')) return '有门店不在命名线路中，已排在末尾'
  if (warning === 'direction_fallback') return '驾车路线暂不可用，已按直线距离估算'
  return warning
}
