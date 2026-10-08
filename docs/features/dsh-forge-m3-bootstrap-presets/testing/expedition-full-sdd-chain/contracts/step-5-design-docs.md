---
journey: "expedition-full-sdd-chain"
step: 5
step-action: "ui-design / tech-design 产出设计与 UI 文档"
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

# Contract: expedition-full-sdd-chain / Step 5: ui-design / tech-design 产出设计与 UI 文档

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（会话内技能产出步，无表单提交面）; session-expired = N/A（文档落库即时可读，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "PRD 已入 feature_documents（Step 4）；远征会话规格技能可用"
  fixture_spec:
    entities:
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "doc_kind"
            value: "prd（需求文档已在场）"
- Input: "依次经 ui-design、tech-design 技能产出 UI 设计与技术设计文档"
- Output: "同门 upsertFeatureDoc 入 feature_documents（ui/、design/ 分层文档真实路径清单）"
- State: "feature_documents 新增 ui 与 design 两类文档行；feature 子 tab 对应中文分组可见真实路径"
- Side-effect: "feature 域审计行伴随写入（verb=doc-upsert，含相位推进）"
- Invariants: "文档入 feature_documents（upsertFeatureDoc）——零手工搬文件；同门幂等（同 kind 更新不重复）"

## Outcome "spec-skill-unavailable-outside-expedition"
<!-- source: inferred -->
<!-- reasoning: M3_PRESET_BLITZ_SKILL_DIRS——突击组合 customSkillDirs 仅含 plugin-forge 技能目录，规格技能目录物理缺位；在非远征组合的会话请求 ui-design/tech-design 属 Step 5 技能承载的真实边界（物理不可见，与 Step 1 目录核查面互补） -->
- Preconditions: "会话组合为突击（customSkillDirs 不含 plugin-forge-spec 技能目录）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（spec 技能目录物理缺位）"
- Input: "在该会话中经技能菜单请求 ui-design 或 tech-design"
- Output: "物理不可见（技能枚举面即证——目录物理缺 spec 探针）；非提示词劝阻"
- State: "会话状态不变；无规格文档产出路径"
- Side-effect: "none"
- Invariants: "规格技能承载恒绑定远征组合——模式边界靠机制不靠提示词纪律"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费
