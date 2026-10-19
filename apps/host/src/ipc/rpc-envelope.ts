// RPC 边界信封机制（定位：基础——2.4 机制本体，3.5 knowledge 通道复用不改建制）。
// 传播策略（tech-design §Error Handling Propagation Strategy）：能力面/服务层抛 typed error
// （contracts 六错误码）→ RPC 边界序列化 { code, message, data } → UI 按 code 映射状态。
// 错误不走 promise 拒绝而走信封带内返回（Electron invoke 拒绝会抹平结构化对象——
// dto/rpc.ts 契约注释）；非 typed 错误 fail-loud 原样上抛（编程错误不静默降级为伪码）。
// app-observability 1.2：信封单点埋点——handler 捕获错误（typed 与非 typed rethrow 两路）
// 均落诊断事件（含栈），消除「捕获即静默」面（评审 Blocker-1 + Note-1 同文件闭合）；
// 链 A trace_id：preload invoke 面单点生成的第三参在信封读入诊断 ALS——handler 内全部
// 日志自动携带（appender 订阅侧消费）。
import { ERROR_CODES, type ErrorCode, type RpcErrorPayload, type RpcResult } from '@dsh-forge/contracts'
import type { DiagContextStore } from '../telemetry/diag-context.js'
import { runWithDiagContext } from '../telemetry/diag-context.js'
import type { DiagEventPayload } from '../telemetry/diag-events.js'

/** 域 handler 形状：负载 → 结果（typed error 自然抛出；Req=void 通道负载为 undefined） */
export type RpcDomainHandler<Req, Res> = (payload: Req) => Promise<Res> | Res

/** 诊断埋点出口（main 装配单点注入——emitDiag(ctx, payload)；缺省零埋点不抛） */
export type RpcEnvelopeDiagSink = (payload: DiagEventPayload) => void

/** 信封诊断装配缝（ALS 读 trace_id + emit 出口——main.ts 装配一次；测试可重置） */
let diagAls: DiagContextStore | undefined
let diagSink: RpcEnvelopeDiagSink | undefined

/** 装配信封诊断缝（main.ts 单点调用；undefined 出口 = 卸载面，测试重置用） */
export function configureRpcEnvelopeDiag(config: { als?: DiagContextStore; sink?: RpcEnvelopeDiagSink } | undefined): void {
  diagAls = config?.als
  diagSink = config?.sink
}

/** 埋点构造（信封内单点——两路错误同构；emit 异常吞掉，埋点永不破信封语义） */
function emitHandlerError(error: unknown): void {
  if (diagSink === undefined) return
  const err = error as Error | undefined
  try {
    diagSink({
      level: 'error',
      process: 'main',
      event: 'ipc-handler',
      message: String(err?.message ?? error),
      stack: err?.stack,
    })
  } catch {
    // 埋点失败不破 RPC 信封（红线①——诊断面零反压业务）
  }
}

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
 * 两路错误均先落诊断事件（含栈）——单点埋点覆盖全部自有 RPC 面（1.2）。
 * trace_id（preload invoke 第三参，string）在场 → handler 执行包进诊断 ALS。
 */
export function rpcEnvelope<Req, Res>(
  handler: RpcDomainHandler<Req, Res>,
): (event: unknown, ...args: unknown[]) => Promise<RpcResult<Res>> {
  return async (_event, ...args) => {
    const traceId = args[1]
    const invoke = async (): Promise<RpcResult<Res>> => {
      try {
        return { ok: true, data: await handler(args[0] as Req) }
      } catch (error) {
        emitHandlerError(error)
        const payload = serializeRpcError(error)
        if (payload === undefined) throw error
        return { ok: false, error: payload }
      }
    }
    const store = diagAls
    if (store !== undefined && typeof traceId === 'string' && traceId !== '') {
      return runWithDiagContext(store, { traceId }, invoke)
    }
    return invoke()
  }
}
