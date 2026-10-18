---
journey: "drawer-session-list-unread"
step: 3
action: "unread-badge"
title: "双级未读徽标与最终一致"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:remote/read-state 读 {sessionId} → {seq, unread, stale?}；stale:true 仅域重建窗口；15s 存留期轮询"
anchors_source: "design/api-handbook.md §1.1 + tech-research R6.4"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/drawer-session-list-unread/journey.md 步骤3 + 边界1"
  - "source: inferred —— stale:true 重建窗口分支自手册 §1.1（客户端徽标显示旧值不归零）"
---

# Contract · step-3-unread-badge

## Outcome: success（徽标对账一致）

### Preconditions
- fixture_spec：抽屉打开；host 侧存在含未读的会话；read-state 读通道回放在位。

### Input
用户动作：查看未读徽标；保持抽屉打开等待 host 侧新未读。

### Output
双级未读徽标与 host read-state 游标一致（打开即拉取）；抽屉保持打开期间 host 新产生未读在 15s 轮询周期内最终一致更新。

### State
徽标 = `unread = tailSeq − lastReadSeq`（host 单源计算）的投影。

### Side-effect
none（读侧零写）

### Invariants
- 最终一致语义：轮询周期内收敛，不要求实时推送。

## Outcome: cursor-race-converge（打开瞬间游标竞态）

### Preconditions
- fixture_spec：本地徽标与 host 游标短暂不一致（host 刚写游标）。
- 分叉点：下次拉取对账。

### Input
系统事件：15s 轮询拉取返回新游标。

### Output
对账后收敛一致（最终一致，不要求实时）；收敛前不闪烁误值。

### State
徽标收敛为 host 现值。

### Side-effect
none

### Invariants
- 以 host 为对账基准：本地显示永不覆盖 host 单源。

## Outcome: stale-window-hold（域重建窗口保持旧值）

### Preconditions
- fixture_spec：read-state 读响应带 `stale:true`（tailSeq 未就绪）。
- 分叉点：重建窗口显示语义（source: inferred —— 手册 §1.1：客户端徽标显示旧值不归零）。

### Input
系统事件：stale 响应到达。

### Output
徽标显示旧值不归零；域就绪后下次拉取收敛。

### State
stale 标志在显；显示保持。

### Side-effect
none

### Invariants
- stale 窗口零误清零：不基于不完整 tailSeq 归零徽标。

## Journey Invariants
- 未读徽标与 host read-state 游标最终一致；计算单源在 host，手机端只呈现。
