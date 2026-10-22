// surrogate-chatview —— 替身消息流装配层（official-chatview 复制件的宿主胶水——本包自建）。
//
// 职责（1.28 用户裁决：渲染层升级官方 ConversationContent.tsx 复制件）：为复制件
// ConversationContent 组装注入面——stub 快照店（workspaces/sessionStatus/sessions/
// input/composerBlock 替身不可达 = 零值）+ renderSlot 缝（'conversation.session' 渲染
// 消息行、'conversation.composer.bar' 承载官方 InputBar 复制件 SurrogateComposer、
// 其余槽位 null——不申请官方槽位授权，declaring-is-claiming 红线同 fix-12）。
//
// 消息行 = 官方渲染闭包：user → MessageItem 复制件（UserStyleBubble——projectUserText
// user-text 投影，quote mention `〔引用：..〕` 形状集零命中纯文本、与官方 chat-view 同
// 源形态）；assistant → AssistantMarkdown 复制件（MarkdownText——流式增量/cursor 官方
// 同源）。数据面 = 既有 data-face streamProjection（durable 窗口 + loadOlder 分页缝 +
// live-chunk 聚合）零改动对接。
//
// 滚动吸底：钉在复制件官方 scrollport `[data-conversation-scroll]`（ConversationContent
// 的 .scrollBody）——快照增量上屏后 scrollHeight 吸底，与官方 ChatView follow 同语义
//（无用户滚动位置记忆——替身消息流保持既有无条件吸底行为，零回归口径）。
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createSnapshotStore, type SnapshotStore } from '../official-input/store.js'
import { chatviewTranslate } from './locale.js'
import { ConversationContent } from './skeleton/ConversationContent.js'
import { UserMessageNodeView } from './chat/MessageItem.js'
import { AssistantMarkdown } from './chat/AssistantMarkdown.js'
import type {
  ChatPresentationPolicy,
  ChatTranslate,
  ConversationContentProps,
  RenderSlot,
  RenderSlotChain,
  RenderMessageImages,
  UseDisclosure,
  UsePresentation,
} from './contract/slots.js'

/** 替身消息投影（data-face streamProjection 切片——与 mini-composer 同型）。 */
export interface ChatViewMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** 替身装配属性面。 */
export interface SurrogateChatViewProps {
  /** 当前会话消息流（durable + 流式增量——data-face streamProjection） */
  readonly messages: readonly ChatViewMessage[]
  /** 流式进行中（末条 assistant 行 MarkdownText streaming cursor） */
  readonly streaming: boolean
  /** composer 槽渲染（官方 InputBar 复制件宿主 SurrogateComposer——缺席 = 空槽） */
  readonly composerBar?: ReactNode
}

/** 消息文本 → 官方 AssistantBlock 投影（替身只产 text 块）。 */
export function assistantBlocksOf(content: string): readonly { readonly kind: 'text'; readonly text: string }[] {
  return content === '' ? [] : [{ kind: 'text', text: content }]
}

// ── stub 快照店（替身不可达的 ConversationContent 注入面——零值恒定） ──

const stubSession = createSnapshotStore<unknown>(undefined)
const stubSessionStatus = createSnapshotStore(new Map<string, { readonly pendingInteraction?: unknown }>())
const stubSessions = createSnapshotStore<{ byId: Record<string, { cwd?: string }> }>({ byId: {} })
const stubWorkspaces = createSnapshotStore<{ phase: 'ready'; items: [] }>({ phase: 'ready', items: [] })
const stubInput = createSnapshotStore<unknown>(undefined)
const stubComposerBlock = createSnapshotStore<{ reason: string } | undefined>(undefined)
const stubPresentation = createSnapshotStore<ChatPresentationPolicy>({ settledReasoningPreview: false })

/** 快照店 → 官方 SnapshotSelectorHook 同形 hook。 */
function bindStore<T>(store: SnapshotStore<T>): <S>(selector: (snapshot: T) => S) => S {
  return (selector) => selector(useSyncExternalStore(store.subscribe, store.getSnapshot))
}

const noRenderMessageImages: RenderMessageImages = () => null
const noop = (): void => undefined

/**替身 disclosure 缝（ReasoningRow 独立开合——本地 useState 官方 UseDisclosure 同形）。 */
function useSurrogateDisclosure(): ReturnType<UseDisclosure> {
  const [expanded, setExpanded] = useState(false)
  return { expanded, setExpanded, toggle: () => { setExpanded((open) => !open) } }
}

