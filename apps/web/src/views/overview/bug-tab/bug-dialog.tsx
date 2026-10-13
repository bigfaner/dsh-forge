// Bug 详情弹框（定位：业务——fix-bug 概览 Bug 子 tab 行点击详情；任务详情弹窗同款可拖动
// 弹框模型：views/overview/drawer 先例——taskDrawerHeadDragProps / drawerPositionFromDrag /
// useTaskDrawerEscape 复用，勿另造拖动机械；几何 = 逐开本地态[宽恒默认、关闭即弃]；样式
// 全量复用 drawer.css dswf-td-* 既有类——零新 CSS）。
// 布局 = 提案「技术细节·Bug 子 tab 形态」线框：状态点+error_type+时间 / summary 大字 /
// 五字段 kv 区 / 修复证据区（fixed 显，open/unresolved 隐）/ 未修原因（unresolved 显）/
// 发现·修复人员 / 来源任务标识。会话 pill 沿 sessionTitleOfOrId 契约：sessionTitleOf 命中 =
// 可点击 title（onOpenSession 跳转 + 关弹窗——任务弹窗 m31-tm-sess 两动作一体语义）；
// 缺席 = fail-soft 回退 sessionId 不可点击。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BUG_STATUS_LABELS, type BugCard } from '@dsh-forge/contracts'
import { Button, IconCloseFillRegular, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { diagStampOf } from '../message-format.js'
import { BUG_STATUS_DOT_STATE } from './bug-list.js'
import {
  defaultDrawerPosition,
  drawerPositionFromDrag,
  DRAWER_WIDTH_DEFAULT,
  type DrawerModalPosition,
} from '../drawer/collapse.js'
import { taskDrawerHeadDragProps, useTaskDrawerEscape, type TaskDrawerDragKind } from '../drawer/index.js'
import '../drawer/drawer.css'

/** 五字段 kv 区行序（提案线框：Bug → Trigger → Expected → Actual → Suspected） */
const KV_FIELDS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'expected', label: 'Expected' },
  { key: 'actual', label: 'Actual' },
  { key: 'suspected', label: 'Suspected' },
]

function kvValueOf(bug: BugCard, key: string): string {
  switch (key) {
    case 'bug':
      return bug.bugDesc
    case 'trigger':
      return bug.triggerDesc
    case 'expected':
      return bug.expected
    case 'actual':
      return bug.actual
    default:
      return bug.suspected ?? '—'
  }
}

/** 会话 pill（sessionTitleOfOrId 契约）：命中 title 且 onOpenSession 在场 = 可点击按钮
 *  （跳会话 + 关弹窗两动作一体）；解析器缺席/未命中 = fail-soft 回退 sessionId 静态文本。 */
function SessionPill({
  sessionId,
  sessionTitleOf,
  onOpenSession,
  onClose,
}: {
  readonly sessionId: string
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
  readonly onOpenSession?: (sessionId: string) => void
  readonly onClose: () => void
}): ReactNode {
  const title = sessionTitleOf?.(sessionId)
  if (title === undefined || onOpenSession === undefined) {
    return <span className="dswf-td-bv" data-dswf-ov-bsess-id={sessionId}>{sessionId}</span>
  }
  return (
    <span className="dswf-td-bv">
      <button
        type="button"
        className="dswf-td-sess is-link"
        data-dswf-ov-bsess={sessionId}
        onClick={() => {
          onOpenSession(sessionId)
          onClose()
        }}
      >
        {`⟞ ${title}`}
      </button>
    </span>
  )
}

export interface BugDialogProps {
  /** 当前 Bug（列表行 BugCard 全量投影——详情零二次拉取） */
  readonly bug: BugCard
  /** 关闭（✕ / Esc / 会话 pill 跳转一并） */
  readonly onClose: () => void
  /** 会话 pill 跳转（装配注入 uiWorkspace.openSession——ShellHost 递达先例；缺席 = pill 不可点击） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 会话名解析器（dsh 账本快照 displayTitle 窄读——注入面同任务弹窗缝；缺席/未命中回退 id） */
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
}

/** Bug 详情弹框（可拖动弹框——宽恒默认 440；标题栏拖移 + 视口钳制 4px 边距/标题栏恒可见，
 *  数学面 = drawer/collapse drawerPositionFromDrag 同刻度复用；位 = 逐开本地态关闭即弃）。 */
