---
journey: "hero-new-session-branch-guard"
step: 2
action: "create-default"
title: "保持默认直接开建会话"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:worktree/sessionCreate（意图转发，host 侧照旧校验）"
anchors_source: "design/api-handbook.md §1.3"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/hero-new-session-branch-guard/journey.md 步骤2 + 边界4"
  - "source: inferred —— 连点开建防重自意图转发一次性语义推导"
---

# Contract · step-2-create-default

## Outcome: success（当前环境建会话）

### Preconditions
- fixture_spec：hero 打开且保持默认（突击 + 当前分支/worktree）。

### Input
用户动作：保持默认直接开建会话。

### Output
会话在当前分支/worktree + 突击模式下创建并进入对话主视图。

### State
路由进入新会话 `#/chat/:sessionId`；hero 态退出。

### Side-effect
host 侧创建会话（经守卫后的合法意图落地）；宿主环境未被改变（未切分支）。

### Invariants
- 创建会话前宿主环境不被改变；落点由 host 守卫裁决。

## Outcome: reopen-no-residue（快速连开与返回）

### Preconditions
- fixture_spec：hero 打开后未建会话即返回。
- 分叉点：导航放弃建会话。

### Input
用户动作：打开 hero 后直接返回。

### Output
无残留半创建会话或状态泄漏；再次打开 hero 恢复初始态。

### State
hero 态完全清理；零会话创建请求。

### Side-effect
none（未提交零落地）

### Invariants
- 未提交的 hero 不产生任何 host 侧状态。

## Outcome: double-submit-guard（连点开建防重）

### Preconditions
- fixture_spec：开建请求在途未返回。
- 分叉点：重复点击开建（source: inferred —— 意图一次性语义）。

### Input
用户动作：在途期间连点开建。

### Output
不并发多发创建请求；返回后进入唯一新会话。

### State
单请求在途标记；幂等收敛。

### Side-effect
host 恰收到一次创建意图。

### Invariants
- 同一意图单发：客户端不产生重复创建竞速。

## Journey Invariants
- 创建全链回执驱动：无预检；手机端只转发意图，落点由 host 裁决。
