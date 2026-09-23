/**
 * The UF2 task-board page store (task 5.15, Implementation Notes file): the
 * 快照缓存 + 事件合并 behind the tasks tab's real chain — the read model the
 * assembled TasksView feeds the page through.
 *
 * Read contract (AC2 首屏 getTaskBoard 单次): `loadBoard` is a READ-THROUGH
 * with three legs — join an in-flight read (concurrent callers = ONE verb),
 * serve an UNCONSUMED revision (an event-driven refresh that published
 * without the page asking costs zero verbs), else fetch fresh. The page's
 * retry (the toolbar's sync-error 重试) lands on the fresh leg precisely
 * because every published revision has been consumed — a retry can never be
 * answered by the stale snapshot it is retrying away from.
 *
 * The two counters (revision vs feed) keep the first paint at ONE verb:
 *   revision — the DATA version (every board/sync content change);
 *   feed     — the re-feed signal, advanced ONLY by store-initiated
 *              publishes (the debounced event refresh, a merged sync
 *              event). A page-initiated read resolves straight to its
 *              caller and deliberately leaves feed alone, so the view
 *              never answers the page's own fetch with a token bump (which
 *              would re-fire loadBoard and fetch a second time); an
 *              event-driven publish advances feed, the view bumps the
 *              page's reload token, and the next loadBoard SERVES the
 *              already-fetched snapshot.
 *
 * Event merge (AC3 事件回流, the G3 core — coalesce-then-fetch): pushed
 * batches arrive ≤500ms-coalesced main-side (Interface 3); this store NEVER
 * fetches per event. `task_updated` batches (filtered to the store's active
 * project) arm a trailing debounce, and its expiry fires ONE getTaskBoard —
 * the fresh snapshot replaces rows in place downstream (no remount, the
 * page's Hard Rule). `sync` batches merge straight into the snapshot's sync
 * projection (the toolbar light moves without a board round trip). A sync
 * event older than a subsequent read cannot survive over it (the read's
 * DTO is authoritative at read time). `feature_updated` is not this
 * store's concern (the UF4 page owns that leg).
 *
 * ≤5s budget math (SC3 页面侧): watcher debounce 400ms (Interface 3) + push
 * coalescing ≤500ms (2.6 batcher) + this store's debounce 400ms + ONE
 * getTaskBoard (a SQLite snapshot read, ms-scale at 500 tasks) + the page's
 * row-level render ≈ 1.3s worst-case — the remaining budget is margin for
 * renderer contention, and the updating highlight lights on EVENT ARRIVAL
 * (before the fetch), so the perceived freshness is the push latency alone.
 *
 * Scope discipline (the store/feature-board.ts precedent): one store per
 * TasksView mount — the shell re-keys the view per active project, so a
 * project switch rebuilds the store (no cross-project snapshot residue);
 * never persisted; the event leg detaches on dispose (through the shared
 * single-subscriber channel — see ipc/workbench-events.ts).
 */
import type { SyncStatus, TaskBoardData, WorkbenchEvent } from '../ipc-types'
import type { TaskBoardFace } from '../contract'
import { createIpcTaskBoardFace, normalizeWorkbenchVerbError, type WorkbenchIpcBridge } from '../ipc/workbench'
import { getWorkbenchEventSource } from '../ipc/workbench-events'

/**
 * The coalesce-then-fetch window: pushes already arrive ≤500ms-batched
 * main-side, so this trailing debounce exists to merge back-to-back BATCHES
 * (a large structural change can straddle two coalescing windows) into one
 * refresh. Sized inside the ≤5s budget with room for the watcher + push
 * legs (see the module note's budget math).
 */
export const TASK_BOARD_REFRESH_DEBOUNCE_MS = 400

/** The load lifecycle of the store's read model. */
export type TaskBoardPhase = 'loading' | 'ready' | 'error'

/** The store's immutable projection (useSyncExternalStore currency). */
export interface TaskBoardSnapshot {
  /** `loading` until the first read settles; `error` marks the LAST failed read (last good board kept). */
  readonly phase: TaskBoardPhase
  /** The last good board (with the event-merged sync projection); undefined before the first successful read. */
  readonly board: TaskBoardData | undefined
  /** The data revision — bumped on every board/sync CONTENT change (never on a failed read). */
  readonly revision: number
  /**
   * The re-feed signal — advanced only by store-initiated publishes (event
   * refresh / sync merge), never by a page-initiated read. The view rides
   * THIS counter for its reload token (the two-counter discipline above).
   */
  readonly feed: number
}

