/**
 * The view-key state machine (task 3.3; M4 task 1.7 retired the workbench
 * tab family) — the single addressing authority for the dual-view switch.
 * The upstream SPA has no router (M1 spike-3), so pages address by VIEW KEY
 * (page-map §Pages): the top level is the dual view (`session` = the
 * inherited upstream GUI — the `project` workbench under 裁决 T1 —,
 * `workbench` = this plugin's overview ESCAPE DOOR), and the workbench
 * interior is a SINGLE page: `workbench/overview` (SC5 过渡载体; the
 * tasks/features/proposals `:slug` keys were retired with Integration 6 —
 * those boards re-home into the rightbar pane family in P2). State gates,
 * not routes, carry the equivalence (no URL, no reload).
 *
 * Both navigation forms (upstream slot path / fallback rail) drive THIS
 * machine — any interaction divergence between the forms is a defect (task
 * Hard Rules, decision D3). The machine is a plain observable store
 * (getSnapshot/subscribe, the HostObservable currency): the slot
 * registration and the rail read it directly.
 *
 * Persistence (AC4): the last top-level view survives a restart through
 * localStorage (the upstream `dsh.*` snapshot-store precedent, e.g.
 * `dsh.sessions.current`); a first boot with no stored value defaults to
 * the session view. The persisted `workbenchTab` member keeps its shape so
 * stored projections written by M2/M3 sessions (which may name a RETIRED
 * tab) hydrate safely: the guard resets any non-member tab to
 * `workbench/overview` — old localStorage never throws, never resurrects a
 * retired view.
 */

/** The top-level dual view: the inherited upstream GUI or the workbench escape door. */
export type TopLevelView = 'session' | 'workbench'

/**
 * The workbench interior's single view key (M4 task 1.7): the overview
 * escape door — `workbench/overview` is the whole interior, so the type has
 * exactly one member. The retired M2/M3 keys (`workbench/tasks`,
 * `workbench/features`, `workbench/proposals[:slug]`) are no longer members:
 * `isWorkbenchTabKey` rejects them, hydrate resets them.
 */
export type WorkbenchTabKey = 'workbench/overview'

/**
 * The workbench tab set — the escape door alone (Integration 6: VIEW_MOUNT_TABLE
 * 无死键; the boards live in the rightbar pane family / P2 hosts).
 */
export const WORKBENCH_TABS: readonly WorkbenchTabKey[] = [
  'workbench/overview',
]

/**
 * Reserved key prefix for the dialog overlays (`workbench/dialog/<name>`:
 * wizard, confirmations, launch errors). Reserved as key grammar + a mapping
 * entry only — the register wizard still mounts in the escape door's dialog
 * layer.
 */
export const WORKBENCH_DIALOG_PREFIX = 'workbench/dialog/'

/** Narrow an unknown value to a workbench tab key (persisted-input guard). */
export function isWorkbenchTabKey(value: unknown): value is WorkbenchTabKey {
  return typeof value === 'string' && (WORKBENCH_TABS as readonly string[]).includes(value)
}

/** Snapshot of the machine — a stable reference between transitions. */
export interface ViewKeySnapshot {
  /** Active top-level view (`session` also covers non-workbench global panels: the dual view is binary). */
  readonly view: TopLevelView
  /**
   * Active workbench tab; the escape door is the only member, so this is
   * constant `'workbench/overview'` — the field keeps the persisted
   * projection's shape stable across the M4 retirement.
   */
  readonly workbenchTab: WorkbenchTabKey
}

/** First-boot / reset state: the session view on the overview escape door (AC4). */
export const INITIAL_VIEW_KEY: ViewKeySnapshot = Object.freeze({
  view: 'session',
  workbenchTab: 'workbench/overview',
})

/** The persisted projection of the machine (what survives a restart). */
export interface PersistedViewKey {
  readonly view: TopLevelView
  readonly workbenchTab: WorkbenchTabKey
}

/** Persistence face the store hydrates from and writes to. */
export interface ViewKeyPersistence {
  /** @returns the stored projection, or undefined on a first boot. */
  read(): PersistedViewKey | undefined
  /** Store the projection (called on every transition). */
  write(value: PersistedViewKey): void
}

