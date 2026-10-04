# views/session/

定位：**业务** —— UF-4 会话页签族（官方 `conversation.view` roster 占用者：召回数据面）。填充：2.11 + 3.8 + fix-25（官方 roster 降位——SessionPanel/SessionToolbar 复刻随 main.conversation 影子退役，头部单元/页签行/对话面 = 官方 ConversationRoot 原生直渲）+ fix-29（轨迹 tab = 官方 'trajectory' 直用——`TrajectoryLedger`/`transcript.ts` 产品复刻随 'dswf-trajectory' 注册退役）。
边界：禁 import `../knowledge/`（依赖铁律③ 同级业务互禁——跨视图经工作台桥与 `rpc/` 解耦；召回行跳转抽屉经桥 `openKnowledgeEntry`，回调由插件 inject face 注入）。

## 组成

| 文件 | 职责 |
|---|---|
| `ConversationViews.tsx` | 官方 roster 占用者族（fix-25/fix-29）：`ForgeRecallView`（'dswf-recall'——RecallTab + 项目锚推导 + 跳转缝）+ `KitSelectorHook` kit 窄面类型 |
| `RecallTab.tsx` | 召回 tab 数据面（3.8）：`useSessionRecall` 装载（sessionRecall 单通道；fix-33 ⑦ 起 visible 维度删除——官方 only:id 激活即挂载承载 AC-4 即时累积）+ `RecallTabBody` 纯渲染（统计头/分组行/失效标注/空态/错误条）+ `mapRecallError`/`fetchSessionRecall` 纯异步面 |
| `recall-model.ts` | 纯派生层：`recallStatsOf`（统计头口径——次数 = 分组数/覆盖 = 身份键去重，与 core hitIdentity 同口径）+ `recallRowsOf`（按知识折叠行——动词明细/最近时间/事件计数/热度原样）+ `recallTimeLabel`（官方 relativeTime 桶化——同级互禁下的平行小件，与 cardTimeLabel 口径互指） |
| `session.css` | 视图 pane/召回行样式（全令牌；头部/页签行/对话面/轨迹表样式归官方件——零自绘） |

## 官方 roster 契约（fix-25 降位形态）

- **头部单元与页签行 = 官方原生**：官方 ConversationRoot 渲染 `main.conversation`
  （产品影子退役——renderSlot per-entry children 授权的运行期铁律，fix-23 探针实证）；
  `conversation.session.header`（标题面包屑/actions/utilities「打开方式」+「⋯」/corner 官方
  ExpandButton）与 `.tabs` 页签行全部白拿。页签行会话作用域——无会话/空白会话不渲染
  （官方 `hideChrome` 语义）。
- **对话 tab** = 官方 'chat' 登记项直用（产品零登记零自绘——转录/输入/草稿全官方面自持）。
- **轨迹 tab** = 官方 ui-trajectory 'trajectory' 登记项直用（order 10；fix-29 退役产品
  'dswf-trajectory' 复刻——官方名册同 order 10 双『轨迹』页签冲突，且官方视图自带富数据
  管线（历史加载/折叠回合/图片子槽），自绘台账的转录投影无保留价值；官方登记项受
  developerTools 门控、缺省开启——「显示代码工作视图」设置口径）。e2e 锚 = 官方轨迹表
  DOM 契约：`[data-trajectory-scroll]` 滚动面 + 行 `tr[data-kind="system|user|context|
  compacted|message|tool|subtool"]`。
- **召回 tab**（'dswf-recall'，order 20）：RecallTab 原样（`forge:knowledge/sessionRecall`
  单通道；官方视图区 `only:id` 激活即挂载 = AC-4 即时累积的机制面——每次选中重挂载重拉；
  无会话/项目锚 = 静态空态不拉取；命中行点击 → `openKnowledgeEntry(entryId)` 桥跳转
  （进知识面板 + 开抽屉——插件 inject face 注入））。
- **占用者 props 面**：官方 session 作用域标准 props（`sessionId` + `useConversation`/
  `useWorkspaces` 等观察钩子）+ 官方视图 owner props（`inspectCall`/`viewRequest`/`openView`/
  `completeViewRequest`——未消费，容忍透传）。

## 状态语义

- 视图切换 = 官方 `only:id` 机制（激活即挂载、切走即卸载）——AC-4 的会话状态保持由官方
  store 自持（草稿 = ConversationStoreState.draft 跨切换持久；转录重挂载异步分页装载，
  恢复收敛轮询承载——fix-11 同径）。
- UF-4 States「空会话引导 / 加载恢复骨架」由官方会话面自承载（hero 相位/分页加载），不重复建模。
