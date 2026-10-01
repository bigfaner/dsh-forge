/**
 * The C3 project row (task 1.4; workbench-layout-v2 §2.3 项目节点 L1):
 * h34 r12, folder glyph (closed/open — dsh IconFolderOpen/Close16 同构) that
 * swaps on hover for the rotating triangle caret (TriangleRightFill14 同构;
 * icon-zone click expands ANY project's sessions, 裁决 #18-①); row click =
 * the workbench switch (原位换台 belongs to the 1.6 seat); hover tail ＋
 * (在此新建会话) and ⋯ (the C8 lifecycle menu, task 3.5: 重命名 行内编辑 /
 * 归档 → 确认 Dialog / 删除 → 确认 Dialog — the dialogs live at the seat).
 * Archived rows ride the read-only partition: 降透明 .6 + ⚠ badge, no
 * sessions, no ＋, and the ⋯ menu flips to 恢复/删除.
 */
import { useEffect, useRef, useState } from 'react'
import { IconFolderClose16, IconFolderOpen16, IconTriangleRightFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { FOCUS_RING } from '../chrome/ChromeButton'
import type { Project } from '../../ipc-types'
import type { TreeTranslate } from './SessionRow'
import type { WorkbenchKey } from '../../locale/en'

/** The ⋯ menu's project command vocabulary (active vs archived rows). */
export type ProjectRowCommand = 'rename' | 'archive' | 'remove' | 'restore'

export interface ProjectRowProps {
  t: TreeTranslate
  project: Project
  expanded: boolean
  active: boolean
  onOpen: (projectId: string) => void
  onToggleExpanded?: ((projectId: string) => void) | undefined
  onNewSession?: ((projectId: string) => void) | undefined
  /**
   * The lifecycle commands that BUBBLE (archive/remove/restore — the seat
   * owns their dialogs); 重命名 stays IN the row (行内编辑, the commit rides
   * {@link onRename}).
   */
  onCommand?: ((projectId: string, command: ProjectRowCommand) => void) | undefined
  /** The inline-rename commit (Enter/blur with a changed, non-empty value). */
  onRename?: ((projectId: string, displayName: string) => void) | undefined
}

const ACTIVE_COMMANDS: ReadonlyArray<{ command: ProjectRowCommand; key: WorkbenchKey; glyph: string }> = [
  { command: 'rename', key: 'tree.project.rename', glyph: '✎ ' },
  { command: 'archive', key: 'tree.project.archive', glyph: '🗄 ' },
  { command: 'remove', key: 'tree.project.remove', glyph: '🗑 ' },
]

const ARCHIVED_COMMANDS: ReadonlyArray<{ command: ProjectRowCommand; key: WorkbenchKey; glyph: string }> = [
  { command: 'restore', key: 'tree.project.restore', glyph: '⤺ ' },
  { command: 'remove', key: 'tree.project.remove', glyph: '🗑 ' },
]

const rowStyle = {
  alignItems: 'center',
  borderRadius: '12px',
  cursor: 'pointer',
  display: 'flex',
  fontSize: '14px',
  fontWeight: 500,
  gap: '4px',
  height: '34px',
  minWidth: 0,
  paddingLeft: '2px',
  paddingRight: '8px',
  position: 'relative',
  width: '100%',
} as const

const nameStyle = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** Icon zone: ≥28×28 hit area (可访问性基线 命中区). */
const iconZoneStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: 'none',
  height: '28px',
  justifyContent: 'center',
  width: '28px',
} as const

const miniActionStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: 'none',
  fontSize: '14px',
  height: '24px',
  justifyContent: 'center',
  width: '24px',
} as const

const menuStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  minWidth: '168px',
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

/** The inline-rename input (行内编辑): inherits the name slot's flex behavior. */
const renameInputStyle = {
  ...nameStyle,
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  color: 'inherit',
  font: 'inherit',
  fontSize: '14px',
  height: '24px',
  padding: '0 6px',
} as const

