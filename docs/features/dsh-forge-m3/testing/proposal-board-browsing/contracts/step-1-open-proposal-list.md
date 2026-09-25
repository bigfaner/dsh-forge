---
journey: "proposal-board-browsing"
step: 1
step-action: "打开提案列表"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/proposal-board-browsing/journey.md
anchors:
  web:
    page: "工作台 · 提案看板(第二 tab)"
    route: "workbench/proposals"
    requires_auth: false
    layout: "WorkbenchShell → ProposalsPage(ProposalCardGrid)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: proposal-board-browsing / Step 1: 打开提案列表

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "已注册项目激活;项目文档根 proposals/ 含至少 2 个提案(frontmatter 含 status/created/作者),其中至少 1 个关联 feature、至少 1 个未关联;至少 1 个提案含 eval 评估报告"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "frontmatter"
            value: "含 status/created/作者"
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "featureSlug"
            value: "非空(关联 feature)"
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "featureSlug"
            value: "空(未关联)"
      - entity_type: "EvalReport"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "用户切换到工作台·提案 tab"
- Output: "列表呈现全部提案,含 status/created/作者列与关联 feature 徽标(无关联不渲染徽标);工作台 tab 顺序 = 概览/提案/Feature/任务;内容与文档根一致(排序 = created 降序,平局 slug 升序)"
- State: "纯读(proposal_snapshot 派生索引 + hasEval 活性 fs 判定);零写入口"
- Side-effect: "none"
- Invariants: "提案看板全页面零状态写入口(只读硬约束)"

## Outcome "empty-state"
- Preconditions: "项目文档根 proposals/ 为空(或不存在)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "文档根 proposals/ 目录为空或不存在"
        prerequisite_entity: "Project"
- Input: "用户打开提案 tab"
- Output: "呈现「暂无提案」+ 路径说明(empty 态,正常呈现,无错误)"
- State: "纯读零写"
- Side-effect: "none"

## Journey Invariants

- 提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)
- 渲染恒经 MarkdownView 白名单(防注入)
- 看板内容与文档根文件一致(派生视图);感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图且文件恒为事实源
