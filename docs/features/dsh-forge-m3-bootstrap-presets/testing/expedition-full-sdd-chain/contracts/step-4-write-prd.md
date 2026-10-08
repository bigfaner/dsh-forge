---
journey: "expedition-full-sdd-chain"
step: 4
step-action: "write-prd 产出需求文档"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: "概览 · feature 子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（feature-tab.tsx 分层文档区）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 4: write-prd 产出需求文档

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（会话内技能产出步，无表单提交面）; session-expired = N/A（文档落库即时可读，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "远征 feature 已成链（feature 行在场）；远征会话规格技能可用"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
        field_constraints:
          - field: "proposal_id"
            value: "谱系挂接在场"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition"
- Input: "单人开发者在远征会话经 write-prd 技能产出 PRD（用户故事 + 规格）"
- Output: "文档经 upsertFeatureDoc 入 feature_documents；feature 子 tab 分层文档区可见真实路径（prd/ 分组——需求文档组）"
- State: "feature_documents 新增/更新一行（feature_id + doc_kind 挂接，rel_path 为相对 feature 目录真实路径）；相位推进载于 doc-upsert 审计"
- Side-effect: "feature 域审计行伴随写入（verb=doc-upsert）"
- Invariants: "文档入 feature_documents（upsertFeatureDoc）——零手工搬文件"

## Outcome "upsert-idempotent"
- Preconditions: "同一文档经技能重复产出/修订（同名同路径——feature_documents 已有该 feature_id + doc_kind 行）"
  fixture_spec:
    entities:
      - entity_type: "FeatureDocument"
        min_count: 1
        field_constraints:
          - field: "doc_kind"
            value: "与再次写入同 kind（同名同路径）"
- Input: "再次经 upsertFeatureDoc 写入该文档"
- Output: "更新既有行而非重复建行（幂等）；feature_documents 无重复条目"
- State: "feature_documents 行数不变（内容更新）；无重复 (feature_id, doc_kind) 条目"
- Side-effect: "审计行记录本次 doc-upsert（from/to 相位推进）"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费
