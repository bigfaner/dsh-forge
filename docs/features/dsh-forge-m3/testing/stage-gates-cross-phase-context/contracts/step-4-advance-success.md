---
journey: "stage-gates-cross-phase-context"
step: 4
step-action: "推进成功"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 详情(阶段 stepper 前移)"
    route: "workbench/features/<slug>"
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail(AdvanceStageButton + StatusStepper)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 4: 推进成功

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "当前阶段总结已生成(stages/<当前阶段>.md 存在,门满足)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "tasks(中间阶段)"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "stage"
            value: "与 feature 当前阶段一致(门资产在场)"
- Input: "用户再次请求推进"
- Output: "推进成功;阶段 stepper 前移(阶段推进至管线下一阶段)"
- State: "内核写 manifest status(唯一写面,其余字段与正文原文保留);feature_snapshot 派生缓存同步;偏离标记清除(合法推进 = 偏离清除点,last_external_at 保留审计);stage_advanced 事件推送"
- Side-effect: "manifest.md 文件写入(status 原位替换或前插);stage_advanced 事件"
- Invariants: "manifest 写入仅经 advanceStage 内核路径"

## Outcome "multi-advance-accumulation"
- Preconditions: "feature 先后完成多次阶段推进(各先行阶段资产齐全)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "in-progress(已多次推进)"
      - entity_type: "StageAsset"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "stage"
            value: "管线序中互异的前行阶段"
- Input: "用户打开「阶段资产」面板逐阶段浏览"
- Output: "各阶段资产按阶段完整累积、可回溯;面板内容与文档根文件一致"
- State: "stage_asset 索引按 (project, feature, stage) 累积;内容留文档根文件"
- Side-effect: "none"
- Invariants: "内容留文件、元数据入 SQLite;面板与文档根一致"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
