# 待付款取消库存释放补偿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 门店取消待付款订单时，先持久化取消结果；库存释放失败或响应丢失后由服务端重试，最终清除待释放标记。

**Architecture:** `trade_order` 增加 `release_pending`。取消事务在订单行锁下将 `PENDING_PAYMENT` 改为 `UNPAID_CANCELLED` 并置待释放标记，与支付确认互斥；事务提交后调用库存释放。库存服务的释放接口幂等，成功后清除标记；失败保持标记，定时任务按批重试。重复取消也尝试完成待释放工作。

**Tech Stack:** Spring Boot、JdbcTemplate、Flyway、H2、JUnit 5、现有库存服务 HTTP 客户端。

**Spec:** `docs/superpowers/plans/2026-11-16-payment-order-state.md` 的取消补偿后续风险。

## Global Constraints

- 订单对买家的可见状态仍为 `UNPAID_CANCELLED`，门店端无需新增状态映射或演示逻辑。
- 支付确认与取消继续用同一订单行锁；库存服务明确返回 `RELEASED` 才清除待释放标记。
- 本地 H2 和替身库存测试不等于真实跨服务、Staging 或真机验收。

---

### Task 1: 失败用例与数据迁移

**Files:** `backend/services/order-service/src/test/java/com/agritainmen/order/OrderServiceTest.java`、`src/main/resources/db/migration/V3__order_release_pending.sql`。

- [x] 先写库存释放失败仍保留已取消和待释放标记、重复取消触发重试、服务端定时重试、支付不能越过已取消状态的失败用例并确认失败。
- [x] 增加 `release_pending` 列及默认值，旧订单迁移后默认为无待释放工作。

### Task 2: 事务边界与重试

**Files:** `backend/services/order-service/src/main/java/com/agritainmen/order/service/OrderService.java`，必要时更新接口审计。

- [x] 先提交取消事务，再调用幂等库存释放；只在成功时清除标记。
- [x] 定时批量重试并避免永久失败记录饿死后续订单。
- [x] 跑订单服务普通测试与 API 审计，确认取消接口仍只对当前买家开放。

### Task 3: 契约与交付

**Files:** `docs/backend/openapi.yaml`、`backend/README.md`、本计划。

- [x] 更新取消返回含义和本地调试说明；运行路由契约与门店回读测试。
- [x] 检查差异和推送地址，仅提交本批文件并推送。

## 本地验证

- 订单服务普通测试及 API 审计均通过；审计覆盖取消接口的买家范围与重复取消。
- 库存服务替身验证了取消提交后的释放、失败重试、响应丢失后的幂等重试及批量任务隔离；订单服务测试共 9 项通过。
- 门店回读测试 7 项通过；后端路由与 OpenAPI 各 111 项一致。
- 未执行真实跨服务联调或 Staging 验收。
