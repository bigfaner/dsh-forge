---
title: blitz 直挂探针验证管线闭环的最小形态
summary: >-
  验证 forge 突击管线「提案→任务→派发→交付」闭环时，最小改动面配方是注册 blitz 提案 + 直挂单个 doc 探针任务 + worker
  产出探针文档落盘 .forge/probes/<slug>/（目录键 project.probes_dir；2026-11-27 前为
  .forge/docs/probes/）——diag-probe 一次通过（127s，零返工），后续同类管线验证可直接复用。
keywords:
  - 探针
  - 管线闭环
  - blitz
  - doc任务
  - 验证配方
id: blitz-probe-closed-loop-recipe
status: unconfirmed
version_ts: '2026-11-27T02:22:03.292Z'
updated: '2026-11-27T02:22:03.292Z'
type: lessons
procedure: true
supersedes: '2026-11-05T00:00:00.000Z'
---
# blitz 直挂探针验证管线闭环的最小形态

## 场景

需要验证 forge 突击管线状态链（提案注册 → 挂任务 → 派发 → worker 执行 → 交付落盘）是否可用，且不得污染真实特性容器。

## 做法

- 注册 blitz 提案（突击模式提案可不落盘文档根）。
- 直挂一个 type=doc 的探针任务，goal 只带验证目标；探针交付物 = 一份探针文档，落盘 `.forge/probes/<slug>/probe-report.md`（目录键 `project.probes_dir`，经 forge_dirs 查询）。
- 探针文档按「注册 / 挂任务 / 派发 / 执行」逐环记录验证事实，以文档自身即执行产物收尾（文档存在 = 全链走通）。
- 结论：一次通过，无需返工；后续同类流程验证探针可直接复用本形态。

## 适用条件

- 目的为管线/链路可用性验证，不涉及真实业务改动与质量门。
- 验证面在管线状态库自身（注册、派发、结算回执）。

## 反例边界

- 需验证质量门失败径、重派/回放、fix 链等异常路径时，单任务最小形态覆盖不了，需设计多帧探针。
- `.forge/probes/` 是 git 外分区（2026-11-27 起，`/forge-dir-init` 会写忽略条目）：探针文档含 .md 在内一律不提交。要留存的结论经收口复盘进入知识库，不靠提交探针文件。此前的做法「探针 .md 属文档可提交」已随落点迁移废止。

## 溯源

来源容器：diag-probe；来源任务：1.1（探针执行）/ 1.2（first-pass 复盘）；bug id：无。落点迁移：用户裁定 2026-11-27。
