# Staging 全链路运行手册

## 1. 准备环境

Linux x86_64 云主机需要：

- 公网 IP、SSH 用户、80/443 端口开放权限
- Docker Engine 24+
- Docker Compose v2
- 一个 API 域名和一个 Admin 域名

## 2. 必填配置

复制 `deploy/compose/.env.staging.example` 为 `deploy/compose/.env`，至少替换：

- `API_DOMAIN`、`ADMIN_DOMAIN`、`ACME_EMAIL`
- `MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD`
- `RABBITMQ_PASSWORD`
- `NACOS_AUTH_TOKEN`、`NACOS_AUTH_IDENTITY_VALUE`
- `JWT_SECRET`
- `MINIO_ROOT_PASSWORD`
- `WECHAT_APP_ID_STORE/USER/SUPPLIER`
- `WECHAT_APP_SECRET_STORE/USER/SUPPLIER`

微信 Secret、数据库密码和 JWT Secret 不得提交到 Git。

首版 Provider 默认值：

- `AGRITAINMEN_PAYMENT_PROVIDER=sandbox`
- `AGRITAINMEN_LOGISTICS_PROVIDER=sandbox`
- `AGRITAINMEN_SMS_PROVIDER=sandbox`
- `WECHAT_MODE=real` 时启用真实微信 code 交换

## 2.1 已有组织库升级前核对

如果 `agritainmen_org` 已有数据，先备份数据库，再在 Flyway V4 启动前用只读账号执行
`docs/backend/org-profile-migration-preflight.sql`。重复手机号查询必须返回零行；若有结果，先人工核对主体与登录账号并处理冲突，再启动 org-service。不要自动删除供应商记录。
全新数据库无需这一步。

## 3. 启动

```bash
cd /opt/agritainmen2
cp deploy/compose/.env.staging.example deploy/compose/.env
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up -d --build
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml ps
```

首次启动会执行 Flyway 迁移和 `demo` 种子。重复启动不会重复创建固定 ID 数据。

已有组织库完成 V4 后，执行 `docs/backend/org-profile-migration-postcheck.sql`。返回的旧门店应由运营补全真实地址；不要根据区域字段猜测门牌或坐标。

已有认证库完成 V3、组织库完成 V4 后，使用可读取两个库的只读账号执行 `docs/backend/auth-supplier-account-link-preflight.sql`。
它列出未关联供应商 ID 的既有账号及同手机号候选主体。逐条核实账号归属，再由数据管理员受控关联；不能仅按手机号自动更新。新建的演示供应商账号已显式绑定 `S-DEMO-001`，先前运行过旧种子的库仍需核对。
进入验收前，还需确认 org-service Flyway 至少执行到 V6、auth-service 至少执行到 V6（V5 记录访问令牌会话，V6 增加司机所属供应商字段）。已有司机演示账号只在启用演示种子时受控补充 `driver_supplier_id`；生产司机账号应通过供应商端重新创建，不按手机号自动关联旧账号。

## 4. 前端构建

Admin：

```bash
VITE_API_BASE_URL=https://api-staging.example.com \
VITE_DATA_MODE=api \
pnpm build:admin:staging
```

小程序：

```bash
AGRITAINMEN_API_BASE_URL=https://api-staging.example.com \
WECHAT_APP_ID_STORE=wx-store \
pnpm build:store:staging

AGRITAINMEN_API_BASE_URL=https://api-staging.example.com \
WECHAT_APP_ID_USER=wx-user \
pnpm build:user:staging

AGRITAINMEN_API_BASE_URL=https://api-staging.example.com \
WECHAT_APP_ID_SUPPLIER=wx-supplier \
pnpm build:supplier:staging
```

构建脚本会把 API 地址和 `dataMode` 注入 `runtime-config.js`，不会硬编码到页面。

## 5. 微信后台配置

三端分别配置：

- request 合法域名：`https://api-staging.example.com`
- uploadFile 合法域名：`https://api-staging.example.com`
- downloadFile 合法域名：`https://api-staging.example.com`

测试阶段关闭开发工具的“不校验合法域名”后仍需能完成登录。

## 6. 回滚

```bash
bash deploy/scripts/rollback-compose.sh
```

数据库卷默认保留。恢复数据前先执行 `deploy/scripts/backup-mysql.sh` 生成备份。

## 7. 供应商与门店验收

在 API 模式的 Admin 中用平台管理员账号操作，并在刷新页面后重新打开资料核对：

1. 新建供应商，保存资质图片、品牌和服务区域；修改后确认列表与详情回读一致。重复手机号应被拒绝。
2. 待审或驳回供应商不得开通账号；审核通过后开通，初始密码只显示一次，重复开通返回原账号且不返回密码。暂停合作后确认资料状态仍为已认证，暂停原因刷新后可见，恢复后当前原因清除。
3. 冻结账号、修改密码分别验证权限；冻结原因刷新后可见，解冻后当前原因清除，旧登录会话应失效。供应商资料中的联系人手机号与账号登录名是两个字段，修改资料不能悄悄改登录名。
4. 新建门店并保存封面、地址、联系人和定位状态；刷新后确认图片及字段可回读。未填完整地址应被拒绝，地址解析失败时保留文字地址且不沿用旧坐标。
5. 用无权限管理员和非平台租户令牌分别访问资料与图片，确认服务端拒绝访问。