/** The tasks tab's read model + event merge over the Interface 1 bridge. */
export interface TaskBoardStore {
  /** The external-store subscription (React useSyncExternalStore compatible). */
  subscribe(listener: () => void): () => void
  /** The current snapshot (referentially stable between publishes). */
  getSnapshot(): TaskBoardSnapshot
  /**
   * The page's loadBoard (read-through): join in-flight / serve an
   * unconsumed revision / fetch fresh. Resolves the board served; rejects
   * the normalized {@link WorkbenchVerbError} shape.
   */
  loadBoard(projectId: string): Promise<TaskBoardData>
  /**
   * The event intake (a pushed batch, any event types): project-filtered,
   * task batches arm the refresh debounce, sync batches merge immediately.
   */
  handleEvents(events: readonly WorkbenchEvent[]): void
  /** The page's face — loadBoard above + the shared-channel subscribeEvents. */
  asFace(): TaskBoardFace
  /** Tear down: drop the event listener + the pending refresh timer. */
  dispose(): void
}

/** The pre-first-read snapshot (also the no-store fallback's constant). */
export const INITIAL_TASK_BOARD_SNAPSHOT: TaskBoardSnapshot = {
  phase: 'loading',
  board: undefined,
  revision: 0,
  feed: 0,
}

/**
 * Create the page-scoped task-board store over the Interface 1 bridge.
 * `projectId` is the store's whole world (the shell re-keys the mount per
 * active project — a project switch is a NEW store, never a re-aim).
 */
