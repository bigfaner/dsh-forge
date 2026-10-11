---
created: "2026-10-09"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: dsh-forge M3.1 UI 对齐轮（全工作台原型复刻 + 任务详情弹窗 + 派发悬浮面板）

> **定位**：里程碑级修补提案（P1.1 UI 修补轮先例口径——M3 收官后的 UI 收口，非新功能域）。宪法输入 = 总纲 [`dsh-forge-redesign/proposal.md`](../../../docs/proposals/dsh-forge-redesign/proposal.md)（官方样式纪律 / UX 原型基线「验收以可交互走查对照原型逐项断言」）+ M3 ui-design v24（`docs/features/dsh-forge-m3-bootstrap-presets/ui/ui-design.md`）。
>
> **目标形态基线（回写修订）**：**本提案纠正版原型** [`prototype/`](./prototype/)（109 断言 + 零页面错误，`node shots-m31.cjs` 自查）——经 **17 轮用户实审修正收敛**（完整轮次台账见 [`prototype/README.md`](./prototype/README.md)）。总纲重构原型与 M3 静态原型降为**来源档案**（冻结不改）：纠正版原型以总纲原型为完整工作台底座、叠加 M3 卡片语言与 M3.1 全部裁决，并对官方件（icons / Rows / dockkit / Menu / newSession / panelList）逐值核对。**差异总清单见下文「现状 ↔ 纠正版原型」节——实现范围以该清单为准**（原 Evidence 面向已收窄/翻转的以清单为准）。
>
> **行会纪律**：本提案为**纯 UI/交互形态轮**——任务/提案/feature 数据面、管线语义、RPC 契约零变化。**唯一例外（D34 修订，2026-10-10 用户裁决领取时间排序牵动）**：sessionLinks 读面**加性可选字段** claimedAt（task_session_links.created_at 加列直读——零写面/零管线语义/零既有字段变更），其余数据面纪律不变。

## Problem

核心问题一句话：**M3 交付的 UI 与既定原型基准存在一处系统性视觉偏离（波及全工作台各面）、三处交互形态滞后/错位与一类纪律违规（原型注释残留），用户实机走查已判「差别很大」。**

### Evidence

1. **概览 tab 样式系统性偏离原型**（主体 + 提案/feature/任务三子 tab + 任务详情）——实现采用平铺 tree-row 行语言，原型为卡片语言，逐项对照：
   - 父行：实现 [`overview.css`](../../../apps/web/src/views/overview/overview.css) `.dswf-ov-parent` = 无边框 28px 平铺行；原型 `.ov-parent` = **边框 + 圆角 8 + bg-2 浮卡**（灰底页面上）+ meta 块 `bg-3` + 顶分隔线；
   - 状态 chips：实现矩形 `radius-xs` 单色；原型**彩色胶囊**（五态各色：under-review 蓝 / accepted 绿 / rejected 红 / superseded 紫，激活态着色）；
   - 子 tab：实现药丸按钮（active = interactive-bg-active）；原型**下划线高亮**（active = 主色 + 底边框）；
   - 任务子 tab taskbar / DAG / 泳道 / 任务详情内容面同源偏离；
   - **实机复现（2026-10-09 用户）**：概览内容不填充容器——tab 放大后内容全靠右半边（`.dswf-ov-wrap { justify-content: flex-end }` + 内部定宽 560 右贴）——即**在途 blitz 1.3**（`forge-settings-overview-ui-fixes/1.3`，in_progress）既判问题，本提案样式对齐建立在其落地后的填充形态上（纠正版原型已按填充形态体现）。
2. **左栏（侧栏）与原生 dsh 的差异**（用户裁决：左栏基线 = **对齐原生 dsh**，非总纲原型）：原生 dsh AppFrame 为 `sidebarCol { border-right: .5px solid border-l3 }`（`dsh-client-ui-layout` 官方样式）；产品启用 Windows WCO（`data-windows-titlebar`，[`preload-api.ts`](../../../apps/host/src/ipc/preload-api.ts) 显式设置），官方该形态下**显式去竖线**改中区左上圆角——产品因此看不到线。竖线之外，经官方壳源码复核（`dsh-client-ui-sidebar` SidebarRoot / `dsh-client-ui-workspace` Rows / 官方 plugin-manager panelList）**左栏大面积已由官方件承载**（新会话钮/插件行/知识库行/段头四件/视图选项 Menu/会话行刻度——详见差异清单 D4 零差异记账）；**真实残差收窄为三处**（差异清单 D1–D3）：① 竖线恢复；② WCO 收起形态（官方 rail 隐藏 + 标题栏双圆钮 vs 原型 rail 图标列常驻——按原型裁决取 rail）；③ **项目行路径次行方向翻转**——官方 Rows 常驻 meta 次行，用户原型裁决 = 仅名称 + 悬停提示（偏离官方 Rows，记账）。
3. **Forge设置样式与 Provider 选项源**：用户裁决两条——① **样式也要调整**（对照 M3 原型 settings 分区形态：分区底色条标题 / worker 小节 / 行式控件 / 未配置 ⚠ / 保存反馈，在途 blitz 1.1 成组落地后形态）；② **Provider 选项值从「设置>模型」获取**——与在途 blitz 任务 `forge-settings-overview-ui-fixes/1.2`（remote.session.modelCatalog 装载）同指，本轮以**结果性要求**承接核对（1.2 落地即验；未落地则本轮补齐——避免双做）；分区底注「未来注记」残留清理（见 Evidence #6）。
4. **任务详情 = 右缘全高抽屉**（[`drawer.css`](../../../apps/web/src/views/overview/drawer/drawer.css)：`position:fixed; right:0` + 左缘拖宽 + 滑入动画）——用户裁决改**可拖动弹窗**。
5. **会话头挂接 pill 挂在对话面板上方**（[`ForgeSessionTaskPills.tsx`](../../../apps/web/src/views/session/ForgeSessionTaskPills.tsx) 占用 `conversation.session.header.actions` 槽；点击经 onOpenTask 跳 dock 概览 + 抽屉）——用户裁决改**对话内部右上角悬浮面板**（仅本会话派发的任务；点击不跳 subagent 会话）。
6. **原型 UI 注释残留正式页面**（违反 M3 ui-design 自身「界面说明最小化（无解释性文字）」纪律）：
   - 设置分区底注「按任务类型指派特定 LLM = 未来注记（不实现）」（[`ForgeSettingsSection.tsx:55`](../../../apps/web/src/views/settings/ForgeSettingsSection.tsx)）；
   - 概览列表脚注「docs/features/ · 仓内只读」「forge docs/proposals/ · 只读」（[`feature-tab.tsx:182`](../../../apps/web/src/views/overview/feature-tab.tsx)、[`proposal-tab.tsx:365`](../../../apps/web/src/views/overview/proposal-tab.tsx)）；
   - 突击容器计数注「N 条 · 突击提案容器（无 feature 阶段）」（[`task-tab.tsx`](../../../apps/web/src/views/overview/task-tab/task-tab.tsx)）。

### Urgency

- M3 自举纪律已生效（M4 起剩余功能用自身开发）、M3.5 走查在即——工作台是自举开发的日常脸面，样式债直接影响 dogfood 体验与后续每轮走查的信噪比。
- P1.1 先例已证：机械面断言看不见视觉偏差（fix-3「单测 132 绿 ≠ 修好」）——偏离不收口会持续滚大并稀释后续里程碑主题。

## 现状 ↔ 纠正版原型：差异总清单（实现对照表）

> **范围口径**：产品**全部自绘 UI 面**逐面对照纠正版原型（`prototype/`，109 断言）。「现状」= apps/web M3 交付实现（文件锚点）；「原型」= 目标形态（原型断言锚 `shots-m31.cjs` A–J 分区）。官方壳/官方件自带面标注「零差异（记账）」——实现不动，原型保真度核对已完成。**实现范围以本清单为准**（与 Evidence 冲突处以本清单为准——左栏面经官方壳承载核对后已收窄、项目行 meta 方向已翻转）。

