# 四端页面后端化：未完成部分调整方案

> 日期：2026-10-28
> 现状基线：交易闭环第一批已接入；`node scripts/audit-page-api-coverage.mjs` 当前失败
> 实测缺口：**93 个未映射动作**（admin 55 / supplier 30 / user 8）+ **11 个缺失查询接口**
> 其中 6 个纯前端动作（购物车/地址/会话）无需后端，实际后端工作量 **87 个动作**

## 一、现状复核（实测）

| 项 | 现状 |
|---|---|
| 后端接口 | 39 个，契约 39/39 一致 |
| 已接入页面链路 | store 目录/库存/下单；user 目录/下单；supplier 履约单/接单/发货；admin 供应商/商品/订单/门店只读 |
| 后端表 | 约 20 个基础表；品类、价格策略、门店账号、商品提交、佣金规则、路线、司机范围、媒体均无表 |
| 页面 API 门禁 | 失败，输出 93 条未映射 + 11 条缺失接口，属真实反映 |
| 全量类型检查 | 存在历史类型错误（`uni` 未声明、隐式 any 等），非本轮引入 |

### 缺口分类（实测）

| 分类 | 数量 | 说明 |
|---|---:|---|
| admin-商品 | 22 | 商品保存/上下架/审核、品类、价格策略、阶梯价、分佣、字典、佣金规则、分享配置 |
| admin-组织 | 14 | 供应商邀请/维护/审核/暂停、门店增改、门店账号、业务员 |
| admin-交易 | 10 | 批量发货、确认收货、售后处理、退款、佣金结算、供应商结算、提现审核 |
| admin-系统 | 9 | 角色、账号、导出记录、恢复任务 |
| supplier-路线 | 18 | 建线、优化、发布、打卡、出库交接、缺货、发车、到店交接、仓点维护 |
| supplier-商品 | 5 | 商品提交、库存调整、上下架、司机增改与状态 |
| supplier-履约 | 4 | 接单、批量接单、发货、快递送达 |
| user-交易 | 4 | 售后、包裹核销、提现 |
| 纯前端 | 6 | 购物车增删改、地址维护（本地会话，无需后端） |

### 缺失查询接口（11 个）

- `GET /admin/dashboard`（看板聚合）
- `GET /admin/reports`（报表聚合）
- `GET /catalog/categories`（品类）
- `GET /catalog/prices`（价格策略）
- `GET /after-sales`（售后列表）
- `GET /org/users`（用户列表）
- `GET /commissions`（佣金/结算）
- `GET /admin/roles`（角色，建议放 auth-service，admin 服务不跨库）
- `GET /admin/accounts`（账号，建议放 auth-service，admin 服务不跨库）
- `GET /store/catalog`（矩阵登记错误，实际应由 `/catalog/products?channel=store` 覆盖）
- `GET /commissions/me`（团长收益聚合）

## 二、调整原则

1. **先查询后写入**：先让 23 个页面域首屏全部真实供数，再逐个域切写操作。
2. **按域补表**：不把品类、价格、账号、路线塞进现有表；每个服务自建表与 Flyway 迁移。
3. **分阶段门禁**：每阶段把该阶段动作登记进 `scripts/page-api-matrix.json`，门禁只校验已登记阶段；未开始阶段在矩阵中显式 `status: planned`，不伪装通过。
4. **api 模式失败即报错**：禁止回落本地写入；只读缓存可保留。
5. **金额整数分**：接口统一 `Cents`，页面转元。
6. **固定 ID 幂等迁移**：演示数据按 ID upsert，不覆盖业务侧已修改记录。

## 三、阶段划分

### 阶段 P0：修门禁与矩阵（0.5 天）

**目标**：让门禁可信，避免误报或假通过。

- 修正 `store:shop:shop.load` 登记错误：改为 `GET /catalog/products?channel=store`，不再要求不存在的 `/store/catalog`。
- 矩阵新增 `status` 字段（`done` / `in-progress` / `planned`），门禁只对 `done` 与 `in-progress` 做 OpenAPI 校验。
- 门禁输出新增两段：`已完成但未登记`、`planned 阶段清单`，便于按阶段推进。
- 验证：P0 结束时门禁**仍失败**，但失败项只剩真实缺口，不再有登记错误。

