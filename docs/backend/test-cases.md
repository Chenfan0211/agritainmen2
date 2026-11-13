# 后端联调与测试用例

## 自动化

| ID | 命令/场景 | 预期 |
|---|---|---|
| AUTO-01 | `pnpm backend:test` | 后端模块全部测试通过 |
| AUTO-02 | `pnpm typecheck && pnpm test` | 前端类型与契约测试无回归 |
| AUTO-03 | `python -c "import yaml; yaml.safe_load(...)"` | Compose YAML 可解析 |
| AUTO-04 | `pnpm backend:api-audit` | 35 个后端操作逐接口审计；契约或接口问题存在时退出 1，默认 `backend:test` 不运行该标签 |

## 安全与并发

| ID | 场景 | 预期 |
|---|---|---|
| SEC-01 | 篡改 Access Token | 网关返回 401，不转发请求 |
| SEC-02 | Refresh Token 重放 | 第一次刷新成功并轮换，第二次被撤销拒绝 |
| SEC-03 | 门店/供应商横向越权 | 服务端按组织边界拒绝，不能只依赖前端隐藏 |
| CON-01 | 库存 1，100 个并发订单预占 | 恰好 1 个成功，99 个库存不足，库存不为负 |
| CON-02 | 相同订单 Idempotency-Key 重复请求 | 只创建一笔订单并返回同一订单 |
| CON-03 | 微信支付回调重复投递 | 只改变一次支付状态，回调事件只有一条 |
| CON-04 | 提现重复审批 | 第二次返回冲突，不重复出款 |

## 环境验收

| ID | 环境 | 预期 |
|---|---|---|
| ENV-01 | Docker Compose | MySQL/Nacos/Redis/RabbitMQ 健康，服务全部启动 |
| ENV-02 | Gateway | 认证接口放行，订单/库存接口无 Token 返回 401 |
| ENV-03 | Admin 1440 | 看板显示数据全期，GMV 非 0，无横向溢出 |
| ENV-04 | 三端真机 | Store/User/Supplier 全链路通过，支付沙箱、履约、收货、售后、佣金一致 |
