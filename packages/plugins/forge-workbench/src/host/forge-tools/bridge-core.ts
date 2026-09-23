// host/forge-tools/bridge-core — renderer tool 桥核心(T2,任务 2.1;decorator-free)。
//
// tech-design §Interface 2 + spike-1 §2/§3 定形的桥机制:字面「host 发起 rpc」
// 在上游开放面不存在,可行形态 = **client 订阅 stream + 单向 answer 回传**(倒向
// 桥)。本模块是 host 侧队列核,被 rpc.ts 的 @Remote 面包(calls 流 + answer 单
// 向),client 半身在 src/client/ipc/tool-bridge.ts 消费 —— 三方共享的 wire 类型
// 也定义在此(纯类型,client 经 type-only import 复用;4.1 跨半身类型先例)。
//
// 队列形态(spike-1 §2 多 client 语义 + §3.3 降级链,逐条实现):
//   - backlog 重放:调用入队时无任何存活 waiter → 暂存 backlog;新流接入时先
//     重放 backlog(boot 竞态无丢失,spike §3.2 实测形态);
//   - 单投递:每次调用恰好投递给一个 waiter(waiters[0],FIFO);投递到的窗口
//     消亡 → 该调用走预算超时降级(不重投,spike §2 多窗口语义);
//   - 连接宽限:无存活流时,宽限期内无接入 → 立即失败(不等满预算;spike
//     「activeStreams 快速失败」建议);
//   - 每调用预算:投递后预算内未应答 → 同码失败(renderer 冻结/关闭等价面);
//   - 重试一次:仅 transport 级失败(宽限/预算超时)重试一次,重试 = 新 callId
//     (旧 callId 的过期 answer 幂等忽略);业务拒绝(ok:false + 业务 code)是
//     结果不是失败,永不重试;
//   - 预算默认:宽限 ≤1s + 每调用 ~5s(spike-1 §3.3 建议;测试经 budgets 注入)。
//
// attach() 的 waiter 注册是惰性的(生成器体在首个 next() 才启动):真链路上
// client 泵拿到返回值即刻迭代,与「接入即注册」等价;入队先于迭代的调用走
// backlog 重放(测试同形态)。

/** 桥动词集(封闭;tech-design §Interface 2 任务族 —— 工具名后缀 = 桥动词)。
 *
 * 任务 2.2 追加(D4):知识系族(fact/lesson/research = 动作分派 verb;
 * forensic 只读)与 feature 读族(list/status)。动作枚举在 args.action,
 * 桥动词与工具族一一对应;client 侧 dispatch 仍是封闭 switch(T4)。 */
export type ForgeToolBridgeVerb =
  | 'task_add'
  | 'task_claim'
  | 'task_transition'
  | 'task_submit'
  | 'task_reopen'
  | 'task_get'
  | 'task_query'
  | 'task_list'
  | 'knowledge_fact'
  | 'knowledge_lesson'
  | 'knowledge_research'
  | 'knowledge_forensic'
  | 'feature_list'
  | 'feature_status'

/** 桥 transport 级失败码(spike-1 §3.3;区别于内核业务 ERR_* 码)。 */
export const BRIDGE_TRANSPORT_CODE = 'ERR_TOOL_BRIDGE_UNAVAILABLE' as const

/** 一次桥调用的终局:业务值或业务拒绝(transport 失败也走 ok:false + 本码)。 */
export type BridgeOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly detail?: string }

/** client 订阅流上的一帧:host → renderer 的单向调用载荷。 */
export interface ForgeToolBridgeCall {
  readonly callId: string
  readonly verb: ForgeToolBridgeVerb
  readonly args: Record<string, unknown>
  /** 审计主体(`session:<id>`);写动词必带,内核记 updated_by(tech-design §I2)。 */
  readonly actor: string
}

/** client → host 的单向应答(ok:false 携带内核 IPC reject 封装字段)。 */
export interface ForgeToolBridgeAnswer {
  readonly callId: string
  readonly ok: boolean
  readonly value?: unknown
  readonly code?: string
  readonly message?: string
  readonly detail?: string
}

/** attach() 的返回契约(一个 AsyncIterable = 一扇已接入的 renderer 流)。 */
export type ToolBridgeWaiterStream = AsyncIterable<ForgeToolBridgeCall>

/** 桥预算(毫秒;spike-1 §3.3 建议默认)。 */
export interface ToolBridgeBudgets {
  readonly connectGraceMs: number
  readonly callBudgetMs: number
}

