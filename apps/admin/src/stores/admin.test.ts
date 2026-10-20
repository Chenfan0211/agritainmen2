import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import type { AdminRole, CatalogProduct, COrder, GeocodeResult } from '@agritainment/shared'
import { ADMIN_SUPER_ROLE_ID, PLATFORM_ADMIN_ROLES_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, acceptSupplierOrder, addDictItem, afterSales, categories, cloneSeed, configurePlatformProviders, defaultAdminAccounts, defaultAdminRoles, enqueuePlatformRecovery, farms, mergePlatformOrders, orders, pendingShareAmount, preparePlatformJournal, products, promoters, publishCSubOrderToSupplier, publishPlatformDictionaries, readCCommissionRecords, readCOrders, readCatalogState, readPlatformAdminAccounts, readPlatformAdminRoles, readPlatformAfterSales, readPlatformAuditLogs, readPlatformCommissionRules, readPlatformCommissionSettlement, readPlatformCommissionSettlementRecords, readPlatformCommissionSettlements, readPlatformDictionaries, readPlatformJournal, readPlatformOrders, readPlatformRecoveryQueue, readPlatformSupplierAccounts, readPlatformSupplierSettlements, readPricingDefaults, readShareConfig, readShareRecords, resolvePlatformJournal, retryPlatformRecoveryTask, shipSupplierCourier, suppliers, writeCCommissionRecords, writeCOrders, writeCatalogState, writePlatformAdminAccounts, writePlatformAdminRoles, writePlatformAfterSale, writePlatformAfterSales, writePlatformCommissionRules, writePlatformCommissionSettlementRecords, writePlatformCommissionSettlements, writePlatformEntities, writePlatformOrder, writePlatformOrders, writePlatformSupplierSettlements, writePricingDefaults, writeShareRecords, readPlatformWithdrawals, writePlatformWithdrawal } from '@agritainment/shared'
import { readPlatformEntities } from '@agritainment/shared'
import { useAdminStore } from './admin'
import * as adminStoreModule from './admin'
import * as shared from '@agritainment/shared'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

afterEach(() => {
  vi.restoreAllMocks()
  configurePlatformProviders()
})


