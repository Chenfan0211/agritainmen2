# 跨供应商订单拆分履约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个交易订单中的多个供应商各自生成、查看、处理自己的履约单。

**Architecture:** 保留 `fulfillment_order`，将唯一范围从订单扩为订单加供应商。Flyway Java 迁移按数据库元数据找到旧唯一约束，分别使用 MySQL 与 H2 支持的删除语法，再创建命名复合唯一约束。创建接口按订单与供应商查询幂等记录；订单来源仍由订单服务受控接口核验。

**Tech Stack:** Java 21、Spring Boot、JdbcTemplate、Flyway、MySQL、H2、JUnit 5。

**Spec:** `docs/superpowers/plans/2026-11-15-fulfillment-order-source.md` 的后续前置事项。

## Global Constraints

- 仅改履约服务及本计划，不改前端和订单服务。
- 历史履约单原样保留；当前 `buyerId` 和收货地址尚未绑定真实门店身份。
- 本地接口测试与迁移测试，不宣称 Staging 验收。
- 推送前确认 `origin` 指向 `https://github.com/Chenfan0211/agritainmen2.git`。

---

### Task 1: 放开跨供应商订单来源校验

**Files:**
- Modify: `backend/services/fulfillment-service/src/main/java/com/agritainmen/fulfillment/client/OrderSourceClient.java`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/OrderSourceClientTest.java`

**Interfaces:**
- Produces: `load(orderId, supplierId, authorization)` 对混合供应商订单中的有效供应商返回同一收货快照；无关联供应商返回 `FORBIDDEN`。

- [x] 测试先改为期望 S1、S2 均可读取混合订单，S3 被拒绝，并运行确认失败。
- [x] 删除整单单供应商限制，保留服务端商品归属核验和数据格式校验。
- [x] 运行定向测试确认通过。

### Task 2: 唯一键迁移与创建幂等

**Files:**
- Create: `backend/services/fulfillment-service/src/main/java/db/migration/V3__multi_supplier_fulfillment.java`
- Create: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentUniqueScopeTest.java`
- Modify: `backend/services/fulfillment-service/src/main/java/com/agritainmen/fulfillment/web/FulfillmentController.java`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentApiAuditTest.java`
- Modify: `backend/services/fulfillment-service/src/test/java/com/agritainmen/fulfillment/FulfillmentScopeAuditTest.java`

**Interfaces:**
- Produces: `(tenant_id, order_id, supplier_id)` 唯一；`POST /api/v1/fulfillment/orders` 对同供应商重试返回同 ID，不同供应商各自创建；无商品归属者拒绝。

- [x] 写重复订单不同供应商可存、重复同供应商不可存的数据库测试，确认旧约束下失败。
- [x] 写创建接口测试：同订单 S1/S2 独立、各自可见，同供应商重试复用原 ID。
- [x] 实现元数据迁移和创建查询范围调整，并验证已有履约记录升级保留。
- [x] 跑履约服务普通与 API 审计测试、API 契约、`git diff --check`。
- [x] 核对暂存文件和推送地址，提交并推送。

## 验证边界与后续

- V2 到 V3 的历史数据迁移及复合唯一约束已由本地 H2 测试覆盖；本机没有 MySQL 实例，MySQL 迁移尚未实测。
- 门店账号与订单 `buyerId` 的服务端绑定、支付状态回写仍是后续前置事项。
