# 商品与库存服务显式鉴权 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉商品、库存独立启动时的默认 Basic 401 阻断，同时使管理写入和库存预占等服务写操作有明确、可验证的权限。

**Architecture:** 两服务配置自己的无状态安全链，业务读取可进入控制器；写请求由 MVC 拦截器按路径与方法验权。商品管理写入和库存调整通过 Auth `/api/v1/auth/me` 实时核验管理员令牌；库存预占、释放、确认使用仅订单服务与库存服务共享的内部令牌，订单 HTTP 客户端必须发送。生产配置缺令牌时拒绝写入，Compose 传递同一专用环境变量。

**Tech Stack:** Spring Boot 4、Spring Security、Spring MVC、RestClient、JUnit 5、H2、Maven。

**Spec:** `docs/backend/staging-runbook.md` 中 2026-11-16 本地订单与库存独立进程联调发现的默认鉴权阻断。

## Global Constraints

- 不信任客户端传来的 `X-Actor-*`；管理员身份以 Auth 当前 `/me` 结果为准，失效令牌返回 401，非管理员返回 403。
- `GET` 商品与可用库存保持现有网关可用；库存变更接口不允许匿名或仅凭买家 Bearer 调用。
- 内部令牌无默认值；缺失配置、缺失请求头和错误令牌均不能改变库存。
- 本地 H2 HTTP 联调不代表 MySQL、RabbitMQ、网关或 Staging 验收。

---

### Task 1: 失败用例

**Files:** `backend/services/catalog-service/src/test/java/com/agritainmen/catalog/CatalogSecurityAuditTest.java`、`backend/services/inventory-service/src/test/java/com/agritainmen/inventory/InventorySecurityAuditTest.java`、`backend/services/order-service/src/test/java/com/agritainmen/order/HttpInventoryClientTest.java`。

- [x] 写商品读取与管理写入的匿名、普通账号、管理员、失效令牌 HTTP 用例；验证默认代码下不能满足。
- [x] 写库存读取、预占/释放/确认、库存调整的缺令牌、错误令牌、管理员和失效令牌 HTTP 用例；验证默认代码下不能满足。
- [x] 写订单库存客户端发送内部令牌和缺配置拒绝调用的用例；验证默认代码下不能满足。

### Task 2: 服务端鉴权

**Files:** `backend/common/common-web/src/main/java/com/agritainmen/common/web/RemoteAdminVerifier.java`、两服务的安全配置及库存访问校验、`backend/services/order-service/src/main/java/com/agritainmen/order/client/HttpServiceClients.java`。

- [x] 实现实时 Auth 管理员核验与无状态路由安全链，商品所有非 GET 管理写入都需管理员。
- [x] 库存预占/释放/确认核验固定内部令牌；库存调整核验管理员，未知写路径保持拒绝。
- [x] 订单 HTTP 客户端为三个库存写调用发送令牌，未配置时在发请求前失败。
- [x] 保持原有 API 功能测试通过，并新增显式鉴权正反例通过。

### Task 3: 配置与交付

**Files:** 两服务和订单服务 `application.yml`、`deploy/compose/docker-compose.yml`、`deploy/compose/.env.example`、`docs/backend/staging-runbook.md`、本计划。

- [x] 配置 Auth 内部地址与库存共享令牌，更新本地运行说明和 OpenAPI 关键写接口权限说明。
- [x] 运行三服务单测、API 审计、路由契约，并在本地无安全覆盖启动后做真实 HTTP 正反例。
- [x] 检查差异与 origin 推送地址，仅提交本批文件并推送开发分支。
