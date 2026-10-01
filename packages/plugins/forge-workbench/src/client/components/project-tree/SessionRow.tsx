/**
 * The C3 top-level session row (task 1.4; ui-design §Component C3 Layout /
 * workbench-layout-v2 §2.1–§2.2c): h32 r12, dot slot (priority 待输入 > 运行
 * 中 > subagent 运行中 > 空闲 = no dot) + title (ellipsis) + 行尾 ▾ caret when
 * descendants exist + relative time (12px secondary). Hover swaps the time
 * slot for the ⋯ trigger — the menu is the dsh Rows.tsx trio VERBATIM
 * (✎ 重命名 / ⑂ 分叉会话 / 🗄 归档会话); the verbs ride the parent's
 * onSessionCommand callback (the 3.5 mutator wiring is mocked at build
 * stage). Blank drafts (未发首条消息, 单例置顶) hide the time slot but keep
 * the hover ⋯ (裁决 #16-①). Row language self-drawn — no upstream internals
 * (TECH-ui-reuse-003); the dsw tokens ride inline styles.
 */
import { useEffect, useRef, useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { FOCUS_RING } from '../chrome/ChromeButton'
import type { SessionDotState, TreeSession } from './tree-derive'
import type { WorkbenchKey } from '../../locale/en'

/** The ⋯ menu's command vocabulary (dsh session mutator trio). */
export type SessionRowCommand = 'rename' | 'fork' | 'archive'

export type TreeTranslate = (key: WorkbenchKey) => string

export interface SessionRowProps {
  t: TreeTranslate
  session: TreeSession
  dot: SessionDotState
  /** Hover-card copy source:「N 个子代理运行中」. */
  runningDescendantCount?: number
  /** Indent ladder: 1 = under a project group, 0 = flat list. */
  depth: number
  active: boolean
  hasChildren: boolean
  expanded: boolean
  /** Flat mode renders the ↳ lineage marker instead of the caret. */
  flat?: boolean
  /** The formatted 相对时间 (刚刚/N分钟/N小时/N天) — blank drafts hide it. */
  relativeTime: string
  onOpen: (sessionId: string) => void
  onToggleExpanded?: ((sessionId: string) => void) | undefined
  onCommand?: ((sessionId: string, command: SessionRowCommand) => void) | undefined
}

/** The upstream StateDot visual ladder (warning = 待输入, ongoing = 运行族). */
const DOT_VISUAL: Record<Exclude<SessionDotState, 'idle'>, 'warning' | 'ongoing'> = {
  'awaiting-input': 'warning',
  running: 'ongoing',
  'subagent-running': 'ongoing',
}

const DOT_LABEL_KEY: Record<Exclude<SessionDotState, 'idle'>, WorkbenchKey> = {
  'awaiting-input': 'tree.dot.awaitingInput',
  running: 'tree.dot.running',
  'subagent-running': 'tree.dot.subagentRunning',
}

/** The ⋯ trio, glyph + label (dsh Rows.tsx 逐字一致; glyph is decorative). */
const SESSION_COMMANDS: ReadonlyArray<{ command: SessionRowCommand; key: WorkbenchKey; glyph: string }> = [
  { command: 'rename', key: 'tree.session.rename', glyph: '✎ ' },
  { command: 'fork', key: 'tree.session.fork', glyph: '⑂ ' },
  { command: 'archive', key: 'tree.session.archive', glyph: '🗄 ' },
]

const rowStyle = {
  alignItems: 'center',
  borderRadius: '12px',
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  cursor: 'pointer',
  display: 'flex',
  fontSize: '14px',
  gap: '6px',
  height: '32px',
  minWidth: 0,
  paddingRight: '8px',
  position: 'relative',
  width: '100%',
} as const

const titleStyle = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const timeStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  flex: 'none',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const moreStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: 'none',
  fontSize: '14px',
  height: '24px',
  justifyContent: 'center',
  width: '28px',
} as const

const menuStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  minWidth: '160px',
  padding: '4px',
  position: 'absolute',
  right: '6px',
  top: 'calc(100% + 2px)',
  zIndex: 200,
} as const

const menuItemStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '13px',
  gap: '6px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

/** One top-level session row (h32) with its hover ⋯ menu. */
export function SessionRow(props: SessionRowProps) {
  const { t, session, dot, runningDescendantCount, depth, active, hasChildren, expanded, flat } = props
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!rowRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [menuOpen])

  const dotLabel = dot === 'idle'
    ? undefined
    : t(DOT_LABEL_KEY[dot])
      + (dot === 'subagent-running' && runningDescendantCount !== undefined && runningDescendantCount > 0
        ? ` (${t('tree.dot.subagentRunningCount').replace('{n}', String(runningDescendantCount))})`
        : '')
  const hoverTitle = runningDescendantCount !== undefined && runningDescendantCount > 0
    ? `${session.title} · ${t('tree.dot.subagentRunningCount').replace('{n}', String(runningDescendantCount))}`
    : session.title

  const background = active
    ? 'var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1))'
    : hovered
      ? 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))'
      : 'transparent'
  // The time slot hides while hovered (⋯ takes its place), for blank drafts
  // (未发首条消息单例置顶), and while the ⋯ menu is open.
  const showTime = !hovered && !menuOpen && session.blank !== true

  return (
    <div
      ref={rowRef}
      data-dsh-forge-tree-session={session.sessionId}
      data-dsh-forge-tree-kind={flat === true ? 'flat' : 'top'}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      title={hoverTitle}
      style={{
        ...rowStyle,
        paddingLeft: `${8 + depth * 12}px`,
        background,
        ...(focused ? FOCUS_RING : undefined),
      }}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      onFocus={() => { setFocused(true) }}
      onBlur={() => { setFocused(false) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onOpen(session.sessionId)
        }
      }}
      onClick={() => { props.onOpen(session.sessionId) }}
    >
      {dot === 'idle'
        ? <span aria-hidden="true" style={{ flex: 'none', width: '10px' }} />
        : (
          <span aria-label={dotLabel} role="img" style={{ flex: 'none' }} title={dotLabel}>
            <StateDot state={DOT_VISUAL[dot]} />
          </span>
        )}
      <span style={titleStyle}>{session.title}</span>
      {hasChildren && flat !== true && (
        <span
          data-dsh-forge-tree-caret={session.sessionId}
          role="button"
          tabIndex={0}
          aria-label={expanded ? t('tree.caret.collapse') : t('tree.caret.expand')}
          style={{
            color: 'var(--dsw-alias-label-secondary, GrayText)',
            cursor: 'pointer',
            flex: 'none',
            fontSize: '12px',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onClick={(event) => {
            event.stopPropagation()
            props.onToggleExpanded?.(session.sessionId)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              props.onToggleExpanded?.(session.sessionId)
            }
          }}
        >
          ▸
        </span>
      )}
      {showTime && <span style={timeStyle}>{props.relativeTime}</span>}
      {(hovered || menuOpen) && (
        <span
          data-dsh-forge-tree-session-more={session.sessionId}
          role="button"
          tabIndex={0}
          aria-label={t('tree.session.menu')}
          aria-haspopup="menu"
          aria-expanded={menuOpen ? 'true' : 'false'}
          style={moreStyle}
          title={t('tree.session.menu')}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              setMenuOpen(!menuOpen)
            }
          }}
        >
          ⋯
        </span>
      )}
      {menuOpen && (
        <div role="menu" data-dsh-forge-tree-session-menu={session.sessionId} aria-label={t('tree.session.menu')} style={menuStyle}>
          {SESSION_COMMANDS.map(({ command, key, glyph }) => (
            <button
              key={command}
              type="button"
              role="menuitem"
              style={menuItemStyle}
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                props.onCommand?.(session.sessionId, command)
              }}
            >
              <span aria-hidden="true">{glyph}</span>
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
