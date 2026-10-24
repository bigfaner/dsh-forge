---
journey: "panel-card-grid"
step: 2
action: "grid-render-fields-footer"
title: "卡片网格渲染：字段集与页脚计数（含错误/空态边界）"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "专家卡片网格主视图"
  dom: ".dswf-xcard（data-expert-key=名称键）/ .dot.on|.dot.off / .xc-name / .chip.tool / .xc-title / .xc-creed / .xc-seg / .xc-foot / .dswf-panel-footer / .dswf-errorbar[role=alert] / .dswf-empty"
  endpoint: "GET /api/expert-squad/list"
anchors_source: "ui-design.md F1 组件树 + panel/expert-panel.tsx 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-card-grid/journey.md 步骤2 + 边界1/2"
---

# Contract · step-2-grid-render-fields-footer

## Outcome: success（卡片字段集 + 页脚计数）

### Preconditions
- fixture_spec：目录含 ≥2 位启用专家（字段齐备：name/title/personaMd/tools/skills/updatedAt）。

### Input
用户动作：浏览数据态网格。

### Output
每张卡（.dswf-xcard）可见：状态灯（启用 .dot.on）+ 名称（.xc-name）+ 英文标识 chip（.chip.tool，等宽）；岗位（.xc-title）；人设摘要（.xc-creed 纯文本、Markdown 剥离）；「技能标签」段 chips；「工具白名单（子会话强制）」段 chips；页脚更新时间「更新于 YYYY-MM-DD」。面板页脚「N 位专家 · 显示 M」。

### State
数据绑定：名称 ← name、标识 chip ← name、岗位 ← title、摘要 ← personaMd 剥离截断、chips ← skills/tools、灯 ← enabled。

### Side-effect
none（渲染投影）

### Invariants
- 卡片字段集逐位对齐 ui-design F1；frontmatter 技术细节不外露。

## Outcome: error-state（错误条 + 重试恢复）

### Preconditions
- fixture_spec：list 路由故障（非 200/网络错）。
- 分叉点：取数失败。

### Input
用户动作：观察错误呈现后点击「重试」。

### Output
网格区呈 ErrorBar（role=alert，含错误信息）+「重试」钮，页脚计数空；点重试重新拉取，成功后恢复数据网格与计数。

### State
phase = error → 重试后回 ready；错误态不误落空态分支。

### Side-effect
重试触发一次新的 list 拉取。

### Invariants
- 错误呈现不丢失面板头部；恢复后状态与首次加载一致。

## Outcome: empty-state（零专家建档引导）

### Preconditions
- fixture_spec：list 返回空数组（目录零合法档案）。
- 分叉点：列表确认为空。

### Input
用户动作：浏览空目录面板。

### Output
网格区呈建档引导空态（「还没有专家」+「在会话里对 HR 说『招募一个专家』即可建档」）；页脚「0 位专家」。

### State
phase = ready、entries = []；空态文案仅在确认空时呈现。

### Side-effect
none

### Invariants
- 零专家空态 ≠ 无匹配空态（文案可区分）；中间态禁落空态。

## Journey Invariants
- 四态互斥：loading / error / 空 / 数据任一时点恰其一；页脚计数恒与网格行集一致。
