---
journey: "interrupted-dispatch-recovery"
step: 2
step-action: "领取重新合成的执行简报"
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

# Contract: interrupted-dispatch-recovery / Step 2: 领取重新合成的执行简报

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 简报领取 = tool 返回消费，无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "重入领取已发生（reclaimed=true）；任务库状态在中断窗口内可能已变化（动态信息按当前库状态取数）"
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
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verbs"
            value: "两次 claim（中断前 + 重入），dispatch_digest 相异"
- Input: "dispatcher 接收 claimTask 的返回"
- Output: "返回按当前状态重新合成的 dispatchPrompt（动态信息块按当前库状态实时取数：BLOCKERS 快照 / PHASE_SUMMARY / 谱系标记）；digest 新值（与中断前简报相异可判）；四段构成不变（人格段 + 约束块 + 动态信息块 + 类型策略块）"
- State: "无额外状态变更（合成 = 领取瞬间取数，纯函数）；重入 claim 记录的 dispatch_digest 列 = 新值"
- Side-effect: "none（合成在 Step 1 的写事务内完成）"
- Invariants: "重派简报按当前状态重合成（digest 新值），dispatchPrompt 四段构成不变"

## Outcome "repeated-interruptions-idempotent"
- Preconditions: "同一任务连续多次中断（执行记录持续缺失）；每次中断后外环仍活跃"
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
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "claimRows"
            value: "多次中断累积多行 claim（每行各带当次 digest）"
- Input: "dispatcher 外环多次 claimTask 同一任务（每次中断后一次显式重入）"
- Output: "每次均无状态转移（仍 in_progress，reclaimed=true），每次返回重合成简报（digest 逐次可判新值）；不产生重复转移记录（转移面零行——重入行 from/to 为空）"
- State: "tasks 状态恒 in_progress；task_records 累积 append-only claim 行（审计链不篡改既有记录）"
- Side-effect: "每次领取照常发射写后事件"
- Invariants: "审计链 append-only：中断与恢复不篡改既有记录"

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
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "claim"
```
