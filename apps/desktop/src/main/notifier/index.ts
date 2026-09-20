import { t } from '../i18n/index.ts'
import { shellLog } from '../log.ts'
import type { HostSessionEvent } from '../host-supervisor/index.ts'

// notifier — Interface 4 of the M1 tech design (系统通知 UF2).
//
// Responsibilities (tech-design §Interface 4 / §F3 / §Data Models,
// ui-design §Component: 系统通知, prototype ui/prototype/notifications.html):
//   - notify() for the two host events ('wait-input' / 'turn-end') with
//     10s dedup-merge: same session + same event type within the window
//     updates the existing notification content instead of popping a new
//     banner; different sessions count independently and the two event
//     types never dedup against each other (dedup key = `${sessionId}|${event}`)
//   - getPermissionState() with a 300ms cache (debounce for high-frequency
//     callers); 'unknown' = platform has no query API — first notify()
//     attempts the show as if granted and backfills 'denied' on failure
//   - permission-denied / DND two-layer fallback (F3-E/F branches):
//     tray present → silent degrade: tray.incrementMissed() (tooltip
//     「dsh-forge(N)」) + one-time `toast.notifyDisabled` toast;
//     tray absent (ERR_TRAY_UNAVAILABLE overlap) → main-process log only,
//     no counter, no toast (ERR_NOTIFICATION_DENIED)
//   - notification click → front the main window + focusSession (Interface 5
//     fallback path), and fan out to onNotificationClick subscribers with
//     the sessionId carried in the notification payload
//   - SessionTable maintenance from the host event stream: wait-input /
//     turn-end create/update, session-list full reconciliation, LRU cap of
//     200 entries (SC5 long-residency bound), full clear + dedup zeroing on
//     host-exit (consumed from crash-recovery's `session-table-reset` effect)
//
// Session title fallback: empty/missing title → id.slice(0, 8).

export type NotifyEvent = 'wait-input' | 'turn-end'

/** Interface 4: SessionInfo — title falls back to id.slice(0, 8) when empty. */
export interface SessionInfo {
  id: string
  title: string
}

/** Tech-design Data Models: SessionTable entry (LRU-capped at 200). */
export interface SessionTableRow {
  title: string
  lastWaitAt: number
  lastTurnAt: number
}

/** Tech-design Data Models: DedupEntry = { key: `${sessionId}|${eventType}`; at; count }. */
export interface DedupEntry {
  key: string
  at: number
  count: number
}

export type PermissionState = 'granted' | 'denied' | 'unknown'

/** Minimal OS-notification surface the controller depends on (mockable). */
export interface OsNotification {
  show(): void
  close(): void
  on(event: 'click', listener: () => void): unknown
  /** Update the body in place; platforms without support may close + re-show. */
  setBody(body: string): void
}

export interface NotifierDeps {
  /** Native notification factory; must throw when the OS refuses (denied/DND). */
  createNotification(options: { title: string; body: string }): OsNotification
  /** Platform permission query; 'unknown' when no query API exists. */
  getPermissionStateNative(): Promise<PermissionState> | PermissionState
  /** Tray handle for the DND fallback counter (task 4.2 incrementMissed API). */
  tray: {
    readonly state: { readonly present: boolean }
    incrementMissed(): void
  }
  /** Shell-ui toast sink for the one-time notifyDisabled hint. */
  showToast(message: string): void
  /** Front the primary window (notification click path). */
  focusMainWindow: () => void
  /** Interface 5 focusSession (frozen fallback: front window + manual-switch toast). */
  focusSession(sessionId: string, options?: { title?: string }): Promise<boolean>
  /** Clock override (tests); defaults to Date.now. */
  now?: () => number
}

export interface Notifier {
  notify(event: NotifyEvent, session: SessionInfo): void
  getPermissionState(): Promise<PermissionState>
  onNotificationClick(cb: (sessionId: string) => void): void
  /** Host event stream maintenance: SessionTable updates + reconciliation. */
  handleSessionEvent(ev: HostSessionEvent): void
  /**
   * Full clear on host-exit (crash-recovery `session-table-reset` effect):
   * SessionTable emptied and DedupEntry window zeroed, so recovery-period
   * events are not swallowed by the pre-crash dedup window.
   */
  reset(): void
  /** Read-only snapshots for tests/diagnostics. */
  readonly sessionTable: ReadonlyMap<string, SessionTableRow>
  readonly dedupEntries: ReadonlyMap<string, DedupEntry>
}

export const DEDUP_WINDOW_MS = 10_000
export const PERMISSION_CACHE_MS = 300
export const SESSION_TABLE_LRU_CAP = 200

