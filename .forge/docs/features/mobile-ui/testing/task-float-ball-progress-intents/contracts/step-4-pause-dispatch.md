---
journey: "task-float-ball-progress-intents"
step: 4
action: "pause-dispatch"
title: "暂停与派发意图转发"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "composer `/` 仲裁 → 官方指令执行远程面（/run-dag-tasks <slug>、/stop-dag-tasks；发用户当前浏览会话，同源独占守卫防重复）"
anchors_source: "design/api-handbook.md §1.0 + §三 stale/invalid-state"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/task-float-ball-progress-intents/journey.md 步骤4 + 边界1/2"
---

# Contract · step-4-pause-dispatch

## Outcome: success（意图转发 + 回执更新）

### Preconditions
- fixture_spec：运行中任务卡在位；数据新鲜；host 守卫将通过。

### Input
用户动作：分别点暂停与底部派发。

### Output
两类意图均转发至 host，host 守卫执行后任务状态徽标随回执更新（对齐桌面端状态集）。

### State
任务状态 = host 回执投影。

### Side-effect
宿主任务状态变更（暂停/派发由 host 单点落地）。

### Invariants
- 悬浮球/浮层是意图转发面：一律经 host 守卫后才落地，手机端无直接改变循环行为的路径。

## Outcome: stale-greyed（stale 数据操作拦截）

### Preconditions
- fixture_spec：数据已过期（stale 标记在显）。
- 分叉点：置灰拦截。

### Input
用户动作：stale 态尝试暂停/派发。

### Output
暂停/派发按钮置灰，操作不可发出，不发出过期意图。

### State
零意图出站；刷新后恢复。

### Side-effect
none

### Invariants
- 过期意图零出站（客户端拦截）+ host 守卫兜底双保险。

## Outcome: guard-rejected-pause（host 守卫拒绝暂停）

### Preconditions
- fixture_spec：暂停意图被 host 校验拒绝。
- 分叉点：失败回执呈现。

### Input
系统事件：守卫拒绝回执到达。

### Output
只回传提示数据呈现；任务状态不发生任何手机端臆测的变更。

### State
任务状态保持守卫前值（host 单源）。

### Side-effect
none（拒绝 = 零落地）

### Invariants
- 失败只回传数据：不猜测、不降级执行。

## Journey Invariants
- 暂停/派发 = 经守卫的指令面意图注入；回执是状态徽标唯一更新源。
