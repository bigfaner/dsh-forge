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
