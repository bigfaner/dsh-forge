/**
 * The project-card grid (task 5.3, ui-design UF1): 项目卡片 grid —
 * `min 280, auto-fill, gap 12` (the ui-design Layout line, which is itself
 * the responsive-wrap answer: cards reflow with the pane, no breakpoint
 * list). The grid is a pure layout over the registry — every card's
 * interaction routes up to the page (the verb owner), so the grid holds no
 * state of its own.
 */
import type { Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ProjectCard, type ProjectCardMigration } from './ProjectCard'

/** Inputs of {@link ProjectGrid}. */
export interface ProjectGridProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The registered projects, in registration order. */
  projects: readonly Project[]
  /** The single-activation pointer (Interface 1 WorkbenchState.activeProjectId). */
  activeProjectId: string | null
  /** Path re-validation failures (the per-card 失联徽标). */
  lostProjectIds: readonly string[]
  /** Interface 1 activateProject(id) — the 切换 action. */
  onActivate: (id: string) => void
  /** The rename leg (see {@link ProjectCardProps.onRename}). */
  onRename: (id: string, displayName: string) => Promise<boolean>
  /** Opens the double-step RemoveConfirm. */
  onRemove: (project: Project) => void
  /**
   * The per-card migration surface (task 1.7): the page derives each row's
   * projection from getMigrationStatus; absent callback = the M2 grid.
   */
  migrationOf?: ((project: Project) => ProjectCardMigration | undefined) | undefined
}

/** ui-design 项目卡片 grid: min 280, auto-fill, gap 12. */
export const projectGridStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
} as const

/** The grid. `data-dsh-forge-project-grid` is the 5.3/e2e observation hook. */
export function ProjectGrid(props: ProjectGridProps) {
  return (
    <div data-dsh-forge-project-grid="" style={projectGridStyle}>
      {props.projects.map(project => (
        <ProjectCard
          key={project.id}
          t={props.t}
          project={project}
          active={project.id === props.activeProjectId}
          lost={props.lostProjectIds.includes(project.id)}
          onActivate={props.onActivate}
          onRename={props.onRename}
          onRemove={props.onRemove}
          migration={props.migrationOf?.(project)}
        />
      ))}
    </div>
  )
}
