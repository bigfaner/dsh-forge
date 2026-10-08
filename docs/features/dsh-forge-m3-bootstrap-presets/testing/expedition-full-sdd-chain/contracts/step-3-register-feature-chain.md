---
journey: "expedition-full-sdd-chain"
step: 3
step-action: "registerFeature 单步成链"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 3: registerFeature 单步成链

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（成链为接受触发的服务内聚动作，无表单交互面）; session-expired = N/A（成链原子性由库事务承载，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "远征提案已流转至 accepted（成链门 = accepted ∧ mode=expedition）；该提案尚无对应 feature 行"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "accepted"
          - field: "mode"
            value: "expedition"
- Input: "远征提案 accepted 触发成链（无需人工另起步骤）"
- Output: "单步成链：feature 行 + proposal_id 谱系 + feature_records 审计行原子写入；transitionProposal 返回携带 chained feature 行"
- State: "features 表新增一行（proposal_id 谱系挂接）；feature_records 新增审计行（成链内聚 actor=core）"
- Side-effect: "feature 域审计行伴随写入（append-only）"
- Invariants: "远征提案专属——blitz/NULL mode 接受不成链；幂等（同 proposal 已有 feature 不重复建链）"

## Outcome "chain-atomicity"
- Preconditions: "成链写入过程中发生故障（或注入失败）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "accepted"
          - field: "mode"
            value: "expedition"
          - field: "fault_injection"
            value: "成链事务中段失败（写入过程故障）"
- Input: "检查库中 feature 行 / proposal_id 谱系 / feature_records 审计行"
- Output: "三者要么全部写入要么全不写（单事务原子断言）——无半链状态（有 feature 行无谱系、或无审计行）"
- State: "失败注入下库保持事务前状态（回滚）；成功路径下三件同在"
- Side-effect: "none（事务边界内）"
- Invariants: "registerFeature 单步成链原子性——无半链状态是硬约束"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（feature 行 + proposal_id 谱系 + feature_records 审计行——无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案（任务挂 feature = 提案链）；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行（verb = 事件名、actor = plugin-tool/ui/core）
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费（概览四域全景一致）
