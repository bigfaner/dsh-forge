/**
 * The UF1 项目概览页, BUILD half (task 5.3): the page inside the shell's
 * reserved `workbench/overview` mount seat (VIEW_MOUNT_TABLE). It owns the
 * four-state machine the tech-design test plan demands — loading (骨架占位 +
 * shimmer) / empty (注册引导卡) / error (load 失败重试卡 + 激活项目失联卡) /
 * populated (元信息行 + 项目卡 grid + 插件区块预留座) — over the Interface 1
 * DTOs through the OverviewFace seam: the build stage defaults to the shared
 * mock twin (mocks/workbench.createMockOverviewFace), 5.14 injects the IPC
 * verbs. No IPC runtime is touched here (the 5.x BUILD layering rule).
 *
 * Seams reserved for the later tasks (each fires and is observable today):
 *   onRegister — the register CTA (empty card button) → the 5.4 wizard; the
 *     same surface the chrome's addProject fires.
 *   onRepoint  — the active-project-lost error card's 重新指向 → the 5.4
 *     wizard in EDIT mode.
 *   the plugin-section seat — FILLED by 5.12, integrated by 5.13: the
 *     PluginSection 区块卡 below the project content (two-tier rows over its
 *     own PluginFace seam). Its visibility never depends on the project
 *     registration state (task 5.13: 无项目时仍可见 — 插件管理与项目无关),
 *     so it rides BOTH ready branches — below the grid when populated, below
 *     the empty 空态卡 when not — at a stable child slot, keeping its state
 *     across empty ⇄ populated transitions. The page's own loading/load-error
 *     branches stay page-level (5.14 owns the unified branch orchestration).
 *
 * Error mapping (tech-design Error Handling): a verb rejecting
 * ERR_PROJECT_NOT_FOUND (concurrent removal left a stale id behind) refreshes
 * the WorkbenchState and toasts — never an error wall; any other rejection
 * surfaces the generic action-failed toast. Remove follows the Hard Rule:
 * the card's 移除 only OPENS the double-step confirm; the verb fires solely
 * from the dialog's confirm.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MigrationStatus, Project, WorkbenchState, WorkbenchVerbError, WorkbenchEvent } from '../../ipc-types'
import type { MigrationFace, OverviewFace, PluginFace, PrefsFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { TOAST_Z } from '../tasks/launch/LaunchStates'
import { createMockFeatureBoardFace, createMockMigrationFace, createMockOverviewFace } from '../../mocks/workbench'
import { ProjectGrid } from './ProjectGrid'
import { PluginSection } from './PluginSection'
import { PreferenceSection, type PrefFeatureRef } from './prefs/PreferenceSection'
import { RemoveConfirm } from './RemoveConfirm'
import { MigrationDialogs } from './migration/MigrateProgressDialog'
import { middleEllipsis } from './format'

/** Narrow an unknown verb rejection to the serialized Interface 1 error code. */
export function verbErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code: unknown }).code === 'string') {
    return (error as WorkbenchVerbError).code
  }
  return undefined
}

/** Human text for a verb rejection (the serialized shape's message, or String). */
function describeVerbError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error
    && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

/** Fill a locale template's `{name}` / `{message}` slots. */
function fillTemplate(template: string, values: { name?: string; message?: string }): string {
  return template.replace('{name}', values.name ?? '').replace('{message}', values.message ?? '')
}

