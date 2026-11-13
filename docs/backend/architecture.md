# Spring 微服务架构说明

## 版本基线

- Java 21
- Spring Boot 4.0.9
- Spring Cloud 2025.1.0
- Spring Cloud Alibaba 2025.1.0.0
- MyBatis-Plus 3.5.17
- MySQL 8.4 / Redis 7.4 / RabbitMQ / Nacos 3.1.1 / MinIO

## 服务边界

```text
api-gateway
  ├─ auth-service
  ├─ org-service
  ├─ catalog-service
  ├─ inventory-service
  ├─ order-service
  ├─ payment-service
  ├─ fulfillment-service
  ├─ settlement-service
  ├─ platform-admin-service
  └─ notification-service
```

- 每个服务独占自己的数据库 schema，禁止跨服务外键和跨 schema JOIN。
- 同步读取和库存预占走 REST；状态通知、审计、补偿走 RabbitMQ Outbox/Inbox。
- 核心交易不引入 Seata 2PC，采用本地事务、条件更新、库存预占/释放和 Saga 补偿。
- 金额在 API 和数据库中统一使用整数分。

## 关键一致性规则

- 订单创建使用 `Idempotency-Key`，`trade_order_request` 唯一约束负责重复请求复用。
- 库存预占使用 `available_qty >= quantity` 条件更新，违反条件即库存不足。
- 支付回调使用 `(provider, provider_txn_id)` 唯一约束，重复回调返回既有支付状态。
- 提现审核只能从 `PENDING` 条件更新一次，重复审核返回冲突。
- 所有业务表保留 `tenant_id`，首版固定为 `PLATFORM`。

## 安全规则

- 后台、门店、供应商账号密码只存 BCrypt 哈希。
- Access Token 有效期 15 分钟，Refresh Token 7 天并在刷新时轮换；旧 refresh token 立即撤销。
- 微信登录由服务端调用 `jscode2session`，生产环境禁止信任客户端 openid。
- 网关校验 JWT 并向下游传递 `X-Actor-Type`、`X-Actor-Id`、`X-Tenant-Id`。
- 生产密钥只允许来自环境变量/Secret，不进入 Git、Nacos 明文或 `VITE_*`。
