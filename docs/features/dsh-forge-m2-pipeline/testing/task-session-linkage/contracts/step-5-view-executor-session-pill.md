---
journey: "task-session-linkage"
step: 5
step-action: "切换到 executor 子会话查看头部"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md
anchors:
  web:
    page: "会话头挂接 pill 行（SessionTaskPills，executor 子会话侧）"
    route: ""
    requires_auth: false
    layout: "conversation.session.header.actions 槽（list 注册）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-session-linkage / Step 5: 切换到 executor 子会话查看头部

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication（承旅程「Derived Outcomes 裁决」节）: validation-error N/A — 只读查看面，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "executor 匿名子会话在场且其 id 与某 submit 审计行 session_id 一致（该子会话曾结算该任务）；此前曾查看过 dispatcher 会话头部（跨会话残留检验起点）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verb"
            value: "submit"
          - field: "sessionId"
            value: "executor 子会话 id（与 dispatcher 主会话 id 相异）"
- Input: "切换到 executor 匿名子会话查看会话头部"
- Output: "头部展示挂接任务，pill 分型标识为执行（该会话的挂接来源 = submit 落审计行的会话 id）；pill 随 session id 即时变化（不残留上一会话的派发类展示）"
- State: "无变更（record 源读面）"
- Side-effect: "none"

<!-- 旅程边界（journey.md Step 5b，source: inferred 注记承旅程——挂接读面 = links ∪ records.session_id 库行直读） -->
## Outcome "no-linkage-session-empty"
- Preconditions: "会话从未 claim 过任何任务，亦无以其为执行会话的审计行（无挂接数据）；另有一个从未 claim 过任何任务的会话在场"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
    state_requirements:
      - description: "目标会话在 task_session_links 与 task_records.session_id 两源均无匹配行"
        prerequisite_entity: "Task"
- Input: "查看该会话头部"
- Output: "无挂接 pill 展示，不渲染空占位（无匹配行即无展示元素）"
- State: "无变更"
- Side-effect: "none"

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
    - entity_type: "TaskRecord"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
      field_constraints:
        - field: "verb"
          value: "submit"
```
