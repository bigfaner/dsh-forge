/**
 * The workbench-state page store (task 5.14, Implementation Notes file): the
 * SINGLE-SOURCE read model behind the overview family's real chain. One
 * getState read serves the first paint of THREE consumers — the chrome
 * (ProjectSwitcher list + active marker + the state gate), the UF1 page
 * (grid / meta / empty / error branches), and the register wizard's
 * ERR_PROJECT_EXISTS locate lookup — and every mutation re-reads through
 * the same store, so the consumers can never disagree (AC3: getState 单次
 * 拉取驱动首屏,不逐卡逐区多次往返;mutations refresh consistently).
 *
 * Scope discipline (the store/feature-board.ts precedent, page-session
 * class): one store per shell mount, never persisted, no cross-mount
 * residue. `refresh()` is the page face's loadState — rejections carry the
 * normalized {@link WorkbenchVerbError} shape so the page's error mapping
 * stays form-agnostic; a failed refresh KEEPS the last good state (the
 * page-level "never an error wall on refresh" contract).
 *
 * The onEvents subscription (订阅 onEvents 增量): Interface 1 is a
 * single-subscriber verb, so the store's leg rides the renderer's ONE
 * shared channel (ipc/workbench-events.ts, since 5.15) — sync events are
 * the 失联 signal source (sync_state error → the per-card 失联徽标 + the
 * active-project error card via `lostProjectIds`; idle/scanning recovers
 * the row). task_updated / feature_updated events are NOT this store's
 * concern (the board pages own those legs — 5.15) and are ignored here by
 * design.
 */
import type { WorkbenchState } from '../ipc-types'
import { normalizeWorkbenchVerbError, type WorkbenchIpcBridge } from '../ipc/workbench'
import { getWorkbenchEventSource } from '../ipc/workbench-events'

/** The load lifecycle of the store's read model (the chrome's gate input). */
export type WorkbenchStatePhase = 'loading' | 'error' | 'ready'

/** The store's immutable projection (useSyncExternalStore currency). */
export interface WorkbenchStateSnapshot {
  /** `loading` until the first read settles; `error` marks the LAST failed read (last good state kept). */
  readonly phase: WorkbenchStatePhase
  /** The last good WorkbenchState; undefined only before the first successful read. */
  readonly state: WorkbenchState | undefined
  /** Project ids whose latest sync event reported the error state (the 失联 signals). */
  readonly lostProjectIds: readonly string[]
}

/** The overview family's shared read model over the Interface 1 bridge. */
export interface WorkbenchStateStore {
  /** The bridge the store reads (the views derive their IPC faces from it). */
  readonly bridge: WorkbenchIpcBridge
  /** The external-store subscription (React useSyncExternalStore compatible). */
  subscribe(listener: () => void): () => void
  /** The current snapshot (referentially stable between publishes). */
  getSnapshot(): WorkbenchStateSnapshot
  /**
   * One getState read. Concurrent callers share the in-flight read (the
   * chrome's mount kick and the page's first loadState are ONE round trip);
   * resolves the fresh state, rejects the normalized error shape.
   */
  refresh(): Promise<WorkbenchState>
  /** Tear the store down: drop the onEvents subscription + the listeners. */
  dispose(): void
}

/** The pre-first-read snapshot (also the no-store fallback's constant). */
export const INITIAL_WORKBENCH_STATE_SNAPSHOT: WorkbenchStateSnapshot = {
  phase: 'loading',
  state: undefined,
  lostProjectIds: [],
}

/**
 * Create the page-scoped workbench-state store over the Interface 1 bridge.
 * The factory does NOT kick the initial read — the shell's mount effect does
 * (and the page's own loadState shares it through the in-flight coalescing).
 */
export function createWorkbenchStateStore(bridge: WorkbenchIpcBridge): WorkbenchStateStore {
  let snapshot: WorkbenchStateSnapshot = INITIAL_WORKBENCH_STATE_SNAPSHOT
  const listeners = new Set<() => void>()
  const lost = new Set<string>()
  let inFlight: Promise<WorkbenchState> | undefined

  const publish = (next: WorkbenchStateSnapshot): void => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  // The single-subscriber event leg: sync events drive the 失联 signals.
  // Since 5.15 the leg rides the SHARED channel (ipc/workbench-events.ts):
  // the verb is single-subscriber at the webContents level, and the main-side
  // registry deregisters the whole renderer on ANY unsubscribe — so the
  // overview family and the task-board family multiplex over one preload
  // subscription (either one's teardown can never strand the other's push).
  const unsubscribeEvents = getWorkbenchEventSource(bridge).subscribe((events) => {
    let changed = false
    for (const event of events) {
      if (event.type !== 'sync') continue
      if (event.sync.state === 'error') {
        if (!lost.has(event.projectId)) {
          lost.add(event.projectId)
          changed = true
        }
      } else if (lost.delete(event.projectId)) {
        changed = true
      }
    }
    if (changed) publish({ ...snapshot, lostProjectIds: [...lost] })
  })

  const store: WorkbenchStateStore = {
    bridge,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    refresh: (): Promise<WorkbenchState> => {
      // In-flight coalescing: a read started while one is pending shares it
      // (first paint = one round trip however many consumers ask).
      inFlight ??= bridge.getState().then(
        (state) => {
          inFlight = undefined
          publish({ phase: 'ready', state, lostProjectIds: [...lost] })
          return state
        },
        (error: unknown) => {
          inFlight = undefined
          // A failed read keeps the last good state (error ≠ blank the chrome).
          publish({ phase: 'error', state: snapshot.state, lostProjectIds: [...lost] })
          throw normalizeWorkbenchVerbError(error)
        },
      )
      return inFlight
    },
    dispose: () => {
      // Only the event channel needs tearing down: the store is unreferenced
      // after dispose (GC reclaims the listener set with it), and clearing
      // live listeners would silently detach subscribers mid-flight.
      unsubscribeEvents()
    },
  }
  return store
}
