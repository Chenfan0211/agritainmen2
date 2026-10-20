import type { DictGroup, DictItem, DictType } from './index'
import { normalizeMediaReference } from './media'
import { defaultProductCategoryImage } from './product-category-images'

export const DICTIONARY_SCHEMA_VERSION = 2 as const
export const PLATFORM_DICTIONARIES_STORAGE_KEY = 'agritainment-platform-dictionaries'
export const PLATFORM_DICTIONARY_PUBLISH_LOCK_NAME = 'agritainment-platform-dictionaries:publish'

export interface DictionaryPublishLock {
  runExclusive<T>(execute: () => Promise<T> | T): Promise<T>
}

class SerialDictionaryPublishLock implements DictionaryPublishLock {
  private tail: Promise<void> = Promise.resolve()

  runExclusive<T>(execute: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(execute)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

const serialDictionaryPublishLock = new SerialDictionaryPublishLock()

export function defaultDictionaryPublishLock(): DictionaryPublishLock {
  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!lockManager) return serialDictionaryPublishLock
  return {
    async runExclusive<T>(execute: () => Promise<T> | T): Promise<T> {
      return await lockManager.request(PLATFORM_DICTIONARY_PUBLISH_LOCK_NAME, () => execute())
    }
  }
}

export interface PlatformDictionaryState {
  schemaVersion: typeof DICTIONARY_SCHEMA_VERSION
  revision: number
  groups: DictGroup[]
  items: DictItem[]
  updatedAt: string
}

export interface DictOptionsInput {
  state?: PlatformDictionaryState
  includeDisabled?: boolean
}

export type NewDictGroup = Pick<DictGroup, 'id' | 'type' | 'name'> & Partial<Pick<DictGroup, 'enabled'>>
export type DictGroupChanges = Partial<Omit<DictGroup, 'id'>>
export type NewDictItem = Omit<DictItem, 'tone'> & Partial<Pick<DictItem, 'tone'>>
export type DictItemChanges = Partial<Omit<DictItem, 'id'>>

export const BUSINESS_DICTIONARY_TYPES = [
  'productCategory', 'supplierCategory', 'generalCategory', 'productTag', 'farmTag',
  'afterSaleReason', 'qualificationType', 'promoterType', 'promoterLevel',
  'unit', 'logistics', 'withdrawMethod'
] as const

export const SYSTEM_DICTIONARY_TYPES = [
  'supplierStatus', 'productStatus', 'farmStatus', 'orderStatus', 'fulfillmentStatus', 'afterSaleStatus',
  'promoterStatus', 'voucherStatus', 'settlementStatus', 'commissionStatus',
  'productSource', 'productType', 'catalogChannel', 'deliveryMode', 'afterSaleType', 'refundMethod',
  'refundMode', 'pricePolicyType', 'accountRole', 'commissionTargetType'
] as const

const systemTypes = new Set<string>(SYSTEM_DICTIONARY_TYPES)
const categoryTypes = new Set<string>(['productCategory', 'supplierCategory', 'generalCategory'])
const tones = new Set<NonNullable<DictItem['tone']>>(['default', 'success', 'warning', 'danger'])

function isSystemGroup(group: Pick<DictGroup, 'type' | 'scope' | 'locked'>): boolean {
  return systemTypes.has(group.type) || group.scope === 'system' || !!group.locked
}

const builtInLabels: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  supplierStatus: { pending: '待处理', cooperating: '合作中', paused: '已暂停', rejected: '已驳回' },
  productStatus: { pending: '待审核', active: '已上架', offline: '已下架', rejected: '已驳回' },
  farmStatus: { pending: '筹备中', active: '经营中', paused: '已停用' },
  orderStatus: { pending: '待发货', shipping: '已发货', delivered: '已完成', 'after-sale': '售后中', 'paid-cancelled': '已支付取消', 'unpaid-cancelled': '未支付取消' },
  fulfillmentStatus: { submitted: '待接单', accepted: '已接单', shipped: '已发货', delivering: '配送中', received: '已收货', completed: '已完成', cancelled: '已取消' },
  afterSaleStatus: { processing: '售后中', rejected: '售后拒绝', 'refund-pending': '待退款', 'return-pending': '待退货', refunded: '已退款', 'refund-failed': '退款失败' },
  promoterStatus: { active: '启用', paused: '停用', pending: '待审核' },
  voucherStatus: { paid: '待核销', redeemed: '已核销', refunded: '已退款' },
  settlementStatus: { settled: '已结算', pending: '待结算', processing: '处理中' },
  commissionStatus: { pending: '待入账', available: '可提现', completed: '已完成' },
  productSource: { platform: '平台商品', farmhouse: '门店商品' },
  productType: { goods: '实物商品', package: '套餐券' },
  catalogChannel: { store: '门店', live: '用户端', all: '全渠道' },
  deliveryMode: { pickup: '到店自提', courier: '快递配送' },
  afterSaleType: { refund: '退款', return: '退货退款', reship: '补发', claim: '理赔' },
  refundMethod: { return: '退货退款', only: '仅退款' },
  refundMode: { full: '全额退款', ratio: '按比例退款', custom: '自定义退款' },
  pricePolicyType: { normal: '普通策略', tiered: '阶梯策略' },
  accountRole: { owner: '店主', staff: '店员', customer: '客户', manager: '管理员' },
  commissionTargetType: { farm: '门店', product: '商品' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneState(state: PlatformDictionaryState): PlatformDictionaryState {
  return {
    ...state,
    groups: state.groups.map((group) => ({ ...group })),
    items: state.items.map((item) => ({ ...item }))
  }
}

function normalizeGroup(value: unknown): DictGroup | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const type = typeof value.type === 'string' ? value.type.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!id || !type || !name || type === 'city') return null
  const system = systemTypes.has(type)
  return {
    id,
    type,
    name,
    scope: system ? 'system' : 'business',
    locked: system,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true
  }
}

