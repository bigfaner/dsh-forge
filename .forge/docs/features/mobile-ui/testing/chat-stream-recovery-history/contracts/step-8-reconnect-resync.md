---
journey: "chat-stream-recovery-history"
step: 8
action: "reconnect-resync"
title: "连接恢复自动重连续流"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "SSE EventSource 原生重连 + GET /api/status 心跳判活；错过的帧经轮询/续流补齐"
anchors_source: "design/tech-research.md R1.1/R1.3 + api-handbook §三"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤8 + 边界8"
---

# Contract · step-8-reconnect-resync

## Outcome: success（恢复补齐）

### Preconditions
- fixture_spec：降级轮询在显；回放恢复 SSE 帧序（含断线期间错过的消息）。

### Input
系统事件：SSE 连接恢复。

### Output
覆盖层消失；自动重连续流；断线期间错过的消息经轮询/续流补齐，无需用户刷新。

### State
`streamConnected=true`；投影与不断线基准对齐；轮询状态机退出。

### Side-effect
none

### Invariants
- 恢复后消息序与不断线基准完全一致。

## Outcome: heartbeat-missing（心跳缺席判活）

### Preconditions
- fixture_spec：SSE 通道已恢复，但 `/api/status` 心跳帧缺席。
- 分叉点：心跳判活失败分支（source: inferred —— MU_POLL_CONSTANTS checkConnection 事实）。

### Input
系统事件：通道恢复但心跳缺席。

### Output
引擎判定连接不健康，维持降级轮询；心跳帧到达后才切回流式。

### State
保持轮询稳态；不做流式切换。

### Side-effect
none

### Invariants
- 正确性由重连续流状态收口，轮询仅体验降级——判活失败不产生误切换。

## Journey Invariants
- 恢复单向自愈：恢复路径不重放已渲染消息、不产生重复；覆盖层消失即基准对齐。
