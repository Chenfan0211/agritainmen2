import { beforeEach, describe, expect, it } from 'vitest'
import * as sharedModule from './index'
import type { CatalogProduct, CatalogState, PlatformRecoveryHandlerRegistration } from './index'

const memory = new Map<string, string>()
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
    removeItem: (key: string) => { memory.delete(key) },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size }
  } as Storage
}

type SubmissionInput = {
  id: string
  source: 'supplier' | 'admin'
  supplierId?: string
  kind: 'create' | 'update'
  draft: CatalogProduct
  baseCatalogRevision: number
  submittedBy: string
  submittedAt: string
}

type ReviewInput = {
  submissionId: string
  reviewedBy: string
  reviewedAt: string
  note?: string
  expectedSubmissionRevision: number
  expectedCatalogRevision?: number
}

type RouteStop = {
  storeId: string
  storeName: string
  address: string
  longitude?: number
  latitude?: number
  orderIds: string[]
}

type SharedFeatureApi = {
  normalizeMinimumOrderQuantity?: (value: unknown) => number
  validateCatalogSkuOrderQuantity?: (sku: { stock: number; minimumOrderQuantity?: number }, quantity: number) => { ok: boolean; code?: string; minimumOrderQuantity: number; availableStock: number }
  createCatalogProductSubmission?: (input: SubmissionInput, expectedRevision: number, audit?: { module: string; action: string; actorId: string }) => Promise<{ ok: boolean; code?: string; value?: unknown; operationId?: string; failedStep?: string; recoveryQueued?: boolean; fatal?: boolean }>
  approveCatalogProductSubmission?: (input: ReviewInput) => Promise<{ ok: boolean; code?: string; value?: unknown; operationId?: string; failedStep?: string; recoveryQueued?: boolean; fatal?: boolean }>
  rejectCatalogProductSubmission?: (input: ReviewInput) => Promise<{ ok: boolean; code?: string; value?: unknown; operationId?: string; failedStep?: string; recoveryQueued?: boolean; fatal?: boolean }>
  readCatalogProductSubmissionState?: () => { schemaVersion: number; revision: number; submissions: Array<{ id: string; status: string; baseProductFingerprint?: string }> } | null
  createCatalogProductReviewRecoveryHandlerRegistration?: () => PlatformRecoveryHandlerRegistration
  readDriverStoreScopeState?: () => { schemaVersion: number; revision: number; scopes: Array<{ supplierId: string; driverId: string; storeIds: string[] }> } | null
  readDriverStoreScopes?: (supplierId?: string, driverId?: string) => Array<{ supplierId: string; driverId: string; storeIds: string[] }>
  writeDriverStoreScopeState?: (next: unknown, expectedRevision: number) => boolean
  saveDriverStoreScope?: (scope: { supplierId: string; driverId: string; storeIds: string[]; updatedAt: string }, expectedRevision: number) => { ok: boolean; code?: string }
  readDailyDeliveryRouteState?: () => { schemaVersion: number; revision: number; routes: unknown[] } | null
  readDailyDeliveryRoutes?: (supplierId?: string, driverId?: string) => Array<{ id: string; supplierId: string; driverId: string }>
  writeDailyDeliveryRouteState?: (next: unknown, expectedRevision: number) => boolean
  saveDailyDeliveryRoute?: (route: unknown, expectedRevision: number) => { ok: boolean; code?: string }
  mergeDeliveryOrdersByStore?: (orders: Array<{ orderId: string; storeId: string; storeName: string; address: string; longitude?: number; latitude?: number }>) => RouteStop[]
}

const api = sharedModule as unknown as SharedFeatureApi
const catalogKey = 'agritainment-platform-catalog'
const submissionKey = 'agritainment-platform-catalog-product-submissions'
const driverScopeKey = 'agritainment-platform-driver-store-scopes'
const dailyRouteKey = 'agritainment-platform-daily-delivery-routes'

function catalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'P-REVIEW', name: '审核商品', category: '土特产', supplierId: 'S-1', supplierName: '供应商', source: 'farmhouse', status: 'active',
    image: '/product.jpg', images: [], tags: [], productType: 'goods', expressDelivery: true, channel: 'all', farmIds: ['STORE-1'],
    promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: 'SKU-1', name: '标准装', image: '/product.jpg', retailPrice: 30, cost: 20, stock: 8, level1Amount: 2, level2Amount: 3, minimumOrderQuantity: 4 }],
    ...overrides
  } as CatalogProduct
}

function submission(input: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    id: 'SUB-1', source: 'supplier', supplierId: 'S-1', kind: 'create', draft: catalogProduct(), baseCatalogRevision: 0,
    submittedBy: 'supplier-1', submittedAt: '2026-08-31T08:00:00.000Z', ...input
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => localStorage.clear())

describe('catalog MOQ', () => {
  it('normalizes missing and fractional MOQ to one while preserving zero and valid integers', () => {
    expect(api.normalizeMinimumOrderQuantity).toBeTypeOf('function')
    if (!api.normalizeMinimumOrderQuantity) return
    expect([undefined, 0, 1.5, 3].map(api.normalizeMinimumOrderQuantity)).toEqual([1, 0, 1, 3])

    const raw = catalogProduct({
      skus: [
        { ...catalogProduct().skus[0], id: 'missing', minimumOrderQuantity: undefined },
        { ...catalogProduct().skus[0], id: 'zero', minimumOrderQuantity: 0 },
        { ...catalogProduct().skus[0], id: 'fraction', minimumOrderQuantity: 2.5 },
        { ...catalogProduct().skus[0], id: 'valid', minimumOrderQuantity: 6 }
      ]
    })
    localStorage.setItem(catalogKey, JSON.stringify({ schemaVersion: 1, revision: 2, products: [raw] }))
    expect(sharedModule.readCatalogState()?.products[0].skus.map((sku) => sku.minimumOrderQuantity)).toEqual([1, 0, 1, 6])
  })

  it('projects MOQ to store and user SKUs and rejects quantities below MOQ or above stock', () => {
    expect(api.validateCatalogSkuOrderQuantity).toBeTypeOf('function')
    if (!api.validateCatalogSkuOrderQuantity) return
    const product = catalogProduct()
    expect(sharedModule.catalogProductToProduct(product).skus[0]).toMatchObject({ minimumOrderQuantity: 4 })
    expect(sharedModule.catalogProductToCProduct(product).skus[0]).toMatchObject({ minimumOrderQuantity: 4 })
    expect(api.validateCatalogSkuOrderQuantity(product.skus[0], 3)).toMatchObject({ ok: false, code: 'below_minimum_order_quantity', minimumOrderQuantity: 4, availableStock: 8 })
    expect(api.validateCatalogSkuOrderQuantity({ ...product.skus[0], stock: 3 }, 4)).toMatchObject({ ok: false, code: 'insufficient_stock' })
    expect(api.validateCatalogSkuOrderQuantity(product.skus[0], 4)).toEqual({ ok: true, minimumOrderQuantity: 4, availableStock: 8 })
  })
})

