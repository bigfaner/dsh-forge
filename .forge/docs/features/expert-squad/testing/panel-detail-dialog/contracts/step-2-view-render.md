---
journey: "panel-detail-dialog"
step: 2
action: "view-render"
title: "查看态分段渲染（meta → 简介 → 人设 Markdown → 工具 chips → 技能 chips）"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "详情 Dialog 查看态主体（.dswf-dlg-body）"
  dom: ".dswf-dlg-meta（岗位·启停/简介）/ .dswf-dlg-seg 段标 / .dswf-dlg-md（人设分块：.dswf-dlg-md-h 标题、strong 加粗、code 行内代码、ul/li 列表）/ .dswf-dlg-chips > .chip.tool（工具）与 .chip（技能）"
anchors_source: "ui-design.md F2 + detail-dialog.tsx PersonaMd / detail-logic.ts personaBlocks 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤2"
---

# Contract · step-2-view-render

## Outcome: success（五段查看态渲染）

### Preconditions
- fixture_spec：≥1 位启用专家，档案含非空 title/description/tools（≥1）/skills（≥1）与人设正文；其详情 Dialog 已打开（查看态）。

### Input
用户动作：浏览查看态主体（只读）。

### Output
自上而下：meta「<title> · 启用中」→ 段标「简介（何时委派我）」+ 简介文本 → 段标「人设（Persona · 派发时注入子会话）」+ 人设分块渲染 → 段标「工具白名单（子会话强制生效）」+ `.chip.tool` 工具 chips → 段标「技能标签」+ 技能 chips；frontmatter 技术细节不外露。

### State
查看态只读渲染 expert 切片，零请求零变更。

### Side-effect
none

### Invariants
- 分段次序恒定：工具白名单在上、技能标签在下（F2 统一排序）。

## Outcome: markdown-render（人设 Markdown 分块渲染）

### Preconditions
- fixture_spec：人设正文含四种记号——`## 标题`、`**加粗**`、`` `行内代码` ``、`- 列表项`（source: static——personaBlocks 分块语义）。

### Input
用户动作：查看人设段渲染结果。

### Output
`## ` 剥离为 `.dswf-dlg-md-h` 标题块；`**x**` 呈 `<strong>`；`` `x` `` 呈 `<code>`；`- x` 呈 `<ul><li>`；纯文本段呈 div；Markdown 记号字符（`#`/`**`/反引号/`- `）不外露。

### State
渲染为纯投影（personaBlocks 决策面），不改档案。

### Side-effect
none

### Invariants
- 未闭合定界符按纯文本呈现（不吞字、不崩渲染）。

## Outcome: disabled-meta（禁用态查看呈现）

### Preconditions
- fixture_spec：≥1 位禁用专家的详情 Dialog 已打开（查看态）。

### Input
用户动作：查看 meta 与底部。

### Output
meta 呈「<title> · 已禁用」；头部状态灯 `.dot.off`；底部钮 [启用]。

### State
expert.enabled=false 投影；零请求。

### Side-effect
none

### Invariants
- 查看态渲染永不发出启停/更新请求（只读投影）。

## Journey Invariants
- 查看态是 expert 快照的纯投影：渲染期间档案不变、请求零发。
