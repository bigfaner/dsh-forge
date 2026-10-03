// 对话 tab 官方会话面嵌入（定位：装配——S2 §2.1/§2.2 嵌入配方，upstream ui-subagent
// sidebar-chat（FixedChatConversationView / ConversationSlotPanel）同型先例）：
//   conversation.content 工厂（variant=embedded，相位 hero/active）×
//   conversation.session owner view='chat'（固定 chat 视图选择件）。
// Hard Rule 官方件复用：零自绘会话 UI——转录/输入/草稿/滚动位全由官方面自持
// （ConversationStoreState.draft 跨会话持久 + chatScroll 锚键，S2 §2.2）。
// kit 面 = main.conversation 占用者运行期注入（官方 PropsRuntime 消费切片）：
// useSession/useSessions 观察钩子 + renderFactorySlot 工厂渲染器；缺席任一 = 降级占位
// （非壳载体/单测——不炸壳）。装配持有运行期绑定（2.11 README 数据契约「对话 tab」行）。
// 残留（2.13/2.14）：ChatSnapshot wire 判别值 → TranscriptEntry 语义类映射已随 fix-11 接线
// （WorkbenchPanel.transcriptOfChatSnapshot——useConversation 标准钩子 + legacy 兼容切片，
// 随实跑入 G1 pin 池）；conversationPhase 完整相位（settling）仍待锚定。
import type { ReactNode } from 'react'
import './workbench.css'

/** 官方 kit 观察钩子窄面（上游 SnapshotSelectorHook 消费切片——结构同型镜像，禁 import 上游运行期包） */
export type KitSelectorHook = (selector: (state: never) => unknown) => unknown

/** 官方工厂槽渲染器窄面（上游 renderFactorySlot 消费切片——name/props/overrides） */
export type KitFactorySlotRenderer = (
  name: string,
  props?: Record<string, unknown>,
  options?: { readonly slots?: Record<string, unknown> },
) => ReactNode

/** ChatSurface 依赖的 kit 成员（缺席任一 = 降级占位） */
export interface ChatSurfaceKit {
  /** 当前会话锚（session-maybe：undefined = 无选中会话 → 官方 hero 相位承载空会话引导） */
  readonly sessionId: string | undefined
  readonly useSession: KitSelectorHook
  readonly useSessions: KitSelectorHook
  readonly renderFactorySlot: KitFactorySlotRenderer
}

/** 会话账本窄形状（上游 SessionListState.byId 消费切片——blank/displayTitle 查询用） */
export interface SessionsStateMirror {
  readonly byId?: Readonly<Record<string, { readonly blank?: boolean; readonly displayTitle?: string }>>
}

/** 会话行窄形状（上游 Session 消费切片——openState 相位用） */
export interface SessionStateMirror {
  readonly openState?: string
}

/**
 * 官方会话面相位推导（纯函数，fix-9 起 ChatSurface 与 SessionToolbarLive 共用）：
 * hero = 无选中会话，或会话已打开且仍空白（官方 hero 相位承载空会话引导——UF-4 States 委托；
 * 官方 ConversationMainPanel 消费切片的最简面）。
 */
export function chatHeroOf(input: {
  readonly sessionId: string | undefined
  readonly openState: string | undefined
  readonly blank: boolean | undefined
}): boolean {
  return input.sessionId === undefined || (input.openState === 'open' && input.blank === true)
}

/** 工厂视图选择件（固定 chat 视图——upstream FixedChatConversationView 同型） */
function FixedChatConversationView(
  props: { readonly renderSlot?: (name: string, owner?: Record<string, unknown>) => ReactNode } & Record<string, unknown>,
): ReactNode {
  return props.renderSlot?.('conversation.session', { view: 'chat' }) ?? null
}

/** kit 缺席降级占位（官方会话面未注入——装配断裂可见但不炸壳） */
export function ChatSurfaceAbsent(): ReactNode {
  return (
    <div className="dswf-chat-absent" data-dswf-chat="absent">
      对话面装配缺席（官方会话面未注入）
    </div>
  )
}

/**
 * 对话 tab 内容（官方嵌入配方）。相位推导取官方 ConversationMainPanel 消费切片的最简面：
 * hero = 无选中会话，或会话已打开且仍空白（官方 hero 相位承载空会话引导——UF-4 States 委托）。
 */
export function ChatSurface({ kit }: { readonly kit: ChatSurfaceKit }): ReactNode {
  const sessionId = kit.sessionId
  const session = kit.useSession((s) => s) as SessionStateMirror | undefined
  const blank =
    sessionId === undefined
      ? undefined
      : (kit.useSessions((s) => (s as SessionsStateMirror | undefined)?.byId?.[sessionId]?.blank) as
          | boolean
          | undefined)
  const hero = chatHeroOf({ sessionId, openState: session?.openState, blank })
  return kit.renderFactorySlot(
    'conversation.content',
    { variant: 'embedded', phase: hero ? 'hero' : 'active', hero },
    { slots: { views: FixedChatConversationView } },
  )
}
