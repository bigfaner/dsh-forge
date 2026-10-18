---
journey: "host-guard-intent-forwarding"
step: 4
action: "desktop-baseline"
title: "桌面端对照循环主权"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "对照面 = 桌面端同源循环逻辑（无手机端专用代码路径）"
anchors_source: "design/api-handbook.md §一（新增通道收敛为透传/薄方法——零宿主循环改动）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/host-guard-intent-forwarding/journey.md 步骤4 + 边界4"
---

# Contract · step-4-desktop-baseline

## Outcome: success（循环行为零改变）

### Preconditions
- fixture_spec：手机端三类意图（暂停/派发/分支切换）均已完成一轮；桌面端对照观察全程。

### Input
核查动作：桌面端观察循环行为并对照不断线基准。

### Output
循环无任何因手机端操作而改变行为的路径——手机端动作只是经守卫后的合法意图注入。

### State
循环状态机轨迹与纯桌面操作基准等价。

### Side-effect
none

### Invariants
- 循环主权：不存在因手机端操作而改变循环行为的代码路径。

## Outcome: offline-intent-reconcile（断线期间意图补发）

### Preconditions
- fixture_spec：意图发出后手机端断线。
- 分叉点：断线下的落地对账。

### Input
系统事件：手机端断线期间意图已在途。

### Output
host 侧按守卫结果独立落地；恢复后手机端以 host 状态对账呈现。

### State
手机端呈现与 host 落地最终一致。

### Side-effect
host 独立落地（不受客户端断线影响）。

### Invariants
- 正确性 host 单点保证：断线不影响落地，只影响呈现时机。

## Journey Invariants
- 守卫单点 + 失败只回传数据 + 循环主权三不变式在全意图面成立。
