---
journey: "settings-model-catalog"
step: 4
action: "clear-search"
title: "清空搜索恢复分组视图"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/models 搜索框"
anchors_source: "proposal 设置面板与模型切换 v7 定稿"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤4"
---

# Contract · step-4-clear-search

## Outcome: success（恢复折叠基线）

### Preconditions
- fixture_spec：过滤态在显；进入时折叠状态已知。

### Input
用户动作：清空搜索框。

### Output
恢复提供商分组视图；折叠状态与进入时一致。

### State
过滤态退出；折叠基线还原。

### Side-effect
none

### Invariants
- 折叠状态是会话内稳定视图态：过滤往返不改变它。

## Journey Invariants
- 检索往返无损：清空后目录视图与进入时逐位一致。
