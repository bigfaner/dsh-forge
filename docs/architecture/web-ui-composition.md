# dsh-forge Web UI 组建逻辑（组件级架构）

> 位置：docs/architecture/web-ui-composition.md · 基准：2026-10-04（fix-25 官方基座降位 + fix-29 官方轨迹直用后 HEAD）
> 代码路径基准：除特别标注外，文内相对路径均相对 `apps/web/src/`；宿主侧标注 `apps/host/`。
> 维护约定：**改装配结构/槽位/官方件选型时同步本文档**；各模块细粒度约定见模块同目录 README。
> 本文回答两个问题：界面用了哪些 dsh 官方件？整棵组件树怎么组装出来的？

## 0. 一句话心智模型

dsh-forge 不是「仿 dsh 的自研界面」，而是**官方壳的另一个占用者**：与官方桌面共用同一壳内核、同一组件库、同一套 `--dsw-*` 令牌。fix-25 后占用方式收束为**官方缝登记**——产品的每一块界面都登记在官方槽位/名册上，由官方基座渲染；仅官方无对应件处自绘领域组件（行语言对齐官方）。影子里程只剩三处 single 槽内容替换（左栏浏览区 + 品牌行两内容洞 + hero 工作区控件），`main.conversation` 整面影子已退役。

两条硬纪律贯穿：**令牌唯一**（视觉全走官方令牌，lint 拦裸值；布局刻度走 dsw-raw 豁免注记制）+ **SC2 直读**（状态全部 RPC/官方快照源直读，零 watch、零快照回流、零全局 store）。

## 1. 五层分层图（自宿主进程到产品视图）

