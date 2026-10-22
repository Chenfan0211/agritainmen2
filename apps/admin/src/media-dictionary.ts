import { MediaReplacementFinalizeError, normalizeMediaReference, replaceMediaReference } from '@agritainment/shared'
import type { CatalogProduct, DictGroup, DictItem, FarmStore, MediaAssetRepository, MediaReference, PlatformDictionaryState, Supplier, SupplierQualification } from '@agritainment/shared'

type MediaValue = MediaReference | string | null | undefined

export interface AdminMediaBinding {
  bindingId: string
  value: MediaValue
}

export function catalogProductMediaBindings(product?: CatalogProduct | null): AdminMediaBinding[] {
  if (!product) return []
  return [
    { bindingId: `catalog-product:${product.id}:main`, value: product.image },
    ...product.images.map((value, index) => ({ bindingId: `catalog-product:${product.id}:gallery:${index}`, value })),
    ...product.skus.map((sku) => ({ bindingId: `catalog-product:${product.id}:sku:${sku.id}`, value: sku.image }))
  ]
}

export function farmMediaBindings(farm?: FarmStore | null): AdminMediaBinding[] {
  return farm ? [{ bindingId: `farm:${farm.id}:cover`, value: farm.image }] : []
}

export function supplierMediaBindings(supplier?: Supplier | null): AdminMediaBinding[] {
  if (!supplier) return []
  const qualification = readSupplierQualificationFields(supplier.qualification)
  return [
    { bindingId: `supplier:${supplier.id}:qualification:businessLicense`, value: qualification.businessLicense },
    { bindingId: `supplier:${supplier.id}:qualification:permit`, value: qualification.permit }
  ]
}

export function dictionaryItemMediaBindings(item?: DictItem | null): AdminMediaBinding[] {
  return item?.type === 'productCategory'
    ? [{ bindingId: `dictionary-item:${item.id}:image`, value: item.image }]
    : []
}

export class AdminMediaFinalizeError extends Error {
  readonly cause: unknown

  constructor(cause: unknown, readonly retryFinalize: () => Promise<void>) {
    super('媒体资源关联失败，业务数据已保存，请重试')
    this.name = 'AdminMediaFinalizeError'
    this.cause = cause
  }
}

function mediaLifecycleFailure(cause: unknown): Error {
  const error = new Error('媒体资源关联失败，业务数据已保存，请重试') as Error & { cause: unknown }
  error.cause = cause
  return error
}

async function finalizeAdminMediaBinding(storage: MediaAssetRepository, bindingId: string, previous: MediaValue, next: MediaValue): Promise<void> {
  try {
    await replaceMediaReference(storage, bindingId, previous, next, async () => undefined)
  } catch (error) {
    if (error instanceof MediaReplacementFinalizeError) {
      await error.retry()
      return
    }
    throw error
  }
}

interface AdminMediaFinalization {
  bindingId: string
  previous: MediaValue
  next: MediaValue
}

async function finalizeAdminMediaBindings(
  storage: MediaAssetRepository,
  bindings: readonly AdminMediaFinalization[],
  startIndex = 0,
  retryCurrent?: () => Promise<unknown>
): Promise<void> {
  for (let index = startIndex; index < bindings.length; index += 1) {
    const binding = bindings[index]
    if (!binding) continue
    try {
      if (retryCurrent) {
        const retry = retryCurrent
        retryCurrent = undefined
        await retry()
      } else {
        await finalizeAdminMediaBinding(storage, binding.bindingId, binding.previous, binding.next)
      }
    } catch (error) {
      if (error instanceof MediaReplacementFinalizeError) {
        throw new AdminMediaFinalizeError(error, () => finalizeAdminMediaBindings(storage, bindings, index, () => error.retry()))
      }
      throw mediaLifecycleFailure(error)
    }
  }
}

export async function persistAndFinalizeAdminMedia<T>(
  storage: MediaAssetRepository,
  previousBindings: readonly AdminMediaBinding[],
  nextBindings: () => readonly AdminMediaBinding[],
  persistBusinessData: () => Promise<T> | T,
  isSuccess: (result: T) => boolean
): Promise<T> {
  const result = await persistBusinessData()
  if (!isSuccess(result)) return result
  const previous = new Map(previousBindings.map((binding) => [binding.bindingId, binding.value]))
  const next = new Map(nextBindings().map((binding) => [binding.bindingId, binding.value]))
  const bindingIds = new Set([...previous.keys(), ...next.keys()])
  await finalizeAdminMediaBindings(storage, [...bindingIds].map((bindingId) => ({
    bindingId,
    previous: previous.get(bindingId),
    next: next.get(bindingId)
  })))
  return result
}

export function validateCatalogMedia(input: { image: MediaValue; images: readonly MediaValue[]; skus: readonly unknown[] }): string {
  if (!normalizeMediaReference(input.image)) return '请上传商品主图'
  if (input.images.length > 9) return '商品图库最多上传 9 张'
  return ''
}

