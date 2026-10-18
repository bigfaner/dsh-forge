---
journey: "host-guard-intent-forwarding"
step: 3
action: "dispatch-intent"
title: "派发意图经守卫落地"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "composer `/` 仲裁 → 官方指令执行远程面（/run-dag-tasks <slug> 发用户当前浏览会话；同源独占守卫防重复）"
anchors_source: "design/api-handbook.md §1.0 + §三 stale"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/host-guard-intent-forwarding/journey.md 步骤3 + 边界3"
---

# Contract · step-3-dispatch-intent

## Outcome: success（派发执行）

### Preconditions
- fixture_spec：host 上提案驱动任务循环可派发；手机端数据新鲜（非 stale）。

### Input
用户动作：手机端发起派发意图。

### Output
host 校验通过后派发执行，循环推进由桌面端同源逻辑决定。

### State
派发后的任务状态随回执呈现（对齐桌面端状态集）。

### Side-effect
宿主派发一个任务 worker（host 单点落地）。

### Invariants
- 守卫单点：手机端零直接落地。

## Outcome: stale-intent-blocked（数据 stale 时发意图）

### Preconditions
- fixture_spec：手机端数据已过期（stale 标记在显）。
- 分叉点：过期数据下的操作。

### Input
用户动作：stale 态尝试派发（或绕过 UI 直发）。

### Output
按钮置灰意图发不出；若绕过 UI 直发，host 守卫仍拒绝（stale 错误 → 静默刷新 + 按钮置灰）。

### State
零派发落地；数据刷新后恢复可操作。

### Side-effect
none（拒绝 = 零落地；至多触发静默刷新读侧动作）

### Invariants
- 双保险：客户端 stale 置灰（体验）+ host 守卫（正确性），缺一呈现仍安全。

## Journey Invariants
- 派发是经守卫的意图注入；stale 拒绝不落任何宿主状态。
