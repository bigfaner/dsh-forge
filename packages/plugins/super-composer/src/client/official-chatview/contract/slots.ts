/**
 * 官方 contract/slots 消费子集结构同型镜像（official-chatview 复制件本地支撑面）。
 *
 * PROVENANCE：官方源位
 *   - packages/client/ui-conversation/src/client/contract/slots.ts（ConversationContentProps /
 *     ConversationViewsProps / InputZone / RenderSlot / RenderSlotChain / UseStore 等）
 *   - packages/client/ui-chat/src/client/contract/slots.ts（ChatNodeViewProps / ChatNodeOwnerProps /
 *     UseDisclosure / UsePresentation）
 * 复制件不引入 dsh-client-ui-slots / dsh-client-ui-conversation 类型通道——按 fix-12 政策
 * 以消费面结构同型承载。官方版本锚 0.2.0-rc.2
 *（repo f059f01ce367748392d8f665c0705fb4302a626b，2026-10-22）。
 */
import type { ReactNode, RefObject } from 'react'
import type { Translate } from '../../official-input/contract/translate.js'

/** 官方 dsh-workspace/types WorkspaceId 同型镜像（复制件内字符串承载）。 */
export type WorkspaceId = string

/** 官方 PropsLocale Translate 消费子集（chat/conversation 命名空间键面）。 */
export type ChatTranslate = Translate
export type { Translate } from '../../official-input/contract/translate.js'

/** 官方 ChatViewSlotProps 消费子集（复制件只消费 t 座席）。 */
export interface ChatViewSlotProps {
  readonly t: ChatTranslate
}

/** 官方 renderSlot 消费子集（槽名 → 声明式渲染；复制件装配层自有实现）。 */
export type RenderSlot = ((
  name: 'conversation.hero.workspace',
  props: {
    readonly open: boolean
    readonly anchorRef: RefObject<HTMLButtonElement | null>
    readonly selectedId?: WorkspaceId | undefined
    readonly onPick: (workspaceId: WorkspaceId) => void
    readonly onClose: () => void
  },
) => ReactNode) & ((
  name: string,
  props: unknown,
  options?: { fallback?: ReactNode },
) => ReactNode)

/** 官方 useFactorySlot 消费子集（factory 槽——官方机械在运行期注入槽 props）。 */
export type UseFactorySlot = <P, R extends ReactNode>(
  name: string,
  fallback: (props: P) => R,
) => (props?: Partial<P> & Record<string, unknown>) => R

/** 官方 renderSlotChain 消费子集（链式槽——fallback 承载）。 */
export type RenderSlotChain = (
  name: string,
  props: unknown,
  options: { fallback: ReactNode; fallbackOnly?: boolean; overlay?: boolean },
) => ReactNode

/** 官方 useStore 快照选择器 hook 消费子集（dsh-client-store 结构同型）。 */
export type UseStore<T> = <S>(selector: (state: T) => S) => S

/** 官方 SnapshotSelectorHook 消费子集。 */
export type SnapshotSelectorHook<T> = <S>(selector: (snapshot: T) => S) => S

/** InputZone（ui-conversation contract/slots.ts:308 结构同型——消费子集）。 */
export interface InputZone {
  readonly session: unknown
  readonly input: unknown
}

/** ConversationViewsProps（ui-conversation contract/slots.ts:480 结构同型——消费子集）。 */
export interface ConversationViewsProps {
  renderSlot: RenderSlot
}

/** 会话状态快照消费切片（pendingInteraction 读取面）。 */
export interface SessionStatusSnapshot {
  get(sessionId: string): { readonly pendingInteraction?: unknown } | undefined
}

/** 工作区清单快照消费切片（chip 标题解析面）。 */
export interface WorkspacesSnapshot {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error'
  readonly items: readonly { readonly workspaceId: string; readonly title: string; readonly sessionIds: readonly string[] }[]
}

/** sessions 快照消费切片（cwd 读取面）。 */
export interface SessionsSnapshot {
  readonly byId: Readonly<Record<string, { readonly cwd?: string | undefined }>>
}

/** 会话快照消费切片（ConversationContent 只读 session 有无）。 */
export type SessionSnapshot = unknown

/** InputState 快照消费切片（useInput 全量读取）。 */
export type InputSnapshot = unknown

/** composer block 快照消费切片（block reason 面——替身恒无 block）。 */
export type ComposerBlockSnapshot = { readonly reason: string } | undefined

