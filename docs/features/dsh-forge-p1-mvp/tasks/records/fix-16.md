---
status: "completed"
started: "2026-10-04 08:33"
completed: "2026-10-04 08:50"
time_spent: "~17m"
---

# Task Record: fix-16 Fix: 添加项目入口直达系统文件浏览器——桥在场时跳过模态按钮相位（＋/hero CTA/重新选择 → 直开 OS 对话框 → 表单相位），回退路径不变

## Summary
添加项目入口直达系统文件浏览器（砍掉模态按钮中间相位）：直达编排收口动作面新增 flowActions.open()——桥在场冷启（项目树「＋」/ hero CTA 经 openAddProjectFlow 缝）复位残态后直入 native-pick 在途（模态不出场，pick() 即时直开系统 OS 目录对话框），收场 reveal 通知开模态：选中 → canonical 对账落 form 后开模态（表单相位）；pick/对账失败 → 回落 browser 相位带现行错误面开模态；取消 → 不开模态干净退出零残留。入口层在途守卫：native-pick 相位再点 open no-op（防双开系统对话框）。桥缺席 open 同径 reveal 即开模态 browser 相位起步（现行形态零变化，回退 e2e 断言零褪色）。表单「重新选择」直达语义 fix-14 已就位（nativeBrowseAction），本任务零触碰。PRD UF-3 直达口径补记落档。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/flows/add-project/flow-actions.ts
- apps/web/src/flows/add-project/flow-actions.test.ts
- apps/web/src/flows/add-project/AddProjectFlow.tsx
- docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md

### Key Decisions
- 直达编排收口动作面 open()（非入口件/装配壳）——Hard Rule 入口零改动：侧栏/hero 经 openAddProjectFlow 缝直抵 actions.open，openFlow 壳仅保留已注册集合 fail-soft 预载
- 冷启在途态 = 复位 + 直入（setState(() => beginNativePick(fresh))，不经 browser 模态相位）+ reveal 通知收场开模态（选中 = 表单相位 / 失败 = browser 相位带现行错误面 / 取消不开）；reveal 幂等——按钮/repick 路径模态已开时 no-op，故在途体收场统一通知
- fix-14 面零改：runNativePick 仅提取共享在途体（选中对账/取消回落/迟到守卫语义逐字保留），nativePick 按钮路径与 flow-model 相位机不动；表单「重新选择」直达 fix-14 已就位零触碰
- 入口层在途守卫取 native-pick 相位判据（再点 no-op——不复位不复跑）：OS 对话框应用级模态下入口交互自然被阻，守卫为防御面非体验面

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1043
- **Failed**: 0
- **Coverage**: 81.6%

## Acceptance Criteria
- [x] 桥在场：点 ％＋（与 hero CTA）→ OS 文件浏览器直开（无中间模态）；选中 → 表单相位模态回填；取消 → 无模态无副作用
- [x] 表单「重新选择」同直达语义；repick 联动（未手改重构/浏览选定保留）不变
- [x] pick 在途重入 no-op；执行/成功/失败相位不变；四步补偿链零变化
- [x] 桥缺席回退：现行模态+内嵌浏览器形态与全部 e2e 断言零褪色
- [x] 单测：桥在场打开流 = nativePick 即时触发（不经 browser 相位）+ 取消干净退出 + 重入守卫；PRD UF-3 口径注记落档
- [x] tsc + lint + 定向单测绿；走查人实机确认直达体验

## Notes
测试证据：vitest 全量 1043/1043 绿（apps/web/src/flows/add-project 定向 173 含新增 8 项 fix-16 直达用例：直入在途/pick 即时恰一次/reveal 零通知/残态复位/选中 reveal 恰一次/取消零通知零副作用/pick·对账失败 reveal 错误面/在途重入守卫/桥缺席现行形态）；tsc -b exit 0；pnpm lint 全绿（ox/imports/tokens/selftest/types）。回退面零褪色实证 = p1mvp/project-registration e2e 10/10（破例跑单 spec：组件缝 openFlow→actions.open→reveal→setOpen 为静态单测不可达面，回退口径下该缝是模态仍开得的唯一回归面）。coverage 81.56% = 变更目录收窄口径（apps/web/src/flows/add-project 全目录，v8 provider；含仅静态可测的 View 装配件）。AC「走查人实机确认直达体验」属人工环节——机制面已全部就位并单测覆盖（fix-14 record 同口径）。本任务为 fix-record 恢复形态：前次会话零实现（存在性对照——apps/web 零未提交改动、fix-15 后无后续提交、openFlow 仍恒开模态），依派发注记转真实现（fix-6 形态第三例）。
