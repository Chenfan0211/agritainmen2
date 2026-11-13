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
