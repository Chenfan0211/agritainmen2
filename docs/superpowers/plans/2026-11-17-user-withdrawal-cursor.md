# 用户端提现历史稳定续页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户端读取提现历史期间出现新申请时，加载更多不重复、不漏掉原有记录。

**Architecture:** 本人查询保留现有页码契约，并增加可选 `beforeId`。带游标时，服务端验证该记录属于当前申请人，再按 `(created_at, id)` 倒序续查，不使用 offset。用户端保存服务端返回的末条 ID 作为下一次游标，首次查询的总数作为本轮加载上限；刷新后开始新一轮查询。管理员页码筛选不变。

**Tech Stack:** Spring Boot 4、JdbcTemplate、H2、原生小程序、Vitest。

**Spec:** `docs/superpowers/plans/2026-11-17-user-withdrawal-history-pagination.md` 的下一批稳定续页。

## Global Constraints

- 跨团长游标与不存在的游标不得读取其他人的提现记录。
- `pendingTotal` 仍实时统计本人待审申请；首次查询的 `total` 决定当前加载轮次的总数。
- 旧客户端不带 `beforeId` 时继续使用现有页码行为。
- 仅本地验证；不接真实付款、MySQL 或 Staging。

---

### Task 1: 本人查询游标

- [x] 在 `SettlementBearerScopeAuditTest` 先复现“第一页之后插入新申请，续页不应重复”的失败，以及跨团长和不存在游标的拒绝。
- [x] 给 `GET /withdrawals/me` 增加可选 `beforeId`，查询仅在当前租户和申请人范围内定位游标，按创建时间与 ID 倒序续页。
- [x] 更新 OpenAPI 中本人提现查询的游标说明和参数。

### Task 2: 用户端稳定加载

- [x] 在 `user-api-withdrawal.test.ts` 先复现新申请插入后客户端带末条 ID 续页、当前轮次总数不增加。
- [x] Store 保存并重置末条游标；加载更多带游标并保持首次查询总数，继续更新实时待审数。

### Task 3: 验证与交付

- [x] 运行结算服务测试、用户端测试、类型检查、小程序构建、路由契约和差异检查。
- [x] 核对 origin 推送地址，提交并推送当前交付分支。
