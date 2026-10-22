# 鲜肉红 Design Token 规格

全站唯一视觉源。改任何 UI 之前先读本文。原「竹青绿」Figma 源（`竹青绿-DesignTokens-figma.json`）已停用；本规格 + 配套色卡页 `docs/design/preview/2026-10-21-鲜肉红主题色卡.html` 为唯一口径。

供应商端是第一块样板。Admin 运营后台是第二块样板（浅色 PC 工作台）。用户端商城、门店订货端各自消费 `--color-user-*` / `--color-store-*` 别名；未接线端禁止把旧 hex 写回业务样式。

## 产品口径

- 这是什么：生鲜猪肉供应链平台，供应商与司机双角色配送履约
- 视觉方向：鲜肉红品牌 + 暖白底，作业区扁平，登录/身份卡可用品牌渐变；竹青绿不再作品牌主色，只承载「新鲜 / 冷链 / 成功」
- 桌面：供应商 H5 ≥431px 保持 430px 手机框居中；768 / 1440 只验收框与背景，不做宽屏多列
- Admin：1280 / 1440 多列工作台，卡片 padding 用 `--space-card-pc`
- 小程序：内容按 375 排；变量必须同时写在 `:root` 与 `page`

## 硬约束

- 不许动：业务逻辑、接口地址与参数名、路由 path、组件 props 名称、字段名、埋点
- 不许做：引入新 UI 库、升级依赖、用 `!important` 掩盖问题、写死宽高造成溢出、隐藏或删除已有功能入口
- 样式结构改动仅限包裹层级，不改语义标签
- 业务样式禁止硬编码色值；色值只允许出现在 token 文件和 `design-tokens.ts`

## 文件

| 文件 | 职责 |
|------|------|
| `packages/ui/src/design-tokens.css` | CSS 变量唯一源（`:root, page`） |
| `packages/ui/src/design-tokens.ts` | JS 镜像，仅地图/Canvas 等读不到 CSS 变量的地方 |
| `docs/design/preview/2026-10-21-鲜肉红主题色卡.html` | 色卡与组件示意预览（评审用，不参与构建、不进业务样式门禁） |
| `apps/{store,supplier,user}/src/app.wxss` | 只保留 `@import "./styles/global.wxss";`，不再复制 token |
| `apps/{store,supplier,user}/src/styles/global.scss` | 引入 `design-tokens.css` + `mobile-theme.scss`，只写 `--mobile-*` / `--store-*` / `--user-*` 别名 |
| `apps/{store,supplier,user}/src/app.json` | 启动底色 `window.backgroundColor` 与各自 `--mobile-bg` 一致 |
| `apps/admin/src/styles/global.scss` | Admin 消费变量，`--admin-*` 全部是 token 别名 |
| `apps/admin/src/App.vue` | 引入 `design-tokens.css` |
| `apps/store/src/styles/global.scss` | 门店端消费变量，`--store-*` 全部是 token 别名 |

## Token 表

### 品牌（鲜肉红）

- `--color-brand-primary`: `#C8322B` — 主按钮、选中、链接（白字 5.32:1，暖底 4.99:1）
- `--color-brand-primary-dark`: `#A8261F` — 按压、Tab 选中、导航选中（白字 7.09:1）
- `--color-brand-primary-deep`: `#8C1E17` — 渐变尾、深压（白字 9.08:1）
- `--color-brand-primary-soft`: `#FCECEA` — 选中底、KPI 底（其上主色文字 4.64:1）
- `--gradient-brand`: `linear-gradient(140deg, #E1503F, #C8322B 55%, #A8261F)` — 仅登录头 / 我的身份卡
- `--color-on-brand`: `#FFFFFF`；`--color-on-brand-rgb`: `255, 255, 255` — 供 `rgba(var(--color-on-brand-rgb), α)` 混色使用（替代小程序不支持的 `color-mix()`）

### 语义

