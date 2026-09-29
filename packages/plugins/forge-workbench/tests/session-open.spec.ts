import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  createSessionOpenChannel, isSubagentAddressTarget, SESSION_OPEN_ERROR,
  SUBAGENT_CHAT_ADDRESS_PREFIX, subagentChatAddressOf,
} from '../src/client/session-open.ts'
import type { ViewSwitchController } from '../src/client/nav/view-switch.ts'
import type { LineageSubagentAddress } from '../src/client/lineage'

// M4 task 2.7 — Interface 6 会话打开通道 (tech-design §Interfaces·Interface 6).
// AC map:
//   AC1 三通路分发 — 顶层 (string → switchSession + openSession(sessionId)),
//      subagent (address triple → the SAME native openSession taking
//      SubagentAddress verbatim), 旁置 (sidebarRight.openResource(
//      subagentChatAddress, { preferNewPane }) — the ui-subagent precedent,
//      NO view switch). The M1 sessionFocus main-process channel is NOT part
//      of the channel (frozen fallback — nothing else is ever touched).
//   Failure contract — absent services / malformed targets / throwing opens
//      REJECT (the C5 seam toasts; never silent, never a sync throw).
//   The address twin — subagentChatAddressOf 对拍 ui-subagent's format.

/** A recording ViewSwitchController double. */
function makeController(): { controller: ViewSwitchController; switches: number } {
  const switches = { count: 0 }
  const controller = {
    switchSession: () => { switches.count += 1 },
  } as unknown as ViewSwitchController
  return { controller, switches }
}

/** A fake client ctx over a service map (absent services make ctx.get throw). */
function makeCtx(services: Record<string, unknown>): Context {
  return {
    get: (name: string): unknown => {
      if (!(name in services)) throw new Error(`service "${name}" is not injected`)
      return services[name]
    },
  } as unknown as Context
}

const ADDRESS: LineageSubagentAddress = Object.freeze({
  parentSessionId: 'top-1',
  childSessionId: 'sub/需要编码',
  mode: 'continuable',
})

describe('AC1: 顶层 path — switch FIRST, then the one openSession write path', () => {
  it('a string target: switchSession then openSession(sessionId), resolves', async () => {
    const openSession = vi.fn()
    const { controller, switches } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ uiWorkspace: { openSession } }), controller)
    await expect(channel.openSessionTarget('sess-1')).resolves.toBeUndefined()
    expect(switches.count).toBe(1)
    expect(openSession).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith('sess-1')
  })

  it('an absent uiWorkspace rejects BEFORE any view switch (no stranded navigation)', async () => {
    const { controller, switches } = makeController()
    const channel = createSessionOpenChannel(makeCtx({}), controller)
    await expect(channel.openSessionTarget('sess-1')).rejects.toThrow(SESSION_OPEN_ERROR)
    expect(switches.count).toBe(0)
  })

  it('a throwing openSession rejects (the C5 toast contract — the 2.6 record)', async () => {
    const openSession = vi.fn(() => { throw new Error('retain: unknown session') })
    const { controller } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ uiWorkspace: { openSession } }), controller)
    await expect(channel.openSessionTarget('sess-x')).rejects.toThrow(SESSION_OPEN_ERROR)
  })
})

describe('AC1: subagent path — the same native API taking SubagentAddress', () => {
  it('an address target: switchSession then openSession(address) VERBATIM', async () => {
    const openSession = vi.fn()
    const { controller, switches } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ uiWorkspace: { openSession } }), controller)
    await expect(channel.openSessionTarget(ADDRESS)).resolves.toBeUndefined()
    expect(switches.count).toBe(1)
    // The address triple rides the native call UNTOUCHED — `mode` IS the
    // upstream SubagentListEntry.mode the 2.5 lineage hits carry.
    expect(openSession).toHaveBeenCalledWith(ADDRESS)
  })

  it('a malformed object target rejects with NOTHING upstream called', async () => {
    const openSession = vi.fn()
    const { controller, switches } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ uiWorkspace: { openSession } }), controller)
    const malformed = { parentSessionId: 'top-1', childSessionId: 'sub-1', mode: 'bogus' } as never
    await expect(channel.openSessionTarget(malformed)).rejects.toThrow(SESSION_OPEN_ERROR)
    expect(openSession).not.toHaveBeenCalled()
    expect(switches.count).toBe(0)
  })
})

describe('AC1: 旁置 path — sidebarRight.openResource, the ui-subagent precedent', () => {
  it('aside: openResource(subagentChatAddress, { kind, preferNewPane }) — NO view switch', async () => {
    const openResource = vi.fn()
    const { controller, switches } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ sidebarRight: { openResource } }), controller)
    await expect(channel.openSessionTargetAside(ADDRESS)).resolves.toBeUndefined()
    // The conversation column is untouched — no switchSession on the aside leg.
    expect(switches.count).toBe(0)
    expect(openResource).toHaveBeenCalledTimes(1)
    expect(openResource).toHaveBeenCalledWith(
      'dsh-resource://subagentchat/session/sub%2F%E9%9C%80%E8%A6%81%E7%BC%96%E7%A0%81?parent=top-1&mode=continuable',
      { kind: 'subagentchat', preferNewPane: true },
    )
  })

  it('an absent sidebarRight rejects (guarded read, never a load gate)', async () => {
    const { controller } = makeController()
    const channel = createSessionOpenChannel(makeCtx({}), controller)
    await expect(channel.openSessionTargetAside(ADDRESS)).rejects.toThrow(SESSION_OPEN_ERROR)
  })

  it('a throwing openResource rejects', async () => {
    const openResource = vi.fn(() => { throw new Error('no pane') })
    const { controller } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ sidebarRight: { openResource } }), controller)
    await expect(channel.openSessionTargetAside(ADDRESS)).rejects.toThrow(SESSION_OPEN_ERROR)
  })

  it('a malformed aside address rejects before any upstream call', async () => {
    const openResource = vi.fn()
    const { controller } = makeController()
    const channel = createSessionOpenChannel(makeCtx({ sidebarRight: { openResource } }), controller)
    const malformed = { parentSessionId: '', childSessionId: 'sub-1', mode: 'one-shot' } as never
    await expect(channel.openSessionTargetAside(malformed)).rejects.toThrow(SESSION_OPEN_ERROR)
    expect(openResource).not.toHaveBeenCalled()
  })
})

describe('the address twin (对拍 ui-subagent sidebar-chat)', () => {
  it('subagentChatAddressOf builds the canonical resource address', () => {
    expect(subagentChatAddressOf({ parentSessionId: 'top', childSessionId: 'child 1', mode: 'one-shot' }))
      .toBe(`${SUBAGENT_CHAT_ADDRESS_PREFIX}child%201?parent=top&mode=one-shot`)
  })

  it('isSubagentAddressTarget narrows the object arm', () => {
    expect(isSubagentAddressTarget(ADDRESS)).toBe(true)
    expect(isSubagentAddressTarget('sess')).toBe(false)
    expect(isSubagentAddressTarget(null)).toBe(false)
    expect(isSubagentAddressTarget({ parentSessionId: 'top', childSessionId: '' , mode: 'one-shot' })).toBe(false)
    expect(isSubagentAddressTarget({ parentSessionId: 'top', childSessionId: 'c', mode: 'weird' })).toBe(false)
  })
})
