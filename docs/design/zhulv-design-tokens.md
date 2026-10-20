# 竹青绿 Design Token 规格

全站唯一视觉源。改任何 UI 之前先读本文。Figma 源：`竹青绿-DesignTokens-figma.json`（农家乐/田园自然风 · Mode 1）。

供应商端是第一块样板。Admin 运营后台是第二块样板（浅色 PC 工作台）。用户端商城、门店订货端各自消费 `--color-user-*` / `--color-store-*` 别名；未接线端禁止把旧 hex 写回业务样式。

## 产品口径

- 这是什么：供应链平台，供应商与司机双角色配送履约
- 视觉方向：竹青绿田园自然风，作业区扁平，登录/身份卡可用品牌渐变
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
| `apps/supplier/src/styles/global.scss` | 供应商端消费变量，覆盖 `--mobile-*` 别名 |
| `apps/supplier/src/pages.json` | `backgroundColor` 与 `--color-bg` 一致 |
| `apps/admin/src/styles/global.scss` | Admin 消费变量，`--admin-*` 全部是 token 别名 |
| `apps/admin/src/App.vue` | 引入 `design-tokens.css` |
| `apps/store/src/styles/global.scss` | 门店端消费变量，`--store-*` 全部是 token 别名 |

## Token 表

### 品牌

- `--color-brand-primary`: `#2F7A4D` — 主按钮、选中、链接
- `--color-brand-primary-dark`: `#245E3B` — 按压、Tab 选中
- `--color-brand-primary-soft`: `#E9F3ED` — 选中底、KPI 底
- `--gradient-brand`: `linear-gradient(140deg, #3E9B62, #2F7A4D)` — 仅登录头 / 我的身份卡

### 语义

- `--color-success` / `--color-success-dark` / `--color-success-soft`: `#2F7A4D` / `#245E3B` / `#E9F3ED`
- `--color-warning` / `--color-warning-dark` / `--color-warning-soft`: `#DE8A3B` / `#A9631F` / `#FDF1E4`
- `--color-info` / `--color-info-dark` / `--color-info-soft`: `#3D7CB0` / `#2C6188` / `#E8F1F8`
- `--color-danger` / `--color-danger-dark` / `--color-danger-soft`: `#C9553F` / `#A03F2C` / `#FBECEA`
- `--color-purple` / `--color-purple-dark` / `--color-purple-soft`: `#7A6BB5` / `#5E4E9E` / `#F0EDFA`
- `--color-gold` / `--color-gold-dark` / `--color-gold-soft`: `#C99A4E` / `#8C6A2E` / `#FBF3E6`
- `--color-price`: `#D2543C`

### 中性

- `--color-bg`: `#F4F7F2`
- `--color-bg-cream`: `#FBF8F2` — reserved，供应商端不用
- `--color-card`: `#FFFFFF`
- `--color-card-alt`: `#FCFDFC`
- `--color-ink`: `#1D2A22` — 标题
- `--color-ink-2`: `#5E6F64` — 正文/次文（由 `#6A7B70` 加深以保证对比度）
- `--color-ink-3`: `#9AA8A0` — 仅 placeholder / 装饰，不当必读正文
- `--color-text-nav`: `#41504A` — 导航未选中文字（对比度达标）
- `--color-line`: `#E7ECE6`
- `--color-line-light`: `#F1F5F0`
- `--color-hover-bg`: `#FAFCFA`
- `--color-tabbar-default`: `#9AA8A0` — 仅图标；Tab 文字用 `--color-text-nav`
- `--color-tabbar-active`: `#245E3B`
- `--color-on-brand`: `#FFFFFF`
- `--color-on-brand-rgb`: `255, 255, 255` — 供 `rgba(var(--color-on-brand-rgb), α)` 混色使用（替代小程序不支持的 `color-mix()`）

### 圆角 / 阴影 / 间距 / 控件

- `--radius-card`: `14px`
- `--radius-icon`: `11px`
- `--radius-button`: `12px`
- `--radius-pill`: `20px`
- `--radius-nav`: `10px`
- `--shadow-card`: `0 1px 2px rgba(29, 42, 34, 0.04), 0 10px 28px -16px rgba(29, 42, 34, 0.18)`
- `--shadow-button-primary`: `0 8px 18px -8px rgba(47, 122, 77, 0.35)`
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

- `--color-bg-cream`
- `--color-sidebar-grad-start`: `#22303F`
- `--color-sidebar-grad-end`: `#1A2530`
- `--color-sidebar-text`: `#AEBFCE`
- `--space-card-pc`: `18px` — Admin 卡片内边距使用

### Admin 浅色工作台（仅运营后台消费）

Admin **不用** reserved 深色侧栏。参考浅色 SaaS 控制台：白侧栏 + 软绿选中。

