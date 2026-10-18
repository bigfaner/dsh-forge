---
journey: "chat-stream-recovery-history"
step: 5
action: "stream-render"
title: "流式回复渲染与 settle 收口"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "SSE GET /api/session/stream 事件帧（type=assistant/chunk 增量；assistant/message 终态覆盖）"
anchors_source: "design/tech-research.md R1.1/R1.4 + design/wire-samples.md assistant/message"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤5 + 边界4/5"
---

# Contract · step-5-stream-render

## Outcome: success（live-chunk→settle 投影）

### Preconditions
- fixture_spec：发送已收口；forge-stream 回放含 chunk 增量帧序与 assistant/message 终态帧。

### Input
系统事件：SSE 增量帧按 timed 序到达。

### Output
回复气泡流式增长（chunk 增量实时拼接）；`assistant/message` 终态帧覆盖为终稿；仅消息区竖直滚动，触底自动跟随。

### State
流式态 → settle 收口；`streamRevision` 随帧推进。

### Side-effect
none（渲染侧行为）

### Invariants
- 投影一致性：settle 后不可回退为流式态。

## Outcome: high-frequency-chunks（高频合帧）

### Preconditions
- fixture_spec：多帧密集增量（帧距小于渲染帧间隔）。
- 分叉点：rAF 合帧渲染路径（source: inferred —— MU_STREAM_FRAMES/rAF 事实）。

### Input
系统事件：chunk 帧高频到达。

### Output
经 rAF 合帧渲染（不逐帧 DOM 写入）；settle 后可见文本与终态帧逐字一致。

### State
同 success。

### Side-effect
none

### Invariants
- 断言面限定用户可见文本，不依赖内部缓冲形态。

## Outcome: fold-cards（长消息/活动卡折叠）

### Preconditions
- fixture_spec：单条消息超过折叠空间纪律阈值（长 assistant 消息、tool call+result 对）。
- 分叉点：折叠呈现分支。

### Input
用户动作：浏览折叠卡；点按展开。

### Output
默认折叠（摘要行 + ~3 行渐隐预览）；展开就地撑开；调用段在结果段上方。

### State
折叠/展开是视图态，不改变消息序。

### Side-effect
none

### Invariants
- 时间线不重排：展开不移动其它消息位置。

## Journey Invariants
- 滚动主权与投影一致性在流式全程成立。