### 一、左栏（产品面 = ForgeWorkspacePanel 族；壳/Rows/panelList = 官方件）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D1 | 左栏右缘竖线 | WCO 补偿面去竖线 + 中区左上圆角（官方 layout 形态） | **1px 竖线常驻 + 圆角移除**（官方边框令牌；WCO 补偿面显式偏离记账）· I 区「竖线 1px」 |
| D2 | 收起（rail）形态 | 官方 WCO 语义：rail 隐藏 + 标题栏双 28px 圆钮 | **59px 竖排图标列常驻**（展开/新会话/插件/知识库/搜索/设置，全官方件图标；WCO 下不隐藏——偏离记账）· G 区「rail 在场/图标 ≥4」 |
| D3 | 项目行路径展示 | 官方 Rows 双行：标题 + meta 次行（canonicalPath 常驻） | **仅名称一行；路径转名称悬停提示**（用户裁决——偏离官方 Rows）· I 区「pj-meta 零在场」 |
| D4 | 壳面与件面 | **零差异（记账）**：新会话钮（官方 newSession h38/elevated 白卡）、插件行（官方 plugin-manager panelList）、知识库行（fix-25 官方 PanelRow）、段头四件（label/搜索/视图选项/＋）、视图选项 = 官方 Menu + SlidersTwo、搜索失焦即隐清空、会话行官方 Rows 刻度（h32/缩进 20/time 10px）均已官方承载；原型 R10–R17 逐值核对一致（路径级断言） | — |
| D31 | 左栏竖线未达窗口顶点（D1 残差；2026-10-10 用户实机报障「分隔线没有到达最高点」，上游源码核验属实） | WCO 下官方 frame 带 `padding-top: var(--dsh-windows-titlebar-height)` 顶起整个 grid——产品竖线（sidebarCol border-right，[`wco.css:28`](../../../apps/web/src/styles/wco.css)）仅覆盖 [titlebar-height, 100%]，标题栏带内 [0, titlebar-height] 段缺失；收起态覆层轨 top 同为 titlebar-height（[`wco.css:43`](../../../apps/web/src/styles/wco.css)）同缺 | **竖线自窗口顶点 y=0 连续贯穿至底**（带内段补齐：同 x 同色、双主题联动；收起态轨右缘同上延——带内段 = frame::after @ left:var(--dsh-windows-sidebar-width) / 收起态 59px 变体）· SC-1 竖线断言上延（任务 1.16 承接） |
| D40 | 展开态收起钮形态（2026-10-10 用户追加裁决：「收起左侧栏跟 brand 图标同一行，在 brand 图标的右侧」） | D2 只转换了收起态 toggle；**展开态**保持官方 WCO 形态 = 28px 圆钮 position:fixed 标题栏（[`wco.css:68`](../../../apps/web/src/styles/wco.css) 注释「展开态不受本规则波及」）——与 logoRow 内 brand 图标（ForgeBrand）不同行 | 展开态 toggle = logoRow 内、brand 图标右侧（position:static + 官方非 WCO iconButton 36px 刻度——D2 收起态同款对冲先例；标题栏圆钮形态退役，偏离记账）· SC-1 扩展（任务 1.27 承接） |
| D41 | 项目列表默认可见性（2026-10-10 用户追加裁决：「默认隐藏归档的项目，默认展示最近 24 小时的会话，其它会话折叠起来」） | 归档过滤三态视图态已有但缺省 = 'default'（归档项目混入展示——[`sidebar-model.ts:235`](../../../apps/web/src/views/sidebar/sidebar-model.ts) SIDEBAR_VIEW_DEFAULT）；会话行全量平铺无时间窗（updatedAt 已在库未消费） | ① 缺省 archivedFilter = **'hide'**（三态菜单语义保持）；② 会话 24h 窗口：updatedAt ≥ now−24h 默认可见、其余折叠进「更早（N）」可展开组（本地微观态不持久化；搜索在场全量让位；flat/rail 投影不动）· SC-8 收口（任务 1.28 承接） |
| D42 | 会话行悬浮动作钮（2026-10-10 用户追加裁决：「鼠标悬浮到项目列表的某一个会话时，显示相关的按钮，对齐 dsh」） | 产品会话行 = 官方刻度复刻的自绘行，**零 hover 动作钮**；官方 ui-sidebar 原生 = fading 模式（子元素 opacity:0 → hover 显）+ iconButton（hover interactive-bg-hover）——源码核验 | 行尾 hover 动作钮组（fading 等价机制零抖动 + 官方 iconButton 刻度）；动作集 = 官方 Rows trailing 对照 + 产品既有能力逐位记账（无 RPC 支撑者不虚设）· SC-8 收口（任务 1.29 承接，depends 1.28 同文件序） |
| D45 | 会话行悬浮三钮 + ⋯ 菜单对齐 dsh（2026-10-10 用户再追加裁决：「鼠标悬浮在某一个的会话上时，会话右侧显现三个图标按钮，依次是：…、归档会话和置顶会话。…图标包含其它更多功能选项」） | D42 落地态 = 单「打开会话」钮；⋯ 菜单零 RPC 支撑缺席（`forge:projects/update` 仅项目域——会话域无 update 通道的旧判）；**上游核验翻案**：官方 `UiWorkspace` 服务自带 archiveSession/unarchiveSession/pinSession/unpinSession/forkSession 面 + `ISessions.using` → `binding.session.rename`（官方 session-actions 同径）——插件已 inject `uiWorkspace`/`sessions`，面可达 | 行尾三钮依次 = **⋯ 菜单 / 归档会话 / 置顶会话**（官方 row.action 位序 archive[100]/pin[200] 最右；「打开会话」钮退役——行点击既有单缝）+ ⋯ 菜单四项 = 置顶/取消置顶·重命名·分叉会话·归档/取消归档（官方 session menu 序 100/200/300/400）；**置顶**：registry 置顶集镜像（最近置顶在前）项目块内领先 + 静止图钉标记 + 24h 折叠让位 + flat 跨项目领先；**归档**：registry 归档集镜像随三态过滤进退（hide 缺省）+ 归档行弱化/状态点槽空白/不可打开 + 运行中归档拒绝 → 「停止并归档」确认模态（官方 SessionArchiveConfirmDialog 同型）+ **会话改名模态**（官方 SessionRenameDialog 同型）；官方面缺席 = 对应项不呈现（P1 口径沿袭）· SC-8 收口（任务 1.32 承接，depends 1.29 同文件序） |
| D45-② | 动作组浮现机制（2026-10-10 用户再追加裁决：「会话右侧的按钮是浮现在会话上方，不挤占会话的行空间」） | D45 首落地 = 动作组 in-flow 占位（D42 opacity:0 占位机制沿袭）——三钮 ~100px 常驻布局流，标题可用宽度被永久挤压（官方 rowActions = display:none 起手零占位 + hover 置换 time——in-flow 占位偏离） | 动作组**绝对定位浮现 overlay**：脱离行布局流零占位（标题可用宽度恒定，非悬浮/悬浮态行内空间不因动作组变化——官方零占位语义同源）；**背板 = 行悬浮合成色**（`--dsw-specific-sidebar-fill` 官方表面底漆 + `interactive-bg-hover` tint 双层叠加 = 行悬浮观感逐像素复刻——遮蔽标题/时间文字穿透且与行面无缝）；键盘聚焦经 `:has` 同步行底 tint（合成恒一致）· 任务 1.32 内承接（结构 pin 3 条新增） |

### 二、中区会话面（产品面 = ForgeSessionTaskPills / RecallTab；对话/页签行/输入框 = 官方 ConversationRoot）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D5 | 会话头任务挂接 | [`ForgeSessionTaskPills.tsx`](../../../apps/web/src/views/session/ForgeSessionTaskPills.tsx) 占用 `conversation.session.header.actions`；点击跳 dock 概览 + 抽屉 | **槽位卸载、pill 退役**（会话头零挂件）· E 区「零任务 pill」 |
| D6 | 派发任务悬浮面板 | 无对应面 | **新建**：仅本会话派发（link 源）；对话列内、工具栏之下右上角；dock 展开自动左移；头可拖（拖后停自动锚定）；▁ 折叠 ⟡N 角标；**行点击 = 任务详情弹窗（零跳转/零 dock 强开）**；行尾 ⟞ = 打开 worker 执行子会话 + **树零联动**（worker 打开时父会话保持高亮、树不重排）· E 区全组 |
| D7 | 知识召回 tab | [`RecallTab.tsx`](../../../apps/web/src/views/session/RecallTab.tsx) 统计头 + 分组行 + 热效标注；行点击跳知识面板 + 开抽屉（语义同原型） | 样式对齐原型卡语言（分组行/统计头/verb 分色胶囊）——**对照走查项**（非重裁面） |
| D33 | 悬浮面板两残差（2026-10-10 用户实机报障：默认起始位置应在中间区域对话面板右上角 + 状态标签颜色与任务子 tab 保持一致，源码核验属实） | ① 默认锚位断锚：锚源 `[data-slot="main.conversation"]` 为官方 display:contents 槽宿主零盒（pin ⑮-4）→ convRight 恒 0 → left 钳 4 钉视口左缘（[`DispatchPanel.tsx:294`](../../../apps/web/src/views/session/DispatchPanel.tsx)；单测假 rect 掩蔽）；② 行状态 Tag 硬编码 `tone="neutral"`（七态同灰）——任务子 tab 列表行 = `taskStatusTagTone` 三色单源 | ① 锚源换真盒官方锚（`[data-conversation-scroll]` 先例）→ 默认落位 = 对话面板右上角（右缘内收 16 / 页签行下 + 8——D6 纵向裁决保持）+ 真 DOM 几何断言防回归；② Tag tone 单源复用 `taskStatusTagTone`（completed=success / blocked·rejected=danger / 其余 neutral；零复制映射表）· SC-3 扩展（任务 1.18 承接） |
| D34 | 悬浮面板三残差（2026-10-10 用户追加裁决：面板加宽 / 悬浮球可拖 / 领取时间倒序 + 进行中置顶） | ① 宽 = 324（dsw-raw 原型刻度）；② collapsed 态角标硬锚定位 `geometry={collapsed ? anchor : geometry}`——不可拖（[`DispatchPanel.tsx:612`](../../../apps/web/src/views/session/DispatchPanel.tsx)）；③ 行序 = slug/local_id 自然键序——SessionTaskLinkCard 无领取时间字段（领取时间在库 `task_session_links.created_at` 未读出） | ① 加宽至 400（dsw-raw 新裁决刻度记账；窄视口钳制沿袭）；② ⟡N 角标可拖（视口钳制 + 拖后停自动锚定 + 展开几何连续）；③ **in_progress 置顶 + 领取时间倒序**（最早领取最下方）——sessionLinks 读面加性可选字段 claimedAt（**行会纪律唯一例外修订**，任务 1.20 承接） |

