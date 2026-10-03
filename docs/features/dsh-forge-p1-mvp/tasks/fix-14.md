---
id: "fix-14"
title: "Fix: 段一目录选取复用系统文件选择器——直用官方 __DSH_DIRECTORY_PICKER__ preload 桥契约（参考 dsh 原生优先哲学），内嵌浏览器降为回退面"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 段一目录选取复用系统文件选择器（官方桥契约直用）

> 来源：走查人裁决（2026-10-03）「文件浏览器要方便切换盘符，交互参考系统文件浏览器」→ 追问「能不能复用系统的文件浏览器？参考 dsh」→ 勘面确认官方有现成机制 → 立案。

## 背景与官方机制（勘面实锤）

官方 `dsh-client-ui-directory-picker-native/lib/client.js:62-76`：优先取 `globalThis.__DSH_DIRECTORY_PICKER__`（Electron 桌面 preload 桥，`pick(): Promise<string|null>` = 选中绝对路径/取消）→ 系统对话框；桥缺席回退 `ctx.uiWorkspace.pickDirectory()`（Web 宿主 chooser）；同一对槽位另有 `-browse` 应用内浏览面可互换 —— **「系统原生优先、应用内浏览兜底」是 dsh 既定组合哲学**。dsh-forge 为桌面本地应用（原生优先适用面），自研内嵌浏览器切盘不便（走查人反馈）。

## Description

**桥契约直接复用（同形零 fork），四件：**

1. **宿主桥**：产品 preload 暴露 `window.__DSH_DIRECTORY_PICKER__ = { pick }`（与官方契约同形）+ main 进程处理器 `dialog.showOpenDialog({ properties: ['openDirectory'] })`（单选目录；取消 = null；不可达路径走错误面）。91 行纪律注记：若 main.ts 超行，桥/dialog 处理器拆独立模块（window/ 或 boot/ 域）。
2. **段一重构**：内嵌浏览器相位 →「选择工作区目录」按钮（主路径 = 系统对话框：盘符/快速访问/网络位置全 OS 原生）——选中回填进入表单相位（对账 canonical 路径沿现有 applyListing 口径）；取消停留当前相位零副作用；**桥缺席（非 Electron 载体/单测）= 回退现内嵌浏览器**（形态零变化，官方 -browse 双面同型）。
3. **表单「浏览…」改选同桥**：forge/knowledge/workspace 三 target 同桥复用；回退 BrowsePanel 不变。
4. **已注册标记口径迁移**：系统对话框无法显示「已注册」标记 → ownership 预检可视化在**表单相位补挂接提示**（挂接/新建语义已在注册链计算，表单呈现补一条已注册提示）；浏览器回退面保留原「已注册」标记与 smoke L766 断言；PRD UF-3 AC 加走查裁决注记（pick 时可视化 → 表单时提示，回退面原语义）。

## Reference Files

- 官方（只读参照 + 契约 pin 源）：`dsh-client-ui-directory-picker-native/lib/client.js:62-76`（桥优先序）+ README（双面哲学/本地载体适用面/Linux 限制）；`dsh-client-ui-directory-picker-browse`（回退面同型先例）
- 产品宿主：apps/host/src/window/（preload 桥落点）、apps/host/src/main.ts（dialog 处理器；91 行纪律）
- 产品流程：apps/web/src/flows/add-project/（AddProjectFlow 相位机 / flow-model 段一重构 / dir-source 回退数据源 / DirectoryBrowser 回退面）
- 口径面：prd/prd-ui-functions.md UF-3（已注册标记 AC 注记）；e2e/specs/smoke-skeleton.spec.ts L766（断言归回退面）
- 关联在途：fix-13（同流程文件，时序协作）；fix-7（模态裁切——回退浏览器与 BrowsePanel 仍用，**不因本任务豁免**）

## Acceptance Criteria

- [ ] 桥在场：段一 =「选择工作区目录」按钮 → 系统 OS 目录对话框；选中回填进表单（canonical 对账）；取消停留零副作用；OS 对话框内盘符/快速访问原生可用（走查人实机确认）
- [ ] 桥缺席：回退现内嵌浏览器（形态/交互/已注册标记零变化），既有 e2e 向导组断言零褪色
- [ ] 表单「浏览…」三 target 同桥复用 + 回退不变
- [ ] 已注册口径：表单相位已注册目录呈现挂接提示；回退面 L766 断言不弱化；PRD UF-3 注记落档
- [ ] 桥契约 pin：`__DSH_DIRECTORY_PICKER__` 形状与 pick 语义单测（防官方漂移，对照 client.js 源）；OS 对话框不可 e2e —— 桥 mock 单测 + 回退面 e2e 承担回归
- [ ] tsc + lint + 定向单测绿

## User Stories

- Story 1（两段式注册）：选目录用系统熟悉交互（盘符/快速访问），少滚动少迷路。

## Hard Rules

- **dsh 底子**：桥名/形状/语义与官方逐字同形（不自创 API）；未点名元素不变（表单相位全部、取消点语义、四步补偿链、模态壳）。
- 官方件复用；上游 pin 不动。
- 回退浏览器不删除不降质（-browse 双面哲学的产品侧对应）。

## Implementation Notes

- 不必挂官方 picker-native 插件行（其占官方 workspace 流槽位 `conversation.hero.workspace.directoryFlow`/`sidebar.workspaces.directoryFlow`，与本产品流程对话不同）——直用桥契约；若未来官方 hero/sidebar workspace 流在场可评估挂行（注记）。
- Windows P1 单平台口径；官方 Linux 无 zenity 时回退 browse 的限制注记在案（本产品恒为 Electron 本地，桥恒在，回退面为防御 + 测试面）。
- 段一按钮化的相位机改动：flow-model 增「native-pick 在途」态（防双击双开对话框）；执行记录附相位图。
