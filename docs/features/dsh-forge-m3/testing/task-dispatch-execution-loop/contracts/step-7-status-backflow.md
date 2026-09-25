---
journey: "task-dispatch-execution-loop"
step: 7
step-action: "agent 提交后状态回流看板"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务看板"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(编排角标谱)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 7: agent 提交后状态回流看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "backflow-success"
- Preconditions: "subagent 处于运行态并经 dsh tool 完成任务领取与提交;看板保持打开;感知链健康"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "in_progress(agent 已领取)"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "state"
            value: "running"
- Input: "agent 经 dsh tool 完成 claim/submit(留 actor 标识);用户保持看板打开观察任务卡片状态"
- Output: "任务状态 ≤5 秒回流看板,免手动刷新;完成态(done)呈现;actor 标识与看板来源标记一致"
- State: "内核权威任务行状态迁移(in_progress → completed),updated_by 记 session 会话标识;执行记录渲染入内核(记录可查);task_updated 事件随内核写直发(单批)"
- Side-effect: "task_updated 事件批推(≤500ms 合并语义由推送通道承载)"
- Invariants: "任务状态变更唯一通道 = agent 会话经 dsh tool;数据内核恒为事实源"

## Outcome "redispatch"
- Preconditions: "某 subagent 执行失败(派发行 failed 态,失败原因已记录)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "state"
            value: "failed"
          - field: "error"
            value: "非空失败原因"
- Input: "用户查看失败态卡片与原因,点击「重派发」并完成二次确认"
- Output: "失败状态与原因呈现;重派发需二次确认;确认后新 subagent 启动,重新进入运行态"
- State: "原 failed 派发行保留为审计轨迹;新派发行落库(重走检查/预合成说明);原行不修改"
- Side-effect: "新 subagent 会话创建与注入;dispatch_updated 事件推送"
- Invariants: "重派发不抹除审计轨迹(新行承载重试)"

## Outcome "concurrent-serial-backflow"
- Preconditions: "多个并行 subagent 先后完成提交(各自独立派发行)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "in_progress"
      - entity_type: "Dispatch"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "state"
            value: "running"
- Input: "多笔提交先后到达;用户保持看板打开观察任务卡片"
- Output: "每笔提交 ≤5 秒逐笔回流,来源与 actor 标识一致;最终状态与数据内核一致"
- State: "各任务行独立迁移互不串扰;每笔写独立事件批;最终看板呈现 = 内核权威行集"
- Side-effect: "多笔 task_updated 事件逐批推送"
- Invariants: "并行互不串扰:独立提交、独立回流"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
