// 人工转移对话框（定位：业务——ui-design 流程 6 / PRD 抽屉交互流第 6 条）：目标态仅列
// TaskDetail.allowedTransitions（Hard Rule：禁自行计算——与服务端 transitionTargets 同源零漂移，
// 所见即所得）；reason 必带（空因确认拒绝留场——不清空已选/不关闭/错误提示在场）；确认 →
// transitionTask RPC（taskId + toStatus + reason）；终态提示可能触发 autoRestore。
// 组装分工沿抽屉形制：TransitionDialogBody = 纯渲染体（renderToStaticMarkup 全相位可测）；
// TransitionDialog = 装载壳（受控状态 + Esc 层序 + rpc 提交）；打开/关闭由 props 受控
// （入口 = 抽屉「转移状态…」与 ⋯ 菜单回调；接线在 4.1）。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TASK_STATUS_LABELS, type TaskSnapshot, type TaskStatus, type TransitionTaskInput } from '@dsh-forge/contracts'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { rpcUiState, type RpcUiStateKind } from '../../../rpc/ui-state.js'
import { RpcClientError } from '../../../rpc/errors.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../../rpc/index.js'
import { STATUS_DOT_STATE } from '../status-chips.js'
import { isTerminalStatus, taskKeyLabel } from './detail-model.js'
import './transition-dialog.css'

/** 对话框消费的最小任务投影（TaskCard / TaskDetail 结构性满足——⋯ 菜单与抽屉两入口同喂） */
export interface TransitionTaskView {
  readonly taskId: string
  readonly slug: string
  readonly localId: string
  readonly taskStatus: TaskStatus
}

// ─────────────────────────── 纯模型（AC1/AC2/AC3 判定面） ───────────────────────────

/**
 * 目标态选项集（AC1）——唯一源 = allowedTransitions（Hard Rule：禁自行计算，无第二实现）；
 * from≠to 机械排除 = 防御性滤除交付集内的当前态（服务端 transitionTargets(human) 已保证
 * 七态 − 当前，此处零推导仅透传 + 单点排除，用户点不到非法目标）。
 */
export function transitionTargetOptions(
  allowedTransitions: readonly TaskStatus[],
  current: TaskStatus,
): readonly TaskStatus[] {
  return allowedTransitions.filter((status) => status !== current)
}

/** 提交校验失败形（target-required = 空选项集防线；reason-required = 空因拒绝留场） */
export type TransitionSubmitError = 'target-required' | 'reason-required'

/** 提交校验（AC2/AC3）：目标在场 + reason 非空 → 载荷（reason 修剪）；否则拒绝理由 */
export function checkTransitionSubmit(input: {
  readonly projectId: string
  readonly task: TransitionTaskView
  readonly toStatus: TaskStatus | undefined
  readonly reason: string
}): { readonly ok: true; readonly payload: TransitionTaskInput } | { readonly ok: false; readonly error: TransitionSubmitError } {
  if (input.toStatus === undefined) return { ok: false, error: 'target-required' }
  const reason = input.reason.trim()
  if (reason === '') return { ok: false, error: 'reason-required' }
  return { ok: true, payload: { projectId: input.projectId, taskId: input.task.taskId, toStatus: input.toStatus, reason } }
}

/** 对话框错误形（客户端校验两形 + rpc 失败一形——留场错误条；字面量判别成员展开窄化） */
export type TransitionDialogError =
  | { readonly kind: 'target-required' }
  | { readonly kind: 'reason-required' }
  | { readonly kind: 'rpc'; readonly message: string }

/** 错误提示文案（AC2：错误提示在场——已选与内容保留口径） */
export function transitionErrorMessage(error: TransitionDialogError): string {
  if (error.kind === 'reason-required') return '原因必填——填写后重试（已选目标与内容保留）'
  if (error.kind === 'target-required') return '未选择目标状态——先选定目标再确认'
  return `转移失败：${error.message}`
}

/** 提交结果（归一——永不 reject） */
export type TransitionSubmitOutcome =
  | { readonly ok: true; readonly snapshot: TaskSnapshot }
  | { readonly ok: false; readonly error: { readonly message: string; readonly uiState: RpcUiStateKind } }

// ─────────────────────────── 确认动作（装载壳消费的纯异步面） ───────────────────────────

/** 对话框受控态（装载壳持有） */
export interface TransitionDialogState {
  readonly toStatus: TaskStatus | undefined
  readonly reason: string
  readonly error: TransitionDialogError | undefined
  readonly submitting: boolean
}

/** 初始态：已选目标 = 允许集首项（交付集非空时免点选；空集 = target-required 防线） */
export function initialTransitionDialogState(options: readonly TaskStatus[]): TransitionDialogState {
  return { toStatus: options[0], reason: '', error: undefined, submitting: false }
}

/** 确认动作补丁——恒不含 toStatus/reason（AC2「不清空已选」结构性成立：补丁无此二键） */
export type TransitionDialogPatch = Partial<Omit<TransitionDialogState, 'toStatus' | 'reason'>>

