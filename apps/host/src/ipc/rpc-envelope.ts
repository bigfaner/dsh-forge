// RPC 边界信封机制（定位：基础——2.4 机制本体，3.5 knowledge 通道复用不改建制）。
// 传播策略（tech-design §Error Handling Propagation Strategy）：能力面/服务层抛 typed error
// （contracts 六错误码）→ RPC 边界序列化 { code, message, data } → UI 按 code 映射状态。
// 错误不走 promise 拒绝而走信封带内返回（Electron invoke 拒绝会抹平结构化对象——
// dto/rpc.ts 契约注释）；非 typed 错误 fail-loud 原样上抛（编程错误不静默降级为伪码）。
import { ERROR_CODES, type ErrorCode, type RpcErrorPayload, type RpcResult } from '@dsh-forge/contracts'

/** 域 handler 形状：负载 → 结果（typed error 自然抛出；Req=void 通道负载为 undefined） */
export type RpcDomainHandler<Req, Res> = (payload: Req) => Promise<Res> | Res

/**
 * typed error → RpcErrorPayload（结构化判型：Error 且 code ∈ contracts ERROR_CODES）。
 * core 侧错误类（WorkspaceCreateError 等）不经 import 消费——结构同型即序列化
 * （host 禁 import core：tests/structure/host-main pin；六码唯一源 = contracts）。
 * 非 typed（无 code / code 不在列 / 非 Error）→ undefined，调用方 fail-loud 上抛。
 */
export function serializeRpcError(error: unknown): RpcErrorPayload | undefined {
  if (!(error instanceof Error)) return undefined
  const { code, data } = error as Error & { code?: unknown; data?: unknown }
  if (typeof code !== 'string' || !(ERROR_CODES as readonly string[]).includes(code)) return undefined
  return { code: code as ErrorCode, message: error.message, data }
}

/**
 * 包装域 handler 为 IPC handler：成功 → RpcOk 信封；typed error → RpcErr 信封；
 * 非 typed 错误原样上抛（Electron 拒绝面，renderer 侧 fail-loud 可见）。
 */
export function rpcEnvelope<Req, Res>(
  handler: RpcDomainHandler<Req, Res>,
): (event: unknown, ...args: unknown[]) => Promise<RpcResult<Res>> {
  return async (_event, ...args) => {
    try {
      return { ok: true, data: await handler(args[0] as Req) }
    } catch (error) {
      const payload = serializeRpcError(error)
      if (payload === undefined) throw error
      return { ok: false, error: payload }
    }
  }
}
