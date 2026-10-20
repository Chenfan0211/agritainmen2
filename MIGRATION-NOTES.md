# 四端裁剪副本说明

本仓库由平台工程复制裁剪而来，只保留四个业务端：**运营后台（admin）、供应商端（supplier）、门店订货端（store）、用户端（user）**。

## 来源

- 来源仓库：`E:\项目\agritainmen`（origin: `https://github.com/Chenfan0211/agritainmen.git`）
- 来源提交：`c6d8611`（docs: 功能清单按端归组更新用户端分销商城与门店订货口径）
- 副本分支：`codex/four-ends`（保留完整 git 历史；裁剪结果以 1 个提交呈现）
- 实施计划：[`docs/superpowers/plans/2026-10-14-four-ends-extraction.md`](docs/superpowers/plans/2026-10-14-four-ends-extraction.md)

## 保留内容

| 类别 | 内容 |
|---|---|
| 应用 | `apps/admin`、`apps/store`、`apps/supplier`、`apps/user` |
| 包 | `packages/shared`、`packages/ui`、`packages/tencent-map-gateway` |
| 文档 | `docs/`（含 design tokens、integration、tencent-map、功能清单、superpowers 计划与规格）、`docs/archive/原型图/`（原 `原型图/`，2026-10-15 归档）、根级 `*.md`、`*.docx` |
| 资源 | `assets/`、`artifacts/`、`types/`、`.idea/` |
| 工具链 | `scripts/`（已裁剪端清单）、`tests/`（已裁剪端清单）、`pnpm-workspace.yaml` |

## 移除内容

- 应用：`apps/dashboard`（产业驾驶舱）、`apps/farmhouse`（农家乐门店端）、`apps/promoter`（推客端）
- 三端专属脚本：`scripts/build-farmhouse-tenants.mjs`、`scripts/copy-tenant.mjs`、`scripts/check-dashboard-build.mjs`
- 驾驶舱专属配置与用例：`playwright.dashboard.config.ts`、`tests/e2e/dashboard.spec.ts`
- 单源部署链路与全部端到端用例：`scripts/{build-single-origin,serve-single-origin,check-single-origin-assets,serve-dist}.mjs`、5 个 `playwright*.config.ts`、`tests/e2e/`（详见「本轮调整」）
- 未复制的生成物与本地工具态：`node_modules`、`dist`、`apps/*/dist`、`.codex-logs`、`.gstack`、`.workbuddy`、`.superpowers`、`.runtime`、`test-results`、根级 QA 截图、`agritainment-deploy-*.zip`

## 为保持工程自洽而修改的文件

端清单类（把 7 端收敛为 4 端）：

- `package.json`：删除三端 dev/build 脚本，`build` 聚合为四端
- `scripts/build-single-origin.mjs`、`scripts/serve-single-origin.mjs`、`scripts/serve-dist.mjs`、`scripts/check-single-origin-assets.mjs`、`scripts/sync-product-category-images.mjs`、`scripts/svg-icons-to-png.mjs`、`scripts/audit-buttons.mjs`
- `playwright.config.ts`（忽略规则）、`tests/category-photo-assets.test.ts`、`tests/category-icons.test.ts`、`tests/tile-label-contract.test.ts`、`tests/mobile-build-contract.test.ts`、`tests/mobile-icon-contract.test.ts`、`tests/mobile-visual-contract.test.ts`、`packages/ui/src/mobile-theme.test.ts`、`packages/ui/src/app-media-integration.test.ts`、`apps/supplier/src/pages/index/portal-refresh.test.ts`
- `tests/e2e/integration.spec.ts`：端清单收敛为四端，删除农家乐门店端地址簿用例、驾驶舱联动用例和推客直播入口辅助函数；跨端库存用例保留「门店订货端 + 用户端」两段（价格与库存断点同步下调）
- `tests/e2e/operational-report.spec.ts`：删除农家乐门店端核销用例与随之无用的登录辅助函数
- `apps/store/src/stores/store.test.ts`：删除依赖 `apps/promoter` 源码的「promoter live package candidates」用例及其 import
- `README.md`：应用清单、开发/构建命令、预览端口、演示账号、单源部署说明同步为四端事实

