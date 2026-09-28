/**
 * The active-project pointer store (M4 task 1.6, Implementation Notes file):
 * the client half of the app_state `active_project_id` single-activation
 * pointer — boot 恢复上次活跃项目 (tech-design §Interface 1 getState carries
 * the pointer beside the v3 project rows), 切换项目即写指针 (activateProject,
 * the one write path main-side), and project_list_changed pushes re-pull the
 * registry (创建成功原位生效 = 树刷新, the C7 card's done leg).
 *
 * Lifetime: PLUGIN-lifetime (created in the client apply, above any seat
 * mount — the sidebar seat is app-lifetime, but the store also serves the
 * boot restore before any seat renders). Hostless worlds (no preload bridge)
 * simply never create one; the seat stays inert (the dispatch-face inert
 * discipline: no silent mock on the real path).
 *
 * Switch semantics (裁决 #28 原位换台): `switchProject` is OPTIMISTIC — the
 * pointer moves locally the moment the user clicks a different project row
 * (the tree re-renders on the spot), the verb write follows, and a rejection
 * reverts to the last main-side truth (a failed switch never strands a
 * pointer the kernel does not hold). Same-project clicks never reach the
 * verb (同项目零动作 — the caller checks before calling, and the store
 * double-guards).
 */
import type { Project, WorkbenchState } from '../ipc-types'
import { normalizeWorkbenchVerbError, type WorkbenchIpcBridge } from '../ipc/workbench'
import { getWorkbenchEventSource } from '../ipc/workbench-events'

/** The store's immutable projection (useSyncExternalStore currency). */
export interface ActiveProjectSnapshot {
  /** `loading` until the boot read settles; `error` marks the LAST failed read (last good state kept). */
  readonly phase: 'loading' | 'error' | 'ready'
  /** The registry in v3 columns (archived/sortOrder/…); empty before the first good read. */
  readonly projects: readonly Project[]
  /** The single-activation pointer; `null` = 未激活 (boot default, 无项目 → 空态引导). */
  readonly activeProjectId: string | null
}

/** The active-project pointer read model (the sidebar seat's single source). */
export interface ActiveProjectStore {
  /** The bridge the store reads (the seat derives sparse verbs — e.g. restoreProject — from it). */
  readonly bridge: WorkbenchIpcBridge
  /** The external-store subscription (React useSyncExternalStore compatible). */
  subscribe(listener: () => void): () => void
  /** The current snapshot (referentially stable between publishes). */
  getSnapshot(): ActiveProjectSnapshot
  /**
   * One getState read (the pointer + the registry in one round trip; the boot
   * 恢复 and the tree's project rows share it). Concurrent callers share the
   * in-flight read; rejections reject the normalized verb-error shape.
   */
  refresh(): Promise<WorkbenchState>
  /**
   * 原位换台 write leg: same project → `{ changed: false }` (zero action);
   * different project → optimistic pointer move + `activateProject` verb, and
   * a rejection reverts the optimistic move (last good snapshot restored).
   */
  switchProject(projectId: string): { changed: boolean }
  /**
   * The C7 card's done leg (创建成功原位生效): the pointer switches to the
   * freshly registered project and the registry re-pulls (树刷新 + 指针切换).
   */
  activateRegistered(projectId: string): Promise<void>
  /** Tear the store down: drop the shared event subscription + the listeners. */
  dispose(): void
}

/** The pre-first-read snapshot (also the no-store fallback's constant). */
export const INITIAL_ACTIVE_PROJECT_SNAPSHOT: ActiveProjectSnapshot = Object.freeze({
  phase: 'loading',
  projects: [],
  activeProjectId: null,
})

/**
 * Create the plugin-lifetime active-project pointer store over the Interface
 * 1 bridge. The factory does NOT kick the initial read — the client apply
 * does (the boot restore wants the pointer before the first seat render, and
 * the seat's own mount effect may share the in-flight read).
 * @param bridge - the live preload bridge (the caller guards presence).
 * @returns the store.
 */
export function createActiveProjectStore(bridge: WorkbenchIpcBridge): ActiveProjectStore {
  let snapshot: ActiveProjectSnapshot = INITIAL_ACTIVE_PROJECT_SNAPSHOT
  const listeners = new Set<() => void>()
  let inFlight: Promise<WorkbenchState> | undefined

  const publish = (next: ActiveProjectSnapshot): void => {
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) listener()
  }

  // project_list_changed pushes (any register/rename/archive/restore/remove
  // completion — including THIS renderer's own writes) re-pull the registry
  // through the shared single-subscriber channel (≤500ms batches main-side).
  const unsubscribeEvents = getWorkbenchEventSource(bridge).subscribe((events) => {
    if (!events.some(event => event.type === 'project_list_changed')) return
    void store.refresh().catch(() => {
      // The push-driven re-pull keeps the last good state on failure (the
      // next push or seat action retries); never an error wall here.
    })
  })

  const store: ActiveProjectStore = {
    bridge,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    refresh: (): Promise<WorkbenchState> => {
      // In-flight coalescing (the workbench-state precedent): the boot read
      // and any seat refresh are ONE round trip while pending.
      inFlight ??= bridge.getState().then(
        (state) => {
          inFlight = undefined
          publish({
            phase: 'ready',
            projects: state.projects,
            activeProjectId: state.activeProjectId,
          })
          return state
        },
        (error: unknown) => {
          inFlight = undefined
          // A failed read keeps the last good state (error ≠ blank the tree).
          publish({ ...snapshot, phase: 'error' })
          throw normalizeWorkbenchVerbError(error)
        },
      )
      return inFlight
    },
    switchProject(projectId) {
      if (snapshot.phase !== 'ready' || projectId === snapshot.activeProjectId) {
        return { changed: false }
      }
      const last = snapshot
      // 同项目零动作之外的第一步:指针先行(树即时高亮),写路径随后对账。
      publish({ ...snapshot, activeProjectId: projectId })
      void bridge.activateProject(projectId).catch(() => {
        // The kernel never took the pointer — restore the last good truth.
        publish(last)
      })
      return { changed: true }
    },
    activateRegistered(projectId) {
      // 树刷新 first (lands the fresh row + guarantees a ready snapshot for
      // the optimistic move), then the pointer switch rides switchProject
      // (verb + revert included). Both legs are best-effort — the register
      // itself already succeeded; a failed re-pull must not eat the switch.
      return store.refresh()
        .then(() => undefined, () => undefined)
        .then(() => { store.switchProject(projectId) })
    },
    dispose() {
      unsubscribeEvents()
    },
  }
  return store
}