export function createTaskBoardStore(bridge: WorkbenchIpcBridge, projectId: string): TaskBoardStore {
  const verbFace = createIpcTaskBoardFace(bridge)
  let snapshot: TaskBoardSnapshot = INITIAL_TASK_BOARD_SNAPSHOT
  // The revision the page last consumed through loadBoard — the serve leg's
  // gate (an unconsumed publish serves; a consumed one means the caller —
  // mount, retry — genuinely wants a fresh fetch).
  let servedRevision = 0
  // True while an in-flight read has at least one PAGE-side awaiter — the
  // settle leg marks the revision served only then (a store-initiated
  // refresh resolves into the snapshot, not into the page's hands).
  let awaitedByPage = false
  // A sync event that arrived WHILE a read was in flight — strictly fresher
  // than that read's DTO, re-applied over the settled board. Events from
  // BEFORE a read never survive it (the read reflects main-side NOW).
  let flightSync: SyncStatus | undefined
  const listeners = new Set<() => void>()
  let inFlight: Promise<TaskBoardData> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  const publish = (next: TaskBoardSnapshot): void => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  /** ONE getTaskBoard read; concurrent callers share it (首屏单次拉取). */
  const read = (): Promise<TaskBoardData> => {
    inFlight ??= verbFace.loadBoard(projectId).then(
      (fetched) => {
        inFlight = undefined
        // The DTO's sync is authoritative at read time — EXCEPT a sync event
        // that landed mid-flight (strictly fresher than this read's
        // snapshot; re-apply it over the settled board).
        const board = flightSync === undefined ? fetched : { ...fetched, sync: flightSync }
        flightSync = undefined
        const served = awaitedByPage
        awaitedByPage = false
        const revision = snapshot.revision + 1
        publish({
          phase: 'ready',
          board,
          revision,
          // A read the page awaited resolved into its hands (served); the
          // view must not answer it with a token bump. A store-initiated
          // refresh (nobody awaited) advances the feed so the view re-feeds.
          feed: served ? snapshot.feed : snapshot.feed + 1,
        })
        if (served) servedRevision = revision
        return board
      },
      (error: unknown) => {
        inFlight = undefined
        // A failed refresh keeps the last good board and both counters (an
        // error is a no-op for consumers — the page's error surface is its
        // own first-load/retry machinery; the store stays subscribed, the
        // next batch re-arms the retry naturally). A sync stashed for THIS
        // read (the fix-1 defect-A deferral / the mid-flight stash) is
        // merged onto the kept board here and CLEARED — never carried over a
        // failed read to overwrite a later, fresher DTO.
        const keptBoard = flightSync === undefined || snapshot.board === undefined
          ? snapshot.board
          : { ...snapshot.board, sync: flightSync }
        flightSync = undefined
        publish({ ...snapshot, ...(keptBoard === undefined ? {} : { board: keptBoard }), phase: 'error' })
        throw normalizeWorkbenchVerbError(error)
      },
    )
    return inFlight
  }

  /** The debounced refresh (coalesce-then-fetch): one verb per burst. */
  const scheduleRefresh = (): void => {
    if (refreshTimer !== undefined) return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      void read().catch(() => {})
    }, TASK_BOARD_REFRESH_DEBOUNCE_MS)
  }

  const handleEvents = (events: readonly WorkbenchEvent[]): void => {
    let wantsRefresh = false
    let latestSync: SyncStatus | undefined
    for (const event of events) {
      // Foreign projects' events are not this board's concern (the active
      // project's tab is the only audience here).
      if (event.projectId !== projectId) continue
      if (event.type === 'task_updated') {
        wantsRefresh = true
      } else if (event.type === 'sync') {
        latestSync = event.sync
      }
      // feature_updated: the UF4 page's leg (5.16's note) — not consumed here.
    }
    if (latestSync !== undefined) {
      // fix-1 defect A: a sync landing BESIDE task_updated (the real scan
      // batch shape — every scanForgeFiles outcome appends a trailing sync)
      // must NOT re-feed the page off the PRE-refresh board while the task
      // refresh is still debounced. The view answers a feed advance by
      // re-feeding the page, the page SERVES this (pre-refresh) snapshot,
      // and the page's structural-marker retire loop then consumes the
      // deletion marker on a board that still carries the deleted key —
      // the marker leg that flips the dock to its error card dies. Stash
      // the sync onto the pending read instead (its settle re-applies it;
      // newest wins across coalesced batches).
      if (wantsRefresh || refreshTimer !== undefined) {
        flightSync = latestSync
      } else {
        // A read in flight would settle this event "backwards" at its DTO —
        // remember it for the re-apply over the settle. (The in-flight join
        // serves the read's FRESH result, so the immediate merge here cannot
        // feed the page a pre-refresh board.)
        if (inFlight !== undefined) flightSync = latestSync
        // Merge onto the last good board (a sync event never fetches); before
        // the first read there is nothing to merge onto — the next read's DTO
        // carries the state anyway.
        if (snapshot.board !== undefined) {
          publish({
            ...snapshot,
            board: { ...snapshot.board, sync: latestSync },
            revision: snapshot.revision + 1,
            feed: snapshot.feed + 1,
          })
        }
      }
    }
    if (wantsRefresh) scheduleRefresh()
  }

  // The single-subscriber event leg rides the shared channel: the page's
  // presentation leg (highlights/aria-live over face.subscribeEvents) and
  // this data-merge leg multiplex over ONE preload subscription for the
  // tasks tab's whole lifetime.
  const unsubscribeEvents = getWorkbenchEventSource(bridge).subscribe(handleEvents)

  const store: TaskBoardStore = {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    loadBoard: (requestedProjectId: string): Promise<TaskBoardData> => {
      // The store is single-project by construction (the keyed remount);
      // a mismatched id is a caller defect worth failing loudly, not a
      // cross-project guess.
      if (requestedProjectId !== projectId) {
        return Promise.reject(normalizeWorkbenchVerbError(new Error(
          `task-board store: project mismatch (store ${projectId}, requested ${requestedProjectId})`,
        )))
      }
      if (inFlight !== undefined) {
        awaitedByPage = true
        return inFlight
      }
      if (snapshot.board !== undefined && snapshot.revision !== servedRevision) {
        servedRevision = snapshot.revision
        return Promise.resolve(snapshot.board)
      }
      awaitedByPage = true
      return read()
    },
    handleEvents,
    asFace: () => ({
      loadBoard: requestedProjectId => store.loadBoard(requestedProjectId),
      subscribeEvents: callback => getWorkbenchEventSource(bridge).subscribe(callback),
    }),
    dispose: () => {
      unsubscribeEvents()
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer)
        refreshTimer = undefined
      }
    },
  }
  return store
}
