import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { DICTIONARY_SCHEMA_VERSION, MemoryMediaStorageAdapter, bindMediaReference, readMediaAsset } from '@agritainment/shared'
import type { CatalogProduct, DictItem, FarmStore, MediaReference, PlatformDictionaryState, Supplier, SupplierQualification } from '@agritainment/shared'

const helperUrl = new URL('./media-dictionary.ts', import.meta.url)

async function loadHelpers() {
  expect(existsSync(helperUrl), 'admin 媒体/字典 helper 尚未实现').toBe(true)
  return import('./media-dictionary')
}

const asset = (assetId: string): MediaReference => ({ source: 'asset', assetId })
const dimensions = { width: 640, height: 480 }

function lifecycleStorage() {
  return new MemoryMediaStorageAdapter({ objectUrls: { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined } })
}

async function savedAsset(storage: MemoryMediaStorageAdapter, byte: number): Promise<Extract<MediaReference, { source: 'asset' }>> {
  return storage.save(new Blob([Uint8Array.from([byte])], { type: 'image/png' }), `test-${byte}`, dimensions)
}

function lifecycleProduct(image: MediaReference, images: MediaReference[] = [], skuImage: MediaReference = image): CatalogProduct {
  return {
    id: 'P-LIFE', name: '生命周期商品', category: '土特产', supplierId: 'S001', supplierName: '供应商', source: 'platform', status: 'active',
    image, images, tags: [], productType: 'goods', expressDelivery: true, channel: 'all', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: 'SKU-1', name: '默认规格', image: skuImage, retailPrice: 60, cost: 30, stock: 1, level1Amount: 10, level2Amount: 15 }]
  }
}

describe('admin media contracts', () => {
  it('商品主图必传且图库最多 9 张', async () => {
    const { validateCatalogMedia } = await loadHelpers()
    expect(validateCatalogMedia({ image: null, images: [], skus: [] })).toBe('请上传商品主图')
    expect(validateCatalogMedia({ image: asset('MAIN'), images: Array.from({ length: 10 }, (_, index) => asset(`G${index}`)), skus: [] })).toBe('商品图库最多上传 9 张')
    expect(validateCatalogMedia({ image: asset('MAIN'), images: Array.from({ length: 9 }, (_, index) => asset(`G${index}`)), skus: [] })).toBe('')
  })

  it('保存时 SKU 空图继承主图', async () => {
    const { inheritCatalogSkuImages } = await loadHelpers()
    const product = {
      image: asset('MAIN'),
      skus: [{ id: 'S1', image: null }, { id: 'S2', image: asset('SKU') }]
    } as unknown as CatalogProduct
    expect(inheritCatalogSkuImages(product).skus.map((sku: CatalogProduct['skus'][number]) => sku.image)).toEqual([asset('MAIN'), asset('SKU')])
  })

  it('供应商资质分别保存编号、图片、有效期并维护 attachments', async () => {
    const { buildSupplierQualification } = await loadHelpers()
    const qualification = buildSupplierQualification({
      businessLicenseNumber: 'BL-2026-001',
      businessLicense: asset('BL'),
      permitNumber: 'PM-2026-002',
      permit: asset('PM'),
      validUntil: '2028-12-31',
      reviewNote: '待复核'
    }) as SupplierQualification
    expect(qualification.businessLicense).toBe('BL-2026-001')
    expect(qualification.permit).toBe('PM-2026-002')
    expect(qualification.attachments).toEqual([
      { typeCode: 'businessLicense', number: 'BL-2026-001', image: asset('BL'), validUntil: '2028-12-31', reviewNote: '待复核' },
      { typeCode: 'permit', number: 'PM-2026-002', image: asset('PM'), validUntil: '2028-12-31', reviewNote: '待复核' }
    ])
  })

  it('旧资质编号迁入 attachment.number，不会被当作图片 URL', async () => {
    const { buildSupplierQualification, readSupplierQualificationFields } = await loadHelpers()
    const legacy: SupplierQualification = {
      businessLicense: '91433100MA4L8X21',
      permit: 'SC10443310001821',
      validUntil: '2028-06-30',
      reviewNote: '年度复核通过'
    }
    expect(readSupplierQualificationFields(legacy)).toEqual({
      businessLicenseNumber: '91433100MA4L8X21',
      businessLicense: null,
      permitNumber: 'SC10443310001821',
      permit: null,
      validUntil: '2028-06-30',
      reviewNote: '年度复核通过'
    })
    expect(buildSupplierQualification(legacy).attachments).toEqual([
      expect.objectContaining({ typeCode: 'businessLicense', number: '91433100MA4L8X21' }),
      expect.objectContaining({ typeCode: 'permit', number: 'SC10443310001821' })
    ])
  })

  it('只有 static/http/data/blob 字符串和 MediaReference 被识别为资质图片', async () => {
    const { readSupplierQualificationFields } = await loadHelpers()
    expect(readSupplierQualificationFields({
      businessLicense: '/static/images/license.jpg',
      permit: 'https://cdn.example.com/permit.jpg',
      validUntil: '待补充',
      reviewNote: ''
    })).toMatchObject({
      businessLicenseNumber: '',
      businessLicense: { source: 'builtin', path: '/static/images/license.jpg' },
      permitNumber: '',
      permit: { source: 'legacy', url: 'https://cdn.example.com/permit.jpg' }
    })
    expect(readSupplierQualificationFields({
      businessLicense: asset('BL'),
      permit: '资料补充中',
      validUntil: '待补充',
      reviewNote: ''
    })).toMatchObject({ businessLicense: asset('BL'), permitNumber: '资料补充中', permit: null })
  })
})