/** One project row — active navigable, or archived read-only (降透明+⚠). */
export function ProjectRow(props: ProjectRowProps) {
  const { t, project, expanded, active } = props
  const archived = project.archived
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!rowRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [menuOpen])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  /** The inline-rename commit: a changed, non-empty value fires onRename. */
  const commitRename = (): void => {
    const next = inputRef.current?.value.trim() ?? ''
    setEditing(false)
    if (next === '' || next === project.displayName) return
    props.onRename?.(project.id, next)
  }
  const cancelRename = (): void => { setEditing(false) }

  const background = active
    ? 'var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1))'
    : hovered
      ? 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))'
      : 'transparent'

  return (
    <div
      ref={rowRef}
      {...(archived ? { 'data-dsh-forge-tree-archived-row': project.id } : { 'data-dsh-forge-tree-project': project.id })}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      title={`${project.displayName}${archived ? ` · ${t('tree.archivedBadge')}` : ''}`}
      style={{
        ...rowStyle,
        background,
        opacity: archived ? 0.6 : 1,
        ...(focused ? FOCUS_RING : undefined),
      }}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      onFocus={() => { setFocused(true) }}
      onBlur={() => { setFocused(false) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (!archived) props.onOpen(project.id)
        }
      }}
      onClick={() => { if (!archived) props.onOpen(project.id) }}
    >
      {!archived && (
        <span
          data-dsh-forge-tree-project-toggle={project.id}
          role="button"
          tabIndex={0}
          aria-expanded={expanded ? 'true' : 'false'}
          aria-label={expanded ? t('tree.project.collapse') : t('tree.project.expand')}
          style={iconZoneStyle}
          title={expanded ? t('tree.project.collapse') : t('tree.project.expand')}
          onClick={(event) => {
            event.stopPropagation()
            props.onToggleExpanded?.(project.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              props.onToggleExpanded?.(project.id)
            }
          }}
        >
          {/* hover 换三角 caret;旋转 = 展开 (0.2s, dsw 缓动) */}
          <span style={{ display: 'inline-flex', position: 'relative' }}>
            <span style={{ display: 'inline-flex', visibility: hovered ? 'hidden' : 'visible' }}>
              {expanded ? <IconFolderOpen16 /> : <IconFolderClose16 />}
            </span>
            <span
              aria-hidden="true"
              style={{
                alignItems: 'center',
                display: hovered ? 'inline-flex' : 'none',
                inset: 0,
                justifyContent: 'center',
                position: 'absolute',
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <IconTriangleRightFill14 />
            </span>
          </span>
        </span>
      )}
      {archived && <span aria-hidden="true" style={{ flex: 'none', width: '28px' }} />}
      {editing ? (
        <input
          ref={inputRef}
          data-dsh-forge-tree-project-rename-input={project.id}
          type="text"
          defaultValue={project.displayName}
          aria-label={t('tree.project.renameInput')}
          title={t('tree.project.renameInput')}
          style={renameInputStyle}
          onClick={(event) => { event.stopPropagation() }}
          onKeyDown={(event) => {
            // Enter commits / Esc cancels; both stop the ROW's switch handler.
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              commitRename()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancelRename()
            }
          }}
          onBlur={() => { commitRename() }}
        />
      ) : (
        <span style={nameStyle}>{project.displayName}</span>
      )}
      {archived && <span aria-label={t('tree.archivedBadge')} role="img" style={{ flex: 'none' }} title={t('tree.archivedBadge')}>⚠</span>}
      {!archived && (hovered || menuOpen) && (
        <span
          data-dsh-forge-tree-project-new={project.id}
          role="button"
          tabIndex={0}
          aria-label={t('tree.project.newSession')}
          style={miniActionStyle}
          title={t('tree.project.newSession')}
          onClick={(event) => {
            event.stopPropagation()
            props.onNewSession?.(project.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              props.onNewSession?.(project.id)
            }
          }}
        >
          ＋
        </span>
      )}
      {(hovered || menuOpen) && (
        <span
          data-dsh-forge-tree-project-more={project.id}
          role="button"
          tabIndex={0}
          aria-label={t('tree.project.menu')}
          aria-haspopup="menu"
          aria-expanded={menuOpen ? 'true' : 'false'}
          style={miniActionStyle}
          title={t('tree.project.menu')}
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
        <div role="menu" data-dsh-forge-tree-project-menu={project.id} aria-label={t('tree.project.menu')} style={menuStyle}>
          {(archived ? ARCHIVED_COMMANDS : ACTIVE_COMMANDS).map(({ command, key, glyph }) => (
            <button
              key={command}
              type="button"
              role="menuitem"
              style={menuItemStyle}
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                // 重命名 stays in the row (行内编辑); the rest bubble to the
                // seat's dialog/verb owners.
                if (command === 'rename') setEditing(true)
                else props.onCommand?.(project.id, command)
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
