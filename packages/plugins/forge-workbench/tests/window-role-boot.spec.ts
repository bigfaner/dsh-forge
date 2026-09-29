// M4 task 4.3 — the C10 window-role BOOT model (AC2): the guarded preload
// face read, the handshake's shape guard, and the renderer routing (face
// absent → main SYNCHRONOUSLY — the hostless contract; face live → one
// getRole roundtrip gates the assembly; null/rejection/drifted shape → main).
import { describe, expect, it, vi } from 'vitest'
import {
  getWindowVerbFace, isDetachedRole, routeWindowBoot, subagentTargetOf,
} from '../src/client/window-role/boot.ts'
import type { WindowVerbFaceClient } from '../src/client/window-role/boot.ts'

/** Flush the handshake's promise chain (one macrotask drains every pending microtask). */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

/** A full stub face (every member callable — the guarded read's completeness rule). */
function makeFace(overrides: Partial<WindowVerbFaceClient> = {}): WindowVerbFaceClient {
  return {
    openDetached: vi.fn(async () => ({ windowId: 'detached-1' })),
    getRole: vi.fn(async () => null),
    recall: vi.fn(async () => {}),
    onChanged: vi.fn(() => () => {}),
    ...overrides,
  } as WindowVerbFaceClient
}

describe('getWindowVerbFace (the guarded preload read)', () => {
  it('answers undefined with no dshForge at all (hostless)', () => {
    delete (globalThis as { dshForge?: unknown }).dshForge
    expect(getWindowVerbFace()).toBeUndefined()
  })

  it('answers undefined for a partial face (a missing member degrades the whole face)', () => {
    ;(globalThis as { dshForge?: unknown }).dshForge = {
      window: { openDetached: async () => {}, getRole: async () => null, recall: async () => {} },
    }
    expect(getWindowVerbFace()).toBeUndefined()
    delete (globalThis as { dshForge?: unknown }).dshForge
  })

  it('answers the face when every member is callable', () => {
    const face = makeFace()
    ;(globalThis as { dshForge?: unknown }).dshForge = { window: face }
    expect(getWindowVerbFace()).toBe(face)
    delete (globalThis as { dshForge?: unknown }).dshForge
  })
})

describe('isDetachedRole (the handshake shape guard — the twins\' drift alarm)', () => {
  it('accepts a well-formed detached arm (both views; both target forms)', () => {
    expect(isDetachedRole({ kind: 'detached', windowId: 'w', projectId: 'p', view: 'board' })).toBe(true)
    expect(isDetachedRole({
      kind: 'detached', windowId: 'w', projectId: 'p', view: 'conversation', target: { sessionId: 's1' },
    })).toBe(true)
    expect(isDetachedRole({
      kind: 'detached', windowId: 'w', projectId: 'p', view: 'conversation',
      target: { parentSessionId: 'p1', childSessionId: 'c1', mode: 'one-shot' },
    })).toBe(true)
  })

  it('rejects drifted shapes (routing main — never a crash)', () => {
    expect(isDetachedRole(null)).toBe(false)
    expect(isDetachedRole({ kind: 'main' })).toBe(false)
    expect(isDetachedRole({ kind: 'detached', projectId: 'p', view: 'board' })).toBe(false)
    expect(isDetachedRole({ kind: 'detached', windowId: 'w', projectId: '', view: 'board' })).toBe(false)
    expect(isDetachedRole({ kind: 'detached', windowId: 'w', projectId: 'p', view: 'tasks' })).toBe(false)
    expect(isDetachedRole({
      kind: 'detached', windowId: 'w', projectId: 'p', view: 'conversation',
      target: { parentSessionId: 'p1', childSessionId: 'c1', mode: 'batch' },
    })).toBe(false)
  })
})

