---
journey: "task-dispatch-execution-loop"
step: 1
step-action: "看板浏览并多选无依赖任务"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务看板"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(三视图 + BoardToolbar + SelectionFloatBar)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 1: 看板浏览并多选无依赖任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "已注册且完成 SoT 迁移的 fixture 项目处于激活态;所属 feature 处于可派发阶段;看板上存在至少 3 个依赖满足、状态为 pending 或 blocked(依赖已终态解锁语境)且带任务类型与执行 prompt 的任务"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "blockers"
            value: "空数组(无依赖)或全部上游已终态"
          - field: "task_type"
            value: "任一可派发类型键(如 coding.feature)"
- Input: "用户进入工作台·任务看板,浏览依赖树视图,勾选 3 个无依赖的可执行任务并点击工具栏「派发」进入待派发态"
- Output: "可派发任务集仅含依赖满足、状态允许(pending/blocked)且属于当前阶段的任务;3 个任务进入待派发态,浮动选择条呈现已选计数,派发入口可用;任务数/状态/依赖与数据内核一致"
- State: "选择模式为会话期内存态(已选集非持久化);数据内核任务行零变更"
- Side-effect: "none"
- Invariants: "可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务;看板呈现为内核权威行的派生快照"

## Outcome "deps-unmet-selection-blocked"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为多选校验失败(含依赖任务混入)的阻止 + 依赖关系提示 -->
- Preconditions: "用户勾选集内混入至少一个依赖未满足(或与集内任务互相依赖)的任务;其余前置同 success"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "blockers"
            value: "至少一个上游任务未终态(依赖未满足)"
- Input: "用户在勾选集含依赖未满足任务的状态下点击「派发」"
- Output: "派发被阻止并呈现依赖关系提示,blocker 指向可辨(错误码 ERR_TASK_DEPS_UNSATISFIED 语境,unmet 清单原词呈现);不启动任何 subagent"
- State: "数据内核零写入(全批前置校验原子:任一拒绝零落行);任务状态不变"
- Side-effect: "none"
- Invariants: "全批原子:任一任务的校验拒绝 = 整批零派发零 subagent 启动"

## Outcome "no-dispatchable-idle"
- Preconditions: "当前项目无任何满足派发条件的任务(依赖/状态/阶段均不满足)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "in_progress 或 completed(状态不允许派发)"
- Input: "用户察看任务工具栏派发入口"
- Output: "派发入口禁用并呈现引导说明;不存在可点选的派发路径"
- State: "无状态变更(idle 态纯呈现)"
- Side-effect: "none"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
