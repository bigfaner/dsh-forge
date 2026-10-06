---
journey: "task-dispatch-pipeline"
step: 2
step-action: "dispatcher 领取就绪任务"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-dispatch-pipeline/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: ""
---

# Contract: task-dispatch-pipeline / Step 2: dispatcher 领取就绪任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 本步骤为 agent 面 tool 调用（claimTask），无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "库中存在就绪任务：某 pending 任务的前置依赖全部处于终态 {completed, skipped}；dispatcher 会话活跃"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "taskStatus"
            value: "pending"
    state_requirements:
      - description: "目标任务的全部前置依赖（若存在 task_edges 行）处于 {completed, skipped}"
        prerequisite_entity: "Task"
- Input: "dispatcher 经 claimTask tool 领取任务（无需人工介入；无显式 taskRef 的盲选或带 taskRef 定位）"
- Output: "任务 pending→in_progress；返回 TaskSnapshot + dispatchPrompt + digest；审计记录 verb='claim'（含派发会话 id）；挂接表落行；dispatchPrompt 构成 = 人格段（task-executor，无标签）+ <constraints> 约束块 + <task-context> 动态信息块（含 BLOCKERS 依赖快照）+ <type-policy> 类型策略块"
- State: "每工作区库变更：tasks.task_status = in_progress；task_records 新增 claim 行（actor='plugin-tool'，dispatch_digest = sha-256 全文前 12 hex）；task_session_links 新增行（INSERT OR IGNORE）；features 相位重算"
- Side-effect: "写后事件发射——事务提交后 emitTasksChanged(projectId) → process.send → webContents.send('forge:events/tasks-changed')，概览在写入返回后单次重取即见新值"

## Outcome "no-ready-tasks"
- Preconditions: "库中无就绪任务：任务前置均未满足，或全部已处终态，或库中无任务"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "任务库中不存在任何前置全终态的 pending 任务（空库 / 全终态 / 前置未满足三态任一）"
        prerequisite_entity: "Task"
- Input: "dispatcher 调 claimTask 尝试领取（盲选）"
- Output: "无任务被领取——返回空出口信号（task 为 null、dispatchPrompt 与 digest 为空串、reclaimed 为 false）；派发循环等待或结束；不制造虚假就绪"
- State: "无状态转移、零写入（纯读出口，不发射事件）"
- Side-effect: "none"

## Outcome "dependencies-unmet-guard-rejects"
- Preconditions: "某 pending 任务存在未终态前置依赖（满足集 {completed, skipped} 之外的状态，如另一 in_progress 或 blocked 前置）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "taskStatus"
            value: "pending"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "prerequisiteStatus"
            value: "not in {completed, skipped}"
- Input: "dispatcher 调 claimTask 尝试领取该任务（显式 taskRef 定位）"
- Output: "依赖终态守卫拒绝放行——错误码 ERR_DEPENDENCIES_UNMET，data 携带未满足清单（前置自然键 + 当前状态）；不产生部分领取或越序领取"
- State: "库状态不被破坏（单事务全成全败，零残留）；目标任务保持 pending"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_CLAIM_REENTRY（claim.ts:15-17、63-78）：盲选仅领本会话 links 已挂接的 in_progress（最新挂接优先），无 taskRef 的盲选不领他会话 in_progress——双 dispatcher 并发不双派发。派发链旅程的并发边界，代码侦察在场行为。 -->
## Outcome "blind-claim-skips-foreign-in-progress"
- Preconditions: "库中存在 in_progress 任务，其挂接会话为另一会话（非当前 dispatcher 会话）；当前会话无自己挂接的 in_progress 任务，且无其它就绪 pending 任务"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "异于当前 dispatcher 会话 id"
    state_requirements:
      - description: "当前会话在 task_session_links 中无任何行；库中无就绪 pending 任务"
        prerequisite_entity: "TaskSessionLink"
- Input: "dispatcher（会话 A）盲选调 claimTask（无 taskRef）"
- Output: "不领取他会话的 in_progress 任务——返回无就绪出口信号（task 为 null），不产生重复派发"
- State: "零变更（该任务不进入重入路径；就绪选择仅扫 pending 池）"
- Side-effect: "none"

## Journey Invariants

- 每次写动词必产生一行 append-only 审计记录：claim 记派发会话 id，submit 记执行会话 id
- 任务状态唯一来源 = 每工作区库状态机（七态转移矩阵）；所有转移经 core 动词 API 单门（UI 与 tool 同门，无第二写者）
- dispatchPrompt 四段构成恒定：人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 快照）+ 类型策略块——executor 唯一差异化通道
- 概览列表数据全部直读每工作区库，无 watch / 回流 / 快照同步模块
- 应用自身不发起编排动作；对代码仓的写入仅限 executor 结算的 git 提交

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Feature"
    - entity_type: "TaskEdge"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
    - entity_type: "TaskSessionLink"
      min_count: 1
```
