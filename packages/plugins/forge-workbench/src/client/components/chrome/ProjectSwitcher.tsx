/**
 * The project switcher (task 5.1, ui-design 顶栏): a Menu-card dropdown (r20,
 * pad 4, min-w 218) listing every registered project (display name + ✓ on the
 * active one) with the 「添加项目」 entry at the bottom. Selecting a project
 * activates it — Interface 1 activateProject semantics (single activation);
 * in the 5.x build stage the action is a local stub, the 5.14-5.16 assembly
 * tasks swap in the IPC verb.
 *
 * Keyboard (WAI-ARIA menu pattern): the trigger opens on click / Enter /
 * Space / ArrowDown; inside, ArrowDown/ArrowUp cycle the items (roving DOM
 * focus), Enter/Space activate (native buttons), Escape closes and returns
 * focus to the trigger, Tab leaves (menu closes), pointer-down outside
 * closes. With no registered projects the trigger reads the empty label and
 * the menu is the registration guidance (hint + add entry) — the chrome-level
 * 空态引导至注册 (the overview page's own empty card is 5.3's).
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from './ChromeButton'

/** Inputs of {@link ProjectSwitcher}. */
export interface ProjectSwitcherProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The registered projects (Interface 1 WorkbenchState.projects). */
  projects: readonly Project[]
  /** The single-activation pointer (Interface 1 WorkbenchState.activeProjectId). */
  activeProjectId: string | null
  /** Interface 1 activateProject(id) — mock-stubbed in the build stage. */
  onActivate: (id: string) => void
  /** The register entry (the 5.4 wizard owns the dialog; stubbed until then). */
  onAddProject: () => void
}

/** ui-design sm ghost button (h28 r14). */
const ghostButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, transparent)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  gap: '4px',
  height: '28px',
  padding: '0 10px',
} as const

const wrapStyle = {
  display: 'inline-flex',
  position: 'relative',
} as const

const triggerLabelStyle = {
  maxWidth: '220px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** ui-design Menu 卡: r20, pad 4, min-w 218, above the tab content (under the 5.x panels z100). */
const menuStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  left: '0',
  minWidth: '218px',
  padding: '4px',
  position: 'absolute',
  top: 'calc(100% + 6px)',
  zIndex: 150,
} as const

const itemStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '8px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

const itemLabelStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '7px 10px',
} as const

const separatorStyle = {
  background: 'var(--dsh-border-color, CanvasText)',
  height: '1px',
  margin: '4px 6px',
  opacity: 0.4,
} as const

/**
 * The switcher: trigger + (while open) the Menu card. The ✓ mark is
 * decorative — `aria-checked` on the `menuitemradio` carries the state.
 */
export function ProjectSwitcher(props: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const triggerId = `dsh-forge-switcher-${generatedId}`
  const menuId = `dsh-forge-switcher-menu-${generatedId}`
  // Menu items in focus order: projects, then the add entry.
  const itemCount = props.projects.length + 1

  // Open: park focus on the first item and arm the outside-pointer close.
  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [open])

  const closeMenu = (returnFocus: boolean): void => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    setOpen(true)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const current = itemRefs.current.findIndex(element => element === document.activeElement)
      const next = current === -1 ? 0 : (current + step + itemCount) % itemCount
      itemRefs.current[next]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'Tab') {
      // Natural tab-out: let the focus leave, the menu just closes behind it.
      setOpen(false)
    }
  }

  const activeProject = props.projects.find(project => project.id === props.activeProjectId)

  return (
    <div ref={wrapRef} data-dsh-forge-switcher="" style={wrapStyle}>
      <ChromeButton
        ref={triggerRef}
        type="button"
        id={triggerId}
        data-dsh-forge-switcher-trigger=""
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={menuId}
        aria-label={props.t('switcher.label')}
        style={ghostButtonStyle}
        onClick={() => { open ? closeMenu(false) : setOpen(true) }}
        onKeyDown={onTriggerKeyDown}
      >
        <span style={triggerLabelStyle}>{activeProject?.displayName ?? props.t('switcher.empty')}</span>
        <span aria-hidden="true">▾</span>
      </ChromeButton>
      {open && (
        <div
          role="menu"
          id={menuId}
          aria-labelledby={triggerId}
          data-dsh-forge-switcher-menu=""
          style={menuStyle}
          onKeyDown={onMenuKeyDown}
        >
          {props.projects.length === 0 && <div style={hintStyle}>{props.t('switcher.emptyHint')}</div>}
          {props.projects.map((project, index) => (
            <ChromeButton
              key={project.id}
              ref={(element) => { itemRefs.current[index] = element }}
              type="button"
              role="menuitemradio"
              aria-checked={project.id === props.activeProjectId ? 'true' : 'false'}
              data-dsh-forge-switcher-item={project.id}
              style={itemStyle}
              onClick={() => {
                props.onActivate(project.id)
                closeMenu(true)
              }}
            >
              <span style={itemLabelStyle}>{project.displayName}</span>
              {project.id === props.activeProjectId && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
            </ChromeButton>
          ))}
          <div role="separator" style={separatorStyle} />
          <ChromeButton
            ref={(element) => { itemRefs.current[props.projects.length] = element }}
            type="button"
            role="menuitem"
            data-dsh-forge-switcher-add=""
            style={itemStyle}
            onClick={() => {
              props.onAddProject()
              closeMenu(true)
            }}
          >
            <span aria-hidden="true">＋</span>
            <span style={itemLabelStyle}>{props.t('chrome.addProject')}</span>
          </ChromeButton>
        </div>
      )}
    </div>
  )
}
