---
journey: "task-float-ball-progress-intents"
step: 1
action: "drag-dock"
title: "悬浮球拖拽贴边收纳"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "对话主视图悬浮球（贴边透明半圆）"
anchors_source: "ui-functions F6（悬浮球形态）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/task-float-ball-progress-intents/journey.md 步骤1 + 边界5"
  - "source: inferred —— 换边吸附分支自「贴边收纳」语义的另一侧边推演"
---

# Contract · step-1-drag-dock

## Outcome: success（贴边收纳）

### Preconditions
- fixture_spec：手机端已配对；host 上至少一个 run 运行中（悬浮球呈运行形态）。

### Input
用户动作：拖拽悬浮球到屏幕边缘。

### Output
悬浮球贴边收纳为透明半圆，不遮挡内容。

### State
悬浮球停靠态（边缘 + 透明半圆）。

### Side-effect
none（呈现态，零宿主写入）

### Invariants
- 悬浮球是只读进度面 + 意图转发面入口：收纳不产生任何请求。

## Outcome: tap-vs-drag（按住未位移松手）

### Preconditions
- fixture_spec：用户按住悬浮球但未产生位移。
- 分叉点：拖拽/点击判定。

### Input
用户动作：按住即松手。

### Output
判定为点击展开浮层，不误触发拖拽落点。

### State
进入浮层展开态（同 step-2 success）。

### Side-effect
none

### Invariants
- 手势判定唯一：未位移 = 点击，不产生中间拖拽态残留。

## Outcome: opposite-edge-dock（拖至另一侧边缘）

### Preconditions
- fixture_spec：悬浮球已在停靠态，用户再次拖拽至对侧边缘。
- 分叉点：换边吸附（source: inferred —— 「贴边收纳」语义对任一侧边成立）。

### Input
用户动作：拖拽到另一侧边缘。

### Output
悬浮球换边贴附收纳，行为与原侧一致。

### State
停靠边更新。

### Side-effect
none

### Invariants
- 两侧边行为对称：收纳语义不依赖具体边。

## Journey Invariants
- 悬浮球交互是纯呈现 + 手势判定面，拖拽/点击都不发请求、不改宿主状态。
