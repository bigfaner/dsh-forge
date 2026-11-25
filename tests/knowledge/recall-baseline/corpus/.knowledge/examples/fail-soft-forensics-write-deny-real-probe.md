---
title: fail-soft 路径真机取证配方——文件系统写 deny 制造故障 + 真实探针任务触发 typed 行
summary: >-
  验证诊断事件的 fail-soft 兜底路径时，不 mock、不注入假故障——用文件系统权限 deny（对 runtime 目录施加写
  deny）制造真实失败，同时经 dev UI 派发真实 blitz 探针任务驱动正常里程碑站点；一次取证同时覆盖兜底径与 typed 径，证据为
  `{userData}/logs/app-*.jsonl` 事件行核对表。诊断面迁移/可查性类验收可直接复用此配方。
keywords:
  - 真机取证
  - 写 deny
  - fail-soft
  - 诊断事件
  - jsonl 可查性
domainPath: .knowledge/examples/
来源容器: diag-face-consolidation
来源任务: T6 收口审计 + dev 实机取证（1.6）
bug id: 无
id: fail-soft-forensics-write-deny-real-probe
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# fail-soft 路径真机取证配方（写 deny + 真实探针）

三步：

1. **触发环境**：dev UI 新建会话，发诊断探针指令 → agent 注册 blitz 提案并 `/run-dag-tasks` 派发真实 worker（驱动 loop-start / loop-settle 等正常里程碑站点）。
2. **制造故障**：对 `{userData}/runtime` 目录施加写 deny，制造队列目录创建失败（EPERM mkdir）——fail-soft 兜底路径真实触发，不靠 mock。
3. **取证**：核对 `{userData}/logs/app-*.jsonl`——兜底径出现 error 行、typed 站点出现带 payload 的类型化 event 行，逐站点列表核对；证据（jsonl、截图）归档 proposals `<slug>/walkthrough/`（留盘不进 git）。

附带验证：deny 解除后确认环境自愈（兜底径经 ensureQueueDir 重建目录，无残留异常）——fail-soft 验收应含自愈确认，不留脏环境。

反例边界：此配方适用于「外部资源失败可注入」的 fail-soft 面（文件系统/子进程/网络）；纯逻辑分支（如常量缺席）无注入点，走单元测试覆盖。

来源锚点：`proposals/diag-face-consolidation/walkthrough/t6-diag-queryability.md` §②、`diag-events-captured.jsonl`。
