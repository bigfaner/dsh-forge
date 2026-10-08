---
journey: "proposal-review-mode-transition"
step: 5
step-action: "升降级联动核查"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 行头「打开新会话」入口）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: proposal-review-mode-transition / Step 5: 升降级联动核查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（核查型观测步，无表单交互面）; session-expired = N/A（本地单人工作台无登录态；既有会话按 blank 锁保持原预设——连续性由平台会话常驻承载） -->

## Outcome "success"
- Preconditions: "模式更改已提交（blitz → expedition 写库返回）；该提案有既有任务与会话在场"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "expedition（刚由 blitz 变更）"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
        field_constraints:
          - field: "mode"
            value: "blitz（创建时快照——未回溯）"
          - field: "task_status"
            value: "未终态（在途）"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "既有会话（模式变更前创建——已确立）"
- Input: "模式更改后，经「打开新会话」入口创建会话并查看既有任务与会话"
- Output: "下一个经「打开新会话」入口创建的会话自动对齐远征；既有任务按创建时快照照旧执行（整数 ID / eval 豁免不变——断言）；既有会话按 blank 锁保持原预设"
- State: "新会话 agentPreset = expedition（对齐新 mode）；既有任务 mode 快照不变；既有会话组合不变"
- Side-effect: "会话编排创建动作"
- Invariants: "自动对齐只发生在新建会话；模式变更零回溯（任务快照 / 会话预设两域）"

## Outcome "chip-consistency-after-change"
- Preconditions: "模式变更已提交（写库返回——读面一致性场景：重查 mode chip）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "expedition（变更后新值）"
- Input: "刷新/重查提案子 tab 的 mode chip"
- Output: "mode chip 恒与库中 proposals.mode 一致（变更后即时反映；无陈旧投影）"
- State: "读面与库一致（单次重取即见新值）"
- Side-effect: "none"
- Invariants: "mode chip 恒与库中溯源字段一致（即时口径——无 watch / 无同步延迟）"

## Journey Invariants
- 模式绑定三律：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- 双面流转同门：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按创建时快照执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
