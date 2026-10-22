# PROVENANCE —— official-chatview 复制件清单与漂移政策

## 用户裁决（2026-10-22，1.28）

官方 dsh 源码仓库在本地 `Z:\project\github\deepseek-harness`，直接复制官方 chat-view 渲染层源码实现替身**不算 vendor**（fix-12 同口径裁决扩展）。源码复制径经用户裁决放行：**漂移责任自担，升级须人工 re-copy**。

## 版本锚

| 项 | 值 |
|---|---|
| 官方源位 | `packages/client/ui-conversation/src/client/**` + `packages/client/ui-chat/src/client/**` @ deepseek-harness |
| 官方版本 | 0.2.0-rc.2 |
| 版本锚 commit | `f059f01ce367748392d8f665c0705fb4302a626b` |
| 复制日期 | 2026-10-22 |
| 复制目标 | `packages/plugins/super-composer/src/client/official-chatview/` |

## 复制清单（逐文件头注同锚）

| 源位 | 复制位 | 适配 |
|---|---|---|
| `ui-conversation/src/client/skeleton/ConversationContent.tsx` | `skeleton/ConversationContent.tsx` | imports 重写（见下），体逐字未改 |
| `ui-conversation/src/client/skeleton/EmptyHero.tsx` | `skeleton/EmptyHero.tsx` | imports 重写，体逐字未改 |
| `ui-conversation/src/client/skeleton/ConversationRoot.module.css` | `skeleton/ConversationRoot.module.css` | 原样（构建期作用域化注入） |
| `ui-conversation/src/client/skeleton/HeroShell.module.css` | `skeleton/HeroShell.module.css` | 原样 |
| `ui-chat/src/client/chat/MessageItem.tsx` | `chat/MessageItem.tsx` | 消费子集裁剪（见下）+ imports 重写 |
| `ui-chat/src/client/chat/MessageItem.module.css` | `chat/MessageItem.module.css` | 原样 |
| `ui-chat/src/client/chat/MessageIconActions.tsx` | `chat/MessageIconActions.tsx` | imports 重写，体逐字未改 |
| `ui-chat/src/client/chat/MessageIconActions.module.css` | `chat/MessageIconActions.module.css` | 原样 |
| `ui-chat/src/client/chat/AssistantMarkdown.tsx` | `chat/AssistantMarkdown.tsx` | 消费子集裁剪（见下）+ imports 重写 |
| `ui-chat/src/client/chat/AssistantMarkdown.module.css` | `chat/AssistantMarkdown.module.css` | 原样 |
| `ui-chat/src/client/chat/ReasoningRow.tsx` | `chat/ReasoningRow.tsx` | imports 重写，体逐字未改 |
| `ui-chat/src/client/chat/ReasoningRow.module.css` | `chat/ReasoningRow.module.css` | 原样 |
| `ui-chat/src/client/chat/accessibility.module.css` | `chat/accessibility.module.css` | 原样 |
| `ui-chat/src/client/chat/message-chrome.ts` | `chat/message-chrome.ts` | imports 重写，体逐字未改 |
| `ui-chat/src/client/chat/use-calendar-day.ts` | `chat/use-calendar-day.ts` | import 后缀 .ts→.js，体逐字未改 |
| `ui-chat/src/client/chat/searchable-hidden.ts` | `chat/searchable-hidden.ts` | 原样 |
| `ui-chat/src/client/markdown-labels.ts` | `markdown-labels.ts` | imports 重写，体逐字未改 |

## 官方公开 npm 包直依赖（不复制）

- `@deepseek-ai/dsh-client-ui-primitives`（0.2.0-rc.2 精确 pin，既有依赖）：`projectUserText`（user-text 投影——quote mention/file chip/session chip 形状集单源）、`MarkdownText`、`FileTypeIcon`/`fileExtension`/`fileSizeText`、`StateDot`/`JsonBlock`/`TextShimmer`、官方图标族、`Tooltip`/`writeClipboard`/`DisclosureRow`/`FISH_LOGO_*`。

## 本地镜像面（不可达内部包——结构同型/逐字复制，非 vendor）

| 源位 | 镜像位 | 说明 |
|---|---|---|
| `ui-conversation/src/client/contract/slots.ts`（ConversationContentProps/ViewsProps/InputZone/renderSlot 面）+ `ui-chat/src/client/contract/slots.ts`（ChatNodeViewProps/OwnerProps/UseDisclosure/UsePresentation/AssistantBlock） | `contract/slots.ts` | 消费子集结构同型镜像（fix-12 政策） |
| `packages/util/workspace-path/src/index.ts`（workspaceTitleOf） | `workspace-path.ts` | 逐字复制（monorepo 内部包 npm 不可达） |
| `packages/api/workspace-controller/src/default-workspace.ts`（workspaceDisplayTitle/DEFAULT_WORKSPACE_DIRECTORY） | `workspace-path.ts` | 逐字复制（同上） |
| `dsh-client-ui-slots` Translate | 复用 `official-input/contract/translate.ts` | 结构同型 |
| `locale`（shared）+ `ui-chat/locale.ts` + `ui-conversation/locales.ts` zh 词典消费键 | `locale.ts` | 逐键同文 |

## 消费子集裁剪（MessageItem / AssistantMarkdown）

替身 eventSource 投影只产 user/assistant 文本消息（data-face `projectEventWindow`），不可达节点种类连同其闭包件一并裁剪，re-copy 时按头注重放：

- **MessageItem.tsx** 保留 `contentParts`/`UserStyleBubble`/`UserMessageNodeView`；删除 ModelRetry/TurnError/TurnMaxTokens/Unknown/Context/Compaction 节点视图与 `PendingSteeringBubble`/`PendingSubmissionBubble`（闭包件 CompactionItem/ContextInjectionRow 不复制）。
- **AssistantMarkdown.tsx** 保留 text/reasoning/image/unknown 块与 streaming/stopped 标记；删除 `localPathMediaUrl`/prose `mentions`（fileMentions 源替身不可达）。

## imports 适配政策

- 公开 npm 包直依赖；react 家族维持 bundle external 单实例（Invalid hook call 红线）；无 lexical 依赖（chatview 渲染链不用 lexical——MarkdownText 在 primitives 内）。
- `.module.css` 全部经 bundle 期 `scopeOfficialCss` 作用域化 `[data-dscf-official-input]`——chatview 子树必须渲染在该属性锚内（`surrogate-chatview.tsx` 胶水负责）。
- 相对 imports 保持官方目录形状（`skeleton/`、`chat/`、`contract/`），后缀 `.ts`→`.js`；re-copy 时可直接覆盖后重放 imports 适配；适配改动一律以 `PROVENANCE 适配` 注释就地标记。

## 漂移看护

- 复制件与官方版本锚 commit 写死；官方升级 = **人工 re-copy**（对照本清单逐文件复制 + 重放 imports 适配与裁剪），不做自动同步。

## 本包自建（非复制，装配胶水）

`surrogate-chatview.tsx`——替身消息流装配层：以注入面（stub 快照店 + renderSlot 缝）宿主 `ConversationContent` 复制件，`conversation.session` 槽渲染消息行（user → MessageItem 气泡、assistant → AssistantMarkdown 块），`conversation.composer.bar` 槽承载官方 InputBar 复制件（fix-12 SurrogateComposer），滚动吸底钉在官方 `[data-conversation-scroll]` scrollport。
