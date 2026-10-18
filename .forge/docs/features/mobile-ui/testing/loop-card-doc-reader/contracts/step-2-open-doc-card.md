---
journey: "loop-card-doc-reader"
step: 2
action: "open-doc-card"
title: "点文档卡进入阅读页"
risk_level: "Low"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "全屏阅读页（← 退出 + 文件名 + 「渲染｜文本」胶囊）"
anchors_source: "design/tech-research.md §六（官方 markdown()/inlineMarkdown() vanilla 实现）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/loop-card-doc-reader/journey.md 步骤4 + 边界3"
---

# Contract · step-2-open-doc-card

## Outcome: success（徽标卡 + 全屏阅读页）

### Preconditions
- fixture_spec：消息流含 agent 产出文档卡（html/md/csv/txt 各至少一份）。

### Input
用户动作：点文档卡。

### Output
先见类型徽标卡（文件名 + size 右对齐）；点开进入全屏阅读页（← 退出 + 文件名 + 「渲染｜文本」胶囊）。

### State
阅读页路由态打开；消息流保持底层。

### Side-effect
none（纯只读面）

### Invariants
- 阅读页是纯只读面：浏览文档不产生任何会话状态变更。

## Outcome: unknown-type-fallback（未知类型兜底）

### Preconditions
- fixture_spec：文档类型不在已知集（html/md/csv/txt 之外）。
- 分叉点：类型判别失败。

### Input
用户动作：点未知类型文档卡。

### Output
不崩溃，按纯文本兜底呈现；无类型说明文案杜撰。

### State
阅读页以纯文本态打开。

### Side-effect
none

### Invariants
- 未知类型零崩溃零杜撰：兜底 = 纯文本。

## Journey Invariants
- 文档入口是只读导航；类型未知时行为可预期（纯文本兜底）。
