---
journey: "pairing-entry-mobile-view"
step: 3
action: "refresh-keep-pairing"
title: "刷新页面配对态保持"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "GET /remote/（刷新重载同一单文件产物）"
  endpoint: "POST /remote/__rpc（重载后首拉；disconnected 信封驱动覆盖层）"
anchors_source: "design/api-handbook.md §头部 + §三错误模型"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/pairing-entry-mobile-view/journey.md 步骤3"
  - "source: inferred —— 断网刷新分支自错误模型 disconnected 推导（网络中断时刷新的用户可见行为）"
---

# Contract · step-3-refresh-keep-pairing

## Outcome: success（刷新恢复一致视图）

### Preconditions
- fixture_spec：同 step-2 success；配对态 cookie 在位。

### Input
用户动作：刷新页面。

### Output
同一单文件产物再次加载，视图恢复一致；无需重新配对（配对态保持）。

### State
对话主视图重新初始化至与刷新前等价的渲染基准。

### Side-effect
none

### Invariants
- 配对态跨刷新保持（cookie 自持，不依赖页面内存态）。

## Outcome: offline-refresh（断网刷新）

### Preconditions
- fixture_spec：同 success，且刷新发起时网络不可达（RPC 通道不可达）。
- 分叉点：`{ok:false, error:{code:'disconnected'}}` 或 fetch 失败（source: inferred —— 手册 §三错误模型手机端处置）。

### Input
用户动作：断网状态下刷新页面。

### Output
产物静态面仍可加载；数据面呈现断线覆盖层，不出现伪造数据或半初始化 UI。

### State
断线态（覆盖层在显）；恢复后自动重连对账。

### Side-effect
none

### Invariants
- 断线只影响数据面呈现，不破坏配对态与产物加载。

## Outcome: pairing-expired（配对态刷新时过期）

### Preconditions
- fixture_spec：刷新发起时配对 cookie 已过期/被撤销（与 success 的有效配对态互斥）。
- 分叉点：过期配对态访问（source: inferred —— 手册鉴权自持语义：cookie 失效 = 回到未配对 gate）。

### Input
用户动作：以过期配对态刷新 `/remote/`。

### Output
呈现配对引导态（同 step-1 unpaired-gate 呈现）；不进入对话视图、不出现半初始化 UI。

### State
未配对态；重新配对后恢复。

### Side-effect
none

### Invariants
- 配对态失效是安全降级：永不渲染半初始化对话 UI。

## Journey Invariants
- 配对态自持：刷新/断网都不要求重新配对；视图恢复以产物单文件为唯一加载源。
