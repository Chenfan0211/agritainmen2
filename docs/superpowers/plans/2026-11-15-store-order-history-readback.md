# 门店服务端订单历史回读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API 模式冷启动恢复真实门店身份，并从订单服务回读当前门店的历史订单列表和详情。

**Architecture:** Auth `/me` 与 `/store/farm` 决定当前门店；订单列表按服务端分页读取，校验每条 `buyerId` 后映射页面数据。详情按 ID 重新读取并校验归属。API 模式不执行本地演示支付、取消、履约和售后状态变更。

**Tech Stack:** Taro 原生小程序、TypeScript、Vitest、现有 `apiRequest`。

**Spec:** `docs/superpowers/plans/2026-11-15-store-auth-order-integration.md` 的下一批回读项。

## Global Constraints

- 仅处理门店端订单回读和必要的身份恢复；后端订单路由及 mock 模式行为不变。
- 本地 API/H2 验证不等于 Staging 或真机验收。

---

### Task 1: 服务端订单读取与映射

**Files:** `apps/store/src/services/store-order-api.ts`, `apps/store/tests/stores/store-api-history.test.ts`, `backend/services/order-service/src/main/java/com/agritainmen/order/service/OrderService.java`, `backend/services/order-service/src/test/java/com/agritainmen/order/OrderListAuditTest.java`

- [x] 先写列表分页、归属校验、状态和商品映射、详情失败用例并确认失败。
- [x] 实现订单读取与严格映射；未知状态或跨门店数据拒绝展示。
- [x] 订单列表限定 `PLATFORM` 租户，验证同 `buyerId` 的其他租户数据不可见。
- [x] 运行定向测试。

### Task 2: 冷启动与当前会话接线

**Files:** `apps/store/src/stores/store.ts`, `apps/store/src/services/api-runtime.ts`, `apps/store/src/app.ts`, `apps/store/src/pages/index/index.ts`, `apps/store/tests/stores/store-api-auth.test.ts`

- [x] 先写保存令牌恢复身份、无效令牌清理、登录和刷新后从服务端回读订单的失败用例。
- [x] 接通启动、登录、刷新流程；API 模式清除持久化的旧演示订单与未校验身份。
- [x] 运行门店回归和类型检查。

### Task 3: 详情只读与交付

**Files:** `apps/store/src/pages/order-detail/index.ts`, `apps/store/src/pages/order-detail/index.wxml`, `apps/store/src/stores/store.ts`, `apps/store/tests/stores/store-api-history.test.ts`

- [x] 先写详情按 ID 回读及 API 模式本地状态变更被拒绝的失败用例。
- [x] 详情页加载服务端数据；API 模式隐藏演示动作和无服务端截止时间的倒计时。
- [x] 跑全量门店测试、类型检查、构建与差异检查，核对远端后提交推送。

**验证边界：** 本地门店测试 70 项、订单服务 API 审计与小程序构建通过；未执行 Staging/真机。订单服务当前不提供支付截止时间和完整履约时间线；API 模式仅展示服务端可确认的订单状态，支付、取消、履约与售后操作需要后续服务端接口接线。
