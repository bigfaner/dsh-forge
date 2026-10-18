---
journey: "host-guard-intent-forwarding"
step: 2
action: "pause-intent"
title: "暂停意图经守卫落地"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "composer `/` 仲裁 → 官方指令执行远程面（/stop-dag-tasks 指令 = 用户消息，无专用通道；api-handbook §1.0）"
anchors_source: "design/api-handbook.md §1.0 + §五"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/host-guard-intent-forwarding/journey.md 步骤2 + 边界2"
---

# Contract · step-2-pause-intent

## Outcome: success（暂停落地且双端一致）

### Preconditions
- fixture_spec：host 任务循环运行中；任务浮层可触达暂停；桌面端同 host 在线。

### Input
用户动作：手机端发起暂停意图。

### Output
host 校验通过后任务暂停；桌面端看到的循环状态与手机端一致（单一事实源在 host）。

### State
任务状态 = host 裁决结果；双端口径收敛。

### Side-effect
宿主任务状态变更（暂停），由桌面端同源逻辑执行。

### Invariants
- 循环主权：手机端动作只是经守卫后的合法意图注入。

## Outcome: desktop-concurrent（暂停意图与桌面端并发）

### Preconditions
- fixture_spec：桌面端同时操作同一任务。
- 分叉点：双端并发竞态。

### Input
用户动作：手机端与桌面端几乎同时操作同一任务。

### Output
正确性由 host 单点保证，两端口径收敛一致；客户端竞速不改变落点。

### State
最终状态 = host 串行化裁决结果。

### Side-effect
唯一一次状态变更（host 侧定序）。

### Invariants
- 正确性 host 单点保证；客户端竞速只算体验。

## Journey Invariants
- 暂停是经守卫的意图；循环行为只由桌面端逻辑决定。
