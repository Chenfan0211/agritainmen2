import { beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_SUPER_ACCOUNT_ID,
  ADMIN_SUPER_ROLE_ID,
  appendPlatformAuditLog,
  authenticateAdmin,
  authenticateSupplier,
  buildSupplierAccountSeeds,
  defaultAdminAccounts,
  defaultAdminRoles,
  hasAdminMenu,
  hasAdminPermission,
  readPlatformAdminAccounts,
  readPlatformAdminRoles,
  readPlatformAuditLogs,
  seedPlatformAdminSecurity,
  supplierCanLogin,
  supplierCanReceiveNewOrders,
  writePlatformAdminAccounts,
  writePlatformAdminRoles,
  type Supplier
} from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size }
  } as Storage
}

const qualification = {
  businessLicense: { source: 'builtin' as const, path: '/static/images/business-license.jpg' },
  permit: { source: 'builtin' as const, path: '/static/images/permit.jpg' },
  validUntil: '2027-12-31',
  reviewNote: ''
}

function supplier(overrides: Partial<Supplier>): Supplier {
  return {
    id: 'S-RBAC',
    name: '权限测试供应商',
    region: '湘西州',
    category: '土特产',
    certified: true,
    status: 'cooperating',
    productCount: 0,
    contactPhone: '13900009991',
    qualification,
    ...overrides
  }
}

describe('admin RBAC and supplier account policy', () => {
  beforeEach(() => localStorage.clear())

  it('creates supplier account seeds only for certified suppliers', () => {
    const accounts = buildSupplierAccountSeeds([
      supplier({ id: 'S-CERTIFIED' }),
      supplier({ id: 'S-PENDING', certified: false, status: 'pending', contactPhone: '13900009992' }),
      supplier({ id: 'S-REJECTED', certified: false, status: 'paused', contactPhone: '13900009993' })
    ])

    expect(accounts.map((item) => item.supplierId)).toEqual(['S-CERTIFIED'])
  })

  it('lets a certified paused supplier login but rejects new orders', () => {
    const paused = supplier({ status: 'paused', cooperationPauseReason: '阶段性暂停供货' })
    const account = buildSupplierAccountSeeds([paused])[0]

    expect(supplierCanLogin(paused, account)).toBe(true)
    expect(authenticateSupplier([account], [paused], account.account, account.password).ok).toBe(true)
    expect(supplierCanReceiveNewOrders(paused, account)).toBe(false)
  })

  it('rejects supplier access and new orders when the supplier account is frozen', () => {
    const active = supplier({})
    const account = { ...buildSupplierAccountSeeds([active])[0], enabled: false }

    expect(supplierCanLogin(active, account)).toBe(false)
    expect(supplierCanReceiveNewOrders(active, account)).toBe(false)
    expect(authenticateSupplier([account], [active], account.account, account.password)).toEqual({ ok: false, reason: 'inactive' })
  })

  it('seeds the existing admin account as the only super administrator', () => {
    expect(seedPlatformAdminSecurity()).toBe(true)
    expect(readPlatformAdminRoles()).toEqual(defaultAdminRoles())
    expect(readPlatformAdminAccounts()).toEqual(defaultAdminAccounts())
    expect(readPlatformAdminAccounts()).toHaveLength(1)
    expect(readPlatformAdminAccounts()[0]).toMatchObject({ id: ADMIN_SUPER_ACCOUNT_ID, roleId: ADMIN_SUPER_ROLE_ID, account: 'admin' })
  })

  it('authenticates enabled accounts and applies menu and action permissions', () => {
    const roles = defaultAdminRoles()
    const accounts = defaultAdminAccounts()
    expect(writePlatformAdminRoles(roles)).toBe(true)
    expect(writePlatformAdminAccounts(accounts)).toBe(true)

    const result = authenticateAdmin(accounts, roles, 'admin', '123456')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(hasAdminMenu(result.role, 'accounts')).toBe(true)
    expect(hasAdminPermission(result.role, 'admin.account.create')).toBe(true)
  })

  it('stores success and failure audit records without password fields', () => {
    expect(appendPlatformAuditLog({
      module: 'accounts',
      action: 'admin.account.update',
      actorId: 'admin',
      actorName: '超级管理员',
      actorRole: 'super_admin',
      targetType: 'admin-account',
      targetId: 'A2',
      result: 'success',
      metadata: { account: 'operator', password: 'secret', contactPhone: '13900009991', idCard: '430101199901011234', nested: { newPassword: 'hidden', enabled: true } }
    })).toBe(true)

    expect(readPlatformAuditLogs()[0]).toMatchObject({ module: 'accounts', result: 'success' })
    expect(JSON.stringify(readPlatformAuditLogs()[0].metadata)).not.toContain('secret')
    expect(JSON.stringify(readPlatformAuditLogs()[0].metadata)).not.toContain('hidden')
    expect(readPlatformAuditLogs()[0].metadata).toEqual({ account: 'operator', password: '[REDACTED]', contactPhone: '[REDACTED]', idCard: '[REDACTED]', nested: { newPassword: '[REDACTED]', enabled: true } })
  })

  it('masks phone accounts in top-level audit identity and metadata', () => {
    expect(appendPlatformAuditLog({
      module: 'auth',
      action: 'admin.login',
      actorId: '13900009991',
      actorName: '13900009991',
      targetType: 'admin-account',
      targetId: '13900009991',
      result: 'failure',
      reason: '账号 13900009991 登录失败，证件 430101199901011234 无效',
      metadata: {
        account: '13900009991',
        password: 'plain-password',
        accessToken: 'plain-token',
        identityNumber: '430101199901011234'
      }
    })).toBe(true)

    const entry = readPlatformAuditLogs()[0]
    expect(entry.actorId).toBe('139****9991')
    expect(entry.actorName).toBe('139****9991')
    expect(entry.targetId).toBe('139****9991')
    expect(entry.reason).toBe('账号 139****9991 登录失败，证件 [REDACTED] 无效')
    expect(entry.metadata).toEqual({
      account: '139****9991',
      password: '[REDACTED]',
      accessToken: '[REDACTED]',
      identityNumber: '[REDACTED]'
    })
    expect(JSON.stringify(entry)).not.toContain('13900009991')
    expect(JSON.stringify(entry)).not.toContain('plain-password')
    expect(JSON.stringify(entry)).not.toContain('plain-token')
    expect(JSON.stringify(entry)).not.toContain('430101199901011234')
  })
})
