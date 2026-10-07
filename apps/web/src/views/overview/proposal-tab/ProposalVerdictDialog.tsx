// 评审流转对话框（定位：业务——4.2 UF-1 人工裁决，Hard Rule：官方 Modal 形制 + 目标态
// 允许集 + reason 必带 + 空因拒绝留场——M2 转移对话框语义沿袭）。目标态唯一源 =
// allowedTransitions 纯函数（五态机矩阵——prototype 170 断言基线单源；服务端
// assertDomainTransition 同门校验为词汇−当前超集，UI 只列五态机边——恒不送非法目标）。
// accepted 分叉文案按 mode（远征 → 单步成链建 feature / 突击 → 直接任务阶段·无 feature /
// 未标记 → NULL 边界不成链——tech-design 图 6）。superseded 必带 supersededBy（contracts
// TransitionProposalInput 形状 + 服务 fail-loud 面——UI 先验同门）。reason = 人工裁决门槛
// （M2 语义沿袭）；提案域审计 = decided_at（Interface 3 权威——reason 不入载荷）。
// 组装分工沿 M2 抽屉形制：Body = 纯渲染体（renderToStaticMarkup 全相位可测）；
// ProposalVerdictDialog = 装载壳（官方 Modal + 受控状态 + rpc 提交；Esc/遮罩关闭归 Modal，
// 开弹行为归 4.6 接线 + e2e）。
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  PROPOSAL_STATUS_LABELS,
  type Mode,
  type ProposalStatus,
  type TransitionProposalInput,
  type TransitionProposalResult,
} from '@dsh-forge/contracts'
import { Button, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { rpcUiState, type RpcUiStateKind } from '../../../rpc/ui-state.js'
import { RpcClientError } from '../../../rpc/errors.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../../rpc/index.js'
import { PROPOSAL_STATUS_TAG_TONE } from './ProposalStatusChips.js'
import './proposal-tab.css'

/** 对话框消费的最小提案投影（ProposalCard / ProposalRow 结构性满足——⋯ 菜单入口喂 4.6） */
export interface VerdictProposalView {
  readonly proposalId: string
  readonly title: string
  readonly proposalStatus: ProposalStatus
  /** 模式溯源（undefined = 未标记——accepted 分叉文案 NULL 边界支） */
  readonly mode: Mode | undefined
}

/** superseded 取代链候选行（frame 注入 listProposals − 自身——4.6 接线；Body 防御性再滤自身） */
export interface VerdictSupersedeCandidate {
  readonly proposalId: string
  readonly title: string
}

// ─────────────────────────── 纯模型（AC2 判定面） ───────────────────────────

/**
 * 提案五态机矩阵（人类面允许集——prototype data.js「五态机纯函数」170 断言基线单源）：
 * draft → 评审中起步；under-review → 裁决三向（accepted/rejected/打回 draft）；
 * accepted → 仅可被取代；rejected → 打回 draft 重启；superseded → 终态无出边。
 * Record 穷尽 = 加态编译红（M2 AGENT_TRANSITION_MATRIX 同纪律）。
 * 注：服务端 assertDomainTransition（core 2.2）= 词汇−当前超集（M2 Interface 10 human 面
 * 同构）——本矩阵为 UI 菜单窄集，恒 ⊆ 服务端可收集，零非法发送面。
 */
export const PROPOSAL_TRANSITION_MATRIX: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  draft: ['under-review'],
  'under-review': ['accepted', 'rejected', 'draft'],
  accepted: ['superseded'],
  rejected: ['draft'],
  superseded: [],
}

/** 五态机允许集（AC2：对话框目标态唯一源；返回全新数组——调用方改写不污染矩阵） */
export function allowedTransitions(current: ProposalStatus): ProposalStatus[] {
  return [...PROPOSAL_TRANSITION_MATRIX[current]]
}

/** 提交校验失败形（target-required = 空允许集防线 / reason-required = 空因 / superseded-by-required = 取代链目标缺席） */
export type VerdictSubmitError = 'target-required' | 'reason-required' | 'superseded-by-required'

/**
 * 提交校验（AC2）：目标在场 + reason 非空 + superseded 必带 supersededBy → 载荷；
 * 否则拒绝理由。载荷 = TransitionProposalInput 权威形状（reason 不入——提案域审计 =
 * decided_at；supersededBy 仅 superseded 目标携带）。
 */
