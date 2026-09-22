/**
 * The view-key state machine (task 3.3) — the single addressing authority for
 * the dual-view switch. The upstream SPA has no router (M1 spike-3), so pages
 * address by VIEW KEY (page-map §Pages): the top level is the dual view
 * (`session` = the inherited upstream GUI, `workbench` = this plugin), and the
 * workbench interior addresses by `workbench/<page>` keys. State gates, not
 * routes, carry the equivalence (no URL, no reload).
 *
 * Both navigation forms (upstream slot path / fallback rail) drive THIS
 * machine — any interaction divergence between the forms is a defect (task
 * Hard Rules, decision D3). The machine is a plain observable store
 * (getSnapshot/subscribe, the HostObservable currency): the slot registration
 * exposes it as an inject-hooks source (framework-synthesized `useViewKey`
 * selector) and the rail reads it directly.
 *
 * Persistence (AC4): the last top-level view and its workbench tab survive a
 * restart through localStorage (the upstream `dsh.*` snapshot-store
 * precedent, e.g. `dsh.sessions.current`); a first boot with no stored value
 * defaults to the session view. The feature-detail slug stays session-scoped
 * (page-map keeps the breadcrumb in 会话期), so it is never persisted.
 */

/** The top-level dual view: the inherited upstream GUI or this workbench. */
export type TopLevelView = 'session' | 'workbench'

/** The three workbench tabs (page-map view keys, ui-design tab 条). */
export type WorkbenchTabKey =
  | 'workbench/overview'
  | 'workbench/tasks'
  | 'workbench/features'

/** Every workbench tab, in tab-strip order (概览 / 任务 / feature). */
export const WORKBENCH_TABS: readonly WorkbenchTabKey[] = [
  'workbench/overview', 'workbench/tasks', 'workbench/features',
]

/**
 * Reserved key prefix for the 5.x dialog overlays (`workbench/dialog/<name>`:
 * wizard, confirmations, launch errors). Reserved as key grammar + a mapping
 * entry only — dialog transitions land with the views that own them.
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
  /** Active workbench tab; survives 会话⇄工作台 switches (ui-design keeps workbench view state in session memory). */
  readonly workbenchTab: WorkbenchTabKey
  /** Active feature-detail subview slug, or undefined on a plain tab (session-scoped, never persisted). */
  readonly featureSlug: string | undefined
}

/** First-boot / reset state: the session view on the overview tab (AC4). */
export const INITIAL_VIEW_KEY: ViewKeySnapshot = Object.freeze({
  view: 'session',
  workbenchTab: 'workbench/overview',
  featureSlug: undefined,
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
 * values reset to the first-boot default (never throw on stored data).
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
    featureSlug: undefined,
  })
}

/** The observable view-key machine both navigation forms drive. */
export interface ViewKeyStore {
  /** @returns the current snapshot (stable reference between transitions). */
  getSnapshot(): ViewKeySnapshot
  /** Subscribe to transitions (called after the snapshot changed). */
  subscribe(listener: () => void): () => void
  /** Switch to the session (upstream) view; the workbench tab is retained. */
  selectSession(): void
  /** Switch to the workbench view, optionally targeting a tab. */
  selectWorkbench(tab?: WorkbenchTabKey): void
  /** Switch the workbench interior tab (leaves the workbench view). */
  selectWorkbenchTab(tab: WorkbenchTabKey): void
  /** Open a feature-detail subview (the features tab with a slug). */
  openFeatureDetail(slug: string): void
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
    if (next.view === snapshot.view
      && next.workbenchTab === snapshot.workbenchTab
      && next.featureSlug === snapshot.featureSlug) return
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
    selectWorkbench(tab?: WorkbenchTabKey): void {
      commit({
        view: 'workbench',
        workbenchTab: tab ?? snapshot.workbenchTab,
        featureSlug: tab === undefined ? snapshot.featureSlug : undefined,
      })
    },
    selectWorkbenchTab(tab: WorkbenchTabKey): void {
      commit({ view: 'workbench', workbenchTab: tab, featureSlug: undefined })
    },
    openFeatureDetail(slug: string): void {
      commit({ view: 'workbench', workbenchTab: 'workbench/features', featureSlug: slug })
    },
    adoptView(view: TopLevelView): void {
      commit({ ...snapshot, view })
    },
  }
}