```
┌ L1 Electron 宿主层（apps/host/src/main.ts —— ~100 行纪律：宿主无业务）──────────────┐
│  单实例锁 · DSH_HOME 缺省隔离(fix-26) · profile 落地(packaged)                      │
│  bootDshHost【fix-1 child 形态：boot/run.ts 进程编排】                             │
│   ├─ spawn boot child（child.ts：ELECTRON_RUN_AS_NODE=1 --expose-internals——       │
│   │   loadProfileDirectory → overlay → runProfile → ready{url,injections,双服务}） │
│   ├─ bridge.ts 桥协议（ready/fatal/rpc-result；Map wire 编解码；                    │
│   │   typed error 过桥保真 fix-28；boot-chain.ts 实例统一 fix-20）                  │
│   └─ 主侧双服务代理（forgeProjects/forgeKnowledge 方法白名单 → IPC 面）             │
│  authenticateWebHost（authority cookie）→ web-document（dsh-forge://app/ scheme    │
│  服务壳 dist；非资产路由转发已认证 webserver；ws 改写）                              │
└──────────────────────────────────────────────────────────────────────────────┘
      ↓ 载入壳 dist
┌ L2 壳内核层（apps/web/src/main.ts）───────────────────────────────────────────┐
│  AppWebEntry【官方 dsh-client-web】壳入口本体（run 在 __DSH_BOOT_READY__ 门等待）  │
│  product-views.ts → __DSH_FORGE_VIEWS__（产品视图发布面，缺席 fail-loud）          │
│  shell/boot.ts bootShell（掌舵）：getBootManifest → installTransportCarrier       │
│   → applyIndexInjections【官方】（官方 ui-* bundles 按表序入页）                   │
│   → steerBootGraph（__DSH_BOOT__ 追加产品插件行）→ 放行就绪门                      │
└──────────────────────────────────────────────────────────────────────────────┘
      ↓ 模块系统 live
┌ L3 官方插件层（官方 ui-* 组合树——产品零实现全白拿）─────────────────────────────┐
│  AppFrame【官方 ui-layout】root 五子槽：                                          │
│   ├─ 官方 sidebar 壳【ui-sidebar】（收展/快捷键/新会话/设置/品牌行/panellist        │
│   │   + renderSlot('sidebar.workspaces') 洞）                                     │
│   ├─ main 面板 roster（keyed：官方会话面板缺省 null + 产品 'dswf-hero'/'dswf-     │
│   │   knowledge'；selectPanel/panelInfo 服务面）                                   │
│   ├─ 官方右栏【ui-sidebar-right】（官方 per-session 收展态；corner ExpandButton）  │
│   └─ shell.overlay（常驻覆盖层挂点）                                               │
│  会话面板 = ConversationRoot【官方 ui-conversation】：官方头部链（lineage 标题/     │
│  actions/utilities「打开方式」+「⋯」/corner 钮）+ 官方页签行 + 官方内容面            │
│  （chat 转录/composer/草稿；trajectory 官方轨迹表）——见 §3                        │
└──────────────────────────────────────────────────────────────────────────────┘
      ↑ 官方槽位/名册的消费缝
┌ L4 产品插件层（apps/web/src/client-plugin/ —— forge-client.js 自含 classic script）┐
│  forgeClientPlugin().apply：__DSH_FORGE_CLIENT__ 激活标记 → 取发布面组件 →        │
│  九缝登记（§2 名册；ctx.slots.inject 挂本插件 fiber，卸载级联回收）+                │
│  createWorkbenchBridge（nav 闭包绑定官方 layout.selectPanel）                     │
└──────────────────────────────────────────────────────────────────────────────┘
      ↑ 组件本体经 __DSH_FORGE_VIEWS__ 发布面递达（React 单例）
┌ L5 产品视图层（workbench/ views/ flows/ components/ rpc/）────────────────────┐
│  workbench/：ShellHost（shell.overlay 常驻宿主）+ HeroPanel/KnowledgePanel       │
│   （main keyed 全局面板）+ panel-model 纯函数 + workbench-bridge                 │
│  views/sidebar|session|knowledge/：左栏面板/召回页签/知识浏览（业务面）            │
│  flows/add-project/：两段式注册模态（官方 Modal 壳）· components/：领域无关小件    │
│  rpc/：window.dshForge.invoke 传输 + 三面 client（§9）                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. 产品九官方缝名册（client-plugin/plugin.ts = 唯一源）

九缝登记的全部实况（id/order/key/priority 与注入面逐项；与 plugin.ts 同源 pin）：

| # | 官方槽位 | 槽型与登记参数 | 占用组件 | 注入面 |
|---|---|---|---|---|
| 1 | `sidebar.workspaces` | single · priority **-100** 影子 | ForgeSidebarSlot | `sessions.list` / `workspaces.list` 快照源 + `openSession`（→ 官方 `uiWorkspace.openSession`） |
| 2 | `sidebar.brand.mark` | single · -100 影子 | ForgeBrandMark | ——（品牌图标内容；行本体归官方壳） |
| 3 | `sidebar.brand.name` | single · -100 影子 | ForgeBrandName | ——（品牌字标内容） |
| 4 | `main` | keyed · key `'dswf-hero'` | ForgeHeroPanel | ——（UF-2 零项目引导面板） |
| 5 | `main` | keyed · key `'dswf-knowledge'` | ForgeKnowledgePanel | `bridge`（抽屉目标缝——subscribe/getSnapshot/setDrawerEntry） |
| 6 | `sidebar.panellist` | list · id `'dswf-knowledge'` · order 20 · label 知识库 | ForgeKnowledgeGlyph | ——（官方 PanelRow 行语言；点击 = 官方 `layout.selectPanel`） |
| 7 | `conversation.view` | list · id `'dswf-recall'` · order 20 · label 知识召回 | ForgeRecallView | `openKnowledgeEntry`（→ 桥跳转：进知识面板 + 开抽屉） |
| 8 | `conversation.hero.workspace` | single · -100 影子（fix-24①） | ForgeHeroWorkspacePicker | ——（owner 契约面 open/anchorRef/selectedId/onPick/onClose 零变化；**不声明 children**） |
| 9 | `shell.overlay` | list · id `'dswf-host'` | ForgeShellHost | `selectPanel`（官方面板选择窄面）+ `rightbar`（官方右栏收展窄面） |

配套机制（同文件）：

- **依赖服务**：`inject = ['slots','sessions','uiWorkspace','workspaces','sidebarRight','layout']`（cordis 注入等待；fix-23 增 sidebarRight、fix-25 增 layout）。
- **影子纪律**：single 槽 lowest renders（priority 升序最低者渲染；官方占用者缺省 0 → 产品 -100 替换占用）。#8 例外注记：不声明 children——官方登记行恒在场供养 `conversation.hero.workspace.directoryFlow` 子洞（原生目录选取链 fix-14/16 不断）。
- **激活自证**：`__DSH_FORGE_CLIENT__`（先于注册立标；sidebar/center/views/shell 四族 registered/error 诊断）。
- **工作台桥**：apply 期经发布面工厂创建并发布 `__DSH_FORGE_WORKBENCH__`（showKnowledge = `selectPanel('dswf-knowledge')`、showSession = `selectPanel(null)` + 知识抽屉目标 store）；随 shell.overlay 登记同期撤销，缺席期导航 fail-soft no-op。
- **`main.conversation` 影子登记缺席**（fix-25 退役——官方 ConversationRoot 直渲，见 §3/§11）。

## 3. 中区 = 官方 ConversationRoot（白拿口径）

中区会话面**全部官方直渲**，产品零登记零自绘：

- **官方头部链**：`conversation.header` → `conversation.session.header`——lineage 会话标题（官方账本 displayTitle）/ actions / utilities「打开方式」+「⋯」/ corner 官方 ExpandButton（右栏收展）。
- **官方页签行**：ConversationSessionHeader `.tabs`（会话作用域——无会话/空白会话不渲染，官方 hideChrome 语义）。名册实况：**chat（官方，对话）+ trajectory（官方 ui-trajectory，order 10，developerTools 门控/缺省开启）+ dswf-recall（产品，order 20，知识召回）**——fix-29 后『轨迹』唯一。
- **官方内容面**：chat 转录/composer/草稿/滚动位（官方 store 自持）与 trajectory 官方轨迹表（历史加载/折叠回合/图片子槽；e2e 锚 = `[data-trajectory-scroll]` + 行 `tr[data-kind=…]`）。
- **机制铁律**（fix-23 探针实证）：slot runtime 的 renderSlot 授权按占用者注册行**自声明 children** 发放、子槽声明全局唯一——产品影子恒拿不到官方子座渲染权，官方占用者自带声明即恒亮。此即 `main.conversation` 影子退役的根因。

## 4. 产品全局面板族（main keyed roster + 常驻宿主）

```
官方 AppFrame main 面板 roster（ui-layout；keyed 非选中即卸载）
 ├─ 'dswf-hero' → HeroPanel（workbench/）＝ HeroEmpty 纯渲染件
 │   （价值一句话 + 「添加项目」CTA——官方 Button；选中/让位由 ShellHost 驱动）
 ├─ 'dswf-knowledge' → KnowledgePanel（workbench/）
 │   ├─ 项目锚推导（projectAnchorOf——root 作用域无会话锚，恒走唯一项目兜底）
 │   ├─ 抽屉目标（useSyncExternalStore 订工作台桥；桥缺席 = 本地自持降级）
 │   └─ KnowledgeView（views/knowledge/）→ §7
 └─ null（缺省）= 官方会话面板（ConversationRoot → §3）

