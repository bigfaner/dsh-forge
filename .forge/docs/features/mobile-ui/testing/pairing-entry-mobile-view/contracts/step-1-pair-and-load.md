---
journey: "pairing-entry-mobile-view"
step: 1
action: "pair-and-load"
title: "扫码配对进入 mobile 单文件产物"
risk_level: "Medium"
surface: { type: "mobile", key: "mobile" }
anchors:
  page: "GET /remote/ → mobile 单文件 index.html"
  endpoint: "POST /remote/__rpc {channel,payload}（鉴权：authorizeIndex 放行优先 + dswf_forge_remote cookie 兜底）"
anchors_source: "design/api-handbook.md §二（GET /remote/ 产物更换）+ §头部（统一信封）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/pairing-entry-mobile-view/journey.md 步骤1 + 边界1/2"
---

# Contract · step-1-pair-and-load

## Outcome: success（配对后加载手机专属产物）

### Preconditions
- fixture_spec：已配对的手机浏览器（移动 UA，390×844 视口）；host 在线且配对态 cookie 有效。
- 桌面 web-app 产物同 host 部署在位（零引用核查对照基线）。

### Input
用户动作：手机扫码完成配对，浏览器进入 `/remote/`。

### Output
页面加载 mobile 独立单文件产物，呈现可交互视图；加载资源全部来自手机产物自身（无桌面 bundle 资产）。

### State
配对态建立并保持；页面处于对话主视图初始化完成态。

### Side-effect
none（页面加载不写宿主会话状态）。

### Invariants
- 产物为独立单文件工程，与桌面工程零模块引用。

## Outcome: unpaired-gate（未配对直接访问）

### Preconditions
- fixture_spec：浏览器无任何配对态（cookie 缺席/失效）直接打开 `/remote/`；与 success 的配对态前置互斥。

### Input
用户动作：地址栏直接访问 `/remote/`。

### Output
呈现配对引导/错误态；不进入对话视图，不出现半初始化 UI。

### State
未配对态保持；不产生任何会话视图挂载。

### Side-effect
none

### Invariants
- 未配对访问绝不渲染部分对话 UI（gate 在产物加载面完成）。

## Outcome: zero-desktop-reference（产物引用隔离核查）

### Preconditions
- fixture_spec：同 success（已配对进入）；核查面打开并记录全部网络请求。
- 分叉点：对加载产物发起资源引用审计（监听全部请求 URL）。

### Input
核查动作：枚举页面加载的全部资源引用。

### Output
资源引用集合与桌面工程 bundle 资产零交集。

### State
同 success。

### Side-effect
none

### Invariants
- 同一 host 双产物并存互不干扰。

## Journey Invariants
- 手机产物为独立单文件工程，与桌面工程零模块引用；同一 host 双产物并存互不干扰。
- 手机视图是为触屏设计的完整体验，任何形态都不走桌面裁剪分支。
