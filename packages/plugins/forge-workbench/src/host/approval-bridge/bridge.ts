// host/approval-bridge/bridge — 审批路由核(任务 3.5;decorator-free)。
//
// spike-2 定形的审批通道(host 侧半身):
//   - 认领:宿主内全局 `approval/request` waterfall(agent-scoped;approval-bridge
//     以 { prepend: true } 抢占注册 —— 认领判定 = request.agent.id ∈ 派发会话
//     集合(dispatch-launch registry;ACP ownedRecord 同型);非本集(用户交互
//     会话)→ 委派 next(),上游会话内面板行为零改动。认领后不调 next() =
//     否决后续链(api-remotes 转发器 + 上游 ui-approval 话者,饿死面消除)。
//   - 上行(宿主 subagent 审批事件 → 内核):事件字段(toolName/reason/callId)
//     + `tools/pre-execute` 观察者按 callId join 的 arguments(spike-2 §3;
//     workspace-changes 先例)→ payload → 内核 receiveApproval(生产载体 =
//     T2 工具桥,host → client 泵 → I1 动词 → 内核插 pending + dispatch →
//     awaiting 同事务 + 事件推送 UI —— tech-design §Interface 3 审批路由)。
//   - 下行(decideApproval 反向回注):人显式点击 → 内核先落库 → client 调
//     host 桥 answer(spike-1 单向 answer 形态)→ settle() resolve 该请求的
//     pending 决策 → listener 返回 ApprovalOutcome 原生回注 subagent 的
//     pending 工具调用(零伪造通道,spike-2 §1.3 ①)。
//
// 四态语义(interaction/user-approval ApprovalOutcome;fail-closed):
//   - 'allowed-once' = 人批准(decideApproval approve;单次粒度,无持久授权);
//   - 'rejected'     = 人拒绝;
//   - 'cancelled'    = turn signal abort(唯一超时面,spike-2 §1.3 ④-2)——
//     内核行核销走 rejectApproval(approve=false, actor='kernel'。Actor 词表
//     含 'kernel'(tech-design §I1);四态→三态映射采 spike-2 §4-5 方案 (a):
//     closed 语义由 decided_by='kernel' + decided_at 承载,不改 schema CHECK);
//   - 'unavailable'  = 桥不可用(内核不可达)——fail-closed 显式降级:上游
//     serviceAsk 的 deny 文案原生区分「用户拒绝」与「无审批通道」,禁静默。
//
// starting 竞态容忍(生产链固有):两段式派发里 prompt 投递先于 relay 回填
// running,首个工具审批可能抢跑 —— 内核 receiveApproval 对 starting 行显式
// 拒绝(ERR_DISPATCH_STATE_INVALID),本核对其做有界重试(relay 落库在 ms 级),
// 其余业务拒绝/transport 失败不重试(端口自身已带一次 transport 重试)。

/** 上游 ApprovalOutcome(interaction/user-approval 词表;fail-closed)。 */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/**
 * `approval/request` 事件的结构孪生(spike-2 §1.1:事件本体 = { agent, toolName,
 * callId?, reason?, signal? },无操作正文 —— arguments 经 pre-execute join)。
 */
export interface SubagentApprovalRequest {
  /** 发起 ask 的会话 agent id(= dispatch.session_id 同键,直 join)。 */
  readonly agentId: string
  readonly toolName: string
  readonly callId?: string
  readonly reason?: string
  /** turn 生命周期信号(abort = 唯一超时面);缺省 = 无 abort 面。 */
  readonly signal?: AbortSignal
}

/** 内核 receiveApproval 入参(host 孪生;payload = spike-2 §3 结构)。 */
export interface ApprovalKernelReceiveInput {
  readonly dispatchId: string
  readonly sessionId: string
  readonly payload: {
    readonly toolName: string
    readonly reason?: string
    readonly callId?: string
    readonly arguments?: unknown
  }
}