describe('admin media lifecycle', () => {
  it('为商品品类图片建立稳定绑定并在替换后释放旧图', async () => {
    const { dictionaryItemMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const oldImage = await savedAsset(storage, 81)
    const nextImage = await savedAsset(storage, 82)
    const previous = { id: 'DPC-LIFE', type: 'productCategory', code: 'life', label: '生命周期品类', enabled: true, sort: 1, image: oldImage } as DictItem
    const next = { ...previous, image: nextImage }
    await bindMediaReference(storage, oldImage, 'dictionary-item:DPC-LIFE:image')

    await persistAndFinalizeAdminMedia(storage, dictionaryItemMediaBindings(previous), () => dictionaryItemMediaBindings(next), async () => true, Boolean)

    expect(await readMediaAsset(storage, oldImage.assetId)).toBeNull()
    expect(await readMediaAsset(storage, nextImage.assetId)).toMatchObject({ bindings: ['dictionary-item:DPC-LIFE:image'] })
  })
  it('业务保存成功后为商品 main/gallery/SKU 和供应商资质建立稳定绑定', async () => {
    const { catalogProductMediaBindings, persistAndFinalizeAdminMedia, supplierMediaBindings } = await loadHelpers()
    const storage = lifecycleStorage()
    const [main, gallery, sku, license] = await Promise.all([savedAsset(storage, 1), savedAsset(storage, 2), savedAsset(storage, 3), savedAsset(storage, 4)])
    const supplier = {
      id: 'S-LIFE', qualification: {
        businessLicense: 'BL-1', permit: '', validUntil: '2028-01-01', reviewNote: '',
        attachments: [{ typeCode: 'businessLicense', number: 'BL-1', image: license }]
      }
    } as unknown as Supplier

    await persistAndFinalizeAdminMedia(storage, [], () => [
      ...catalogProductMediaBindings(lifecycleProduct(main, [gallery], sku)),
      ...supplierMediaBindings(supplier)
    ], async () => ({ ok: true as const }), (result: { ok: boolean }) => result.ok)

    expect(await readMediaAsset(storage, main.assetId)).toMatchObject({ status: 'bound', bindings: ['catalog-product:P-LIFE:main'] })
    expect(await readMediaAsset(storage, gallery.assetId)).toMatchObject({ bindings: ['catalog-product:P-LIFE:gallery:0'] })
    expect(await readMediaAsset(storage, sku.assetId)).toMatchObject({ bindings: ['catalog-product:P-LIFE:sku:SKU-1'] })
    expect(await readMediaAsset(storage, license.assetId)).toMatchObject({ bindings: ['supplier:S-LIFE:qualification:businessLicense'] })
  })

  it('业务保存失败时不绑定刚上传的 pending asset', async () => {
    const { catalogProductMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const main = await savedAsset(storage, 11)
    const result = await persistAndFinalizeAdminMedia(
      storage, [], () => catalogProductMediaBindings(lifecycleProduct(main)),
      async () => ({ ok: false as const, error: '业务保存失败' }),
      (saved: { ok: boolean }) => saved.ok
    )
    expect(result).toEqual({ ok: false, error: '业务保存失败' })
    expect(await readMediaAsset(storage, main.assetId)).toMatchObject({ status: 'pending', bindings: [] })
  })

  it('替换成功后解绑并删除无其他引用的旧资源', async () => {
    const { catalogProductMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const oldMain = await savedAsset(storage, 21)
    const nextMain = await savedAsset(storage, 22)
    await bindMediaReference(storage, oldMain, 'catalog-product:P-LIFE:main')
    await persistAndFinalizeAdminMedia(
      storage,
      catalogProductMediaBindings(lifecycleProduct(oldMain)),
      () => catalogProductMediaBindings(lifecycleProduct(nextMain)),
      async () => true,
      Boolean
    )
    expect(await readMediaAsset(storage, oldMain.assetId)).toBeNull()
    expect(await readMediaAsset(storage, nextMain.assetId)).toMatchObject({ bindings: expect.arrayContaining(['catalog-product:P-LIFE:main']) })
  })

  it('显式删除门店封面后解绑旧资源', async () => {
    const { farmMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const oldCover = await savedAsset(storage, 31)
    await bindMediaReference(storage, oldCover, 'farm:F-LIFE:cover')
    const previous = { id: 'F-LIFE', image: oldCover } as unknown as FarmStore
    const next = { id: 'F-LIFE', image: { source: 'builtin', path: '/static/images/farmhouse.jpg' } } as unknown as FarmStore
    await persistAndFinalizeAdminMedia(storage, farmMediaBindings(previous), () => farmMediaBindings(next), async () => true, Boolean)
    expect(await readMediaAsset(storage, oldCover.assetId)).toBeNull()
  })

  it('finalize 首次失败时自动 retry 一次', async () => {
    const { catalogProductMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const main = await savedAsset(storage, 41)
    const original = storage.runAssetTransaction.bind(storage)
    let calls = 0
    vi.spyOn(storage, 'runAssetTransaction').mockImplementation(async (execute) => {
      calls += 1
      if (calls === 2) throw new Error('transient finalize failure')
      return original(execute)
    })
    await expect(persistAndFinalizeAdminMedia(storage, [], () => [{ bindingId: 'catalog-product:P-LIFE:main', value: main }], async () => true, Boolean)).resolves.toBe(true)
    expect(calls).toBe(3)
    expect(await readMediaAsset(storage, main.assetId)).toMatchObject({ bindings: ['catalog-product:P-LIFE:main'] })
  })

  it('finalize retry 仍失败时向 UI 抛出明确错误', async () => {
    const { catalogProductMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const main = await savedAsset(storage, 51)
    const original = storage.runAssetTransaction.bind(storage)
    let calls = 0
    vi.spyOn(storage, 'runAssetTransaction').mockImplementation(async (execute) => {
      calls += 1
      if (calls === 2 || calls === 3) throw new Error('persistent finalize failure')
      return original(execute)
    })
    await expect(persistAndFinalizeAdminMedia(storage, [], () => [{ bindingId: 'catalog-product:P-LIFE:main', value: main }], async () => true, Boolean))
      .rejects.toThrow('媒体资源关联失败，业务数据已保存，请重试')
    expect(calls).toBe(3)
  })

  it('新增供应商 finalize 连续失败后可只恢复绑定，不重复创建业务实体', async () => {
    const { persistAndFinalizeAdminMedia, supplierMediaBindings } = await loadHelpers()
    const storage = lifecycleStorage()
    const license = await savedAsset(storage, 61)
    const created: Supplier[] = []
    const supplier = {
      id: 'S-RECOVER', name: '恢复测试供应商', region: '湖南省', category: '生鲜农产', certified: false,
      status: 'pending', productCount: 0, contactPhone: '13900000001',
      qualification: {
        businessLicense: 'BL-RECOVER', permit: '', validUntil: '2028-01-01', reviewNote: '',
        attachments: [{ typeCode: 'businessLicense', number: 'BL-RECOVER', image: license }]
      }
    } as unknown as Supplier
    const original = storage.runAssetTransaction.bind(storage)
    let transactionCalls = 0
    vi.spyOn(storage, 'runAssetTransaction').mockImplementation(async (execute) => {
      transactionCalls += 1
      if (transactionCalls === 2 || transactionCalls === 3) throw new Error('persistent supplier finalize failure')
      return original(execute)
    })
    let persistCalls = 0
    let failure: unknown

    try {
      await persistAndFinalizeAdminMedia(storage, [], () => supplierMediaBindings(created[0]), () => {
        persistCalls += 1
        created.push(supplier)
        return { ok: true as const }
      }, (result: { ok: boolean }) => result.ok)
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      message: '媒体资源关联失败，业务数据已保存，请重试',
      retryFinalize: expect.any(Function)
    })
    await (failure as { retryFinalize(): Promise<void> }).retryFinalize()
    expect(persistCalls).toBe(1)
    expect(created).toHaveLength(1)
    expect(await readMediaAsset(storage, license.assetId)).toMatchObject({
      status: 'bound', bindings: ['supplier:S-RECOVER:qualification:businessLicense']
    })
  })

  it('新增门店恢复 finalize 再失败时仍保留恢复能力且不重复创建', async () => {
    const { farmMediaBindings, persistAndFinalizeAdminMedia } = await loadHelpers()
    const storage = lifecycleStorage()
    const cover = await savedAsset(storage, 71)
    const created: FarmStore[] = []
    const farm = { id: 'F-RECOVER', name: '恢复测试门店', image: cover } as unknown as FarmStore
    const original = storage.runAssetTransaction.bind(storage)
    let transactionCalls = 0
    vi.spyOn(storage, 'runAssetTransaction').mockImplementation(async (execute) => {
      transactionCalls += 1
      if (transactionCalls === 2 || transactionCalls === 3 || transactionCalls === 4) throw new Error('persistent farm finalize failure')
      return original(execute)
    })
    let persistCalls = 0
    let firstFailure: unknown

    try {
      await persistAndFinalizeAdminMedia(storage, [], () => farmMediaBindings(created[0]), () => {
        persistCalls += 1
        created.push(farm)
        return true
      }, Boolean)
    } catch (error) {
      firstFailure = error
    }

    let secondFailure: unknown
    try {
      await (firstFailure as { retryFinalize(): Promise<void> }).retryFinalize()
    } catch (error) {
      secondFailure = error
    }
    expect(secondFailure).toMatchObject({
      message: '媒体资源关联失败，业务数据已保存，请重试',
      retryFinalize: expect.any(Function)
    })
    await (secondFailure as { retryFinalize(): Promise<void> }).retryFinalize()
    expect(persistCalls).toBe(1)
    expect(created).toHaveLength(1)
    expect(await readMediaAsset(storage, cover.assetId)).toMatchObject({ status: 'bound', bindings: ['farm:F-RECOVER:cover'] })
  })
})

describe('admin dictionary contracts', () => {
  const state: PlatformDictionaryState = {
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    revision: 3,
    updatedAt: '2026-08-26T00:00:00.000Z',
    groups: [{ id: 'DG', type: 'afterSaleReason', name: '售后原因', scope: 'business', locked: false, enabled: true }],
    items: [{ id: 'DI', type: 'afterSaleReason', code: 'quality', label: '质量问题', enabled: true, sort: 0 }]
  }

  it('商品品类必须有图片，其他字典项不受影响', async () => {
    const { validateDictionaryItemImage } = await loadHelpers()
    expect(validateDictionaryItemImage('productCategory', null)).toBe('请上传商品品类图片')
    expect(validateDictionaryItemImage('productCategory', asset('CATEGORY'))).toBe('')
    expect(validateDictionaryItemImage('afterSaleReason', null)).toBe('')
  })

  it('发布冲突时刷新共享状态且不静默覆盖', async () => {
    const { publishAdminDictionaryMutation } = await loadHelpers()
    const fresh = { ...state, revision: 4, items: [{ ...state.items[0], label: '外部更新' }] }
    const publish = vi.fn().mockResolvedValue(null)
    const read = vi.fn().mockReturnValue(fresh)
    const result = await publishAdminDictionaryMutation(state, () => ({ ...state, items: [] }), { publish, read })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ items: [] }), 3)
    expect(result).toEqual({ ok: false, reason: 'conflict', state: fresh })
  })

  it('系统分组锁定身份入口，业务分组保留完整 CRUD', async () => {
    const { dictionaryUiPermissions } = await loadHelpers()
    expect(dictionaryUiPermissions({ id: 'SYS', type: 'orderStatus', name: '订单状态', scope: 'system', locked: true, enabled: true })).toEqual({ addItem: false, deleteItem: false, editCode: false, deleteGroup: false, editType: false })
    expect(dictionaryUiPermissions(state.groups[0])).toEqual({ addItem: true, deleteItem: true, editCode: true, deleteGroup: true, editType: true })
  })

  it('字典 UI 优先展示 store 错误原文并保留非空删除提示', async () => {
    const { dictionaryOperationMessage } = await loadHelpers()
    expect(dictionaryOperationMessage(false, '字典项已删除', '字典数据已更新，请重试', '系统字典项不可删除')).toBe('字典数据已更新，请重试')
    expect(dictionaryOperationMessage(false, '分组已删除', '', '该分组下还有字典项，请先清空')).toBe('该分组下还有字典项，请先清空')
    expect(dictionaryOperationMessage(true, '分组已删除', '旧错误', '删除失败')).toBe('分组已删除')
  })
})

describe('admin source integration', () => {
  const pageSource = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
  const storeSource = readFileSync(new URL('./stores/admin.ts', import.meta.url), 'utf8')

  it('媒体展示和编辑使用共享组件，不再保存 Base64 或主图地址', () => {
    expect(pageSource).not.toContain('主图地址')
    expect(pageSource).not.toContain('fileToImageDataUrl')
    expect(pageSource).not.toMatch(/<image[^>]+:(?:src)="(?:product|selectedFarm|selectedSupplier|form\.|catalogProduct)/)
    expect(pageSource).toContain('<BusinessImage')
    expect(pageSource).toContain('<ImageUploader')
  })

  it('商品、门店和供应商保存成功后统一最终化媒体绑定', () => {
    expect(pageSource).toContain('persistAndFinalizeAdminMedia')
    expect(pageSource).toContain('catalogProductMediaBindings')
    expect(pageSource).toContain('farmMediaBindings')
    expect(pageSource).toContain('supplierMediaBindings')
  })

  it('新增供应商和门店的 UI 重试只恢复媒体最终化', () => {
    expect(pageSource).toContain('AdminMediaFinalizeError')
    expect(pageSource).toContain('pendingCreateMediaRetry')
  })

  it('字典初始化与 CRUD 使用共享读写 API，并停止读取 city 字典', () => {
    expect(storeSource).toContain('readPlatformDictionaries')
    expect(storeSource).toContain('canPublishPlatformDictionaries')
    expect(storeSource).toContain('writePlatformJson(PLATFORM_DICTIONARIES_STORAGE_KEY')
    expect(storeSource).toContain("permission: AdminPermissionCode = 'dictionary.manage'")
    expect(storeSource).toContain('executeAdminTransaction(permission')
    expect(storeSource).not.toMatch(/type === ['"]city['"]/)
    expect(pageSource).not.toMatch(/type === ['"]city['"]/)
  })

  it('系统分组 UI 隐藏新增、删除和改编码入口', () => {
    expect(pageSource).toContain('activeDictionaryPermissions.addItem')
    expect(pageSource).toContain('activeDictionaryPermissions.deleteItem')
    expect(pageSource).toContain(':disabled="!activeDictionaryPermissions.editCode"')
    expect(pageSource).toContain('activeDictionaryPermissions.deleteGroup')
  })
})