- `--color-success` / `--color-success-dark` / `--color-success-soft`: `#2F7A4D` / `#245E3B` / `#E9F3ED` — 竹青绿转入此处，承载「新鲜 / 冷链 / 成功」（浅底上的成功色文字 4.61:1）
- `--color-warning` / `--color-warning-dark` / `--color-warning-soft`: `#DE8A3B` / `#A9631F` / `#FDF1E4`
- `--color-info` / `--color-info-dark` / `--color-info-soft`: `#3D7CB0` / `#2C6188` / `#E8F1F8`
- `--color-danger` / `--color-danger-dark` / `--color-danger-soft`: `#B3203B` / `#8E1830` / `#FBEBEE` — 玫红，与品牌红拉开色相（白字 6.59:1）
- `--color-purple` / `--color-purple-dark` / `--color-purple-soft`: `#7A6BB5` / `#5E4E9E` / `#F0EDFA`
- `--color-gold` / `--color-gold-dark` / `--color-gold-soft`: `#C99A4E` / `#8C6A2E` / `#FBF3E6` — 腊味 / 礼盒 / 会员

### 价格与促销（原门店橙收编）

- `--color-price`: `#E8501E` — 全站价格文字；**仅用于 ≥16px / 600 以上金额**（页面底上 3.52:1，不承担正文可读性）
- `--color-promo`: `#F0810F` — 促销色块 / 图标底 / 渐变装饰；**不承载文字**（白字 2.67:1、深棕字 3.17:1，均不达 AA）
- `--color-promo-deep`: `#B85C00` — 促销标签底，配白字（4.60:1）
- `--color-promo-ink`: `#8A4800` — 促销浅底上的文字（6.00:1）
- `--color-promo-soft`: `#FDEBD7`
- `--color-promo-rgb`: `240, 129, 15` — 供 `rgba(var(--color-promo-rgb), α)` 混色

### 中性（暖白）

- `--color-bg`: `#FBF7F4`
- `--color-card`: `#FFFFFF`
- `--color-card-alt`: `#FDFAF8`
- `--color-ink`: `#2A1F1C` — 标题（15.03:1）
- `--color-ink-2`: `#6B5A54` — 正文 / 次文（6.13:1）
- `--color-ink-3`: `#9C8C86` — 仅 placeholder / 装饰，不当必读正文（3.23:1）
- `--color-text-nav`: `#584A46` — 导航未选中文字（白底 8.46:1 / 暖底 7.94:1）
- `--color-line`: `#EFE4E0`
- `--color-line-light`: `#F6EFEC`
- `--color-hover-bg`: `#FEFCFB`
- `--color-tabbar-default`: `#9C8C86` — 仅图标；Tab 文字用 `--color-text-nav`
- `--color-tabbar-active`: `#A8261F`
- `--color-overlay`: `rgba(34, 20, 17, 0.45)` — 暖化遮罩
- `--color-toast`: `rgba(42, 24, 20, 0.92)`

### 圆角 / 阴影 / 间距 / 控件

- `--radius-card`: `14px`
- `--radius-icon`: `11px`
- `--radius-button`: `12px`
- `--radius-pill`: `20px`
- `--radius-nav`: `10px`
- `--shadow-card`: `0 1px 2px rgba(42, 31, 28, 0.04), 0 10px 28px -16px rgba(42, 31, 28, 0.18)`
- `--shadow-button-primary`: `0 8px 18px -8px rgba(200, 50, 43, 0.35)`
- `--space-page`: `16px`
- `--space-section`: `16px`
- `--space-card`: `14px`
- `--space-gap`: `12px`
- `--control-size`: `44px`

### 字体

- 栈：现有 `--font-ui`（PingFang SC / 微软雅黑）。不引入新字体文件
- `--text-title`: `20px` / 700
- `--text-subtitle`: `16px` / 600
- `--text-body`: `14px` / 400（不用 Figma 13，保证 375 可读与 4.5:1）
- `--text-caption`: `12px`（不用 Figma 11.5）

### reserved（写入文件，供应商端不用）

