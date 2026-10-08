// 任务详情抽屉（定位：业务——UF-1/UF-3 交付面：两分块[任务内容/时间线] + 顺滑折叠 +
// 左缘拖宽 + 类型模板 ×20 + 覆盖率 + 现状条/事件流）。组装分工沿 EntryDrawer 形制：
// TaskDrawerBody = 纯渲染体（renderToStaticMarkup 全相位可测）；TaskDrawer = 装载壳
//（useTaskDetail 拉取 + Esc/拖宽接线 + 会话级宽度/折叠保持）。
// Hard Rules：
//   - 界面说明最小化——不渲染数据源解释文字（语义锚 ui-design.md）；
//   - 折叠就地更新——块体常驻 DOM（grid 0fr/1fr 类切换，React 原地协调不重建抽屉）；
//     滑入动画仅切换任务时播放（aside key = taskId——同任务重渲染 no-anim）。
// 打开/关闭/切换由 props 受控（taskId: null = 关闭；3.6 三视图与 4.1 dock 装配接线）；
// 「转移状态…」入口 → onTransition 回调（3.8 对话框）；参考文档 chip → onOpenDoc（dock 开
// tab，抽屉保持）。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { TASK_STATUS_LABELS, type TaskDetail, type TaskDetailQuery } from '@dsh-forge/contracts'
import { Button, IconCloseFillRegular, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, SkeletonRows } from '../../../components/index.js'
import { rpcUiState, type RpcUiStateKind } from '../../../rpc/ui-state.js'
import { RpcClientError } from '../../../rpc/errors.js'
import { preloadRpcClientFactory, subscribeTasksChanged, type ForgeRpcClient, type RpcClientFactory } from '../../../rpc/index.js'
import { STATUS_DOT_STATE } from '../status-chips.js'
import { formatDiagMessage, type SessionOpenRequest, type TaskFailureDiagInput } from '../message-format.js'
import { DiagToast, taskFailureDiagToast, type DiagToastResult, type DiagToastSendPayload } from '../task-tab/DiagToast.js'
import '../task-tab/task-tab.css'
import {
  clampDrawerWidth,
  drawerSessionStore,
  drawerWidthFromDrag,
  DRAWER_WIDTH_DEFAULT,
  DRAWER_WIDTH_STEP,
  initialDrawerCollapse,
  stepDrawerWidth,
  type DrawerCollapseState,
  type DrawerSectionKey,
} from './collapse.js'
import { taskGoalOf, taskKvChips, taskKeyLabel, taskResultOf, varsText } from './detail-model.js'
import { CoverageBar, coverageViewOf } from './coverage-bar.js'
import { TimelineEvents, TimelineNow } from './timeline.js'
import { templateFamilyOf, typeCategoryClassOf, TypeTemplateBody } from './type-templates/index.js'
import './drawer.css'

/** kv chip 键名（`{key} : {value}` 格式——v15） */
const KV_KEYS: Readonly<Record<string, string>> = {
  category: '类别',
  priority: '优先级',
  estimated: '预估耗时',
  actualDuration: '实际耗时',
  complexity: '复杂度',
  breaking: '影响',
}

/** 两分块声明（块序 = 渲染序：块一 任务内容 → 块二 时间线） */
export function drawerBodySections(): readonly { readonly id: DrawerSectionKey; readonly title: string }[] {
  return [
    { id: 'content', title: '任务内容' },
    { id: 'timeline', title: '时间线' },
  ]
}

/** kv chip 渲染（类别 chip 着族色 + 值代码体类；breaking = ⚠ 红档） */
function KvChip({ chip, categoryClass }: { readonly chip: ReturnType<typeof taskKvChips>[number]; readonly categoryClass: string }): ReactNode {
  const key = KV_KEYS[chip.kind]
  if (chip.kind === 'breaking') {
    return (
      <span className="dswf-td-kv-chip dswf-td-kv-breaking">
        <span className="dswf-td-kv-k">{key}</span>
        <span className="dswf-td-kv-sep"> : </span>
        <span className="dswf-td-kv-v is-error">⚠ breaking</span>
      </span>
    )
  }
  const valueClass = chip.kind === 'category' ? `dswf-td-kv-v is-code ${categoryClass}` : 'dswf-td-kv-v'
  return (
    <span className={chip.kind === 'category' ? `dswf-td-kv-chip ${categoryClass}` : 'dswf-td-kv-chip'}>
      <span className="dswf-td-kv-k">{key}</span>
      <span className="dswf-td-kv-sep"> : </span>
      <span className={valueClass}>{chip.value}</span>
    </span>
  )
}

