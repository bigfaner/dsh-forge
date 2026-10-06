---
journey: "fix-chain-auto-recovery"
step: 4
step-action: "源任务自动恢复"
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

# Contract: fix-chain-auto-recovery / Step 4: 源任务自动恢复

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 恢复钩子 = core 写路径内聚效果（无用户交互面）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "fix 任务已 completed（Step 3 落账）；源任务 X 处于 blocked 且其全部前置（含 fix）均 ∈ 满足集 {completed, skipped}"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "roles"
            value: "X = blocked 源（前置全终态）；F = completed fix"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task_id"
            value: "X（等待方）"
          - field: "prerequisite_id"
            value: "F（前置方）"
          - field: "origin"
            value: "fix-chain"
- Input: "恢复钩子触发（无需人工介入——fix 结算事务内聚）"
- Output: "源任务前置全满足时 blocked→pending（审计 verb='auto-restore'，actor='core'）；恢复行在场（e2e 断言）；依赖边保留不删"
- State: "tasks.task_status = pending（X）；task_records 新增 auto-restore 行（from=blocked，to=pending）；task_edges 零删除（边持久，满足 = 读时派生）"
- Side-effect: "写后事件发射（与 fix 的 submit 同事务单一事件——恢复钩子内聚不另发）"
- Invariants: "自动恢复只改状态不删边（verb='auto-restore' 审计在场，边保留）"

## Outcome "skipped-source-also-restores"
- Preconditions: "阻塞源 fix 任务被人工跳过（skipped，属终态满足集）；源任务 X blocked 且其余前置（若存在）均已终态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "roles"
            value: "X = blocked 源；F = skipped fix（人工跳过）"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "origin"
            value: "fix-chain（X 依赖 F）"
- Input: "恢复钩子触发（人工跳过结算或转移事务内聚）"
- Output: "源任务满足恢复条件（满足集 = {completed, skipped}）→ blocked→pending（审计 verb='auto-restore'）"
- State: "同 success 形态（X 恢复 pending + auto-restore 行；边保留）"
- Side-effect: "写后事件发射"
- Invariants: "依赖终态守卫满足集恒为 {completed, skipped}，恢复判定与领取判定同源"

## Outcome "partial-prerequisites-no-restore"
- Preconditions: "恢复钩子触发但源任务除 fix 外另有未终态依赖（如另一 blocked 或 in_progress 前置）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 3
        relationship_type: "has_many"
        parent_entity: "Project"
        field_constraints:
          - field: "roles"
            value: "X = blocked 源；F = completed fix；P = X 的另一前置（非终态，如 in_progress）"
      - entity_type: "TaskEdge"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task_id"
            value: "X（两条前置边：依赖 F 与依赖 P）"
- Input: "恢复钩子反查后继（F 完成触发）"
- Output: "源任务不恢复（保持 blocked）；待全部前置终态后再恢复（恢复判定 = 前置全满足，非任一满足）"
- State: "X 状态不变；无 auto-restore 行；边保留"
- Side-effect: "none（对 X 而言零变更）"

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
    - entity_type: "Task"
      min_count: 2
      relationship_type: "has_many"
      parent_entity: "Project"
    - entity_type: "TaskEdge"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "origin"
          value: "fix-chain"
```
