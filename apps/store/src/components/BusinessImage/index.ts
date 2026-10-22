// 业务图片组件：解析 builtin/legacy 静态引用与上传资产，失败时按 errorFallback 回退一次。
// 行为实现统一在 @agritainment/shared，本文件只做平台绑定。
import { createBusinessImageComponent } from '@agritainment/shared'

Component(createBusinessImageComponent())