---
journey: "chat-stream-recovery-history"
step: 4
action: "send-prompt"
title: "发送消息（意图转发）"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc session.prompt（意图转发，手机端零校验）"
anchors_source: "design/api-handbook.md §五 + design/tech-research.md R1.2"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤4 + 边界3"
---

# Contract · step-4-send-prompt

## Outcome: success（乐观上屏 + 通道转发）

### Preconditions
- fixture_spec：会话已打开且流连接健康；输入行非空。

### Input
用户动作：在输入行键入消息并发送。

### Output
用户气泡乐观上屏；请求经 session.prompt 通道发出（意图转发，手机端零校验）。

### State
乐观消息进入投影尾端；等待服务端快照收口。

### Side-effect
宿主侧产生一轮新对话（由 host 守卫后的合法意图注入；手机端零直接落地）。

### Invariants
- 纯 view 层铁律：手机端只发用户输入意图，零校验。

## Outcome: revision-conflict（发送在途快照更新）

### Preconditions
- fixture_spec：发送请求在途，且 SSE 帧此刻带来更新快照。
- 分叉点：乐观态与服务端快照对账（source: inferred —— 事实表知情的 revision 守卫边界）。

### Input
前置动作：发送后、回执前流式快照到达。

### Output
乐观气泡以服务端快照为准对齐；不出现重复消息或错序覆盖。

### State
乐观态被快照收口替换；消息序与不断线基准一致。

### Side-effect
none（收口是渲染侧对账）。

### Invariants
- 投影一致性：同屏无重复消息，live 态被 settle 覆盖后不回退。

## Journey Invariants
- 手机端动作只是经 host 守卫后的合法意图注入；对账后消息序与不断线基准完全一致。
