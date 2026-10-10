// 任务详情弹窗（定位：业务——m3.1 D21/D23：抽屉形态退役 → 可拖动弹窗 + 挂载独立于
// dock 概览 tab；D22 内容双形态：简要 440（默认——键+tag+标题+概要）↔ 完整 720
//（现状条/两分块[任务内容/时间线]/kv 六项/类型模板 ×20/覆盖率——1.2 全量内容平移）
// + 顺滑折叠 + 左右缘拖宽 320–760 + 标题栏全窗拖移）。组装分工沿 EntryDrawer 形制：
// TaskDrawerBody = 纯渲染体（renderToStaticMarkup 全相位可测）；TaskDrawer = 装载壳
//（useTaskDetail 拉取 + Esc/拖移/拖宽接线 + 逐开几何本地态[关闭即弃——裁决 #3 不记忆]）。
// Hard Rules：
//   - 界面说明最小化——不渲染数据源解释文字（语义锚 ui-design.md）；
//   - 折叠就地更新——块体常驻 DOM（grid 0fr/1fr 类切换，React 原地协调不重建弹窗）；
//   - 几何（宽/左/上）= 装载壳逐开本地态——切换任务原位换内容（taskId props 变更组件
//     不卸载），关闭即随壳卸载弃置（重开回默认起始位——挂载方条件渲染承载）；
//   - D22 展开态 = 逐开本地态同几何生命周期——重开回默认简要（裁决 #11 不记忆展开态；
//     切任务原位保持——原型 openTaskModal 仅首开重置）；⤢/⤡ 换宽走
//     drawerGeometryOnFormToggle（<700 → 720 / >500 → 440，水平再居中）。
// 打开/关闭/切换由 props 受控（taskId: null = 关闭；三视图/桥装配接线）；
// 「转移状态…」入口 → onTransition 回调（对话框随本壳挂载）；参考文档 chip → onOpenDoc
//（dock 开 tab，弹窗保持）；挂接会话 pill → onOpenSession + 关弹窗（原型 m31-tm-sess
// 语义：跳对应对话面板——两动作一体）。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { TASK_STATUS_LABELS, type TaskDetail, type TaskDetailQuery } from '@dsh-forge/contracts'
import { Button, IconCloseFillRegular, IconFullscreenOutlineMedium, StateDot, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
  defaultDrawerPosition,
  drawerGeometryOnFormToggle,
  drawerPositionFromDrag,
  drawerSessionStore,
  drawerWidthFromEdgeDrag,
  DRAWER_WIDTH_DEFAULT,
  DRAWER_WIDTH_STEP,
  stepDrawerWidth,
  type DrawerCollapseState,
  type DrawerModalPosition,
  type DrawerResizeEdge,
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

/** 简要形态概要行（D22：原型 brief rows 四行——所属/类型/前置/挂接会话） */
export function drawerBriefRows(detail: TaskDetail): readonly { readonly key: string; readonly value: string; readonly code?: boolean }[] {
  const prerequisites = detail.prerequisites.map((p) => taskKeyLabel(p.slug, p.localId))
  const sessions = detail.sessions.map((session) => session.sessionId)
  return [
    { key: '所属', value: detail.slug, code: true },
    {
      key: '类型',
      value: detail.priority !== undefined ? `${detail.taskType} · ${detail.priority}` : detail.taskType,
    },
    { key: '前置', value: prerequisites.length > 0 ? prerequisites.join('、') : '—' },
    { key: '挂接会话', value: sessions.length > 0 ? sessions.join('、') : '—' },
  ]
}

/** 简要形态体（D22 默认形态：概要四行——完整块零渲染） */
function DrawerBriefBody({ detail }: { readonly detail: TaskDetail }): ReactNode {
  return (
    <div className="dswf-td-brief" data-dswf-td-brief="">
      {drawerBriefRows(detail).map((row) => (
        <div className="dswf-td-brow" key={row.key}>
          <span className="dswf-td-bk">{row.key}</span>
          <span className={row.code === true ? 'dswf-td-bv is-code' : 'dswf-td-bv'}>{row.value}</span>
        </div>
      ))}
    </div>
  )
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

/** 拖移会话种类（标题栏全窗拖移 / 左缘拖宽 / 右缘拖宽——装载壳几何计算定向） */
export type TaskDrawerDragKind = 'move' | 'resize-left' | 'resize-right'

/** 弹窗壳 inline 几何样式（宽恒注入；位未定[null] = CSS 居中兜底让位） */
export function taskDrawerShellStyle(width: number, position: DrawerModalPosition | null): {
  readonly width: string
  readonly left?: string
  readonly top?: string
  readonly transform?: string
} {
  return {
    width: `${width}px`,
    ...(position !== null ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'none' } : {}),
  }
}

/**
 * 标题栏拖移事件接线（装载/错误/骨架三面共用——D21 全窗拖移）：主键按住拖移、
 * 按钮（✕ 等）命中不劫持。
 */
export function taskDrawerHeadDragProps(
  onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void,
  onDragMove: (clientX: number, clientY: number) => void,
  onDragEnd: () => void,
): {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerUp: () => void
  readonly onPointerCancel: () => void
} {
  return {
    onPointerDown: (event) => {
      if ((event.target as HTMLElement).closest('button') !== null) return
      event.currentTarget.setPointerCapture(event.pointerId)
      onDragStart('move', event.clientX, event.clientY)
    },
    onPointerMove: (event) => {
      if ((event.buttons & 1) === 0) return // 仅主键按住拖拽
      onDragMove(event.clientX, event.clientY)
    },
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  }
}

/**
 * 缘侧拖宽手柄（D21：左右各一——对侧锚定）：指针捕获拖宽 + 键盘 ←→ 步进（方向随缘侧
 * 定向：指向弹窗外侧 = 加宽）+ 双击复位默认宽。
 */
function DrawerResizeHandle({
  edge,
  onDragStart,
  onDragMove,
  onDragEnd,
  onStepWidth,
  onResetWidth,
}: {
  readonly edge: DrawerResizeEdge
  readonly onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void
  readonly onDragMove: (clientX: number, clientY: number) => void
  readonly onDragEnd: () => void
  readonly onStepWidth: (delta: number) => void
  readonly onResetWidth: () => void
}): ReactNode {
  // 手柄键盘微调（可达性：指向弹窗外侧 = 加宽 ±32——左缘 ← 加宽 / 右缘 → 加宽）
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onStepWidth(edge === 'left' ? DRAWER_WIDTH_STEP : -DRAWER_WIDTH_STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onStepWidth(edge === 'right' ? DRAWER_WIDTH_STEP : -DRAWER_WIDTH_STEP)
    }
  }
  return (
    // D30：原生 title 退役——官方 Tooltip（portal 逃逸弹窗 transform/层叠上下文）
    <Tooltip label="拖动调宽 · 双击复位" portal>
      <div
        className="dswf-td-resize"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-label={edge === 'left' ? '拖动调整弹窗宽度（左缘）' : '拖动调整弹窗宽度（右缘）'}
        data-dswf-td-resize={edge}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => {
          onResetWidth()
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          onDragStart(edge === 'left' ? 'resize-left' : 'resize-right', event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) return // 仅主键按住拖拽（悬停移动不触发）
          onDragMove(event.clientX, event.clientY)
        }}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />
    </Tooltip>
  )
}

