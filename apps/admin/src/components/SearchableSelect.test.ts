import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MediaReference } from '@agritainment/shared'
import { createSearchableSelectId, filterSelectOptions, findNextEnabledOption } from './searchable-select'
import type { SearchableSelectOption } from './searchable-select'

const options: SearchableSelectOption[] = [
  { label: '全部商品', value: 'all', keywords: ['catalog'] },
  { label: '门店商品', value: 'store' },
  { label: '用户端商品', value: 'live', disabled: true }
]

const expectedBindings = [
  'form.coop -> supplierTypeOptions',
  'form.category -> supplierCategoryOptions',
  'supplierAccountForm.enabled -> enabledOptions',
  'adminAccountForm.roleId -> adminRoleOptions',
  'trendRange -> trendRangeOptions',
  'reportStoreFilter -> reportStoreOptions',
  'reportSupplierFilter -> reportSupplierOptions',
  'reportCategoryFilter -> reportCategoryOptions',
  'reportDimension -> reportDimensionOptions',
  'supplierStatusFilter -> supplierStatusOptions',
  'supplierCategoryFilter -> supplierCategoryFilterOptions',
  'categoryTypeFilter -> categoryTypeFilterOptions',
  'productReviewFilter -> productReviewOptions',
  'productSupplierFilter -> productSupplierFilterOptions',
  'productChannelFilter -> catalogChannelFilterOptions',
  'productCategoryFilter -> productCategoryFilterOptions',
  'productStatusFilter -> productStatusOptions',
  'productStockFilter -> productStockFilterOptions',
  'orderStoreFilter -> orderStoreSelectOptions',
  'orderChannelFilter -> orderChannelOptions',
  'orderStatusFilter -> orderStatusOptions',
  'orderAfterFilter -> orderAfterOptions',
  'afterTypeFilter -> afterTypeFilterOptions',
  'afterReasonFilter -> afterReasonFilterSelectOptions',
  'afterStatusFilter -> afterStatusFilterOptions',
  'settlementSupplierFilter -> supplierSettleSupplierOptions',
  'farmCityFilter -> farmCityFilterOptions',
  'farmStatusFilter -> farmStatusFilterOptions',
  'farmAccountFilter -> farmAccountSelectOptions',
  'storeAccountStatusFilter -> roleStatusOptions',
  'promoterTypeFilter -> promoterTypeOptions',
  'promoterLevelFilter -> promoterLevelFilterOptions',
  'promoterSettleFilter -> promoterSettleFilterOptions',
  'commissionStatusFilter -> commissionStatusOptions',
  'withdrawalStatusFilter -> withdrawalStatusOptions',
  'supplierSettleSupplierFilter -> supplierSettleSupplierOptions',
  'dictStatusFilter -> roleStatusOptions',
  'logActor -> logActorOptions',
  'logRole -> logRoleOptions',
  'logModule -> logModuleOptions',
  'logResult -> logResultOptions',
  'roleStatusFilter -> roleStatusOptions',
  'accountRoleFilter -> accountRoleFilterOptions',
  'accountStatusFilter -> accountStatusOptions',
  'recoveryOutcome -> recoveryOutcomeOptions',
  'form.coop -> supplierTypeOptions',
  'form.category -> supplierCategoryOptions',
  'form.categoryType -> categoryTypeOptions',
  'form.dictTone -> dictionaryToneOptions',
  'form.enabled -> enabledOptions',
  'form.accountFarmId -> accountFarmSelectOptions',
  'form.accountRole -> accountRoleOptions',
  'form.accountPriceLevel -> accountPriceLevelOptions',
  'form.accountPromo -> accountPromotionOptions',
  'form.type -> policyTypeOptions',
  'form.enabled -> enabledOptions',
  'form.result -> afterSaleTypeOptions',
  'form.initIssue -> afterReasonSelectOptions',
  'form.level -> promoterLevelOptions',
  'form.promoterType -> promoterFormTypeOptions',
  'form.promoterStatus -> promoterStatusOptions',
  'form.farmCityCode -> farmCitySelectOptions',
  'form.farmDistrictCode -> farmDistrictSelectOptions',
  'form.farmStatus -> farmStatusOptions',
  'catalogProductForm.channel -> catalogProductChannelOptions',
  'catalogProductForm.productType -> catalogProductTypeOptions',
  'catalogProductForm.expressDelivery -> expressDeliveryOptions',
  'catalogProductForm.category -> productCategoryOptions',
  'catalogProductForm.supplierId -> catalogSupplierOptions',
  'catalogProductForm.source -> catalogProductSourceOptions'
]