/** 末条 assistant 且流式中 = 官方 streaming cursor 语义行。 */
function AssistantRow(props: { content: string; streaming: boolean; t: ChatTranslate }): React.JSX.Element {
  const useDisclosure = useSurrogateDisclosure
  return (
    <AssistantMarkdown
      blocks={assistantBlocksOf(props.content)}
      streaming={props.streaming}
      useDisclosure={useDisclosure}
      usePresentation={bindStore(stubPresentation) as unknown as UsePresentation}
      renderMessageImages={noRenderMessageImages}
      t={props.t}
    />
  )
}

/** 消息流行渲染（复制件官方渲染闭包——零自绘气泡）。 */
export function ChatRows(props: { readonly messages: readonly ChatViewMessage[]; readonly streaming: boolean }): ReactNode {
  const lastAssistant = props.streaming
    ? props.messages.map((m) => m.role).lastIndexOf('assistant')
    : -1
  return props.messages.map((message, index) => (
    <div key={message.id} data-chat-node data-role={message.role}>
      {message.role === 'user' ? (
        <UserMessageNodeView
          node={{
            data: { content: message.content === '' ? [] : [{ type: 'text', text: message.content }] },
            location: { kind: 'log' },
          }}
          renderMessageImages={noRenderMessageImages}
          openFile={noop}
          openSkill={noop}
          t={chatviewTranslate}
        />
      ) : (
        <AssistantRow content={message.content} streaming={index === lastAssistant} t={chatviewTranslate} />
      )}
    </div>
  ))
}

/**
 * 替身消息流 = 官方 ConversationContent 复制件（scrollBody + sticky composerSeat 官方
 * 布局）。渲染必须落在 [data-dscf-official-input] 锚内（bundle 期 css-module 插件把
 * 复制件样式作用域化到该属性——本组件自带锚，嵌套于替身输入区锚内亦合法）。
 */
export function SurrogateChatView(props: SurrogateChatViewProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { messages, streaming } = props

  // 滚动吸底（快照增量上屏后钉在官方 scrollport 底部）。
  useEffect(() => {
    const scroller = rootRef.current?.querySelector('[data-conversation-scroll]') ?? null
    if (scroller !== null) scroller.scrollTop = (scroller as HTMLElement).scrollHeight
  }, [messages, streaming])

  const renderSlot = ((name: string): ReactNode => {
    if (name === 'conversation.session') {
      return <ChatRows messages={messages} streaming={streaming} />
    }
    if (name === 'conversation.composer.bar') {
      return props.composerBar ?? null
    }
    return null
  }) as unknown as RenderSlot
  // PROVENANCE 适配：官方 renderSlotChain 由替身装配层承载——链上无 overlay 申报，恒回落 fallback。
  const renderSlotChain = ((name: string, slotProps: unknown, options: { fallback: ReactNode }): ReactNode =>
    options.fallback) as unknown as RenderSlotChain

  const contentProps: ConversationContentProps = {
    sessionId: 'surrogate',
    phase: 'active',
    variant: 'embedded',
    useSession: bindStore(stubSession),
    useSessions: bindStore(stubSessions),
    useSessionStatus: bindStore(stubSessionStatus),
    useWorkspaces: bindStore(stubWorkspaces),
    useInput: bindStore(stubInput),
    useComposerBlock: bindStore(stubComposerBlock),
    useFactorySlot: (name, fallback) => {
      void name
      // PROVENANCE 适配：官方 useFactorySlot 在运行期注入槽 props——views 槽需 renderSlot
      //（ConversationSessionView 消费）；本层把装配 renderSlot 注入 fallback 调用。
      const injected = ((slotProps?: Record<string, unknown>): ReactNode =>
        (fallback as (p: never) => ReactNode)({ renderSlot, ...slotProps } as never)) as never
      return injected
    },
    renderSlot,
    renderSlotChain,
    selectWorkspace: async () => noop(),
    t: chatviewTranslate,
  }

  // composer 槽渲染：官方 composerStack（composerSeat sticky 承载）——SurrogateComposer
  // 复制件宿主由挂载方组装传入。
  return (
    <div
      ref={rootRef}
      data-testid="dscf-messages"
      data-streaming={props.streaming ? "true" : undefined}
      data-dscf-official-chatview=""
      data-dscf-official-input=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '40vh',
        minHeight: 140,
        borderTop: '0.5px solid var(--dsw-alias-border-l2)',
        overflow: 'hidden',
      }}
    >
      <ConversationContent {...contentProps} />
    </div>
  )
}
