---
journey: "ask-paged-three-question-types"
step: 1
action: "enter-ask"
title: "pending 交互进入 ask 面板"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/ask"
  endpoint: "SSE interaction.pending 同步（150ms 防抖）；官方 RPC 面 interaction.pending"
anchors_source: "design/tech-research.md R1.2/R1.3 + api-handbook §五"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤1 + 边界8"
---

# Contract · step-1-enter-ask

## Outcome: success（进入分页面板）

### Preconditions
- fixture_spec：mobile project 回放驱动；会话存在 pending 交互，载荷形状 = `pendingQuestion = {rpcId, questions:[{id, header?, question, detail?, options?:[{label, description?, recommended?}], multiSelect?}]}`；fixture 覆盖三题型。

### Input
系统事件：会话产生待回答问题。

### Output
对话主视图出现 pending 交互入口，进入 `#/ask` ask 面板；一屏一题，左上角显示「1/N」序号/总数。

### State
面板态：当前题索引=0；作答缓冲为空。

### Side-effect
none（面板打开不改变宿主 pending 状态）

### Invariants
- 一屏一题分页不变式：序号/总数与实际题集一致。

## Outcome: session-switch-race（面板打开期间切会话）

### Preconditions
- fixture_spec：ask 面板打开且已有部分作答。
- 分叉点：用户退回主视图切到另一会话。

### Input
用户动作：面板在显时切换会话。

### Output
面板关闭且已作答不误发到其它会话；再次进入原会话 pending 交互仍在（未提交不消失）。

### State
作答缓冲随面板关闭丢弃；宿主 pending 保持。

### Side-effect
none（未提交零转发）

### Invariants
- 作答状态局部性：答案只存在于面板内直到提交；不产生误提交或跨会话泄漏。

## Journey Invariants
- 提交语义 = 意图转发：手机端只组装载荷经 interaction.answer 转发，零校验零循环参与。
