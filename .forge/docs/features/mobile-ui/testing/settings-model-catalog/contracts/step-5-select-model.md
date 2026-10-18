---
journey: "settings-model-catalog"
step: 5
action: "select-model"
title: "点选模型转发选择意图"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc session.selectModel（选择意图转发；api-ref 参照腿）"
anchors_source: "design/api-handbook.md §五 + tech-research R1.2"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤5 + 边界1/4"
---

# Contract · step-5-select-model

## Outcome: success（选中态 + 回执更新）

### Preconditions
- fixture_spec：模型列表在位；目标模型支持推理档位（reasoning.efforts 非空）。

### Input
用户动作：点选支持推理档位的其它模型。

### Output
选中态 = primary 边 + 7% tint；经 session/selectModel 通道转发选择意图后返回设置面板，模型行显示新模型，推理档位按新模型 efforts 重新呈现。

### State
当前模型 = 回执结果；档位集 = 新模型 efforts。

### Side-effect
宿主会话模型变更（host 裁决落地；手机端零直接改写）。

### Invariants
- 选中态全站统一（primary 边 + 7% tint）；当前模型以对勾标识，二者互不混淆。

## Outcome: no-efforts-model（不支持推理档位的模型）

### Preconditions
- fixture_spec：目标模型 `reasoning.efforts` 缺省。
- 分叉点：档位控件隐藏。

### Input
用户动作：点选不支持推理档位的模型。

### Output
返回设置面板后推理等级分段控件隐藏（不显示灰置禁用）。

### State
档位控件退场；模型行 = 新模型。

### Side-effect
宿主会话模型变更（同 success）。

### Invariants
- 无 efforts = 无控件（隐藏而非禁用），零灰置误导。

## Outcome: in-flight-no-dupe（选择在途重复点选）

### Preconditions
- fixture_spec：selectModel 请求未返回。
- 分叉点：提交中重复点击。

### Input
用户动作：在途时重复点选模型。

### Output
面板呈现提交中状态，重复点击不并发多发；返回后模型行与最终回执一致。

### State
单请求在途；呈现以回执收口。

### Side-effect
host 恰收到一次选择意图。

### Invariants
- 意图单发：重复点击不产生并发选择竞速。

## Journey Invariants
- 模型/档位变更是经通道转发的意图，落地由 host 裁决。
