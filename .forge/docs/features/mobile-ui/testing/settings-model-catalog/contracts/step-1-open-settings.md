---
journey: "settings-model-catalog"
step: 1
action: "open-settings"
title: "打开最小化设置面板"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "composer 滑杆设置钮 → 最小化设置面板"
  endpoint: "SSE 帧含当前会话模型；POST /api/rpc session.models（目录数据源）"
anchors_source: "design/api-handbook.md §五 + proposal 设置面板与模型切换 v7 定稿"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤1 + 边界8"
---

# Contract · step-1-open-settings

## Outcome: success（两行入口面板）

### Preconditions
- fixture_spec：mobile project 回放驱动；SSE 帧含当前会话模型；会话未被 preset 锁定。

### Input
用户动作：点 composer 滑杆设置钮。

### Output
最小化设置面板展开（无标题、无说明文本），仅两行：模型行（当前模型值 + ›）与推理等级分段控件；选档即生效。

### State
面板态 = 当前模型 + 当前推理档位。

### Side-effect
none（打开零请求落地）

### Invariants
- 最小化面板不变式：恒无标题/说明文本，仅模型行 + 推理档位两行入口。

## Outcome: preset-locked（preset 锁定会话）

### Preconditions
- fixture_spec：会话模型被 preset 锁定（host 侧语义）。
- 分叉点：锁定下的切换尝试。

### Input
用户动作：对锁定会话尝试切换模型/档位。

### Output
UI 不展示锁定说明文本；切换意图由 host 裁决后以回执呈现（失败维持原值，无前端预检）。

### State
呈现值 = host 回执结果（原值或新值）。

### Side-effect
none（失败零落地）

### Invariants
- 无前端预检：锁定语义完全由 host 回执呈现。

## Journey Invariants
- 设置面板是最小化意图面：选档即转发，无确认步骤、无锁定说明文案。
