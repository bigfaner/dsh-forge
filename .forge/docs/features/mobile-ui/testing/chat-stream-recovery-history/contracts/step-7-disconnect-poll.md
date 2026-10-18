---
journey: "chat-stream-recovery-history"
step: 7
action: "disconnect-poll"
title: "SSE 中断降级轮询"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "SSE onerror → 降级轮询（POST /api/rpc session.history；退避 750ms→5s 封顶，MU_POLL_CONSTANTS）"
anchors_source: "design/tech-research.md R1.1/R1.3 + api-handbook §三 disconnected"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤7 + 边界6/7"
---

# Contract · step-7-disconnect-poll

## Outcome: success（断流降级）

### Preconditions
- fixture_spec：流连接健康；回放注入 SSE 断流（onerror）。

### Input
系统事件：SSE 连接中断。

### Output
出现断线覆盖层；对话引擎降级为轮询（退避 750ms→5s）；期间最近已 settle 消息仍可见。

### State
`streamConnected=false`；轮询状态机启动（ACTIVE→IDLE 退避）。

### Side-effect
none（轮询是读侧恢复机制，正确性由重连续流收口）

### Invariants
- 恢复单向自愈：降级对用户透明（除覆盖层与退避期延迟）。

## Outcome: send-during-poll（轮询期间再发消息）

### Preconditions
- fixture_spec：断线覆盖层在显（降级轮询中）。
- 分叉点：降级态下的意图转发。

### Input
用户动作：轮询期间发送消息。

### Output
发送仍可发出（降级轮询不阻塞意图转发）；恢复后回复照常流式续接。

### State
乐观态照常进入投影，等待恢复后收口。

### Side-effect
宿主侧照常消费意图（host 单点正确性不受客户端断线影响）。

### Invariants
- 纯 view 层铁律：降级只影响体验，不影响宿主循环行为。

## Outcome: backoff-cap（断线跨越多轮退避）

### Preconditions
- fixture_spec：中断时长 > 5s（回放保持断流）。
- 分叉点：退避封顶稳态。

### Input
系统事件：退避周期持续运行。

### Output
退避封顶 5s 后周期稳定，不无限加速或停止；恢复后续流不重放已渲染消息。

### State
轮询间隔稳定于 IDLE_CAP_MS。

### Side-effect
none

### Invariants
- 恢复后消息序与不断线基准完全一致（无重放、无重复）。

## Journey Invariants
- 断线→轮询→重连续流对用户透明；轮询仅体验降级，正确性由重连续流状态收口。
