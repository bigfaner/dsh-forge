---
id: "fix-6"
title: "Fix: 侧栏项目区头部缺搜索钮（含过滤行）与视图选项（排列）钮——原型基准补齐 + PRD UF-1 Validation 落实"
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

# Fix: 侧栏项目区头部缺搜索钮（含过滤行）与视图选项（排列）钮

> 来源：走查人实机走查（2026-10-03）「左侧项目列表没有搜索和排列图标按钮」。核对原型与 PRD 后立案——**搜索为 PRD 在案项翻案**（2.7 记录曾注记出范围，走查裁决补齐），视图选项为原型基准占位件。

## Root Cause

原型项目区头部（[prototype/index.html:44-60](../../../docs/proposals/dsh-forge-redesign/prototype/index.html)）= 「项目」label + **搜索钮**（`pj-search-toggle` → 展开 `sb-searchrow` 过滤行「过滤项目名 / 会话标题…」）+ **视图选项钮**（`pj-view-menu`，占位形态 title「视图选项(原型:按项目树)」）+ ＋添加钮，四件并排。产品侧（[ForgeWorkspacePanel.tsx:216-223](../../../apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx)）只渲染了 label 与 ＋ 两件。PRD UF-1 Validation 明列「项目/会话搜索过滤（P1 最简：前缀/子串匹配）不改变选中态」——2.7 执行记录注记出范围，本任务落实翻案。

## Description

宽态项目区头部补两枚官方图标钮：①**搜索钮**——点击展开/收起过滤行（官方 Input，placeholder 对齐原型「过滤项目名 / 会话标题…」），过滤语义 = PRD 原文「P1 最简：前缀/子串匹配」作用于项目名 + 会话标题（纯函数面扩展 sidebar-model，客户端过滤——账本快照直读数据，原型同型）；②**视图选项（排列）钮**——P1 占位形态对齐原型（在场可点出菜单说明「按项目树」，实际排列选项归后续里程碑）。

## Reference Files

- docs/proposals/dsh-forge-redesign/prototype/index.html — 项目区头部四件结构（:44-60）
- docs/proposals/dsh-forge-redesign/prototype/styles.css — sb-head/sb-searchrow 形态（:570-579）
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx — 头部落点（:210-231，label + ＋ 之间补两钮）
- apps/web/src/views/sidebar/sidebar-model.ts — 过滤纯函数扩展面（buildSidebarTree 侧投影或独立 filter 谓词）
- apps/web/src/views/sidebar/sidebar.css — 头部行布局（actions 区间距对齐官方行语言）
- prd/prd-ui-functions.md — UF-1 Validation Rules（过滤不改变选中态）

## Acceptance Criteria

- [ ] 头部四件齐：label + 搜索钮 + 视图选项钮 + ＋（既有 `data-dswf-nav="add-project"` 锚不动）；官方图标（IconSearchOutlineRegular 同款检索图标；视图选项取官方件最近似图标或官方图标集内在场件）
- [ ] 搜索钮展开/收起过滤行（Esc/再点收起）；过滤即时生效：项目名 + 会话标题前缀/子串匹配，空串 = 不过滤
- [ ] **过滤不改变选中态**（PRD Validation 原文——过滤掉当前选中项不重置锚，清过滤即恢复可见）
- [ ] 过滤无结果 = 行内空提示（「无匹配项目/会话」）；骨架/错误/空态相位与过滤正交
- [ ] 视图选项钮在场占位（可点开菜单呈现「按项目树」当前项 + 后续里程碑说明；不做实际排列逻辑）
- [ ] 收起态 rail 不动（官方壳域——2.7 既有口径）；e2e 既有断言零褪色；新增过滤纯函数单测（含选中态不变断言）
- [ ] tsc + lint 全绿；dsw-raw 豁免注记同步执行记录

## User Stories

- Story 2（日常会话）：多项目/多会话时快速定位（PRD UF-1 Validation）。

## Hard Rules

- **dsh 底子**：图标钮 = 官方 Button（toolbar/sm）+ 官方图标件；输入 = 官方 Input；零自绘控件。
- **未点名元素保持不变**：项目块/会话行形态（DisclosureRow/StateDot）、知识库入口、设置行、rail 收起态。
- 过滤为客户端纯函数（快照数据源不变——SC2 直读纪律不破；不引入后端过滤通道）。
- 官方壳（ui-sidebar）承接域不动——本任务只动产品工作区面板内部。

## Implementation Notes

- 过滤谓词建议落 sidebar-model 纯函数（`sidebarFilterOf(query, tree)`）+ 单测；头部布局沿官方行语言刻度（参考 flow.css stepbar 同型 actions 排布）。
- 视图选项菜单可用官方 popover 模式（样式纪律：弹层对齐官方 popover）。
