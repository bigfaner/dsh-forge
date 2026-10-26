---
journey: "panel-detail-dialog"
step: 1
action: "open-dialog"
title: "点击卡片激活详情 Dialog（查看态头部）"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "面板卡片网格 → 详情 Dialog 覆盖层"
  dom: ".dswf-xcard[data-expert-key=<name>][role=button] 点击 → .dswf-dlg-overlay[data-dswf-detail-dialog] > .dswf-dlg[role=dialog][aria-label='专家详情 <name>'] / .dswf-dlg-head（.dot.on + .dswf-dlg-name + .chip.tool 标识 chip + [编辑][✕]）"
anchors_source: "ui-design.md F2 + detail-dialog.tsx / expert-panel.tsx onCardActivate 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤1 + 边界5"
---

# Contract · step-1-open-dialog

## Outcome: success（启用专家打开查看态）

### Preconditions
- fixture_spec：目录含 ≥1 位启用专家（frontmatter：name/title/description/tools/skills + 人设正文）；面板已激活呈数据态。

### Input
用户动作：点击该启用专家卡片（`.dswf-xcard`）。

### Output
详情 Dialog 打开（查看态）：`.dswf-dlg-overlay[data-dswf-detail-dialog]` 呈现，`role=dialog` `aria-label="专家详情 <name>"`；头部含状态灯 `.dot.on`、名称 `.dswf-dlg-name` ← name、英文标识 chip `.chip.tool` ← name（等宽）、[编辑] ghost 钮、✕ 钮（aria-label=关闭）。

### State
DetailState.open=true、mode=view；expert = 列表条目切片；背后卡片网格仍在场。

### Side-effect
none

### Invariants
- 打开即查看态；再次点击其它卡片重置回查看态新快照（不残留上次编辑态）。

## Outcome: disabled-expert（禁用专家打开详情）

### Preconditions
- fixture_spec：目录含 ≥1 位经禁用通道（POST /api/expert-squad/disable）禁用的专家；面板全量视图（includeDisabled=true）呈其降透明卡。

### Input
用户动作：点击该禁用专家卡片。

### Output
Dialog 打开：状态灯 `.dot.off`、meta 呈「<岗位> · 已禁用」、底部钮呈 [启用]（非 [禁用]）；头部结构与启用态同形。

### State
open=true、mode=view、expert.enabled=false；列表条集不变。

### Side-effect
none

### Invariants
- 禁用态档案可查看可再编辑（信息不消失，档案可随时重新启用）。

## Outcome: no-dialog-for-missed-key（激活键不在列表——推断）

### Preconditions
- fixture_spec：面板数据态在场（source: inferred——卡片激活回调以 name 键查列表，键缺席时 open 不触发；真机由过滤态后点击防护）。

### Input
用户动作：以不在当前列表条集中的键触发激活回调。

### Output
Dialog 不打开（overlay 缺席），面板保持现状，零报错。

### State
DetailState 维持关闭态（引用稳定单例快照）。

### Side-effect
none

### Invariants
- 关闭态快照引用恒稳定（useSyncExternalStore 契约——新字面量即无限重渲染，fix-4 判例）。

## Journey Invariants
- Dialog 打开永远源于列表内现存专家（键查命中）；打开不改动列表与档案。
