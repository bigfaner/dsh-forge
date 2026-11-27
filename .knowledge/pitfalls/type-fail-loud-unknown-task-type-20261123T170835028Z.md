---
title: 任务 type 词汇表校验缺口：写入放行、派发 fail-loud（unknown task type）
summary: >-
  task-loop 任务 type 写入侧只查非空字符串不查 TASK_TYPES 词汇表成员，非法 type（如 to-tasks 文档族名
  "coding"）入库成功、到 dispatchPrompt claim 点才 fail-loud 挂起循环——校验缺口在写入路径，处置是逐任务
  update type 后 resume。
keywords:
  - task-loop
  - task-type
  - validation
  - fail-late
  - dispatch
  - to-tasks
id: type-fail-loud-unknown-task-type
status: unconfirmed
version_ts: '2026-11-23T17:08:35.028Z'
updated: '2026-11-23T17:08:35.028Z'
type: pitfalls
procedure: true
candidate_of: snapnote
---
# 同族复发

主检出知识库既有同根因判例：`.knowledge/lessons/add-task-test-unknown-task-type-20261123…`（2026-11-16，add_task 接受 type="test" 入库，dispatch_prompt 派发期才校验词表阻塞循环）——本判例（type="coding"）为同一写入校验缺口的第二次复发，修复方向（写入侧成员校验）在先例中已提出但未落地。判例互引：add-task-test-unknown-task-type。

# 现象

to-tasks 拆解批次以 `type: "coding"` 入库成功（batch_add_tasks 全批通过落库），dispatch loop claim 阶段 fail-loud 挂起：`dispatchPrompt: unknown task type: coding`。5 任务全部滞留 pending，循环冻结待人工处置。

# 根因

**task-loop 写入路径缺 type 词汇表成员校验，校验时机 fail-late**：

- 拒绝点 `dispatchPrompt`（dist/host/index.js:35773）：`TASK_TYPES.includes(input.taskType)`——词汇表（:33186）为 `coding-feature / coding-enhancement / coding-cleanup / coding-refactor / coding-fix / code-quality-simplify / gate / doc / doc-consolidate / doc-drift / doc-review / doc-summary / test-run / test-gen-contracts / test-gen-journeys / test-gen-scripts / validation-code / validation-ux / eval-contract / eval-journey`，无裸族名 `coding`。
- 写入链 `collectItemErrors`（:35404）对 `type` 只查非空字符串；`parseItem`（:42193）只查形制——非法值直接入库。
- 同库对照：triage 路径 `optionalTaskType`（:41671）有成员检查（`越出任务类型全集`）——校验强度不一致。
- 诱发因子：`to-tasks` 技能文档写「type 按性质选 coding / doc / test / validation / gate / eval **族**」——族名不是合法 type 值，按文档直译即产出非法值。

# 修复方向

- 写入校验（add_task / batch_add_tasks / update_task）复用 `TASK_TYPES` 常量做成员检查（`ERR_TYPE_INVALID` + fix_hint 列合法集），与 triage 路径对齐——fail-early 于落库前（batch 语义 = 全批拒绝零写入）。
- to-tasks 技能文档同步给出合法值全列或改口为精确值。

# 现场处置（判例锚）

worker 侧修复：逐任务 `update_task` 改 type 为合法值（coding-enhancement / coding-cleanup / coding-feature），随后 `dispatchTask(slug, resume: true)` 续接挂起循环，已完成任务不重跑。