export interface TaskDrawerBodyProps {
  readonly detail: TaskDetail
  /** 弹窗宽（px——装载壳逐开本地态注入） */
  readonly width: number
  /** 弹窗位置（px——装载壳逐开本地态注入；null = 起始位未定[CSS 居中兜底]） */
  readonly position: DrawerModalPosition | null
  /** 折叠态（会话级保持值注入） */
  readonly collapsed: DrawerCollapseState
  /** 内容形态（D22：false = 简要 440[默认] / true = 完整 720——装载壳逐开本地态注入） */
  readonly expanded: boolean
  /** ⤢/⤡ 形态翻转（换宽 + 再居中归装载壳 drawerGeometryOnFormToggle） */
  readonly onToggleForm: () => void
  readonly onClose: () => void
  readonly onToggleSection: (key: DrawerSectionKey) => void
  /** 参考文档 chip 点击（dock 开 tab——弹窗保持） */
  readonly onOpenDoc: (docRel: string) => void
  /** 挂接会话 pill 点击（跳会话 + 关弹窗——原型 m31-tm-sess 两动作一体；装配接线；缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 「转移状态…」入口（对话框开——缺席 = 禁用） */
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
  /** 键盘步进（方向由手柄缘侧定向——装载壳钳制内应用） */
  readonly onStepWidth: (delta: number) => void
  /** 拖移会话开（标题栏拖移 / 缘侧拖宽——起点快照归装载壳） */
  readonly onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void
  /** 拖移会话步进（指针位移 → 几何换算归装载壳） */
  readonly onDragMove: (clientX: number, clientY: number) => void
  /** 拖移会话收（指针释放） */
  readonly onDragEnd: () => void
  /** 相对时间基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 任务详情弹窗纯渲染体（D21 弹窗壳 + D22 双形态 + 两分块 + 调宽/关闭锚） */
export function TaskDrawerBody({
  detail,
  width,
  position,
  collapsed,
  expanded,
  onToggleForm,
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
  onDragStart,
  onDragMove,
  onDragEnd,
  now,
}: TaskDrawerBodyProps): ReactNode {
  const at = now ?? Date.now()
  const categoryClass = `dswf-td-cat-${typeCategoryClassOf(detail.taskType)}`
  const chips = taskKvChips(detail)
  const coverage = coverageViewOf(detail)
  const showCoverage = templateFamilyOf(detail.taskType) === 'coding' && (coverage.actualPct !== undefined || coverage.expectedPct !== undefined)
  const note = varsText(detail.vars ?? {}, 'note')
  // 挂接会话 pill 组合（原型 m31-tm-sess：跳对应对话面板 + 关弹窗——两动作一体）
  const jumpToSession =
    onOpenSession === undefined
      ? undefined
      : (sessionId: string): void => {
          onOpenSession(sessionId)
          onClose()
        }

  return (
    <aside
      key={detail.taskId}
      className={`dswf-td-drawer ${categoryClass}`}
      role="dialog"
      aria-label="任务详情"
      style={taskDrawerShellStyle(width, position)}
      data-dswf-td-drawer=""
      data-dswf-td-form={expanded ? 'full' : 'brief'}
    >
      <DrawerResizeHandle
        edge="left"
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onStepWidth={onStepWidth}
        onResetWidth={onResetWidth}
      />
      <DrawerResizeHandle
        edge="right"
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onStepWidth={onStepWidth}
        onResetWidth={onResetWidth}
      />
      <div className="dswf-td-head" data-dswf-td-head="" {...taskDrawerHeadDragProps(onDragStart, onDragMove, onDragEnd)}>
        <StateDot state={STATUS_DOT_STATE[detail.taskStatus]} size={8} />
        {/* D30：原生 title 退役——官方 Tooltip（portal 逃逸弹窗 transform/层叠上下文） */}
        <Tooltip label={taskKeyLabel(detail.slug, detail.localId)} portal>
          <span className="dswf-td-key">{taskKeyLabel(detail.slug, detail.localId)}</span>
        </Tooltip>
        <Tag tone="neutral" className="dswf-td-status">
          {TASK_STATUS_LABELS[detail.taskStatus].zh}
        </Tag>
        <span className="dswf-td-spacer" />
        <Tooltip label={expanded ? '收起为简要信息' : '展开完整信息'} portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-td-expand"
            data-dswf-td-expand=""
            aria-pressed={expanded}
            onClick={onToggleForm}
          >
            <IconFullscreenOutlineMedium size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="关闭（Esc）" portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-td-close"
            data-dswf-td-close=""
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <IconCloseFillRegular size={14} />
          </Button>
        </Tooltip>
      </div>
      <Tooltip label={detail.title} portal>
        <div className="dswf-td-title">{detail.title}</div>
      </Tooltip>
      {expanded ? (
        <>
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
              <TimelineNow detail={detail} onOpenSession={jumpToSession} />
              <TimelineEvents detail={detail} onOpenSession={jumpToSession} now={at} />
            </DrawerSection>
          </div>
        </>
      ) : (
        <DrawerBriefBody detail={detail} />
      )}
      <div className="dswf-td-foot">
        {/* 诊断失败（4.6 UF-3 v19–v21——仅 blocked/rejected 任务；无单任务执行动作[Hard Rule]） */}
        {(detail.taskStatus === 'blocked' || detail.taskStatus === 'rejected') && onDiagnoseFailure !== undefined ? (
          <span className="dswf-td-diagwrap" data-dswf-td-diagwrap="">
            <DiagToast result={diagResult} onDismiss={onDiagDismiss} {...(onDiagSend !== undefined ? { onSend: onDiagSend } : {})} />
            <Tooltip label="诊断失败——失败摘要 toast + 可发送给 agent 排查修复" portal>
              <Button
                variant="outline"
                size="sm"
                className="dswf-td-diag"
                data-dswf-td-diag={detail.taskStatus}
                onClick={() => {
                  onDiagnoseFailure(detail)
                }}
              >
                诊断失败
              </Button>
            </Tooltip>
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

/** 弹窗装载态（同任务静默重取 = detail 保持旧值——不闪骨架；m3.1 D21 滑入动画已随抽屉形态退役） */
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
  /** 打开任务（null = 关闭不渲染；非空切换 = 原位换内容——D21 单例语义） */
  readonly taskId: string | null
  /** 关闭（Esc / ✕——上抛装配方） */
  readonly onClose: () => void
  /** 参考文档 chip 点击（dock 开 tab——装配接线） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 挂接会话 pill 点击（跳会话——装配接线） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 「转移状态…」入口（对话框开） */
  readonly onTransition?: (taskId: string) => void
  /** 打开新会话通道（任务失败诊断「发送给 agent」——装配注入；发往任务容器对应模式） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** @ 锚文档根（装配 fail-soft 装载注入——useProjectDocsRoot 项目行推导；缺席 = `docs` 缺省锚） */
  readonly docsRoot?: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 相对时间基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 逐开几何（宽 + 位——装载壳本地态；关闭随壳卸载弃置 = 不记忆[裁决 #3]） */
export interface TaskDrawerGeometry {
  readonly width: number
  readonly position: DrawerModalPosition | null
}

/** 初始几何（默认宽 440 + 位未定——mount 效应按视口落默认起始位；null = CSS 居中兜底） */
export function initialTaskDrawerGeometry(): TaskDrawerGeometry {
  return { width: DRAWER_WIDTH_DEFAULT, position: null }
}

/** 拖移会话快照（起点指针 + 起点几何——装载壳 move/resize 计算输入） */
export interface TaskDrawerDragSession {
  readonly kind: TaskDrawerDragKind
  readonly startClientX: number
  readonly startClientY: number
  readonly startWidth: number
  readonly startLeft: number
  readonly startTop: number
}

/**
 * 弹窗装载壳（三视图行点击 / 桥装配接线）：几何（宽/位）= 逐开本地态（关闭随壳卸载
 * 弃置——重开回默认起始位[裁决 #3 不记忆]；切换任务原位保持——taskId props 变更不卸载）；
 * 折叠 = 会话级保持（drawerSessionStore——关开弹窗/切任务共享）。
 * 任务失败诊断：blocked/rejected「诊断失败」→ 失败摘要 toast（5s）+「发送给 agent」
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
  // 逐开几何：ref = 处理器同步读源，state = 渲染驱动（双轨同写）
  const [geometry, setGeometryState] = useState<TaskDrawerGeometry>(initialTaskDrawerGeometry)
  const geometryRef = useRef<TaskDrawerGeometry>(geometry)
  const applyGeometry = useCallback((next: TaskDrawerGeometry): void => {
    geometryRef.current = next
    setGeometryState(next)
  }, [])
  const dragRef = useRef<TaskDrawerDragSession | null>(null)
  // 默认起始位落定（mount 后按视口计算——水平居中 + 14vh；SSR 首帧 CSS 兜底）
  useEffect(() => {
    const current = geometryRef.current
    if (current.position !== null) return
    applyGeometry({
      ...current,
      position: defaultDrawerPosition(window.innerWidth, window.innerHeight, current.width),
    })
  }, [applyGeometry])
  // 任务失败诊断 toast（受控 {result, mode}——mode = 触发时任务容器模式快照，发送路由此）
  const [diag, setDiag] = useState<{ readonly result: DiagToastResult; readonly mode: 'expedition' | 'blitz' | undefined } | undefined>(undefined)

  const handleToggleSection = useCallback((key: DrawerSectionKey): void => {
    drawerSessionStore.toggleSection(key)
  }, [])
  const handleStepWidth = useCallback((delta: number): void => {
    const current = geometryRef.current
    applyGeometry({ ...current, width: stepDrawerWidth(current.width, delta, window.innerWidth) })
  }, [applyGeometry])
  const handleResetWidth = useCallback((): void => {
    const current = geometryRef.current
    applyGeometry({ ...current, width: DRAWER_WIDTH_DEFAULT })
  }, [applyGeometry])
  const handleDragStart = useCallback((kind: TaskDrawerDragKind, clientX: number, clientY: number): void => {
    const current = geometryRef.current
    // 起始位未定即拖移（mount 效应前）——同步落定后取起点
    const startPosition =
      current.position ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, current.width)
    if (current.position === null) {
      applyGeometry({ ...current, position: startPosition })
    }
    dragRef.current = {
      kind,
      startClientX: clientX,
      startClientY: clientY,
      startWidth: current.width,
      startLeft: startPosition.left,
      startTop: startPosition.top,
    }
  }, [applyGeometry])
  const handleDragMove = useCallback((clientX: number, clientY: number): void => {
    const drag = dragRef.current
    if (drag === null) return
    if (drag.kind === 'move') {
      applyGeometry({
        width: drag.startWidth,
        position: drawerPositionFromDrag(
          { left: drag.startLeft, top: drag.startTop },
          drag.startClientX,
          drag.startClientY,
          clientX,
          clientY,
          window.innerWidth,
          window.innerHeight,
          drag.startWidth,
        ),
      })
      return
    }
    const edge: DrawerResizeEdge = drag.kind === 'resize-left' ? 'left' : 'right'
    const width = drawerWidthFromEdgeDrag(edge, drag.startWidth, drag.startClientX, clientX, window.innerWidth)
    applyGeometry({
      width,
      // 对侧锚定：左缘拖宽 = 右缘不动（左随宽补）；右缘拖宽 = 左缘不动
      position: {
        left: drag.kind === 'resize-left' ? drag.startLeft + (drag.startWidth - width) : drag.startLeft,
        top: drag.startTop,
      },
    })
  }, [applyGeometry])
  const handleDragEnd = useCallback((): void => {
    dragRef.current = null
  }, [])
  // D22 双形态：展开态 = 逐开本地态（同几何生命周期——关闭随壳卸载弃置 = 重开回默认简要
  // [裁决 #11 不记忆展开态]；切任务原位保持——原型 openTaskModal 仅首开重置）。
  // 双轨同几何（ref 处理器读源 + state 渲染驱动）；⤢/⤡ 换宽走 drawerGeometryOnFormToggle。
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(false)
  const handleToggleForm = useCallback((): void => {
    const next = !expandedRef.current
    expandedRef.current = next
    setExpanded(next)
    const current = geometryRef.current
    applyGeometry(drawerGeometryOnFormToggle(current.width, current.position, next, window.innerWidth))
  }, [applyGeometry])
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
    return null
  }

  if (state.phase === 'error' && state.error !== undefined) {
    return (
      <aside
        key={taskId}
        className="dswf-td-drawer"
        role="dialog"
        aria-label="任务详情"
        style={taskDrawerShellStyle(geometry.width, geometry.position)}
        data-dswf-td-drawer=""
      >
        <DrawerResizeHandle edge="left" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={handleStepWidth} onResetWidth={handleResetWidth} />
        <DrawerResizeHandle edge="right" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={handleStepWidth} onResetWidth={handleResetWidth} />
        <div className="dswf-td-head" data-dswf-td-head="" {...taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)}>
          <span className="dswf-td-title">任务详情</span>
          <span className="dswf-td-spacer" />
          <Tooltip label="关闭（Esc）" portal>
            <Button variant="ghost" size="sm" className="dswf-td-close" data-dswf-td-close="" aria-label="关闭弹窗" onClick={onClose}>
              <IconCloseFillRegular size={14} />
            </Button>
          </Tooltip>
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
        className="dswf-td-drawer"
        role="dialog"
        aria-label="任务详情"
        style={taskDrawerShellStyle(geometry.width, geometry.position)}
        data-dswf-td-drawer=""
      >
        <DrawerResizeHandle edge="left" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={handleStepWidth} onResetWidth={handleResetWidth} />
        <DrawerResizeHandle edge="right" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={handleStepWidth} onResetWidth={handleResetWidth} />
        <div className="dswf-td-head" data-dswf-td-head="" {...taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)}>
          <span className="dswf-td-title">任务详情</span>
          <span className="dswf-td-spacer" />
          <Tooltip label="关闭（Esc）" portal>
            <Button variant="ghost" size="sm" className="dswf-td-close" data-dswf-td-close="" aria-label="关闭弹窗" onClick={onClose}>
              <IconCloseFillRegular size={14} />
            </Button>
          </Tooltip>
        </div>
        <SkeletonRows className="dswf-td-skeleton" rowClassName="dswf-td-skeleton-row" rows={8} anchor="data-dswf-td-skeleton" />
      </aside>
    )
  }
  return (
    <TaskDrawerBody
      detail={state.detail}
      width={clampDrawerWidth(geometry.width)}
      position={geometry.position}
      collapsed={session.collapsed}
      expanded={expanded}
      onToggleForm={handleToggleForm}
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
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      now={now}
    />
  )
}
