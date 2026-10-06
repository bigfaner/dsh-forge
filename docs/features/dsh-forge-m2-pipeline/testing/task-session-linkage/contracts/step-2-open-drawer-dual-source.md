---
journey: "task-session-linkage"
step: 2
step-action: "打开任务详情抽屉查看挂接会话分型"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md
anchors:
  web:
    page: "任务详情抽屉（挂接区）"
    route: ""
    requires_auth: false
    layout: "右侧滑入浮层（EntryDrawer 形制，320–760px 可拖宽）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-session-linkage / Step 2: 打开任务详情抽屉查看挂接会话分型

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication（承旅程「Derived Outcomes 裁决」节）: validation-error N/A — 只读浏览面（抽屉查看），无表单。session-expired N/A — 本地单人工作台无服务端会话凭据，挂接读面直读本地每工作区库。 -->

## Outcome "success"
- Preconditions: "一次完整派发已发生（挂接表行 + submit 审计行在场，两侧会话 id 相异可判）；概览任务列表可见该任务行"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "任意（已完成派发链后通常 completed）"
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "dispatcher 主会话 id（派发源）"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verb"
            value: "submit"
          - field: "sessionId"
            value: "executor 子会话 id（执行源，与派发源相异）"
- Input: "点击任务行打开详情抽屉，查看挂接区"
- Output: "挂接区呈现两类分型展示——派发类与执行类；两类各自与其来源库记录一致（派发类对应挂接表行、执行类对应审计行会话 id——SC6③ 双数据源口径）；两侧会话 id 相异可判，不混示为同一会话"
- State: "无变更（只读；sessionLinks 读面 = links ∪ records.session_id 双源分型，不合并解释）"
- Side-effect: "none"
- Invariants: "双源分型不合并——同任务同会话双侧参与则两卡并存（诚实审计）"

## Journey Invariants

- 双侧展示与库记录一致：双数据源口径（挂接表行 = 派发会话；审计行 session_id = 执行会话），两类各自比对（SC6③）
- 挂接双侧为只读浏览面（不写库、不造挂接；本旅程一切 claim/submit 均为前置状态而非用户动作）
- 挂接展示随 session id 变化（无跨会话残留）
- 挂接数据直读每工作区库（无第二来源）
- 同一「任务 × 会话」挂接恒单一展示（库 UNIQUE 约束 + 读面直读映射——重领不产生重复 pill）

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
    - entity_type: "TaskSessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
    - entity_type: "TaskRecord"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "submit"
```
