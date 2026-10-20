# 数字供应链平台前端

基于 Uni-app、Vue 3、TypeScript 和 Pinia 的多端前端演示工程。项目不包含后端服务，业务数据和状态流转均在本地完成。

本仓库是平台工程的四端裁剪副本，只保留运营后台、供应商端、门店订货端和用户端；裁剪范围、来源提交与"恢复/新增一端"的操作规程见 [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md)。

端形态：运营后台只构建 H5（PC 工作台），其余三端只构建微信小程序。端形态、清理范围与命名口径以 [`功能清单-按端归组.docx`](功能清单-按端归组.docx) 为准。

## 仓库与推送目标

本仓库远端固定为 `https://github.com/Chenfan0211/agritainmen2.git`。请勿推送到同名的 `https://github.com/Chenfan0211/agritainmen.git`（另一个仓库，本工程已不再关联）。

## 应用

- `apps/admin`：供应链管理后台（运营后台），仅构建 H5。
- `apps/store`：门店订货商城（门店订货端），只构建微信小程序；门店与业务员两类角色登录，以分销价向供应链中台直采下单并查看订单。
- `apps/user`：用户端 C 端分销商城，只构建微信小程序；浏览快递直发商品，按普通用户/一级团长/二级团长身份显示价格，购物车结算、查看多供应商子订单和佣金。
- `apps/supplier`：供应商配送工作台，只构建微信小程序；供应商按 `supplierId` 隔离订单，处理 C 端商城快递订单和门店进货单，司机仅处理门店配送任务，缺货自动统计。
- `packages/shared`：公共业务类型、演示数据和纯函数。
- `packages/ui`：共享设计令牌、移动端主题、业务图片组件与媒体运行时。
- `packages/tencent-map-gateway`：腾讯地图 WebService 同源网关，供运营后台地址解析和供应商端线路规划使用。

## 开发

```bash
pnpm install
pnpm dev:admin        # 运营后台 H5，浏览器直接访问
pnpm dev:store        # 门店订货端，产出 dist/dev/mp-weixin，用微信开发者工具导入
pnpm dev:user         # 用户端，产出 dist/dev/mp-weixin，用微信开发者工具导入
pnpm dev:supplier     # 供应商端，产出 dist/dev/mp-weixin，用微信开发者工具导入
pnpm dev:gateway      # 独立腾讯地图网关（默认 http://127.0.0.1:8790）
```

运营后台的腾讯地图网关由 Vite 开发服务器直接挂载，无需单独启动；微信小程序不能走 Vite devServer，需启动 `pnpm dev:gateway` 并把 `VITE_TENCENT_MAP_GATEWAY` 配成网关绝对地址（例如 `http://127.0.0.1:8790/api/tencent-map/geocode`）。

