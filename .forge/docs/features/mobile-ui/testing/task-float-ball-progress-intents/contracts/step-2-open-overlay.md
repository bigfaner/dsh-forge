---
journey: "task-float-ball-progress-intents"
step: 2
action: "open-overlay"
title: "展开任务浮层信息面"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "任务浮层（主标题=提案名、副标题=slug）"
  endpoint: "POST /remote/__rpc forge:remote/progress（listTasks/taskStats 装配只读快照信封）"
anchors_source: "design/api-handbook.md §头部（forge:remote/progress）+ ui-functions F6"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/task-float-ball-progress-intents/journey.md 步骤2 + 边界4"
  - "source: inferred —— 单 run 时 chips 隐藏自「多 run 全貌由 chips 承载」不变式反演"
---

# Contract · step-2-open-overlay

## Outcome: success（浮层信息纪律）

### Preconditions
- fixture_spec：host 上提案驱动任务循环至少一个 run 运行中；任务卡含运行中与已完成两类。

### Input
用户动作：点悬浮球展开任务浮层。

### Output
浮层主标题=提案名、副标题=slug；运行中任务卡置顶、已完成折叠；状态徽标对齐桌面端状态集；无审批控件、无进度百分比。

### State
浮层 = progress 只读快照的投影。

### Side-effect
none（只读拉取）

### Invariants
- 任务浮层信息纪律：无审批、无进度百分比；状态集与桌面端对齐。

## Outcome: empty-overlay（无任何任务）

### Preconditions
- fixture_spec：host 无任务循环（progress 快照为空）。
- 分叉点：空态呈现。

### Input
用户动作：展开浮层。

### Output
浮层空态呈现，无骨架卡残留。

### State
空快照投影。

### Side-effect
none

### Invariants
- 空态零伪造：无骨架、无占位任务卡。

## Outcome: single-run-chips-hidden（单 run 时 chips 隐藏）

### Preconditions
- fixture_spec：仅一个 run 存在（无切换对象）。
- 分叉点：chips 退场（source: inferred —— 不变式「多 run 全貌由 chips 承载」的单 run 反演）。

### Input
用户动作：展开浮层查看顶部。

### Output
run 切换 chips 不渲染（无单元素冗余切换器）；其余信息面照常。

### State
chips 集合为空即隐藏。

### Side-effect
none

### Invariants
- chips 只承载「多 run 全貌」：单 run 零冗余控件。

## Journey Invariants
- 浮层是只读进度面：progress 快照投影 + 信息纪律（无审批/无百分比）。
