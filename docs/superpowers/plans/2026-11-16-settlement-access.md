# 结算服务 Bearer 权限与佣金范围 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让结算接口接受当前有效的 Bearer，并在服务端限制佣金、提现和配置操作的身份、数据范围与管理员权限。

**Architecture:** 结算服务直接调用 Auth `/api/v1/auth/me` 获取当前会话身份，不信任网关转发的身份头和请求体中的操作员。Auth `/me` 对用户返回现有 `auth_identity` 的等级与 `leaderId`；结算服务据此核对团长佣金归属，管理员按既有权限码授权。保留统一响应格式，服务自身可被直接访问时也执行相同校验。

**Tech Stack:** Spring Boot 4、Spring Security、RestClient、H2、JUnit 5、Maven。

**Spec:** `backend/services/settlement-service/src/main/java/com/agritainmen/settlement/web/SettlementController.java`、`SettlementConfigController.java` 与 `apps/admin/src/stores/admin.ts` 中现有权限码。

## Global Constraints

- 仅改 Auth `/me` 所需的用户归属信息、结算服务权限及用户端“我的佣金”调用条件，不调整前端界面或其他业务数据。
- `GET /commissions`、`POST /commissions` 和规则配置需要 `commission.manage`；分享配置接受 `commission.manage` 或 `leader.manage`；提现审核接受 `withdrawal.review` 或 `leader.withdrawal.review`。
- `GET /commissions/me`、`POST /withdrawals` 只允许与当前有效团长 `leaderId` 一致的用户，或具备 `commission.manage` 的管理员。
- 平台身份仅处理 `tenant_id='PLATFORM'` 的佣金、提现与配置数据。
- 审核人以已验证的管理员 `actorId` 为准，不使用请求体的 `operator` 值。
- 本地 H2、假 Auth 与 HTTP 联调不代表 Nacos、Compose、Staging 或真实资金结算验收。

---

### Task 1: Auth 当前身份

- [x] 写 `/auth/me` 返回当前团长等级、归属 ID、当前管理员角色权限和注销后用户令牌失效的失败用例。
- [x] 最小修改 Auth `/me`、角色关联查询与用户会话校验，使用例通过。

### Task 2: 结算接口权限

- [x] 写匿名、非管理员、权限不足、跨团长读取与提现、审核人伪造的失败用例。
- [x] 增加结算服务 Bearer 安全链和 Auth 当前会话验证，逐接口加入身份及权限校验；对读写 SQL 加平台租户范围。
- [x] 调整既有结算功能用例以保留业务状态流转的验证。

### Task 3: 本地验收与交付

- [x] 用户端只为当前团长身份调用“我的佣金”，不以普通用户保存的推荐团长 ID 查询。
- [x] 运行 Auth、结算、网关定向与常规测试、OpenAPI 契约检查及差异检查。
- [x] 用本地 HTTP 验证关键 401/403/200 路径，记录真实边界。
- [x] 核对 `origin` 推送地址，仅提交本批文件并推送 `dev/dev-20261116`。

本地验证：三模块 API 审计 64 项通过，普通 Maven 测试通过，用户端相关 130 项测试与类型检查通过，后端与 OpenAPI 均为 111 个操作；临时把网关 Auth、结算路由指向 `127.0.0.1` 后实测匿名 401、伪造身份头的供应商 403、管理员 200、跨团长 403、同团长 200、审核人取服务端管理员 ID、注销后用户令牌 401。独立启动时还修复了结算服务缺少 `AUTH_SERVICE_BASE_URL` 映射的问题。没有验证 Nacos、Compose 或 Staging。

后续事项：提现申请当前没有真正的幂等键处理，重复提交会新建申请；旧 OpenAPI 中声称的幂等语义已移除，需单独设计并实现。其他后台服务对旧 JWT 权限声明的复核不在本批范围内。
