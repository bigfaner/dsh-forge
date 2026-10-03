---
id: "fix-10"
title: "Fix: dock 全面对齐 dsh——官方 ui-dockkit 基座替换自研轨道（DockSurface/Controller/FloatLayer）+ dsh-forge 内容叠加"
priority: "P1"
estimated_time: "6h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: dock 全面对齐 dsh——官方 ui-dockkit 基座替换自研轨道 + dsh-forge 内容叠加

> 来源：走查人裁决（2026-10-03）「dockkit 要完全对齐 dsh，在官方的基础上添加 dsh-forge 的内容」。
> **取代 fix-4 的自研轨道路线**（fix-4 记录保留为过程资产；其视觉目标——chips 页签条/调宽/内衬——由官方件原生达成）；**fix-8②（手柄键盘步进）随基座替换自然 moot**（官方引擎自有键盘/手势面）。

## Root Cause（架构层）

P1 机制最简版决策（2.5：dockkit「2.6+ 消费」推迟）下，右栏 = 自研轨道（自拼 SegmentedTabs strip + 自制调宽手柄 + 自管 body）。走查人裁决提前全面对齐：**官方 `@deepseek-ai/dsh-client-ui-dockkit`（0.2.0-rc.2，零 cordis 静态库）为基座整体替换**，dsh-forge 只做内容叠加。

## 官方基座面（已勘明，S2 §2.5 + 本次契约细读）

| 官方件 | 职责 | dsh-forge 叠加面 |
|---|---|---|
| `DockController`（+Options/DockSnapshot）+ `applyOp`/`replay`/`History` | 布局状态与可逆操作引擎 | 产品持有；页签集变更（跟随项目）经其操作面驱动 |
| `createInitialState(minter, makeInitialTab?, mode?)` | **collapsed 初始态**（单 docked pane + 初始 tab；「展开/收起不累积副本」官方语义） | `makeInitialTab` = 「开始」全局页签（M0 占位内容的 kind） |
| `DockSurface` / `DockLayout`（`DockSurfaceProps`） | chips 页签条 + 分栏（split）+ 拖放停靠（dropZones）+ 添加/关闭控件 + `chrome`（**面级控件，官方置于右上 pane 条尾**） | `renderTab` 按 `tab.kind` 分发内容（P1：`start`；M2+：知识文档/概览）；`chrome` = 右栏收展钮（原 toggle 语义迁移）；`canSplit`/`canAddTab`/`canCloseTab` 按产品口径供给 |
| `FloatLayer` | 浮动面板（拖出/回坞/dockFloat/closeFloat） | 随基座原生获得 |
| `DockLabels` / `TabRenderer` / `TabMenuExtras`（契约） | kit 渲染的全部文案（含可访问名）/ 页签体渲染 / 右键菜单扩展 | 文案全中文化；菜单扩展 P1 可空 |

## Description

右栏 dock 容器内部整体替换为官方面：`createInitialState`（collapsed + 「开始」初始 tab）→ `DockController` 持有 → `DockSurface`（或 `DockLayout`——按 kit README 对横条形右栏的推荐形态裁决）渲染，`FloatLayer` 承浮动。产品保留**容器级语义**：UF-7 三态联动（collapsed/expanded 由官方 mode 承载——映射 `rightDock` 视图态；知识视图强制隐藏 = 容器外层归零，官方 surface 不感知）、页签跟随项目（`visibleDockTabs` 过滤 → controller 操作面同步页签集）、WCO 避让（沿 fix-4 的 env(titlebar-area-width) 先例——若官方 strip 自带避让则记录豁免证据）。

## Reference Files

