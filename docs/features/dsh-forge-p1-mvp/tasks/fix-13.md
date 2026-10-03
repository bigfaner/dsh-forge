---
id: "fix-13"
title: "Fix: 两处 dsh 原生对齐偏差——① 侧栏项目区图标钮带常驻底色（toolbar 变体误用）② 会话头部单元两截化（toolbar 行 + SegmentedTabs 控件，应为原生 titleRow+扁平页签一体头部）"
priority: "P1"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 侧栏图标钮底色 + 会话头部单元原生对齐

> 来源：走查人实机（2026-10-03，fix-6/fix-9 完成后的复走查）：「左侧栏的项目的图标按钮样式不对，存在背景色」「中间主体上方的 toolbar 组件位置不对，这个要对齐 dsh 原生的」。

## ① 侧栏项目区图标钮常驻底色

**根因**：fix-6 的搜索钮/视图选项钮用官方 `Button variant="toolbar"`——该变体自带**常驻底色** `background: var(--dsw-alias-button-tool-bar-fill)`（`dsh-client-ui-primitives/Button.module.css` `.toolbar` 规则）。官方侧栏行语言的图标钮是**透明底 + 仅 hover 底**（ghost 变体：`background: transparent`，hover `interactive-bg-hover`；原型 `.icon-btn` 同语义）。

**修法**：两钮 `variant="toolbar"` → `variant="ghost"`（官方 Button，透明底），其余（图标/尺寸/aria）不动。＋钮（自绘 26px）同场核查：若有常驻底色一并对齐透明底行语言（走查点名「项目的图标按钮」为集合指称）。

**验收**：两钮（必要时含＋）computed `background-color` = transparent（非 tool-bar-fill）；hover 才现底；截图归档执行记录。

## ② 会话头部单元对齐 dsh 原生（位置与结构）

**根因**：fix-9 采「官方件组合在 SessionPanel 内组装」路径，但形态为 **SessionToolbar（titleRow）+ 自有 SegmentedTabs 页签控件** 两截——SegmentedTabs 是分段控件（轨道底/指示块），与官方头部单元的**扁平文字页签**完全不同形，观感为「浮一条工具栏 + 一个页签控件」而非原生的整体头部。

**官方原生规格**（`dsh-client-ui-conversation` `ConversationRoot` 内联 CSS 实值 + `ConversationSessionHeader` 结构，2026-10-03 勘取）：

| 官方类 | 刻度实值 |
|---|---|
| `.header`（头部容器） | grid 双列 `auto minmax(0,1fr)`；**min-height 76px**（含页签行时；无页签 = min-height 0 + padding-bottom 10px）；**padding 10px 28px 0 20px**；**border-bottom 0.5px solid `--dsw-alias-border-l3`** |
| `.titleRow` | min-height 30px；grid-column 2；align-items center |
| `.titleCluster` | flex:1；gap 10px（内含 crumbs + headerActions[flex none, gap 8px]） |
| `.crumbs` / `.crumb` | gap 4px；crumb = padding 4px 8px、radius md、**label-tertiary**、14px/20、hover 底；当前位 label-primary |
| `.headerUtilities` | flex none；gap 8px；**margin-left 20px** |
| `.headerCorner` | margin-left auto |
| `.tabs`（页签行，titleRow 之下） | **grid-column 1/-1 跨全宽**；**gap 36px**；margin-top 10px；padding-left 8px；flex |
| `.tab` | **纯文字钮：透明底、无边框、padding 0 0 9px、13px/500/16、label-tertiary** |
| `.tabActive` | **仅变色 `--dsw-alias-state-business-primary`**（无底、无指示块） |

**修法**：SessionToolbar 与页签行融合为官方同构头部单元——`.dswf-session-header` 容器按 `.header` 刻度（含底边发线与 76px 语义）；三页签从 SegmentedTabs 控件改为官方 `.tab/.tabActive` 行语言复刻（透明文字钮 + 变色激活）；utilities/corner/hero 相位（corner 独存）/WCO 避让语义全部沿 fix-9 口径不动。**决策变更记录**：2.11「页签条 = 官方 SegmentedTabs」按走查人原生对齐指令更新为「官方 ConversationRoot 页签行语言」（样式纪律第 3 条「形态对齐官方」正源；SegmentedTabs 于会话面板退役，dock 面不受影响）。

**验收**：头部单元与原生同构（刻度逐项对照表入执行记录：76/padding/发线/titleRow 30/页签 gap 36/扁平 tab 变色激活）；hero 相位语义不变（corner 独存）；三页签锚与 e2e 断言（`[role="tab"]` 计数/label）零褪色；走查人实机目视确认「位置对齐原生」。

## Reference Files

- 官方：`dsh-client-ui-conversation/lib/client.js` css$4 内联样式（:15797 邻域）+ `ConversationSessionHeader`（:16456-16527）；`dsh-client-ui-primitives/lib/Button.module.css`（.toolbar/.ghost）
- 产品：apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx（钮变体落点）；apps/web/src/views/session/SessionToolbar.tsx + SessionPanel.tsx + session.css（头部单元重构面）；workbench.css（退役面）
- 关联记录：fix-6/fix-9 执行记录（偏差来源）；2.11 记录（原 SegmentedTabs 决策）

## Hard Rules

- dsh 底子：钮/头部/页签全部官方行语言复刻（刻度实值注记 dsw-raw 豁免，官方主题无对应标尺令牌处沿先例）；零自绘平行模式。
- 未点名元素不变：crumbs 数据面（会话标题直读）、utilities 两钮语义、corner 面板钮、hero 让位、UF-5/keep-alive、dock 面页签（官方 dockkit 基座不动）。
- e2e 锚零褪色（[role=tab] 语义保持）。

## Implementation Notes

- 官方 `.tab` 疑有底部指示细节（z-index:1/position relative 暗示 ::after 指示线）——执行时读完整 css$4 字符串核对，缺失面按实值补齐。
- 两项独立可并行；① 为 ①行改动，先落先验。
