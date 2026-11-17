# 用户端提现历史分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户端按页读取本人提现历史，待审申请不在已加载页时仍能正确判断重复申请。

**Architecture:** `GET /withdrawals/me` 保留身份绑定的 `requesterId`，新增 `page/pageSize` 并返回 `items/total/pendingTotal`；`pendingTotal` 只统计当前团长。用户 Store 初次读取 10 条，历史区可加载后续页，提交前用服务端待审总数判重。身份失效或切换时清空旧数据。

**Tech Stack:** Spring Boot 4、JdbcTemplate、JUnit 5、原生小程序、Vitest、TypeScript。

**Spec:** `docs/superpowers/plans/2026-11-16-user-withdrawal-api.md` 和刚完成的管理员分页契约。

## Global Constraints

- 服务端先验证当前团长身份；跨团长、普通用户和失效令牌不可读取。
- `pendingTotal` 只属于请求者，不受分页影响；API 模式不读取本地提现集合。
- 演示模式保持原有提现行为，页面样式使用现有设计 token。
- 仅在本地验证；不接真实付款、MySQL 或 Staging。

---

### Task 1: 服务端分页与权限

- [x] 写本人跨页、待审数、跨团长和非法参数的失败用例。
- [x] 实现分页查询，更新 OpenAPI 与旧用例。

### Task 2: 用户端记录与入口

- [x] 写分页加载、跨页待审判重、身份切换和本地隔离失败用例。
- [x] Store 保存页信息并追加记录，首页显示总数与加载更多；提交后更新待审数。

### Task 3: 验证与交付

- [x] 跑后端和用户端测试、类型检查、小程序构建、契约与差异检查。
- [x] 核对 origin 后提交并推送交付分支。