/** 折叠分块（AC2：块头 button[Enter/Space 原生可用] + aria-expanded 同步 + grid 0fr/1fr
 *  类切换就地更新——块体常驻 DOM，caret 旋转同步） */
function DrawerSection({
  id,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  readonly id: DrawerSectionKey
  readonly title: string
  readonly hint?: string
  readonly open: boolean
  readonly onToggle: (key: DrawerSectionKey) => void
  readonly children: ReactNode
}): ReactNode {
  return (
    <section className="dswf-td-sect-wrap">
      <button
        type="button"
        className="dswf-td-sect"
        data-dswf-td-sect={id}
        aria-expanded={open}
        onClick={() => {
          onToggle(id)
        }}
      >
        <span className={open ? 'dswf-td-caret' : 'dswf-td-caret is-closed'} aria-hidden="true">
          ▾
        </span>
        <span className="dswf-td-sect-title">{title}</span>
        {hint !== undefined ? <span className="dswf-td-sect-hint">{hint}</span> : null}
      </button>
      <div className={open ? 'dswf-td-sect-body' : 'dswf-td-sect-body is-collapsed'} data-dswf-td-sect-body={id}>
        <div className="dswf-td-sect-in">{children}</div>
      </div>
    </section>
  )
}

/** 结果呈现（综合任务记录推导——v13 目标/结果对行的「结果」侧） */
function ResultView({ result }: { readonly result: ReturnType<typeof taskResultOf> }): ReactNode {
  switch (result.kind) {
    case 'eval':
      return (
        <span className="dswf-td-gr-v">
          评估 {result.score}/100 · 严重度 {result.severity}
        </span>
      )
    case 'submitted':
      return (
        <span className="dswf-td-gr-v">
          <span className="is-success">✓ 已提交</span>
          {` · ${result.summary}`}
          {result.commitHash !== undefined ? (
            <>
              {' · '}
              <span className="dswf-td-code is-link">{result.commitHash}</span>
            </>
          ) : null}
        </span>
      )
    case 'note':
      return <span className="dswf-td-gr-v">{result.text}</span>
    case 'blocked':
      return <span className="dswf-td-gr-v is-error">⚠ {result.reason}</span>
    case 'running':
      return <span className="dswf-td-gr-v">{`执行中 · ${result.text}`}</span>
    case 'pending':
      return <span className="dswf-td-gr-v">未开始</span>
    case 'status':
      return <span className="dswf-td-gr-v">{result.label}</span>
  }
}

/**
 * 任务失败诊断输入组装（4.6 UF-3 · v19–v21——AC3 诊断第二路数据面）：
 * 容器水化（taskDetail.container——MessageContainer 结构映射）+ 失败原因（blockedReason
 * 优先，回退最近失败记录）+ 最近记录 ≤3（verb/at/note——DiagRecordLine 映射）。
 * docsRoot = @ 锚文档根（项目行推导注入；缺席 = 键缺席 → pathLine 回退 `docs` 缺省锚）。
 */
export function taskFailureInputOf(detail: TaskDetail, docsRoot?: string): TaskFailureDiagInput {
  const recent = [...detail.records].slice(-3)
  const records = recent.map((record) => ({
    verb: record.verb,
    at: record.createdAt,
    ...(record.reason !== undefined || record.summary !== undefined
      ? { note: record.reason ?? record.summary }
      : {}),
  }))
  const lastNote = [...records].reverse().find((record) => record.note !== undefined)?.note
  return {
    kind: 'task-failure',
    container: {
      kind: detail.container.kind,
      slug: detail.container.slug,
      title: detail.container.title,
      ...(detail.container.summary !== undefined ? { summary: detail.container.summary } : {}),
      ...(detail.container.phase !== undefined ? { phase: detail.container.phase } : {}),
      ...(docsRoot !== undefined ? { docsRoot } : {}),
    },
    taskKey: `${detail.slug}/${detail.localId}`,
    taskTitle: detail.title,
    taskStatus: detail.taskStatus,
    reason: detail.blockedReason ?? lastNote ?? '—',
    records,
  }
}

