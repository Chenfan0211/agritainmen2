# Supplier batch acceptance implementation plan

> **For agentic workers:** Execute this plan task by task in the current checkout. Preserve unrelated changes and verify before committing.

**Goal:** API 模式供应商批量接单由服务端原子处理，失败时不产生部分接单，也不清空页面选择。

**Architecture:** Fulfillment 使用 Auth `/me` 确认供应商身份，批量查询所选履约单的归属与状态，在事务内用状态条件批量更新；任何一单不属于本人或状态不符则整批拒绝。前端 API 模式调用一次批量接口并只在成功后更新本地视图；Mock 模式保留原有逐单行为。

**Tech Stack:** Spring Boot、JdbcTemplate、H2 HTTP 测试、TypeScript、Vitest。

**Spec:** `scripts/page-api-matrix.json` 的 `batchAcceptOrders` 动作及现有 `POST /fulfillment/orders/{id}/accept` 规则。

## Global Constraints

- 一批 1–100 个不同的非空履约单 ID；跨供应商或不存在返回 404，状态冲突返回 409。
- 任何失败不得产生部分数据库更新；不接 Staging。
- 不修改现有页面样式与 Mock 模式业务逻辑。

## Task 1: Atomic backend endpoint

**Files:** `FulfillmentController.java`, `FulfillmentScopeAuditTest.java`。

- [x] 写失败用例：本人多单成功、跨供应商与非法状态整批无副作用、重复或空 ID 被拒绝。
- [x] 跑定向测试确认失败。
- [x] 实现范围校验、状态校验和事务内条件批量更新。
- [x] 跑定向测试确认通过。

## Task 2: Supplier API mode and contract

**Files:** `apps/supplier/src/stores/supplier.ts`, `apps/supplier/src/pages/index/index.ts`, supplier API tests, OpenAPI、后端契约脚本、页面 API 矩阵和本地调试文档。

- [x] 写失败用例：API 模式一次请求成功更新全部；失败保留订单状态；页面失败时不清空选择，Mock 用例继续通过。
- [x] 跑前端定向测试确认失败。
- [x] 接入接口并更新契约与文档。
- [x] 跑后端、前端、类型、契约和 API 模式构建验证。
