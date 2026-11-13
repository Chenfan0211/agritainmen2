# 供应商资料与门店增改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 运营后台在 API 模式下完整保存、修改并回读供应商资料和门店资料，失败时不产生页面假成功。

**Architecture:** org-service 是资料的唯一持久化源，后台通过同一 DTO 写入和读取。保留 mock 模式现有行为；门店地址由现有地址解析与地理编码函数处理。图片采用可回读的媒体引用。

**Tech Stack:** Vue 3、Pinia、TypeScript、Vitest、Spring Boot、JdbcTemplate、Flyway、H2/MySQL。

**Spec:** 本次对话中已确认的《供应商资料与门店增改》方案。

## Global Constraints

- 仅覆盖运营后台供应商资料与门店增改；供应商审核、账号和门店账号仍由各自流程维护。
- 沿用当前工作区的未提交改动，不能覆盖或提交无关文件。
- UI 如需改动，遵守 `docs/design/zhulv-design-tokens.md`，业务样式只用 `packages/ui/src/design-tokens.css` 中的变量。
- API 模式失败须保留表单，不得回落本地保存；mock 模式保留。

---

### Task 1: 组织服务资料契约和持久化

**Files:**
- Modify: `backend/services/org-service/src/main/java/com/agritainmen/org/web/OrgWriteController.java`
- Modify: `backend/services/org-service/src/main/java/com/agritainmen/org/web/OrgController.java`
- Create: `backend/services/org-service/src/main/resources/db/migration/V4__org_profiles.sql`
- Test: `backend/services/org-service/src/test/java/com/agritainmen/org/OrgProfileAuditTest.java`

**Interfaces:** `POST/PUT /api/v1/org/suppliers[/{id}]` 和 `POST/PUT /api/v1/org/farms[/{id}]` 接受并返回完整资料；对应 GET 列表提供同样字段。

- [ ] 写集成测试：新增、修改后 GET 回读供应商品牌、服务区域、证照；门店联系人、地址、封面、经营资料和定位；无效输入、重复手机与不存在 ID 应拒绝且不改旧数据。
- [ ] 运行 `pnpm backend:test` 中 org-service 定向测试，确认测试因缺失资料字段失败。
- [ ] 添加 Flyway V4，扩展资料字段并保持旧数据可读。
- [ ] 在 org-service 实现校验、写入与统一回读；状态新增默认 `pending`，修改不意外变更供应商审核状态。
- [ ] 再运行 org-service 定向测试，确认通过。

### Task 2: 后台 API 模式完整读写

**Files:**
- Modify: `apps/admin/src/stores/admin.ts`
- Create: `apps/admin/src/services/org-profile-api.ts`
- Test: `apps/admin/src/stores/admin-api-supplier-farm.test.ts`

**Interfaces:** `inviteSupplier`、`updateSupplier`、`addFarm`、`updateFarm` 保持原有签名和返回类型；新增内部 DTO 映射供列表及写回包共用。

- [ ] 修正/补充测试，验证 API 请求完整资料、刷新后完整回读、失败时状态不变、权限正确拒绝。
- [ ] 运行定向 Vitest 确认红灯，记录当前失败原因。
- [ ] 将 API 分支放到四个正确的 action，复用 DTO 映射；移除错位的供应商分支；API 模式不混入本地演示资料。
- [ ] 运行定向 Vitest 确认绿灯。

### Task 3: 图片与门店定位闭环

**Files:**
- Modify: `apps/admin/src/pages/index/index.vue`（只改必要提示或保存调用）
- Modify: `apps/admin/src/services/api-runtime.ts`（如需媒体运行时接线）
- Test: `apps/admin/src/stores/admin-api-supplier-farm.test.ts`

**Interfaces:** 图片在 API 保存后可刷新回读；门店地址变化后新坐标或失败状态与地址一起保存。

- [ ] 写图片和定位用例，确认现有 API 分支回读失败。
- [ ] 保持现有 ImageUploader 与地址解析逻辑，用可跨会话回读的媒体引用接线；地址失败保留文本且清除旧坐标。
- [ ] 运行相关测试并检查页面表单回填。

### Task 4: 契约和完成验证

**Files:**
- Modify: `docs/backend/openapi.yaml`
- Modify: `scripts/backend-api-contract.mjs`（仅在路由变更时）

- [ ] 在 OpenAPI 写明请求、响应和错误字段。
- [ ] 运行定向 Vitest、org-service 测试、接口契约检查及相关类型检查。
- [ ] 核对 git diff，仅报告本轮改动和既存失败，不提交或推送未授权的混合改动。

## 执行记录（2026-11-11）

- 已完成供应商、门店资料的服务端保存与列表回读，后台 API 模式的新增、修改、失败处理，以及图片和门店定位字段接线；已更新 OpenAPI。
- org-service 测试通过；后台相关 5 个测试文件共 167 个用例通过；后台 H5 构建通过；后端路由与 OpenAPI 89 项一致；页面 API 覆盖审计通过。
- 全量后台类型检查仍有当前工作区其他 API 改造的错误，包括 `admin.ts` 中角色权限字段及 shared 的测试泛型类型；本次未改动这些业务。尚未在真实数据库和浏览器中做端到端验收。
- 未提交、未推送；当前工作区有大量其他未提交改动。

