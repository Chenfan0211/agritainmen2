# 履约单来源核验与收货快照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建履约单时核验订单服务中的订单与供应商商品归属，并保存收货信息快照供后续配送线路使用。

**Architecture:** 订单服务提供管理员令牌保护的履约来源专用接口，履约服务通过此接口读取订单，不接受客户端提交的收货信息。查询成功后核对订单商品的 `supplierId`，拒绝当前唯一索引无法表达的跨供应商订单，再在本地事务中保存快照；重复请求须核对现有履约单的供应商。订单 `buyerId` 尚未绑定已认证的门店账号，不能据此自动建立可信门店坐标。

**Tech Stack:** Java 21、Spring Boot、JdbcTemplate、Flyway、JUnit 5、H2。

**Spec:** `docs/superpowers/plans/2026-10-28-page-backend-remaining-plan.md` P4。

## Global Constraints

- 仅改订单、履约服务及本计划，不改 UI。
- 不接 Staging；本地服务和测试验收。
- 推送目标只能是 `https://github.com/Chenfan0211/agritainmen2.git`。

---

### Task 0: 订单服务提供受控来源查询

**Files:**
- Create: `backend/services/order-service/src/main/java/com/agritainmen/order/web/OrderFulfillmentSourceController.java`
- Create: `backend/services/order-service/src/main/java/com/agritainmen/order/OrderSourceSecurityConfiguration.java`
- Test: `backend/services/order-service/src/test/java/com/agritainmen/order/OrderFulfillmentSourceAuditTest.java`
- Modify: `backend/services/order-service/src/main/resources/application.yml`
- Modify: `backend/services/order-service/src/test/resources/application-test.yml`

**Interfaces:**
- Produces: `GET /api/v1/orders/{id}/fulfillment-source`，仅通过 Auth `/me` 核验的 PLATFORM 管理员可读取完整订单来源。

- [x] 写 HTTP 测试：无令牌、供应商令牌拒绝；管理员令牌返回订单、收货信息和供应商商品。
- [x] 运行定向测试确认默认鉴权返回 401 而非预期的 403。
- [x] 加独立路径安全链及控制器鉴权；其他订单路径保留现有默认鉴权行为。
- [x] 运行定向测试确认通过。

### Task 1: 核验订单来源

**Files:**
- Create: `backend/services/fulfillment-service/src/main/java/com/agritainmen/fulfillment/client/OrderSourceClient.java`
- Test: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/OrderSourceClientTest.java`
- Modify: `backend/services/fulfillment-service/src/main/resources/application.yml`

**Interfaces:**
- Produces: `OrderSourceClient.load(orderId, supplierId, authorization)` 返回订单 buyerId、receiver、receiverPhone、address；订单不存在、所属供应商不符、缺关键字段时拒绝。

- [x] 写本地 HTTP 假订单服务测试：正确供应商返回快照；不存在、无此供应商、跨供应商订单、错误 envelope 返回错误。
- [x] 运行定向测试，确认因缺少 `OrderSourceClient` 而失败。
- [x] 实现最少的 HTTP 查询、响应校验及故障处理；透传管理员令牌。
- [x] 运行定向测试确认通过。

### Task 2: 创建履约单保存快照与幂等核对

**Files:**
- Modify: `backend/services/fulfillment-service/src/main/java/com/agritainmen/fulfillment/web/FulfillmentController.java`
- Create: `backend/services/fulfillment-service/src/main/resources/db/migration/V2__fulfillment_order_destination.sql`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentControllerTest.java`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentApiAuditTest.java`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentScopeAuditTest.java`

**Interfaces:**
- Consumes: `OrderSourceClient.load`。
- Produces: 履约单 `buyer_id`、`receiver`、`receiver_phone`、`address` 快照；已有订单号但供应商不同返回冲突。

- [x] 写创建 API 测试：非法订单/供应商不入库；成功保存并在列表返回快照；重复请求保持同一 ID；供应商冲突拒绝。
- [x] 运行定向测试确认缺少快照列而失败。
- [x] 新增可空列迁移以兼容历史履约单，接入来源核验与快照写入，列表和单条查询返回字段。
- [x] 运行订单与履约服务测试、API 契约及 `git diff --check`，阅读输出。
- [x] 核对暂存文件和推送地址，提交并推送。

## 后续前置事项

- 门店账号与订单 `buyerId` 的服务端绑定，以及门店坐标的可信来源。
- 支付成功后订单状态回写；当前新订单仍为 `PENDING_PAYMENT`，履约创建尚未据付款状态拦截。
- 按供应商拆分跨供应商订单；当前接口明确返回冲突，防止一条履约单占用整单。
