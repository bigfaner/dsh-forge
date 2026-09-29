---
journey: "task-session-roundtrip"
step: 2
step-action: "查看挂接历史"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "任务详情 dock(C5)·挂接历史节"
    route: "board pane → TaskDetailPanel 第四手风琴节"
    requires_auth: false
    layout: "active/ended links 新→旧;ended 行可展开;active 挂接存在时会话运行中徽标"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 2: 查看挂接历史

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (get-task-detail 挂接行可直接比对;FT-112) -->

## Outcome "success"
- Preconditions: "任务详情 dock 已打开;该任务含 ≥1 条 active 挂接与 ≥1 条 ended 挂接(构造挂接历史)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "其一 active,其一 ended"
      - entity_type: "Session"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
- Input: "编排者察看 dock「挂接历史」节"
- Output: "active 与 ended 挂接完整呈现、新→旧排序;ended 行可展开查看历史;会话运行中徽标呈现(active 挂接存在)"
- State: "纯读;挂接数据零变更"
- Side-effect: "none"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