**改动文件**：
- `scripts/audit-page-api-coverage.mjs`
- `scripts/page-api-matrix.json`
- `scripts/audit-page-api-coverage.test.mjs`

### 阶段 P1：11 个查询接口（3–4 天）

**目标**：23 个页面域首屏全部真实供数，后台不再拉全量 mock。

| 接口 | 服务 | 数据来源 | 是否需新表 |
|---|---|---|---|
| `GET /admin/dashboard` | platform-admin | **跨服务聚合**（HTTP 调 order/catalog/org） | 否 |
| `GET /admin/reports` | platform-admin | **跨服务聚合**（HTTP 调 order/catalog） | 否 |
| `GET /catalog/categories` | catalog | `catalog_category` | 是 |
| `GET /catalog/prices` | catalog | `catalog_price_policy` | 是 |
| `GET /after-sales` | order | `after_sale_case` | 是 |
| `GET /org/users` | org | `org_user` | 是 |
| `GET /commissions` | settlement | 现有 `settlement_commission` | 否 |
| `GET /admin/roles` | auth（新增查询） | `auth_role` | 否 |
| `GET /admin/accounts` | auth（新增查询） | `auth_account` + `auth_account_role` | 否 |
| `GET /commissions/me` | settlement | 现有佣金表按受益人聚合 | 否 |

每接口要求：

> 注意：服务各自独立库，`platform-admin` 不能直接 SQL 读 `auth_*`、`order_*`、`catalog_*`。聚合类接口必须走 HTTP 调下游，角色/账号查询放 `auth-service`。

- 服务端分页 `page/pageSize/total`，`pageSize` 上限 200，越界 400。
- 统一 envelope，错误走 `GlobalExceptionHandler`。
- 同期补 OpenAPI、`scripts/backend-api-contract.mjs`、矩阵标 `done`。
- `@Tag("api-audit")` 测试覆盖：正常分页、空结果、越界 400、无权限 401/403。

### 阶段 P2：admin 商品/组织写操作（6–8 天）

| 模块 | 接口 | 新表 |
|---|---|---|
| 商品 | `POST/PUT /catalog/products`、`/status`、`/review` | `catalog_product` 扩展、`catalog_product_submission` |
| 品类 | `POST/PUT/DELETE /catalog/categories` | `catalog_category` |
| 价格 | `POST/PUT/PATCH /catalog/prices`、`PUT /catalog/pricing-defaults` | `catalog_price_policy`、`catalog_pricing_default` |
| 供应商 | `POST/PUT /org/suppliers`、`/audit`、`/pause`、`/resume` | `org_supplier` 扩展 |
| 门店 | `POST/PUT /org/farms` | `org_farm` 扩展 |
| 门店账号 | `POST/PUT/PATCH /org/farm-accounts` | `org_farm_account` |
| 业务员 | `POST/PUT /org/promoters` | `org_promoter` |
| 字典 | `POST/PUT/DELETE /admin/dictionaries` | 现有 `admin_dictionary` |

要点：
- 写接口带 `Idempotency-Key`，按 key + 请求哈希去重。
- 商品上下架按 `channel` 区分门店端/用户端。
- 商品审核走提交表，审核动作写审计日志。
- 品类删除校验被商品引用，冲突返回 409。

### 阶段 P3：admin 交易与结算（5–6 天）

- 批量发货：`POST /fulfillment/orders/batch-ship`，校验供应商归属。
- 确认收货：`POST /orders/{id}/confirm`。
- 售后：`POST /after-sales`、`/{id}/approve-refund`、`/{id}/approve-return`、`/{id}/reject`、`/{id}/refund`、`/{id}/return-tracking`。
- 佣金结算：`POST /commissions/settle`。
- 供应商结算：`POST /settlements/suppliers/settle`，新表 `settlement_supplier_record`。
- 提现审核：复用 `POST /withdrawals/{id}/review`，补 `GET /withdrawals`。
- 售后状态机：`processing → refund-pending/return-pending → refunded/refund-failed`，非法迁移 409。

### 阶段 P4：supplier 路线与作业（6–8 天）