### 三、hero 与知识面板（官方 `main` 面板族产品占用者）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D8 | hero 面板 | [`HeroPanel/HeroEmpty`](../../../apps/web/src/workbench/)（零项目首启：价值一句话 + 添加项目 CTA + 鲸绘底）+ [`HeroWorkspacePicker`](../../../apps/web/src/views/session/)（会话 hero 相位项目选择） | 总纲底座冻结形态（本轮 17 轮未重裁）——**既有对照走查项**，不新增裁决 |
| D9 | 知识面板 | [`KnowledgeView`](../../../apps/web/src/views/knowledge/)：域轨 224 + 卡片网格 + 官方件工具栏 + EntryDrawer（dockkit 浮层）——M3.8 已按总纲对齐 | 同构（总纲冻结形态）——**对照走查项**；残差走查归档驱动 |

### 四、右栏 dock（tab 本体 = 官方 dockkit；产品 = dock-tabs 装配 + 概览/文档两 body）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D10 | dock 选中 chip | 官方 dockkit 自带（tag 灰底 + 主文字） | **零差异（记账）**——原型 R13 已向官方对齐（`markdown-tag` 填充断言）· A/H 区 |
| D11 | dock 开始页 | dock 展开直接落概览 tab，无开始页 | 原型保留总纲**开始页**（rb-start 卡片导航：项目概览/文档/新会话）——**对照走查项**（去留实机裁决） |
| D39 | dock 余缝色差（2026-10-10 用户追加裁决：「中间区域及 dockkit 上方跟下方保持一样的颜色」） | WCO 下官方 frame 背景 = sidebar-fill、centerCol 显式 bg-base、**rightbarCol（dock 列）无独立背景规则**（ui-layout 源码核验）→ dock 上/下/右余缝透出 sidebar-fill 与中区 bg-base 成色差 | rightbarCol WCO 背景 = var(--dsw-alias-bg-base)（wco.css 对冲——官方补偿面显式偏离记账，与 D1 竖线同族）· SC-8 收口（任务 1.26 承接，depends 1.21 wco.css 链尾） |

### 五、概览 tab 内容面（最大差异簇；载体 = [`overview/`](../../../apps/web/src/views/overview/)）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D12 | 内容填充 | `.dswf-ov-wrap { justify-content: flex-end }` + 定宽 560 右贴（**在途 blitz 1.3** 承接——本提案建立在其填充形态上） | 内容弹性填满列（裁决 #1）· A 区 |
| D13 | 行语言 | tree-row 平铺（28px 无边框行，[`overview.css`](../../../apps/web/src/views/overview/overview.css)） | **卡片语言**：灰底内容区 + 边框圆角 8 浮卡 + bg-3 meta 块 + 顶分隔线 · A 区「卡片 8 张」 |
| D14 | 状态 chips | 矩形 `radius-xs` 单色（[`status-chips.tsx`](../../../apps/web/src/views/overview/status-chips.tsx)） | **彩色胶囊**（五态各色/七态/阶段，激活着色）· A/B/C 区 |
| D15 | 子 tab 形态 | 药丸按钮（active = interactive-bg-active） | **下划线高亮**（active = 主色 + 底边框）· A 区「三子 tab」 |
| D16 | 提案子 tab | [`proposal-tab.tsx`](../../../apps/web/src/views/overview/proposal-tab.tsx)（ModeDialog/VerdictDialog 在场） | + **mode chip**（远征蓝/突击琥珀/未标记）+ 摘要独行 + 两列元数据 + 文档区 + 行头「打开新会话」 + ⋯ 评审流转 · A 区 |
| D17 | feature 子 tab | [`feature-tab.tsx`](../../../apps/web/src/views/overview/feature-tab.tsx)（PhaseChips/MetaGrid/DocGroupList 在场） | **阶段彩色 chips + 分层文档（中文分组）**形态对齐 · B 区 |
| D18 | 任务子 tab taskbar | 结构已齐（容器 pill/ViewDropdown/右簇/七态 chips，[`task-tab.tsx`](../../../apps/web/src/views/overview/task-tab/task-tab.tsx)） | 形态对齐：**视图下拉 = 容器 pill 同行右侧**（y ±6）；七态 chips 彩色胶囊次行独占；**全终态派发钮深灰实底置灰**；突击计数注收进 pill 悬停 · C 区 |
| D19 | 任务三视图 | list 两行行/DAG/泳道（list-view/dag-view/swimlane-view） | 同构形态对齐卡片语言 + 点击行 → 弹窗（D20）· C/D 区 |
| D20 | ov-head 基本信息 | 行内官方 ghost Button ▾/▴（[`ov-head.tsx`](../../../apps/web/src/views/overview/ov-head.tsx)） | **名称行内同位翻转钮**（官方 ChevronDown 旋转 + 展开↔收起文案 + aria-expanded；三次几何同位）· A 区 |
| D29 | DAG 节点任务名称截断（2026-10-09 实机报障，核验属实） | 节点 170×64 固定 + 标题**单行** nowrap ellipsis（[`dag-layout.ts:10-11`](../../../apps/web/src/views/overview/task-tab/dag-layout.ts) W170/H64——注释自称「原型 renderDag 结构刻度」但与原型实值不符；[`task-tab.css .dswf-tt-node-title`](../../../apps/web/src/views/overview/task-tab/task-tab.css) 单行省略）；全名仅 title 悬停兜底——可用标题面积 ≈12 字/行，中文任务标题普遍截断 | **190×72 刻度 + 标题两行换行**（12px/17px + line-clamp 2 ≈ 28 字）；超长标题悬停全名兜底；其余 DAG 面（wrap 边框/62vh/居中）归 D19 三视图卡片语言 · C/D 区（原型 `renderTaskDag` W190/H72 + `.dag-node-title` line-clamp 2） |
| D36 | 概览内容面微调六项（2026-10-10 用户追加裁决：间距减半 ×2 + 行距收紧 + 泳道列头等高 + 视图钮去 tooltip + 悬停有意义化） | ① 提案/feature 子 tab chips → 首卡间距偏大；② 列表行距偏大；③ 泳道空列折叠窄头（`.is-empty` 列头 `height:auto` 堆叠，[`task-tab.css:379`](../../../apps/web/src/views/overview/task-tab/task-tab.css)）与非空列 26px 横向头不等高；④ 任务子 tab taskbar → 视图顶距偏大；⑤ 视图切换钮带 Tooltip（VIEW_DROPDOWN_TITLE）；⑥ list/swim 行卡悬停 label = key/title/sub 可见字面复读（D30 机械化包裹零信息量） | ①④ 间距 × 0.5（三子 tab 面）；② 行距收紧（无重叠可辨）；③ 折叠窄头退役——空/非空列头同形同高 26px；⑤ ViewDropdown 零 Tooltip（断言更替非删除）；⑥ 悬停 label 携非可见位信息（状态全称/优先级/估时）——DAG 全名兜底与状态说明类保留记账 · SC-4 扩展（任务 1.23 承接） |
| D37 | 自释功能钮 tooltip 噪声（2026-10-10 用户追加裁决：「展开、派发、状态筛选控件等功能直观按钮不要添加 tooltip，全面排查」） | D30 机械化全量包裹在自释控件位构成噪声：展开族（ov-head 翻转钮 + 弹窗 ⤢ 翻转钮）、派发钮（DispatchButton 三态）、状态筛选 chips 三族（七态/五态/阶段）、✕ 关闭族 ×4、⋯ 行操作族 ×2、粘滞条清除/排序切换——label 与控件自释语义重复（或由 aria/置灰形态承载） | **规则：控件自释 → tooltip 整体退役；非自释把手与增量信息承载 → 保留记账**——点名三类 + 同族清零（DOM 断言）+ 概览 tab 全量 141 Tooltip 位逐位判定台账（保留：截断兜底族/副作用说明/诊断说明/容器 pill 计数注/1.23 ⑥ 增量悬停；边界位 ⟞/拖宽柄默认保留）；断言更替非删除 · SC-4 扩展（任务 1.24 承接——ViewDropdown 位归 1.23 ⑤ 已载，避双做） |
| D38 | 清过滤钮改词（2026-10-10 用户裁决——预览四案后自定） | 「✕ 清过滤」三族 chips 共用（七态/五态/阶段）——「清过滤」语感生硬；测试锚 5 处断言字面 | **「✕ 重置」**（裸词；✕ 前缀保留）三族同步 + **与相邻 chip 拉开间距**（钮前间距 > 行内 chip 间距，~14px 执行期定值）；UI 字符串层「清过滤」清零（行为描述性注释措辞非 UI 面不动）· SC-4 扩展（任务 1.25 承接） |
| D44 | 状态筛选 chips 等长收紧（2026-10-10 用户追加裁决：「各个子 tab 的状态筛选标签的长度要一样，并且长度小一些」） | 三族 chips 平行类、内容自适应宽（label 2–3 字 + 点 + 计数 → 宽度参差）：`.dswf-ov-stchip`（七态，overview.css:214——任务子 tab 复用同族）/`.dswf-ov-pschip`（五态）/feature 阶段族 | **固定统一宽**（~72–84px 档执行期定——3 字 + 点 + 两位计数紧凑容纳）+ justify-content:center + 横向 padding 收窄档；三族同值零漂移断言（平行类互指注记或共享类收敛）；「✕ 重置」非状态标签不参与等长 · SC-4 扩展（任务 1.31 承接） |

