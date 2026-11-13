# Supplier warehouse API implementation plan

> **For agentic workers:** Execute this plan task by task in the current checkout. Preserve unrelated work and verify before committing.

**Goal:** 供应商端 API 模式把仓点地址、联系人和 GCJ-02 坐标保存到服务端并回读，作为后续线路与打卡的可信起点。

**Architecture:** Org 自助接口从 Auth `/me` 确认当前供应商身份，不接受客户端供应商 ID。仓点保存在当前供应商 `profile_json.warehouse`，仅替换该字段；用 `version` 条件更新防止覆盖并发资料改动。供应商端 API 模式调用该接口并用返回的资料刷新 Store；Mock 模式保留现有本地事务。

**Tech Stack:** Spring Boot、JdbcTemplate、H2 HTTP 测试、TypeScript、Vitest、微信小程序构建。

**Spec:** `scripts/page-api-matrix.json` 中 `updateWarehouse` 待接入动作及 `packages/shared/src/index.ts` 的 `SupplierWarehouse` 数据结构。

## Global Constraints

- 自助写入只允许供应商身份，司机可读取所属供应商但不能修改仓点。
- 地址必填，联系人电话若提供须为 11 位手机号，坐标须成对且在经纬度范围内；坐标系固定 GCJ-02。
- 不改现有页面视觉和 Mock 模式事务；不接 Staging。

## Task 1: Org scoped warehouse write and read

**Files:** `OrgSupplierSelfController.java`, `OrgProfiles.java`, `OrgWriteController.java`, `OrgSupplierSelfAuditTest.java`。

- [x] 写 HTTP 失败用例：未登录/司机拒写，供应商仅更新自身仓点，已有资质字段保留，非法坐标/电话拒绝，并发版本冲突不覆盖资料。
- [x] 运行测试确认失败。
- [x] 实现身份验证、仓点校验及带版本条件的资料字段更新。
- [x] 运行定向测试确认通过。
- [x] 补管理员资料更新保留仓点的失败用例与修复，避免反向覆盖。

## Task 2: Supplier API mode and contract

**Files:** `packages/shared/src/index.ts`, `apps/supplier/src/stores/supplier.ts`, `apps/supplier/src/services/repository.ts`, supplier API 测试，`docs/backend/openapi.yaml`, `scripts/backend-api-contract.mjs`, `scripts/page-api-matrix.json`, `docs/backend/staging-runbook.md`。

- [x] 写失败用例：API 回读映射仓点；保存调用自助接口，失败不写本地成功态；Mock 行为保持。
- [x] 运行测试确认失败。
- [x] 实现 API 分支并更新契约和本地调试记录。
- [x] 运行供应商用例、Org HTTP 用例、类型检查、接口审计、API 模式构建和差异检查。
