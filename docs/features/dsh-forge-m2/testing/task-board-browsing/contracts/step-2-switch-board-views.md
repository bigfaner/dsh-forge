---
journey: "task-board-browsing"
step: 2
step-action: "切换状态分组/列表视图"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskGroupView / TaskListView(三视图 segmented 切换)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-board-browsing / Step 2: 切换状态分组/列表视图

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "任务看板已加载;fixture 含带执行分支名的任务(Setup 预置:真实 git worktree + 执行痕迹写入,生成器方言恒不虚构 branch/worktree 字段)与无执行痕迹任务并存"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "branch"
            value: "至少一个任务带非空执行分支名,至少一个任务为空(无执行痕迹)"
    state_requirements:
      - description: "跨面断言通道:任务集合一致性校验 = 测试进程直读 fixture forge 文件(浏览器侧不自行观测 CLI 输出)"
        prerequisite_entity: "Task"
- Input: "用户切换「状态分组」视图,再切换「列表」视图(segmented 三视图控件)"
- Output: "状态分组视图按 forge 任务状态(7 态,FT-033)分组展示;列表视图含执行分支名列——带执行分支的任务显示分支名、无执行痕迹的任务显示空占位(branch 可空、不虚构 forge 未写的字段,FT-032);任务集合与 forge 数据一致"
- State: "视图切换为会话期内存态(不持久化);任务数据不变(同一快照的不同投影)"
- Side-effect: "none(视图态本地记忆属 DF005 视图状态,不写事实数据)"
- Invariants: "7 态分组词表与 forge 状态一致;空占位不虚构字段"

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
      min_count: 10
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
