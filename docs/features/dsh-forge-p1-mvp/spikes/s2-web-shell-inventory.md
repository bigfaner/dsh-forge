---
created: "2026-10-02"
task: "1.5"
status: "Done"
upstream-pin: "@deepseek-ai/* 0.2.0-rc.2（npm 实装；源码对照 Z:\\project\\github\\deepseek-harness）"
---

# S2 spike 清点：boot manifest 掌舵实跑 + 官方 ui-* 契约面清单（G1 pin 池第 5 项回填）

> 任务 1.5 硬产出。方法：上游源码核实（符号级）+ 实跑自证（e2e `e2e/specs/web-shell.spec.ts`）。
> 消费方：2.11（会话面板三 tab / 轨迹 tab 数据源）、2.13 与 3.9（G1 pin 池测试入池）。

## 1. S2 实跑判定：官方 ui-* 运行期加载成功（判定达成）

自有 vite 壳（`dsh-forge://app/` 自定义 scheme 服务 apps/web dist）经 `{url, injections}` IPC
消费 boot manifest（`applyIndexInjections` 按表序执行）→ 官方 ui-* client bundle 于壳内装载激活：

- 官方 ui-theme 激活：`style[data-plugin="@deepseek-ai/dsh-client-ui-theme"]` 令牌样式入页（8 张全局表）。
- 官方组件可见：ui-sidebar 面板导航 `#root nav[aria-label]` 渲染可见（e2e `toBeVisible`）。
- 产品 client 插件掌舵链通：`__DSH_BOOT__` 追加行 → 模块系统预取装载 `forge-client.js` →
  `__ModuleLoader__.load` 注册 → Loader 激活（`__DSH_FORGE_CLIENT__` 标记，e2e 断言）。
- carrier RPC 往返：`__DSH_TRANSPORT__ = {ownsHost, streamBaseUrl}` 就位；连接层 `/api` 通道
  `POST api/session/list`（文档相对路由 → 壳 scheme → Host 转发 + cookie）返回 `server-response`
  信封 `result.ok=true`。

载体链（本任务落地，官方 desktop 母本模式）：host `authenticateWebHost`（认证 URL → 303 →
cookie）+ 自定义 scheme（资产服务 dist / 其余转发）+ ws 升级改写栏（origin→Host origin +
cookie + sec-fetch-site）。

## 2. 契约面清点（G1 第 5 项逐包）

### 2.1 `@deepseek-ai/dsh-client-ui-chat`（0.2.0-rc.2）

**注册面（mount 面）**——`ctx.slots.register` 进 `conversation.view` 槽（list 类，id=`chat`，order=0）：

```ts
ctx.slots.register({
  name: 'conversation.view', id: 'chat', order: 0, label: () => t('view.chat'), locale: 'chat',
  children: {
    'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: CHAT_NODE_INJECT },
    'conversation.message.images': { kind: 'single', scope: 'session' },
  },
  store: chatStore,                        // EngineStoreHandle<ChatStoreState, ChatActions>
  inject: (sessionId: SessionId): ChatViewInjected => { … },   // 每会话注入面
}, ChatView)                               // 视图组件本体（ChatViewSlotProps 组装）
```

**ChatViewInjected（mount props 注入面，逐字段）**：
- `hooks.presentation: ObservableSnapshot<ChatPresentationPolicy>`（工作明细模式派生）
- `keyedHooks.chatNode(key) → ChatNodeSource` / `chatNodeProcess(key) → ChatNodeProcessSource` /
  `chatGroup(key) → ObservableSnapshot<GroupSnapshot<ConversationGroupData<'chat'>>>|undefined`
- 动作面：`openSkill(name)` / `openExternalLink(url)` / `openFile(path,{line?})`（右栏 Sidebar
  `dsh-resource://file/session/<id>/<path>` 寻址，行号走 params）/ `loadOlder()` /
  `loadThrough(seq)`（跳转加载页）/ `loadImage`（会话授权图载 + `peek` 同步缓存读）/
  `chatScroll.{save,read}`（锚键滚动位）/ `forkAt(seq)`（会话分叉）/ `fileMentions(owner)`

