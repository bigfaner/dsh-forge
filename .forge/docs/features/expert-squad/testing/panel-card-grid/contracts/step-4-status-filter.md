---
journey: "panel-card-grid"
step: 4
action: "status-filter"
title: "状态过滤三态（全部/启用/禁用）与禁用卡形态"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "面板头部状态过滤钮组"
  dom: "button.dswf-menu-btn[data-status=all|enabled|disabled]（选中 .on）/ .dswf-xcard.off / .dot.on|.dot.off / .xc-title（「· 已禁用」后缀）"
anchors_source: "ui-design.md F1 + panel/filter.ts matchesStatus / expert-panel.tsx Card 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-card-grid/journey.md 步骤4 + 边界4"
---

# Contract · step-4-status-filter

## Outcome: enabled-only（启用过滤）

### Preconditions
- fixture_spec：目录含 ≥1 位启用专家与 ≥1 位禁用专家。

### Input
用户动作：点击状态过滤钮「启用」。

### Output
网格只呈现启用卡（状态灯 on）；禁用卡移除；页脚「显示」数 = 启用数；选中钮呈 .on 态。

### State
status 过滤 = enabled；禁用专家档案不消失（切回「全部」复现）。

### Side-effect
none

### Invariants
- 状态过滤是视图投影，不改档案启用态、不发启停请求。

## Outcome: disabled-only（禁用过滤 + 降透明形态）

### Preconditions
- fixture_spec：≥1 位专家经启停通道（POST /api/expert-squad/disable）被禁用。

### Input
用户动作：点击状态过滤钮「禁用」（或全量视图中观察禁用卡）。

### Output
禁用过滤下只呈现禁用卡：整卡降透明度（.dswf-xcard.off）、状态灯 off、岗位附「· 已禁用」；页脚计数同步。

### State
禁用态由启停通道写入（workspace 键控存储，D4），面板经 includeDisabled=true 如实呈现。

### Side-effect
none（本步只读；禁用写入由前置操作承担）

### Invariants
- 禁用卡字段集完整（信息不消失）；形态三位一体：降透明 + 灯 off + 「· 已禁用」。

## Journey Invariants
- 三态过滤互斥单选（.on 标记选中）；全量视图禁用卡降透明在场，档案可随时重新启用。
