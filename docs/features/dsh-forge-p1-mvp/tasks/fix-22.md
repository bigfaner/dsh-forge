---
id: "fix-22"
title: "Fix: 侧栏过滤输入框失焦不收起——补 blur 自动收起（用户预期规格：失焦后自动收起，与 Esc 同径「收起即清空」），含头部钮 blur 竞态守卫"
priority: "P1"
estimated_time: "1h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 侧栏过滤行失焦自动收起（规格补齐）

> 来源：走查人实机（2026-10-04）「搜索输入框失焦后自动消失」＋澄清「**预期：失焦后自动收起**」。探针实证当前行为＝失焦**不**收起（过滤行常驻、过滤保持生效）——非偶然 bug，是缺失的交互规格。

## 现状（tmp-ui-review/fix21-probe.mjs B 轮实证）

[SidebarFilterRow](../../../apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx:186-206)：官方 Input `autoFocus`，仅有 `onKeyDown Escape → onCollapse`；面板态机 `searchOpen`（:414-421）只受搜索钮 toggle 与 Esc 控制。

探针（B2）：输入 `fix21` 过滤生效（1 项目）→ 点击旁侧空白 blur（activeElement=BODY）→ 过滤行**仍在**、面板无重挂（标记存活）、过滤仍生效。

## Description

**blur → 自动收起**（与 Esc 同缝 `onCollapse`，收起即清空查询——现行原型 S.pj 语义保持）：

- `SidebarFilterRow` 官方 Input 增加 `onBlur` → `onCollapse()`（需确认官方 Input 透传 onBlur；不透传则挂 wrapper div 的 focusout）；
- **头部钮 blur 竞态守卫（本任务核心坑）**：行展开时点搜索钮（收起意图）/视图选项钮/「＋」——mousedown 先触发 input blur → 收起+清空 → 随后 click 到达 toggle 再翻转 `searchOpen` → **行意外重开**。守卫口径（推荐 a）：
  a. `onBlur` 判 `event.relatedTarget`：焦点移入 `.dswf-sidebar-sectionhead`（三钮容器）内则**不收起**（头部交互不灭活搜索态）；移出（含 BODY/null，如点击树行/空白/其他区域）才收起；
  b. 或搜索钮 `onMouseDown={(e) => e.preventDefault()}`（焦点不离 input，无 blur）——仅解 toggle 自身，视图选项/＋ 仍触发收起，交互不一致，不推荐；
- 收起语义零变化：`onSearchToggle` 收起即清空 query（现行代码已是）——blur 收起复用同缝，过滤结果随收起还原全树；
- 「过滤中点击会话行」：blur 收起+清空 + 会话导航并发——接受（搜索为瞬时交互，导航即离开搜索语境）；
- 原型对照说明：原型 app.js 本无 blur 收起（仅 toggle:1843 + Esc:2400）——本条为**走查人规格演进**（超原型），任务即规格源。

## 验收

1. 点搜索钮 → 行展开聚焦；点空白/树行/其他区域 → 行收起且查询清空（树还原）；
2. 行展开时点视图选项钮/「＋」→ 行**不**收起（头部交互保持搜索态）；点搜索钮 → 正常收起（无双翻转、无重开抖动）；
3. Esc 语义不变（收起+清空）；
4. 单测：ForgeWorkspacePanel.test.tsx 补 blur 收起 + relatedTarget 守卫分支（renderToStaticMarkup 面 + 态机行为面照 fix-6 形制）。

## 探针/证据

- tmp-ui-review/fix21-probe.mjs（B1/B2 轮：现状不收起 + 无重挂——排除状态丢失假象）；截图 fix21-B1-filtered.png / fix21-B2-after-blur.png。