**ChatViewSlotProps** = `PropsRuntime<'conversation.view'> & PropsRenderSlots<'conversation.chat.node'|'conversation.message.images'> & PropsStore<ChatStore> & InjectFace<ChatViewInjected> & PropsLocale<'chat'>`

**子槽（Chat 自有 SlotMap 行）**：
| 槽 | kind/scope | owner |
|---|---|---|
| `conversation.chat.node` | keyed(session) by `ChatNodeKind` | `ChatNodeOwnerProps`（groupPart/cwd/openSkill/openFile/inspectCall/forkAt/loadImage/renderMessageImages/fileMentions/turnProcess?） |
| `conversation.chat.commandview` | keyed(session) by 命令名 | `CommandRowOwnerProps {node, compaction?}` |
| `conversation.chat.turnTail` | list(session) | `TurnTailOwnerProps {turn, seq, openFile}` |
| `conversation.chat.assistant-actions` | list(session) | `AssistantActionOwnerProps {messageId}` |
| `conversation.message.images` | single(session) | `MessageImagesOwnerProps {images, loadImage, align, compact?, thumbnail?}` |
| `shell.quota-notice` | chain(root) | `QuotaNoticeOwnerProps {code, message, dismiss, keepOpen}` |

**转录数据源**：`ctx.sessions.binding(sessionId)`（会话绑定 + 分页 `loadOlder/loadThrough`）→
Chat 目标快照 `ChatSnapshot`：
`{ order: string[]; nodes: ChatNodeStore（keyed 源 + turnDataSource(turn,kind)）; locations: ChatLocationNodeIndex; navigation: ChatTurnNavigationIndex（TurnNavigationItem{turn,anchorKey,prompt,response}）; timeline: ConversationTimelineSnapshot; legacy: LegacyConversationSlice }`
消费面 = `SessionStandardProps.useChat`（选择器 hook）。转录视图模式 4 档
`compact|standard|detailed|verbose`（`ChatSettings.transcriptView`，volatile 设置行
`settings.general.item` + `TranscriptViewRowProps`）。

**轨迹（turn-process）面**：`TurnProcessSpec {turn, controlAnchorSeq, processStartSeq, answerAnchorSeq, answerStep, inlineReasoning, messageCount, toolCallCount, subagentCount}` +
`ChatTurnProcessPresentation {turn, spec, turnStarted, turnClosed, hasExternalProcess, hasInterleavedInput, compactAnswer}`；
渲染态 `TurnProcessOwnerProps {hasContent, spec, foldable, open, setOpen}`；常开判据
`turnProcessAlwaysOpen`（open/aborted/error 回合不可整回合折叠）；子代理委派识别
`isSubagentDelegationTool`（`subagent` / `subagent_*` 前缀）。

**dsh.client 声明**：`inject` 12 包（session-controller / workspace-controller / locale /
ui-conversation / ui-input-trigger / ui-layout / ui-renderer / ui-session / ui-settings /
ui-sidebar-right / ui-workspace），`platform: web`。

### 2.2 `@deepseek-ai/dsh-client-ui-conversation`（0.2.0-rc.2）

**服务注入面**：`inject = ['slots','sessions','fileUpload','uiSession','uiWorkspace','locale','configForms']`。

**槽面（SlotMap 行，会话壳全家）**：
| 槽 | kind/scope | 说明 |
|---|---|---|
| `main.conversation` | single(session-maybe) | 根级主面板会话壳 |
| `conversation.session` | single(session) | 会话体（owner `{view?}`） |
| `conversation.view` | **list(session)** | **注册目标视图，逐个渲染**（ViewTab {id,label}） |
| `conversation.header` / `conversation.header.leading` | single(session-maybe/root) | 常驻导航容器 / 全局前导 |
| `conversation.session.header`（+ `.lineage`/`.actions`/`.utilities`/`.corner`） | single/list(session) | 会话头（标题/血统/动作/工具/角位） |
| `conversation.composer` | chain(session) | 编辑器替换链 |
| `conversation.hero.workspace`/`hero.brand.mark`/`hero.agentPreset` | single | 空会话 Hero 件 |
| `conversation.input.dock`/`input.overlay`/`composer.dock` | list(session) | 输入区 docking 位 |