- `--color-bg-cream`: `#FDFAF8`
- `--color-sidebar-grad-start`: `#3A2B28`
- `--color-sidebar-grad-end`: `#2A1E1B`
- `--color-sidebar-text`: `#CBB9B3`
- `--space-card-pc`: `18px` — Admin 卡片内边距使用

### Admin 浅色工作台（仅运营后台消费）

Admin **不用** reserved 深色侧栏。参考浅色 SaaS 控制台：白侧栏 + 品牌浅红选中。

- `--color-sidebar-bg`: `var(--color-card)`
- `--color-sidebar-active-bg`: `var(--color-brand-primary-soft)`
- `--color-focus-ring`: `rgba(200, 50, 43, 0.22)`
- `--color-chart-fill`: `rgba(200, 50, 43, 0.08)` — 仅 echarts 面积填充
- 别名名保留（`green` 是历史命名，值随品牌红）：`--admin-green` → `--color-brand-primary-dark`、`--admin-green-2` → `--color-brand-primary`、`--admin-green-soft` → `--color-brand-primary-soft`
- `--admin-gold` → `--color-gold`、`--admin-bg` → `--color-bg`、`--admin-panel` → `--color-card`、`--admin-ink` → `--color-ink`、`--admin-muted` → `--color-ink-2`、`--admin-line` → `--color-line`
- `--admin-radius-panel` → `--radius-card`（14px）、`--admin-radius-control` → `--radius-button`（12px）
- 图表：折线 / 柱状沿用 `designTokens` 引用；品类饼图序列固定 `[--color-brand-primary, --color-success, --color-info, --color-gold, --color-ink-3]`（红与 gold/warning 相邻发糊，插入绿与蓝拉开）

### 用户端商城（仅 `apps/user` 消费）

全站主色即用户端主色。用户端在 `apps/user/src/styles/global.scss` 把 `--mobile-*` 指到下列别名（`apps/user/src/app.wxss` 只有一行 `@import "./styles/global.wxss";`）。

- `--color-user-brand`: `#C8322B`
- `--color-user-brand-deep`: `#8C1E17`
- `--color-user-brand-deep-rgb`: `140, 30, 23`
- `--color-user-brand-soft`: `#FCECEA`
- `--gradient-user`: `linear-gradient(140deg, #E1503F, #C8322B 55%, #8C1E17)`
- `--gradient-user-login`: `linear-gradient(168deg, #E1503F 0%, #C8322B 46%, #A8261F 74%, #8C1E17 100%)`
- `--color-user-bg`: `#FBF7F4`
- `--color-user-ink`: `#2A1F1C`
- `--color-user-muted`: `#6B5A54`
- `--color-user-line`: `#EFE4E0`
- `--color-user-line-light`: `#F6EFEC`
- `--color-user-subtle`: `#FDF5F3`
- `--color-user-price`: `#E8501E`；`--color-user-price-rgb`: `232, 80, 30`
- `--color-user-warning`: `#C77A1E` — 沿用旧值（本轮不动）
- `--color-user-danger`: `#B3203B` — 对齐新危险色
- `--color-user-badge`: `#B85C00` — 角标改促销橙深色，避免与品牌红同色（白字 4.60:1）
- `--color-user-wx`: `#1B9D55` — 登录微信标，**保留**；`--color-user-wx-soft`: `#E8F5EE`
- `--color-user-hero-muted`: `#EBD3CF` — hero 辅助文字（= 白色 80% + 品牌深色 20%）
- `--radius-user-pill`: `24px`、`--radius-user-sheet`: `20px`、`--radius-user-login`: `26px`
- `--shadow-user-button`: `0 10px 20px -8px rgba(200, 50, 43, 0.5)`
- `--shadow-user-cart`: `0 14px 30px -10px rgba(140, 30, 23, 0.55)`

### 门店端订货商城（仅 `apps/store` 消费）

