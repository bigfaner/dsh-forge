---
journey: "task-overview-review"
step: 2
step-action: "选择 feature 绑定"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）任务子 tab"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 2: 选择 feature 绑定

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — feature pill 选取为点选动作（选项集封闭），无自由输入表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "概览任务子 tab 可见；库中某 feature 的任务集存在（多态任务在场）"
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
- Input: "在任务子 tab 点击 feature pill 选择目标 feature"
- Output: "任务列表切换为该 feature 的任务集；数据全部直读每工作区库（数据来源断言，无第二来源）"
- State: "UI 绑定态变更（activeFeatureSlug 切换）；库无变更"
- Side-effect: "none"

## Outcome "ime-safe-bilingual-search"
- Preconditions: "任务标题 / key / 类型 / 状态含中英文混合数据；搜索栏可达"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "title"
            value: "中英文混合（含 CJK 字符与拉丁字符）"
- Input: "在搜索栏输入关键词（含中文组合输入过程——IME composition 态）"
- Output: "仅更新内容区（IME 安全——中文组合态不被打断）；中英双语匹配过滤生效（标题 / key / 类型 / 状态标签常量匹配）；切换子 tab 自动清空搜索"
- State: "内容区过滤结果更新；库无变更（服务端 core 过滤：tasks.list search 参数）"
- Side-effect: "none"

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
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
