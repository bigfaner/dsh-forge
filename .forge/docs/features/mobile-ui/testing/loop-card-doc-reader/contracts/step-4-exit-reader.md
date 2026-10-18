---
journey: "loop-card-doc-reader"
step: 4
action: "exit-reader"
title: "退出阅读页返回消息流"
risk_level: "Low"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "← 退出 → #/chat/:sessionId"
anchors_source: "design/screen-map.md（阅读页返回语义）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/loop-card-doc-reader/journey.md 步骤7"
---

# Contract · step-4-exit-reader

## Outcome: success（返回位置不变）

### Preconditions
- fixture_spec：阅读页自消息流文档卡打开；滚动位置已记录。

### Input
用户动作：按 ← 退出阅读页。

### Output
返回消息流，文档卡位置不变。

### State
阅读页路由态关闭；消息流滚动位置还原。

### Side-effect
none

### Invariants
- 退出仅是导航：零会话状态变更、零时间线重排。

## Journey Invariants
- 阅读页进/出都是纯导航，消息流投影不受影响。
