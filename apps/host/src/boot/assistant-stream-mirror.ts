// assistant 流式帧镜像（mobile-ui 打字机腿——官方 agent/assistant-stream emit 事件直订）：
// agent 进程的瞬态 AssistantStreamFrame（start/chunk/end，text-delta / reasoning-delta 密帧）
// 经 forge-stream 逐帧转发给 mobile。会话归属 = payload.agent.session.id（dsh-session
// Session.id 官方取法）。缺席字段/非会话帧 fail-soft 丢弃（与 subscribeOfficialEvents 同纪律）。

/** forge-stream 镜像事件类型名（mobile 侧 onEvent 消费）。 */
export const ASSISTANT_STREAM_MIRROR_TYPE = 'agent/assistant-stream'

/** 官方事件订阅缝（child.ts ctx.on 同缝——缺席/拒绝 = 零订阅 fail-soft）。 */
export type CtxOn = (event: string, handler: (payload: unknown) => void) => unknown

export interface AssistantStreamMirrorDeps {
  readonly ctxOn: CtxOn
  readonly emit: (event: { readonly type: string; readonly payload: unknown; readonly at: number }) => void
  readonly diag: (line: string) => void
}

/** agent 载荷窄面（仅取会话身份——frame 原样透传）。 */
export interface AssistantStreamAgentPayload {
  readonly agent?: { readonly session?: { readonly id?: unknown } }
  readonly frame?: unknown
}

/** payload → 会话 id（官方 Session.id 官方取法；非字符串 = undefined）。 */
export function assistantStreamSessionIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const id = (payload as AssistantStreamAgentPayload).agent?.session?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/**
 * 订阅官方 agent/assistant-stream → 镜像为 forge-stream 事件（payload = {sessionId, frame}）。
 * 返回退订（注册失败 = 空退订 fail-soft——teardown 纪律同 subscribeOfficialEvents）。
 */
export function subscribeAssistantStreamMirror(deps: AssistantStreamMirrorDeps): () => void {
  try {
    const off = deps.ctxOn(ASSISTANT_STREAM_MIRROR_TYPE, (payload) => {
      const sessionId = assistantStreamSessionIdOf(payload)
      if (sessionId === undefined) {
        deps.diag(`[pair-diag] ${ASSISTANT_STREAM_MIRROR_TYPE} 帧缺会话身份——丢弃`)
        return
      }
      const frame = (payload as AssistantStreamAgentPayload).frame
      deps.emit({ type: ASSISTANT_STREAM_MIRROR_TYPE, payload: { sessionId, frame }, at: Date.now() })
    })
    return typeof off === 'function' ? off as () => void : () => {}
  } catch (cause) {
    deps.diag(`[pair-diag] ${ASSISTANT_STREAM_MIRROR_TYPE} 订阅缺席：${String(cause)}`)
    return () => {}
  }
}