export interface TaskDrawerBodyProps {
  readonly detail: TaskDetail
  /** 抽屉宽（px——会话级保持值注入） */
  readonly width: number
  /** 折叠态（会话级保持值注入） */
  readonly collapsed: DrawerCollapseState
  /** 滑入动画（仅切换任务时 true——同任务重渲染 false → no-anim） */
  readonly animate: boolean
  readonly onClose: () => void
  readonly onToggleSection: (key: DrawerSectionKey) => void
  /** 参考文档 chip 点击（dock 开 tab——抽屉保持） */
  readonly onOpenDoc: (docRel: string) => void
  /** 挂接会话 pill 点击（跳会话——4.1 接线；缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 「转移状态…」入口（3.8 对话框开——缺席 = 禁用） */
  readonly onTransition?: (taskId: string) => void
  /** 「诊断失败」入口（4.6——仅 blocked/rejected 任务呈现；缺席 = 按钮不呈现） */
  readonly onDiagnoseFailure?: (detail: TaskDetail) => void
  /** 任务失败诊断 toast（锚定「诊断失败」钮左侧——受控整体替换） */
  readonly diagResult: DiagToastResult | undefined
  readonly onDiagDismiss: () => void
  /** 「发送给 agent」（fail 档动作——缺席 = 无动作钮；本面恒任务失败档） */
  readonly onDiagSend?: (payload: DiagToastSendPayload) => void
  /** 双击复位宽度 */
  readonly onResetWidth: () => void
  /** 键盘步进（← 加宽 +32 / → 收窄 -32——方向由本组件定向） */
  readonly onStepWidth: (delta: number) => void
  /** 拖拽调宽（左缘手柄——指针即左缘） */
  readonly onDragWidth: (clientX: number, viewportWidth: number) => void
  /** 相对时间基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 任务详情抽屉纯渲染体（AC1 两分块 + AC4 块一组装 + AC6 调宽/关闭锚） */
export function TaskDrawerBody({
  detail,
  width,
  collapsed,
  animate,
  onClose,
  onToggleSection,
  onOpenDoc,
  onOpenSession,
  onTransition,
  onDiagnoseFailure,
  diagResult,
  onDiagDismiss,
  onDiagSend,
  onResetWidth,
  onStepWidth,
  onDragWidth,
  now,
}: TaskDrawerBodyProps): ReactNode {
  const at = now ?? Date.now()
  const categoryClass = `dswf-td-cat-${typeCategoryClassOf(detail.taskType)}`
  const chips = taskKvChips(detail)
  const coverage = coverageViewOf(detail)
  const showCoverage = templateFamilyOf(detail.taskType) === 'coding' && (coverage.actualPct !== undefined || coverage.expectedPct !== undefined)
  const note = varsText(detail.vars ?? {}, 'note')

  // 手柄键盘微调（可达性：← 加宽 +32 / → 收窄 -32）
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onStepWidth(DRAWER_WIDTH_STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onStepWidth(-DRAWER_WIDTH_STEP)
    }
  }