### 六、任务详情（载体 = [`drawer/`](../../../apps/web/src/views/overview/drawer/) → 弹窗改造）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D21 | 形态 | **右缘全高抽屉**（`position:fixed; right:0` + 左缘拖宽 + 滑入，[`drawer.css`](../../../apps/web/src/views/overview/drawer/drawer.css)） | **可拖动弹窗**：标题栏全窗拖移 + 左右缘宽 320–760 + 单例切任务原位换内容 + Esc/✕ + 默认起始位（不记忆）· C 区 |
| D22 | 内容双形态 | 单形态全量（type-templates/coverage-bar/timeline/transition-dialog 在场） | **简要 440 ↔ 完整 720 双形态**：简要 = 键+tag+标题+概要；完整 = 现状条 + kv 六项 + 八段（目标/范围/实现/测试/验收/参考文档/备注）+ gate 检查项 + 覆盖率条（预期标记+达标判定）+ verb 分色时间线 + **双源会话 pill 跳转**（dispatcher/worker → 对应对话面板）+ 分块折叠 + 参考文档点开 dock 文档 tab · C 区 |
| D23 | 打开来源与挂载 | 任务行/弹窗内诊断失败入口（三视图点击已有）；挂载随 dock 概览 | **四路**（任务行/DAG 节点/泳道卡/悬浮面板）+ 挂载独立于 dock（对话中直接打开）· C/E 区 |
| D43 | 弹窗顶/底高度（2026-10-10 用户追加裁决：「任务详情的弹框的顶部和底部的高度都小一些」） | 拖移标题栏 min-height 38px（[`drawer.css:48`](../../../apps/web/src/views/overview/drawer/drawer.css)）+ 首块 padding-top / 末块·脚行 padding-bottom = xs-13-line-height 档（:108/:138/:635）——顶/底垂直占位偏大 | 标题栏 ~30px + 上下内距各收一档（值执行期定，dsw-raw 新裁决刻度记账；标题栏变矮后拖移手柄仍全栏可用）· SC-2 扩展（任务 1.30 承接） |

### 七、Forge设置（载体 = [`ForgeSettingsSection.tsx`](../../../apps/web/src/views/settings/ForgeSettingsSection.tsx)）

| # | 差异点 | 现状（实现） | 原型（目标 · 断言锚） |
|---|---|---|---|
| D24 | Provider/Model 控件 | **原生 `<select>`**（:324/:345） | **官方 Menu 件**：MenuSurface 半透卡（radius-lg 16 · pad 4 · blur40 半透 + elevation-prominent）+ 项（min-h 34 · r8 · 13px · trailing 官方 Check）+ 触发钮（值 + ChevronDown，h34/r8/13）+ Esc/点外收 · F 区 |
| D25 | 选项源与成组 | 选项 = 契约内定；行分隔线在场（**在途 blitz 1.2/1.1** 承接核对） | Provider/Model 值 = 「设置>模型」目录；worker 三行式**成组零行分隔线**；未配置 ⚠ 回退说明 + 保存反馈/失败态 · F 区 |
| D26 | 过程注释残留 | FUTURE_NOTE 底注 + 概览目录脚注 ×2 + 突击容器计数注（Evidence #6） | **零过程注释文案**（字符串级断言）· F/A 区 |

### 八、全局纪律

| # | 差异点 | 现状 | 原型（目标） |
|---|---|---|---|
| D27 | 令牌纪律 | M3 六色映射先例 | 颜色一律 `--dsw-*` 最近语义映射（原型裸值不直入；结构刻度 dsw-raw 豁免注记）；lint-tokens 零违例 |
| D28 | 双主题 | 亮/暗已有 | 亮/暗**全形态**走查（弹窗/悬浮面板/下拉卡/插件行/新会话钮逐面）· H 区先例 |
| D30 | 悬浮提示形态（全局组件面；2026-10-09 用户实机报障「黑色方框太丑」） | 自绘面原生 `title=` 黑框（产品 ~35 处真提示位：项目树/文档 tab/ov-head/状态 chips/DAG 节点/泳道/列表行/抽屉模板/时间线/派发钮/容器 pill 等；全仓零 Tooltip 使用。EmptyState 标题 prop 4 处非提示位排除） | **官方 `Tooltip` 件**（`dsh-client-ui-primitives` 导出：悬停/键盘聚焦锚定克隆子元素 + 深色气泡 + ResizeObserver 视口自适应翻转 + `portal` 逃逸裁剪容器 + openOnClick 信息钉住）——与 D1–D3 同族「对齐原生 dsh」裁决；原型静态 mock 的 title 为占位非冻结形态 · 官方 README Tooltip 节锚 |
| D32 | 单色光标纯白不可辨（全局壳面；2026-10-10 用户实机报障「光标变成纯白色，让人看不清楚」——分隔线 handle 与会话消息文字两表面，源码 + 外部佐证核验属实） | **OS 级缺陷非样式回归**：Windows/DWM 单色光标渲染缺陷（Chromium issue 1366924 族；Edge/Chrome/Electron 通病——Microsoft Q&A #4273316 / V2EX #1104486 实证）——col-resize/IBeam 单色光标被渲纯白，箭头/手形彩色光标不受影响；产品 CSS cursor 全关键字、官方包零 url() 光标 | **产品侧缓解**：两表面自定义高对比色图光标（data-URI SVG + 热点坐标 + 关键字降级链；亮/暗两套；html[data-windows-titlebar] scope）——**文字面 = 钢笔形**（本地 Windows 墨迹钢笔风格造型 + 高对比色差着色/描边——2026-10-10 再裁决替换 IBeam 形，裁决 #24）；handle 锚 `div[data-side]`（官方 ui-layout 稳定属性）/ 消息锚 `[data-conversation-content]`（brand.css 既有先例）；OS 根因的用户机侧缓解径（注册表/指针色）外部佐证记账、非产品可发面 · 任务 1.17 承接（文字面形态调整见裁决 #24——钢笔形替换任务 1.21 紧随） |
| D35 | 按钮深灰异类（全局组件面；2026-10-10 用户实机报障「有些按钮是深灰色的，例如悬浮面板的扩大按钮，跟本应用的风格不搭，对齐 DSH」——源码核验属实 + 用户明令全量排查） | 产品 9 处 Button `variant="toolbar"`（6 文件：DispatchPanel 折叠钮/EntryDrawer/KnowledgeToolbar/sticky-bar/弹窗 drawer ×4/list-view）——填充 `--dsw-alias-button-tool-bar-fill: #54555780` 半透明深灰片；**原生 dsh 官方包该变体使用 0 次**（ghost 7 / primary 32 / outline 45 正则计数——官方图标钮语言 = ghost 透明底 + hover 浅底） | **清零 + 全量排查**：9 处逐位换官方对照形（图标钮 = ghost / 带边框动作钮 = outline，逐位记账）；产品自绘 button CSS 全量过检（深灰/实底/裸值异类清零——机械 + 双主题走查双通道，台账零未记账项）· SC-8 扩展（任务 1.22 承接） |

## Proposed Solution

八项修补整批立项为 **M3.1 UI 对齐轮**（P1.1「里程碑化收口 + 双层验收」机制沿袭；条目与差异清单 D1–D30 对位，完整目标形态以**纠正版原型**（109 断言）为准）：

