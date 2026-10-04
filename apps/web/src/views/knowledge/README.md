# views/knowledge/

定位：**业务** —— 知识浏览（域树/卡片/抽屉/工具栏/视图装配壳）。填充：3.6（浏览主体）/ 3.7（详情抽屉）/ 3.8（知识视图挂载 + 召回跳转复用）。
边界：禁 import `../session/`（依赖铁律③ 同级业务互禁——跨视图经工作台桥（workbench/workbench-bridge.ts）与 `rpc/` 解耦；召回 tab 跳转经桥 `openKnowledgeEntry` 驱动，不直引）。

## 模块面（3.6 浏览主体 + 3.7 详情抽屉 + 3.8 视图装配壳）

| 文件 | 职责 |
|---|---|
| `browse-model.ts` | 纯派生层：过滤态机（`browseFilterReducer`）/ 查询透传（`entriesQueryOf`）/ 网格相位推导（`browseFaceState`）/ 域树行投影（`domainRows`）/ 卡片时间标签（`cardTimeLabel`——zh 切换委托 components/time-label 共享源） |
| `KnowledgeView.tsx` | 知识视图装配壳（3.8 立制 / fix-25 迁官方面板）：`KnowledgeBrowse` + `EntryDrawer` 组合，挂载位 = KnowledgePanel（官方 `main` keyed 'dswf-knowledge' 占用者，workbench/）；`openEntryId` 进出（卡片点击与召回 tab 跳转两入口共用的抽屉打开态——态归工作台桥持有，面板经 useSyncExternalStore 订阅）；无项目锚 = 引导空态（`data-dswf-knowledge-view` = 视图在场锚） |
| `use-knowledge-browse.ts` | 数据装载 hook：`forge:knowledge/browse + listEntries` ∥ `forge:projects/get`（项目名 + 知识目录位置）；过滤重拉 + 竞态守卫（seq）；typed error → `rpcUiState` 三态映射 |
| `KnowledgeToolbar.tsx` | 工具栏：官方 Input（关键词受控件，Esc 清空）+ 官方 Pill（范围显示——P1 项目级） |
| `DomainTree.tsx` | 左轨域目录树（~224px）：「全部域」根行 + 聚合节点行（常展开 ≤3 层，自绘领域行吃令牌） |
| `KnowledgeCardGrid.tsx` | auto-fill 卡片网格 + 主体四态（骨架/卡片/过滤无结果+清除入口/空库引导）+ 错误态（错误条/不可用空态） |
| `KnowledgeBrowse.tsx` | 装配：`KnowledgeBrowse`（hook 装载壳——3.8 挂知识视图槽）+ `KnowledgeBrowseBody`（纯渲染，全相位静态可测） |
| `EntryDrawer.tsx` | 详情抽屉（3.7）：`EntryDrawer`（装载壳——`useEntryDetail` 按需拉取 + `useEntryDrawerEscape` Esc 捕获）+ `EntryDrawerBody`（纯渲染三相位）+ `entryMetaRows`（两列元数据投影）+ `fetchEntryDetail`（纯异步面） |

## 关键口径

- **域过滤 = 目录路径前缀匹配**（Hard Rule）：`domainPrefix` 原样透传 `listEntries`，前缀语义在 core 服务面执行——本模块零客户端过滤语义、零其它过滤维度。
- **关键词细分** = keywords 维度（服务端执行）；工具栏输入原样传递，未激活（空白）不出查询键。
- **热度徽章 = card.heat 原样呈现**（AC3）：`listEntries` 单表同源 join（与 `heatByEntry` 同口径）——UI 零再推导、不另调 heat 通道；三方一致断言（事件 ↔ tab ↔ 热度）归 3.8/4.2 e2e。
- **缓存先行（AC5）**：过滤重拉/重试期旧卡片保持可见（`aria-busy` 标注）；首装零数据 = 骨架（索引缺失静默重建期在 core 侧，本侧表现为在途等待）；跨项目切换清场（旧项目卡片不残留）；重试携过滤在场 → 全量装载后追过滤视图（不打散过滤语义）。
- **网格相位**：`browseFaceState` 纯函数（error > cards > skeleton > no-results/empty-library）；error 相位内三态分流（`rpcUiState`：empty-state → 不可用空态；error-bar/banner → 错误条）归 `KnowledgeCardGrid`。
- **样式纪律**：输入/工具栏件官方（Input/Pill/Button/Tag）；自绘仅限领域组件（域树行 `dswf-kn-dom-row` / 知识卡片 `dswf-kn-card`）且吃令牌；dsw-raw 豁免 = 原型结构刻度（左轨 224px / 域树行 24px / 层级缩进 13px·层 / 骨架卡高），同 2.7 sidebar 豁免先例。

