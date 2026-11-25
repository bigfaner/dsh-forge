---
title: 容器事件账面缺席时复盘只能留盘反推
summary: >-
  容器 triage
  事件账面（`logs/{slug}.jsonl`）不创建时，容器全生命周期无账面可考——workspace-artifact-governance
  容器账面缺席，first-pass 复盘被迫用散落留盘文件（settlement.json / error.log / record.md /
  evidence.txt）逐个反推拼时间线。机制缺口候选：容器创建与账面文件创建应同事务绑定（空文件也算在场）。
keywords:
  - 事件账面
  - triage
  - 日志缺席
  - 复盘反推
  - 机制缺口
domainPath: .knowledge/lessons/
来源容器: workspace-artifact-governance
来源任务: 1.8（first-pass 复盘 §2.1）
bug id: 无
id: container-event-ledger-absent-reconstruction-cost
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 容器事件账面缺席时复盘只能留盘反推

## 事实

`logs/workspace-artifact-governance.jsonl` 全数据仓 glob 零命中——本容器无 triage-decided/triage-outcome 事件账面。1.8 复盘的时间线（两次修正波次、fix 密度）全部靠任务日志子目录的留盘文件反推拼装，拼装成本整轮；且「事件未发生」与「发生但直丢」两种可能无法区分。

## 推论（待机制立案，非 agent 侧可修）

- 容器创建时点即应落 `logs/{slug}.jsonl`（空文件也算账面在场），否则账面唯一写者口径不达。
- 复盘/知识沉淀类任务拿到账面缺席的容器时，反推优先级：settlement/error 日志 → 走查 README → 提案文档；反推结论须标注「据留盘文件拼装」以示与账面直读的置信差。

## 边界

- 本条是记录机制缺口的反例判例，不是「允许不记账面」的依据；账面在场的容器禁止再用留盘反推替代直读。
