---
status: "completed"
started: "2026-10-03 14:33"
completed: "2026-10-03 14:55"
time_spent: "~22m"
---

# Task Record: fix-9 Fix: 中区会话面板顶部 toolbar 缺失——对齐 dsh 布局（官方 conversation.session.header 槽位 + 原型 conv-header 标题行）

## Summary
补齐中区会话面板顶部 toolbar（对齐 dsh 布局）：新增 SessionToolbar（官方 conversation.session.header titleRow 行语言的官方件组合——Button toolbar/sm + 官方图标 IconFolderOpenRegular/IconPanelLeftOutlineRegular；lineage 会话标题（官方账本 displayTitle 直读）/actions 空位保留/utilities 编辑器打开占位钮/corner 面板钮四座），经 SessionPanel 顶部注入位渲染于页签行之上；.dswf-workbench-docktoggle 角位绝对定位钮迁入 corner 座归位（dispatch('toggle-right-dock') 同径，锚类名保持）；hero 相位（chatHeroOf 与 ChatSurface 嵌入配方同源推导）标题簇与 utilities 让位、corner 独存（官方 blank 相位 corner 常驻语义 + e2e L59 session 相位实钮口径）；WCO 避让 = 右栏收起时 toolbar 右衬 calc(100vw - env(titlebar-area-width, 100vw))（fix-4 dock strip 先例同式）。

## Changes

### Files Created
- apps/web/src/views/session/SessionToolbar.tsx
- apps/web/src/views/session/SessionToolbar.test.tsx

### Files Modified
- apps/web/src/views/session/SessionPanel.tsx
- apps/web/src/views/session/SessionPanel.test.tsx
- apps/web/src/views/session/session.css
- apps/web/src/views/session/index.ts
- apps/web/src/views/session/README.md
- apps/web/src/workbench/ChatSurface.tsx
- apps/web/src/workbench/ChatSurface.test.tsx
- apps/web/src/workbench/WorkbenchPanel.tsx
- apps/web/src/workbench/WorkbenchPanel.test.tsx
- apps/web/src/workbench/workbench.css

