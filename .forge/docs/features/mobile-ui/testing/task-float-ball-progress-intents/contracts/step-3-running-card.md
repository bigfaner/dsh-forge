---
journey: "task-float-ball-progress-intents"
step: 3
action: "running-card"
title: "查看运行中任务卡"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "任务浮层运行中任务卡"
anchors_source: "ui-functions F6 + api-handbook §1.0（暂停/派发 = 指令面非专用通道）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/task-float-ball-progress-intents/journey.md 步骤3"
---

# Contract · step-3-running-card

## Outcome: success（暂停钮 + 派发入口）

### Preconditions
- fixture_spec：浮层展开且存在运行中任务卡（置顶位）。

### Input
用户动作：查看运行中任务卡。

### Output
卡片显示暂停按钮；底部统一派发入口可见。

### State
意图控件在位（数据新鲜、非 stale）。

### Side-effect
none

### Invariants
- 意图控件只在数据新鲜时可用（stale 置灰由 step-4 承接）。

## Journey Invariants
- 运行中卡是意图转发面的入口呈现；信息纪律（无审批/无百分比）对卡片同样成立。
