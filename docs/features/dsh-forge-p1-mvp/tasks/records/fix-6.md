---
status: "completed"
started: "2026-10-03 14:18"
completed: "2026-10-03 14:31"
time_spent: "~13m"
---

# Task Record: fix-6 Fix: 侧栏项目区头部缺搜索钮（含过滤行）与视图选项（排列）钮——原型基准补齐 + PRD UF-1 Validation 落实

## Summary
侧栏项目区头部补齐原型基准四件（搜索钮 + 视图选项钮）并落实 PRD UF-1 Validation 项目/会话搜索过滤。恢复任务前提证伪：前次执行无任何落盘实现（工作树/提交史均无 fix-6 代码，仅走查诊断资产在案）——本任务按任务文件完成真实实现。①过滤纯函数 sidebarFilterOf 落 sidebar-model（原型 renderProjects 同型语义：大小写不敏感前缀/子串匹配，项目名命中→项目在场但会话仍按标题过滤滤除非命中行，任一会话标题命中→仅留命中行，空/纯空白=不过滤原树原样引用，纯投影零改写——全命中节点原样引用零分配）；②ForgeWorkspacePanel 重分层（WorkbenchZones→WorkbenchPanel 同型）：面板持过滤/视图菜单态机（searchOpen/query/viewMenuOpen，收起即清空=原型 S.pj 语义），抽出 SidebarProjectsZone 受控展示缝 + SidebarFilterRow（官方 Input 受控件，autoFocus=原型展开聚焦，Esc 收起清空）；③头部四件 = label + 官方 Button(toolbar/sm) 搜索钮（IconSearchOutlineRegular，aria-pressed）+ 官方 Menu(portal) 视图选项钮（IconSlidersTwoOutlineRegular，锚定「按项目树」当前项 + MenuLabel 后续里程碑占位说明，零排列逻辑）+ 既有＋钮（data-dswf-nav=add-project 锚与形态零改动）；④树相位下过滤无结果 = 行内「无匹配项目/会话」空提示，项目名命中而会话全不命中 = 行内「无匹配会话」占位（原型 sess-empty-note 同型，无过滤时「暂无会话」不变）；错误/骨架/首用空态相位与过滤正交（相位优先，过滤行在场不干扰）；选中态不变 = currentSessionId 受控入参与过滤正交，过滤隐藏选中行不重置锚、清过滤即恢复可见（单测双渲染断言）。dsw-raw 豁免注记：sidebar.css 新增行内刻度（searchrow 下沿 4px、filterempty 6px/8px）为官方 sidebar 行语言原值，与文件头既有豁免口径同源。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/sidebar/sidebar-model.ts
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/views/sidebar/sidebar-model.test.ts
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx

### Key Decisions
- 恢复任务假前提处置：按任务提示 VERIFY-ONLY 前置核验发现实现缺席（对照法：头部仅 label+＋两件、git 无 fix-6 提交、reports 仅诊断），依派发方指引转真实实现而非 blocked——与 fix-5/fix-7 前例同型
- 过滤态机分层选面板层（ForgeWorkspacePanel 持 state）+ 受控展示缝（SidebarProjectsZone/SidebarFilterRow 导出）：repo 无 jsdom，renderToStaticMarkup 静态惯例下受控缝使过滤应用/空提示/相位正交全静态可测——同 WorkbenchZones→WorkbenchPanel 既有分层先例
- 过滤语义严格原型同型（项目名命中仍过滤会话行）而非「命中项目显示全会话」：任务 Description 明文「原型同型」，PRD「P1 最简：前缀/子串匹配」两者一致
- 视图选项图标取官方集在场件 IconSlidersTwoOutlineRegular（滑杆=视图/显示选项最近似隐喻）；弹层走官方 Menu（portal——sectionhead 处滚动容器内避免裁剪），占位项纯呈现零排列逻辑
- 搜索/视图钮 = 官方 Button(toolbar/sm) 零样式覆写（仅 flex 排布类）；既有＋钮按「未点名元素保持不变」原样保留（26px 自绘钮形态不动，锚不动）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 959
- **Failed**: 0
- **Coverage**: 81.2%

## Acceptance Criteria
- [x] 头部四件齐：label + 搜索钮 + 视图选项钮 + ＋（既有 data-dswf-nav=add-project 锚不动）；官方图标（IconSearchOutlineRegular 同款检索图标；视图选项取官方件最近似图标 IconSlidersTwoOutlineRegular）
- [x] 搜索钮展开/收起过滤行（Esc/再点收起）；过滤即时生效：项目名 + 会话标题前缀/子串匹配，空串 = 不过滤
- [x] 过滤不改变选中态（PRD Validation 原文——过滤掉当前选中项不重置锚，清过滤即恢复可见）
- [x] 过滤无结果 = 行内空提示（无匹配项目/会话）；骨架/错误/空态相位与过滤正交
- [x] 视图选项钮在场占位（可点开菜单呈现「按项目树」当前项 + 后续里程碑说明；不做实际排列逻辑）
- [x] 收起态 rail 不动（官方壳域）；e2e 既有断言零褪色；新增过滤纯函数单测（含选中态不变断言）
- [x] tsc + lint 全绿；dsw-raw 豁免注记同步执行记录

## Notes
静态门：tsc -b 0 错、pnpm lint 全绿（oxlint/imports/tokens/selftest/types）、playwright --list 60 例通过（既有锚全集保留：add-project/sectionlabel/session/project/skeleton/error/empty——e2e 既有断言零褪色的静态面；全量 e2e 由 submit 质量门执行）。单测：全量 vitest 98 文件 959 例全过（新增 19 例：sidebarFilterOf 纯函数面 9 例含选中态正交/零改写 freeze 断言 + 面板/受控缝面 10 例）。覆盖率（v8，改动两文件）：合计 81.18% stmts / 92% branch；sidebar-model.ts 96.55% stmts / 97.56% branch / 100% funcs；ForgeWorkspacePanel.tsx 60.46% stmts / 85.29% branch（未覆盖 = rail 分支与事件胶水闭包——静态渲染测法惯例面，与 KnowledgeToolbar 文件头「事件胶水不在静态渲染测面」口径同源）。dsw-raw 豁免：sidebar.css 新增 padding 4px/6px/8px 行内刻度 = 官方 sidebar 行语言原值（文件头既有豁免理由覆盖，形态对齐官方优先）。
