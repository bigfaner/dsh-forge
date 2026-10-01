---
journey: "task-session-roundtrip"
step: 6
step-action: "查看 subagent 会话任务元数据并双向互达"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "项目工作台·中间会话面板(C2)·C6 任务元数据条"
    route: "project(conversation.input.dock 座位:composer 上方 forge 自绘条)"
    requires_auth: false
    layout: "bound 态:任务号/标题/状态/所属 feature Pill + 查看任务 ghost;点击跳回 C5 任务详情 dock"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 6: 查看 subagent 会话任务元数据并双向互达

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (C6 三态 bound/ambiguous/unbound 纯推导;血缘为准静默纠偏;FT-110) -->

## Outcome "success"
- Preconditions: "subagent 会话视图在屏;血缘反推命中唯一任务(bound 态)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "任一合法任务态(bound 态元数据含状态)"
          - field: "feature_slug"
            value: "所属 feature 派生来源(元数据条「所属 feature」呈现)"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active(项目内唯一 active 挂接——血缘反推唯一命中的布景)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
        field_constraints:
          - field: "role"
            value: "顶层派发会话"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者察看 subagent 会话视图头部任务元数据条,并点击它"
- Output: "元数据条呈现任务号/标题/状态/所属 feature(bound 态);点击跳回任务详情 dock(会话侧 ↔ 任务侧双向互通)"
- State: "任务↔会话双向互达成立;元数据注入零侵入原生会话视图"
- Side-effect: "none"
- Invariants: "血缘为准(非会话标题);零侵入槽位体系内"

## Outcome "multi-task-ambiguity"
<!-- source: journey Step 6b -->
<!-- reasoning: C6 ambiguous 态 = 多任务共会话 → 「该会话执行中」会话级标注、无任务号无跳转(2.5 粒度局限呈现;FT-110);布景 = 两任务各持 active 挂接、指向同一顶层会话(一话多任务,经 SessionLink/Session 约束表达,血缘绑定不落库) -->
- Preconditions: "同一顶层会话连续执行多个任务(一话多任务)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "两条 active(分属两任务,指向同一顶层会话)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
        field_constraints:
          - field: "role"
            value: "顶层派发会话(两任务共用)"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者察看 subagent 会话元数据条"
- Output: "呈「该会话执行中」会话级标注(ambiguous 态);任务级精度为 M5 派发协议重构备注,不误指单一任务"
- State: "ambiguous 态:无任务号、无跳转入口"
- Side-effect: "none"

## Outcome "unbound-no-metadata"
<!-- source: inferred -->
<!-- reasoning: FT-110 三态之 unbound(血缘反推零命中 → C6 条不呈现);触发规则 = 任务 → session_links active → 血缘树 反推零命中(如挂接已全部 ended 或会话无任务上下文 spawn);布景 = ended 挂接在场、无 active(active 链路缺位即零命中) -->
- Preconditions: "subagent 会话视图在屏,但血缘反推零命中(无任何任务经 active 挂接关联到该会话血缘,如挂接已全部 ended)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "任一合法任务态(状态与挂接正交)"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "ended(无 active 挂接——反推零命中布景)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
        field_constraints:
          - field: "role"
            value: "顶层会话(在场)"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者察看该 subagent 会话视图头部(composer 上方座位)"
- Output: "任务元数据条不呈现(unbound 态渲染为空:无任务号、无状态、无跳转);原生会话视图功能不受影响"
- State: "C6 元数据条零渲染;会话视图保持原生形态"
- Side-effect: "none"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
