---
title: 可观测性覆盖补齐配方：成功里程碑 info + 豁免点 debug emit + 裸 catch 二分
summary: 诊断覆盖面缺口的三段补齐配方——成功路径终点补 info 埋点（event 功能域前缀 + payload 携带 slug/localId 等可得字段）；吞没点逐点核对，豁免（注释化理由 + 零影响）也补 debug 级 emit 不静默，其余补 warn；裸 catch 全仓扫描产「豁免/补点」二分台账落档。
keywords: [诊断埋点, 成功里程碑, fail-soft, debug 级别, 裸 catch 审计, emitDiag]
domainPath: .knowledge/conventions/
来源容器: diag-milestone-coverage
来源任务: 提案全循环（1.2 补点 / 1.6 补点 / 1.9 真机走查裁决通过）
bug id: 无
---

# 可观测性覆盖补齐配方：成功里程碑 info + 豁免点 debug emit + 裸 catch 二分

## 配方（三段）

1. **成功里程碑补 info**：业务成功路径终点（settle 完成、派发行提交成功、配置落盘成功）各补一条 info 埋点——统一 `diag/log` 域 + 类型化 emit；`event` 用功能域前缀（如 `forge-settle`、`forge-dispatch-line`、`expert-squad-setenabled`），payload 就地携带 slug/localId/sessionId 等可得字段。注意补点位置与触发径对齐：如 dispatch commit 仅新会话径，既有会话 materialized 路径按设计跳过（info 不必覆盖全径，与设计一致即可）。
2. **吞没点二分口径**（用户裁决 2026-11-01）：豁免 = 注释化 fail-soft 理由且影响面为零，**但豁免点仍补 debug 级 emit**（不静默，按级别门按需开启）；其余一律补 warn 站点。
3. **debug 级别支持**：`DiagLevel` 在 contracts 单源扩 `debug`；发射面与 appender 增按级别过滤开关（默认 info 起，debug 诊断时开）。

## 验证口径

- 真机判据：dev 实机从 `{userData}/logs/app-*.jsonl` 回放各里程碑 info 行原文（含 timestamp/level/process/event/projectId 字段）。
- 打开面走既有缝：复用 harness.log showLog 同缝同位入口（同交互词汇，不设第二入口）。

## 边界

- 适用于已统一 `diag/log` 域、有类型化 emit 单源的仓库；未统一诊断域前先做域统一（本配方 parent 前提）。
- 计数器类自证（appender 丢弃/写失败）走「非零即报」周期 info，控噪不做恒发。

- 依据：`.forge/docs/proposals/diag-milestone-coverage/proposal.md`（裁决台账）· `walkthrough/batch-1/裁决.md`（三清单全通过，2026-11-01）。
