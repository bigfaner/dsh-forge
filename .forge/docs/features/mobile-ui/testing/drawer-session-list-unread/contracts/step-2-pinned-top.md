---
journey: "drawer-session-list-unread"
step: 2
action: "pinned-top"
title: "置顶会话分组内排序"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "抽屉浮层（项目分组）"
anchors_source: "design/api-handbook.md §1.3（worktree/session 透传通道，列表数据源）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/drawer-session-list-unread/journey.md 步骤2"
---

# Contract · step-2-pinned-top

## Outcome: success（置顶排组内顶部）

### Preconditions
- fixture_spec：抽屉打开；至少一个项目分组同时含置顶与非置顶会话。

### Input
用户动作：查看置顶会话所在分组。

### Output
置顶会话（📌）排在其项目分组顶部；非置顶按既有排序呈现。

### State
列表为 read-state + 会话目录的确定性投影。

### Side-effect
none

### Invariants
- 排序呈现与桌面端裁剪例外一致，不静默增删规则。

## Journey Invariants
- 抽屉折叠/排序规则与桌面端一致；例外须显式可见于规格。
