# Supplier live auth and scoped fulfillment implementation plan

> **For agentic workers:** Execute this plan task by task in the current checkout. Preserve unrelated WIP; verify before reporting completion.

**Goal:** API 模式供应商和司机使用真实账号登录；供应商只处理自己的履约单，司机只查看自己获派的履约单；状态和会话即时失效，后台冻结表单可保存原因。

**Architecture:** Auth 登录签发包含 `supplierId` 的令牌，并把访问令牌与可撤销会话关联；司机账号在 Auth DB 按 `driver_supplier_id` 绑定所属供应商，一个供应商可有多名司机，司机 ID 使用 Auth 账号 ID。履约服务携带原始 Bearer 请求 Auth `/me` 校验会话，从校验结果获得供应商和司机 ID；客户端查询参数不能扩大范围。Mock 模式保持现有演示流程。

**Tech Stack:** Spring Boot、MyBatis Plus、Flyway、RestClient、Taro/Vue/TypeScript、Vitest。

**Spec:** 本会话用户指令及 `docs/backend/staging-runbook.md`。

## Global Constraints

- 只改供应商登录、履约权限、供应商状态、令牌失效、账号表单及验收文档。
- UI 样式遵守 `docs/design/zhulv-design-tokens.md`；本批不新增视觉样式。
- 当前 checkout 有大量已有 WIP，不混合提交或推送。

### Task 1: Auth identity and revocable access

**Files:** `TokenClaims.java`, `JwtService.java`, `AuthDtos.java`, `AuthService.java`, `AuthSession.java`, `AuthController.java`, 新建司机账号控制器, auth Flyway V5/V6, auth tests.

- [x] 增加失败用例：供应商和司机登录返回 supplierId，冻结/改密/停用/退出/轮换后旧 access 与 refresh 被拒绝，未绑定账号拒绝登录。
- [x] 跑 auth 定向测试确认失败。
- [x] 令牌写入 supplierId，访问令牌哈希写入 session；`/me` 对供应商和司机核对 session、账号启用状态和绑定；刷新按最新账号重建身份；司机账号由所属供应商管理。
- [x] 跑 auth 定向测试。

### Task 2: Fulfillment server-side scope

**Files:** `FulfillmentController.java`, 新建 `SupplierAccessVerifier.java`, fulfillment 配置及测试。

- [x] 增加失败用例：无令牌、伪造 supplierId、跨供应商接单/发货、跨供应商物流查询被拒绝；司机只能查看自己获派的记录。
- [x] 跑 fulfillment 定向测试确认失败。
- [x] 履约服务通过 Auth `/me` 校验会话，仅接受供应商身份处理接单发货；创建履约单要求平台身份；供应商及司机读取和写入按所属范围约束。司机配送指定司机时核对账号归属和启用状态。
- [x] 跑 fulfillment 定向测试。

### Task 3: Supplier status and account form

**Files:** `OrgWriteController.java`, `OrgSecurityConfiguration.java`, gateway auth filter, org tests, `SupplierAccountAdminController.java`, admin store/page and tests.

- [x] 增加失败用例：非法状态流转与未认证恢复合作；冻结账号仅修改原因可保存。
- [x] 跑 org/auth/admin 定向测试确认失败。
- [x] 状态 SQL 带前置条件并检查更新行数；org 司机接口仅平台管理身份可用，供应商通过 Auth 自己的司机账号接口管理；前后端允许已冻结账号更新原因，要求冻结权限。
- [x] 跑定向测试。

### Task 4: Supplier client and local API acceptance

**Files:** `apps/supplier/src/services/api-runtime.ts`, supplier store/page, supplier tests, `docs/backend/staging-runbook.md`.

- [x] 增加失败用例：API 模式供应商及司机登录使用 Auth，登录前不请求履约数据，刷新/退出和失效后清理令牌；Mock 模式不回退到真实服务。
- [x] 跑 supplier 定向测试确认失败。
- [x] 接通登录与恢复会话，API 数据加载使用已登录身份；补正反例步骤。
- [x] 跑本地 HTTP 接口测试、定向测试、类型检查与 API 模式构建。用户将 Staging 实测调整为本地调试；跨服务真实环境验收留待另行安排。
