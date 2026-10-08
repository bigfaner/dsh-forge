---
journey: "mode-selection-alignment"
step: 1
step-action: "新建会话查看 hero 预设座位"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
anchors:
  web:
    page: "hero 预设座位"
    route: ""
    requires_auth: false
    layout: "平台 UI（AgentPresetSeat——ui-settings 开关行开启后自现）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: mode-selection-alignment / Step 1: 新建会话查看 hero 预设座位

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：离散枚举点选无字段校验语义——近似物 = Step 3b 越界切换拒绝，承载于 step-3 合约）; session-expired = N/A（旅程裁决：本地化 = 重启连续性，承载步 = Step 2c/3c——本步无会话连续性断言面） -->

## Outcome "success"
- Preconditions: "应用首启完成（ui-settings 行 enabled: true 已首启预置物化——一次性；此后该行归用户运行时修改）；双预设已物化（远征 / 突击经宿主物化绝对路径装进用户 profile）；registry default = 远征"
  fixture_spec:
    entities:
      - entity_type: "UiSettingsRow"
        min_count: 1
        field_constraints:
          - field: "enabled"
            value: true
      - entity_type: "PresetRow"
        min_count: 2
        field_constraints:
          - field: "ids"
            value: "expedition 与 blitz（boot overlay 每启注行物化）"
- Input: "单人开发者新建一个会话，查看 hero 区的预设座位"
- Output: "预设座位在场：折叠标签 = 远征模式（registry 默认）；展开菜单列「远征模式 / 突击模式」双入口——中文显示名直出、远征在前（order 1/2）"
- State: "会话处于 blank 期（未发首回合）；组合尚未选定（默认远征投影）"
- Side-effect: "none"
- Invariants: "hero 开关（ui-settings 行）只控制座位可见性；组合装配在会话创建时已定"

## Outcome "hero-switch-off"
- Preconditions: "ui-settings 行缺席或被用户运行时关闭；一个既有已确立模式的会话在场（对照）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "已确立（任意模式）"
      - entity_type: "UiSettingsRow"
        min_count: 1
        field_constraints:
          - field: "enabled"
            value: "false（或缺席——开关门控关闭态）"
- Input: "新建会话查看 hero"
- Output: "预设座位不自现（开关门控）；既有会话的组合不受开关影响"
- State: "新会话无预设座位投影；既有会话组合投影不变"
- Side-effect: "none"
- Invariants: "开关只控 hero 座位可见性，组合装配无回溯通道"

## Outcome "settings-toggle-roundtrip"
- Preconditions: "首启预置已完成（开关 = 开启、行所有权已让位用户）；用户即将经设置对话框翻转开关（保存动作在场——开关翻转场景）"
  fixture_spec:
    entities:
      - entity_type: "UiSettingsRow"
        min_count: 1
        field_constraints:
          - field: "ownership"
            value: "用户运行时（首启预置一次性后让位）"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "已确立（对照在场）"
- Input: "经设置对话框将 hero 开关关闭并保存，再重新打开并保存"
- Output: "两次保存均成功持久化（首启预置一次性——此后该行归用户运行时修改，设置 UI 保存正常持久化）；关闭期间新建会话 hero 无预设座位，重开后座位回归；既有会话组合全程不变"
- State: "ui-settings 行值随保存翻转并持久化；会话组合状态全程不变"
- Side-effect: "设置域写路径经 UI 保存（首启后不再被预置覆盖）"

## Journey Invariants
- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（ui-settings 行）只控制座位可见性；首启预置后该行归用户运行时修改（设置 UI 保存正常持久化——Step 1c 行使验证）
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」——proposal 原文含分叉，收窄已裁决）