## 验证结果（2026-10-14）

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | ✅ 4/4 端通过（admin H5 + store / supplier / user 小程序） |
| 单元与契约测试 | `pnpm test` | ✅ 78 个文件、1135 条用例全部通过 |
| 四端构建 | `pnpm build` | ✅ 产出 `admin/dist/build/h5` 与 `store` / `supplier` / `user` 的 `dist/build/mp-weixin` |
| 端到端 | — | 基于 H5 的 Playwright 用例已随交付形态移除，验收改为「构建 + 单测/契约测试 + 逐端人工冒烟」 |

## 本轮调整（2026-10-14 · 按 `功能清单-按端归组.docx` 对齐）

端形态：

- `user` / `store` / `supplier` 只产出微信小程序；三端的 `h5` 脚本、`manifest.h5` 段与残留 H5 产物一并移除，运营后台保留 H5。根 `package.json` 的 `build` 聚合为 `admin(H5) + 三端 mp-weixin`。
- 删除单源部署链路与全部 Playwright 配置及 `tests/e2e/`（其中 `button-matrix` / `mobile-visual` 仍在测已删除的端，属既有红灯）。
- 腾讯地图网关独立为 `scripts/serve-gateway.mjs`（`pnpm dev:gateway`）；运营后台开发态由 `apps/admin/vite.config.ts` 注册的网关插件同源提供 `/api/tencent-map/*`。

业务清理（清单未列即移除）：

- 运营后台「预约管理」「旅游线路」：菜单键、页面、弹层、`routeName/routeCity/routeDesc/routePrice/routeImage` 表单字段、store 状态与动作、`SharedBooking` / `TravelRoute` 类型与种子、存储键与读写函数、预约字典与预约类待办。
- 各端「产地直播」：用户端直播横幅 / 房间 / 商品标签 / 物化逻辑与 `config/live.ts`、`LiveRoom` 与 `liveRooms` 种子、直播读写合并与更新时间键、直播状态与直播角色字典、直播类佣金规则种子、孤儿 `play` 图标。
- 价格体系收敛为「阶梯价格 + 分销价格」：`PricePolicy['type']` 只保留 `group | ladder`，删除区域价 / 会员价策略与种子。
- `PERSISTENCE_VERSION` 7 → 8：新增幂等的一次性清理 `clearRetiredPlatformData()` 与状态迁移 8，清掉本地存储里预约 / 线路 / 直播的已退役集合。
- 看板数据域 9 → 7：`farms | accounts | catalog | orders | vouchers | afterSales | settlements`（保留门店套餐券域，移除预约与直播域，避免"数据超过 24 小时未更新"误报）。

命名与角色（只改展示层与文档，存储键与 `farmId` / `promoterId` / `CUserLevel` 枚举不动）：

- 农家乐管理 → 门店管理；推客管理 → 业务员管理；用户端分销商 / 推客 → 一级 / 二级团长；我的粉丝 → 我的下级用户；券订单去掉「直播」表述。

补齐缺口：

- 运营后台新增「用户运营」分区：用户信息与团长管理两个模块（`AdminUsersPanel.vue` / `AdminLeadersPanel.vue` + `data/user-operations.ts`），佣金结算新增「团长分成」页签，订单履约补批量发货入口。
- 门店端：门店 / 业务员两类角色登录，业务员按 A / B / C 档展示差异分销价（`StoreAccount.priceLevel`），订单页「再次采购」与采购概览。
- 用户端：登录页身份选择（普通用户 / 一级团长 / 二级团长），团长中心（我的收入、下级用户、团队订单、团队业绩）。
- 顺带修复 `ShareConfig` 丢失团长分成比例的缺陷：一级 / 二级团长分成比例现已随配置持久化。

## 已知遗留

