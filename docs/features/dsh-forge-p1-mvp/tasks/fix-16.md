---
id: "fix-16"
title: "Fix: 添加项目入口直达系统文件浏览器——桥在场时跳过模态按钮相位（＋/hero CTA/重新选择 → 直开 OS 对话框 → 表单相位），回退路径不变"
priority: "P1"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 添加项目入口直达系统文件浏览器

> 来源：走查人（2026-10-03）「点击左侧栏的添加项目按钮时，直接打开文件浏览器」。fix-14 落地后主路径为「＋ → 模态按钮相位 → 点『选择工作区目录』→ OS 对话框」——中间相位多余，砍掉一跳。

## Description

**桥在场（`__DSH_DIRECTORY_PICKER__` 探测通过）时的直达语义：**

- 三入口（左栏 ％＋ / hero CTA「＋添加项目」/ 表单「重新选择」）点击 → **立即调用 `pick()` 直开系统文件浏览器**（模态不出场）
- 选中路径 → 模态在**表单相位**打开（回填/联动/确认链全部现状不变）
- OS 对话框取消 → 干净退出（取消点语义前移到 OS 对话框，零副作用零模态残留）
- 防重入：pick 在途时入口再点 no-op（沿 fix-14 双击防抖机制，native-pick 相位守卫扩展到入口层）

**桥缺席（回退路径）不变**：模态 + 内嵌浏览器相位（现行形态零变化，e2e 断言零褪色）。

## Reference Files

- apps/web/src/flows/add-project/AddProjectFlow.tsx / flow-model.ts / flow-actions.ts —— 相位机与入口编排（browser 相位在桥在场时跳过；flow-open 打开缝）
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx（＋ 入口）/ apps/web/src/workbench/HeroEmpty.tsx（CTA 入口）—— 入口回调经现有 openAddProjectFlow 缝，改动收口在流程层（入口件零改动为宜）
- apps/web/src/flows/add-project/dir-picker.ts —— 桥探测（既有）
- prd/prd-ui-functions.md UF-3 —— 交互口径注记（段一 = 系统对话框直达；两段式语义保持：选目录[OS] → 表单 → 确认；取消点 = OS 对话框/表单）
- 关联：fix-14（桥机制与按钮相位——本任务是其交互简化收尾）

## Acceptance Criteria

- [ ] 桥在场：点 ％＋（与 hero CTA）→ OS 文件浏览器直开（**无中间模态**）；选中 → 表单相位模态回填；取消 → 无模态无副作用
- [ ] 表单「重新选择」同直达语义；repick 联动（未手改重构/浏览选定保留）不变
- [ ] pick 在途重入 no-op；执行/成功/失败相位不变；四步补偿链零变化
- [ ] 桥缺席回退：现行模态+内嵌浏览器形态与全部 e2e 断言零褪色
- [ ] 单测：桥在场打开流 = nativePick 即时触发（不经 browser 相位）+ 取消干净退出 + 重入守卫；PRD UF-3 口径注记落档
- [ ] tsc + lint + 定向单测绿；走查人实机确认直达体验

## User Stories

- Story 1（两段式注册）：一键进入系统熟悉的选目录交互，少一跳。

## Hard Rules

- dsh 底子：桥契约与 pick 语义零改（fix-14 面不动）；未点名元素不变（表单相位全部、模态壳机制、回退浏览器）。
- 入口件（侧栏/hero）零改动为宜——直达编排收口在流程层（openAddProjectFlow 缝内路由）。

## Implementation Notes

- 实现形态建议：flow-open 打开时按桥探测分流——桥在场直接进入 `native-pick` 在途态（模态 open=false），落点成功再开模态进 form；失败（pick reject）→ 模态开在 browser 相位带 nativePickError（现行错误面复用）。
- OS 对话框为应用级模态（Windows），在途期间入口交互自然被阻——重入守卫为防御面非体验面。
