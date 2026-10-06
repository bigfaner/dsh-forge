---
journey: "task-overview-review"
step: 5
step-action: "在任务行做人工状态决策"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "转移状态对话框（任务详情抽屉 / ⋯ 菜单发起）"
    route: ""
    requires_auth: false
    layout: "官方 Modal（抽屉与 ⋯ 菜单局部）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 5: 在任务行做人工状态决策

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: session-expired N/A — 本地单人工作台无服务端会话凭据。validation-error 由本步骤承载（转移对话框 = 表单提交面）——见 reason-required-empty-reject Outcome（surface-web 规则必派生项）。 -->

## Outcome "success"
- Preconditions: "目标任务在场且状态明确；转移对话框可达（抽屉或 ⋯ 菜单发起）；目标态在允许集内且 from 不等于 to；操作者备有原因文本"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "任意当前态（如 pending）"
- Input: "从抽屉或 ⋯ 菜单发起转移，选择目标态（from 不等于 to，目标态仅列允许集）并填写原因后确认"
- Output: "转移落库 + 审计记录（reason 必带）；概览列表即时反映新状态（写入返回后单次重取即见新值）"
- State: "每工作区库变更：tasks.task_status = 目标态；task_records 新增 transition 行（verb='transition'，actor='ui'，reason 落审计列）；若目标态 ∈ {completed, skipped} 且存在满足恢复条件的 blocked 后继则恢复钩子触发；features 相位重算"
- Side-effect: "写后事件 emitTasksChanged → 概览即时刷新；与 agent 写入同门（core 动词 API 单门）"

<!-- surface-required: web validation-error（表单提交步骤必派生——转移对话框 reason 表单） -->
## Outcome "reason-required-empty-reject"
- Preconditions: "转移对话框中 reason 留空；目标态已选定"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "任意当前态"
- Input: "确认提交转移（reason 为空）"
- Output: "拒绝提交（前端校验：错误提示「原因必填——填写后重试」；对话框留场，已选目标与已输入内容保留可修正）；无状态写入、无审计行"
- State: "零变更（输入面校验先于 RPC；服务端同序校验 ERR_REASON_REQUIRED 兜底）"
- Side-effect: "none"

## Outcome "illegal-target-not-offered"
- Preconditions: "所选目标态与当前态相同，或不在状态机允许集"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "当前态 S（from）"
- Input: "尝试提交转移（目标 = 当前态，或不合法目标）"
- Output: "拒绝（from 不等于 to 校验；目标态仅列允许集——所见即所得，用户点不到非法目标：选项集 = allowedTransitions 机械排除当前态；服务端同一纯函数先验 ERR_INVALID_TRANSITION 兜底）"
- State: "零变更"
- Side-effect: "none"
- Invariants: "转移目标态所见即所得：抽屉与菜单仅列状态机允许集（allowedTransitions 纯函数，服务端同源提前校验）"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_RESTORE_HOOK（transition.ts:45-82、128-130）+ M2_TRANSITION_DIALOG_GATING（transition-dialog.tsx:3-4「终态提示可能触发 autoRestore」）：人工转移到 completed/skipped 与 submitTask 同挂恢复钩子（C3 同族单一实现）——人工跳过阻塞源同样触发下游恢复，是转移面的代码在场边界。 -->
## Outcome "terminal-transition-triggers-restore"
- Preconditions: "目标任务 T 有 blocked 后继 W（W 依赖 T 且 T 是 W 最后一个未终态前置）；操作者将 T 人工转移到 completed 或 skipped；reason 已填"
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
            value: "T = 待转移源（blocked 后继的前置）；W = blocked 后继"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task_id"
            value: "W"
          - field: "prerequisite_id"
            value: "T"
- Input: "对 T 发起转移到 completed（或 skipped），填写原因确认"
- Output: "T 落目标态 + 审计；W 恢复钩子触发——W 由 blocked 转 pending（依赖边保留不删）；对话框终态提示可能触发 autoRestore"
- State: "tasks 两行状态变更（T 终态、W blocked→pending）；task_records 新增 transition 行（T，actor='ui'）+ auto-restore 行（W，verb='auto-restore'，actor='core'）"
- Side-effect: "写后事件发射（概览即时见两任务新状态）"

## Journey Invariants

- 概览数据全部直读每工作区库（无第二来源、无 watch / 回流 / 快照同步模块）
- 人工转移与 agent 写入同门（core 动词 API），每次转移必带 reason 且落审计
- 七态 chips 过滤与排序对三视图统一生效
- 转移目标态所见即所得：抽屉与菜单仅列状态机允许集（allowedTransitions 纯函数，服务端同源提前校验）
- 首屏性能判据恒成立：≤2s @500 任务

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 2
    - entity_type: "TaskEdge"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
