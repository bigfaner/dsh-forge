---
journey: "fix-chain-auto-recovery"
step: 3
step-action: "修复任务执行至完成"
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

# Contract: fix-chain-auto-recovery / Step 3: 修复任务执行至完成

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 派发链 tool 调用（同 task-dispatch-pipeline 旅程 Step 2-5 形制），无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "fix 任务 F 在场且就绪（F 为 pending 且自身无未满足前置——fix 链常态：依赖边方向 = 源 X 依赖 F，F 不依赖源）；派发链活跃（run-tasks 循环在运行）"
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
            value: "源 X = blocked；fix F = pending 就绪（source_task_id = X）"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "origin"
            value: "fix-chain（X 依赖 F——恢复钩子反查用边）"
- Input: "派发链领取 fix 任务并执行（同派发链旅程），executor 质量门全过后 submitTask（result=success，summary 在场）"
- Output: "fix 任务 completed；恢复钩子被触发（blockers 反查后继——经 idx_edges_prerequisite 反查以 F 为前置的等待方）"
- State: "fix 任务 pending→in_progress→completed 全链落账（claim / submit 审计行）；git 提交产生；features 相位重算"
- Side-effect: "写后事件发射；恢复钩子效果在 Step 4 承载（同事务内）"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_SUBMIT_INPUT_VALIDATION + M2_ADD_ATOMIC_TRIPLE：fix 任务自身执行受阻时走同构分诊——submitTask result=blocked（reason 必带）+ 再 addTask --block-source 对 fix 挂 fix-of-fix（链深 +1，仍受 ≤6 守卫）。「单点失败不断链」对嵌套层级同样成立，是 fix 链协议的递归边界。 -->
## Outcome "fix-itself-blocked-deepens-chain"
- Preconditions: "fix 任务 F 执行中质量门未通过或受阻；F 的链深 < 6（挂 fix-of-fix 不超限）"
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
            value: "源 X = blocked；fix F = in_progress（source_task_id = X，链深可 +1）"
- Input: "executor 对 F 提交 submitTask result=blocked（reason 必带），随后 addTask --block-source（sourceTask = F）"
- Output: "F blocked + fix-of-fix 任务创建（同三件套原子语义，localId = fix-N 顺延）；链深 +1 且仍受 ≤6 守卫约束"
- State: "F blocked（auto-block 审计同事务）；新 fix 行 + fix-chain 边 + add 审计"
- Side-effect: "写后事件发射"

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