- 看板内的预约 / 直播聚合逻辑与 `DashboardBooking` / `DashboardLiveRoom` 类型已彻底删除;`DashboardDataDomain` 为 7 项(farms/accounts/catalog/orders/vouchers/afterSales/settlements),预约与直播不再计入交易额、趋势与数据新鲜度。
- 商品渠道位 `live`(代码语义为「用户端」渠道,显示文案已改为「用户端商品」)与 `VoucherOrder.liveId` 作为内部标识保留,避免牵动商品渠道枚举与历史数据;门店「人气值」`FarmStore.livePopularity` 与 `farmPopularity` 素材位已随产地直播一并删除。
- `docs/`、`docs/archive/原型图/`、`docs/archive/验收报告-1比1还原.md`、`docs/superpowers/` 保留三端历史资料（2026-10-15 归档至 `docs/archive/`）；`artifacts/` 保留三端 QA 截图，已删端截图归入 `artifacts/archive/`。
- 小程序 `appid`：`store` 为测试号 `wx4942e19ae41bc1b4`（仅本地模拟器用），`supplier` / `user` 仍为占位 `touristappid`；正式发布必须逐端替换为各自真实 AppID 并配置合法域名，**三端不得共用一个 AppID**（会串端本地存储）。发布流程见 README「发布前检查清单」。
- 构建期 Dart Sass `legacy-js-api` 弃用告警为已知项：处理它需要一起升级 uni-app / sass 依赖链，属独立依赖升级任务，本轮不动。
- 三端小程序主包体积门禁（`pnpm check:mp-size`，1600KB / 静态 700KB）与静态图压缩脚本（`pnpm compress:images`）已落地；品类图母版压到 128 方形，改图后必须重跑 `pnpm sync:category-images`。

## 新增或恢复一端的操作规程

1. 复制来源仓库的 `apps/<name>` 到 `apps/`，并确认它只依赖 `@agritainment/shared`、`@agritainment/ui`。
2. 在 `package.json` 增加 `dev:<name>`、`build:<name>`，并把 `<name>` 加回 `build` 聚合脚本。
3. 在端清单处登记：`scripts/sync-product-category-images.mjs`、`scripts/svg-icons-to-png.mjs`（若为移动端）、`scripts/check-supplier-assets.mjs`（仅供应商端）。
4. 在测试与配置登记：`tests/mobile-build-contract.test.ts`、`tests/mobile-icon-contract.test.ts`、`tests/mobile-visual-contract.test.ts`、`tests/category-photo-assets.test.ts`、`tests/category-icons.test.ts`、`tests/tile-label-contract.test.ts` 的端清单；随后跑 `pnpm install && pnpm typecheck && pnpm test && pnpm build`。

## 第二轮调整：对齐《功能清单-按端归组》（2026-10-14）

第二轮以根目录 `功能清单-按端归组.docx` 为唯一目标口径，在四端裁剪副本上做端形态收敛、功能清理、命名统一与缺口补齐。

### 端形态收敛（三端只发微信小程序）

- 删除三端的 H5 构建与开发脚本（`dev:h5`、`dev:h5:e2e`、`build:h5`），改为 `dev:mp-weixin`；`manifest.json` 删除 `h5` 段。运营后台保持仅 H5。
- 删除同源部署链路：`scripts/build-single-origin.mjs`、`scripts/serve-single-origin.mjs`、`scripts/check-single-origin-assets.mjs`、`scripts/serve-dist.mjs`，根脚本 `build:single-origin`、`serve:single-origin`、`dev:single-origin`、`check:single-origin` 一并移除。
- 删除 5 个 `playwright*.config.ts` 与 `tests/e2e/` 全部 8 个文件，`test:e2e*` 脚本移除，`test` 不再排除 `tests/e2e`；根 `devDependencies` 移除 `@playwright/test`。
- 新增 `scripts/serve-gateway.mjs`（`pnpm dev:gateway`）：独立腾讯地图 WebService 网关，供微信小程序使用；运营后台开发态的 `/api/tencent-map/*` 仍由 `apps/admin/vite.config.ts` 的 Vite 插件挂载，不需要额外代理配置。

### 功能清理（清单未列即移除）

- 运营后台：删除「预约管理」「线路管理（旅游线路）」两个菜单与其页面、表单、store 状态、动作、恢复处理器与待办规则；导航分区改为「平台总览 / 供应链 / 用户运营 / 系统」。
- 用户端与商品域：删除产地直播（直播房间、直播商品标签、券订单直播文案、`apps/user/src/config/live.ts`）；保留套餐与到店自提核销链路。
- 数据层：`DashboardDataDomain` 从 9 项收敛为 7 项（farms/accounts/catalog/orders/vouchers/afterSales/settlements）；价格策略类型从 `group|ladder|region|member` 收敛为 `group|ladder`；`PERSISTENCE_VERSION` 递增并新增一次性迁移清理遗留记录。

