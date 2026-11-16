# 订单支付确认补偿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 库存确认成功而订单库后续提交失败时，保留可恢复的确认工作并禁止取消，最终将订单收敛为 `PAID`。

**Architecture:** `trade_order` 增加 `confirmation_pending` 标记。内部支付确认先在订单行锁下提交标记，与取消互斥；再调用幂等的库存确认；成功后另起事务更新 `PAID`、清除标记并写出站事件。调用失败时标记保留，由支付服务现有重试和订单服务定时任务继续确认。

**Tech Stack:** Spring Boot、JdbcTemplate、Flyway、H2、JUnit 5、现有库存服务 HTTP 客户端。

**Spec:** `docs/superpowers/plans/2026-11-16-payment-order-state.md` 的支付确认跨服务提交风险。

## Global Constraints

- 买家可见订单状态沿用 `PENDING_PAYMENT`、`PAID`、`UNPAID_CANCELLED`，不增设公开状态。
- 仅有支付服务持内部令牌可启动确认；库存确认必须明确返回同一预占单的 `CONFIRMED`。
- 确认标记存在时取消返回冲突；取消先赢时内部确认返回 `UNPAID_CANCELLED`，供支付服务登记 `REFUND_REQUIRED`。
- 本地 H2 与替身库存测试不等于真实跨服务、微信支付或 Staging 验收。

---

### Task 1: 复现失败与迁移

**Files:** `backend/services/order-service/src/test/java/com/agritainmen/order/OrderServiceTest.java`、`backend/services/order-service/src/main/resources/db/migration/V4__order_confirmation_pending.sql`。

- [x] 增加“库存已确认、订单写入失败”用例，断言仍有待确认标记、取消被拒、重试后订单为 `PAID`，先运行并确认失败。
- [x] 增加确认中库存暂不可用、重复确认及取消先赢用例，确认失败路径与幂等边界。
- [x] 增加默认 `false` 的迁移列；旧订单不自动进入确认中。

### Task 2: 两段事务与定时补偿

**Files:** `backend/services/order-service/src/main/java/com/agritainmen/order/service/OrderService.java`。

- [x] 在第一段事务中锁定订单、校验金额与状态、设置确认标记；取消按同一行锁检查标记。
- [x] 第一段事务提交后调用库存确认；成功后第二段事务提交 `PAID`、清除标记与出站事件。
- [x] 订单服务分批重试确认中记录；失败记录轮转，重复调用幂等。
- [x] 运行订单服务普通测试与 API 审计，确认买家范围和内部令牌边界。

### Task 3: 契约与交付

**Files:** `docs/backend/openapi.yaml`、`backend/README.md`、本计划。

- [x] 更新内部支付确认与取消的响应说明，运行路由契约和门店回读测试。
- [x] 核对差异与目标远端，仅提交本批文件并推送开发分支。

## 本地验证

- 订单与支付服务普通测试、API 审计共 50 项通过；新增第一段事务失败用例后，订单服务定向测试 14 项通过。
- 门店订单回读测试 7 项通过；后端实际路由与 OpenAPI 各 111 项一致。
- H2 约束模拟确认标记及最终订单提交失败，替身库存验证幂等调用；未启动真实跨服务链路、微信支付或 Staging。
