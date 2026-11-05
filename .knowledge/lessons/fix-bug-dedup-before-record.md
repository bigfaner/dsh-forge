---
title: recordBug 前必须 listBugs 查重——同一缺陷多 ID 三处引用致可追溯性断裂
summary: >-
  同一缺陷重复落账三条记录（a944424f 正本 fixed / 1f8f58a5 重复 fixed / 8913a908 重复 open）→
  commit、源码注释、对账表三处引用三个不同 ID，可追溯性断裂。教训：recordBug 前必查重（症状关键词 + 触发面）；正本选定后重复条目
  resolveBug 清账并注记 dup-of；所有引用面统一用正本 ID。
keywords:
  - recordBug
  - 查重
  - dup-of
  - 可追溯性
  - bug-id
status: unconfirmed
source_container: e2e-upstream-drift-reds-triage
source_task: 1.4 / 1.7
source_bug: a944424f / 8913a908 / 1f8f58a5
id: fix-bug-dedup-before-record
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# bug 落账查重纪律

## 现象

同一缺陷被落账三条记录：a944424f（正本，fixed）、1f8f58a5（重复，fixed）、8913a908（重复，open）。三个 ID 分别散落在 commit 信息、源码注释与对账表中，追溯任一引用都可能命中非正本条目。

## 规则

1. **recordBug 前必须 listBugs 查重**：按症状关键词 + 触发面（同缝复发链的既有判据）双维度检索，命中即合并入既有条目，不新开。
2. 正本选定后，重复条目用 resolveBug 清账，并在注记中标明 `dup-of <正本 ID>`。
3. 源码注释、commit 信息、对账表等一切引用面**统一使用正本 ID**，不引用重复条目 ID。

## 边界

适用于 bug 台账生命周期（记录/解决/引用）；不同缺陷的相似症状不合并，查重以同根因为合并判据。
