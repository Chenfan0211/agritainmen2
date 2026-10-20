import {
  afterSales,
  categories,
  commissionRules,
  commissionSettlements,
  farms,
  mockDelay,
  orders,
  pricePolicies,
  products,
  promoters,
  storeAccounts,
  suppliers,
  supplierSettlements
} from '@agritainment/shared'
import type { MockScenario } from '@agritainment/shared'

export const adminRepository = {
  loadDashboard: (scenario: MockScenario = 'normal') => mockDelay(
    { suppliers, products, orders, afterSales, farms, promoters, pricePolicies, commissionRules, categories, commissionSettlements, supplierSettlements, storeAccounts },
    180,
    scenario,
    { suppliers: [], products: [], orders: [], afterSales: [], farms: [], promoters: [], pricePolicies: [], commissionRules: [], categories: [], commissionSettlements: [], supplierSettlements: [], storeAccounts: [] }
  )
}
