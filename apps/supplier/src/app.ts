import { configureMediaRuntime, initializePlatformRecoveryHandlers, migratePersistedState, persistedEnvelope, purgeRetiredAllianceData, reconcilePendingPlatformTransactions } from '@agritainment/shared'
import { createSupplierMediaRuntime, migrateSupplierLegacyMedia } from './media/runtime'
import { createSupplierAtomicRecoveryHandlerRegistrations, useSupplierStore } from './stores/supplier'

const persistedKeys = ['auth'] as const

function configureStorePersistence() {
  const store = useSupplierStore()
  const saved = wx.getStorageSync('agritainment-supplier-supplier')
  if (saved) store.$patch(migratePersistedState(saved, store.$state))
  store.$subscribe((state) => {
    wx.setStorageSync('agritainment-supplier-supplier', persistedEnvelope(state, persistedKeys))
  })
}

App({
  onLaunch() {
    const mediaRuntime = createSupplierMediaRuntime()
    configureMediaRuntime(mediaRuntime)
    // 一次性迁移历史自制图片映射；失败不影响启动，下一次启动会重试。
    void migrateSupplierLegacyMedia(mediaRuntime)
    purgeRetiredAllianceData()
    const recoveryHandlers = createSupplierAtomicRecoveryHandlerRegistrations()
    initializePlatformRecoveryHandlers(recoveryHandlers)
    recoveryHandlers.forEach(({ key }) => reconcilePendingPlatformTransactions({ handlerKey: key }))
    configureStorePersistence()
  },
  onShow() {
    void useSupplierStore().refreshSharedState()
  }
})