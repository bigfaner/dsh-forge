---
id: "fix-7"
title: "Fix（fix-3 回炉）: 模态宽度仍未落卡片挂点——裁切未修且浏览器相位加剧至 300px（几何复测实锤）"
priority: "P0"
estimated_time: "45min"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix（fix-3 回炉）: 模态宽度仍未落卡片挂点——裁切未修且浏览器相位加剧

> 来源：全面排查第 5 轮（[reports/acceptance-round2.md](../reports/acceptance-round2.md) §7）对 fix-3 完成态的几何复测。**fix-3 执行偏走了任务规格**：宽度仍挂 contentClassName（内容层），根因（内容 > 卡片 380 裁切）未动。

## Root Cause（fix-3 后复测，2026-10-03 CDP 实测）

| 相位 | dialog 卡片 | content 内容 | 左侧被裁 |
|---|---|---|---|
| browser（wide 680） | x=531, w=**380** | x=231, w=**680** | **300px**（目录列表 x=255 整体在可视区外左缘） |
| form（560） | x=531, w=**380** | x=351, w=560 | 180px（**label x=375 仍不可见，`labelVisible:false`**） |

fix-3 只加了 `.dswf-ap-modal-wide`（内容层 680）与列表高度——**卡片宽度没动**（官方 `.dialog { width: min(380px,100%) }`），内容反而更宽，裁切从 180px 加剧到 300px。执行记录 AC 勾选依据为单测/收集绿 + 「e2e 实跑不在任务面」——几何断言 AC（label 可见性）未落，正属原任务防回归条款。

## Description

按 fix-3 重写版原规格落法：宽度迁至官方 Modal **`className`**（挂对话框卡片，官方实现 `clsx(css.dialog, className)`，`Modal.module.css` 注释明示消费方经此定卡片尺寸）：

- `.dswf-ap-dialog`（卡片）基宽 `min(560px, 100%)`；`.dswf-ap-dialog-wide`（browser/repick 相位）`min(680px, 100%)`——相位映射复用 fix-3 已建的 `modalContentClassName` 纯函数改名/平移为卡片 className 映射（含单测平移）
- 移除内容层宽度（`.dswf-ap-modal` / `.dswf-ap-modal-wide` 的 width 删除，保留其余规则）；官方 `.content` 自身 `width:100%` 随卡片
- 90vw 上限随卡片类（官方 `.root` 24px padding 盒内 `100%` 已兜底小窗）

## Reference Files

- apps/web/src/flows/add-project/AddProjectFlow.tsx:288-293 — Modal 挂点（补 `className={...}`）
- apps/web/src/flows/add-project/flow.css:11-21 — 宽度类迁移（content → dialog）
- apps/web/src/flows/add-project/flow-model.ts:89-94 — 相位→类名映射平移（含 .test.ts）
- 官方件只读参照：`dsh-client-ui-primitives` `Modal.module.css`（.dialog/.root）与 Modal 实现（className → 卡片）
- 复测脚本：tmp-ui-review/georecheck.mjs（修复后必须复跑归档前后对照）

## Acceptance Criteria

- [ ] **几何断言（本回炉核心，不可再缺）**：两相位 `label/list 左缘 ≥ dialog.x`——L3 式 computed 断言入 smoke-skeleton 向导组（browser 相位量 `.dswf-fb-list`、form 相位量 `.dswf-rf-label`），防再次「单测绿但视觉裁切」
- [ ] 表单 label 全可见（georecheck 复测 `labelVisible:true` 归档执行记录）
- [ ] 浏览器相位卡片 680 / 表单相位 560；卡片右缘 = 内容右缘（无溢出）
- [ ] fix-3 已落的列表增高（min(50vh,480) + 256 下限）保持不回退
- [ ] 既有 e2e 断言零褪色；tsc + lint + 定向单测全绿
- [ ] 执行记录附 georecheck 前后几何对照表

## User Stories

- Story 1（两段式注册）：两段内容完整可见（走查人两轮复报的阻断项）。

## Hard Rules

- 宽度只经官方 `className` 卡片挂点；不 hack 官方 CSS-module 类、不用 `!important`。
- 未点名元素不变：模态头/footer/关闭机制/表单字段排布/浏览器内件形态全部保持。
- 官方件复用 + 令牌唯一。

## Implementation Notes

- 若官方 Modal 后续版本提供宽度 prop 可平移；当前 className 是官方注释认可的消费者挂点。
- 修复顺带核查：`.dswf-ap-modal` 其余规则（max-width 等）与卡片类合并后的层叠顺序。
