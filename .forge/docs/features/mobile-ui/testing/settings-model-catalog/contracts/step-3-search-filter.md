---
journey: "settings-model-catalog"
step: 3
action: "search-filter"
title: "搜索框过滤模型目录"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/models 搜索框"
anchors_source: "proposal 设置面板与模型切换 v7 定稿（~300ms 防抖 + 扁平化）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/settings-model-catalog/journey.md 步骤3 + 边界2/3"
---

# Contract · step-3-search-filter

## Outcome: success（防抖过滤扁平列表）

### Preconditions
- fixture_spec：模型列表分组视图在位；目录含跨提供商可命中关键词。

### Input
用户动作：在搜索框键入模型关键词。

### Output
约 300ms 防抖后呈现过滤态扁平列表（命中项跨提供商去分组直列）；面板高度恒定不抖动。

### State
过滤态 = 最终关键词的命中投影。

### Side-effect
none（纯客户端过滤）

### Invariants
- 检索不抖动：防抖 ~300ms、过滤态扁平化、面板高度恒定。

## Outcome: no-hit（搜索无命中）

### Preconditions
- fixture_spec：关键词不匹配任何模型。
- 分叉点：空过滤态。

### Input
用户动作：键入无命中关键词。

### Output
过滤态为空列表（无命中提示即可），面板高度恒定；清空后恢复分组视图。

### State
空过滤态；折叠状态保留。

### Side-effect
none

### Invariants
- 空命中零报错零布局跳变。

## Outcome: debounce-burst（防抖窗口连续输入）

### Preconditions
- fixture_spec：300ms 防抖窗口内多次键入。
- 分叉点：合帧过滤。

### Input
用户动作：快速连续键入。

### Output
仅以最终关键词发起一次过滤，不出现中间态闪烁。

### State
过滤只执行最终关键词一次。

### Side-effect
none

### Invariants
- 防抖收敛：中间关键词零过滤副作用。

## Journey Invariants
- 检索全程无布局跳变；过滤是纯客户端投影，零请求。
