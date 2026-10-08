---
journey: "mode-selection-alignment"
step: 5
step-action: "hero 自由会话用于异模式 feature（错配守卫）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
anchors:
  web:
    page: "概览 · feature 子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（feature-tab.tsx 内容打开 + 任务子 tab 派发入口对照面）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: mode-selection-alignment / Step 5: hero 自由会话用于异模式 feature（错配守卫）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：守卫为可见性提示非表单校验）; session-expired = N/A（旅程裁决：本地化连续性由 Step 2c/3c 承载——本步无会话连续性断言面） -->

## Outcome "success"
- Preconditions: "hero 自由创建（无提案上下文）的远征会话在场；一个远征 feature 在场（Setup——供 Step 5 错配守卫场景的镜像主场景：突击会话打开远征 feature）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "已确立的远征组合（hero 自由——无提案上下文）"
      - entity_type: "Feature"
        min_count: 1
- Input: "在该异模式会话中经概览 feature 子 tab 打开异模式内容并继续其任务工作（如经任务子 tab 该 feature 容器的「派发」入口）"
- Output: "应用不阻断但给出可见性守卫：mode chip 对照（会话组合 vs 所打开内容的模式）+ 派发入口提示（守卫呈现于所打开异模式内容的对照面与派发入口——AC4 语义，像素位归 ui-design）；平台 blank 锁边界如实记账，不伪装可切换"
- State: "会话组合不变（守卫零阻断）；任务工作可继续"
- Side-effect: "none（可见性守卫为呈现层）"
- Invariants: "错配守卫可见性不阻断——工具面/技能目录恒由预设组合唯一决定"

## Outcome "honest-accounting-mismatch"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 5b［可见性守卫呈现但零阻断；突击语义（整数 ID / eval 豁免）照旧生效——下游读溯源字段不读会话预设（SC3）］——反向错配（远征会话 + blitz 直挂任务）的如实记账面 -->
- Preconditions: "hero 自由远征会话在场；带直挂任务的 blitz 提案在场"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition（hero 自由）"
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
          - field: "mode"
            value: "blitz（创建时快照）"
- Input: "在该远征会话中经概览任务子 tab 继续该突击提案直挂任务的工作"
- Output: "可见性守卫呈现（mode chip 对照 + 派发入口提示）但零阻断；突击语义（整数 ID / eval 豁免）照旧生效——下游读溯源字段不读会话预设（SC3）"
- State: "任务语义快照不变（blitz）；会话组合不变（远征）"
- Side-effect: "none"
- Invariants: "任务语义按创建时快照执行——模式变更/错配零回溯"

## Journey Invariants
- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（ui-settings 行）只控制座位可见性；首启预置后该行归用户运行时修改
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」）
