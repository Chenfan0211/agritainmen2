// 用户端原生小程序入口：安装 API/身份 Provider、配置媒体运行时，并完成 C 端数据迁移。
import { configureMediaRuntime, purgeRetiredAllianceData } from '@agritainment/shared'
import { createUserMediaRuntime } from './media/runtime'
import { configureUserApiRuntime } from './services/api-runtime'
import { configureUserIdentityResolver, configureWechatLoginProvider, createHttpUserIdentityResolver, createHttpWechatLoginProvider } from './services/user-identity'
import { migrateUserCommerceData } from './stores/user'

App({
  onLaunch() {
    const runtime = configureUserApiRuntime()
    if (runtime.dataMode === 'api') {
      configureWechatLoginProvider(createHttpWechatLoginProvider())
      configureUserIdentityResolver(createHttpUserIdentityResolver())
    } else {
      configureWechatLoginProvider()
      configureUserIdentityResolver()
    }
    configureMediaRuntime(createUserMediaRuntime())
    purgeRetiredAllianceData()
    void migrateUserCommerceData()
  }
})
