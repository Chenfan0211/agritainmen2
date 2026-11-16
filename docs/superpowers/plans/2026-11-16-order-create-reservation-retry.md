# 订单创建库存预占补偿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 订单创建时即使库存已预占而订单最终提交失败，也能从订单库中的持久创建记录重试并收敛，不留下无人关联的库存预占。

**Architecture:** 创建请求先在订单库保存幂等键、报价快照、订单与商品行，订单暂为内部 `CREATING`，不进入公开列表。事务提交后，锁住该订单行，使用持久商品行与订单创建时间推导的固定到期时间调用库存预占；成功后在同一锁事务中转为 `PENDING_PAYMENT` 并写出站事件。重复请求与定时任务都可按原订单 ID 重试，库存服务的幂等键为该订单 ID。

库存服务明确返回 `OUT_OF_STOCK` 时，将订单记为内部 `CREATE_FAILED`，停止后台重试；真实 HTTP 客户端只识别库存服务明确给出的该错误码。买家须用新幂等键重新下单。

**Tech Stack:** Spring Boot、JdbcTemplate、Flyway、H2、JUnit 5、现有库存服务 HTTP 客户端。

**Spec:** `docs/superpowers/plans/2026-11-16-order-payment-confirm-retry.md` 后续审查发现的创建事务跨服务边界。

## Global Constraints

- 创建成功响应仍是 `PENDING_PAYMENT`；`CREATING` 与 `CREATE_FAILED` 不进入买家订单列表或详情，支付确认和取消均不得处理它们。
- 库存预占的订单 ID、商品行及到期时间在首次调用和后续重试中必须完全一致。
- 同一幂等键只对应一个订单；请求内容变化继续返回幂等冲突。
- 本地 H2 与替身库存测试不等于真实跨服务或 Staging 验收。

---

### Task 1: 失败用例

**Files:** `backend/services/order-service/src/test/java/com/agritainmen/order/OrderServiceTest.java`。

- [x] 写库存服务故障后订单创建记录仍持久、重复请求与定时任务可重试的失败用例并确认失败。
- [x] 写库存成功而订单最终提交失败、重试仅预占一次，以及库存调用前创建记录已经提交的失败用例。
- [x] 写明确库存不足后不会自动创建的用例，并覆盖真实 HTTP 错误码映射。
- [x] 写同单并发重试的失败用例，验证库存不足后不会被另一路重试误报成功。
- [x] 修复同秒创建时业务订单号随机尾号碰撞造成的误判冲突。

### Task 2: 创建两段事务

**Files:** `backend/services/order-service/src/main/java/com/agritainmen/order/service/OrderService.java`、必要时 `web/OrderController.java`。

- [x] 把幂等键、报价、订单及商品行作为 `CREATING` 先提交；重复键按原请求快照继续。
- [x] 从持久订单读取固定预占参数，同单加锁预占；库存成功后提交 `PENDING_PAYMENT` 与 `order.created` 事件，失败保留创建记录。
- [x] 定时批量重试并轮转失败记录，公开列表隐藏创建中记录。
- [x] 运行订单服务普通测试与 API 审计，确认买家范围、幂等语义和支付边界。

### Task 3: 契约与交付

**Files:** `backend/README.md`、`docs/backend/openapi.yaml`、本计划。

- [x] 更新创建失败和后台重试说明；运行路由契约和门店回读测试。
- [x] 检查差异与推送地址，仅提交本批文件并推送开发分支。
