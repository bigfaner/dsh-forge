---
status: "completed"
started: "2026-10-08 18:12"
completed: "2026-10-08 18:12"
time_spent: ""
---

# Task Record: fix-3 Fix: 任务抽屉诊断失败 toast「发送给 agent」被抽屉 overflow 裁剪不可点

## Summary
T-test-run 两遗留问题收口：①drawer 上下文 DiagToast「发送给 agent」被 .dswf-td-drawer overflow:hidden 裁剪不可点（产品缺陷，CSS 改锚修复）——.dswf-td-foot 增定位宿主、.dswf-td-diagwrap 撤 relative，toast 在 drawer 上下文改锚脚行上方·右缘贴抽屉右内缘（right = 脚行右内边距同刻度）+ max-width = min(340px, 抽屉内宽) 收敛行集换行（原型 toastRich maxWidth 收敛同形；UF-3 v19–v21 就近呈现·5s·发送路由语义保持，toast 仍随抽屉装载/卸载）；e2e T3 点按序回调形态①（抽屉开时直点，撤「先关抽屉再点」绕行）。②T1 Step1e「两会话常驻可回访」侧栏行锚 30s 缺席——裁决为测试锚漂移非产品缺口：上游 reuseOrCreateBlank（dsh-client-ui-workspace client.js:800-809）对同工作区 blank 会话复用 + setDraft 整体替换，连续两次未发送的「打开新会话」折叠为同一会话；sidebar-model sessionVisible 仅当前选中 blank 可见（官方浏览器口径）而 blank 确入账本；诚实观测改写 = 首会话预填经用户发送落地（非 blank 常显，sc6「用户事件落地」同径）后第二渠道真新建、两会话行常驻、行点回转录恢复（disk sessionId 锚定，fixtureSessionIds mtime 升序）。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/overview/drawer/drawer.css
- apps/web/src/views/overview/drawer/index.test.tsx
- e2e/specs/m3/overview-entry-new-session.spec.ts
- e2e/support/navigation.ts

### Key Decisions
- 问题① 改锚选型 = 右缘贴抽屉右内缘 + max-width 收敛（任务文件候选三取后二合并）：fixed 定位/portal 破坏 TaskDrawerBody 纯渲染体（renderToStaticMarkup 可测面）；改锚后 toast 完整落于抽屉盒内，T3 形态①直点即证可点性；340 限宽刻度经 min() 不随宽抽屉放宽（dsw-raw 豁免注记同 task-tab.css 同源刻度）
- 问题② 裁决 = 仅改 e2e（blank 会话入账本为源码实证，产品缺口分支不成立）：reuse-or-create blank 为官方 openWorkspace 语义（4.1 OQ#1 核实面，官方 startSession 同径），字面「未发送草稿跨会话保留」在该语义下不可观测；合约 draft-independence 的诚实映射 = 会话间输入面独立（第二会话预填该渠道上下文）+ 既有会话内容不受新开影响（回访转录恢复），映射注记已回填 spec 头部 Fact Table 与 Outcome 映射
- e2e 韧性三处（复跑实证形态）：零凭据 API-Key onboarding 晚到模态（可晚于 awaitNoLateModals 收敛窗数十秒挂载）按点击簇前 ensureNoBlockingDialog 预清；openOverviewDock 两入口改 strip|guide 择一短窗（reveal 后 strip 水化时差——瞬时 isVisible 误落 guide 分支即 30s 空等）；Step1e 回访块移测试末段执行（会话行回访触发右栏布局晚沉降回休眠，其后 dock 交互面先完成）
- drawer 单测结构断言保持（toast 先于按钮渲染于 diagwrap 内），仅 it 标题随改锚事实更新；CSS 零 DOM 变更 = TaskDrawerBody 渲染面不动

## Test Results
- **Tests Executed**: Yes
- **Passed**: 61
- **Failed**: 0
- **Coverage**: 68.9%

## Acceptance Criteria
- [x] 问题①：drawer 上下文 DiagToast 发送钮抽屉开时可直点——e2e T3 形态①（直点，不先关抽屉）全绿
- [x] 问题②：T1 Step1e 诚实可观测补齐（两会话非 blank 常驻行 + 行点回转录恢复）且 T1 全绿
- [x] T3 三断言（@docs 提及芯片归属行 / 任务键行 / 突击头标签）全绿
- [x] 静态门：just compile / just lint（ox+imports+tokens+selftest+types）/ e2e tsc 全绿
- [x] 共享面回归探测：sc1-hero-projection（openOverviewDock 消费者）2/2 绿

## Notes
测试口径：vitest 定向 56/56（drawer index.test + DiagToast.test，0 失败）+ Playwright e2e 5/5（overview-entry-new-session T1 49.7s / T2 42.2s / T3 39.0s + sc1-hero 2 例）= 61 全绿。coverage 68.9 = drawer 目录 scoped v8 lines（DiagToast.tsx 84.84 lines；本修复源码面 = drawer.css 纯 CSS 几何 + e2e 文件，均不在单测覆盖面——可点性由 T3 形态①行为断言承载）。证据链：T3 复跑两形态对照（修复前形态①被 ov-content 拦截/形态② toast 随抽屉卸载 → 修复后形态①绿）；T1 Step1e 复跑快照实证两会话行在场（@docs/features/joe-feat + @docs/proposals/joe-blitz 双行）+ 回访转录恢复。共享 worktree 纪律：仅暂存本任务四文件，index.json 的 forge 管理态（blockedReason 残留 + 依赖序 normalize）随 submit 流处置。