/** 确认动作依赖（装载壳注入） */
export interface TransitionConfirmDeps {
  readonly projectId: string
  readonly task: TransitionTaskView
  readonly makeClient: RpcClientFactory
  readonly onDone: (snapshot: TaskSnapshot) => void
  /** 补丁应用器（装载壳 setState 增量合并） */
  readonly onPatch: (patch: TransitionDialogPatch) => void
}

/**
 * 确认动作（AC2/AC3 主流程——纯异步面）：空因/目标缺席 → 单补丁拒绝留场（错误入位，
 * rpc 与 onDone 零调用）；通过 → 提交中补丁（submitting=true 防双发）→ tasks.transition
 * 唯一通道 → 成功 onDone + 清错态 / 失败 rpc 错误留场。提交中重复确认 = no-op（单飞守卫）。
 */
export async function confirmTransitionDialog(
  state: TransitionDialogState,
  deps: TransitionConfirmDeps,
): Promise<void> {
  if (state.submitting) return
  const check = checkTransitionSubmit({ projectId: deps.projectId, task: deps.task, toStatus: state.toStatus, reason: state.reason })
  if (!check.ok) {
    deps.onPatch({ error: { kind: check.error } }) // 拒绝留场——选择与内容原样（补丁不含此二键）
    return
  }
  deps.onPatch({ error: undefined, submitting: true })
  const out = await submitTaskTransition(deps.makeClient(), check.payload)
  if (out.ok) {
    deps.onDone(out.snapshot)
    deps.onPatch({ error: undefined, submitting: false })
    return
  }
  deps.onPatch({ error: { kind: 'rpc', message: out.error.message }, submitting: false })
}

/** transitionTask 提交（AC3——rpc tasks.transition 唯一通道；typed error → message + rpcUiState 映射） */
export async function submitTaskTransition(
  client: ForgeRpcClient,
  input: TransitionTaskInput,
): Promise<TransitionSubmitOutcome> {
  try {
    const snapshot = await client.tasks.transition(input)
    return { ok: true, snapshot }
  } catch (error) {
    if (error instanceof RpcClientError) {
      return { ok: false, error: { message: error.message, uiState: rpcUiState(error.code) } }
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' } }
  }
}

/** Esc 判定处理器（AC4）——Escape → onCancel + stopPropagation（截住抽屉 document capture 层） */
export function transitionDialogEscapeHandler(
  onCancel: () => void,
): (event: { readonly key: string; stopPropagation(): void }) => void {
  return (event) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onCancel()
  }
}

/**
 * Esc 绑定（AC4——纯面，可测）：注册 keydown capture 监听并回赠解绑函数。挂点 = window：
 * 事件路径 window → document，同为 capture 时浅者先听——对话框先于抽屉（document capture）
 * 截住 Esc；对话框在场时 Esc 归对话框，关闭后下一击 Esc 才归抽屉。
 */
export function bindTransitionDialogEscape(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  onCancel: () => void,
): () => void {
  const onKeyDown = transitionDialogEscapeHandler(onCancel)
  target.addEventListener('keydown', onKeyDown, { capture: true })
  return () => {
    target.removeEventListener('keydown', onKeyDown, { capture: true })
  }
}

/** Esc 关闭接线（AC4——装载壳消费；绑定逻辑 = bindTransitionDialogEscape 纯面） */
export function useTransitionDialogEscape(onCancel: () => void): void {
  useEffect(() => bindTransitionDialogEscape(window, onCancel), [onCancel])
}

// ─────────────────────────── 纯渲染体（全相位 renderToStaticMarkup 可测） ───────────────────────────

