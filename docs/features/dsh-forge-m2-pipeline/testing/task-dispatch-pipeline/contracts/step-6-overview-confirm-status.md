---
journey: "task-dispatch-pipeline"
step: 6
step-action: "开发者在概览任务列表确认新状态"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-dispatch-pipeline/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab（dock tab 注册制，guide 入口卡最前）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-dispatch-pipeline / Step 6: 开发者在概览任务列表确认新状态

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读浏览面（查看任务列表），无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "派发链已完成 submit 落账（任务 completed 或 blocked）；概览 tab 已打开或可打开；事件订阅通道在场"
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
        field_constraints:
          - field: "taskStatus"
            value: "completed 或 blocked（submit 落账后的新值）"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "单人开发者打开（或已打开）概览页签查看任务列表"
- Output: "概览列表在写入返回后单次重取即见新值（completed / blocked）——「即时」判据成立，无 watch、无同步延迟；任务行主行呈现 ID + 标题 + 中文状态 tag"
- State: "UI 读态刷新（数据全部直读每工作区库，无第二来源）；库无变更"
- Side-effect: "none（读路径零写入）"

## Outcome "concurrent-browse-no-lock-contention"
- Preconditions: "概览页签处于打开状态且用户正在浏览（读路径活跃）；派发链即将执行写入动词（claim / submit）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "taskStatus"
            value: "pending 或 in_progress（写入动词作用前状态）"
    state_requirements:
      - description: "概览 tab 处于打开且用户正在浏览（活跃读路径）"
        prerequisite_entity: "Project"
- Input: "派发链写入动词（claim / submit）发生的同时用户持续浏览概览列表"
- Output: "tool 写入与 UI 读取无锁竞争（派发循环与页签浏览互不阻塞）；列表在写入返回后单次重取即见新值"
- State: "写动词正常落库（WAL 模式读写并发）；UI 不冻结、不阻塞、不丢更新"
- Side-effect: "写后事件推送（forge:events/tasks-changed）与用户交互重取双通道并存"

## Journey Invariants

- 每次写动词必产生一行 append-only 审计记录：claim 记派发会话 id，submit 记执行会话 id
- 任务状态唯一来源 = 每工作区库状态机（七态转移矩阵）；所有转移经 core 动词 API 单门（UI 与 tool 同门，无第二写者）
- dispatchPrompt 四段构成恒定：人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 快照）+ 类型策略块——executor 唯一差异化通道
- 概览列表数据全部直读每工作区库，无 watch / 回流 / 快照同步模块
- 应用自身不发起编排动作；对代码仓的写入仅限 executor 结算的 git 提交

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
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
    - entity_type: "TaskRecord"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
