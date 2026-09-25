---
journey: "stage-gates-cross-phase-context"
step: 1
step-action: "查看阶段 stepper 与门状态"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 看板(UF2 阶段化扩展)"
    route: "workbench/features"
    requires_auth: false
    layout: "WorkbenchShell → FeaturesPage(StatusStepper + GateHint)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 1: 查看阶段 stepper 与门状态

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
<!-- facts: FT-080(门 = stages/<当前阶段>.md 存在性,活性 fs 判定不吃索引时滞;阶段词表 prd→design→tasks→in-progress→completed) -->
- Preconditions: "已注册项目含一个处于中间阶段(如 tasks 阶段)的 feature;数据内核可查询阶段门状态"
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
            value: "词表内阶段值"
- Input: "用户进入工作台·Feature 看板,点击目标 feature"
- Output: "列表呈现各 feature 当前阶段(prd→design→tasks→in-progress→completed stepper);详情区呈现阶段门状态(总结已生成/未生成)与偏离标识(如有)"
- State: "门态由文档根阶段资产文件的在场性即时判定(与推进门同判定口径,不吃索引时滞);纯读零写"
- Side-effect: "none"
- Invariants: "门校验为确定性代码(无模型参与)"

## Outcome "asset-empty"
<!-- facts: UNKNOWN(空态占位呈现无 FT 条目;来源 = journey 边界 1b + 页面图 StageAssetsTab 既有 tab 呈现) -->
- Preconditions: "feature 尚无推进记录(早期阶段,文档根无 stages/ 资产)"
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
            value: "prd(早期阶段)"
    state_requirements:
      - description: "feature 目录下不存在 stages/ 目录或其中的资产文件"
        prerequisite_entity: "Feature"
- Input: "用户打开「阶段资产」面板"
- Output: "呈现无阶段资产占位说明(asset-empty,正常态),无错误"
- State: "纯读零写"
- Side-effect: "none"
- Invariants: "空态为正常呈现,非错误"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
