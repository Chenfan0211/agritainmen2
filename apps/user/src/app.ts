// 用户端原生小程序入口：配置媒体运行时，并完成登录态与 C 端数据的迁移。
import { configureMediaRuntime, purgeRetiredAllianceData } from '@agritainment/shared'
import { createUserMediaRuntime } from './media/runtime'
import { migrateUserCommerceData } from './stores/user'

App({
  onLaunch() {
    configureMediaRuntime(createUserMediaRuntime())
    purgeRetiredAllianceData()
    void migrateUserCommerceData()
  }
})