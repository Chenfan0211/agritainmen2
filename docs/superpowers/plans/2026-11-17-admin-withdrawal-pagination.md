# 管理员提现申请分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员提现列表按服务端分页与筛选，待办和角标仍显示全局待审数量。

**Architecture:** `GET /withdrawals` 接收页码、页大小、状态和关键词，返回 `items/page/pageSize/total/pendingTotal`。结算服务统一执行平台租户过滤、条件查询和稳定排序。后台 Store 保存当前查询与汇总，两个审核入口使用该页数据和分页控件；审核冲突或成功后重新查询当前页。

**Tech Stack:** Spring Boot 4、JdbcTemplate、H2、Vue 3、Pinia、Vitest、TypeScript。

**Spec:** 上一批 `docs/superpowers/plans/2026-11-16-admin-withdrawal-review.md` 的后续事项；用户继续下一批。

## Global Constraints

- 仅具备 `withdrawal.review` 或 `leader.withdrawal.review` 的平台管理员可查询。
- 全局待审数不受当前页、状态和关键词影响；待办点击后使用服务端待审筛选。
- API 模式不得回退到浏览器本地提现集合；演示模式保持现有行为。
- UI 仅使用现有设计 token 和 `PaginationBar`；不接真实付款或 Staging。

---

### Task 1: 服务端分页契约

- [x] 写权限、过滤、跨页排序、参数校验和全局待审数的失败用例。
- [x] 实现查询与索引，更新 OpenAPI。

### Task 2: 后台接线

- [x] 写 Store 分页、筛选、待办完整数量、审核后重查及本地隔离用例。
- [x] 接通 Store、佣金页和团长页的分页与筛选。

### Task 3: 验证与交付

- [x] 跑后端、前端、类型、构建、契约和差异检查。
- [x] 核对 origin 后提交并推送交付分支。
