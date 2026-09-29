---
journey: "task-session-roundtrip"
step: 1
step-action: "打开任务详情 dock"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "任务看板(右栏 pane)·任务详情 dock(C5)"
    route: "board pane(TabKind='board';双宿主 = 右栏 pane / 拆出窗)"
    requires_auth: false
    layout: "TaskDetailPanel 右缘 dock:min(440px,45vw) 窗宿主 / min(440px,100%) pane 宿主,无遮罩,看板保持可交互"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 1: 打开任务详情 dock

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (dock 契约 = 几何/焦点/无闪烁可核验;FT-111/FT-112) -->

## Outcome "success"
- Preconditions: "任务看板可用;存在执行中任务(in_progress 且存在 active 挂接)"
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
            value: "in_progress"
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
- Input: "编排者在任务看板点击该执行中任务行"
- Output: "右缘 dock 滑入(与现有 TaskDetailPanel 同构形态:min(440px, 45vw)、无遮罩、看板保持可交互、焦点陷阱 Esc/✕/外点关闭并归还焦点)"
- State: "dock 打开并承载该任务详情;切换任务原地换内容、无闪烁(aria-busy)"
- Side-effect: "none"
- Invariants: "dock 与现有 TaskDetailPanel 同构(右缘滑入/无遮罩/焦点陷阱)"

## Outcome "no-session-link"
<!-- source: journey Step 1b -->
<!-- reasoning: in_progress ∧ 无 active 挂接 → 常规 + 未挂接标注位(执行中判定矩阵;FT-108 族);No-link [发起] 按任务终态禁用 -->
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为未挂接/目标缺失的错误态呈现(no-link / open-failed) -->
- Preconditions: "任务 in_progress 但无 active 挂接(或全部挂接已 ended)"
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
            value: "in_progress"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "ended(无 active 挂接)"
- Input: "编排者打开该任务详情 dock"
- Output: "常规展示 + 「未挂接会话」标注 + 发起入口(no-link 态);不误呈执行 subagent 标识"
- State: "no-link 态呈现;不伪造血缘命中"
- Side-effect: "none"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
