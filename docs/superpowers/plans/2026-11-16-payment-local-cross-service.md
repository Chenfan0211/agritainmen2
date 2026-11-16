# 沙箱支付本地跨服务联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以独立进程验证沙箱支付到订单及库存的真实 HTTP 调用，并补齐部署时跨服务令牌与地址配置。

**Architecture:** Auth、Catalog、Inventory、Order、Payment 使用各自 H2 数据源启动，服务间通过现有 HTTP 客户端调用，不排除安全链。先记录正反例；若暴露行为缺陷，按失败用例定位并做最小修复。Compose 为订单和支付服务传递同一支付确认令牌，为支付服务传递独立回调令牌和容器内订单地址。

**Tech Stack:** Spring Boot 4、Spring Security、H2、Maven、PowerShell、Docker Compose 配置。

**Spec:** `docs/superpowers/plans/2026-11-16-payment-order-state.md`、`docs/superpowers/plans/2026-11-16-sandbox-refund-retry.md`。

## Global Constraints

- 只调用沙箱渠道；微信 V3 证书与真实回调验签尚未接入。
- `INVENTORY_INTERNAL_TOKEN`、`ORDER_PAYMENT_INTERNAL_TOKEN`、`PAYMENT_CALLBACK_INTERNAL_TOKEN` 分别配置，不共享用途。
- 本地 H2 验证不等于 MySQL、RabbitMQ、网关或 Staging 验收。
- 保留已有工作；仅改本批联调发现的缺口及直接相关文档配置。

---

### Task 1: 五进程 HTTP 正反例

- [x] 打包并独立启动 Auth、Catalog、Inventory、Order、Payment，全部使用显式安全链和 H2。
- [x] 验证支付意图的买家身份与金额，回调令牌缺失/错误，成功确认及重复回调。
- [x] 验证取消先于成功回调时订单保持取消、支付单完成沙箱退款且库存释放。
- [x] 若可复现，验证库存暂不可用时支付待同步及恢复后的重试收敛；记录实际边界。

### Task 2: 配置与证据

- [x] 给 Compose 的订单与支付服务传递 `ORDER_PAYMENT_INTERNAL_TOKEN`，支付服务传递 `PAYMENT_CALLBACK_INTERNAL_TOKEN` 和 `ORDER_SERVICE_BASE_URL`；给订单服务配置商品、库存容器内地址，放行订单与支付服务健康检查，更新 `.env.example`。
- [x] 更新本地运行说明与手册，准确记录实际 HTTP 结果和未验证环境。
- [x] 运行相关服务普通测试、API 审计、契约与差异检查。
- [x] 核对 origin 推送地址，提交本批文件并推送开发分支。
