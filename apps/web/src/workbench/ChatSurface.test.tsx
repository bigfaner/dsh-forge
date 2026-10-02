// ChatSurface 单测 —— 官方会话面嵌入配方（S2 §2.1/§2.2，upstream ui-subagent 同型）。
// kit 观察钩子 = 普通函数窄面（非 React hook——快照选择器契约），SSR 直渲以伪 kit 驱动
// 相位推导与工厂调用面断言；FixedChatConversationView = 固定 chat 视图选择件 pin。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { ChatSurface, ChatSurfaceAbsent, type ChatSurfaceKit, type KitSelectorHook } from './ChatSurface.js'

/** 伪观察钩子（快照选择器契约：selector(state) → 投影值） */
const hookOver = <T,>(state: T): KitSelectorHook => (selector) => selector(state as never)

/** 工厂调用记录面：返回标记节点并捕获调用参数（嵌入配方断言锚） */
interface FactoryCall {
  name: string
  props?: Record<string, unknown>
  options?: { readonly slots?: Record<string, unknown> }
}
type FactoryRenderer = ChatSurfaceKit['renderFactorySlot']
function factoryRecording(calls: FactoryCall[]): FactoryRenderer {
  return (name, props, options) => {
    calls.push({ name, props, options })
    return <b data-t="factory-out" />
  }
}

/** 会话行窄形状驱动面（openState/blank 两轴；sessionId 显式 undefined 可驱动「无会话」轴） */
const sessionKit = (over: {
  readonly sessionId?: string | undefined
  readonly openState?: string
  readonly blank?: boolean
}): ChatSurfaceKit => ({
  sessionId: 'sessionId' in over ? over.sessionId : 's-1',
  useSession: hookOver({ openState: over.openState ?? 'open' }),
  useSessions: hookOver({ byId: { 's-1': { blank: over.blank ?? false } } }),
  renderFactorySlot: factoryRecording([]),
})

describe('ChatSurface 嵌入配方（conversation.content 工厂 × conversation.session view=chat）', () => {
  it('工厂调用 = conversation.content + variant=embedded + views 选择件注入（upstream 同型）', () => {
    const calls: FactoryCall[] = []
    renderToStaticMarkup(<ChatSurface kit={{ ...sessionKit({}), renderFactorySlot: factoryRecording(calls) }} />)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('conversation.content')
    expect(calls[0]!.props).toMatchObject({ variant: 'embedded' })
    expect(Object.keys(calls[0]!.options?.slots ?? {})).toContain('views')
    expect(calls[0]!.props).toHaveProperty('phase')
    expect(calls[0]!.props).toHaveProperty('hero')
  })

  it('相位推导：无选中会话 → hero（官方 hero 相位承载空会话引导）', () => {
    const calls: FactoryCall[] = []
    renderToStaticMarkup(
      <ChatSurface kit={{ ...sessionKit({ sessionId: undefined }), renderFactorySlot: factoryRecording(calls) }} />,
    )
    expect(calls[0]!.props).toMatchObject({ phase: 'hero', hero: true })
  })

  it('相位推导：会话已打开且空白（openState=open + blank=true）→ hero', () => {
    const calls: FactoryCall[] = []
    renderToStaticMarkup(
      <ChatSurface kit={{ ...sessionKit({ openState: 'open', blank: true }), renderFactorySlot: factoryRecording(calls) }} />,
    )
    expect(calls[0]!.props).toMatchObject({ phase: 'hero', hero: true })
  })

  it('相位推导：有内容的会话（blank=false）→ active；加载中（openState=loading）非 hero → active', () => {
    const open: FactoryCall[] = []
    renderToStaticMarkup(
      <ChatSurface kit={{ ...sessionKit({ openState: 'open', blank: false }), renderFactorySlot: factoryRecording(open) }} />,
    )
    expect(open[0]!.props).toMatchObject({ phase: 'active', hero: false })
    const loading: FactoryCall[] = []
    renderToStaticMarkup(
      <ChatSurface kit={{ ...sessionKit({ openState: 'loading', blank: true }), renderFactorySlot: factoryRecording(loading) }} />,
    )
    expect(loading[0]!.props).toMatchObject({ phase: 'active', hero: false })
  })

  it('views 选择件（FixedChatConversationView 同型）：renderSlot → conversation.session owner view=chat；缺席 → null', () => {
    const slots = renderToStaticMarkup(
      <ChatSurface kit={{ ...sessionKit({}), renderFactorySlot: (name, _props, options) => {
        const Views = (options?.slots?.views ?? {}) as { views?: unknown }
        void Views
        const views = options?.slots?.views as unknown as (props: unknown) => ReactNode
        return views({ renderSlot: (slotName: string, owner?: Record<string, unknown>) => <i data-slot={slotName} data-view={String(owner?.view)} /> }) as ReactNode
      } }} />,
    )
    expect(slots).toContain('data-slot="conversation.session"')
    expect(slots).toContain('data-view="chat"')
  })
})

describe('ChatSurfaceAbsent 降级占位', () => {
  it('kit 缺席 = 装配断裂可见占位（不炸壳）', () => {
    const markup = renderToStaticMarkup(<ChatSurfaceAbsent />)
    expect(markup).toContain('data-dswf-chat="absent"')
    expect(markup).toContain('对话面装配缺席')
  })
})
