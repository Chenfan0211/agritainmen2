#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

const expected = [
  ['POST', '/api/v1/auth/admin/login'],
  ['POST', '/api/v1/auth/store/login'],
  ['GET', '/api/v1/auth/store/farm'],
  ['POST', '/api/v1/auth/supplier/login'],
  ['POST', '/api/v1/auth/driver/login'],
  ['GET', '/api/v1/auth/supplier/drivers'],
  ['POST', '/api/v1/auth/supplier/drivers'],
  ['PATCH', '/api/v1/auth/supplier/drivers/{id}'],
  ['POST', '/api/v1/auth/wechat/exchange'],
  ['POST', '/api/v1/auth/refresh'],
  ['POST', '/api/v1/auth/logout'],
  ['GET', '/api/v1/auth/me'],
  ['GET', '/api/v1/org/suppliers'],
  ['GET', '/api/v1/org/suppliers/{id}'],
  ['GET', '/api/v1/org/me/supplier'],
  ['PUT', '/api/v1/org/me/supplier/warehouse'],
  ['GET', '/api/v1/org/farms'],
  ['GET', '/api/v1/org/farms/{id}'],
  ['POST', '/api/v1/org/media'],
  ['GET', '/api/v1/org/media/{id}'],
  ['GET', '/api/v1/org/drivers'],
  ['GET', '/api/v1/org/leaders'],
  ['GET', '/api/v1/catalog/products'],
  ['GET', '/api/v1/catalog/skus/{skuId}/quote'],
  ['POST', '/api/v1/inventory/reservations'],
  ['POST', '/api/v1/inventory/reservations/{id}/release'],
  ['POST', '/api/v1/inventory/reservations/{id}/confirm'],
  ['POST', '/api/v1/inventory/skus/{skuId}/adjust'],
  ['GET', '/api/v1/inventory/available'],
  ['GET', '/api/v1/inventory/skus/{skuId}/available'],
  ['POST', '/api/v1/orders'],
  ['GET', '/api/v1/orders'],
  ['GET', '/api/v1/orders/{id}'],
  ['POST', '/api/v1/orders/{id}/cancel'],
  ['POST', '/api/v1/orders/{id}/payment-confirmation'],
  ['POST', '/api/v1/payments/intents'],
  ['POST', '/api/v1/payments/callback/wechat'],
  ['GET', '/api/v1/payments/orders/{orderId}'],
  ['POST', '/api/v1/fulfillment/orders'],
  ['GET', '/api/v1/fulfillment/orders'],
  ['POST', '/api/v1/fulfillment/orders/{id}/accept'],
  ['POST', '/api/v1/fulfillment/orders/batch-accept'],
  ['POST', '/api/v1/fulfillment/orders/{id}/assign-driver'],
  ['POST', '/api/v1/fulfillment/orders/{id}/ship'],
  ['POST', '/api/v1/fulfillment/orders/{id}/delivered'],
  ['GET', '/api/v1/fulfillment/logistics/{trackingNo}'],
  ['POST', '/api/v1/commissions'],
  ['GET', '/api/v1/commissions/me/records'],
  ['POST', '/api/v1/withdrawals'],
  ['GET', '/api/v1/withdrawals'],
  ['GET', '/api/v1/withdrawals/me'],
  ['POST', '/api/v1/withdrawals/{id}/review'],
  ['POST', '/api/v1/admin/audit'],
  ['GET', '/api/v1/admin/audit'],
  ['GET', '/api/v1/admin/dictionaries'],
  ['GET', '/api/v1/notifications/health'],
  ['POST', '/api/v1/notifications/sms/verification-code'],
  ['POST', '/api/v1/notifications/sms/verify'],
  ['PUT', '/api/v1/catalog/prices'],
  ['PUT', '/api/v1/catalog/pricing-defaults'],
  ['PUT', '/api/v1/commissions/share-config'],
  ['PUT', '/api/v1/commissions/rules/{id}'],
  ['POST', '/api/v1/org/suppliers/{id}/audit'],
  ['POST', '/api/v1/org/suppliers/{id}/restore'],
  ['POST', '/api/v1/org/suppliers/{id}/pause'],
  ['POST', '/api/v1/org/suppliers/{id}/resume'],
  ['POST', '/api/v1/org/farm-accounts'],
  ['GET', '/api/v1/org/farm-accounts/{id}'],
  ['PUT', '/api/v1/org/farm-accounts/{id}'],
  ['PATCH', '/api/v1/org/farm-accounts/{id}'],
  ['POST', '/api/v1/org/promoters'],
  ['PUT', '/api/v1/org/promoters/{id}'],
  ['PATCH', '/api/v1/org/leaders/{id}'],
  ['PUT', '/api/v1/catalog/categories/{id}'],
  ['DELETE', '/api/v1/catalog/categories/{id}'],
  ['POST', '/api/v1/catalog/prices'],
  ['PUT', '/api/v1/catalog/prices/{id}'],
  ['PATCH', '/api/v1/catalog/prices/{id}'],
  ['POST', '/api/v1/catalog/products'],
  ['PATCH', '/api/v1/catalog/products/{id}'],
  ['POST', '/api/v1/catalog/products/{id}/review'],
  ['POST', '/api/v1/auth/admin/roles'],
  ['PUT', '/api/v1/auth/admin/roles/{id}'],
  ['PUT', '/api/v1/auth/admin/roles/{id}/permissions'],
  ['POST', '/api/v1/auth/admin/accounts'],
  ['PUT', '/api/v1/auth/admin/accounts/{id}'],
  ['PATCH', '/api/v1/auth/admin/accounts/{id}'],
  ['GET', '/api/v1/auth/admin/supplier-accounts'],
  ['POST', '/api/v1/auth/admin/supplier-accounts'],
  ['POST', '/api/v1/auth/admin/store-accounts'],
  ['GET', '/api/v1/auth/admin/store-accounts'],
  ['GET', '/api/v1/org/farm-accounts'],
  ['GET', '/api/v1/auth/admin/supplier-accounts/{supplierId}'],
  ['PATCH', '/api/v1/auth/admin/supplier-accounts/{supplierId}'],
  ['POST', '/api/v1/org/suppliers'],
  ['PUT', '/api/v1/org/suppliers/{id}'],
  ['POST', '/api/v1/org/farms'],
  ['PUT', '/api/v1/org/farms/{id}'],
  ['POST', '/api/v1/org/drivers'],
  ['PUT', '/api/v1/org/drivers/{id}'],
  ['PATCH', '/api/v1/org/drivers/{id}'],
  ['POST', '/api/v1/catalog/categories'],
  ['POST', '/api/v1/admin/dictionaries'],
  ['PUT', '/api/v1/admin/dictionaries'],
  ['DELETE', '/api/v1/admin/dictionaries'],  ['GET', '/api/v1/catalog/categories'],
  ['GET', '/api/v1/catalog/prices'],
  ['GET', '/api/v1/org/users'],
  ['GET', '/api/v1/after-sales'],
  ['GET', '/api/v1/commissions'],
  ['GET', '/api/v1/commissions/me'],
  ['GET', '/api/v1/auth/admin/roles'],
  ['GET', '/api/v1/auth/admin/accounts'],
  ['GET', '/api/v1/admin/dashboard'],
  ['GET', '/api/v1/admin/reports'],]