export const DEFAULT_TOOL_BRIDGE_BUDGETS: ToolBridgeBudgets = {
  connectGraceMs: 1_000,
  callBudgetMs: 5_000,
}

/** 核心 options(budgets/callId mint 可注入;测试 = 假时钟 + 确定性 id)。 */
export interface ToolBridgeCoreOptions {
  readonly budgets?: ToolBridgeBudgets
  readonly mintCallId?: () => string
}

/** 一个存活 waiter:帧缓冲 + 唤醒门(attach 生成器私有)。 */
interface Waiter {
  push(call: ForgeToolBridgeCall): void
}

/** 一次 attempt 的簿记。 */
interface PendingAttempt {
  resolve(outcome: BridgeOutcome): void
  delivered: boolean
  budgetTimer: ReturnType<typeof setTimeout> | undefined
  graceTimer: ReturnType<typeof setTimeout> | undefined
}

/** host 桥核装配产物(rpc.ts 的薄壳直接委托到这里)。 */
export interface ToolBridgeCore {
  /** client 订阅面:一个 AsyncIterable = 一扇流;abort/return = waiter 注销。 */
  attach(signal: AbortSignal): ToolBridgeWaiterStream
  /** 工具执行面:transport 失败自动重试一次;业务拒绝原样返回,不重试。 */
  callWithRetry(verb: ForgeToolBridgeVerb, args: Record<string, unknown>, actor: string): Promise<BridgeOutcome>
  /** client answer 面:按 callId 终局;过期/未知 callId 幂等忽略。 */
  settleFromClient(answer: ForgeToolBridgeAnswer): { ok: true; ignored?: boolean }
  /** 存活流计数(观测/测试;spike activeStreams 同义)。 */
  readonly waiterCount: number
}

