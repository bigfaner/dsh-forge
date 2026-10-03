---
status: "completed"
started: "2026-10-03 18:12"
completed: "2026-10-03 18:36"
time_spent: "~24m"
---

# Task Record: fix-13 Fix: 两处 dsh 原生对齐偏差——① 侧栏项目区图标钮带常驻底色（toolbar 变体误用）② 会话头部单元两截化（应对齐原生 titleRow+扁平页签一体头部）

## Summary
两处 dsh 原生对齐偏差修复：① 侧栏项目区搜索钮/视图选项钮官方 Button variant toolbar→ghost（toolbar 变体常驻 tool-bar-fill 底色误用退役；＋钮核查已透明底无需改动）——官方侧栏行语言透明底 + 仅 hover 底复归；② 会话头部单元两截形态（SessionToolbar 行 + SegmentedTabs 分段控件）退役，融合为官方同构一体头部 .dswf-session-header（.header 刻度：grid 双列/min-height 76/padding 10-28-0-20/0.5px border-l3 发线）+ titleRow（min-height 30/grid-column 2，SessionToolbar 根迁入）+ 官方 .tabs/.tab/.tabActive 扁平文字页签行语言复刻（透明底/无边框/13px 500/16/padding 0 0 9px/gap 36/margin-top 10/padding-left 8/激活变色 business-primary + 2px ::after 底指示线——Implementation Notes 预判的指示线经 css$4 全文核对确认在案并复刻）；utilities/corner/hero 相位（corner 独存）/WCO 避让语义全部沿 fix-9 口径（避让衬随 titleRow 迁移，容器恒持 28px 右衬，净避让余量 136→164 不减）。2.11「页签条 = 官方 SegmentedTabs」决策变更落档：按走查人原生对齐指令更新为「官方 ConversationRoot 页签行语言」（SessionPanel.tsx 头注 + README + 结构 pin 同步）；aria/键盘轮焦语义零褪色（role=tablist/tab、aria-selected、tab→pane aria-controls、Left/Right/Home/End 轮焦——索引推导抽 nextTabIndex 纯函数）。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/views/session/SessionPanel.tsx
- apps/web/src/views/session/SessionToolbar.tsx
- apps/web/src/views/session/SessionPanel.test.tsx
- apps/web/src/views/session/session.css
- apps/web/src/views/session/index.ts
- apps/web/src/views/session/README.md
- tests/structure/web-shell.test.ts

### Key Decisions
- SPEC CONTRADICTION 裁决（raw css$4 实值 win，任务 Implementation Notes 明示「读完整 css$4 字符串核对，缺失面按实值补齐」）：.tabActive 非纯变色——官方实值带 ::after 2px 底指示线（bottom -1px/radius 2px/着色 business-primary），按实值复刻；.headerCorner 实值 = margin-left 8 + margin-right -16（任务表「margin-left auto」为 headerBlank 相位值），margin-right 0 偏离沿 fix-9 WCO 避让算术注记保持
- 页签行落位与状态归属：activeTab 态保持 SessionPanel 持有（keep-alive panes 同源），头部容器 .dswf-session-header 归 SessionPanel 渲染（titleRow 注入 + .tabs 行同容器），SessionToolbar 根 = titleRow 座行（dswf-session-toolbar/data-dswf-* 锚全保）——toolbar prop 注入缝零改动
- WCO 避让衬迁移几何：data-dswf-wco='avoid' 标记随 corner 所在的 titleRow 保持（SessionToolbar 组件自持 dockOpen 知识，SessionPanel 保持 dock 无关），避让值叠加容器恒持 28px 右衬——WCO 收栏相角位净余量 136→164px（不减）；非 WCO 收栏相角位 0→28px（更贴官方恒 28 衬）
- 官方 .header 无页签回退分支（:not(:has(.tabs)) = min-height 0 + padding-bottom 10）不建模——产品页签行恒在场（fix-9 口径 + e2e count=3 锚），死分支不引入
- 键盘轮焦索引推导抽 nextTabIndex 纯函数导出（原 SegmentedTabs 轮焦语义保持：Left/Right 循环回绕 + Home/End 首末 + 非轮焦键 null 穿透）——SSR 直测拉覆盖（记忆坑：交互逻辑抽纯函数）
- 结构 pin（tests/structure/web-shell.test.ts 2.11）随决策变更同步：SegmentedTabs import 断言 → dswf-session-header/tabs/role=tab 形态 pin + SegmentedTabs import 负断言（退役固化）
- 探针工作流坑记录：Playwright locator.hover() 在首启模态竞态下 actionability 超时——改 page.mouse.move 到元素中心（真 CDP 命中测试触发 :hover，不经 actionability）；theme 令牌挂 body 非 :root（documentElement 解析空值——探针 1 次轮根因）
- 探针脚本入 tmp-ui-review/ 会被 oxlint 扫到（未用 import 报错）——探针脚本同样保持零未用导入

