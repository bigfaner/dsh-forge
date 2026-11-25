---
title: 缝注入时点必须早于最早故障点——引导期失败 typed event 不可达，兜底径保不静默
summary: >-
  worker 引导期创建的 guard 早于插件激活，diag sink 注入（setJobTreeDiagSink）晚于首个故障——typed event
  面在该场景不可达，故障只能走 console 按级兜底经 stdio 落
  jsonl。结论：装配注入型诊断缝的注入时点是承重约束，须早于所覆盖面的最早可能故障点；兜底径按级分流保证诊断不静默，但「typed
  可查」与「不静默」是两档验收，只验后者会漏掉时序缺口。
keywords:
  - 注入时序
  - diag sink
  - 引导期失败
  - fail-soft 兜底
  - typed event
domainPath: .knowledge/lessons/
来源容器: diag-face-consolidation
来源任务: T6 收口审计 + dev 实机取证（1.6）
bug id: 无（走查观测发现，未修复，可立 disc 跟进 sink 提前注入）
id: seam-injection-timing-must-precede-earliest-failure
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 缝注入时点必须早于最早故障点

现象：dev 实机对 runtime 目录施加写 deny 制造 worker 内 guard 队列目录创建失败——jsonl 落的是兜底行 `[job-tree] …`（经宿主 stdio 捕获为 `event=child-stdio`、level=error），而非类型化 `event=job-tree-*` 行。

根因：guard 在 worker 启动引导期创建，早于 plugin-forge 插件激活；`setJobTreeDiagSink` 注入时点晚于首个 guard 失败。

两课：

1. **注入型缝的时点是承重约束**：装配期注入的诊断发射面，注入时点必须早于所覆盖面的最早可能故障点；「插件激活后才可用」的缝覆盖不了引导期失败。
2. **两档验收要分开验**：兜底径（不静默）与 typed event 面（可查性）是独立验收目标——只验「jsonl 有 error 行」会漏掉时序缺口；typed 可查性取证须覆盖最早故障场景。

反例边界：若故障只可能发生在插件激活后（消费点全部在插件生命周期内），注入时点无此约束；本课仅适用于缝所覆盖面含引导期/装配前路径的场景。

来源锚点：`proposals/diag-face-consolidation/walkthrough/t6-diag-queryability.md` §② 观测发现。
