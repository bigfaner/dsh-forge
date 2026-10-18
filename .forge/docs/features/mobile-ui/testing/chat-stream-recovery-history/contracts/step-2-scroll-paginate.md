---
journey: "chat-stream-recovery-history"
step: 2
action: "scroll-paginate"
title: "上翻分页拉取更早历史"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc session.history（分页锚参数，参照腿 api-ref.jsonl）"
anchors_source: "design/api-handbook.md §五"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/chat-stream-recovery-history/journey.md 步骤2 + 边界2"
---

# Contract · step-2-scroll-paginate

## Outcome: success（触发上翻分页）

### Preconditions
- fixture_spec：会话历史 ≥ 10 条已加载（step-1 success 后）；更早历史批次在回放 fixtures 就绪。

### Input
用户动作：向上滚动消息区到顶。

### Output
拉取更早一批历史并锚定插入；当前阅读位置不跳动；hasMore 锚耗尽前每翻一批追加一批。

### State
分页锚前移一批；消息流头部扩充，事件序呈现不重排。

### Side-effect
none

### Invariants
- 滚动主权：仅消息区滚动，分页插入不移动顶栏/输入行。

## Outcome: in-flight-throttle（分页在途连点）

### Preconditions
- fixture_spec：同 success，且上一批分页请求尚未返回。
- 分叉点：用户在请求在途期间再次滚动到顶（source: inferred —— 事实表知情的去重边界）。

### Input
用户动作：分页请求在途时连点上翻。

### Output
不重复发同锚请求；返回后单批插入、位置锚不重置。

### State
分页锚只在单批返回后前移一次。

### Side-effect
none

### Invariants
- 同屏无重复消息：同锚请求至多一次在途。

## Journey Invariants
- 投影一致性：分页插入不改变既有事件序呈现，同屏无重复消息。