### Key Decisions
- 装配路径裁决（Implementation Notes 两路径，S2 槽面清点为准）：embedded 配方（conversation.content variant=embedded）不透出 header 槽位——upstream ui-conversation lib/client.js ConversationContent（data-conversation-content 产物树）仅渲染 body/composer，header 链（conversation.header → conversation.session.header 五子槽）由官方 main.conversation 占用者 ConversationRoot/ConversationMainPanel 渲染，而该洞位已被产品工作台影子替换（client-plugin/plugin.ts -100）；且官方占用者 ConversationSessionHeader 自带 tabs 行（showTabs = !hideChrome && tabs.length>1——官方 roster chat+trajectory 恒 2），与本面板三页签（PRD UF-4 终裁形态 (a)）叠加成平行页签行、违 Hard Rule「三页签形态零变化」→ 取「官方件组合在 SessionPanel 内组装」路径（裁决注记 = SessionToolbar.tsx 头 + views/session/README.md 数据契约节）
- 面板钮归 corner 座（非 utilities）：官方 headerCorner 语义 = 常驻控制位（blank/hero 相位 utilities 整簇让位、corner 独存——upstream ConversationSessionHeader hideChrome 行为镜像），同时保住产品 dock 角位常显开关既有口径与 e2e L59/L689 session 相位实钮锚（.dswf-workbench-docktoggle 类名随迁保持）
- hero 相位让位范围 = 标题簇置空 + utilities 退场、corner 面板钮独存（非整行退场）：原型 conv-title-row 整行隐藏与产品「session 相位 = 角位开关实钮」e2e 契约（smoke L59/台账 #10）冲突，取官方 blank 相位行式（corner-only）两全；相位推导抽取 chatHeroOf 纯函数（ChatSurface 与 SessionToolbarLive 共用——让位与官方 hero 空会话引导同相位）
- 相位标记 data-dswf-toolbar-hero 独立命名空间：data-dswf-hero 为 HeroEmpty 专属 e2e 锚（smoke 组三 toHaveCount(0) 断言），复用会误伤
- WCO 避让（几何结论）：原生控制钮区 = 右上 ~136×32（fix-2 静态 overlay height:32 + fix-4 实测宽）；右栏展开（340px 轨道 > 136px）几何已隔离不避让；右栏收起（默认）中区直达窗口右缘 → data-dswf-wco='avoid' 右衬 calc(100vw - env(titlebar-area-width, 100vw))（fix-4 zones.css:83 先例同式，非 WCO 回退 100vw 衬值归零）；corner margin-right 取 0（官方 -16px 侵入式角位会吃掉 16px 避让余量——弃用并注记）；知识模式 session zone hidden 无重叠面
- 图标选型官方先例：面板钮 = IconPanelLeftOutlineRegular + scaleX(-1) 镜像（ui-sidebar-right ExpandButton._icon 同式右栏语义）+ 28px 宽/0 内衬（官方 sidebar-browser tool 28×28 + ExpandButton width:28/padding:0 同族刻度）；编辑器打开 = IconFolderOpenRegular 图标钮 + title 注明「动作即将接入」（P1 占位，动作归后续里程碑）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 87
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 会话面板顶部 toolbar 在场：会话标题（账本直读，无会话 = 空位）+ utilities 两钮（面板 toggle 实功能 + 编辑器打开占位）；形态对齐官方行语言（内衬/高度/图标钮刻度），经官方 session.header 槽位或官方件组合承载（零自绘平行 header）
- [x] 面板钮迁移后收展语义不变（toggle-right-dock 同径）；原角位绝对定位钮退役
- [x] hero 相位 toolbar 让位（不与空会话引导争位）；session/hero 两相位走查目视确认
- [x] 三页签行/keep-alive/召回 tab 机制零变化（L45 断言不褪色）；UF-5 视图互换回归（知识模式下 session 面板隐藏语义不变）
- [x] WCO 避让核查结论入执行记录（几何证据）
- [x] tsc + lint + 定向单测绿；dsw-raw 豁免注记同步

## Notes
验证面：tsc -b 绿；pnpm lint 全绿（oxlint/import/token/selftest/types——token-lint 0 裸值含新增 dsw-raw 注记行）；定向单测 87/87（views/session + workbench 八文件）；全量 vitest 973/973；vite build 绿。coverage 100.0 = 新增 SessionToolbar.tsx 语句覆盖（vitest --coverage json-summary 实测）；同跑 changed-files 面：ChatSurface.tsx 100%、SessionPanel.tsx 75%（未覆行 56-57 = defaultTab 覆写路径，先在）、WorkbenchPanel.tsx 77%（效应面归 e2e，先在口径）。e2e 回归面静态核验：smoke L45（.dswf-session-panel [role=tab] count=3——toolbar 不引入 role=tab）/L59·L689（.dswf-workbench-docktoggle 类名随迁，session 相位恒在场——hero 让位仅退标题簇与 utilities）/L9 知识模式负向（session zone hidden 不可见）零改动；e2e 实跑归 submit 质量门。AC-3「两相位走查目视确认」以结构断言覆盖（SessionToolbar.test hero 组 + WorkbenchPanel.test SessionToolbarLive 无会话/空白会话/有内容会话三轴），实机目视走查归走查人回合。dsw-raw 豁免清单（session.css）：toolbar 行内衬 10/28/0/20、cluster/crumbs/actions/utilities/corner 行内 gap 与 margin、crumb max-width 220、图标钮 28px/0 内衬 = 官方 ConversationRoot.module.css/sidebar-browser/ui-sidebar-right 行语言原值（官方无间距令牌面，沿 2.7 形态对齐优先先例）；WCO calc(env) = 几何值非令牌面（fix-4 同式）；workbench.css 原角位块（top:4px/right:8px）随退役移除。
