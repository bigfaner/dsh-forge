---
journey: "task-session-roundtrip"
step: 7
step-action: "会话树反向标识"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)parent 会话行"
    route: "project(subagent 行 ↳ 缩进归拢;默认收起,行尾 ▾ 递归展开)"
    requires_auth: false
    layout: "subagent 会话归拢于 parent 血缘树下默认收起,不出现在顶层列表;会话树徽标与任务详情 dock 两侧互证"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 7: 会话树反向标识

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (归拢断言 = 顶层列表零 subagent 条目 + 血缘树下收起呈现;SC7 族) -->

## Outcome "success"
- Preconditions: "项目会话树含带 subagent 后代的 parent 会话;该任务的任务详情 dock 可对照"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "role"
            value: "parent 会话(带 subagent 后代)"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者察看代码区左栏 parent 会话行"
- Output: "subagent 会话归拢于 parent 血缘树下默认收起(行尾 ▾ 递归展开),不出现在顶层列表;会话树徽标与任务详情 dock 两侧均能识别该任务归属(反查互证)"
- State: "归拢结构只读呈现;两侧徽标一致"
- Side-effect: "none"
- Invariants: "subagent 会话永不出现在顶层列表(SC7 断言)"

## Outcome "rename-vs-lineage-conflict"
<!-- source: journey Step 7b -->
<!-- reasoning: 命名约定被破坏(手工改名)时血缘仍为唯一权威;C6 静默纠偏 by construction + 归拢/标识/打开走地址三元组(FT-108/FT-109/FT-110) -->
- Preconditions: "subagent 会话被手工改名(命名约定被破坏)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
        field_constraints:
          - field: "title"
            value: "被手工改名(偏离「任务 id + title」约定)"
- Input: "编排者从任务详情与会话树两侧反查"
- Output: "以血缘推断为准,命名仅作辅助展示;归拢/标识/打开均不受改名影响"
- State: "血缘结构不变;反查两侧一致"
- Side-effect: "none"
- Invariants: "血缘为唯一权威且纯只读"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
