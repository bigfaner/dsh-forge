---
journey: "fix-chain-auto-recovery"
step: 1
step-action: "executor 受阻提交 blocked"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/fix-chain-auto-recovery/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: ""
---

# Contract: fix-chain-auto-recovery / Step 1: executor 受阻提交 blocked

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — submitTask = agent 面 tool 调用（reason 必带校验在动词输入面），无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "任务 X 处于 in_progress 且执行受阻（executor 即将提交 blocked）；工作区每工作区任务库可写，审计记录链在场；依赖边表无环（健康起点）"
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
            value: "in_progress"
    state_requirements:
      - description: "task_edges 无环（健康起点——本 Outcome 场景无依赖边）"
        prerequisite_entity: "Task"
- Input: "executor 调 submitTask result=blocked（reason 必带，描述受阻原因）"
- Output: "任务 X in_progress→blocked，reason 落审计（task_records.reason 列）；返回 { taskId, status='blocked', restored }"
- State: "tasks.task_status = blocked；task_records 新增 submit 行（verb='submit'，reason，执行会话 id，actor='plugin-tool'）；应用不发起任何编排动作"
- Side-effect: "写后事件发射（概览即时见 blocked）"

## Outcome "blocked-reason-required"
- Preconditions: "executor 提交 blocked 但 reason 缺席；任务 X 处于 in_progress"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
- Input: "executor 调 submitTask result=blocked（无 reason）"
- Output: "拒绝提交——错误码 ERR_REASON_REQUIRED；任务状态不变更，不进入 fix 链"
- State: "零变更（不落部分审计）"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_SUBMIT_FROM_GATE（submit.ts:50-52；state-machine.ts:49-62）：submit 唯一合法 from = in_progress——fix 链场景中源任务可能已被人工处置（如人工置 skipped），此时 executor 的 blocked 结算被 agent 面矩阵先验拒绝，与派发链旅程 3b 同口径的对称边界。 -->
## Outcome "from-mismatch-rejected"
- Preconditions: "任务 X 实际状态非 in_progress（如中断期间已被人工转移为 suspended 或 skipped）；executor 持受阻事实尝试结算"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "非 in_progress（如 suspended）"
- Input: "executor 调 submitTask result=blocked（reason 在场）"
- Output: "拒绝并回报校验提示（错误码 ERR_INVALID_TRANSITION——from 不匹配，agent 面矩阵先验）"
- State: "库状态不被破坏（人工处置结果不被覆盖）；零残留"
- Side-effect: "none"

## Journey Invariants

- fix 链三件套原子性：fix 任务行 + 依赖边 + 源任务置 blocked 于单事务完成，任一失败全部不落
- task_edges 恒无环：成环写入必被拒绝且回报完整环路径
- 依赖终态守卫满足集恒为 {completed, skipped}，恢复判定与领取判定同源
- 自动恢复只改状态不删边（verb='auto-restore' 审计在场，边保留）
- fix 链深度 ≤6：超限拒绝并提示人工介入

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
          value: "in_progress"
```
