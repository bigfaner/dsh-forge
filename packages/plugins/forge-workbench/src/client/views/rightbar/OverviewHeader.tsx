/**
 * The 项目概览 tab's 标题栏 + 概要信息区 (M4 task 2.3, layout §4.3): the
 * project NAME row (随联动切换 — the active-project pointer is the only
 * source) over the ALWAYS-VISIBLE meta block the three sub-tabs share:
 *
 *   工作区 / 代码区 — the two path rows, 超长省略 with `title` carrying the
 *                    full path (§4.3's ellipsis + title-全称 pair);
 *   状态           — 活跃 feature · 任务 done/total · 运行中 N, derived by
 *                    overview-model (one derivation home); an ARCHIVED
 *                    project swaps the line for the ⚠ 已归档 mark (概览转
 *                    只读, Story 5 归档不丢历史).
 *
 * 随数据实时,不随子 tab 切换变化 (AC1): the header is PRESENTATIONAL —
 * its data (project snapshot, feature board, task sources) is loaded by
 * OverviewTab ABOVE the sub-tab boundary and never re-fires on a sub-tab
 * switch; a pending member simply omits its segment (no placeholder flash).
 *
 * M4 task 3.5 (C8 归宿①, page-map Shared Components「投影状态行 | 右栏概览」):
 * the header also mounts the 投影状态行 — the ProjectionStatusRow meta row
 * under the 状态 line. The row stays ABSENT for archived projects (概览转
 * 只读 — the ⚠ line carries the state; 归档不对账, the workspace stays by
 * design) and while the projection read is still in flight (the header's
 * pending-member discipline: omit, never a placeholder flash).
 */
import type { ReactNode } from 'react'
import type { FeatureSummary, Project, ProjectionStatusRow as ProjectionStatusRowDto } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { fillTemplate } from '../overview/format'
import { ProjectionStatusRow } from '../../components/projection/ProjectionStatusRow'
import {
  countRunningSessions, deriveActiveFeature, workspaceRootOf,
  type OverviewTaskSource,
} from './overview-model'

/** Inputs of {@link OverviewHeader}. */
export interface OverviewHeaderProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The ACTIVE project row (displayName/codeRoot/archived); undefined = resolving. */
  project: Project | undefined
  /** The feature board rows (the 活跃 feature + 任务 done/total segments). */
  features: readonly FeatureSummary[] | undefined
  /** The task sources (the 运行中 N segment). */
  taskSources: readonly OverviewTaskSource[] | undefined
  /** The projection status row (C8 归宿①); undefined = in flight / archived → omit. */
  projection?: ProjectionStatusRowDto | undefined
  /** The [重试投影] seam (the owner fires the retryProjection verb). */
  onRetryProjection?: (() => void) | undefined
  /** The retry in-flight marker. */
  projectionRetrying?: boolean | undefined
}

/** The tab's column layout (the GuideTab family's inline-token discipline). */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
  padding: '12px 12px 0',
} as const

/** 标题栏: the project name row (16/24 500, the pane's own heading). */
const titleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** ⚠ 已归档 (Story 5): warn-tinted capsule beside the title. */
const archivedBadgeStyle = {
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '8px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** One meta row: the 12/18 key slot over the ellipsized value. */
const metaRowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

const metaKeyStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 超长省略 + title 全称 (§4.3): the value slot truncates, the attr carries all. */
const metaValueStyle = {
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 12/18 mono (a path — the 代码栈 treatment). */
const metaMonoStyle = {
  ...metaValueStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** The 状态 line's segment separator (the wireframe's ·). */
const STATUS_SEPARATOR = ' · '

/**
 * The 标题栏 + 概要信息区. Pure presentation: every number arrives derived.
 */
export function OverviewHeader(props: OverviewHeaderProps): ReactNode {
  const { t, project, features, taskSources } = props
  const projection = props.projection !== undefined && project?.archived !== true
    ? props.projection
    : undefined
  if (project === undefined) return null
  const workspace = workspaceRootOf(project.codeRoot)
  const active = features === undefined ? undefined : deriveActiveFeature(features)
  const running = taskSources === undefined ? undefined : countRunningSessions(taskSources)

  // The 状态 line: archived → the ⚠ mark alone; otherwise the three segments,
  // each omitting itself while its data is still in flight (no placeholder).
  const statusSegments: string[] = []
  if (active !== undefined) {
    statusSegments.push(fillTemplate(t('rightbar.overview.meta.activeFeature'), { slug: active.slug }))
    statusSegments.push(fillTemplate(t('rightbar.overview.meta.tasksProgress'), {
      completed: String(active.taskCompleted),
      total: String(active.taskTotal),
    }))
  }
  if (running !== undefined) {
    statusSegments.push(fillTemplate(t('rightbar.overview.meta.running'), { count: String(running) }))
  }

  return (
    <div data-dsh-forge-overview-header="" style={rootStyle}>
      {/* 标题栏 = 项目名(随联动切换)+ 归档 ⚠ */}
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
        <span data-dsh-forge-overview-title="" title={project.displayName} style={titleStyle}>
          {project.displayName}
        </span>
        {project.archived && (
          <span data-dsh-forge-overview-archived="" style={archivedBadgeStyle}>
            {`⚠ ${t('rightbar.overview.archived')}`}
          </span>
        )}
      </div>
      {/* 概要信息区 (常显,三子 tab 共享) */}
      <div data-dsh-forge-overview-meta="" style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <div style={metaRowStyle}>
          <span style={metaKeyStyle}>{t('rightbar.overview.meta.workspace')}</span>
          <span data-dsh-forge-overview-workspace="" title={workspace} style={metaMonoStyle}>
            {workspace === '' ? '—' : workspace}
          </span>
        </div>
        <div style={metaRowStyle}>
          <span style={metaKeyStyle}>{t('rightbar.overview.meta.codeRoot')}</span>
          <span data-dsh-forge-overview-coderoot="" title={project.codeRoot} style={metaMonoStyle}>
            {project.codeRoot}
          </span>
        </div>
        <div style={metaRowStyle}>
          <span style={metaKeyStyle}>{t('rightbar.overview.meta.status')}</span>
          <span data-dsh-forge-overview-status="" style={metaValueStyle}>
            {project.archived
              ? `⚠ ${t('rightbar.overview.archived')}`
              : statusSegments.join(STATUS_SEPARATOR)}
          </span>
        </div>
        {/* 投影状态行 (C8 归宿①): present only when loaded AND not archived. */}
        {projection !== undefined && (
          <div style={metaRowStyle}>
            <span style={metaKeyStyle}>{t('rightbar.overview.meta.projection')}</span>
            <ProjectionStatusRow
              t={t}
              status={projection}
              retrying={props.projectionRetrying}
              {...(props.onRetryProjection === undefined ? {} : { onRetry: props.onRetryProjection })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
