---
journey: "hero-new-session-branch-guard"
step: 4
action: "guard-confirm"
title: "host 守卫拒绝与确认框选择"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:worktree/sessionCreate 回执（确认框数据完全回执驱动）"
anchors_source: "design/api-handbook.md §1.2/§三（invalid-state 提示 + 刷新）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/hero-new-session-branch-guard/journey.md 步骤4 + 边界2/3"
  - "source: inferred —— 回执迟到竞态分支自失败只回传数据不变式"
---

# Contract · step-4-guard-confirm

## Outcome: proceed（选「仍要切换」继续创建）

### Preconditions
- fixture_spec：创建意图被 host 建会话守卫拒绝；确认框「选回 / 仍要切换」在显（数据完全回执驱动）。

### Input
用户动作：在确认框中选「仍要切换」。

### Output
按用户意志继续创建（切换意图随创建重发落地）。

### State
确认框关闭；创建链继续。

### Side-effect
host 侧按用户确认后的意图重新裁决落地。

### Invariants
- 落点由 host 守卫裁决：确认框只是用户意志的回传通道。

## Outcome: revert（选「选回」不创建）

### Preconditions
- fixture_spec：同 proceed 前置。

### Input
用户动作：在确认框中选「选回」。

### Output
回到原分支、不创建会话。

### State
hero 分支值回退为原分支；零创建请求残留。

### Side-effect
none（被拒绝的切换不落任何 host 侧状态）

### Invariants
- 创建会话前宿主环境不被改变。

## Outcome: await-user-decision（守卫拒绝且用户无动作）

### Preconditions
- fixture_spec：确认框在显、用户未选择。
- 分叉点：等待用户决定。

### Input
系统事件：无后续输入。

### Output
后续动作等待用户决定，不自动选回或自动继续。

### State
确认框模态保持；创建链挂起。

### Side-effect
none

### Invariants
- 失败只回传数据：手机端不猜测、不自动降级执行。

## Outcome: non-branch-guard-failure（非分支类守卫失败）

### Preconditions
- fixture_spec：host 校验因其他原因失败（非分支切换冲突）。
- 分叉点：失败数据呈现。

### Input
系统事件：守卫失败回执到达。

### Output
只回传确认框/提示数据呈现给用户；手机端不自行重试或降级。

### State
失败呈现态；零自动重试。

### Side-effect
none

### Invariants
- 守卫单点：任何校验失败只回传数据，不触发客户端重试。

## Outcome: late-receipt-race（确认期间回执迟到）

### Preconditions
- fixture_spec：确认框在显期间，先前意图的回执迟到到达。
- 分叉点：迟到回执与用户决定竞态（source: inferred —— 失败只回传数据不变式推演）。

### Input
系统事件：迟到回执 + 用户随后选择。

### Output
呈现以回执数据为准刷新确认框内容；最终落点仍由用户选择 + host 裁决收口，无双落地。

### State
确认框数据与最新回执一致。

### Side-effect
none

### Invariants
- 回执是呈现唯一数据源：确认框内容不保留过期数据。

## Journey Invariants
- 确认框数据完全回执驱动；手机端零校验、零自动重试、零自动落点。
