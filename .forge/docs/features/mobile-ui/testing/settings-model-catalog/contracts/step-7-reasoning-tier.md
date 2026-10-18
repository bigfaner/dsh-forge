---
journey: "settings-model-catalog"
step: 7
action: "reasoning-tier"
title: "切换推理等级档位"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "推理档位意图经通道转发（session 模型/effort 语义，host 裁决落地）"
anchors_source: "design/api-handbook.md §五 + proposal v7 定稿"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤7 + 边界7"
---

# Contract · step-7-reasoning-tier

## Outcome: success（选档即生效）

### Preconditions
- fixture_spec：设置面板在位；当前模型支持推理档位（分段控件可见）。

### Input
用户动作：切换推理等级档位。

### Output
分段控件选中档即生效（意图转发），无额外确认步骤。

### State
选中档位 = 意图值（回执前乐观呈现，回执后对账）。

### Side-effect
宿主会话推理档位变更（host 裁决落地）。

### Invariants
- 选档即转发：无确认步骤、无预检。

## Outcome: out-of-range-fallback（档位越界恢复）

### Preconditions
- fixture_spec：切换模型后旧档位在新模型 efforts 中不存在。
- 分叉点：档位回退。

### Input
系统事件：模型切换后档位对账。

### Output
档位回退到新模型默认档（或首档），不残留旧选中。

### State
选中档 ∈ 新模型 efforts 集合。

### Side-effect
none（对账是呈现侧行为）

### Invariants
- 档位值域恒合法：不残留越界旧选中。

## Journey Invariants
- 选中态全站统一；档位呈现永远落在新模型 efforts 值域内。
