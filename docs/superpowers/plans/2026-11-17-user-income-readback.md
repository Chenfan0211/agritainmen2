# 用户端收入汇总与明细回读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户端 API 模式显示本人真实佣金汇总与明细，并区分审核通过待付款和真正已提现。

**Architecture:** `GET /commissions/me` 返回累计收入、真实已提现与审核通过待付款金额；新增本人佣金明细接口，按 `(created_at,id)` 倒序游标分页并限定平台租户及当前团长。用户 Store 单独维护本人明细及加载游标；运营页收入区使用服务端汇总、明细和现有设计 token 展示。演示模式不变。

**Tech Stack:** Spring Boot 4、JdbcTemplate、H2、原生小程序、TypeScript、Vitest。

**Spec:** `docs/superpowers/plans/2026-11-16-admin-withdrawal-review.md` 的“审核通过不等于到账”约束及当前运营页 API 模式空明细。

## Global Constraints

- 审核通过的申请继续占用可提现余额，但不能计入真实已提现；金额只以服务端状态计算。
- 明细游标只允许当前团长持有，跨团长、跨租户和失效令牌不能读取。
- API 模式不读取本地演示佣金；演示模式维持原行为。
- 本批仅验证本地 H2 和前端构建，不代替 MySQL、Staging、真机与真实付款验收。

---

### Task 1: 服务端财务语义与本人明细

- [x] 先写审核通过不计入已提现、收入总额和本人明细游标续页的失败用例；覆盖身份和租户隔离。
- [x] 实现汇总字段与本人明细接口；增加按团长、创建时间和 ID 查询的索引，更新 OpenAPI。

### Task 2: 用户端收入页

- [x] 先写 API 模式佣金明细读取、续页、身份切换和本地演示隔离用例。
- [x] Store 保留服务端收入汇总和明细；运营页使用真实累计收入、已结算、待结算、已提现及审核通过待打款金额，提供明细加载更多。
- [x] 保持原有设计 token，构建和视觉静态检查通过。

### Task 3: 验证与交付

- [x] 运行结算服务常规与 API 审计、用户端完整测试、类型检查、构建、契约和差异检查。
- [x] 核对 origin 地址，提交并推送当前交付分支。
