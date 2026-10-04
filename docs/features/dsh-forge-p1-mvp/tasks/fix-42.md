---
id: "fix-42"
title: "Align: 项目列表/树交互与样式对齐原生 dsh 工作区（WorkspaceBrowser 母本）——rail 图标列非空 + expandSidebar 消费 + 视图菜单实装 + 行语言（treeitem/hover 动作/归档过滤）"
priority: "P1"
estimated_time: "6h"
complexity: "medium"
dependencies: ["fix-41"]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Align: 项目列表/树借鉴原生 dsh 工作区（用户验收 2026-10-05 报障③后半）

## 需求（用户原话）

「项目列表/树的交互与样式借鉴原生dsh工作区。」

## 母本勘察（官方 WorkspaceBrowser——ui-workspace 注册 sidebar.workspaces 的原生占用者；产品 fix 前系替换件）

**结构（wide 态）**：
- 段头：段标（groupBy=flat→「会话」/ 否则「工作区」）+ 搜索槽（点击展开 input + clear；快捷键 requestSearch → 收起态自动 expandSidebar 后聚焦）+ **ViewOptionsMenu**（groupBy：工作区分组/平铺/工作区树嵌套；orderBy：updated/manual；archivedFilter：default/only 等——persist `dsh.workspace.view.v5`）+「＋」add（WorkspacePickFlow directoryFlow 官方建区流）；
- 列表区：SearchResults / FlatList / SessionTree（按 groupBy 切换）；分组展开态持久化（groupExpansion 按 key 保留，工作区删除时清理；**当前会话所在组默认展开**）。

**原生行语言（Rows.module.css + ownRow/sessionRow JSX）**：
- 工作区行：34px，folder/close↔open 图标（active 色），**hover 时 folder↔chevron 互换**，title，行尾 hover 动作（ellipsis menu：rename/delete workspace；新会话钮——stopPropagation），HoverCard（label/cwd/createdAt），`role=treeitem` + `aria-expanded` + **整行 onClick 翻转**，拖拽换序（insertWorkspaceBefore），嵌套缩进（--dsh-workspace-indent）；
- 会话行：32px，状态点槽（attention/done/running/idle 四态 + compact 尾标），title（滚动/裁剪 mask），meta/time（10px tertiary），pin 指示，归档行弱化（label-caption），rename input（内联），拖拽换序（manual 序），hover 动作。

**rail 态（!wide）**：搜索钮（18px，requestSearch → expandSidebar 展开侧栏后聚焦）+「＋」add 钮（18px）+ 列表区 rail 形态；root 加 `.rail` 类。

**产品现状差距**（ForgeWorkspacePanel + sidebar.css）：
- rail 态 = **空 div**（:462-465）；`expandSidebar` 壳回调被丢弃（未进 props）；
- 视图菜单 = P1 占位（仅「按项目树」+ 说明行，SIDEBAR_VIEW_MENU_ITEMS）；
- 搜索 = 独立 searchrow 展开式（fix-6 官方 Input——形态接近但未对齐段头内嵌槽）；
- 行语言：DisclosureRow 树（fix-41 补整行翻转/aria）+ 自绘会话行（StateDot/time 已对齐官方语义），无 hover 行动作/HoverCard/归档过滤/换序。

## 对齐方案（P1 裁剪——保产品数据模型「项目=forge projects 行 × 会话=dsh 账本」，换原生交互与样式）

1. **rail 图标列非空**（最高优先——收起态可用性）：rail 态渲染项目 folder 图标列（官方 IconFolderClose/Open + active 色；点击 = expandSidebar + 选中该项目首会话/无会话则展开侧栏即可）+ 搜索钮（requestSearch 同径：expandSidebar 后开过滤行）；接回 `expandSidebar` prop（ForgeSidebarSlot 已传）；
2. **视图菜单实装**：groupBy 二值（按项目树 = 现行树 / 平铺 = 全会话平铺按 updatedAt）；archivedFilter（默认/仅归档/不含归档——数据面 archived 已在 projects 行 + 会话 archive 态）；orderBy/手动换序/树嵌套 **不做**（记后续里程碑——菜单项不出现，不置灰）；
3. **行语言对齐**：项目行 34px 刻度 + hover folder↔chevron 互换 + 行尾 hover 动作（新会话钮：stopPropagation → 官方 startSession(workspaceId)——产品已持有该面；ellipsis menu：改名（对齐 fix-24 workspace 标题面 rename）/归档切换——删除归 fix-27 补偿语义后续里程碑）；会话行 hover 动作（重命名走官方 requestSessionRename 面——核查产品 consume 面后在缺省不接，记边界）；
4. **段头内嵌搜索槽**：现独立过滤行迁段头（官方 searchSlot 形态——label 隐藏/槽展开）；fix-22 blur 收起语义保持；
5. 样式令牌全部官方（--dsw-* 既有消费惯例）；sidebar.css 只留布局差异，行视觉一律对齐 Rows 刻度。

