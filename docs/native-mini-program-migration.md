# 三端原生小程序迁移说明

> 状态：已落地（2026-10-21）。适用端：`apps/store`（门店订货端）、`apps/supplier`（供应商/司机端）、`apps/user`（用户商城端）。
> 管理端 `apps/admin` **仍使用 uni-app H5**，本说明不覆盖。

## 1. 结论与边界

- 三端小程序已从 uni-app 编译产物改为**手写原生微信小程序**：`App()` / `Page()` / `Component()` + WXML/WXSS/WXS/TS，产物不含 uni-app 运行时。
- 业务逻辑（订单、目录、佣金、履约、媒体资产）仍只写在 `packages/shared`，三端不复制业务实现；端内只做平台绑定。
- 设计 token 源码唯一入口仍是 `packages/ui/src/design-tokens.css` 与 `packages/ui/src/design-tokens.ts`，端内只允许引用，禁止复制色值（见 [设计令牌规格](design/zhulv-design-tokens.md)）。

## 2. 源码与产物布局

| 端 | 源码 | 开发产物 | 构建产物 |
|---|---|---|---|
| store | `apps/store/src` | `apps/store/dist/dev/mp-weixin` | `apps/store/dist/build/mp-weixin` |
| supplier | `apps/supplier/src` | `apps/supplier/dist/dev/mp-weixin` | `apps/supplier/dist/build/mp-weixin` |
| user | `apps/user/src` | `apps/user/dist/dev/mp-weixin` | `apps/user/dist/build/mp-weixin` |

- 每个端源码含 `app.ts` / `app.json` / `app.wxss` / `project.config.json` / `sitemap.json` / `pages/**` / `components/**` / `styles/global.scss`。
- 测试统一放 `apps/<app>/tests/**`，`src` 下不允许出现 `*.test.ts`（由 `tests/native-mini-program-contract.test.ts` 把关）。
- 命令（用户可见接口保持不变）：`pnpm dev:<app>`、`pnpm build:<app>`、`pnpm mp:open <app> [--mode build]`。端内 `dev:mp-weixin` / `build:mp-weixin` 与根命令等价。

## 3. 构建规则（`scripts/build-native-mp.mjs`）

1. **原子替换**：先在 `<产物目录>.tmp-<pid>` 完整构建，再把旧产物目录改名备份、新目录整体顶上并删除备份。
2. **占用即失败**：产物目录被微信开发者工具打开占用时，改名会抛 `EBUSY/EPERM`，脚本直接以非零码退出并提示「先关闭微信开发者工具中打开的项目」；**不再退回覆盖写入**，避免旧文件残留造成的假成功。
3. **TS → CommonJS**：`src/**/*.ts` 经 TypeScript 转译 + esbuild 压缩为 `.js`；`*.test.ts`、`*.d.ts` 不打包；`@agritainment/shared` 重写为产物内 `shared/index.js` 相对引用。
4. **SCSS → WXSS**：`styles/global.scss` 编译为 `styles/global.wxss`；`loadPaths` 与 token 路径都相对传入的 `root` 解析，不使用全局常量。
5. **共享 token**：`packages/ui/src/design-tokens.css` 复制为产物根 `design-tokens.wxss`，并把 `@import ".../design-tokens.css"` 重写为相对 WXSS 引用。
6. **样式入口唯一**：`src/app.wxss` 只有 `@import "./styles/global.wxss";`；`global.scss` 负责 `@use` `typography.scss` / `mobile-theme.scss` 与 `@import` `design-tokens.css`。
7. **静态资源**：除 `.ts` / `.scss` / `.js` / `.map` 外原样复制；产物中不允许出现 `.vue` / `.scss` / `.webp` / 测试 JS。

## 4. AppID 写入规则

- AppID 只写在 `apps/<app>/src/project.config.json` 的 `appid` 字段；`pnpm mp:appid <app> <wx...>` 只替换这一个字段，其余内容与格式保持不变（`--dry-run` 只打印不写入）。
- 改完 AppID 后必须重新 `pnpm build:<app>`，产物里的 `project.config.json` 才会同步。
- 当前三端统一使用测试号，仅用于本地/体验版验证；正式发布必须逐端替换为各自真实 AppID，三端禁止共用（共用会互通本地存储）。

## 5. 图片格式与静态资源

