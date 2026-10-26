---
journey: "panel-detail-dialog"
step: 6
action: "close-restore"
title: "三关闭路径（✕/Esc/遮罩）与列表恢复"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "详情 Dialog 覆盖层关闭交互"
  dom: "[✕]（button[aria-label=关闭]）/ Esc keydown（document 级）/ .dswf-dlg-overlay 点击（.dswf-dlg 内部 stopPropagation）→ overlay 退场；面板 .dswf-card-grid 恢复可见"
anchors_source: "ui-design.md F2 + detail-dialog.tsx close 缝（Esc listener/overlay onClick/✕ onClick）事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤6 + 边界6"
---

# Contract · step-6-close-restore

## Outcome: close-x（✕ 关闭恢复列表）

### Preconditions
- fixture_spec：≥1 位专家的详情 Dialog 已打开（查看态）；背后列表呈数据态。

### Input
用户动作：点头部 ✕（aria-label=关闭）。

### Output
Dialog 覆盖层退场（overlay count=0）；面板卡片网格完整在场（列表状态保留——过滤/计数不重置）。

### State
DetailState 置关闭（state=undefined，回引用稳定单例快照）；列表控制器不变。

### Side-effect
none

### Invariants
- 关闭零请求零变更：任何关闭路径都不触发 update/enable/disable。

## Outcome: close-esc（Esc 关闭——编辑态草稿丢弃）

### Preconditions
- fixture_spec：编辑态在场且草稿已修改。

### Input
用户动作：按 Esc 键。

### Output
Dialog 退场；未保存修改被丢弃；重开同专家呈档案现值（查看态）。

### State
state 置 undefined（草稿随闭丢弃）。

### Side-effect
none

### Invariants
- 编辑态 Esc 不经确认直接关闭且零落盘（关闭语义三路径等价）。

## Outcome: close-overlay（遮罩点击关闭；内部点击不误关）

### Preconditions
- fixture_spec：查看态 Dialog 打开。

### Input
用户动作：点击 Dialog 外遮罩区（.dswf-dlg-overlay 空白处）；对照：点击 Dialog 主体内部。

### Output
遮罩点击关闭 Dialog；Dialog 内部点击被 stopPropagation 吞掉（不关闭、不误触）。

### State
遮罩关闭 → state=undefined；内部点击 → 状态不变。

### Side-effect
none

### Invariants
- 关闭热区边界精确：仅遮罩层可点关，Dialog 内容区交互零误关。

## Journey Invariants
- 三关闭路径（✕/Esc/遮罩）语义等价：退场 + 草稿丢弃 + 列表原状恢复；关闭态快照引用稳定（fix-4 契约）。
