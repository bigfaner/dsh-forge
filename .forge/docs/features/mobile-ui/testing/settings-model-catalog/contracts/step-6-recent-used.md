---
journey: "settings-model-catalog"
step: 6
action: "recent-used"
title: "最近使用置顶区"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/models「最近使用」置顶区"
  endpoint: "手机页 localStorage（按配对域隔离）——零 host 改动"
anchors_source: "proposal 设置面板与模型切换 v7 定稿（localStorage 持久化）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤6 + 边界5/6"
---

# Contract · step-6-recent-used

## Outcome: success（最近使用置顶 + 对勾正确）

### Preconditions
- fixture_spec：用户已完成一次模型选择（localStorage 已积累）；再次进入模型列表。

### Input
用户动作：再次进入模型列表。

### Output
上一次使用的模型出现在「最近使用」置顶区（localStorage 持久化），当前模型对勾位置正确。

### State
最近使用集 = 本页 localStorage 投影；对勾 = 当前会话模型。

### Side-effect
写本页 localStorage（纯手机页存储，零 host 改动）。

### Invariants
- 纯视图层状态边界：最近使用只存手机页 localStorage，零 host 改动。

## Outcome: domain-isolated（配对域隔离）

### Preconditions
- fixture_spec：同一手机页存在两个配对域的历史记录。
- 分叉点：跨域读取隔离。

### Input
用户动作：在两个配对域分别查看最近使用。

### Output
各域只读各自 localStorage 最近使用集，互不串显。

### State
存储键按配对域隔离。

### Side-effect
none（读侧）

### Invariants
- 域隔离：最近使用永不跨配对域泄漏。

## Outcome: storage-absent（localStorage 缺席/清空）

### Preconditions
- fixture_spec：首次访问或存储被清（localStorage 初始为空）。
- 分叉点：空存储呈现。

### Input
用户动作：进入模型列表。

### Output
最近使用区不渲染（或空态）；目录分组视图正常；无报错覆盖层。

### State
最近使用集为空（合法基线）。

### Side-effect
none

### Invariants
- 空存储是合法态：零报错、零骨架残留。

## Journey Invariants
- 最近使用按配对域隔离持久化于手机页；缺席时优雅空态。