/** Inputs of {@link OverviewPage}. */
export interface OverviewPageProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The register CTA seam — the 5.4 wizard owns the dialog this fires. */
  onRegister?: (() => void) | undefined
  /** The repoint seam — the 5.4 wizard EDIT mode (the lost-project error card). */
  onRepoint?: ((project: Project) => void) | undefined
  /** Path re-validation failures: per-card 失联徽标 + the active-project error card. */
  lostProjectIds?: readonly string[] | undefined
  /**
   * External-mutation reload signal (5.14): the assembly bumps this when a
   * mutation OUTSIDE this page (the wizard's register/repoint, the chrome
   * switcher's activation) refreshed the registry — the page re-reads its
   * face. Absent/constant = the mount-once + own-verb load discipline.
   */
  reloadToken?: number | undefined
  /** The page face — absent members fall back to the build-stage mock (5.14 injects the IPC face). */
  face?: Partial<OverviewFace> | undefined
  /** The UF6 section face — absent members fall back to the section-local mock twin (5.14 injects the IPC face). */
  pluginFace?: Partial<PluginFace> | undefined
  /**
   * The UF3 migration family's face (task 1.7): PRESENT selects the card
   * migration surface (statuses → 可迁移 Pill/入口, MigrationDialogs mount);
   * absent keeps the M2 page verbatim (the build-stage default). The 1.7
   * assembly injects the IPC face; tests the 1.6 mock twin.
   */
  migrationFace?: Partial<MigrationFace> | undefined
  /**
   * The UF4 prefs family's face (task 5.2, Integration Spec #4): threads
   * into the in-page PreferenceSection (插件管理区之下). Absent members fall
   * back to the section-local mock twin — the build-stage default; the
   * OverviewView assembly injects the bridge-backed verbs.
   */
  prefsFace?: Partial<PrefsFace> | undefined
  /**
   * UF4 (task 5.2): the Feature tier's roster source — the ACTIVE project's
   * kernel feature list (featureList verb on the real chain; the mock board
   * twin in the build stage). Keyed on the active project id: a switch
   * rebinds the section's feature Menu, and the section re-reads its tier
   * scope through its own loading skeleton.
   */
  loadFeatures?: ((projectId: string) => Promise<readonly PrefFeatureRef[]>) | undefined
  /**
   * UF4 (task 5.2): the prefs_updated reflux channel (the shared
   * single-subscriber event source). Threads into the section, which filters
   * the pushed events against the current scope's resolution chain and
   * silently re-reads (生效值即时刷新, 免手动刷新).
   */
  subscribePrefsEvents?: ((listener: (events: readonly WorkbenchEvent[]) => void) => (() => void)) | undefined
}

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  minWidth: '0',
} as const

/** ui-design 元信息行: display name 16/24; paths 12/18 mono secondary. */
const metaNameStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const metaRowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '8px',
  margin: '0',
} as const

const metaLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const monoMetaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** Shared card face for the page's non-grid cards (empty / errors / seats). */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  padding: '14px',
} as const

const lostCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
} as const

/** 5.7 skill-dir sync alert card — error-tinted (the load-error precedent). */
const skillDirAlertCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const emptyCardStyle = {
  ...cardStyle,
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, CanvasText)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '48px 14px',
  textAlign: 'center',
} as const

const cardTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const cardBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: '420px',
} as const

/** md primary pill (the register CTA — same geometry as the chrome gate button). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** sm ghost pill (h28 r14) — the error cards' secondary actions. */
const ghostButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 10px',
} as const

const destructiveGhostStyle = {
  ...ghostButtonStyle,
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const actionRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  justifyContent: 'center',
} as const

/** Skeleton block: gray card ghost with the 0.3s shimmer loop (SMIL, like the launch spinner). */
const skeletonBlockStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '14px',
  height: '148px',
  overflow: 'hidden',
} as const

/** ui-design loading 态: 卡片灰块 + shimmer — laid out on the grid's own columns. */
function OverviewSkeleton(props: { label: string }) {
  return (
    <div
      role="status"
      aria-label={props.label}
      data-dsh-forge-overview-skeleton=""
      style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
    >
      {[0, 1, 2].map(index => (
        <div key={index} style={skeletonBlockStyle} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" focusable="false">
            <rect width="100" height="100" fill="currentColor" opacity="0.12">
              <animate attributeName="opacity" values="0.12;0.3;0.12" dur="0.3s" repeatCount="indefinite" />
            </rect>
          </svg>
        </div>
      ))}
    </div>
  )
}

/** The page toast (z1100, role=status per ui-design 全局规则; explicit dismiss only). */
const toastCardStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '10px',
  maxWidth: '360px',
  padding: '12px 14px',
  position: 'fixed',
  right: '16px',
  zIndex: TOAST_Z,
} as const

