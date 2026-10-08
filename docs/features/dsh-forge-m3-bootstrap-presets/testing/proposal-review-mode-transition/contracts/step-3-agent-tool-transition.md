---
journey: "proposal-review-mode-transition"
step: 3
step-action: "agent 经 transitionProposal tool 流转"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: proposal-review-mode-transition / Step 3: agent 经 transitionProposal tool 流转

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（agent tool 面非 web 表单——拒绝形态由服务校验承载）; session-expired = N/A（无登录态；tool 写库与人工面同门即时可见） -->

## Outcome "success"
- Preconditions: "另一提案在场（可流转态——流转场景：to_status 与 reason 已定）；agent 会话可调 transitionProposal tool"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "非终态（可流转）"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "tool_face"
            value: "transitionProposal 可达（agent 面）"
- Input: "agent 会话经 transitionProposal tool 对另一提案流转一次（to_status + reason）"
- Output: "写库结果与人工面一致（同门动词，对比断言）；agent tool 面无模式改写动词（契约断言——模式不可变边界）"
- State: "proposals.proposal_status = 目标态（与人工面同门写径）"
- Side-effect: "提案域转移动词事件落事件日志"
- Invariants: "双面流转同门——无第二写者"

## Outcome "proposal-doc-jump"
- Preconditions: "提案挂有文档（链接点击场景——proposal.md 及其他文档行）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
      - entity_type: "ProposalDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "点击提案行文档链接"
- Output: "文档跳转可用（dock 文档 tab 打开对应文档）；文档区标题「文档（N 篇）」计数真实"
- State: "读面跳转（dock 文档 tab 激活对应文档）；库状态不变"
- Side-effect: "none"

## Journey Invariants
- 模式绑定三律：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- 双面流转同门：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按创建时快照执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
