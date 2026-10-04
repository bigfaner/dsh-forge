---
id: "fix-17"
title: "Fix: 添加项目 ＋ 图标改官方「文件夹+加号」件（IconProjectAddOutlineRegular，对齐原生 dsh）——侧栏头部钮图标对齐 + 同排钮形态一致化评估"
priority: "P1"
estimated_time: "30min"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 添加项目 ＋ 图标改官方「文件夹+加号」件

> 来源：走查人（2026-10-03）「添加项目的 + 图标改成添加文件的图标，对齐原生 dsh」。

## Description

侧栏项目区头部「添加项目」钮图标：现自绘 ＋ 纯加号 → **官方 `IconProjectAddOutlineRegular`**（文件夹轮廓 + 右上角加号，viewBox 16、currentColor、1px regular 描边——官方「项目添加」语义件，原生 dsh 同款；原型 index.html:54 亦为文件夹+加号同形）。

顺带一致化（执行裁决 + 走查确认）：
- **钮形态**：＋ 钮现为 26px 自绘钮，是同排唯一自绘残存（fix-13① 后搜索/视图钮已官方 ghost 透明底）——对齐同排官方行语言（ghost/sm + 官方图标钮刻度），三钮一致
- **hero CTA**（HeroEmpty「＋添加项目」官方 Button）：文本前缀 ％＋ 可换官方 icon 位（IconProjectAddOutlineRegular + 文案「添加项目」），同口径对齐

锚与语义零变化：`data-dswf-nav="add-project"` / `data-dswf-cta="add-project"`、openAddProjectFlow 打开缝、fix-16 直达编排（若已落地）。

## Reference Files

- 官方件：`dsh-client-ui-primitives` `IconProjectAddOutlineRegular`（lib/index.js:1714-1742——Artwork 16×16 currentColor）
- 原型基准：docs/proposals/dsh-forge-redesign/prototype/index.html:54（folder+plus 同形）
- 产品：apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx（＋钮）+ sidebar.css（钮形态规则）；apps/web/src/workbench/HeroEmpty.tsx（CTA 顺带）

## Acceptance Criteria

- [x] ＋ 钮图标 = IconProjectAddOutlineRegular（computed 颜色随令牌；16px 官方刻度）
- [x] 同排三钮（搜索/视图选项/添加）行语言一致（官方件 + 透明底）；走查目视确认
- [x] hero CTA 口径对齐（图标位 + 文案；锚不动）
- [x] `data-dswf-nav="add-project"` 锚与打开行为零变化（e2e 断言零褪色）；tsc + lint + 定向单测绿
- [x] 执行记录附侧栏头部截屏

## User Stories

- Story 1（两段式注册）：添加入口图标语义正确（文件夹 = 项目/工作区，非抽象加号）。

## Hard Rules

- dsh 底子：官方图标件唯一（零自绘 SVG）；未点名元素不变（排布/间距/aria/title）。
- 令牌唯一（图标色随 currentColor 令牌）。

## Implementation Notes

- 与 fix-16 同文件域（ForgeWorkspacePanel 入口）——时序协作注记；本任务仅图标/钮形态面，不触流程编排。