describe('searchable select helpers', () => {
  it('matches labels and keywords after trimming and normalizing case', () => {
    expect(filterSelectOptions(options, ' 门店 ')).toEqual([options[1]])
    expect(filterSelectOptions(options, '全 部 商 品')).toEqual([options[0]])
    expect(filterSelectOptions(options, 'CATALOG')).toEqual([options[0]])
  })

  it('keeps every option when the search query is empty', () => {
    expect(filterSelectOptions(options, '   ')).toEqual(options)
  })

  it('moves keyboard focus across enabled options and wraps around', () => {
    expect(findNextEnabledOption(options, 0, 1)).toBe(1)
    expect(findNextEnabledOption(options, 1, 1)).toBe(0)
    expect(findNextEnabledOption(options, 0, -1)).toBe(1)
  })

  it('starts upward keyboard navigation from the last enabled option', () => {
    const enabledOptions: SearchableSelectOption[] = [
      { label: '第一项', value: 'first' },
      { label: '最后一项', value: 'last' }
    ]
    expect(findNextEnabledOption(enabledOptions, -1, -1)).toBe(1)
  })

  it('creates a unique listbox id for every component instance', () => {
    expect(createSearchableSelectId()).not.toBe(createSearchableSelectId())
  })

  it('preserves string, number and boolean option values without coercion', () => {
    const primitiveOptions: SearchableSelectOption[] = [
      { label: '字符串', value: '1' },
      { label: '数字', value: 1 },
      { label: '布尔值', value: true }
    ]
    expect(filterSelectOptions(primitiveOptions, '').map((option) => [typeof option.value, option.value])).toEqual([
      ['string', '1'], ['number', 1], ['boolean', true]
    ])
    const componentSource = readFileSync(new URL('./SearchableSelect.vue', import.meta.url), 'utf8')
    expect(componentSource).toContain("emit('update:modelValue', option.value)")
  })

  it('supports media references and renders images before fallback icons', () => {
    const image: MediaReference = { source: 'asset', assetId: 'CATEGORY-IMAGE' }
    const mediaOption: SearchableSelectOption = { label: '土特产', value: 'local', image, icon: 'tags' }
    expect(mediaOption.image).toEqual(image)

    const componentSource = readFileSync(new URL('./SearchableSelect.vue', import.meta.url), 'utf8')
    expect(componentSource).toContain("import { BusinessImage } from '@agritainment/ui'")
    expect(componentSource).toContain('<BusinessImage v-if="selectedOption?.image"')
    expect(componentSource).toContain(':fallback="selectedOption.imageFallback"')
    expect(componentSource).toContain(':error-fallback="selectedOption.imageErrorFallback"')
    expect(componentSource).toContain(':show-error="false"')
    expect(componentSource).toContain('<UiIcon v-else-if="selectedOption?.icon"')
    expect(componentSource).toContain('<BusinessImage v-if="option.image"')
    expect(mediaOption).not.toHaveProperty('imageFallback')
    expect(mediaOption).not.toHaveProperty('imageErrorFallback')
    expect(componentSource).toContain('<UiIcon v-else-if="option.icon"')
  })

  it('keeps all admin model and option bindings on the shared component', () => {
    const source = readFileSync(new URL('../pages/index/index.vue', import.meta.url), 'utf8')
    const bindings = [...source.matchAll(/<SearchableSelect\s+v-model="([^"]+)"\s+:options="([^"]+)"/g)]
      .map((match) => `${match[1]} -> ${match[2]}`)
    expect(bindings).toEqual(expectedBindings)
    expect(source).not.toMatch(/<select\b/)
  })
})
