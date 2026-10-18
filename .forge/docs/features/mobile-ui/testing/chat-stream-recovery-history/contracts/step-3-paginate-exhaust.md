---
journey: "chat-stream-recovery-history"
step: 3
action: "paginate-exhaust"
title: "翻尽历史到达起点"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc session.history（hasMore 锚耗尽后不再发请求）"
anchors_source: "design/api-handbook.md §五"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤3"
---

# Contract · step-3-paginate-exhaust

## Outcome: success（锚耗尽停发）

### Preconditions
- fixture_spec：会话存在最早消息（hasMore 锚有限）；用户已翻至最后一批历史。

### Input
用户动作：继续上翻直至最早消息。

### Output
hasMore 锚耗尽后不再发分页请求；顶部呈现历史起点；无加载指示器残留。

### State
hasMore=false 终态；后续上翻零请求。

### Side-effect
none

### Invariants
- 锚耗尽是终态：耗尽后任何滚动都不再产生分页请求。

## Journey Invariants
- 投影一致性：历史起点是确定性边界，不因重复滚动改变。
