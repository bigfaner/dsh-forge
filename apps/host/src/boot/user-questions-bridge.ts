// user-questions waterfall 桥（mobile-ui ask 断链修复——bug f73315a1）：
// 官方 user-questions/request 是 cordis waterfall（请求-应答链，dsh-user-questions
// lib/index.js ctx.waterfall("user-questions/request", request, noAnswerer)）——必须有
// answerer 返回答案，否则 NO_PROVIDER 工具挂起。本桥注册为 answerer：请求镜像给手机
// （forge-stream user-questions/request 帧），等待手机应答通道回灌 resolve；无超时
// （桌面同语义——挂起至回答或 signal 中止；中止/放弃 = next() 透传给后续 answerer）。

/** 官方 AskUserQuestionRequestEvent 窄面（仅取桥所需字段）。 */
export interface UQRequestEvent {
  readonly questions?: unknown
  readonly agent?: { readonly session?: { readonly id?: unknown } }
  readonly callId?: unknown
  readonly wait?: { readonly callId?: unknown }
  readonly signal?: AbortSignal
}

export interface UQBridgeDeps {
  /** 镜像帧扇出（全部存活 forge-stream 连接）。 */
  readonly emit: (event: { readonly type: string; readonly payload: unknown; readonly at: number }) => void
  readonly diag: (line: string) => void
  /** 存活连接数（诊断面——handle 入口落日志用）。 */
  readonly pushCount?: () => number
  /** 镜像事件类型名（mobile onEvent 消费——与官方事件名同形）。 */
  readonly mirrorType?: string
}

export interface UQPendingEntry {
  readonly sessionId: string
  readonly callId: string
  readonly questions: unknown
  resolve(answer: unknown): void
}

export interface UserQuestionsBridge {
  /** waterfall answerer 入口（ctx.on('user-questions/request', handle)）。 */
  handle(request: unknown, next: (req: unknown) => Promise<unknown>): Promise<unknown>
  /** 手机应答回灌（forge:proxy/user-questions-answer 消费）；false = 非桥内 pending。 */
  resolve(callId: string, answer: unknown): boolean
  pendingCount(): number
  /** 某会话的全部在途题（页面刷新后面板重渲染的数据源——推送只发一次，刷新即丢）。 */
  pendingFor(sessionId: string): readonly { readonly callId: string; readonly questions: unknown }[]
}

/** 请求 → 会话 id（agent.session.id 官方取法）。 */
export function uqSessionIdOf(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined
  const id = (request as UQRequestEvent).agent?.session?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** 请求 → 题组键：wait.callId（timed 官方键）→ callId → 序号合成。 */
export function uqCallIdOf(request: unknown, ordinal: number): string {
  if (typeof request !== 'object' || request === null) return `uq-${ordinal}`
  const event = request as UQRequestEvent
  const fromWait = event.wait?.callId
  if (typeof fromWait === 'string' && fromWait !== '') return fromWait
  if (typeof event.callId === 'string' && event.callId !== '') return event.callId
  return `uq-${ordinal}`
}

export function createUserQuestionsBridge(deps: UQBridgeDeps): UserQuestionsBridge {
  const mirrorType = deps.mirrorType ?? 'user-questions/request'
  const pending = new Map<string, UQPendingEntry>()
  let ordinal = 0

  return {
    handle(request, next) {
      const callId = uqCallIdOf(request, ++ordinal)
      deps.diag(`[pair-diag] user-questions 桥：waterfall 进入 callId=${callId} pushes=${deps.pushCount?.() ?? 'n/a'}`)
      const existing = pending.get(callId)
      if (existing !== undefined) {
        deps.diag(`[pair-diag] user-questions 桥：callId=${callId} 已有在途——透传 next`)
        return next(request)
      }
      const sessionId = uqSessionIdOf(request) ?? ''
      deps.emit({
        type: mirrorType,
        payload: {
          sessionId,
          callId,
          questions: (request as UQRequestEvent)?.questions ?? [],
        },
        at: Date.now(),
      })
      return new Promise((resolve, reject) => {
        const entry: UQPendingEntry = {
          sessionId,
          callId,
          questions: (request as UQRequestEvent)?.questions ?? [],
          resolve: (answer) => {
            pending.delete(callId)
            const signal = (request as UQRequestEvent)?.signal
            signal?.removeEventListener('abort', onAbort)
            resolve(answer)
          },
        }
        const onAbort = (): void => {
          pending.delete(callId)
          deps.diag(`[pair-diag] user-questions 桥：callId=${callId} 请求中止——透传 next`)
          next(request).then(resolve, reject)
        }
        pending.set(callId, entry)
        const signal = (request as UQRequestEvent)?.signal
        if (signal !== undefined) {
          if (signal.aborted) {
            onAbort()
            return
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    },
    resolve(callId, answer) {
      const entry = pending.get(callId)
      if (entry === undefined) return false
      entry.resolve(answer)
      return true
    },
    pendingCount: () => pending.size,
    pendingFor(sessionId) {
      const out: { callId: string; questions: unknown }[] = []
      for (const entry of pending.values()) {
        if (entry.sessionId === sessionId) out.push({ callId: entry.callId, questions: entry.questions })
      }
      return out
    },
  }
}
