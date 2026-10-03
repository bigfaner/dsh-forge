---
status: "completed"
started: "2026-10-03 14:56"
completed: "2026-10-03 15:07"
time_spent: "~11m"
---

# Task Record: fix-8 Fix: 两处小缺陷——① 知识域树激活标记在视图往返后丢失（数据保持、标记不同步）② dock 调宽手柄键盘步进未生效（待复核）

## Summary
两案复核收口：① 域树激活标记往返丢失 = fix-5 同根（滞后快照消费）——walk4 跑于 fix-5 pending 期，hook 当时直返装载态（state.filter 永久滞后快照），DomainTree active 消费点读它即 active=0；fix-5（3b7ba69）consumedBrowseState 已盖写实时 reducer 过滤态（域树高亮为其点名消费面），①随之修复。本任务零产品代码改动：walk4-J 步实机复跑 PASS（tmp-ui-review/fix8probe.mjs：选「前端」entries=3+标记在场 → show-session → 回知识视图 → busy 收敛后 data-active=1 且 entries=3，二次往返幂等）+ 回归单测钉死激活重拉链路（首装→选域过滤落点→hold→激活重拉 bundle 重建 nodes→consumedBrowseState 合成→filter.domain 保持 + 重建行集内选中域行命中；并断言装载态快照不带域 = walk4-J 症状载体）。任务文件疑点「nodes 重建路径 selectedDomain 传递断链」证伪——applyBrowseLoad {kind:'bundle'} 经 ...prev 保留旧字段，断的是 filter 快照消费而非 nodes 重建。② dock 手柄键盘步进 = superseded by fix-10（836a219）：fix-4 自研轨道（调宽手柄/宽度内态/dock-width.ts 含 DOCK_RESIZE_KEY_STEP·clamp·8 纯函数用例）已整体退役，WorkbenchZones 重写为官方 ui-dockkit DockLayout；官方 bundle 内 ArrowLeft/ArrowRight 仅 chips 焦点导航（chipToFocus）、divider（data-dockkit-divider）仅 onPointerDown——官方件无键盘步进面，且 P1 dockCanSplit 限单窗格无 divider 可见；实机探针 dockSeparators=0。测法（a）/拦截面（b）二选一失效——无产品面可复核；键盘调宽若需归官方件上游诉求（P1 范围外）。复核结论已入 fix-8.md「Root Cause（fix-8 复核收口）」。

## Changes

### Files Created
- tmp-ui-review/fix8probe.mjs

### Files Modified
- apps/web/src/views/knowledge/use-knowledge-browse.test.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-8.md

### Key Decisions
- ① 零产品代码改动复核收口：缺陷载体已由 fix-5 consumedBrowseState 移除（walk4 跑于 fix-5 pending 期），按 Hard Rule「未点名元素不变」不重铺 DomainTree 投影链，以实机复跑 + 回归单测钉死语义
- 回归单测走纯函数链路组合（browseFilterReducer→applyBrowseLoad→pendingBrowseState→consumedBrowseState→domainRows），遵文件头口径（hook effect 胶水归 e2e 面——web 单测池纯逻辑位）
- ② 复核结论 superseded by fix-10：自研手柄已随 fix-10 官方基座退役，不回补自研件（Hard Rule「dock 机制语义不动 + 官方件复用」）；官方 dockkit 无键盘步进面（Arrow 键 = chips 焦点导航、divider 仅 onPointerDown）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 79
- **Failed**: 0
- **Coverage**: 62.2%

## Acceptance Criteria
- [x] ① 视图往返（knowledge→session→knowledge）后域树行 data-active 与过滤态一致（walk4-J 步复跑 PASS）；补单测（激活重拉后 selectedDomain 投影）
- [x] ② 键盘步进生效或复核结论入记录（测法修正依据/拦截面结论 + 处置去向）
- [x] 既有断言零褪色；tsc + lint + 定向单测绿

## Notes
实机验证：node tmp-ui-review/fix8probe.mjs（Electron dev profile + CDP 直连 + 独立 userData/端口 19996/19778）——J0 全量 4 条基线 → J1 选域「前端」entries=3/activeFe=1 → J2 show-session（keep-alive hold 数据保持）→ J3 回知识视图 busy=false 收敛后 activeFe=1/entries=3 → J4 二次往返幂等；H2 证据 dockSeparators=0（fix-10 官方基座无自研手柄）。定向单测：knowledge 8 文件 79/79 全过（新增 1 例：激活翻转全量重拉 × selectedDomain 投影）。覆盖率（v8，改动测试文件目标模块）：use-knowledge-browse.ts 62.19% stmts / 69.44% lines（未覆盖 = hook effect 胶水，文件头注释口径归 e2e 面——本任务实机探针即该面验证）；knowledge 目录聚合 68.7% stmts。静态门：tsc -b 0 错、pnpm lint 全绿（ox/imports/tokens/selftest/types）；fmt 无配方（管线门 = tsc + lint，fix-4/5 先例同口径）。全量 e2e 由 submit 质量门执行。
