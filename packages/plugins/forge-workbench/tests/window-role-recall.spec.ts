// M4 task 4.3 — the C10 拆出/收回 MODEL (AC1/AC3/AC4, mock 动词): the aside
// address parser's round trip, the [拆出为窗口] action bodies (openDetached
// FIRST — the pane removal is the CALLER's, only on the resolved promise),
// the pure pane-restore decision (board / aside / session legs), and the
// main window's window-changed reaction (registry tracking, restores, the
// removed-project skip).
import { describe, expect, it, vi } from 'vitest'
import { subagentChatAddressOf } from '../src/client/session-open.ts'
import {
  detachBoardToWindow, detachConversationToWindow, installWindowRecallSync,
  parseSubagentChatAddress, restoreDetachedPane,
} from '../src/client/window-role/recall.ts'
import type { WindowVerbFaceClient } from '../src/client/window-role/boot.ts'
import type { WindowChangedEventClient } from '../src/client/window-role/boot.ts'

const TRIPLE = { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' as const }

/** A full stub face whose event listeners the test fires manually. */
function makeHarness(overrides: Partial<WindowVerbFaceClient> = {}): {
  face: WindowVerbFaceClient
  emit(event: WindowChangedEventClient): void
  listenerCount(): number
} {
  const listeners: Array<(event: WindowChangedEventClient) => void> = []
  const face: WindowVerbFaceClient = {
    openDetached: vi.fn(async () => ({ windowId: 'detached-1' })),
    getRole: vi.fn(async () => null),
    recall: vi.fn(async () => {}),
    onChanged: vi.fn((callback: (event: WindowChangedEventClient) => void) => {
      listeners.push(callback)
      return () => {
        const index = listeners.indexOf(callback)
        if (index >= 0) listeners.splice(index, 1)
      }
    }),
    ...overrides,
  } as WindowVerbFaceClient
  return {
    face,
    emit: (event) => { for (const listener of [...listeners]) listener(event) },
    listenerCount: () => listeners.length,
  }
}

describe('parseSubagentChatAddress (the aside origin\'s target read)', () => {
  it('round-trips subagentChatAddressOf', () => {
    expect(parseSubagentChatAddress(subagentChatAddressOf(TRIPLE))).toEqual(TRIPLE)
    expect(parseSubagentChatAddress(
      subagentChatAddressOf({ parentSessionId: 'p', childSessionId: 'c/参数', mode: 'one-shot' }),
    )).toEqual({ parentSessionId: 'p', childSessionId: 'c/参数', mode: 'one-shot' })
  })

  it('answers undefined for anything that is not a subagentchat address', () => {
    expect(parseSubagentChatAddress('board')).toBeUndefined()
    expect(parseSubagentChatAddress('dsh-resource://terminal/session/x')).toBeUndefined()
    expect(parseSubagentChatAddress('dsh-resource://subagentchat/session/?parent=p&mode=one-shot')).toBeUndefined()
    expect(parseSubagentChatAddress('dsh-resource://subagentchat/session/c1?mode=one-shot')).toBeUndefined()
    expect(parseSubagentChatAddress('dsh-resource://subagentchat/session/c1?parent=p&mode=batch')).toBeUndefined()
  })
})

describe('detachBoardToWindow (AC1: pane 头动作 → windowOpenDetached)', () => {
  it('carries { projectId, view: "board" } and resolves true on the opened window', async () => {
    const openDetached = vi.fn(async () => ({ windowId: 'detached-9' }))
    await expect(detachBoardToWindow({ ...makeHarness().face, openDetached } as WindowVerbFaceClient, 'p1'))
      .resolves.toBe(true)
    expect(openDetached).toHaveBeenCalledWith({ projectId: 'p1', view: 'board' })
  })

  it('resolves FALSE on a rejected open (the pane stays — never a lost view)', async () => {
    const openDetached = vi.fn(async () => { throw new Error('{"code":"ERR_WINDOW_OPEN_FAILED"}') })
    await expect(detachBoardToWindow({ ...makeHarness().face, openDetached } as WindowVerbFaceClient, 'p1'))
      .resolves.toBe(false)
  })

  it('threads the replay rect when present (the 4.5 carrier)', async () => {
    const openDetached = vi.fn(async () => ({ windowId: 'detached-2' }))
    await detachBoardToWindow({ ...makeHarness().face, openDetached } as WindowVerbFaceClient, 'p1',
      { x: 10, y: 20, width: 960, height: 640 })
    expect(openDetached).toHaveBeenCalledWith({
      projectId: 'p1', view: 'board', rect: { x: 10, y: 20, width: 960, height: 640 },
    })
  })
})

describe('detachConversationToWindow (the conversation origin)', () => {
  it('carries { view: "conversation", target } for the aside triple', async () => {
    const openDetached = vi.fn(async () => ({ windowId: 'detached-3' }))
    await detachConversationToWindow({ ...makeHarness().face, openDetached } as WindowVerbFaceClient, 'p1', TRIPLE)
    expect(openDetached).toHaveBeenCalledWith({ projectId: 'p1', view: 'conversation', target: TRIPLE })
  })

  it('resolves false on a rejected open (the tab stays)', async () => {
    const openDetached = vi.fn(async () => { throw new Error('open failed') })
    await expect(detachConversationToWindow({ ...makeHarness().face, openDetached } as WindowVerbFaceClient, 'p1', { sessionId: 's1' }))
      .resolves.toBe(false)
  })
})

describe('restoreDetachedPane (AC3: 收回 → pane 回主窗, pure)', () => {
  it('board → the rightbar board pane (openTab board, preferNewPane)', () => {
    const sidebarRight = { openTab: vi.fn(), openResource: vi.fn() }
    const outcome = restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'board' },
      { sidebarRight },
    )
    expect(outcome).toEqual({ leg: 'board', paneOpened: true })
    expect(sidebarRight.openTab).toHaveBeenCalledWith('board', { preferNewPane: true })
    expect(sidebarRight.openResource).not.toHaveBeenCalled()
  })

  it('conversation + triple → the 2.7 旁置 pane (the same address + call shape)', () => {
    const sidebarRight = { openTab: vi.fn(), openResource: vi.fn() }
    const outcome = restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'conversation', target: TRIPLE },
      { sidebarRight },
    )
    expect(outcome).toEqual({ leg: 'aside', paneOpened: true })
    expect(sidebarRight.openResource).toHaveBeenCalledWith(
      subagentChatAddressOf(TRIPLE), { kind: 'subagentchat', preferNewPane: true },
    )
  })

  it('conversation + sessionId → the Interface 6 one write path (openSession)', () => {
    const openSession = vi.fn()
    const outcome = restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'conversation', target: { sessionId: 's9' } },
      { session: { openSession } },
    )
    expect(outcome).toEqual({ leg: 'session', paneOpened: false })
    expect(openSession).toHaveBeenCalledWith('s9')
  })

  it('absent faces degrade (leg none/board-unopened); a throwing face never throws out', () => {
    expect(restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'conversation' }, {},
    )).toEqual({ leg: 'none', paneOpened: false })
    expect(restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'board' }, {},
    )).toEqual({ leg: 'board', paneOpened: false })
    const throwing = { openTab: vi.fn(() => { throw new Error('rebind window') }) }
    expect(restoreDetachedPane(
      { type: 'detached-closed', windowId: 'w', projectId: 'p', view: 'board' }, { sidebarRight: throwing },
    )).toEqual({ leg: 'none', paneOpened: false })
  })
})

