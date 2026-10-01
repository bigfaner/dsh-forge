/**
 * The C3 subagent row (task 1.4; ui-design §Component C3 Layout): h28,
 * indent 12/级, ↳ lineage prefix + name (12px mono) + own status dot —
 * recursive subtrees default collapsed (展开经 expandedSessions, caret ▸
 * rotates). Click opens the session via the parent's onOpen (the 1.6 seat
 * differentiates the SubagentAddress channel); hover ⋯ carries the same dsh
 * mutator trio as the top row. In the 单列表 (flat) grouping the row keeps a
 * single indent (不逐层缩进) and shows its relative time.
 */
import { useEffect, useRef, useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { FOCUS_RING } from '../chrome/ChromeButton'
import type { TreeSession } from './tree-derive'
import type { SessionRowCommand, TreeTranslate } from './SessionRow'
import type { WorkbenchKey } from '../../locale/en'

export interface SubagentRowProps {
  t: TreeTranslate
  session: TreeSession
  /** Indent ladder: 2 = under a top row in tree mode; 1 = flat inline. */
  depth: number
  active: boolean
  hasChildren: boolean
  expanded: boolean
  /** Flat mode: single indent + relative time shown (不逐层缩进). */
  flat?: boolean
  relativeTime?: string
  onOpen: (sessionId: string) => void
  onToggleExpanded?: ((sessionId: string) => void) | undefined
  onCommand?: ((sessionId: string, command: SessionRowCommand) => void) | undefined
}

const COMMANDS: ReadonlyArray<{ command: SessionRowCommand; key: WorkbenchKey; glyph: string }> = [
  { command: 'rename', key: 'tree.session.rename', glyph: '✎ ' },
  { command: 'fork', key: 'tree.session.fork', glyph: '⑂ ' },
  { command: 'archive', key: 'tree.session.archive', glyph: '🗄 ' },
]

const rowStyle = {
  alignItems: 'center',
  borderRadius: '12px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: "'SF Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
  fontSize: '12px',
  gap: '6px',
  height: '28px',
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
  fontFamily: 'inherit',
  gap: '6px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

/** One subagent lineage row (h28, ↳ prefix, mono 12px). */
export function SubagentRow(props: SubagentRowProps) {
  const { t, session, depth, active, hasChildren, expanded, flat } = props
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

  const dotVisual = session.awaitingInput ? 'warning' : session.running ? 'ongoing' : undefined
  const dotLabel = session.awaitingInput
    ? t('tree.dot.awaitingInput')
    : session.running
      ? t('tree.dot.running')
      : undefined

  const background = active
    ? 'var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1))'
    : hovered
      ? 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))'
      : 'transparent'

  return (
    <div
      ref={rowRef}
      data-dsh-forge-tree-session={session.sessionId}
      data-dsh-forge-tree-kind="subagent"
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      title={session.title}
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
      <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-tertiary, GrayText)', flex: 'none' }}>↳</span>
      <span style={titleStyle}>{session.title}</span>
      {dotVisual === undefined
        ? <span aria-hidden="true" style={{ flex: 'none', width: '10px' }} />
        : (
          <span aria-label={dotLabel} role="img" style={{ flex: 'none' }} title={dotLabel}>
            <StateDot state={dotVisual} />
          </span>
        )}
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
      {flat === true && !hovered && !menuOpen && props.relativeTime !== undefined && (
        <span style={{ color: 'var(--dsw-alias-label-tertiary, GrayText)', flex: 'none', fontSize: '12px' }}>
          {props.relativeTime}
        </span>
      )}
      {(hovered || menuOpen) && (
        <span
          data-dsh-forge-tree-session-more={session.sessionId}
          role="button"
          tabIndex={0}
          aria-label={t('tree.session.menu')}
          aria-haspopup="menu"
          aria-expanded={menuOpen ? 'true' : 'false'}
          style={{
            alignItems: 'center',
            borderRadius: '8px',
            color: 'var(--dsw-alias-label-secondary, GrayText)',
            cursor: 'pointer',
            display: 'inline-flex',
            flex: 'none',
            fontSize: '14px',
            fontFamily: 'inherit',
            height: '24px',
            justifyContent: 'center',
            width: '28px',
          }}
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
          {COMMANDS.map(({ command, key, glyph }) => (
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