- docs/features/dsh-forge-p1-mvp/spikes/s2-web-shell-inventory.md — §2.5 基座勘面（:152-159）
- 官方包（执行前必读）：`@deepseek-ai/dsh-client-ui-dockkit` lib/types——contract/adapter.ts（DockIntents/DockLabels/TabRenderer/TabMenuExtras）、contract/types.ts（LayoutState/TabRecord/DockMode）、engine/initial.ts、engine/controller.ts、components/DockSurface.tsx、TabLayout/TabPanel/FloatLayer、**README**（splitPaneNarrow 等语义源）
- apps/web/src/zones/WorkbenchZones.tsx + zones.css + dock.ts + dock-width.ts — 被替换面（自研 strip/手柄/宽度态退役；`visibleDockTabs`/`resolveActiveDockTab` 纯函数保留复用或随迁移改写，语义不丢）
- apps/web/src/shell/view-state.ts — 三态/跟随语义（零改动目标；官方 mode 与 rightDock 的映射层归 zones）
- e2e/specs/smoke-skeleton.spec.ts — L46/L59/L62/L66/L689 dock 断言（锚迁移：官方 DOM 形态下重定位，语义不弱化；SMOKE-LEDGER 台账同步）
- tests/structure/web-shell.test.ts — 结构 pin 同步

## Acceptance Criteria

- [ ] 右栏内部 = 官方面：chips 页签条、分栏控件、拖放停靠、浮动面板、添加/关闭控件全部官方原生（**零自绘 strip/手柄/页签条**退役）
- [ ] 初始态 = collapsed + 「开始」全局页签（官方 mode 语义）；展开/收起经官方面，轨道归零语义保持（e2e computed 断言迁移后等价绿）
- [ ] UF-5/UF-7 联动不褪色：知识视图强制隐藏 + 切回恢复原态；页签跟随项目（可见集 = 当前项目 + 全局；全局页签不可关闭——`canCloseTab` 口径）
- [ ] dsh-forge 内容叠加：`renderTab` 按 kind 分发（P1：`start` 占位内容迁移）；labels 全中文化（含可访问名）
- [ ] chrome 角位 = 右栏收展钮（语义与现有 toggle 同径）；WCO 避让结论入执行记录
- [ ] 既有 e2e/结构 pin 迁移不弱化（SMOKE-LEDGER 记账）；新增 dock 基座行为回归（分栏/浮动冒烟面——P1 至少官方控件在场与默认形态断言）
- [ ] tsc + lint + 定向单测绿；退役代码（dock-width 手柄路径等）清理或标注

## User Stories

- Story 2（日常会话）：右栏与 dsh 桌面同形态同手感（chips/分栏/浮动），dsh-forge 内容无缝承载。

## Hard Rules

- **官方基座唯一**：布局/页签条/手势/浮动全部官方面；产品零平行实现（样式纪律第 1/2 条的布局引擎版）。
- **UF-7 机制语义零变化**：三态/跟随/强制隐藏——映射层实现，不动 view-state 语义。
- 未点名元素保持不变：dock 外的 zones 结构、知识视图、会话面板。
- 依赖铁律：web 引 dockkit 走既有官方件依赖口径（S2 静态装配线；版本 pin 0.2.0-rc.2 不升级）。

## Implementation Notes

- 执行首步读 kit README 与 controller/options（splitPaneNarrow、TabRetention、pane budget 语义）；`DockLayout`（横条 Sidebar 形态 + TabRetention 懒保留）vs `DockSurface`（递归 docked）按 README 推荐裁决并记录。
- 页签跟随项目的驱动路径：官方 `placeTab`/`closeTab` intents 经产品页签集变更触发（visibleDockTabs 语义保持）——迁移期保留纯函数单测（语义锚）。
- fix-4 的 `--dswf-dock-width` 内联注入若与官方 mode 冲突，以官方 collapsed/expanded 呈现为准，容器宽度态退役（执行记录注记）。
- 预读风险：官方 kit 若假设全宽工作区（非右栏窄轨），dropZones/分栏在 340px 窄轨的可用性——README `minPaneFraction` 与 hideSplitWhenBlocked 面向；若窄轨分栏不可用则 P1 `canSplit=false`（记录裁决，分栏随轨道加宽开放）。