## 验收

1. rail 态：项目图标列在场可点（点击展开侧栏并定位）；搜索钮在轨；收起态不再是空轨道；
2. wide 态：视图菜单实际生效（树/平铺切换 + 归档过滤三态）；项目行 hover 图标互换 + 行尾动作（新会话/改名）可用；行高/密度/色对齐官方（并排截图对照原生 dsh）；
3. 全套单测/e2e 绿；现有 e2e 锚（data-dswf-project/session、sectionhead、过滤行）不破——新增锚只增不改；
4. 行为回归面：过滤（fix-6）、blur 收起（fix-22）、骨架/空态/错误条相位、选中高亮锚（currentSessionId）全保持。

## Reference Files

- 母本：dsh-client-ui-workspace client.js（WorkspaceBrowser return：sectionHeader/searchSlot/ViewOptionsMenu/headerActions/!wide rail 分支/listArea 三态；ownRow：treeitem+onClick；Rows.module.css：34px/32px 刻度、hover 互换、归档弱化、--dsh-workspace-indent；store persist `dsh.workspace.view.v5`）
- 产品：apps/web/src/views/sidebar/{ForgeWorkspacePanel.tsx（视图菜单占位 :197-205、rail 空轨道 :462-465、段头 :351-410）、ForgeSidebarSlot.tsx（expandSidebar 传入 :68-81）、sidebar-model.ts（sidebarFilterOf）、sidebar.css}
- e2e：session-workbench Step1b/1c（rail 面）、knowledge-recall-flywheel（过滤/骨架面）
- 关联：fix-41（行翻转先行修复——本任务 1 依赖其收尾）、fix-24（workspace 标题对齐——改名动作消费面）、fix-40（rail 几何 titlebar 双态）

## 边界与不做

- 不整替为官方 WorkspaceBrowser（数据模型 = 产品项目口径——SC2 直读纪律 + forge projects 行；借鉴行语言与交互，非组件移植）；
- 拖拽换序/orderBy/工作区树嵌套/会话 rename 内联输入 = 后续里程碑（菜单不出现该等项）；
- 不动官方壳 chrome（logoRow/toggle/newSession/panellist/footArea 归官方）；
- 目录流（WorkspacePickFlow 建区）不入产品「＋」（产品流程 = 添加项目向导，fix-21/fix-14 面——「＋」保持 openAddProjectFlow）。

## 实装收口（fix-42 执行记录——2026-10-05）

**执行形态**：fix-record 恢复任务假前提（fix-17 形态第十五例）——工作树/全分支/stash 三查零
实现（落点文件逐行仍持差距原文：rail 空轨道/expandSidebar 未消费/视图菜单占位），依派发
「假前提则真实现」注记转真实现（[[dsh-forge-p1-fix-record-recovery]] 先例径）。

**交付面**（对照对齐方案 1-5 全落）：

1. **rail 图标列非空**：`SidebarRail` 受控缝抽出（官方 rail iconButton 刻度 36px 命中区 /
   18px 图标 / radius md / label-primary / hover interactive-bg）——搜索钮（expandSidebar +
   开过滤行 = requestSearch 同径）+「＋」（openAddProjectFlow 保持）+ 项目 folder 图标列
   （data-active = 官方 folderActive 同型；点击 = expandSidebar + 选中首会话/无会话仅展开）；
   归档过滤随视图态共享；`expandSidebar` prop 消费收口（fix-41 B 面完整形态）；
2. **视图菜单实装**：`SIDEBAR_VIEW_MENU_ITEMS`（分组：按项目树/平铺 + 归档：默认/仅归档/
   不含归档）+ `selectedIds` 官方双选面 + `sidebarViewOfPick` 纯投影；段头标签随 groupBy
   切换（项目↔会话——官方 groupBy=flat→「会话」同型）；
