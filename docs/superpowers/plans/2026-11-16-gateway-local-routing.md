# 网关本地路由与鉴权联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使网关按仓库配置正常启动，并通过本地 HTTP 验证关键业务路径的路由和令牌边界。

**Architecture:** 先用路由加载测试固定订单、售后与结算多路径应匹配到同一服务。修正 `Path` 谓词格式后启动网关，使用本机服务或等效本地后端验证公开登录、受保护业务读取、支付回调及伪造身份头；若默认 WebFlux Security 拦截业务请求，则用显式安全链把业务鉴权交给现有 `JwtAuthFilter`，其他路径保持关闭。

**Tech Stack:** Spring Boot 4、Spring Cloud Gateway WebFlux、Spring Security、JUnit 5、Maven、PowerShell。

**Spec:** `backend/services/api-gateway/src/main/resources/application.yml` 与 `JwtAuthFilter.java`，以及 `docs/backend/staging-runbook.md` 的本地联调边界。

## Global Constraints

- 保留网关当前 JWT 校验、管理员权限规则与 `X-Actor-*` 清理逻辑。
- 登录和沙箱支付回调仅按现有明确的 POST 路径公开；库存内部写入不能通过匿名网关暴露。
- 本地验证不等于 Nacos、MySQL、RabbitMQ、Docker Compose、Staging 或微信真机验收。
- 仅修复可复现的网关路由与安全阻断。

---

### Task 1: 路由加载

- [x] 写订单、售后、佣金、提现、结算路径的路由加载与匹配用例，验证现有配置失败。
- [x] 修正多路径 `Path` 谓词格式，确认网关启动和路由测试通过。

### Task 2: 本地 HTTP 鉴权

- [x] 将网关路由临时指向本机服务，验证公开登录、业务 Bearer、支付回调、匿名与伪造身份头的行为。
- [x] 售后列表原先落入 Basic 安全链；补管理员访问用例，将路径纳入 Bearer 安全链，并在订单服务校验管理员身份。

结算服务的佣金查询、提现审核和配置写入尚未建立服务端 Bearer 权限边界；网关路由修正不等于结算接口完成验收，留待下一批专门处理。

### Task 3: 回归与交付

- [x] 运行网关与订单服务普通测试、API 审计、路由契约与差异检查，记录本地实际结果。
- [x] 核对 `origin` 推送地址，仅提交本批文件并推送开发分支。

本地验证：API 审计 57 项通过；普通 Maven 测试与 `backend-api-contract.mjs` 通过（后端与 OpenAPI 均为 111 个操作）；真实网关 HTTP 请求中，售后列表匿名 401、供应商 403、管理员 200。测试时临时覆盖网关下游 URI 为 `127.0.0.1`，没有验证 Nacos、Compose 或 Staging。
