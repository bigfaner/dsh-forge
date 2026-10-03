---
id: "fix-3"
title: "Fix: 添加项目模态宽度缺陷——内容 560 > 官方卡片 380 致左半裁切（label 不可见）+ 浏览器列表增高"
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

# Fix: 添加项目模态宽度缺陷——内容 560 > 官方卡片 380 致左半裁切（label 不可见）+ 浏览器列表增高

> 来源：UI 走查第 1 轮（[reports/ui-walkthrough-round1.md](../reports/ui-walkthrough-round1.md) §2.2「文件浏览器不够大」）+ 第 2 轮走查人实机复报「**表单左半边被隐藏、label 看不到**」。
> **本任务为 R1 §2.2 的改判与扩面**：根因已实测查明——不是尺寸审美问题，是模态内容溢出裁切缺陷；且两段（浏览器/表单）同壳同缺陷。

## Root Cause（实测几何证据，2026-10-03 CDP 量取）

官方 Modal 的对话框卡片硬编码 `width: min(380px, 100%)` + `overflow: hidden`（`@deepseek-ai/dsh-client-ui-primitives` `Modal.module.css` `.dialog`；组件无宽度 prop）。产品把宽度设在了**内容层**：`contentClassName="dswf-ap-modal"` → `.dswf-ap-modal { width: 560px }`（[flow.css:9-14](../../../apps/web/src/flows/add-project/flow.css)）。内容 560px 比卡片 380px 宽 180px → 卡片 `overflow:hidden` 裁切。实测（1440 窗）：

| 层 | x | 宽 | 说明 |
|---|---|---|---|
| `.dialog`（官方卡片） | 531 | 380 | 可视区 [531, 911] |
| `.dswf-ap-modal`（内容） | 351 | 560 | 左溢出 180px |
| 表单行 `.dswf-rf-row` | 375 | 512 | **左缘 156px 在裁切区内——label 全部不可见** |

段一浏览器与段二表单共用该壳 → 用户看到的「浏览器不够大」实为同源裁切。

**既有 e2e 为何没拦住**：smoke-skeleton 向导组断言的是 `inputValue()`/属性值（DOM 值不依赖视觉），视觉裁切对其不可见——属 e2e 盲区，本任务补 L3 式几何断言。

## Description

宽度改挂官方预留的正确挂点：Modal 的 `className` 落在**对话框卡片**上（实现 `clsx(css.dialog, className)`，官方注释明示消费方经此定卡片尺寸）——`.dswf-ap-dialog { width: min(680px, 100%) }`；移除内容层宽度（`.content` 自身 `width:100%` 随卡片）。同步放大浏览器目录列表高 256 → min(50vh, 480px)。

## Reference Files

- apps/web/src/flows/add-project/AddProjectFlow.tsx — Modal 挂点（contentClassName → className 迁移）
- apps/web/src/flows/add-project/flow.css — 宽度口径迁移（.dswf-ap-modal → .dswf-ap-dialog）
- apps/web/src/flows/add-project/browser.css — `.dswf-fb-list` 高度
- 官方件（只读参照）：`dsh-client-ui-primitives` `Modal.module.css`（.dialog 380/overflow hidden/.content 100%）与 `Modal` 实现（className → 卡片）
- docs/features/dsh-forge-p1-mvp/reports/shots/p2-addproject-browser.png — 走查截图（左裁切可见）
- 复现/量取脚本：tmp-ui-review/formdiag.mjs（CDP 几何 dump）

## Acceptance Criteria

- [ ] 段二表单 label 全可见：几何断言 `label.getBoundingClientRect().x ≥ dialog.x`（L3 式 computed 断言入 smoke-skeleton 向导组，防回归）
- [ ] 模态卡片宽 ~680px（`min(680px, 100%)`，走查可微调拍板）；内容层不再自带宽度（无溢出：`content.right ≤ dialog.right`)
- [ ] 段一浏览器列表高 min(50vh, 480px)；骨架/空态/错误条随新尺寸不破相
- [ ] 两段共用壳、尺寸一致；表单字段排布/按钮区/浏览器内件形态（面包屑/行高 32/已注册标记）**全部保持不变**
- [ ] 既有 e2e 断言零褪色（选择器与语义锚不动）
- [ ] token lint 绿（尺寸属布局刻度，dsw-raw 豁免注记同步执行记录）

## User Stories

- Story 1（两段式注册）：两段内容完整可见，表单字段名可读。

## Hard Rules

- **宽度只经官方 `className` 挂点设置卡片**——不 hack `.dialog` 内部结构、不用 `!important`、不给 contentClassName 设宽。
- **未点名元素保持不变**：模态头（标题/✕）/footer/官方 Modal 机制（Esc/遮罩关闭/门户）一律不动。
- 官方件复用 + 令牌唯一纪律全程适用。

## Implementation Notes

- 改动落点：AddProjectFlow.tsx Modal props（`className="dswf-ap-dialog"`）+ flow.css 宽度类迁移 + browser.css 列表高 —— 三处小改。
- 几何断言参考 smoke-skeleton 组一 L3 池写法（page.evaluate + getBoundingClientRect 比对）。
- 修复后用 formdiag.mjs 同法复量归档（执行记录附前后几何对照）。
