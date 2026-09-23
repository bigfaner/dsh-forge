---
journey: "task-board-browsing"
step: 4
step-action: "查看 worktree 标识"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(卡片角标 + TaskDetailPanel)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-board-browsing / Step 4: 查看 worktree 标识

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "看板上存在在非默认 worktree 有执行痕迹的任务(Setup 预置:真实 git worktree + 执行痕迹写入 + 执行分支名)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "worktree"
            value: true
          - field: "branch"
            value: "非空执行分支名"
    state_requirements:
      - description: "fixture 以真实 git worktree 落地执行痕迹(生成器不虚构 branch/worktree 字段)"
        prerequisite_entity: "Task"
- Input: "用户点击该任务卡片/节点,查看卡片角标与详情内标识"
- Output: "worktree 标识可见(卡片角标);任务详情内标识可见"
- State: "选中任务态建立;worktree/branch 字段如实投影自快照"
- Side-effect: "none(只读)"

## Journey Invariants

- 人侧只读:看板任何视图与任务详情不出现任务状态变更的写操作入口
- 看板信息覆盖 forge task list 全部维度(状态/依赖树/worktree/记录),展示状态与 forge 7 态一致
- 只读浏览不产生任何 forge 数据变更,不写入注册表/挂接索引等工作台自有事实数据;当前视图/筛选/排序的本地记忆属 DF005 视图状态按需读写,不在此限(写入面细节留数据内核设计)
- 可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作,动态内容(任务卡片/状态列/详情)带可读名称(aria-label/文本,中英双语)——surface-web 可达性原则

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