shell.overlay → ForgeShellHost（workbench/ShellHost.tsx——常驻不随面板互换卸载）
 ├─ 相位推导（sessionZonePhase：settling/hero/session——hero 仅由项目数正零驱动）
 ├─ data-dswf-workbench/phase/view 锚（e2e/走查；view = activePanelId 官方面板态镜像）
 ├─ hero 面板驱动（heroPanelDrive 纯函数：boot 期零项目 → selectPanel('dswf-hero')；
 │   注册成功 → selectPanel(null) 让位——一次性守卫防导航争用）
 ├─ UF-3 流程宿主（AddProjectFlow → §8；onRegistered = 项目数即时重拉锚）
 ├─ WorkspacesAnchor（官方 useWorkspaces 归属快照锚——快照身份变化 = 重拉）
 └─ 知识模式右栏联动（rightbarViewPlan + effect：进知识面板收起并记忆、回会话恢复；
     收展态本体归官方 ui-sidebar-right per-session store）
```

面板互换全走官方径：`layout.selectPanel(id|null)`（官方 ui-layout LayoutController）；官方 `openSession` 内部 `selectPanel(null)` 回会话——「会话行切回」主路径全官方收口。产品视图态机已退役（§11）。

## 5. 会话页签族（conversation.view roster）

```
官方页签行（.tabs）
 ├─ 'chat'（官方直用——转录/输入/草稿全官方面自持）
 ├─ 'trajectory'（官方直用——fix-29 退役产品复刻；官方名册 order 10）
 └─ 'dswf-recall'（产品唯一登记——order 20）
      └─ ForgeRecallView（views/session/ConversationViews.tsx）
          ├─ 官方 session 作用域标准 props（sessionId + useWorkspaces 等观察钩子）
          ├─ 项目锚推导（projectAnchorOf——会话归属 → 项目）
          ├─ RecallTab（recall-model 纯投影 + sessionRecall 单通道；
          │   官方视图区 only:id 激活即挂载 = 每次选中重拉——AC-4 即时累积语义）
          └─ 命中行 → openKnowledgeEntry（inject face）→ 桥跳转 → §4 知识面板 + §7 抽屉
