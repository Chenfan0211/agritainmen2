# 供应商账号关联与原因回读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API 模式下新演示供应商账号正确关联主体，暂停与冻结原因由服务端保存并可刷新回读。

**Architecture:** 新演示账号写入固定供应商 ID；已有未关联账号只生成只读核对结果，不按手机号自动绑定。组织服务和认证服务分别持久化当前暂停、冻结原因，返回 DTO 供后台回读。

**Tech Stack:** Spring Boot、Flyway、H2/MySQL、Vue/Pinia、Vitest。

**Spec:** 本次对话已确认的供应商资料后续缺口与实施授权。

## Global Constraints

- 仅改供应商资料、账号链路；保留门店和其他业务现状。
- 复用当前含大量未提交内容的工作区，不混合提交或推送。
- 旧账号关联须先核对主体；不得仅凭同手机号自动绑定。
- API 失败保留真实错误，mock 模式维持现有行为。

---

### Task 1: 演示账号关联与历史核对

**Files:** `DemoAuthSeeder.java`、`AuthAccount.java`、auth 测试、`docs/backend/auth-supplier-account-link-preflight.sql`。

- [x] 加入演示种子关联和既有未关联账号冲突用例，先运行确认失败。
- [x] 新种子写入固定 `S-DEMO-001`；既有账号不自动关联。
- [x] 给已有库提供只读核对 SQL，并运行 auth 定向测试。

### Task 2: 暂停与冻结原因持久化

**Files:** org/auth Flyway 新迁移、`OrgWriteController`、`OrgProfiles`、`SupplierAccountAdminController`、对应审计测试。

- [x] 写失败用例：原因必填，保存、列表/详情回读，恢复/解冻清除当前原因。
- [x] 增加字段与最少服务端逻辑；保留原有权限、撤销会话行为。
- [x] 运行 org/auth 审计与全量相关测试。

### Task 3: 后台接线与契约

**Files:** `admin.ts`、`org-profile-api.ts`、`index.vue`、定向 Vitest、`openapi.yaml`、Staging 手册。

- [x] 写失败用例：暂停和冻结请求携带原因，刷新后原因可见。
- [x] 接线 DTO 与请求；修正司机登录提示为当前实际范围。
- [x] 运行后台类型检查、定向测试、路由契约和 H5 构建。

**运行边界：** 本机无 MySQL/Docker，真实迁移和浏览器跨服务验收留在 Staging 执行，并记录结果。

## 执行结果（2026-11-12）

- 新演示账号写入 `S-DEMO-001`；已有未关联账号维持未关联，开通同名账号返回冲突。只读 SQL 列出待人工核对的账号及同手机号候选。
- org V6、auth V4 保存当前暂停和冻结原因，恢复/解冻清除；后台请求、DTO 与显示接线完成，司机登录提示缩到供应商账号实际范围。
- 红灯已复现：演示账号供应商 ID 为空、暂停原因未校验、冻结原因未校验、前端未发送/回读原因。绿灯：auth 全量 16 项、auth 审计 15 项、org 审计 24 项；后台相关 271 项、类型检查、H5 构建、95 项 API 契约与页面覆盖审计通过。
- 真实 MySQL 迁移、已有账号人工关联和浏览器跨服务验收尚未执行；未提交、未推送。
