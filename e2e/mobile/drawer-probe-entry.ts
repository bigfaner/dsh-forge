// drawer 双级未读 e2e 探针入口（mobile project spec 构建用）：
// 真组件 createDrawerView + fake rpc（grouped 载荷可变）+ file:// localStorage 游标。
// window.__probe 钩子供 spec 驱动：setPayload / writeCursor / payload。
import { createDrawerView, DRAWER_DISCONNECT_CHANNEL, DRAWER_GROUPED_CHANNEL } from '../../apps/mobile/src/views/drawer.ts'
import { readCursorKey, writeReadCursor } from '../../apps/mobile/src/core/read-cursor.ts'
import type { RemoteRpc, RpcResult } from '../../apps/mobile/src/core/rpc.ts'

const NOW = Date.now()
let payload: unknown = {
  generatedAt: NOW,
  projects: [
    {
      id: 'p1',
      name: 'dsh-forge',
      archived: false,
      worktrees: [{ path: 'Z:/wt/a', branch: 'main', isMain: true, present: true, worktreeName: null }],
      sessions: [
        { sessionId: 's-1', title: 'x', updatedAt: NOW - 1000, running: false, projections: { asOfSeq: 12, values: { title: '手机远程审批' } } },
        { sessionId: 's-2', updatedAt: NOW - 2000, running: false, origin: 'subagent', parentSessionId: 's-1', projections: { asOfSeq: 5, values: { title: 'worker-1' } } },
        { sessionId: 's-3', updatedAt: NOW - 3000, running: true, projections: { asOfSeq: 3, values: { title: '手机 UI 设计定稿' } } },
        { sessionId: 's-old', updatedAt: NOW - 25 * 60 * 60 * 1000, running: false, projections: { asOfSeq: 2, values: { title: '窗外旧会话' } } },
      ],
    },
    {
      id: 'p2',
      name: 'dispatch-loop-hardening',
      archived: false,
      worktrees: [],
      sessions: [{ sessionId: 's-4', updatedAt: NOW - 4000, running: false, projections: { asOfSeq: 7, values: { title: 'Job Object 进程树回收' } } }],
    },
  ],
  unassigned: [
    { sessionId: 's-9', updatedAt: NOW - 5000, running: false, projections: { asOfSeq: 4, values: { title: 'DSH 手机连接原理' } } },
    { sessionId: 's-8', updatedAt: NOW - 6000, running: false, projections: { asOfSeq: 2, values: { title: '另一条未归属' } } },
  ],
}

const rpc: RemoteRpc = {
  async call<T = unknown>(channel: string): Promise<RpcResult<T>> {
    if (channel === DRAWER_GROUPED_CHANNEL) return { ok: true, data: payload as T }
    if (channel === DRAWER_DISCONNECT_CHANNEL) return { ok: true, data: { revoked: true } as T }
    return { ok: false, error: { code: 'unknown', reason: channel } }
  },
}

const params = new URLSearchParams(location.search)
const pairDomain = params.get('pairDomain') ?? 'probe'

interface ProbeHooks {
  payload: unknown
  setPayload(next: unknown): void
  writeCursor(sessionId: string, seq: number): void
}
;(window as unknown as { __probe: ProbeHooks }).__probe = {
  get payload() {
    return payload
  },
  setPayload(next: unknown) {
    payload = next
  },
  writeCursor(sessionId: string, seq: number) {
    writeReadCursor(window.localStorage, readCursorKey(pairDomain), sessionId, seq)
  },
}

const app = document.querySelector<HTMLElement>('#app')!
app.appendChild(
  createDrawerView({
    rpc,
    fetchStatus: async () => ({ ok: true, tunnelExpiresAt: NOW + 60 * 60 * 1000 }),
    onOpenSession: (sessionId) => {
      ;(window as unknown as { __opened?: string }).__opened = sessionId
    },
    pairDomain,
    store: window.localStorage,
    pollMs: Number.parseInt(params.get('pollMs') ?? '', 10) || 15_000,
  }),
)