1. **左栏三残差收口**（D1–D3）：竖线恢复 + WCO 圆角移除；收起 = rail 图标列常驻（按原型裁决，偏离官方 WCO 双圆钮补偿面——记账）；项目行仅名称 + 悬停提示（偏离官方 Rows meta 次行——记账）。左栏其余面经官方壳源码复核**已官方承载**（D4 记账，零实现）。
2. **概览 tab 卡片语言复刻**（D12–D20、D29）：灰底内容区 + 边框圆角浮卡 + bg-3 meta 块 + 顶分隔线；彩色胶囊 chips（五态/七态/阶段，激活着色）；下划线子 tab；提案 mode chip/摘要独行/两列元数据/文档区/行头「打开新会话」；feature 阶段 chips + 分层文档；taskbar 形态（视图下拉 = 容器 pill 同行右侧/七态胶囊次行独占/全终态派发深灰置灰/突击计数注收 pill 悬停）；ov-head 同位翻转钮；三视图卡片语言 + **DAG 节点名称两行完整展示**（190×72 刻度对齐 + 超长悬停兜底，D29）——**建立在 blitz 1.3 填充形态上**；颜色一律 `--dsw-*` 令牌最近语义映射（裸值不直入；dsw-raw 结构刻度豁免注记）。
3. **任务详情：抽屉 → 可拖动弹窗**（D21–D23）：全窗口自由拖动（标题栏拖移）+ 左右缘拖宽（320–760 沿袭）；单例（切任务原位换内容）；Esc/✕；默认起始位（不记忆）；**简要 440 ↔ 完整 720 双形态**（完整 = 现状条 + kv 六项 + 八段 + gate 检查项 + 覆盖率条 + verb 分色时间线 + 双源会话 pill 跳转 + 分块折叠 + 参考文档点开 dock 文档 tab）；挂载独立于 dock 概览 tab；四路打开来源（任务行 / DAG 节点 / 泳道卡 / 悬浮面板）。
4. **派发任务悬浮面板**（D5–D6，会话头 pill 退役、槽位卸载）：仅本会话派发（link 源）；默认 = 对话区域内部、工具栏之下右上角；dock 展开自动左移；可拖动（拖后停自动锚定）+ ▁ 折叠 ⟡N 角标；**行点击 = 就地打开任务详情弹窗——零会话跳转、零 dock 强开**；**行尾 ⟞ = 打开 worker 执行子会话 + 树零联动**；写推送实时刷新（subscribeTasksChanged 既有机制）；两残差收口见 D33（默认锚位真盒修复 + 状态标签同色，任务 1.18）；三残差续接见 D34（加宽 + 悬浮球可拖 + 领取时间倒序/进行中置顶，任务 1.20）。
5. **Forge设置收口**（D24–D26）：Provider/Model 原生 select → **官方 Menu 件**；选项值从「设置>模型」装载（在途 blitz 1.2 结果性承接核对）；成组核对（1.1 承接）；未配置 ⚠ + 保存反馈；注释三处清理 + 硬规则（正式 UI 零过程注释文案）。
6. **对照走查项归档**（D7–D9、D11）：知识召回 tab / hero 面板 / 知识面板 / dock 开始页——总纲冻结形态既有对照走查，残差走查归档驱动（不新增裁决）。
7. **双层验收机制**（P1.1 制度沿袭）：每项修补 = 机械面断言（单测/e2e 锚迁移**零弱化**，锚点对照台账）+ 证据面（实机走查对照纠正版原型截图归档）；批末用户按差异清单 D1–D44 逐行打勾签字。
8. **悬浮提示官方件对齐 + 光标可辨性缓解 + 按钮风格对齐**（D30、D32、D35，全局组件/壳面）：自绘面原生 `title=` 悬浮提示清零 → 官方 `Tooltip` 件（深色气泡/键盘聚焦双通道/视口自适应翻转/portal 逃逸裁剪）——与 D1–D3 同族「对齐原生 dsh」裁决（原型 title 为静态 mock 占位，非冻结形态）；随退役面（SessionTaskPills 等）不重复包裹。D32 = 分隔线 handle 与会话消息文字单色光标 → 自定义高对比色图光标（OS 渲染缺陷产品侧缓解，任务 1.17 + 钢笔形 1.21）。D35 = 深灰 toolbar 异类按钮清零 + 全量按钮风格排查（任务 1.22）。

### Innovation Highlights

无行业创新——本批价值在于把「用户肉眼发现、机械面看不见」的视觉偏差类**固化为可回归的对照走查 + 锚点迁移台账**（P1.1 几何断言思路的延续），其余为标准样式对齐与交互形态升级工作。诚实说明：悬浮面板与可拖弹窗均为常规 UI 模式（官方 primitives 无对应件，自绘但守令牌纪律）。

## Requirements Analysis

### Key Scenarios

| # | 场景（走查人视角） | 载体项 |
|---|---|---|
| 1 | 打开概览 tab：灰底 + 卡片化父行 + 彩色 chips + 下划线子 tab——与原型截图并排对照「同一张脸」 | 概览样式对齐 |
| 2 | 左栏：竖线分隔在场；收起 = rail 图标列常驻（官方件图标）；项目行仅名称（悬停见路径）；插件/知识库行在场 | 左栏三残差（D1–D3） |
| 3 | 知识库面板 / 文档 tab / 会话轨迹·召回 tab / hero / dock 开始页：对照总纲冻结形态走查项逐项过（残差归档） | 对照走查项（D7–D9、D11） |
| 4 | 设置 → Forge设置：Provider/Model = 官方 Menu 下拉形态走查；选项值 =「设置>模型」目录（1.2 结果核对）；底注残留零在场 | Forge设置收口 + 注释清理 |
| 5 | 任务行/DAG 节点/泳道卡/悬浮面板点击 → 弹窗打开；⤢ 简要 440 ↔ 完整 720 往返；拖标题栏全窗移动；拖缘调宽；Esc 关闭；重开回默认简要 | 任务详情弹窗（双形态） |
| 6 | 派发会话中发 `/run-tasks` → 对话内工具栏下右上角浮现悬浮面板，任务状态实时变化；点任务 → 弹窗就地打开（不跳会话不切 dock）；行尾 ⟞ → worker 子会话（树零联动）；折叠成角标再展开 | 悬浮面板 |
| 回归 | 既有功能面全量（三视图/诊断/派发/裁决对话框/设置/知识链路）不弱化 | 全项共担 |

### Non-Functional Requirements

- 令牌唯一纪律全程适用（lint-tokens 机械执行；原型裸值 → 语义令牌映射表入设计文档）。
- 数据面零变化：SC2 直读纪律、单库查询纪律、写推送刷新契约全部不动（纯呈现层改造）。
- 亮/暗双主题走查（原型双主题口径）。
- 性能无回退：弹窗/面板交互不引入重排热点；e2e 时长不劣于 M3 基线。

### Constraints & Dependencies

- **在途任务避让**：blitz 提案 `forge-settings-overview-ui-fixes` 三任务同区域在途（1.1/1.3 in_progress、1.2 pending）——概览样式对齐**建立在 1.3「内容填充整 tab」落地后的形态上**（本提案不重裁概览宽度）；注释清理的 FUTURE_NOTE 与 1.2 同文件（`ForgeSettingsSection.tsx`），执行序后置或协调。
- 上游 pin 0.2.0-rc.2 不动；官方 WCO 补偿面偏离（去圆角）显式记账。
- 抽屉→弹窗牵动面：drawer 组件族（657 行本体 + 类型模板 + 时间线 + 测试）+ 三视图接线 + dock 装配 + e2e 锚——受控面契约（taskId props）不动，仅换壳。

## Alternatives & Industry Benchmarking

### Industry Solutions

视觉对齐业内主流 = 设计令牌映射 + 原型对照走查（design QA）；抽屉→浮窗 = 常见 modal/draggable window 模式（VS Code floating editor / Figma panels）；会话内任务监控 = IDE 状态浮窗模式（测试运行指示器）。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing（样式债滚入 M4） | — | 零投入 | 自举 dogfood 脸面受损；每轮走查信噪比被样式噪声稀释；P1.1 教训（债不收口滚大） | Rejected: 用户已判「差别很大」 |
| 散装 fix 任务逐个跑 | 本仓惯例 | 零流程成本 | 无统一验收口径；样式对齐是系统性改造非孤立缺陷 | Rejected: P1.1 同裁先例 |
| 只改最大观感差（卡片化 + 彩色 chips） | 最小改动面 | 体量小 | 子 tab/meta 块/任务详情等残差仍在，「差别很大」收不干净 | Rejected: 用户裁决逐项复刻 |
| 并入 M3.5 提案作一节 | 里程碑搭载 | 单提案管理 | 主题混淆（M3.5 = 知识沉淀）+ 同文件并发冲突 | Rejected: 里程碑主题纯度 |
| **M3.1 独立收口轮 + 双层验收 + 断言零弱化台账** | 本提案 | 系统性对齐一次收口；验收制度化；后续里程碑基线干净 | 新增里程碑流程成本（~0.5 天） | **Selected: 用户 2026-10-09 brainstorm 全部显式裁决（见下表）** |

## Feasibility Assessment

### Technical Feasibility