const methods = new Set(['get', 'post', 'put', 'patch', 'delete'])
const specPath = resolve(process.cwd(), 'docs/backend/openapi.yaml')
const spec = parse(readFileSync(specPath, 'utf8'))
const documented = []
for (const [path, operations] of Object.entries(spec.paths || {})) {
  for (const method of Object.keys(operations || {})) {
    if (methods.has(method)) documented.push([method.toUpperCase(), `/api/v1${path}`])
  }
}

const key = ([method, path]) => `${method} ${path}`
const expectedKeys = new Set(expected.map(key))
const documentedKeys = new Set(documented.map(key))
const missing = [...expectedKeys].filter((item) => !documentedKeys.has(item))
const extra = [...documentedKeys].filter((item) => !expectedKeys.has(item))

console.log(`后端 API 契约：实际 ${expected.length} 个操作，OpenAPI ${documented.length} 个操作`)
if (missing.length) {
  console.error(`OpenAPI 缺失 ${missing.length} 个操作：`)
  for (const item of missing) console.error(`  - ${item}`)
}
if (extra.length) {
  console.error(`OpenAPI 存在 ${extra.length} 个未登记实际操作：`)
  for (const item of extra) console.error(`  - ${item}`)
}
if (!missing.length && !extra.length) console.log('OpenAPI 与后端实际路由完全一致')
process.exit(missing.length || extra.length ? 1 : 0)
