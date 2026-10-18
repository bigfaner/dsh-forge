---
journey: "ask-paged-three-question-types"
step: 3
action: "next-multi"
title: "翻页到多选题"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/ask（第 2 题 · 多选）"
anchors_source: "proposal.md 交互契约 + ui-functions F2"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤3 + 边界2"
---

# Contract · step-3-next-multi

## Outcome: success（checkbox 任意组合）

### Preconditions
- fixture_spec：第 1 题已作答；第 2 题为多选题（multiSelect=true）。

### Input
用户动作：点「下一个」翻到第 2 题；勾选/取消多个选项。

### Output
方框 checkbox 呈现；可任意勾选/取消多个选项组合，已勾选项互不影响。

### State
当前题索引=1；作答缓冲保留第 1 题答案。

### Side-effect
none（翻页不产生任何提交）

### Invariants
- 翻页不丢不重：已答题保留；任何翻页动作都不发 interaction.answer。

## Outcome: uncheck-combo（取消已勾选项）

### Preconditions
- fixture_spec：多选题已有勾选组合。
- 分叉点：取消勾选至空集。

### Input
用户动作：点已勾选项取消；或全取消。

### Output
点已勾选项即取消，其余勾选不变；全取消后 selected 为空仍可翻页，提交前由用户决定。

### State
selected 缓冲同步缩减；空集合法。

### Side-effect
none

### Invariants
- 面板侧无未答阻塞提示（host 侧决定后续）。

## Journey Invariants
- 多选永远方框 checkbox 任意组合；selected 数组与勾选态一一对应。
