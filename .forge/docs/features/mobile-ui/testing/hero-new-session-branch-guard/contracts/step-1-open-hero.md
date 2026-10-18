---
journey: "hero-new-session-branch-guard"
step: 1
action: "open-hero"
title: "打开 hero 初始态"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "#/new"
  endpoint: "POST /remote/__rpc forge:worktree/branches、forge:worktree/list（透传通道，分支/worktree 目录数据源）"
anchors_source: "design/api-handbook.md §1.3"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/hero-new-session-branch-guard/journey.md 步骤1"
  - "source: inferred —— 目录加载失败呈现分支自错误模型 unavailable（面板不可用态）"
---

# Contract · step-1-open-hero

## Outcome: success（默认突击 + 当前分支）

### Preconditions
- fixture_spec：已配对手机端处于当前分支/worktree 环境；`#/new` 可达；worktree 目录通道回放在位。

### Input
用户动作：点顶栏 ＋ 打开 hero。

### Output
初始状态模式=突击、分支=当前所在分支/worktree；无强制切换。

### State
hero 表单初始态就绪（模式/分支/环境三要素）。

### Side-effect
none

### Invariants
- hero 初始态恒为：模式=突击、分支=当前所在分支/worktree。

## Outcome: catalog-unavailable（分支目录加载失败）

### Preconditions
- fixture_spec：worktree/branches 通道返回 `{ok:false, error:{code:'unavailable'}}` 或不可达。
- 分叉点：目录缺席呈现（source: inferred —— 手册 §三：面板不可用态，对话不受影响）。

### Input
系统事件：目录拉取失败。

### Output
分支选择呈不可用/重试呈现；保持当前分支默认值；零臆造目录。

### State
hero 可退出；当前分支默认不丢失。

### Side-effect
none

### Invariants
- 目录缺席不伪造选项；默认分支语义不因目录失败而丢失。

## Journey Invariants
- hero 不强制用户切环境；初始态恒定。
