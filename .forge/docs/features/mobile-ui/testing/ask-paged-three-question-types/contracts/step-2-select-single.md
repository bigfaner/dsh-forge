---
journey: "ask-paged-three-question-types"
step: 2
action: "select-single"
title: "单选题点选"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/ask（第 1 题 · 单选）"
anchors_source: "proposal.md 交互契约 + ui-functions F2（官方 renderQuestionComposer 形状 R9#2）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤2 + 边界1"
---

# Contract · step-2-select-single

## Outcome: success（radio 单选唯一）

### Preconditions
- fixture_spec：当前题为单选题（multiSelect 缺省），含 ≥2 个选项。

### Input
用户动作：点选某一选项；再点另一选项。

### Output
点选即时呈选中态（圆形 radio），无需二次确认；点另一选项即改选，选中态唯一。

### State
作答缓冲 = 该题 selected（单元素）。

### Side-effect
none

### Invariants
- 题型判别唯一依据 = multiSelect：单选永远圆形 radio 单选中。

## Outcome: single-with-other（单选带 other 输入域）

### Preconditions
- fixture_spec：单选题附带 customAnswer 域。
- 分叉点：other 输入即选中语义。

### Input
用户动作：在 other 自由文本域输入值；或改选其它选项。

### Output
输入值即表示选中 other（radio 落在 other 上）；改选其它选项时 other 输入保留为 custom 载荷候选，可再改回。

### State
作答缓冲 selected/custom 联动更新。

### Side-effect
none

### Invariants
- UI 形态与载荷形状（selected 数组 + custom）一一对应。

## Journey Invariants
- 对齐官方交互词汇：previous/skip/continue 按钮族与选中态配方全站统一。