  return (
    <aside
      key={detail.taskId}
      className={`dswf-td-drawer ${categoryClass}${animate ? '' : ' no-anim'}`}
      role="dialog"
      aria-label="任务详情"
      style={{ width: `${width}px` }}
      data-dswf-td-drawer=""
    >
      <div
        className="dswf-td-resize"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-label="拖动调整抽屉宽度"
        title="拖动调宽 · 双击复位"
        data-dswf-td-resize=""
        onKeyDown={handleKeyDown}
        onDoubleClick={() => {
          onResetWidth()
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) return // 仅主键按住拖拽（悬停移动不触发）
          onDragWidth(event.clientX, window.innerWidth)
        }}
      />
      <div className="dswf-td-head">
        <StateDot state={STATUS_DOT_STATE[detail.taskStatus]} size={8} />
        <span className="dswf-td-key" title={taskKeyLabel(detail.slug, detail.localId)}>
          {taskKeyLabel(detail.slug, detail.localId)}
        </span>
        <Tag tone="neutral" className="dswf-td-status">
          {TASK_STATUS_LABELS[detail.taskStatus].zh}
        </Tag>
        <span className="dswf-td-spacer" />
        <Button
          variant="toolbar"
          size="sm"
          className="dswf-td-close"
          data-dswf-td-close=""
          aria-label="关闭抽屉"
          title="关闭（Esc）"
          onClick={onClose}
        >
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      <div className="dswf-td-title">{detail.title}</div>
      <div className="dswf-td-kvstrip" data-dswf-td-kv="">
        {chips.map((chip, index) => (
          <KvChip chip={chip} categoryClass={categoryClass} key={`${chip.kind}-${index}`} />
        ))}
      </div>
      <div className="dswf-td-scroll">
        <DrawerSection id="content" title="任务内容" open={collapsed.content} onToggle={onToggleSection}>
          <div className="dswf-td-gr">
            <div className="dswf-td-gr-item">
              <div className="dswf-td-tck" data-dswf-td-tck="">
                目标
              </div>
              <div className="dswf-td-gr-v" data-dswf-td-goal="">
                {taskGoalOf(detail)}
              </div>
            </div>
            <div className="dswf-td-gr-item">
              <div className="dswf-td-tck" data-dswf-td-tck="">
                结果
              </div>
              <div data-dswf-td-result="">
                <ResultView result={taskResultOf(detail)} />
              </div>
            </div>
          </div>
          <TypeTemplateBody detail={detail} onOpenDoc={onOpenDoc} />
          {showCoverage ? <CoverageBar view={coverage} /> : null}
          {note !== undefined ? (
            <div className="dswf-td-note" data-dswf-td-note="">
              <div className="dswf-td-tck" data-dswf-td-tck="">
                备注
              </div>
              <div className="dswf-td-gr-v is-warn">⚠ {note}</div>
            </div>
          ) : null}
        </DrawerSection>
        <DrawerSection
          id="timeline"
          title="时间线"
          hint={`${detail.records.length} 条`}
          open={collapsed.timeline}
          onToggle={onToggleSection}
        >
          <TimelineNow detail={detail} onOpenSession={onOpenSession} />
          <TimelineEvents detail={detail} onOpenSession={onOpenSession} now={at} />
        </DrawerSection>
      </div>
      <div className="dswf-td-foot">
        {/* 诊断失败（4.6 UF-3 v19–v21——仅 blocked/rejected 任务；无单任务执行动作[Hard Rule]） */}
        {(detail.taskStatus === 'blocked' || detail.taskStatus === 'rejected') && onDiagnoseFailure !== undefined ? (
          <span className="dswf-td-diagwrap" data-dswf-td-diagwrap="">
            <DiagToast result={diagResult} onDismiss={onDiagDismiss} {...(onDiagSend !== undefined ? { onSend: onDiagSend } : {})} />
            <Button
              variant="outline"
              size="sm"
              className="dswf-td-diag"
              data-dswf-td-diag={detail.taskStatus}
              title="诊断失败——失败摘要 toast + 可发送给 agent 排查修复"
              onClick={() => {
                onDiagnoseFailure(detail)
              }}
            >
              诊断失败
            </Button>
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="dswf-td-trans"
          data-dswf-td-trans=""
          disabled={onTransition === undefined}
          onClick={() => {
            if (onTransition !== undefined) onTransition(detail.taskId)
          }}
        >
          转移状态…
        </Button>
      </div>
    </aside>
  )
}

// ─────────────────────────── 装载壳（拉取 + 交互接线） ───────────────────────────

/** 错误附载（message 原样 + rpcUiState 三态——概览域同口径） */
export interface TaskDrawerError {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 详情拉取结果（ok/error 归一——永不 reject） */
export type TaskDetailFetch =
  | { readonly ok: true; readonly detail: TaskDetail }
  | { readonly ok: false; readonly error: TaskDrawerError }

/** 详情拉取（纯异步面——唯一通道 = rpc tasks.detail） */
export async function fetchTaskDetail(client: ForgeRpcClient, projectId: string, taskId: string): Promise<TaskDetailFetch> {
  try {
    const detail = await client.tasks.detail({ projectId, taskId } satisfies TaskDetailQuery)
    return { ok: true, detail }
  } catch (error) {
    if (error instanceof RpcClientError) {
      return { ok: false, error: { message: error.message, uiState: rpcUiState(error.code) } }
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' } }
  }
}

/** 抽屉装载态（同任务静默重取 = detail 保持旧值——不重放滑入/不闪骨架） */
export interface TaskDrawerLoadState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly detail: TaskDetail | undefined
  readonly error: TaskDrawerError | undefined
}

export function initialTaskDrawerLoadState(): TaskDrawerLoadState {
  return { phase: 'loading', detail: undefined, error: undefined }
}

/**
 * 详情装载 hook（taskId 变更/重试 = 骨架重置；refresh = 同任务静默重取[事件推送驱动——
 * 写推送事件链 3.1]；序号守卫防串台；null = 关闭不拉取）。
 */
export function useTaskDetail(
  projectId: string,
  taskId: string | null,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [TaskDrawerLoadState, { readonly retry: () => void; readonly refresh: () => void }] {
  const [state, setState] = useState<TaskDrawerLoadState>(initialTaskDrawerLoadState)
  const [nonce, setNonce] = useState(0)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const seqRef = useRef(0)
  const identityRef = useRef<string>('')

  useEffect(() => {
    if (taskId === null) return
    const identity = `${projectId}:${taskId}`
    const identityChanged = identity !== identityRef.current
    identityRef.current = identity
    if (identityChanged) setState(initialTaskDrawerLoadState())
    const seq = ++seqRef.current
    let alive = true
    void fetchTaskDetail(makeClient(), projectId, taskId).then((out) => {
      if (!alive || seq !== seqRef.current) return
      setState(
        out.ok
          ? { phase: 'ready', detail: out.detail, error: undefined }
          : { phase: 'error', detail: undefined, error: out.error },
      )
    })
    return () => {
      alive = false
    }
  }, [projectId, taskId, nonce, refreshNonce, makeClient])

  // 写推送事件（forge:events/tasks-changed）→ 同任务静默重取（50ms 合并归订阅层）
  useEffect(() => {
    if (taskId === null) return () => {}
    return subscribeTasksChanged((payload) => {
      if (payload.projectId === projectId) setRefreshNonce((n) => n + 1)
    })
  }, [projectId, taskId])

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1)
  }, [])
  return [state, { retry, refresh }] as const
}

