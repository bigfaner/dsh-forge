---
journey: "task-session-roundtrip"
step: 4
step-action: "打开顶层派发会话"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "项目工作台·中间会话面板(C2,会话定位)"
    route: "project(顶层路径 = 会话打开通道 top session id;Interface 6)"
    requires_auth: false
    layout: "挂接行顶层会话条目 → 打开并定位到会话视图"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 4: 打开顶层派发会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (顶层路径 = ctx.uiWorkspace.openSession(sessionId) 唯一写路径(openSessionTarget 顶层入参);M1 sessionFocus 主进程通道 = 冻结 fallback 保留,不参与 M4 链路(Interface 6);定位断言经 e2e;FT-109) -->

## Outcome "success"
- Preconditions: "挂接历史行呈现顶层会话条目,该会话存在且可打开"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
        field_constraints:
          - field: "role"
            value: "顶层派发会话(可打开)"
- Input: "编排者点击挂接行的顶层会话条目"
- Output: "该顶层会话经会话打开通道打开(与 subagent 打开同一通道,顶层入参 = 会话 id)并定位到会话视图"
- State: "工作台定位到目标会话;任务→会话打开路径 ≤1 次点击"
- Side-effect: "none"
- Invariants: "顶层与 subagent 同一会话打开通道、入参分工(会话 id vs subagent 地址三元组)"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
