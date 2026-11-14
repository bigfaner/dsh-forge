// conversation-views-face 注册面单测（bug：官方宿主 forge 事件折叠组恒不注册）：
// 官方 uiConversation 服务经 cordis inject 生命周期缝消费（官方 ui-plan/ui-conversation
// 同径核销——inject(['uiConversation'], cb) 服务在场激活、撤回自动退）；apply 时点服务
// 未提供 = 注册挂起（零 warn），服务后到即注册。工具行/标记行 slots 缝不受影响。
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

/** inject 生命周期缝替身：服务在场 cb 同步激活；缺席挂起，provide 后补激活 */
function fakeCtx(options?: { uiConversation?: unknown }) {
  const pending: Array<(scope: Record<string, unknown>) => void> = []
  let uiConversation: unknown = options?.uiConversation
  const activated: Array<(scope: Record<string, unknown>) => void> = []
  const ctx = {
    reflect: { get: (name: string) => (name === 'uiConversation' ? uiConversation : undefined) },
    inject: (deps: readonly string[], cb: (scope: Record<string, unknown>) => void) => {
      if (!deps.includes('uiConversation')) return undefined
      if (uiConversation !== undefined) {
        activated.push(cb)
        cb({ uiConversation })
      } else {
        pending.push(cb)
      }
      return () => {}
    },
    provideUiConversation: (svc: unknown) => {
      uiConversation = svc
      for (const cb of pending.splice(0)) {
        activated.push(cb)
        cb({ uiConversation: svc })
      }
    },
    pendingCount: () => pending.length,
  }
  return ctx
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

describe('事件折叠组 inject 生命周期缝（官方缝正道）', () => {
  it('服务后到时序钉：apply 时 uiConversation 未提供 = 挂起不注册零 warn；provide 后即注册两段定义', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots } = fakeSlots()
    const ctx = fakeCtx()
    const ui = fakeUiConversation()

    const result = register(ctx, slots)

    // apply 时点：服务缺席 = 挂起（inject cb 未激活），零 registration failed warn
    expect(result.registered).not.toContain(FORGE_EVENT_NODE_KIND)
    expect(ctx.pendingCount()).toBe(1)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("forge-event-group' registration failed"), expect.anything())

    // 服务后到：官方 ui-conversation 包晚于插件 apply 提供 → 补激活注册
    ctx.provideUiConversation(ui.service)
    expect(ui.registeredDefs).toHaveLength(2) // stream 状态机 + 组节点定义
    expect(result.registered).toContain(FORGE_EVENT_NODE_KIND)
    expect(warn).not.toHaveBeenCalled()
  })

  it('服务在场：apply 即注册（官方宿主服务先于插件 apply 的形态回归锚）', () => {
    const { slots } = fakeSlots()
    const ui = fakeUiConversation()
    const ctx = fakeCtx({ uiConversation: ui.service })

    const result = register(ctx, slots)

    expect(ui.registeredDefs).toHaveLength(2)
    expect(result.registered).toContain(FORGE_EVENT_NODE_KIND)
    expect(ctx.pendingCount()).toBe(0)
  })

  it('reload 序列：服务缺席重 apply = 仍挂起、不重复报 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots } = fakeSlots()
    for (let i = 0; i < 3; i++) {
      const ctx = fakeCtx()
      register(ctx, slots)
      expect(ctx.pendingCount()).toBe(1)
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('slots 缝行不受影响：dispatchTask 工具行 + worktree-switch 标记行恒注册', () => {
    const { slots } = fakeSlots()
    const ctx = fakeCtx()

    const result = register(ctx, slots)

    expect(result.registered).toContain(DISPATCH_TASK_TOOL_KEY)
    expect(result.registered).toContain(WORKTREE_SWITCH_ENTRY_ID)
  })

  it('ctx 无 inject 缝（结构劣形宿主）：reflect 现查路径保持 fail-soft 不炸装配', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { slots } = fakeSlots()
    const ctx: OfficialSeamCtx = {
      get: () => undefined,
      reflect: { get: () => undefined },
    }

    const result = register(ctx, slots)

    expect(result.registered).not.toContain(FORGE_EVENT_NODE_KIND)
    expect(result.registered).toContain(DISPATCH_TASK_TOOL_KEY)
    expect(warn).toHaveBeenCalled()
  })
})