```

hero 工作区控件（新会话输入框上方）：`conversation.hero.workspace` 影子（#8）——改列 forge 项目（fix-24①）；chip 触发器归官方 owner 渲染，标题对齐经 core 注册链 `workspaceController` workspace/rename 达成（fix-24②）。

## 6. 左栏（官方 sidebar 壳 + 产品替换面板）

```
官方 ui-sidebar SidebarRoot（壳：几何/收展 56px rail ↔ 展开宽/快捷键/新会话/设置/品牌行）
 ├─ renderSlot('sidebar.workspaces') → ForgeSidebarSlot（接线层，影子 -100）
 │   ├─ useSyncExternalStore（sessions/workspaces 官方快照源直读——SC2）
 │   ├─ useForgeProjects（forge:projects/list RPC）
 │   ├─ sidebarActions(openSession)（单参——官方导航动作绑定）
 │   └─ ForgeWorkspacePanel（纯面板：宽态/rail 态/四相位——骨架/错误/空态引导；
 │       项目块 = 官方 DisclosureRow + StateDot + 官方行语言 + relativeTime）
 ├─ sidebar.brand.mark/name 内容洞 → ForgeBrandMark/ForgeBrandName（行本体与
 │   「整块 = 新会话快捷」交互归壳——品牌行点击走官方 startSession）
 └─ sidebar.panellist 'dswf-knowledge' 行（官方 PanelRow——知识库入口，
     fix-25 迁入；点击 = 官方 layout.selectPanel）
```

## 7. 知识视图（views/knowledge/）

```
KnowledgeView（装配壳：projectId null → 无锚引导 EmptyState；否则——）
 ├─ KnowledgeBrowse
 │   ├─ KnowledgeToolbar：【官方 Pill】范围（P1 项目级）+【官方 Input】关键词 + 清除钮
 │   ├─ DomainTree（自绘领域行·吃令牌）：role=tree、「全部域」根 + 聚合节点
 │   └─ KnowledgeCardGrid（自绘卡片）：frontmatter 五字段 +【官方 Tag】关键词 + HeatBadge
 │       四态 = browseFaceState 纯函数：骨架 / 卡片 / 无结果+清除入口 / 空库引导
 ├─ use-knowledge-browse（装载壳）：browse-model 过滤态机 reducer
 │   + browseLoadPlan / pendingBrowseState / applyBrowseLoad 纯函数
 └─ EntryDrawer
     ├─ 装载壳：useEntryDetail 按需拉取（entryDetail 唯一通道）+ Esc 捕获
     └─ Body：摘要块 → 两列元数据（entryMetaRows 投影）→ MarkdownDoc
        （【官方 MarkdownText】variant=body，frontmatter 剥离；形态对齐官方浮层）
```

抽屉打开态归工作台桥持有（卡片点击与召回行跳转两入口共用）；跨视图（session ↔ knowledge）不直引，唯一通道 = 桥（workbench/workbench-bridge.ts）。

## 8. 模态层（flows/add-project/，官方 Modal 壳）

```
AddProjectFlow【官方 Modal：title/✕/Esc/遮罩三分守卫 + contentClassName 相位宽度】
（宿主 = ShellHost（§4）；打开缝 = 页内全局 __DSH_FORGE_ADD_PROJECT_FLOW__——
  hero CTA / 项目树「＋」两入口经 openAddProjectFlow() 直达，宿主缺席 fail-soft warn）
 ├─ flow-model 相位机：browser → form ⇄ repick(browsing) → executing → success/failure
 │   （取消点 = browser/form/repick；executing 不可中断；确认一次性守卫）
 ├─ DirectoryBrowser（段一）：上一级钮【官方 Button】+ 面包屑（browser-model 纯投影）
 │   + 目录列表（官方行语言 32px 行高 + 已注册 StateChip 标记）+ footer 确认（「下一步」）
 ├─ RegisterForm（段二）：五字段受控行（form-model：回填/默认/只读派生/联动 relink/校验）
 │   +「浏览…」= BrowsePanel 复用 DirectoryBrowser（target=knowledgeDir/forgeDir/workspace）
 └─ 执行/反馈：TextShimmer【官方】+ 成功自动关闭 / 失败反馈（registerFailureCopy 补偿口径）
