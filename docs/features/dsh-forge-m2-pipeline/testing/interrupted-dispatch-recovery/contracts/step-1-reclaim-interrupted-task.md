---
journey: "interrupted-dispatch-recovery"
step: 1
step-action: "dispatcher 外环再次领取同一任务"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/interrupted-dispatch-recovery/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: ""
---

# Contract: interrupted-dispatch-recovery / Step 1: dispatcher 外环再次领取同一任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — claimTask = agent 面 tool 调用，无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "任务处于 in_progress 但其执行记录缺失（模拟 executor 子会话中断——外环 Verify 显示 in_progress 未结算）；dispatcher 外环活跃（run-tasks 派发循环在运行）；中断前该任务曾领取过（有历史 claim 审计行）；任务前置仍全终态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verb"
            value: "claim（历史领取行在场；submit 结算行缺席）"
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "dispatcher 会话（重入授权源）"
- Input: "dispatcher 在外环中对执行记录缺失的 in_progress 任务再次调 claimTask（无需人工察觉中断；显式 taskRef 重入）"
- Output: "claimTask 对 in_progress 幂等重入——无状态转移（仍 in_progress；reclaimed=true）"
- State: "tasks 零状态变更；task_records 新增 claim 重入行（from/to 为空——无状态效应，digest 新值）；挂接表幂等不增行；恢复出口 = dispatcher 外环（零人工清理）"
- Side-effect: "写后事件照常发射（重入领取也是一次写动词）"
- Invariants: "幂等重入不产生状态转移与重复结算（任务保持 in_progress）"

## Outcome "record-present-no-misredispatch"
- Preconditions: "任务 in_progress 且执行记录在场（executor 正常执行中，record 未缺失——外环 Verify 尚未见未结算的 in_progress 终态）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "executionRecord"
            value: "在场（executor 正常执行中的活跃记录）"
- Input: "dispatcher 外环调 claimTask 尝试领取"
- Output: "按 record 在场判定非中断态，不触发重派路径；不产生重复派发或重复执行"
- State: "无重复结算、无状态破坏"
- Side-effect: "none"
- Invariants: "中断恢复零人工清理：恢复路径仅对「执行记录缺失」态触发"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_CLAIM_REENTRY（claim.ts:131「含幂等重入——前置回归即拒，dispatcher 须重规划」+ claim.ts:187-189 守卫适用一切路径）：中断期间某前置被人工置 rejected / suspended 等非终态时，重入领取被依赖守卫拒绝（ERR_DEPENDENCIES_UNMET）——中断窗口内前置回归的现实边界。 -->
## Outcome "prerequisite-regression-rejects-reentry"
- Preconditions: "任务 in_progress 且执行记录缺失（中断态）；其中断期间某前置依赖状态回归非终态（如人工置 suspended）"
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
            value: "T = in_progress 中断任务；P = T 的前置（非终态，如 suspended）"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task_id"
            value: "T"
          - field: "prerequisite_id"
            value: "P"
- Input: "dispatcher 外环 claimTask 同一任务（显式 taskRef 重入）"
- Output: "守卫拒绝——错误码 ERR_DEPENDENCIES_UNMET（data 带未满足前置清单）；dispatcher 须重规划（不可强行续链）"
- State: "任务保持 in_progress（无状态转移）；零残留"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_CLAIM_REENTRY（claim.ts:15-17「无 taskRef 的盲选不领 in_progress——双 dispatcher 并发不双派发」）：中断后常见双外环并存（旧循环未察觉 + 新循环启动），盲选不领他会话 in_progress 是并发安全边界。 -->
## Outcome "foreign-session-in-progress-not-blind-claimed"
- Preconditions: "任务 in_progress 且挂接于另一会话（他 dispatcher 会话的活）；当前会话无自己挂接的 in_progress；无就绪 pending 任务"
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
      - description: "当前会话在挂接表无行；无就绪 pending 任务（盲选无可领）"
        prerequisite_entity: "TaskSessionLink"
- Input: "当前 dispatcher 外环盲选调 claimTask（无 taskRef）"
- Output: "不领取他会话的 in_progress 任务（返回无就绪出口信号）；不产生双派发"
- State: "零变更"
- Side-effect: "none"

## Journey Invariants

- 中断恢复零人工清理：全程无人工介入即可续链（恢复出口 = dispatcher 外环）
- 幂等重入不产生状态转移与重复结算（任务保持 in_progress）
- 重派简报按当前状态重合成（digest 新值），dispatchPrompt 四段构成不变
- 审计链 append-only：中断与恢复不篡改既有记录

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
      field_constraints:
        - field: "taskStatus"
          value: "in_progress"
    - entity_type: "TaskRecord"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "claim"
    - entity_type: "TaskSessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
