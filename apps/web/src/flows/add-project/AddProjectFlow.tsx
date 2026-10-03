// UF-3 组装·添加项目流程（定位：业务——2.10：两段状态机 + 模态外壳 + 确认执行 + 反馈）。
// 结构三分（同 2.8/2.9 形制）：
//   1. AddProjectFlowView —— 纯渲染面：按 FlowState 相位内嵌 DirectoryBrowser（段一/重选）与
//      RegisterForm（段二；repick 相位同位元素 hidden 保挂载——AC5 浏览器⇄表单返回保留已填
//      状态，selection.path 变更经 relinkExternal 联动）+ 执行态（官方 TextShimmer 活性指示，
//      零交互路径）+ 成功/失败反馈（官方 Tag 徽章 + typed code 文案）。
//   2. AddProjectFlow —— 模态壳：官方 Modal（Esc/✕/遮罩 → requestClose 三分守卫：取消点窗口
//      内关闭 / 失败 dismiss / 执行中 ignore——AC2 不可中断）；「确认」→ flow-actions.confirm
//      （form 相位一次性放行，registerProject 一次执行）；成功自动关闭 + onRegistered 通知
//      （2.12 hero 消退锚）；打开缝 = flow-open（项目树「＋」/ hero CTA 两入口跨单元直达）。
//   3. 数据源注入 —— register / dirSource / registeredPathsSource 缺省 = preload RPC 真身，
//   注入 = 测试桩（DirSource 形制）。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Modal,
  Tag,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectSummary, RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport } from '../../rpc/index.js'
import { registeredPathsOf, type BrowserSelection } from './browser-model.js'
import { DirectoryBrowser } from './DirectoryBrowser.js'
import type { DirSource } from './dir-source.js'
import { flowActions, rpcRegisterSource, type RegisterSource } from './flow-actions.js'
import {
  registerFailureCopy,
  initialFlowState,
  modalClassName,
  type FlowState,
} from './flow-model.js'
import { publishAddProjectFlow } from './flow-open.js'
import { RegisterForm } from './RegisterForm.js'
import './flow.css'

/** 已注册路径数据源（注入面：RPC 真身 / 测试桩） */
export type RegisteredPathsSource = () => Promise<readonly ProjectSummary[]>

/** 成功反馈自动关闭时序缺省（毫秒——反馈呈现窗口；宿主可注入覆盖） */
export const DEFAULT_SUCCESS_AUTOCLOSE_MS = 1600

/**
 * 拉取已注册路径集合（纯异步面——fail-soft：源失败 → 空集，标记缺席不阻塞浏览器）。
 * 含 archived：core ① 预检 = registry.list() 按 canonical path 匹配（无 archived 维）。
 */
export async function loadRegisteredPaths(source: RegisteredPathsSource): Promise<ReadonlySet<string>> {
  try {
    return registeredPathsOf(await source())
  } catch {
    return new Set()
  }
}

/** 缺省已注册源真身：preload RPC 面（forge:projects/list）——构造延迟到调用点（fail-soft 由 loadRegisteredPaths 收敛） */
export function rpcRegisteredPathsSource(): RegisteredPathsSource {
  return () => {
    const client = createForgeRpcClient(preloadTransport())
    return client.projects.list()
  }
}

const EMPTY_REGISTERED: ReadonlySet<string> = new Set()
const REPICK_HINT =
  '重新选择工作区目录；未手改的表单字段将随新工作区重构，手改或浏览选定过的保留。'

/** AddProjectFlowView props（纯渲染面——静态标记可测） */
export interface AddProjectFlowViewProps {
  /** 流程态（相位唯一源——flow-model 状态机） */
  readonly state: FlowState
  /** 已注册路径集合（段一/重选行级标记——ownership 预检可视化） */
  readonly registeredPaths: ReadonlySet<string>
  /** 目录数据源（透传浏览器；注入 = 测试桩） */
  readonly dirSource?: DirSource
  /** 段一确认（初始进入 / 返回上一步重选同径） */
  readonly onPick?: (selection: BrowserSelection) => void
  /** 返回上一步（form → repick） */
  readonly onBack?: () => void
  /** 表单「确认」载荷上抛（执行链接线——form 相位一次性放行） */
  readonly onSubmit?: (input: RegisterProjectInput) => void
  /** 失败反馈关闭（dismiss——事后关闭非取消） */
  readonly onDismissFailure?: () => void
}

