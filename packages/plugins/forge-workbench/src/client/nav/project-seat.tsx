/**
 * The `sidebar.workspaces` seat (M4 task 1.6; tech-design §Integration #1 +
 * page-map 项目工作台 left column): the forge ProjectTreeBrowser REPLACES the
 * native workspace browser's rendering in the sidebar's browsing region
 * (single-slot shadowing at a negative priority — the native entry stays
 * registered as the crash/teardown fallback; 上游槽位机制零修改).
 *
 * Data face (只读消费, tech-design §Dependencies): upstream
 * `ctx.workspaces` / `ctx.sessions` snapshots (adapted onto the 1.4
 * tree-derive input shapes — workspace pairing by canonical path against the
 * registry rows, archived sessions dropped, subagent lineage preserved via
 * parentId/origin) + the project registry/pointer over the Interface 1 verbs
 * (store/active-project.ts). All upstream faces arrive as OPTIONAL
 * duck-typed sources (the session-handover guarded-read discipline — this
 * plugin's package face carries none of the api-* types): absent services
 * render an inert seat, never a throw.
 *
 * The seat also owns the P1 integration's action seams:
 *   - 原位换台 #28 (project row click): same project = zero action; different
 *     project = pointer write + ONE 0.22s enter transition (opacity 0.3 +
 *     translateY 4px; prefers-reduced-motion degrades to none) + 换台重置
 *     (激活会话清空回 hero + 输入稿清空 = the native New-Session flow over
 *     the new project's workspace; 右栏回默认(收起) = collapse-if-expanded;
 *     the 开始页/归档横幅 legs ride the P2 rightbar-tabs + C2 banner seats).
 *   - C7 唯一入口: the 区头/rail ＋ and the 空态引导 open the ONE in-place
 *     ConfirmCard instance (不跳页); register success lands 原位生效 (树刷新 +
 *     活跃指针切换 + 落位 toast).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { GlobalStandardProps, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFolderClose16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { WORKSPACES_SLOT } from '../contract'
import type { ActiveProjectStore, ActiveProjectSnapshot } from '../store/active-project'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../store/active-project'
import type { ConfirmCardFace } from '../components/confirm-card/card-state'
import type { SessionRowCommand, TreeTranslate } from '../components/project-tree/SessionRow'
import { ProjectTreeBrowser } from '../components/project-tree/ProjectTreeBrowser'
import type { ProjectRowCommand } from '../components/project-tree/ProjectRow'
import type { TreeSession, TreeWorkspace } from '../components/project-tree/tree-derive'
import { ConfirmCard } from '../components/confirm-card/ConfirmCard'
import {
  ArchiveConfirmDialog, RemoveProjectConfirmDialog,
} from '../components/confirm-dialog/ArchiveDeleteDialogs'
import {
  archiveProjectNow, commitProjectRename, removeProjectNow, restoreProjectNow,
  type LifecycleActionDeps,
} from '../lifecycle-actions'
import type { Project } from '../ipc-types'
import type { DetachedWindowRegistryFace } from '../window-role/recall'
import { fillTemplate } from '../views/overview/format'
import type { RightbarTabsFace } from '../views/rightbar/tabs-model'
import { resetRightbarToDefault, toRightbarTabsFace } from '../views/rightbar/tabs-model'

// ---------------------------------------------------------------------------
// Duck-typed upstream faces (guarded reads; no api-* package imports)
// ---------------------------------------------------------------------------

/** The upstream workspace snapshot this seat consumes (read-only). */
export interface WorkspacesListSource {
  getSnapshot(): {
    readonly items: ReadonlyArray<{
      readonly workspaceId: string
      readonly path: string
      readonly title: string
      readonly sessionIds: readonly string[]
    }>
    readonly archivedSessionIds: readonly string[]
  }
  subscribe(listener: () => void): () => void
}

