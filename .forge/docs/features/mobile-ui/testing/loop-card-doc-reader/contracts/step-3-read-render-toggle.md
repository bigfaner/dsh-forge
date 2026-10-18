---
journey: "loop-card-doc-reader"
step: 3
action: "read-render-toggle"
title: "浏览文档渲染/文本切换（覆盖 journey 步骤 5–6）"
risk_level: "Low"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "全屏阅读页「渲染｜文本」胶囊"
  endpoint: "文档内容由会话消息流承载（无独立端点）；md 渲染 = 官方 vanilla markdown() + @dsh-forge/md-mermaid 增强"
anchors_source: "design/api-handbook.md §六 + design/tech-research.md §六"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/loop-card-doc-reader/journey.md 步骤5/6 + 边界1/2"
---

# Contract · step-3-read-render-toggle

## Outcome: success（html/md/csv 默认渲染可切文本）

### Preconditions
- fixture_spec：阅读页打开 html/md/csv 文档（各至少一份）。

### Input
用户动作：浏览渲染视图；切「文本」胶囊。

### Output
html/md 默认渲染呈现（md 表格居中）；csv 表格渲染居中；可切纯文本查看。

### State
胶囊切换是视图态，不改变文档内容。

### Side-effect
none

### Invariants
- 文档类型行为契约：html/md/csv 默认渲染可切纯文本。

## Outcome: txt-plain-only（txt 恒纯文本）

### Preconditions
- fixture_spec：阅读页打开 txt 文档。
- 分叉点：类型 = txt。

### Input
用户动作：浏览 txt 文档。

### Output
恒纯文本呈现，不提供渲染态（无渲染胶囊或胶囊恒文本）。

### State
纯文本态唯一。

### Side-effect
none

### Invariants
- txt 恒纯文本，不出现渲染分支。

## Outcome: mermaid-enhanced（md 内嵌 mermaid）

### Preconditions
- fixture_spec：md 文档内嵌 mermaid 图块。
- 分叉点：动态 import 增强渲染。

### Input
用户动作：浏览含 mermaid 的 md 渲染视图；横滑/双指缩放超宽图。

### Output
动态 import 增强渲染，暗色锚同源；超宽图横滚/双指缩放可用。

### State
增强器按需加载；渲染失败退纯文本不阻塞文档其余部分。

### Side-effect
none

### Invariants
- 增强渲染失败不逃逸：文档其余部分正常呈现。

## Journey Invariants
- 阅读页纯只读 + 类型行为契约（html/md/csv 渲染可切、txt 恒文本、未知兜底纯文本）。