describe('subagentTargetOf', () => {
  it('narrows the triple arm and rejects the session-id arm', () => {
    const triple = { parentSessionId: 'p1', childSessionId: 'c1', mode: 'continuable' as const }
    expect(subagentTargetOf(triple)).toBe(triple)
    expect(subagentTargetOf({ sessionId: 's1' })).toBeUndefined()
    expect(subagentTargetOf(undefined)).toBeUndefined()
  })
})

describe('routeWindowBoot (AC2: the renderer routing)', () => {
  it('face ABSENT → main runs SYNCHRONOUSLY (the hostless boot contract)', () => {
    const main = vi.fn(() => () => {})
    const detached = vi.fn(() => () => {})
    const dispose = routeWindowBoot(undefined, { main, detached })
    expect(main).toHaveBeenCalledTimes(1)
    expect(detached).not.toHaveBeenCalled()
    dispose()
  })

  it('the absent-face disposer runs the assembled main disposer', () => {
    const mainDispose = vi.fn()
    const dispose = routeWindowBoot(undefined, { main: () => mainDispose, detached: () => {} })
    dispose()
    expect(mainDispose).toHaveBeenCalledTimes(1)
  })

  it('a detached arm routes the SINGLE-VIEW assembly with the role', async () => {
    const role = { kind: 'detached', windowId: 'w1', projectId: 'p1', view: 'board' } as const
    const face = makeFace({ getRole: vi.fn(async () => role) })
    const main = vi.fn(() => () => {})
    const detached = vi.fn(() => () => {})
    routeWindowBoot(face, { main, detached })
    await flush()
    expect(detached).toHaveBeenCalledTimes(1)
    expect(detached).toHaveBeenCalledWith(role)
    expect(main).not.toHaveBeenCalled()
  })

  it('null / main / a REJECTION all route the normal workbench', async () => {
    for (const answer of [null, { kind: 'main' }] as const) {
      const face = makeFace({ getRole: vi.fn(async () => answer) })
      const main = vi.fn(() => () => {})
      routeWindowBoot(face, { main, detached: () => {} })
      await flush()
      expect(main).toHaveBeenCalledTimes(1)
    }
    const failing = makeFace({ getRole: vi.fn(async () => { throw new Error('handshake lost') }) })
    const main = vi.fn(() => () => {})
    routeWindowBoot(failing, { main, detached: () => {} })
    await flush()
    expect(main).toHaveBeenCalledTimes(1)
  })

  it('a DRIFTED payload routes main (never a crash)', async () => {
    const face = makeFace({ getRole: vi.fn(async () => ({ kind: 'detached', view: 7 })) })
    const main = vi.fn(() => () => {})
    routeWindowBoot(face, { main, detached: () => {} })
    await flush()
    expect(main).toHaveBeenCalledTimes(1)
  })

  it('memoizes the handshake on the face (one getRole per renderer)', async () => {
    const face = makeFace()
    routeWindowBoot(face, { main: () => {}, detached: () => {} })
    routeWindowBoot(face, { main: () => {}, detached: () => {} })
    await flush()
    expect(face.getRole).toHaveBeenCalledTimes(1)
  })

  it('a dispose before the handshake lands leaves NOTHING assembled (no zombie seats)', async () => {
    let resolveRole: (value: unknown) => void = () => {}
    const face = makeFace({
      getRole: vi.fn(() => new Promise((resolve) => { resolveRole = resolve })),
    })
    const main = vi.fn(() => () => {})
    const detached = vi.fn(() => () => {})
    const dispose = routeWindowBoot(face, { main, detached })
    dispose()
    resolveRole({ kind: 'main' })
    await flush()
    expect(main).not.toHaveBeenCalled()
    expect(detached).not.toHaveBeenCalled()
  })

  it('the live-face disposer cancels pending AND disposes the assembled world', async () => {
    const assembledDispose = vi.fn()
    const face = makeFace()
    const dispose = routeWindowBoot(face, { main: () => assembledDispose, detached: () => {} })
    await flush()
    dispose()
    expect(assembledDispose).toHaveBeenCalledTimes(1)
  })
})
