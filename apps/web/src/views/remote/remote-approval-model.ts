// 远程审批动作模型（定位：业务——mobile-remote-approval 1.4 的纯派生/归一层）。
// 单源纪律：审批决策只经 1.1 官方转发通道 forge:remote/approval 上行（产品不自持审批
// 状态——本模块零审批状态持久化，phase 仅 UI 反馈态）；结果一致性归同一状态层——成功后
// 由组件触发 forge:remote/progress 重 poll，桌面工作台与手机侧同读（无本地副本）。
// 三态口径（settings 五态同型）：idle → submitting（提交冻结）→ success（成功回显，
// 组件定时复位）| error（错误可重试——动作恢复，再 begin 即重发）。
import { REMOTE_CHANNELS, type RemoteApprovalDecision, type RemoteApprovalDecisionInput } from '@dsh-forge/contracts'
import type { ForgeTransport } from '../../rpc/transport.js'

/** 审批动作反馈三态（idle = 无在途动作；submitting = 提交冻结；success/error = 回显态） */
export type RemoteApprovalPhase = 'idle' | 'submitting' | 'success' | 'error'

/** 审批动作 UI 态（单槽——同一时刻至多一个在途决策，与受限单页单动作流同型） */
export interface RemoteApprovalState {
  readonly requestId: string
  readonly decision: RemoteApprovalDecision | null
  readonly phase: RemoteApprovalPhase
  /** error 相位错误文案（其余相位恒 null——回显单源） */
  readonly message: string | null
}

/** 转发归一结果（ok = 官方转发面确认收货；不 ok 附可回显文案） */
export interface ApprovalOutcome {
  readonly ok: boolean
  readonly message?: string
}

/** 初始态（idle 空槽） */
export function initialApprovalState(): RemoteApprovalState {
  return { requestId: '', decision: null, phase: 'idle', message: null }
}

/** 提交（begin）：入 submitting 冻结态，载荷 = requestId + decision（冻结期禁重复提交） */
export function beginApproval(
  _state: RemoteApprovalState,
  requestId: string,
  decision: RemoteApprovalDecision,
): RemoteApprovalState {
  return { requestId, decision, phase: 'submitting', message: null }
}

/** 结算（resolve）：ok → success（成功回显，复位归组件定时径）；不 ok → error + 文案（畸形 outcome 兜底通用文案） */
export function resolveApproval(state: RemoteApprovalState, outcome: ApprovalOutcome): RemoteApprovalState {
  if (outcome.ok) return { ...state, phase: 'success', message: null }
  return { ...state, phase: 'error', message: outcome.message ?? '审批提交失败，请重试' }
}

/** 成功复位（组件定时径单源）：清载荷回 idle */
export function resetApproval(_state: RemoteApprovalState): RemoteApprovalState {
  return initialApprovalState()
}

/** 交互编排钩子（onState = 态写回；onDecided = 成功回调——触发进度重 poll 使桌面一致） */
export interface ApprovalDecisionHooks {
  readonly onState: (state: RemoteApprovalState) => void
  readonly onDecided: () => void
}

/**
 * 一次决策的完整编排（组件交互径单源——纯异步可测）：begin 冻结 → 转发归一 → 结算态
 * 写回 → ok 时回调 onDecided（进度重 poll，桌面工作台同一审批项状态同步）。提交冻结由
 * 调用方在入口把关（submitting 期忽略新决策——单槽纪律）。
 */
export async function runApprovalDecision(
  transport: ForgeTransport,
  requestId: string,
  decision: RemoteApprovalDecision,
  hooks: ApprovalDecisionHooks,
): Promise<void> {
  const inFlight = beginApproval(initialApprovalState(), requestId, decision)
  hooks.onState(inFlight)
  const outcome = await submitApprovalDecision(transport, { requestId, decision })
  hooks.onState(resolveApproval(inFlight, outcome))
  if (outcome.ok) hooks.onDecided()
}

/** 信封窄判（ForgeRemoteView 同型手写守卫——通道信封非 typed client 面的既有口径） */
function isEnvelope(value: unknown): value is { ok: boolean; data?: unknown; error?: { message?: string } } {
  return typeof value === 'object' && value !== null && 'ok' in value
}

/**
 * 动作转发（唯一上行走线）：transport(REMOTE_CHANNELS.approval, input) → 信封归一——
 * forwarded=true → ok；forwarded=false（官方审批面缺席 fail-soft）/ 非 ok 信封 / 传输抛错
 * → 不 ok + 可回显文案（永不 reject，三态 error 径单源）。
 */
export async function submitApprovalDecision(
  transport: ForgeTransport,
  input: RemoteApprovalDecisionInput,
): Promise<ApprovalOutcome> {
  try {
    const raw = await transport(REMOTE_CHANNELS.approval, input)
    if (isEnvelope(raw) && raw.ok) {
      const data = raw.data as { forwarded?: boolean } | undefined
      if (data?.forwarded === true) return { ok: true }
      return { ok: false, message: '审批通道不可用（官方审批面未接线），请稍后重试' }
    }
    const message = isEnvelope(raw) && typeof raw.error?.message === 'string' ? raw.error.message : '审批提交失败'
    return { ok: false, message }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
