---
journey: "proposal-board-browsing"
step: 2
step-action: "查看提案详情与 eval 报告"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/proposal-board-browsing/journey.md
anchors:
  web:
    page: "工作台 · 提案详情子视图"
    route: "workbench/proposals/<slug>"
    requires_auth: false
    layout: "WorkbenchShell → ProposalDetail + DocViewer(只读渲染)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: proposal-board-browsing / Step 2: 查看提案详情与 eval 报告

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "目标提案存在(含正文)且含 eval 评估报告"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "body"
            value: "非空提案正文"
      - entity_type: "EvalReport"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "用户点击某提案条目,浏览正文与 eval 报告,随后返回"
- Output: "详情页呈现 proposal 正文与 eval 报告只读渲染(经 MarkdownView 白名单),内容与文档根文件一致;返回回到提案看板"
- State: "纯读(readProposalDoc 两 kind:proposal/eval);零写入口"
- Side-effect: "none"
- Invariants: "渲染恒经 MarkdownView 白名单(防注入)"

## Outcome "no-feature-badge"
- Preconditions: "提案未关联任何 feature(管线早期形态)"
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
            value: "空(无关联)"
- Input: "用户查看列表与该提案详情"
- Output: "列表不显示 feature 徽标;详情浏览照常可用(正常态,非错误)"
- State: "纯读;无关联为合法数据形态(NULL = 管线早期)"
- Side-effect: "none"

## Outcome "markdown-injection-guard"
<!-- source: prd-spec Security(markdown 防注入:提案/eval 渲染经白名单) -->
- Preconditions: "提案正文或 eval 报告文件内含恶意 markdown 结构"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "content"
            value: "含恶意 markdown 结构(脚本注入/危险链接)"
- Input: "用户浏览该提案详情"
- Output: "渲染经 MarkdownView 白名单,注入内容不生效"
- State: "文件内容零改动;呈现为安全渲染结果"
- Side-effect: "none"
- Invariants: "渲染恒经 MarkdownView 白名单(防注入)"

## Journey Invariants

- 提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)
- 渲染恒经 MarkdownView 白名单(防注入)
- 看板内容与文档根文件一致(派生视图);感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图且文件恒为事实源
