---
journey: "expedition-full-sdd-chain"
step: 6
step-action: "breakdown-tasks 建任务"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab DAG 视图）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 6: breakdown-tasks 建任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（会话内技能产出步，无表单提交面）; session-expired = N/A（任务落库即时可读，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "技术设计已入 feature_documents（Step 5）且该 feature 尚无任务行（首次拆解形态）；feature 行在场（挂提案链）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "doc_kind"
            value: "design（技术设计在场）"
- Input: "经 breakdown-tasks 技能从技术设计拆解任务"
- Output: "任务清单经 addTask 入任务域（挂 feature = 提案链）；远征语义 stage-gate / eval 门在场；依赖关系构成 DAG"
- State: "tasks 表新增若干行（容器 = feature、mode 快照 = expedition、local_id 数值顺延）；依赖边落库（增量环校验通过）"
- Side-effect: "任务域写入动词事件落事件日志"
- Invariants: "任务入任务域（addTask）——零手工搬文件；远征语义由 mode 快照决定"

## Outcome "dag-dependency-ordering"
- Preconditions: "任务集已建（依赖边在场——派发顺序核查场景；依赖关系构成 DAG）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "depends_on"
            value: "前置依赖集（至少一条边）"
- Input: "查看任务 DAG 视图并发起派发"
- Output: "依赖关系正确落库（DAG 视图呈现）；派发按 DAG 顺序领取（前置未终态不可领取——无越序）"
- State: "依赖边持久化；领取守卫按满足集判定（依赖全终态才放行）"
- Side-effect: "none"
- Invariants: "前置未终态不可领取（满足集 = completed ∪ skipped；无越序派发）"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费
