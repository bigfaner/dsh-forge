---
title: 事件窗口推导态的兜底口径——证据缺席退化为「未知」，不误报活跃
summary: >-
  凡从有界事件窗口（如 forge-dispatch-events entries
  N=500）推导派生状态（徽标三态、计数区间），窗口被挤出/证据缺席时推导必须退化为「未知」（UI 零标记），禁止保留或误报为 running
  等活跃态——宁可未知不可误报。
keywords:
  - 事件窗口
  - 推导态
  - 兜底口径
  - 未知退化
  - 误报
  - entries 500
domainPath: .knowledge/conventions/
来源容器: loop-consol-flywheel-improvement
来源任务: 提案 2.4 + 评审 Q2 落档
bug id: 无
id: event-window-derived-state-unknown-fallback
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 事件窗口推导态的兜底口径——证据缺席退化为「未知」，不误报活跃

## 规则

1. 从有界事件窗口推导状态时，必须显式定义「窗口挤出/证据不在场」分支：推导退化为**未知**，UI 呈现为零标记/中性态，不向用户或下游断言任何具体状态。
2. 禁止的方向：证据缺席时保留上次快照值（会长时间陈旧）或回落为活跃态（误导用户以为仍在运行）。
3. 同款兜底口径适用于一切「以最近一枚锚点事件圈定区间」的计数断言（run-tests 技能验收清单已载）：区间不可得时断言不可判，不默认通过。

## 适用条件

- 事件源为有界窗口/环形缓冲，长循环会挤出锚点事件。
- 反例边界：若状态源本身是持久 checkpoint（如投影冷读日志重放），证据缺席风险低，可不强设未知分支——但仍要求明确「证据源边界」的论证而非默认假设。

## 出处

- proposals/loop-consol-flywheel-improvement/proposal.md §2.4（2026-10-28）；review/report-round2.md Q2 落档（窗口 N=500，dispatch-events.ts）；walkthrough/ac-1-6-verdict.md（实现：sessionLoopBadge 窗口挤出 → 未知=零标记不误报）。
