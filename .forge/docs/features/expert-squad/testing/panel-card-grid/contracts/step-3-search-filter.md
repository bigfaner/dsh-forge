---
journey: "panel-card-grid"
step: 3
action: "search-filter"
title: "搜索框即时过滤（名称/标识/技能）"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "面板头部搜索框"
  dom: "input.dswf-search[aria-label=搜索专家] / .dswf-xcard[data-expert-key] / .dswf-empty"
anchors_source: "ui-design.md F1 交互 + panel/filter.ts matchesQuery 事实表（static：名称/英文标识/技能包含、大小写不敏感）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-card-grid/journey.md 步骤3 + 边界3"
---

# Contract · step-3-search-filter

## Outcome: success（即时过滤收窄）

### Preconditions
- fixture_spec：目录含 ≥2 位专家，关键词可命中其中恰一（按名称或技能）。

### Input
用户动作：在搜索框键入关键字（如某专家技能标签片段）。

### Output
网格即时只呈现命中卡（名称/英文标识/技能包含，大小写不敏感）；页脚「显示」数同步收窄；非命中卡移除。

### State
过滤态 = 最终关键词的命中投影（filterExperts 纯客户端，零额外请求）。

### Side-effect
none

### Invariants
- 过滤是投影非删除：清词即恢复全量；输入不触发网络请求。

## Outcome: no-match（关键词无命中空态）

### Preconditions
- fixture_spec：关键词不匹配任何专家的名称/标识/技能。
- 分叉点：过滤结果为零。

### Input
用户动作：键入无命中关键词。

### Output
网格区呈「无匹配专家」空态（「换个关键词或过滤条件试试」）；页脚计数「显示 0」；清词后恢复全量网格。

### State
filtered = [] 且 entries ≠ []（与零专家建档引导空态相异）。

### Side-effect
none

### Invariants
- 无匹配空态不误报「还没有专家」；零报错零布局跳变。

## Journey Invariants
- 检索全程纯客户端投影；命中判定面 = 名称 ∪ 英文标识 ∪ 技能（大小写不敏感）。
