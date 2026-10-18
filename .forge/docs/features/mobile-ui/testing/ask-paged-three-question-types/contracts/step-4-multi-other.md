---
journey: "ask-paged-three-question-types"
step: 4
action: "multi-other"
title: "多选题 other 与选项并存"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/ask（第 2 题 · 多选 + other）"
anchors_source: "proposal.md 交互契约 + ui-functions F2"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤4 + 边界3/4"
---

# Contract · step-4-multi-other

## Outcome: success（other 与勾选并存）

### Preconditions
- fixture_spec：多选题带 other 自由文本域；用户先有任意勾选。

### Input
用户动作：在 other 域输入值。

### Output
输入值表示额外选中 other（出现 other 选中态），不影响已勾选的其它选项（selected 含选项 label、custom 含文本并存）。

### State
作答缓冲 selected+custom 同时在位。

### Side-effect
none

### Invariants
- 载荷形状（selected 数组 + custom）与 UI 选中态一一对应。

## Outcome: recommended-badge（recommended 选项徽标）

### Preconditions
- fixture_spec：选项含 `recommended:true`。
- 分叉点：推荐徽标呈现。

### Input
用户动作：查看并点选 recommended 选项。

### Output
该选项呈现推荐徽标，但不自动选中；点击行为与普通选项一致。

### State
selected 是否含该选项完全由用户点击决定。

### Side-effect
none

### Invariants
- 徽标是纯呈现语义，零自动选择副作用。

## Outcome: clear-other（清空 other 取消选中）

### Preconditions
- fixture_spec：other 已输入且呈选中态。
- 分叉点：清空输入。

### Input
用户动作：清空 other 输入域。

### Output
清空 = 取消 other 选中；已勾选项不受影响。

### State
custom 缓冲清空，selected 保留勾选组合。

### Side-effect
none

### Invariants
- other 选中态与输入值严格联动（有值即选中、清空即取消）。

## Journey Invariants
- 作答状态局部性：所有作答只进面板缓冲，直到最终提交。