**视图态（mount 状态面）**：`ViewTab {id,label}`（label 缺省取 entry id）；偏好
`ConversationStoreState {draft, view: string|null, viewRequest: {view, focus}|null}`
（draft 持久跨会话切换；`view=null` → 解析到 chat；`viewRequest` 一次性聚焦请求，目标视图
消费确认）。视图解析：`resolveActiveView(tabs, selectedId)`——偏好失效回退 `chat`
（`DEFAULT_VIEW_ID='chat'`；`TRAJECTORY_VIEW_ID='trajectory'`）。

**数据源（转录组装）**：`ConversationController`（`ctx.uiConversation`，`IConversation`）——
`binding(SessionBinding).target(id)` 取目标视图快照；视图定义 = `ConversationViewDefinition`
（`ConversationEventDefinitions` 事件投影 + `ConversationViewBuilder`）经
`ConversationNodeAssembler`/`ConversationDefinitionRegistry` 组装；分页归 `sessions`
（`loadOlder`/`loadThrough`）。快照登记：`ConversationViewSnapshotMap`（按 target 扩展：
`chat: ChatSnapshot`、`trajectory: TrajectorySnapshot`）。

**转录节点面**（wire 类型）：`ConversationNode` 族 = UserMessage/SteeringMessage/AssistantMessage/
PartialAssistant/Command/CompactionSummary/ContextMessage/ModelRetry/ToolResult/StartedToolCall/
PreparingToolCall/RunningToolCall/TurnError/TurnMaxTokens/UnknownSurface/TodoItem；位置索引
`ConversationLocation`（turn/step 两型）；`TurnLocation`/`StepLocation`。

### 2.3 `@deepseek-ai/dsh-client-ui-trajectory`（0.2.0-rc.2）——官方「轨迹」tab

- **挂载**：`conversation.view` 槽一项（id=`trajectory`）；`inject =
  ['slots','sessions','uiSession','uiConversation','locale']`，无自有服务。
- **数据源**：`ctx.uiConversation.binding(binding).target('trajectory')` → `TrajectorySnapshot`：
  `{systemPrompts?, eventNodes: ConversationNode[], eventLocations: Map<seq, ConversationLocation>,
  requests: RequestView[], callSchemas: Map<name, toolSchema>, partial, runningCalls}`——由
  `trajectory-snapshot-builder` 将 `TrajectoryConversationViewNode
  {target:'trajectory', anchorSeq, location, data: TrajectoryContribution}` 投影聚合。
- **贡献类型 8 类**：`system-prompt` / `node` / `assistant{node?, partial, request?}` / `tool{root}`
  / `request-header{seq,time,prompt,change?,location}` / `compaction{request}` /
  `session-end{seq,time}` / `turn-end{turn,time,error?,errorCode?}`。
- **消费面**：`SessionStandardProps.useTrajectory`（选择器 hook）；图像组槽
  `conversation.trajectory.images`（single，`MessageImagesOwnerProps`）。
- **对 2.11 的选型输入**：官方轨迹 tab = 会话事件投影（Event→Contribution 聚合）；
  产品「召回轨迹」tab 数据源 = `forge:knowledge/sessionRecall`（knowledge_recall_logs，RPC）。
  挂载形态二选一：(a) 自有 views/session 三 tab 组装（PRD 既定，自有面板）；(b) 官方
  `conversation.view` 槽位注册（融入官方会话壳 tab 栏）。**建议 (a)**（PRD 三 tab 组装为
  UF-4 既定形态；(b) 需官方会话头 tab 栏让位，与三区工作台布局冲突）——终裁归 2.11 任务。

### 2.4 `@deepseek-ai/dsh-client-ui-theme`（0.2.0-rc.2）

- `dsh.client`：`inject` 5 包（connection / locale / ui-renderer / ui-settings / api-remotes），
  `platform: web`，**`immediately: true`**（stage-one 预取层）。
