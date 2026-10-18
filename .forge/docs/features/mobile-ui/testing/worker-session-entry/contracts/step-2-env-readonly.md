---
journey: "worker-session-entry"
step: 2
action: "env-readonly"
title: "会话环境信息只读继承"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/worker/:sessionId 环境信息区（模式/worktree 显示）"
anchors_source: "design/api-handbook.md §1.3（worktree/list 透传通道，点看全量数据源）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/worker-session-entry/journey.md 步骤2 + 边界2"
---

# Contract · step-2-env-readonly

## Outcome: success（只读呈现）

### Preconditions
- fixture_spec：continuable worker 会话打开；环境信息（模式/worktree）继承自主会话。

### Input
用户动作：查看会话环境信息。

### Output
模式/worktree 只读呈现，继承自主会话，手机端不可修改。

### State
环境显示 = 主会话状态投影。

### Side-effect
none

### Invariants
- 模式/worktree 只读继承自主会话，worker 会话内不可变更。

## Outcome: no-edit-entry（尝试修改无入口）

### Preconditions
- fixture_spec：用户试图操作环境显示区。
- 分叉点：只读交互。

### Input
用户动作：点模式/worktree 显示区。

### Output
只读呈现（worktree 点看全量：名称与路径分行）；无修改入口。

### State
零修改控件、零修改请求。

### Side-effect
none

### Invariants
- 只读面零写路径：环境不可从 worker 会话侧变更。

## Outcome: env-receipt-refresh（环境随主会话回执更新）

### Preconditions
- fixture_spec：worker 会话打开期间主会话环境状态发生变更（回执/快照到达）。
- 分叉点：环境显示刷新（source: inferred —— 环境显示 = 主会话投影的延伸语义）。

### Input
系统事件：主会话环境变更回执到达。

### Output
环境显示随回执原位更新为新的主会话状态；仍保持只读、零修改入口。

### State
环境投影与主会话一致。

### Side-effect
none

### Invariants
- 环境显示恒 = 主会话投影；刷新不改只读语义。

## Journey Invariants
- worker 会话环境是主会话的只读投影；任何交互都不产生环境写请求。
