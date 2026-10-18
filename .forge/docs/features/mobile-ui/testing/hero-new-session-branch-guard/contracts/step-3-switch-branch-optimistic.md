---
journey: "hero-new-session-branch-guard"
step: 3
action: "switch-branch-optimistic"
title: "乐观切换分支/worktree"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:worktree/sessionCreate（切换随创建意图落地；无预检调用）"
anchors_source: "design/api-handbook.md §1.2（session-links 延后——hero 乐观切换 + 守卫回执兜底）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/hero-new-session-branch-guard/journey.md 步骤3 + 边界1"
  - "source: inferred —— 模式档位切换分支自 hero 表单模式要素（modepop 形态）"
---

# Contract · step-3-switch-branch-optimistic

## Outcome: success（乐观切换即时呈现）

### Preconditions
- fixture_spec：hero 打开；分支目录含至少一个非当前分支/worktree。

### Input
用户动作：切换分支/worktree。

### Output
UI 乐观切换为所选分支（无预检调用、无预检说明文本），选档即时呈现。

### State
hero 表单分支值更新（乐观态）；零 host 调用。

### Side-effect
none（切换仅表单态；落地随创建意图）

### Invariants
- 分支切换全链回执驱动：无预检调用，UI 无预检说明文本。

## Outcome: repeat-op-no-flicker（回执未达重复操作）

### Preconditions
- fixture_spec：乐观切换已呈现、host 回执未达（切换在途）。
- 分叉点：再次操作分支选择。

### Input
用户动作：回执未达时再次点选。

### Output
UI 保持乐观态，不因重复点击叠加切换或出现中间态闪烁。

### State
乐观态稳定；待创建意图一次性落地。

### Side-effect
none

### Invariants
- 乐观呈现仅是体验，落点由 host 守卫裁决；重复操作不改变落点。

## Outcome: mode-toggled（模式档位切换）

### Preconditions
- fixture_spec：hero 模式选择器在位（突击/其它模式档）。
- 分叉点：用户改选模式档（source: inferred —— hero 表单模式要素的用户可见行为）。

### Input
用户动作：切换模式档。

### Output
选档即时呈现（乐观，同分支语义）；创建意图按所选模式转发，落地由 host 守卫裁决。

### State
hero 模式值更新。

### Side-effect
none（随创建落地）

### Invariants
- 模式与分支同为回执驱动表单态，无预检。

## Journey Invariants
- hero 表单态（模式/分支）乐观即时、零预检；被拒绝的切换不落任何 host 侧状态。
