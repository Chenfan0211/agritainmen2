# 沙箱退款重试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消后到账的支付单在本地沙箱完成全额退款，并在渠道失败或响应丢失后安全重试。

**Architecture:** `REFUND_REQUIRED` 是持久待退款状态；退款请求使用支付单 ID 派生的稳定退款单号和原支付金额。渠道确认成功后，支付服务在本地事务中转为 `REFUNDED` 并写出站事件；失败保持待退款状态，定时任务分批重试。沙箱渠道支持幂等退款，未配置的微信 V3 渠道继续显式拒绝。

**Tech Stack:** Spring Boot、JdbcTemplate、JUnit 5、H2、现有 `PaymentProvider`。

**Spec:** `docs/superpowers/plans/2026-11-16-payment-order-state.md` 的 `REFUND_REQUIRED` 后续风险。

## Global Constraints

- 只处理订单已为 `UNPAID_CANCELLED` 且支付成功流水已记录的全额退款，不引入部分退款或买家主动退款入口。
- 真实微信 V3 商户证书、平台证书与回调验签未接入；本批不能宣称真实微信退款成功。
- 同一支付单所有重试使用同一退款单号；渠道返回明确成功后才能写 `REFUNDED`。
- 本地 H2 与替身渠道测试不等于真实跨服务或 Staging 验收。

---

### Task 1: 失败用例与渠道契约

**Files:** `backend/services/payment-service/src/test/java/com/agritainmen/payment/PaymentServiceTest.java`、`backend/services/payment-service/src/main/java/com/agritainmen/payment/provider/{PaymentProvider,SandboxPaymentProvider,WechatV3PaymentProvider}.java`。

- [x] 写取消后到账退款、渠道失败、重复回调、退款确认后数据库提交失败的用例并确认失败。
- [x] 扩展渠道退款接口，沙箱按稳定退款单号幂等返回成功，微信 V3 占位实现明确拒绝。

### Task 2: 持久状态与定时重试

**Files:** `backend/services/payment-service/src/main/java/com/agritainmen/payment/service/PaymentService.java`，对应测试。

- [x] `REFUND_REQUIRED` 后尝试全额退款；成功才转 `REFUNDED` 并写出站事件，失败保留待退款。
- [x] 定时分批重试，单条失败不阻塞其他支付单；重复回调与丢失响应不造成重复退款。
- [x] 运行支付服务普通测试与 API 审计。

### Task 3: 契约与交付

**Files:** `backend/README.md`、`docs/backend/openapi.yaml`、`docs/superpowers/plans/2026-11-16-payment-order-state.md`、本计划。

- [x] 更新状态说明、真实渠道边界，运行后端路由契约与门店回读测试。
- [x] 检查差异与推送地址，仅提交本批文件并推送开发分支。

## 本地验证

- 支付服务普通测试与 API 审计共 26 项通过，包含退款失败、重复回调、渠道响应丢失、退款状态入库失败、缺少渠道流水的队列轮转及 HTTP 回读。
- 门店回读测试 7 项通过；后端实际路由与 OpenAPI 各 111 项一致。
- `wechat-v3` 仍为拒绝调用的占位实现；未执行真实微信退款或 Staging 验收。