export function checkVerdictSubmit(input: {
  readonly projectId: string
  readonly proposal: VerdictProposalView
  readonly toStatus: ProposalStatus | undefined
  readonly supersededBy: string | undefined
  readonly reason: string
}): { readonly ok: true; readonly payload: TransitionProposalInput } | { readonly ok: false; readonly error: VerdictSubmitError } {
  if (input.toStatus === undefined) return { ok: false, error: 'target-required' }
  if (input.reason.trim() === '') return { ok: false, error: 'reason-required' }
  if (input.toStatus === 'superseded' && (input.supersededBy ?? '') === '') {
    return { ok: false, error: 'superseded-by-required' }
  }
  const payload: TransitionProposalInput = {
    projectId: input.projectId,
    proposalId: input.proposal.proposalId,
    toStatus: input.toStatus,
  }
  if (input.toStatus === 'superseded') payload.supersededBy = input.supersededBy
  return { ok: true, payload }
}

/**
 * accepted 分叉文案（AC2：远征 → 将单步成链建 feature / 突击 → 直接进入任务阶段·无 feature /
 * 未标记 → NULL 边界不成链——tech-design 图 6 三支；PRD v6 裁决「突击无 feature 阶段」）。
 */
export function verdictAcceptedHint(mode: Mode | undefined): string {
  if (mode === 'expedition') {
    return '远征提案 accepted → 将单步成链建 feature（registerFeature 原子：feature 行 + proposal_id 谱系 + feature_records 审计行）'
  }
  if (mode === 'blitz') {
    return '突击提案 accepted → 直接进入任务阶段·无 feature（突击只有提案与任务——任务直挂提案）'
  }
  return '未标记提案（无溯源）accepted 不成链——先经「更改模式」定模式，补链走显式 registerFeature'
}

/** 对话框错误形（客户端校验三形 + rpc 失败一形——留场错误条；字面量判别成员展开窄化） */
export type VerdictDialogError =
  | { readonly kind: 'target-required' }
  | { readonly kind: 'reason-required' }
  | { readonly kind: 'superseded-by-required' }
  | { readonly kind: 'rpc'; readonly message: string }

/** 错误提示文案（AC2：错误提示在场——已选与内容保留口径） */
export function verdictErrorMessage(error: VerdictDialogError): string {
  if (error.kind === 'reason-required') return '原因必填——填写后重试（已选目标与内容保留）'
  if (error.kind === 'target-required') return '未选择目标状态——当前状态无可流转目标'
  if (error.kind === 'superseded-by-required') return '已取代需指定取代提案——选择目标提案后重试'
  return `流转失败：${error.message}`
}

/** 提交结果（归一——永不 reject） */
export type VerdictSubmitOutcome =
  | { readonly ok: true; readonly result: TransitionProposalResult }
  | { readonly ok: false; readonly error: { readonly message: string; readonly uiState: RpcUiStateKind } }

// ─────────────────────────── 确认动作（装载壳消费的纯异步面） ───────────────────────────

/** 对话框受控态（装载壳持有） */
export interface VerdictDialogState {
  readonly toStatus: ProposalStatus | undefined
  readonly supersededBy: string | undefined
  readonly reason: string
  readonly error: VerdictDialogError | undefined
  readonly submitting: boolean
}

/** 初始态：已选目标 = 允许集首项（非空交付集免点选；空集 = undefined → target-required 防线） */
export function initialVerdictDialogState(options: readonly ProposalStatus[]): VerdictDialogState {
  return { toStatus: options[0], supersededBy: undefined, reason: '', error: undefined, submitting: false }
}

/** 确认动作补丁——恒不含 toStatus/supersededBy/reason（「不清空已选」结构性成立：补丁无此三键） */
export type VerdictDialogPatch = Partial<Omit<VerdictDialogState, 'toStatus' | 'supersededBy' | 'reason'>>

/** 确认动作依赖（装载壳注入） */
export interface VerdictConfirmDeps {
  readonly projectId: string
  readonly proposal: VerdictProposalView
  readonly makeClient: RpcClientFactory
  readonly onDone: (result: TransitionProposalResult) => void
  /** 补丁应用器（装载壳 setState 增量合并） */
  readonly onPatch: (patch: VerdictDialogPatch) => void
}

/**
 * 确认动作（AC2 主流程——纯异步面）：空因/目标缺席/取代目标缺席 → 单补丁拒绝留场（错误入位，
 * rpc 与 onDone 零调用）；通过 → 提交中补丁（submitting=true 防双发）→ proposals.transition
 * 唯一通道 → 成功 onDone + 清错态 / 失败 rpc 错误留场。提交中重复确认 = no-op（单飞守卫）。
 */
