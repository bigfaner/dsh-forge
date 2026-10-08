---
journey: "blitz-direct-chain"
step: 2
step-action: "提案评审 accepted → 直接进入任务阶段"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: blitz-direct-chain / Step 2: 提案评审 accepted → 直接进入任务阶段

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 承载 Outcome "validation-error-reason-empty"（评审流转对话框 = 表单提交步：目标态 + reason 必填）；session-expired = N/A（本地单人工作台无登录态；流转写库即时可见，无会话凭据过期路径） -->

## Outcome "success"
- Preconditions: "突击提案处于可流转态（draft 或 under-review）且评审决定接受（无修订诉求）；任务已直挂该提案（Step 1 产出）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
          - field: "proposal_status"
            value: "draft 或 under-review"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
        field_constraints:
          - field: "mode"
            value: "blitz"
- Input: "在概览提案子 tab 将该突击提案流转至 accepted（人工裁决按钮，reason 必填）"
- Output: "提案状态落库 accepted；直接进入任务阶段——任务即可 run-tasks 派发；提案子 tab 行状态即时更新"
- State: "proposals.proposal_status = accepted（decided_at 写入裁决时刻）；无 feature 行创建、无文档域创建；feature 子 tab 不出现该提案的 feature"
- Side-effect: "none（blitz 接受不成链——成链门 = accepted ∧ mode=expedition）"
- Invariants: "突击只有提案与任务（用户裁决 2026-10-07）；接受动作不触发 registerFeature"

## Outcome "revised-back-to-draft"
- Preconditions: "提案处于 under-review，评审发现需修订"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
          - field: "proposal_status"
            value: "under-review"
- Input: "人工裁决打回（under-review → draft，reason 必填）"
- Output: "提案回到 draft；任务阶段未进入（打回期间不派发）"
- State: "proposals.proposal_status = draft；任务行不动；修订后可重新走接受"
- Side-effect: "none"

## Outcome "no-feature-row-on-accept"
- Preconditions: "突击提案已被接受（accepted）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
          - field: "proposal_status"
            value: "accepted"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "检查 feature 子 tab 与文档域（读面核查）"
- Output: "无 feature 行 / 无文档域（断言）；feature 子 tab 不出现该提案的 feature；任务直挂提案"
- State: "features 表无该 proposal_id 对应行；feature_documents 无该容器条目"
- Side-effect: "none"

## Outcome "validation-error-reason-empty"
<!-- source: inferred -->
<!-- reasoning: 评审流转对话框为 web 表单提交步（page-map：目标态 + reason 必填，空因拒绝留场）；proposal-review-mode-transition Step 2b 同门同形（M3_PROPOSAL_TRANSITION_RULE + 模式更改/流转对话框 reason 必填约定）——blitz 链的流转步共用同一对话框，表单校验形态同门 -->
- Preconditions: "评审流转对话框已选目标态 accepted 但 reason 留空"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "draft 或 under-review"
- Input: "尝试提交流转（reason 为空）"
- Output: "拒绝且留场（空因拒绝——对话框不关闭、不落部分写库）；补因后可提交"
- State: "库状态不变（无部分写库）；提案状态保持原值"
- Side-effect: "none"
- Invariants: "表单不提交 + 近场可更正重试（web validation-error 原生形态）"

## Journey Invariants
- 突击链 gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样
- 任务语义由 mode 溯源（blitz）决定：整数 ID / 无 stage-gate / eval 门豁免
- 突击无 feature 阶段：提案与任务之外无中间层
- 概览三视图即时口径：写入返回后单次重取即见新值
