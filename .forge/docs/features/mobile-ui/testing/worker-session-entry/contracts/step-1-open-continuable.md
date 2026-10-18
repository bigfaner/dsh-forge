---
journey: "worker-session-entry"
step: 1
action: "open-continuable"
title: "进入 continuable worker 会话"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/worker/:sessionId"
  endpoint: "SSE snapshot/event（执行过程消息流）；会话目录 = session.list（parentSessionId + origin:'subagent' + running 视图过滤，api-handbook §1.2 workers 派生）"
anchors_source: "design/api-handbook.md §1.2 + §五"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/worker-session-entry/journey.md 步骤1"
  - "source: inferred —— 执行过程流式渲染分支自对话流投影语义（worker 会话同投影层）"
---

# Contract · step-1-open-continuable

## Outcome: success（进入 worker 会话）

### Preconditions
- fixture_spec：host 任务循环存在 continuable worker 会话且有历史消息；任务浮层任务卡可点。

### Input
用户动作：在任务浮层点开 continuable 任务卡。

### Output
进入 `#/worker/:sessionId` worker 会话，可见执行过程消息流；状态徽标同任务面板。

### State
worker 会话路由态；消息流 = snapshot 投影。

### Side-effect
none（进入是导航 + 读侧拉取）

### Invariants
- 进入 worker 会话不干扰宿主任务循环（导航 + 只读拉取）。

## Outcome: stream-projection（执行过程流式渲染）

### Preconditions
- fixture_spec：worker 会话仍在运行，SSE 帧持续到达。
- 分叉点：流式投影（source: inferred —— worker 会话复用对话流投影层语义）。

### Input
系统事件：执行过程增量帧到达。

### Output
消息流按投影语义流式渲染（chunk 拼接、settle 覆盖），与主会话流行为一致。

### State
投影随帧推进；仅消息区滚动。

### Side-effect
none

### Invariants
- 投影一致性：worker 流与主会话流同投影语义，settle 后不回退。

## Outcome: session-not-found（会话已消失）

### Preconditions
- fixture_spec：任务卡指向的 worker 会话在 host 侧已不存在。
- 分叉点：进入命中 `not-found` 失败码。

### Input
用户动作：点开该任务卡。

### Output
进入失败以提示呈现并刷新任务列表（对象已消失）；不进入空白会话视图。

### State
浮层列表对账后移除消失卡。

### Side-effect
none（失败零落地）

### Invariants
- not-found 是对账信号：失败驱动列表刷新，不渲染空壳会话。

## Journey Invariants
- worker 会话进入是纯导航；形态差异（只读/可写）由 worker 类型决定。