- **令牌面**：激活时 `installThemeStyles` 注入 8 张全局样式（base / corner-shape /
  design-platform / focus / onboarding / scrollbar / gradient-shadow-text / shiki），即
  `--dsw-static-*`（design-platform）/ `--dsw-alias-*` / `--dsw-radius-*`（base.css :root，
  另含 `--dsw-font-family`/`--dsw-font-family-brand`）——产品样式令牌唯一供体（lint-tokens 面）。
- 静态引入面：`@deepseek-ai/dsh-client-ui-theme/brand-font.css`（壳入口 import，Montserrat）。
- 主题联动：light/dark/system + 字号偏好（AppearanceRow / FontSizeRow 设置行，
  `settings.general.item`），产品不自维护主题态（样式纪律第 5 条的机制面）。

### 2.5 `@deepseek-ai/dsh-client-ui-dockkit`（0.2.0-rc.2）

**非 boot 插件**——零 cordis 静态库（"Docking layout kit: split-tree engine … zero cordis"），
经壳静态装配线消费（`PLATFORM_MODULES` 模块表种子，单实例由壳供）。面：
`DockController`（+ `DockControllerOptions`/`DockSnapshot`）· `applyOp`/`replay`/`History`
（可逆操作引擎）· `DockSurface`/`DockLayout`（`DockSurfaceProps`）· `FloatLayer` ·
`createInitialState`/`createIdMinter` · 契约 `DockIntents`/`DockLabels`/`TabRenderer`/
`TabMenuExtras`。右栏 dock（知识抽屉/文档页签）2.6+ 消费此面。

## 3. G1 pin 池第 5 项回填结论

**回填（tech-design Appendix 契约面清单第 5 项）**：官方 ui-* props 已清点入池——
①ui-chat `conversation.view` 注册面（id/chat/order/children/store/inject(sessionId) 全字段）与
`ChatViewInjected` 12 成员；②ui-conversation 槽面全集 + `ConversationStoreState` 视图偏好/
聚焦请求语义 + `uiConversation.binding().target()` 快照通道；③ui-trajectory
`TrajectorySnapshot`/`TrajectoryContribution` 8 类契约；④ui-theme 令牌供体面（8 张样式表 +
`immediately` 预取）；⑤ui-dockkit 静态库面（非插件）。**pin 测试入池**：2.13/3.9 以本文档
为源，对 `dsh.client` 声明（inject 平台清单）与槽名做常量 pin（防上游漂移）。

## 4. 残留清单（显式列出）

| # | 残留 | 处置 |
|---|---|---|
| 1 | `sidebar`/`sidebar.workspaces` 槽位 injected props（G1 第 3 项）——本次未清点（槽位替换 = S3 spike + 任务 2.7 范围） | S3/2.7 清点入池 |
| 2 | Gateway WebSocket（`/api/remote.mux`）通道级往返未单测——本任务已装 ws 改写栏并证 HTTP RPC 往返；流式面由官方 UI 会话链路实跑消费 | 2.14 冒烟迁移 + SC6 dogfood 验证 |
| 3 | HMR 全图 `sync` 会以宿主最新图替换 desired——掌舵追加的产品行会被 reconciled 掉。产品组合静态（随应用发版），P1 无 HMR 面；若上游启用需壳侧 re-steer | 观察项（上游升级窗核查） |
| 4 | locale 面（`t()` 命名空间注入、`LocaleNamespaceMap` 扩展）细节 | 2.x 视图任务展开时随需入池 |
| 5 | `ConversationTimelineSnapshot`/`ConversationTurnDataMap` 深层 wire 形状（2.11 若需逐行轨迹渲染再入池） | 2.11 按需 |
| 6 | 官方 e2e 走查断言池（smoke 196 骨架组）——ui-* 可见性断言的官方母本选型 | 2.14 迁移时定池 |

## 5. Open Question ① 处置

**关闭**：ui-chat / ui-conversation 的 mount props 与转录面（轨迹 tab 数据源）契约已逐项清点
（本文档 §2），G1 第 5 项回填完成（§3）；残留按 §4 显式列出并各归处置任务——不再是开放问题。