- 样式对齐 = 纯 CSS/类名改造 + 既有组件结构（零数据面风险）；令牌映射有 M3 六色映射先例。
- 弹窗 = 受控面契约不动换壳（fixed 定位 + pointer 拖移 + 既有宽度档机制迁移）；官方 primitives 无 draggable modal 件，自绘拖移头（令牌纪律内）。
- 悬浮面板 = 既有 `useSessionTaskPills` 数据装载（link 源过滤）+ 既有订阅刷新；落位（对话区容器锚定 vs shell overlay）设计期定。
- 竖线 = 产品 CSS 一条规则 + WCO 圆角对冲，机制已勘明（官方 layout 样式源码核实）。

### Resource & Timeline

单人估 **8–10 工作日**（回写修订：左栏面经官方壳核对收窄为三残差 ~0.5d，概览/弹窗/面板/下拉主体不变）：概览卡片语言复刻（含 taskbar/ov-head/三视图）2.5–3.5d；弹窗改造（双形态 + 测试锚迁移）1.5–2d；悬浮面板（含 ⟞/树零联动）1–1.5d；左栏三残差 + Forge设置（Menu 下拉）+ 注释清理 1–1.5d；对照走查项归档 + 断言收口 1–1.5d。体量约为 P1.1 的两倍（样式面从概览扩到全工作台）。

### Dependency Readiness

**纠正版原型**（109 断言 + 零页面错误，17 轮用户实审收敛）与实现（全量单测 + e2e 池）均在库；官方 layout/sidebar/dockkit/primitives 样式源码已核实（差异清单 D4/D10/D18/D21 记账面即来自该核对）；无外部依赖。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|--------|
| 「实现的结构刻度注记（tree-row 行语言）= 原型形态」 | 事实核对（原型 styles.css vs overview.css 逐项对照） | **Overturned**：原型是卡片语言（边框浮卡 + 彩色胶囊 + 下划线子 tab），tree-row 是实现期自选的偏离——用户裁决逐项复刻原型 |
| 「任务详情抽屉（M2 定稿形态）继续沿袭」 | 用户裁决（2026-10-09） | **Overturned**：改可拖动弹窗（全窗拖 + 缘宽可调 + 不记忆位置） |
| 「会话头 pill 槽位（M2 4.2 交付）是挂接展示的正位」 | Need Gate（对话上方占位 vs 对话内浮窗） | **Overturned**：改对话内右上角悬浮面板；仅派发源；点击开弹窗零跳转；pill 槽位退役 |
| 「WCO 形态去竖线（官方补偿面）应顺从」 | Assumption Flip（原生 dsh 主形态 = 带竖线） | **Overturned**：用户裁决恢复竖线 + 去圆角（官方补偿面显式偏离，记账） |
| 「ui-design 的『未来注记文案锚点』应保留在正式界面」 | 纪律核对（ui-design 自身「界面说明最小化」） | **Overturned**：清理三处 + 全局硬规则（零过程注释文案） |
| 「悬浮面板应展示全部挂接（派发 + 执行双源）」 | Need Gate（dispatcher 视角的真实需要） | **Refined（用户裁决）**：仅派发（link 源）——执行源归 worker 会话与任务详情时间线 |
| 「本轮范围 = 概览 tab（用户点名项）」 | Need Gate / 范围裁决（2026-10-09 二轮） | **Overridden（用户裁决扩面）**：扩到全工作台（左栏/知识库面板/文档 tab/会话面板/Forge设置），双原型对照清单驱动——`Challenge Override: user chose to proceed. Reason: 左栏与 forge 设置同病，一次收口` |
| 「官方 WCO 收起语义（rail 隐藏 + 标题栏双圆钮）应顺从」 | 原型评审（R4/R6 轮实审定稿） | **Overturned**：收起 = rail 图标列常驻（官方件图标）——偏离官方 WCO 补偿面，与竖线同为「原生带线形态」偏离族，记账 |
| 「官方 Rows 项目行 meta 次行（canonicalPath 常驻）应保留」 | 原型评审（R16 轮用户裁决） | **Overturned**：项目行仅名称，路径转悬停提示——偏离官方 Rows，记账（原 Evidence #2「次行 meta 缺失」方向就此翻转） |

## Scope

### In Scope

（编号对应差异清单 D1–D44；「零差异（记账）」行不产生实现项）

1. **左栏三残差**（D1–D3 + D31 + D39–D42 + D45 追加族）：竖线恢复（1px 官方边框令牌 + WCO 圆角移除）+ **竖线上延至窗口顶点**（D31：标题栏带内缺失段补齐，任务 1.16）+ **dock 余缝同色**（D39：WCO rightbarCol bg-base 对冲，任务 1.26）+ **展开态收起钮 brand 同行右侧**（D40，任务 1.27）+ **项目列表默认可见性**（D41：归档默认隐藏 + 会话 24h 窗口，任务 1.28）+ **会话行 hover 动作钮**（D42，任务 1.29）+ **会话行悬浮三钮 + ⋯ 菜单**（D45：⋯/归档/置顶三钮 + 置顶/归档/改名/分叉官方面接线，任务 1.32）；WCO 收起形态 = rail 图标列常驻（官方件图标，偏离补偿面记账）；项目行裁除路径次行（仅名称 + 悬停提示，偏离官方 Rows 记账）。亮/暗双主题验证。
2. **概览 tab 卡片语言复刻**（D12–D20、D29 + D36 微调六项 + D37 自释钮 tooltip 清零，建立在 blitz 1.3 填充形态上）：灰底内容区 + 边框浮卡 + bg-3 meta 块；彩色胶囊 chips（五态/七态/阶段）；下划线子 tab；提案 mode chip/摘要独行/两列元数据/文档区/行头「打开新会话」；feature 阶段 chips + 分层文档；taskbar 形态（视图下拉同行右侧/七态胶囊次行/全终态派发置灰/计数注收悬停）；三视图卡片语言 + DAG 节点名称两行完整展示（190×72 + 超长悬停兜底）；ov-head 同位翻转钮；**D36：chips→首卡/视图顶距减半 ×2 + 列表行距收紧 + 泳道列头等高 + 视图钮零 Tooltip + 行卡悬停非字面复读（任务 1.23）**；**D37：自释功能钮（展开/派发/状态筛选三族 + ✕/⋯/清除/排序同族）tooltip 清零 + 全量排查台账（任务 1.24）**——令牌映射表 + dsw-raw 结构刻度豁免注记随设计文档。
3. **任务详情弹窗**（D21–D23）：抽屉退役 → 可拖动弹窗（全窗拖 + 缘宽 320–760 + 单例 + Esc/✕ + 默认起始位不记忆）；**简要 440 ↔ 完整 720 双形态**（八段/kv 六项/gate 检查项/覆盖率条/verb 分色时间线/双源会话 pill 跳转/分块折叠/参考文档点开 dock 文档 tab）；四路打开来源 + 挂载独立于 dock；抽屉既有内容面全量平移。
4. **派发任务悬浮面板**（D5–D6 + D33/D34 残差）：`conversation.session.header.actions` 槽位卸载（pill 退役）；仅 link 源；对话列内工具栏下右上角 + dock 展开自动左移；可拖 + 折叠角标；行点击 = 弹窗零跳转；行尾 ⟞ = worker 子会话 + 树零联动；subscribeTasksChanged 实时刷新；D33 两残差 = 默认锚位真盒修复（右上角落位）+ 状态标签与任务子 tab 同色（taskStatusTagTone 单源，任务 1.18）；D34 三残差 = 加宽至 400 + 悬浮球可拖（几何连续）+ in_progress 置顶/领取时间倒序（claimedAt 读面加性字段——行会纪律唯一例外，任务 1.20）。
5. **Forge设置收口**（D24–D26）：Provider/Model 原生 select → 官方 Menu 件；选项源 = 「设置>模型」目录 + 成组（在途 blitz 1.2/1.1 承接核对）；未配置 ⚠ + 保存反馈；FUTURE_NOTE/目录脚注/计数注三处清理 + 「零过程注释文案」硬规则入 ui-design。
6. **对照走查项归档**（D7–D9、D11）：知识召回 tab/hero 面板/知识面板/dock 开始页——总纲冻结形态既有对照走查（残差走查归档驱动，不新增裁决）。
7. **双层验收机制**：锚点迁移对照台账（断言零弱化硬条款）+ 实机走查对照原型截图归档 + 批末用户签字；差异清单 D1–D44 逐行打勾收口。
8. **悬浮提示官方件对齐 + 光标可辨性缓解 + 按钮风格对齐**（D30、D32、D35）：原生 `title=` 黑框退役 → 官方 `Tooltip` 件（~35 真提示位；悬停/聚焦双通道 + portal 逃逸；EmptyState 标题 prop 等非提示位排除记账）；D32 = 分隔线 handle / 会话消息文字两表面自定义高对比色图光标（OS 单色光标渲染缺陷产品侧缓解；双主题两套 + 降级链；任务 1.17 + 钢笔形 1.21）；D35 = 深灰 toolbar 异类按钮清零（9 处换 ghost/outline 官方对照形）+ 全量按钮风格排查台账（任务 1.22）。

