# views/session/

定位：**业务** —— UF-4 会话面板组装（顶部 toolbar + 三 tab：对话注入面 / 轨迹最简台账 / 召回数据面）。填充：2.11 + 3.8（召回 tab 接线）+ fix-9（顶部 toolbar——dsh 布局对齐）。
边界：禁 import `../knowledge/`（依赖铁律③ 同级业务互禁——跨视图经 `zones/` 槽位与 `rpc/` 解耦；召回行跳转抽屉经装配态，`onOpenEntry` 回调由 workbench 注入）。

## 组成

| 文件 | 职责 |
|---|---|
| `SessionPanel.tsx` | 面板组装：官方同构头部单元（fix-13 `.dswf-session-header` 一体容器 = titleRow 注入位（fix-9 SessionToolbar）+ 三页签行）+ 三 tab keep-alive 容器（切换仅 hidden 不卸载——AC-4 草稿/滚动保持机制）；页签 = 官方 ConversationRoot `.tabs/.tab/.tabActive` 扁平文字钮行语言复刻（fix-13 决策变更：SegmentedTabs 分段控件退役——aria/键盘轮焦语义保持）；`recall` 注入位（3.8 = 装配产物 RecallTab） |
| `SessionToolbar.tsx` | 头部单元 titleRow 行（fix-9 建立 / fix-13 融合入 `.dswf-session-header`）：官方 `conversation.session.header` titleRow 行语言官方件组合（Button toolbar/sm + 官方图标）——lineage 当前会话标题 / actions 空位保留 / utilities 编辑器打开占位钮 / corner 面板钮（原 dock 角位绝对定位钮迁入归位）；hero 相位标题簇与 utilities 让位、corner 独存（官方 blank 相位同语义）；WCO 避让标记随右栏收展（避让衬落 titleRow，容器恒持 28px 右衬） |
| `RecallTab.tsx` | 召回 tab 数据面（3.8）：`useSessionRecall` 装载（sessionRecall 单通道；visible 翻转重拉 = AC-4 即时累积）+ `RecallTabBody` 纯渲染（统计头/分组行/失效标注/空态/错误条）+ `mapRecallError`/`fetchSessionRecall` 纯异步面 |
| `recall-model.ts` | 纯派生层：`recallStatsOf`（统计头口径——次数 = 分组数/覆盖 = 身份键去重，与 core hitIdentity 同口径）+ `recallRowsOf`（按知识折叠行——动词明细/最近时间/事件计数/热度原样）+ `recallTimeLabel`（官方 relativeTime 桶化——同级互禁下的平行小件，与 cardTimeLabel 口径互指） |
| `TrajectoryLedger.tsx` | 轨迹 tab 最简台账（时序列表 + 四类行组件：消息/工具/事件/错误） |
| `transcript.ts` | 转录视图模型（`TranscriptEntry` 最小消费切片）+ 台账投影（`buildTrajectoryLedger` 纯函数——AC-3 一致性锚） |
| `session.css` | 面板与台账/召回行样式（全令牌；会话 UI 自绘为零——对话面样式归官方件） |

## 数据契约（props 进出，运行期绑定归装配 2.12）

- **头部单元 titleRow**（fix-9 / fix-13 融合）：`toolbar: ReactNode` 注入位——装配产物
  `SessionToolbar`（workbench/`SessionToolbarLive` 官方账本绑定：标题 = `sessions.byId[id].displayTitle`
  直读（SC2 零缓存，sidebar-model 会话头同源字段）、hero 相位 = `chatHeroOf`（与 ChatSurface
  嵌入配方同源推导）；kit 缺席 = 降级径无标题空位 + 面板钮实功能保持）；fix-13 起渲染于
  `.dswf-session-header` 一体头部容器内（titleRow 之上无独立行——容器刻度/发线归 SessionPanel）。
  装配路径裁决：embedded 配方不透出 header 槽位（upstream `ConversationContent` 仅渲染
  body/composer——header 链归被产品影子替换的官方 `main.conversation` 占用者；且官方
  `ConversationSessionHeader` 自带 tabs 行会与本面板三页签叠加成平行页签行）→ 取「官方件
  组合在 SessionPanel 内组装」（fix-9 两路径裁决，注记见 `SessionToolbar.tsx` 头）。
- **对话 tab**：`chatSurface: ReactNode` 注入位——官方会话面（转录+输入）经装配以 S2 嵌入配方产出：
  `conversation.content` 工厂（variant=embedded）+ `conversation.session` owner `view:'chat'`
  （上游 ui-subagent sidebar-chat 同型先例）；草稿/滚动状态由官方面自持（ConversationStoreState.draft
  跨会话切换持久 + chatScroll 锚键——S2 §2.2）。面板零自绘会话 UI（Hard Rule）。
- **轨迹 tab**：`transcript: readonly TranscriptEntry[]`——装配自官方 ChatSnapshot
  （fix-11 接线：`useConversation` 标准钩子 → `views.get('chat')` → `legacy` 兼容切片，
  workbench/`transcriptOfChatSnapshot` 逐节点映射）：

  | 语义类（本模块） | 上游 ConversationNode（S2 §2.2） | wire 判别值（实跑收口） |
  |---|---|---|
  | `user-message` | UserMessage / SteeringMessage | `kind: 'user'` / `'steering'` |
  | `assistant-message` | AssistantMessage / PartialAssistant | `kind: 'assistant'` / `legacy.partial`（无 seq——`MAX_SAFE_INTEGER` 尾行，落定即让位真实 seq 节点） |
  | `command` | Command | `kind: 'command'`（text = name+args） |
  | `tool-started` | StartedToolCall / PreparingToolCall | （并集于 RunningToolCall——见下行，live 面不单列） |
  | `tool-running` | RunningToolCall | `legacy.runningCalls[]`（`preparing`/`start` 两相位——在途无结果态单行呈现） |
  | `tool-result` | ToolResult | `kind: 'tool-result'`（toolName = `call.name`，窗口截断回落 `callId`） |
  | `turn-error` | TurnError / TurnMaxTokens | `kind: 'turn-error'` / `'turn-max-tokens'` |
  | `system` | CompactionSummary / ContextMessage / ModelRetry / TodoItem / UnknownSurface | `kind: 'context'` / `'model-retry'` / `'compaction'` / `'unknown'`（未知判别跳过——fail-soft） |

  wire 判别值 → 语义类的实跑映射已归装配层锚定（fix-11 收口，随实跑入 G1 pin 池）。
- **召回 tab**：`recall?: ReactNode` 注入位——3.8 装配产物 = `RecallTab`（`forge:knowledge/sessionRecall`
  单通道；统计头 = `recallStatsOf`，分组行 = `recallRowsOf` 按知识折叠——动词明细/最近时间/热度徽章
  原样呈现；`visible` 翻转重拉 = AC-4 即时累积；无会话/项目锚 = 静态空态不拉取；entryId null 行级
  失效标注不阻塞列表；命中行点击 → `onOpenEntry(entryId)` 装配回调（切知识视图 + 开抽屉））。
  缺省占位空态「本会话暂无召回」保持为非壳载体/单测面。数据行/热度三方一致实机面 = dogfood（4.2）。

## 状态语义

- 三 tab 切换不重置会话状态（AC-4）：pane 常挂载（hidden 切显隐）；对话面内部态（草稿/滚动）
  与台账渲染态均不经受切换。
- UF-4 States「空会话引导 / 加载恢复骨架」由官方会话面自承载（hero 相位/分页加载），本面板不重复建模。
