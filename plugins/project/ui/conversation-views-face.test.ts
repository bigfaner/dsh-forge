// conversation-views-face 注册面单测（bug 2dde7c9e 第三修·候选 A 落修）：
// uiConversation 消费 = projectClient 静态 inject 边保证（entry fiber 依赖表——Loader 级
// 等待 + 后到补激活，官方 ui-secret-mask/ui-workflow-run 同配方先例）；face 内直接
// ctx.uiConversation.events.register——ctx.inject 生命周期缝与 reflect 现查兜底路径已退役
// （apply 期 ctx 形态不确定性的根源，官方宿主恒不注册判例）。uiConversation 属性缺席 =
// 劣形宿主 fail-soft（warn 不炸装配）。工具行/标记行 slots 缝不受影响。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISPATCH_TASK_TOOL_KEY,
  WORKTREE_SWITCH_ENTRY_ID,
  registerConversationToolFaces,
  type ConversationToolFacesDiagnostics,
  type OfficialSeamCtx,
} from './conversation-views-face.js'
import { FORGE_EVENT_NODE_KIND } from './event-node/forge-event-node.js'

// ── fake 官方面 ──

interface RegisterRow {
  key: string
  options: Record<string, unknown>
  component: unknown
}

function fakeSlots() {
  const rows: RegisterRow[] = []
  const slots = {
    inject: (key: string, cb: () => (() => void) | undefined) => {
      const dispose = cb()
      return () => dispose?.()
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      rows.push({ key: options['name'] as string, options, component })
      return () => {}
    },
  }
  return { rows, slots }
}

/** 静态边形态 ctx：uiConversation 以属性在场（inject 边解析产物）；零 inject/reflect 缝 */
function staticEdgeCtx(uiConversation: unknown): OfficialSeamCtx & { uiConversation?: unknown } {
  return { get: () => undefined, uiConversation } as OfficialSeamCtx & { uiConversation?: unknown }
}

function fakeUiConversation() {
  const registeredDefs: unknown[] = []
  return {
    service: { events: { register: (def: unknown) => { registeredDefs.push(def) } } },
    registeredDefs,
  }
}

function register(ctx: unknown, slots: unknown): ConversationToolFacesDiagnostics {
  return registerConversationToolFaces(ctx as never, slots as never)
}

afterEach(() => vi.restoreAllMocks())

describe('事件折叠组静态边直接注册（ctx.inject/reflect 兜底退役）', () => {
  it('服务在场（静态边解析形态）：apply 即注册两段定义，零 ctx.inject 依赖', () => {
    const { slots } = fakeSlots()
    const ui = fakeUiConversation()
    const ctx = staticEdgeCtx(ui.service)

    const result = register(ctx, slots)

    expect(ui.registeredDefs).toHaveLength(2) // stream 状态机 + 组节点定义
    expect(result.registered).toContain(FORGE_EVENT_NODE_KIND)
  })

  it('ctx 无 inject/reflect 缝也注册（旧生命周期缝路径退役回归钉——官方宿主恒不注册判例形态）', () => {
    const { slots } = fakeSlots()
    const ui = fakeUiConversation()
    // 劣形到只剩 uiConversation 属性：任何 inject/reflect 兜底残留都无法解释本通过
    const ctx = { uiConversation: ui.service }

    const result = register(ctx, slots)

    expect(ui.registeredDefs).toHaveLength(2)
    expect(result.registered).toContain(FORGE_EVENT_NODE_KIND)
  })

  it('服务缺席（劣形宿主）：fail-soft warn 不炸装配，事件组不注册、其余行不受影响', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots } = fakeSlots()
    const ctx = staticEdgeCtx(undefined)

    const result = register(ctx, slots)

    expect(result.registered).not.toContain(FORGE_EVENT_NODE_KIND)
    expect(result.registered).toContain(DISPATCH_TASK_TOOL_KEY)
    expect(result.registered).toContain(WORKTREE_SWITCH_ENTRY_ID)
    expect(warn).toHaveBeenCalled()
  })

  it('registered 诊断语义不变：组定义注册落座才记 forge-event-group（e2e 判定锚）', () => {
    // events.register 缺席的服务劣形 = 注册抛出 → 降级不记
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots } = fakeSlots()
    const ctx = staticEdgeCtx({ events: {} })

    const result = register(ctx, slots)

    expect(result.registered).not.toContain(FORGE_EVENT_NODE_KIND)
    expect(warn).toHaveBeenCalled()
  })

  it('slots 缝行不受影响：dispatchTask 工具行 + worktree-switch 标记行恒注册', () => {
    const { slots } = fakeSlots()
    const ui = fakeUiConversation()

    const result = register(staticEdgeCtx(ui.service), slots)

    expect(result.registered).toContain(DISPATCH_TASK_TOOL_KEY)
    expect(result.registered).toContain(WORKTREE_SWITCH_ENTRY_ID)
  })
})