/** 执行态面板（AC2：进度指示 + 不可交互中断——零交互路径） */
function ExecutingPanel(): ReactNode {
  return (
    <div className="dswf-ap-exec" data-dswf-ap="executing" aria-busy="true" role="status">
      <TextShimmer active className="dswf-ap-exec-title">
        正在注册项目…
      </TextShimmer>
      <p className="dswf-ap-note">
        正在执行注册链（ownership 预检 → dsh 工作区 → 应用库写入）；此过程不可中断，失败将自动补偿。
      </p>
    </div>
  )
}

/** 成功反馈面板（AC3：反馈呈现 + 自动关闭说明；左栏项目/会话列表由刷新锚自动出现） */
function SuccessPanel({ input, result }: { input: RegisterProjectInput | null; result: RegisterResult | null }): ReactNode {
  return (
    <div className="dswf-ap-feedback" data-dswf-ap="success" role="status">
      <div className="dswf-ap-feedback-head">
        <Tag tone="success">注册成功</Tag>
        <span className="dswf-ap-feedback-title">{input?.name ?? ''}</span>
      </div>
      <p className="dswf-ap-note">
        {result?.attachedToExisting ? '已挂接既有工作区。' : '已创建新工作区。'}
        左栏将出现项目与会话列表，窗口即将自动关闭。
      </p>
    </div>
  )
}

/** 失败反馈面板（AC4：typed code 文案 + 补偿结果说明 + 原始原因 + 关闭路径） */
function FailurePanel({
  state,
  onDismiss,
}: {
  state: FlowState
  onDismiss?: () => void
}): ReactNode {
  const failure = state.failure
  if (failure === null) return null
  const copy = registerFailureCopy(failure)
  return (
    <div className="dswf-ap-feedback" data-dswf-ap="failure" role="alert">
      <div className="dswf-ap-feedback-head">
        <Tag tone="danger">注册失败</Tag>
        <span className="dswf-ap-feedback-title">{copy.title}</span>
      </div>
      <p className="dswf-ap-note">{copy.detail}</p>
      <p className="dswf-ap-raw">{failure.message}</p>
      <div className="dswf-ap-feedback-foot">
        <Button variant="primary" size="md" className="dswf-ap-dismiss" onClick={onDismiss}>
          关闭
        </Button>
      </div>
    </div>
  )
}

/**
 * 添加项目流程纯渲染面（数据进/回调出——静态标记可测；2.12 装配经模态壳承载）。
 * 表单挂载判据：form / repick 相位保持挂载（repick = hidden 同位元素——浏览器⇄表单返回
 * 不丢已填状态，selection.path 变更由 RegisterForm relinkExternal 联动）。
 */
export function AddProjectFlowView({
  state,
  registeredPaths,
  dirSource,
  onPick,
  onBack,
  onSubmit,
  onDismissFailure,
}: AddProjectFlowViewProps): ReactNode {
  const { phase, selection } = state
  const formMounted = (phase === 'form' || phase === 'repick') && selection !== null

  return (
    <div className="dswf-ap" data-dswf-ap={phase}>
      {phase === 'browser' || phase === 'repick' ? (
        <DirectoryBrowser
          source={dirSource}
          startDir={phase === 'repick' && selection !== null ? selection.path : undefined}
          registeredPaths={registeredPaths}
          confirmLabel={phase === 'repick' ? '选择此文件夹' : '下一步'}
          hint={phase === 'repick' ? REPICK_HINT : undefined}
          onConfirm={onPick}
        />
      ) : null}
      {formMounted ? (
        <>
          {phase === 'form' ? (
            <div className="dswf-ap-stepbar">
              <span className="dswf-ap-steptitle">第二步 · 注册信息</span>
              <Button variant="ghost" size="sm" className="dswf-ap-back" onClick={onBack}>
                返回上一步
              </Button>
            </div>
          ) : null}
          <div className="dswf-ap-form" data-dswf-ap-keepalive hidden={phase !== 'form'}>
            <RegisterForm
              selection={selection}
              source={dirSource}
              registeredPaths={registeredPaths}
              onSubmit={onSubmit}
            />
          </div>
        </>
      ) : null}
      {phase === 'executing' ? <ExecutingPanel /> : null}
      {phase === 'success' ? <SuccessPanel input={state.input} result={state.result} /> : null}
      {phase === 'failure' ? <FailurePanel state={state} onDismiss={onDismissFailure} /> : null}
    </div>
  )
}