## e2e / 走查锚（3.8 装配 + 4.2 飞轮 e2e 消费）

`data-dswf-kn-browse`（主体）· `data-dswf-kn-toolbar` · `data-dswf-kn-tree` / `data-dswf-domain="<path>"`（域行——场景④ 前端域选择）· `data-dswf-kn-cards` / `data-dswf-entry="<id>"`（卡片；热度一致性断言选择器 = `[data-dswf-entry] .dswf-heat-badge`）· `data-dswf-kn-skeleton`（加载/重建骨架——fix-36 域前缀化，与 className 对齐）· `data-dswf-clear-filters`（清除过滤入口）· `data-dswf-kn-error` / `data-dswf-kn-retry`（错误面）。

抽屉（3.7）：`data-dswf-kn-drawer`（滑入层——在场即打开态）· `data-dswf-kn-drawer-close`（✕ 关闭位）· `data-dswf-kn-summary`（摘要块）/ `data-dswf-kn-meta` + `data-dswf-kn-meta-row="<key>"`（两列元数据五行）/ `data-dswf-kn-body`（正文区——AC2 断言面：该区内不得出现 frontmatter 字段/摘要/关键词字面量）· `data-dswf-kn-drawer-skeleton`（详情拉取骨架）· `data-dswf-kn-drawer-retry`（错误面重试）。

## 关键口径（3.7 详情抽屉）

- **三区呈现序 = 摘要块（summary 先行：条目标题 + 摘要）→ 两列元数据（域/状态/关键词/作者/更新时间；关键词整行，其余半行两列）→ Markdown 正文**（`MarkdownDoc` variant=body 统一包装——Hard Rule：抽屉内禁裸 MarkdownText）。
- **正文按需读取**：打开（entryId 变更）才拉 `forge:knowledge/entryDetail`，全库通道（browse/listEntries/heat）零调用；竞态守卫同浏览面（seq 序号）。
- **关闭回浏览上下文**：抽屉不持有过滤态（旁挂层）；Esc 捕获阶段拦截（抽屉先于工具栏清空——`stopPropagation` 防「关抽屉连带清空关键词」）；✕/Esc 均 `onClose` 上抛装配方。
- **形态对齐官方 dockkit 浮层**：层级 `--dsh-dockkit-float-layer`（回退 60）+ 抬升面 `--dsw-elevation-prominent`（描边回弹 border-l2）+ 粘顶栏行尾关闭位 + 右缘滑入动画；布局结构 = 原型 kn-drawer（min(520px, 52vw) 全高）。
- **错误面**：typed error 经 `rpcUiState` 三态（ENTRY_NOT_FOUND/INDEX_STALE/目录非法 → 不可用空态；其余 → 错误条），均带重试。

## 残留（按任务依赖序）

- ~~知识视图槽位挂载 + 抽屉装配 + UF-4 召回 tab 分组行跳转复用~~ = 3.8 已落地、fix-25 迁官方面板径（`KnowledgeView` 由 KnowledgePanel——官方 `main` keyed 'dswf-knowledge' 占用者——挂载；`openEntryId` 两入口共用——卡片点击 / 召回行跳转经工作台桥 `openKnowledgeEntry`：切知识面板 + 开抽屉）。
- 实机 e2e 数据面（真数据卡片/抽屉/热度一致性三方断言/索引静默重建走查）= host 通道装配转正（`knowledge-integration.spec.ts` 组二，SMOKE-LEDGER §5）+ dogfood（4.2）；本任务面 = 模块契约面：纯函数 + 纯异步面 + 全相位静态渲染 + 结构 pin。
- 域树收合交互、状态 chips 阈值、「从会话抽取」chip、统计/召回日志页签、抽屉动作区（审核/移动/编辑元数据）= M4+（PRD UF-6 排除项）。
