---
status: "completed"
started: "2026-10-03 20:03"
completed: "2026-10-03 20:17"
time_spent: "~14m"
---

# Task Record: fix-15 Fix: 品牌标识替换——「知识就是力量」新 mark（docs/brand 母版）+ 根修左上角品牌方块近黑问题（深底填充废弃，currentColor 令牌适配）

## Summary
品牌标识替换根修：ForgeBrandMark 由「知」字深底方块改为「书 + 闪电」内联 SVG（docs/brand 母版三路径，viewBox 24×24，size 属性缩放，aria-hidden 保持）；单一 currentColor + 外层 --dsw-alias-label-primary-bluish 令牌，sidebar.css 废弃填充底/反色对——浅色主题近黑方块根因消除。fix-record 假前提实证：前次会话仅交付 docs/brand 设计母版（2026-10-03 18:50），代码集成零落地（ForgeBrand.tsx 仍为旧形态），依派发「假前提则真实现」注记转真实现（fix-6 先例形态）。

## Changes

### Files Created
- docs/brand/dsh-forge-mark.svg
- docs/brand/README.md

### Files Modified
- apps/web/src/views/sidebar/ForgeBrand.tsx
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx

### Key Decisions
- 色彩裁决（Hard Rule 二选一）：--dsw-alias-label-primary-bluish——品牌标识强调色区别于单色 label-primary 图形，呼应原 brand-primary 蓝系意图且令牌明暗自适应；该令牌已在本文件（retry 件）与产品多面在用，零新面
- SVG 用 width/height 属性 + viewBox 缩放（非 inline style）——语义缩放且 token-lint 不涉宽高面；svg 根 fill=none、三路径全 fill=currentColor（docs/brand 禁固定色值约定）
- fix-record 前提修正：存在性对照（落点文件内容 vs AC + git log 时间线）证实现仅设计母版在场——派发注记在場故转真实现，非 blocked
- 深色主题探针 = body[data-ds-dark-theme] 官方暗 scope 直置 + 计算色翻转自证（浅 rgb(14,48,116) → 暗 rgb(249,250,251)）；hover 用真实 mouse.move（合成事件不驱动 CSS :hover）
- 运行期证据（tmp-ui-review，不入仓）：fix15-main-light/dark.png 全窗 + fix15-row-light/hover-light/dark.png 24px mark 特写；探针实测 mark backgroundColor=rgba(0,0,0,0)（无填充底）、官方行 button.hHd-Xa_brand cursor:pointer 交互未触

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1031
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] 左上角品牌 mark = 新「书 + 闪电」图形（浅/深主题各截屏归档执行记录；无黑色方块）
- [x] 图形随令牌自适应：明暗主题切换均正确呈现（currentColor 消费官方 color 令牌，零裸值——token lint 绿）
- [x] 24px（品牌行/rail）与悬停态可辨；aria-hidden 保持；ForgeBrandName 不变
- [x] 官方壳品牌行交互零变化（整块 = 新会话快捷归壳）；e2e 既有断言零褪色（品牌 mark 无专锚，走查确认）
- [x] tsc + lint + 定向单测绿

## Notes
质量门（严格序全过）：compile = playwright --list -c e2e/playwright.config.ts（61 specs / 14 files，worktree 缺主仓未跟踪的根 playwright.config.ts，裸跑会误扫 vitest 文件——用 test:e2e 同款受跟踪配置）；fmt = 仓内无格式化器/无 just fmt 配方，oxlint 风格道覆盖（绿）；lint = pnpm lint 五道全绿（ox/imports 146 文件 0 违规/tokens 126 文件 0 裸值/selftest 14 规则/tsc -b）；unit-test = VITEST_MAX_WORKERS=4 vitest run 1031/1031（101 文件）。e2e 锚走查：grep brand-mark/dswf-sidebar-brand/ForgeBrand 于 tests+e2e 零命中（品牌 mark 无专锚证实）。运行期探针：tmp-ui-review/fix15-probe.mjs + fix15-probe2.mjs（沿 fix13 形制，ack-fix15.yml 预确认 welcome notice，独立 userData/端口 19815-19816）。