- 三端静态图片统一为 **JPEG**（`.jpg`）；禁止 `.webp`（老微信内核兼容性与包体门禁都不接受），源码中也不允许出现 `.webp` 引用。
- 图片链路：`pnpm compress:images` 压缩母版 → `pnpm sync:category-images` 同步到各端 → `pnpm build` → `pnpm check:mp-size`。
- 品类图母版在 `assets/product-categories/master`，共享商品图在 `assets/images`。
- 用户/供应商上传的本地图片走 `wx.env.USER_DATA_PATH`，由共享媒体运行时（`packages/shared` 的媒体存储适配器）落盘与解析，不写自定义存储前缀。

## 6. 原生运行时约束

- 只允许 `wx.*` 与 `globalThis.wx`：源码不得出现 `uni.*`、`localStorage`、H5 `window` / `document` 分支（`tests/native-mini-program-contract.test.ts` 把关）。
- 平台持久化统一走 `packages/shared` 的同步存储适配器（原生端落 `wx.getStorageSync/setStorageSync`，浏览器/测试环境落 `localStorage`），端内不再自行判断运行环境。
- WXS 只支持 ES5 子集：禁止 `for...in`、正则字面量、`$event`、箭头函数、模板字符串、可选链、`??`、`let/const`、展开运算符、`async/await`（`pnpm audit:mp-wxs` 把关）。
- 地图：供应商端只保留原生 `map` 组件（`components/DeliveryRouteMap`）与 `wx.openLocation` 导航，浏览器地图 SDK 已删除。
- 样式：选择器必须 `:root, page`；禁用 HTML 标签选择器、`color-mix()`、`:has()`（`pnpm audit:mp-styles` 把关）。

## 7. 验收

```bash
pnpm install --frozen-lockfile
pnpm test                     # 单测 + 契约测试（含三端原生源码契约、构建计划、WXS 门禁）
pnpm typecheck                # 四端类型检查（admin 仍为 uni-app H5）
pnpm build                    # admin H5 + 三端 mp-weixin
pnpm check:mp-size            # 三端包体门禁
pnpm check:native-assets      # 页面/组件解析、图片存在与 JPEG、产物残留
pnpm audit:tokens             # 业务样式禁止硬编码色值（取消 app.wxss 整文件豁免）
pnpm audit:mp-styles          # 小程序标签选择器 / 主题作用域 / 兼容语法
pnpm audit:mp-wxs             # WXS ES5 子集
pnpm audit:buttons
pnpm audit:interfaces
pnpm e2e:mp --app store --chain L1      # 需本机微信开发者工具，不进 CI
pnpm e2e:mp --app supplier --chain L3
pnpm e2e:mp --app user --chain L2
```

- 模拟器链路：`tests/mp-e2e/chains/{store,supplier,user}.mjs`。开发者工具不可用时脚本以 `BLOCKED`（退出码 2）退出并落证据，**不得**在文档中宣称已通过。
- 产物回归：`apps/<app>/dist/build/mp-weixin` 中不得出现 `.webp` / `.vue` / `.scss` / 测试 JS / 旧 `manifest.json` / `.tmp-` `.backup-` 临时目录。
- 图片回归：构建后检查 `app.json`、页面 `usingComponents`、JPEG 存在性、`wx.getImageInfo` 成功、页面图片组件数量 > 0、无 `binderror`。

### 验收结果（2026-10-21 实测）

| 检查 | 命令 | 结果 |
|---|---|---|
| 依赖 | `pnpm install --frozen-lockfile` | Already up to date，exit 0 |
| 单测/契约 | `pnpm test` | 95 文件 / 1235 例全过，exit 0 |
| 类型 | `pnpm typecheck` | admin / store / supplier / user 全过，exit 0 |
| 构建 | `pnpm build` | admin H5 + store 114 / supplier 106 / user 125 文件，exit 0 |
| 包体 | `pnpm check:mp-size` | store 1114+456KB、supplier 1309+448KB、user 1116+458KB（预算 1600/700），exit 0 |
| 色值 | `pnpm audit:tokens` | 通过（app.wxss 已取消整文件豁免） |
| 样式 | `pnpm audit:mp-styles` | 通过 |
| WXS | `pnpm audit:mp-wxs` | 通过（三端 src + 产物） |
| 字体 | `pnpm audit:typography` | 通过（原生地图 marker 字号由 11px 收到 12px） |
| 按钮 | `pnpm audit:buttons` | 通过（4 页面 / 252 函数） |
| 接口 | `pnpm audit:interfaces` | 通过（shared 376/379，豁免 3） |
| 供应商资产 | `pnpm check:supplier-assets` | 15 PNG + 15 SVG / MP 30 图标 |
| 图片与产物 | `pnpm check:native-assets` | 三端 useComponents 全部解析、静态图无缺失且 JPEG 合法、无 `.webp`、产物无 `.vue/.scss/.test.js/manifest.json/.tmp-/.backup-` |