```

## 9. 横切面

- **状态**：SC2 直读三源——官方快照源（sessions.list / workspaces.list / layout.panelInfo，均 useSyncExternalStore 直读；官方 kit root 钩子 useWorkspaces/usePanelInfo）+ 产品 RPC 直读（useForgeProjects / use-knowledge-browse / useSessionRecall）+ 纯函数面（workbench/panel-model.ts：相位/项目锚/右栏计划/视图镜像）。零全局 store（视图态机已退役，§11）。
- **RPC（产品面真实路径）**：`rpc/transport.ts` 取 **`window.dshForge.invoke(channel, payload)`**（宿主 preload 暴露面——形状权威 `apps/host/src/ipc/preload-api.ts`）→ Electron IPC（allowlist 在 preload/main 两侧守门）→ 宿主 main（`apps/host/src/ipc/`：projects-rpc / knowledge-rpc / fs-rpc）→ **boot child 桥**（bridge.ts dispatchRpc 白名单派发）→ core 包双服务（`ctx.forgeProjects` / `ctx.forgeKnowledge`，SQLite 直读）。三面通道常量唯一源 = `@dsh-forge/contracts` channels：`forge:projects/*` 五通道 + `forge:fs/listDir` + `forge:knowledge/*` 五通道；信封 RpcOk/RpcErr → RpcClientError（typed error）。
  - **`__DSH_TRANSPORT__` carrier ≠ 产品 RPC**：shell/carrier.ts 装的 carrier（`{ownsHost, streamBaseUrl}`）是**官方 dsh 面通路声明**——官方连接层（Gateway ws `/api/remote.mux` + HTTP RPC 经 webserver）消费，官方 ui-* 插件走此径；产品 `forge:*` 通道不走 carrier，走上述 preload 桥。（旧版本文档曾把两者混一，特此勘误。）
- **样式**：每模块同名 css；全部 `--dsw-*` 官方令牌（lint-tokens 机械拦截裸值）；布局刻度沿 dsw-raw 豁免注记制（执行记录同步）。中区容器零产品样式（官方 ConversationRoot 直渲）。

## 10. 官方件 vs 自绘件清单

**官方件（import/登记实证）**：AppWebEntry / applyIndexInjections（dsh-client-web）；AppFrame main 面板 roster + selectPanel/panelInfo（ui-layout）；ConversationRoot 官方头部链/页签行/内容面 + conversation.view roster + hero workspace 行（ui-conversation / ui-chat / ui-trajectory）；官方 sidebar 壳 + PanelRow + DisclosureRow + StateDot（ui-sidebar）；官方右栏（ui-sidebar-right）；官方 Modal；Button / Input / Pill / Tag / Menu / TextShimmer / MarkdownText / 图标件族 / relativeTime（ui-primitives）；官方主题令牌体系（ui-theme 供体）。

**自绘件（纪律内，全部吃令牌、行语言对齐官方）**：hero 引导面板（HeroEmpty）、知识卡片、域树行、表单输入行、抽屉容器、侧栏项目块容器、召回分组行、各 EmptyState/骨架。

## 11. 退役结构（历史注记——fix-25 前世界，勿据此理解现码）

以下结构曾在本文档旧版本整章描述，均已退役，仅存此注记保可追溯：

| 退役结构 | 退役于 | 因 |
|---|---|---|
| `main.conversation` 产品影子（ForgeWorkbenchPanel 整面替换） | fix-25 | renderSlot per-entry children 授权铁律——产品影子恒拿不到官方头部链子座渲染权（fix-23 探针实证）；降位为官方缝登记（本文 §2-§5） |
| `workbench/WorkbenchPanel.tsx` 装配核心 + `__DSH_FORGE_WORKBENCH__` 视图转移桥旧形态 | fix-25 | 同上；现 ShellHost/KnowledgePanel/HeroPanel 分载 |
| `zones/`（WorkbenchZones 三区容器：rail/center/dock） | fix-25 | 三区结构由官方 AppFrame 承载（官方 sidebar 壳/main roster/官方右栏） |
| 右栏 dock 官方 dockkit 自持装配（DockLayout/dock-kit.ts，fix-10 立制） | fix-25 | 右栏 = 官方 ui-sidebar-right 白拿；收展联动走官方窄面 |
| `shell/view-state.ts` 视图态机（6 事件纯态机） | fix-25 | 中区互换 = 官方 layout.selectPanel；产品只留面板态镜像（centerViewOf） |
| SessionPanel / SessionToolbar 复刻（三页签 + 三 pane 常挂载） | fix-25 | 官方头部链/页签行/对话面原生直渲；keep-alive 语义由官方 roster 机制承载 |
| `conversation.view` `'dswf-trajectory'` 登记 + TrajectoryLedger/transcript.ts 复刻 | fix-29 | 官方名册同 order 10 双『轨迹』冲突；官方轨迹视图自带富数据管线，直用（本文 §5） |