/** One upstream session summary row (the fields the tree derivation reads). */
export interface SessionSummaryLike {
  readonly id: string
  readonly title?: string | undefined
  readonly displayTitle: string
  readonly cwd?: string | undefined
  readonly parentId?: string | undefined
  readonly origin?: 'subagent' | undefined
  readonly running: boolean
  readonly blank: boolean
  readonly updatedAt: number
}

/** The upstream session-list snapshot this seat consumes (read-only). */
export interface SessionsListSource {
  getSnapshot(): {
    readonly ids: readonly string[]
    readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
  }
  subscribe(listener: () => void): () => void
}

/** A per-session reference-count source (the active-session derivation). */
export interface RetainInfoSource {
  getSnapshot(): { readonly retainedBy: Readonly<Partial<Record<string, number>>> }
  subscribe(listener: () => void): () => void
}

/** The sessions service face extended with the retainInfo probe (optional). */
export type SessionsFace = SessionsListSource & {
  retainInfo?(sessionId: string): RetainInfoSource
}

/** The uiWorkspace actions the seat drives (the navigation subset). */
export interface UiWorkspaceFace {
  startSession(workspaceId?: string): void
  openSession(sessionId: string): void
  forkSession(sessionId: string): void | Promise<void>
  archiveSession(sessionId: string): void | Promise<void>
}

/**
 * The rightbar controller face (the 换台重置's 右栏回默认 leg, M4 2.2): the
 * tabs-model subset — `resetRightbarToDefault` closes every closable tab and
 * collapses the column (收起 + 开始页: the next expansion seeds the door page
 * natively), superseding 1.6's bare collapse-if-expanded toggle.
 */
export type SidebarRightFace = RightbarTabsFace

// ---------------------------------------------------------------------------
// Guarded service adapters (the session-handover discipline: narrow the
// unknown service candidate onto the face THIS seat consumes — base-tier
// plugins precede app-tier apply in a healthy boot; an absent service leaves
// the matching leg degraded, never a throw)
// ---------------------------------------------------------------------------

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: unknown): candidate is (...args: never[]) => unknown =>
  typeof candidate === 'function'

/**
 * Narrow the `ctx.workspaces` service onto the read-only snapshot source.
 *
 * M4 2.9 correction: the upstream service nests its store (`workspaces.list`),
 * while this seat's face is flat — the 1.6 narrowing CAST the nested service
 * onto the flat type, leaving the seat's data legs reading absent members
 * (the tree rendered project rows over EMPTY workspace/session snapshots on
 * the real chain; the unit tests fed flat fakes, so the gap never surfaced).
 * The narrowing now BRIDGES: the returned adapter projects `list` onto the
 * flat face, so the SC7 归拢 assertions read the REAL upstream snapshots.
 */
export function toWorkspacesSource(candidate: unknown): WorkspacesListSource | undefined {
  if (!isObject(candidate) || !isObject(candidate.list)) return undefined
  const list = candidate.list
  if (!isFunction(list.getSnapshot) || !isFunction(list.subscribe)) return undefined
  const nested = list as unknown as {
    getSnapshot(): ReturnType<WorkspacesListSource['getSnapshot']>
    subscribe(listener: () => void): () => void
  }
  return {
    getSnapshot: () => nested.getSnapshot(),
    subscribe: listener => nested.subscribe(listener),
  }
}

/**
 * Narrow the `ctx.sessions` service onto the list source (+ retainInfo probe)
 * — the same 2.9 bridging correction as {@link toWorkspacesSource}: the flat
 * face over the service's nested `sessions.list` store, `retainInfo` carried
 * through unchanged.
 */
