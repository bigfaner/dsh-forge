---
journey: "host-guard-intent-forwarding"
step: 1
action: "branch-switch-intent"
title: "分支切换意图经守卫落地"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:worktree/sessionCreate（意图转发，host 侧照旧校验）"
anchors_source: "design/api-handbook.md §1.3 + §三 invalid-state"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/host-guard-intent-forwarding/journey.md 步骤1 + 边界1"
---

# Contract · step-1-branch-switch-intent

## Outcome: success（校验通过后落地）

### Preconditions
- fixture_spec：已配对手机端 + host 任务循环运行中；hero 可触达分支切换；桌面端同 host 在线（对照基准）。

### Input
用户动作：手机端发起分支切换意图。

### Output
意图送 host 守卫，校验通过才执行落地；桌面端观察到的环境状态与手机端一致（单一事实源在 host）。

### State
宿主环境状态 = host 裁决结果；手机端呈现与之对账。

### Side-effect
宿主分支/worktree 状态变更（唯一合法路径 = 守卫后落地）。

### Invariants
- 守卫单点：手机端零校验、零直接落地。

## Outcome: guard-rejected（守卫拒绝分支切换）

### Preconditions
- fixture_spec：host 建会话守卫将拒绝该切换。
- 分叉点：失败回执。

### Input
系统事件：守卫拒绝回执到达。

### Output
失败只回传确认框/提示数据；不出现手机端臆测的半切换状态。

### State
宿主环境零变更；手机端呈现失败数据。

### Side-effect
none（拒绝 = 零落地）

### Invariants
- 失败只回传数据：不猜测、不降级执行。

## Journey Invariants
- 分支切换是经守卫的合法意图注入；被拒绝的意图不落任何宿主状态。
