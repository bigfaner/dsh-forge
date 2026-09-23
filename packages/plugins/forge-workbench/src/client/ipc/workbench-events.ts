/**
 * The renderer's SINGLE-SUBSCRIBER event channel (task 5.15 — the G3 core's
 * client half): Interface 1's `workbench.onEvents` is a single-subscriber
 * verb, and the main-side registry (handlers.ts) keys on the webContents —
 * ANY renderer-side unsubscribe deregisters the WHOLE renderer, so two
 * independent `bridge.onEvents` calls cannot coexist (the first teardown
 * would silently kill the other's push). The workbench families that listen
 * (5.14's overview store for `sync`, 5.15's task-board store + the page's
 * presentation leg for `task_updated`) therefore multiplex over THIS module:
 *
 *   - at most ONE preload subscription exists at any moment, acquired
 *     lazily on the first listener and RELEASED only when the last listener
 *     detaches (the refcount never lets one family's teardown strand
 *     another's channel);
 *   - dispatch fans a pushed batch out to every live listener (the copy
 *     iteration tolerates a listener detaching mid-dispatch);
 *   - sources are keyed by BRIDGE identity (WeakMap): the real host hands
 *     every `getWorkbenchIpcBridge()` caller the same exposed namespace
 *     object, so all real-path consumers share one source, while unit tests
 *     with per-test fake bridges stay isolated from each other.
 *
 * TECH-electron-ipc-001 discipline holds: the channel is the preload verb's
 * own — no raw ipcRenderer access ever crosses this module.
 */
import type { WorkbenchEvent } from '../ipc-types'
import type { WorkbenchIpcBridge } from './workbench'

/** A push-batch listener (the Interface 1 onEvents callback shape). */
export type WorkbenchEventListener = (events: readonly WorkbenchEvent[]) => void

/** The multiplexed single-subscriber channel over one bridge. */
export interface WorkbenchEventSource {
  /**
   * Attach a listener; the first attach acquires THE preload subscription,
   * the last detach releases it. Returns the listener's unsubscribe.
   */
  subscribe(listener: WorkbenchEventListener): () => void
}

/** Live sources by bridge identity (see the module note for the keying). */
const SOURCES = new WeakMap<WorkbenchIpcBridge, WorkbenchEventSource>()

/**
 * The shared event source over a bridge. Repeated calls with the same bridge
 * return the SAME source — the one preload subscription that bridge's whole
 * renderer-side audience multiplexes over.
 */
export function getWorkbenchEventSource(bridge: WorkbenchIpcBridge): WorkbenchEventSource {
  const existing = SOURCES.get(bridge)
  if (existing !== undefined) return existing
  const listeners = new Set<WorkbenchEventListener>()
  let release: (() => void) | undefined
  const dispatch = (events: readonly WorkbenchEvent[]): void => {
    // Copy: a listener detaching inside another listener's callback must not
    // mutate the iteration (and a mid-dispatch ATTACH misses this batch by
    // design — batches are push facts, not replayable state).
    for (const listener of [...listeners]) listener(events)
  }
  const source: WorkbenchEventSource = {
    subscribe(listener) {
      listeners.add(listener)
      // Acquire exactly once per empty→non-empty transition; the release
      // below is the matching non-empty→empty edge, so the preload
      // subscription's lifetime is exactly "some renderer listener exists".
      release ??= bridge.onEvents(dispatch)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && release !== undefined) {
          release()
          release = undefined
        }
      }
    },
  }
  SOURCES.set(bridge, source)
  return source
}
