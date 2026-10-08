---
journey: "proposal-review-mode-transition"
step: 2
step-action: "人工裁决流转（UI 按钮）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/journey.md
anchors:
  web:
    page: "评审流转对话框"
    route: ""
    requires_auth: false
    layout: "模态（官方 Modal——proposal-tab 局部；Esc / 取消返回，空因拒绝留场）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: proposal-review-mode-transition / Step 2: 人工裁决流转（UI 按钮）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 承载 Outcome "empty-reason-refused"（本步 2b：裁决对话框 = 表单提交步——reason 必填、空因拒绝留场，web validation-error 原生形态）; session-expired = N/A（本地单人工作台无登录态；流转写库即时可见，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "目标提案处于可流转态、目标态在允许集内且 reason 已填（提交即成功形态）；提案行 ⋯ 菜单可达"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "非终态（可流转）"
- Input: "在某提案行 ⋯ 菜单点「评审流转…」，选目标态并填 reason 提交"
- Output: "对话框目标态仅列五态机允许集 + reason 必填；流转写库（同门动词）；提案行状态即时更新"
- State: "proposals.proposal_status = 目标态（裁决态写 decided_at；superseded 写谱系）；无第二写者"
- Side-effect: "提案域转移动词事件落事件日志"
- Invariants: "双面流转同门（与 transitionProposal tool 写库一致）"

## Outcome "empty-reason-refused"
- Preconditions: "裁决对话框已选目标态但 reason 留空"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "非终态（对话框在场）"
- Input: "尝试提交（reason 为空）"
- Output: "拒绝且留场（空因拒绝）——不落部分写库；补因后可提交"
- State: "库状态不变（无部分写库）；对话框保持在场"
- Side-effect: "none"
- Invariants: "表单不提交 + 近场可更正重试（web validation-error 原生形态）"

## Outcome "disallowed-target-hidden"
- Preconditions: "当前态为某中间态（如 under-review）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "under-review（中间态）"
- Input: "打开评审流转对话框查看目标态列表"
- Output: "仅列五态机允许集（非法转移不可选——状态机守卫；当前态自身不在列表）"
- State: "库状态不变（守卫面观察）"
- Side-effect: "none"
- Invariants: "allowed 集 = 五态词汇机械排除当前态（ERR_INVALID_TRANSITION 同源）"

## Journey Invariants
- 模式绑定三律：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- 双面流转同门：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按创建时快照执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
