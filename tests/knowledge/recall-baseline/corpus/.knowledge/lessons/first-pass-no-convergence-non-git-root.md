---
title: 非 git 项目根上 first-pass 循环不收敛
summary: >-
  循环在非 git 项目根上每 settle 后继续派生 first-pass 复盘任务不收敛（1.2→1.4→1.5…），伴 warn「first-pass
  mark skipped (no base commit)」逐轮重复，需手动 /stop-dag-tasks 终止——疑似 first-pass
  收敛判定依赖 base commit、缺席时无兜底。
keywords:
  - first-pass
  - 收敛判定
  - 非 git 根
  - base commit
  - 循环不收敛
domainPath: .knowledge/lessons/
来源容器: diag-milestone-coverage
来源任务: 1.9 真机走查 batch-1（裁决.md 观察与偏差候选
bug id: 无（留档偏差候选，未立案）
id: first-pass-no-convergence-non-git-root
status: unconfirmed
type: facts
version_ts: '2026-11-05T00:00:00.000Z'
---

# 非 git 项目根上 first-pass 循环不收敛

## 现象

- 走查夹具提案（hello-forge）注册在非 git 根（D:\download），blitz 循环每 settle 后继续派生 first-pass 复盘任务，1.2→1.4→1.5… 逐轮不收敛，须手动 `/stop-dag-tasks` 终止。
- 每轮伴 warn `first-pass mark skipped (no base commit)`——first-pass 标记依赖 base commit，非 git 根无 base commit，收敛判定失去锚点且无兜底。

## 规避与使用

- 在非 git 项目根上做真机走查/夹具验证时，预期循环不自动收敛：备好 `/stop-dag-tasks` 终止手段，并把「first-pass 逐轮派生 + warn 重复」视为已知环境表现而非新缺陷。
- 判断走查循环是否异常，先看项目根是否 git 仓库、有无 base commit warn。

## 边界

- 待核：收敛判定的兜底设计是否应补（如非 git 根按 N 轮上限或首次复盘即收敛）——尚属偏差候选，未经裁决收口，勿当已修事实引用。

- 证据：`.forge/docs/proposals/diag-milestone-coverage/walkthrough/batch-1/裁决.md`（app-20261101.jsonl 14:30–14:35 段 + loop-settle-timeline.png）。
