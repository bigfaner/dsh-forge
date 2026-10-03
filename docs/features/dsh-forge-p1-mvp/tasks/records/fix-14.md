---
status: "completed"
started: "2026-10-03 19:36"
completed: "2026-10-03 20:02"
time_spent: "~26m"
---

# Task Record: fix-14 Fix: 段一目录选取复用系统文件选择器——直用官方 __DSH_DIRECTORY_PICKER__ preload 桥契约（参考 dsh 原生优先哲学），内嵌浏览器降为回退面

## Summary
段一目录选取复用系统文件选择器（官方 __DSH_DIRECTORY_PICKER__ 桥契约直用，同形零 fork）：①宿主桥——preload 暴露 window.__DSH_DIRECTORY_PICKER__ = { pick }（唯一成员，与官方 client.js:62-76 逐字同形）+ main 进程通道 dsh-forge:directory-picker（dialog.showOpenDialog openDirectory 单选；取消 = null；异常 reject = 错误面；boot-channel 同制装配胶不进 forge:* allowlist）+ DSH_FORGE_DIRECTORY_PICKER=off 降桥开关（e2e 回退面口径）；②段一重构——桥在场相位机增 native-pick 在途态（beginNativePick/endNativePick：防双击双开对话框、取消回落起源零副作用、迟到结果守卫），NativePickPanel 按钮面替换内嵌浏览器，选中经 dirSource canonical 对账（applyListing 同口径）落 form；③表单「浏览…」「重新选择」三 target 同桥直选（nativeBrowseAction——同步在途守卫 + canonical 对账 + 错误面；BrowsePanel 回退面不变）；④已注册口径迁移——表单相位「已注册」chip + 挂接提示（data-dswf-rf-registered），回退浏览器行级标记与 smoke L766 断言原样，PRD UF-3 走查裁决注记落档。全部 11 个向导走查 e2e 启动点加降桥开关（OS 对话框不可 e2e——桥 mock 单测 + 回退面 e2e 承担回归）。

## Changes

### Files Created
- apps/host/src/ipc/directory-picker-channel.ts
- apps/host/src/ipc/directory-picker-channel.test.ts
- apps/web/src/flows/add-project/dir-picker.ts
- apps/web/src/flows/add-project/dir-picker.test.ts

### Files Modified
- apps/host/src/ipc/index.ts
- apps/host/src/ipc/preload-api.ts
- apps/host/src/ipc/preload-api.test.ts
- apps/host/src/ipc/preload.mts
- apps/host/src/main.ts
- apps/web/src/flows/add-project/AddProjectFlow.tsx
- apps/web/src/flows/add-project/AddProjectFlow.test.tsx
- apps/web/src/flows/add-project/RegisterForm.tsx
- apps/web/src/flows/add-project/RegisterForm.test.tsx
- apps/web/src/flows/add-project/flow-model.ts
- apps/web/src/flows/add-project/flow-model.test.ts
- apps/web/src/flows/add-project/flow-actions.ts
- apps/web/src/flows/add-project/flow-actions.test.ts
- apps/web/src/flows/add-project/form-actions.ts
- apps/web/src/flows/add-project/form-actions.test.ts
- apps/web/src/flows/add-project/flow.css
- apps/web/src/flows/add-project/form.css
- apps/web/src/flows/add-project/index.ts
- apps/web/src/flows/add-project/README.md
- docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md
- e2e/specs/smoke-skeleton.spec.ts
- e2e/specs/flywheel.spec.ts
- e2e/specs/knowledge-integration.spec.ts
- e2e/specs/p1mvp/project-registration.spec.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts

### Key Decisions
- 桥通道走 boot-channel 同制（ipcMain.handle 直注 + 不进 FORGE_CHANNEL_ALLOWLIST）——官方桥契约形状属宿主↔renderer 装配胶，非 forge:* 域通道，免三处一体（contracts→web/rpc→core）改造
- main 侧 dialog 依赖以绑定调用 lambda 注入（() => dialog.showOpenDialog({properties:['openDirectory']})）——隔离 Electron overload 形状，逻辑面（pickDirectory 三支语义）可单测；main.ts 97 行守住 ≤~100 纪律
- e2e 回退面经 preload 环境开关 DSH_FORGE_DIRECTORY_PICKER=off（11 个向导走查启动点显式注入）——Electron 载体上桥恒在会翻转向导 UI 面，per-spec 显式 env 优于 config 级 env 变异传播（无框架内部行为假设）
- 已注册口径迁移选表单相位 chip+提示（registeredPaths.has(workspaceDir)——canonical 对账路径直配），回退浏览器行级标记零改动（-browse 双面哲学产品侧对应：回退面不删除不降质）
- nativeBrowseAction（表单三 target）与 flowActions.nativePick（段一相位机）分开承载——前者无相位机（表单态常驻，同步 ref 守卫防双开），后者复用 FlowState（零隐藏态 + repick 起源表单挂载保持经 selection 推导返回相位）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1031
- **Failed**: 0
- **Coverage**: 87.7%

## Acceptance Criteria
- [x] 桥在场：段一=「选择工作区目录」按钮→系统 OS 目录对话框；选中回填进表单（canonical 对账）；取消停留零副作用；OS 原生盘符/快速访问可用
- [x] 桥缺席：回退现内嵌浏览器（形态/交互/已注册标记零变化），既有 e2e 向导组断言零褪色
- [x] 表单「浏览…」三 target 同桥复用 + 回退不变
- [x] 已注册口径：表单相位已注册目录呈现挂接提示；回退面 L766 断言不弱化；PRD UF-3 注记落档
- [x] 桥契约 pin：__DSH_DIRECTORY_PICKER__ 形状与 pick 语义单测（对照 client.js 源）；桥 mock 单测 + 回退面 e2e 承担回归
- [x] tsc + lint + 定向单测绿

## Notes
测试证据：vitest 全量 1031/1031 绿（host 135 + web add-project 165 含新增 24 项）；tsc -b exit 0；pnpm lint 全绿（ox/imports/tokens/selftest/types——令牌零裸值含新增 CSS）。coverage 87.65 = 变更模块收窄口径（apps/host/src/ipc + flows/add-project 语句覆盖，v8 provider；directory-picker-channel.ts 与 dir-picker.ts 满覆盖被表隐藏；preload.mts 0% 为 electron 装桥文件既有口径）。AC-1 的「走查人实机确认」属人工环节——机制面已全部就位并单测覆盖。e2e 未在本任务运行（fix 工作流纪律：不起 dev server / 不跑 e2e）；回退面回归由 11 个启动点的降桥开关 + 既有断言在 submit 质量门承担。官方上游 pin 未动（vendored/官方件零触碰）。