export interface TransitionDialogBodyProps {
  readonly task: TransitionTaskView
  /** 选项集（= transitionTargetOptions(detail.allowedTransitions, detail.taskStatus)——装载壳注入） */
  readonly options: readonly TaskStatus[]
  /** 已选目标（undefined = 空选项集防线——select 落空） */
  readonly toStatus: TaskStatus | undefined
  readonly reason: string
  /** 错误（在场 = 拒绝留场错误提示；undefined = 无错相位） */
  readonly error: TransitionDialogError | undefined
  /** 提交中（确认钮禁用防双发） */
  readonly submitting: boolean
  readonly onEditTarget: (status: TaskStatus) => void
  readonly onEditReason: (reason: string) => void
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** 人工转移对话框纯渲染体（流程 6：当前状态只读 + 目标态选择[仅允许集] + 原因必填 + 错误条 + 动作行） */
export function TransitionDialogBody({
  task,
  options,
  toStatus,
  reason,
  error,
  submitting,
  onEditTarget,
  onEditReason,
  onConfirm,
  onCancel,
}: TransitionDialogBodyProps): ReactNode {
  const terminalHint = toStatus !== undefined && isTerminalStatus(toStatus)
  return (
    <div className="dswf-td-tr-mask" data-dswf-td-tr-mask="">
      <div className="dswf-td-tr" role="dialog" aria-modal="true" aria-label="转移状态" data-dswf-td-tr-dialog="">
        <div className="dswf-td-tr-head">
          <span className="dswf-td-tr-title">转移状态</span>
          <span className="dswf-td-tr-key" title={taskKeyLabel(task.slug, task.localId)}>
            {taskKeyLabel(task.slug, task.localId)}
          </span>
        </div>
        <p className="dswf-td-tr-sub">from ≠ to 任意 · 原因必填 · 留审计记录</p>
        <div className="dswf-td-tr-row">
          <label className="dswf-td-tr-label" htmlFor="dswf-td-tr-from">
            当前状态
          </label>
          <div className="dswf-td-tr-static" data-dswf-td-tr-from="">
            <StateDot state={STATUS_DOT_STATE[task.taskStatus]} size={8} />
            <span>{TASK_STATUS_LABELS[task.taskStatus].zh}</span>
          </div>
        </div>
        <div className="dswf-td-tr-row">
          <label className="dswf-td-tr-label" htmlFor="dswf-td-tr-to">
            目标状态
          </label>
          <select
            id="dswf-td-tr-to"
            className="dswf-td-tr-select"
            data-dswf-td-tr-to=""
            value={toStatus ?? ''}
            autoFocus
            onChange={(event) => {
              onEditTarget(event.target.value as TaskStatus)
            }}
          >
            {options.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status].zh}（{TASK_STATUS_LABELS[status].en}）
              </option>
            ))}
          </select>
          {terminalHint ? (
            <p className="dswf-td-tr-hint" data-dswf-td-tr-terminal="">
              ↻ 终态转移将触发恢复钩子（后继可能 autoRestore）
            </p>
          ) : null}
        </div>
        <div className="dswf-td-tr-row">
          <label className="dswf-td-tr-label" htmlFor="dswf-td-tr-reason">
            原因（必填）
          </label>
          <textarea
            id="dswf-td-tr-reason"
            className="dswf-td-tr-reason"
            data-dswf-td-tr-reason=""
            value={reason}
            placeholder="如：重开补一个遗漏的断言 / 人工跳过废弃方案…"
            onChange={(event) => {
              onEditReason(event.target.value)
            }}
          />
        </div>
        {error !== undefined ? (
          <p className="dswf-td-tr-err" role="alert" data-dswf-td-tr-error={error.kind}>
            {transitionErrorMessage(error)}
          </p>
        ) : null}
        <div className="dswf-td-tr-actions">
          <Button variant="ghost" size="sm" className="dswf-td-tr-cancel" data-dswf-td-tr-cancel="" title="关闭（Esc）" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" className="dswf-td-tr-confirm" data-dswf-td-tr-confirm="" disabled={submitting} onClick={onConfirm}>
            确认转移
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── 装载壳（受控状态 + Esc 层序 + rpc 提交） ───────────────────────────

export interface TransitionDialogProps {
  /** 当前项目 id */
  readonly projectId: string
  /** 目标任务（TaskCard / TaskDetail 均可喂——⋯ 菜单与抽屉两入口同形） */
  readonly task: TransitionTaskView
  /** 允许目标态（TaskDetail.allowedTransitions 下发——唯一源） */
  readonly allowedTransitions: readonly TaskStatus[]
  /** 关闭（Esc / 取消——上抛装配方） */
  readonly onCancel: () => void
  /** 提交成功（快照回传——4.1 关闭对话框 + 提示；失败留场归本组件错误条） */
  readonly onDone: (snapshot: TaskSnapshot) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/** 转移对话框装载壳（4.1 dock 装配接线）：初始选中 = 允许集首项；确认 = confirmTransitionDialog
 * 纯动作（补丁增量合并——选择与内容结构性不被清空）；rpc 构造器/成功上抛经 props 注入。 */
export function TransitionDialog({
  projectId,
  task,
  allowedTransitions,
  onCancel,
  onDone,
  makeClient = preloadRpcClientFactory,
}: TransitionDialogProps): ReactNode {
  useTransitionDialogEscape(onCancel)
  const options = useMemo(
    () => transitionTargetOptions(allowedTransitions, task.taskStatus),
    [allowedTransitions, task.taskStatus],
  )
  const [state, setState] = useState<TransitionDialogState>(() => initialTransitionDialogState(options))

  const handleConfirm = useCallback(async (): Promise<void> => {
    await confirmTransitionDialog(state, {
      projectId,
      task,
      makeClient,
      onDone,
      onPatch: (patch) => {
        setState((prev) => ({ ...prev, ...patch }))
      },
    })
  }, [state, projectId, task, makeClient, onDone])

  return (
    <TransitionDialogBody
      task={task}
      options={options}
      toStatus={state.toStatus}
      reason={state.reason}
      error={state.error}
      submitting={state.submitting}
      onEditTarget={(status) => {
        setState((prev) => ({ ...prev, toStatus: status }))
      }}
      onEditReason={(reason) => {
        setState((prev) => ({ ...prev, reason }))
      }}
      onConfirm={() => {
        void handleConfirm()
      }}
      onCancel={onCancel}
    />
  )
}