export function toSessionsFace(candidate: unknown): SessionsFace | undefined {
  if (!isObject(candidate) || !isObject(candidate.list)) return undefined
  const list = candidate.list
  if (!isFunction(list.getSnapshot) || !isFunction(list.subscribe)) return undefined
  if (candidate.retainInfo !== undefined && !isFunction(candidate.retainInfo)) return undefined
  const nested = list as unknown as {
    getSnapshot(): ReturnType<SessionsListSource['getSnapshot']>
    subscribe(listener: () => void): () => void
  }
  const bridged: SessionsFace = {
    getSnapshot: () => nested.getSnapshot(),
    subscribe: listener => nested.subscribe(listener),
  }
  if (isFunction(candidate.retainInfo)) {
    // Call THROUGH the service candidate (the traceable proxy): extracting
    // the raw function would detach it from its `this` — the vendored
    // service's retainInfo reads private fields (`retainObservers`) and
    // crashes unbound (the SC7 corpus leg's seat-abdicate root cause).
    const service = candidate as unknown as { retainInfo(sessionId: string): RetainInfoSource }
    bridged.retainInfo = (sessionId: string) => service.retainInfo(sessionId)
  }
  return bridged
}

/** Narrow the `ctx.uiWorkspace` service onto the navigation subset. */
export function toUiWorkspaceFace(candidate: unknown): UiWorkspaceFace | undefined {
  if (!isObject(candidate)) return undefined
  const required = ['startSession', 'openSession', 'forkSession', 'archiveSession'] as const
  if (!required.every(member => isFunction(candidate[member]))) return undefined
  return candidate as unknown as UiWorkspaceFace
}

/**
 * Narrow the `ctx.sidebarRight` service onto the tabs-model face (M4 2.2:
 * the 换台重置 close/collapse subset + the inventory reads — the same guard
 * `toRightbarTabsFace` applies; aliased for the seat's historical name).
 */
export const toSidebarRightFace = toRightbarTabsFace

/** The seat's injected face (the registration's inject factory product). */
export interface ProjectSeatFace {
  /** The shared translate seat (the plugin's dictionary). */
  readonly t: TreeTranslate
  /** The active-project pointer store; absent (hostless) = an inert seat. */
  readonly store?: ActiveProjectStore | undefined
  /** The C7 card's verb face (IPC-backed on the real path); absent = the ＋ stays inert. */
  readonly cardFace?: ConfirmCardFace | undefined
  /** Upstream workspace snapshot source; absent = no workspace rows. */
  readonly workspaces?: WorkspacesListSource | undefined
  /** Upstream session-list source; absent = no session rows. */
  readonly sessions?: SessionsFace | undefined
  /** Upstream navigation actions; absent = row clicks degrade silently. */
  readonly uiWorkspace?: UiWorkspaceFace | undefined
  /** Rightbar collapse face; absent = the 右栏回默认 leg is a no-op. */
  readonly sidebarRight?: SidebarRightFace | undefined
  /**
   * The detached-window registry face (M4 4.3, AC4): the delete flow marks
   * the project BEFORE the verb (its closing windows never restore panes)
   * and counts its live windows for the「全部拆出窗口已关闭」toast.
   * Absent (hostless) = the delete flow keeps its 3.5 shape.
   */
  readonly detachedWindows?: DetachedWindowRegistryFace | undefined
}

/** Composed props of the `sidebar.workspaces` seat (the WorkbenchShell pattern). */
export type ProjectSidebarSeatProps =
  & Omit<PropsRuntime<typeof WORKSPACES_SLOT>, keyof GlobalStandardProps | 'expandSidebar'>
  & { expandSidebar?: (() => void) | undefined }
  & ProjectSeatFace

// ---------------------------------------------------------------------------
// 原位换台 #28 — the one-shot enter transition (0.22s, opacity .3 + 4px up)
// ---------------------------------------------------------------------------

/** The transition's spec constants (workbench-layout-v2 §8.1 裁决 #28 ③). */
export const PROJECT_SWITCH_TRANSITION_MS = 220
export const PROJECT_SWITCH_CLASS = 'dsh-forge-project-switch-in'

const SWITCH_KEYFRAMES = '@keyframes dsh-forge-project-switch-in'
  + '{from{opacity:.3;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}'
  + `.${PROJECT_SWITCH_CLASS}`
  + `{animation:dsh-forge-project-switch-in ${PROJECT_SWITCH_TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1)}`

