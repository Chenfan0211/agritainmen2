# 农业供应链后端

Spring Boot 4 / Spring Cloud Alibaba 多模块后端，提供四端真实接口、鉴权、库存、订单、支付、履约和结算能力。

## 环境

- Java 21
- Maven 3.9+
- 本机默认 `JAVA_HOME` 若不是 JDK 21，请在命令前显式设置。
- Docker Compose 用于 MySQL、Redis、RabbitMQ、Nacos、MinIO 和 Prometheus。

## 常用命令

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn -f backend/pom.xml -DskipTests compile
mvn -f backend/pom.xml test
```

根目录兼容命令：`pnpm backend:compile`、`pnpm backend:test`、`pnpm backend:package`。

## 本地基础设施

```powershell
Copy-Item deploy/compose/.env.example deploy/compose/.env
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up -d
```

本机没有 Docker 时，仍可运行服务单测；Compose 的启动验收必须在安装 Docker 的环境执行。

## 本地沙箱支付联调

启动 `order-service` 与 `payment-service` 时，给两个进程设置相同的 `ORDER_PAYMENT_INTERNAL_TOKEN`；给 `payment-service` 另设 `PAYMENT_CALLBACK_INTERNAL_TOKEN`。两项均无默认值，未设置时内部确认或沙箱回调会拒绝执行。支付服务的 `ORDER_SERVICE_BASE_URL` 默认是 `http://127.0.0.1:8085`。

先用当前买家的 Bearer 调用 `POST /api/v1/payments/intents`，金额必须与待付款订单的 `amountCents` 一致；再以 `X-Payment-Callback-Token` 调用 `POST /api/v1/payments/callback/wechat` 发送沙箱成功/失败回调。随后查询订单与 `GET /api/v1/payments/orders/{orderId}`：成功为 `PAID`，订单服务暂不可用时为 `PAID_PENDING_ORDER`，取消后到账为 `REFUND_REQUIRED`。回调流水号应保持唯一；`REFUND_REQUIRED` 仅记录待退款事实，不会自动退款。微信 V3 证书和真实回调验签尚未接入。

待付款取消先提交订单的 `UNPAID_CANCELLED` 状态，再释放库存预占。若库存服务暂不可用，订单仍显示已取消，订单服务保留 `release_pending` 并每 30 秒分批重试；再次调用取消接口也会触发重试。本地可通过 H2 测试覆盖失败及重试路径，真实库存服务联调需另行执行。

## 端口

| 服务 | 端口 |
|---|---:|
| api-gateway | 8080 |
| auth-service | 8081 |
| org-service | 8082 |
| catalog-service | 8083 |
| inventory-service | 8084 |
| order-service | 8085 |
| payment-service | 8086 |
| fulfillment-service | 8087 |
| settlement-service | 8088 |
| platform-admin-service | 8089 |
| notification-service | 8090 |


## Staging

完整环境变量、Caddy 部署、微信白名单和回滚步骤见 `../docs/backend/staging-runbook.md`。
