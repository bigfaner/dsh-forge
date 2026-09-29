/**
 * Component C2 — the 归档横幅只读态 (M4 task 3.5; ui-design §Component C2
 * States·Archived): the full-width warn band「项目已归档(只读)」+ [恢复]/
 * [删除] ghost — the ONLY actions the archived workbench offers (可用动作仅
 * 恢复/删除). The rest of the read-only state is carried by the C3 tree's
 * archived partition (1.4: 降透明 + ⚠ + 会话列表抑制) and the 概览's ⚠ line.
 *
 * SEAT (the C6-resolution discipline): the design names「工作台头下方全宽」—
 * under the T1 native-home workbench the middle column is 100% upstream, and
 * the forge-mountable full-width band is the `conversation.input.dock` list
 * slot (「Full-width entries above the composer card」— the SAME resolved
 * fallback seat the C6 metadata bar documented: forge 自绘条, 数据面不变;
 * 声明合并纯增量, vendored untouched). The banner is DERIVED state (the
 * active-project store), so the 换台重置's 归档横幅复位 leg (1.6 记账) holds
 * BY CONSTRUCTION — a switch re-derives, no reset seam to call.
 *
 * Band visuals (ui-design 动效与几何 declaration): 警示色底 6% 透明 — the
 * warn alias through color-mix (the alias discipline; no static tint).
 */
import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CONVERSATION_DOCK_SLOT } from '../../contract'
import type { ActiveProjectStore } from '../../store/active-project'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { Project } from '../../ipc-types'
import type { TreeTranslate } from '../project-tree/SessionRow'
import type { MetadataDockZone } from '../task-metadata/MetadataBar'
import { ChromeButton } from '../chrome/ChromeButton'
import { ghostButtonStyle } from '../../views/tasks/launch/LaunchStates'
import {
  removeProjectNow, restoreProjectNow, type LifecycleActionDeps,
} from '../../lifecycle-actions'
import { RemoveProjectConfirmDialog } from '../confirm-dialog/ArchiveDeleteDialogs'

/** Inputs of {@link ArchiveBanner} (pure presentation). */
export interface ArchiveBannerProps {
  /** The locale seat (the plugin's bound `t`). */
  t: TreeTranslate
  /** The archived ACTIVE project's name (the band's subject). */
  projectName: string
  /** [恢复] — restoreProject (confirm-free, C1 semantics). */
  onRestore: () => void
  /** [删除] — opens the 必答⑤ remove confirm (never deletes directly). */
  onRemove: () => void
}

/** The full-width band: warn 6% background, h32 row, the two ghost actions. */
const bandStyle = {
  alignItems: 'center',
  background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary, rgb(245, 158, 11)) 6%, transparent)',
  borderRadius: '12px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  display: 'flex',
  fontSize: '12px',
  gap: '8px',
  height: '32px',
  lineHeight: '18px',
  margin: '4px 0',
  minWidth: 0,
  padding: '0 8px',
} as const

/** The warn glyph slot (the band's non-color redundancy). */
const warnGlyphStyle = { flex: '0 0 auto' } as const

/** The band's title: 12/18, flexes to ellipsis (超长项目名不撑破). */
const titleStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** sm ghost pill on the warn color (the C8 archived-state action pair). */
const bandGhostButtonStyle = {
  ...ghostButtonStyle,
  height: '24px',
  lineHeight: '16px',
  padding: '0 10px',
} as const

/**
 * The pure band. Renders NOTHING but the two actions — the archived
 * workbench's whole affordance set (可用动作仅 恢复/删除).
 */
