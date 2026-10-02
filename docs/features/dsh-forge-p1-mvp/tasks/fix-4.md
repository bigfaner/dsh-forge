---
id: "fix-4"
title: "Fix: 右栏 dock 页签条整理（strip 内衬 / 收展钮归位 / 拖拽调宽手柄——官方行语言，机制语义零变化）"
priority: "P2"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 右栏 dock 页签条整理（strip 内衬 / 收展钮归位 / 拖拽调宽手柄——官方行语言，机制语义零变化）

> 来源：UI 走查第 1 轮（[reports/ui-walkthrough-round1.md](../reports/ui-walkthrough-round1.md) §2.3）。走查人实机反馈「右侧栏即 dockkit 样式有点乱」。

## Root Cause

P1 机制最简版决策（2.5/2.6 在案：dockkit DockSurface 引擎后续消费）下视觉未打磨，四处偏差：strip `gap:0; padding:0` 致 SegmentedTabs 与收展钮挤排；宽度固定 340 无调宽手柄（原型 `#rb-resize` 300–70vw 拖拽）；dock body 无内衬占位贴边；背景面与原型发线处理不一致。

## Description

右侧栏容器面的视觉整理（dsh 官方件复用口径）：页签条补行语言内衬、收展钮与页签分区呈现；补拖拽调宽手柄（8px col-resize，宽度 300–70vw，记忆态）；dock body 补内衬。**官方件保留不换**——SegmentedTabs/Button 原样，不采纳原型自绘 chips 形态，仅取其布局刻度。

## Reference Files

- apps/web/src/zones/zones.css — `.dswf-zones-dock` / `-strip` / `-body`（:46-81）
- apps/web/src/zones/WorkbenchZones.tsx — strip 结构（SegmentedTabs + toggle）与轨道相位
- apps/web/src/shell/view-state.ts — 状态机（宽度记忆态挂放裁决输入；机制语义不得变化）
- docs/proposals/dsh-forge-redesign/prototype/styles.css — 原型右栏刻度（:800-829：rb-strip 10px/8px 内衬、rb-resize 手柄、rb-body 4px/16px/20px）
- docs/features/dsh-forge-p1-mvp/reports/shots/p3-dock-expanded.png — 走查截图

## Acceptance Criteria

- [ ] strip 视觉不挤排：内衬对齐官方行语言刻度，SegmentedTabs 与收展钮分区呈现（走查目视确认「不乱」）
- [ ] 拖拽调宽：左缘 8px col-resize 手柄（hover 高亮 = interactive-bg-hover 令牌），宽度 300px–70vw，会话内记忆；收起/展开/强制隐藏三态语义与拖宽正交
- [ ] dock body 内衬就位（占位文本不贴边；后续槽位内容不被本任务改写）
- [ ] 官方件复用不变：SegmentedTabs / Button 原样保留，无自绘 chips、无新基础组件
- [ ] 机制与断言零褪色：UF-5（知识视图强制隐藏 + 切回恢复）/ UF-7（页签跟随、三态）相关单测（view-state 11 例 + dock 8 例 + WorkbenchZones）与 smoke-skeleton 组一 e2e 全绿
- [ ] token lint 绿；新增刻度 dsw-raw 豁免注记同步执行记录（zones.css 既有口径：布局尺寸按原型结构取值不在令牌面）

## User Stories

- Story 2（日常会话）：右栏信息区呈现整洁，宽度可按内容调整。

## Hard Rules

- **机制语义零变化**：三态（collapsed/expanded/hidden）、keep-alive 常挂载、页签跟随、宽度轨道收展——一律不动；宽度记忆为新增机制内态（挂 shell 态机或 zones 内态由实现裁决，禁入域状态层）。
- **未点名元素保持不变**：dock 页签内容（M0「开始」占位）、页签集机制、背景/边线令牌现状（整理中若走查确认需改背景面，仅限令牌内取值且执行记录注记）。
- 令牌唯一 + 官方件复用（样式纪律六条）全程适用。

## Implementation Notes

- 手柄实现沿官方交互形态（role="separator" + aria-orientation="vertical" + 键盘可达，原型同型）；拖拽经 pointer 事件纯交互胶水，宽度值收敛为纯状态（可测函数面）。
- strip 分区建议形态：页签区 flex:1 + 收展钮尾部 flex:none（原型 rb-tail 同构位）；内衬值取官方行语言刻度（执行记录注记豁免）。
