---
journey: "task-session-roundtrip"
step: 5
step-action: "打开 subagent 执行会话"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md
anchors:
  web:
    page: "项目工作台·会话面板(subagent 定位)"
    route: "project(subagent 路径 = openSessionTarget(SubagentAddress) 原生 API)"
    requires_auth: false
    layout: "血缘命中行 [打开] → SubagentAddress 三元组原样入参(mode 成员原词);≤1 次点击"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: task-session-roundtrip / Step 5: 打开 subagent 执行会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (subagent 路径 = SubagentAddress 三元组;拒绝面 ERR_SESSION_OPEN_FAILED → open-failed toast;FT-109) -->

## Outcome "success"
- Preconditions: "血缘推断命中 origin=subagent 会话且其地址三元组可解析"
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
      - entity_type: "SubagentSession"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Session"
        field_constraints:
          - field: "address"
            value: "SubagentAddress 三元组可解析(含 mode 成员)"
- Input: "编排者点击执行 subagent 会话条目"
- Output: "经 dsh 原生 SubagentAddress 打开该 subagent 会话;任务→会话打开路径 ≤1 次点击(e2e 断言)"
- State: "会话视图定位到该 subagent 会话;零侵入(上游公共 seam)"
- Side-effect: "none"
- Invariants: "subagent 走 SubagentAddress(双通道分工)"

## Outcome "open-target-missing"
<!-- source: journey Step 5b -->
<!-- reasoning: 打开通道对缺席上游服务/畸形目标/抛错 open 一律拒绝(ERR_SESSION_OPEN_FAILED),C5 侧 toast 呈 open-failed,不静默不崩溃(FT-109) -->
<!-- surface-web required_outcomes 映射:session-expired → 宿主/会话通道不可用使打开动作失败,呈现为 open-failed 明确错误 + 恢复引导,不静默 -->
- Preconditions: "待打开会话已不存在或已清理"
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
          - field: "status"
            value: "已不存在或已清理(目标缺失)"
- Input: "编排者点击会话条目"
- Output: "明确错误提示「会话不存在或已清理」(open-failed 态);不静默、不崩溃"
- State: "打开动作失败呈错误态;工作台状态不受损"
- Side-effect: "none"

## Journey Invariants

- 血缘推断为唯一权威且纯只读:不落库、可随时重算;命名(任务 id + title)仅辅助,冲突时以血缘为准
- subagent 会话永不出现在代码区左栏顶层列表;恒归拢于 parent 血缘树下默认收起(SC7 断言)
- 任务→会话打开路径 ≤1 次点击;顶层走 session-focus、subagent 走 SubagentAddress
- dock 与现有 TaskDetailPanel 同构:右缘滑入、无遮罩、看板保持可操作、焦点陷阱关闭并归还焦点
- subagent 会话视图的任务元数据注入不破坏 dsh 原生会话视图功能(零侵入,插件槽位体系内)
- 血缘推断点击时计算 ≤100ms,超时降级为仅顶层会话