### Out of Scope

- 功能/数据语义变化（任务/提案/feature 管线、RPC 契约、写推送协议零变化——纯呈现层轮）。
- 设置对话框**非 Forge设置分区**的官方分区样式（通用设置/模型/插件等官方自持面不动）；设置对话框两处功能修复（成组 / Provider 目录装载**机制**）归在途 blitz 任务承接——本轮只做样式收口与结果核对。
- 会话头官方动作带其它占用者（官方 headerActions 非产品槽不动）。
- 上游依赖升级（0.2.0-rc.2 pin 不动）；多窗口 / 拆分面板（总纲既定 Out of Scope 沿袭）。
- M3.75 追溯矩阵、worktree 族等既定顺延项。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 抽屉→弹窗牵动面大（组件族 + 三视图接线 + dock 装配 + 海量测试锚），迁移引入回归 | M | H | 受控面契约（taskId props）不动仅换壳；锚点对照台账逐条迁移；「断言零弱化」SC 硬条款（P1.1 先例） |
| 悬浮面板无官方对应件（自绘浮层）——对话区锚定与 composer/滚动层冲突 | M | M | 落位设计期二选一（对话区容器锚 vs shell overlay 锚定中区）；pointer-events 与层序按 brand.css 覆层先例；e2e 断言面板不截官方命中面 |
| 原型裸值（12.5px/彩色十六进制）与令牌唯一纪律冲突面广 | M | M | 映射表设计期定稿（M3 六色映射先例）；结构刻度 dsw-raw 豁免注记；lint-tokens 全程机械执行 |
| 与在途 blitz 任务同文件并发（1.2 FUTURE_NOTE 同文件 / 1.3 概览形态前置） | M | M | 执行序协调：样式对齐建立在 1.3 之后；注释清理后置于 1.2；提交只含本提案范围文件 |
| WCO 去圆角 = 官方补偿面显式偏离，上游升级漂移 | L | L | 偏离记账入设计文档；升级适配任务策略沿袭（显式对账） |
| 走查终验带宽（样式逐项对照 + 交互三改 + 回归全量） | M | M | 每项走查截图先行归档（机械面预筛）；原型并排对照清单逐项打勾 |

## Success Criteria

- [ ] SC-1 左栏三残差（D1–D3 + D31 + D40）：竖线在场（几何断言）+ 圆角移除 + **竖线自窗口顶点 y=0 连续贯穿至底**（D31 带内段，任务 1.16）+ **展开态收起钮 = brand 同行右侧**（D40，任务 1.27）；WCO 收起 = rail 图标列常驻（图标件断言）；项目行零路径次行 + 悬停提示在场（DOM 断言）；亮/暗双主题走查通过；两处官方偏离（WCO 补偿面 / Rows meta）记账入设计文档。
- [ ] SC-2 任务详情弹窗（D21–D23 + D43）：四路打开来源可用；全窗拖动 + 缘宽 320–760；单例切任务原位换内容；Esc/✕；重开回默认位（无记忆断言）；**简要 440 ↔ 完整 720 双形态往返**（八段/kv 六项/gate 检查项/覆盖率条/双源会话 pill 跳转断言）；对话中直接打开（不依赖概览 tab，e2e 断言）；**顶/底高度收紧（D43：标题栏 ~30px + 上下内距收档——任务 1.30）**。
- [ ] SC-3 悬浮面板（D5–D6 + D33/D34）：会话头槽位零产品 pill（槽位卸载断言）；仅 link 源；默认对话列内工具栏下右上角 + **真 DOM 几何断言（display:contents 断锚修复——面板右缘贴对话面板右上角，非视口左缘钉位）**；dock 展开自动左移（几何断言）；可拖 + 折叠角标往返 + **角标本体可拖（拖后停自动锚定、展开几何连续断言）**；面板宽 = 400 新刻度（> 324 断言）；**行序 = in_progress 置顶 + claimedAt 倒序（最早领取最下——纯函数断言 + 写推送重排）**；行点击 = 弹窗且零会话跳转/零 dock 强开（e2e）；⟞ = worker 子会话 + 树零联动（父会话保持高亮断言）；写推送 ≤500ms 刷新；状态标签 tone 与任务子 tab 单源一致（taskStatusTagTone 断言）。
- [ ] SC-4 概览卡片语言（D12–D20、D29 + D36 微调 + D37 + D38 + D44）：与纠正版原型并排截图对照逐项通过（浮卡/彩色胶囊 chips/下划线子 tab/mode chip/meta 块/分层文档/taskbar 形态/ov-head 同位钮/DAG 节点名称两行完整展示）；**D36 微调六项（chips→首卡/视图顶距减半 ×2、行距收紧、泳道列头等高、视图钮零 Tooltip、行卡悬停非字面复读）**；**D37 自释功能钮 tooltip 清零（展开/派发/状态筛选三族点名 + 同族 ✕/⋯/清除/排序）+ 全量排查台账（断言更替非删除）**；**D38 清过滤钮「✕ 重置」三族改词 + 间距拉开**；**D44 三族状态 chips 固定统一宽 + 居中收紧（同值零漂移断言）**；lint-tokens 零违例；建立在 blitz 1.3 填充形态上。
- [ ] SC-5 注释清理（D26）：三处残留零在场（字符串级断言 + 走查）；「零过程注释文案」硬规则入 ui-design 纪律段（文档断言）。
- [ ] SC-6 Forge设置（D24–D25）：Provider/Model = 官方 Menu 件形态（触发钮/卡/项刻度走查）；选项值与「设置>模型」目录一致（结果性断言——在途 blitz 1.2 承接核对或本轮补齐）；成组核对（1.1 承接）。
- [ ] SC-7 质量门：tsc + lint + vitest 全量 + e2e 池全绿；锚点迁移对照台账在场且断言计数不减（零弱化）。
- [ ] SC-8 人工终验：用户按差异清单 D1–D45 逐行打勾（含 D7–D9/D11 对照走查项归档：知识召回/hero/知识面板/dock 开始页；D30 悬浮提示官方气泡逐面走查；D32 两表面光标亮/暗可辨走查；D35 全量按钮风格台账 + 深灰异类清零走查；D37 自释钮零气泡 + 保留面气泡正常走查；D38「✕ 重置」三族文案走查；D39 dock 余缝同色双主题走查；D41 归档默认隐藏 + 24h 会话窗口走查；D42 会话行 hover 动作钮走查；D43 弹窗顶/底收紧走查；D44 三族 chips 等长走查；D45 会话行悬浮三钮 + ⋯ 菜单（置顶/归档/改名/分叉全动作 + 确认模态）走查）+ 场景表实机签字通过。

consistency_check_result:
  status: pass
  pairs_checked: 16
  conflicts_found: 0
  （SC-1↔InScope-1/D1–D3+D31+D40 / SC-2↔InScope-3/D21–D23+D43 / SC-3↔InScope-4/D5–D6+D33+D34 / SC-4↔InScope-2/D12–D20+D29+D36+D37+D38+D44 / SC-5↔InScope-5/D26 / SC-6↔InScope-5/D24–D25 + blitz 1.1/1.2 承接记账（双做已显式避免）/ SC-7·SC-8↔InScope-6·7 双向覆盖；差异清单 D1–D44 与 InScope-1–8 逐区映射、零孤儿行（D4/D10 零差异记账行、D7–D9/D11 走查项归 SC-8 收口、D29 追加行 2026-10-09 实机报障核验后映射 InScope-2/SC-4/任务 1.14、D30 追加行同日报障核验后映射 InScope-8/SC-8/任务 1.15、D31 追加行 2026-10-10 报障源码核验后映射 InScope-1/SC-1/任务 1.16、D32 追加行同日报障核验（源码 + 外部佐证）后映射 InScope-8/SC-8/任务 1.17 + 裁决 #24 再裁决（文字面钢笔形）续接任务 1.21、D33 追加行同日报障源码核验（display:contents 零盒断锚 + Tag tone 硬编码）后映射 InScope-4/SC-3/任务 1.18、D34 追加行同日用户追加裁决（加宽/悬浮球可拖/领取时间倒序）后映射 InScope-4/SC-3/任务 1.20——含行会纪律唯一例外修订（claimedAt 读面加性字段）显式记账）、D35 追加行 2026-10-10 报障源码核验（toolbar 变体原生 0 使用 + 产品 9 处）后映射 InScope-8/SC-8/任务 1.22、D36 追加行 2026-10-10 用户追加裁决（微调六项——间距减半 ×2/行距/泳道等高/视图钮 tooltip/悬停有意义化）后映射 InScope-2/SC-4/任务 1.23、D37 追加行 2026-10-10 用户追加裁决（自释功能钮 tooltip 清零 + 全面排查）后映射 InScope-2/SC-4/任务 1.24——ViewDropdown 位归 1.23 ⑤ 已载显式避双做、D38 追加行 2026-10-10 用户裁决（预览四案后自定「重置」+ 间距拉开）后映射 InScope-2/SC-4/任务 1.25、D39–D42 追加行 2026-10-10 用户追加裁决（侧栏/dock 形态批——dock 余缝同色 D39/展开态收起钮 D40/项目列表默认可见性 D41/会话行 hover 钮 D42，显式拆分四任务）后映射 InScope-1/SC-1·SC-8/任务 1.26–1.29、D43 追加行 2026-10-10 用户追加裁决（弹窗顶/底高度收紧）后映射 InScope-3/SC-2/任务 1.30、D44 追加行 2026-10-10 用户追加裁决（三族状态 chips 等长收紧）后映射 InScope-2/SC-4/任务 1.31）；宽度面归属在途 blitz 1.3、Provider 目录归属 blitz 1.2 均显式记账，无互相矛盾条款）