- `--color-sidebar-bg`: `var(--color-card)`
- `--color-sidebar-active-bg`: `var(--color-brand-primary-soft)`
- `--color-focus-ring`: `rgba(47, 122, 77, 0.22)`
- `--color-chart-fill`: `rgba(47, 122, 77, 0.08)` — 仅 echarts 面积填充
- `--admin-green` → `--color-brand-primary-dark`
- `--admin-green-2` → `--color-brand-primary`
- `--admin-green-soft` → `--color-brand-primary-soft`
- `--admin-gold` → `--color-gold`
- `--admin-bg` → `--color-bg`
- `--admin-panel` → `--color-card`
- `--admin-ink` → `--color-ink`
- `--admin-muted` → `--color-ink-2`
- `--admin-line` → `--color-line`
- `--admin-radius-panel` → `--radius-card`（14px）
- `--admin-radius-control` → `--radius-button`（12px）

### 用户端商城（仅 `apps/user` 消费）

全站主色 `--color-brand-primary` 不动。用户端在 `apps/user/src/styles/global.scss` 把 `--mobile-*` 指到下列别名，对齐商城设计稿。

- `--color-user-brand`: `#17633F`
- `--color-user-brand-deep`: `#0F4A31`
- `--color-user-brand-soft`: `#E7F2EB`
- `--gradient-user`: `linear-gradient(140deg, #3E9B62, #2F7A4D 55%, #17633F)`
- `--gradient-user-login`: `linear-gradient(168deg, #3E9B62 0%, #2F7A4D 46%, #1E6B45 74%, #14532F 100%)`
- `--color-user-bg`: `#F4F6F1`
- `--color-user-ink`: `#1B2620`
- `--color-user-muted`: `#67756C`
- `--color-user-line`: `#E2E8E0`
- `--color-user-line-light`: `#ECF1EA`
- `--color-user-subtle`: `#EEF3EC`
- `--color-user-price`: `#E8501E`
- `--color-user-warning`: `#C77A1E`
- `--color-user-danger`: `#B83532`
- `--color-user-badge`: `#D92C20`
- `--color-user-wx`: `#1B9D55` — 登录微信标
- `--color-user-wx-soft`: `#E8F5EE`
- `--color-user-brand-deep-rgb`: `15, 74, 49` — 阴影/遮罩混色通道
- `--color-user-price-rgb`: `232, 80, 30` — 价格投影混色通道
- `--color-user-hero-muted`: `#D3DFD8` — hero 辅助文字（= 白色 80% + 品牌深色 20%）
- `--radius-user-pill`: `24px` — 主按钮满圆
- `--radius-user-sheet`: `20px`
- `--radius-user-login`: `26px`
- `--shadow-user-button`: `0 10px 20px -8px rgba(23, 99, 63, 0.5)`
- `--shadow-user-cart`: `0 14px 30px -10px rgba(15, 74, 49, 0.55)`

### 门店端订货商城（仅 `apps/store` 消费）

门店保留橙色品牌（与全站竹青绿并存，属业务自定主题）；色值统一收在 `packages/ui/src/design-tokens.css` 的 `--color-store-*` / `--gradient-store*` / `--shadow-store*`，`apps/store/src/styles/global.scss` 只做 `--mobile-*` / `--store-*` 别名。

- `--color-store-brand` / `--color-store-brand-deep` / `--color-store-brand-soft`: `#F0810F` / `#D66A00` / `#FDEBD7`
- `--color-store-brand-rgb`: `240, 129, 15` — 供 `rgba(var(--color-store-brand-rgb), α)` 混色（`--store-focus`）
- `--color-store-price`: `#E8501E` — 价格；`--color-store-warning`: `#C77A1E`
- `--color-store-bg`: `#F7F3EE`；`--color-store-surface-subtle`: `#F3E9DF`
- `--color-store-line` / `--color-store-line-light`: `#E9DED1` / `#F1E8DC`
- `--color-store-ok` / `--color-store-ok-soft`: `#2F7A4D` / `#E9F3ED`
- `--color-store-info` / `--color-store-info-soft`: `#2F6EA7` / `#E8F1F8`
- `--color-store-on-brand`: `#FFFFFF`；`--color-store-disabled`: `#C9CFC9`
- `--color-store-backdrop` / `--color-store-mask` / `--color-store-overlay` / `--color-store-glass` / `--color-store-glass-line` / `--color-store-glow-top` / `--color-store-glow-bottom`
- `--gradient-store`、`--gradient-store-login` — 仅登录 / 身份头图
- `--shadow-store-hero` / `--shadow-store-cart` / `--shadow-store-float` / `--shadow-store-bar`

### 例外登记（无法引用 CSS 变量）

- `apps/*/src/uni.scss` 的 `$uni-color-*` 是 uni-app 编译期变量：admin / supplier / user 取值对齐 `--color-brand-primary` / `--color-warning` / `--color-danger`；门店端 `$uni-color-success` `#2b7a52`、`$uni-color-warning` `#b8903f` 为历史值，与 `--color-store-ok` / `--color-store-warning` 有轻微色差，本轮保持不动。
- `apps/store/src/pages.json` 的 `globalStyle.backgroundColor` `#f7f3ee` 是 JSON 配置项，必须字面量，值等同 `--color-store-bg`。
- 上述例外是 `pnpm audit:tokens` 白名单的唯一来源；新增例外必须同时改本文件和 `scripts/audit-tokens.mjs`。

## 页面达标

- 标题 / 正文 / 辅助：`--color-ink` / `--color-ink-2` / `--color-ink-3`（后者非必读）
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