/** Esc 关闭接线（capture 阶段——抽屉在场时 Esc 归抽屉；stopPropagation 防串清搜索行） */
export function useTaskDrawerEscape(taskId: string | null, onClose: () => void): void {
  useEffect(() => {
    if (taskId === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [taskId, onClose])
}

export interface TaskDrawerProps {
  /** 当前项目 id */
  readonly projectId: string
  /** 打开任务（null = 关闭不渲染；切换 = 内容换装 + 滑入重播） */
  readonly taskId: string | null
  /** 关闭（Esc / ✕——上抛装配方） */
  readonly onClose: () => void
  /** 参考文档 chip 点击（dock 开 tab——4.1 接线） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 挂接会话 pill 点击（跳会话——4.1 接线） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 「转移状态…」入口（3.8 对话框开） */
  readonly onTransition?: (taskId: string) => void
  /** 打开新会话通道（4.6 任务失败诊断「发送给 agent」——装配注入；发往任务容器对应模式） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** @ 锚文档根（装配 fail-soft 装载注入——useProjectDocsRoot 项目行推导；缺席 = `docs` 缺省锚） */
  readonly docsRoot?: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 相对时间基准（缺省当次渲染时刻） */
  readonly now?: number
}

/**
 * 抽屉装载壳（3.6 三视图行点击 / 4.1 dock 装配接线）：宽度/折叠 = 会话级保持
 * （drawerSessionStore——关开抽屉/切任务共享）；同任务重渲染 no-anim（滑入仅切任务播放）。
 * 4.6 任务失败诊断：blocked/rejected「诊断失败」→ 失败摘要 toast（5s）+「发送给 agent」
 * → formatDiagMessage 自动发送（发往任务容器对应模式：feature → 远征 / 突击提案 → 突击；
 * 容器 mode 缺席[未标记提案直挂] = 不切换——registry 默认）。
 */
export function TaskDrawer({ projectId, taskId, onClose, onOpenDoc, onOpenSession, onTransition, onStartSession, docsRoot, makeClient, now }: TaskDrawerProps): ReactNode {
  useTaskDrawerEscape(taskId, onClose)
  const [session, setSession] = useState(() => drawerSessionStore.getState())
  useEffect(() => drawerSessionStore.subscribe(() => {
    setSession(drawerSessionStore.getState())
  }), [])
  const [state, { retry }] = useTaskDetail(projectId, taskId, makeClient)
  const lastTaskRef = useRef<string | null>(null)
  // 任务失败诊断 toast（受控 {result, mode}——mode = 触发时任务容器模式快照，发送路由此）
  const [diag, setDiag] = useState<{ readonly result: DiagToastResult; readonly mode: 'expedition' | 'blitz' | undefined } | undefined>(undefined)

  const handleToggleSection = useCallback((key: DrawerSectionKey): void => {
    drawerSessionStore.toggleSection(key)
  }, [])
  const handleStepWidth = useCallback((delta: number): void => {
    drawerSessionStore.setWidth(stepDrawerWidth(drawerSessionStore.getState().width, delta))
  }, [])
  const handleResetWidth = useCallback((): void => {
    drawerSessionStore.setWidth(DRAWER_WIDTH_DEFAULT)
  }, [])
  const handleDragWidth = useCallback((clientX: number, viewportWidth: number): void => {
    drawerSessionStore.setWidth(drawerWidthFromDrag(clientX, viewportWidth))
  }, [])
  const handleDiagnoseFailure = useCallback((detail: TaskDetail): void => {
    setDiag({ result: taskFailureDiagToast(taskFailureInputOf(detail, docsRoot)), mode: detail.container.mode })
  }, [docsRoot])
  const handleDiagDismiss = useCallback((): void => {
    setDiag(undefined)
  }, [])
  const handleDiagSend = useCallback(
    (payload: DiagToastSendPayload): void => {
      // 发往任务容器对应模式（v20 ㉝）——错误直达修复 = autosend；mode 缺席 = 不切换
      //（本面恒任务失败档——payload 结构即 TaskFailureDiagInput）
      onStartSession?.({
        ...(diag?.mode !== undefined ? { mode: diag.mode } : {}),
        prefill: formatDiagMessage(payload),
        autosend: true,
      })
    },
    [onStartSession, diag],
  )
  const openDoc = onOpenDoc ?? ((): void => {})

  if (taskId === null) {
    lastTaskRef.current = null
    return null
  }
  const animate = lastTaskRef.current !== taskId
  lastTaskRef.current = taskId

  if (state.phase === 'error' && state.error !== undefined) {
    return (
      <aside
        key={taskId}
        className={`dswf-td-drawer${animate ? '' : ' no-anim'}`}
        role="dialog"
        aria-label="任务详情"
        style={{ width: `${session.width}px` }}
        data-dswf-td-drawer=""
      >
        <div className="dswf-td-head">
          <span className="dswf-td-title">任务详情</span>
          <span className="dswf-td-spacer" />
          <Button variant="toolbar" size="sm" className="dswf-td-close" data-dswf-td-close="" aria-label="关闭抽屉" title="关闭（Esc）" onClick={onClose}>
            <IconCloseFillRegular size={14} />
          </Button>
        </div>
        <div className="dswf-td-face">
          {state.error.uiState === 'empty-state' ? (
            <EmptyState title="任务详情不可用" description={state.error.message} />
          ) : (
            <ErrorBar
              className="dswf-td-error"
              message={`任务详情装载失败：${state.error.message}`}
              retryClassName="dswf-td-retry"
              anchor="data-dswf-td-error"
              retryAnchor="data-dswf-td-retry"
              onRetry={retry}
            />
          )}
        </div>
      </aside>
    )
  }
  if (state.detail === undefined) {
    return (
      <aside
        key={taskId}
        className={`dswf-td-drawer${animate ? '' : ' no-anim'}`}
        role="dialog"
        aria-label="任务详情"
        style={{ width: `${session.width}px` }}
        data-dswf-td-drawer=""
      >
        <div className="dswf-td-head">
          <span className="dswf-td-title">任务详情</span>
          <span className="dswf-td-spacer" />
          <Button variant="toolbar" size="sm" className="dswf-td-close" data-dswf-td-close="" aria-label="关闭抽屉" title="关闭（Esc）" onClick={onClose}>
            <IconCloseFillRegular size={14} />
          </Button>
        </div>
        <SkeletonRows className="dswf-td-skeleton" rowClassName="dswf-td-skeleton-row" rows={8} anchor="data-dswf-td-skeleton" />
      </aside>
    )
  }
  return (
    <TaskDrawerBody
      detail={state.detail}
      width={clampDrawerWidth(session.width)}
      collapsed={session.collapsed ?? initialDrawerCollapse()}
      animate={animate}
      onClose={onClose}
      onToggleSection={handleToggleSection}
      onOpenDoc={openDoc}
      onOpenSession={onOpenSession}
      onTransition={onTransition}
      {...(onStartSession !== undefined ? { onDiagnoseFailure: handleDiagnoseFailure } : {})}
      diagResult={diag?.result}
      onDiagDismiss={handleDiagDismiss}
      {...(onStartSession !== undefined ? { onDiagSend: handleDiagSend } : {})}
      onResetWidth={handleResetWidth}
      onStepWidth={handleStepWidth}
      onDragWidth={handleDragWidth}
      now={now}
    />
  )
}