记录请求响应、Flyway 版本与失败截图。运行本机单元测试或 H5 构建不能代替上述真实 MySQL 和跨服务验收。

## 8. 供应商与司机真实登录、数据范围验收

在真实 Staging 域名、MySQL 和运行中的 `auth-service`、`org-service`、`fulfillment-service`、网关上执行。容器内部服务监听 8080；`org-service`、`fulfillment-service` 的 `AUTH_SERVICE_BASE_URL` 必须为 `http://auth-service:8080`。准备两个已审核供应商 A/B、各自账号，以及 A 名下司机 D1/D2；先确认 Auth Flyway V5/V6 已执行。

1. API 模式供应商端清空本地登录态，确认未登录时没有履约单请求，也不会显示演示司机、商品或路线。A 登录后 `/auth/supplier/login` 的 `profile.supplierId` 与 `/org/me/supplier` 的 `id` 一致；刷新页面、访问令牌刷新后仍一致。B 同理。
2. A 的令牌访问 `/fulfillment/orders?supplierId=B`，只返回 A 的记录；匿名请求返回 401；A 对 B 的履约单接单、发货和物流单查询返回 404，B 的数据不变。A 自有单按 `PENDING→ACCEPTED→SHIPPED` 成功，错误状态返回 409。创建履约单只接受平台身份。
3. A 在供应商端创建 D1、D2，确认司机账号出现在 `/auth/supplier/drivers` 且无密码回传。A 接单后通过 `/fulfillment/orders/{id}/assign-driver` 指派 D1，随后更换为 D2 时传入 `expectedDriverId=D1`；旧司机编号或已发货订单重试返回 409。只有已指派司机可用于司机配送发货。D1、D2 分别用 `/auth/driver/login` 登录，`profile.supplierId=A`，仅能看到当前分配给自己的单，看不到另一司机或 B 的单，不能接单、发货或创建履约单。B 的令牌不能管理 A 的司机账号或指派 A 的单。
4. 停用 D1 后，D1 的既有 access 与 refresh 均返回 401；重启 D1、重新登录后可用。冻结 A 账号后，A 及名下司机的已有 access 与 refresh 均失效；解冻后旧令牌仍失效，必须重新登录。改密、刷新轮换、退出登录后分别核对旧令牌失效。
5. 供应商状态按 `pending→审核通过/cooperating→暂停/paused→恢复/cooperating` 和 `pending→审核驳回/paused→恢复待审/pending` 验证；待审不能直接暂停，驳回不能恢复合作，已认证不能退回待审。冻结账号的原因可以单独修改并刷新回读；只有冻结权限的管理员可操作。
6. 浏览器或真机复核供应商、司机登录表单无演示账号自动填充；网络失败、401、403 时显示错误，不能回退到本地演示登录。记录网关响应码、Trace ID、数据库状态和页面截图。

当前仓库只提供 `api-staging.example.com` 示例域名；执行实测时需换成实际 Staging 地址并使用独立测试账号。若没有可连接的环境，以上项目保持“待实测”，不能以 H2/Vitest 结果标记通过。

### 本地接口调试记录（2026-11-13）

本轮按用户要求只做本地调试。Auth、Org、Gateway、Fulfillment 使用测试配置的 H2 和随机端口跑 HTTP 正反例；Org/Fulfillment 的 Auth 对端由本地 HTTP 测试替身提供。已覆盖供应商与司机登录、司机账号归属、未登录拒绝、跨供应商数据范围、非法状态流转、会话撤销，以及跨供应商/停用司机配送拒绝。后续本地批次增加已接单订单指派、带预期旧司机的更换、司机配送发货一致性和司机仅查看已指派订单的用例。前端跑供应商与后台定向 Vitest、工作区 TypeScript 类型检查，并以 `--data-mode api --api-base http://127.0.0.1:8080` 编译供应商小程序。

本地调试不包含实际 MySQL、完整跨服务部署、微信真机或 Staging 页面验收。司机的订单读取限于后端已指定 `driver_id` 的履约单；供应商端 API 模式已有接单后的司机指派、更换和发货入口，线路优化、打卡与交接仍待后续接入。

后续本地批次接入了 `/org/me/supplier/warehouse`：供应商以服务端身份和资料版本保存 GCJ-02 仓点坐标及联系人，司机只读，冲突与非法坐标拒绝；API 模式回读后展示真实仓点，保存失败不回落本地。该接口为线路和到仓打卡提供数据基础，尚未实现服务端线路状态机。