describe('installWindowRecallSync (AC3/AC4: the main window\'s event reaction)', () => {
  it('tracks the live set — countFor answers per project (绑定来源项目)', () => {
    const harness = makeHarness()
    const sync = installWindowRecallSync({
      face: harness.face,
      getSidebarRight: () => undefined,
    })
    expect(sync.countFor('p1')).toBe(0)
    harness.emit({ type: 'detached-opened', windowId: 'w1', projectId: 'p1', view: 'board' })
    harness.emit({ type: 'detached-opened', windowId: 'w2', projectId: 'p1', view: 'conversation' })
    harness.emit({ type: 'detached-opened', windowId: 'w3', projectId: 'p2', view: 'board' })
    expect(sync.countFor('p1')).toBe(2)
    expect(sync.countFor('p2')).toBe(1)
    sync.dispose()
  })

  it('detached-closed RESTORES the pane through the live faces (不待重启)', () => {
    const harness = makeHarness()
    const sidebarRight = { openTab: vi.fn(), openResource: vi.fn() }
    const openSession = vi.fn()
    installWindowRecallSync({
      face: harness.face,
      getSidebarRight: () => sidebarRight,
      getOpenSession: () => ({ openSession }),
    })
    harness.emit({ type: 'detached-closed', windowId: 'w1', projectId: 'p1', view: 'board' })
    expect(sidebarRight.openTab).toHaveBeenCalledWith('board', { preferNewPane: true })
    harness.emit({ type: 'detached-closed', windowId: 'w2', projectId: 'p1', view: 'conversation', target: TRIPLE })
    expect(sidebarRight.openResource).toHaveBeenCalledWith(
      subagentChatAddressOf(TRIPLE), { kind: 'subagentchat', preferNewPane: true },
    )
    harness.emit({ type: 'detached-closed', windowId: 'w3', projectId: 'p1', view: 'conversation', target: { sessionId: 's1' } })
    expect(openSession).toHaveBeenCalledWith('s1')
  })

  it('markRemoved (the delete flow, set PRE-verb) → the closures restore NOTHING', () => {
    const harness = makeHarness()
    const sidebarRight = { openTab: vi.fn(), openResource: vi.fn() }
    const openSession = vi.fn()
    const sync = installWindowRecallSync({
      face: harness.face,
      getSidebarRight: () => sidebarRight,
      getOpenSession: () => ({ openSession }),
    })
    harness.emit({ type: 'detached-opened', windowId: 'w1', projectId: 'p1', view: 'board' })
    harness.emit({ type: 'detached-opened', windowId: 'w2', projectId: 'p1', view: 'board' })
    // The delete confirm: mark FIRST (the events can never race the mark), then
    // the kernel's recallProjectWindows closes both windows.
    sync.markRemoved('p1')
    harness.emit({ type: 'detached-closed', windowId: 'w1', projectId: 'p1', view: 'board' })
    harness.emit({ type: 'detached-closed', windowId: 'w2', projectId: 'p1', view: 'board' })
    expect(sidebarRight.openTab).not.toHaveBeenCalled()
    expect(sync.countFor('p1')).toBe(0)
    sync.dispose()
  })

  it('dispose unsubscribes (a torn-down main window reacts to nothing)', () => {
    const harness = makeHarness()
    const sidebarRight = { openTab: vi.fn(), openResource: vi.fn() }
    const sync = installWindowRecallSync({ face: harness.face, getSidebarRight: () => sidebarRight })
    expect(harness.listenerCount()).toBe(1)
    sync.dispose()
    expect(harness.listenerCount()).toBe(0)
    harness.emit({ type: 'detached-closed', windowId: 'w1', projectId: 'p1', view: 'board' })
    expect(sidebarRight.openTab).not.toHaveBeenCalled()
  })
})
