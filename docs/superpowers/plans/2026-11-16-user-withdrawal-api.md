# 用户端真实提现接口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户端 API 模式从结算服务读取团长提现余额和申请，按服务端余额提交提现；演示模式继续使用本地数据。

**Architecture:** 结算服务以已验证的 leaderId 限定“我的提现”查询，并在创建申请时按团长与佣金状态索引锁定佣金记录，核对可用金额及待处理申请。同一申请人的已批准或待处理申请占用可用金额；被拒绝申请释放金额。用户端 API 模式只使用服务端数据与 Idempotency-Key，不写本地提现集合；页面进入时刷新服务端余额和申请。

**Tech Stack:** Spring Boot 4、JdbcTemplate、Flyway V3、JUnit 5、原生小程序 Store、Vitest、TypeScript。

**Spec:** `docs/superpowers/plans/2026-11-16-withdrawal-idempotency.md` 和现有用户端 `withdrawCommission` / `refreshCommissionSummary`。

## Global Constraints

- 提现创建必须校验服务端可用佣金，不信任客户端传入的金额；同键重试沿用上批幂等规则。
- API 模式不读取或修改本地提现集合，不执行本地佣金核销；演示模式保留原行为。
- 团长身份使用当前 Auth 已验证的 leaderId；普通用户和跨团长读取不可用。
- 本批不引入真实付款渠道；审核通过表示业务批准并计入已提现统计，不代表资金到账。
- 本地 H2、假 Auth 和前端模拟 transport 验收不等于 MySQL、Staging 或真机验收。

---

### Task 1: 服务端余额与历史

- [x] 先写余额不足、待处理申请、拒绝恢复、并发不同键和“我的申请”数据隔离失败用例。
- [x] 在结算服务完成余额预留、申请列表与余额统计；为锁查询补索引，保留同键重试语义。
- [x] 运行结算普通测试和 API 审计。

### Task 2: 用户端 API 模式

- [x] 先写 API 模式读取、提交、失败、刷新及演示模式隔离用例。
- [x] 让 Store 和页面在 API 模式读取服务端余额与申请，通过 Bearer 和 Idempotency-Key 提交申请。
- [x] 运行用户端定向测试、类型检查和构建。

### Task 3: 交付

- [x] 更新 OpenAPI，执行契约检查、差异检查和本地 HTTP 验收。
- [x] 核对 origin 推送地址，仅提交本批文件并推送交付分支。

本地验收边界：结算服务使用 H2 与假 Auth 运行随机端口 HTTP 审计 15 项、普通测试 4 项；Flyway V4 在 H2 成功执行。用户端用模拟 transport 验证请求与数据映射，相关测试 134 项通过，完成 TypeScript 类型检查和小程序构建；后端与 OpenAPI 均有 112 个操作。没有验证 MySQL、Staging、真机及真实付款渠道。

后续事项：管理员提现审核页面仍读取本地演示记录，尚未接结算服务的申请列表与审核接口；切换到 API 模式时，旧本地提现记录不会自动迁移。