## 分批补强执行记录（2026-11-11）

本轮按随后确认的四批补强方案执行，范围扩展到供应商审核后的账号开通：

1. **权限与租户隔离：** 网关和 org/auth 服务校验管理员令牌、租户及供应商/门店操作权限；组织查询只返回平台租户未删除数据；媒体按用途授权。
2. **资料与迁移：** 补齐资料字段校验、供应商手机号唯一性和软删除占用规则；增加 org V5 媒体表、auth V3 供应商账号关联；新增迁移前重复手机号检查脚本。
3. **图片与列表：** 图片上传为服务端媒体 ID，列表和编辑重载时按 ID 取回；供应商与门店列表不混入本地演示资料。
4. **账号与登录：** 审核通过后幂等开通供应商账号，初始密码仅展示一次；开通失败保留已审核状态并可单独重试；账号修改走服务端；运营后台 API 模式使用服务端登录、令牌和权限，刷新令牌轮换同步更新 Cookie。

验证：后台 16 个测试文件共 263 个用例通过，H5 构建通过；网关、auth、org 的 API 审计测试通过，auth 全量测试通过；后端实际路由与 OpenAPI 95 项一致。全量后台类型检查仍被当前工作区其他 API 改造的类型错误阻断；本轮涉及的新增测试类型错误已修正。真实 MySQL 迁移、浏览器跨服务联调尚未执行，本机未找到 Docker 命令；V4 上线前需先运行 `docs/backend/org-profile-migration-preflight.sql` 的只读检查。未提交、未推送。

## 下一批：账号开通的服务端审核约束（2026-11-11）

- auth-service 在首次开通账号前，以当前管理员令牌读取 org-service 的单个供应商资料；只有 `certified=true` 且 `status=cooperating` 才写入账号。未审核、已暂停、供应商不存在或组织服务不可用均不会创建账号；组织服务连接和读取超时分别为 2 秒、3 秒。已有账号的幂等重试保持原密码。
- org-service 新增按 ID 查询供应商资料，沿用平台租户、软删除和管理员权限检查；OpenAPI 与路由契约增加这一操作。
- auth-service 的 `ORG_SERVICE_BASE_URL` 在本地默认指向 `127.0.0.1:8082`，Compose 中指向 `org-service:8080`。上线时需保证两个服务可互访并共用 JWT 校验密钥。
- 本机没有 MySQL 或 Docker 客户端，真实 MySQL 迁移与浏览器联调仍待具备环境后执行；全量后台类型检查中的其他模块错误保持原状。
- 验证：新增用例先复现待审供应商被错误开通以及供应商详情路由缺失；修复后 auth 全量 14 个测试、org API 审计 23 个测试通过，Compose 配置可解析，OpenAPI 与 96 项后端路由一致。

## 下一批：后台类型检查与角色权限（2026-11-11）

- 修正 API 模式下角色新增、修改、权限分配的调用位置，超级管理员操作写入 auth-service；去掉权限分配分支里误用的角色资料字段。
- 网关和 auth-service 按 `admin.role.*`、`admin.account.*` 权限校验角色与后台账号接口；账号启停与资料修改在服务端按实际字段分别检查，防止仅持有启停权限时改名、改密或换角色。
- 修正测试桩的显式类型和两处不符合业务类型的测试入参，不改对应业务实现；后台 `vue-tsc --noEmit` 已从红灯转绿。
- 验证：后台及相关 shared 测试 271 个用例通过，H5 构建通过；网关 API 审计 10 个、auth API 审计 14 个、auth 全量 14 个测试通过。真实 MySQL 与浏览器跨服务联调仍待具备环境后执行。

## 下一批：迁移阶段与旧账号入口收口（2026-11-12）

- 将组织库迁移前的重复手机号检查与 V4 后的旧门店地址检查拆为独立只读 SQL；Staging 手册明确已有库先备份、预检返回零行后再启动 Flyway，并列出供应商、门店的跨服务验收项。
- 移除无人使用的旧 `PUT /org/suppliers/{id}/account`。它只修改组织库联系人手机号，无法同步 auth-service 登录账号；后台现有账号修改仍通过 auth-service。同步收口网关及 org-service 授权映射、OpenAPI 和路由清单。
- 先用审计用例复现旧入口被放行，修复后网关 10 个、org-service 23 个 API 审计通过；OpenAPI 与 95 项实际路由一致，页面 API 覆盖审计通过；迁移前 SQL 不再引用 V4 新字段。页面审计严格模式仍因其他业务域 7 项 planned API 尚未进入 OpenAPI 而失败。
- 本机无 MySQL/Docker 命令，3306 与 8080–8082 端口无服务，真实 MySQL 迁移和浏览器跨服务联调仍未执行；未提交、未推送。
