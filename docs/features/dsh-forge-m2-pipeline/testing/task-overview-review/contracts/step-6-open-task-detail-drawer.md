---
journey: "task-overview-review"
step: 6
step-action: "查看模块化任务详情"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "任务详情抽屉"
    route: ""
    requires_auth: false
    layout: "右侧滑入浮层（EntryDrawer 形制，320–760px 可拖宽，净新增拖宽手柄）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 6: 查看模块化任务详情

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读抽屉浏览面，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "目标任务在场（多态任务之一）；抽屉入口可达（任务行 / DAG 节点 / 泳道卡片）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskType"
            value: "任意（条件区按类型呈现）"
      - entity_type: "TaskRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "点击任务行 / DAG 节点 / 泳道卡片打开详情抽屉"
- Output: "右侧滑入抽屉呈现通用区（类别彩色 chip + 优先级 + 复杂度）+ 状态条件区（blocked 显示阻塞原因）+ 按类型条件区（fix 链 / 覆盖率 / 测试面 / 质量门 / 评估结果）+ 执行时间线（verb / from 到 to / reason / summary / gate / commit / digest）+ 挂接 + 转移入口"
- State: "UI 抽屉态变更（打开 + 数据水化：files_json / commit 只读 git 查找 / refs 水化 / allowedTransitions）；库无变更"
- Side-effect: "none（git 只读查询失败静默回退记录语，无写入）"

<!-- source: inferred -->
<!-- reasoning: Fact Table 前端侦察 data-dswf-td-eval-empty 锚 + tech-design L141「eval 类型的评估结果：M2 无技能写入——vars/summary 自由文本承载，抽屉按类型条件区呈空态注记」——eval 类型任务的条件区空态是代码在场的类型条件分支边界。 -->
## Outcome "eval-type-conditional-section-empty-note"
- Preconditions: "目标任务类型为 eval 族（如 eval-contract / eval-journey）；M2 无 eval 技能写入（无结构化评估结果负载）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskType"
            value: "eval 族类型（eval-contract 或 eval-journey）"
- Input: "打开该任务的详情抽屉，查看按类型条件区（评估结果区）"
- Output: "评估结果条件区呈空态注记（类型条件区在场但不伪造结构化评估数据）"
- State: "无变更"
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
    - entity_type: "Task"
      min_count: 1
      field_constraints:
        - field: "taskType"
          value: "任意（eval 族见条件 Outcome）"
    - entity_type: "TaskRecord"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
