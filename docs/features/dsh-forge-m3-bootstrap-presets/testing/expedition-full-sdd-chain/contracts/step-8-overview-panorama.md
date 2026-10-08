---
journey: "expedition-full-sdd-chain"
step: 8
step-action: "概览四域全景核查"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（提案 / feature 文档 / 任务三视图跨面核查）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 8: 概览四域全景核查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（核查型观测步，无表单交互面）; session-expired = N/A（本地单人工作台无登录态；全景读面即时直读库，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "全链走完：提案 accepted、feature 成链、分层文档在场、任务终态与执行记录在场"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "accepted"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
      - entity_type: "FeatureDocument"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "doc_kind"
            value: "分层多类（prd / ui / design 至少两类在场）"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "task_status"
            value: "终态"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "单人开发者打开概览核查提案 / 文档 / 任务 / 记录四域"
- Output: "四域全景一致（e2e 一条链断言）：提案 accepted、feature 行与谱系在场、分层文档真实路径、任务终态与执行记录、审计行伴随"
- State: "库状态不变（只读核查）"
- Side-effect: "none"
- Invariants: "概览四域全景一致——规格资产可回放、可消费"

## Outcome "audit-rows-accompany"
- Preconditions: "feature 域发生过多次写入（register / transition / doc-upsert）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
      - entity_type: "FeatureRecord"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "verb"
            value: "多次写入动词（register / doc-upsert 等）"
- Input: "检查 feature_records 表"
- Output: "feature 域全部动词每次写入伴随审计行（表断言）；append-only（UPDATE / DELETE 直接 ABORT）"
- State: "feature_records 行数与写入动词一一对应；篡改尝试被触发器拒绝"
- Side-effect: "none（表断言通道）"
- Invariants: "feature_records append-only 双触发器——审计行伴随是硬约束"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行（verb = 事件名、actor = plugin-tool/ui/core）
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费（概览四域全景一致）
