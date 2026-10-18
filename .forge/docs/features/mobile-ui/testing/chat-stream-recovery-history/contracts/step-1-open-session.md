---
journey: "chat-stream-recovery-history"
step: 1
action: "open-session"
title: "打开会话加载最近历史"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/chat/:sessionId"
  endpoint: "POST /api/rpc session.history + session.list（官方 RPC 面）；SSE GET /api/session/stream?sessionId=… snapshot 首帧"
anchors_source: "design/api-handbook.md §五 + design/tech-research.md R1"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤1 + 边界1"
---

# Contract · step-1-open-session

## Outcome: success（默认加载最近 10 条）

### Preconditions
- fixture_spec：已配对；回放数据面在位（proxy-rpc/api-ref/forge-stream 三通道）；目标会话历史 ≥ 10 条（历史窗口常量 = 最近 10 条）；SSE snapshot 首帧就绪。

### Input
用户动作：打开会话进入 `#/chat/:sessionId`。

### Output
默认仅渲染最近 10 条消息，按投影层语义呈现（user/message→蓝右气泡、assistant→流式/折叠 thinking 卡、tool→折叠活动卡）；顶栏与输入行固定。

### State
消息流 = snapshot 投影；`streamRevision` 初始化；分页锚指向最早已加载消息（hasMore=true）。

### Side-effect
none（加载是读侧行为，零宿主状态写入）。

### Invariants
- 投影一致性：消息流是 wire 事件序（snapshot/event）的确定性投影。

## Outcome: history-below-window（历史不足 10 条）

### Preconditions
- fixture_spec：目标会话消息数 < 历史窗口常量。
- 分叉点：历史一次性全量返回（source: inferred —— MU_HISTORY_WINDOW 事实：不足窗口时一次全量）。

### Input
用户动作：打开该短历史会话。

### Output
一次加载全量消息；顶部即历史起点，无「上翻加载」入口残留。

### State
hasMore=false（锚耗尽）；其余同 success。

### Side-effect
none

### Invariants
- 无分页入口残留：不足窗口时不渲染可触发空请求的入口。

## Journey Invariants
- 纯 view 层铁律：打开会话只消费官方面（history/stream），不改变宿主循环行为。
- 滚动主权：顶栏与输入行位置固定。
