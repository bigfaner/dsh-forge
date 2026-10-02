---
id: "fix-2"
title: "Fix: 主窗口隐藏原生标题栏（titleBarStyle hidden + overlay，对齐 dsh 官方桌面形态）"
priority: "P1"
estimated_time: "1h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 主窗口隐藏原生标题栏（titleBarStyle hidden + overlay，对齐 dsh 官方桌面形态）

> 来源：UI 走查第 1 轮（[reports/ui-walkthrough-round1.md](../reports/ui-walkthrough-round1.md) §2.1）。走查人实机反馈「没有隐藏顶部标题栏」。

## Root Cause

`apps/host/src/window/create.ts:26-38` BrowserWindow 使用默认 `frame`，原生 Windows 标题栏在场；设计文档从未定义窗口形态（全 docs 检索「标题栏 / frameless / titleBar」零命中）——设计空白，非实现走样。原型基准为网页无此层；dsh 官方桌面为无标题栏形态。

## Description

主窗口建窗参数补 `titleBarStyle: 'hidden'` + `titleBarOverlay`（Windows 形态）：标题文字区消失、内容区上探，原生最小化/最大化/关闭钮以 overlay 保留在右上角，窗口保持可拖动。对齐 dsh 官方桌面窗口形态——**不自绘平行标题栏模式**（P1 无自绘窗口钮、无自定义拖拽条；overlay 原生钮唯一）。

## Reference Files

- apps/host/src/window/create.ts — BrowserWindow options 唯一落点
- apps/host/src/window/lifecycle.ts / index.ts — 窗口生命周期（确认无 frame 相关耦合）
- e2e/specs/host-boot.spec.ts / e2e/specs/smoke-skeleton.spec.ts — 回归面（建窗变更后须全绿）
- docs/proposals/dsh-forge-redesign/prototype/index.html — 原型基准（无标题栏层）

## Acceptance Criteria

- [ ] 原生标题栏隐藏（无标题文字条）；窗口可拖动、可最小化/最大化/关闭（overlay 原生钮）
- [ ] overlay 颜色随官方主题令牌（浅/暗主题切换不破相；取官方 bg 层令牌实值，不裸值）
- [ ] 内容区顶部不被窗口控件遮挡（左栏官方 sidebar 壳与中区顶部对齐呈现，走查目视确认）
- [ ] e2e 回归不褪色：host-boot 2 用例 + smoke-skeleton 组一实跑全绿（窗口创建路径变更后）
- [ ] 未点名元素不变：窗口尺寸 1440×900、ready-to-show 显窗行为、preload/webPreferences、`main.ts` 91 行纪律全部保持

## User Stories

- Story 2（日常会话）：工作台以完整沉浸形态呈现，无系统标题栏割裂。

## Hard Rules

- **dsh 官方形态基准**：titleBarStyle hidden + titleBarOverlay 是唯一改动面；禁止引入自绘标题栏 / 自绘窗口钮 / `-webkit-app-region` 拖拽条（属后续里程碑裁决面，P1 不做）。
- 令牌唯一纪律适用于 overlay 颜色取值（不裸值）。
- 打包形态同步验证：win-unpacked / NSIS 安装形态下窗口形态一致（4.3 冒烟路径顺带走查）。

## Implementation Notes

- 改动落点单文件单处：`createMainWindow` options 增两键（`titleBarStyle: 'hidden'`、`titleBarOverlay: { color, symbolColor, height }`——高度用 Windows 官方默认刻度，颜色取主题 bg 令牌；主题令牌为 renderer 面，host 侧取静态实值 + 注记即可，不做主题联动机制）。
- Windows 单平台（P1 分发面）；macOS/Linux 形态归 M8 三平台任务。
- 单测：create.ts 现有测试面为 fake BrowserWindow 注入——补 options 断言（titleBarStyle/titleBarOverlay 在场）即可，无新机制。
