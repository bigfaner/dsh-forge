import { describe, expect, it, vi } from 'vitest'
import { createNotifier, DEDUP_WINDOW_MS, PERMISSION_CACHE_MS, SESSION_TABLE_LRU_CAP } from '../src/main/notifier/index.ts'
import type { OsNotification } from '../src/main/notifier/index.ts'
import { resetForTest } from '../src/main/i18n/index.ts'

// Task 4.6 AC (Interface 4 / F3 / Data Models, ui-design §Component 系统通知):
//   - 10s dedup-merge: window merge / cross-window pass / no cross-event dedup
//   - permission two-layer degrade (tray present = counter + one-time toast;
//     tray absent = log only)
//   - notification click carries sessionId and goes through focusSession
//   - SessionTable LRU-200 eviction
// The module is dependency-injected, so all OS surfaces are fakes.

interface FakeNotification extends OsNotification {
  body: string
  clicks: Array<() => void>
  closed: boolean
}

function makeDeps(overrides: Partial<Parameters<typeof createNotifier>[0]> = {}) {
  let clock = 1_000_000
  const created: FakeNotification[] = []
  const nativePermission = vi.fn(async () => 'granted' as const)
  const deps = {
    createNotification: vi.fn(({ title, body }: { title: string; body: string }): FakeNotification => {
      const notification: FakeNotification = {
        body,
        closed: false,
        clicks: [],
        show: vi.fn(),
        close() { this.closed = true },
        on(_event: 'click', listener: () => void) { this.clicks.push(listener); return this },
        setBody(next: string) { this.body = next },
      }
      void title
      created.push(notification)
      return notification
    }),
    getPermissionStateNative: nativePermission,
    tray: { state: { present: true }, incrementMissed: vi.fn() },
    showToast: vi.fn(),
    focusMainWindow: vi.fn(),
    focusSession: vi.fn(async () => false),
    now: () => clock,
    ...overrides,
  }
  return { deps, created, nativePermission, advance: (ms: number) => { clock += ms } }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('notifier (Interface 4, UF2)', () => {
  it('dedups same session + same event within the 10s window by updating content', async () => {
    resetForTest()
    const { deps, created } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'Alpha' })
    await flush()
    notifier.notify('wait-input', { id: 's1', title: 'Alpha v2' })
    await flush()
    expect(deps.createNotification).toHaveBeenCalledTimes(1)
    expect(created[0].body).toContain('Alpha v2')
    expect(notifier.dedupEntries.get('s1|wait-input')).toMatchObject({ count: 2 })
  })

  it('passes a new notification once the 10s window has elapsed', async () => {
    resetForTest()
    const { deps, advance } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('turn-end', { id: 's1', title: 'Alpha' })
    await flush()
    advance(DEDUP_WINDOW_MS + 1)
    notifier.notify('turn-end', { id: 's1', title: 'Alpha' })
    await flush()
    expect(deps.createNotification).toHaveBeenCalledTimes(2)
  })

  it('never dedups different sessions or different event types', async () => {
    resetForTest()
    const { deps } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    notifier.notify('wait-input', { id: 's2', title: 'B' }) // different session
    notifier.notify('turn-end', { id: 's1', title: 'A' }) // different event type
    await flush()
    expect(deps.createNotification).toHaveBeenCalledTimes(3)
  })

  it('degrades to tray counter + one-time toast when permission is denied and the tray is present', async () => {
    resetForTest()
    const { deps } = makeDeps({ getPermissionStateNative: vi.fn(async () => 'denied' as const) })
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    await flush()
    expect(deps.createNotification).not.toHaveBeenCalled()
    expect(deps.tray.incrementMissed).toHaveBeenCalledTimes(1)
    expect(deps.showToast).toHaveBeenCalledTimes(1)
    expect(deps.showToast).toHaveBeenCalledWith('系统通知已禁用,可在系统设置中开启')
    notifier.notify('turn-end', { id: 's1', title: 'A' })
    await flush()
    expect(deps.tray.incrementMissed).toHaveBeenCalledTimes(2) // counter keeps counting
    expect(deps.showToast).toHaveBeenCalledTimes(1) // toast stays one-time
  })

  it('degrades to log only (no counter, no toast) when the tray is absent', async () => {
    resetForTest()
    const { deps } = makeDeps({
      getPermissionStateNative: vi.fn(async () => 'denied' as const),
      tray: { state: { present: false }, incrementMissed: vi.fn() },
    })
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    await flush()
    expect(deps.createNotification).not.toHaveBeenCalled()
    expect(deps.tray.incrementMissed).not.toHaveBeenCalled()
    expect(deps.showToast).not.toHaveBeenCalled()
  })

  it("treats 'unknown' as granted first and backfills denied on failure", async () => {
    resetForTest()
    const nativePermission = vi.fn(async () => 'unknown' as const)
    const { deps } = makeDeps({ getPermissionStateNative: nativePermission })
    deps.createNotification.mockImplementation(() => {
      throw new Error('permission denied by OS')
    })
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    await flush()
    expect(deps.tray.incrementMissed).toHaveBeenCalledTimes(1) // degrade on backfill
    // Subsequent notify short-circuits to denied without re-attempting the show.
    notifier.notify('wait-input', { id: 's2', title: 'B' })
    await flush()
    expect(deps.createNotification).toHaveBeenCalledTimes(1) // only the first failed attempt
    expect(nativePermission).toHaveBeenCalled() // queried, but result overridden
    await expect(notifier.getPermissionState()).resolves.toBe('denied')
  })

  it('caches getPermissionState for 300ms', async () => {
    const { deps, nativePermission, advance } = makeDeps()
    const notifier = createNotifier(deps)
    await notifier.getPermissionState()
    await notifier.getPermissionState()
    expect(nativePermission).toHaveBeenCalledTimes(1)
    advance(PERMISSION_CACHE_MS + 1)
    await notifier.getPermissionState()
    expect(nativePermission).toHaveBeenCalledTimes(2)
  })

  it('carries sessionId on click and routes it through focusSession', async () => {
    resetForTest()
    const { deps, created } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 'session-42', title: 'Refactor plan' })
    await flush()
    const clicked: string[] = []
    notifier.onNotificationClick((sessionId) => { clicked.push(sessionId) })
    created[0].clicks[0]()
    expect(clicked).toEqual(['session-42'])
    expect(deps.focusMainWindow).toHaveBeenCalledTimes(1)
    expect(deps.focusSession).toHaveBeenCalledWith('session-42', { title: 'Refactor plan' })
  })

  it('falls back to id.slice(0, 8) when the session title is empty', async () => {
    resetForTest()
    const { deps, created } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 'abcdefgh1234', title: '' })
    await flush()
    expect(created[0].body).toContain('abcdefgh')
    expect(notifier.sessionTable.get('abcdefgh1234')?.title).toBe('abcdefgh')
  })

  it('maintains SessionTable from events and reconciles via session-list', () => {
    resetForTest()
    const { deps } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.handleSessionEvent({ type: 'wait-input', sessionId: 's1', title: 'A' })
    notifier.handleSessionEvent({ type: 'turn-end', sessionId: 's1', title: 'A2' })
    expect(notifier.sessionTable.get('s1')).toMatchObject({ title: 'A2' })
    expect(notifier.sessionTable.get('s1')?.lastWaitAt).toBeGreaterThan(0)
    expect(notifier.sessionTable.get('s1')?.lastTurnAt).toBeGreaterThan(0)
    notifier.handleSessionEvent({ type: 'session-list', sessions: [{ id: 's9', title: 'Only' }] })
    expect([...notifier.sessionTable.keys()]).toEqual(['s9'])
    expect(notifier.sessionTable.get('s9')).toMatchObject({ title: 'Only' })
  })

  it('evicts the least-recently-used entry beyond the 200-entry LRU cap', () => {
    resetForTest()
    const { deps } = makeDeps()
    const notifier = createNotifier(deps)
    for (let index = 0; index < SESSION_TABLE_LRU_CAP + 5; index += 1) {
      notifier.handleSessionEvent({ type: 'turn-end', sessionId: `s${String(index)}`, title: `t${String(index)}` })
    }
    expect(notifier.sessionTable.size).toBe(SESSION_TABLE_LRU_CAP)
    expect(notifier.sessionTable.has('s0')).toBe(false) // oldest evicted
    expect(notifier.sessionTable.has(`s${String(SESSION_TABLE_LRU_CAP + 4)}`)).toBe(true)
  })

  it('clears SessionTable and zeroes dedup entries on host-exit reset', async () => {
    resetForTest()
    const { deps, created } = makeDeps()
    const notifier = createNotifier(deps)
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    notifier.handleSessionEvent({ type: 'turn-end', sessionId: 's2', title: 'B' })
    await flush()
    notifier.reset()
    expect(notifier.sessionTable.size).toBe(0)
    expect(notifier.dedupEntries.size).toBe(0)
    expect(created[0].closed).toBe(true)
    // Post-reset events are not swallowed by the pre-crash dedup window.
    const before = deps.createNotification.mock.calls.length
    notifier.notify('wait-input', { id: 's1', title: 'A' })
    await flush()
    expect(deps.createNotification.mock.calls.length).toBe(before + 1)
  })
})
