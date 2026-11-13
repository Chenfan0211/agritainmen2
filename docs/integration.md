# 四端交付形态与数据边界

## 端形态与构建

```bash
pnpm install
pnpm build          # admin(H5) + store/user/supplier(mp-weixin)
```

| 端 | 开发态产物 | 构建态产物 | 交付形态 |
|---|---|---|---|
| `apps/admin` | - | `apps/admin/dist/build/h5` | H5（PC 工作台），静态托管即可 |
| `apps/store` | `apps/store/dist/dev/mp-weixin` | `apps/store/dist/build/mp-weixin` | 微信小程序，微信开发者工具导入 |
| `apps/user` | `apps/user/dist/dev/mp-weixin` | `apps/user/dist/build/mp-weixin` | 微信小程序，微信开发者工具导入 |
| `apps/supplier` | `apps/supplier/dist/dev/mp-weixin` | `apps/supplier/dist/build/mp-weixin` | 微信小程序，微信开发者工具导入 |

开发态：`pnpm dev:admin` 直接起 H5 开发服务；`pnpm dev:store`、`pnpm dev:user`、`pnpm dev:supplier` 产出 `dist/dev/mp-weixin`。等待终端出现 `[store|supplier|user] 构建完成` 后，用微信开发者工具导入该目录，或执行 `pnpm mp:open <store|supplier|user>`。

禁止把 `apps/store`、`apps/supplier`、`apps/user` 源码根目录直接导入微信开发者工具；这些目录没有 `app.json`，会报“在项目根目录未找到 app.json”。构建态验收使用 `pnpm mp:open <端> --mode build`。

同源 H5 联调（`build/serve/check:single-origin`、`scripts/serve-dist.mjs`、Playwright e2e）已随端形态收敛一并移除：三端不再产出 H5，也不再存在共享 localStorage 的联调入口。

## 业务链路

1. 管理端在“商品库管理 / 用户端”维护商品、SKU、基础价、两级分佣、库存和上下架状态。
2. 用户端启动后自动通过 OpenID 身份适配层识别普通用户、一级团长或二级团长，再读取独立 C 端目录展示对应价格；所有商品固定快递配送，无参数或无效推广参数也可直接进入。
3. 用户支付后按供应商生成稳定的 `C-MALL-{subOrderId}` 履约订单。
4. `13787366688 / 13787366688` 处理 S002，`13574902233 / 13574902233` 处理 S004；两个手机号账号只能操作自己的订单。
5. 供应商接单、快递发货和物流写回 C 子订单；用户端查看物流、确认收货和发起售后。
6. 售后、库存释放和佣金冲正由用户端 C 端模型处理，供应商端只同步履约和售后状态。

## 共享数据键

- `agritainment-platform-c-inventory`：带 revision 的 C 端商品和库存
- `agritainment-platform-c-orders`：C 端主订单及供应商子订单
- `agritainment-platform-orders`：门店订单和 C 端供应商履约订单
- `agritainment-platform-supplier-accounts`：后台生成的供应商手机号账号与演示密码
- `agritainment-platform-c-addresses`：C 端地址集合
- `agritainment-platform-c-commissions`：C 端佣金流水
- `agritainment-platform-c-user-sessions`：按 userId 隔离的购物车和演示身份
- `agritainment-platform-c-distributors`：团长（一级/二级）资料、等级与启停状态
- `agritainment-platform-bindings`：推广归因和正式绑定
- `agritainment-platform-entities`：门店、供应商等共享主数据，门店坐标由运营后台写入
- `agritainment-platform-store-accounts`：门店账号，含门店/业务员角色与价格档位
- `agritainment-platform-commission-ledger`、`agritainment-platform-supplier-settlements`：佣金与供应商结算
- `agritainment-platform-commission-rules`、`agritainment-platform-commission-settlement-records`：业务员/团长分成规则与结算记录
- `agritainment-platform-withdrawals`：业务员与团长提现审核

端内通过平台变更总线和页面重新可见事件读取共享快照；localStorage revision 只提供演示级乐观冲突检测，不能替代生产后端的鉴权、事务和原子库存扣减。

地图坐标来自门店主数据中的 GCJ-02 定位结果；非法坐标、定位失败和行政区不匹配门店只进入异常提示，不生成地图点位。供应商端底图使用微信小程序原生 `map` 组件或腾讯 JS API GL（H5 预览分支），业务点位不会修改或重算历史 GCJ-02 坐标。

腾讯地图环境变量：

```bash
# 前端构建变量
VITE_TENCENT_MAP_JS_KEY=
VITE_TENCENT_MAP_STYLE_ID=
VITE_TENCENT_MAP_GATEWAY=/api/tencent-map/geocode

# Node 网关变量
TENCENT_MAP_KEY=
TENCENT_MAP_SECRET_KEY=
TENCENT_MAP_ALLOWED_ORIGINS=
TENCENT_MAP_TIMEOUT_MS=5000
```

Key 和 Secret 不提交到仓库。`VITE_*` 变量会进入构建产物，禁止把 WebService Secret 写入任何 `VITE_*` 变量。运营后台开发态由 Vite 插件挂载网关；三端小程序需配置 `VITE_TENCENT_MAP_GATEWAY` 指向部署好的网关绝对地址。完整网关与 Nginx 配置见 [`docs/tencent-map.md`](tencent-map.md)。当前公开账号、本地存储聚合和前端权限均只适用于演示环境。

## 跨平台限制

微信小程序之间不共享本地存储，运营后台创建的账号不会在小程序端生效。小程序跳转可传递 `promoter`、`promoterName`、`staff`、`farm` 和 `store` 等归因参数，但用户端进入权限和角色只由 OpenID 身份适配层决定，URL 参数不能覆盖角色。演示环境默认安装演示 Provider，可用 `agritainment-mock-openid` 切换固定测试身份；真实环境在用户端 `app.ts` 调用 `configureWechatLoginProvider()` 和 `configureUserIdentityResolver()` 注入登录与 HTTP 身份 Provider；回前台超过 5 分钟会节流刷新身份。生产环境必须由后端使用 `wx.login` code 换取 OpenID，再由服务端返回用户角色。演示密码明文保存在端内本地存储中，仅用于演示；商品、订单、库存、物流和佣金同步也必须接入后端或云开发数据库。

当前支付、库存、物流、售后和佣金均为前端 mock，不包含真实支付、物流回调和生产鉴权。

## 验收

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:supplier-assets   # 需先构建供应商端小程序产物
```

Playwright 端到端用例已删除，验收改为构建 + 单测/契约测试 + 逐端人工冒烟清单：

- 运营后台：菜单分区与 17 个模块跳转、用户信息/团长管理增删改查、团长分成配置、批量发货、商品展示端维护。
- 门店订货端：门店/业务员双角色登录、业务员差异价、进货车、采购订单与采购概览。
- 用户端：无参数直接进入、OpenID 自动识别普通用户/一级团长/二级团长、停用团长降级普通用户、身份只读、价格差异、下单、佣金明细与提现。
- 供应商端：接单、快递发货、司机配送、缺货处理、交接管理、配送线路与结算账单。
