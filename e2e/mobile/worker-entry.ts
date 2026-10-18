// 1.17 worker 会话双形态 e2e 探针入口（走查取证构建用）：
// 真组件 createWorkerListView + createWorkerSessionView
// （fake rpc = forge:proxy/session-list；fake api prompt 捕获；fake getEvents/subscribe 镜像帧馈送）。
// window.__probe 钩子供 spec 驱动（openList/openWorker/exit）。
import type { OfficialApi } from '../../apps/mobile/src/core/api.ts'
import type { RemoteRpc, RpcResult } from '../../apps/mobile/src/core/rpc.ts'
import type { WireEvent } from '../../apps/mobile/src/core/wire.ts'
import { createWorkerListView, createWorkerSessionView, type WorkerSessionHandle } from '../../apps/mobile/src/views/worker.ts'

// 父会话日志：subagent/catalog 双 worker（continuable + one-shot）
const parentEvents: WireEvent[] = [
  {
    type: 'subagent/catalog',
    seq: 1,
    time: 1,
    data: { version: 0, childId: 'w-continuable', childCreatedAt: 1, mode: 'continuable', label: '评审提案工程可行性' },
  } as WireEvent,
  {
    type: 'subagent/catalog',
    seq: 2,
    time: 2,
    data: { version: 0, childId: 'w-oneshot', childCreatedAt: 2, mode: 'one-shot', label: '跑定向测试' },
  } as WireEvent,
]

// session.list 行（官方 SessionSummary 视图——含非 worker 行与异父行）
const sessionRows = [
  { sessionId: 'main', origin: 'user', running: true, updatedAt: '2026-10-19T09:00:00Z' },
  { sessionId: 'w-continuable', parentSessionId: 'main', origin: 'subagent', running: true, updatedAt: '2026-10-19T09:01:00Z' },
  { sessionId: 'w-oneshot', parentSessionId: 'main', origin: 'subagent', running: false, updatedAt: '2026-10-19T08:00:00Z' },
  { sessionId: 'w-foreign', parentSessionId: 'other', origin: 'subagent', running: true, updatedAt: '2026-10-19T09:02:00Z' },
  { sessionId: 'plain', origin: 'user', running: false, updatedAt: '2026-10-19T09:03:00Z' },
]

const rpc: RemoteRpc = {
  async call<T>(channel: string): Promise<RpcResult<T>> {
    if (channel === 'forge:proxy/session-list') return { ok: true, data: { items: sessionRows } as T }
    return { ok: false, error: { code: 'unknown', reason: channel } }
  },
}

// 子会话日志：continuable worker 已有一轮产出
const childEvents: Record<string, WireEvent[]> = {
  'w-continuable': [
    {
      type: 'user/message',
      seq: 1,
      time: 1,
      data: { content: [{ type: 'text', text: '评审任务简报：双形态收口' }], source: { kind: 'user' } },
    } as WireEvent,
    {
      type: 'assistant/message',
      seq: 2,
      time: 2,
      data: { message: { content: [{ type: 'text', text: '评审结论：链路成立，可续聊注入下一轮确认。' }] } },
    } as WireEvent,
  ],
  'w-oneshot': [
    {
      type: 'assistant/message',
      seq: 1,
      time: 1,
      data: { message: { content: [{ type: 'text', text: '一次性产出：17/17 通过。' }] } },
    } as WireEvent,
  ],
}

const prompted: { sessionId: string; text: string }[] = []
const api: OfficialApi = {
  listSessions: async () => ({ items: [] }),
  createSession: async () => ({ sessionId: 'x' }),
  history: async () => ({ entries: [], hasMore: false }),
  prompt: async (sessionId, text) => {
    prompted.push({ sessionId, text })
    return {}
  },
  cancel: async () => ({}),
  models: async () => ({}),
  selectModel: async () => ({}),
  pendingInteractions: async () => ({ items: [] }),
  answerInteraction: async () => ({}),
  cancelInteraction: async () => ({}),
  listWorkspaces: async () => ({ items: [] }),
  listAgentPresets: async () => ({ presets: [] }),
  selectAgentPreset: async () => ({}),
  executeCommand: async () => ({}),
  status: async () => true,
}

let current: { root: HTMLElement; dispose?: () => void } | null = null

function mount(handle: { root: HTMLElement; dispose?: () => void }): void {
  current?.dispose?.()
  current?.root.remove()
  current = handle
  document.querySelector('#app')!.appendChild(handle.root)
}

const listeners = new Set<(event: WireEvent) => void>()

;(window as unknown as { __probe: Record<string, unknown> }).__probe = {
  prompted,
  openList(): void {
    mount(
      createWorkerListView({
        rpc,
        parentSessionId: 'main',
        getEvents: () => parentEvents,
        onOpen: (sessionId) => {
          ;(window as unknown as { __probe: { openWorker(id: string): void } }).__probe.openWorker(sessionId)
        },
      }),
    )
  },
  openWorker(sessionId: string): void {
    // 镜像帧：getEvents 快照 + subscribe 转发（e2e 通过 pushFrame 注入流式增量）
    mount(
      createWorkerSessionView({
        sessionId,
        mode: sessionId === 'w-continuable' ? 'continuable' : 'one-shot',
        label: sessionId === 'w-continuable' ? '评审提案工程可行性' : '跑定向测试',
        api,
        getEvents: () => childEvents[sessionId] ?? [],
        subscribe: (onEvent) => {
          listeners.add(onEvent)
          return () => listeners.delete(onEvent)
        },
        onExit: () => {
          ;(window as unknown as { __probe: { openList(): void } }).__probe.openList()
        },
      }) as unknown as { root: HTMLElement; dispose?: () => void },
    )
  },
  pushFrame(event: WireEvent): void {
    for (const listener of [...listeners]) listener(event)
  },
  exitCurrent(): void {
    current?.root.remove()
    current = null
  },
}

;(window as unknown as { __probe: { openList(): void } }).__probe.openList()