function resolveTitle(session: SessionInfo): string {
  return session.title !== '' ? session.title : session.id.slice(0, 8)
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const now = deps.now ?? (() => Date.now())

  // SessionTable as an insertion-ordered Map: touch = delete + re-set so the
  // first key is always the least-recently-used entry (LRU eviction at 200).
  const sessionTable = new Map<string, SessionTableRow>()
  const dedupEntries = new Map<string, DedupEntry & { notification?: OsNotification }>()

  // Permission cache (300ms debounce) + 'unknown' backfill state.
  let permissionCache: { state: PermissionState; at: number } | undefined
  let permissionBackfilled = false
  let notifyDisabledToastShown = false

  const clickCallbacks: Array<(sessionId: string) => void> = []

  function touchSessionRow(sessionId: string, title: string): SessionTableRow {
    const existing = sessionTable.get(sessionId)
    const row: SessionTableRow = existing ?? { title, lastWaitAt: 0, lastTurnAt: 0 }
    row.title = title
    sessionTable.delete(sessionId)
    sessionTable.set(sessionId, row)
    while (sessionTable.size > SESSION_TABLE_LRU_CAP) {
      const lru = sessionTable.keys().next().value as string | undefined
      if (lru === undefined) break
      sessionTable.delete(lru)
    }
    return row
  }

  async function getPermissionState(): Promise<PermissionState> {
    if (permissionBackfilled) return 'denied'
    const timestamp = now()
    if (permissionCache !== undefined && timestamp - permissionCache.at < PERMISSION_CACHE_MS) {
      return permissionCache.state
    }
    const state = await deps.getPermissionStateNative()
    permissionCache = { state, at: timestamp }
    return state
  }

  function handleNotificationClick(sessionId: string): void {
    const title = sessionTable.get(sessionId)?.title ?? sessionId
    deps.focusMainWindow()
    void deps.focusSession(sessionId, { title })
    for (const cb of clickCallbacks) cb(sessionId)
  }

  /** F3 permission-denied branch: two-layer silent degrade, never throws. */
  function degradeDenied(source: 'denied' | 'unknown'): void {
    if (deps.tray.state.present) {
      deps.tray.incrementMissed()
      if (!notifyDisabledToastShown) {
        notifyDisabledToastShown = true
        deps.showToast(t('toast.notifyDisabled'))
      }
      shellLog.warn({
        code: 'ERR_NOTIFICATION_DENIED',
        message: 'notification permission denied/DND; degraded to tray missed-count + one-time toast',
        data: { source },
      })
      return
    }
    // ERR_TRAY_UNAVAILABLE overlap: log only — no counter, no toast (F3-F2).
    shellLog.warn({
      code: 'ERR_NOTIFICATION_DENIED',
      message: 'notification permission denied/DND and tray unavailable; log-only degrade',
      data: { source },
    })
  }

  function showNotification(event: NotifyEvent, session: SessionInfo): void {
    const title = resolveTitle(session)
    const copyKey = event === 'wait-input'
      ? ({ title: 'notify.waitInput.title', body: 'notify.waitInput.body' } as const)
      : ({ title: 'notify.turnEnd.title', body: 'notify.turnEnd.body' } as const)
    const notification = deps.createNotification({
      title: t(copyKey.title),
      body: t(copyKey.body, { title }),
    })
    notification.on('click', () => handleNotificationClick(session.id))
    notification.show()
    const entry = dedupEntries.get(`${session.id}|${event}`)
    if (entry !== undefined) entry.notification = notification
  }

  function notify(event: NotifyEvent, session: SessionInfo): void {
    if (typeof session?.id !== 'string' || session.id === '') {
      shellLog.warn({
        code: 'WARN_NOTIFICATION_INVALID_SESSION',
        message: 'notify requested without a usable session id; dropped',
      })
      return
    }
    const title = resolveTitle(session)
    const row = touchSessionRow(session.id, title)
    if (event === 'wait-input') row.lastWaitAt = now()
    else row.lastTurnAt = now()

    // 10s dedup-merge: same session + same event within the window updates
    // the existing notification content (no new banner); different sessions
    // and different event types live under different keys and never merge.
    const key = `${session.id}|${event}`
    const entry = dedupEntries.get(key)
    const timestamp = now()
    if (entry !== undefined && timestamp - entry.at < DEDUP_WINDOW_MS) {
      entry.at = timestamp
      entry.count += 1
      const copyKey = event === 'wait-input' ? 'notify.waitInput.body' : 'notify.turnEnd.body'
      const body = t(copyKey, { title })
      if (entry.notification !== undefined) entry.notification.setBody(body)
      return
    }
    dedupEntries.set(key, { key, at: timestamp, count: 1 })

    void getPermissionState()
      .then((state) => {
        if (state === 'granted' || state === 'unknown') {
          // 'unknown' = no platform query API: attempt as granted, backfill
          // denied on failure (Interface 4 semantics).
          try {
            showNotification(event, session)
          } catch {
            if (state === 'unknown') {
              // Backfill denied for the rest of the run: re-querying a
              // platform without a permission API would loop 'unknown'.
              permissionBackfilled = true
              permissionCache = { state: 'denied', at: now() }
              degradeDenied(state)
            } else {
              degradeDenied('denied')
            }
          }
          return
        }
        degradeDenied('denied')
      })
      .catch(() => degradeDenied('denied'))
  }

  function handleSessionEvent(ev: HostSessionEvent): void {
    if (ev.type === 'wait-input' || ev.type === 'turn-end') {
      notify(ev.type, { id: ev.sessionId, title: ev.title })
      return
    }
    // session-list: full reconciliation — overwrite the table wholesale so
    // incremental drift from lost events is corrected (Interface 1 note).
    sessionTable.clear()
    for (const session of ev.sessions) {
      touchSessionRow(session.id, resolveTitle(session))
    }
  }

  return {
    notify,
    getPermissionState,
    onNotificationClick(cb) { clickCallbacks.push(cb) },
    handleSessionEvent,
    reset() {
      sessionTable.clear()
      for (const entry of dedupEntries.values()) entry.notification?.close()
      dedupEntries.clear()
    },
    get sessionTable() { return sessionTable },
    get dedupEntries() { return dedupEntries },
  }
}
