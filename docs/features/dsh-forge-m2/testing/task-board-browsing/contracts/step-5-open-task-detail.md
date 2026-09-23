---
journey: "task-board-browsing"
step: 5
step-action: "打开任务详情"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDetailPanel(描述/依赖链/执行记录/挂接历史)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-board-browsing / Step 5: 打开任务详情

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "所选任务已有执行记录(Setup 预置:来源 = 会话/终端各至少 1)且该任务无挂接历史;看板正常加载"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "source"
            value: "会话与终端来源各至少一笔(fixture 内)"
      - entity_type: "SessionLink"
        min_count: 0
        relationship_type: "belongs_to"
        parent_entity: "Task"
    state_requirements:
      - description: "所选任务挂接历史为空:session_links 无该任务的行——挂接索引为工作台自有 SoT、不可从 forge 文件推导,fixture 须显式钉零(隔离 userData、零挂接写入足迹),挂接历史区因此确定为空态"
        prerequisite_entity: "Task"
- Input: "用户点击一个已有执行记录的任务卡片/节点"
- Output: "详情面板展示描述(任务文件原文只读渲染)、依赖链(上游 blocker 传递链,FT-055)、执行记录(时间/类型/来源/摘要),均可只读浏览;挂接历史区显示空态说明「该任务尚未挂接会话」(FT-052 detail.links.empty)"
- State: "选中任务态建立;任务详情载入(摘要 + 描述原文 + 依赖链 + 执行记录 + 挂接历史,组成见 FT-055;本 Outcome 挂接历史为空、呈现空态);执行记录如实呈现 forge 写入的记录(不虚构字段)"
- Side-effect: "none(只读)"
- Invariants: "详情无写操作入口;记录来源呈现与 forge 数据一致"

## Outcome "single-task-error"
<!-- source: inferred:「其余任务不受影响」= Step 1b 原子性的单任务粒度推广(失败面收敛于读取对象) -->
- Preconditions: "看板正常加载,但所选任务的单任务数据读取异常(如该任务记录文件损坏;fixture 副本注入)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "目标任务的记录文件在 fixture 副本上注入损坏(单任务粒度)"
        prerequisite_entity: "Task"
- Input: "用户点击该任务卡片/节点打开详情"
- Output: "详情面板显示错误(error)态与重试入口(UF3 error 行:单任务数据异常),不展示残缺的描述/依赖链/记录;看板其余任务浏览不受影响"
- State: "其余任务快照与选中态不受单任务失败影响;重试成功后该任务详情正常载入"
- Side-effect: "none(失败面收敛于被读对象)"

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
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "TaskRecord"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
    - entity_type: "SessionLink"
      min_count: 0
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