3. **行语言对齐**：DisclosureRow `expandOnRowClick`（fix-41 A 面收编——官方开关：整行
   role=button + aria-expanded + Enter/Space）+ `previewChevron`（官方缺省 hover
   folder↔chevron 互换）+ 行高 34px/label-primary/14px 截断刻度 + 行尾 hover 动作
   （collapsedContent + keepContentWhenOpen 行内尾部槽——官方 rowActions 同位形：新会话钮
   → 官方 startSession(workspaceId)（插件 inject face 增 `startSession` 递达）；ellipsis
   菜单 = 改名 + 归档切换；删除不出现归 fix-27）；改名模态 = 官方 Modal（确认失败错误留
   模态——官方 rename 同型）；改名/归档走 `forge:projects/update` patch 面 + 静默重拉
   （name patch 的 workspace 标题对齐 = core fix-33 ⑪ 既有联动，零 core 改动）；
4. **段头内嵌搜索槽**：searchOpen = 过滤行独占段头（label/头部动作让位——官方 searchSlot
   形态）；`data-dswf-searchrow` 锚保持；fix-22 blur 收起/Esc 语义不变（守卫函数与其单测
   契约不动——搜索展开期头部钮结构性缺席，头部例外分支自然不触发）；
5. **样式**：全部官方令牌 + dsw-raw 豁免注释（官方 Rows/WorkspaceBrowser 逐值对齐——
   34/32 行高、36 rail、20 行尾动作、10 gap 等官方原值）。

**测试**：单测 77 侧栏面 + 全套 1083 绿（模型纯函数：archivedFilter/flat 投影/viewOfPick/
label；行动作绑定：startSession/rename 拒绝传播/归档 fail-soft；面板受控缝：rail 图标列/
视图应用/行语言静态面；plugin inject face += startSession）。e2e 新增
`sidebar-view-align.spec.ts` 4 测试绿（rail 图标列 DOM 在场 + 新会话钮盘侧会话增生实证 +
视图菜单平铺/归档三态真实链 + 改名模态→RPC→行标题更新）。

**边界与裁决**（记入案）：

- **titlebar 模式 rail 几何**（fix-40 官方壳设计）：`[data-windows-titlebar]
  .collapsed .regionArea { display:none }`——Windows titlebar 形态收起态整域隐藏（官方
  WorkspaceBrowser rail 同域同藏——官方平价）；rail 图标列交互面在该形态结构性不可达，
  e2e 以 DOM 在场断言，点击行为归单测钉 + 非 titlebar 形态消费。**已知环境 flake**：
  Step1b（session-workbench:286）「rail 可见」断言在 titlebar 形态激活期红——A/B 实证
  HEAD~1 同红（本任务前置既有，非回归；Step5/6 右栏断言同批 A/B 同红）；
- **会话行 hover 动作不接**（规格预裁：「核查产品 consume 面后在缺省不接」）：官方
  requestSessionRename 面不在产品注入的 uiWorkspace 服务窄面（UiWorkspaceService 无此法
  ——归 WorkspaceBrowser owner share 别源），缺省不接记边界；会话行 hover 动作归后续
  里程碑（随会话级菜单面评估）；
- **fresh blank 会话行不即入侧栏树**：官方 startSession 盘侧即建会话（e2e 实证），但
  blank 行入树需 workspace 成员传播 + 选中态（官方「仅选中 blank 可见」口径）——行显示
  面归 dogfood 台账（真实凭据链）；零凭据 e2e 以盘侧会话目录增生为断言；
- **归档切换失败 fail-soft**（console.warn，无行内错误面——P1 无 toast 基建）；改名失败
  呈现于模态（官方同型）；
- **视图态不持久化**（纯视图微观态——官方 `dsh.workspace.view.v5` persist 归后续里程碑）；
  archivedFilter=only/hide 致零行时无专用空提示（渲染空列——P1 最简）；
- **AC2 截图对照**以 CSS 声明逐值对齐官方（Rows.module.css/WorkspaceBrowser.module.css
  原值转录 + dsw-raw 豁免台账）为结构等价替代（fix-26 可辩护替代先例）；
- **fix-41 依赖**：fix-41（pending）交付面 = 本任务行语言/展开回路的真子集
  （expandOnRowClick + expandSidebar 消费），已随本任务全量落地——fix-41 台账归派发侧
  对账（其独立 e2e 补充面 Step1b 树行翻转断言仍可另补）。
