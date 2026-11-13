# 后端实施状态（2026-10-23）

| 范围 | 状态 | 证据/说明 |
|---|---|---|
| Admin 演示看板口径 | 已完成 | 默认“数据全期”，浏览器显示 GMV `¥18,070.5`、72 笔订单且无横向溢出 |
| Maven 多模块骨架 | 已完成 | 12 个模块，Java 21，Spring Boot 4.0.9 |
| Compose 基础设施定义 | 已完成 | 18 个 Compose 服务，Caddy 公网入口 |
| 服务编译与打包 | 已完成 | `pnpm backend:package` 成功，11 个可执行 jar 生成 |
| 后端测试 | 已完成 | 18/18 通过，包含并发库存、幂等订单、重复支付回调、重复提现、demo seed 和 sandbox Provider |
| 登录与 JWT | 已完成核心 | Admin/Store/Supplier/Driver 登录、三端微信 code 交换、Refresh 轮换、Logout |
| 库存并发 | 已完成核心 | 条件扣减、预占、释放、确认，100 并发抢 1 件测试通过 |
| 订单 | 已完成核心 | 服务端取价、幂等创建、库存预占、订单查询 |
| 支付 | 已完成 sandbox Provider | 支付意图、微信回调入口、回调幂等、微信 V3 配置位 |
| 物流 | 已完成 sandbox Provider | 创建沙箱运单、查询沙箱轨迹 |
| 短信 | 已完成 sandbox Provider | 固定测试码 `123456` |
| 提现/佣金 | 已完成核心 | 佣金 source 幂等、提现条件审批 |
| 商品/履约/运营审计 | 已完成基础接口和 demo seed | 取价、接单/发货、沙箱物流、审计写入 |
| 组织主数据 | 已完成只读查询和 demo seed | 门店、供应商、司机、团长 |
| API Client | 已完成基础 | 统一 envelope、JWT、Idempotency-Key、401 刷新、trace、runtime 注入 |
| 四端 API 页面切换 | 部分完成 | User 身份链路已接 API；Store/Supplier/Admin 已完成 API runtime 注入，业务 store 仍待逐域切换 |
| 真实微信/支付/物流/短信 | 部分完成 | 微信真实模式已实现；支付/物流/短信首版 sandbox |
| Compose 实际启动 | 未验证 | 当前机器未安装 Docker，仅完成 YAML 静态解析 |
| 三端真机全链路 | 未完成 | 需在 Linux staging 和稳定微信开发者工具/真机上执行 |
