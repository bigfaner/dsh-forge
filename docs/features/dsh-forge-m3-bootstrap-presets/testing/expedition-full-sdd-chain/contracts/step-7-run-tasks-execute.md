---
journey: "expedition-full-sdd-chain"
step: 7
step-action: "run-tasks 派发执行"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「派发」按钮）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: expedition-full-sdd-chain / Step 7: run-tasks 派发执行

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（派发入口为状态门控按钮非表单；worker 结算校验归 gate-and-submit-discipline 旅程）; session-expired = N/A（无登录态；中断恢复由 Outcome "blocked-recovery" 承载——本地化连续性形态） -->

## Outcome "success"
- Preconditions: "任务集已建（DAG 依赖落库）；就绪任务在场（依赖满足）；工作区代码仓处于可提交状态（git 可用）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "task_status"
            value: "pending（依赖满足集内）"
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "git_available"
            value: true
- Input: "发起 run-tasks（会话内或任务子 tab「派发」入口）"
- Output: "worker 按 DAG 依赖顺序领取执行；AC gate → commit → submitTask 全绿（提交哈希入执行记录）"
- State: "任务依 DAG 顺序推进至 completed；执行记录（summary / files / gate / commit_hash）落库"
- Side-effect: "in-process worker spawn；工作区代码提交；task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl"
- Invariants: "AC gate 与提交纪律照旧（远征语义 stage-gate / eval 门在场）"

## Outcome "blocked-recovery"
- Preconditions: "某任务执行受阻（质量门未过或重大问题）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress（受阻中）"
- Input: "worker submit blocked（reason 必带）或经 addTask 走 fix 链"
- Output: "任务 blocked 落审计（reason 单源）；fix 链自动恢复（block_source 单事务、恢复钩子——M2 机制回归）；恢复后派发继续"
- State: "源任务 blocked → fix 完成后自动恢复 pending；fix 任务入链（链深 ≤6）"
- Side-effect: "fix 链审计行与事件落库"

## Outcome "zero-manual-file-transfer"
- Preconditions: "全链走完（或任一中间态）——文档 / 任务 / 提案均已入库（入库通道审计场景——只读对账，不触发派发动作）"
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
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "审计文档 / 任务 / 提案的入库通道（库与文件系统对账）"
- Output: "全程经 tool 读写：文档入 feature_documents（upsertFeatureDoc）、任务入任务域（addTask）、提案入提案域（createProposal / transitionProposal）——零手工搬文件"
- State: "库状态不变（只读审计）；三域条目均可溯源至 tool 写入动词"
- Side-effect: "none（审计通道）"
- Invariants: "零手工搬文件（文件系统与库对账）——规格资产可回放可消费"

## Journey Invariants
- 全程经 tool 读写（零手工搬文件）：文档 → upsertFeatureDoc、任务 → addTask、提案 → createProposal / transitionProposal
- 远征提案 accepted → registerFeature 单步成链原子性（无半链状态）
- 归属模型恒定：feature ⊂ 提案、任务 ⊂ 提案；feature 恒远征（成链门 = accepted ∧ mode=expedition）
- feature_records append-only 双触发器：feature 域每次写入伴随审计行
- 规格资产住进 forge.db 与 feature_documents——后续里程碑可回放、可消费