/** Inject the transition's keyframes once per document (scoped style tag). */
function ensureSwitchStyle(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-dsh-forge-project-switch]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-dsh-forge-project-switch', '')
  style.textContent = SWITCH_KEYFRAMES
  document.head.append(style)
}

const readReducedMotion = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** prefers-reduced-motion (live); absent matchMedia (jsdom) reads false. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => { setReduced(query.matches) }
    query.addEventListener('change', onChange)
    return () => { query.removeEventListener('change', onChange) }
  }, [])
  return reduced
}

// ---------------------------------------------------------------------------
// The active-session derivation (retainInfo mainView scan)
// ---------------------------------------------------------------------------

const EMPTY_SESSION_SNAPSHOT: ReturnType<SessionsListSource['getSnapshot']> = Object.freeze({
  ids: Object.freeze([]) as readonly string[],
  byId: Object.freeze({}) as Readonly<Record<string, SessionSummaryLike | undefined>>,
})
const EMPTY_WORKSPACES_SNAPSHOT: ReturnType<WorkspacesListSource['getSnapshot']> = Object.freeze({
  items: Object.freeze([]),
  archivedSessionIds: Object.freeze([]) as readonly string[],
})
const noopSubscribe = (): (() => void) => () => {}

/**
 * The main view's current session: the one id whose retainInfo carries a
 * `mainView` reference (ui-workspace retains the main selection under that
 * source). Subscribes per tracked id so an openSession without a list change
 * still moves the highlight; the scan re-runs on every list/retain tick.
 */
function useActiveSessionId(sessions: SessionsFace | undefined, ids: readonly string[]): string | null {
  const [tick, setTick] = useState(0)
  const idsKey = ids.join('\n')
  useEffect(() => {
    const retainInfo = sessions?.retainInfo
    if (retainInfo === undefined) return
    const unsubscribes = ids.map(id => retainInfo(id).subscribe(() => { setTick(value => value + 1) }))
    return () => { for (const unsubscribe of unsubscribes) unsubscribe() }
    // idsKey carries the id-set identity (the array itself is snapshot-derived).
  }, [sessions, idsKey])
  return useMemo(() => {
    void tick
    const retainInfo = sessions?.retainInfo
    if (retainInfo === undefined) return null
    for (const id of ids) {
      const retainedBy = retainInfo(id).getSnapshot().retainedBy
      if ((retainedBy.mainView ?? 0) > 0) return id
    }
    return null
    // ids identity + the retain tick drive the scan.
  }, [sessions, ids, tick])
}

// ---------------------------------------------------------------------------
// Styles (inline chrome discipline: no stylesheet pipeline, host vars theme)
// ---------------------------------------------------------------------------

const seatStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
} as const

const emptyGuideStyle = {
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, currentColor)',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  justifyContent: 'center',
  margin: '12px 8px',
  minHeight: '140px',
  padding: '16px 12px',
  textAlign: 'center',
} as const

const emptyTitleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
} as const

const emptyBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  maxWidth: '220px',
} as const

const emptyButtonStyle = {
  background: 'var(--dsw-alias-brand-primary, ButtonText)',
  border: 'none',
  borderRadius: '14px',
  color: 'var(--dsw-alias-bg-base, ButtonFace)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '13px',
  height: '28px',
  padding: '0 14px',
} as const

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

// ---------------------------------------------------------------------------
// The seat component
// ---------------------------------------------------------------------------

/**
 * The panellist「项目」row's glyph (nav/panel-info.ts owns the row's address
 * model; the sidebar shell owns the button/label/selected state around it —
 * the WorkbenchPanelIcon ownership split).
 * @param props - the sidebar's icon share: the requested edge + selected flag.
 * @returns the folder glyph at the requested size.
 */
export function ProjectPanelGlyph({ size }: { size?: number; active?: boolean }): ReactNode {
  return <IconFolderClose16 size={size} />
}