/** The store's localStorage key (the upstream `dsh.*` persistence namespace). */
export const VIEW_KEY_STORAGE_KEY = 'dsh.forge.workbench.view'

/** Read the platform localStorage without assuming it exists (Node tests, privacy modes). */
function storageOf(): Storage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage
    return candidate === undefined || candidate === null ? undefined : candidate
  } catch {
    return undefined
  }
}

/**
 * localStorage-backed persistence; writes keep an in-memory shadow so the
 * machine still round-trips inside one process when storage is unavailable
 * (Node unit context, blocked storage). Unreadable stored values read as a
 * first boot.
 */
export function createLocalStoragePersistence(): ViewKeyPersistence {
  let shadow: PersistedViewKey | undefined
  return {
    read(): PersistedViewKey | undefined {
      const storage = storageOf()
      if (storage === undefined) return shadow
      try {
        const raw = storage.getItem(VIEW_KEY_STORAGE_KEY)
        if (raw === null) return shadow
        return JSON.parse(raw) as PersistedViewKey
      } catch {
        return shadow
      }
    },
    write(value: PersistedViewKey): void {
      shadow = value
      const storage = storageOf()
      if (storage === undefined) return
      try {
        storage.setItem(VIEW_KEY_STORAGE_KEY, JSON.stringify(value))
      } catch {
        // A failed write never breaks switching; the next transition retries.
      }
    },
  }
}

/**
 * Validate a persisted projection back into a snapshot: unknown or corrupt
 * values reset to the first-boot default (never throw on stored data). A
 * stored tab naming a RETIRED M2/M3 key is "unknown" under the shrunk
 * grammar — the escape door wins (the retire-in-place hydration contract).
 * @param persisted - the value persistence read (may be malformed).
 * @returns the hydrated initial snapshot.
 */
export function hydratePersistedViewKey(persisted: unknown): ViewKeySnapshot {
  if (persisted === null || typeof persisted !== 'object') return INITIAL_VIEW_KEY
  const candidate = persisted as { view?: unknown; workbenchTab?: unknown }
  const view = candidate.view === 'workbench' ? 'workbench' as const
    : candidate.view === 'session' ? 'session' as const
      : undefined
  if (view === undefined) return INITIAL_VIEW_KEY
  return Object.freeze({
    view,
    workbenchTab: isWorkbenchTabKey(candidate.workbenchTab)
      ? candidate.workbenchTab
      : 'workbench/overview',
  })
}

/** The observable view-key machine both navigation forms drive. */
export interface ViewKeyStore {
  /** @returns the current snapshot (stable reference between transitions). */
  getSnapshot(): ViewKeySnapshot
  /** Subscribe to transitions (called after the snapshot changed). */
  subscribe(listener: () => void): () => void
  /** Switch to the session (upstream) view. */
  selectSession(): void
  /** Switch to the workbench escape door (the overview single page). */
  selectWorkbench(): void
  /**
   * Adopt a top-level view the carrier already reflects (external selection:
   * upstream sidebar row, panel lifecycle). Same state space as select* —
   * used by the controller without re-projecting.
   */
  adoptView(view: TopLevelView): void
}

/**
 * Create the view-key machine.
 * @param persistence - persistence face; absent storage still yields a working
 *   in-memory machine (the read hydrates, transitions write through).
 * @returns the store.
 */
export function createViewKeyStore(persistence?: ViewKeyPersistence): ViewKeyStore {
  const persist = persistence ?? createLocalStoragePersistence()
  let snapshot: ViewKeySnapshot = hydratePersistedViewKey(persist.read())
  const listeners = new Set<() => void>()

  const commit = (next: ViewKeySnapshot): void => {
    if (next.view === snapshot.view && next.workbenchTab === snapshot.workbenchTab) return
    snapshot = Object.freeze(next)
    persist.write({ view: snapshot.view, workbenchTab: snapshot.workbenchTab })
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    selectSession(): void {
      commit({ ...snapshot, view: 'session' })
    },
    selectWorkbench(): void {
      // The interior is the single overview page — no tab dimension to carry.
      commit({ view: 'workbench', workbenchTab: 'workbench/overview' })
    },
    adoptView(view: TopLevelView): void {
      commit({ ...snapshot, view })
    },
  }
}
