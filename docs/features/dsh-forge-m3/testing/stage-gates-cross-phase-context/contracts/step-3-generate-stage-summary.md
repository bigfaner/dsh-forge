---
journey: "stage-gates-cross-phase-context"
step: 3
step-action: "生成阶段总结"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 详情(阶段门状态回流)"
    route: "workbench/features/<slug>"
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail(StatusStepper + GateHint)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 3: 生成阶段总结

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "feature 处于中间阶段;文档根可写;agent 会话可经 dsh 通道产出阶段总结(forge_stage_summarize 写面)"
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
- Input: "用户在 agent 会话完成阶段总结(经 dsh 通道/技能产出),回到 feature 看板查看"
- Output: "阶段资产文件(阶段目标 + 摘要)落于文档根;门状态更新为「总结已生成」(感知回流,免手动刷新)"
- State: "features/<slug>/stages/<stage>.md 写入(frontmatter 含 stage/generated/goal + 摘要正文;同阶段重写 = 覆盖更新);stage_asset 索引同步替换(写后即就位,零感知时滞);元数据(路径/阶段/生成时间)入内核快照"
- Side-effect: "内核写面落文档根文件(不经 forge CLI)"
- Invariants: "阶段资产 = 单一规范文件;元数据入 SQLite"

## Outcome "external-channel-summary"
- Preconditions: "阶段总结由外部会话/终端产出资产文件(非应用内通道)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "producedBy"
            value: "外部通道(终端/外部会话直写文件)"
- Input: "用户回看 feature 看板门状态"
- Output: "门状态经感知更新(≤5s 口径沿用感知链),与内部通道结果一致"
- State: "感知扫描将外部产出的资产收编入 stage_asset 索引;门态活性 fs 判定直接反映"
- Side-effect: "none"
- Invariants: "门判定吃活性 fs,不吃索引时滞 —— 内外部通道结果一致"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