门店端**不再保留独立橙色品牌**，主色并入鲜肉红；原橙色收编为全站「价格 / 促销」语义。色值统一收在 `packages/ui/src/design-tokens.css` 的 `--color-store-*` / `--gradient-store*` / `--shadow-store*`，`apps/store/src/styles/global.scss` 只做 `--mobile-*` / `--store-*` 别名。

- `--color-store-brand` / `--color-store-brand-deep` / `--color-store-brand-soft`: `#C8322B` / `#8C1E17` / `#FCECEA`
- `--color-store-brand-rgb`: `200, 50, 43` — 供 `rgba(var(--color-store-brand-rgb), α)` 混色（`--store-focus`）
- `--color-store-price`: `#E8501E`（价格与数量角标共用）；门店端促销沿用全局 `--color-promo` / `--color-promo-deep` / `--color-promo-soft`，不再单列 `--color-store-promo*`
- `--color-store-warning`: `#C77A1E` — 沿用旧值（本轮不动）
- `--color-store-bg`: `#FBF7F4` — 与全站统一，取消门店专属底色 `#f7f3ee`
- `--color-store-surface-subtle`: `#F7EFEB`
- `--color-store-line` / `--color-store-line-light`: `#EFE4E0` / `#F6EFEC`
- `--color-store-ok` / `--color-store-ok-soft`: `#2F7A4D` / `#E9F3ED`
- `--color-store-info` / `--color-store-info-soft`: `#2F6EA7` / `#E8F1F8`
- `--color-store-on-brand`: `#FFFFFF`；`--color-store-disabled`: `#CFC5C0`
- `--color-store-backdrop`: `rgba(255, 255, 255, 0.92)`；`--color-store-mask`: `rgba(46, 26, 22, 0.45)`；`--color-store-overlay`: `rgba(42, 24, 20, 0.55)`
- `--color-store-glass` / `--color-store-glass-line`: `rgba(255, 255, 255, 0.14)` / `rgba(255, 255, 255, 0.25)`
- `--color-store-glow-top` / `--color-store-glow-bottom`: `rgba(240, 129, 15, 0.1)` / `rgba(200, 50, 43, 0.08)`
- `--gradient-store`: `linear-gradient(140deg, #E1503F, #C8322B 55%, #8C1E17)` — 仅登录 / 身份头图 / 主按钮
- `--gradient-store-login`: `linear-gradient(168deg, #E1503F 0%, #C8322B 46%, #A8261F 74%, #8C1E17 100%)`
- `--shadow-store-hero`: `0 16px 36px -18px rgba(74, 36, 30, 0.3)`
- `--shadow-store-cart`: `0 14px 30px -10px rgba(140, 30, 23, 0.55)`
- `--shadow-store-float`: `0 14px 34px -14px rgba(74, 36, 30, 0.35)`
- `--shadow-store-bar`: `0 -10px 24px -18px rgba(74, 36, 30, 0.45)`

### 例外登记（无法引用 CSS 变量）

- `apps/admin/src/uni.scss` 的 `$uni-color-*` 是 uni-app H5 编译期变量（仅管理端仍用 uni-app）：`$uni-color-primary` 取 `#C8322B`、`$uni-color-error` 取 `#B3203B`，与 `--color-brand-primary` / `--color-danger` 对齐。
- `apps/{store,supplier,user}/src/app.json` 的 `window.backgroundColor` 是 JSON 配置项，必须字面量，三端与各自 `--mobile-bg` 一致，取值 `#FBF7F4`（原 `pages.json` 的 `globalStyle.backgroundColor` 随 uni-app 一起移除）。
- `apps/supplier/src/components/DeliveryRouteMap/index.ts`：小程序 `map` 组件的 `marker.callout.color` / `polyline.color` 只能传字面量色值，取品牌红系 `#C8322B` / `#A8261F` / `#3D7CB0`，与 `--color-brand-primary` / `--color-info` 对齐。
- `packages/ui/src/mobile-theme.scss`：共享 `:root` 的 `--mobile-brand*` / `--mobile-price` 是历史默认值，三端均在各自 `global.scss` 覆盖，属死默认，本轮不动；角标 `--mobile-badge` 取 `var(--color-promo-deep)`，`.pc-tile-badge` 不再硬编码 `#d92c20`。
- PNG 兜底图标墨色写死在 `scripts/svg-icons-to-png.mjs`（`#1f2a22`）与三端 `src/static/icons/*.png`；按决策本轮不重跑（与新 ink `#2A1F1C` 肉眼无差）。
- 上述例外是 `pnpm audit:tokens` 白名单的唯一来源；新增例外必须同时改本文件和 `scripts/audit-tokens.mjs`。