### 命名统一（仅展示层与文档）

| 原命名 | 现命名 |
|---|---|
| 农家乐管理 | 门店管理 |
| 推客管理 | 业务员管理 |
| 分销商 / 推客（用户端身份） | 一级团长 / 二级团长 |
| 我的粉丝 | 我的下级用户 |
| 券订单「直播 / 门店套餐」 | 券订单「门店套餐」 |

内部标识符与持久化键保持不变（`farmId`、`promoterId`、`level1`/`level2`、`agritainment-*` 存储键），避免演示数据迁移风险。

### 缺口补齐

- 运营后台新增「用户运营」分区：用户信息（用户列表/筛选/详情/团长绑定链路/消费记录）与团长管理（团长资料与等级状态、下级用户与下级团长、团长价格、分佣记录、提现审核）。
- 运营后台「佣金结算」新增团长分成页签（一级/二级团长分成比例 + 商品级覆盖）。
- 运营后台「订单履约」新增批量发货入口；「商品库管理」按展示端（门店订货端 / 用户端）维护与筛选。
- 门店端支持门店/业务员两类角色登录与业务员差异分销价，订单页补再次采购与采购概览。
- 用户端登录页新增身份选择（普通用户 / 一级团长 / 二级团长），团长身份下展示团长中心。

### 实施细节与取舍（供后续维护者参考）

- **业务员差异价**：`StoreAccount.priceLevel`（`StorePriceLevel = 'A' | 'B' | 'C'`）由运营后台「门店管理 / 门店账号」维护；门店端按 `A = 95 折、B = 97 折、C = 基准分销价` 在 `tieredUnitPrice` 结果上再折让（`apps/store/src/price-level.ts`），门店账号（`role: 'owner'`）不折让。
- **到店套餐**：用户端原「产地直播」入口改为「门店套餐」入口，仍复用 `buyLivePackage`/`VoucherOrder` 链路完成到店自提与核销；`readLivePackageProjection` 重命名为 `readStorePackageProjection`，`readLiveRoomProjection` 与 `config/live.ts` 删除。券订单文案由「直播 / 门店套餐」改为「门店套餐」。
- **腾讯地图网关**：运营后台开发态仍由 `apps/admin/vite.config.ts` 的 Vite 插件挂载 `/api/tencent-map/*`，因此**未**在 `apps/admin/src/manifest.json` 增加 devServer 代理；新增的 `scripts/serve-gateway.mjs`（`pnpm dev:gateway`，默认 8790）用于微信小程序等无法走 Vite devServer 的场景。
- **供应商端安全区**：`/* #ifndef MP-WEIXIN */` 在小程序构建中不会被剥离（实测 `env(safe-area-inset-top)` 泄漏进 MP 样式），已统一改为 `/* #ifdef H5 */`，使小程序端只使用 `--status-bar-height`；`scripts/check-supplier-assets.mjs` 随之恢复可运行（图标清单改为与 `svg-icons-to-png.mjs` 的动态推导一致，并去掉 H5 产物断言）。
- **图标工具链**：`scripts/svg-icons-to-png.mjs` 依赖 `@playwright/test` 的 Chromium 做 SVG→PNG 栅格化。本轮按计划移除了 Playwright 依赖，因此该脚本在需要重绘图标时需先 `pnpm add -D @playwright/test`；仓库内现有 PNG 仍可直接使用，`pnpm check:supplier-assets` 不依赖它。
- **名称与数据边界**：`农家乐 → 门店`、`推客 → 业务员`、`分销商 → 团长` 只改菜单名、字段名与说明文案。门店/供应商的**专有名称**（如门店名「石板溪农家乐」、供应商名「衡山南岳农家乐」、商品名与应用内数据文案）作为演示数据保留，未做替换。
- **`#ifndef MP-WEIXIN`**：本轮改动后仓库内只剩 `apps/*/src/components/UiIcon.vue` 的模板注释使用该指令（模板条件编译正常生效）。

## 推送安全边界

副本保留了完整 `.git` 历史。**不要**把 `codex/four-ends` 推送到原仓库 `Chenfan0211/agritainmen` 的同名分支——那会在该分支上删除其他三端。请推送到新仓库，或仅在本地使用。
