---
journey: "stage-gates-cross-phase-context"
step: 6
step-action: "新阶段会话注入断言"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(派发链)→ 上游会话视图"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(派发)→ session 视图(注入断言经测试通道直读)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 6: 新阶段会话注入断言

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "feature 已推进至新阶段且先行阶段资产在场;项目可派发任务存在;测试通道可直读会话系统提示词"
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
        field_constraints:
          - field: "status"
            value: "推进后的新阶段"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "task_type"
            value: "可派发类型键"
- Input: "用户在新阶段启动会话/派发任务,经测试通道断言会话系统提示词"
- Output: "新阶段会话系统提示词强制包含目标 + 摘要(注入内容断言);可派发集只为当前(新)阶段任务"
- State: "预合成三要素之「feature 目标/摘要」= 最近先行阶段资产(排除 feature 当前阶段自身的总结);注入为确定性组装(禁模型调用)"
- Side-effect: "subagent 会话创建与预合成注入(host 通道)"
- Invariants: "上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
