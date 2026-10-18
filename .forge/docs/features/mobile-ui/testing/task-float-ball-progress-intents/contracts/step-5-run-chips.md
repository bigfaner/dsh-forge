---
journey: "task-float-ball-progress-intents"
step: 5
action: "run-chips"
title: "多 run 切换与悬浮球反映对象"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:remote/progress（listTasks/taskStats 快照，多 run 集合源）"
anchors_source: "design/api-handbook.md §头部（forge:remote/progress）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/task-float-ball-progress-intents/journey.md 步骤5 + 边界3"
  - "source: inferred —— 回执实时更新分支自「徽标随回执更新」语义在浏览态的延伸"
---

# Contract · step-5-run-chips

## Outcome: success（chips 切换 + 悬浮球反映最近 running）

### Preconditions
- fixture_spec：host 上存在 ≥2 个 run，其中多个运行中。

### Input
用户动作：浮层顶部点 run 切换 chips。

### Output
出现 run 切换 chips，切换查看不同 run；悬浮球只反映最近 running run。

### State
浮层浏览对象 = 所选 run；悬浮球对象 = 最近 running run（与浏览选择解耦）。

### Side-effect
none（切换是读侧浏览态）

### Invariants
- 悬浮球只反映最近 running run，多 run 全貌由 chips 承载。

## Outcome: running-run-finished（最近 running run 结束）

### Preconditions
- fixture_spec：chips 中最近 running run 完成（回执/快照更新到达）。
- 分叉点：反映对象迁移。

### Input
系统事件：run 完成状态更新。

### Output
悬浮球反映对象切换到剩余最近的 running run；无 running 时悬浮球收敛到非运行形态。

### State
悬浮球对象 = 剩余最近 running（或非运行形态）。

### Side-effect
none

### Invariants
- 反映对象迁移是确定性投影：恒指向最近 running，耗尽则收敛非运行形态。

## Outcome: receipt-live-update（回执实时更新浮层）

### Preconditions
- fixture_spec：浮层展开期间宿主任务状态变更（回执/快照到达）。
- 分叉点：浏览态下的刷新（source: inferred —— 步骤4「徽标随回执更新」在浮层展开态的延伸）。

### Input
系统事件：浮层展开时状态回执到达。

### Output
运行中卡徽标随回执原位更新（对齐桌面端状态集）；不关闭浮层、不重置浏览的 run 选择。

### State
浮层投影与最新快照一致。

### Side-effect
none

### Invariants
- 回执是浮层状态唯一更新源；更新不破坏浏览态。

## Journey Invariants
- 悬浮球/浮层反映对象解耦：chips 管全貌浏览，悬浮球恒指最近 running run。
