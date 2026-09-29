---
journey: "task-session-roundtrip"
step: 3
step-action: "识别执行 subagent 会话"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "任务详情 dock(C5)·挂接历史·active 行展开"
    route: "board pane → LinkHistory 行展开血缘后代"
    requires_auth: false
    layout: "血缘推断命中 origin=subagent 会话被标识,「任务 id + title」命名展示;推断为运行时只读计算"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 3: 识别执行 subagent 会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (血缘 = 点击时纯只读重算,不落库;FT-106/FT-107/FT-108;预算 100ms 合作式死线) -->

## Outcome "success"
- Preconditions: "active 挂接的顶层会话血缘树内存在 origin=subagent 会话且数量在上限内(≤20)、推断在预算内(≤100ms)完成(执行体按派发 prompt 注入的命名约定以「任务 id + title」命名 spawn)"
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
        field_constraints:
          - field: "role"
            value: "顶层派发会话"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
        field_constraints:
          - field: "title"
            value: "「任务 id + title」命名(命名约定桩验证)"
- Input: "编排者展开 active 挂接行,察看血缘内执行 subagent 会话标识"
- Output: "血缘推断命中的 origin=subagent 会话被标识,以「任务 id + title」命名展示(命名约定 + 血缘双重校验)"
- State: "推断为运行时只读计算,不落库、可随时重算(≤100ms 预算内)"
- Side-effect: "none"
- Invariants: "血缘为唯一权威;命名仅辅助"

## Outcome "no-subagent-hit"
<!-- source: journey Step 3b -->
<!-- reasoning: 血缘树内无 origin=subagent 会话(如顶层会话自身执行);打开动作落到顶层派发会话,不误报;布景 = 不声明 SubagentSession(实体缺位即无命中) -->
- Preconditions: "active 挂接顶层会话血缘树内无 origin=subagent 会话(如顶层会话自身执行)"
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
            value: "顶层派发会话"
- Input: "编排者点击绑定会话入口"
- Output: "打开动作落到顶层派发会话;不误报 subagent、无空转报错"
- State: "正常态(非错误);零降级日志"
- Side-effect: "none"

## Outcome "inference-degraded"
<!-- source: journey Step 3c -->
<!-- reasoning: ≤100ms 合作式死线超时/快照缺席 → 降级仅顶层会话,静默(单行结构化日志),下次调用自动恢复(FT-106);不阻塞 dock 其余节 -->
- Preconditions: "血缘推断计算 >100ms 或失败(快照缺席/预算超时)"
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
            value: "active(挂接保持,不因降级撤销)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "SessionLink"
        field_constraints:
          - field: "snapshot"
            value: "在场但血缘树规模使计算 >100ms,或缺席/畸形(FT-106 两类降级触发源,均可布景)"
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
        field_constraints:
          - field: "title"
            value: "「任务 id + title」命名(在场;降级期暂不呈现)"
- Input: "编排者察看挂接历史节/会话树"
- Output: "降级为仅呈现顶层会话 + 血缘标注不可用说明(inference-degraded 态);恢复后自动回完整模式;不阻塞 dock 其余节"
- State: "挂接保持、后代暂不呈现;单行结构化降级日志([forge-lineage] degraded);纯重算使下次调用自动恢复"
- Side-effect: "none"
- Invariants: "降级不打断呈现(BIZ-resilience-001)"

## Outcome "descendant-cap-fold"
<!-- source: inferred -->
<!-- reasoning: FT-107(LINEAGE_DESCENDANT_LIMIT=20,后代列表至上限、尾部「查看全部」折叠,溢出不破坏 parent 树折叠)× BIZ-workbench-007;触发规则 = 血缘后代数 > 20 且推断在预算内完成(journey Step 3 后代呈现的规模上界) -->
- Preconditions: "active 挂接顶层会话血缘树内 origin=subagent 会话数超过上限(>20),且推断在预算内(≤100ms)完成"
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
        field_constraints:
          - field: "role"
            value: "顶层派发会话(后代规模超上限)"
      - entity_type: "SubagentSession"
        min_count: 21
        relationship_type: "belongs_to"
        parent_entity: "Session"
- Input: "编排者展开 active 挂接行,察看血缘后代列表"
- Output: "后代列表呈现至 20 条上限,尾部「查看全部」折叠入口承接其余;溢出不破坏 parent 会话树归拢折叠"
- State: "后代列表截断于上限、其余经折叠可达;推断只读不落库"
- Side-effect: "none"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
