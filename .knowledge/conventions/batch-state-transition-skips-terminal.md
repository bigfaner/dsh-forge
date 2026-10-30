---
title: 批量状态转移必须过滤 terminal 终态
summary: 循环停止/批量扫描径做状态转移前必须跳过 completed/failed 等 terminal 终态任务，否则刚完成的任务被扫成 interrupted 并触发重派死循环。
keywords: [状态机, transition, 终态, 停止, 重派]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
source_bug: 3ccb4e96
---

# 批量状态转移必须过滤 terminal 终态

## 现象

e2e 回放中 `/stop-dag-tasks` 的「派发循环停止」transition 把 90ms 前刚 completed 的任务扫成 interrupted（reason=派发循环停止），新循环重派 3 次全被回放缝 fail-loud 拒绝，任务永卡 in_progress（walkthrough/retest-1.20-r9/evidence.md）。

## 根因

停止径批量转移未过滤 terminal 终态——completed 是合法终态，任何批量扫描都无权改写。

## 避免方式

批量 transition 实现一律前置 terminal 过滤；断言面补「terminal 不可逆」守卫（fix-17 挂起冻结守卫同族）。
