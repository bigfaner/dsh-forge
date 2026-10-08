---
journey: "expedition-full-sdd-chain"
step: 2
step-action: "提案评审流转至 accepted"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 评审流转对话框）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 2: 提案评审流转至 accepted

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 承载 Outcome "validation-error-reason-empty"（评审流转对话框 = 表单提交步：目标态 + reason 必填）; session-expired = N/A（本地单人工作台无登录态；流转写库双面同门即时可见，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "远征提案处于 draft（或经流转至 under-review）且评审决定接受（无修订/取代诉求）；库中该提案行在场"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "expedition"
          - field: "proposal_status"
            value: "draft（经 under-review 走人工裁决按钮）"
- Input: "单人开发者在概览提案子 tab 评审该提案（draft → under-review → accepted，人工裁决按钮，reason 必填）"
- Output: "提案状态落库 accepted（decided_at 写入裁决时刻）；双面流转同门——agent 经 transitionProposal 写库与人工面一致"
- State: "proposals.proposal_status = accepted；写库动词同一服务门（无第二写者）"
- Side-effect: "提案域转移动词事件落事件日志"
- Invariants: "双面流转同门（UI 人工裁决与 transitionProposal tool 写库一致）"

## Outcome "revised-back-to-draft"
- Preconditions: "提案处于 under-review，评审发现需修订"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "under-review"
- Input: "人工裁决打回（under-review → draft，reason 必填）"
- Output: "提案回到 draft；修订后再走接受——评审工作流完整可用（不破坏既有扫描行）"
- State: "proposals.proposal_status = draft；扫描行不动"
- Side-effect: "none"

## Outcome "superseded-evolution"
- Preconditions: "该提案已被后续版本取代（后继提案在场）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 2
        field_constraints:
          - field: "relation"
            value: "前版与后继（取代链目标在场）"
- Input: "将其流转至 superseded（superseded_by 必带——目标提案 id）"
- Output: "accepted → superseded 演进链可用；取代链在提案行谱系元数据可见（superseded_by 落库）"
- State: "proposals.proposal_status = superseded；proposals.superseded_by = 后继提案 id"
- Side-effect: "none"
- Invariants: "superseded 必带 supersededBy（目标在场校验；缺席拒绝）"

## Outcome "validation-error-reason-empty"
<!-- source: inferred -->
<!-- reasoning: 评审流转对话框为 web 表单提交步（page-map：目标态仅列五态机允许集 + reason 必填，空因拒绝留场）；远征链流转步共用该对话框——表单校验形态同门（M3_PROPOSAL_TRANSITION_RULE + 对话框 reason 必填约定） -->
- Preconditions: "评审流转对话框已选目标态但 reason 留空"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "draft 或 under-review"
- Input: "尝试提交流转（reason 为空）"
- Output: "拒绝且留场（空因拒绝——对话框不关闭、不落部分写库）；补因后可提交"
- State: "库状态不变（无部分写库）"
- Side-effect: "none"
- Invariants: "表单不提交 + 近场可更正重试（web validation-error 原生形态）"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费
