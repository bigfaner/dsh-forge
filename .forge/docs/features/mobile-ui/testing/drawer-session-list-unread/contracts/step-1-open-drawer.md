---
journey: "drawer-session-list-unread"
step: 1
action: "open-drawer"
title: "打开抽屉呈现项目树会话列表"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "对话主视图顶栏 ☰ → 抽屉浮层"
  endpoint: "POST /remote/__rpc forge:remote/read-state（读 payload {sessionId} → {seq, unread, stale?}；抽屉打开即拉取）"
anchors_source: "design/api-handbook.md §1.1"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/drawer-session-list-unread/journey.md 步骤1 + 边界3"
---

# Contract · step-1-open-drawer

## Outcome: success（项目树分组列表）

### Preconditions
- fixture_spec：已配对手机端在对话主视图；host 存在多个项目、多个会话（含未读与置顶）。

### Input
用户动作：点顶栏 ☰ 打开抽屉。

### Output
抽屉浮层呈现项目树分组会话列表，折叠规则同桌面端；不展示会话数量与归档项。

### State
抽屉打开即拉取 read-state；15s 存留期轮询生效。

### Side-effect
none（read-state 拉取是读侧对账）

### Invariants
- 折叠规则与桌面端一致；桌面裁剪例外（无数量/归档）显式成立。

## Outcome: empty-tree（无任何会话）

### Preconditions
- fixture_spec：host 无项目/会话。
- 分叉点：空态分支。

### Input
用户动作：打开抽屉。

### Output
呈现空态；无残留分组骨架。

### State
read-state 拉取零目标；轮询空转无害。

### Side-effect
none

### Invariants
- 空态是确定呈现，不伪造骨架。

## Outcome: archive-excluded（归档项与数量不展示）

### Preconditions
- fixture_spec：host 项目含已归档会话与大量会话（计数可渲染）。
- 分叉点：桌面裁剪例外核查。

### Input
用户动作：打开抽屉查看分组。

### Output
归档项不出现在列表；任何位置不展示会话数量。

### State
列表 = 非归档会话投影。

### Side-effect
none

### Invariants
- 桌面裁剪例外（无数量/归档）显式成立，不静默增删。

## Journey Invariants
- 抽屉是读侧呈现面：打开/浏览不改变宿主状态。
