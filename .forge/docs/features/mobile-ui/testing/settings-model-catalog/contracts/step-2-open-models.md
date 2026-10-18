---
journey: "settings-model-catalog"
step: 2
action: "open-models"
title: "进入模型列表唯一子视图"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/models"
  endpoint: "POST /remote/__rpc 载荷经 sessionModelCatalog 通道（回放 fixtures，官方 model catalog 形状，100+ 多提供商）"
anchors_source: "design/api-handbook.md §五 session.models + proposal v7 定稿"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤2"
---

# Contract · step-2-open-models

## Outcome: success（分组目录 + 当前对勾）

### Preconditions
- fixture_spec：sessionModelCatalog 返回 100+ 多提供商模型目录（≥3 提供商）；SSE 帧含当前会话模型。

### Input
用户动作：点模型行 ›。

### Output
进入唯一子视图 `#/models` 模型列表：返回钮与搜索框同行（sticky）；目录按提供商分组折叠（组名 + 计数）；当前模型行右侧对勾。

### State
分组视图态 + 折叠状态（进入时基线）；当前模型标识在位。

### Side-effect
none

### Invariants
- 模型列表是唯一子视图（无第二子视图入口）。

## Journey Invariants
- 目录呈现是 catalog 投影：分组/计数/对勾与 fixture 目录及当前模型一致。
