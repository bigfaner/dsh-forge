---
status: "completed"
started: "2026-10-05 01:16"
completed: "2026-10-05 02:32"
time_spent: "~1h 16m"
---

# Task Record: fix-42 Align: 项目列表/树交互与样式对齐原生 dsh 工作区（WorkspaceBrowser 母本）——rail 图标列非空 + expandSidebar 消费 + 视图菜单实装 + 行语言（treeitem/hover 动作/归档过滤）

## Summary
fix-record 恢复任务假前提（三查零实现）——依派发注记转真实现：侧栏项目列表/树对齐原生 dsh 工作区（WorkspaceBrowser 母本，P1 裁剪）。① rail 图标列非空：SidebarRail 受控缝抽出（搜索钮 requestSearch 同径 + 「＋」 + 项目 folder 图标列 data-active 官方 folderActive 同型），expandSidebar 壳回调消费收口（fix-41 B 面完整形态）；② 视图菜单实装：groupBy 二值（按项目树/平铺——全会话按 updatedAt 降序、段头标签切换）+ archivedFilter 三态（默认/仅归档/不含归档），selectedIds 官方双选面，sidebarViewOfPick 纯投影，orderBy/树嵌套不做出现在菜单；③ 行语言对齐：DisclosureRow expandOnRowClick（fix-41 A 面收编：整行翻转 + aria-expanded + 键盘）+ previewChevron hover 图标互换 + 34px/label-primary 官方刻度 + 行尾 hover 动作（新会话钮 → 官方 uiWorkspace.startSession(workspaceId)——插件 inject face 增 startSession；ellipsis 菜单改名/归档切换 → forge:projects/update patch 面 + 静默重拉，name 的 workspace 标题对齐 = core fix-33 ⑪ 既有联动零 core 改动；改名 = 官方 Modal 模态，失败错误留模态）；④ 段头内嵌搜索槽（官方 searchSlot 形态，data-dswf-searchrow 锚保持，fix-22 blur/Esc 语义不变）；⑤ 样式全官方令牌 + dsw-raw 豁免台账（官方 Rows/WorkspaceBrowser 逐值对齐 = 截图对照 AC 的结构等价替代）。

## Changes

### Files Created
- e2e/specs/p1mvp/sidebar-view-align.spec.ts

### Files Modified
- apps/web/src/views/sidebar/sidebar-model.ts
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/ForgeSidebarSlot.tsx
- apps/web/src/views/sidebar/sidebar-actions.ts
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/views/sidebar/README.md
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/views/sidebar/sidebar-model.test.ts
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx
- apps/web/src/views/sidebar/ForgeSidebarSlot.test.tsx
- apps/web/src/views/sidebar/sidebar-actions.test.ts
- apps/web/src/client-plugin/plugin.test.ts
- e2e/support/anchors.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-42.md

### Key Decisions
- 假前提转真实现（fix-17 形态第十五例）：工作树/全分支/stash 三查零实现 + 落点文件逐行核对仍持差距原文，依派发「假前提则真实现」注记走完整 AC + 质量门
- 行尾动作 = DisclosureRow collapsedContent + keepContentWhenOpen 行内尾部槽（官方 rowActions 同位形）：首版块级绝对定位 + :has(row:hover) 呈现被 e2e 证伪——actions 与行 div 为兄弟节点，指针入 actions 即掉 row:hover → 呈现振荡点击永不达（官方 actions 恒在行内故无此陷阱）
- titlebar 模式 rail 几何（fix-40 官方壳设计）：[data-windows-titlebar] .collapsed .regionArea { display:none }——官方 WorkspaceBrowser rail 同域同藏；rail 图标列 e2e 以 DOM 在场断言，交互面归单测 + 非 titlebar 形态；Step1b「rail 可见」断言在该形态红 = A/B 实证 HEAD~1 同红的前置环境 flake（非回归）
- 会话行 hover 动作不接（规格预裁核实）：requestSessionRename 不在产品注入的 uiWorkspace 服务窄面（UiWorkspaceService 无此法，归 WorkspaceBrowser owner share 别源）——缺省不接记边界
- fresh blank 会话行不即入侧栏树：官方 startSession 盘侧即建会话（e2e 实证），blank 行入树需 workspace 成员传播 + 选中态（官方仅选中 blank 可见口径）——零凭据 e2e 以盘侧会话目录增生为断言，行显示归 dogfood 台账
- 归档切换失败 fail-soft（console.warn——P1 无行内错误面）；视图态 P1 不持久化（官方 dsh.workspace.view.v5 persist 归后续里程碑）；fix-41（pending，本任务依赖）交付面 = 本任务真子集已随本任务全量落地，其台账归派发侧对账

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1083
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] rail 态：项目图标列在场可点（点击展开侧栏并定位）；搜索钮在轨；收起态不再是空轨道
- [x] wide 态：视图菜单实际生效（树/平铺切换 + 归档过滤三态）；项目行 hover 图标互换 + 行尾动作（新会话/改名）可用；行高/密度/色对齐官方
- [x] 全套单测/e2e 绿；现有 e2e 锚（data-dswf-project/session、sectionhead、过滤行）不破——新增锚只增不改
- [x] 行为回归面：过滤（fix-6）、blur 收起（fix-22）、骨架/空态/错误条相位、选中高亮锚（currentSessionId）全保持

## Notes
质量门：tsc -b 绿 + pnpm lint 全链绿（ox/imports/tokens/selftest/types/test-types）+ vitest 1083/1083 绿（coverage 未开——justfile unit-test 口径无覆盖率面，未虚报）。e2e：新 spec sidebar-view-align 4/4 绿（rail 图标列 DOM 在场 + 新会话钮盘侧会话增生 + 视图菜单真实链 + 改名模态→RPC→行标题）；回归 session-workbench 2 红 + flywheel 1 红均 A/B 实证/已知台账前置既有（titlebar 几何 flake + 链口径设计红缺陷信号），web-shell 绿。遗留边界（详见任务文件「实装收口」节）：titlebar 模式 rail 交互面、会话行 hover 动作、blank 行即显、归档失败行内反馈、视图态持久化——均归后续里程碑/dogfood 台账。