describe('catalog product submissions', () => {
  it('waits for the product collections lock before committing a submission', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission) return
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [] })).toBe(true)
    const acquired = deferred<void>()
    const release = deferred<void>()
    const holding = sharedModule.runLockedPlatformCollectionTask({
      collections: [sharedModule.PLATFORM_CATALOG_STORAGE_KEY, sharedModule.PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, sharedModule.PLATFORM_AUDIT_LOG_STORAGE_KEY],
      execute: async () => {
        acquired.resolve()
        await release.promise
      }
    })
    await acquired.promise

    const creating = Promise.resolve(api.createCatalogProductSubmission(submission(), 0, {
      module: 'products', action: 'product.submission.create', actorId: 'supplier-1'
    }))
    await Promise.resolve()
    expect(api.readCatalogProductSubmissionState?.()).toBeNull()

    release.resolve()
    expect(await holding).toMatchObject({ ok: true })
    expect(await creating).toMatchObject({ ok: true })
  })

  it('preserves a concurrent submission snapshot when the audit step loses CAS', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission) return
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [] })).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let concurrentState: unknown
    localStorage.setItem = ((key: string, value: string) => {
      if (key === sharedModule.PLATFORM_AUDIT_LOG_STORAGE_KEY) {
        const written = JSON.parse(localStorage.getItem(sharedModule.PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY) || 'null')
        concurrentState = { ...written, revision: written.revision + 1, updatedAt: '2026-08-31T08:30:00.000Z' }
        originalSetItem(sharedModule.PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, JSON.stringify(concurrentState))
        throw new Error('concurrent audit write')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    let result: { ok: boolean; code?: string; operationId?: string } | undefined
    try {
      result = await api.createCatalogProductSubmission(submission(), 0, {
        module: 'products', action: 'product.submission.create', actorId: 'supplier-1'
      })
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(result).toMatchObject({ ok: false, code: 'recovery_queued', operationId: expect.any(String) })
    expect(api.readCatalogProductSubmissionState?.()).toEqual(concurrentState)
  })

  it('approves create as offline and rejects a second pending submission for the product', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ supplierId: 'S-OTHER' }), 0)).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(await api.createCatalogProductSubmission(submission(), 0)).toMatchObject({ ok: true, value: { id: 'SUB-1', source: 'supplier', supplierId: 'S-1', kind: 'create', draft: { id: 'P-REVIEW' }, baseCatalogRevision: 0, status: 'pending' } })
    expect(await api.createCatalogProductSubmission(submission({ id: 'SUB-2' }), 1)).toMatchObject({ ok: false, code: 'duplicate_pending' })
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T07:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(sharedModule.readCatalogState()?.products).toEqual([])

    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })).toMatchObject({ ok: true })
    expect(sharedModule.readCatalogState()?.products[0]).toMatchObject({ id: 'P-REVIEW', status: 'offline' })
    expect(api.readCatalogProductSubmissionState?.()?.submissions[0]).toMatchObject({ id: 'SUB-1', status: 'approved' })
  })

  it('approves update while preserving active status and detects both revision conflicts', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    const current = catalogProduct({ name: '正式名称', status: 'active' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [current] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ kind: 'update', draft: { ...current, name: '审核后名称', status: 'offline' } }), 0)).toMatchObject({ ok: true })
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 0, expectedCatalogRevision: 0 })).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 9 })).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })).toMatchObject({ ok: true })
    expect(sharedModule.readCatalogState()?.products[0]).toMatchObject({ name: '审核后名称', status: 'active' })
  })

  it('rejects a submission without changing the formal catalog', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.rejectCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission || !api.rejectCatalogProductSubmission) return
    const current = catalogProduct({ name: '正式名称' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [current] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ kind: 'update', draft: { ...current, name: '不通过名称' } }), 0)).toMatchObject({ ok: true })
    const before = sharedModule.readCatalogState()
    expect(await api.rejectCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1 })).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(await api.rejectCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', note: '   ', expectedSubmissionRevision: 1 })).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(api.readCatalogProductSubmissionState?.()?.submissions[0]).toMatchObject({ status: 'pending' })
    expect(await api.rejectCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', note: '资料不完整', expectedSubmissionRevision: 1 })).toMatchObject({ ok: true })
    expect(sharedModule.readCatalogState()).toEqual(before)
    expect(api.readCatalogProductSubmissionState?.()?.submissions[0]).toMatchObject({ status: 'rejected' })
  })

  it('prevents supplier updates from taking ownership of another supplier product while allowing admin updates', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission) return
    const formal = catalogProduct({ supplierId: 'S-1', supplierName: '供应商 1' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    const takeoverDraft = { ...formal, supplierId: 'S-2', supplierName: '供应商 2' }

    expect(await api.createCatalogProductSubmission(submission({ source: 'supplier', supplierId: 'S-2', kind: 'update', draft: takeoverDraft }), 0)).toMatchObject({ ok: false, code: 'supplier_mismatch' })
    expect(sharedModule.readCatalogState()?.products[0]).toMatchObject({ supplierId: 'S-1', supplierName: '供应商 1' })
    expect(api.readCatalogProductSubmissionState?.()).toBeNull()

    expect(await api.createCatalogProductSubmission(submission({ source: 'admin', supplierId: undefined, kind: 'update', draft: takeoverDraft, submittedBy: 'admin-1' }), 0)).toMatchObject({ ok: true })
  })

  it('approves an update after unrelated catalog changes but rejects a changed target product', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    const p1 = catalogProduct({ id: 'P-1', name: 'P1 正式资料' })
    const p2 = catalogProduct({ id: 'P-2', name: 'P2 正式资料', skus: [{ ...catalogProduct().skus[0], id: 'SKU-2' }] })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [p1, p2] })).toBe(true)

    const forged = { ...submission({ kind: 'update', draft: { ...p1, name: 'P1 审核资料' } }), baseProductFingerprint: 'caller-forged' } as unknown as SubmissionInput
    expect(await api.createCatalogProductSubmission(forged, 0)).toMatchObject({ ok: true })
    const generatedFingerprint = api.readCatalogProductSubmissionState?.()?.submissions[0].baseProductFingerprint
    expect(generatedFingerprint).toEqual(expect.any(String))
    expect(generatedFingerprint).not.toBe('caller-forged')

    expect(sharedModule.saveCatalogProduct({ ...p2, skus: [{ ...p2.skus[0], stock: p2.skus[0].stock + 5 }] }, 0)?.revision).toBe(1)
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 1 })).toMatchObject({ ok: true })
    expect(sharedModule.readCatalogState()?.products.find((product) => product.id === 'P-1')?.name).toBe('P1 审核资料')

    const currentP1 = sharedModule.readCatalogState()!.products.find((product) => product.id === 'P-1')!
    expect(await api.createCatalogProductSubmission(submission({ id: 'SUB-2', kind: 'update', draft: { ...currentP1, name: 'P1 二次审核' }, baseCatalogRevision: 2, submittedAt: '2026-08-31T10:00:00.000Z' }), 2)).toMatchObject({ ok: true })
    expect(sharedModule.saveCatalogProduct({ ...currentP1, name: 'P1 外部已修改' }, 2)?.revision).toBe(3)
    expect(await api.approveCatalogProductSubmission({ submissionId: 'SUB-2', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T11:00:00.000Z', expectedSubmissionRevision: 3, expectedCatalogRevision: 3 })).toMatchObject({ ok: false, code: 'catalog_conflict' })
    expect(sharedModule.readCatalogState()?.products.find((product) => product.id === 'P-1')?.name).toBe('P1 外部已修改')
  })

  it('queues recoverable review state when submission write and catalog rollback both fail', async () => {
    expect(api.createCatalogProductReviewRecoveryHandlerRegistration).toBeTypeOf('function')
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductReviewRecoveryHandlerRegistration || !api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    const formal = catalogProduct({ name: '恢复前资料' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ kind: 'update', draft: { ...formal, name: '待审核资料' } }), 0)).toMatchObject({ ok: true })

    const originalSetItem = localStorage.setItem.bind(localStorage)
    let catalogWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === sharedModule.PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY) throw new Error('submission unavailable')
      if (key === sharedModule.PLATFORM_CATALOG_STORAGE_KEY && ++catalogWrites > 1) throw new Error('catalog rollback unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    let result: Awaited<ReturnType<NonNullable<SharedFeatureApi['approveCatalogProductSubmission']>>>
    try {
      result = await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })
    } finally {
      localStorage.setItem = originalSetItem
    }

    if (!result) throw new Error('expected review result')
    expect(result).toMatchObject({ ok: false, code: 'recovery_queued', operationId: expect.any(String), failedStep: 'product-submission-review', recoveryQueued: true, fatal: false })
    const task = sharedModule.readPlatformRecoveryQueue().find((candidate) => candidate.operationId === result.operationId)
    expect(task).toMatchObject({ status: 'pending', handlerKey: 'catalog-product-review-v1' })
    expect(sharedModule.readCatalogState()?.products[0].name).toBe('待审核资料')
    expect(api.readCatalogProductSubmissionState?.()?.submissions[0]).toMatchObject({ status: 'pending' })

    const registration = api.createCatalogProductReviewRecoveryHandlerRegistration()
    const unregister = sharedModule.registerPlatformRecoveryHandler(registration.key, registration.handler)
    try {
      expect(await sharedModule.retryPlatformRecoveryTask(task!.id, 'admin-recovery')).toMatchObject({ ok: true })
    } finally {
      unregister()
    }
    expect(sharedModule.readCatalogState()?.products[0].name).toBe('恢复前资料')
    expect(sharedModule.readPlatformRecoveryQueue().find((candidate) => candidate.id === task!.id)).toMatchObject({ status: 'resolved' })
  })

  it('does not overwrite a third-party catalog snapshot when catalog apply loses CAS', async () => {
    expect(api.createCatalogProductReviewRecoveryHandlerRegistration).toBeTypeOf('function')
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductReviewRecoveryHandlerRegistration || !api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    const formal = catalogProduct({ name: '并发前资料' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ kind: 'update', draft: { ...formal, name: '待审核资料' } }), 0)).toMatchObject({ ok: true })
    const thirdPartyCatalog: CatalogState = { ...sharedModule.readCatalogState()!, revision: 1, products: [{ ...formal, name: '第三方目录资料' }] }

    const originalSetItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      originalSetItem(key, value)
      if (key === sharedModule.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && ++journalWrites === 1) {
        originalSetItem(sharedModule.PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify(thirdPartyCatalog))
      }
    }) as Storage['setItem']
    let result: Awaited<ReturnType<NonNullable<SharedFeatureApi['approveCatalogProductSubmission']>>> | undefined
    try {
      result = await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(result).toMatchObject({ ok: false, code: 'recovery_queued', failedStep: 'catalog-review', recoveryQueued: true })
    expect(sharedModule.readCatalogState()?.products[0].name).toBe('第三方目录资料')
    const task = sharedModule.readPlatformRecoveryQueue().find((candidate) => candidate.operationId === result?.operationId)
    expect(task).toMatchObject({ status: 'pending', handlerKey: 'catalog-product-review-v1' })

    const registration = api.createCatalogProductReviewRecoveryHandlerRegistration()
    const unregister = sharedModule.registerPlatformRecoveryHandler(registration.key, registration.handler)
    try {
      expect(await sharedModule.retryPlatformRecoveryTask(task!.id, 'admin-recovery')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      unregister()
    }
    expect(sharedModule.readCatalogState()?.products[0].name).toBe('第三方目录资料')
    expect(sharedModule.readPlatformRecoveryQueue().find((candidate) => candidate.id === task!.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('does not overwrite a third-party submission snapshot when submission apply loses CAS', async () => {
    expect(api.createCatalogProductSubmission).toBeTypeOf('function')
    expect(api.approveCatalogProductSubmission).toBeTypeOf('function')
    if (!api.createCatalogProductSubmission || !api.approveCatalogProductSubmission) return
    const formal = catalogProduct({ name: '正式资料' })
    expect(sharedModule.writeCatalogState({ schemaVersion: sharedModule.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    expect(await api.createCatalogProductSubmission(submission({ kind: 'update', draft: { ...formal, name: '待审核资料' } }), 0)).toMatchObject({ ok: true })
    const currentSubmissionState = api.readCatalogProductSubmissionState?.()
    const thirdPartySubmissionState = {
      ...currentSubmissionState,
      revision: 2,
      updatedAt: '2026-08-31T08:30:00.000Z',
      submissions: currentSubmissionState!.submissions.map((item) => ({ ...item, submittedBy: 'supplier-third-party' }))
    }

    const originalSetItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      originalSetItem(key, value)
      if (key === sharedModule.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && ++journalWrites === 2) {
        originalSetItem(sharedModule.PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, JSON.stringify(thirdPartySubmissionState))
      }
    }) as Storage['setItem']
    let result: Awaited<ReturnType<NonNullable<SharedFeatureApi['approveCatalogProductSubmission']>>> | undefined
    try {
      result = await api.approveCatalogProductSubmission({ submissionId: 'SUB-1', reviewedBy: 'admin-1', reviewedAt: '2026-08-31T09:00:00.000Z', expectedSubmissionRevision: 1, expectedCatalogRevision: 0 })
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(result).toMatchObject({ ok: false, code: 'recovery_queued', failedStep: 'product-submission-review', recoveryQueued: true })
    expect(sharedModule.readCatalogState()?.products[0].name).toBe('正式资料')
    expect(api.readCatalogProductSubmissionState?.()?.submissions[0]).toMatchObject({ status: 'pending', submittedBy: 'supplier-third-party' })
    expect(sharedModule.readPlatformRecoveryQueue().find((candidate) => candidate.operationId === result?.operationId)).toMatchObject({ status: 'pending', handlerKey: 'catalog-product-review-v1' })
  })
})

describe('driver scopes and daily delivery routes', () => {
  it('isolates driver scopes by supplier and driver while rejecting invalid or stale writes', () => {
    expect(api.readDriverStoreScopeState).toBeTypeOf('function')
    expect(api.readDriverStoreScopes).toBeTypeOf('function')
    expect(api.writeDriverStoreScopeState).toBeTypeOf('function')
    expect(api.saveDriverStoreScope).toBeTypeOf('function')
    if (!api.readDriverStoreScopeState || !api.readDriverStoreScopes || !api.writeDriverStoreScopeState || !api.saveDriverStoreScope) return
    localStorage.setItem(driverScopeKey, JSON.stringify({ schemaVersion: 1, revision: 1, scopes: [{ driverId: 'D-1', storeIds: ['STORE-1'], updatedAt: '2026-08-31T08:00:00.000Z' }], updatedAt: '2026-08-31T08:00:00.000Z' }))
    expect(api.readDriverStoreScopeState()).toBeNull()
    localStorage.clear()
    expect(api.saveDriverStoreScope({ supplierId: 'S-2', driverId: 'D-1', storeIds: ['STORE-9'], updatedAt: '2026-08-31T08:00:00.000Z' }, 0)).toMatchObject({ ok: true })
    expect(api.saveDriverStoreScope({ supplierId: 'S-1', driverId: 'D-1', storeIds: ['STORE-2', 'STORE-1', 'STORE-1'], updatedAt: '2026-08-31T08:01:00.000Z' }, 1)).toMatchObject({ ok: true })
    expect(api.saveDriverStoreScope({ supplierId: 'S-1', driverId: 'D-2', storeIds: ['STORE-3'], updatedAt: '2026-08-31T08:02:00.000Z' }, 2)).toMatchObject({ ok: true })
    expect(api.readDriverStoreScopeState()).toMatchObject({ revision: 3, scopes: [
      { supplierId: 'S-1', driverId: 'D-1', storeIds: ['STORE-1', 'STORE-2'] },
      { supplierId: 'S-1', driverId: 'D-2', storeIds: ['STORE-3'] },
      { supplierId: 'S-2', driverId: 'D-1', storeIds: ['STORE-9'] }
    ] })
    expect(api.readDriverStoreScopes('S-1').map((scope) => scope.driverId)).toEqual(['D-1', 'D-2'])
    expect(api.readDriverStoreScopes('S-1', 'D-1')[0].storeIds).toEqual(['STORE-1', 'STORE-2'])
    expect(api.readDriverStoreScopes('S-2', 'D-1')[0].storeIds).toEqual(['STORE-9'])
    expect(api.saveDriverStoreScope({ supplierId: 'S-1', driverId: 'D-1', storeIds: ['STORE-4'], updatedAt: '2026-08-31T09:00:00.000Z' }, 2)).toMatchObject({ ok: false, code: 'revision_conflict' })
  })

  it('isolates daily routes by supplier and driver while rejecting invalid or stale writes', () => {
    expect(api.readDailyDeliveryRouteState).toBeTypeOf('function')
    expect(api.readDailyDeliveryRoutes).toBeTypeOf('function')
    expect(api.writeDailyDeliveryRouteState).toBeTypeOf('function')
    expect(api.saveDailyDeliveryRoute).toBeTypeOf('function')
    if (!api.readDailyDeliveryRouteState || !api.readDailyDeliveryRoutes || !api.writeDailyDeliveryRouteState || !api.saveDailyDeliveryRoute) return
    localStorage.setItem(dailyRouteKey, JSON.stringify({ schemaVersion: 1, revision: 1, routes: [{ id: 'ROUTE-BAD', supplierId: 'S-1', deliveryDate: '2026-08-31', status: 'draft', stops: [], totalDistanceKm: 0, estimatedDurationMinutes: 0, sourceOrderIds: [], provider: 'mock-route-optimization', generatedAt: '2026-08-31T08:00:00.000Z' }], updatedAt: '2026-08-31T08:00:00.000Z' }))
    expect(api.readDailyDeliveryRouteState()).toBeNull()
    localStorage.clear()
    const route = {
      id: 'ROUTE-1', supplierId: 'S-1', driverId: 'D-1', deliveryDate: '2026-08-31', status: 'draft', stops: [], totalDistanceKm: 0,
      estimatedDurationMinutes: 0, sourceOrderIds: [], provider: 'mock-route-optimization', generatedAt: '2026-08-31T08:00:00.000Z'
    }
    expect(api.saveDailyDeliveryRoute(route, 0)).toMatchObject({ ok: true })
    expect(api.saveDailyDeliveryRoute({ ...route, id: 'ROUTE-2', driverId: 'D-2', generatedAt: '2026-08-31T08:01:00.000Z' }, 1)).toMatchObject({ ok: true })
    expect(api.saveDailyDeliveryRoute({ ...route, id: 'ROUTE-3', supplierId: 'S-2', generatedAt: '2026-08-31T08:02:00.000Z' }, 2)).toMatchObject({ ok: true })
    const routeState = api.readDailyDeliveryRouteState()
    expect(routeState?.revision).toBe(3)
    expect(routeState?.routes[0]).toMatchObject({ id: 'ROUTE-1', supplierId: 'S-1', driverId: 'D-1', deliveryDate: '2026-08-31', status: 'draft', estimatedDurationMinutes: 0, sourceOrderIds: [] })
    expect(api.readDailyDeliveryRoutes('S-1').map((item) => item.id)).toEqual(['ROUTE-1', 'ROUTE-2'])
    expect(api.readDailyDeliveryRoutes('S-1', 'D-1').map((item) => item.id)).toEqual(['ROUTE-1'])
    expect(api.readDailyDeliveryRoutes('S-1', 'D-2').map((item) => item.id)).toEqual(['ROUTE-2'])
    expect(api.readDailyDeliveryRoutes('S-2', 'D-1').map((item) => item.id)).toEqual(['ROUTE-3'])
    expect(api.saveDailyDeliveryRoute({ ...route, status: 'published', publishedAt: '2026-08-31T09:00:00.000Z' }, 0)).toMatchObject({ ok: false, code: 'revision_conflict' })
  })
})

describe('route-stop merge', () => {
  it('merges orders by store with stable order and retains an available coordinate', () => {
    expect(api.mergeDeliveryOrdersByStore).toBeTypeOf('function')
    if (!api.mergeDeliveryOrdersByStore) return
    const stops = api.mergeDeliveryOrdersByStore([
      { orderId: 'O-2', storeId: 'STORE-B', storeName: 'B', address: 'B road' },
      { orderId: 'O-3', storeId: 'STORE-A', storeName: 'A', address: 'A road', longitude: 2, latitude: 1 },
      { orderId: 'O-1', storeId: 'STORE-B', storeName: 'B', address: 'B road', longitude: 1, latitude: 1 }
    ])
    expect(stops).toEqual([
      { storeId: 'STORE-A', storeName: 'A', address: 'A road', longitude: 2, latitude: 1, orderIds: ['O-3'] },
      { storeId: 'STORE-B', storeName: 'B', address: 'B road', longitude: 1, latitude: 1, orderIds: ['O-1', 'O-2'] }
    ])
  })
})