export async function confirmVerdictDialog(state: VerdictDialogState, deps: VerdictConfirmDeps): Promise<void> {
  if (state.submitting) return
  const check = checkVerdictSubmit({
    projectId: deps.projectId,
    proposal: deps.proposal,
    toStatus: state.toStatus,
    supersededBy: state.supersededBy,
    reason: state.reason,
  })
  if (!check.ok) {
    deps.onPatch({ error: { kind: check.error } }) // 拒绝留场——选择与内容原样（补丁不含此三键）
    return
  }
  deps.onPatch({ error: undefined, submitting: true })
  const out = await submitProposalVerdict(deps.makeClient(), check.payload)
  if (out.ok) {
    deps.onDone(out.result)
    deps.onPatch({ error: undefined, submitting: false })
    return
  }
  deps.onPatch({ error: { kind: 'rpc', message: out.error.message }, submitting: false })
}

/** 裁决提交（AC2——rpc proposals.transition 唯一通道；typed error → message + rpcUiState 映射） */
export async function submitProposalVerdict(
  client: ForgeRpcClient,
  input: TransitionProposalInput,
): Promise<VerdictSubmitOutcome> {
  try {
    const result = await client.proposals.transition(input)
    return { ok: true, result }
  } catch (error) {
    if (error instanceof RpcClientError) {
      return { ok: false, error: { message: error.message, uiState: rpcUiState(error.code) } }
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' } }
  }
}

// ─────────────────────────── 纯渲染体（全相位 renderToStaticMarkup 可测） ───────────────────────────

export interface ProposalVerdictDialogBodyProps {
  readonly proposal: VerdictProposalView
  /** 选项集（= allowedTransitions(proposal.proposalStatus)——装载壳注入，唯一源直喂） */
  readonly options: readonly ProposalStatus[]
  /** 已选目标（undefined = 空允许集防线——select 落空占位） */
  readonly toStatus: ProposalStatus | undefined
  /** 已选取代目标（superseded 目标面；undefined = 未选） */
  readonly supersededBy: string | undefined
  /** 取代链候选（frame 注入 listProposals；Body 滤除自身） */
  readonly candidates: readonly VerdictSupersedeCandidate[]
  readonly reason: string
  /** 错误（在场 = 拒绝留场错误提示；undefined = 无错相位） */
  readonly error: VerdictDialogError | undefined
  readonly onEditTarget: (status: ProposalStatus) => void
  readonly onEditSupersededBy: (proposalId: string) => void
  readonly onEditReason: (reason: string) => void
}

/** 评审流转对话框纯渲染体（当前状态只读 + 目标态选择[仅允许集] + superseded 取代面 +
 * accepted 分叉文案 + 原因必填 + 错误条） */
export function ProposalVerdictDialogBody({
  proposal,
  options,
  toStatus,
  supersededBy,
  candidates,
  reason,
  error,
  onEditTarget,
  onEditSupersededBy,
  onEditReason,
}: ProposalVerdictDialogBodyProps): ReactNode {
  const superseding = toStatus === 'superseded'
  const accepted = toStatus === 'accepted'
  return (
    <div className="dswf-ov-vd" data-dswf-ov-vd="">
      <div className="dswf-ov-vd-row">
        <label className="dswf-ov-vd-label">当前状态</label>
        <div className="dswf-ov-vd-static" data-dswf-ov-vd-from="">
          <Tag tone={PROPOSAL_STATUS_TAG_TONE[proposal.proposalStatus]}>
            {PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}
          </Tag>
        </div>
      </div>
      <div className="dswf-ov-vd-row">
        <label className="dswf-ov-vd-label" htmlFor="dswf-ov-vd-to">
          目标状态
        </label>
        <select
          id="dswf-ov-vd-to"
          className="dswf-ov-vd-select"
          data-dswf-ov-vd-to=""
          value={toStatus ?? ''}
          data-modal-autofocus
          disabled={options.length === 0}
          onChange={(event) => {
            onEditTarget(event.target.value as ProposalStatus)
          }}
        >
          {options.length === 0 ? <option value="">（无允许目标态）</option> : null}
          {options.map((status) => (
            <option key={status} value={status}>
              {PROPOSAL_STATUS_LABELS[status].zh}（{PROPOSAL_STATUS_LABELS[status].en}）
            </option>
          ))}
        </select>
      </div>
      {superseding ? (
        <div className="dswf-ov-vd-row" data-dswf-ov-vd-supersede="">
          <label className="dswf-ov-vd-label" htmlFor="dswf-ov-vd-supersede-by">
            取代提案（必选）
          </label>
          <select
            id="dswf-ov-vd-supersede-by"
            className="dswf-ov-vd-select"
            data-dswf-ov-vd-supersede-by=""
            value={supersededBy ?? ''}
            onChange={(event) => {
              onEditSupersededBy(event.target.value)
            }}
          >
            <option value="">（选择取代本提案的目标提案）</option>
            {candidates
              .filter((candidate) => candidate.proposalId !== proposal.proposalId)
              .map((candidate) => (
                <option key={candidate.proposalId} value={candidate.proposalId}>
                  {candidate.title}
                </option>
              ))}
          </select>
        </div>
      ) : null}
      {accepted ? (
        <p className="dswf-ov-vd-hint" data-dswf-ov-vd-accepted-hint={proposal.mode ?? 'unmarked'}>
          {verdictAcceptedHint(proposal.mode)}
        </p>
      ) : null}
      <div className="dswf-ov-vd-row">
        <label className="dswf-ov-vd-label" htmlFor="dswf-ov-vd-reason">
          原因（必填）
        </label>
        <textarea
          id="dswf-ov-vd-reason"
          className="dswf-ov-vd-reason"
          data-dswf-ov-vd-reason=""
          value={reason}
          placeholder="如：证据充分可接受 / 需补充调研打回 / 被新提案取代…"
          onChange={(event) => {
            onEditReason(event.target.value)
          }}
        />
      </div>
      {error !== undefined ? (
        <p className="dswf-ov-vd-err" role="alert" data-dswf-ov-vd-error={error.kind}>
          {verdictErrorMessage(error)}
        </p>
      ) : null}
    </div>
  )
}

// ─────────────────────────── 装载壳（官方 Modal + 受控状态 + rpc 提交） ───────────────────────────

export interface ProposalVerdictDialogProps {
  /** 当前项目 id */
  readonly projectId: string
  /** 目标提案（ProposalCard / ProposalRow 均可喂——⋯ 菜单入口 4.6 接线） */
  readonly proposal: VerdictProposalView
  /** superseded 取代链候选（frame 注入 listProposals 映射） */
  readonly candidates: readonly VerdictSupersedeCandidate[]
  /** 关闭（Esc / 取消 / 遮罩——官方 Modal 承载；上抛装配方） */
  readonly onCancel: () => void
  /** 提交成功（结果回传——4.6 关闭对话框 + 重取；失败留场归本组件错误条） */
  readonly onDone: (result: TransitionProposalResult) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/** 评审流转对话框装载壳（官方 Modal 形制——Hard Rule）：初始选中 = 允许集首项；
 * 确认 = confirmVerdictDialog 纯动作（补丁增量合并——选择与内容结构性不被清空）。 */
export function ProposalVerdictDialog({
  projectId,
  proposal,
  candidates,
  onCancel,
  onDone,
  makeClient = preloadRpcClientFactory,
}: ProposalVerdictDialogProps): ReactNode {
  const options = useMemo(() => allowedTransitions(proposal.proposalStatus), [proposal.proposalStatus])
  const [state, setState] = useState<VerdictDialogState>(() => initialVerdictDialogState(options))

  const handleConfirm = useCallback(async (): Promise<void> => {
    await confirmVerdictDialog(state, {
      projectId,
      proposal,
      makeClient,
      onDone,
      onPatch: (patch) => {
        setState((prev) => ({ ...prev, ...patch }))
      },
    })
  }, [state, projectId, proposal, makeClient, onDone])

  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel="关闭"
      title="评审流转"
      description={proposal.title}
      footer={
        <>
          <Button variant="outline" size="sm" className="dswf-ov-vd-cancel" data-dswf-ov-vd-cancel="" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="dswf-ov-vd-confirm"
            data-dswf-ov-vd-confirm=""
            disabled={state.submitting}
            onClick={() => {
              void handleConfirm()
            }}
          >
            确认流转
          </Button>
        </>
      }
    >
      <ProposalVerdictDialogBody
        proposal={proposal}
        options={options}
        toStatus={state.toStatus}
        supersededBy={state.supersededBy}
        candidates={candidates}
        reason={state.reason}
        error={state.error}
        onEditTarget={(status) => {
          setState((prev) => ({ ...prev, toStatus: status }))
        }}
        onEditSupersededBy={(proposalId) => {
          setState((prev) => ({ ...prev, supersededBy: proposalId }))
        }}
        onEditReason={(reason) => {
          setState((prev) => ({ ...prev, reason }))
        }}
      />
    </Modal>
  )
}