/**
 * 内核端口(生产实现 = T2 工具桥:approval_receive / approval_decide 动词 →
 * client 泵 → I1 白名单动词;transport 级失败由桥的重试一次语义承载)。
 */
export interface ApprovalKernelPort {
  /** 审批入列(内核插 pending + awaiting 联动;回传内核生成的 approvalId)。 */
  receiveApproval(input: ApprovalKernelReceiveInput): Promise<{ readonly approvalId: string }>
  /** 核销腿(cancelled 终局;actor = 'kernel' —— decideApproval(approve=false) 形态)。 */
  rejectApproval(input: { readonly approvalId: string }, actor: string): Promise<unknown>
}

/** 依赖缝(registry 查询 / 内核端口 / callId→arguments join / 重试策略)。 */
export interface ApprovalBridgeDeps {
  readonly resolveDispatch: (sessionId: string) => { readonly dispatchId: string } | null
  readonly kernel: ApprovalKernelPort
  /** pre-execute 捕获 join(缺省 = 无 arguments 面)。 */
  readonly argumentsOf?: (callId: string) => unknown
  /** 决策/取消后丢弃捕获(核销即弃,spike-2 §4-3)。 */
  readonly dropCapture?: (callId: string) => void
  /** starting 竞态重试(缺省 4 次 × 250ms;测试注 0 延时)。 */
  readonly receiveRetry?: { readonly attempts: number; readonly delayMs: number }
}

/** 装配产物(attach/clear 面 + settle 下行面)。 */
export interface ApprovalBridgeCore {
  /**
   * waterfall listener 体:同步 null = 非派发会话(调用方 next() 委派);
   * Promise = 认领(不调 next()),resolve 即 ApprovalOutcome 原生回注。
   */
  handle(request: SubagentApprovalRequest): Promise<ApprovalOutcome> | null
  /** 决策下行面(decideApproval 落库后的 answer 腿):resolve pending;晚到/未知 = {settled:false} 幂等。 */
  settle(approvalId: string, approve: boolean): { settled: boolean }
}

interface PendingDecision {
  resolve(approve: boolean): void
}

const DEFAULT_RECEIVE_RETRY = { attempts: 4, delayMs: 250 } as const

function isStartingRaceRejection(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return code === 'ERR_DISPATCH_STATE_INVALID'
    && error instanceof Error
    && error.message.includes('starting')
}

