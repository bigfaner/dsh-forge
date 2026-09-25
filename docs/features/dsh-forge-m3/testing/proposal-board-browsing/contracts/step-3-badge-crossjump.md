---
journey: "proposal-board-browsing"
step: 3
step-action: "经徽标互跳 feature 看板"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/proposal-board-browsing/journey.md
anchors:
  web:
    page: "提案详情(feature 徽标)→ 工作台 · Feature 看板"
    route: "workbench/features/<slug>"
    requires_auth: false
    layout: "WorkbenchShell → ProposalDetail(徽标)→ FeaturesPage 对应条目"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: proposal-board-browsing / Step 3: 经徽标互跳 feature 看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "目标提案关联一个存在的 feature(徽标可渲染)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "featureSlug"
            value: "非空且指向存在的 feature"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "slug"
            value: "与提案关联值一致"
- Input: "用户点击提案的关联 feature 徽标,随后返回"
- Output: "跳转 feature 看板对应条目;可返回提案看板(返回来源)"
- State: "视图切换为会话期内存态(视图键切换);数据零变更"
- Side-effect: "none"
- Invariants: "互跳只读;返回来源页语义"

## Journey Invariants

- 提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)
- 渲染恒经 MarkdownView 白名单(防注入)
- 看板内容与文档根文件一致(派生视图);感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图且文件恒为事实源
