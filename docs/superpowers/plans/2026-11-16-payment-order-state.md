# 支付回调与订单状态联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 沙箱支付成功回调能安全推进订单和预占库存；取消先于回调时保留待退款事实；跨服务暂时不可用时自动重试。

**Architecture:** 订单服务是订单状态与库存预占的唯一写入者。支付服务先用买家 Bearer 向订单服务核对订单归属、状态与金额；沙箱回调经独立令牌校验后，先在支付库持久化 `PAID_PENDING_ORDER`，再通过带内部令牌的订单接口尝试确认。订单服务对支付确认和取消使用同一行锁：支付先赢则 `PAID` 并确认库存；取消先赢则 `UNPAID_CANCELLED`，支付服务记为 `REFUND_REQUIRED`。网络失败保持待同步状态，由定时任务重试。

**Tech Stack:** Spring Boot、JdbcTemplate、H2、RestClient、JUnit 5、已有 outbox。

**Spec:** `docs/superpowers/plans/2026-11-16-store-unpaid-cancel.md` 中的后续风险。

## Global Constraints

- 不开放门店端真实微信支付；微信 V3 证书与回调校验尚未配置。
- 内部支付确认接口必须校验非空共享令牌；没有配置时拒绝调用。配置使用同一环境变量 `ORDER_PAYMENT_INTERNAL_TOKEN`。
- 沙箱回调必须校验独立的 `PAYMENT_CALLBACK_INTERNAL_TOKEN`；网关只放行该回调路径，创建和查询支付单仍要求买家 Bearer。
- 本地测试不等于真实支付、Staging 或真机验收。取消后到账只能登记为 `REFUND_REQUIRED`，本批不执行真实退款。

---

### Task 1: 订单状态与库存竞争

**Files:** `backend/services/order-service/src/main/java/com/agritainmen/order/{client/InventoryClient.java,client/HttpServiceClients.java,service/OrderService.java,web/OrderController.java}`, 对应测试与配置。

- [x] 先写支付先于取消、取消先于支付、库存确认失败、内部令牌缺失及错误的失败用例并运行。
- [x] 增加内部支付确认接口，复用订单行锁；确认库存后更新 `PAID`，重复支付确认幂等。
- [x] 跑订单服务普通测试与 API 审计。

### Task 2: 支付来源校验与可重试回调

**Files:** `backend/services/payment-service/src/main/java/com/agritainmen/payment/{client,service,web}`，对应测试与配置。

- [x] 先写跨买家读取、金额不符、成功同步、取消后到账、服务暂不可用后重试及重复回调的失败用例并运行。
- [x] 创建支付意图时按 Bearer 读取订单；回调校验后持久化待同步状态，按订单服务返回状态收敛为 `PAID` 或 `REFUND_REQUIRED`；定时重试待同步记录。
- [x] 跑支付服务普通测试与 API 审计。

### Task 3: 契约与交付

**Files:** `docs/backend/openapi.yaml`、`scripts/backend-api-contract.mjs`、本计划。

- [x] 更新内部路由与支付状态文档，运行契约检查。
- [x] 运行相关回归、差异检查；核对 origin 推送地址后提交推送。

**本地验证：** 订单、支付、网关三个模块共 55 项普通测试与 API 审计零失败；门店订单回读 7 项通过；OpenAPI 与后端 111 个操作一致。支付服务到订单服务的 HTTP 客户端有本地回环测试，但未启动真实多服务链路、Staging 或真机。

**后续风险更新：** `REFUND_REQUIRED` 仅登记待退款，不执行退款；微信 V3 证书与验签未配置。取消库存释放补偿见 `2026-11-16-order-cancel-release-retry.md`，支付确认跨服务补偿见 `2026-11-16-order-payment-confirm-retry.md`。两项均只通过本地替身测试，真实支付开放前仍需跨服务联调。