### 已知既有限制（本轮不改）

- `--color-warning-dark` `#A9631F` 在 `--color-warning-soft` `#FDF1E4` 上为 4.20:1，`--color-info` `#3D7CB0` 在 `--color-info-soft` `#E8F1F8` 上为 3.90:1；语义色沿用旧值，状态 pill 视为装饰性标签，未按 4.5:1 调整。后续若要修，需单独一轮并同步测试。

## 页面达标

- 标题 / 正文 / 辅助：`--color-ink` / `--color-ink-2` / `--color-ink-3`（后者非必读）
- 价格用 `--color-price`，且仅限 ≥16px / 600 以上金额；促销文案用 `--color-promo-deep` 底 + 白字，或 `--color-promo-soft` 底 + `--color-promo-ink`
- 容器 padding ≥ `--space-page`；模块间距 `--space-section`
- 按钮 / 卡片 / 输入 / 弹层只用全局类 + token
- 状态：`:hover` 仅 `@media (hover: hover)`；`:active`、`:disabled`、空态、错误态必备
- loading：异步按钮加 `is-loading` 转圈；不可用仍用 `disabled + opacity`
- 375 不横滑；768 / 1440 手机框居中、背景 `--color-bg`
- 正文对比度 ≥ 4.5:1；可点区域 ≥ 44px

## Admin 工作面

1. 壳层：浅侧栏 + 顶栏 + 登录
2. 数据看板 KPI / 已有图表换色
3. 列表、表单、状态 pill、按钮、弹层

## 供应商端工作面（阶段③按组改）

1. dashboard + orders
2. products + mine
3. workspace-drivers + workspace-handovers
4. workspace-routes + workspace-warehouse
5. workspace-settlements + workspace-account
6. driver-today + driver-history
7. driver-mine + sheets（order / courier / handover / driver-form / category-picker）

## 微信小程序

- 三端（store / supplier / user）是**原生小程序**（不再使用 uni-app）：源码为手写 `app.ts` / `app.json` / `app.wxss` / 页面 `.ts|.wxml|.json|.wxss|.scss`，构建由 `scripts/build-native-mp.mjs` 完成，详见 [原生小程序迁移说明](../native-mini-program-migration.md)
- 原生运行时只允许 `wx.*` / `globalThis.wx`：源码里不得出现 `uni.*`、`localStorage`、H5 `window` / `document` 分支（由 `tests/native-mini-program-contract.test.ts` 与 `pnpm audit:tokens` 把关）
- WXS 只支持 ES5 子集：禁止 `for...in`、正则字面量、`$event`、箭头函数、模板字符串等（由 `pnpm audit:mp-wxs` 把关）
- 选择器必须是 `:root, page`（三端 App 级主题变量都必须在 `page` 上再声明一次）
- 禁用 HTML 标签选择器：`<small>/<strong>/<span>/<del>` 等会被编译成 `<view>`，`small{}` 这类规则永远匹配不到；改用语义 class（`.meta` / `.val` / `.chip` / `.strike`）
- 禁用 `color-mix()` 与 `:has()`：老微信内核会整条丢弃声明；混色改用 `rgba(var(--x-rgb), α)`，条件样式改用状态 class
- 公共类放 App 级 `global.scss`，自定义组件不继承页面变量
- 阶段内不改 rpx
- 无 hover：只在 `hover` 媒体查询里写 hover
- 胶囊：`padding-right: 96px` + `status-bar-height`
- 地图色走 `design-tokens.ts`
- H5 的 430px 框必须包在 `/* #ifdef H5 */`
- 安全区：`env(safe-area-inset-bottom)`

