---
journey: "interrupted-dispatch-recovery"
step: 3
step-action: "executor 按重派简报继续执行并结算"
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

# Contract: interrupted-dispatch-recovery / Step 3: executor 按重派简报继续执行并结算

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 派发 + submitTask = agent 面 tool 调用，无 web 表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "重派简报已领取（digest 新值）；executor 可派发；任务仍 in_progress；中断前的实现工作可能已部分或全部落盘（恢复简报指示 VERIFY-ONLY——不重做）"
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
            value: "多次 claim（中断累积）+ submit 缺席（待本步骤补）"
- Input: "dispatcher 以重派简报派发 executor，executor 完成执行后 submitTask（result=success，summary 在场）"
- Output: "任务正常落账（completed + 审计 + git 提交）；链路自愈完成，全程无需人工清理"
- State: "tasks.task_status = completed；task_records 新增 submit 行（执行会话 id）；git 提交产生"
- Side-effect: "写后事件发射（概览即时见 completed）"
- Invariants: "中断恢复零人工清理：全程无人工介入即可续链"

## Outcome "manual-disposal-claim-rejected"
- Preconditions: "中断期间任务被人工转移（如人工置 blocked 或 skipped——状态已非 in_progress）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "人工处置态（如 blocked 或 skipped，非 in_progress）"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verbs"
            value: "claim（中断前）+ transition（人工处置行，actor='ui'）"
- Input: "dispatcher 外环 claimTask 同一任务（显式 taskRef 重入）"
- Output: "状态机转移校验拒绝非法领取（from 不匹配——agent 面矩阵：非 pending/blocked 态不可转 in_progress）；人工处置结果不被覆盖"
- State: "任务保持人工处置态；零残留（错误码 ERR_INVALID_TRANSITION）"
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
    - entity_type: "TaskRecord"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "claim"
```
