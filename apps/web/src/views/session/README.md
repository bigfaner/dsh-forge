# views/session/

定位：**业务** —— UF-4 会话面板三 tab 组装（对话注入面 / 轨迹最简台账 / 召回数据面）。填充：2.11 + 3.8（召回 tab 接线）。
边界：禁 import `../knowledge/`（依赖铁律③ 同级业务互禁——跨视图经 `zones/` 槽位与 `rpc/` 解耦；召回行跳转抽屉经装配态，`onOpenEntry` 回调由 workbench 注入）。

## 组成

| 文件 | 职责 |
|---|---|
| `SessionPanel.tsx` | 面板组装：顶部三页签（官方 SegmentedTabs）+ 三 tab keep-alive 容器（切换仅 hidden 不卸载——AC-4 草稿/滚动保持机制）；`recall` 注入位（3.8 = 装配产物 RecallTab） |
| `RecallTab.tsx` | 召回 tab 数据面（3.8）：`useSessionRecall` 装载（sessionRecall 单通道；visible 翻转重拉 = AC-4 即时累积）+ `RecallTabBody` 纯渲染（统计头/分组行/失效标注/空态/错误条）+ `mapRecallError`/`fetchSessionRecall` 纯异步面 |
| `recall-model.ts` | 纯派生层：`recallStatsOf`（统计头口径——次数 = 分组数/覆盖 = 身份键去重，与 core hitIdentity 同口径）+ `recallRowsOf`（按知识折叠行——动词明细/最近时间/事件计数/热度原样）+ `recallTimeLabel`（官方 relativeTime 桶化——同级互禁下的平行小件，与 cardTimeLabel 口径互指） |
| `TrajectoryLedger.tsx` | 轨迹 tab 最简台账（时序列表 + 四类行组件：消息/工具/事件/错误） |
| `transcript.ts` | 转录视图模型（`TranscriptEntry` 最小消费切片）+ 台账投影（`buildTrajectoryLedger` 纯函数——AC-3 一致性锚） |
| `session.css` | 面板与台账/召回行样式（全令牌；会话 UI 自绘为零——对话面样式归官方件） |

## 数据契约（props 进出，运行期绑定归装配 2.12）

- **对话 tab**：`chatSurface: ReactNode` 注入位——官方会话面（转录+输入）经装配以 S2 嵌入配方产出：
  `conversation.content` 工厂（variant=embedded）+ `conversation.session` owner `view:'chat'`
  （上游 ui-subagent sidebar-chat 同型先例）；草稿/滚动状态由官方面自持（ConversationStoreState.draft
  跨会话切换持久 + chatScroll 锚键——S2 §2.2）。面板零自绘会话 UI（Hard Rule）。
- **轨迹 tab**：`transcript: readonly TranscriptEntry[]`——装配自官方 ChatSnapshot
  （`ctx.uiConversation.binding(binding).target('chat')` 快照）逐节点映射：

  | 语义类（本模块） | 上游 ConversationNode（S2 §2.2） |
  |---|---|
  | `user-message` | UserMessage / SteeringMessage |
  | `assistant-message` | AssistantMessage / PartialAssistant |
  | `command` | Command |
  | `tool-started` | StartedToolCall / PreparingToolCall |
  | `tool-running` | RunningToolCall |
  | `tool-result` | ToolResult |
  | `turn-error` | TurnError / TurnMaxTokens |
  | `system` | CompactionSummary / ContextMessage / ModelRetry / TodoItem / UnknownSurface |

  wire 判别值 → 语义类的实跑映射归装配层锚定（S2 残留 §4-5：随 2.12 装配实跑入 G1 pin 池，2.13 收口）。
- **召回 tab**：`recall?: ReactNode` 注入位——3.8 装配产物 = `RecallTab`（`forge:knowledge/sessionRecall`
  单通道；统计头 = `recallStatsOf`，分组行 = `recallRowsOf` 按知识折叠——动词明细/最近时间/热度徽章
  原样呈现；`visible` 翻转重拉 = AC-4 即时累积；无会话/项目锚 = 静态空态不拉取；entryId null 行级
  失效标注不阻塞列表；命中行点击 → `onOpenEntry(entryId)` 装配回调（切知识视图 + 开抽屉））。
  缺省占位空态「本会话暂无召回」保持为非壳载体/单测面。数据行/热度三方一致实机面 = dogfood（4.2）。

## 状态语义

- 三 tab 切换不重置会话状态（AC-4）：pane 常挂载（hidden 切显隐）；对话面内部态（草稿/滚动）
  与台账渲染态均不经受切换。
- UF-4 States「空会话引导 / 加载恢复骨架」由官方会话面自承载（hero 相位/分页加载），本面板不重复建模。
