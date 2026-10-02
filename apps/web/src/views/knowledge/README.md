# views/knowledge/

定位：**业务** —— 知识浏览（域树/卡片/抽屉/工具栏）。填充：3.6（浏览主体）/ 3.7（详情抽屉）。
边界：禁 import `../session/`（依赖铁律③ 同级业务互禁——跨视图经 `zones/` 槽位与 `rpc/` 解耦）。

## 模块面（3.6 浏览主体）

| 文件 | 职责 |
|---|---|
| `browse-model.ts` | 纯派生层：过滤态机（`browseFilterReducer`）/ 查询透传（`entriesQueryOf`）/ 网格相位推导（`browseFaceState`）/ 域树行投影（`domainRows`）/ 卡片时间标签（`cardTimeLabel`） |
| `use-knowledge-browse.ts` | 数据装载 hook：`forge:knowledge/browse + listEntries` ∥ `forge:projects/get`（项目名 + 知识目录位置）；过滤重拉 + 竞态守卫（seq）；typed error → `rpcUiState` 三态映射 |
| `KnowledgeToolbar.tsx` | 工具栏：官方 Input（关键词受控件，Esc 清空）+ 官方 Pill（范围显示——P1 项目级） |
| `DomainTree.tsx` | 左轨域目录树（~224px）：「全部域」根行 + 聚合节点行（常展开 ≤3 层，自绘领域行吃令牌） |
| `KnowledgeCardGrid.tsx` | auto-fill 卡片网格 + 主体四态（骨架/卡片/过滤无结果+清除入口/空库引导）+ 错误态（错误条/不可用空态） |
| `KnowledgeBrowse.tsx` | 装配：`KnowledgeBrowse`（hook 装载壳——3.8 挂知识视图槽）+ `KnowledgeBrowseBody`（纯渲染，全相位静态可测） |

## 关键口径

- **域过滤 = 目录路径前缀匹配**（Hard Rule）：`domainPrefix` 原样透传 `listEntries`，前缀语义在 core 服务面执行——本模块零客户端过滤语义、零其它过滤维度。
- **关键词细分** = keywords 维度（服务端执行）；工具栏输入原样传递，未激活（空白）不出查询键。
- **热度徽章 = card.heat 原样呈现**（AC3）：`listEntries` 单表同源 join（与 `heatByEntry` 同口径）——UI 零再推导、不另调 heat 通道；三方一致断言（事件 ↔ tab ↔ 热度）归 3.8/4.2 e2e。
- **缓存先行（AC5）**：过滤重拉/重试期旧卡片保持可见（`aria-busy` 标注）；首装零数据 = 骨架（索引缺失静默重建期在 core 侧，本侧表现为在途等待）；跨项目切换清场（旧项目卡片不残留）；重试携过滤在场 → 全量装载后追过滤视图（不打散过滤语义）。
- **网格相位**：`browseFaceState` 纯函数（error > cards > skeleton > no-results/empty-library）；error 相位内三态分流（`rpcUiState`：empty-state → 不可用空态；error-bar/banner → 错误条）归 `KnowledgeCardGrid`。
- **样式纪律**：输入/工具栏件官方（Input/Pill/Button/Tag）；自绘仅限领域组件（域树行 `dswf-kn-dom-row` / 知识卡片 `dswf-kn-card`）且吃令牌；dsw-raw 豁免 = 原型结构刻度（左轨 224px / 域树行 24px / 层级缩进 13px·层 / 骨架卡高），同 2.7 sidebar 豁免先例。

## e2e / 走查锚（3.8 装配 + 4.2 飞轮 e2e 消费）

`data-dswf-kn-browse`（主体）· `data-dswf-kn-toolbar` · `data-dswf-kn-tree` / `data-dswf-domain="<path>"`（域行——场景④ 前端域选择）· `data-dswf-kn-cards` / `data-dswf-entry="<id>"`（卡片；热度一致性断言选择器 = `[data-dswf-entry] .dswf-heat-badge`）· `data-dswf-skeleton`（加载/重建骨架）· `data-dswf-clear-filters`（清除过滤入口）· `data-dswf-kn-error` / `data-dswf-kn-retry`（错误面）。

## 残留（按任务依赖序）

- 详情抽屉（摘要块 + 两列元数据 + Markdown 正文）= 3.7（`EntryDrawer.tsx`，经 `onEntryOpen` 注入——本模块已留接线位）。
- 知识视图槽位挂载（zones slots.knowledge 自 M0 占位填入浏览面）+ UF-4 召回 tab 接线 = 3.8。
- 实机 e2e（场景④ UI 侧 / 热度一致性三方断言 / 索引静默重建走查）= 3.8 装配 + 4.2（本任务面 = 模块契约面：纯函数 + 纯异步面 + 全相位静态渲染）。
- 域树收合交互、状态 chips 阈值、「从会话抽取」chip、统计/召回日志页签 = M4+（PRD UF-6 排除项）。
