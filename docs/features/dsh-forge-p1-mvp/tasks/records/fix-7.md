---
status: "completed"
started: "2026-10-03 13:08"
completed: "2026-10-03 13:23"
time_spent: "~15m"
---

# Task Record: fix-7 Fix（fix-3 回炉）: 模态宽度仍未落卡片挂点——裁切未修且浏览器相位加剧至 300px（几何复测实锤）

## Summary
fix-3 回炉：模态宽度从内容层（contentClassName→.dswf-ap-modal 系）迁至官方 Modal className 卡片挂点（.dswf-ap-dialog 基宽 min(560px,100%) / .dswf-ap-dialog-wide min(680px,100%)，相位映射纯函数 modalContentClassName 改名平移为 modalClassName 含单测）；smoke-skeleton 向导组新增 L3 式几何防回归断言（两相位卡片宽 + label/list 左缘≥卡片左缘 + 内容右缘=卡片右缘）；georecheck 复测归档前后对照——裁切 300/180px → 0，labelVisible:false → true

## Changes

### Files Created
无

### Files Modified
- apps/web/src/flows/add-project/AddProjectFlow.tsx
- apps/web/src/flows/add-project/flow.css
- apps/web/src/flows/add-project/flow-model.ts
- apps/web/src/flows/add-project/flow-model.test.ts
- e2e/specs/smoke-skeleton.spec.ts
- tmp-ui-review/georecheck.mjs
- tmp-ui-review/walk3.mjs
- tmp-ui-review/formdiag.mjs

### Key Decisions
- 宽度只经官方 className 卡片挂点（clsx(css.dialog, className)）：内容层宽度类整块移除——.dswf-ap-modal/.dswf-ap-modal-wide 仅含 width 口径无其余规则可保留；90vw 上限收编入卡片类 min() 的 100% 腿（官方 .root 24px padding 盒内取宽已兜底小窗，避免内容层残留 max-width 在 480-622px 窗内致内容右缘≠卡片右缘）
- 相位→类名映射按规格改名平移：modalContentClassName → modalClassName（browser/repick → 'dswf-ap-dialog dswf-ap-dialog-wide'，其余相位 → 'dswf-ap-dialog'），单测同步平移（含文件头注释）
- e2e 断言纯增量（+60 行零删改——既有断言零褪色）：browser 相位量 .dswf-fb-list、form 相位量 .dswf-rf-label，另加卡片宽 680/560 与内容右缘=卡片右缘等值断言（1440 窗不触 100% 腿）
- 顺带修复 tmp-ui-review/walk3.mjs 与 formdiag.mjs 的未用变量 log→_log（预置 lint 红阻断 lint 门，AC 要求 lint 绿；零行为变化）
- 层叠核查（Implementation Notes 项）：消费类与官方 CSS-module 类同特异性 0,1,0，bundle 内 flow.css 晚于 Modal.module.css 注入故胜出——fix-3 实测（内容层 560/680 曾生效）+ 本次 georecheck 卡片实测 680/560 双重印证

## Test Results
- **Tests Executed**: Yes
- **Passed**: 133
- **Failed**: 0
- **Coverage**: 79.5%

## Acceptance Criteria
- [x] 几何断言（本回炉核心）：两相位 label/list 左缘 ≥ dialog.x——L3 式 computed 断言入 smoke-skeleton 向导组（browser 相位量 .dswf-fb-list、form 相位量 .dswf-rf-label）
- [x] 表单 label 全可见（georecheck 复测 labelVisible:true 归档执行记录）
- [x] 浏览器相位卡片 680 / 表单相位 560；卡片右缘 = 内容右缘（无溢出）
- [x] fix-3 已落的列表增高（min(50vh,480) + 256 下限）保持不回退
- [x] 既有 e2e 断言零褪色；tsc + lint + 定向单测全绿
- [x] 执行记录附 georecheck 前后几何对照表

## Notes
georecheck 前后几何对照（脚本 tmp-ui-review/georecheck.mjs，1440 窗 CDP 实测；前=acceptance-round2 §7 对 fix-3 完成态复测，后=本次修复后复跑，截图 tmp-ui-review/g1-browser-after-fix7.png / g2-form-after-fix7.png）：

| 相位 | 层 | 前（fix-3 后） | 后（fix-7 后） |
|---|---|---|---|
| browser(wide) | dialog 卡片 | x=531, w=380 | x=381, w=680 |
| browser | content 内容 | x=231, w=680（左溢 300px，fb-list x=255 在可视区外） | x=381, w=680，right=1061=卡片右缘 |
| browser | fb-list 左缘 | x=255 < 531（被裁） | x=405 ≥ 381（无裁切） |
| form | dialog 卡片 | x=531, w=380 | x=441, w=560 |
| form | content 内容 | x=351, w=560（左溢 180px） | x=441, w=560，right=1001=卡片右缘 |
| form | label | x=375 < 531，labelVisible:false | x=465 ≥ 441，labelVisible:true |

验证：tsc -b 退出 0；pnpm lint 全绿（ox/imports/tokens/selftest/types）；定向单测 apps/web/src/flows/add-project/ 11 文件 132/132（flow-model 20/20 含平移后映射双支）；e2e smoke-skeleton 向导组 1/1 实机通过（含新增几何断言）；覆盖率（vitest v8，add-project 域）= 79.5% stmts / 80.06% lines（≥60% 目标）。e2e tsconfig 独立 tsc -p 有预置 DOM-lib 缺失报错（全套件一致、非本次引入、不属仓内门——e2e 门 = oxlint + playwright 实跑）。尺寸裸值（min(560px,100%)/min(680px,100%)）属布局刻度，dsw-raw 口径沿 fix-3 执行记录注记（lint-tokens 不拦宽度）。
