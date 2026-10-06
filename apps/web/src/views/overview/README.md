# views/overview/

定位：**业务** —— UF-1「项目概览」dock tab 框架（ov-head 折叠头 + sticky 三子 tab + 搜索/排序 + 提案|feature 子 tab + 七态 chips 过滤接口）。填充：3.5（本目录）；任务三视图 = 3.6（`task-tab/`，经 `renderTasksTab` 槽接入）；抽屉/转移对话框 = 3.7/3.8；dock 注册集成 = 4.1（`sidebarRightTabs.register('dswf-overview')` + `useTabInfo` 注入）。
边界：禁 import `../session/` `../knowledge/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client（renderer 禁 core/knowledge import——运行期边界①）。

## 模块面（3.5 框架）

| 文件 | 职责 |
|---|---|
| `overview-model.ts` | 纯态模型：三子 tab（用户定向顺序 提案\|feature\|任务）/ 排序翻转（`nextSort`）/ 搜索参归一（`searchQueryOf`——Hard Rule 服务端承载）/ chips 过滤接口（`toggleStatusFilter`/`statusFilterParam`）/ 父行与 ov-head 展开态（多开并存）/ ov-head 摘要合成（`overviewHeadSummary`/`activeFeatureSlug`） |
| `overview-data.ts` | 数据装载：头路（`loadOverviewHead` = projects.get ∥ deriveTaskStoreDir ∥ features.list 无参 ∥ tasks.stats 四路并发）+ 列路（`fetchOverviewList` = proposals/features 子 tab 服务端过滤装载）+ `useOverviewLoad` hook（两路 effect + seq 竞态守卫）+ 落点纯函数 |
| `ov-head.tsx` | 折叠头（AC1）：默认折叠 = 项目名 + 一行摘要 + ▾；展开 4 行（工作区/文档位置/知识目录/任务清单@hash8）+ ▴ 收起 |
| `sticky-bar.tsx` | sticky 区（AC2）：三子 tab（role=tablist）+ 搜索行（官方 Input 限宽 240px + 条件清除钮 + Esc 清空）+ 排序 pill 右固定（⇅ 活跃优先 ↔ 最新创建）；IME 安全 = 搜索行稳定子树 |
| `status-chips.tsx` | 七态 chips（AC5）：contracts TASK_STATUSES 行序 + 中文标签 + 计数 + StateDot 语义映射；0 计数 disabled——过滤接口三视图统一（3.6 消费同组件同状态） |
| `proposal-tab.tsx` | 提案子 tab（AC4）：父行 ▸ 展开（slug/作者/创建/裁决/谱系——谱系 = feature.proposalSlug 反查）+ proposal.md 文档行（名称 + 状态标签紧贴 + › 行尾） |
| `feature-tab.tsx` | feature 子 tab（AC4）：父行 ▸ 展开（摘要/来源提案/任务七态分布/文档统计/创建更新）+ 文档行（`FeatureDocumentRow[]` 契约类型 props——不含提案文档） |
| `OverviewTab.tsx` | 帧装配：`OverviewFrame`（纯呈现——结构静态可测）+ `OverviewTab`（filter 本地态单一来源 + `useOverviewLoad` 胶水 + `renderTasksTab` 槽 = 3.6 三视图装载位） |

## 关键口径

- **搜索过滤服务端承载（Hard Rule）**：`searchQueryOf` 只做 trim/空归一，关键词原文经 `fetchOverviewList` 透传 `listProposals`/`listFeatures` 查询参（core `matchesSearch` + `sortByActiveThenCreated` 执行）——本目录零行本地过滤/排序逻辑；chips 同理转 `statusFilterParam` 白名单参（3.6 `listTasks` 消费）。
- **子 tab 切换清空（AC3）**：`switchSubtab` = 清空搜索 + 清空 chips + 收起全部展开态（ov-head 展开态跨子 tab 保持——路径详情与内容区正交）。
- **IME 安全（AC2）**：搜索行 = 稳定受控子树——输入值仅回流 input `value` 属性与（非空的）清除钮兄弟位；结构不变式断言（input 前键树前缀等价 + 唯一 input）见 sticky-bar.test。
- **feature 文档行 = 契约张力裁决**：ui-design 要求文档行，但 Interface 2 读面（`listFeatures → FeatureCard`）仅含 `docCount`、全契约无 feature_documents 列举 API——`FeatureTab.docs` props 携契约类型接口在场，3.5 帧不喂行（展开元数据呈现 `docCount` 统计）；提案子 tab 文档行 = `ProposalCard.relPath` 真数据。
- **提案摘要行缺席**：contracts `ProposalRow` 无 summary 字段（Interface 3 数据形状权威）——摘要在文档 tab（`DocContent.summary`）承载，行级不重复。
- **ov-head 会话计数 = 4.1 注入位**：`sessionCount` props（sessions/workspaces 账本快照）；缺席省略段（「feature · N 完成」）。
- **样式纪律**：输入/钮/标签官方件（Input/Button/Pill/Tag/StateDot）；自绘仅领域行（父行/文档行/chips）吃令牌；dsw-raw 豁免 = 原型结构刻度（搜索限宽 240px = ui-design v8 检索刻度 / 行高 28px·24px / 元数据缩进 26px / chips 行距 6px），同 sidebar/knowledge 豁免先例。

## e2e / 走查锚（4.1 集成 + 5.2 e2e 消费）

`data-dswf-ov-panel`（tab 体）· `data-dswf-ov-head` / `data-dswf-ov-head-toggle`（折叠头与 ▾/▴）· `data-dswf-ov-sticky` / `data-dswf-ov-subtab="<proposals|features|tasks>"`（子 tab）· `data-dswf-ov-searchrow` / `data-dswf-ov-searchclear`（搜索行——IME 安全断言位）· `data-dswf-ov-sort`（排序 pill）· `data-dswf-ov-stchips` / `data-dswf-ov-stchip="<status>"`（chips）· `data-dswf-ov-parent="<prop:id|feat:slug>"` / `data-dswf-ov-meta`（父行/元数据）· `data-dswf-ov-doc="<relPath>"`（文档行——dock 开 tab 点击位）· `data-dswf-ov-skeleton` / `data-dswf-ov-error` / `data-dswf-ov-banner` / `data-dswf-ov-retry`（三态面）。