export function createApprovalBridgeCore(deps: ApprovalBridgeDeps): ApprovalBridgeCore {
  const retry = deps.receiveRetry ?? DEFAULT_RECEIVE_RETRY
  const pending = new Map<string, PendingDecision>()

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

  const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true

  /** receiveApproval + starting 竞态有界重试(abort 先行即停试)。 */
  const receiveWithRaceRetry = async (
    request: SubagentApprovalRequest,
    dispatchId: string,
    signal: AbortSignal | undefined,
  ): Promise<{ readonly approvalId: string }> => {
    const input: ApprovalKernelReceiveInput = {
      dispatchId,
      sessionId: request.agentId,
      payload: {
        toolName: request.toolName,
        ...(request.reason === undefined ? {} : { reason: request.reason }),
        ...(request.callId === undefined ? {} : { callId: request.callId }),
        ...(request.callId !== undefined && deps.argumentsOf !== undefined
          ? { arguments: deps.argumentsOf(request.callId) }
          : {}),
      },
    }
    let attemptsLeft = Math.max(1, retry.attempts)
    for (;;) {
      try {
        return await deps.kernel.receiveApproval(input)
      } catch (error) {
        // 仅 starting 竞态重试(relay 回填 ms 级落);其余(真实状态拒绝/
        // transport 失败 —— 端口已带一次重试)立即 fail-closed。
        if (!isStartingRaceRejection(error) || attemptsLeft <= 1 || isAborted(signal)) throw error
        attemptsLeft -= 1
        await sleep(retry.delayMs)
      }
    }
  }

  return {
    handle(request: SubagentApprovalRequest): Promise<ApprovalOutcome> | null {
      // 认领过滤(spike-2 §4-1:request.agent.id ∈ 派发会话集合)。
      const binding = deps.resolveDispatch(request.agentId)
      if (binding === null) return null

      return (async (): Promise<ApprovalOutcome> => {
        // —— 上行:入列内核(pending + awaiting 联动 + 事件推送)——
        let received: { readonly approvalId: string }
        try {
          received = await receiveWithRaceRetry(request, binding.dispatchId, request.signal)
        } catch {
          // fail-closed 显式降级:上游 deny 文案原生区分「无审批通道」,
          // 内核侧未建 pending 行(不达即不入列)—— 禁静默。
          return 'unavailable'
        }

        const drop = (): void => {
          if (request.callId !== undefined) deps.dropCapture?.(request.callId)
        }

        // 竞态收口:入列腿期间 turn 已取消 → 直接核销 + cancelled(不注册 pending)。
        if (isAborted(request.signal)) {
          void deps.kernel.rejectApproval({ approvalId: received.approvalId }, 'kernel').catch(() => {})
          drop()
          return 'cancelled'
        }

        // —— 等人决策(不限短预算,spike-2 §1.3 ④-2;abort = 唯一超时面)——
        const decision = new Promise<boolean>((resolve) => {
          pending.set(received.approvalId, { resolve })
        })
        const abort = new Promise<null>((resolve) => {
          if (request.signal === undefined) return // 无 abort 面:永不 resolve
          if (request.signal.aborted) { resolve(null); return }
          request.signal.addEventListener('abort', () => { resolve(null) }, { once: true })
        })
        const settled = await Promise.race([decision, abort])
        pending.delete(received.approvalId)
        drop()

        if (settled === null) {
          // cancelled:内核行核销(decided_by='kernel',三态 schema 不动 ——
          // spike-2 §4-5 方案 (a));dispatch 经最后-pending 清零回 running。
          void deps.kernel.rejectApproval({ approvalId: received.approvalId }, 'kernel').catch(() => {})
          return 'cancelled'
        }
        return settled ? 'allowed-once' : 'rejected'
      })()
    },

    settle(approvalId: string, approve: boolean): { settled: boolean } {
      const entry = pending.get(approvalId)
      if (entry === undefined) return { settled: false } // 晚到/重复/已取消:幂等
      pending.delete(approvalId)
      entry.resolve(approve)
      return { settled: true }
    },
  }
}

// ---------------------------------------------------------------------------
// tools/pre-execute 捕获(spike-2 §3:事件本体不带操作正文,按 callId join)
// ---------------------------------------------------------------------------

/** 有界 callId → arguments 捕获表(核销即弃;无 callId 的观察不入表)。 */
export interface PreExecuteCapture {
  /** 观察一次工具执行(defensive 鸭读 {name, callId?, arguments?})。 */
  observe(exec: unknown): void
  /** 按 callId join 审批正文;未捕获 = undefined(payload 不带 arguments)。 */
  argumentsOf(callId: string): unknown
  /** 决策/取消后丢弃(核销即弃)。 */
  drop(callId: string): void
}

/** 上限默认(有界内存;超出逐出最旧)。 */
export const PRE_EXECUTE_CAPTURE_LIMIT = 32

export function createPreExecuteCapture(limit: number = PRE_EXECUTE_CAPTURE_LIMIT): PreExecuteCapture {
  const table = new Map<string, unknown>()
  return {
    observe(exec: unknown): void {
      if (exec === null || typeof exec !== 'object') return
      const source = exec as { readonly callId?: unknown; readonly arguments?: unknown }
      if (typeof source.callId !== 'string' || source.callId === '') return
      table.set(source.callId, source.arguments)
      if (table.size > limit) {
        const oldest = table.keys().next()
        if (!oldest.done) table.delete(oldest.value)
      }
    },
    argumentsOf(callId: string): unknown {
      return table.get(callId)
    },
    drop(callId: string): void {
      table.delete(callId)
    },
  }
}
