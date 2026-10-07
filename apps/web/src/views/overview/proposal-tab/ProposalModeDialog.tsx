// 模式更改对话框（定位：业务——4.2 UF-1 律三唯一正门：远征⇄突击二选（官方 SegmentedControl）
// + 变更说明必填（空说明拒绝留场）+「既有任务按创建时模式照旧执行」快照不回溯一行明示
// ——tech-design 图 7）。提交 = proposals.setMode 唯一通道（SetProposalModeInput 形状：
// reason 入载荷——服务端 ERR_REASON_REQUIRED 先验同门；单事务只写 proposals.mode）。
// 入口唯一不分叉：⋯ 菜单「更改模式…」与 mode chip 快捷入口同喂本组件（ui-design
// mode chip 形态注记）；未标记提案不可更改（mode chip 未标记态不可点 = 入口守卫）。
// 组装分工沿 M2 抽屉形制：Body = 纯渲染体（renderToStaticMarkup 全相位可测）；
// ProposalModeDialog = 装载壳（官方 Modal + 受控状态 + rpc 提交；Esc/遮罩关闭归 Modal，
// 开弹行为归 4.6 接线 + e2e）。
import { useCallback, useState, type ReactNode } from 'react'
import {
  MODES,
  type Mode,
  type ProposalRow,
  type SetProposalModeInput,
} from '@dsh-forge/contracts'
import { Button, Modal, SegmentedControl, type SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import { rpcUiState, type RpcUiStateKind } from '../../../rpc/ui-state.js'
import { RpcClientError } from '../../../rpc/errors.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../../rpc/index.js'
import { MODE_CHIP_LABELS } from '../../../components/ModeChip.js'
import './proposal-tab.css'

/** 对话框消费的最小提案投影（ProposalCard / ProposalRow 结构性满足；mode 必在——未标记不可更改） */
export interface ModeProposalView {
  readonly proposalId: string
  readonly title: string
  /** 当前模式（对话框起步选中；undefined 不可达——入口守卫 mode chip 未标记态不可点） */
  readonly mode: Mode
}

// ─────────────────────────── 纯模型（AC3 判定面） ───────────────────────────

/** 远征⇄突击二选项（AC3：官方 SegmentedControl 选项——prototype mode-seg 标签） */
export const MODE_DIALOG_OPTIONS: readonly SegmentedControlOption<Mode>[] = [
  { value: 'expedition', label: `远征（完整 SDD）` },
  { value: 'blitz', label: `突击（直达执行）` },
]

/** 快照不回溯一行明示（AC3——prototype dlg-note 全文：律三语义 + 新会话对齐） */
export const MODE_DIALOG_NOTE =
  '既有任务按创建时模式照旧执行（快照不回溯）；下一个经绑定入口创建的会话自动对齐新值。'

/** 提交校验失败形（reason-required = 空说明；mode-required = 防御性防线——二选控件恒有值） */
export type ModeSubmitError = 'mode-required' | 'reason-required'

/** 提交校验（AC3）：目标模式在场 + 说明非空 → 载荷（reason 修剪）；否则拒绝理由 */
export function checkModeSubmit(input: {
  readonly projectId: string
  readonly proposal: ModeProposalView
  readonly mode: Mode | undefined
  readonly reason: string
}): { readonly ok: true; readonly payload: SetProposalModeInput } | { readonly ok: false; readonly error: ModeSubmitError } {
  if (input.mode === undefined || !MODES.includes(input.mode)) return { ok: false, error: 'mode-required' }
  const reason = input.reason.trim()
  if (reason === '') return { ok: false, error: 'reason-required' }
  return {
    ok: true,
    payload: { projectId: input.projectId, proposalId: input.proposal.proposalId, mode: input.mode, reason },
  }
}

/** 对话框错误形（客户端校验两形 + rpc 失败一形——留场错误条） */
export type ModeDialogError =
  | { readonly kind: 'mode-required' }
  | { readonly kind: 'reason-required' }
  | { readonly kind: 'rpc'; readonly message: string }

/** 错误提示文案（AC3：错误提示在场——已选与内容保留口径） */
export function modeDialogErrorMessage(error: ModeDialogError): string {
  if (error.kind === 'reason-required') return '变更说明必填——填写后重试（已选模式与内容保留）'
  if (error.kind === 'mode-required') return '未选择目标模式——先选定远征或突击'
  return `模式更改失败：${error.message}`
}

/** 提交结果（归一——永不 reject） */
export type ModeSubmitOutcome =
  | { readonly ok: true; readonly row: ProposalRow }
  | { readonly ok: false; readonly error: { readonly message: string; readonly uiState: RpcUiStateKind } }

// ─────────────────────────── 确认动作（装载壳消费的纯异步面） ───────────────────────────

/** 对话框受控态（装载壳持有） */
export interface ModeDialogState {
  readonly mode: Mode | undefined
  readonly reason: string
  readonly error: ModeDialogError | undefined
  readonly submitting: boolean
}

/** 初始态：已选模式 = 当前模式（同值直出——确认前必经显式改选，零意外变更） */
export function initialModeDialogState(current: Mode): ModeDialogState {
  return { mode: current, reason: '', error: undefined, submitting: false }
}

/** 确认动作补丁——恒不含 mode/reason（「不清空已选」结构性成立：补丁无此二键） */
export type ModeDialogPatch = Partial<Omit<ModeDialogState, 'mode' | 'reason'>>

/** 确认动作依赖（装载壳注入） */
export interface ModeConfirmDeps {
  readonly projectId: string
  readonly proposal: ModeProposalView
  readonly makeClient: RpcClientFactory
  readonly onDone: (row: ProposalRow) => void
  /** 补丁应用器（装载壳 setState 增量合并） */
  readonly onPatch: (patch: ModeDialogPatch) => void
}

/**
 * 确认动作（AC3 主流程——纯异步面）：空说明 → 单补丁拒绝留场（错误入位，rpc 与 onDone
 * 零调用）；通过 → 提交中补丁（submitting=true 防双发）→ proposals.setMode 唯一通道 →
 * 成功 onDone + 清错态 / 失败 rpc 错误留场。提交中重复确认 = no-op（单飞守卫）。
 */
export async function confirmModeDialog(state: ModeDialogState, deps: ModeConfirmDeps): Promise<void> {
  if (state.submitting) return
  const check = checkModeSubmit({
    projectId: deps.projectId,
    proposal: deps.proposal,
    mode: state.mode,
    reason: state.reason,
  })
  if (!check.ok) {
    deps.onPatch({ error: { kind: check.error } }) // 拒绝留场——选择与内容原样（补丁不含此二键）
    return
  }
  deps.onPatch({ error: undefined, submitting: true })
  const out = await submitProposalMode(deps.makeClient(), check.payload)
  if (out.ok) {
    deps.onDone(out.row)
    deps.onPatch({ error: undefined, submitting: false })
    return
  }
  deps.onPatch({ error: { kind: 'rpc', message: out.error.message }, submitting: false })
}

/** 模式更改提交（AC3——rpc proposals.setMode 唯一通道；typed error → message + rpcUiState 映射） */
export async function submitProposalMode(
  client: ForgeRpcClient,
  input: SetProposalModeInput,
): Promise<ModeSubmitOutcome> {
  try {
    const row = await client.proposals.setMode(input)
    return { ok: true, row }
  } catch (error) {
    if (error instanceof RpcClientError) {
      return { ok: false, error: { message: error.message, uiState: rpcUiState(error.code) } }
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' } }
  }
}

// ─────────────────────────── 纯渲染体（全相位 renderToStaticMarkup 可测） ───────────────────────────

export interface ProposalModeDialogBodyProps {
  readonly proposal: ModeProposalView
  /** 已选目标模式（undefined = 防御性防线——seg 落空） */
  readonly mode: Mode | undefined
  readonly reason: string
  /** 错误（在场 = 拒绝留场错误提示；undefined = 无错相位） */
  readonly error: ModeDialogError | undefined
  readonly onEditMode: (mode: Mode) => void
  readonly onEditReason: (reason: string) => void
}

/** 模式更改对话框纯渲染体（当前模式注记 + 远征⇄突击二选 seg + 快照不回溯一行明示 +
 * 变更说明必填 + 错误条） */
export function ProposalModeDialogBody({
  proposal,
  mode,
  reason,
  error,
  onEditMode,
  onEditReason,
}: ProposalModeDialogBodyProps): ReactNode {
  return (
    <div className="dswf-ov-md" data-dswf-ov-md="">
      <p className="dswf-ov-md-current" data-dswf-ov-md-current="">
        当前模式：{MODE_CHIP_LABELS[proposal.mode]}——{proposal.title}
      </p>
      <div className="dswf-ov-md-row">
        <span className="dswf-ov-md-label" id="dswf-ov-md-seg-label">
          目标模式（远征⇄突击二选）
        </span>
        <SegmentedControl
          id="dswf-ov-md-seg"
          value={mode ?? proposal.mode}
          options={MODE_DIALOG_OPTIONS}
          onChange={onEditMode}
          label="目标模式（远征⇄突击二选）"
        />
      </div>
      <p className="dswf-ov-md-note" data-dswf-ov-md-note="">
        {MODE_DIALOG_NOTE}
      </p>
      <div className="dswf-ov-md-row">
        <label className="dswf-ov-md-label" htmlFor="dswf-ov-md-reason">
          变更说明（必填）
        </label>
        <textarea
          id="dswf-ov-md-reason"
          className="dswf-ov-md-reason"
          data-dswf-ov-md-reason=""
          value={reason}
          placeholder="如：目标膨胀，转完整 SDD / 范围明确，改直达执行…"
          onChange={(event) => {
            onEditReason(event.target.value)
          }}
        />
      </div>
      {error !== undefined ? (
        <p className="dswf-ov-md-err" role="alert" data-dswf-ov-md-error={error.kind}>
          {modeDialogErrorMessage(error)}
        </p>
      ) : null}
    </div>
  )
}

// ─────────────────────────── 装载壳（官方 Modal + 受控状态 + rpc 提交） ───────────────────────────

export interface ProposalModeDialogProps {
  /** 当前项目 id */
  readonly projectId: string
  /** 目标提案（mode 必在——未标记不可更改守卫归入口） */
  readonly proposal: ModeProposalView
  /** 关闭（Esc / 取消 / 遮罩——官方 Modal 承载；上抛装配方） */
  readonly onCancel: () => void
  /** 提交成功（行回传——4.6 关闭对话框 + 重取；失败留场归本组件错误条） */
  readonly onDone: (row: ProposalRow) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/** 模式更改对话框装载壳（官方 Modal 形制——Hard Rule）：初始选中 = 当前模式；
 * 确认 = confirmModeDialog 纯动作（补丁增量合并——选择与内容结构性不被清空）。 */
export function ProposalModeDialog({
  projectId,
  proposal,
  onCancel,
  onDone,
  makeClient = preloadRpcClientFactory,
}: ProposalModeDialogProps): ReactNode {
  const [state, setState] = useState<ModeDialogState>(() => initialModeDialogState(proposal.mode))

  const handleConfirm = useCallback(async (): Promise<void> => {
    await confirmModeDialog(state, {
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
      title="更改模式"
      description={proposal.title}
      footer={
        <>
          <Button variant="outline" size="sm" className="dswf-ov-md-cancel" data-dswf-ov-md-cancel="" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="dswf-ov-md-confirm"
            data-dswf-ov-md-confirm=""
            disabled={state.submitting}
            onClick={() => {
              void handleConfirm()
            }}
          >
            确认更改
          </Button>
        </>
      }
    >
      <ProposalModeDialogBody
        proposal={proposal}
        mode={state.mode}
        reason={state.reason}
        error={state.error}
        onEditMode={(mode) => {
          setState((prev) => ({ ...prev, mode }))
        }}
        onEditReason={(reason) => {
          setState((prev) => ({ ...prev, reason }))
        }}
      />
    </Modal>
  )
}
