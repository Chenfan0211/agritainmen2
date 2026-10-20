import { afterEach, describe, expect, it } from 'vitest'
import { createGatewayServer, gatewayRouteFor, resolveGatewayPort } from './serve-gateway.mjs'

let server = null
afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  server = null
})

describe('resolveGatewayPort', () => {
  it('prefers --port=, then --port, then PORT, then the default', () => {
    expect(resolveGatewayPort(['node', 'serve-gateway.mjs', '--port=8899'], {})).toBe(8899)
    expect(resolveGatewayPort(['node', 'serve-gateway.mjs', '--port', '8898'], {})).toBe(8898)
    expect(resolveGatewayPort(['node', 'serve-gateway.mjs'], { PORT: '8897' })).toBe(8897)
    expect(resolveGatewayPort(['node', 'serve-gateway.mjs'], {})).toBe(8790)
    expect(resolveGatewayPort(['node', 'serve-gateway.mjs', '--port', 'nope'], {})).toBe(8790)
  })
})

describe('gatewayRouteFor', () => {
  it('routes the tencent map prefix, health check and unknown paths', () => {
    expect(gatewayRouteFor('/api/tencent-map/geocode')).toBe('gateway')
    expect(gatewayRouteFor('/health')).toBe('health')
    expect(gatewayRouteFor('/')).toBe('not-found')
    expect(gatewayRouteFor(undefined)).toBe('not-found')
  })
})

describe('createGatewayServer', () => {
  it('serves health, forwards gateway requests and returns 404 otherwise', async () => {
    const forwarded = []
    server = createGatewayServer({
      gateway: async (request, response) => {
        forwarded.push(request.url)
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        response.end('gateway')
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`

    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, gateway: '/api/tencent-map/*' })

    const gatewayResponse = await fetch(`${base}/api/tencent-map/geocode`)
    expect(await gatewayResponse.text()).toBe('gateway')
    expect(forwarded).toEqual(['/api/tencent-map/geocode'])

    const missing = await fetch(`${base}/nope`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not Found')
  })
})
