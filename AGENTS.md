# Agent 指引

## 仓库与推送目标

本目录（`agritainmen2`）的 `origin` 统一指向 **`https://github.com/Chenfan0211/agritainmen2.git`**。
不要推送到同名的 `https://github.com/Chenfan0211/agritainmen.git`：那是另一个仓库，本目录已不再关联，目录名带 2 而仓库名不带 2，极易混淆。
交付分支沿用 `dev/dev-YYYYMMDD`；推代码前先执行 `git remote get-url --push origin` 确认目标地址。

## Design System

Always read `docs/design/zhulv-design-tokens.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Business styles must use CSS variables from `packages/ui/src/design-tokens.css`.
Do not hardcode color hex in app styles. Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `docs/design/zhulv-design-tokens.md`.
