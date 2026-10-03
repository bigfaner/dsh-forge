---
id: "fix-9"
title: "Fix: 中区会话面板顶部 toolbar 缺失——对齐 dsh 布局（官方 conversation.session.header 槽位 + 原型 conv-header 标题行）"
priority: "P1"
estimated_time: "3h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 中区会话面板顶部 toolbar 缺失——对齐 dsh 布局

> 来源：走查人实机走查（2026-10-03）「中间的对话面板上方要有 toolbar，即对齐 dsh 的布局」。

## Root Cause

原型会话面板头部（[prototype/index.html:103-125](../../../docs/proposals/dsh-forge-redesign/prototype/index.html)）为两行：**conv-title-row（会话位置面包屑 conv-crumbs + 动作区 conv-actions + utilities 图标簇 conv-utils——「📁▾ 在编辑器中打开」+ 面板钮 conv-corner 右栏收展）** + conv-tabs（三页签）。官方 dsh 骨架提供现成槽位体系（S2 清点 §槽面）：`conversation.header`/`header.leading`（常驻导航）+ **`conversation.session.header`（`.lineage` 血统/`.actions` 动作/`.utilities` 工具/`.corner` 角位五子槽）**。产品只实现了三页签行（SessionPanel SegmentedTabs = conv-tabs 同构）与角位钮（session zone 角位绝对定位），**整条标题行（toolbar）未实现**——官方 header 槽位未填，嵌入配方（conversation.content embedded）只携带转录+输入。

## Description

补齐中区会话面板顶部 toolbar，**dsh 底子 = 填官方 `conversation.session.header` 槽位**（不自绘平行 header 模式），对齐原型 conv-title-row 形态：

- **lineage（P1 最简）**：当前会话标题（官方账本数据直读）；原型 conv-crumbs 的 feature/会话位置面包屑归 M2（任务域）
- **actions（P1 空位）**：槽位保留，P1 无动作件
- **utilities**：两钮——①面板钮（右栏收展 toggle）：**现有 `.dswf-workbench-docktoggle` 角位钮迁入归位**（原型 conv-corner 同位同义，消除角位绝对定位的孤钮形态）；②「在编辑器中打开工作区」：P1 占位钮（title 注明；动作实现归后续里程碑——宿主 shell.openPath 能力面届时裁决）
- **hero 相位让位**：原型 `.conv-root[data-phase=hero] .conv-header { min-height: 0 }` 同语义（hero 相位头部让位空会话引导）
- **WCO 核查**：fix-2 标题栏 overlay 后 toolbar 右上件与原生控制钮区不重叠（中区 header 与右上角几何核查，参照 dock strip 的 env(titlebar-area-width) 避让先例——如无需避让则记录几何证据）

## Reference Files

- docs/proposals/dsh-forge-redesign/prototype/index.html — conv-header 结构（:103-125）
- docs/proposals/dsh-forge-redesign/prototype/styles.css — conv-header/conv-title-row/conv-utils 刻度（:627-662 邻域）
- docs/features/dsh-forge-p1-mvp/spikes/s2-web-shell-inventory.md — 官方 header 槽位清点（:90-101）
- apps/web/src/views/session/SessionPanel.tsx — 页签行现状（toolbar 插入位：tabs 行之上）
- apps/web/src/workbench/ChatSurface.tsx — 官方嵌入配方（header 槽位接线核查面）
- apps/web/src/workbench/WorkbenchPanel.tsx — 角位钮现状（:173-180 迁移源）
- e2e/specs/smoke-skeleton.spec.ts — L45 三页签断言（回归面）

## Acceptance Criteria

- [ ] 会话面板顶部 toolbar 在场：会话标题（账本直读，无会话 = 空位）+ utilities 两钮（面板 toggle 实功能 + 编辑器打开占位）；形态对齐官方行语言（内衬/高度/图标钮刻度），经官方 session.header 槽位或官方件组合承载（零自绘平行 header）
- [ ] 面板钮迁移后收展语义不变（toggle-right-dock 同径）；原角位绝对定位钮退役
- [ ] hero 相位 toolbar 让位（不与空会话引导争位）；session/hero 两相位走查目视确认
- [ ] 三页签行/keep-alive/召回 tab 机制零变化（L45 断言不褪色）；UF-5 视图互换回归（知识模式下 session 面板隐藏语义不变）
- [ ] WCO 避让核查结论入执行记录（几何证据）
- [ ] tsc + lint + 定向单测绿；dsw-raw 豁免注记同步

## User Stories

- Story 2（日常会话）：会话面板布局对齐 dsh 桌面形态（标题可读 + 工具钮就位）。

## Hard Rules

- **dsh 底子**：优先官方槽位/官方件组合（Button toolbar/sm + 官方图标）；不自绘平行 header 模式、不发明新行语言。
- **未点名元素保持不变**：三页签形态、对话面嵌入配方、轨迹/召回 tab、hero 相位语义、右栏机制。
- 会话标题零缓存直读（SC2）；utilities 动作钮 P1 仅面板 toggle 实功能。

## Implementation Notes

- 官方 header 槽位填充路径参照 ChatSurface 的 renderFactorySlot 消费切片（若 embedded 配方不透出 header 槽位，则以官方件组合在 SessionPanel 内组装——两种路径执行时以 S2 槽面清点为准裁决并记录）。
- 标题数据源 = 官方 sessions 账本（sidebar-model 会话头同源字段）。
