# 四端页面后端化实施记录

> 日期：2026-10-27
> 依据：`docs/superpowers/plans/2026-10-27-page-backend-integration.md`（规划）
> 结论：**交易闭环第一批已完成接入；23 个页面域全量后端化尚未完成。**

## 一、本轮已完成

| 范围 | 实现 | 验证 |
|---|---|---|
| 统一客户端 | `packages/shared/src/catalog-api.ts`、`fulfillment-api.ts` | 单测通过 |
| 后端接口 | `GET /catalog/products`、`GET /inventory/available`、`GET /orders`、`GET /fulfillment/orders` | Spring 审计测试通过 |
| 契约 | OpenAPI 与实际路由 39/39 一致 | `backend-api-contract` 通过 |
| Store 端 | api 模式从服务端加载目录、补库存、下单 | 4 项 API 测试通过 |
| Supplier 端 | api 模式加载履约单、接单、发货 | 2 项 API 测试通过 |
| User 端 | api 模式加载商城目录、下单失败保留购物车 | 3 项 API 测试通过 |
| Admin 端 | api 模式加载供应商、商品、订单、门店 | 1 项 API 测试通过 |
| 页面 API 门禁 | 新增 `scripts/audit-page-api-coverage.mjs` 与矩阵 | 单测通过 |

## 二、本轮未完成（必须继续）

1. **Admin 17 个菜单的写操作**：商品保存/上下架/审核、品类、价格、门店、业务员、佣金、提现、字典、角色、账号、售后处理等仍走本地仓储。
2. **Store 订单支付/取消/售后**：目前只完成目录与创建订单，支付、取消、售后仍为本地状态机。
3. **Supplier 路由与司机作业**：路线优化、发布、打卡、出库交接、缺货、司机管理等仍为本地仓储。
4. **User 售后、佣金、团长运营**：地址、售后、佣金、提现仍为本地模型。
5. **Admin 报表/待办/日志**：缺少聚合与分页接口。
6. **演示数据迁移**：尚未实现固定 ID 幂等 upsert 导入命令与报告。
7. **Staging 全链路**：尚未启动 Docker Compose 做 admin → store → supplier → user 的真实跨服务验证。

## 三、验证命令

```bash
pnpm backend:test
pnpm backend:api-audit
pnpm test
pnpm typecheck
pnpm audit:interfaces
node scripts/audit-page-api-coverage.mjs   # 当前应失败并列出待接入动作
```

## 四、约束

- api 模式接口失败必须显示错误，禁止回落本地成功写入；本轮接线已遵守。
- mock 模式保留，用于自动化测试与演示。
- 新接口金额统一为整数分；页面展示时转元。
- 新增接口必须同步 OpenAPI 与 `scripts/backend-api-contract.mjs`。

## 五、2026-11-13 供应商履约补充

供应商端 API 模式支持已接单订单指派和更换本供应商启用司机，司机配送发货须匹配当前指派；司机登录后可查看服务端分配给自己的履约单。后端用原司机编号做条件更新，状态或指派变化返回 409。线路优化、发布、打卡、出库交接和缺货处理仍属上文第三项待办。本地 H2 HTTP、前端定向用例与 API 模式构建验证记录见 `staging-runbook.md`；Staging 未实测。

后续批次补齐供应商仓点资料的 API 模式读写：Org 自助接口只允许供应商本人写入，按 `version` 条件更新 `profile.warehouse`；管理员资料更新保留该字段。线路与打卡的服务端状态机仍待接入。
