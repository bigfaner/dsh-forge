---
id: "fix-23"
title: "Fix: 对话界面右上角对齐原生 dsh——官方 header 链点亮（「打开方式」+「⋯」更多操作 + corner 收展钮）+ 右栏 dock 全面复用官方 ui-sidebar-right（自研 dock 骨架退役，官方右栏已在运行时活体待接）"
priority: "P1"
estimated_time: "6h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 右上角三件 + dock 完全复用官方

> 来源：走查人实机（2026-10-04）「对话界面对齐原生 dsh：右上角要有打开 dockkit 的图标按钮，以及 ... 图标按钮。dockkit 无 tab 的开始页面跟原生 dsh 一样。总之，dockkit 完全复用 dsh」＋补充「右上角还有一个控件」。

## 现状与根因（探针 + 源码实证）

**官方件全在运行时、只是被产品影子切断了入口**：

1. **头部链被手工组装替代**：产品影子替换 `main.conversation`（WorkbenchPanel）后，SessionToolbar 手工承载标题行——官方头部链（`conversation.header` → `conversation.session.header` → lineage/actions/**utilities**/**corner** 子座，ui-conversation client.js:18247-18289 注册）无渲染点。官方 utilities 占用者已注册在案：**ui-open-in-app「打开方式」拆分钮**（走查人「还有一个控件」）+ **session-log-download「⋯」更多操作钮**（官方 Menu：下载 Session 日志/反馈，IconEllipsisOutlineRegular）；corner 占用者 = **ui-sidebar-right ExpandButton**（面板隐藏时渲染、镜像折叠图标、官方 README:57）。owner props 自带 `renderSlot('conversation.header')`（slots.d.ts:507 ConversationSlotProps）——产品可点亮整条链但未用。
2. **双 dock 并存**：产品自研右栏（[WorkbenchZones.tsx:163](../../../apps/web/src/zones/WorkbenchZones.tsx) `.dswf-zones-dock` + `M0_DOCK_TABS` 单「开始」**占位** tab + `view.rightDock`/`toggle-right-dock` 态 + SessionToolbar 自管 corner 钮）vs **官方右栏活体**——探针实证（tmp-ui-review/fix23-probe.mjs）：AppFrame 第三列在场 `data-rightbar-collapsed` grid 0px，`data-sidebar-right-session` 会话 store 已铸造（官方全套：guide 开始页/tab 条/分屏/浮动/持久化/快捷键都在，**没有入口**——其入口正是被替换的官方头部 corner 座）。
3. **profile 未裁剪**：产品 patch 只停 client-hmr——ui-layout/ui-sidebar-right/ui-sidebar-files/-terminal/-documentpreview/session-log-export/open-in-app 全部装载（dsh-web-app cordis.patch.yml:75-89/248-286）。

## Description

### ① 右上角三件（官方链点亮——推荐路径 C：影子替换 session.header 占用者）