## 落地状态（2026-10-21 · 已落地）

- **已落地**（历史条目：当时四端 `uni.scss` / `pages.json` 仍在，现已随原生迁移移除，见下方「原生小程序收口」）：token 源（`design-tokens.css` / `design-tokens.ts`）、当时的 `uni.scss` 与 `pages.json` 启动底色、共享角标 `--mobile-badge`、后台品类饼图序列色。四端业务样式文件**零改动**：配色全部经 `--mobile-*` / `--admin-*` / `--store-*` 别名指向 token，改值即生效。
- **验证结果**：`pnpm typecheck`、`pnpm test`（91 文件 / 1268 例）、`audit:tokens`、`audit:mp-styles`、`audit:typography`、`audit:buttons`、`audit:interfaces`、`pnpm build`、`check:mp-size`（store 995KB+513KB / supplier 1157KB+504KB / user 1016KB+509KB）、`check:supplier-assets` 全绿；三端 `app.wxss` 与后台 H5 CSS 均含 `--color-brand-primary: #C8322B`，三端 `app.json` 启动底色为 `#FBF7F4`。
- **真实页面验收**：四端 H5 在不注入任何覆盖的原生页面上元素级比色命中规格值（后台侧栏选中 `rgb(252,236,234)` + `rgb(168,38,31)`、供应商与用户端登录/主按钮 `rgb(200,50,43)`、门店 hero 与购物车栏新红渐变、价格仍 `rgb(232,80,30)`），旧绿/旧橙零残留。
- **本轮不做**：PNG 图标墨色不重跑（维持 `#1f2a22`）；`warning-dark` 在浅底 4.20:1、`info` 在浅底 3.90:1 维持现状，只登记不修。

### 原生小程序收口（2026-10-21）

- **token 单源恢复**：`apps/store`、`apps/user` 的 `src/app.wxss` 曾把 uni-app 编译产物（含整份 token）复制回源码；现三端 `src/app.wxss` 只有 `@import "./styles/global.wxss";`，业务样式收在 `src/styles/global.scss`，构建时把 `design-tokens.css` 复制为产物根 `design-tokens.wxss` 并重写成相对 WXSS 引用。
- **uni-app 残留清理**：三端 `uni.scss` / `pages.json` / `manifest.json` 已删除，启动底色改由 `src/app.json` 的 `window.backgroundColor` 声明；`audit:tokens` 取消对 `apps/*/src/app.wxss` 的整文件豁免，只保留 `apps/admin/src/uni.scss` 与供应商原生地图组件两条例外。
- **构建原子化**：`scripts/build-native-mp.mjs` 先在 `<产物目录>.tmp-<pid>` 完整构建再整体替换；产物目录被微信开发者工具占用时直接失败并提示先关闭项目，不再退回覆盖写入（避免残留旧文件）。
- **验证**：见 `docs/native-mini-program-migration.md` 的「验收」小节（`pnpm test` / `typecheck` / `build` / `check:mp-size` / 四个 audit 门禁）。