## Test Results
- **Tests Executed**: Yes
- **Passed**: 989
- **Failed**: 0
- **Coverage**: 57.8%

## Acceptance Criteria
- [x] ① 两钮（必要时含＋）computed background-color = transparent（非 tool-bar-fill）；hover 才现底；截图归档执行记录
- [x] ② 头部单元与原生同构（刻度逐项对照表入执行记录：76/padding/发线/titleRow 30/页签 gap 36/扁平 tab 变色激活）；hero 相位语义不变（corner 独存）；三页签锚与 e2e 断言（[role="tab"] 计数/label）零褪色；走查人实机目视确认「位置对齐原生」

## Notes
验证矩阵：tsc -b exit 0；pnpm lint 五门全绿（ox/imports/tokens dsw-raw 注记受纳/selftest 14 负样例/types）；全量 vitest 989/989（99 文件；含 SessionPanel 新增 fix-13 头部单元/扁平页签/nextTabIndex 组 + 结构 pin 更新）；定向 227/227（views/session + views/sidebar + workbench + tests/structure）。fmt：本 worktree 无 formatter 配置（沿 fix-2/3/4 记注）。覆盖率（clover stmts，改动面三 TSX 聚合 57.8%）：SessionToolbar.tsx 100.0 / ForgeWorkspacePanel.tsx 63.2 / SessionPanel.tsx 48.0（渲染面全覆盖——covered spans L97-159 ×11、页签 map ×33；未覆 = 事件闭包体（DOM 焦点胶水/点击/键盘），SSR 面不可达，运行期探针 + e2e 承载，沿 fix-4「交互胶水归 e2e——运行期探针实证」先例）。运行期探针（一次性，不入仓，tmp-ui-review/fix13-probe.mjs + fix13-probe2.mjs，electron 直启 apps/web/dist + 隔离 userData/端口 + RPC 直注项目）：① 三钮 rest computed rgba(0,0,0,0) ≠ tool-bar-fill #54555780；真鼠标 hover = rgba(38,49,72,0.06) ≡ --dsw-alias-interactive-bg-hover #2631480f；移开回落透明；② 头部刻度实测逐项对照（全中）：header grid 0px/1113.6px（auto+minmax(0,1fr)）、min-height 76、padding 10/28/0/20、发线 0.5px 指定（computed 0.8px = DPR1.6 物理取整，与官方 .5px 同渲染）色 rgba(0,0,0,0.12) ≡ border-l3 #0000001f；titleRow min-height 30/grid-column 2；tabs gridColumn 1/-1/gap 36/margin-top 10/padding-left 8/flex/relative/z1/自带边线退役；tab 透明底/无边框/padding 0 0 9/13px 500 16px；tabActive 色 #4176e6 ≡ business-primary + ::after 同色 2px @ bottom -1px；hero 相位探针：heroMarker 在场、title/utilities 缺席、corner 独存、三页签 [对话/轨迹/知识召回] 计数 3。截图归档 tmp-ui-review/：fix13-sidebar-head.png（三钮零底色——模型目视复核「无任何持久填充背景」）、fix13-session-header.png（扁平文字页签/无分段轨道/发线/激活蓝+下划线）、fix13-main.png。e2e 静态锚核验：smoke L192（.dswf-session-panel [role=tab] count=3——新页签同 role 同数）/L268·L328（.dswf-workbench-docktoggle 类名随 corner 保持）/session-workbench L371·L379（[role=tab] hasText 轨迹/对话点击）零改动；e2e 实跑归 submit 质量门；走查人实机目视确认归走查人回合（fix-9 同口径）。未点名元素核查：crumbs 数据面（displayTitle 直读）/utilities 两钮语义（variant=toolbar 沿 fix-9 不动——走查人仅点名侧栏）/corner 面板钮/hero 让位/UF-5/keep-alive/dock 面官方 dockkit 基座全部零改动。dsw-raw 豁免清单（session.css 新增）：.header 双列/76/10-28-0-20/0.5px 发线、titleRow 30/grid-column 2、.tabs 36/10/8/z1、.tab 0 0 9/行高 16（官方 13px 标尺令牌行高 20 ≠ 官方页签 16，无对应令牌）、::after 2px/-1px/2px；WCO calc(env) 几何值沿 fix-4 同式。workbench.css 核查：无 .dswf-session-* 残留（fix-9 已退役角位块，本轮零改动）。
