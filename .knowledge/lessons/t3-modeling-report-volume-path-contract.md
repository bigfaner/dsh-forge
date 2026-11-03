---
title: T3 同缝拦截门解除判据——升级建模报告落卷路径是 deriveTaskStoreDir 派生的任务库卷宗，不是运行时任务日志目录
summary: 升级建模报告的落卷路径不是 SOP 字面的「运行时任务日志目录」，而是 deriveTaskStoreDir 派生的任务库卷宗 `<tasksHome>/<flatten@hash8>/.forge/docs/proposals/<slug>/issues/<localId>/`（顶层 .md 非递归探测）；落错路径守卫恒拦，用 forge.db 写入热度反查活跃任务库正本定位。
keywords: [forge, T3, recurrence, volume-path, deriveTaskStoreDir]
status: draft
source_container: e2e-known-reds-triage
source_task: fix-1 处置
source_bug: ef8b3a45
---

# T3 同缝拦截门：落卷路径契约

## 结论

- T3 拦截门解除判据里的「升级建模报告」落卷路径 = `deriveTaskStoreDir` 派生的任务库卷宗，不是 SOP 字面表述的「运行时任务日志目录」。
- 精确路径模板：`<tasksHome>/<flatten@hash8>/.forge/docs/proposals/<slug>/issues/<localId>/`；探测时只扫该目录**顶层 .md、非递归**。
- 落到错误路径时守卫恒拦——症状是「报告已写、门仍不解」，与「未写报告」不可区分，属误导性拦截面。

## 排查法

用 forge.db 的写入热度反查当前活跃任务库正本目录（哪个卷宗在持续被写即活跃正本），再核对报告实际落点。

## 边界

- 适用于 T3 同缝拦截门解除场景；其他报告类卷宗落点以其各自 SOP 契约为准。
- hash8 派生规则随 flatten 输入变化，勿硬编码具体 hash，按 deriveTaskStoreDir 现算。