function normalizeItem(value: unknown): DictItem | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const type = typeof value.type === 'string' ? value.type.trim() : ''
  const code = typeof value.code === 'string' ? value.code.trim() : ''
  const label = typeof value.label === 'string' ? value.label.trim() : ''
  if (!id || !type || !code || !label || type === 'city') return null
  const tone = typeof value.tone === 'string' && tones.has(value.tone as NonNullable<DictItem['tone']>)
    ? value.tone as NonNullable<DictItem['tone']>
    : undefined
  const image = normalizeMediaReference(value.image as DictItem['image'])
  return {
    id,
    type,
    code,
    label,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    sort: typeof value.sort === 'number' && Number.isFinite(value.sort) ? value.sort : 0,
    ...(tone ? { tone } : {}),
    ...(type === 'productCategory' ? { image: image ?? defaultProductCategoryImage(label) } : image ? { image } : {})
  }
}

function mergeGroups(defaults: readonly DictGroup[], values: DictGroup[], includeBusinessDefaults: boolean): DictGroup[] {
  const merged = new Map<string, DictGroup>()
  if (includeBusinessDefaults) defaults.forEach((group) => merged.set(group.type, { ...group }))
  else defaults.filter((group) => group.scope === 'system').forEach((group) => merged.set(group.type, { ...group }))
  values.forEach((group) => merged.set(group.type, group))
  return [...merged.values()].filter((group) => group.type !== 'city')
}

function mergeItems(defaults: readonly DictItem[], values: DictItem[], includeBusinessDefaults: boolean): DictItem[] {
  const defaultSystemTypes = new Set(defaults.filter((item) => systemTypes.has(item.type)).map((item) => item.type))
  const merged = new Map<string, DictItem>()
  defaults
    .filter((item) => includeBusinessDefaults || defaultSystemTypes.has(item.type))
    .forEach((item) => merged.set(`${item.type}\u0000${item.code}`, { ...item }))
  values.forEach((item) => merged.set(`${item.type}\u0000${item.code}`, item))
  return [...merged.values()].filter((item) => item.type !== 'city')
}