/** AddProjectFlow 模态壳 props */
export interface AddProjectFlowProps {
  /** 注册执行源（缺省 = RPC 真身 forge:projects/register；注入 = 测试桩） */
  readonly register?: RegisterSource
  /** 目录数据源（透传浏览器与表单浏览改选；注入 = 测试桩） */
  readonly dirSource?: DirSource
  /** 已注册路径源（缺省 = RPC 真身 forge:projects/list；注入 = 测试桩） */
  readonly registeredPathsSource?: RegisteredPathsSource
  /** 成功反馈自动关闭时序（缺省 1600ms；注入 = 测试面） */
  readonly successAutoCloseMs?: number
  /** 注册成功通知（2.12 hero 消退锚——项目数驱动面的刷新提示） */
  readonly onRegistered?: (result: RegisterResult) => void
  /** 流程收场通知（取消干净退出 / 失败关闭 / 成功自动关闭同径） */
  readonly onClose?: () => void
}

/**
 * 添加项目流程本体（模态壳——模态覆盖中区；宿主 = 2.12 工作台装配）。
 * 打开缝：mount 期发布 __DSH_FORGE_ADD_PROJECT_FLOW__（项目树「＋」/ hero CTA 经
 * openAddProjectFlow 直达；unmount 撤销）。Esc/✕/遮罩 → requestClose（三分守卫：
 * 取消点 cancel / 失败 dismiss / 执行中 ignore——AC2 不可交互中断）。
 */
export function AddProjectFlow({
  register,
  dirSource,
  registeredPathsSource,
  successAutoCloseMs = DEFAULT_SUCCESS_AUTOCLOSE_MS,
  onRegistered,
  onClose,
}: AddProjectFlowProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<FlowState>(initialFlowState)
  const [registeredPaths, setRegisteredPaths] = useState<ReadonlySet<string>>(EMPTY_REGISTERED)

  // 最新态 ref 桥（actions 读 render 后最新值——browser-actions 同形制）
  const flowRef = useRef(flow)
  flowRef.current = flow
  // 回调 ref 桥（finish/onRegistered/onClose 稳定引用，不随每渲染重建 actions）
  const onRegisteredRef = useRef(onRegistered)
  onRegisteredRef.current = onRegistered
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const effectiveRegister = useMemo<RegisterSource>(() => register ?? rpcRegisterSource(), [register])
  const effectiveRegisteredSource = useMemo<RegisteredPathsSource>(
    () => registeredPathsSource ?? rpcRegisteredPathsSource(),
    [registeredPathsSource],
  )

  const finish = useCallback(() => {
    setOpen(false)
    onCloseRef.current?.()
  }, [])

  const actions = useMemo(
    () =>
      flowActions({
        register: effectiveRegister,
        setState: setFlow,
        getState: () => flowRef.current,
        finish,
      }),
    [effectiveRegister, finish],
  )

  const openFlow = useCallback(() => {
    setFlow(initialFlowState()) // 打开即复位段一（上次流程残态不携带）
    setOpen(true)
    void loadRegisteredPaths(effectiveRegisteredSource).then(setRegisteredPaths) // fail-soft
  }, [effectiveRegisteredSource])

  // 打开缝发布（mount 发布 / unmount 撤销——flow-open 单测覆盖时序面）
  useEffect(() => {
    publishAddProjectFlow({ open: openFlow })
    return () => {
      publishAddProjectFlow(undefined)
    }
  }, [openFlow])

  // 成功：通知宿主（2.12 hero 消退锚）+ 自动关闭（AC3）
  useEffect(() => {
    if (flow.phase !== 'success') return
    if (flow.result !== null) onRegisteredRef.current?.(flow.result)
    const timer = setTimeout(finish, successAutoCloseMs)
    return () => {
      clearTimeout(timer)
    }
  }, [flow, finish, successAutoCloseMs])

  return (
    <Modal
      open={open}
      onClose={actions.requestClose}
      title="添加项目"
      closeLabel="关闭"
      className={modalClassName(flow.phase)}
    >
      <AddProjectFlowView
        state={flow}
        registeredPaths={registeredPaths}
        dirSource={dirSource}
        onPick={actions.pick}
        onBack={actions.back}
        onSubmit={actions.confirm}
        onDismissFailure={actions.requestClose}
      />
    </Modal>
  )
}