## 验证

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm audit:interfaces   # 四端写接口与 packages/shared 导出的测试覆盖门禁
pnpm audit:typography   # 业务文字与图表文字 >= 12px
pnpm audit:buttons      # 四端首页按钮必须绑定可归类的点击行为
pnpm audit:tokens       # 业务样式禁止硬编码 hex / rgb() 色值
pnpm audit:mp-styles    # 小程序标签选择器 / 主题作用域 / 兼容语法
pnpm check:supplier-assets
pnpm check:mp-size      # 三端主包 <=1600KB、静态资源 <=700KB（需先 build）
pnpm e2e:mp --app store --chain L1   # 模拟器链路自动化（需本机微信开发者工具，不进 CI）
```

静态图（品类图母版 + 共享商品图）按真实渲染尺寸重编码，改动图片后按顺序执行：

```bash
pnpm compress:images        # 压缩母版与各端商品图（复用本机 Chrome/Edge，无需新增依赖）
pnpm sync:category-images   # 把压缩后的品类图母版同步到四端
pnpm build && pnpm check:mp-size
```

`pnpm audit:interfaces` 静态核对四类接口并一次性检查四个维度：
1. **写接口**：四端 store 的事务 / 持久化动作，必须被测试直接引用或被已测调用者间接覆盖；
2. **读接口**：四端 store 的 getters（页面直接消费的派生数据），同样要求被测试引用；
3. **负路径**：每个写接口至少有一条拒绝 / 校验失败 / 回滚断言（`toBe(false)`、`toBeFalsy()`、`ok: false`、`permission_denied`、`rolls back` 等），确无失败分支的需在 `storeNoNegativePath` 登记理由；
4. **模块导出**：`packages/shared`（全部模块，不止 barrel）、`packages/ui`、`packages/tencent-map-gateway` 与 `scripts/*.mjs` 的导出函数与常量；常量按「存储键 / schema 版本 / 演示数据 / 门禁配置」等规则自动豁免，其余需在 `scripts/interface-coverage-allowlist.json` 显式登记理由。

任一维度出现未覆盖项时 `scripts/audit-interfaces.mjs` 会打印清单并以非零码退出；同一门禁也作为用例运行在 `pnpm test` 中（`scripts/audit-interfaces.test.mjs`）。

`pnpm build` 依次构建运营后台 H5 与门店订货端、用户端、供应商端的 `mp-weixin`，微信小程序产物分别位于 `apps/*/dist/build/mp-weixin`，可直接用微信开发者工具导入。运营后端到端用例已随 H5 交付形态一并移除，验收改为「构建 + 单测/契约测试 + 逐端人工冒烟」。

运营后台地址解析和供应商端线路规划统一调用 `/api/tencent-map/*`。腾讯 WebService Key 与 Secret 仅配置在 Node 网关环境变量中，不会进入前端构建产物。详细配置和 Nginx 反代示例见 [`docs/tencent-map.md`](docs/tencent-map.md)。

## 发布前检查清单

1. **每端独立真实 AppID**：`pnpm mp:appid <app> <appid>` 写入 `apps/<app>/src/manifest.json`（命令支持 `--dry-run`），改完重新 `pnpm build:<app>`。当前三端**统一使用测试号 `wx4942e19ae41bc1b4`**，仅用于本地 / 体验版测试：共用同一 AppID 会让三端微信侧本地存储互通，逐端验收前请在开发者工具执行 `wx.clearStorageSync()` 或清缓存。正式发布必须逐端替换为各自真实 AppID，**三端禁止共用**。
2. **微信后台配置合法域名**：`VITE_TENCENT_MAP_GATEWAY` 指向的网关域名需加 request 合法域名；网关部署与 Nginx 反代见 [`docs/tencent-map.md`](docs/tencent-map.md)。
3. **重新生成腾讯地图 Key**：本地 `apps/supplier/.env.local` 存过真实 Key/Secret（已 gitignore），正式环境请改用服务端环境变量并轮换密钥。
4. **包体与样式门禁**：`pnpm compress:images` → `pnpm sync:category-images` → `pnpm build` → `pnpm check:mp-size` 全绿后再上传。
5. **真机逐页回归**：按 [`docs/qa/2026-10-20-四端演示链路验收清单.md`](docs/qa/2026-10-20-四端演示链路验收清单.md) 逐端走三条主链路（当前仅完成开发者工具模拟器验收）。
6. **已知但本轮不修的告警**：构建期的 Dart Sass `legacy-js-api` 弃用提示（升级 uni-app / sass 依赖后消失，属依赖升级范畴）。

## 演示账号

- admin 供应链管理后台：账号 `admin` / 密码 `123456`
- store 门店订货商城（小程序）：手机号 `13800000000` / 密码 `123456`，验证码 `123456`（页面自动填充，可直接一键登录）；登录页可选「门店 / 业务员」身份
- user 商城（小程序）：微信授权后可选「普通用户 / 一级团长 / 二级团长」身份，也可在「我的」页切换
- supplier 供应商端（小程序）：登录时选择角色；供应商账号由中控台按联系人手机号自动生成，初始密码同手机号。演示账号 `13787366688` / `13787366688`（湘西腊味合作社）、`13574902233` / `13574902233`（炎陵果业有限公司）；预置司机 `driver01`~`driver03` / `123456`（张伟 / 李强 / 王芳）
  - 供应商端工作台底部可一键「重置演示数据」（清空本地订单/司机/交接数据并重播种子）

四端数据各自独立：微信小程序没有跨域共享存储，运营后台创建的账号不会出现在小程序端，各端演示数据由端内种子生成。H5 时代"同源共享 localStorage"的联调能力已随端形态收敛一并移除，跨端协作改为在运营后台内维护门店、业务员、团长等主数据并在各端按种子演示。

## 用户端商城与团长分佣

- 用户端（apps/user）：商城是主入口，商品目录独立于门店订货商品，所有商品统一快递配送。普通用户、一级团长、二级团长分别按基础价、基础价加一级分佣、基础价加一级和二级分佣显示价格。
- 管理端商品库可切换“门店订货商品 / C 端商城商品”，C 端商品独立维护基础价、一级分佣、二级分佣、库存和上下架状态，固定快递配送。
- 用户端订单使用前端 mock/localStorage 完成购物车、地址、多供应商拆单和模拟支付；支付后按供应商生成稳定履约订单，由供应商端接单、快递发货并写回物流，用户端只查看物流、确认收货和发起售后，不接真实支付和后端接口。
- 演示密码以明文保存在小程序本地存储中。生产环境的账号必须改为服务端哈希密码与鉴权，并通过后端或云开发数据库实现跨应用同步。
- 用户绑定与消费分成：团长绑定关系与佣金记录由用户端和运营后台读写；中控台（admin）可设置一级/二级团长分成比例、按商品覆盖，并在「用户运营 / 团长管理」查看下级用户与分佣记录、审核提现。

## 商品标签与定价模型

- 管理后台商品库按“全部商品 / 门店订货端 / 用户端”统一筛选管理：门店商品面向门店订货小程序，用户端商品展示在用户商城。
- 商品支持“快递直发”标签：用户商城商品固定快递配送，门店套餐券在用户端按「到店自提」分组结算；门店订货端下单统一由中台直配到店、结算不提供配送方式切换，履约单进入供应商链路并回写物流。
- 用户商城商品按 SKU 固定加价：基础价 + 一级加价 + 二级加价，按团长等级展示价格（内部结算字段保留分佣语义）。
- 门店商品按零售价比例分佣：业务员/店员比例可在后台配置，支持商品级覆盖，剩余为门店与平台毛利。
- 价格体系只保留两类策略：阶梯价格（按采购数量分档）与分销价格（按门店/业务员层级配置的分销供货价）。
- 套餐券与服务类商品固定到店核销，不支持快递直发。
