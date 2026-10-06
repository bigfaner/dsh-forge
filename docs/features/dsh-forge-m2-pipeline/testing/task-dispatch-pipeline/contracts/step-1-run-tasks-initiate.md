---
journey: "task-dispatch-pipeline"
step: 1
step-action: "在项目会话中发起 run-tasks"
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

# Contract: task-dispatch-pipeline / Step 1: 在项目会话中发起 run-tasks

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 本步骤用户动作 = 在会话中输入 run-tasks 技能指令（自然语言意图表达），非表单提交面，不存在可产生无效输入的表单字段。session-expired N/A — 本地单人工作台，无登录态与服务端会话凭据（与旅程级裁决一致）。 -->

## Outcome "success"
- Preconditions: "已注册工作区，其每工作区任务库中有某 feature 的就绪任务（前置依赖全部处于终态 completed 或 skipped）；工作区代码仓处于可提交状态（git 可用）；应用已启动，项目会话可发起技能指令"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: true
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
      - description: "该任务的全部前置依赖处于终态 {completed, skipped}"
        prerequisite_entity: "Task"
- Input: "单人开发者在项目会话中输入 run-tasks 技能指令，表达「让任务管线跑起来」的意图"
- Output: "dispatcher 进入派发循环；应用自身不发起任何编排动作（web 无编排逻辑），管线推进全部由 dispatcher 驱动"
- State: "无直接状态变更——本步骤是意图表达入口；后续管线推进由 dispatcher 经 claimTask tool 驱动（技能经 customSkillDirs 挂载，系统提示段 forge:pipeline 在场）"
- Side-effect: "无（run-tasks 技能指令本身零写入；写入始于 Step 2 的 claimTask）"

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
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
      field_constraints:
        - field: "taskStatus"
          value: "pending"
```
