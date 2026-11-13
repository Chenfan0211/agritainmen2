import { configureMediaRuntime, initializePlatformRecoveryHandlers, migratePersistedState, persistedEnvelope, purgeRetiredAllianceData, reconcilePendingPlatformTransactions } from '@agritainment/shared'
import { createStoreMediaRuntime } from './media/runtime'
import { configureStoreApiRuntime } from './services/api-runtime'
import { createStoreAtomicRecoveryHandlerRegistrations, useStoreStore } from './stores/store'

const persistedKeys = ['info', 'products', 'cart', 'checkoutLineKeys', 'orders', 'auth'] as const

function configureStorePersistence() {
  const store = useStoreStore()
  const saved = wx.getStorageSync('agritainment-store-store')
  if (saved) store.$patch(migratePersistedState(saved, store.$state))
  store.$subscribe((state) => {
    wx.setStorageSync('agritainment-store-store', persistedEnvelope(state, persistedKeys))
  })
}

App({
  onLaunch() {
    configureStoreApiRuntime()
    configureMediaRuntime(createStoreMediaRuntime())
    purgeRetiredAllianceData()
    const recoveryHandlers = createStoreAtomicRecoveryHandlerRegistrations()
    initializePlatformRecoveryHandlers(recoveryHandlers)
    recoveryHandlers.forEach(({ key }) => reconcilePendingPlatformTransactions({ handlerKey: key }))
    configureStorePersistence()
  },
  onShow() {
    void useStoreStore().sweepExpiredPaymentOrders()
  }
})
