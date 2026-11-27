---
title: 任务 type 词表校验缺口：schema enum 前移修复（原写入放行、派发 fail-loud）
summary: >-
  task-loop 任务 type 写入侧只查非空不查 TASK_TYPES 词表，非法 type（族名
  coding）入库成功、dispatchPrompt claim 点才 fail-loud 挂循环。已修复（932d88c0）：校验前移注册面
  schema——TASK_TYPE_ENUM 单源注入 add_task/update_task 参数 enum，batch
  以描述文本承载族名警示，to-tasks 文档改精确值口径。
keywords:
  - task-loop
  - task-type
  - schema-enum
  - fail-late
  - dispatch
  - to-tasks
id: type-fail-loud-unknown-task-type
status: confirmed
version_ts: '2026-11-24T03:26:06.398Z'
updated: '2026-11-24T03:26:06.398Z'
type: pitfalls
supersedes: '2026-11-23T17:08:35.028Z'
confirmed_at: '2026-11-27T16:09:03.019Z'
---
# 同族复发

主检出知识库既有同根因判例：`.knowledge/lessons/add-task-test-unknown-task-type-20261123…`（2026-11-16，add_task 接受 type="test" 入库，dispatch_prompt 派发期才校验词表阻塞循环）——本判例（type="coding"）为同一写入校验缺口的第二次复发。判例互引：add-task-test-unknown-task-type。

# 现象

to-tasks 拆解批次以 `type: "coding"` 入库成功（batch_add_tasks 全批通过落库），dispatch loop claim 阶段 fail-loud 挂起：`dispatchPrompt: unknown task type: coding`。5 任务全部滞留 pending，循环冻结待人工处置。

# 根因

**task-loop 写入路径缺 type 词汇表成员校验，校验时机 fail-late**：

- 拒绝点 `dispatchPrompt`（prompt/compose.ts）：`TASK_TYPES.includes(input.taskType)`——词汇表为 TASK_TYPES 封闭集（contracts 单源），无裸族名 `coding`。
- 写入链对 `type` 只查非空字符串/形制（add_task 工具层 `as TaskType` 强转、batch collectItemErrors 只查非空、update_task 直写列）——非法值直接入库。
- 同库对照：triage 路径 `optionalTaskType` 有成员检查——校验强度不一致。
- 诱发因子：to-tasks 技能文档写「type 按性质选 coding / doc / test / validation / gate / eval 族」——族名不是合法 type 值，按文档直译即产出非法值。

# 修复（已落地 932d88c0，task-loop 0.23.1——用户裁定 schema 层优先）

- **校验前移注册面 schema**：`TASK_TYPE_ENUM` 单源常量（tools/faces.ts，= contracts TASK_TYPES 全集展开）注入 add_task / update_task 参数 `enum`——官方 harness enum 关键字大量在用（承重假设经 app.asar 实证），非法值在 schema 层即拒，执行点零硬检查。
- batch_add_tasks items 为 JSON 串（schema enum 不可达），以参数描述文本承载族名警示（"family names like 'coding' are invalid"）。
- 诱发因子 to-tasks SKILL.md 类型映射行改精确值口径（族名照抄即派发期 fail-loud 警示）。
- dispatchPrompt 拒绝点保留为最后防线；存量脏数据走 update_task 修正（schema enum 同时约束修正径）。

# 现场处置（判例锚）

worker 侧修复：逐任务 `update_task` 改 type 为合法值，随后 `dispatchTask(slug, resume: true)` 续接挂起循环，已完成任务不重跑。
