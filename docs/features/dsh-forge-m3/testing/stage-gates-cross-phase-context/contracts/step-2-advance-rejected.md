---
journey: "stage-gates-cross-phase-context"
step: 2
step-action: "总结未生成时请求推进被拒"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 看板(UF2 阶段化扩展)"
    route: "workbench/features/:slug"
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail(AdvanceStageButton + GateHint 缺失清单引导)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 2: 总结未生成时请求推进被拒

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "gate-rejected"
<!-- facts: FT-080(门不满足 → ERR_STAGE_GATE_UNSATISFIED + 缺失产物引导文案,点名期望路径与产出工具;活性 fs 判定);FT-081(拒绝路径不产生任何推进写入) -->
- Preconditions: "feature 处于中间阶段且当前阶段的总结资产未生成(文档根不存在 stages/<当前阶段>.md)"
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
            value: "tasks(中间阶段)"
      - entity_type: "ManifestFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "frontmatter.status"
            value: "tasks(与 feature 当前阶段一致;零写入断言的观察基线)"
    state_requirements:
      - description: "features/<slug>/stages/<当前阶段>.md 不存在(总结未生成)"
        prerequisite_entity: "Feature"
- Input: "用户请求将该 feature 推进到下一阶段"
- Output: "请求被门拒绝;拒绝文案可观察并引导缺失动作(生成阶段总结,提示期望资产路径与产出工具);feature 阶段不变"
- State: "推进零生效(feature 阶段与详情呈现零变更,零写入);门校验为活性文件判定(确定性代码,不吃索引时滞)"
- Side-effect: "none"
- Invariants: "阶段推进门为编排层硬门:总结未生成必拒绝推进"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
