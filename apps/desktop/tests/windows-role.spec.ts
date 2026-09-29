// 任务 4.2 — windowGetRole 供给 + dsh-forge:window-* 动词面单测(tech-design
// §Interfaces·Interface 5 + §Security·T3「role 经主进程供给(不信任 URL)」;
// AC-2/AC-3)。
//
// Hard Rule 断言面:禁 URL hash 传角色 —— resolveWindowRole 的输入只有
// webContents 身份(注册表匹配),全链路零 URL 读取;typed 握手载荷 =
// WindowRole 判别联合。动词面:通道白名单恰好三通道、sender 校验
// (ERR_IPC_SENDER_REJECTED)、形状校验、域错误封装(ERR_WINDOW_* envelope)、
// preload 通道副本 drift 锁(workbench 面 ipc-verbs/workbench-ipc 同款纪律)。

import { describe, expect, it, vi, afterEach } from 'vitest'
import { WINDOW_VERB_CHANNELS, isWhitelistedWindowVerbChannel } from '../src/main/windows/channels.ts'
import { installWindowVerbs, type WindowVerbEvent } from '../src/main/windows/ipc.ts'
import { resolveWindowRole } from '../src/main/windows/role.ts'
import { createWindowRegistry, type RegistryWebContents } from '../src/main/windows/registry.ts'
import { WINDOW_VERB_CHANNELS as PRELOAD_WINDOW_VERB_CHANNELS, WINDOW_CHANGED_CHANNEL as PRELOAD_WINDOW_CHANGED_CHANNEL } from '../src/preload/channel-allowlist.ts'
import { WINDOW_CHANGED_CHANNEL } from '../src/main/windows/channels.ts'

let contentsSeq = 0

function fakeContents(): RegistryWebContents & { sent: Array<[string, unknown]> } {
  const contents: RegistryWebContents & { sent: Array<[string, unknown]> } = {
    id: ++contentsSeq,
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => { contents.sent.push([channel, payload]) },
    sent: [],
  }
  return contents
}

function fakeWindow() {
  const webContents = fakeContents()
  return { isDestroyed: () => false, webContents }
}

const OWNED: WindowVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }
const FOREIGN: WindowVerbEvent = { senderFrame: { url: 'https://evil.example/' } }

function errorSink(): string[] {
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stderr.write)
  return lines
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// role 供给(AC-2;Hard Rule:零 URL)
// ---------------------------------------------------------------------------