export function createToolBridgeCore(options: ToolBridgeCoreOptions = {}): ToolBridgeCore {
  const budgets = options.budgets ?? DEFAULT_TOOL_BRIDGE_BUDGETS
  const mintCallId = options.mintCallId
    ?? ((): string => `forge-tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

  const waiters: Waiter[] = []
  const backlog: ForgeToolBridgeCall[] = []
  const pending = new Map<string, PendingAttempt>()
  const waiterArrived = new Set<() => void>()

  const detach = (waiter: Waiter): void => {
    const at = waiters.indexOf(waiter)
    if (at !== -1) waiters.splice(at, 1)
  }

  /** 投递一帧:有存活 waiter → 单投递(waiters[0]);否则暂存 backlog。 */
  const deliver = (call: ForgeToolBridgeCall): void => {
    const waiter = waiters[0]
    if (waiter === undefined) backlog.push(call)
    else waiter.push(call)
  }

  /** attempt 终局:清计时器、摘簿记、resolve。 */
  const settle = (callId: string, outcome: BridgeOutcome): void => {
    const attempt = pending.get(callId)
    if (attempt === undefined) return
    pending.delete(callId)
    if (attempt.budgetTimer !== undefined) clearTimeout(attempt.budgetTimer)
    if (attempt.graceTimer !== undefined) clearTimeout(attempt.graceTimer)
    attempt.resolve(outcome)
  }

  const transportFail = (verb: ForgeToolBridgeVerb, why: string): BridgeOutcome => ({
    ok: false,
    code: BRIDGE_TRANSPORT_CODE,
    message: `forge tool bridge ${verb}: ${why} (renderer bridge unavailable; Story 9 degradation)`,
  })

  /** 单次 attempt:宽限(无流时)→ 投递 → 预算兜底。 */
  const attemptOnce = (
    verb: ForgeToolBridgeVerb,
    args: Record<string, unknown>,
    actor: string,
  ): Promise<BridgeOutcome> =>
    new Promise<BridgeOutcome>((resolve) => {
      const callId = mintCallId()
      const entry: PendingAttempt = { resolve, delivered: false, budgetTimer: undefined, graceTimer: undefined }
      pending.set(callId, entry)

      // 预算兜底:无论投递与否,attempt 总时限(spike §3.3 每调用预算)。
      entry.budgetTimer = setTimeout(() => {
        settle(callId, transportFail(verb, entry.delivered
          ? `no answer within ${budgets.callBudgetMs}ms`
          : `timed out after ${budgets.callBudgetMs}ms with no renderer bridge stream attached`))
      }, budgets.callBudgetMs)

      if (waiters.length > 0) {
        entry.delivered = true
        deliver({ callId, verb, args, actor })
        return
      }

      // 宽限路径:无流 → 等接入或宽限耗尽(快速失败,不等满预算)。
      const arrived = (): void => {
        waiterArrived.delete(arrived)
        if (pending.get(callId) !== entry) return // 已终局(预算先于接入的竞态)
        if (entry.graceTimer !== undefined) clearTimeout(entry.graceTimer)
        entry.delivered = true
        deliver({ callId, verb, args, actor })
      }
      waiterArrived.add(arrived)
      entry.graceTimer = setTimeout(() => {
        waiterArrived.delete(arrived)
        settle(callId, transportFail(verb, `no renderer bridge stream attached within the ${budgets.connectGraceMs}ms connect grace`))
      }, budgets.connectGraceMs)
    })

  /** client 订阅生成器:注册 waiter → 重放 backlog → 持续吐帧。 */
  async function* attachGenerator(signal: AbortSignal): AsyncGenerator<ForgeToolBridgeCall> {
    const buffer: ForgeToolBridgeCall[] = []
    let wake: (() => void) | undefined
    const waiter: Waiter = {
      push(call: ForgeToolBridgeCall): void {
        buffer.push(call)
        wake?.()
      },
    }
    const onAbort = (): void => wake?.()
    waiters.push(waiter)
    signal.addEventListener('abort', onAbort, { once: true })
    // backlog 重放:本 waiter 注册前入队的调用(spike §3.2 boot 竞态吸收)。
    for (const parked of backlog.splice(0)) buffer.push(parked)
    // 「有流接入」通知:宽限等待中的 attempt 立即投递(spike 快速失败面)。
    for (const notify of [...waiterArrived]) notify()

    try {
      while (!signal.aborted) {
        while (buffer.length > 0) {
          const call = buffer.shift()
          if (call === undefined) continue
          yield call
        }
        if (signal.aborted) break
        await new Promise<void>((release) => {
          wake = release
          if (signal.aborted) release()
        })
        wake = undefined
      }
    } finally {
      detach(waiter)
      signal.removeEventListener('abort', onAbort)
    }
  }

  return {
    attach: (signal: AbortSignal): ToolBridgeWaiterStream => attachGenerator(signal),
    callWithRetry(
      verb: ForgeToolBridgeVerb,
      args: Record<string, unknown>,
      actor: string,
    ): Promise<BridgeOutcome> {
      return attemptOnce(verb, args, actor).then((first) => {
        if (first.ok || first.code !== BRIDGE_TRANSPORT_CODE) return first
        // transport 级失败 → 重试一次(spike §3.3;新 callId,旧 answer 幂等忽略)。
        return attemptOnce(verb, args, actor)
      })
    },
    settleFromClient(answer: ForgeToolBridgeAnswer): { ok: true; ignored?: boolean } {
      const attempt = pending.get(answer.callId)
      if (attempt === undefined) return { ok: true, ignored: true } // 过期帧:幂等忽略
      if (answer.ok) {
        settle(answer.callId, { ok: true, value: answer.value })
        return { ok: true }
      }
      settle(answer.callId, {
        ok: false,
        code: typeof answer.code === 'string' && answer.code !== '' ? answer.code : 'ERR_WORKBENCH_DB',
        message: typeof answer.message === 'string' && answer.message !== '' ? answer.message : 'workbench verb rejected',
        ...(answer.detail === undefined ? {} : { detail: answer.detail }),
      })
      return { ok: true }
    },
    get waiterCount(): number {
      return waiters.length
    },
  }
}

/**
 * 看板限定地址形态判定(工具面镜像;tech-design §Interface 2 taskKey 校验 =
 * 单 `/` 分隔 + 两段非空 + 禁路径分隔/控制字符,弃裸 ID 数字正则——M2 已证
 * 裸 ID 假设不成立,localId 含 `5.gate`/`T-review-doc`/`disc-1` 等形态)。
 * 内核侧权威校验 = task-repo isBoardTaskKey(语义同源,双闸防御,T1)。
 */
export function isBoardTaskKeyAddress(taskKey: string): boolean {
  const parts = taskKey.split('/')
  if (parts.length !== 2) return false
  return isAddressSegment(parts[0] as string) && isAddressSegment(parts[1] as string)
}

/** 段内禁字符:路径分隔符(`\\`)+ C0/DEL 控制字符(`/` 由 split 承担)。 */
function isAddressSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false // 控制字符(C0 + DEL)
    if (ch === '/' || ch === '\\') return false // 路径分隔
  }
  return true
}