/**
 * ConversationContentProps（ui-conversation contract/slots.ts:474 FactoryComponentPropsOf
 * 结构同型——复制件实际消费字段全集，字段名逐一同官方；替身装配层供给全部注入面）。
 */
export interface ConversationContentProps {
  readonly sessionId?: string | undefined
  readonly phase?: 'settling' | 'hero' | 'active' | undefined
  readonly hero?: boolean | undefined
  readonly variant?: 'default' | 'embedded' | undefined
  readonly useSession: SnapshotSelectorHook<SessionSnapshot>
  readonly useSessions: SnapshotSelectorHook<SessionsSnapshot>
  readonly useSessionStatus: SnapshotSelectorHook<SessionStatusSnapshot>
  readonly useWorkspaces: SnapshotSelectorHook<WorkspacesSnapshot>
  readonly useInput: SnapshotSelectorHook<InputSnapshot>
  readonly useComposerBlock: SnapshotSelectorHook<ComposerBlockSnapshot>
  readonly useFactorySlot: UseFactorySlot
  readonly renderSlot: RenderSlot
  readonly renderSlotChain: RenderSlotChain
  readonly selectWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  readonly t: ChatTranslate
}

// ── ui-chat contract/slots 消费子集（MessageItem / AssistantMarkdown / ReasoningRow）──

/** 官方 OpenFileOptions 消费子集。 */
export interface OpenFileOptions {
  readonly line?: number
}

/** 官方 TurnTailOwnerProps 消费子集（fileMentions 解析 owner——替身无 mentions 源）。 */
export interface TurnTailOwnerProps {
  readonly turn: unknown
  readonly seq: number
  readonly openFile: (path: string, options?: OpenFileOptions) => void
}

/** 官方 ChatPresentationPolicy 消费子集（ReasoningRow preview 判据）。 */
export interface ChatPresentationPolicy {
  readonly settledReasoningPreview: boolean
}

/** 官方 UsePresentation 消费子集。 */
export type UsePresentation = SnapshotSelectorHook<ChatPresentationPolicy>

/** 官方 UseDisclosure 消费子集。 */
export type UseDisclosure = () => {
  readonly expanded: boolean
  readonly setExpanded: (open: boolean) => void
  readonly toggle: () => void
}

/** UserMessageNode content 块消费切片（contract/snapshot.ts 结构同型——文本/图/文件）。 */
export type UserContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly attachment: unknown }
  | { readonly type: 'file'; readonly attachment: { readonly name: string; readonly bytes: number } }
  | { readonly type: string; readonly [key: string]: unknown }

/** UserMessageNode 消费切片。 */
export interface UserMessageNode {
  readonly content: readonly UserContentBlock[]
}

/** 官方 MessageImageSource 消费切片（renderMessageImages 载荷）。 */
export interface MessageImageSource {
  readonly attachment?: unknown
  readonly preview?: { readonly url: string; readonly name?: string; readonly width?: number; readonly height?: number }
}

/** 官方 RenderMessageImages 消费子集（复制件装配层给 no-op）。 */
export type RenderMessageImages = (props: {
  readonly images: readonly MessageImageSource[]
  readonly align: 'start' | 'end'
  readonly compact?: boolean
}) => ReactNode

/** 官方 ChatNodeOwnerProps 消费子集（复制件消费字段全集）。 */
export interface ChatNodeOwnerProps {
  readonly groupPart?: string
  readonly cwd?: string | undefined
  readonly openSkill: (name: string) => void
  readonly openFile: (path: string, options?: OpenFileOptions) => void
  readonly renderMessageImages: RenderMessageImages
}

/** 官方 ChatNodeViewProps 结构同型（kind 参数仅作标签——复制件按裁剪面消费）。 */
export interface ChatNodeViewProps<Kind extends string = string> extends ChatNodeOwnerProps {
  readonly node: {
    readonly data: Kind extends 'user' | 'steering'
      ? UserMessageNode & { readonly referenceLabels?: readonly string[]; readonly time?: number }
      : unknown
    readonly location: { readonly kind: string }
  }
  readonly t: ChatTranslate
}

/** AssistantBlock 消费切片（ui-chat contract/snapshot.ts——替身只产 text/reasoning 块；
 * 其余种类保留形状供 unknown 落 JsonBlock）。 */
export type AssistantBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'reasoning'; readonly text: string }
  | { readonly kind: 'image'; readonly attachment: unknown }
  | { readonly kind: 'tool-call'; readonly block: unknown }
  | { readonly kind: 'unknown'; readonly block: unknown }