describe('admin store interactions', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    configurePlatformProviders()
    await useAdminStore().login('admin', '123456')
  })

  function seedShippedCMallOrder(suffix: string) {
    const item = { productId: `P-${suffix}`, skuId: `SKU-${suffix}`, name: '联调商品', skuName: '标准装', image: '/static/images/field.webp', quantity: 1, unitPrice: 100, basePrice: 75, level1Commission: 10, level2Commission: 15, supplierId: 'S002' }
    const sub = { id: `CSO-${suffix}`, supplierId: 'S002', supplierName: '湘西腊味合作社', items: [item], amount: 100, status: 'paid' as const, logistics: [] }
    const order: COrder = {
      id: `CO-${suffix}`, userId: `U-${suffix}`, level: 'normal',
      address: { id: `ADDR-${suffix}`, userId: `U-${suffix}`, receiver: '联调用户', phone: '13800000000', region: '湖南', detail: '联调地址', isDefault: true },
      amount: 100, items: [item], subOrders: [sub],
      commissionAllocations: [{ id: `CC-${suffix}`, orderId: `CO-${suffix}`, subOrderId: sub.id, beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 10, status: 'pending', createdAt: '2026-08-29T10:00:00.000Z' }],
      status: 'paid', createdAt: '2026-08-29T10:00:00.000Z', paidAt: '2026-08-29T10:01:00.000Z'
    }
    const published = publishCSubOrderToSupplier(order, sub)
    const accepted = acceptSupplierOrder(published, '供应商')!
    const shipped = shipSupplierCourier(accepted, `SF-${suffix}`, '供应商')!
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords(order.commissionAllocations)).toBe(true)
    expect(writePlatformOrder(shipped)).toBe(true)
    return { order, sub, shipped }
  }

  async function seedRefundPendingCMallOrder(suffix: string) {
    const store = useAdminStore()
    await store.initialize()
    const catalog = cloneSeed(readCatalogState()!)
    const product = catalog.products[0]
    const sku = product.skus[0]
    const supplierId = product.supplierId || 'S002'
    const item = {
      productId: product.id, skuId: sku.id, name: product.name, skuName: sku.name,
      image: typeof product.image === 'string' ? product.image : '/static/images/field.webp', quantity: 2,
      unitPrice: sku.retailPrice, basePrice: sku.cost, level1Commission: 10, level2Commission: 0, supplierId
    }
    const sub = {
      id: `CSO-${suffix}`, supplierId, supplierName: product.supplierName,
      items: [item], amount: sku.retailPrice * 2, status: 'after_sale' as const, logistics: [], inventoryReleased: false,
      afterSale: { id: `CAS-${suffix}`, reason: '质量问题', status: 'processing' as const, createdAt: '2026-08-30T10:00:00.000Z' }
    }
    const commission = { id: `CC-${suffix}`, orderId: `CO-${suffix}`, subOrderId: sub.id, beneficiaryId: 'T001', beneficiaryLevel: 'level1' as const, amount: 10, status: 'available' as const, createdAt: '2026-08-30T09:00:00.000Z' }
    const order: COrder = {
      id: `CO-${suffix}`, userId: `U-${suffix}`, level: 'normal',
      address: { id: `ADDR-${suffix}`, userId: `U-${suffix}`, receiver: '退款用户', phone: '13800000000', region: '湖南', detail: '退款地址', isDefault: true },
      amount: sub.amount, items: [item], subOrders: [sub], commissionAllocations: [commission], status: 'after_sale',
      createdAt: '2026-08-30T09:00:00.000Z', paidAt: '2026-08-30T09:01:00.000Z', providerTransactionId: `PAY-${suffix}`
    }
    const supplierOrder = { ...publishCSubOrderToSupplier(order, sub), status: 'after-sale' as const }
    const work = {
      id: `AS-${suffix}`, orderId: order.id, masterOrderId: order.id, subOrderId: sub.id, supplierOrderId: supplierOrder.id,
      operationId: `after-sale:${sub.id}`, productName: product.name, applicant: '退款用户', type: 'refund' as const,
      amount: sub.amount, refundAmount: sub.amount, status: 'refund-pending' as const, issue: '质量问题'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    expect(writeCCommissionRecords([commission])).toBe(true)
    expect(writePlatformOrders({ [supplierOrder.id]: supplierOrder })).toBe(true)
    expect(writePlatformAfterSales({ [work.id]: work })).toBe(true)
    store.afterSales = [work]
    store.orders = [supplierOrder]
    return { store, catalog, product, sku, order, sub, commission, supplierOrder, work }
  }

  it('registers shared user payment and package recovery handlers on admin startup', async () => {
    const store = useAdminStore()
    await store.initialize()
    const cases = [
      { operationId: 'payment:CO-ADMIN-RECOVERY', key: 'user-payment-v1', schema: 'user-payment-snapshot-v1', variant: 'payment', collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY] },
      { operationId: 'package-payment:VO-ADMIN-RECOVERY', key: 'user-package-v1', schema: 'user-package-snapshot-v1', variant: 'package', collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY] }
    ]
    for (const item of cases) {
      const snapshot = item.variant === 'payment'
        ? { variant: item.variant, ownerUserId: 'U-ADMIN-RECOVERY', orders: {}, supplierOrders: {}, ledger: {} }
        : { variant: item.variant, ownerUserId: 'U-ADMIN-RECOVERY', catalog: { schemaVersion: 2, revision: 0, products: [], appliedOperations: {} }, vouchers: {}, ledger: {} }
      expect(preparePlatformJournal({ operationId: item.operationId, collections: item.collections, original: snapshot, target: snapshot, recoveryHandlerKey: item.key, recoverySchema: item.schema })).toBe(true)
      expect(resolvePlatformJournal(item.operationId, 'recovery-pending')).toBe(true)
      expect(enqueuePlatformRecovery({ operationId: item.operationId, failedStep: 'test', reason: 'admin registration test', handlerKey: item.key })).toBe(true)
      const task = readPlatformRecoveryQueue().find((candidate) => candidate.operationId === item.operationId)!
      expect(await retryPlatformRecoveryTask(task.id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    }
  })

  it('queues a replayable sanitized failure audit when permission denial logging fails', async () => {
    const store = useAdminStore()
    store.auth.roleId = 'AR-NOT-SUPER'
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    const result = await store.executeAdminTransaction(null, {
      module: 'accounts', action: 'admin.account.secret-update', targetType: 'admin-account', targetId: '13800138000',
      requiresSuperAdmin: true, actor: { id: '13800138000', name: '11010519491231002X', role: 'operator' },
      metadata: { password: 'plain-secret', phone: '13800138000' }
    }, {
      operationId: 'OP-ADMIN-FAILURE-AUDIT-PERMISSION', collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: null, steps: []
    })

    expect(result).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: true })
    expect(store.error).toContain('失败审计待恢复')
    const task = readPlatformRecoveryQueue().find((candidate) => candidate.handlerKey === 'admin-failure-audit-v1')
    expect(task).toMatchObject({ failedStep: 'failure-audit', status: 'pending' })
    const journal = task ? readPlatformJournal()[task.operationId] : undefined
    expect(journal).toMatchObject({ recoveryHandlerKey: 'admin-failure-audit-v1', recoverySchema: 'admin-failure-audit-v1', status: 'recovery-pending' })
    expect(journal?.target).toMatchObject({
      module: 'accounts', action: 'admin.account.secret-update', actorId: '138****8000', actorName: '[REDACTED]',
      targetId: '138****8000', result: 'failure', reason: 'permission-denied', operationId: 'OP-ADMIN-FAILURE-AUDIT-PERMISSION'
    })
    expect(journal?.target).not.toHaveProperty('metadata')
    expect(JSON.stringify({ task, journal })).not.toContain('plain-secret')

    audit.mockRestore()
    expect(await retryPlatformRecoveryTask(task!.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: true })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'admin.account.secret-update', result: 'failure', reason: 'permission-denied' }))
  })

  it('queues failure audit recovery when validation logging fails', async () => {
    const store = useAdminStore()
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    const result = await store.executeAdminTransaction(null, {
      module: 'routes', action: 'route.create', validationMessage: '线路无效'
    }, {
      operationId: 'OP-ADMIN-FAILURE-AUDIT-VALIDATION', collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: null,
      validate: () => false, steps: []
    })

    expect(result).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: true })
    expect(readPlatformRecoveryQueue()).toContainEqual(expect.objectContaining({ handlerKey: 'admin-failure-audit-v1', failedStep: 'failure-audit' }))
    audit.mockRestore()
  })

  it('queues failure audit recovery when transaction failure logging fails', async () => {
    const store = useAdminStore()
    const collection = 'admin-failure-audit-business'
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    const result = await store.executeAdminTransaction(null, { module: 'routes', action: 'route.create' }, {
      operationId: 'OP-ADMIN-FAILURE-AUDIT-TRANSACTION', collections: [collection, PLATFORM_AUDIT_LOG_STORAGE_KEY], original: {}, target: {},
      revisionChecks: [
        { key: collection, expectedRevision: shared.readPlatformCollectionRevision(collection) },
        { key: PLATFORM_AUDIT_LOG_STORAGE_KEY, expectedRevision: shared.readPlatformCollectionRevision(PLATFORM_AUDIT_LOG_STORAGE_KEY) }
      ],
      steps: [{ key: collection, apply: () => false, rollback: () => true }]
    })

    expect(result).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: true })
    expect(readPlatformRecoveryQueue()).toContainEqual(expect.objectContaining({ handlerKey: 'admin-failure-audit-v1', failedStep: 'failure-audit' }))
    audit.mockRestore()
  })

  it('returns fatal audit_recovery_required when the failure audit recovery queue cannot be saved', async () => {
    const store = useAdminStore()
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)
    const queue = vi.spyOn(shared, 'enqueuePlatformRecovery').mockReturnValue(false)

    const result = await store.executeAdminTransaction(null, { module: 'routes', action: 'route.create' }, {
      operationId: 'OP-ADMIN-FAILURE-AUDIT-FATAL', collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: null,
      validate: () => false, steps: []
    })

    expect(result).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: false, fatal: true })
    expect(store.error).toContain('失败审计待恢复')
    audit.mockRestore()
    queue.mockRestore()
  })

  it('reconciles and replays a failure audit journal left behind by a queue write failure', async () => {
    const store = useAdminStore()
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)
    const queue = vi.spyOn(shared, 'enqueuePlatformRecovery').mockReturnValueOnce(false)

    const result = await store.executeAdminTransaction(null, { module: 'routes', action: 'route.disaster-recovery' }, {
      operationId: 'OP-ADMIN-FAILURE-AUDIT-RECONCILE', collections: [PLATFORM_AUDIT_LOG_STORAGE_KEY], original: null, target: null,
      validate: () => false, steps: []
    })

    expect(result).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: false, fatal: true })
    expect(readPlatformJournal()['OP-ADMIN-FAILURE-AUDIT-RECONCILE:failure-audit']).toMatchObject({ status: 'recovery-pending', recoveryHandlerKey: 'admin-failure-audit-v1' })
    expect(readPlatformRecoveryQueue()).not.toContainEqual(expect.objectContaining({ operationId: 'OP-ADMIN-FAILURE-AUDIT-RECONCILE:failure-audit' }))

    audit.mockRestore()
    queue.mockRestore()
    await store.initialize(true)
    const task = readPlatformRecoveryQueue().find((candidate) => candidate.operationId === 'OP-ADMIN-FAILURE-AUDIT-RECONCILE:failure-audit')
    expect(task).toMatchObject({ status: 'pending', handlerKey: 'admin-failure-audit-v1' })
    expect(await retryPlatformRecoveryTask(task!.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: true })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'route.disaster-recovery', result: 'failure', reason: 'validation-failed' }))
  })

  it('queues failure-audit recovery for high-risk early return branches', async () => {
    const store = useAdminStore()
    const fixture = await seedRefundPendingCMallOrder('EARLY-AUDIT-RECOVERY')
    configurePlatformProviders({ refund: { refundPayment: vi.fn().mockResolvedValue({ ok: true, value: {} }) } })
    store.auth.roleId = 'AR-VIEWER'
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    const approval = await store.approveCatalogProductSubmission('SUB-MISSING')
    expect(approval).toMatchObject({ ok: false, code: 'audit_recovery_required', recoveryQueued: true })
    expect(await store.updateAdminRolePermissions('AR-VIEWER', { menuPermissions: ['dashboard'], actionPermissions: [] })).toEqual({ ok: false, error: '操作失败，失败审计待恢复' })

    store.auth.roleId = ADMIN_SUPER_ROLE_ID
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(fixture.store.error).toBe('操作失败，失败审计待恢复')

    setActivePinia(createPinia())
    const loginStore = useAdminStore()
    expect(await loginStore.login('missing-account', 'wrong-password')).toBe(false)
    expect(loginStore.error).toBe('操作失败，失败审计待恢复')

    const actions = readPlatformRecoveryQueue()
      .filter((task) => task.handlerKey === 'admin-failure-audit-v1')
      .map((task) => readPlatformJournal()[task.operationId]?.target)
      .map((target) => (target as { action?: string })?.action)
    expect(actions).toEqual(expect.arrayContaining([
      'product.audit.approve', 'admin.role.permissions', 'after-sale.refund', 'admin.login'
    ]))
    audit.mockRestore()
  })

  it('uses the refund provider once and atomically completes a linked C-MALL refund', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-SUCCESS')
    const refundPayment = vi.fn().mockResolvedValue({ ok: true, value: { refundId: 'RF-SUCCESS' } })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(refundPayment).toHaveBeenCalledWith({ transactionId: fixture.order.providerTransactionId, amount: fixture.work.refundAmount, operationId: `refund:${fixture.work.operationId}` })
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-SUCCESS' })
    expect(readPlatformAfterSales()?.[fixture.work.id].failureReason).toBeUndefined()
    expect(readCOrders()?.[fixture.order.id].subOrders[0]).toMatchObject({ inventoryReleased: true, afterSale: { status: 'completed' } })
    expect(readCCommissionRecords()).toContainEqual(expect.objectContaining({ id: fixture.commission.id, status: 'reversed' }))
    expect(readCatalogState()?.products.find((item) => item.id === fixture.product.id)?.skus.find((item) => item.id === fixture.sku.id)?.stock).toBe(fixture.sku.stock + fixture.sub.items[0].quantity)
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'after-sale.refund', result: 'success', targetId: fixture.work.id }))

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)
    expect(refundPayment).toHaveBeenCalledTimes(1)
    expect(fixture.store.error).toBe('')
    expect(readCatalogState()?.products.find((item) => item.id === fixture.product.id)?.skus.find((item) => item.id === fixture.sku.id)?.stock).toBe(fixture.sku.stock + fixture.sub.items[0].quantity)
  })

  it('persists a provider rejection as refund-failed without changing linked financial snapshots', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-FAILED')
    const originalCatalog = cloneSeed(readCatalogState())
    const originalOrders = cloneSeed(readCOrders())
    const originalSupplierOrders = cloneSeed(readPlatformOrders())
    const originalCommissions = cloneSeed(readCCommissionRecords())
    configurePlatformProviders({ refund: { refundPayment: vi.fn().mockResolvedValue({ ok: false, code: 'declined', message: '原支付渠道拒绝退款' }) } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refund-failed', failureReason: '原支付渠道拒绝退款' })
    expect(readCatalogState()).toEqual(originalCatalog)
    expect(readCOrders()).toEqual(originalOrders)
    expect(readPlatformOrders()).toEqual(originalSupplierOrders)
    expect(readCCommissionRecords()).toEqual(originalCommissions)
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'after-sale.refund', result: 'failure', reason: 'provider:declined' }))
  })

  it('starts a new provider attempt after an explicit rejection', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-DECLINED-RETRY')
    const operationIds: string[] = []
    const results = new Map<string, { ok: false; code: string; message: string } | { ok: true; value: { refundId: string } }>()
    const refundPayment = vi.fn(async (input: { operationId?: string }) => {
      const id = input.operationId || ''
      operationIds.push(id)
      if (!results.has(id)) results.set(id, results.size === 0
        ? { ok: false, code: 'declined', message: '原支付渠道拒绝退款' }
        : { ok: true, value: { refundId: 'RF-DECLINED-RETRY' } })
      return results.get(id)!
    })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refund-failed', failureReason: '原支付渠道拒绝退款' })
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(operationIds[0]).toBe(`refund:${fixture.work.operationId}`)
    expect(operationIds[1]).toMatch(new RegExp(`^refund:${fixture.work.operationId}:attempt:\\d+$`))
    expect(operationIds[1]).not.toBe(operationIds[0])
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-DECLINED-RETRY' })
    expect(readPlatformAfterSales()?.[fixture.work.id].failureReason).toBeUndefined()
  })

  it('persists the latest reason when a new refund attempt is rejected again', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-DECLINED-TWICE')
    const operationIds: string[] = []
    const results = new Map<string, { ok: false; code: string; message: string }>()
    const refundPayment = vi.fn(async (input: { operationId?: string }) => {
      const id = input.operationId || ''
      operationIds.push(id)
      if (!results.has(id)) results.set(id, results.size === 0
        ? { ok: false, code: 'declined', message: '原支付渠道拒绝退款' }
        : { ok: false, code: 'timeout', message: '退款渠道暂时不可用' })
      return results.get(id)!
    })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(operationIds[0]).toBe(`refund:${fixture.work.operationId}`)
    expect(operationIds[1]).toMatch(new RegExp(`^refund:${fixture.work.operationId}:attempt:\\d+$`))
    expect(operationIds[1]).not.toBe(operationIds[0])
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refund-failed', failureReason: '退款渠道暂时不可用' })
    expect(readPlatformAfterSales()?.[fixture.work.id].history?.at(-1)?.action).toBe('退款失败：退款渠道暂时不可用')
  })

  it('keeps a local revision conflict visible when persisting a provider rejection', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-DECLINED-CONFLICT')
    const concurrentWork = { ...fixture.work, id: 'AS-REFUND-DECLINED-CONCURRENT', issue: '退款请求期间新增' }
    configurePlatformProviders({ refund: { refundPayment: vi.fn(async () => {
      expect(writePlatformAfterSales({ ...readPlatformAfterSales(), [concurrentWork.id]: concurrentWork })).toBe(true)
      return { ok: false as const, code: 'declined', message: '原支付渠道拒绝退款' }
    }) } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(fixture.store.error).toBe('数据已更新，请刷新后重试')
    expect(readPlatformAfterSales()?.[fixture.work.id].status).toBe('refund-pending')
    expect(readPlatformAfterSales()?.[concurrentWork.id]).toEqual(concurrentWork)
  })

  it('reuses the stable refund operation after an unknown provider result and accepts the later receipt once', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-RETRY')
    const operationIds: string[] = []
    const refundPayment = vi.fn(async (input: { operationId?: string }) => {
      operationIds.push(input.operationId || '')
      if (operationIds.length === 1) throw new Error('response lost')
      return { ok: true as const, value: { refundId: 'RF-RETRY' } }
    })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(readPlatformAfterSales()?.[fixture.work.id].status).toBe('refund-pending')
    expect(fixture.store.error).toBe('退款结果待确认，请重试查询')
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(operationIds).toEqual([`refund:${fixture.work.operationId}`, `refund:${fixture.work.operationId}`])
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-RETRY' })
  })

  it('keeps a rejected refund attempt id stable while an unknown result is reconciled after unrelated writes', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-FAILED-UNKNOWN-RETRY')
    const operationIds: string[] = []
    const refundPayment = vi.fn(async (input: { operationId?: string }) => {
      const operationId = input.operationId || ''
      operationIds.push(operationId)
      if (operationIds.length === 1) return { ok: false as const, code: 'declined', message: '原支付渠道拒绝退款' }
      if (operationIds.length === 2) {
        const concurrentWork = { ...fixture.work, id: 'AS-REFUND-UNKNOWN-CONCURRENT', issue: '未知结果期间新增' }
        expect(writePlatformAfterSales({ ...readPlatformAfterSales(), [concurrentWork.id]: concurrentWork })).toBe(true)
        throw new Error('response lost')
      }
      return { ok: true as const, value: { refundId: 'RF-FAILED-UNKNOWN-RETRY' } }
    })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)
    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(operationIds[1]).toMatch(new RegExp(`^refund:${fixture.work.operationId}:attempt:\\d+$`))
    expect(operationIds[2]).toBe(operationIds[1])
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-FAILED-UNKNOWN-RETRY' })
  })

  it('does not call the refund provider when a linked SKU is missing', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-SKU-MISSING')
    const cOrders = cloneSeed(readCOrders()!)
    cOrders[fixture.order.id].subOrders[0].items[0].skuId = 'SKU-NOT-FOUND'
    expect(writeCOrders(cOrders)).toBe(true)
    const refundPayment = vi.fn().mockResolvedValue({ ok: true, value: { refundId: 'RF-MUST-NOT-RUN' } })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(refundPayment).not.toHaveBeenCalled()
    expect(fixture.store.error).toBe('退款库存关联缺失，请在恢复中心核验')
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'after-sale.refund', result: 'failure', reason: 'validation-failed' }))
  })

  it('persists a successful provider receipt after a concurrent update and recovers without overwriting it', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-CONCURRENT')
    let settleProvider!: (value: { ok: true; value: { refundId: string } }) => void
    const refundPayment = vi.fn(() => new Promise<{ ok: true; value: { refundId: string } }>((resolve) => { settleProvider = resolve }))
    configurePlatformProviders({ refund: { refundPayment } })

    const refund = fixture.store.refundAfterSale(fixture.work.id)
    expect(refundPayment).toHaveBeenCalledTimes(1)
    const concurrentWork = { ...fixture.work, id: 'AS-CONCURRENT-KEEP', issue: '等待退款期间新增的售后' }
    expect(writePlatformAfterSales({ ...readPlatformAfterSales(), [concurrentWork.id]: concurrentWork })).toBe(true)
    settleProvider({ ok: true, value: { refundId: 'RF-CONCURRENT' } })

    expect(await refund).toBe(false)
    expect(readPlatformAfterSales()?.[concurrentWork.id]).toEqual(concurrentWork)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === `refund:${fixture.work.operationId}` && item.status === 'pending')
    expect(task).toMatchObject({ failedStep: 'provider-receipt', handlerKey: 'admin-after-sale-v1' })
    expect(readPlatformJournal()[task!.operationId]).toMatchObject({
      status: 'committed',
      recoverySchema: 'admin-after-sale-refund-receipt-v1',
      original: { receipt: { operationId: `refund:${fixture.work.operationId}`, refundId: 'RF-CONCURRENT' } },
      target: { receipt: { operationId: `refund:${fixture.work.operationId}`, refundId: 'RF-CONCURRENT' } }
    })

    expect(await retryPlatformRecoveryTask(task!.id, 'recovery-admin')).toMatchObject({ ok: true })
    expect(readPlatformAfterSales()?.[concurrentWork.id]).toEqual(concurrentWork)
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-CONCURRENT' })
    expect(readCatalogState()?.products.find((item) => item.id === fixture.product.id)?.skus.find((item) => item.id === fixture.sku.id)?.stock).toBe(fixture.sku.stock + fixture.sub.items[0].quantity)
    expect(refundPayment).toHaveBeenCalledTimes(1)
  })

  it('reconciles a pending refund receipt on the second store call without calling the provider again', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-RECEIPT-RETRY')
    let settleProvider!: (value: { ok: true; value: { refundId: string } }) => void
    const refundPayment = vi.fn(() => new Promise<{ ok: true; value: { refundId: string } }>((resolve) => { settleProvider = resolve }))
    configurePlatformProviders({ refund: { refundPayment } })

    const first = fixture.store.refundAfterSale(fixture.work.id)
    const concurrentWork = { ...fixture.work, id: 'AS-RECEIPT-RETRY-KEEP', issue: '退款回执等待期间新增' }
    expect(writePlatformAfterSales({ ...readPlatformAfterSales(), [concurrentWork.id]: concurrentWork })).toBe(true)
    settleProvider({ ok: true, value: { refundId: 'RF-RECEIPT-RETRY' } })
    expect(await first).toBe(false)

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(refundPayment).toHaveBeenCalledTimes(1)
    expect(readPlatformAfterSales()?.[concurrentWork.id]).toEqual(concurrentWork)
    expect(readPlatformAfterSales()?.[fixture.work.id]).toMatchObject({ status: 'refunded', providerRefundId: 'RF-RECEIPT-RETRY' })
    expect(readPlatformRecoveryQueue().find((item) => item.operationId === `refund:${fixture.work.operationId}`)).toMatchObject({ status: 'resolved', retryCount: 1 })
  })

  it('blocks the provider when any same-operation journal has a malformed refund receipt shape', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-MALFORMED-JOURNAL')
    const operationId = `refund:${fixture.work.operationId}`
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { afterSales: readPlatformAfterSales(), auditAction: 'after-sale.refund' },
      target: { afterSales: readPlatformAfterSales(), auditAction: 'after-sale.refund' },
      recoveryHandlerKey: 'admin-after-sale-v1', recoverySchema: 'admin-after-sale-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    const refundPayment = vi.fn().mockResolvedValue({ ok: true, value: { refundId: 'RF-MUST-NOT-RUN' } })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(refundPayment).not.toHaveBeenCalled()
    expect(fixture.store.error).toBe('退款回执恢复任务异常，请在恢复中心核验')
    expect(readPlatformAfterSales()?.[fixture.work.id].status).toBe('refund-pending')
  })

  it('blocks the provider when an orphan resolved recovery task exists for the refund operation', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-ORPHAN-RESOLVED-TASK')
    const operationId = `refund:${fixture.work.operationId}`
    localStorage.setItem(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, JSON.stringify([{
      id: 'REC-REFUND-ORPHAN-RESOLVED', operationId, failedStep: 'provider-receipt',
      reason: 'refund receipt recovery was resolved without its journal', handlerKey: 'admin-after-sale-v1',
      retryCount: 1, createdAt: '2026-08-30T10:00:00.000Z', status: 'resolved',
      resolvedAt: '2026-08-30T10:01:00.000Z', resolvedBy: 'recovery-admin'
    }]))
    expect(readPlatformJournal()[operationId]).toBeUndefined()
    const refundPayment = vi.fn().mockResolvedValue({ ok: true, value: { refundId: 'RF-MUST-NOT-RUN' } })
    configurePlatformProviders({ refund: { refundPayment } })

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(false)

    expect(fixture.store.error).toBe('退款回执恢复任务异常，请在恢复中心核验')
    expect(refundPayment).toHaveBeenCalledTimes(0)
    expect(readPlatformAfterSales()?.[fixture.work.id].status).toBe('refund-pending')
  })

  it('does not skip a pending receipt recovery when the after-sale record is already refunded', async () => {
    const fixture = await seedRefundPendingCMallOrder('REFUND-LOCALLY-REFUNDED')
    let settleProvider!: (value: { ok: true; value: { refundId: string } }) => void
    const refundPayment = vi.fn(() => new Promise<{ ok: true; value: { refundId: string } }>((resolve) => { settleProvider = resolve }))
    configurePlatformProviders({ refund: { refundPayment } })
    const first = fixture.store.refundAfterSale(fixture.work.id)
    const concurrentWork = { ...fixture.work, id: 'AS-LOCALLY-REFUNDED-KEEP', issue: '回执生成前并发新增' }
    expect(writePlatformAfterSales({ ...readPlatformAfterSales(), [concurrentWork.id]: concurrentWork })).toBe(true)
    settleProvider({ ok: true, value: { refundId: 'RF-LOCALLY-REFUNDED' } })
    expect(await first).toBe(false)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === `refund:${fixture.work.operationId}`)!
    const queue = readPlatformRecoveryQueue().map((item) => item.id === task.id ? { ...item, failedStep: 'catalog' } : item)
    localStorage.setItem(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, JSON.stringify(queue))
    const receiptTarget = readPlatformJournal()[task.operationId].target as { afterSales: Record<string, typeof fixture.work> }
    expect(writePlatformAfterSales(receiptTarget.afterSales)).toBe(true)

    expect(await fixture.store.refundAfterSale(fixture.work.id)).toBe(true)

    expect(refundPayment).toHaveBeenCalledTimes(1)
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'resolved', retryCount: 1 })
    expect(readCOrders()?.[fixture.order.id].subOrders[0]).toMatchObject({ inventoryReleased: true })
    expect(readPlatformAfterSales()?.[concurrentWork.id]).toEqual(concurrentWork)
  })

  it('rolls back a direct category write when its transaction success audit fails', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = cloneSeed(readPlatformEntities())
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.addCategory('事务审计品类', 'product')).toBe(false)

    expect(readPlatformEntities()).toEqual(before)
    expect(store.categories.some((item) => item.name === '事务审计品类')).toBe(false)
    audit.mockRestore()
  })

  it('rolls back a dictionary write when its transaction success audit fails', async () => {
    const store = useAdminStore()
    await store.initialize()
    const beforePersisted = cloneSeed(readPlatformDictionaries())
    const beforeGroups = cloneSeed(store.dictGroups)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.addDictGroup({ type: 'auditRollbackDictionary', name: '审计回滚字典' })).toBe(false)

    expect(readPlatformDictionaries()).toEqual(beforePersisted)
    expect(store.dictGroups).toEqual(beforeGroups)
    audit.mockRestore()
  })

  it('rolls back a store account write when its transaction success audit fails', async () => {
    const store = useAdminStore()
    store.storeAccounts = []
    const beforePersisted = cloneSeed(shared.readPlatformStoreAccounts())
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.addStoreAccount({ farmId: 'F001', name: '审计回滚店员', account: '13900008881', password: '123456', role: 'staff' })).toBe(false)

    expect(shared.readPlatformStoreAccounts()).toEqual(beforePersisted)
    expect(store.storeAccounts).toEqual([])
    audit.mockRestore()
  })

  it('rolls back farm media and entity writes when its transaction success audit fails', async () => {
    const store = useAdminStore()
    await store.initialize()
    const beforeEntities = cloneSeed(shared.readPlatformEntities())
    const beforeMedia = cloneSeed(shared.readPlatformMedia())
    const beforeFarms = cloneSeed(store.farms)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })

    expect(await store.addFarm({ name: '审计回滚门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区测试路1号' }, geocode)).toBe(false)

    expect(shared.readPlatformEntities()).toEqual(beforeEntities)
    expect(shared.readPlatformMedia()).toEqual(beforeMedia)
    expect(store.farms).toEqual(beforeFarms)
    audit.mockRestore()
  })

  it('rolls back promoter entity and account writes when its transaction success audit fails', async () => {
    const store = useAdminStore()
    await store.initialize()
    const beforeEntities = cloneSeed(shared.readPlatformEntities())
    const beforeAccounts = cloneSeed(shared.readPlatformPromoterAccounts())
    const beforePromoters = cloneSeed(store.promoters)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.addPromoter({ name: '审计回滚推客', level: '普通推客', type: '推客', status: 'active' })).toBe(false)

    expect(shared.readPlatformEntities()).toEqual(beforeEntities)
    expect(shared.readPlatformPromoterAccounts()).toEqual(beforeAccounts)
    expect(store.promoters).toEqual(beforePromoters)
    audit.mockRestore()
  })

  it('exposes every remaining admin business write as an async transaction boundary', async () => {
    const store = useAdminStore()
    await store.initialize()
    const calls: Array<[string, unknown]> = [
      ['saveCatalogProduct', store.saveCatalogProduct(cloneSeed(store.catalogProducts[0]))],
      ['toggleCatalogProduct', store.toggleCatalogProduct('MISSING-PRODUCT')],
      ['inviteSupplier', store.inviteSupplier({ name: '', category: '', contactPhone: '' })],
      ['updateSupplier', store.updateSupplier('MISSING-SUPPLIER', { name: '', category: '' })],
      ['auditSupplier', store.auditSupplier('MISSING-SUPPLIER', true)],
      ['restoreSupplierPending', store.restoreSupplierPending('MISSING-SUPPLIER')],
      ['pauseSupplier', store.pauseSupplier('MISSING-SUPPLIER', '')],
      ['resumeSupplier', store.resumeSupplier('MISSING-SUPPLIER')],
      ['updateSupplierAccount', store.updateSupplierAccount('MISSING-SUPPLIER', {})],
      ['shipOrder', store.shipOrder('MISSING-ORDER')],
      ['confirmOrder', store.confirmOrder('MISSING-ORDER')],
      ['saveShareConfig', store.saveShareConfig(readShareConfig())],
      ['reviewWithdrawal', store.reviewWithdrawal('MISSING-WITHDRAWAL', 'approved')],
      ['recordExport', store.recordExport('异步契约', 0)],
      ['recordAuditExport', store.recordAuditExport('异步契约', 0)],
      ['updateAdminRole', store.updateAdminRole('MISSING-ROLE', {})],
      ['createAdminAccount', store.createAdminAccount({ account: '', password: '', name: '', roleId: '' })],
      ['updateAdminAccount', store.updateAdminAccount('MISSING-ACCOUNT', {})],
      ['setAdminAccountEnabled', store.setAdminAccountEnabled('MISSING-ACCOUNT', false)],
      ['login', store.login('missing-account', 'wrong-password')]
    ]
    const pending = calls.filter(([, result]) => result instanceof Promise).map(([, result]) => result as Promise<unknown>)
    await Promise.allSettled(pending)
    expect(calls.filter(([, result]) => !(result instanceof Promise)).map(([name]) => name)).toEqual([])
  })

  it('新增推客写入共享主数据，供推客端同步', async () => {
    const store = useAdminStore()
    const ok = await store.addPromoter({ name: '共享推客', level: '普通推客', type: '推客', status: 'active' })
    expect(ok).toBe(true)
    const created = store.promoters[0]
    expect(readPlatformEntities()?.promoters?.[created.id]).toMatchObject({ id: created.id, name: '共享推客' })
  })

  it('待办总数包含待发货、提现审核和恢复任务且不依赖硬编码', async () => {
    const store = useAdminStore()
    store.$patch({ suppliers: [], products: [], afterSales: [], orders: [{ id: 'O1', status: 'pending', amount: 1 } as any] })
    writePlatformWithdrawal({ id: 'W1', requesterType: 'user', requesterId: 'U1', amount: 1, method: '微信', status: 'pending', requestKey: 'rk', createdAt: new Date().toISOString() })
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'R1', operationId: 'OP1', failedStep: 'x', reason: 'x', createdAt: new Date().toISOString(), status: 'pending' }]))
    expect(store.pendingTodos).toBe(3)
  })

  it('统一待办覆盖全部共享异常并携带真实标题、路由和筛选', () => {
    const store = useAdminStore()
    const pendingSupplier = { ...cloneSeed(suppliers[0]), id: 'S-TODO', name: '真实果园供应商', certified: false, coop: false, status: 'pending' as const, contactPhone: '13900006661' }
    const pendingProduct = { ...cloneSeed(products[0]), id: 'P-TODO', name: '真实待审蜂蜜', status: 'pending' as const }
    store.$patch({
      suppliers: [pendingSupplier],
      products: [pendingProduct],
      orders: [
        { id: 'O-WAIT', productName: '待发货腊肉', quantity: 1, amount: 10, customer: '甲店', channel: 'purchase', status: 'pending', createdAt: '2026-08-30T09:00:00.000Z' },
        { id: 'O-NO-LOGISTICS', productName: '缺物流茶叶', quantity: 1, amount: 20, customer: '乙店', channel: 'purchase', status: 'shipping', createdAt: '2026-08-30T09:01:00.000Z' },
        { id: 'O-MISSING-DRIVER', productName: '缺司机订单', quantity: 1, amount: 30, customer: '丙店', channel: 'purchase', status: 'shipping', createdAt: '2026-08-30T09:02:00.000Z', supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D-MISSING', shortages: [], handovers: [], updatedAt: '2026-08-30T09:02:00.000Z' } },
        { id: 'O-DISABLED-DRIVER', productName: '停用司机订单', quantity: 1, amount: 40, customer: '丁店', channel: 'purchase', status: 'shipping', createdAt: '2026-08-30T09:03:00.000Z', supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D-OFF', shortages: [], handovers: [], updatedAt: '2026-08-30T09:03:00.000Z' } }
      ] as any,
      afterSales: [
        { id: 'AS-WAIT', orderId: 'O-WAIT', productName: '真实破损礼盒', applicant: '甲店', type: 'claim', amount: 10, status: 'processing' },
        { id: 'AS-FAILED', orderId: 'O-FAIL', productName: '真实退款失败茶叶', applicant: '乙店', type: 'refund', amount: 20, status: 'refund-failed' }
      ],
      supplierSettlementRecords: [{ id: 'SS-FAILED', period: '2026-08', supplierIds: ['S-TODO'], orderIds: ['O-WAIT'], amount: 10, status: 'failed', createdAt: '2026-08-30T09:04:00.000Z', items: [{ supplierId: 'S-TODO', supplierName: '真实果园供应商', orderIds: ['O-WAIT'], amount: 10 }] }],
      commissionSettlementRecords: [{ id: 'CS-FAILED', promoterIds: ['T001'], amount: 12, status: 'failed', createdAt: '2026-08-30T09:05:00.000Z', items: [{ promoterId: 'T001', promoterName: '真实推客', amount: 12 }] }] as any
    })
    expect(writePlatformWithdrawal({ id: 'W-TODO', requesterType: 'user', requesterId: '真实用户', amount: 18, method: '微信', status: 'pending', requestKey: 'todo-withdrawal', createdAt: '2026-08-30T09:06:00.000Z' })).toBe(true)
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'R-TODO', operationId: 'OP-TODO', failedStep: 'farm-write', reason: 'write failed', retryCount: 0, createdAt: '2026-08-30T09:07:00.000Z', status: 'pending' }]))
    localStorage.setItem('agritainment-platform-drivers', JSON.stringify([{ id: 'D-OFF', supplierId: 'S-TODO', name: '停用司机张师傅', account: 'driver-off', password: '123456', status: 'disabled', createdAt: '2026-08-30T09:00:00.000Z' }]))

    const todos = store.queryAdminTodos()
    expect(todos.map((todo) => todo.type)).toEqual(expect.arrayContaining([
      'supplier-review', 'product-review-legacy', 'pending-shipment', 'after-sale', 'withdrawal', 'recovery',
      'supplier-settlement-failed', 'commission-settlement-failed', 'shipping-logistics-missing', 'driver-reference-invalid',
      'after-sale-refund-failed'
    ]))
    expect(todos.find((todo) => todo.type === 'supplier-review')).toMatchObject({ title: '供应商「真实果园供应商」待审核', count: 1, route: 'suppliers', filters: { status: 'pending' }, objectIds: ['S-TODO'] })
    expect(todos.find((todo) => todo.type === 'after-sale')).toMatchObject({ filters: { status: 'active' } })
    expect(todos.find((todo) => todo.type === 'after-sale-refund-failed')).toMatchObject({ title: '售后「真实退款失败茶叶」退款失败', route: 'afterSales', filters: { status: 'refund-failed' }, objectIds: ['AS-FAILED'] })
    expect(todos.find((todo) => todo.type === 'driver-reference-invalid')).toMatchObject({ count: 2, route: 'orders', filters: { status: 'pending-or-shipping', driver: 'invalid' }, objectIds: ['O-MISSING-DRIVER', 'O-DISABLED-DRIVER'] })
    expect(todos.reduce((sum, todo) => sum + todo.count, 0)).toBe(12)
  })

  it('legacy-only pending 商品待办跳转后可见行与 count 和 objectIds 一致', async () => {
    const store = useAdminStore()
    await store.initialize()
    const legacyCatalogProducts = [
      { ...cloneSeed(store.catalogProducts[0]), id: 'P-LEGACY-1', name: '历史待审腊肉', status: 'pending' as const },
      { ...cloneSeed(store.catalogProducts[0]), id: 'P-LEGACY-2', name: '历史待审蜂蜜', status: 'pending' as const }
    ]
    store.$patch({
      products: legacyCatalogProducts.map((product) => shared.catalogProductToProduct(product)),
      catalogProducts: legacyCatalogProducts,
      productSubmissions: [],
      suppliers: [], orders: [], afterSales: [], supplierSettlementRecords: [], commissionSettlementRecords: []
    })

    const todo = store.queryAdminTodos().find((item) => item.type === 'product-review-legacy')
    expect(todo).toMatchObject({
      count: 2,
      route: 'products',
      filters: { review: 'legacy', status: 'pending' },
      objectIds: ['P-LEGACY-1', 'P-LEGACY-2']
    })
    const visibleIds = visibleTodoIds(todo, 'products', store.catalogProducts)
    expect(visibleIds).toEqual(todo?.objectIds)
    expect(visibleIds).toHaveLength(todo?.count || 0)
    expect(visibleIds.length).toBeGreaterThan(0)
  })

  it('mixed pending 待办按 productId 拆分且各自跳转后可见行完整非空', async () => {
    const store = useAdminStore()
    await store.initialize()
    const draft = { ...cloneSeed(store.catalogProducts[0]), id: 'P-SUB-TODO', name: '提交草稿蜂蜜' }
    const legacyCatalogProducts = [
      { ...cloneSeed(draft), name: '旧投影名称', status: 'pending' as const },
      { ...cloneSeed(store.catalogProducts[0]), id: 'P-LEGACY-TODO', name: '历史待审腊肉', status: 'pending' as const }
    ]
    const pendingSubmission = {
      id: 'SUB-TODO-1', productId: draft.id, source: 'supplier' as const, supplierId: draft.supplierId, kind: 'create' as const, status: 'pending' as const,
      draft, baseCatalogRevision: store.catalogRevision, submittedBy: 'supplier-todo', submittedAt: '2026-08-31T10:00:00.000Z'
    }
    store.$patch({
      products: legacyCatalogProducts.map((product) => shared.catalogProductToProduct(product)),
      catalogProducts: legacyCatalogProducts,
      productSubmissions: [pendingSubmission, { ...cloneSeed(pendingSubmission), id: 'SUB-TODO-DUPLICATE' }],
      suppliers: [], orders: [], afterSales: [], supplierSettlementRecords: [], commissionSettlementRecords: []
    })

    const todos = store.queryAdminTodos()
    const submissionTodo = todos.find((todo) => todo.type === 'product-review')
    const legacyTodo = todos.find((todo) => todo.type === 'product-review-legacy')
    expect(submissionTodo).toMatchObject({ count: 1, filters: { review: 'pending' }, objectIds: ['SUB-TODO-1'] })
    expect(legacyTodo).toMatchObject({ count: 1, filters: { review: 'legacy', status: 'pending' }, objectIds: ['P-LEGACY-TODO'] })
    const visibleSubmissionIds = visibleTodoIds(submissionTodo, 'products', store.productSubmissions)
    const visibleLegacyIds = visibleTodoIds(legacyTodo, 'products', store.catalogProducts)
    expect(visibleSubmissionIds).toEqual(submissionTodo?.objectIds)
    expect(visibleLegacyIds).toEqual(legacyTodo?.objectIds)
    expect(visibleSubmissionIds.length).toBe(submissionTodo?.count)
    expect(visibleLegacyIds.length).toBe(legacyTodo?.count)
    expect(visibleSubmissionIds.length).toBeGreaterThan(0)
    expect(visibleLegacyIds.length).toBeGreaterThan(0)
  })

  const visibleTodoIds = (todo: any, route: string, items: any[], drivers: any[] = []) => {
    const matcher = (adminStoreModule as unknown as { matchesAdminTodoItem?: (todo: any, route: string, item: any, drivers?: any[]) => boolean }).matchesAdminTodoItem
    return items.filter((item) => matcher?.(todo, route, item, drivers) === true).map((item) => item.id)
  }

  it('keeps every matching logistics and invalid-driver order id visible', () => {
    const logisticsTodo = { route: 'orders', filters: { status: 'shipping', logistics: 'missing' }, objectIds: ['O-LOG-1', 'O-LOG-2'] }
    const driverTodo = { route: 'orders', filters: { status: 'pending-or-shipping', driver: 'invalid' }, objectIds: ['O-DRIVER-1', 'O-DRIVER-2'] }
    const ordersUnderTest = [
      { id: 'O-LOG-1', status: 'shipping' },
      { id: 'O-LOG-2', status: 'shipping', supplierFulfillment: { shipType: 'courier' } },
      { id: 'O-LOG-FIXED', status: 'shipping', trackingNo: 'SF100' },
      { id: 'O-DRIVER-1', status: 'pending', supplierFulfillment: { shipType: 'driver', driverId: 'D-MISSING' } },
      { id: 'O-DRIVER-2', status: 'shipping', supplierFulfillment: { shipType: 'driver', driverId: 'D-OFF' } },
      { id: 'O-DRIVER-ACTIVE', status: 'shipping', supplierFulfillment: { shipType: 'driver', driverId: 'D-ON' } }
    ]
    const drivers = [{ id: 'D-OFF', status: 'disabled' }, { id: 'D-ON', status: 'active' }]

    expect(visibleTodoIds(logisticsTodo, 'orders', ordersUnderTest, drivers)).toEqual(['O-LOG-1', 'O-LOG-2'])
    expect(visibleTodoIds(driverTodo, 'orders', ordersUnderTest, drivers)).toEqual(['O-DRIVER-1', 'O-DRIVER-2'])
  })

  it('applies status and the complete id set for after-sales and failed settlements', () => {
    const afterTodo = { route: 'afterSales', filters: { status: 'refund-failed' }, objectIds: ['AS-1', 'AS-2'] }
    const settlementTodo = { route: 'commissions', filters: { settlementType: 'supplier', status: 'failed' }, objectIds: ['SS-1', 'SS-2'] }
    expect(visibleTodoIds(afterTodo, 'afterSales', [{ id: 'AS-1', status: 'refund-failed' }, { id: 'AS-2', status: 'refund-failed' }, { id: 'AS-3', status: 'processing' }])).toEqual(['AS-1', 'AS-2'])
    expect(visibleTodoIds(settlementTodo, 'commissions', [{ id: 'SS-1', status: 'failed' }, { id: 'SS-2', status: 'failed' }, { id: 'SS-3', status: 'completed' }])).toEqual(['SS-1', 'SS-2'])
  })

  it('真实处理成功后统一待办计数立即减少', async () => {
    const store = useAdminStore()
    const pendingSupplier = { ...cloneSeed(suppliers[0]), id: 'S-TODO-DONE', name: '待处理供应商', certified: false, coop: false, status: 'pending' as const, contactPhone: '13900006662' }
    store.$patch({ suppliers: [pendingSupplier], products: [], orders: [], afterSales: [], supplierSettlementRecords: [], commissionSettlementRecords: [] })
    expect(store.queryAdminTodos().find((todo) => todo.type === 'supplier-review')?.count).toBe(1)
    expect(await store.auditSupplier(pendingSupplier.id, true)).toBe(true)
    expect(store.queryAdminTodos().find((todo) => todo.type === 'supplier-review')).toBeUndefined()
    expect(store.pendingTodos).toBe(0)
  })

  it('新增门店时解析地址并持久化 GCJ-02 坐标', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 112.9388, latitude: 28.2282 },
      location: { longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路' }
    })

    await expect(store.addFarm({ name: '坐标测试门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区潇湘中路', city: '长沙市' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({
      address: '湖南省长沙市岳麓区潇湘中路', locationStatus: 'resolved', location: { coordinateSystem: 'GCJ-02', longitude: 112.9388, latitude: 28.2282 }
    })
    expect(readPlatformEntities()?.farms?.[store.farms[0].id]).toMatchObject({ location: { longitude: 112.9388, latitude: 28.2282 } })
  })

  it('exposes derived read interfaces for dashboards and the todo center', async () => {
    const store = useAdminStore()
    await store.initialize()
    store.$patch({
      suppliers: [
        { ...cloneSeed(suppliers[0]), id: 'S-R1', status: 'pending' },
        { ...cloneSeed(suppliers[1]), id: 'S-R2', status: 'cooperating' }
      ],
      farms: [
        { ...cloneSeed(farms[0]), id: 'F-R1', status: 'active' },
        { ...cloneSeed(farms[1]), id: 'F-R2', status: 'pending' }
      ],
      afterSales: [
        { id: 'AS-R1', orderId: 'O-R1', productName: '待处理售后', applicant: '甲店', type: 'refund', amount: 10, status: 'processing' },
        { id: 'AS-R2', orderId: 'O-R2', productName: '已退款售后', applicant: '乙店', type: 'refund', amount: 10, status: 'refunded' }
      ],
      orders: [
        { id: 'O-R1', productName: 'A', quantity: 1, amount: 10, customer: '甲店', channel: 'purchase', status: 'shipping', createdAt: '2026-10-16T09:00:00.000Z' },
        { id: 'O-R2', productName: 'B', quantity: 1, amount: 10, customer: '乙店', channel: 'purchase', status: 'delivered', createdAt: '2026-10-16T09:00:00.000Z' },
        { id: 'O-R3', productName: 'C', quantity: 1, amount: 10, customer: '丙店', channel: 'purchase', status: 'pending', createdAt: '2026-10-16T09:00:00.000Z' }
      ] as never
    })
    expect(store.pendingSuppliers).toBe(1)
    expect(store.pendingAfterSales).toBe(1)
    expect(store.activeFarmCount).toBe(1)
    expect(store.activeSupplierCount).toBe(1)
    expect(store.shippedOrderCount).toBe(2)

    expect(writePlatformWithdrawal({ id: 'W-R1', requesterType: 'user', requesterId: 'U-R1', amount: 5, method: '微信', status: 'pending', requestKey: 'read-key', createdAt: '2026-10-16T09:00:00.000Z' })).toBe(true)
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'RQ-R1', operationId: 'OP-R1', failedStep: 'x', reason: 'x', retryCount: 0, createdAt: '2026-10-16T09:00:00.000Z', status: 'pending' }]))
    expect(store.pendingWithdrawals).toBe(Object.values(shared.readPlatformWithdrawals() || {}).filter((item) => item.status === 'pending').length)
    expect(store.pendingWithdrawals).toBeGreaterThan(0)
    expect(store.pendingRecovery).toBe(shared.readPlatformRecoveryQueue().filter((item) => item.status === 'pending').length)
    expect(store.pendingRecovery).toBeGreaterThan(0)
    expect(store.totalCommission).toBe(shared.pendingShareTotal())
  })

  it('rejects invalid leader pricing, unknown leaders and empty promoter payloads', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.updateLeaderPricing({ ...store.pricingDefaults, level1Amount: -1, level2Amount: 5 })).toBe(false)
    expect(await store.setLeaderStatus('U-MISSING', false)).toBeFalsy()
    expect(await store.updatePromoter('T-MISSING', { name: '', level: '', status: 'active' })).toBeFalsy()
  })

  it('creates, updates and toggles price policies through the audited write interfaces', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(await store.createPolicy('联调分销价', 'group', '全部门店', 12)).toBe(true)
    const policy = store.policies.find((item) => item.name === '联调分销价')!
    expect(policy).toMatchObject({ type: 'group', scope: '全部门店', discount: 12, enabled: true })

    expect(await store.updatePolicy(policy.id, '联调分销价（改）', '长沙市区', 15, true)).toBe(true)
    expect(store.policies.find((item) => item.id === policy.id)).toMatchObject({ name: '联调分销价（改）', scope: '长沙市区', discount: 15 })

    expect(await store.togglePolicy(policy.id)).toBe(true)
    expect(store.policies.find((item) => item.id === policy.id)?.enabled).toBe(false)
    expect(readPlatformEntities()?.policies?.[policy.id]).toMatchObject({ name: '联调分销价（改）', enabled: false })

    expect(await store.updatePolicy('MISSING-POLICY', '不存在', '全部门店', 10)).toBe(false)
    expect(await store.togglePolicy('MISSING-POLICY')).toBe(false)
  })

  it('新增与修改门店时保留联系人信息', async () => {
    const store = useAdminStore()
    await store.initialize()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 112.9388, latitude: 28.2282 },
      location: { longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路' }
    })

    await expect(store.addFarm({ name: '联系人门店', contact: '赵店长', contactPhone: '13911112222', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区潇湘中路', city: '长沙市' }, geocode)).resolves.toBe(true)
    const created = store.farms.find((farm) => farm.name === '联系人门店')!
    expect(created).toMatchObject({ contact: '赵店长', contactPhone: '13911112222' })
    expect(readPlatformEntities()?.farms?.[created.id]).toMatchObject({ contact: '赵店长', contactPhone: '13911112222' })

    const seedFarm = store.farms.find((farm) => farm.id === 'F001')!
    await expect(store.updateFarm('F001', { name: seedFarm.name, contact: '王经理', contactPhone: '', region: seedFarm.region, address: seedFarm.address }, geocode)).resolves.toBe(true)
    expect(store.farms.find((farm) => farm.id === 'F001')).toMatchObject({ contact: '王经理', contactPhone: '' })
    expect(readPlatformEntities()?.farms?.F001).toMatchObject({ contact: '王经理', contactPhone: '' })
  })

  it('按县区和详细地址构建并保存结构化门店地址', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 112.9388, latitude: 28.2282 },
      location: { longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路123号' }
    })

    await expect(store.addFarm({ name: '结构化地址门店', districtCode: '430104', detail: '潇湘中路123号' }, geocode)).resolves.toBe(true)
    expect(geocode).toHaveBeenCalledWith({ address: '湖南省长沙市岳麓区潇湘中路123号', city: '长沙市' })
    expect(store.farms[0]).toMatchObject({
      address: '湖南省长沙市岳麓区潇湘中路123号', city: '长沙市', region: '岳麓区', regionCode: '430104',
      structuredAddress: { province: '湖南省', city: '长沙市', district: '岳麓区', districtCode: '430104', detail: '潇湘中路123号' }
    })
  })

  it('地理编码县区与所选县区不一致时清空坐标并标记 REGION_MISMATCH', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 113.05, latitude: 28.25 },
      location: { longitude: 113.05, latitude: 28.25, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430105', province: '湖南省', city: '长沙市', district: '开福区', formattedAddress: '湖南省长沙市开福区测试路' }
    })

    await expect(store.addFarm({ name: '县区不匹配门店', districtCode: '430104', detail: '测试路1号' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({ locationStatus: 'failed', locationError: 'REGION_MISMATCH', regionCode: '430104' })
    expect(store.farms[0].location).toBeUndefined()
  })

  it('编辑门店地址解析失败时保留地址并清除旧坐标', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })

    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '湖南省湘西州永顺县新的石板溪地址' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({ address: '湖南省湘西州永顺县新的石板溪地址', locationStatus: 'failed' })
    expect(store.farms[0].location).toBeUndefined()
  })

  it('同一地址失败后可强制重新定位并恢复坐标', async () => {
    const store = useAdminStore()
    store.farms = [{ ...cloneSeed(farms[0]), locationStatus: 'failed', location: undefined, locationError: 'GEOCODE_FAILED' }]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 109.8561, latitude: 29.0816 },
      location: { longitude: 109.8561, latitude: 29.0816, coordinateSystem: 'GCJ-02', provider: 'tencent', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '433127', province: '湖南省', city: '湘西州', district: '永顺县', formattedAddress: farms[0].address }
    })

    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: farms[0].address, forceGeocode: true }, geocode)).resolves.toBe(true)
    expect(geocode).toHaveBeenCalledWith({ address: farms[0].address, city: farms[0].city })
    expect(store.farms[0]).toMatchObject({ locationStatus: 'resolved', location: { provider: 'tencent', longitude: 109.8561, latitude: 29.0816 } })
  })

  it('同一结构化地址已有有效坐标时复用定位结果', async () => {
    const store = useAdminStore()
    store.farms = [{ ...cloneSeed(farms[0]), address: '湖南省湘西州永顺县石板溪村', regionCode: '433127', structuredAddress: { provinceCode: '43', province: '湖南省', cityCode: '4331', city: '湘西州', districtCode: '433127', district: '永顺县', detail: '石板溪村' } }]
    const geocode = vi.fn<() => Promise<GeocodeResult>>()

    await expect(store.updateFarm('F001', { name: farms[0].name, districtCode: '433127', detail: '石板溪村' }, geocode)).resolves.toBe(true)
    expect(geocode).not.toHaveBeenCalled()
    expect(store.farms[0].locationStatus).toBe('resolved')
  })

  it('地理编码请求期间清除旧坐标并显示定位中', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    let resolveGeocode!: (result: GeocodeResult) => void
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockImplementation(() => new Promise((resolve) => { resolveGeocode = resolve }))

    const updating = store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '湖南省湘西州永顺县新地址' }, geocode)
    expect(store.farms[0]).toMatchObject({ address: '湖南省湘西州永顺县新地址', locationStatus: 'pending' })
    expect(store.farms[0].location).toBeUndefined()

    resolveGeocode({ status: 'failed' })
    await updating
    expect(store.farms[0].locationStatus).toBe('failed')
  })

  it('新增和编辑门店时拒绝空详细地址', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })

    await expect(store.addFarm({ name: '无地址门店', region: '长沙市岳麓区', address: '   ' }, geocode)).resolves.toBe(false)
    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '' }, geocode)).resolves.toBe(false)
    expect(geocode).not.toHaveBeenCalled()
    expect(store.farms).toHaveLength(1)
    expect(store.farms[0].address).toBe(farms[0].address)
  })

  it('门店新增和编辑在保存边界规范化图片引用', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })
    await expect(store.addFarm({
      name: '图片规范化门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区测试路1号',
      image: 'https://cdn.example.com/farm.jpg'
    }, geocode)).resolves.toBe(true)
    expect(store.farms[0].image).toEqual({ source: 'legacy', url: 'https://cdn.example.com/farm.jpg' })

    await expect(store.updateFarm(store.farms[0].id, {
      name: '图片规范化门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区测试路1号',
      image: '/static/images/farmhouse.webp'
    }, geocode)).resolves.toBe(true)
    expect(store.farms[0].image).toEqual({ source: 'builtin', path: '/static/images/farmhouse.webp' })
  })

  it('does not leave an account behind when supplier entity persistence fails', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = store.supplierAccounts.length
    const persist = vi.spyOn(shared, 'persistPlatformEntity').mockReturnValue(false)
    expect((await store.inviteSupplier({ name: '写入失败供应商', category: '生鲜农产', contactPhone: '13900009990' })).ok).toBe(false)
    expect(store.supplierAccounts).toHaveLength(before)
    expect(store.suppliers.some((item) => item.name === '写入失败供应商')).toBe(false)
    persist.mockRestore()
  })

  it('restores the previous farm when media persistence fails during update', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = cloneSeed(store.farms.find((item) => item.id === 'F001')!)
    const writeMedia = vi.spyOn(shared, 'writePlatformMedia').mockReturnValue(false)
    await expect(store.updateFarm('F001', { name: '临时修改门店', region: before.region, address: before.address })).resolves.toBe(false)
    expect(store.farms.find((item) => item.id === 'F001')).toEqual(before)
    writeMedia.mockRestore()
  })

  it('initializes the unified catalog revision and projects all-channel products to both lists', async () => {
    const store = useAdminStore()
    await store.initialize()

    const catalog = readCatalogState()!
    expect(store.catalogRevision).toBe(catalog.revision)
    expect(store.catalogProducts).toEqual(catalog.products)
    for (const product of catalog.products.filter((item) => item.channel === 'all')) {
      expect(store.products.some((item) => item.id === product.id)).toBe(true)
      expect(store.cProducts.some((item) => item.id === product.id)).toBe(true)
    }
  })

  it('updates one formal catalog product and keeps its SKU price fields in both projections', async () => {
    const store = useAdminStore()
    await store.initialize()
    const existing = cloneSeed(store.catalogProducts[0])
    const product: CatalogProduct = {
      ...existing, name: '统一商品', category: '土特产', supplierId: store.suppliers[0].id, supplierName: store.suppliers[0].name,
      source: 'platform', status: 'active', image: { source: 'builtin', path: '/static/images/product.webp' }, images: [], tags: ['演示'], productType: 'goods', expressDelivery: true,
      channel: 'all', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: existing.skus[0].id, name: '默认规格', image: { source: 'builtin', path: '/static/images/product.webp' }, retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 }]
    }

    expect(await store.saveCatalogProduct(product)).toEqual({ ok: true })
    expect(store.catalogProducts.find((item) => item.id === product.id)).toEqual(product)
    expect(store.products.find((item) => item.id === product.id)?.skus[0]).toMatchObject({ price: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 })
    expect(store.cProducts.find((item) => item.id === product.id)?.skus[0]).toMatchObject({ basePrice: 35, level1Commission: 10, level2Commission: 15 })
  })

  it('creates an admin product submission without writing the formal catalog', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = cloneSeed(readCatalogState()!)
    const template = before.products[0]
    const product: CatalogProduct = {
      ...cloneSeed(template),
      id: 'CAT-ADMIN-SUBMISSION',
      name: '后台待审核商品',
      skus: template.skus.map((sku, index) => ({ ...cloneSeed(sku), id: `CAT-ADMIN-SUBMISSION-SKU-${index + 1}` }))
    }
    const pendingBefore = store.pendingProducts

    expect(await store.saveCatalogProduct(product)).toEqual({ ok: true })
    expect(readCatalogState()).toEqual(before)
    expect(shared.readCatalogProductSubmissions()).toEqual([
      expect.objectContaining({ source: 'admin', kind: 'create', status: 'pending', productId: product.id, draft: expect.objectContaining({ id: product.id }) })
    ])
    expect(store.pendingProducts).toBe(pendingBefore + 1)
  })

  it('rejects pending and non-formal product ids at the status boundary', async () => {
    const store = useAdminStore()
    await store.initialize()
    const current = readCatalogState()!
    const pendingProduct = { ...cloneSeed(current.products[0]), status: 'pending' as const }
    expect(writeCatalogState({ ...current, revision: current.revision + 1, products: [pendingProduct, ...current.products.slice(1)] }, current.revision)).toBe(true)
    await store.refreshSharedState()

    expect(await store.toggleCatalogProduct(pendingProduct.id)).toBe(false)
    expect(readCatalogState()?.products.find((item) => item.id === pendingProduct.id)?.status).toBe('pending')
    expect(await store.toggleCatalogProduct('SUBMISSION-ONLY-ID')).toBe(false)
  })

  it('rejects invalid catalog products without changing the catalog', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = readCatalogState()!
    const invalid: CatalogProduct = {
      ...before.products[0], id: 'CAT-INVALID', channel: 'live', productType: 'goods', expressDelivery: false,
      skus: [{ ...before.products[0].skus[0], retailPrice: 20, level1Amount: 10, level2Amount: 15 }]
    }

    expect(await store.saveCatalogProduct(invalid)).toEqual({ ok: false, error: '商品配置非法，请检查渠道、快递、佣金和 SKU 价格' })
    expect(readCatalogState()).toEqual(before)
  })

  it('refreshes catalog state when a save hits a revision conflict', async () => {
    const store = useAdminStore()
    await store.initialize()
    const current = readCatalogState()!
    const externallyUpdated = { ...current, revision: current.revision + 1, products: current.products.map((item, index) => index === 0 ? { ...item, name: `${item.name} 外部更新` } : item) }
    expect(writeCatalogState(externallyUpdated, current.revision)).toBe(true)

    const localEdit = { ...current.products[0], name: `${current.products[0].name} 本地更新` }
    expect(await store.saveCatalogProduct(localEdit)).toEqual({ ok: false, error: '商品数据已更新，请刷新后重试' })
    expect(store.catalogRevision).toBe(externallyUpdated.revision)
    expect(store.catalogProducts[0].name).toBe(externallyUpdated.products[0].name)
  })

  it('loads and persists pricing defaults for subsequent products', async () => {
    expect(writePricingDefaults({ promoterCommissionRate: 6, storeCommissionRate: 4, level1Amount: 12, level2Amount: 18 })).toBe(true)
    const store = useAdminStore()
    await store.initialize()
    expect(store.pricingDefaults).toEqual({ promoterCommissionRate: 6, storeCommissionRate: 4, level1Amount: 12, level2Amount: 18, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })

    expect(await store.updatePricingDefaults({ promoterCommissionRate: 7, storeCommissionRate: 5, level1Amount: 8, level2Amount: 11 })).toBe(true)
    expect(readPricingDefaults()).toEqual({ promoterCommissionRate: 7, storeCommissionRate: 5, level1Amount: 8, level2Amount: 11, storePriceLevelDiscounts: { A: 0.95, B: 0.97, C: 1 } })
  })

  it('persists store price level discounts and supplier brands through admin actions', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.updatePricingDefaults({ ...store.pricingDefaults, storePriceLevelDiscounts: { A: 0.9, B: 0.97, C: 1 } })).toBe(true)
    expect(shared.readStorePriceLevelDiscounts()).toEqual({ A: 0.9, B: 0.97, C: 1 })
    expect(await store.updatePricingDefaults({ ...store.pricingDefaults, storePriceLevelDiscounts: { A: 1.5, B: 0.97, C: 1 } })).toBe(false)
    expect(shared.readStorePriceLevelDiscounts()).toEqual({ A: 0.9, B: 0.97, C: 1 })

    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    expect(supplier.brands).toEqual(['湘西腊味', '柴火腊味'])
    expect(store.afterSales.find((item) => item.id === 'SH20609')?.responsibleSupplierId).toBe('S009')
    expect(await store.updateSupplier('S002', {
      name: supplier.name, category: supplier.category, region: supplier.region, contactPhone: supplier.contactPhone,
      brands: ['湘西腊味', '新品牌'], serviceRegions: ['湘西州', '长沙']
    })).toMatchObject({ ok: true })
    expect(store.suppliers.find((item) => item.id === 'S002')).toMatchObject({ brands: ['湘西腊味', '新品牌'], serviceRegions: ['湘西州', '长沙'] })
  })

  it('converges promoter type to 业务员 and persists the responsible region', async () => {
    const store = useAdminStore()
    await store.initialize()
    const promoter = store.promoters.find((item) => item.id === 'T001')!
    expect(promoter.type).toBe('业务员')
    expect(promoter.region).toBe('湘西州')
    expect(await store.updatePromoter('T001', { name: promoter.name, level: promoter.level, type: '业务员', region: ' 益阳市 ', status: 'active' })).toBe(true)
    expect(store.promoters.find((item) => item.id === 'T001')?.region).toBe('益阳市')
    expect(shared.readPlatformEntities()?.promoters?.T001?.region).toBe('益阳市')
  })

  it('logs catalog stock changes only when a sku stock value changes', async () => {
    const store = useAdminStore()
    await store.initialize()
    const product = cloneSeed(store.catalogProducts[0])
    const sku = product.skus[0]
    const before = shared.readCatalogStockLogs().length
    expect(await store.saveCatalogProduct({ ...product, skus: product.skus.map((item) => ({ ...item, stock: item.id === sku.id ? item.stock + 12 : item.stock })) })).toEqual({ ok: true })
    const logs = shared.readCatalogStockLogs()
    expect(logs.length).toBe(before + 1)
    expect(logs[0]).toMatchObject({ productId: product.id, skuId: sku.id, before: sku.stock, after: sku.stock + 12, delta: 12, reason: '商品库库存调整' })

    const unchanged = cloneSeed(store.catalogProducts.find((item) => item.id === product.id)!)
    expect(await store.saveCatalogProduct(unchanged)).toEqual({ ok: true })
    expect(shared.readCatalogStockLogs().length).toBe(before + 1)
  })

  it('raises a product-level stock warning todo whose visible rows match count and objectIds', async () => {
    const store = useAdminStore()
    await store.initialize()
    const warningProducts = store.catalogProducts.filter((item) => shared.catalogProductStockWarnings(item).length > 0)
    expect(warningProducts.length).toBeGreaterThan(0)
    const todo = store.queryAdminTodos().find((item) => item.type === 'stock-warning')
    expect(todo).toMatchObject({
      route: 'products',
      count: warningProducts.length,
      filters: { stock: 'warning' },
      objectIds: warningProducts.map((item) => item.id)
    })
    const visible = store.catalogProducts.filter((item) => adminStoreModule.matchesAdminTodoItem(todo, 'products', item))
    expect(visible.map((item) => item.id)).toEqual(todo?.objectIds)
    expect(visible.length).toBe(todo?.count)
  })

  it('records the return tracking number with history and rejects terminal after-sale states', async () => {
    const store = useAdminStore()
    await store.initialize()
    const work = cloneSeed(store.afterSales.find((item) => item.status === 'processing')!)
    store.$patch({ afterSales: [work] })
    expect(await store.recordAfterSaleReturnTracking(work.id, 'SF1234567890')).toBe(true)
    expect(store.afterSales.find((item) => item.id === work.id)?.returnTrackingNo).toBe('SF1234567890')
    expect(store.afterSales.find((item) => item.id === work.id)?.history?.at(-1)?.action).toContain('SF1234567890')
    expect(shared.readPlatformAfterSales()?.[work.id]?.returnTrackingNo).toBe('SF1234567890')
    expect(await store.recordAfterSaleReturnTracking(work.id, '123')).toBe(false)

    expect(shared.writePlatformAfterSales({ [work.id]: { ...work, status: 'refunded' } })).toBe(true)
    expect(await store.recordAfterSaleReturnTracking(work.id, 'SF1234567890')).toBe(false)
  })

  it('ships without inventing a driver assignment and confirms receipt', async () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    expect(await store.shipOrder(store.orders[0].id)).toBe(true)
    expect(store.orders[0].status).toBe('shipping')
    expect(store.orders[0].trackingNo).toBeUndefined()
    const shipFlow = store.orders[0].flow
    expect(shipFlow?.[shipFlow.length - 1]).toMatchObject({ action: '已发货 · 后台确认履约', operator: 'admin' })
    expect(await store.confirmOrder(store.orders[0].id)).toBe(true)
    expect(store.orders[0].status).toBe('delivered')
    const doneFlow = store.orders[0].flow
    expect(doneFlow?.[doneFlow.length - 1]).toMatchObject({ action: '已确认收货', operator: 'admin' })
    expect(await store.shipOrder(store.orders[0].id)).toBe(false)
    expect(await store.confirmOrder(store.orders[0].id)).toBe(false)
  })

  it('merges store-submitted orders and writes back fulfillment status', async () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    writePlatformOrder({ id: 'SO-TEST01', productName: '湘西烟熏柴火腊肉', quantity: 2, amount: 76, customer: '石板溪农家乐·门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-18 10:00' })
    store.orders = mergePlatformOrders(store.orders, readPlatformOrders())
    expect(store.orders.some((item) => item.id === 'SO-TEST01')).toBe(true)
    expect(await store.shipOrder('SO-TEST01')).toBe(true)
    expect(readPlatformOrders()?.['SO-TEST01']?.status).toBe('shipping')
    expect(await store.confirmOrder('SO-TEST01')).toBe(true)
    expect(readPlatformOrders()?.['SO-TEST01']?.status).toBe('delivered')
  })

  it('confirms a linked C-MALL order across platform, user and supplier snapshots', async () => {
    const fixture = seedShippedCMallOrder('ADMIN-RECEIPT')
    const store = useAdminStore()
    store.orders = mergePlatformOrders([], readPlatformOrders())

    expect(await store.confirmOrder(fixture.shipped.id)).toBe(true)
    expect(readPlatformOrders()?.[fixture.shipped.id]).toMatchObject({ status: 'delivered', supplierFulfillment: { status: 'received' } })
    expect(readCOrders()?.[fixture.order.id]).toMatchObject({ status: 'received', subOrders: [expect.objectContaining({ id: fixture.sub.id, status: 'received' })] })
    expect(readCCommissionRecords()).toEqual(expect.arrayContaining([expect.objectContaining({ id: `CC-ADMIN-RECEIPT`, status: 'available' })]))
  })

  it('rolls back admin receipt when the linked C-order snapshot cannot be written', async () => {
    const fixture = seedShippedCMallOrder('ADMIN-ROLLBACK')
    const store = useAdminStore()
    store.orders = mergePlatformOrders([], readPlatformOrders())
    const beforePlatform = cloneSeed(readPlatformOrders())
    const beforeCOrders = cloneSeed(readCOrders())
    const beforeCommissions = cloneSeed(readCCommissionRecords())
    const beforeMemory = cloneSeed(store.orders)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-c-orders') throw new Error('C-order write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.confirmOrder(fixture.shipped.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(readPlatformOrders()).toEqual(beforePlatform)
    expect(readCOrders()).toEqual(beforeCOrders)
    expect(readCCommissionRecords()).toEqual(beforeCommissions)
    expect(store.orders).toEqual(beforeMemory)
  })

  it('keeps an approved refund pending until complete financial side effects are confirmed', async () => {
    const store = useAdminStore()
    store.afterSales = cloneSeed(afterSales)
    const processing = store.afterSales.find((item) => item.status === 'processing')!
    expect(await store.approveAfterSaleRefund(processing.id)).toBe(true)
    expect(store.afterSales.find((item) => item.id === processing.id)?.status).toBe('refund-pending')
    expect(await store.refundAfterSale(processing.id)).toBe(false)
    const refunded = store.afterSales.find((item) => item.id === processing.id)
    expect(refunded?.status).toBe('refund-pending')
    expect(refunded?.refundAmount).toBeUndefined()
    await store.recordExport('订单履约', 4)
    expect(refunded?.history?.[0].operator).toBe('运营管理员')
    expect(store.exportRecords[0]).toMatchObject({ module: '订单履约', count: 4 })
  })

  it('rolls back an after-sale transition when its success audit fails', async () => {
    const store = useAdminStore()
    const processing = cloneSeed(afterSales.find((item) => item.status === 'processing')!)
    store.afterSales = [processing]
    const original = { [processing.id]: cloneSeed(processing) }
    expect(writePlatformAfterSales(original)).toBe(true)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.rejectAfterSale(processing.id)).toBe(false)

    expect(readPlatformAfterSales()).toEqual(original)
    expect(store.afterSales).toEqual([processing])
    expect(Object.values(readPlatformJournal())).toContainEqual(expect.objectContaining({ recoveryHandlerKey: 'admin-after-sale-v1', recoverySchema: 'admin-after-sale-snapshot-v1', status: 'aborted' }))
    audit.mockRestore()
  })

  it('audits an illegal after-sale transition as a failure', async () => {
    const store = useAdminStore()
    const rejected = { ...cloneSeed(afterSales[0]), status: 'rejected' as const }
    store.afterSales = [rejected]

    expect(await store.approveAfterSaleRefund(rejected.id)).toBe(false)

    const logs = readPlatformAuditLogs().filter((entry) => entry.action === 'after-sale.approve-refund')
    expect(logs).toContainEqual(expect.objectContaining({ result: 'failure', reason: 'validation-failed' }))
    expect(logs.some((entry) => entry.result === 'success')).toBe(false)
  })

  it('moves after-sales through reject/return/refund-failed and guards terminal states', async () => {
    const store = useAdminStore()
    store.afterSales = cloneSeed(afterSales)
    const processing = store.afterSales.filter((item) => item.status === 'processing')
    expect(await store.rejectAfterSale(processing[0].id)).toBe(true)
    expect(store.afterSales.find((item) => item.id === processing[0].id)?.status).toBe('rejected')
    expect(await store.approveAfterSaleRefund(processing[0].id)).toBe(false)
    expect(await store.approveAfterSaleReturn(processing[1].id)).toBe(true)
    expect(store.afterSales.find((item) => item.id === processing[1].id)?.status).toBe('return-pending')
    expect(await store.refundAfterSale(processing[1].id)).toBe(false)
    expect(store.afterSales.find((item) => item.id === processing[1].id)?.status).toBe('return-pending')
    expect(await store.refundAfterSale(processing[0].id)).toBe(false)
  })

  it('initiates after-sale only for delivered orders without existing records', async () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    store.afterSales = cloneSeed(afterSales)
    const delivered = store.orders.find((o) => o.status === 'delivered' && !store.afterSales.some((a) => a.orderId === o.id))!
    const pending = store.orders.find((o) => o.status === 'pending')!
    expect(await store.initiateAfterSale(delivered.id, 'refund', '质量问题')).toBe(true)
    expect(await store.initiateAfterSale(delivered.id, 'refund', '质量问题')).toBe(false)
    expect(await store.initiateAfterSale(pending.id, 'refund', '质量问题')).toBe(false)
    expect(store.afterSales[0].status).toBe('processing')
  })

  it('derives KPIs and supports batch shipping', async () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), products: cloneSeed(products), farms: cloneSeed(farms), suppliers: cloneSeed(suppliers) })
    expect(store.totalGmv).toBeCloseTo(20029.7, 1)
    expect(store.hotProducts[0].id).toBe('P001')
    expect(await store.batchShipOrders(store.orders.filter((item) => item.status === 'pending').map((item) => item.id))).toBe(18)
    expect(store.pendingOrders).toBe(0)
  })

  it('settles supplier orders and commissions only once', async () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), suppliers: cloneSeed(suppliers), promoters: [{ id: 'T1', name: '推客', level: 'V1', fans: 1, orders: 1, gmv: 100, commission: 10, status: 'active' }] })
    expect(await store.settleSuppliers(['S006'])).toBe(true)
    expect(await store.settleSuppliers(['S006'])).toBe(false)
    expect(store.error).toBe('')
    expect(store.supplierSettlementRecords[0]).toMatchObject({ orderIds: ['NJ202608110842', 'NJ202607291457', 'NJ202607301917'], amount: 616 })
    expect(store.supplierSettlementRecords[0].items[0]).toMatchObject({ supplierId: 'S006', orderIds: ['NJ202608110842', 'NJ202607291457', 'NJ202607301917'], amount: 616 })
    writeShareRecords([{ id: 'SR-T', userId: 'u', orderId: 'o', orderAmount: 200, role: 'promoter', promoterId: 'T1', rate: 5, amount: 10, createdAt: 'x' }])
    expect(await store.settleCommissions()).toBe(true)
    expect(await store.settleCommissions()).toBe(false)
    expect(store.commissionSettlementRecords[0].amount).toBe(10)
    expect(store.commissionSettlementRecords[0].items[0]).toMatchObject({ promoterId: 'T1', promoterName: '推客', amount: 10 })
  })

  it('rolls back supplier settlement business collections when the success audit fails and retries idempotently', async () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), suppliers: cloneSeed(suppliers), supplierSettlementRecords: [] })
    const originalOrders = Object.fromEntries(store.orders.map((order) => [order.id, cloneSeed(order)]))
    expect(writePlatformOrders(originalOrders)).toBe(true)
    expect(writePlatformSupplierSettlements({})).toBe(true)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.settleSuppliers(['S006'])).toBe(false)

    expect(readPlatformOrders()).toEqual(originalOrders)
    expect(readPlatformSupplierSettlements()).toEqual({})
    expect(store.orders).toEqual(Object.values(originalOrders))
    expect(store.supplierSettlementRecords).toEqual([])
    const aborted = Object.values(readPlatformJournal()).find((entry) => entry.recoveryHandlerKey === 'admin-supplier-settlement-v1')
    expect(aborted).toMatchObject({ status: 'aborted', recoverySchema: 'admin-supplier-settlement-snapshot-v1' })

    audit.mockRestore()
    expect(await store.settleSuppliers(['S006'])).toBe(true)
    const committed = Object.values(readPlatformJournal()).find((entry) => entry.recoveryHandlerKey === 'admin-supplier-settlement-v1' && entry.status === 'committed')
    expect(committed?.operationId).toBe(aborted?.operationId)
    expect(Object.keys(readPlatformSupplierSettlements() || {})).toHaveLength(1)
    expect(await store.settleSuppliers(['S006'])).toBe(false)
    expect(Object.keys(readPlatformSupplierSettlements() || {})).toHaveLength(1)
  })

  it('rolls back commission settlement business collections when the success audit fails and retries idempotently', async () => {
    const store = useAdminStore()
    store.promoters = [{ id: 'T1', name: '推客', level: 'V1', fans: 1, orders: 1, gmv: 100, commission: 10, status: 'active' }]
    const originalShares = [{ id: 'SR-ATOMIC', userId: 'U1', orderId: 'O1', orderAmount: 200, role: 'promoter' as const, promoterId: 'T1', rate: 5, amount: 10, status: 'pending' as const, createdAt: '2026-08-30T10:00:00.000Z' }]
    expect(writeShareRecords(originalShares)).toBe(true)
    expect(writePlatformCommissionSettlements({})).toBe(true)
    expect(writePlatformCommissionSettlementRecords({})).toBe(true)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.settleCommissions()).toBe(false)

    expect(readShareRecords()).toEqual(originalShares)
    expect(readPlatformCommissionSettlements()).toEqual({})
    expect(readPlatformCommissionSettlementRecords()).toEqual({})
    expect(store.commissionSettlementRecords).toEqual([])
    const aborted = Object.values(readPlatformJournal()).find((entry) => entry.recoveryHandlerKey === 'admin-commission-settlement-v1')
    expect(aborted).toMatchObject({ status: 'aborted', recoverySchema: 'admin-commission-settlement-snapshot-v1' })

    audit.mockRestore()
    expect(await store.settleCommissions()).toBe(true)
    const committed = Object.values(readPlatformJournal()).find((entry) => entry.recoveryHandlerKey === 'admin-commission-settlement-v1' && entry.status === 'committed')
    expect(committed?.operationId).toBe(aborted?.operationId)
    expect(Object.keys(readPlatformCommissionSettlementRecords() || {})).toHaveLength(1)
    expect(await store.settleCommissions()).toBe(false)
    expect(Object.keys(readPlatformCommissionSettlementRecords() || {})).toHaveLength(1)
  })

  it('excludes reversed commissions and settles pending negative corrections', async () => {
    const store = useAdminStore()
    store.promoters = [{ id: 'T1', name: '推客', level: 'V1', fans: 1, orders: 1, gmv: 100, commission: 10, status: 'active' }]
    writeShareRecords([
      { id: 'SR-REVERSED', userId: 'u', orderId: 'cancelled', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: 5, status: 'reversed', createdAt: 'x' },
      { id: 'SR-EARNED', userId: 'u', orderId: 'paid', orderAmount: 200, role: 'promoter', promoterId: 'T1', rate: 5, amount: 10, status: 'pending', createdAt: 'x' },
      { id: 'SR-CORRECTION', userId: 'u', orderId: 'returned', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: -5, status: 'pending', createdAt: 'x' }
    ])

    expect(await store.settleCommissions()).toBe(true)
    expect(store.commissionSettlementRecords[0].amount).toBe(5)
  })

  it('rolls back a commission rule when its success audit cannot be persisted', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-ATOMIC', name: '原规则', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]
    expect(writePlatformCommissionRules([original])).toBe(true)
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.updateCommissionRule(original.id, 9, false)).toBe(false)

    expect(store.commissionRules).toEqual([original])
    expect(readPlatformCommissionRules()).toEqual([original])
    expect(Object.values(readPlatformJournal())).toContainEqual(expect.objectContaining({
      collections: expect.arrayContaining([PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY]),
      recoveryHandlerKey: 'admin-commission-rule-v1',
      recoverySchema: 'admin-commission-rule-snapshot-v1',
      status: 'aborted'
    }))
    audit.mockRestore()
  })

  it('rejects a third-state commission rule recovery without writing business or audit collections', async () => {
    const operationId = 'OP-ADMIN-COMMISSION-RULE-THIRD-STATE'
    const original = [{ id: 'CR-THIRD', name: '第三状态', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }]
    const target = [{ ...original[0], rate: 9 }]
    const concurrent = [{ ...original[0], rate: 7 }]
    expect(writePlatformCommissionRules(concurrent)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { rules: original, auditAction: 'commission.rule.update' },
      target: { rules: target, auditAction: 'commission.rule.update' },
      recoveryHandlerKey: 'admin-commission-rule-v1', recoverySchema: 'admin-commission-rule-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'commission-rules', reason: 'third-state test', handlerKey: 'admin-commission-rule-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!
    const writtenKeys: string[] = []
    const setItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => { writtenKeys.push(key); setItem(key, value) })

    try {
      expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = setItem
    }

    expect(readPlatformCommissionRules()).toEqual(concurrent)
    expect(writtenKeys).not.toContain(PLATFORM_COMMISSION_RULES_STORAGE_KEY)
    expect(writtenKeys).not.toContain(PLATFORM_AUDIT_LOG_STORAGE_KEY)
  })

  it('recovers a legacy commission rule journal whose target omitted auditAction', async () => {
    const operationId = 'OP-ADMIN-COMMISSION-RULE-LEGACY-AUDIT'
    const original = [{ id: 'CR-LEGACY', name: '旧恢复规则', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }]
    const target = [{ ...original[0], rate: 9 }]
    expect(writePlatformCommissionRules(target)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { rules: original, auditAction: 'commission.rule.update' },
      target: { rules: target },
      recoveryHandlerKey: 'admin-commission-rule-v1', recoverySchema: 'admin-commission-rule-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'commission-rules', reason: 'legacy target audit field missing', handlerKey: 'admin-commission-rule-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: true })

    expect(readPlatformCommissionRules()).toEqual(original)
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'resolved', retryCount: 1 })
  })

  it('keeps a legacy journal pending when its business collection is in a third state', async () => {
    const operationId = 'OP-ADMIN-COMMISSION-RULE-LEGACY-THIRD'
    const original = [{ id: 'CR-LEGACY-THIRD', name: '旧第三状态', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }]
    const target = [{ ...original[0], rate: 9 }]
    const concurrent = [{ ...original[0], rate: 7 }]
    expect(writePlatformCommissionRules(concurrent)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { rules: original, auditAction: 'commission.rule.update' },
      target: { rules: target },
      recoveryHandlerKey: 'admin-commission-rule-v1', recoverySchema: 'admin-commission-rule-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'commission-rules', reason: 'legacy third-state test', handlerKey: 'admin-commission-rule-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: false, code: 'handler-failed' })

    expect(readPlatformCommissionRules()).toEqual(concurrent)
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'pending', retryCount: 1, lastError: 'handler-failed' })
  })

  it('rejects matching auditLogs when the legacy target has a conflicting auditResult', async () => {
    const operationId = 'OP-ADMIN-COMMISSION-RULE-AUDIT-RESULT-CONFLICT'
    const original = [{ id: 'CR-AUDIT-RESULT', name: '审计结果冲突', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }]
    const target = [{ ...original[0], rate: 9 }]
    expect(writePlatformCommissionRules(target)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { rules: original, auditLogs: [], auditResult: 'success' },
      target: { rules: target, auditLogs: [], auditResult: 'failure' },
      recoveryHandlerKey: 'admin-commission-rule-v1', recoverySchema: 'admin-commission-rule-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'commission-rules', reason: 'audit result conflict', handlerKey: 'admin-commission-rule-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: false, code: 'handler-failed' })

    expect(readPlatformCommissionRules()).toEqual(target)
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('rejects a legacy target whose auditAction conflicts with the original', async () => {
    const operationId = 'OP-ADMIN-COMMISSION-RULE-AUDIT-ACTION-CONFLICT'
    const original = [{ id: 'CR-AUDIT-ACTION', name: '审计动作冲突', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }]
    const target = [{ ...original[0], rate: 9 }]
    expect(writePlatformCommissionRules(target)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_COMMISSION_RULES_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { rules: original, auditAction: 'commission.rule.update' },
      target: { rules: target, auditAction: 'commission.rule.delete' },
      recoveryHandlerKey: 'admin-commission-rule-v1', recoverySchema: 'admin-commission-rule-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'commission-rules', reason: 'audit action conflict', handlerKey: 'admin-commission-rule-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: false, code: 'handler-failed' })

    expect(readPlatformCommissionRules()).toEqual(target)
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('rolls back an earlier supplier recovery write when a later collection write fails', async () => {
    const operationId = 'OP-ADMIN-SUPPLIER-RECOVERY-ROLLBACK'
    const originalOrders = { 'O-RECOVERY': { ...cloneSeed(orders[0]), id: 'O-RECOVERY' } }
    const targetOrders = { 'O-RECOVERY': { ...originalOrders['O-RECOVERY'], settlementId: 'ST-RECOVERY' } }
    const originalSettlements = {}
    const targetSettlements = { 'ST-RECOVERY': { id: 'ST-RECOVERY', period: '2026-08', supplierIds: ['S001'], orderIds: ['O-RECOVERY'], amount: 10, createdAt: '2026-08-30T10:00:00.000Z', items: [], status: 'pending' as const } }
    expect(writePlatformOrders(targetOrders)).toBe(true)
    expect(writePlatformSupplierSettlements(targetSettlements)).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY],
      original: { orders: originalOrders, settlements: originalSettlements, auditAction: 'supplier.settle' },
      target: { orders: targetOrders, settlements: targetSettlements, auditAction: 'supplier.settle' },
      recoveryHandlerKey: 'admin-supplier-settlement-v1', recoverySchema: 'admin-supplier-settlement-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'supplier-settlements', reason: 'rollback test', handlerKey: 'admin-supplier-settlement-v1' })).toBe(true)
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!
    const setItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY) {
        failed = true
        throw new Error('force later recovery write failure')
      }
      setItem(key, value)
    })

    try {
      expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = setItem
    }

    expect(readPlatformOrders()).toEqual(targetOrders)
    expect(readPlatformSupplierSettlements()).toEqual(targetSettlements)
  })

  it('keeps the business failure audit after retrying owned recovery', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-RECOVERY-FAILURE-AUDIT', name: '恢复失败日志', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]
    expect(writePlatformCommissionRules([original])).toBe(true)
    const writer = vi.spyOn(shared, 'writePlatformCommissionRules').mockReturnValueOnce(false).mockReturnValueOnce(false)

    expect(await store.updateCommissionRule(original.id, 9, false)).toBe(false)
    writer.mockRestore()
    const task = readPlatformRecoveryQueue().find((item) => item.operationId.includes(original.id))!
    const failure = readPlatformAuditLogs().find((entry) => entry.operationId === task.operationId && entry.action === 'commission.rule.update' && entry.result === 'failure')!
    expect(failure).toBeTruthy()

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: true })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ id: failure.id, operationId: task.operationId, result: 'failure' }))
  })

  it('keeps a later administrator audit when retrying owned recovery', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-RECOVERY-CONCURRENT-AUDIT', name: '恢复并发日志', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]
    expect(writePlatformCommissionRules([original])).toBe(true)
    const writer = vi.spyOn(shared, 'writePlatformCommissionRules').mockReturnValueOnce(false).mockReturnValueOnce(false)

    expect(await store.updateCommissionRule(original.id, 9, false)).toBe(false)
    writer.mockRestore()
    const task = readPlatformRecoveryQueue().find((item) => item.operationId.includes(original.id))!
    expect(shared.appendPlatformAuditLog({ module: 'accounts', action: 'admin.concurrent-update', actorId: 'AA-OTHER', result: 'success' })).toBe(true)
    const concurrent = readPlatformAuditLogs().find((entry) => entry.action === 'admin.concurrent-update')!

    expect(await retryPlatformRecoveryTask(task.id, 'recovery-admin')).toMatchObject({ ok: true })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ id: concurrent.id, action: 'admin.concurrent-update' }))
  })

  it('removes only its own success audit when audit journal marking rolls back', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-AUDIT-ROLLBACK-SCOPE', name: '审计范围回滚', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]
    expect(writePlatformCommissionRules([original])).toBe(true)
    const setItem = localStorage.setItem.bind(localStorage)
    let injected = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!injected && key === PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY) {
        const journal = Object.values(JSON.parse(value) as Record<string, { recoveryHandlerKey?: string; completedSteps?: string[] }>).find((entry) => entry.recoveryHandlerKey === 'admin-commission-rule-v1' && entry.completedSteps?.includes('audit'))
        if (journal) {
          injected = true
          shared.appendPlatformAuditLog({ module: 'accounts', action: 'admin.concurrent-during-rollback', actorId: 'AA-OTHER', result: 'success' })
          throw new Error('force audit journal mark failure')
        }
      }
      setItem(key, value)
    })

    try {
      expect(await store.updateCommissionRule(original.id, 9, false)).toBe(false)
    } finally {
      localStorage.setItem = setItem
    }

    const logs = readPlatformAuditLogs()
    expect(logs).toContainEqual(expect.objectContaining({ action: 'admin.concurrent-during-rollback', actorId: 'AA-OTHER' }))
    expect(logs.some((entry) => entry.action === 'commission.rule.update' && entry.result === 'success')).toBe(false)
    expect(logs).toContainEqual(expect.objectContaining({ action: 'commission.rule.update', result: 'failure' }))
  })

  it('persists a commission rule before updating Pinia and keeps it after refresh', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-PERSIST', name: '持久规则', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]
    expect(writePlatformCommissionRules([original])).toBe(true)

    expect(await store.updateCommissionRule(original.id, 9, false)).toBe(true)
    expect(readPlatformCommissionRules()).toContainEqual(expect.objectContaining({ id: original.id, rate: 9, enabled: false }))

    await store.initialize(true)
    expect(store.commissionRules).toContainEqual(expect.objectContaining({ id: original.id, rate: 9, enabled: false }))
  })

  it('audits invalid commission rules as failures without a success record', async () => {
    const store = useAdminStore()
    const original = { id: 'CR-INVALID', name: '校验规则', targetType: 'live' as const, rate: 5, enabled: true, updatedAt: '2026-08-30T09:00:00.000Z' }
    store.commissionRules = [cloneSeed(original)]

    expect(await store.updateCommissionRule(original.id, 0, true)).toBe(false)

    const logs = readPlatformAuditLogs().filter((entry) => entry.action === 'commission.rule.update')
    expect(logs).toContainEqual(expect.objectContaining({ result: 'failure', reason: 'validation-failed' }))
    expect(logs.some((entry) => entry.result === 'success')).toBe(false)
  })

  it('groups dashboard trend by actual order date', () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    const last = store.dailyTrend.at(-1)
    expect(last).toMatchObject({ key: '2026-08-12', count: 11 })
    expect(last!.amount).toBeCloseTo(4589.5, 1)
  })

  it('manages categories with dedupe and in-use delete protection', async () => {
    const store = useAdminStore()
    store.categories = cloneSeed(categories)
    store.products = cloneSeed(products)
    store.suppliers = cloneSeed(suppliers)
    expect(await store.addCategory('有机杂粮', 'supplier')).toBe(true)
    expect(store.categories[0]).toMatchObject({ name: '有机杂粮', type: 'supplier' })
    expect(await store.addCategory('有机杂粮', 'general')).toBe(false)
    expect(await store.updateCategory(store.categories[0].id, '有机杂粮礼盒', 'general')).toBe(true)
    expect(await store.removeCategory('C007')).toBe(false)
    expect(await store.removeCategory('C018')).toBe(true)
    expect(store.categories.some((item) => item.id === 'C018')).toBe(false)
  })

  it('does not create an account before an invited supplier is certified', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(await store.inviteSupplier({ name: '测试鲜果供应商', category: '生鲜农产', contactPhone: '13900009991', coop: true })).toEqual({ ok: true })
    const supplier = store.suppliers.find((item) => item.name === '测试鲜果供应商')!
    expect(supplier).toMatchObject({ certified: false, status: 'pending' })
    expect(readPlatformSupplierAccounts()?.find((item) => item.supplierId === supplier.id)).toBeUndefined()
    expect(await store.auditSupplier(supplier.id, true)).toBe(true)
    expect(readPlatformSupplierAccounts()?.find((item) => item.supplierId === supplier.id)).toMatchObject({ account: '13900009991', password: '13900009991', enabled: true })
  })

  it('keeps an invited supplier after a forced shared-state refresh', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(await store.inviteSupplier({ name: '刷新保留供应商', category: '生鲜农产', contactPhone: '13900009982' })).toEqual({ ok: true })
    const created = store.suppliers.find((item) => item.name === '刷新保留供应商')!

    await store.initialize(true)

    expect(store.suppliers[0]?.id).toBe(created.id)
    expect(store.suppliers.find((item) => item.id === created.id)).toMatchObject({ name: '刷新保留供应商', status: 'pending' })
    expect(readPlatformEntities()?.suppliers?.[created.id]).toMatchObject({ name: '刷新保留供应商', status: 'pending' })
  })

  it('keeps every shared admin snapshot after a forced refresh', async () => {
    const store = useAdminStore()
    const sharedFarm = { ...cloneSeed(farms[0]), id: 'F-SHARED', name: '共享门店' }
    const sharedCategory = { ...cloneSeed(categories[0]), id: 'C-SHARED', name: '共享品类' }
    const sharedPolicy = { id: 'PP-SHARED', name: '共享策略', type: 'group' as const, scope: '共享门店', discount: 95, enabled: true }
    const sharedOrder = { ...cloneSeed(orders[0]), id: 'O-SHARED', customer: '共享订单用户' }
    const sharedAfterSale = { ...cloneSeed(afterSales[0]), id: 'AS-SHARED', orderId: sharedOrder.id }
    const sharedRule = { id: 'CR-SHARED', name: '共享佣金规则', targetType: 'live' as const, rate: 7, enabled: true, updatedAt: '2026-08-30T10:00:00.000Z' }
    const commissionSettlement = { id: 'CS-SHARED', promoterIds: ['T001'], amount: 7, createdAt: '2026-08-30T10:01:00.000Z', items: [{ promoterId: 'T001', promoterName: '共享推客', amount: 7 }] }
    const supplierSettlement = { id: 'ST-SHARED', period: '2026-08', supplierIds: ['S001'], orderIds: [sharedOrder.id], amount: 100, status: 'pending', createdAt: '2026-08-30T10:02:00.000Z', items: [{ supplierId: 'S001', supplierName: '共享供应商', orderIds: [sharedOrder.id], amount: 100 }] }

    expect(writePlatformEntities({ farms: { [sharedFarm.id]: sharedFarm }, categories: { [sharedCategory.id]: sharedCategory }, policies: { [sharedPolicy.id]: sharedPolicy }, updatedAt: '2026-08-30T10:00:00.000Z' })).toBe(true)
    expect(writePlatformOrder(sharedOrder)).toBe(true)
    expect(writePlatformAfterSale(sharedAfterSale)).toBe(true)
    expect(writePlatformCommissionRules([sharedRule])).toBe(true)
    expect(writePlatformCommissionSettlementRecords({ [commissionSettlement.id]: commissionSettlement })).toBe(true)
    expect(writePlatformSupplierSettlements({ [supplierSettlement.id]: supplierSettlement })).toBe(true)

    await store.initialize(true)

    expect(store.farms).toContainEqual(expect.objectContaining({ id: sharedFarm.id, name: sharedFarm.name }))
    expect(store.categories).toContainEqual(expect.objectContaining({ id: sharedCategory.id, name: sharedCategory.name }))
    expect(store.policies).toContainEqual(expect.objectContaining({ id: sharedPolicy.id, name: sharedPolicy.name }))
    expect(store.orders).toContainEqual(expect.objectContaining({ id: sharedOrder.id }))
    expect(store.afterSales).toContainEqual(expect.objectContaining({ id: sharedAfterSale.id }))
    expect(store.commissionRules).toContainEqual(sharedRule)
    expect(store.commissionSettlementRecords).toContainEqual(commissionSettlement)
    expect(store.supplierSettlementRecords).toContainEqual(expect.objectContaining({ id: supplierSettlement.id }))
  })

  it('does not allow supplier profile editing to bypass certification', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.inviteSupplier({ name: '待认证资料供应商', category: '综合品类', contactPhone: '13900009981' })).toEqual({ ok: true })
    const supplier = store.suppliers.find((item) => item.name === '待认证资料供应商')!

    expect(await store.updateSupplier(supplier.id, { ...supplier, coop: true })).toEqual({ ok: true })
    expect(supplier).toMatchObject({ certified: false, status: 'pending' })
    expect(readPlatformSupplierAccounts().some((item) => item.supplierId === supplier.id)).toBe(false)
  })

  it('rejects a supplier phone already bound to another supplier', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(await store.inviteSupplier({ name: '重复手机号供应商', category: '综合品类', contactPhone: '13787366688' })).toEqual({
      ok: false,
      error: '该手机号已绑定其他供应商'
    })
  })

  it('requires a valid phone before creating a supplier account', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(await store.inviteSupplier({ name: '无手机号供应商', category: '综合品类' })).toEqual({ ok: false, error: '请填写联系人手机号' })
    expect(await store.inviteSupplier({ name: '错号供应商', category: '综合品类', contactPhone: '123' })).toEqual({ ok: false, error: '请输入正确的11位手机号' })
    expect(store.suppliers.some((item) => item.name === '无手机号供应商' || item.name === '错号供应商')).toBe(false)
  })

  it('changes supplier credentials only through the account action', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!

    expect(await store.updateSupplierAccount(supplier.id, { account: '13900009992', password: 'custom123' })).toEqual({ ok: true })
    expect(await store.updateSupplier(supplier.id, { ...supplier, contactPhone: '13900009993' })).toEqual({ ok: true })
    expect(readPlatformSupplierAccounts()?.find((item) => item.supplierId === supplier.id)).toMatchObject({
      account: '13900009992',
      password: 'custom123'
    })
  })

  it('rejects an invalid replacement password without changing credentials', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!

    expect(await store.updateSupplierAccount(supplier.id, { password: '123' })).toEqual({ ok: false, error: '密码需6-20位' })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.password).toBe('13787366688')
  })

  it('keeps the credential version when only supplier profile fields change', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const before = store.supplierAccounts.find((item) => item.supplierId === supplier.id)!.updatedAt

    expect(await store.updateSupplier(supplier.id, { ...supplier, region: '湘西州新地址' })).toEqual({ ok: true })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.updatedAt).toBe(before)
  })

  it('supports rejected reset, cooperation pause reason and resume', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.inviteSupplier({ name: '状态供应商', category: '综合品类', contactPhone: '13900009995' })).toEqual({ ok: true })
    const item = store.suppliers.find((supplier) => supplier.name === '状态供应商')!

    expect(await store.auditSupplier(item.id, false)).toBe(true)
    expect(item).toMatchObject({ certified: false, status: 'paused' })
    expect(await store.restoreSupplierPending(item.id)).toBe(true)
    expect(item).toMatchObject({ certified: false, status: 'pending' })
    expect(await store.auditSupplier(item.id, true)).toBe(true)
    expect(await store.pauseSupplier(item.id, '阶段性暂停供货')).toBe(true)
    expect(item).toMatchObject({ certified: true, status: 'paused', cooperationPauseReason: '阶段性暂停供货' })
    expect(await store.resumeSupplier(item.id)).toBe(true)
    expect(item.status).toBe('cooperating')
    expect(item.cooperationPauseReason).toBeUndefined()
    expect(readPlatformAuditLogs().some((entry) => entry.action === 'supplier.pause' && entry.targetId === item.id)).toBe(true)
  })

  it('freezes and unfreezes a certified supplier account without changing cooperation status', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const status = supplier.status

    expect(await store.updateSupplierAccount(supplier.id, { enabled: false, freezeReason: '合同风险' })).toEqual({ ok: true })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.enabled).toBe(false)
    expect(supplier.status).toBe(status)
    expect(await store.updateSupplierAccount(supplier.id, { enabled: true })).toEqual({ ok: true })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.enabled).toBe(true)
  })

  it('显式清空营业执照图片时不恢复旧图，未传许可证图片时保留旧图', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const businessLicense = { source: 'asset' as const, assetId: 'media-business-license' }
    const permit = { source: 'asset' as const, assetId: 'media-permit' }
    supplier.qualification.attachments = [
      { typeCode: 'businessLicense', number: 'BL-001', image: businessLicense },
      { typeCode: 'permit', number: 'PERMIT-001', image: permit }
    ]

    expect(await store.updateSupplier(supplier.id, {
      name: supplier.name,
      category: supplier.category,
      contactPhone: supplier.contactPhone,
      businessLicense: null
    })).toEqual({ ok: true })

    const attachments = supplier.qualification.attachments!
    expect(attachments.find((item) => item.typeCode === 'businessLicense')?.image).not.toEqual(businessLicense)
    expect(attachments.find((item) => item.typeCode === 'permit')?.image).toEqual(permit)
  })
})

