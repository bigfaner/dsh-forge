---
title: 状态判据投影与入口通道耦合，入口迁移时判据必须跟迁
summary: >-
  侧栏循环徽标消失的根因不在渲染链：判据投影 forge-dispatch-loop 只折叠 /run-dag-tasks 斜杠指令事件，循环正门改为
  dispatchTask/stopTaskLoop 工具后指令事件断供 → 投影恒 idle →
  徽标静默消失。状态判据绑定了入口形态而非语义本身，入口换通道时判据必须同步跟迁。
keywords:
  - 判据投影
  - 入口迁移
  - forge-dispatch-loop
  - dispatchTask
  - 事件断供
  - 徽标消失
domainPath: .knowledge/lessons/
来源容器: loop-consol-flywheel-improvement
来源任务: 提案 2.4（评审 report.md 核销）
bug id: 无
id: state-projection-breaks-on-entry-channel-migration
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 状态判据投影与入口通道耦合，入口迁移时判据必须跟迁

## 翻车点

- 标识链机械完好（`sidebar-model.ts` SessionLoopBadge + 左缘流光），但徽标消失。
- 诊断：判据投影 `forge-dispatch-loop`（projection/dispatch-loop.ts:15-23）只折叠 `command/run{run-dag-tasks}` 斜杠指令事件；3b 改造后循环正门改为 dispatchTask/stopTaskLoop 工具调用，指令事件断供 → 投影恒 idle。非 UI 退役，是入口换通道后判据未跟。

## 教训

1. **状态判据不要绑定入口的表层形态**（指令字符串、事件类型字面量），要绑定语义事件源；若已绑定，入口/正门迁移（如指令 → 工具调用）时必须把判据跟迁列为同批改动项。
2. **「UI 状态恒为初始值/消失」的诊断次序**：先查判据数据源的事件面是否断供（投影折叠条件 vs 现行入口实际发出的事件），再查渲染链——渲染链完好时症状仍完全相同。
3. 修复优先改判据读既有语义投影（本例改窄读 `forge-dispatch-events`，零新增机械），不另建平行走样的事件面；退役的旧投影标注仅供历史兼容读，不删折叠面。

## 出处

- proposals/loop-consol-flywheel-improvement/proposal.md §2.4（2026-10-28）；review/report.md:20（源码核销）；walkthrough/ac-1-6-verdict.md（修复后 AC4 PASS）。
