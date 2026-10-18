---
journey: "ask-paged-three-question-types"
step: 5
action: "prev-review"
title: "回看上一题答案保留"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/ask（翻页导航）"
anchors_source: "proposal.md 交互契约（previous/continue 按钮族）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤5 + 边界5"
---

# Contract · step-5-prev-review

## Outcome: success（回翻不丢答案）

### Preconditions
- fixture_spec：第 1、2 题均已作答（单选 + 多选/other）。

### Input
用户动作：点「上一个」回看第 1 题，再点「下一个」返回。

### Output
第 1 题已选状态保留；第 2 题勾选与 other 输入同样保留。

### State
当前题索引随导航变化；作答缓冲全程不变。

### Side-effect
none

### Invariants
- 翻页不丢不重；序号/总数与实际题集一致。

## Outcome: navigation-no-submit（翻页不提交中间态）

### Preconditions
- fixture_spec：用户在上一个/下一个间任意往返。
- 分叉点：监听 interaction.answer 通道流量。

### Input
用户动作：往返翻页。

### Output
任何翻页动作都不发 interaction.answer；仅最终「提交」发出一次完整载荷。

### State
宿主 pending 状态全程不变。

### Side-effect
none（零转发）

### Invariants
- 提交语义 = 意图转发且一次性：翻页零请求。

## Journey Invariants
- 作答状态局部性 + 翻页零提交是面板导航的双重不变式。
