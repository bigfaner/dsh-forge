---
journey: "worker-session-entry"
step: 4
action: "exit-and-oneshot"
title: "退出 continuable 与浏览 one-shot（只读）"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "← 退出 → 任务浮层；#/worker/:oneShotSessionId（只读形态）"
anchors_source: "design/api-handbook.md §1.2（worker 目录派生——one-shot/continuable 语义源）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/worker-session-entry/journey.md 步骤4 + 边界1/4"
  - "source: inferred —— one-shot 卡入口可辨自形态差异可感知不变式"
---

# Contract · step-4-exit-and-oneshot

## Outcome: success（退出 + one-shot 只读浏览）

### Preconditions
- fixture_spec：continuable worker 会话打开；任务浮层含 one-shot 任务卡（有历史消息）。

### Input
用户动作：点 ← 退出 continuable 会话，再点开 one-shot 任务卡。

### Output
退出返回任务浮层、主会话循环不受影响；one-shot 会话可浏览全部执行过程（只读形态，输入不可用）。

### State
退出 = 纯导航；one-shot 会话以只读形态呈现。

### Side-effect
none（退出/浏览零循环控制）

### Invariants
- one-shot 恒只读：形态差异是用户可感知的第一行为差异。

## Outcome: oneshot-send-blocked（one-shot 尝试发送）

### Preconditions
- fixture_spec：one-shot worker 会话在显。
- 分叉点：只读拦截。

### Input
用户动作：在 one-shot 会话尝试发送。

### Output
输入不可用，消息无法发送（只读形态）；界面无诱导发送的控件。

### State
零发送请求、零乐观消息。

### Side-effect
none

### Invariants
- one-shot 零写路径：不存在可触发的注入请求。

## Outcome: reentry-clean（退出后重新进入）

### Preconditions
- fixture_spec：用户退出后再次点同一任务卡。
- 分叉点：状态恢复。

### Input
用户动作：重新进入同一 worker 会话。

### Output
会话状态如实恢复，无幽灵输入或状态残留。

### State
输入草稿/滚动等视图态干净重置；消息流如实投影。

### Side-effect
none

### Invariants
- 重进零残留：视图态不跨进出场合泄漏。

## Outcome: exit-while-running（worker 运行中退出）

### Preconditions
- fixture_spec：continuable worker 会话仍在执行时用户退出。
- 分叉点：运行中导航离场。

### Input
用户动作：worker 会话运行期间按 ← 退出。

### Output
返回任务浮层；worker 执行不受退出影响（宿主循环照常），状态徽标随任务面板回执继续更新。

### State
退出仅收起本地视图；执行主权在 host。

### Side-effect
none（零循环控制请求）

### Invariants
- ← 退出仅是导航，非循环控制；运行主权在 host。

## Journey Invariants
- 进入/退出 worker 会话不干扰宿主任务循环；← 退出仅是导航，非循环控制。
