---
journey: "mode-selection-alignment"
step: 3
step-action: "发起首回合（blank 锁生效）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
anchors:
  web:
    page: "hero 预设座位"
    route: ""
    requires_auth: false
    layout: "平台 UI（会话首回合 + 座位卸载观察）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: mode-selection-alignment / Step 3: 发起首回合（blank 锁生效）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 旅程裁决近似物承载 Outcome "post-lock-no-switch"（越界切换拒绝 = 状态机层物理防呆——座位卸载/点选超时，非表单校验反馈）; session-expired = 旅程裁决本地化（重启连续性）——承载 Outcome "restart-restore-existing"（本步 3c） -->

## Outcome "success"
- Preconditions: "会话已选定突击模式且处于 blank 期（Step 2 会话）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "blank（已选 blitz）"
          - field: "agentPreset"
            value: "blitz"
- Input: "在该会话中发起首回合对话"
- Output: "首回合正常进行；此后 blank 锁生效——预设座位卸载，切换面不再提供（SC1 UI 投影面双信号：座位卸载/点选超时）；会话保持突击组合"
- State: "会话越过 blank 期（首回合已发）；组合锁定为 blitz"
- Side-effect: "首回合消息入会话转录"

## Outcome "post-lock-no-switch"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 3b［SC1 双信号：座位卸载/点选超时——切换面物理缺席而非表单校验反馈；surface-web validation-error 规则考虑记录的状态机类比承载］ -->
- Preconditions: "会话已过首回合（超出 blank 期——连续运行态，未经历重启场景）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "已过首回合（blank 锁已生效）"
- Input: "查看该会话头部寻找模式切换入口（预设座位与菜单）"
- Output: "预设座位已卸载——无菜单可展开、点选不响应（SC1 双信号）；会话内无第二切换通道；会话头部其他元素照常在场（观察面有效性对照）；会话保持原预设"
- State: "会话组合保持锁定值；无切换写入通道"
- Side-effect: "none"
- Invariants: "平台 blank 锁——模式一经首回合确立，会话内不可再切换"

## Outcome "restart-restore-existing"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 3c［SC1 原文：恢复按会话 agentPreset 投影重建同款组合］；surface-web session-expired 规则本地化映射（既有会话重启投影重建） -->
- Preconditions: "应用重启，此前存在已确立模式的会话"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "已确立（首回合已过）"
          - field: "agentPreset"
            value: "任意已锁定模式"
- Input: "重新打开该既有会话"
- Output: "座位标签 / 工具面 / 技能目录与重启前一致（恢复按会话 agentPreset 投影重建同款组合——SC1）"
- State: "会话预设值不变；投影重建为同款组合"
- Side-effect: "none"

## Journey Invariants
- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（ui-settings 行）只控制座位可见性；首启预置后该行归用户运行时修改
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」）