- 工作台以 `props.renderSlot('conversation.header')` 承载头部行（替代手工 SessionToolbar 的标题行本体）；
- 产品注册 **ProductSessionHeader** 占用 `conversation.session.header`（single/session——与 sidebar.workspaces/main.conversation 同一影子战术）：官方 titleRow 骨架 + 子座经 `renderSlot` 透传（lineage/utilities/**corner**——占用者 props 即含四子座 renderSlot，slots.d.ts:534）+ **产品三页签行保持**（chat/召回/轨迹，PRD UF-4 终裁形态 (a) 不动——官方 ConversationSessionHeader 自带官方页签行（chat+trajectory）会与三页签叠加，故须影子而非直用）；
- 免费点亮：utilities =「打开方式」+「⋯」；corner = ExpandButton（右栏隐藏时在场 = 打开入口；显示时退场由面板自身承载）；
- 备选路径 B（若 renderSlot 链验证受阻）：SessionToolbar 内直渲染官方子座（runtime renderSlot 泛型性需实证）；路径 A（完整官方头部含官方页签行）违 UF-4，不取。

### ② dock 完全复用官方

- **自研面退役**：`.dswf-zones-dock` 列 + `M0_DOCK_TABS`「开始」占位 + `ShellViewState.rightDock`/`toggle-right-dock` + SessionToolbar 自管 corner 钮 + session.css `data-dswf-wco` 避让标记 + fix-10 直用 ui-dockkit 的装配（官方 sidebar-right 内部即 dockkit——同基座真身，直用面让位）；
- 官方右栏入口恢复：corner ExpandButton；后续产品自有面板入 dock 走官方扩展缝——`ctx.sidebarRightTabs.register(definition)` + `sidebar.right.pane.tab`（key=kind）+ `pane.tab.title`（官方口径「adding a type is a registration, never an edit」）；打开 = `ctx.sidebarRight.openTab(kind)`（service.d.ts ISidebarRight 全面：open/openTab/close/toggleExpanded/split/float/dock）；
- **无 tab 开始页 = 官方 guide tab**（defaultSeed：唯一注册页直开该页，零或多注册则 guide——零成本继承，形态即原生）；
- 官方 files/terminal/documentpreview tab 免费获得（roster 已装载，tab 类型自动注册）。

### 验收

1. 右上角三件在场：「打开方式」（open-in-app 应用解析后）+「⋯」（菜单含 下载 Session 日志/反馈）+ 右栏收展钮（右栏隐藏时在场）；
2. 收展钮 → 官方右栏展开，开始页 = 原生 guide 形态；tab 开合/收展/再展开正常；
3. 产品三页签（chat/召回/轨迹）与中区知识视图（show-knowledge）形态零变化；
4. `.dswf-zones-dock` DOM 消失；e2e 锚迁移（`.dswf-workbench-docktoggle` → 官方 corner 锚）；WorkbenchZones/SessionToolbar 相关单测随迁。

## Reference Files

- 官方（只读）：ui-conversation client.js:18247-18289（header 座注册链）/16361-16526（ConversationSessionHeader）/slots.d.ts:122-182/507/534；ui-sidebar-right README:57、client.js:9140-9239（注册面）、service.d.ts（ISidebarRight）、contract/slots.d.ts（pane.tab 族）、contract/seed.d.ts（guide 种子）；ui-layout client.js（AppFrame rightbar 列/openRightbar）；dsh-session-log-export client.js:195-229（⋯ 钮本体）；cordis.patch.yml:75-89/248-286（roster）
- 产品：apps/web/src/workbench/WorkbenchPanel.tsx（M0_DOCK_TABS:82/装配）、views/session/SessionToolbar.tsx（手工头部）、zones/WorkbenchZones.tsx:163-190（自研 dock aside）、client-plugin/plugin.ts（影子注册位）、workbench/view 态（rightDock）
- 证据：tmp-ui-review/fix23-probe.mjs（F1：官方 rightbar 活体 + 自研 dock 并存；F2：frame grid 第三列 0px collapsed）

## 边界与不做

- 中区知识视图（左栏知识库入口 → show-knowledge 中区切换）不动——dock 复用不迁移知识浏览；
- 会话面板三页签（UF-4）不动；官方左栏影子（ForgeSidebarSlot）不动；
- 不在 profile 层裁剪/新增官方插件（roster 保持出厂）；
- guide 内容产品化改写（`sidebar.right.tab.guide` chain 替换）非本任务——先原生形态上线。

## 执行收口（2026-10-04，fix-record 恢复执行——前次仅诊断未实现，本执行为真实现）

**交付（② 右栏全面复用官方——全绿）**：

- 自研面整体退役：`.dswf-zones-dock` 轨道 + zones/dock.ts/dock-kit.ts（fix-10 直用 dockkit 装配）+
  `M0_DOCK_TABS` + `ShellViewState.rightDock/rightDockPreference/toggle-right-dock` +
  session.css `data-dswf-wco` 避让标记（随右栏联动新语义重建）——右栏 = 官方 AppFrame 第三列
  （ui-sidebar-right 活体：官方 per-session dockkit 基座 + guide「开始」种子页 +
  files/terminal/documentpreview 页签类型自动注册）。
- 官方动作面：client-plugin inject 增 `sidebarRight` 服务（ISidebarRight 消费切片）→
  main.conversation 占用者注入 `rightbar` 窄面（isExpanded/toggleExpanded）；会话面板钮
  （`.dswf-workbench-docktoggle` 锚保持）动作 = 官方 toggleExpanded（官方 ExpandButton/strip
  chrome 同一动作径）；知识模式隐藏/恢复（UF-5/SC8）= `rightbarViewPlan` 纯函数 + 装配 effect
  （进知识视图收起并记忆、回会话按记忆恢复），不进视图态机。
- e2e 锚迁移官方 DOM 契约（frame `[data-rightbar-collapsed]` / 列 `[data-rightbar-col]` /
  strip `[data-dockkit-strip]`（guide「开始」）/ strip chrome `[data-sidebar-right-toggle]`）+
  SMOKE-LEDGER 记账 + 结构 pin 随迁。
- 实证（探针 tmp-ui-review/fix23-diag.mjs + e2e 实跑）：面板钮点开 → 官方右栏展开
  （649px/guide「开始」可见/panel open）；再点收起往返正常；smoke-skeleton 组一 +
  session-workbench dogfood 冒烟 + Step5/6 子集 + knowledge-integration + knowledge-browsing
  全绿；单测 1017 全绿；tsc/oxlint/imports/tokens 门全绿。

**受阻（① 官方 header 链点亮——三件不可达，转后续任务）**：

- 根因（runtime 源码三层实证）：slot runtime 的 renderSlot 授权按「占用者**注册行自声明的
  children**」发放——renderer standardKit 仅在 `entry.children !== void 0` 时注入 renderSlot
  （dsh-client-ui-renderer lib/client.js:708-733），boundRenderSlot 逐 key 校验
  `entry.children?.[key]`（:325-343）；而子槽声明全局唯一（ui-slots register 对已声明子槽
  重声明即 throw，index.js:192-195）→ 产品 main.conversation 影子行（-100，不声明 children
  ——声明即与官方 ConversationRoot 行冲突）**恒拿不到 `renderSlot('conversation.header')` 渲染权**。
  slots.d.ts:507 ConversationSlotProps 的 renderSlot 类型面为官方占用者（其注册行声明了
  children）——前次预案按类型面推断，runtime 面不成立。备选路径 B（直渲染官方子座）同墙：
  conversation.session.header 影子同样拿不到四子座 renderSlot。
- 实测（fix23-diag 探针，dogfood 真会话）：`[data-slot="conversation.header"]` /
  `[data-slot="conversation.session.header"]` 恒缺席；官方 utilities 三件（「打开方式」+
  「⋯」+ 官方 corner ExpandButton——均在官方头部链内）零渲染。AC1 三件在场不可达。
- 处置：头部维持 fix-9 裁决（官方件组合在 SessionPanel 内组装——三页签/标题/工具行形态
  零变化，AC3 保持）；面板钮已转官方动作径（见交付）。官方头部链点亮需要让官方
  ConversationRoot 渲染 main.conversation（产品工作台架构级重排——触及 UF-4/UF-5/hero/
  知识视图装配），超出本 fix 边界，转后续任务处置。

## 复核收口（2026-10-04 re-dispatch——① 已由 fix-25 解除受阻，全验收复核通过）

- **① 落地载体 = fix-25（8425433）**：main.conversation 影子退役，官方 ConversationRoot
  直渲中区——官方头部链三件白拿（utilities「打开方式」= ui-open-in-app +「⋯」=
  session-log-download；corner = ui-sidebar-right ExpandButton `[data-sidebar-right-expand]`）。
- **活体复核（tmp-ui-review/fix23-verify.mjs，dogfood 真会话）**：header/session.header 座
  在场（受阻期恒缺席的 `[data-slot=conversation.header]`=1）；「打开方式」拆分钮在场（菜单
  文件资源管理器（默认）/VS Code/IntelliJ IDEA/PyCharm）；「⋯」菜单 = 下载 Session 日志/
  反馈（AC 原文口径）；corner 收展往返 + guide「开始」649px + strip chrome 全通；三页签
  （对话/轨迹/知识召回）与知识视图联动零变化；pageerror/slot 崩溃零。
- **本 pass 增量**：zones/dock.ts + dock-kit.ts（+测试）死文件删除落 commit（fix-25 已删
  其余自研面、结构 pin 断言 zones 目录缺席——本删除为 pin 成立的最后一块）；
  session-workbench Step5 陈旧注释（「三件不可达」受阻期口径）更正为 fix-25 后事实。
- **门**：tsc -b / oxlint / imports / tokens / selftest 全绿；targeted vitest（web+structure+
  contract）56 文件 625 测试全绿。
- **已知边界（承 fix-25 记录）**：developerTools 开启期官方 trajectory 页签与产品
  dswf-trajectory 并陈（生产默认关闭不现）。