export function BugDialog({ bug, onClose, onOpenSession, sessionTitleOf }: BugDialogProps): ReactNode {
  useTaskDrawerEscape(bug.bugId, onClose)
  const [position, setPosition] = useState<DrawerModalPosition | null>(null)
  const positionRef = useRef<DrawerModalPosition | null>(null)
  const applyPosition = useCallback((next: DrawerModalPosition): void => {
    positionRef.current = next
    setPosition(next)
  }, [])
  // 默认起始位（mount 效应按视口计算——水平居中 + 14vh；SSR 首帧 CSS 居中兜底同任务弹窗）
  useEffect(() => {
    if (positionRef.current !== null) return
    applyPosition(defaultDrawerPosition(window.innerWidth, window.innerHeight, DRAWER_WIDTH_DEFAULT))
  }, [applyPosition])
  const dragRef = useRef<{ readonly startClientX: number; readonly startClientY: number; readonly startLeft: number; readonly startTop: number } | null>(null)
  const handleDragStart = useCallback(
    (_kind: TaskDrawerDragKind, clientX: number, clientY: number): void => {
      const start = positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, DRAWER_WIDTH_DEFAULT)
      if (positionRef.current === null) applyPosition(start)
      dragRef.current = { startClientX: clientX, startClientY: clientY, startLeft: start.left, startTop: start.top }
    },
    [applyPosition],
  )
  const handleDragMove = useCallback(
    (clientX: number, clientY: number): void => {
      const drag = dragRef.current
      if (drag === null) return
      applyPosition(
        drawerPositionFromDrag(
          { left: drag.startLeft, top: drag.startTop },
          drag.startClientX,
          drag.startClientY,
          clientX,
          clientY,
          window.innerWidth,
          window.innerHeight,
          DRAWER_WIDTH_DEFAULT,
        ),
      )
    },
    [applyPosition],
  )
  const handleDragEnd = useCallback((): void => {
    dragRef.current = null
  }, [])
  const dragProps = taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)
  const style: Record<string, string> =
    position === null
      ? { width: `${DRAWER_WIDTH_DEFAULT}px` }
      : { width: `${DRAWER_WIDTH_DEFAULT}px`, left: `${position.left}px`, top: `${position.top}px`, transform: 'none' }

  return (
    <aside
      className="dswf-td-drawer"
      role="dialog"
      aria-label="Bug 详情"
      style={style}
      data-dswf-ov-bdialog=""
      data-dswf-ov-bdialog-id={bug.bugId}
    >
      <div className="dswf-td-head" data-dswf-ov-bdialog-head="" {...dragProps}>
        <span aria-hidden="true">⠿</span>
        <span>Bug 详情</span>
        <span className="dswf-td-spacer" />
        <Button variant="ghost" size="sm" className="dswf-td-close" data-dswf-ov-bdialog-close="" aria-label="关闭弹框" onClick={onClose}>
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      <div className="dswf-td-brief" data-dswf-ov-bdialog-meta="">
        <div className="dswf-td-brow">
          <StateDot state={BUG_STATUS_DOT_STATE[bug.bugStatus]} size={8} />
          <span data-dswf-ov-bdialog-status={bug.bugStatus}>
            <Tag tone="neutral">{BUG_STATUS_LABELS[bug.bugStatus].zh}</Tag>
          </span>
          {bug.errorType !== undefined ? (
            <span data-dswf-ov-bdialog-type={bug.errorType}>
              <Tag tone="neutral">{bug.errorType}</Tag>
            </span>
          ) : null}
          <span>·</span>
          <span className="dswf-td-bv">{diagStampOf(bug.createdAt)}</span>
        </div>
      </div>
      <div className="dswf-td-title" data-dswf-ov-bdialog-summary="">
        {bug.summary}
      </div>
      <div className="dswf-td-kvstrip" data-dswf-ov-bdialog-kv="">
        {KV_FIELDS.map(({ key, label }) => (
          <span className="dswf-td-kv-chip" key={key} data-dswf-ov-bdialog-kv={key}>
            <span className="dswf-td-kv-k">{label}</span>
            <span className="dswf-td-kv-sep"> : </span>
            <span className="dswf-td-kv-v">{kvValueOf(bug, key)}</span>
          </span>
        ))}
      </div>
      <div className="dswf-td-brief">
        {bug.bugStatus === 'fixed' ? (
          <div className="dswf-td-brow" data-dswf-ov-bdialog-evidence="">
            <span className="dswf-td-bk">修复证据</span>
            <span className="dswf-td-bv">
              {[
                ...(bug.commitHash !== undefined ? [`commit ${bug.commitHash}`] : []),
                ...(bug.worktree !== undefined ? [`worktree ${bug.worktree}`] : []),
                ...(bug.branch !== undefined ? [`branch ${bug.branch}`] : []),
              ].join(' · ')}
            </span>
          </div>
        ) : null}
        {bug.bugStatus === 'unresolved' && bug.unresolvedReason !== undefined ? (
          <div className="dswf-td-brow" data-dswf-ov-bdialog-unresolved="">
            <span className="dswf-td-bk">未修原因</span>
            <span className="dswf-td-bv">{bug.unresolvedReason}</span>
          </div>
        ) : null}
        <div data-dswf-ov-bdialog-people="">
          <div className="dswf-td-brow">
            <span className="dswf-td-bk">发现</span>
            <span className="dswf-td-bv" data-dswf-ov-bdialog-reporter="">{bug.reporter}</span>
            {bug.reportSessionId !== undefined ? (
              <SessionPill sessionId={bug.reportSessionId} sessionTitleOf={sessionTitleOf} onOpenSession={onOpenSession} onClose={onClose} />
            ) : null}
          </div>
          {bug.fixer !== undefined ? (
            <div className="dswf-td-brow">
              <span className="dswf-td-bk">修复</span>
              <span className="dswf-td-bv" data-dswf-ov-bdialog-fixer="">{bug.fixer}</span>
              {bug.fixSessionId !== undefined ? (
                <SessionPill sessionId={bug.fixSessionId} sessionTitleOf={sessionTitleOf} onOpenSession={onOpenSession} onClose={onClose} />
              ) : null}
            </div>
          ) : null}
        </div>
        {bug.sourceTaskId !== undefined ? (
          <div className="dswf-td-brow" data-dswf-ov-bdialog-source="">
            <span className="dswf-td-bk">来源</span>
            <span className="dswf-td-bv">{`任务 ${bug.sourceTaskId}`}</span>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
