---
journey: "panel-card-grid"
step: 1
action: "activate-panel"
title: "左栏「专家团」行激活面板（骨架 → 数据网格）"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "main keyed 'expert-squad' 面板（左栏 panellist 行「专家团」入口）"
  dom: "[data-dswf-expert-panel] / .dswf-panel-header / .dswf-card-grid / .dswf-panel-footer"
  endpoint: "GET /api/expert-squad/list?workspace=…&includeDisabled=true"
anchors_source: "ui-design.md F1 组件树 + tech-design §6 面板数据通道 + panel/expert-panel.tsx data 锚（事实表 static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-card-grid/journey.md 步骤1 + 边界1/2"
---

# Contract · step-1-activate-panel

## Outcome: success（激活 → 数据网格呈现）

### Preconditions
- fixture_spec：专家团插件已装载；工作台绑定工作区 ≥1；专家目录（project 层夹具 + 内置层）含 ≥2 份合法专家档案。

### Input
用户动作：点击左栏 panellist「专家团」行。

### Output
main 槽呈现面板：标题「专家团」、搜索框（aria「搜索专家」）、三态过滤钮（全部/启用/禁用）、召唤钮；数据到达后卡片网格呈现全部（含禁用）专家卡。

### State
ExpertListController 就绪：即时拉取 + 5s 轻轮询订阅；列表 = list 路由全量投影。

### Side-effect
周期性 GET /api/expert-squad/list（5s 轻轮询，D2 主案）。

### Invariants
- 面板结构恒备：头部 + 网格 + 页脚三段骨架不因状态缺席。

## Outcome: loading-first（骨架中间态）

### Preconditions
- fixture_spec：list 响应被延迟（未决）；workspace 就绪。

### Input
用户动作：激活面板后观察取数期间。

### Output
网格区呈骨架卡片（.dswf-skeleton-card），页脚「扫描专家目录…」；零空态文案、零错误条。

### State
phase = loading；中间态不落空态分支（DESIGN.md 稳定性裁决）。

### Side-effect
none

### Invariants
- loading 期间空态/错误态分支零呈现。

## Journey Invariants
- 面板激活链：workspace 缺席 = 骨架降级；就绪后控制器换代轮询零泄漏。
