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

商品、库存和订单服务独立启动时，分别给商品与库存服务设置 `AUTH_SERVICE_BASE_URL`，使管理写入实时核验 Auth 当前管理员令牌；给库存与订单服务设置相同的 `INVENTORY_INTERNAL_TOKEN`。商品及可用库存读取可直接访问服务；商品写入和库存调整需要当前平台管理员 Bearer，库存预占、释放、确认需要订单服务的 `X-Inventory-Internal-Token`。内部令牌无默认值，未配置时库存写入会拒绝执行。完整部署还需使用实际 MySQL、RabbitMQ 与网关环境验证。


启动 `order-service` 与 `payment-service` 时，给两个进程设置相同的 `ORDER_PAYMENT_INTERNAL_TOKEN`；给 `payment-service` 另设 `PAYMENT_CALLBACK_INTERNAL_TOKEN`。两项均无默认值，未设置时内部确认或沙箱回调会拒绝执行。支付服务的 `ORDER_SERVICE_BASE_URL` 默认是 `http://127.0.0.1:8085`。

先用当前买家的 Bearer 调用 `POST /api/v1/payments/intents`，金额必须与待付款订单的 `amountCents` 一致；再以 `X-Payment-Callback-Token` 调用 `POST /api/v1/payments/callback/wechat` 发送沙箱成功/失败回调。随后查询订单与 `GET /api/v1/payments/orders/{orderId}`：成功为 `PAID`，订单服务暂不可用时为 `PAID_PENDING_ORDER`，取消后到账进入沙箱全额退款，渠道确认成功后为 `REFUNDED`，失败或响应丢失时为 `REFUND_REQUIRED`。回调流水号应保持唯一；退款重试使用由支付单 ID 派生的固定退款单号，每 30 秒分批重试，重复回调也会重试。微信 V3 证书、真实回调验签和真实退款接口尚未接入；`REFUNDED` 在此仅代表本地沙箱结果。

待付款取消先提交订单的 `UNPAID_CANCELLED` 状态，再释放库存预占。若库存服务暂不可用，订单仍显示已取消，订单服务保留 `release_pending` 并每 30 秒分批重试；再次调用取消接口也会触发重试。本地可通过 H2 测试覆盖失败及重试路径，真实库存服务联调需另行执行。

创建订单先持久化幂等键、报价快照和内部 `CREATING` 订单，再以固定参数调用库存预占；预占成功后提交 `PENDING_PAYMENT`。库存或订单库暂不可用时，原幂等键重试与订单服务每 30 秒的后台任务会继续同一订单；明确库存不足时记录内部 `CREATE_FAILED` 并返回 `OUT_OF_STOCK`，补货后不会自动创建，买家需用新幂等键重新下单。两种内部状态均不出现在买家列表与详情。当前仅由本地 H2 与替身/本地 HTTP 库存测试覆盖，真实跨服务联调尚未执行。

支付服务发起内部确认后，订单服务先提交 `confirmation_pending`，此时取消接口返回 409；库存确认成功后才将订单提交为 `PAID`。若库存确认或订单入库失败，支付服务保持 `PAID_PENDING_ORDER`，订单服务也会每 30 秒重试确认中订单。即使库存已确认但订单提交失败，重复确认仍可收敛到 `PAID`。这条路径目前通过本地 H2 与替身库存测试，尚未进行真实跨服务联调。

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
