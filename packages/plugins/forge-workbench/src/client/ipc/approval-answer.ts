/**
 * client/ipc/approval-answer — 审批决策送达腿(renderer 驱动;任务 6.5/SC3)。
 *
 * spike-2 §1.3 ③ 定形的决策送达链的 renderer 半腿(tech-design §Interface 3
 * 「decideApproval 反向经桥回 subagent 审批通道」):人在审批 dock 显式决策 →
 * 内核 decideApproval 先落库(approval_request.state + decided_by 审计;最后
 * pending 清零 → dispatch awaiting → running)→ **本模块**把 (approvalId,
 * approve) 对经 host approval-bridge rpc(`approvalBridge/answer`)回注 → 桥核
 * settle() resolve 该请求的 pending 决策 → listener 返回 ApprovalOutcome 原生
 * 回注 subagent 的 pending 工具调用(零伪造通道)。
 *
 * 形态(dispatch-relay.ts 任务 6.3 先例逐条对应):
 *   1. NAMESPACE — `approvalBridge/answer` 描述符并入工具桥的**共享贡献**
 *      (tool-bridge.ts FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION;同包二次 $mount
 *      会被 typert 以「already registered」拒绝,故本模块不自挂);
 *   2. THE LEG — decideApproval 动词成功后 fire-and-forget 投递:内核行已决
 *      是权威事实,送达腿失败不上抛(晚到/未知 = host 侧 {settled:false}
 *      幂等;桥核的 pending 表是该腿的收据面);
 *   3. 安装位 — client apply 经 installApprovalAnswerRelay(ctx)(plugin
 *      lifetime;无 remote = no-op)。createIpcDispatchFace 的 decideApproval
 *      腿经模块槽消费(absent = 内核单侧语义:行已决,送达待链路)。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

// ---------------------------------------------------------------------------
// 1. The namespace face (mounted by the shared tool-bridge contribution)
// ---------------------------------------------------------------------------

/** host ApprovalAnswerInput 的宽松读取面(形态由 host 复验)。 */
export interface ApprovalAnswerRequest {
  readonly approvalId: string
  readonly approve: boolean
}

/** The mounted approvalBridge namespace's structural face (duck-checked at read). */
interface ApprovalBridgeNamespace {
  answer(input: ApprovalAnswerRequest): Promise<RemoteResult<{ settled: boolean }>>
}

// ---------------------------------------------------------------------------
// 2. The delivery leg (decideApproval resolved → host settle)
// ---------------------------------------------------------------------------

/**
 * 一次决策的送达腿:answer(approvalId, approve)。fire-and-forget 语义 ——
 * 本函数自身的 Promise 仅作测试观测面;transport/gateway 失败吞掉(内核行
 * 已决是权威事实,桥核 pending 表的晚到/重复 settle 幂等)。
 */
export async function deliverApprovalAnswer(
  namespace: ApprovalBridgeNamespace,
  approvalId: string,
  approve: boolean,
): Promise<void> {
  try {
    await namespace.answer({ approvalId, approve })
  } catch {
    // 显式降级面:送达腿失败不改写已决事实(禁静默的呈现面 = 桥核 pending
    // 表;重放由下一次决策/会话终局兜底)。
  }
}

// ---------------------------------------------------------------------------
// 3. The module slot + the installer (client apply 消费)
// ---------------------------------------------------------------------------

/** The relay face createIpcDispatchFace consults (absent = delivery waits). */
export interface ApprovalAnswerRelay {
  answerDecision(approvalId: string, approve: boolean): void
}

let relaySlot: ApprovalAnswerRelay | undefined

/** Install the relay face (idempotent; returns the restore-uninstall). */
export function setApprovalAnswerRelay(relay: ApprovalAnswerRelay | undefined): () => void {
  const previous = relaySlot
  relaySlot = relay
  return () => { relaySlot = previous }
}

/** The installed relay (undefined = the seam is absent; delivery waits). */
export function approvalAnswerRelayOf(): ApprovalAnswerRelay | undefined {
  return relaySlot
}

/** 读取已挂载的 approvalBridge 命名空间(结构面 duck-checked,缺席 → undefined)。 */
function namespaceOf(ctx: ClientContext): ApprovalBridgeNamespace | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('remote.approvalBridge', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Record<string, unknown>
  return typeof face.answer === 'function' ? candidate as ApprovalBridgeNamespace : undefined
}

/**
 * 安装审批决策送达腿(client apply 调用):轮询等待 `remote.approvalBridge`
 * 命名空间在场 —— 该命名空间由工具桥安装器的**共享挂载**登记(描述符已并入
 * FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION,本模块不自挂)。命名空间就位即装填
 * 模块槽;缺席/拒绝 = no-op(内核单侧语义)。返回拆卸句柄。
 */
export function installApprovalAnswerRelay(ctx: ClientContext): () => void {
  if (typeof (ctx as { inject?: unknown }).inject !== 'function') return () => {}
  const fiber = (ctx as unknown as {
    inject(names: string[], body: (ctx: ClientContext) => void): { dispose(): Promise<void> | void }
  }).inject(['remote'], (remoteCtx: ClientContext) => {
    const ANSWER_POLL_MS = 250
    const ANSWER_POLL_MAX = 240 // ~60s:the mount lands within any healthy boot
    let tries = 0
    const arm = (): void => {
      const namespace = namespaceOf(remoteCtx)
      if (namespace === undefined) return
      const restore = setApprovalAnswerRelay({
        answerDecision: (approvalId, approve) => { void deliverApprovalAnswer(namespace, approvalId, approve) },
      })
      remoteCtx.effect(() => () => { restore() }, 'forge-workbench: approval answer relay unmount')
    }
    arm() // already mounted (the usual boot: the tool-bridge fiber ran first)
    const timer = setInterval(() => {
      tries += 1
      if (approvalAnswerRelayOf() !== undefined || tries > ANSWER_POLL_MAX) {
        clearInterval(timer)
        return
      }
      arm()
    }, ANSWER_POLL_MS)
    remoteCtx.effect(() => () => { clearInterval(timer) }, 'forge-workbench: approval answer relay mount wait')
  })
  return () => {
    setApprovalAnswerRelay(undefined)
    void fiber.dispose()
  }
}
