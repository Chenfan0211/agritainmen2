import { createServer } from 'node:http'
import { createTencentMapGatewayHandler } from '../packages/tencent-map-gateway/src/index.mjs'

// 腾讯地图 WebService 同源网关（独立进程）。
// 运营后台 H5 开发态由 vite 插件提供同一路由（apps/admin/vite.config.ts），
// 此脚本用于微信小程序等无法走 vite devServer 的场景：
//   node scripts/serve-gateway.mjs            # 默认 http://127.0.0.1:8790/api/tencent-map/*
//   VITE_TENCENT_MAP_GATEWAY=http://127.0.0.1:8790/api/tencent-map/geocode

const DEFAULT_PORT = 8790
const DEFAULT_HOST = '127.0.0.1'

/** 解析端口：--port=8791 > --port 8791 > PORT > 8790。 */
export function resolveGatewayPort(argv = process.argv, env = process.env) {
  const inline = argv.find((argument) => argument.startsWith('--port='))?.slice('--port='.length)
  const index = argv.findIndex((argument) => argument === '--port')
  const inlineValue = index >= 0 ? argv[index + 1] : undefined
  const value = Number(inline || inlineValue || env.PORT || DEFAULT_PORT)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT
}

/** 路由判定：网关前缀 / 健康检查 / 其余 404。 */
export function gatewayRouteFor(url = '/') {
  if (url.startsWith('/api/tencent-map/')) return 'gateway'
  if (url === '/health') return 'health'
  return 'not-found'
}

/** 供 CLI 与测试复用：按路由分派请求。 */
export function createGatewayServer({ gateway = createTencentMapGatewayHandler(), healthPayload = () => ({ ok: true, gateway: '/api/tencent-map/*' }) } = {}) {
  return createServer((request, response) => {
    const route = gatewayRouteFor(request.url || '/')
    if (route === 'gateway') {
      void gateway(request, response)
      return
    }
    if (route === 'health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(healthPayload()))
      return
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
  })
}

export function startGateway({ argv = process.argv, env = process.env } = {}) {
  const port = resolveGatewayPort(argv, env)
  const server = createGatewayServer()
  server.on('error', (error) => {
    console.error(`[gateway] server failed: ${error.message}`)
    process.exitCode = 1
  })
  server.listen(port, env.HOST || DEFAULT_HOST, () => {
    const address = server.address()
    const actualPort = typeof address === 'object' && address ? address.port : port
    console.log(`Tencent map gateway ready on http://127.0.0.1:${actualPort}/api/tencent-map/*`)
  })
  return server
}

const isCli = process.argv[1] && process.argv[1].endsWith('serve-gateway.mjs')
if (isCli) startGateway()