describe('admin auth', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('logs in with the demo account and logs out', async () => {
    const store = useAdminStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(await store.login('admin', 'wrong')).toBe(false)
    expect(await store.login('root', '123456')).toBe(false)
    expect(await store.login('admin', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ isLoggedIn: true, account: 'admin', accountId: 'AA-SUPER', roleId: ADMIN_SUPER_ROLE_ID, roleCode: 'super_admin', name: '超级管理员' })
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, account: '', accountId: '', roleId: '', roleCode: '', name: '' })
  })

  it('applies menu and action permissions to direct store calls', async () => {
    const roles = defaultAdminRoles()
    const accounts = [...defaultAdminAccounts(), {
      id: 'AA-OPERATIONS', account: 'operator', password: '123456', name: '运营专员', roleId: 'AR-OPERATIONS', enabled: true,
      createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z'
    }]
    expect(writePlatformAdminRoles(roles)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)

    const store = useAdminStore()
    expect(await store.login('operator', '123456')).toBe(true)
    expect(store.canMenu('suppliers')).toBe(true)
    expect(store.canMenu('accounts')).toBe(false)
    expect(store.can('supplier.create')).toBe(true)
    expect(store.can('admin.account.create')).toBe(false)
    expect(await store.createAdminAccount({ account: 'blocked', password: '123456', name: '越权账号', roleId: 'AR-VIEWER' })).toEqual({ ok: false, error: '无权创建后台账号' })
    expect(readPlatformAdminAccounts().some((item) => item.account === 'blocked')).toBe(false)
  })

  it('lets only the super administrator create roles and admin accounts', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.createAdminRole({ code: 'custom_viewer', name: '自定义只读', menuPermissions: ['dashboard'], actionPermissions: [] })).toEqual({ ok: true })
    const role = readPlatformAdminRoles().find((item) => item.code === 'custom_viewer')!
    expect(role).toBeTruthy()
    expect(await store.createAdminAccount({ account: 'viewer01', password: '123456', name: '查看人员', roleId: role.id })).toEqual({ ok: true })
    expect(readPlatformAdminAccounts().find((item) => item.account === 'viewer01')).toMatchObject({ roleId: role.id, enabled: true })
    expect(readPlatformAuditLogs().some((entry) => entry.action === 'admin.account.create' && entry.targetId)).toBe(true)
  })

  it('separates role profile updates from permission assignment', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.createAdminRole({ code: 'role_split', name: '原角色', menuPermissions: ['dashboard'], actionPermissions: [] })).toEqual({ ok: true })
    const role = readPlatformAdminRoles().find((item) => item.code === 'role_split')!

    expect(await store.updateAdminRole(role.id, { menuPermissions: ['accounts'], actionPermissions: ['admin.account.update'] })).toEqual({ ok: false, error: '权限分配请使用独立权限接口' })
    expect(readPlatformAdminRoles().find((item) => item.id === role.id)).toMatchObject({ name: '原角色', menuPermissions: ['dashboard'], actionPermissions: [] })

    expect(await store.updateAdminRole(role.id, { name: '新角色', enabled: false })).toEqual({ ok: true })
    expect(readPlatformAdminRoles().find((item) => item.id === role.id)).toMatchObject({ name: '新角色', enabled: false, menuPermissions: ['dashboard'], actionPermissions: [] })

    expect(await store.updateAdminRolePermissions(role.id, { menuPermissions: ['dashboard', 'accounts'], actionPermissions: ['admin.account.update'] })).toEqual({ ok: true })
    expect(readPlatformAdminRoles().find((item) => item.id === role.id)).toMatchObject({ menuPermissions: ['dashboard', 'accounts'], actionPermissions: ['admin.account.update'] })
    expect(readPlatformAuditLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'admin.role.update', targetId: role.id, result: 'success' }),
      expect.objectContaining({ action: 'admin.role.permissions', targetId: role.id, result: 'success' })
    ]))
  })

  it('removes button permissions whose owning menus are not selected on every role save', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.createAdminRole({
      code: 'menu_dependency', name: '菜单依赖角色', menuPermissions: ['dashboard'],
      actionPermissions: ['category.manage', 'route.manage', 'report.export']
    })).toEqual({ ok: true })
    const role = readPlatformAdminRoles().find((item) => item.code === 'menu_dependency')!
    expect(role.actionPermissions).toEqual([])

    expect(await store.updateAdminRolePermissions(role.id, {
      menuPermissions: ['dashboard', 'categories'],
      actionPermissions: ['category.manage', 'route.manage']
    })).toEqual({ ok: true })
    expect(readPlatformAdminRoles().find((item) => item.id === role.id)?.actionPermissions).toEqual(['category.manage'])

    expect(await store.updateAdminRolePermissions(role.id, {
      menuPermissions: ['dashboard'],
      actionPermissions: ['category.manage']
    })).toEqual({ ok: true })
    expect(readPlatformAdminRoles().find((item) => item.id === role.id)?.actionPermissions).toEqual([])
  })

  it('protects the last super administrator while allowing regular account updates', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.setAdminAccountEnabled('AA-SUPER', false)).toEqual({ ok: false, error: '不能停用最后一个超级管理员' })
    expect(await store.updateAdminAccount('AA-SUPER', { roleId: 'AR-VIEWER' })).toEqual({ ok: false, error: '不能停用或降级最后一个超级管理员' })
    expect(await store.createAdminAccount({ account: 'viewer02', password: '123456', name: '查看人员二', roleId: 'AR-VIEWER' })).toEqual({ ok: true })
    const account = readPlatformAdminAccounts().find((item) => item.account === 'viewer02')!
    expect(await store.updateAdminAccount(account.id, { name: '只读人员' })).toEqual({ ok: true })
    expect(await store.setAdminAccountEnabled(account.id, false)).toEqual({ ok: true })
    expect(readPlatformAdminAccounts().find((item) => item.id === account.id)).toMatchObject({ name: '只读人员', enabled: false })
  })

  it('requires account status permission only when enabled state actually changes', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.createAdminRole({ code: 'account_editor', name: '账号资料编辑', menuPermissions: ['accounts'], actionPermissions: ['admin.account.update'] })).toEqual({ ok: true })
    const role = readPlatformAdminRoles().find((item) => item.code === 'account_editor')!
    expect(await store.createAdminAccount({ account: 'account-editor', password: '123456', name: '账号编辑员', roleId: role.id })).toEqual({ ok: true })
    const account = readPlatformAdminAccounts().find((item) => item.account === 'account-editor')!
    store.logout()
    expect(await store.login('account-editor', '123456')).toBe(true)

    expect(await store.updateAdminAccount(account.id, { name: '账号资料编辑员' })).toEqual({ ok: true })
    expect(await store.setAdminAccountEnabled(account.id, false)).toEqual({ ok: false, error: '无权启停后台账号' })
  })

  it('separates product create and update permissions for direct store calls', async () => {
    const roles = [...defaultAdminRoles(),
      { id: 'AR-PRODUCT-CREATE', code: 'product_creator', name: '商品新增', menuPermissions: ['products'] as const, actionPermissions: ['product.create'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AR-PRODUCT-UPDATE', code: 'product_updater', name: '商品编辑', menuPermissions: ['products'] as const, actionPermissions: ['product.update'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AR-PRODUCT-STATUS', code: 'product_status', name: '商品上下架', menuPermissions: ['products'] as const, actionPermissions: ['product.status'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    const accounts = [...defaultAdminAccounts(),
      { id: 'AA-PRODUCT-CREATE', account: 'product-create', password: '123456', name: '商品新增员', roleId: 'AR-PRODUCT-CREATE', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AA-PRODUCT-UPDATE', account: 'product-update', password: '123456', name: '商品编辑员', roleId: 'AR-PRODUCT-UPDATE', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AA-PRODUCT-STATUS', account: 'product-status', password: '123456', name: '商品上下架员', roleId: 'AR-PRODUCT-STATUS', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    expect(writePlatformAdminRoles(roles as any)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)

    const creator = useAdminStore()
    expect(await creator.login('product-create', '123456')).toBe(true)
    await creator.initialize()
    const existing = cloneSeed(creator.catalogProducts[0])
    const created = { ...existing, id: 'CAT-PERMISSION-CREATE', name: '新增权限商品', skus: existing.skus.map((sku) => ({ ...sku, id: `NEW-${sku.id}` })) }
    expect(await creator.saveCatalogProduct(created)).toEqual({ ok: true })
    expect(await creator.saveCatalogProduct({ ...existing, name: '越权修改' })).toEqual({ ok: false, error: '无权修改商品' })

    setActivePinia(createPinia())
    const updater = useAdminStore()
    expect(await updater.login('product-update', '123456')).toBe(true)
    await updater.initialize()
    const editable = cloneSeed(updater.catalogProducts.find((item) => item.id === existing.id)!)
    expect(await updater.saveCatalogProduct({ ...editable, name: '授权修改' })).toEqual({ ok: true })
    expect(await updater.saveCatalogProduct({ ...editable, id: 'CAT-PERMISSION-BLOCKED', name: '越权新增' })).toEqual({ ok: false, error: '无权新增商品' })
    expect(await updater.toggleCatalogProduct(editable.id)).toBe(false)

    setActivePinia(createPinia())
    const statusOperator = useAdminStore()
    expect(await statusOperator.login('product-status', '123456')).toBe(true)
    await statusOperator.initialize()
    expect(await statusOperator.toggleCatalogProduct(editable.id)).toBe(true)
  })

  it('denies direct product approval without product.audit permission', async () => {
    const roles = [...defaultAdminRoles(), {
      id: 'AR-PRODUCT-STATUS-ONLY', code: 'product_status_only', name: '商品状态专员', menuPermissions: ['products'] as const,
      actionPermissions: ['product.status'], enabled: true, system: false,
      createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z'
    }]
    const accounts = [...defaultAdminAccounts(), {
      id: 'AA-PRODUCT-STATUS-ONLY', account: 'product-status-only', password: '123456', name: '商品状态专员', roleId: 'AR-PRODUCT-STATUS-ONLY', enabled: true,
      createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z'
    }]
    expect(writePlatformAdminRoles(roles as AdminRole[])).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)
    const store = useAdminStore()
    expect(await store.login('product-status-only', '123456')).toBe(true)
    await store.initialize()
    const catalog = readCatalogState()!
    const template = catalog.products[0]
    const created = await shared.createCatalogProductSubmission({
      id: 'SUB-AUDIT-PERMISSION', source: 'admin', kind: 'create', draft: {
        ...cloneSeed(template), id: 'CAT-AUDIT-PERMISSION', name: '待审核权限商品',
        skus: template.skus.map((sku, index) => ({ ...cloneSeed(sku), id: `CAT-AUDIT-PERMISSION-SKU-${index + 1}` }))
      },
      baseCatalogRevision: catalog.revision,
      submittedBy: 'seed-admin',
      submittedAt: '2026-08-31T12:00:00.000Z'
    }, 0)
    expect(created.ok).toBe(true)

    const result = await (store as unknown as { approveCatalogProductSubmission?: (id: string) => Promise<unknown> }).approveCatalogProductSubmission?.('SUB-AUDIT-PERMISSION')

    expect(result).toMatchObject({ ok: false, code: 'permission_denied' })
    expect(shared.readCatalogProductSubmissions()[0]).toMatchObject({ id: 'SUB-AUDIT-PERMISSION', status: 'pending' })
  })

  it('approves create submissions as offline and records the review audit', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    await store.initialize()
    const catalog = readCatalogState()!
    const template = catalog.products[0]
    const draft: CatalogProduct = {
      ...cloneSeed(template), id: 'CAT-APPROVE-CREATE', name: '首审下架商品', status: 'active',
      skus: template.skus.map((sku, index) => ({ ...cloneSeed(sku), id: `CAT-APPROVE-CREATE-SKU-${index + 1}` }))
    }
    expect(await shared.createCatalogProductSubmission({
      id: 'SUB-APPROVE-CREATE', source: 'admin', kind: 'create', draft,
      baseCatalogRevision: catalog.revision, submittedBy: 'seed-admin', submittedAt: new Date(Date.now() - 1000).toISOString()
    }, 0)).toMatchObject({ ok: true })
    await store.refreshSharedState()

    expect(await store.approveCatalogProductSubmission('SUB-APPROVE-CREATE')).toMatchObject({ ok: true })

    expect(readCatalogState()?.products.find((item) => item.id === draft.id)).toMatchObject({ name: draft.name, status: 'offline' })
    expect(shared.readCatalogProductSubmissions().find((item) => item.id === 'SUB-APPROVE-CREATE')).toMatchObject({ status: 'approved', reviewedBy: store.auth.accountId })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'product.audit.approve', targetId: 'SUB-APPROVE-CREATE', result: 'success' }))
  })

  it('preserves the formal status when approving an update submission', async () => {
    const formal: CatalogProduct = {
      id: 'CAT-APPROVE-UPDATE', name: '正式更新商品', category: '土特产', supplierId: 'S002', supplierName: '湘西腊味合作社',
      source: 'platform', status: 'active', image: '/static/images/bacon.webp', images: [], tags: [], productType: 'goods', expressDelivery: true,
      channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: 'CAT-APPROVE-UPDATE-SKU', name: '标准装', image: '/static/images/bacon.webp', retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }]
    }
    expect(writeCatalogState({ schemaVersion: shared.CATALOG_SCHEMA_VERSION, revision: 0, products: [formal] })).toBe(true)
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    await store.initialize()
    const catalog = readCatalogState()!
    const created = await shared.createCatalogProductSubmission({
      id: 'SUB-APPROVE-UPDATE', source: 'admin', kind: 'update',
      draft: { ...cloneSeed(formal), name: `${formal.name} 审核修改`, status: formal.status === 'active' ? 'offline' : 'active' },
      baseCatalogRevision: catalog.revision, submittedBy: formal.supplierId, submittedAt: new Date(Date.now() - 1000).toISOString()
    }, 0)
    expect(created).toEqual(expect.objectContaining({ ok: true }))
    await store.refreshSharedState()

    expect(await store.approveCatalogProductSubmission('SUB-APPROVE-UPDATE')).toMatchObject({ ok: true })

    expect(readCatalogState()?.products.find((item) => item.id === formal.id)).toMatchObject({ name: `${formal.name} 审核修改`, status: formal.status })
  })

  it('requires a non-empty reason when rejecting a product submission', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    await store.initialize()
    const catalog = readCatalogState()!
    const template = catalog.products[0]
    expect(await shared.createCatalogProductSubmission({
      id: 'SUB-REJECT-REASON', source: 'admin', kind: 'create',
      draft: { ...cloneSeed(template), id: 'CAT-REJECT-REASON', skus: template.skus.map((sku) => ({ ...cloneSeed(sku), id: `REJECT-${sku.id}` })) },
      baseCatalogRevision: catalog.revision, submittedBy: 'seed-admin', submittedAt: new Date(Date.now() - 1000).toISOString()
    }, 0)).toMatchObject({ ok: true })
    await store.refreshSharedState()

    expect(await (store as unknown as { rejectCatalogProductSubmission: (id: string, reason: string) => Promise<unknown> }).rejectCatalogProductSubmission('SUB-REJECT-REASON', '   ')).toMatchObject({ ok: false, code: 'invalid_reason' })
    expect(await (store as unknown as { rejectCatalogProductSubmission: (id: string, reason: string) => Promise<unknown> }).rejectCatalogProductSubmission('SUB-REJECT-REASON', '缺少产地证明')).toMatchObject({ ok: true })

    expect(shared.readCatalogProductSubmissions().find((item) => item.id === 'SUB-REJECT-REASON')).toMatchObject({ status: 'rejected', reviewNote: '缺少产地证明', reviewedBy: store.auth.accountId })
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'product.audit.reject', result: 'success' }))
  })

  it('rolls back catalog and submission review when its success audit fails', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    await store.initialize()
    const catalog = readCatalogState()!
    const template = catalog.products[0]
    expect(await shared.createCatalogProductSubmission({
      id: 'SUB-APPROVE-AUDIT-ROLLBACK', source: 'admin', kind: 'create',
      draft: { ...cloneSeed(template), id: 'CAT-APPROVE-AUDIT-ROLLBACK', skus: template.skus.map((sku) => ({ ...cloneSeed(sku), id: `ROLLBACK-${sku.id}` })) },
      baseCatalogRevision: catalog.revision, submittedBy: 'seed-admin', submittedAt: new Date(Date.now() - 1000).toISOString()
    }, 0)).toMatchObject({ ok: true })
    await store.refreshSharedState()
    const beforeCatalog = cloneSeed(readCatalogState())
    const beforeSubmissions = cloneSeed(shared.readCatalogProductSubmissionState())
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = (key, value) => {
      if (key === PLATFORM_AUDIT_LOG_STORAGE_KEY) throw new Error('force review audit failure')
      originalSetItem(key, value)
    }
    let result: Awaited<ReturnType<typeof store.approveCatalogProductSubmission>>
    try {
      result = await store.approveCatalogProductSubmission('SUB-APPROVE-AUDIT-ROLLBACK')
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(result!).toMatchObject({ ok: false, failedStep: 'audit' })

    expect(readCatalogState()).toEqual(beforeCatalog)
    expect(shared.readCatalogProductSubmissionState()).toEqual(beforeSubmissions)
  })

  it('publishes product.audit separately from product.status in default roles and Chinese groups', () => {
    expect(shared.ALL_ADMIN_ACTION_PERMISSIONS).toContain('product.audit')
    expect(defaultAdminRoles().find((role) => role.code === 'reviewer')?.actionPermissions).toContain('product.audit')
    expect(adminStoreModule.ADMIN_PERMISSION_GROUPS.find((group) => group.key === 'products')?.permissions).toContainEqual({ code: 'product.audit', label: '审核商品' })
  })

  it('blocks supplier status bypasses and records permission denial in the store', async () => {
    const roles = [...defaultAdminRoles(), { id: 'AR-SUPPLIER-VIEW', code: 'supplier_view', name: '供应商查看', menuPermissions: ['suppliers'] as const, actionPermissions: [], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }]
    const accounts = [...defaultAdminAccounts(), { id: 'AA-SUPPLIER-VIEW', account: 'supplier-view', password: '123456', name: '供应商查看员', roleId: 'AR-SUPPLIER-VIEW', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }]
    expect(writePlatformAdminRoles(roles as any)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)
    const store = useAdminStore()
    expect(await store.login('supplier-view', '123456')).toBe(true)
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.certified && item.status === 'cooperating')!
    const pending = store.suppliers.find((item) => !item.certified && item.status === 'pending')!

    expect((await store.inviteSupplier({ name: '越权邀请供应商', category: '土特产', contactPhone: '13900007771' })).ok).toBe(false)
    expect((await store.updateSupplier(supplier.id, { name: '越权修改供应商', category: supplier.category, contactPhone: supplier.contactPhone })).ok).toBe(false)
    expect(await store.auditSupplier(pending.id, true)).toBe(false)
    expect((await store.updateSupplierAccount(supplier.id, { account: supplier.contactPhone })).ok).toBe(false)
    expect(await store.pauseSupplier(supplier.id, '越权暂停')).toBe(false)
    expect(supplier.status).toBe('cooperating')
    expect('toggleSupplier' in store).toBe(false)
    expect('persistSupplierStatus' in store).toBe(false)
    expect(readPlatformAuditLogs()[0]).toMatchObject({ action: 'supplier.pause', result: 'failure', reason: 'permission-denied' })
  })

  it('allows supplier reviewers to restore a rejected supplier to pending', async () => {
    const roles = [...defaultAdminRoles(), { id: 'AR-SUPPLIER-AUDIT', code: 'supplier_audit_only', name: '供应商审核员', menuPermissions: ['suppliers'] as const, actionPermissions: ['supplier.audit'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }]
    const accounts = [...defaultAdminAccounts(), { id: 'AA-SUPPLIER-AUDIT', account: 'supplier-audit', password: '123456', name: '供应商审核员', roleId: 'AR-SUPPLIER-AUDIT', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }]
    expect(writePlatformAdminRoles(roles as any)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)
    const store = useAdminStore()
    expect(await store.login('supplier-audit', '123456')).toBe(true)
    await store.initialize()
    const supplier = store.suppliers.find((item) => !item.certified && item.status === 'pending')!
    expect(await store.auditSupplier(supplier.id, false)).toBe(true)
    expect(await store.restoreSupplierPending(supplier.id)).toBe(true)
    expect(supplier.status).toBe('pending')
  })

  it('separates admin account profile and status actions', async () => {
    const roles = [...defaultAdminRoles(),
      { id: 'AR-ACCOUNT-UPDATE', code: 'account_update', name: '账号资料', menuPermissions: ['accounts'] as const, actionPermissions: ['admin.account.update'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AR-ACCOUNT-STATUS', code: 'account_status', name: '账号启停', menuPermissions: ['accounts'] as const, actionPermissions: ['admin.account.status'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    const accounts = [...defaultAdminAccounts(),
      { id: 'AA-ACCOUNT-UPDATE', account: 'account-update', password: '123456', name: '资料编辑员', roleId: 'AR-ACCOUNT-UPDATE', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AA-ACCOUNT-STATUS', account: 'account-status', password: '123456', name: '状态管理员', roleId: 'AR-ACCOUNT-STATUS', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AA-ACCOUNT-TARGET', account: 'account-target', password: '123456', name: '目标账号', roleId: 'AR-VIEWER', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    expect(writePlatformAdminRoles(roles as any)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)

    const profileStore = useAdminStore()
    expect(await profileStore.login('account-update', '123456')).toBe(true)
    expect(await profileStore.updateAdminAccount('AA-ACCOUNT-TARGET', { name: '资料已修改', enabled: false })).toEqual({ ok: false, error: '账号资料修改不能变更启用状态' })
    expect(await profileStore.updateAdminAccount('AA-ACCOUNT-TARGET', { name: '资料已修改' })).toEqual({ ok: true })
    expect(await profileStore.setAdminAccountEnabled('AA-ACCOUNT-TARGET', false)).toEqual({ ok: false, error: '无权启停后台账号' })

    setActivePinia(createPinia())
    const statusStore = useAdminStore()
    expect(await statusStore.login('account-status', '123456')).toBe(true)
    expect(await statusStore.updateAdminAccount('AA-ACCOUNT-TARGET', { name: '越权资料修改' })).toEqual({ ok: false, error: '无权修改后台账号' })
    expect(await statusStore.setAdminAccountEnabled('AA-ACCOUNT-TARGET', false)).toEqual({ ok: true })
    expect(readPlatformAdminAccounts().find((item) => item.id === 'AA-ACCOUNT-TARGET')).toMatchObject({ name: '资料已修改', enabled: false })
  })

  it('enforces export, recovery, commission, withdrawal and fulfillment permissions in store actions', async () => {
    const roles = [...defaultAdminRoles(),
      { id: 'AR-PERMISSION-NONE', code: 'permission_none', name: '无操作权限', menuPermissions: ['logs', 'commissions', 'orders'] as const, actionPermissions: ['report.export'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AR-PERMISSION-ALL', code: 'permission_all', name: '专项操作权限', menuPermissions: ['logs', 'commissions', 'orders'] as const, actionPermissions: ['audit.export', 'recovery.resolve', 'commission.manage', 'withdrawal.review', 'order.ship', 'order.confirm'], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    const accounts = [...defaultAdminAccounts(),
      { id: 'AA-PERMISSION-NONE', account: 'permission-none', password: '123456', name: '无权限人员', roleId: 'AR-PERMISSION-NONE', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
      { id: 'AA-PERMISSION-ALL', account: 'permission-all', password: '123456', name: '专项操作员', roleId: 'AR-PERMISSION-ALL', enabled: true, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    ]
    expect(writePlatformAdminRoles(roles as any)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)
    expect(writePlatformWithdrawal({ id: 'W-RBAC', requesterType: 'user', requesterId: 'U-RBAC', amount: 10, method: '微信', status: 'pending', requestKey: 'RBAC', createdAt: '2026-08-29T10:00:00.000Z' })).toBe(true)
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'REC-RBAC', operationId: 'OP-RBAC', failedStep: 'audit', reason: '测试恢复', createdAt: '2026-08-29T10:00:00.000Z', status: 'pending' }]))

    const denied = useAdminStore()
    expect(await denied.login('permission-none', '123456')).toBe(true)
    await denied.initialize()
    const previousShare = readShareConfig()
    expect(await denied.recordAuditExport('操作日志', 1)).toBe(false)
    expect(await denied.resolveRecoveryTask('REC-RBAC', { note: '已人工核验', outcome: 'aborted' })).toBe(false)
    expect(denied.error).toBe('无权处理恢复任务')
    expect(await denied.saveShareConfig({ promoterRate: 8, staffRate: 4 })).toBe(false)
    expect(await denied.reviewWithdrawal('W-RBAC', 'approved')).toBeNull()
    expect(await denied.shipOrder(denied.orders.find((item) => item.status === 'pending')?.id || 'O001')).toBe(false)
    expect(await denied.confirmOrder(denied.orders.find((item) => item.status === 'shipping')?.id || 'O002')).toBe(false)
    expect(readShareConfig()).toEqual(previousShare)
    expect(readPlatformWithdrawals()?.['W-RBAC']?.status).toBe('pending')
    expect(readPlatformRecoveryQueue().find((item) => item.id === 'REC-RBAC')?.status).toBe('pending')
    expect(readPlatformAuditLogs().filter((entry) => entry.reason === 'permission-denied').map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'audit.export', 'recovery.resolve', 'commission.config.update', 'withdrawal.approved', 'order.ship', 'order.confirm'
    ]))

    setActivePinia(createPinia())
    const allowed = useAdminStore()
    expect(await allowed.login('permission-all', '123456')).toBe(true)
    await allowed.initialize()
    expect(await allowed.recordAuditExport('操作日志', 2)).toBe(true)
    expect(await allowed.saveShareConfig({ promoterRate: 8, staffRate: 4 })).toBe(true)
    expect((await allowed.reviewWithdrawal('W-RBAC', 'approved'))?.status).toBe('approved')
    expect(await allowed.resolveRecoveryTask('REC-RBAC', { note: '已人工核验并恢复原快照', outcome: 'aborted' })).toBe(true)
    expect(readPlatformAuditLogs().filter((entry) => entry.action === 'recovery.resolve' && entry.targetId === 'REC-RBAC' && entry.result === 'success')).toHaveLength(1)
  })

  it('enforces remaining business permissions for direct store calls', async () => {
    const role = { id: 'AR-DIRECT-VIEW', code: 'direct_view', name: '业务查看', menuPermissions: ['categories', 'prices', 'dict', 'accounts', 'afterSales', 'farms', 'promoters', 'commissions'] as const, actionPermissions: [], enabled: true, system: false, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }
    expect(writePlatformAdminRoles([...defaultAdminRoles(), role] as any)).toBe(true)
    expect(writePlatformAdminAccounts([...defaultAdminAccounts(), { id: 'AA-DIRECT-VIEW', account: 'direct-view', password: '123456', name: '业务查看员', roleId: role.id, enabled: true, createdAt: role.createdAt, updatedAt: role.updatedAt }])).toBe(true)
    const store = useAdminStore()
    expect(await store.login('direct-view', '123456')).toBe(true)
    await store.initialize()

    expect(await store.addCategory('越权品类', 'product')).toBe(false)
    expect(await store.updatePricingDefaults(store.pricingDefaults)).toBe(false)
    expect(await store.addDictGroup({ type: 'unauthorized', name: '越权字典' })).toBe(false)
    expect(await store.addStoreAccount({ farmId: 'F001', name: '越权店员', account: '13900007777', password: '123456', role: 'staff' })).toBe(false)
    expect(await store.createPolicy('越权价格', 'group', '全部门店', 90)).toBe(false)
    expect(await store.initiateAfterSale('O-NOT-FOUND', 'refund', '越权售后')).toBe(false)
    expect(await store.addFarm({ name: '越权门店' } as any)).toBe(false)
    expect(await store.addPromoter({ name: '越权推客', level: '普通推客', status: 'active' })).toBe(false)
    expect(await store.settleCommissions()).toBe(false)

    const deniedActions = readPlatformAuditLogs().filter((entry) => entry.reason === 'permission-denied').map((entry) => entry.action)
    expect(deniedActions).toEqual(expect.arrayContaining(['category.create', 'price.defaults.update', 'dictionary.group.create', 'store-account.create', 'price.policy.create', 'after-sale.create', 'farm.create', 'promoter.create', 'commission.settle']))
  })

  it('keeps a recovery task pending when its success audit cannot be persisted', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'REC-AUDIT-FAIL', operationId: 'OP-AUDIT-FAIL', failedStep: 'audit', reason: '日志写入失败', createdAt: '2026-08-29T10:00:00.000Z', status: 'pending' }]))
    const audit = vi.spyOn(shared, 'appendPlatformAuditLog').mockReturnValue(false)

    expect(await store.resolveRecoveryTask('REC-AUDIT-FAIL', { note: '人工核验完成', outcome: 'aborted' })).toBe(false)
    expect(readPlatformRecoveryQueue().find((item) => item.id === 'REC-AUDIT-FAIL')?.status).toBe('pending')
    audit.mockRestore()
  })

  it('keeps a handler-owned recovery pending when its handler is not registered', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    localStorage.setItem('agritainment-platform-recovery-queue', JSON.stringify([{ id: 'REC-HANDLER-MISSING', operationId: 'OP-HANDLER-MISSING', failedStep: 'orders', reason: '处理器未加载', handlerKey: 'not-loaded', retryCount: 0, createdAt: '2026-08-29T10:00:00.000Z', status: 'pending' }]))
    localStorage.setItem('agritainment-platform-transaction-journal', JSON.stringify({
      'OP-HANDLER-MISSING': { operationId: 'OP-HANDLER-MISSING', collections: ['orders'], original: {}, target: {}, completedSteps: [], status: 'recovery-pending', createdAt: '2026-08-29T10:00:00.000Z', updatedAt: '2026-08-29T10:00:00.000Z' }
    }))

    expect(await store.resolveRecoveryTask('REC-HANDLER-MISSING', { note: '处理器未加载，已人工核验目标快照', outcome: 'committed' })).toBe(false)
    expect(readPlatformRecoveryQueue().find((item) => item.id === 'REC-HANDLER-MISSING')).toMatchObject({ status: 'pending', retryCount: 0 })
    expect(store.error).toContain('恢复处理器尚未加载')
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'recovery.resolve', targetId: 'REC-HANDLER-MISSING', result: 'failure', reason: 'handler-not-registered' }))
  })

  it('invalidates an active admin session when the account or role is disabled', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    const accounts = readPlatformAdminAccounts().map((item) => item.id === 'AA-SUPER' ? { ...item, enabled: false } : item)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)

    await store.initialize(true)
    expect(store.auth.isLoggedIn).toBe(false)
  })

  it('returns a distinct login error for a disabled account or role', async () => {
    const roles = defaultAdminRoles()
    const accounts = defaultAdminAccounts()
    expect(writePlatformAdminRoles(roles)).toBe(true)
    expect(writePlatformAdminAccounts(accounts.map((item) => ({ ...item, enabled: false })))).toBe(true)
    const store = useAdminStore()

    expect(await store.login('admin', '123456')).toBe(false)

    expect(store.error).toBe('账号或角色已停用，请联系超级管理员')
    expect(readPlatformAuditLogs()).toContainEqual(expect.objectContaining({ action: 'admin.login', result: 'failure', reason: 'inactive' }))
  })

  it('优先初始化共享字典且不恢复 city 字典', async () => {
    const initial = readPlatformDictionaries()
    const customized = addDictItem(initial, { id: 'DI-ADMIN-INIT', type: 'productTag', code: 'fresh', label: '共享标签', enabled: true, sort: 0 })!
    expect(await publishPlatformDictionaries(customized, initial.revision)).not.toBeNull()
    const store = useAdminStore()
    await store.initialize()
    expect(store.dictItems).toContainEqual(expect.objectContaining({ code: 'fresh', label: '共享标签' }))
    expect(store.dictGroups.some((group) => group.type === 'city')).toBe(false)
  })

  it('两个后台发布同一 revision 时后者刷新胜者状态', async () => {
    const first = useAdminStore()
    await first.initialize()
    expect(await first.login('admin', '123456')).toBe(true)
    setActivePinia(createPinia())
    const stale = useAdminStore()
    await stale.initialize()
    expect(await stale.login('admin', '123456')).toBe(true)

    expect(await first.addDictItem({ type: 'productTag', code: 'winner', label: '胜者', enabled: true, sort: 0 })).toBe(true)
    expect(await stale.addDictItem({ type: 'productTag', code: 'stale', label: '旧发布者', enabled: true, sort: 0 })).toBe(false)
    expect(stale.dictItems).toContainEqual(expect.objectContaining({ code: 'winner', label: '胜者' }))
    expect(stale.dictItems.some((item) => item.code === 'stale')).toBe(false)
    expect(stale.error).toBe('字典数据已更新，请重试')
  })

  it('manages dictionary items with code uniqueness', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.addDictItem({ type: 'productTag', code: 'fresh', label: '新鲜直供' })).toBe(true)
    expect(await store.addDictItem({ type: 'productTag', code: 'fresh', label: '重复' })).toBe(false)
    const item = store.dictItems.find((candidate) => candidate.type === 'productTag' && candidate.code === 'fresh')!
    expect(await store.updateDictItem(item.id, { label: '每日新鲜直供' })).toBe(true)
    expect(store.dictItems.find((i) => i.id === item.id)?.label).toBe('每日新鲜直供')
    expect(await store.removeDictItem(item.id)).toBe(true)
    expect(store.dictItems.some((candidate) => candidate.id === item.id)).toBe(false)
  })

  it('persists required product category images through dictionary CRUD', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.addDictItem({ type: 'productCategory', code: 'IMAGE-REQUIRED', label: '无图新品类' })).toBe(false)
    expect(await store.addDictItem({
      type: 'productCategory', code: 'IMAGE-CATEGORY', label: '图片品类',
      image: { source: 'asset', assetId: 'media-product-category' }
    })).toBe(true)
    const item = store.dictItems.find((candidate) => candidate.code === 'IMAGE-CATEGORY')!
    expect(item.image).toEqual({ source: 'asset', assetId: 'media-product-category' })
    expect(await store.updateDictItem(item.id, { label: '图片品类已更新', image: undefined })).toBe(false)
    store.catalogProducts = [{ category: item.label } as CatalogProduct]
    expect(await store.removeDictItem(item.id)).toBe(false)
    store.catalogProducts = []
    expect(await store.removeDictItem(item.id)).toBe(true)
  })

  it('uses the product category dictionary as the category-management source of truth', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    const image = { source: 'asset', assetId: 'media-managed-category' } as const
    const replacement = { source: 'asset', assetId: 'media-managed-category-next' } as const

    expect(await store.addCategory('后台统一新品类', 'product', image)).toBe(true)
    const created = store.dictItems.find((item) => item.type === 'productCategory' && item.label === '后台统一新品类')!
    expect(created.image).toEqual(image)
    expect(Object.values(readPlatformEntities()?.categories ?? {}).some((item) => item.name === '后台统一新品类')).toBe(false)

    expect(await store.updateCategory(created.id, '后台统一新品类已改', 'product', replacement)).toBe(true)
    expect(store.dictItems.find((item) => item.id === created.id)).toMatchObject({ label: '后台统一新品类已改', image: replacement })
    store.catalogProducts = [{ category: '后台统一新品类已改' } as CatalogProduct]
    expect(await store.removeCategory(created.id)).toBe(false)
    store.catalogProducts = []
    expect(await store.removeCategory(created.id)).toBe(true)
    expect(store.dictItems.some((item) => item.id === created.id)).toBe(false)
  })

  it('manages dictionary groups and blocks deleting non-empty ones', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    expect(await store.addDictGroup({ type: 'industryDemo', name: '行业类型' })).toBe(true)
    expect(await store.addDictGroup({ type: 'industryDemo', name: '重复类型' })).toBe(false)
    const industry = store.dictGroups.find((g) => g.type === 'industryDemo')!
    expect(await store.updateDictGroup(industry.id, { name: '农旅行业' })).toBe(true)
    expect(await store.addDictItem({ type: 'industryDemo', code: 'agritourism', label: '农旅融合' })).toBe(true)
    expect(await store.removeDictGroup(industry.id)).toBe(false)
    expect(store.error).toBe('该分组下还有字典项，请先清空')
  })

  it('locks system dictionary identity while allowing labels', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.login('admin', '123456')).toBe(true)
    const group = store.dictGroups.find((candidate) => candidate.type === 'orderStatus')!
    const item = store.dictItems.find((candidate) => candidate.type === 'orderStatus')!
    expect(await store.updateDictGroup(group.id, { type: 'renamedStatus' })).toBe(false)
    expect(await store.addDictItem({ type: 'orderStatus', code: 'custom', label: '自定义' })).toBe(false)
    expect(await store.updateDictItem(item.id, { code: 'renamed', label: '新文案' })).toBe(false)
    expect(await store.updateDictItem(item.id, { label: '新文案' })).toBe(true)
    expect(await store.removeDictItem(item.id)).toBe(false)
  })

  it('manages store login accounts', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    store.storeAccounts = []
    expect(await store.addStoreAccount({ farmId: 'F001', name: '测试店员', account: '13900000000', password: '123456', role: 'staff' })).toBe(true)
    expect(await store.addStoreAccount({ farmId: 'F001', name: '重复账号', account: '13900000000', password: '123456', role: 'staff' })).toBe(false)
    const item = store.storeAccounts[0]
    expect(await store.updateStoreAccount(item.id, { role: 'owner' })).toBe(true)
    expect(store.storeAccounts[0].role).toBe('owner')
    expect(await store.toggleStoreAccount(item.id)).toBe(true)
    expect(store.storeAccounts[0].enabled).toBe(false)
  })
  it('writes commission settlement to the platform channel', async () => {
    const store = useAdminStore()
    expect(await store.login('admin', '123456')).toBe(true)
    store.promoters = cloneSeed(promoters)
    writeShareRecords([
      { id: 'SR-S1', userId: 'U1', orderId: 'O1', orderAmount: 100, role: 'promoter', promoterId: 'T001', rate: 5, amount: 5, createdAt: '2026-08-19 10:00' },
      { id: 'SR-S2', userId: 'U2', orderId: 'O2', orderAmount: 100, role: 'promoter', promoterId: 'T001', rate: 3, amount: 3, createdAt: '2026-08-19 10:01' }
    ])
    expect(await store.settleCommissions()).toBe(true)
    expect(readPlatformCommissionSettlement('T001')?.settled).toBe(true)
    expect(readPlatformCommissionSettlement('T001')?.commission).toBe(8)
    expect(pendingShareAmount('T001')).toBe(0)
  })
})