export function ArchiveBanner(props: ArchiveBannerProps): ReactNode {
  const { t, projectName, onRestore, onRemove } = props
  return (
    <div
      data-dsh-forge-archive-banner=""
      style={bandStyle}
      title={projectName}
    >
      <span aria-hidden="true" style={warnGlyphStyle}>⚠</span>
      <span data-dsh-forge-archive-banner-title="" style={titleStyle}>
        {`${projectName} · ${t('project.banner.archived')}`}
      </span>
      <ChromeButton
        type="button"
        data-dsh-forge-archive-banner-restore=""
        style={bandGhostButtonStyle}
        onClick={onRestore}
      >
        {t('project.banner.restore')}
      </ChromeButton>
      <ChromeButton
        type="button"
        data-dsh-forge-archive-banner-remove=""
        style={bandGhostButtonStyle}
        onClick={onRemove}
      >
        {t('project.banner.remove')}
      </ChromeButton>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The dock host + installer
// ---------------------------------------------------------------------------

/** The installer's face — every leg guarded; an absent store = no banner. */
export interface ArchiveBannerFace {
  /** The locale seat. */
  readonly t: TreeTranslate
  /** The plugin-lifetime active-project store; absent (hostless) = inert. */
  readonly store?: ActiveProjectStore | undefined
}

/** The dock entry's composed props (the mirrored owner zone + the face). */
export type ArchiveBannerDockProps = MetadataDockZone & ArchiveBannerFace

/** The seat-level toast (the project-seat toast pattern; role=status 播报). */
const toastStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  left: '16px',
  maxWidth: '300px',
  padding: '10px 12px',
  position: 'fixed',
  zIndex: 1100,
} as const

const noopSubscribe = (): (() => void) => () => {}

/**
 * The dock entry host: DERIVED from the active-project store — the band
 * renders exactly while the ACTIVE project carries the archived flag (any
 * landing — verb, push, 换台 — re-derives; no reset seam). [恢复] rides the
 * verb directly; [删除] hosts the same 必答⑤ confirm the tree menu opens.
 */
export function ArchiveBannerDock(props: ArchiveBannerDockProps): ReactNode {
  const { t, store } = props
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const [pendingRemove, setPendingRemove] = useState<Project | null>(null)
  const [toast, setToast] = useState<string | undefined>(undefined)
  if (store === undefined) return null
  const projectId = snapshot.activeProjectId
  const project = projectId === null
    ? undefined
    : snapshot.projects.find(row => row.id === projectId)
  if (project === undefined || project.archived !== true) return null

  const deps: LifecycleActionDeps = { store, t, showToast: setToast }
  return (
    <>
      <ArchiveBanner
        t={t}
        projectName={project.displayName}
        onRestore={() => { restoreProjectNow(deps, project) }}
        onRemove={() => { setPendingRemove(project) }}
      />
      {pendingRemove !== null && (
        <RemoveProjectConfirmDialog
          t={t}
          project={pendingRemove}
          onConfirm={() => {
            const target = pendingRemove
            setPendingRemove(null)
            removeProjectNow(deps, target)
          }}
          onCancel={() => { setPendingRemove(null) }}
        />
      )}
      {toast !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-project-toast="" style={toastStyle}>
          {toast}
        </div>
      )}
    </>
  )
}

/** The dock entry id (the list slot's cell — distinct from todo/goal/metadata). */
export const ARCHIVE_BANNER_DOCK_ID = 'forge-archive-banner'

/** The dock entry order (todo=0 / goal=10 / metadata=20 precede; the band rides last). */
export const ARCHIVE_BANNER_DOCK_ORDER = 30

/**
 * Install the C2 banner's dock entry (the resolved fallback seat — see the
 * module doc): ONE list registration under {@link CONVERSATION_DOCK_SLOT},
 * disposed with the fiber. 声明合并纯增量 — no native occupant touched.
 * @param ctx - client root context.
 * @param face - the locale seat + the guarded store leg.
 * @returns disposer removing the registration.
 */
export function installArchiveBanner(ctx: ClientContext, face: ArchiveBannerFace): () => void {
  return ctx.slots.inject(CONVERSATION_DOCK_SLOT, () => {
    const dispose = ctx.slots.register({
      name: CONVERSATION_DOCK_SLOT,
      id: ARCHIVE_BANNER_DOCK_ID,
      order: ARCHIVE_BANNER_DOCK_ORDER,
      registrant: 'forge-workbench: archive banner',
      inject: (): ArchiveBannerFace => face,
    }, ArchiveBannerDock)
    return () => { dispose() }
  })
}
