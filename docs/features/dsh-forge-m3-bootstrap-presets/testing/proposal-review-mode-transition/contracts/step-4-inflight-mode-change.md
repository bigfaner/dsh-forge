---
journey: "proposal-review-mode-transition"
step: 4
step-action: "blitz 提案在途时手动改为远征"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/journey.md
anchors:
  web:
    page: "模式更改对话框"
    route: ""
    requires_auth: false
    layout: "模态（官方 Modal——proposal-tab 局部；⋯ 菜单或 mode chip 快捷入口）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: proposal-review-mode-transition / Step 4: blitz 提案在途时手动改为远征

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（模式更改对话框说明必填的空因拒绝形态与 Step 2b 同门（评审流转对话框同形），由 step-2 合约承载；本步主断言 = 快照不回溯与谱系同步）; session-expired = N/A（无登录态；模式变更写库即时反映（Step 5b 承载），无凭据过期路径） -->

## Outcome "success"
- Preconditions: "某 blitz 提案已建任务且在途（任务未终态）；提案子 tab ⋯ 菜单（或 mode chip 快捷入口）可达"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
        field_constraints:
          - field: "task_status"
            value: "未终态（在途）"
- Input: "单人开发者在提案子 tab 经 ⋯ 菜单（或 mode chip 快捷入口）将该在途 blitz 提案改为远征（说明必填）"
- Output: "远征与突击二选 + 说明必填 + 快照不回溯一行明示；溯源字段即时同步（proposals.mode 更新——features 恒远征无列无需同步）"
- State: "proposals.mode = expedition（正门写径）；既有任务的 mode 快照不变（创建时值）"
- Side-effect: "模式变更动词事件落事件日志（UI 专属通道）"
- Invariants: "唯一模式变更通道 = 提案子 tab 人工更改 + 快照不回溯（律三）"

## Outcome "expedition-accepted-chain-contrast"
- Preconditions: "某远征提案被接受（accepted）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "accepted"
          - field: "mode"
            value: "expedition"
- Input: "检查 feature 子 tab 与谱系"
- Output: "registerFeature 单步成链（feature 行 + proposal_id 谱系 + 审计行）——对照：突击提案 accepted 无 feature 行（两分支分化断言）"
- State: "远征接受路径 features 表成链；突击接受路径无 feature 行（分化）"
- Side-effect: "feature 域审计行伴随写入（远征支）"

## Outcome "agent-face-no-mode-verb"
- Preconditions: "agent 会话在场（枚举观察态——tool 面可枚举，不触发任何写径；模式经人工正门变更后为典型时点）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "tool_face"
            value: "agent 会话（forge tool 面可枚举）"
- Input: "枚举 agent tool 面动词"
- Output: "无模式改写动词（契约断言）——模式不可变：唯一变更通道 = 提案子 tab 人工操作"
- State: "库状态不变（枚举观察）"
- Side-effect: "none"
- Invariants: "setMode = UI 专属 RPC；agent tool 面无模式改写动词（SC3/模式绑定三律）"

## Journey Invariants
- 模式绑定三律：律一 新会话自动对齐（提案 mode）；律二 确立后不可切换；律三 唯一变更通道 = 提案子 tab 人工更改 + 快照不回溯
- 双面流转同门：UI 人工裁决与 transitionProposal tool 写库一致（同门动词，无第二写者）
- mode chip 恒与库中溯源字段一致；无溯源显示缺省占位（不伪装）
- 既有任务语义按创建时快照执行——模式变更零回溯（整数 ID / eval 豁免 / 派发模板不变）