describe('resolveWindowRole — registry-supplied, URL-free', () => {
  it('answers { kind: "main" } for the main window webContents', () => {
    const registry = createWindowRegistry()
    const main = fakeWindow()
    registry.setMainWindow(main)
    expect(resolveWindowRole(registry, main.webContents)).toEqual({ kind: 'main' })
  })

  it('answers the full detached role (windowId/projectId/view/target) for a detached window', () => {
    const registry = createWindowRegistry()
    const main = fakeWindow()
    registry.setMainWindow(main)
    const target = { sessionId: 's-1' }
    const detached = fakeWindow()
    registry.addDetached({ windowId: 'detached-7', projectId: 'p-1', view: 'conversation', target, window: detached })

    expect(resolveWindowRole(registry, detached.webContents)).toEqual({
      kind: 'detached',
      windowId: 'detached-7',
      projectId: 'p-1',
      view: 'conversation',
      target,
    })
    // 主窗判定不受 detached 集影响。
    expect(resolveWindowRole(registry, main.webContents)).toEqual({ kind: 'main' })
  })

  it('omits the optional target key when the entry carries none', () => {
    const registry = createWindowRegistry()
    const detached = fakeWindow()
    registry.addDetached({ windowId: 'detached-1', projectId: 'p-1', view: 'board', window: detached })
    const role = resolveWindowRole(registry, detached.webContents)
    expect(role).toEqual({ kind: 'detached', windowId: 'detached-1', projectId: 'p-1', view: 'board' })
    expect(role).not.toHaveProperty('target')
  })

  it('answers null for unknown senders and absent senders (boot-race legal state)', () => {
    const registry = createWindowRegistry()
    expect(resolveWindowRole(registry, fakeContents())).toBeNull()
    expect(resolveWindowRole(registry, undefined)).toBeNull()
  })

  it('answers null once the window is destroyed (stale handshake must not resolve)', () => {
    const registry = createWindowRegistry()
    const detached = fakeWindow()
    registry.addDetached({ windowId: 'detached-1', projectId: 'p-1', view: 'board', window: detached })
    detached.isDestroyed = () => true
    expect(resolveWindowRole(registry, detached.webContents)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 动词面(AC-3 白名单 + sender 校验 + 形状校验 + 错误封装)
// ---------------------------------------------------------------------------

function installed(services: {
  openDetached: (input: { projectId: string; view: 'board' | 'conversation'; target?: unknown; rect?: unknown }) => { windowId: string }
  getRole: (sender: RegistryWebContents | undefined) => unknown
  recall: (windowId: string) => void
}) {
  const handlers = new Map<string, (event: WindowVerbEvent, ...args: unknown[]) => unknown>()
  installWindowVerbs((channel, listener) => { handlers.set(channel, listener) }, services)
  return handlers
}

describe('window verb channels (whitelist + preload drift lock)', () => {
  it('contains exactly the three dsh-forge:window-* channels', () => {
    expect(Object.values(WINDOW_VERB_CHANNELS).sort()).toEqual([
      'dsh-forge:window-get-role',
      'dsh-forge:window-open-detached',
      'dsh-forge:window-recall',
    ])
    expect(isWhitelistedWindowVerbChannel('dsh-forge:window-open-detached')).toBe(true)
    for (const off of ['dsh-forge:window-eval', 'dsh-forge:workbench-get-state', 'dsh-forge:window-open-detached-forged', '']) {
      expect(isWhitelistedWindowVerbChannel(off)).toBe(false)
    }
  })

  it('preload-side channel table copy stays deep-equal with the main-side source of truth', () => {
    expect(PRELOAD_WINDOW_VERB_CHANNELS).toEqual(WINDOW_VERB_CHANNELS)
    expect(PRELOAD_WINDOW_CHANGED_CHANNEL).toBe(WINDOW_CHANGED_CHANNEL)
  })
})

describe('installWindowVerbs — sender validation', () => {
  it('rejects and logs verbs from a foreign frame before any service work', () => {
    const lines = errorSink()
    const openDetached = vi.fn()
    const handlers = installed({
      openDetached,
      getRole: () => null,
      recall: () => {},
    })
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(FOREIGN, { projectId: 'p-1', view: 'board' }))
      .toThrow(/unowned frame/)
    expect(openDetached).not.toHaveBeenCalled()
    expect(lines.some(line => line.includes('ERR_IPC_SENDER_REJECTED') && line.includes(WINDOW_VERB_CHANNELS.openDetached))).toBe(true)
  })

  it('getRole routes the invoking webContents (typed handshake over the verb face)', () => {
    const registry = createWindowRegistry()
    const main = fakeWindow()
    registry.setMainWindow(main)
    const handlers = installed({
      openDetached: () => ({ windowId: 'x' }),
      getRole: sender => resolveWindowRole(registry, sender),
      recall: () => {},
    })
    expect(handlers.get(WINDOW_VERB_CHANNELS.getRole)?.({ ...OWNED, sender: main.webContents })).toEqual({ kind: 'main' })
    expect(handlers.get(WINDOW_VERB_CHANNELS.getRole)?.({ ...OWNED, sender: fakeContents() })).toBeNull()
    expect(handlers.get(WINDOW_VERB_CHANNELS.getRole)?.(OWNED)).toBeNull() // sender 缺席 → null 兜底
  })
})

describe('installWindowVerbs — shape validation (caller contract errors)', () => {
  const handlers = installed({
    openDetached: () => ({ windowId: 'detached-1' }),
    getRole: () => null,
    recall: () => {},
  })

  it('openDetached rejects non-object input, missing projectId and off-vocabulary views', () => {
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, undefined)).toThrow(/must be an object/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, { view: 'board' })).toThrow(/projectId/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, { projectId: 'p-1', view: 'stats' })).toThrow(/board\/conversation/)
  })

  it('openDetached rejects malformed targets (exactly one shape) and rects (finite positive)', () => {
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'board', target: {},
    })).toThrow(/exactly one shape/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'board', target: { sessionId: 's', mode: 'one-shot' },
    })).toThrow(/exactly one shape/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'board', target: { parentSessionId: 'p', childSessionId: 'c', mode: 'sometimes' },
    })).toThrow(/one-shot\/continuable/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'board', rect: { x: 0, y: 0, width: -10, height: 600 },
    })).toThrow(/positive/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'board', rect: { x: 0, y: 0, width: Number.NaN, height: 600 },
    })).toThrow(/finite/)
  })

  it('accepts both SessionTarget shapes and forwards them verbatim', () => {
    const openDetached = vi.fn(() => ({ windowId: 'detached-1' }))
    const ok = installed({
      openDetached,
      getRole: () => null,
      recall: () => {},
    })
    ok.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'conversation', target: { sessionId: 's-1' }, rect: { x: 1, y: 2, width: 800, height: 600 },
    })
    expect(openDetached).toHaveBeenCalledWith({
      projectId: 'p-1', view: 'conversation', target: { sessionId: 's-1' }, rect: { x: 1, y: 2, width: 800, height: 600 },
    })
    ok.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, {
      projectId: 'p-1', view: 'conversation', target: { parentSessionId: 'p', childSessionId: 'c', mode: 'continuable' },
    })
    expect(openDetached).toHaveBeenLastCalledWith({
      projectId: 'p-1', view: 'conversation', target: { parentSessionId: 'p', childSessionId: 'c', mode: 'continuable' },
    })
  })

  it('recall rejects a malformed input object', () => {
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.recall)?.(OWNED, 'detached-1')).toThrow(/must be an object/)
    expect(() => handlers.get(WINDOW_VERB_CHANNELS.recall)?.(OWNED, {})).toThrow(/windowId/)
  })
})

describe('installWindowVerbs — domain error envelope (ERR_WINDOW_*)', () => {
  it('maps WindowManagementError rejections to the { code, message, detail? } envelope', () => {
    const handlers = installed({
      openDetached: () => { throw Object.assign(new Error('detached window could not be opened'), { code: 'ERR_WINDOW_OPEN_FAILED', detail: 'boom' }) },
      getRole: () => null,
      recall: () => {
        throw Object.assign(new Error('detached window nope does not exist'), { code: 'ERR_WINDOW_NOT_FOUND' })
      },
    })
    const recallError = capture(() => handlers.get(WINDOW_VERB_CHANNELS.recall)?.(OWNED, { windowId: 'nope' }))
    expect(recallError.message).toBe(JSON.stringify({ code: 'ERR_WINDOW_NOT_FOUND', message: 'detached window nope does not exist' }))

    const openError = capture(() => handlers.get(WINDOW_VERB_CHANNELS.openDetached)?.(OWNED, { projectId: 'p-1', view: 'board' }))
    expect(openError.message).toBe(JSON.stringify({
      code: 'ERR_WINDOW_OPEN_FAILED',
      message: 'detached window could not be opened',
      detail: 'boom',
    }))
  })
})

function capture(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the verb to reject')
}
