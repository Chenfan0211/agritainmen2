# 管理员提现审核服务端接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台 API 模式从结算服务读取提现申请并审核，让用户端提交的申请进入管理员待审列表。

**Architecture:** 结算服务新增平台管理员专用 `GET /withdrawals`，复用现有 `withdrawal.review` / `leader.withdrawal.review` 权限和平台租户过滤。后台 Store 在 API 模式加载并映射申请，审核调用现有服务端审批接口，成功后以服务端响应更新列表；失败时重新读取服务端事实，不回退为本地写入。佣金页的提现审核和团长页的全局申请均使用服务端数据，演示模式维持本地行为。

**Tech Stack:** Spring Boot 4、JdbcTemplate、JUnit 5、Vue 3、Pinia、Vitest、TypeScript。

**Spec:** `docs/superpowers/plans/2026-11-16-user-withdrawal-api.md` 的后续事项及现有 `AdminLeadersPanel.vue`、`reviewWithdrawal`。

## Global Constraints

- API 模式只用服务端提现申请，不写本地提现集合；管理员身份与权限由当前 Bearer 和服务端 Auth `/me` 验证。
- `withdrawal.review` 和 `leader.withdrawal.review` 均可读取与审核；普通用户、无权限管理员、其他租户均不可读取。
- 服务端审批状态条件更新继续负责并发冲突；失败时界面不能显示虚假的成功状态。
- 不引入真实付款渠道；审核通过不等于资金到账。
- 本地 H2、假 Auth 和前端模拟 transport 验收不等于 MySQL、Staging、真机或生产支付验收。

---

### Task 1: 管理员查询契约

- [x] 先写匿名、无权限、跨租户与允许角色的失败用例，验证当前路径缺失。
- [x] 增加管理员申请列表，限定平台租户与审核权限，并更新 OpenAPI 与契约检查。

### Task 2: 后台接线

- [x] 先写 API 模式读取、审批、冲突失败与本地数据隔离用例。
- [x] Store 读取服务端申请，审批写服务端，刷新待审统计与列表；团长页提供不依赖本地团长资料的待审入口。
- [x] 演示模式既有审批用例保持通过。

### Task 3: 验证与交付

- [x] 跑结算服务 HTTP 审计、后台定向测试、类型检查、H5 构建、契约与差异检查。
- [x] 核对 origin 推送地址，仅提交本批文件并推送交付分支。
