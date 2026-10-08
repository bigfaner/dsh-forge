---
journey: "expedition-full-sdd-chain"
step: 1
step-action: "brainstorm 结构化探索产出提案"
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

# Contract: expedition-full-sdd-chain / Step 1: brainstorm 结构化探索产出提案

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（会话内技能探索步，无表单提交面；自由文本会话输入无字段级校验语义）; session-expired = N/A（本地单人工作台无登录态；提案落库即时可见，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "远征会话已确立（registry 默认或显式选择；规格技能全集可见）且处于技能行使态（brainstorm 探索执行中）；一个新方向待规格化；每工作区库与 feature_documents 就绪"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: true
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition（规格技能全集挂载）"
- Input: "单人开发者在远征会话经 brainstorm 技能结构化探索新方向"
- Output: "产出 proposal.md（经 tool 读写入提案域）；提案发现扫描建行（五态 draft 起步）；mode 溯源 = expedition 创建时写入"
- State: "proposals 表新增一行（status=draft、mode=expedition）；提案文档落工作区 docs/proposals 目录"
- Side-effect: "提案域写入动词事件落事件日志"
- Invariants: "全程经 tool 读写（零手工搬文件）——提案入提案域（createProposal）"

## Outcome "spec-skill-catalog-complete"
- Preconditions: "远征会话查看技能目录（枚举观察态——不涉 brainstorm 行使；会话系统提示技能目录投影可转录）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition"
- Input: "枚举远征会话技能目录"
- Output: "规格技能全集可见可用（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / brainstorm）；core 包技能目录无 git-commit / git-checkout 条目（移除/未迁断言）"
- State: "会话组合状态不变（只读核查）"
- Side-effect: "none"
- Invariants: "技能目录物理边界与 core 包移除断言（SC2）同门"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（feature 行 + proposal_id 谱系 + feature_records 审计行——无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案（任务挂 feature = 提案链）；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行（verb = 事件名、actor = plugin-tool/ui/core）
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费（概览四域全景一致）