## 决策日志

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-09-11 | 桌面保持 430px 手机框 | 贴近小程序，不做 1440 多列工作台 |
| 2026-09-11 | Figma + 本规格覆盖旧视觉契约 | 旧测试锁 8px / 旧绿 / 40px mini |
| 2026-09-11 | 正文 14、caption 12 | Figma 13 / 11.5 在 375 与微信上偏弱 |
| 2026-09-11 | 主按钮投影透明度 0.35 | Figma 0.9 在 Android 微信发脏 |
| 2026-09-11 | 不改共享 `mobile-theme.scss` 源值 | 供应商端覆盖 `--mobile-*`，避免门店/农家乐被换肤 |
| 2026-09-12 | 异步按钮单独转圈 | 不用整页淡出代替；`is-loading` + `::before` 圆环 |
| 2026-09-12 | 辅文改为 `#5E6F64` | `#6A7B70` 对比度不够，按规格加深 |
| 2026-09-12 | Admin 用浅色侧栏 | 用户参考图是浅色 SaaS；reserved 深色侧栏不启用 |
| 2026-09-12 | Admin 圆角跟 `--radius-card` / `--radius-button` | 旧契约锁 8/6，对不上参考图留白与卡片 |
| 2026-09-13 | 用户端新增 `--color-user-*` 别名 | 商城设计稿主色更深、价格更橙、主按钮满圆；不改全站主色 |
| 2026-10-16 | 移动三端禁用 `small/strong/span/del` 标签选择器 | 小程序把它们编译成 `view`，标签规则全部失效，价格/辅文字号与配色丢失；统一改语义 class |
| 2026-10-16 | 门店端主题变量改 `:root, page` | 与供应商/用户端对齐，避免小程序根节点读不到变量导致整端掉色 |
| 2026-10-16 | `color-mix()` 改 `rgba(var(--x-rgb), α)`、`:has()` 改状态 class | 老微信内核不支持这两个特性，购物车底部留白与半透明底会失效 |
| 2026-10-16 | 新增 `pnpm audit:mp-styles` 门禁 | 源码 + 构建产物双重校验：标签选择器、`page` 作用域、兼容语法、`!important` 白名单 |
| 2026-10-20 | 门店橙色主题收进 `--color-store-*` | 业务保留门店橙色品牌；业务样式不再写 hex，色值只留在 token 文件 |
| 2026-10-21 | 全站主色由竹青绿 `#2F7A4D` 改鲜肉红 `#C8322B` | 平台主营生鲜猪肉，绿色无法承载「新鲜肉质」卖点；竹青绿降为成功/冷链语义 |
| 2026-10-21 | 门店端橙色 `#F0810F` 收编为「价格 / 促销」色 | 四端统一后不再保留独立橙色品牌；橙色改承担促销语义，深色 `#B85C00` 承载白字 |
| 2026-10-21 | 危险色由 `#C9553F` 改玫红 `#B3203B` | 品牌红与危险红同族会混淆状态语义，用玫红拉开色相 |
| 2026-10-21 | 中性色由冷绿灰改暖白（底 `#FBF7F4`） | 冷绿灰底与红主色互相污染，暖白让鲜肉红不显脏 |
| 2026-10-21 | 促销橙 `#F0810F` 不承载文字 | 白字 2.67:1、深棕字 3.17:1 均不达 AA，只作装饰色块与渐变 |
| 2026-10-21 | 价格色全站统一 `#E8501E`，仅限 ≥16px / 600 金额 | 3.52:1 不满足正文标准，但满足大字号 3:1，价格本就加大加粗 |
| 2026-10-21 | Admin 品类饼图固定 5 色序列 | 品牌红与 gold / warning 相邻发糊，插入 success 绿与 info 蓝拉开 |
| 2026-10-21 | 保留规格文件名 `zhulv-design-tokens.md` | 换名要动 `AGENTS.md`、audit 脚本与多端注释引用，收益不抵风险 |
| 2026-10-21 | 落地时不改任何业务样式文件 | 四端配色全部经别名指向 token，只动 token + 共享角标 + 后台饼图即可整端换肤 |
| 2026-10-21 | PNG 图标墨色不重跑 | `#1f2a22` 与新 ink `#2A1F1C` 肉眼无差，避免 59 个二进制文件变更 |
| 2026-10-21 | 既有 warning / info 对比度维持现状 | 4.20:1、3.90:1 属旧值遗留，本轮只登记不扩散改动范围 |
| 2026-10-21 | 门店端数量角标沿用价格色 | `.tab-badge` / `.detail-cart-badge` 与价格共用 `--farm-red`，为角标单独拆 token 收益不抵改动面 |