- 构造锁目录实测：开发者工具打开 `apps/supplier/dist/build/mp-weixin` 时构建返回 exit 1 并提示先关闭项目；执行 `cli close --project <dist>` 后同一命令 exit 0（原子替换生效）。
- 模拟器链路：`store/L1`、`supplier/L3`、`user/L2` 三个 chain 模块均已实现；本轮实跑仍被开发者工具 view 层未挂载阻塞（就绪探针报 `页面 $vm 缺失`/`view 节点 0`），按约定记 `BLOCKED`，**未宣称端到端通过**。
- 图标缺口修复：供应商端与用户端补齐缺失的 `check.svg/check.png`（store 已有同款），并把两端的 UiIcon 默认图指向真实存在的 `package.png`。

## 8. 二轮收口（2026-10-22）与遗留

已收口：

- **三端小程序配置对齐**：`apps/user/src/app.json` 补齐 `style: "v2"` / `sitemapLocation` / `navigationStyle` / `backgroundTextStyle`，新增 `apps/user/src/sitemap.json`；`apps/user/src/project.config.json` 的 `libVersion` 与 `setting` 关键字段（`urlCheck/es6/enhance/postcss/minified/uglifyFileName`）与 store、supplier 对齐，由 `tests/native-mini-program-contract.test.ts` 锁定。
- **死代码清理**：供应商端 scss 的 `/* #ifdef H5 */` 分支删除、`/* #ifdef MP-WEIXIN */` 包裹解开，三端 src 不再出现 `#ifdef` / `#endif`（构建期剥离逻辑保留为兜底）；解开包裹与构建期剥离等价（supplier 产物 WXSS/JS/WXML/JSON 逐字节比对一致）。同时移除仅用于压制 H5 规则的 5 处 `!important`（产物内已无同属性竞争声明，属等价简化）。
- **图片与产物回归固化为门禁**：一次性脚本升级为 `pnpm check:native-assets`（`scripts/check-native-assets.mjs` + 单测），覆盖页面与组件解析、`<image>` 必带 `binderror`、静态图存在且 JPEG 合法、无 `.webp`、产物无源码/测试/manifest/临时残留。
- **历史媒体资产保护**：`importLegacyMediaAsset` 导入的资产登记为已绑定（`legacy-import:<assetId>`），不会被 `cleanupPendingMediaAssets` 误回收。
- **文档债务订正**：`docs/tencent-map.md`、`docs/功能清单对照表-实现映射.md` 换用原生组件路径；`docs/design/2026-10-16-四端样式巡检与修复.md` 标注为 uni-app 历史快照并订正 `mp:appid` 路径；`docs/qa/2026-10-20-四端演示链路验收清单.md` 追加第八节复核记录。

仍遗留（发布阶段）：

- **模拟器链路（含 store/L1）**：三个 chain 模块均已实现。2026-10-22 复跑 store/L1 也判 `BLOCKED`（exit 2）—— 页面已渲染（319 view 节点 / 22KB 截图 / pageCount 1），唯一不达标的是 `$vm 缺失`；supplier/user 则连 view 层都没挂载（0 节点 / 2.5KB 截图）。三者日志同为 `SIMULATOR_LAUNCH_CAUGHT { valueType: "undefined" }` + `simulator launch failed`，且无我方 appservice 异常，判为开发者工具/automator 环境级故障；需换环境复跑或按验收清单人工逐页，**本轮未宣称任何链路端到端通过**。
- **真机与 AppID**：真机逐页回归、逐端替换正式 AppID（三端禁止共用）仍按 README「发布前检查清单」在发布阶段执行。