## Next Steps

- 任务直接挂接本提案（**blitz 线**，2026-10-09 用户裁决）：差异清单 D1–D28 驱动的 13 项任务已建（acceptance criteria 即各差异行断言）；用户接受后经 `/run-tasks` 直接派发——无 feature 阶段、无 PRD/设计门（规格既已由本提案 + 纠正版原型 17 轮实审前置完成）。

## 附：用户裁决记录（2026-10-09 brainstorm #1–10 + 纠正版原型 17 轮实审 #11–21）

| # | 裁决点 | 结论 |
|---|---|---|
| 1 | 悬浮面板点击行为 | 打开任务详情弹窗（就地），不跳会话不切 dock |
| 2 | 悬浮面板数据面 | 仅派发任务（link 源） |
| 3 | 弹窗拖动形态 | 全窗口自由拖 + 缘宽可调；**关闭后不记忆位置**（每次默认起始位） |
| 4 | 左栏分隔形态 | 恢复竖线（1px 官方边框令牌）+ 去 WCO 中区圆角 |
| 5 | 样式对齐口径 | 逐项复刻原型 + 令牌最近语义映射（裸值不直入） |
| 6 | 注释清理范围 | 清理三处 + 全局硬规则（零过程注释文案） |
| 7 | 批次形态 | M3.1 独立收口轮（P1.1 先例；未再单独问询，无异议默认） |
| 8 | 范围扩面（二轮） | 全工作台对齐（左栏/知识库面板/文档 tab/会话面板/Forge设置入轮）——`Challenge Override: 左栏与 forge 设置同病，一次收口` |
| 9 | 左栏基线 | **对齐原生 dsh**（收起形态/项目树行语言等），非总纲原型；差异静态核对先行（见 Evidence #2） |
| 10 | Forge设置 | 样式调整入轮；Provider 选项值从「设置>模型」获取（在途 blitz 1.2 结果性承接核对） |
| 11 | 弹窗双形态（原型三轮） | **简要 440 ↔ 完整 720**（⤢/⤡ 翻转）；重开回默认简要（不记忆展开态） |
| 12 | 悬浮面板细节（原型三/六轮） | ▁ 折叠成 ⟡N 角标可再展开；行尾 **⟞ = 打开 worker 执行子会话**；**树零联动**（worker 打开时父会话保持高亮、树不重排） |
| 13 | 任务视图下拉位置（原型九轮） | 视图下拉 = 容器（slug）切换 pill **同行右侧**；七态 chips 独占次行 |
| 14 | 概览基本信息（原型十一轮） | 展开与收起 = **同一枚按钮同位翻转**（名称行内；底部右对齐收起钮退役） |
| 15 | 官方件替换（原型十/十二轮） | 同功能按钮一律官方 `dsh-client-ui-primitives` 原路径件（PanelLeft/Search/NewChat/SlidersTwo/PluginPinwheel/ProjectAdd/Settings/Ellipsis/Close/ChevronDown/RightUp/WarningTriangle/Check）；项目树行刻度逐值复刻官方 Rows |
| 16 | dock 选中 chip（原型十三轮） | = 官方 dockkit `.tabActive` **markdown-tag 灰底 + 主文字**（非近黑实底；产品 dock = 官方件自带，零差异记账） |
| 17 | 会话头零挂件（原型十三轮） | 会话头「运行中」pill 退役（运行态由状态点/悬浮面板表达） |
| 18 | 新会话钮（原型十四轮） | = 官方 SidebarRoot `.newSession` 刻度（h38/elevated 白卡/居中/NewChat 图标；产品 = 官方壳自带，零差异记账） |
| 19 | Forge设置下拉（原型十五轮） | Provider/Model = **官方 Menu 件**（MenuSurface 半透卡 + trailing Check；原生 select 退役） |
| 20 | 项目行仅名称（原型十六轮） | 项目列表/树项目行**零路径次行**；canonicalPath 转悬停提示（偏离官方 Rows，记账） |
| 21 | 插件行（原型十七轮） | 新会话之下补**插件**行 = 官方 panelList 同位（panelRow 刻度 + PluginPinwheel；产品 = 官方 plugin-manager 自带，零差异记账） |
| 22 | DAG 节点名称完整展示（2026-10-09 实机报障核验） | 节点刻度对齐原型 **190×72** + 标题**两行换行**（12px/17px + line-clamp 2 ≈ 28 字）；超长标题悬停全名兜底——产品 170×64 单行 ellipsis（≈12 字/行）为实现期自选偏离，非原型语义 |
| 23 | 悬浮提示对齐官方件（2026-10-09 用户实机报障「黑色方框+文字太丑」） | 自绘面原生 `title=` 黑框退役 → 官方 `dsh-client-ui-primitives` `Tooltip` 件（悬停/键盘聚焦双通道 + 深色气泡 + 视口自适应翻转 + portal 逃逸）——原型 title 为静态 mock 占位，非冻结裁决面（同 D1–D3「对齐原生 dsh」族） |
| 24 | 文字面光标形态（2026-10-10 再裁决——调整任务 1.17 文字面） | 光标悬浮在文字上方 = **钢笔形**——本地（Windows 原生墨迹钢笔）风格造型 + 高对比色差着色/描边（亮/暗两套），替换原 IBeam 形方案；分隔线 col-resize 面不受本裁决波及 |
| 25 | 按钮风格对齐（2026-10-10 用户实机报障） | 深灰异类按钮清零 + **全量排查所有风格不一致按钮**——对齐 DSH 官方 Button 形（图标钮 ghost / 动作钮 outline），机械 + 走查双通道台账（任务 1.22） |
| 26 | 概览内容面微调六项（2026-10-10 用户追加裁决） | ① 提案/feature 首卡贴 chips 间距减半；② 列表行距收紧；③ 泳道列头空/非空等高；④ 任务列表/泳道贴 chips 间距减半；⑤ 视图切换控件零 tooltip；⑥ 任务悬停携非可见信息、零字面复读（任务 1.23） |
| 27 | 自释功能钮 tooltip（2026-10-10 用户追加裁决） | 展开族/派发钮/状态筛选 chips 等**功能直观按钮零 tooltip** + 概览 tab 全面排查——规则 = 控件自释即退役、增量信息承载保留记账（任务 1.24；视图切换钮位归 #26-⑤ 已载） |
| 28 | 清过滤钮改词（2026-10-10 用户裁决——预览四案后自定） | 「✕ 清过滤」→「**✕ 重置**」（裸词）三族 chips 同步 + 与相邻 chip 拉开间距（钮前 > 行内 chip 间距）（任务 1.25） |
| 29 | 侧栏/dock 形态批（2026-10-10 用户追加裁决——五点拆四任务） | ① dock 上下余缝与中区同色（D39/1.26）；② 展开态收起钮 = brand 同行右侧（D40/1.27）；③ 归档项目默认隐藏（D41-①/1.28）；④ 会话默认展示最近 24h、其余折叠（D41-②/1.28）；⑤ 会话行 hover 显动作钮对齐 dsh（D42/1.29） |
| 30 | 任务详情弹窗顶/底高度（2026-10-10 用户追加裁决） | 标题栏 min-height 38 → ~30px + 上下内距各收一档（值执行期定）；拖移手柄全栏可用保持（任务 1.30） |
| 31 | 状态筛选 chips 等长（2026-10-10 用户追加裁决） | 三族（七态/五态/阶段）固定统一宽 + 居中 + padding 收窄——「长度要一样，并且长度小一些」（任务 1.31） |
| 32 | 会话行悬浮三钮（2026-10-10 用户再追加裁决） | ①悬浮行尾三钮依次 = ⋯ / 归档会话 / 置顶会话；⋯ 菜单含其它更多功能项（置顶/重命名/分叉会话/归档——官方 ui-workspace session-actions 官方面新核实可达，D42「零 RPC 支撑」旧判翻案）；置顶/归档 registry 集镜像入账本窄面；②（同日再追加）**按钮浮现在会话上方，不挤占会话的行空间**——动作组绝对定位浮现 overlay 零布局占位 + 背板 = 行悬浮合成色（任务 1.32） |
