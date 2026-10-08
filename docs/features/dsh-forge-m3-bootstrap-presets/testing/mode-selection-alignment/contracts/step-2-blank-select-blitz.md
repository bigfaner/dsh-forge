---
journey: "mode-selection-alignment"
step: 2
step-action: "blank 期点选「突击模式」"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
anchors:
  web:
    page: "hero 预设座位"
    route: ""
    requires_auth: false
    layout: "平台 UI（AgentPresetSeat 菜单点选）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: mode-selection-alignment / Step 2: blank 期点选「突击模式」

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：离散枚举点选无字段校验语义——近似物 = Step 3b，承载于 step-3 合约）; session-expired = 旅程裁决本地化（重启连续性）——承载 Outcome "restart-mid-state"（本步 2c） -->

## Outcome "success"
- Preconditions: "会话处于 blank 期（未发首回合）且当前预设非突击、本次点选目标 = 突击（切换形态——默认远征态起步）；hero 开关开启、预设座位在场"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "blank（未发首回合）"
- Input: "在 blank 会话中点选菜单「突击模式」"
- Output: "组合即时切换：座位标签 = 突击模式；会话工具面/技能目录与突击组合一致（技能清单不含规格技能全集——SC1 投影断言口径）"
- State: "会话 agentPreset = blitz（blank 期 select 写入会话）；组合投影即时重建"
- Side-effect: "none（会话内预设选择，无库写入）"

## Outcome "idempotent-default-select"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 2b［点选当前已选预设 = 无变化写入，投影面自然稳定——幂等点选］；承载 blank 期显式选择默认远征的边界 -->
- Preconditions: "blank 会话，座位当前 = 远征模式（默认态）且本次点选目标 = 远征（幂等形态——点选当前值）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "blank"
          - field: "agentPreset"
            value: "expedition（默认态）"
- Input: "点选菜单「远征模式」"
- Output: "座位标签保持远征模式，组合不漂移（幂等点选）"
- State: "会话预设值不变（远征）；投影面稳定"
- Side-effect: "none"

## Outcome "restart-mid-state"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 2c［恢复投影按会话 agentPreset 重建（SC1 + S5 已验重启投影重建通道与 select 接线）——已选未锁的中间态恢复 = 按已选值］；surface-web session-expired 规则本地化映射（已选模式经投影重建保留，不静默回退默认） -->
- Preconditions: "blank 会话已点选突击模式（未发首回合——已选未锁中间态）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "phase"
            value: "blank（已点选未锁）"
          - field: "agentPreset"
            value: "blitz"
- Input: "重启应用后重新打开该会话"
- Output: "按会话当前已选预设投影重建——座位标签 = 突击模式，工具面/技能目录与突击组合一致（点选不因重启丢失、不回退 registry 默认）"
- State: "会话预设值保持 blitz（重启后投影重建）"
- Side-effect: "none"

## Journey Invariants
- 模式一经首回合确立，会话内不可再切换（平台 blank 锁——切换面卸载）；唯一模式变更通道 = 提案子 tab 人工更改（模式绑定三律）
- 会话工具面/技能目录恒由预设组合唯一决定，与提案/任务内容无关；断言基 UI 投影面（座位标签 + 工具面/技能目录投影）
- 自动对齐只发生在经绑定入口创建会话的 blank 期；提案模式变更不回溯既有会话预设
- hero 开关（ui-settings 行）只控制座位可见性；首启预置后该行归用户运行时修改
- 分叉会话投影重建不在 M3 断言面（PRD SC1 收窄为「恢复」）
