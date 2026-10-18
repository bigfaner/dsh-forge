---
journey: "worker-session-entry"
step: 3
action: "send-message"
title: "发送消息注入下一轮"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc session.prompt（注入下一轮；空白消息由官方 composer 守卫拦截——EMPTY_SEND_GUARD 事实）"
anchors_source: "design/api-handbook.md §五 + fact-table EMPTY_SEND_GUARD"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/worker-session-entry/journey.md 步骤3 + 边界3"
  - "source: inferred —— 空白消息拦截自官方 composer 既有机械（fact-table EMPTY_SEND_GUARD）"
---

# Contract · step-3-send-message

## Outcome: success（注入下一轮）

### Preconditions
- fixture_spec：continuable worker 会话打开；输入可用。

### Input
用户动作：发送消息。

### Output
消息作为注入下一轮发出，对话延续。

### State
消息进入会话流；等待下一轮消费。

### Side-effect
宿主 worker 会话在下一轮注入该消息（host 单点落地）。

### Invariants
- continuable 可发送且注入下一轮——形态差异是用户可感知的第一行为差异。

## Outcome: in-flight-reconcile（发送在途会话仍运行）

### Preconditions
- fixture_spec：注入消息尚未落轮，worker 会话仍在执行。
- 分叉点：乐观呈现收口。

### Input
系统事件：执行过程帧与注入在途并存。

### Output
消息乐观呈现，最终由会话真实状态收口，不出现重复注入。

### State
乐观态被真实状态收口；注入恰一次。

### Side-effect
host 恰收到一次注入意图。

### Invariants
- 意图单发 + 真实状态收口：客户端零重复注入。

## Outcome: blank-send-guard（空白消息拦截）

### Preconditions
- fixture_spec：输入框仅含空白（无附件）。
- 分叉点：空发送守卫（source: inferred —— 官方 composer 既有机械）。

### Input
用户动作：空内容点发送。

### Output
零消息发出、零往返（发送不可用/双守卫拦截）；无诱导反馈。

### State
会话流零变化。

### Side-effect
none

### Invariants
- 空白提交零消息零往返（官方机械复用）。

## Journey Invariants
- worker 发送 = 注入下一轮的意图转发；一次性、经真实状态收口。
