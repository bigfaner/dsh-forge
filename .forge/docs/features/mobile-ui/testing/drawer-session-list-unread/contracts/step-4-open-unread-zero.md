---
journey: "drawer-session-list-unread"
step: 4
action: "open-unread-zero"
title: "点开未读会话本地归零"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:remote/read-state 写 {sessionId, seq} → {seq, unread}；单调守卫拒绝回退返回现值不报错"
anchors_source: "design/api-handbook.md §1.1"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/drawer-session-list-unread/journey.md 步骤4 + 边界2"
---

# Contract · step-4-open-unread-zero

## Outcome: success（进入即归零）

### Preconditions
- fixture_spec：抽屉中存在未读会话（unread > 0）。

### Input
用户动作：点开未读会话。

### Output
进入会话，本地未读即时归零；下次拉取时游标对账一致。

### State
本地徽标归零；写游标请求经 read-state 写语义发出（seq > lastReadSeq 才落盘）。

### Side-effect
写 read-state 游标（host 单调守卫 clamp/守卫；不改变宿主循环行为）。

### Invariants
- 打开即拉取 + 写游标后本地即时归零、下次拉取对账。

## Outcome: monotonic-guard-no-resurrect（归零后再拉取）

### Preconditions
- fixture_spec：用户已读后本地归零、host 游标尚未推进。
- 分叉点：下次拉取对账。

### Input
系统事件：轮询拉取返回（游标未推进）。

### Output
以 host 为准对账，不出现已读会话徽标复活或永久误清。

### State
lastReadSeq 单调不回退；unread 保持 0。

### Side-effect
none（守卫拒绝回退时返回现值，不报错）

### Invariants
- 游标单调：写仅在 seq > lastReadSeq 时落盘（host 原子 RMW 单源）。

## Outcome: session-not-found（会话已消失）

### Preconditions
- fixture_spec：本地列表中的会话在 host 侧已不存在（not-found 回执）。
- 分叉点：写游标命中 `not-found` 失败码。

### Input
用户动作：点开该会话。

### Output
进入失败以提示呈现；按手册处置刷新列表（对象已消失）；零误清零其它会话徽标。

### State
列表对账后移除消失项。

### Side-effect
none（失败零落地）

### Invariants
- not-found 是对账信号：失败驱动列表刷新，不产生误清或复活。

## Journey Invariants
- 未读对账三段式：打开即拉取、写后即时归零、下次拉取收敛——全程以 host 为单源。