export function validateDictionaryItemImage(type: string, image: MediaValue): string {
  return type === 'productCategory' && !normalizeMediaReference(image) ? '请上传商品品类图片' : ''
}

export function inheritCatalogSkuImages(product: CatalogProduct): CatalogProduct {
  const mainImage = normalizeMediaReference(product.image)
  if (!mainImage) return product
  return {
    ...product,
    image: mainImage,
    images: (product.images ?? []).map((image) => normalizeMediaReference(image)).filter((image): image is MediaReference => image !== null),
    skus: product.skus.map((sku) => ({ ...sku, image: normalizeMediaReference(sku.image) ?? { ...mainImage } }))
  }
}

interface SupplierQualificationInput {
  businessLicenseNumber?: string
  businessLicense?: MediaValue
  permitNumber?: string
  permit?: MediaValue
  validUntil?: string
  reviewNote?: string
}

const emptyQualificationImage: MediaReference = { source: 'builtin', path: '/static/images/farmhouse.jpg' }

function qualificationImage(value: MediaValue): MediaReference | null {
  if (value && typeof value === 'object') return normalizeMediaReference(value)
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!/^(?:\/?static\/|https?:\/\/|data:image\/|blob:)/i.test(normalized)) return null
  return normalizeMediaReference(normalized)
}

function qualificationNumber(value: MediaValue): string {
  return typeof value === 'string' && !qualificationImage(value) ? value.trim() : ''
}

export interface SupplierQualificationFields {
  businessLicenseNumber: string
  businessLicense: MediaReference | null
  permitNumber: string
  permit: MediaReference | null
  validUntil: string
  reviewNote: string
}

export function readSupplierQualificationFields(qualification: SupplierQualification): SupplierQualificationFields {
  const businessAttachment = qualification.attachments?.find((attachment) => attachment.typeCode === 'businessLicense')
  const permitAttachment = qualification.attachments?.find((attachment) => attachment.typeCode === 'permit')
  return {
    businessLicenseNumber: businessAttachment?.number?.trim() || qualificationNumber(qualification.businessLicense),
    businessLicense: qualificationImage(businessAttachment?.image) ?? qualificationImage(qualification.businessLicense),
    permitNumber: permitAttachment?.number?.trim() || qualificationNumber(qualification.permit),
    permit: qualificationImage(permitAttachment?.image) ?? qualificationImage(qualification.permit),
    validUntil: qualification.validUntil,
    reviewNote: qualification.reviewNote
  }
}

export function buildSupplierQualification(input: SupplierQualificationInput): SupplierQualification {
  const businessLicenseNumber = input.businessLicenseNumber?.trim() || qualificationNumber(input.businessLicense)
  const permitNumber = input.permitNumber?.trim() || qualificationNumber(input.permit)
  const businessLicense = qualificationImage(input.businessLicense) ?? { ...emptyQualificationImage }
  const permit = qualificationImage(input.permit) ?? { ...emptyQualificationImage }
  const validUntil = input.validUntil?.trim() || '待补充'
  const reviewNote = input.reviewNote?.trim() || ''
  return {
    businessLicense: businessLicenseNumber,
    permit: permitNumber,
    validUntil,
    reviewNote,
    attachments: [
      { typeCode: 'businessLicense', number: businessLicenseNumber, image: businessLicense, validUntil, reviewNote },
      { typeCode: 'permit', number: permitNumber, image: permit, validUntil, reviewNote }
    ]
  }
}

interface DictionaryPublishDependencies {
  publish: (state: PlatformDictionaryState, expectedRevision: number) => Promise<PlatformDictionaryState | null>
  read: () => PlatformDictionaryState
}

export async function publishAdminDictionaryMutation(
  current: PlatformDictionaryState,
  mutate: (state: PlatformDictionaryState) => PlatformDictionaryState | null,
  dependencies: DictionaryPublishDependencies
): Promise<{ ok: true; state: PlatformDictionaryState } | { ok: false; reason: 'invalid' | 'conflict'; state: PlatformDictionaryState }> {
  const next = mutate(current)
  if (!next) return { ok: false, reason: 'invalid', state: current }
  const published = await dependencies.publish(next, current.revision)
  return published
    ? { ok: true, state: published }
    : { ok: false, reason: 'conflict', state: dependencies.read() }
}

export interface DictionaryUiPermissions {
  addItem: boolean
  deleteItem: boolean
  editCode: boolean
  deleteGroup: boolean
  editType: boolean
}

export function dictionaryUiPermissions(group?: DictGroup): DictionaryUiPermissions {
  const editable = !!group && group.scope !== 'system' && group.locked !== true
  return { addItem: editable, deleteItem: editable, editCode: editable, deleteGroup: editable, editType: editable }
}

export function dictionaryOperationMessage(ok: boolean, successMessage: string, storeError: string, fallbackError: string): string {
  return ok ? successMessage : storeError || fallbackError
}
