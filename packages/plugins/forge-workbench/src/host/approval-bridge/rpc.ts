// host/approval-bridge/rpc — 审批桥的 cordis 面(任务 3.5)。
//
// 两件事:
//   1. ApprovalBridgeService(TypertRemoteService,key/namespace = `approvalBridge`)
//      单方法 answer @Remote —— decideApproval 下行腿:人显式点击 → 内核先落库
//      (approval_request.state + decided_by)→ client 调本面 settle → listener
//      resolve → ApprovalOutcome 原生回注 subagent(spike-2 §1.3 ③ 决策送达链;
//      spike-1 实测的单向 answer 形态)。幂等:晚到/未知 approvalId = 不改结果。
//   2. attachApprovalBridge —— waterfall 订阅面:`ctx.on('approval/request',
//      listener, { prepend: true })`(apply 期注册,先于任何 dispatch 启动;
//      prepend 抢占 api-remotes 转发器,与装载序无关的确定性 outermost 位,
//      spike-2 §1.3 ②)+ `tools/pre-execute` 观察者(callId→arguments 捕获,
//      workspace-changes 先例;观察不认领,恒 next())。
//
// 装饰器语法封闭在此(session-launch-rpc / forge-tools rpc 先例);逻辑在
// bridge.ts(纯核,单测直载)。

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ApprovalBridgeCore, PreExecuteCapture } from './bridge'

/** answer 腿 wire 入参(kernel decideApproval 已落库后的显式决策)。 */
export interface ApprovalAnswerInput {
  readonly approvalId: string
  readonly approve: boolean
}

/** answer 腿结果(settled=false = 晚到/未知/已取消 —— 幂等不改结果)。 */
export interface ApprovalAnswerResult {
  readonly settled: boolean
}

/** 审批桥 rpc 面(构造后 `ctx.remote.approvalBridge.answer` 可路由;client mount 归 3.9)。 */
export class ApprovalBridgeService extends TypertRemoteService {
  private readonly core: ApprovalBridgeCore

  constructor(ctx: Context, core: ApprovalBridgeCore) {
    super(ctx, 'approvalBridge')
    this.core = core
  }

  @Remote('answer')
  answer(input: ApprovalAnswerInput): Promise<ApprovalAnswerResult> {
    return Promise.resolve(this.core.settle(input.approvalId, input.approve))
  }
}

/** `approval/request` 事件的最小结构读取面(agent.id/toolName/callId/reason/signal 鸭读)。 */
interface UpstreamApprovalEvent {
  readonly agent?: { readonly id?: unknown }
  readonly toolName?: unknown
  readonly callId?: unknown
  readonly reason?: unknown
  readonly signal?: unknown
}

/** 事件 → 孪生(defensive:形态不完整 = null → 委派,绝不因畸形事件吞审批)。 */
function toTwin(event: unknown): {
  agentId: string
  toolName: string
  callId?: string
  reason?: string
  signal?: AbortSignal
} | null {
  if (event === null || typeof event !== 'object') return null
  const source = event as UpstreamApprovalEvent
  const agentId = source.agent?.id
  if (typeof agentId !== 'string' || agentId === '') return null
  if (typeof source.toolName !== 'string' || source.toolName === '') return null
  const signal = source.signal
  return {
    agentId,
    toolName: source.toolName,
    ...(typeof source.callId === 'string' && source.callId !== '' ? { callId: source.callId } : {}),
    ...(typeof source.reason === 'string' && source.reason !== '' ? { reason: source.reason } : {}),
    ...(signal !== null && typeof signal === 'object' && typeof (signal as AbortSignal).aborted === 'boolean'
      && typeof (signal as AbortSignal).addEventListener === 'function'
      ? { signal: signal as AbortSignal }
      : {}),
  }
}

/**
 * ctx.on 的宽松结构面(cordis 对这两个事件名有强类型 overload —— 来自
 * dsh-user-approval/dsh-tools 的模块增强;本包不引传递依赖的类型,按仓内
 * 结构孪生纪律重声明宽面 —— 运行时行为与原 overload 完全一致)。
 */
type LooseEventOn = (
  name: string,
  listener: (event: unknown, next: () => unknown) => unknown,
  options?: { readonly prepend?: boolean },
) => () => void

/**
 * 挂接 waterfall 订阅面 + pre-execute 观察者;返回拆卸句柄(插件卸载面)。
 * listener 语义:非派发会话/畸形事件 → `next()` 委派(上游链零改动);
 * 认领 → 返回 handle() 的 Promise(不调 next() = 否决后续链)。
 */
export function attachApprovalBridge(
  ctx: Context,
  core: ApprovalBridgeCore,
  capture: PreExecuteCapture,
): () => void {
  const on = (ctx as unknown as { on: LooseEventOn }).on.bind(ctx)

  const offApproval = on('approval/request', (event, next) => {
    const twin = toTwin(event)
    if (twin === null) return next()
    const claimed = core.handle(twin)
    if (claimed === null) return next()
    return claimed // Promise<ApprovalOutcome> —— 认领 + 原生回注(spike-2 §1.3 ①)
  }, { prepend: true }) // 抢占 api-remotes 转发器(spike-2 §1.3 ②;装载序无关)

  const offCapture = on('tools/pre-execute', (exec, next) => {
    capture.observe(exec) // 观察不认领:恒 next()
    return next()
  })

  return () => {
    offApproval()
    offCapture()
  }
}
