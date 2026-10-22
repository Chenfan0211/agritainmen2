interface MapPoint { longitude: number; latitude: number }
function pointOf(value: any): MapPoint | null {
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}
Component({
  properties: {
    origin: { type: Object, value: null, observer: 'rebuild' },
    stops: { type: Array, value: [], observer: 'rebuild' },
    polyline: { type: Array, value: [], observer: 'rebuild' },
    selectedStopId: { type: String, value: '', observer: 'rebuild' },
    stopCount: { type: Number, value: 0, observer: 'rebuild' },
    totalDistanceKm: { type: Number, value: 0, observer: 'rebuild' },
    estimatedDurationMinutes: { type: Number, value: 0, observer: 'rebuild' },
    status: { type: String, value: 'idle' }
  },
  data: { center: { latitude: 28.2, longitude: 112.9 }, nativeMarkers: [] as any[], nativePolyline: [] as any[], summary: '' },
  lifetimes: { attached() { this.rebuild() } },
  methods: {
    rebuild() {
      const origin = pointOf(this.data.origin)
      const stops = (this.data.stops || []).map((stop: any, index: number) => ({ stop, index, point: pointOf(stop) })).filter((item: any) => item.point)
      const markers = [...(origin ? [{ id: 'origin', label: '仓', latitude: origin.latitude, longitude: origin.longitude }] : []), ...stops.map((item: any) => ({ id: item.stop.storeId, label: String(item.index + 1), latitude: item.point.latitude, longitude: item.point.longitude }))]
      const nativeMarkers = markers.map((marker) => ({ id: marker.id, latitude: marker.latitude, longitude: marker.longitude, width: 24, height: 24, callout: { content: marker.label, color: marker.id === this.data.selectedStopId ? '#3D7CB0' : marker.id === 'origin' ? '#C8322B' : '#A8261F', fontSize: 12, borderRadius: 4, padding: 4, display: 'ALWAYS' } }))
      const points = (Array.isArray(this.data.polyline) && this.data.polyline.length ? this.data.polyline : [...(origin ? [origin] : []), ...stops.map((item: any) => item.point)]).map((point: any) => pointOf(point)).filter(Boolean)
      const nativePolyline = points.length > 1 ? [{ points, color: '#C8322B', width: 4, arrowLine: true }] : []
      const center = points[0] || origin || { latitude: 28.2, longitude: 112.9 }
      const stopCount = Number(this.data.stopCount) || stops.length
      const summary = `${stopCount} 家门店 · ${Number(this.data.totalDistanceKm || 0).toFixed(1)} km · 约 ${Number(this.data.estimatedDurationMinutes || 0)} 分钟`
      this.setData({ center, nativeMarkers, nativePolyline, summary })
    },
    handleNativeMarkerTap(event: any) {
      const id = String(event.detail?.markerId || '')
      if (id) this.triggerEvent('select', { stopId: id })
    },
    selectMarker(event: any) {
      const stopId = String(event.currentTarget?.dataset?.stopId || '')
      if (stopId) this.triggerEvent('select', { stopId })
    }
  }
})
