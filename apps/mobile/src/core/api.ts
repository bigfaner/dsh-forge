/**
 * 官方面窄面：POST /api/rpc {method, payload} → {ok, value|error}。
 * 13 方法清单（api-handbook §六，形状正本 = 官方手机页源码实证）：
 * session.list / session.create / session.history / session.prompt / session.cancel /
 * session.models / session.selectModel / interaction.pending / interaction.answer /
 * interaction.cancel / workspace.list / agentPreset.list / agentPreset.select。
 * 另携带官方指令执行远程面 commands.execute（UI-adapter 仲裁后调用）与
 * GET /api/status（心跳源）。401 / fetch 异常 = disconnected。
 */

export const OFFICIAL_RPC_PATH = '/api/rpc'
export const STATUS_PATH = '/api/status'

export class DisconnectedError extends Error {
  constructor() {
    super('disconnected')
    this.name = 'DisconnectedError'
  }
}

/** 官方指令执行远程面（CommandRuntime extends TypertRemoteService）——
 * 参数名取自官方生成客户端 SessionCommandsRemote.execute(agentId, line, attachments)。 */
export interface CommandExecuteResult {
  readonly matched?: boolean
}

export interface OfficialApi {
  listSessions(): Promise<{ items: readonly unknown[] }>
  createSession(workspaceId: string): Promise<{ sessionId: string }>
  history(sessionId: string, maxMessages: number): Promise<unknown>
  prompt(sessionId: string, text: string, mode: 'queue' | 'steer'): Promise<unknown>
  cancel(sessionId: string): Promise<unknown>
  models(sessionId: string): Promise<unknown>
  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<unknown>
  pendingInteractions(sessionId: string): Promise<unknown>
  answerInteraction(rpcId: string, sessionId: string, answers: readonly unknown[]): Promise<unknown>
  cancelInteraction(rpcId: string, sessionId: string): Promise<unknown>
  listWorkspaces(): Promise<{ items: readonly unknown[] }>
  listAgentPresets(): Promise<{ presets: readonly unknown[] }>
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<unknown>
  /** `/` 前缀仲裁命中后的官方指令执行远程面。 */
  executeCommand(sessionId: string, line: string): Promise<CommandExecuteResult>
  /** 心跳探测（sse 心跳/轮询共用）：401 = disconnected。 */
  status(): Promise<boolean>
}

export interface ApiDeps {
  post(path: string, body: unknown): Promise<{ status: number; json: unknown }>
  get(path: string): Promise<{ status: number; json: unknown }>
  timeZone(): string
}

/** 官方信封：{ok:true, value} | {ok:false, error}；非 ok 或 HTTP 异常 → throw。 */
async function rpc<T>(deps: ApiDeps, method: string, payload: unknown): Promise<T> {
  let response: { status: number; json: unknown }
  try {
    response = await deps.post(OFFICIAL_RPC_PATH, { method, payload })
  } catch {
    throw new DisconnectedError()
  }
  if (response.status === 401) throw new DisconnectedError()
  const envelope = response.json as { ok?: boolean; value?: T; error?: unknown }
  if (response.status < 200 || response.status >= 300 || envelope.ok !== true)
    throw new Error(typeof envelope.error === 'string' ? envelope.error : 'failed')
  return envelope.value as T
}

/** 请求 id 生成源（结构性收窄——测试可注入，不全量依赖 DOM Crypto 类型） */
export interface RandomSource {
  /** 仅安全上下文（https/localhost）暴露 */
  randomUUID?: () => string
  /** 全上下文在场 */
  getRandomValues(array: Uint8Array): Uint8Array
}

/** 请求 id 生成（bug c227e548）：crypto.randomUUID 仅安全上下文（https/localhost）暴露
 *  ——LAN 域真机走 http://<IP>:<port> 非安全上下文函数缺席，发送全败。getRandomValues
 *  全上下文在场 → v4 形自拼兜底；安全上下文仍走原生路径。 */
export function randomRequestId(scope: RandomSource = globalThis.crypto as RandomSource): string {
  if (typeof scope.randomUUID === 'function') return scope.randomUUID()
  const bytes = new Uint8Array(16)
  scope.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant 10x
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

export function createOfficialApi(deps: ApiDeps): OfficialApi {
  return {
    listSessions: () => rpc<{ items: readonly unknown[] }>(deps, 'session.list', {}),
    createSession: (workspaceId) => rpc(deps, 'session.create', { workspaceId }),
    history: (sessionId, maxMessages) => rpc(deps, 'session.history', { sessionId, maxMessages }),
    prompt: (sessionId, text, mode) =>
      rpc(deps, 'session.prompt', {
        sessionId,
        requestId: randomRequestId(), // bug 82f9ceb6：官方 SessionPromptRequest schema 必填——缺失 = bindPrompt 链路不可序列化，inbox splice 落盘被拒
        mode,
        content: [{ type: 'text', text }],
        clientTimeZone: deps.timeZone(),
      }),
    cancel: (sessionId) => rpc(deps, 'session.cancel', { sessionId }),
    models: (sessionId) => rpc(deps, 'session.models', { sessionId }),
    selectModel: (sessionId, provider, model, reasoningEffort) =>
      rpc(deps, 'session.selectModel', {
        sessionId,
        provider,
        model,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      }),
    pendingInteractions: (sessionId) => rpc(deps, 'interaction.pending', { sessionId }),
    answerInteraction: (rpcId, sessionId, answers) =>
      rpc(deps, 'interaction.answer', { rpcId, sessionId, answers: [...answers] }),
    cancelInteraction: (rpcId, sessionId) => rpc(deps, 'interaction.cancel', { rpcId, sessionId }),
    listWorkspaces: () => rpc<{ items: readonly unknown[] }>(deps, 'workspace.list', {}),
    listAgentPresets: () => rpc<{ presets: readonly unknown[] }>(deps, 'agentPreset.list', {}),
    selectAgentPreset: (sessionId, agentPreset) => rpc(deps, 'agentPreset.select', { sessionId, agentPreset }),
    executeCommand: (sessionId, line) =>
      rpc<CommandExecuteResult>(deps, 'commands.execute', { agentId: sessionId, line, attachments: [] }),
    status: async () => {
      try {
        const response = await deps.get(STATUS_PATH)
        if (response.status === 401) throw new DisconnectedError()
        return response.status >= 200 && response.status < 300
      } catch (error) {
        if (error instanceof DisconnectedError) throw error
        return false
      }
    },
  }
}

export function defaultApiDeps(): ApiDeps {
  return {
    post: async (path, body) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { status: response.status, json: await response.json().catch(() => null) }
    },
    get: async (path) => {
      const response = await fetch(path, { cache: 'no-store' })
      return { status: response.status, json: await response.json().catch(() => null) }
    },
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}
