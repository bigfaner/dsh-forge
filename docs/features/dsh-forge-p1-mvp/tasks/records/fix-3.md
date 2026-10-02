---
status: "completed"
started: "2026-10-03 01:18"
completed: "2026-10-03 01:25"
time_spent: "~7m"
---

# Task Record: fix-3 Fix: 添加项目·段一文件浏览器放大（模态加宽 680 + 列表增高 min(50vh,480)，仅动浏览器相位）

## Summary
段一文件浏览器放大：模态内容区宽度拆分为基宽 560（form/executing/success/failure）+ 浏览器相位加宽 680（browser/repick，90vw 上限沿基类）；目录列表高 256 → min(50vh, 480px)（256 原型刻度为下限）。宽度拆分经 flow-model 纯函数 modalContentClassName 相位映射挂到官方 Modal contentClassName（既有机制），表单相位全部尺寸零变化。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/flows/add-project/flow.css
- apps/web/src/flows/add-project/browser.css
- apps/web/src/flows/add-project/flow-model.ts
- apps/web/src/flows/add-project/flow-model.test.ts
- apps/web/src/flows/add-project/AddProjectFlow.tsx

### Key Decisions
- dswf-ap-modal 核实为两相位共用（单 Modal 承载全部相位）→ 按 Implementation Notes 拆分：基类 .dswf-ap-modal 560 + 修饰类 .dswf-ap-modal-wide 680，相位映射收口 flow-model.modalContentClassName（browser/repick → wide；form 及终局相位 → 基类）
- 列表高度补 256px 最小值下限（Hard Rule 白名单项）：矮窗（<512px）50vh 回落时不低于原型刻度，保证「放大」语义在任何窗口不缩水
- 表单内 BrowsePanel（「浏览…」改选）相位仍为 form → 模态保持 560（Hard Rule：段二尺寸不在任务面）；其内嵌 .dswf-fb-list 随类共享增高（同一浏览器组件口径，浏览器内件形态零变化）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 132
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 模态内容区 680px / 90vw 上限；列表高 min(50vh, 480px)（AC 以执行记录终值为准）
- [x] 仅动浏览器相位：段二表单模态宽度、字段排布、按钮区全部保持现状；浏览器内件形态不变
- [x] 既有 e2e 断言零改动零褪色（smoke-skeleton 组二/组三选择器与语义锚不动）
- [x] token lint 绿（新增/改动尺寸属布局刻度，dsw-raw 豁免注记同步执行记录）

## Notes
终值拍板：无走查人现场微调，取任务规格原值 680 / min(50vh, 480) + 256 下限。dsw-raw 豁免注记：width/height 属布局刻度，非 lint-tokens TOKEN_PROPS 面（色/字/圆角/间距），零新增豁免；flow.css/browser.css 既有 dsw-raw 口径（官方行语言原值）未动。验证：worktree 无 justfile，等价命令 = playwright -c e2e/playwright.config.ts --list（14 tests / 8 files 收集绿，含 smoke-skeleton）+ pnpm lint 全链绿（token-lint 0 裸值 / 120 文件）+ 定向测试 vitest --project web apps/web/src/flows/add-project 132/132（11 文件）；改动逻辑 flow-model.ts 覆盖率 100% stmts/lines/funcs（branch 96.29% 为 registerFailureCopy 既有未覆盖支路，非本任务代码）。e2e 实跑不在本任务面（fix 任务静态 + 定向验证；smoke-skeleton 收集绿 + 选择器 grep 证零褪色）。
