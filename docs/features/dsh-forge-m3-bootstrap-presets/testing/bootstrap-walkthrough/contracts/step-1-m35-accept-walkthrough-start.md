---
journey: "bootstrap-walkthrough"
step: 1
step-action: "M3.5 提案评审 accepted（走查启动）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/bootstrap-walkthrough/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 评审流转对话框）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: bootstrap-walkthrough / Step 1: M3.5 提案评审 accepted（走查启动）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 承载 Outcome "validation-error-reason-empty"（评审流转对话框 = 表单提交步：reason 必填）; session-expired = N/A（本地单人工作台无登录态；走查时序耦合由库状态承载，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "M3.5（知识沉淀）提案已 Draft 在库且处于可评审状态；dsh-forge 自身工作区注册在应用内（自身 forge.db 活跃）；M3 预设机制就绪"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "target"
            value: "dsh-forge 自身仓库（自举靶）"
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "title"
            value: "M3.5（知识沉淀）"
          - field: "proposal_status"
            value: "draft 或 under-review（可评审）"
          - field: "mode"
            value: "expedition"
- Input: "单人开发者将 M3.5 提案评审流转至 accepted（reason 必填）"
- Output: "走查启动（即 M3.5 立项启动——时序耦合记账：走查时点 = 评审接受之时）；registerFeature 成链：feature 行 + proposal_id 谱系 + feature_records 审计行同事务落库"
- State: "proposals.proposal_status = accepted（decided_at 写入）；features 表新增 feature 行（挂该提案谱系）；feature_records 新增审计行（actor=core 成链内聚）"
- Side-effect: "feature 域审计行伴随写入（append-only）"
- Invariants: "成链门 = accepted ∧ mode=expedition；单步成链无半链状态"

## Outcome "walkthrough-not-started"
- Preconditions: "M3.5 提案仍为 draft 或内容未就绪（未到可评审态）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "draft"
          - field: "content_ready"
            value: "false（内容未就绪）"
- Input: "尝试启动走查"
- Output: "走查不启动（时序耦合记账：走查时点 = 评审接受之时）；无提前成链"
- State: "features 表无该提案对应行；提案状态不变"
- Side-effect: "none"

## Outcome "validation-error-reason-empty"
<!-- source: inferred -->
<!-- reasoning: 评审流转对话框为 web 表单提交步（page-map：目标态仅列五态机允许集 + reason 必填，空因拒绝留场）；M3.5 走查的接受动作共用该对话框——表单校验形态同门（M3_PROPOSAL_TRANSITION_RULE 域 + 对话框 reason 必填约定） -->
- Preconditions: "评审流转对话框已选目标态 accepted 但 reason 留空"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "draft 或 under-review"
- Input: "尝试提交流转（reason 为空）"
- Output: "拒绝且留场（空因拒绝——不落部分写库）；补因后可提交"
- State: "库状态不变；无成链（feature 行不创建）"
- Side-effect: "none"
- Invariants: "表单不提交 + 近场可更正重试（web validation-error 原生形态）"

## Journey Invariants
- 全程零 manifest.md 生成（文件系统断言）——库记账是唯一记账通道
- 任务/执行记录 100% 入自身 forge.db（自举飞轮第一批真实数据入库，无漂移）
- 走查即 M3.5 立项启动（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发（走查通过 = 纪律从纸面变现实）
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
