// hero 新会话 e2e 探针入口（走查取证构建用）：
// 真组件 createHeroView + fake rpc（worktree 清单 + session-create 守卫回执可变）+
// fake api（session.create/prompt）。window.__probe 钩子供 spec 驱动。
import { createHeroView, HERO_SESSION_CREATE_CHANNEL, HERO_WORKTREE_LIST_CHANNEL } from '../../apps/mobile/src/views/hero.ts'
import type { OfficialApi } from '../../apps/mobile/src/core/api.ts'
import type { RemoteRpc, RpcResult } from '../../apps/mobile/src/core/rpc.ts'

let guardResult: RpcResult<unknown> = { ok: false, error: { code: 'invalid-state', reason: 'worktree 不在场' } }
let lastSessionCreate: unknown

const listPayload = {
  isGit: true,
  entries: [
    { path: 'Z:/proj', branch: 'main', worktreeName: 'proj', isMain: true },
    { path: 'Z:/wt/fix-mobile-rpc', branch: 'fix/mobile-rpc', worktreeName: 'wt-fix' },
    { path: 'Z:/wt/feat-pin-durable', branch: 'feat/pin-durable', worktreeName: 'wt-feat' },
  ],
}

const rpc: RemoteRpc = {
  async call<T = unknown>(channel: string, payload: unknown): Promise<RpcResult<T>> {
    if (channel === HERO_WORKTREE_LIST_CHANNEL) return { ok: true, data: listPayload as T }
    if (channel === HERO_SESSION_CREATE_CHANNEL) {
      lastSessionCreate = payload
      return guardResult as RpcResult<T>
    }
    void payload
    return { ok: false, error: { code: 'unknown', reason: channel } }
  },
}

const api: OfficialApi = {
  listSessions: async () => ({ items: [] }),
  createSession: async (workspaceId) => ({ sessionId: `s-${workspaceId || 'main'}` }),
  history: async () => ({}),
  prompt: async () => ({}),
  cancel: async () => ({}),
  models: async () => ({}),
  selectModel: async () => ({}),
  pendingInteractions: async () => ({}),
  answerInteraction: async () => ({}),
  cancelInteraction: async () => ({}),
  listWorkspaces: async () => ({ items: [] }),
  listAgentPresets: async () => ({ presets: [] }),
  selectAgentPreset: async () => ({}),
  executeCommand: async () => ({}),
  status: async () => true,
}

interface ProbeHooks {
  setGuardResult(next: RpcResult<unknown>): void
  readonly lastSessionCreate: unknown
}
;(window as unknown as { __probe: ProbeHooks }).__probe = {
  setGuardResult(next: RpcResult<unknown>) {
    guardResult = next
  },
  get lastSessionCreate() {
    return lastSessionCreate
  },
}

const app = document.querySelector<HTMLElement>('#app')!
app.appendChild(
  createHeroView({
    rpc,
    api,
    projectRoot: 'Z:/proj',
    projectName: 'dsh-forge',
    currentBranch: 'main',
    currentWorktreePath: 'Z:/proj',
    workspaceId: 'ws-1',
    onOpenSession: (sessionId) => {
      ;(window as unknown as { __opened?: string }).__opened = sessionId
    },
  }),
)
