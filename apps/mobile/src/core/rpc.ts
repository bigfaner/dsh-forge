/**
 * /remote/__rpc 信封客户端 + `/` 前缀指令仲裁客户端。
 *
 * 信封（既有 host 口径）：POST {channel, payload} →
 * {ok:true, data} | {ok:false, error:{code, reason}}。
 *
 * 指令仲裁（官方 UI-adapter 契约级履行，tech-design 1.0 节）：
 * 输入以 `/` 开头 → 解析 name/args → 命中指令目录 → 官方指令执行远程面
 * （api.executeCommand，CommandRuntime 同径）；未命中目录 → 按字面消息
 * session.prompt 发送。无斜杠 = 普通消息直发。
 */
import type { OfficialApi } from './api.ts'
import { DisconnectedError } from './api.ts'

export const REMOTE_RPC_PATH = '/remote/__rpc'

export interface RpcOk<T = unknown> {
  readonly ok: true
  readonly data: T
}

export interface RpcError {
  readonly ok: false
  readonly error: { readonly code: string; readonly reason: string }
}

export type RpcResult<T = unknown> = RpcOk<T> | RpcError

export interface RemoteRpc {
  call<T = unknown>(channel: string, payload: unknown): Promise<RpcResult<T>>
}

export interface RemoteRpcDeps {
  post(path: string, body: unknown): Promise<{ status: number; json: unknown }>
}

export function createRemoteRpc(deps: RemoteRpcDeps): RemoteRpc {
  return {
    async call<T = unknown>(channel: string, payload: unknown) {
      try {
        const response = await deps.post(REMOTE_RPC_PATH, { channel, payload })
        if (response.status === 401) {
          return { ok: false, error: { code: 'disconnected', reason: 'unauthorized' } }
        }
        return response.json as RpcResult<T>
      } catch {
        return { ok: false, error: { code: 'disconnected', reason: 'network' } }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// `/` 前缀指令仲裁
// ---------------------------------------------------------------------------

export interface ParsedSlashLine {
  readonly name: string
  readonly args: string
  /** 完整原始行（含前导斜杠）——官方 execute 语义吃整行。 */
  readonly line: string
}

/** 前导 `/` + 首个空白分隔 token = 指令名；无斜杠 / 裸斜杠 → null。 */
export function parseSlashLine(text: string): ParsedSlashLine | null {
  if (!text.startsWith('/')) return null
  const body = text.slice(1)
  const spaceIndex = body.search(/\s/)
  const name = spaceIndex === -1 ? body : body.slice(0, spaceIndex)
  if (name === '') return null
  return { name, args: spaceIndex === -1 ? '' : body.slice(spaceIndex + 1).trim(), line: text }
}

export type Arbitration =
  | { readonly kind: 'command'; readonly parsed: ParsedSlashLine }
  | { readonly kind: 'message'; readonly text: string }

/** 命中目录 → command；未命中/无斜杠 → 字面消息。 */
export function arbitrate(text: string, catalog: readonly string[]): Arbitration {
  const parsed = parseSlashLine(text)
  if (parsed === null) return { kind: 'message', text }
  return catalog.includes(parsed.name) ? { kind: 'command', parsed } : { kind: 'message', text }
}

export interface ComposerSendDeps {
  readonly api: OfficialApi
  readonly sessionId: string
  /** 指令目录（远程 registry 快照；测试注入）。 */
  readonly catalog: readonly string[]
}

export type ComposerSendOutcome = 'command-executed' | 'command-unmatched' | 'message-sent'

/**
 * composer 单一发送路径：仲裁三径——
 * 命中：官方指令执行远程面（用户当前浏览会话，同源独占）；未命中/无斜杠：session.prompt 字面。
 * DisconnectedError 原样上抛（断线覆盖层归 sse/rpc 层）。
 */
export async function sendComposerInput(text: string, deps: ComposerSendDeps): Promise<ComposerSendOutcome> {
  const verdict = arbitrate(text, deps.catalog)
  if (verdict.kind === 'command') {
    await deps.api.executeCommand(deps.sessionId, verdict.parsed.line)
    return 'command-executed'
  }
  await deps.api.prompt(deps.sessionId, verdict.text, 'steer')
  return 'message-sent'
}

export { DisconnectedError }
