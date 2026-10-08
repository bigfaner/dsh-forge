---
journey: "mode-selection-alignment"
step: 4
step-action: "经提案绑定入口创建新会话（自动对齐）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 行头「打开新会话」）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: mode-selection-alignment / Step 4: 经提案绑定入口创建新会话（自动对齐）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：入口行为步无表单校验面）; session-expired = N/A（旅程裁决：本地化连续性由 Step 2c/3c 承载——本步无会话连续性断言面） -->

## Outcome "success"
- Preconditions: "库中存在 mode 溯源 = blitz 的提案；提案行头「打开新会话」入口可达"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
- Input: "单人开发者从该提案经绑定入口（提案/feature 行头「打开新会话」）创建新会话"
- Output: "会话以突击模式起步（blank 期 select）：座位标签 = 突击模式，工具面/技能目录与突击组合一致——用户无需逐会话手选"
- State: "新 blank 会话创建；agentPreset.select 以提案 mode（blitz）写入会话"
- Side-effect: "会话编排创建动作（平台会话面新增一席）"
- Invariants: "自动对齐只发生在经绑定入口创建会话的 blank 期"

## Outcome "no-mode-source-keeps-default"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 4b［「不切换」为 UF-1 第 4 条原词；「保持远征」由 registry 默认 = 远征（SC1）补足——扫描吸收旧提案无溯源字段］ -->
- Preconditions: "经绑定入口创建会话的提案为扫描吸收的旧提案（无溯源字段——mode 为 NULL）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "NULL（扫描吸收——无溯源）"
- Input: "经该提案行头「打开新会话」创建新会话"
- Output: "不切换（保持默认远征）；提案行 mode chip 显示缺省占位"
- State: "新 blank 会话创建；agentPreset.select 不调用（mode 缺席不切换——沿 registry 默认远征）"
- Side-effect: "会话编排创建动作"
- Invariants: "无溯源不伪装成任一模式（mode chip 缺省占位中性不可点）"

## Journey Invariants
- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（ui-settings 行）只控制座位可见性；首启预置后该行归用户运行时修改
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」）
