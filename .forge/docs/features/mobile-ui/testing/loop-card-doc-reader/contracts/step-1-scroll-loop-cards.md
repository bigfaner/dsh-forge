---
journey: "loop-card-doc-reader"
step: 1
action: "scroll-loop-cards"
title: "滚动浏览循环卡（覆盖 journey 步骤 1–3：卡片呈现/退化 chip/最新卡完整）"
risk_level: "Low"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/chat/:sessionId（消息流内循环卡）"
  endpoint: "SSE snapshot/event 帧（source.kind = forge-loop 哨兵消息，{loopKind, runId, task, state}）"
anchors_source: "design/api-handbook.md §4.3 + design/wire-samples.md forge/progress"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/loop-card-doc-reader/journey.md 步骤1/2/3（合并为一个浏览动作面）"
---

# Contract · step-1-scroll-loop-cards

## Outcome: success（色条卡 + 同 runId 退化）

### Preconditions
- fixture_spec：会话消息流含桌面循环注入的哨兵消息（同 runId 多张卡；kind 覆盖 dispatch/followup/state/done）。

### Input
用户动作：滚动消息流查看循环卡；继续滚动使同 runId 非最新卡离视野。

### Output
哨兵消息按 kind 显示色条循环卡（dispatch 蓝/followup 浅蓝/state 灰/done 绿）；非最新卡退化为单行 chip；最新卡保持完整卡形态可读循环脉络。

### State
卡片渲染 = 消息流投影（同 runId 最新性判定驱动完整/chip 形态）。

### Side-effect
none

### Invariants
- 时间线不重排：退化只改形态，不改位置与事件序呈现。

## Journey Invariants
- 循环卡渲染是消息流的确定性投影：同 runId 非最新卡退化 chip、时间线不重排。