- 路线：`POST/PUT /fulfillment/routes`、`/optimize`、`/publish`、`/stops/reorder`、`/dispatch`、`/handover`。
- 打卡：`POST /fulfillment/routes/{id}/warehouse-check-in`、`/stops/{storeId}/check-in`。
- 出库：`POST /fulfillment/routes/{id}/outbound`、`/outbound/review`、`/shortages`。
- 仓点：`PUT /org/suppliers/{id}/warehouse`。
- 司机：`POST/PUT /org/drivers`、`/password`、`/status`。
- 新表：`fulfillment_route`、`fulfillment_route_stop`、`fulfillment_route_handover`、`org_driver_scope`、`org_warehouse`。
- 距离校验沿用 `DRIVER_CHECK_IN_MAX_METERS` 规则。

### 阶段 P5：store/user 交易收尾（4–5 天）

- store：`POST /orders/{id}/pay`、`/cancel`、`POST /after-sales`（门店退货）。
- user：`POST /orders/{id}/sub-orders/{subId}/confirm`、`/after-sales`、`POST /vouchers/{id}/redeem`、`POST /withdrawals`（团长提现）。
- 新表：`after_sale_case`、`after_sale_evidence`、`voucher_order`。
- 支付继续 sandbox Provider；回调幂等沿用 `payment_callback_event` 唯一约束。

### 阶段 P6：演示数据迁移与 staging 验收（3–4 天）

- 新增 `scripts/seed-demo-data.mjs`：读取 `packages/shared` 演示数据，按固定 ID 调后端接口 upsert。
- 覆盖域：商品、SKU、品类、价格、门店、供应商、司机、团长、用户、订单、售后、佣金、提现、路线、媒体。
- 输出导入报告：新增/更新/跳过数量与失败明细。
- 正式环境默认关闭（`AGRITAINMEN_DEMO_SEED_ENABLED=false`）。
- staging 全链路：`admin 配置商品 → store 下单支付 → supplier 接单发货 → user 收货售后 → admin 查看`。

## 四、每阶段完成定义（DoD）

1. 该阶段动作在 `scripts/page-api-matrix.json` 标记 `done`，门禁通过。
2. 新增接口在 OpenAPI 与 `scripts/backend-api-contract.mjs` 登记。
3. 后端 `@Tag("api-audit")` 测试覆盖成功、空、越界、无权限。
4. 前端 store 有 api 模式测试：成功路径 + 失败不回落。
5. api 模式页面可用，失败有明确错误提示。
6. 不修改设计 token 与既有视觉。

## 五、工作量与优先级

| 阶段 | 内容 | 预估 | 优先级 |
|---|---|---|---|
| P0 | 门禁与矩阵修正 | 0.5 天 | 立即 |
| P1 | 11 个查询接口 | 3–4 天 | 最高 |
| P2 | admin 商品/组织写操作 | 6–8 天 | 高 |
| P3 | admin 交易结算 | 5–6 天 | 高 |
| P4 | supplier 路线作业 | 6–8 天 | 中高 |
| P5 | store/user 交易收尾 | 4–5 天 | 中 |
| P6 | 演示迁移与 staging | 3–4 天 | 上线前必须 |

合计约 **28–36 个工作日**（单人）。

## 六、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 新表一次做全导致返工 | 高 | P1 只建查询必需表，P2+ 按域增量迁移 |
| 前端 store 与后端状态机不一致 | 高 | 每域先写状态迁移测试，再切前端 |
| 历史类型错误阻塞 typecheck | 中 | 单独一轮清理，不混入功能改动 |
| 演示数据与正式数据冲突 | 中 | 固定 ID + 只 upsert 不删除；正式关闭种子 |
| staging 未实际启动 | 高 | P6 明确要求 Compose 全链路 |

## 七、立即可执行的下一步

1. 跑 `node scripts/audit-page-api-coverage.mjs`，确认基线仍是 93+11。
2. 按 P0 修矩阵与门禁，让失败项只反映真实缺口。
3. 按 P1 先做 `GET /catalog/categories`、`GET /after-sales`、`GET /org/users` 三个需要新表的接口，先定表结构再写控制器。
4. 每个接口完成后立刻登记 OpenAPI 与矩阵。

## 八、明确不做

- 不重构现有微服务边界（沿用 11 服务）。
- 不接入真实支付/物流/短信，继续 sandbox。
- 不重做页面视觉与交互。
- 不在本轮清理全部历史类型错误。
