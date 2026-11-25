---
title: forge 账面双帧冗余按 task-submitted 消费
summary: >-
  forge 账面在任务结算时点会双写 task-submitted 与 task-worker-done 两条同 outcome
  事件（冗余帧，非缺陷）——复盘与指标统计消费账面时以 task-submitted 为准，避免双计。
keywords:
  - 账面
  - 双帧
  - 冗余事件
  - 指标统计
  - task-submitted
domainPath: .knowledge/lessons/
来源容器: diag-probe
来源任务: 1.2（first-pass 复盘，第三节）
bug id: 无
id: ledger-double-frame-consume-by-task-submitted
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# forge 账面双帧冗余按 task-submitted 消费

## 现象

diag-probe 账面回溯发现：同一任务结算时点（127s 处）存在 `task-submitted` 与 `task-worker-done` 两条同 outcome 事件。属账面结构冗余，非异常，不登记 bug。

## 规则

- 复盘 / 飞轮指标 / 时间线统计消费账面时，帧口径以 `task-submitted` 为准；`task-worker-done` 仅作 worker 终态旁证，不参与计数。
- 遇到同 outcome 双帧不要误判为重复结算或调度异常。

## 适用条件

- 基于 forge 账面 jsonl 事件流做指标统计、时间线拼装、异常判定时。

## 反例边界

- 仅当两条事件 outcome 一致时按本规则合并；outcome 分叉（submitted success 但 done 非success）属真实异常，须另行归因。
