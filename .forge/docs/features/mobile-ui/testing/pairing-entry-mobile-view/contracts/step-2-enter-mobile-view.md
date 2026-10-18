---
journey: "pairing-entry-mobile-view"
step: 2
action: "enter-mobile-view"
title: "浏览手机专属受限视图"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/chat/:sessionId（对话主视图形态）"
anchors_source: "design/api-handbook.md §二 + tech-design 页面地图"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/pairing-entry-mobile-view/journey.md 步骤2 + 边界3"
---

# Contract · step-2-enter-mobile-view

## Outcome: success（呈现手机专属视图）

### Preconditions
- fixture_spec：同 step-1 success（已配对、mobile 产物已加载）。

### Input
用户动作：浏览加载后的页面；触屏点击/滚动。

### Output
呈现手机专属受限视图（对话主视图形态），非桌面 UI 的裁剪缩放分支；触屏交互即时响应。

### State
视图就绪：导航骨架（顶栏/输入行）与消息区在位。

### Side-effect
none

### Invariants
- 任何形态都不走桌面裁剪分支。

## Outcome: desktop-coexist（桌面同 host 并存）

### Preconditions
- fixture_spec：同 success，且另一桌面浏览器打开同一 host 的桌面入口。
- 分叉点：双端同时各自加载产物。

### Input
核查动作：桌面与手机双端分别浏览各自视图。

### Output
桌面视图与手机视图各自独立加载、互不影响（会话数据同源、产物互不引用）。

### State
两端各自视图态独立。

### Side-effect
none

### Invariants
- 同一 host 双产物并存互不干扰；零模块引用在双端同时成立。

## Journey Invariants
- 手机视图为触屏完整体验；与桌面视图并存且互不干扰。
