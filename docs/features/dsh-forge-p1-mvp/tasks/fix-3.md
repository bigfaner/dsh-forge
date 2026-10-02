---
id: "fix-3"
title: "Fix: 添加项目·段一文件浏览器放大（模态加宽 680 + 列表增高 min(50vh,480)，仅动浏览器相位）"
priority: "P2"
estimated_time: "30min"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 添加项目·段一文件浏览器放大（模态加宽 680 + 列表增高 min(50vh,480)，仅动浏览器相位）

> 来源：UI 走查第 1 轮（[reports/ui-walkthrough-round1.md](../reports/ui-walkthrough-round1.md) §2.2）。走查人实机反馈「添加项目的文件浏览器不够大」。

## Root Cause

刻度上不小于原型（模态 560 > 原型 520；列表 256 = 原型 256），但观感偏小：官方 Modal 头部/内衬占高、列表定高 256px 在 900px 窗口占比低、模态垂直居中四周留白多。属**有意超出原型的体验改进**，非对齐偏差。

## Description

仅放大段一·文件浏览器相位的两个尺寸：模态内容区宽度 560 → **680px**（`max-width: 90vw` 上限保持），目录列表高 256 → **min(50vh, 480px)**。骨架行 / 空态 / 错误条 / 底部提示随新尺寸自适应。

## Reference Files

- apps/web/src/flows/add-project/flow.css — `.dswf-ap-modal` 宽度口径（:9-14）
- apps/web/src/flows/add-project/browser.css — `.dswf-fb-list` 高度刻度（:74-86）
- docs/proposals/dsh-forge-redesign/prototype/styles.css — 原型 dialog 520 / fb-list 256 基准（:1064-1110，超越依据）
- docs/features/dsh-forge-p1-mvp/reports/shots/p2-addproject-browser.png — 走查截图

## Acceptance Criteria

- [ ] 模态内容区 680px / 90vw 上限；列表高 min(50vh, 480px)（走查人现场可微调拍板，AC 以执行记录终值为准）
- [ ] **仅动浏览器相位**：段二表单模态宽度、字段排布、按钮区全部保持现状；浏览器内件（面包屑/行高 32/已注册标记/骨架行）形态不变
- [ ] 既有 e2e 断言零改动零褪色（smoke-skeleton 组二/组三选择器与语义锚不动）
- [ ] token lint 绿（新增/改动尺寸属布局刻度，dsw-raw 豁免注记同步执行记录——flow.css/browser.css 既有口径）

## User Stories

- Story 1（两段式注册）：第一段选目录时浏览面积充足，减少滚动。

## Hard Rules

- **未点名元素保持不变**：本任务只改 `.dswf-ap-modal` 宽度与 `.dswf-fb-list` 高度两个刻度（+ 若需要的高度最小值下限），其余一律不动。
- 表单相位（段二）尺寸不在本任务面。

## Implementation Notes

- 模态宽度经官方 Modal `contentClassName` 挂点（既有机制）；执行时核实 `dswf-ap-modal` 是否两相位共用——共用则拆分 browser/form 两宽度口径（form 保持 560 不变）。
