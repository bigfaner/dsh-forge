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
// forge:proxy 视图数据通道（R12 口径——ask/models/settings 三视图唯一数据面；
// host 侧正本 = proxy-channels.ts PROXY_CHANNELS）
// ---------------------------------------------------------------------------

/** pending 发现（sessionController.projections → UserQuestionProjectionView{active,settled}） */
export const PROXY_SESSION_PROJECTIONS_CHANNEL = 'forge:proxy/session-projections'
/** ask 提交（ctx.userQuestions.answer） */
export const PROXY_USER_QUESTIONS_ANSWER_CHANNEL = 'forge:proxy/user-questions-answer'
/** 模型目录（sessionController.modelCatalog → 官方 ModelCatalog groups 形状） */
export const PROXY_SESSION_MODEL_CATALOG_CHANNEL = 'forge:proxy/session-model-catalog'
/** 模型选档（sessionController.selectModel；preset 锁定语义 host 侧） */
export const PROXY_SESSION_SELECT_MODEL_CHANNEL = 'forge:proxy/session-select-model'

/** 视图层通道调用：error 信封 → throw（disconnected 归一为 DisconnectedError，保持视图断线文案路径）。 */
export async function proxyCall<T>(rpc: RemoteRpc, channel: string, payload: unknown): Promise<T> {
  const result = await rpc.call<T>(channel, payload)
  if (!result.ok) {
    throw result.error.code === 'disconnected' ? new DisconnectedError() : new Error(result.error.reason)
  }
  return result.data
}

// ---------------------------------------------------------------------------
// forge:proxy/file 文件读面（1.19 阅读页数据通道——host proxy-channels.ts readFileChunk 正本）
// ---------------------------------------------------------------------------

export const PROXY_FILE_CHANNEL = 'forge:proxy/file'

export interface ProxyFileText {
  readonly text: string
  readonly size: number
}

function bytesOfBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index) & 0xff
  return bytes
}

/**
 * 全文件文本读：manifest（offset 0 + manifest:true）取 size → 逐块 base64 直到 eof。
 * maxBytes 守卫防误读大文件；RPC error 信封原样抛错。
 */
export async function loadProxyFileText(
  rpc: RemoteRpc,
  path: string,
  opts?: { readonly maxBytes?: number },
): Promise<ProxyFileText> {
  const maxBytes = opts?.maxBytes ?? 2_000_000
  const manifest = await rpc.call<{ manifest?: boolean; size?: number }>(PROXY_FILE_CHANNEL, {
    path,
    offset: 0,
    manifest: true,
  })
  if (!manifest.ok) throw new Error(manifest.error.reason)
  const size = typeof manifest.data.size === 'number' ? manifest.data.size : 0
  if (size > maxBytes) throw new Error(`文件超出阅读上限（${size} > ${maxBytes} bytes）`)
  const decoder = new TextDecoder()
  let text = ''
  let offset = 0
  for (;;) {
    const chunk = await rpc.call<{ eof?: boolean; data?: string }>(PROXY_FILE_CHANNEL, { path, offset })
    if (!chunk.ok) throw new Error(chunk.error.reason)
    if (typeof chunk.data.data !== 'string') throw new Error('forge:proxy/file 块载荷缺失')
    text += decoder.decode(bytesOfBase64(chunk.data.data), { stream: chunk.data.eof !== true })
    offset += bytesOfBase64(chunk.data.data).length
    if (chunk.data.eof === true || offset >= size) break
  }
  return { text, size }
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
  /**
   * prompt 模式（bug 1eb525b7 后继裁决 2026-10-22：官方 steer 仅对运行中 agent 合法——
   * 空闲 agent steer 被 session/agent-busy「prompt rejected」拒绝。调用方按运行态选：
   * 运行中 = steer 抢占 / 空闲或新会话 = queue followup 即启）。
   */
  readonly promptMode: 'steer' | 'queue'
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
  await deps.api.prompt(deps.sessionId, verdict.text, deps.promptMode)
  return 'message-sent'
}

export { DisconnectedError }
