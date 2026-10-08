---
journey: "proposal-review-mode-transition"
step: 1
step-action: "五态 chips 过滤与 mode chip 核查"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 五态 chips + 提案行）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: proposal-review-mode-transition / Step 1: 五态 chips 过滤与 mode chip 核查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程未设表单承载步于本步——chips 过滤为枚举选择面，无字段校验；表单承载步 = Step 2 评审流转对话框，见 step-2 合约）; session-expired = N/A（本地单人工作台无登录态；列表读面即时直读库，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "库中存在多态提案（draft / under-review / accepted / rejected / superseded 各有代表；含带与不带 mode 溯源）；概览提案子 tab 可达；本场景点击计数大于零的状态 chip（单选——带溯源行为聚焦行）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 5
        field_constraints:
          - field: "proposal_status"
            value: "五态各有代表（draft / under-review / accepted / rejected / superseded）"
          - field: "mode"
            value: "带溯源（expedition/blitz）与不带（NULL）混合在场"
- Input: "单人开发者打开概览提案子 tab 并点击某状态 chip"
- Output: "仅显示该态提案；提案行名称右侧 mode chip 与库中溯源字段一致（远征蓝 / 突击琥珀）"
- State: "读面过滤态切换；库状态不变"
- Side-effect: "none"

## Outcome "chips-boundary-behavior"
- Preconditions: "某状态在库中计数为 0；或多态并选入口在场"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 2
        field_constraints:
          - field: "status_distribution"
            value: "至少一态计数为 0（边界在场）"
- Input: "点击 0 计数 chip / 多选若干状态 chip / 切换子 tab"
- Output: "0 计数 disabled；多选并集显示；子 tab 切换清空选择"
- State: "过滤态按选择演进；库状态不变"
- Side-effect: "none"

## Outcome "legacy-mode-placeholder"
- Preconditions: "扫描吸收的旧提案（创建时无 mode 字段——mode 为 NULL）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "NULL（扫描吸收——无溯源）"
- Input: "查看其提案行 mode chip"
- Output: "缺省占位（中性、不可点）；不伪装成任一模式"
- State: "库状态不变（读面观察）"
- Side-effect: "none"
- Invariants: "mode chip 恒与库中溯源字段一致（无溯源显示缺省占位——不伪装）"

## Journey Invariants
- 模式绑定三律：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- 双面流转同门：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按创建时快照执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
