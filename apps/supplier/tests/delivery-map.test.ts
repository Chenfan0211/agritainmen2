import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('native delivery route map', () => {
  it('uses the native map component with markers, polyline and overlay', () => {
    const component = read('src/components/DeliveryRouteMap/index.wxml')
    const logic = read('src/components/DeliveryRouteMap/index.ts')
    expect(component).toContain('<map')
    expect(component).toContain('delivery-route-map-overlay')
    expect(component).toContain('markers=')
    expect(component).toContain('polyline=')
    expect(logic).toContain('nativeMarkers')
    expect(logic).toContain('nativePolyline')
  })

  it('keeps route planning wired into the native supplier page', () => {
    const page = read('src/pages/index/index.ts')
    const wxml = read('src/pages/index/index.wxml')
    expect(page).toContain('optimizeNamedRoute')
    expect(wxml).toContain('<delivery-route-map')
  })
})