function normalizeCategoryCode(item: DictItem, defaults: readonly DictItem[]): DictItem {
  if (!categoryTypes.has(item.type)) return item
  const matched = defaults.find((candidate) => candidate.type === item.type
    && (candidate.code === item.code || candidate.label === item.code || candidate.label === item.label))
  return matched ? { ...item, code: matched.code } : item
}

export function createInitialPlatformDictionaries(groups: readonly DictGroup[], items: readonly DictItem[]): PlatformDictionaryState {
  return {
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    revision: 0,
    groups: groups.filter((group) => group.type !== 'city').map((group) => ({ ...group })),
    items: items.filter((item) => item.type !== 'city').map((item) => ({ ...item })),
    updatedAt: new Date(0).toISOString()
  }
}

export function migratePlatformDictionaries(
  value: unknown,
  defaultGroups: readonly DictGroup[],
  defaultItems: readonly DictItem[]
): PlatformDictionaryState {
  if (!isRecord(value)) return createInitialPlatformDictionaries(defaultGroups, defaultItems)
  const currentSchema = value.schemaVersion === DICTIONARY_SCHEMA_VERSION
  const groups = (Array.isArray(value.groups) ? value.groups : []).map(normalizeGroup).filter((group): group is DictGroup => !!group)
  const items = (Array.isArray(value.items) ? value.items : [])
    .map(normalizeItem)
    .filter((item): item is DictItem => !!item)
    .map((item) => normalizeCategoryCode(item, defaultItems))
  const mergedGroups = mergeGroups(defaultGroups, groups, !currentSchema)
  const groupTypes = new Set(mergedGroups.map((group) => group.type))
  const mergedItems = mergeItems(defaultItems, items, !currentSchema).filter((item) => groupTypes.has(item.type))
  const seenIds = new Set<string>()
  const seenCodes = new Set<string>()
  const uniqueItems = mergedItems.filter((item) => {
    const codeKey = `${item.type}\u0000${item.code}`
    if (seenIds.has(item.id) || seenCodes.has(codeKey)) return false
    seenIds.add(item.id)
    seenCodes.add(codeKey)
    return true
  })
  return {
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    revision: Number.isInteger(value.revision) && Number(value.revision) >= 0 ? Number(value.revision) : 0,
    groups: mergedGroups,
    items: uniqueItems,
    updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
      ? value.updatedAt
      : new Date(0).toISOString()
  }
}

export function mergeLegacyProductCategories(state: PlatformDictionaryState, values: unknown): PlatformDictionaryState {
  if (!Array.isArray(values)) return state
  const categories = values
    .filter(isRecord)
    .map((value) => ({
      id: typeof value.id === 'string' ? value.id.trim() : '',
      name: typeof value.name === 'string' ? value.name.trim() : '',
      type: value.type
    }))
    .filter((value) => value.id && value.name && value.type === 'product')
    .sort((left, right) => left.id.localeCompare(right.id) || left.name.localeCompare(right.name))
  if (!categories.length) return state

  const next = cloneState(state)
  const productItems = next.items.filter((item) => item.type === 'productCategory')
  const labels = new Set(productItems.map((item) => item.label.trim()))
  const codes = new Set(productItems.map((item) => item.code))
  const ids = new Set(next.items.map((item) => item.id))
  let sort = productItems.reduce((maximum, item) => Math.max(maximum, item.sort), 0)
  const uniqueValue = (base: string, used: Set<string>): string => {
    if (!used.has(base)) return base
    let suffix = 2
    while (used.has(`${base}-${suffix}`)) suffix += 1
    return `${base}-${suffix}`
  }

  categories.forEach((category) => {
    if (labels.has(category.name)) return
    const code = uniqueValue(category.id, codes)
    const id = uniqueValue(`legacy-product-category-${category.id}`, ids)
    sort += 10
    next.items.push({
      id,
      type: 'productCategory',
      code,
      label: category.name,
      enabled: true,
      sort,
      image: defaultProductCategoryImage(category.name)
    })
    labels.add(category.name)
    codes.add(code)
    ids.add(id)
  })
  return next
}

