---
journey: "panel-card-grid"
step: 5
action: "filter-compose-recover"
title: "搜索 × 状态叠加过滤与清除恢复"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "面板头部搜索框 + 状态过滤钮组"
  dom: "input.dswf-search / button.dswf-menu-btn[data-status] / .dswf-xcard[data-expert-key] / .dswf-panel-footer"
anchors_source: "ui-design.md F1 + panel/filter.ts filterExperts（AND 语义事实表 static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-card-grid/journey.md 步骤5 + 边界5"
---

# Contract · step-5-filter-compose-recover

## Outcome: success（AND 叠加 + 清除恢复全量）

### Preconditions
- fixture_spec：目录含 ≥3 位专家（启用/禁用混合；关键词恰命中其中一位启用者）。

### Input
用户动作：先键入关键词、再切状态过滤「启用」；随后清空关键词并切回「全部」。

### Output
叠加期只呈现同时满足两条件的卡（AND 语义），页脚「显示」数同步；清除后网格恢复全量卡片与完整计数，过滤钮「全部」呈选中态。

### State
filterExperts(entries, query, status) 纯投影；清除 = 投影回全量，控制器订阅与轮询不受影响。

### Side-effect
none

### Invariants
- 叠加恒 AND；恢复后状态与首次加载一致（无残留过滤态、无重复卡片）。

## Journey Invariants
- 过滤全链零网络副作用；页脚「N 位专家 · 显示 M」与呈现行集逐时点一致。
