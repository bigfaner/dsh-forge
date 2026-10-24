---
journey: "panel-detail-dialog"
step: 5
action: "toggle-enabled"
title: "底部禁用/启用即时切换（灯/meta/按钮/卡片四位同步）"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "详情 Dialog 底部启停钮"
  dom: ".dswf-dlg-foot > [禁用/启用]（.dswf-btn-ghost，busy disabled）→ POST /api/expert-squad/disable|enable（body: workspace+key）→ .dot.on|.dot.off / .dswf-dlg-meta「启用中|已禁用」/ .dswf-toast / 背后 .dswf-xcard.off 同步"
anchors_source: "ui-design.md F2 + detail-source.ts toggleEnabled / expert-panel.tsx DETAIL_ENABLE_URL·DETAIL_DISABLE_URL 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤5 + 边界4"
---

# Contract · step-5-toggle-enabled

## Outcome: disable-success（即时禁用）

### Preconditions
- fixture_spec：≥1 位启用专家的详情 Dialog 已打开（查看态）。

### Input
用户动作：点底部 [禁用]。

### Output
POST disable 发出（body: workspace + key=name）；成功后：头部灯 `.dot.off`、meta 变「<岗位> · 已禁用」、底部钮变 [启用]、Toast「<name> 已禁用」；**背后卡片即时降透明**（.dswf-xcard.off + 「· 已禁用」，patchEntry）。

### State
expert.enabled=false 换新；列表条目 patch；档案保留（未删除）。

### Side-effect
- POST /api/expert-squad/disable 一次（workspace+key 键定址——与面板 D4 通道同参语义）。

### Invariants
- 禁用即时生效不删档：全量视图卡片降透明在场，可随时经同路径再启用。

## Outcome: enable-success（再启用恢复）

### Preconditions
- fixture_spec：同一位专家已被禁用且其详情 Dialog 打开（灯 off、钮 [启用]）。

### Input
用户动作：点底部 [启用]。

### Output
POST enable 发出；成功后灯 `.dot.on`、meta 回「启用中」、底部钮回 [禁用]、Toast「<name> 已启用」；背后卡片恢复常态（.off 移除、「· 已禁用」消失）。

### State
expert.enabled=true 换新；列表条目 patch。

### Side-effect
- POST /api/expert-squad/enable 一次。

### Invariants
- 启停是对称往返：enable 后档案字段集不变（只 enabled 翻转）。

## Outcome: toggle-failure（启停通道失败）

### Preconditions
- fixture_spec：详情 Dialog 打开；注入拦截使 enable/disable 路由拒绝。

### Input
用户动作：点底部启停钮。

### Output
Toast「启停失败：<错误信息>」；灯/meta/按钮/背后卡片四位均不变；busy 退出（钮恢复可用）。

### State
expert 不换新；列表条集不变。

### Side-effect
- 一次失败的启停尝试（零变更）。

### Invariants
- 失败零局部切换：四位（灯/meta/按钮/卡片）原子一致——不允许 Dialog 已切而卡片未切（或反向）。

## Journey Invariants
- 启停链恒序：底部钮 → enable/disable 路由 → 换新 + Toast + 列表 patch；busy 防重在途双击。
