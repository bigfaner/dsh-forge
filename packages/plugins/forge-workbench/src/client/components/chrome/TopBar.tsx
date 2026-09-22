/**
 * The workbench top bar (task 5.1, ui-design 顶栏 h48): the app identity
 * (the shell title), the project switcher, and the persistent 「＋ 添加项目」
 * action. Global status surfaces (sync health, UF5 availability) join this
 * bar with the views that own them — the bar is the reserved seat, no fake
 * indicators ship.
 */
import type { Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from './ChromeButton'
import { ProjectSwitcher } from './ProjectSwitcher'

/** Inputs of {@link TopBar}. */
export interface TopBarProps {
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

const topbarStyle = {
  alignItems: 'center',
  background: 'var(--dsh-bg, transparent)',
  borderBottom: '1px solid var(--dsh-border-color, transparent)',
  display: 'flex',
  gap: '10px',
  minHeight: '48px',
  padding: '0 16px',
  position: 'sticky',
  top: '0',
  zIndex: 50,
} as const

/** ui-design 16/24 标题(字重 500)— the workbench's app identity. */
const identityStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
  whiteSpace: 'nowrap',
} as const

const spacerStyle = {
  flex: '1',
} as const

/** ui-design 「＋ 添加项目」顶栏常驻按钮为 sm ghost. */
const addButtonStyle = {
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
  whiteSpace: 'nowrap',
} as const

/** The h48 bar. */
export function TopBar(props: TopBarProps) {
  return (
    <header data-dsh-forge-topbar="" style={topbarStyle}>
      <h2 style={identityStyle}>{props.t('shell.title')}</h2>
      <ProjectSwitcher
        t={props.t}
        projects={props.projects}
        activeProjectId={props.activeProjectId}
        onActivate={props.onActivate}
        onAddProject={props.onAddProject}
      />
      <div style={spacerStyle} />
      <ChromeButton
        type="button"
        data-dsh-forge-add-project=""
        style={addButtonStyle}
        onClick={() => { props.onAddProject() }}
      >
        <span aria-hidden="true">＋</span>
        {props.t('chrome.addProject')}
      </ChromeButton>
    </header>
  )
}