export function addDictGroup(state: PlatformDictionaryState, input: NewDictGroup): PlatformDictionaryState | null {
  const group = normalizeGroup({ ...input, scope: 'business', locked: false, enabled: input.enabled ?? true })
  if (!group || systemTypes.has(group.type) || state.groups.some((candidate) => candidate.id === group.id || candidate.type === group.type)) return null
  const next = cloneState(state)
  next.groups.push(group)
  return next
}

export function updateDictGroup(state: PlatformDictionaryState, id: string, changes: DictGroupChanges): PlatformDictionaryState | null {
  const current = state.groups.find((group) => group.id === id)
  if (!current) return null
  if (isSystemGroup(current)) {
    if ((changes.type !== undefined && changes.type !== current.type)
      || (changes.name !== undefined && changes.name !== current.name)
      || (changes.scope !== undefined && changes.scope !== current.scope)
      || (changes.locked !== undefined && changes.locked !== current.locked)) return null
    const next = cloneState(state)
    next.groups = next.groups.map((group) => group.id === id ? { ...group, enabled: changes.enabled ?? group.enabled } : group)
    return next
  }
  const type = changes.type?.trim() || current.type
  const name = changes.name?.trim() || current.name
  if (!type || !name || type === 'city' || systemTypes.has(type)) return null
  if (state.groups.some((group) => group.id !== id && group.type === type)) return null
  const next = cloneState(state)
  next.groups = next.groups.map((group) => group.id === id
    ? { ...group, type, name, enabled: changes.enabled ?? group.enabled, scope: 'business', locked: false }
    : group)
  if (type !== current.type) next.items = next.items.map((item) => item.type === current.type ? { ...item, type } : item)
  return next
}

export function removeDictGroup(state: PlatformDictionaryState, id: string): PlatformDictionaryState | null {
  const group = state.groups.find((candidate) => candidate.id === id)
  if (!group || isSystemGroup(group) || state.items.some((item) => item.type === group.type)) return null
  const next = cloneState(state)
  next.groups = next.groups.filter((candidate) => candidate.id !== id)
  return next
}

export function addDictItem(state: PlatformDictionaryState, input: NewDictItem): PlatformDictionaryState | null {
  if (input.type === 'productCategory' && !normalizeMediaReference(input.image)) return null
  const item = normalizeItem(input)
  const group = item ? state.groups.find((candidate) => candidate.type === item.type) : undefined
  if (!item || !group || isSystemGroup(group)) return null
  if (state.items.some((candidate) => candidate.id === item.id || (candidate.type === item.type && candidate.code === item.code))) return null
  const next = cloneState(state)
  next.items.push(item)
  return next
}