/**
 * The overview page. Renders nothing but the skeleton until the first
 * loadState settles; every mutation re-reads the state through the same
 * load (getState semantics — the mock twin and the IPC verb agree here).
 */
export function OverviewPage(props: OverviewPageProps) {
  // Build-stage default face: one isolated mock twin per mount (the 5.14
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockOverviewFace())
  const face: OverviewFace = { ...defaultFace, ...props.face }
  // UF3 (task 1.7): the migration face spreads the same way, but the card
  // surface ACTIVATES only when the seat provided one (absent = the M2 page
  // verbatim — the pill/entry/dialog never appear in the build stage).
  const [defaultMigrationFace] = useState(() => createMockMigrationFace().face)
  // Identity-stable for given props (the statuses effect keys its loads on
  // the face — a fresh spread per render would loop the effect forever).
  const migrationFace: MigrationFace = useMemo(
    () => ({ ...defaultMigrationFace, ...props.migrationFace }),
    [defaultMigrationFace, props.migrationFace],
  )
  const migrationEnabled = props.migrationFace !== undefined
  const lostProjectIds = props.lostProjectIds ?? []

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [state, setState] = useState<WorkbenchState | undefined>(undefined)
  const [toastText, setToastText] = useState<string | undefined>(undefined)
  const [removing, setRemoving] = useState<Project | undefined>(undefined)
  // UF3 (task 1.7): the card-surface state — per-project migration statuses,
  // the migrating row (MigrationDialogs' open), the confirm copy's backup
  // root, and a settle nonce (a finished run re-reads the statuses so the
  // Pill/entry retire without a remount). All inert while migrationFace is
  // absent (the M2 build-stage page).
  const [migrationStatuses, setMigrationStatuses] = useState<ReadonlyMap<string, MigrationStatus>>(new Map())
  const [migrating, setMigrating] = useState<Project | undefined>(undefined)
  const [backupsRoot, setBackupsRoot] = useState<string>('')
  const [migrationNonce, setMigrationNonce] = useState(0)
  const hasLoaded = useRef(false)

  const load = async (): Promise<WorkbenchState | undefined> => {
    try {
      const next = await face.loadState()
      hasLoaded.current = true
      setState(next)
      setPhase('ready')
      return next
    } catch {
      // A failed FIRST load has nothing to render — the retry card. A failed
      // refresh keeps the last good state; the next verb refresh retries.
      if (!hasLoaded.current) setPhase('load-error')
      return undefined
    }
  }

  // Mount-once initial load, re-fired on the assembly's external-mutation
  // token (5.14: the wizard/chrome refreshed the registry behind the page).
  // The token identity is fixed for the page's life, like the 5.10 probe effect.
  useEffect(() => {
    void load()
  }, [props.reloadToken])

  // UF3 (task 1.7): the per-project migration statuses — read on every
  // registry refresh AND every settle nonce bump (a finished run flips
  // authority → the Pill/entry retire). A failed per-project read leaves
  // that card without the surface (never an error wall); the whole pass is
  // skipped while migrationFace is absent (the M2 page).
  useEffect(() => {
    if (!migrationEnabled || state === undefined) return
    let alive = true
    void Promise.all(state.projects.map(project =>
      migrationFace.getMigrationStatus(project.id)
        .then(status => [project.id, status] as const)
        .catch(() => undefined),
    )).then((rows) => {
      if (!alive) return
      setMigrationStatuses(new Map(rows.filter((row): row is readonly [string, MigrationStatus] => row !== undefined)))
    })
    return () => { alive = false }
  }, [state, migrationNonce, migrationFace])

  // UF3 (task 1.7): the confirm copy's 备份位置 root (one read; the run's own
  // backup path lands inline in the verify row once the run starts).
  useEffect(() => {
    if (!migrationEnabled) return
    let alive = true
    migrationFace.getWorkbenchPaths().then((paths) => {
      if (alive) setBackupsRoot(paths.backupsRoot)
    }).catch(() => {})
    return () => { alive = false }
  }, [migrationFace])

  /**
   * Run one Interface 1 verb with the page's error mapping:
   * ERR_PROJECT_NOT_FOUND → refresh + toast (tech-design), anything else →
   * the generic action-failed toast. Resolves whether the verb succeeded.
   */
  const runVerb = async (verb: () => Promise<unknown>): Promise<boolean> => {
    try {
      await verb()
      return true
    } catch (error) {
      if (verbErrorCode(error) === 'ERR_PROJECT_NOT_FOUND') {
        await load()
        setToastText(props.t('overview.toast.refreshed'))
      } else {
        setToastText(fillTemplate(props.t('overview.toast.failed'), { message: describeVerbError(error) }))
      }
      return false
    }
  }

  const activate = (id: string): void => {
    if (state?.activeProjectId === id) return
    void runVerb(() => face.activateProject(id)).then((ok) => {
      if (ok) void load()
    })
  }

  const rename = async (id: string, displayName: string): Promise<boolean> => {
    const ok = await runVerb(() => face.updateProject(id, { displayName }))
    if (ok) await load()
    return ok
  }

  /** UF3 (task 1.7): the card 「迁移」 entry's click — opens the dialog family (the single door). */
  const openMigration = (project: Project): void => {
    setMigrating(project)
  }

  const cancelRemove = (): void => {
    const project = removing
    setRemoving(undefined)
    // Focus return: back to the card's 移除 trigger (the dialog contract).
    if (project !== undefined) {
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-dsh-forge-project-card="${project.id}"] [data-dsh-forge-card-action="remove"]`,
      )
      trigger?.focus()
    }
  }

  const confirmRemove = (): void => {
    const project = removing
    if (project === undefined) return
    const previousActive = state?.activeProjectId ?? null
    setRemoving(undefined)
    void runVerb(() => face.removeProject(project.id)).then(async (ok) => {
      if (!ok) return
      const next = await load()
      // Single-activation migration notice: the removed project held the
      // pointer and the registry still has rows → the transaction (mock twin
      // alike) auto-activated the first remaining; surface it (ui-design).
      if (project.id === previousActive
        && next !== undefined && next.activeProjectId !== null && next.activeProjectId !== project.id) {
        const activated = next.projects.find(row => row.id === next.activeProjectId)
        if (activated !== undefined) {
          setToastText(fillTemplate(props.t('overview.toast.activated'), { name: activated.displayName }))
        }
      }
    })
  }

  const activeProject = state?.projects.find(project => project.id === state.activeProjectId)

  // UF4 (task 5.2): the section's feature roster — loaded per ACTIVE project
  // (feature 选择器数据源 = feature 列表,内核). The stale roster never leaks
  // into the next project's Feature Menu (cleared synchronously on the id
  // change); a failed read degrades to a disabled Feature tier — never an
  // error wall. The section's own scope loads handle the loading 骨架.
  const [features, setFeatures] = useState<readonly PrefFeatureRef[]>([])
  const [buildStageFeatureSource] = useState(() => createMockFeatureBoardFace())
  const loadFeatures = useMemo(
    () => props.loadFeatures ?? (async (projectId: string): Promise<readonly PrefFeatureRef[]> => {
      const board = await buildStageFeatureSource.loadFeatureBoard(projectId)
      return board.features.map(feature => ({ slug: feature.slug }))
    }),
    [props.loadFeatures, buildStageFeatureSource],
  )
  const activeProjectId = activeProject?.id ?? null
  useEffect(() => {
    if (activeProjectId === null) {
      setFeatures(prev => (prev.length === 0 ? prev : []))
      return
    }
    let alive = true
    setFeatures([])
    void loadFeatures(activeProjectId)
      .then((next) => { if (alive) setFeatures(next) })
      .catch(() => { if (alive) setFeatures([]) })
    return () => { alive = false }
  }, [activeProjectId, loadFeatures])

  const populated = phase === 'ready' && state !== undefined && state.projects.length > 0
  const skillDirAlerts = state?.skillDirSyncAlerts

  return (
    <div data-dsh-forge-overview="" aria-busy={phase === 'loading' ? 'true' : 'false'} style={pageStyle}>
      {phase === 'loading' && <OverviewSkeleton label={props.t('overview.loading')} />}

      {/* 5.7:customSkillDirs boot 同步失败告警(ERR_SKILL_DIR_SYNC;设置面
          呈现面 = 概览页置顶告警卡 —— Hard Rule「失败显式告警不静默」的
          renderer 半面;载荷随 getState 走,零新增动词/通道)。 */}
      {phase === 'ready' && skillDirAlerts !== undefined && skillDirAlerts.length > 0 && (
        <section
          data-dsh-forge-skill-dir-alerts=""
          role="alert"
          aria-label={props.t('overview.skillDirs.alertTitle')}
          style={skillDirAlertCardStyle}
        >
          <h3 style={cardTitleStyle}>{props.t('overview.skillDirs.alertTitle')}</h3>
          {skillDirAlerts.map(alert => (
            <p
              key={`${alert.plugin}:${alert.message}`}
              data-dsh-forge-skill-dir-alert={alert.plugin}
              style={cardBodyStyle}
            >
              {fillTemplate(props.t('overview.skillDirs.alertEntry'), { name: alert.plugin, message: alert.message })}
            </p>
          ))}
        </section>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-overview-load-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('overview.loadError.title')}</h3>
          <div style={{ ...actionRowStyle, justifyContent: 'flex-start' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-overview-retry=""
              style={primaryButtonStyle}
              onClick={() => {
                setPhase('loading')
                void load()
              }}
            >
              {props.t('overview.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && state !== undefined && state.projects.length === 0 && (
        <div data-dsh-forge-overview-empty="" style={emptyCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('overview.empty.title')}</h3>
          <p style={cardBodyStyle}>{props.t('overview.empty.body')}</p>
          <ChromeButton
            type="button"
            data-dsh-forge-overview-register=""
            style={primaryButtonStyle}
            onClick={() => { props.onRegister?.() }}
          >
            {props.t('overview.empty.register')}
          </ChromeButton>
        </div>
      )}

      {populated && state !== undefined && (
        <>
          {activeProject !== undefined && (
            <section data-dsh-forge-overview-meta="" aria-label={activeProject.displayName} style={cardStyle}>
              <h3 style={metaNameStyle}>{activeProject.displayName}</h3>
              <p style={metaRowStyle}>
                <span style={metaLabelStyle}>{props.t('overview.meta.codeRoot')}</span>
                <span title={activeProject.codeRoot} style={monoMetaStyle}>
                  {middleEllipsis(activeProject.codeRoot)}
                </span>
              </p>
              <p style={metaRowStyle}>
                <span style={metaLabelStyle}>{props.t('overview.meta.docLocation')}</span>
                <span style={monoMetaStyle}>
                  {props.t(activeProject.docLocationType === 'in_repo' ? 'overview.doc.inRepo' : 'overview.doc.external')}
                  {activeProject.docLocationPath !== null && (
                    <span title={activeProject.docLocationPath}>
                      {` · ${middleEllipsis(activeProject.docLocationPath)}`}
                    </span>
                  )}
                </span>
              </p>
            </section>
          )}

          {activeProject !== undefined && lostProjectIds.includes(activeProject.id) && (
            <section data-dsh-forge-overview-lost="" role="alert" style={lostCardStyle}>
              <h3 style={cardTitleStyle}>{props.t('overview.lost.title')}</h3>
              <p style={cardBodyStyle}>{props.t('overview.lost.body')}</p>
              <div style={actionRowStyle}>
                <ChromeButton
                  type="button"
                  data-dsh-forge-overview-repoint=""
                  style={ghostButtonStyle}
                  onClick={() => { props.onRepoint?.(activeProject) }}
                >
                  {props.t('overview.lost.repoint')}
                </ChromeButton>
                <ChromeButton
                  type="button"
                  data-dsh-forge-overview-lost-remove=""
                  style={destructiveGhostStyle}
                  onClick={() => { setRemoving(activeProject) }}
                >
                  {props.t('overview.lost.remove')}
                </ChromeButton>
              </div>
            </section>
          )}

          <ProjectGrid
            t={props.t}
            projects={state.projects}
            activeProjectId={state.activeProjectId}
            lostProjectIds={lostProjectIds}
            onActivate={activate}
            onRename={rename}
            onRemove={(project) => { setRemoving(project) }}
            {...(migrationEnabled
              ? {
                migrationOf: (project: Project) => {
                  const status = migrationStatuses.get(project.id)
                  if (status === undefined) return undefined
                  if (status.authority === 'sqlite') {
                    return { status: 'migrated' as const, face: migrationFace, onMigrate: openMigration }
                  }
                  // 可迁移 = files authority + the doc tree still carries index.json
                  // (ui-design migratable 判定; a bare-files project without a task
                  // corpus never shows the entry).
                  if (status.indexJsonDetected) {
                    return { status: 'migratable' as const, face: migrationFace, onMigrate: openMigration }
                  }
                  return undefined
                },
              }
              : {})}
          />
        </>
      )}

      {/* The UF6 seat (5.12 fills it · 5.13 integrates it): the two-tier
          插件区块卡 below the project content — its own PluginFace seam (mock
          twin by default, 5.14 injects the IPC verbs). Rendered in EVERY ready
          branch (populated grid AND empty 空态卡 alike): plugin management is
          unrelated to project registration, so the section never hides with
          the empty state; the stable child slot keeps its state across the
          empty ⇄ populated transitions (no re-list when the project roster
          changes). */}
      {phase === 'ready' && state !== undefined && (
        <PluginSection t={props.t} face={props.pluginFace} />
      )}

      {/* The UF4 seat (task 5.2, Integration Spec #4): the 偏好区块卡 BELOW
          the plugin section (插件管理区之下) at its own stable child slot —
          same ready-branch discipline as the plugin section, so the section's
          tier/accordion state survives the empty ⇄ populated transitions.
          The global tier is project-independent, so the section renders in
          EVERY ready branch (无激活项目 = 仅「全局」可用, the section's own
          disabled-tier contract); the active-project binding drives the
          项目/Feature tiers, the roster effect above feeds the Menu, and the
          reflux seam re-reads on prefs_updated. */}
      {phase === 'ready' && state !== undefined && (
        <PreferenceSection
          t={props.t}
          activeProject={activeProject === undefined
            ? undefined
            : { id: activeProject.id, displayName: activeProject.displayName }}
          features={features}
          face={props.prefsFace}
          subscribeEvents={props.subscribePrefsEvents}
        />
      )}

      {removing !== undefined && (
        <RemoveConfirm
          t={props.t}
          project={removing}
          onConfirm={confirmRemove}
          onCancel={cancelRemove}
        />
      )}

      {/* UF3 (task 1.7): the explicit-migration dialog family — the card
          entry's ONLY door (confirm → progress/results, the 1.6 state
          machine). A settled run re-reads the registry AND the statuses, so
          the 可迁移 Pill + entry retire the moment the run completes. */}
      {migrationEnabled && migrating !== undefined && (
        <MigrationDialogs
          t={props.t}
          projectId={migrating.id}
          face={migrationFace}
          backupPath={backupsRoot}
          open={true}
          onSettled={() => {
            setMigrationNonce(nonce => nonce + 1)
            void load()
          }}
          onClose={() => {
            setMigrating(undefined)
            setMigrationNonce(nonce => nonce + 1)
            void load()
          }}
        />
      )}

      {toastText !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-overview-toast="" style={toastCardStyle}>
          <p style={{ ...cardBodyStyle, maxWidth: 'none', margin: '0' }}>{toastText}</p>
          <ChromeButton
            type="button"
            aria-label={props.t('overview.toast.dismiss')}
            data-dsh-forge-overview-toast-dismiss=""
            style={{ ...ghostButtonStyle, height: '24px', padding: '0 8px' }}
            onClick={() => { setToastText(undefined) }}
          >
            <span aria-hidden="true">✕</span>
          </ChromeButton>
        </div>
      )}
    </div>
  )
}
