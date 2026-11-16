# 提现申请幂等 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一团长用同一 `Idempotency-Key` 重试提现申请时只产生一条申请；复用键但修改金额或方式时返回 409。

**Architecture:** 在 `settlement_withdrawal` 上保存请求键，用平台租户、申请人、键的数据库唯一约束裁决并发。服务端先验证当前 Bearer 对申请人的权限，再插入申请；唯一冲突后读取原申请并比较请求参数。申请插入是一条原子 SQL，因此在数据库提交后处理冲突，保证并发重试可读到原申请。旧申请的键保持 NULL。

**Tech Stack:** Spring Boot 4、JdbcTemplate、Flyway、H2、JUnit 5、Maven。

**Spec:** `docs/superpowers/plans/2026-11-16-settlement-access.md` 的后续事项，以及现有 `POST /api/v1/withdrawals`。

## Global Constraints

- 仅处理提现申请创建的幂等行为；审批继续使用现有状态条件更新。
- `Idempotency-Key` 为必填、非空且不超过 128 字符；同一申请人的键与金额、方式绑定，不允许参数漂移。
- 平台租户和已验证的申请人共同限定键的作用域；不同申请人可使用相同键。
- 保持旧数据可迁移，旧记录的幂等键允许 NULL。
- 本地测试与 HTTP 联调不代表 Staging 或真实资金结算验收。

---

### Task 1: 契约与失败用例

- [x] 给提现 API 审计加入缺失键、重复提交、参数冲突和申请人隔离用例；运行定向测试，确认原实现失败。
- [x] 给并发同键申请加入服务层用例，确认只创建一条申请。

### Task 2: 最小实现

- [x] 新增 Flyway 迁移：幂等键列及 `(tenant_id, requester_id, idempotency_key)` 唯一索引。
- [x] Controller 接收请求头；服务校验键、插入申请、捕获唯一冲突并核对原申请，返回原 ID 或 `IDEMPOTENCY_CONFLICT`。
- [x] 调整原有提现测试调用，更新 OpenAPI 请求头与重试语义。

### Task 3: 验证与交付

- [x] 跑结算 API 审计与常规测试、后端契约检查和差异检查；本地 HTTP 验收由随机端口 API 审计覆盖。
- [x] 核对 `origin` 推送地址；仅提交本批文件并推送 `dev/dev-20261116`。

本地验证：API 审计涵盖重复申请、参数冲突、跨申请人隔离、缺失与超长键；常规测试覆盖并发同键申请。Flyway V3 在 H2 成功执行，后端与 OpenAPI 均为 111 个操作。未验证 MySQL 迁移、Staging 或真实资金结算。