export function updateDictItem(state: PlatformDictionaryState, id: string, changes: DictItemChanges): PlatformDictionaryState | null {
  const current = state.items.find((item) => item.id === id)
  if (!current) return null
  const currentGroup = state.groups.find((group) => group.type === current.type)
  if (!currentGroup) return null
  const type = changes.type?.trim() || current.type
  const code = changes.code?.trim() || current.code
  const label = changes.label?.trim() || current.label
  const tone = changes.tone === undefined ? current.tone : changes.tone
  const imageChanged = Object.prototype.hasOwnProperty.call(changes, 'image')
  const image = imageChanged ? normalizeMediaReference(changes.image) : normalizeMediaReference(current.image)
  if (!type || !code || !label || (tone !== undefined && !tones.has(tone))) return null
  if (type === 'productCategory' && !image) return null
  if (isSystemGroup(currentGroup)) {
    if (type !== current.type || code !== current.code) return null
  } else {
    const targetGroup = state.groups.find((group) => group.type === type)
    if (!targetGroup || isSystemGroup(targetGroup)) return null
  }
  if (state.items.some((item) => item.id !== id && item.type === type && item.code === code)) return null
  const next = cloneState(state)
  next.items = next.items.map((item) => item.id === id ? {
    ...item,
    type,
    code,
    label,
    enabled: changes.enabled ?? item.enabled,
    sort: changes.sort ?? item.sort,
    ...(tone === undefined ? {} : { tone }),
    ...(image ? { image } : {})
  } : item)
  return next
}

export function removeDictItem(state: PlatformDictionaryState, id: string): PlatformDictionaryState | null {
  const item = state.items.find((candidate) => candidate.id === id)
  const group = item ? state.groups.find((candidate) => candidate.type === item.type) : undefined
  if (!item || !group || isSystemGroup(group)) return null
  const next = cloneState(state)
  next.items = next.items.filter((candidate) => candidate.id !== id)
  return next
}

export function canPublishPlatformDictionaries(current: PlatformDictionaryState, next: PlatformDictionaryState): boolean {
  const cg = current.groups ?? []; const ci = current.items ?? []; const ng = next.groups ?? []; const ni = next.items ?? [];
  if (ng.some((group) => group.type === 'city') || ni.some((item) => item.type === 'city')) return false
  const currentSystemGroups = cg.filter(isSystemGroup)
  if (currentSystemGroups.some((group) => !ng.some((candidate) => candidate.id === group.id && candidate.type === group.type))) return false
  if (ng.some((group) => isSystemGroup(group) && !currentSystemGroups.some((candidate) => candidate.id === group.id && candidate.type === group.type))) return false
  const systemItem = (item: DictItem, state: PlatformDictionaryState) => (state?.groups ?? []).some((group) => group.type === item.type && isSystemGroup(group))
  const currentSystemItems = ci.filter((item) => systemItem(item, current))
  if (currentSystemItems.some((item) => !ni.some((candidate) => candidate.id === item.id && candidate.type === item.type && candidate.code === item.code))) return false
  if (ni.some((item) => systemItem(item, next) && !currentSystemItems.some((candidate) => candidate.id === item.id && candidate.type === item.type && candidate.code === item.code))) return false
  const groupIds = new Set<string>()
  const groupTypes = new Set<string>()
  for (const group of ng) {
    if (!group.id || !group.type || !group.name || groupIds.has(group.id) || groupTypes.has(group.type)) return false
    groupIds.add(group.id)
    groupTypes.add(group.type)
  }
  const itemIds = new Set<string>()
  const itemCodes = new Set<string>()
  for (const item of ni) {
    const key = `${item.type}\u0000${item.code}`
    if (!item.id || !item.code || !item.label || !groupTypes.has(item.type) || itemIds.has(item.id) || itemCodes.has(key)) return false
    if (item.type === 'productCategory' && !normalizeMediaReference(item.image)) return false
    itemIds.add(item.id)
    itemCodes.add(key)
  }
  return true
}

export function selectDictOptions(state: PlatformDictionaryState, type: DictType, includeDisabled = false): DictItem[] {
  const group = state.groups.find((candidate) => candidate.type === type)
  if (!group || (!includeDisabled && !group.enabled)) return []
  return state.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === type && (includeDisabled || item.enabled))
    .sort((left, right) => left.item.sort - right.item.sort || left.item.label.localeCompare(right.item.label) || left.index - right.index)
    .map(({ item }) => ({ ...item }))
}

export function builtInDictLabel(type: DictType, code: string): string | undefined {
  return builtInLabels[type]?.[code]
}
