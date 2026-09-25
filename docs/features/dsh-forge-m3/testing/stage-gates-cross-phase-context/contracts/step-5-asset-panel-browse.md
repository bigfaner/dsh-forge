---
journey: "stage-gates-cross-phase-context"
step: 5
step-action: "阶段资产面板只读浏览"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 详情(阶段资产 tab)"
    route: "workbench/features/<slug>"
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail → StageAssetsTab(第六 tab)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 5: 阶段资产面板只读浏览

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "feature 存在至少一份阶段资产(先行阶段已产出)"
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
- Input: "用户打开详情区「阶段资产」面板浏览"
- Output: "按阶段浏览目标 + 摘要只读渲染(经 MarkdownView 白名单,frontmatter + 摘要);无任何编辑入口"
- State: "纯读零写;面板内容 = stage_asset 索引寻址的文档根文件内容"
- Side-effect: "none"
- Invariants: "工作台呈现恒只读(白名单渲染)"

## Outcome "markdown-injection-guard"
<!-- source: prd-spec Security(markdown 防注入:阶段资产渲染经白名单) -->
- Preconditions: "阶段资产文件内含恶意 markdown 结构(脚本注入/危险链接)"
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
          - field: "content"
            value: "含恶意 markdown 结构(脚本注入/危险链接)"
- Input: "用户浏览「阶段资产」面板"
- Output: "渲染经 MarkdownView 白名单,注入内容不生效;面板严格只读(无编辑/写入口)"
- State: "文件内容零改动;面板呈现安全渲染结果"
- Side-effect: "none"
- Invariants: "渲染恒经 MarkdownView 白名单(防注入)"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
