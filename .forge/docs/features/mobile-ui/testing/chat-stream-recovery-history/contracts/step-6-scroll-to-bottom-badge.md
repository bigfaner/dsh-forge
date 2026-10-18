---
journey: "chat-stream-recovery-history"
step: 6
action: "scroll-to-bottom-badge"
title: "视野外新消息与「滚动到底」"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "SSE GET /api/session/stream（视野外 event 帧）"
anchors_source: "design/tech-research.md R1.1"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤6"
---

# Contract · step-6-scroll-to-bottom-badge

## Outcome: success（未读计数与跟随）

### Preconditions
- fixture_spec：用户当前阅读位置不在底部；流式期间新消息在视野外到达。

### Input
用户动作：查看「滚动到底」按钮并点击。

### Output
视野外到达时出现「滚动到底」按钮带未读红点计数；点击后滚动到底、计数归零，恢复触底自动跟随。

### State
未读计数随视野外帧累加、触底归零。

### Side-effect
none

### Invariants
- 计数只反映渲染侧视野状态，与宿主 read-state 无耦合（本旅程内）。

## Journey Invariants
- 滚动主权：跟随/计数归零都是消息区局部行为，顶栏输入行不动。