/**
 * The project-tree sidebar seat — the 1.4 browser mounted over the 1.6 data
 * faces, plus the C7 card host and the 原位换台 seams (the module doc).
 * @param props - the shell's owner share (wide/expandSidebar) + the face.
 * @returns the seat element tree (full browser, or the 56px rail).
 */
export function ProjectSidebarSeat(props: ProjectSidebarSeatProps): ReactNode {
  const { t, store } = props
  const storeSnapshot: ActiveProjectSnapshot = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const workspacesSnapshot = useSyncExternalStore(
    props.workspaces?.subscribe ?? noopSubscribe,
    props.workspaces?.getSnapshot ?? (() => EMPTY_WORKSPACES_SNAPSHOT),
  )
  const sessionsSnapshot = useSyncExternalStore(
    props.sessions?.subscribe ?? noopSubscribe,
    props.sessions?.getSnapshot ?? (() => EMPTY_SESSION_SNAPSHOT),
  )
  const reducedMotion = usePrefersReducedMotion()

  // ———— the tree data face (upstream snapshots → 1.4 derivation inputs) ————

  const treeWorkspaces: readonly TreeWorkspace[] = useMemo(
    () => workspacesSnapshot.items.map(({ workspaceId, path, title }) => ({ workspaceId, path, title })),
    [workspacesSnapshot],
  )
  const sessionIds = useMemo(() => sessionsSnapshot.ids, [sessionsSnapshot])
  const treeSessions: readonly TreeSession[] = useMemo(() => {
    const workspaceIdBySession = new Map<string, string>()
    for (const workspace of workspacesSnapshot.items) {
      for (const sessionId of workspace.sessionIds) workspaceIdBySession.set(sessionId, workspace.workspaceId)
    }
    const archived = new Set(workspacesSnapshot.archivedSessionIds)
    const rows: TreeSession[] = []
    for (const id of sessionsSnapshot.ids) {
      const summary = sessionsSnapshot.byId[id]
      if (summary === undefined || archived.has(id)) continue // 已归档会话行消失
      rows.push({
        sessionId: id,
        workspaceId: workspaceIdBySession.get(id) ?? null,
        title: summary.title ?? summary.displayTitle,
        updatedAt: new Date(summary.updatedAt).toISOString(),
        origin: summary.origin === 'subagent' ? 'subagent' : 'top',
        parentSessionId: summary.parentId ?? null,
        running: summary.running === true,
        // 待输入 rides the P2 lineage/question join — no upstream summary
        // signal carries it yet, so the dot ladder starts at 运行中.
        awaitingInput: false,
        blank: summary.blank === true,
      })
    }
    return rows
  }, [sessionsSnapshot, workspacesSnapshot])
  const activeSessionId = useActiveSessionId(props.sessions, sessionIds)

  // ———— C7 唯一入口:the one card instance behind every entry seat ————

  const [cardOpen, setCardOpen] = useState(false)
  const openCard = (): void => {
    if (props.cardFace === undefined) return // inert ＋ on the hostless path (no silent mock)
    setCardOpen(true)
  }

  // ———— 原位换台 #28 + 换台重置 ————

  const [switchPulse, setSwitchPulse] = useState(0)
  /** The project's workspace id (canonical-path pairing; P3 projection guarantees it later). */
  const workspaceIdOfProject = (projectId: string): string | undefined => {
    const project = storeSnapshot.projects.find(row => row.id === projectId)
    if (project === undefined) return undefined
    const folded = (path: string): string => path.trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
    const hit = workspacesSnapshot.items.find(workspace => folded(workspace.path) === folded(project.codeRoot))
    return hit?.workspaceId
  }
  /**
   * 换台重置 (裁决 #28 ④): the native New-Session flow over the new project's
   * workspace clears the active session to hero + the input draft (blank
   * draft 单例, native semantics); the rightbar returns to its DEFAULT —
   * 收起 + 开始页 — through the 2.2 tabs model (`resetRightbarToDefault`:
   * close every closable tab, collapse what stays expanded; the next
   * expansion seeds the 开始页 natively). The 归档横幅 leg mounts with the
   * C2 banner.
   */
  const resetWorkbenchContext = (projectId: string): void => {
    props.uiWorkspace?.startSession(workspaceIdOfProject(projectId))
    resetRightbarToDefault(props.sidebarRight)
  }
  const switchProjectInPlace = (projectId: string): void => {
    if (store === undefined) return
    if (projectId === storeSnapshot.activeProjectId) return // 同项目反复点击 = 零动作零动画
    if (!store.switchProject(projectId).changed) return
    if (!reducedMotion) {
      ensureSwitchStyle()
      setSwitchPulse(pulse => pulse + 1) // 异项目切换才播一次性 0.22s 过渡
    }
    resetWorkbenchContext(projectId)
  }

  // ———— register done:原位生效(树刷新 + 活跃指针切换 + 落位 toast)———

  const [toast, setToast] = useState<string | undefined>(undefined)
  const closeCard = (): void => { setCardOpen(false) }
  const onCardDone = (result: { project: Project; modeLabel: string }): void => {
    setCardOpen(false)
    void store?.activateRegistered(result.project.id)
    setToast(fillTemplate(t('project.toast.registered'), { name: result.project.displayName }))
  }
  const onLocateRegistered = (hit: { projectId: string; displayName: string }): void => {
    // 已注册快车道:toast「已注册 · 打开」+ 原位换台到该项目的树位。
    setCardOpen(false)
    if (store !== undefined && hit.projectId !== storeSnapshot.activeProjectId) store.switchProject(hit.projectId)
    setToast(fillTemplate(t('project.toast.located'), { name: hit.displayName }))
  }

  // ———— row command seams ————

  const onSessionCommand = (sessionId: string, command: SessionRowCommand): void => {
    // rename: upstream exposes no public session-rename verb (the native
    // browser's renameSession is its registration-private face) — the P2
    // lineage pass revisits; fork/archive ride the public uiWorkspace face.
    if (command === 'fork') void props.uiWorkspace?.forkSession(sessionId)
    if (command === 'archive') void props.uiWorkspace?.archiveSession(sessionId)
  }

  // ———— the C8 lifecycle legs (task 3.5): the dialogs + the shared actions ————

  /** The pending confirm targets (the ⋯ menu opens the matching dialog). */
  const [pendingArchive, setPendingArchive] = useState<Project | null>(null)
  const [pendingRemove, setPendingRemove] = useState<Project | null>(null)
  /** The lifecycle actions' shared deps (toast = the seat's fixed surface). */
  const lifecycleDeps = store === undefined
    ? undefined
    : { store, t, showToast: (message: string): void => { setToast(message) } } satisfies LifecycleActionDeps

  const onProjectCommand = (projectId: string, command: ProjectRowCommand): void => {
    if (lifecycleDeps === undefined) return // hostless seat: nothing to fire
    const project = storeSnapshot.projects.find(row => row.id === projectId)
    if (project === undefined) return
    // restore is confirm-free (C1 semantics); archive/remove pass the 必答⑤
    // dialog; rename stays in the row (行内编辑 → onRename below).
    if (command === 'restore') restoreProjectNow(lifecycleDeps, project)
    if (command === 'archive') setPendingArchive(project)
    if (command === 'remove') setPendingRemove(project)
  }
  const onArchivedCommand = (projectId: string, command: 'restore' | 'remove'): void => {
    onProjectCommand(projectId, command)
  }
  const onRename = (projectId: string, displayName: string): void => {
    if (lifecycleDeps === undefined) return
    commitProjectRename(lifecycleDeps, projectId, displayName)
  }

  // ———— render ————

  const showEmptyGuide = storeSnapshot.phase !== 'loading' && storeSnapshot.projects.length === 0

  return (
    <div data-dsh-forge-project-seat="" style={seatStyle}>
      <div
        key={switchPulse}
        className={switchPulse > 0 ? PROJECT_SWITCH_CLASS : undefined}
        data-dsh-forge-switch-count={switchPulse > 0 ? switchPulse : undefined}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
      >
        {showEmptyGuide && props.wide
          ? (
            // 空态引导(page-map 启动落点:无项目 → 引导「添加项目」,同卡唯一入口)。
            <div data-dsh-forge-project-empty="" style={emptyGuideStyle}>
              <strong style={emptyTitleStyle}>{t('project.empty.title')}</strong>
              <p style={emptyBodyStyle}>{t('project.empty.body')}</p>
              <button
                type="button"
                data-dsh-forge-project-empty-add=""
                style={emptyButtonStyle}
                onClick={openCard}
              >
                {t('chrome.addProject')}
              </button>
            </div>
          )
          : (
            <ProjectTreeBrowser
              t={t}
              projects={storeSnapshot.projects}
              workspaces={treeWorkspaces}
              sessions={treeSessions}
              activeProjectId={storeSnapshot.activeProjectId}
              activeSessionId={activeSessionId}
              collapsed={!props.wide}
              onOpenProject={switchProjectInPlace}
              onNewSession={(projectId) => { props.uiWorkspace?.startSession(workspaceIdOfProject(projectId)) }}
              onOpenSession={(sessionId) => { props.uiWorkspace?.openSession(sessionId) }}
              onSessionCommand={onSessionCommand}
              onProjectCommand={onProjectCommand}
              onRename={onRename}
              onArchivedCommand={onArchivedCommand}
              onAdoptUngrouped={openCard}
              onAddProject={openCard}
              {...(props.expandSidebar === undefined ? {} : { onToggleCollapse: props.expandSidebar })}
            />
          )}
      </div>

      {/* C7 添加项目确认卡 — the ONE instance behind the 区头/rail ＋, the
          空态引导, and the 未分组纳管 entry (不跳页; the shared DialogFrame).
          onBrowse stays ABSENT: the card's onBrowse seam is () => void with no
          return channel for the picked path, so the 浏览… button stays hidden
          and the paste/drag entry is the P1 input (the picker return-channel
          lands with the card's later polish — record note). */}
      {cardOpen && props.cardFace !== undefined && (
        <ConfirmCard
          t={t}
          face={props.cardFace}
          onCancel={closeCard}
          onDone={onCardDone}
          onLocateRegistered={onLocateRegistered}
        />
      )}

      {/* C8 生命周期确认 Dialog pair (task 3.5): the 必答⑤ copy dialogs the
          ⋯ menu's 归档/删除 open; confirms ride the shared lifecycle actions
          (verb → refresh → toast; 删除当前项目 falls the pointer to the
          first remaining project or the 空态引导). */}
      {pendingArchive !== null && lifecycleDeps !== undefined && (
        <ArchiveConfirmDialog
          t={t}
          project={pendingArchive}
          onConfirm={() => {
            const target = pendingArchive
            setPendingArchive(null)
            archiveProjectNow(lifecycleDeps, target)
          }}
          onCancel={() => { setPendingArchive(null) }}
        />
      )}
      {pendingRemove !== null && lifecycleDeps !== undefined && (
        <RemoveProjectConfirmDialog
          t={t}
          project={pendingRemove}
          onConfirm={() => {
            const target = pendingRemove
            setPendingRemove(null)
            // M4 4.3 (AC4): mark BEFORE the verb (the closing windows' events
            // can never race the mark — no pane restores for a gone project),
            // and count the live windows for the closure toast's landing.
            props.detachedWindows?.markRemoved(target.id)
            const closedWindows = props.detachedWindows?.countFor(target.id) ?? 0
            removeProjectNow(
              lifecycleDeps,
              target,
              closedWindows > 0 ? t('window.toast.projectWindowsClosed') : undefined,
            )
          }}
          onCancel={() => { setPendingRemove(null) }}
        />
      )}

      {/* The seat-level toast (register success / 已注册快车道). */}
      {toast !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-project-toast="" style={toastStyle}>
          {toast}
        </div>
      )}
    </div>
  )
}
