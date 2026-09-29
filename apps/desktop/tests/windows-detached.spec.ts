// 任务 4.2 — detached 开窗/收回编排单测(tech-design §Interfaces·
// Interface 5 + §Error Handling「窗口面」+ §Security·T3;AC-1/AC-2/AC-4/AC-5)。
//
// DI 面(零 Electron):宿主窗口工厂注入假体 —— 几何(首窗 960×640 居中
// 主窗 / 此后记忆 / rect 重放优先)、标题「<项目名> · <视图名>」、
// detached-opened/closed 事件、recall 与 OS 关闭的同语义汇流、
// ERR_WINDOW_NOT_FOUND / ERR_WINDOW_OPEN_FAILED、removeProject 关窗 hook
// (真 services 装配)。安全接线(window-open 拒 + will-navigate 锁)=
// applyDetachedWindowSecurity 纯函数直证。

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyDetachedWindowSecurity,
  createDetachedWindowManager,
  DETACHED_DEFAULT_HEIGHT,
  DETACHED_DEFAULT_WIDTH,
  resolveDetachedGeometry,
  type DetachedHostWindow,
  type DetachedWindowHostOptions,
  type WindowChangedEvent,
} from '../src/main/windows/detached.ts'
import { createWindowRegistry, type RegistryWindow } from '../src/main/windows/registry.ts'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

let contentsSeq = 0

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

interface FakeHostWindow extends DetachedHostWindow {
  /** 工厂入参(几何/标题断言面)。 */
  options: DetachedWindowHostOptions
  /** 模拟 OS 标题栏关闭:触发 'close' → 'closed' 终态路径。 */
  osClose(): void
  /** 模拟文档加载失败(whenLoaded reject)。 */
  failLoad(error: Error): void
  /** 测试面:移动窗口(记忆几何断言)。 */
  setBounds(next: Bounds): void
}

function makeHostFactory(state: { createError?: Error } = {}) {
  const created: FakeHostWindow[] = []
  const factory = (options: DetachedWindowHostOptions): DetachedHostWindow => {
    if (state.createError !== undefined) throw state.createError
    const id = ++contentsSeq
    const closeListeners: Array<() => void> = []
    const closedListeners: Array<() => void> = []
    let destroyed = false
    let bounds: Bounds = { x: options.x ?? 0, y: options.y ?? 0, width: options.width, height: options.height }
    let loadReject: ((error: Error) => void) | undefined
    const loadPromise = new Promise<void>((_resolve, reject) => { loadReject = reject })
    const window: FakeHostWindow = {
      options,
      isDestroyed: () => destroyed,
      webContents: {
        id,
        isDestroyed: () => destroyed,
        send: () => {},
      },
      on: (_event, listener) => { closeListeners.push(listener) },
      once: (event, listener) => {
        if (event === 'closed') closedListeners.push(listener)
      },
      getBounds: () => ({ ...bounds }),
      close: () => {
        if (destroyed) return
        for (const listener of [...closeListeners]) listener()
        destroyed = true
        for (const listener of [...closedListeners]) listener()
      },
      // pending until failLoad:默认不触发失败路径(成功路径不可解 promise)。
      whenLoaded: () => loadPromise,
      osClose: () => { window.close() },
      failLoad: (error: Error) => { loadReject?.(error) },
      setBounds: (next: Bounds) => { bounds = { ...next } },
    }
    created.push(window)
    return window
  }
  return { factory, created }
}

interface FakeMain extends RegistryWindow {
  getBounds(): Bounds
}

function fakeMain(bounds?: Bounds): FakeMain {
  const id = ++contentsSeq
  const window = {
    isDestroyed: () => false,
    webContents: { id, isDestroyed: () => false, send: () => {} },
    ...(bounds === undefined ? {} : { getBounds: () => ({ ...bounds }) }),
  } as FakeMain
  return window
}

function makeManager(overrides: Partial<Parameters<typeof createDetachedWindowManager>[0]> = {}) {
  const registry = createWindowRegistry()
  const host = makeHostFactory()
  const events: WindowChangedEvent[] = []
  const manager = createDetachedWindowManager({
    registry,
    createHostWindow: host.factory,
    resolveProjectTitle: projectId => (projectId === 'p-1' ? 'Demo Project' : undefined),
    viewLabel: view => (view === 'board' ? 'Board' : 'Conversation'),
    getMainWindowBounds: () => undefined,
    emitWindowChanged: (event) => { events.push(event) },
    ...overrides,
  })
  return { registry, host, events, manager }
}

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
// AC-1 开窗:几何 / 标题 / windowId / 注册入册 / detached-opened
// ---------------------------------------------------------------------------

describe('openDetached — first-window geometry (960×640 centered on the main window)', () => {
  it('centers the first detached window over the main window bounds', () => {
    const main = fakeMain({ x: 100, y: 50, width: 1280, height: 800 })
    const { registry, host, manager } = makeManager({ getMainWindowBounds: () => main.getBounds() })
    registry.setMainWindow(main)

    manager.openDetached({ projectId: 'p-1', view: 'board' })

    expect(host.created).toHaveLength(1)
    expect(host.created[0]!.options).toEqual({
      width: DETACHED_DEFAULT_WIDTH,
      height: DETACHED_DEFAULT_HEIGHT,
      x: 100 + Math.round((1280 - DETACHED_DEFAULT_WIDTH) / 2),
      y: 50 + Math.round((800 - DETACHED_DEFAULT_HEIGHT) / 2),
      title: 'Demo Project · Board',
    })
  })

  it('omits position when no main window exists (OS default placement)', () => {
    const { host, manager } = makeManager()
    manager.openDetached({ projectId: 'p-9', view: 'conversation' })
    expect(host.created[0]!.options).toEqual({
      width: DETACHED_DEFAULT_WIDTH,
      height: DETACHED_DEFAULT_HEIGHT,
      title: 'p-9 · Conversation', // resolveProjectTitle 缺席 → projectId 回退
    })
  })

  it('clamps the centering offset at the main window origin (small main window)', () => {
    const main = fakeMain({ x: 10, y: 20, width: 400, height: 300 })
    const { registry, host, manager } = makeManager({ getMainWindowBounds: () => main.getBounds() })
    registry.setMainWindow(main)
    manager.openDetached({ projectId: 'p-1', view: 'board' })
    expect(host.created[0]!.options.x).toBe(10)
    expect(host.created[0]!.options.y).toBe(20)
  })
})

describe('openDetached — remembered geometry and rect replay precedence', () => {
  it('reuses the bounds captured at close for subsequent windows', () => {
    const { host, manager } = makeManager()
    const first = manager.openDetached({ projectId: 'p-1', view: 'board' })
    host.created[0]!.setBounds({ x: 42, y: 24, width: 700, height: 500 })
    host.created[0]!.osClose()

    manager.openDetached({ projectId: 'p-1', view: 'conversation' })
    expect(host.created[1]!.options).toMatchObject({ x: 42, y: 24, width: 700, height: 500 })
    expect(first.windowId).toBe('detached-1')
  })

  it('an explicit rect (layout replay) takes precedence over the remembered geometry', () => {
    const { host, manager } = makeManager()
    manager.openDetached({ projectId: 'p-1', view: 'board' })
    host.created[0]!.osClose()

    manager.openDetached({ projectId: 'p-1', view: 'board', rect: { x: 1, y: 2, width: 800, height: 600 } })
    expect(host.created[1]!.options).toMatchObject({ x: 1, y: 2, width: 800, height: 600 })
  })
})

describe('resolveDetachedGeometry — pure precedence matrix', () => {
  it('rect > remembered > default-centered-on-main', () => {
    const main = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(resolveDetachedGeometry({ x: 5, y: 6, width: 700, height: 500 }, { x: 1, y: 2, width: 300, height: 200 }, main))
      .toEqual({ x: 5, y: 6, width: 700, height: 500 })
    expect(resolveDetachedGeometry(undefined, { x: 1, y: 2, width: 300, height: 200 }, main))
      .toEqual({ x: 1, y: 2, width: 300, height: 200 })
    expect(resolveDetachedGeometry(undefined, undefined, main))
      .toEqual({
        width: DETACHED_DEFAULT_WIDTH,
        height: DETACHED_DEFAULT_HEIGHT,
        x: Math.round((1920 - DETACHED_DEFAULT_WIDTH) / 2),
        y: Math.round((1080 - DETACHED_DEFAULT_HEIGHT) / 2),
      })
    expect(resolveDetachedGeometry(undefined, undefined, undefined))
      .toEqual({ width: DETACHED_DEFAULT_WIDTH, height: DETACHED_DEFAULT_HEIGHT })
  })
})

describe('openDetached — registry insertion + detached-opened event', () => {
  it('registers the entry and emits detached-opened with the full role payload', () => {
    const { registry, events, manager } = makeManager()
    const target = { parentSessionId: 'ps', childSessionId: 'cs', mode: 'continuable' as const }
    const { windowId } = manager.openDetached({ projectId: 'p-1', view: 'conversation', target })

    const entry = registry.getDetached(windowId)
    expect(entry).toBeDefined()
    expect(entry!.projectId).toBe('p-1')
    expect(entry!.view).toBe('conversation')
    expect(entry!.target).toEqual(target)
    expect(events).toEqual([{
      type: 'detached-opened',
      windowId,
      projectId: 'p-1',
      view: 'conversation',
      target,
    }])
  })

  it('mints unique windowIds across opens', () => {
    const { manager } = makeManager()
    const a = manager.openDetached({ projectId: 'p-1', view: 'board' })
    const b = manager.openDetached({ projectId: 'p-1', view: 'board' })
    expect(a.windowId).not.toBe(b.windowId)
  })
})

// ---------------------------------------------------------------------------
// AC-2 收回:recall / OS 关闭 ≡ recall / ERR_WINDOW_NOT_FOUND / 事件兜底
// ---------------------------------------------------------------------------

describe('recall — OS title-bar close ≡ recall (same funnel)', () => {
  it('recall closes the window; registry drops the entry and detached-closed fires once', () => {
    const { registry, events, manager } = makeManager()
    const { windowId } = manager.openDetached({ projectId: 'p-1', view: 'board' })
    expect(events).toHaveLength(1)

    manager.recall(windowId)
    expect(registry.getDetached(windowId)).toBeUndefined()
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({ type: 'detached-closed', windowId, projectId: 'p-1', view: 'board' })
  })

  it('OS title-bar close takes the identical path (registry removal + detached-closed)', () => {
    const { registry, host, events, manager } = makeManager()
    const { windowId } = manager.openDetached({ projectId: 'p-1', view: 'conversation' })
    host.created[0]!.osClose()
    expect(registry.getDetached(windowId)).toBeUndefined()
    expect(events[1]).toEqual({ type: 'detached-closed', windowId, projectId: 'p-1', view: 'conversation' })
  })

  it('recall of an unknown windowId rejects with ERR_WINDOW_NOT_FOUND', () => {
    const { manager } = makeManager()
    expect(() => manager.recall('nope')).toThrowError(expect.objectContaining({ code: 'ERR_WINDOW_NOT_FOUND' }))
  })

  it('recall of an already-destroyed entry (defensive live check) rejects', () => {
    const { registry, manager } = makeManager()
    const { windowId } = manager.openDetached({ projectId: 'p-1', view: 'board' })
    // 极端时序:窗口销毁但 'closed' 编排未及执行 → 注册表活性过滤兜底。
    const hostWindow = registry.getDetached(windowId)!.window
    ;(hostWindow as unknown as { isDestroyed: () => boolean }).isDestroyed = () => true
    expect(registry.getDetached(windowId)).toBeUndefined()
    expect(() => manager.recall(windowId)).toThrowError(/does not exist/)
  })
})

describe('recallAllForProject / recallAll — project removal & main-window reconciliation', () => {
  it('closes only the project\'s detached windows and returns the count', () => {
    const { registry, events, manager } = makeManager()
    const a1 = manager.openDetached({ projectId: 'p-a', view: 'board' })
    const a2 = manager.openDetached({ projectId: 'p-a', view: 'conversation' })
    manager.openDetached({ projectId: 'p-b', view: 'board' })

    const closed = manager.recallAllForProject('p-a')
    expect(closed).toBe(2)
    expect(registry.getDetached(a1.windowId)).toBeUndefined()
    expect(registry.getDetached(a2.windowId)).toBeUndefined()
    expect(registry.listDetached()).toHaveLength(1)
    expect(events.filter(event => event.type === 'detached-closed')).toHaveLength(2)
  })

  it('recallAll sweeps every detached window (主窗关闭 = 退出,detached 随之关闭)', () => {
    const { registry, manager } = makeManager()
    manager.openDetached({ projectId: 'p-a', view: 'board' })
    manager.openDetached({ projectId: 'p-b', view: 'board' })
    expect(manager.recallAll()).toBe(2)
    expect(registry.listDetached()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// AC-5 错误码:ERR_WINDOW_OPEN_FAILED(构造失败 / 加载失败)
// ---------------------------------------------------------------------------

describe('openDetached — failure codes', () => {
  it('construction failure rejects with ERR_WINDOW_OPEN_FAILED and registers nothing', () => {
    const lines = errorSink()
    const registry = createWindowRegistry()
    const host = makeHostFactory({ createError: new Error('native window creation refused') })
    const manager = createDetachedWindowManager({
      registry,
      createHostWindow: host.factory,
      resolveProjectTitle: () => undefined,
      viewLabel: () => 'Board',
      getMainWindowBounds: () => undefined,
      emitWindowChanged: () => {},
    })
    expect(() => manager.openDetached({ projectId: 'p-1', view: 'board' }))
      .toThrowError(expect.objectContaining({ code: 'ERR_WINDOW_OPEN_FAILED', detail: 'native window creation refused' }))
    expect(registry.listDetached()).toEqual([])
    expect(lines.some(line => line.includes('ERR_WINDOW_OPEN_FAILED'))).toBe(true)
  })

  it('document load failure logs ERR_WINDOW_OPEN_FAILED and recalls the window (事件兜底)', async () => {
    const lines = errorSink()
    const { registry, events, manager } = makeManager()
    const { windowId } = manager.openDetached({ projectId: 'p-1', view: 'board' })
    const hostWindow = registry.getDetached(windowId)!.window as unknown as FakeHostWindow
    hostWindow.failLoad(new Error('ERR_CONNECTION_REFUSED'))
    await vi.waitFor(() => {
      expect(registry.getDetached(windowId)).toBeUndefined()
    })
    expect(events[1]).toEqual({ type: 'detached-closed', windowId, projectId: 'p-1', view: 'board' })
    expect(lines.some(line => line.includes('ERR_WINDOW_OPEN_FAILED') && line.includes('failed to load'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-4 安全接线(applyDetachedWindowSecurity 纯函数面;构造期基线
// SHELL_WEB_PREFERENCES 由壳引导落位,web-preferences.spec 已钉)
// ---------------------------------------------------------------------------

describe('applyDetachedWindowSecurity (T3)', () => {
  function fakeSecurityWindow() {
    const openExternal = vi.fn()
    let openHandler: ((details: { url: string }) => { action: 'deny' }) | undefined
    let navigateListener: ((event: { preventDefault(): void }, url: string) => void) | undefined
    applyDetachedWindowSecurity(
      {
        webContents: {
          setWindowOpenHandler: (handler) => { openHandler = handler },
          on: (_event, listener) => { navigateListener = listener },
        },
      },
      { openExternal },
    )
    const navigate = (url: string): boolean => {
      let stopped = false
      navigateListener!({ preventDefault: () => { stopped = true } }, url)
      return stopped
    }
    return {
      openExternal,
      open: (url: string) => openHandler!({ url }),
      navigate,
    }
  }

  it('denies every window-open; http/https delegates to the system browser', () => {
    const fake = fakeSecurityWindow()
    expect(fake.open('https://example.com/x')).toEqual({ action: 'deny' })
    expect(fake.open('http://example.com/y')).toEqual({ action: 'deny' })
    expect(fake.open('dsh-app://app/')).toEqual({ action: 'deny' })
    expect(fake.openExternal).toHaveBeenCalledTimes(2)
    expect(fake.openExternal).toHaveBeenCalledWith('https://example.com/x')
    expect(fake.openExternal).toHaveBeenCalledWith('http://example.com/y')
  })

  it('locks will-navigate to dsh-app: (others prevented; http/https delegated out)', () => {
    const fake = fakeSecurityWindow()
    expect(fake.navigate('dsh-app://app/feature')).toBe(false) // 同源放行
    expect(fake.navigate('https://evil.example/steal')).toBe(true)
    expect(fake.navigate('file:///etc/passwd')).toBe(true)
    expect(fake.openExternal).toHaveBeenCalledTimes(1)
    expect(fake.openExternal).toHaveBeenCalledWith('https://evil.example/steal')
  })

  it('non-http(s) protocols never reach the external handoff (deny-only)', () => {
    const fake = fakeSecurityWindow()
    expect(fake.open('ftp://files.example/z')).toEqual({ action: 'deny' })
    expect(fake.navigate('ftp://files.example/z')).toBe(true)
    expect(fake.openExternal).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AC-6 removeProject 关窗 hook(真 services 装配;Interface 1「拆出窗关闭」)
// ---------------------------------------------------------------------------

async function withServicesHarness(
  recallProjectWindows: ((projectId: string) => void) | undefined,
  run: (verbs: Awaited<ReturnType<typeof import('../src/main/workbench/ipc/services.ts').createWorkbenchIpcServices>>['verbs'], repoDir: string) => Promise<void> | void,
): Promise<void> {
  const { openDatabase } = await import('../src/main/workbench/store/db.ts')
  const { createWorkbenchIpcServices } = await import('../src/main/workbench/ipc/services.ts')
  const root = join(tmpdir(), `wb-windows-hook-${Date.now()}-${String(Math.floor(Math.random() * 1e6))}`)
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const resources = join(root, 'resources')
  mkdirSync(resources, { recursive: true })
  const repoDir = join(root, 'repo')
  mkdirSync(repoDir, { recursive: true })
  const manifest = join(resources, 'plugin-bundles.json')
  writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  let failure: unknown
  try {
    const assembly = createWorkbenchIpcServices({
      db,
      pluginBundlesPath: manifest,
      userDataPath: userData,
      onEvents: () => {},
      perception: { retarget: () => {}, rescan: () => {} },
      ...(recallProjectWindows === undefined ? {} : { recallProjectWindows }),
    })
    await run(assembly.verbs, repoDir)
    assembly.dispose()
  } catch (error) {
    failure = error
  } finally {
    try {
      db.close() // win32:打开中的 db 文件使 temp 目录删除 EPERM
    } catch { /* already settled */ }
    // 清障不得吞断言失败:删除失败仅残留 temp(随系统清理),原错误优先上抛。
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10 })
    } catch { /* win32 瞬时句柄滞后 */ }
  }
  if (failure !== undefined) throw failure
}

describe('removeProject → detached window recall hook (services assembly)', () => {
  it('removeProject invokes the injected recall seam with the projectId', async () => {
    const recall = vi.fn()
    await withServicesHarness(recall, async (verbs, repoDir) => {
      const project = verbs.registerProject({ anchor: repoDir, docsPlacement: 'app' })
      expect(recall).not.toHaveBeenCalled()
      verbs.removeProject(project.id)
      expect(recall).toHaveBeenCalledTimes(1)
      expect(recall).toHaveBeenCalledWith(project.id)
    })
  })

  it('the hook stays optional (absent seam = no-op, removal unaffected)', async () => {
    await withServicesHarness(undefined, async (verbs, repoDir) => {
      const project = verbs.registerProject({ anchor: repoDir, docsPlacement: 'app' })
      expect(() => verbs.removeProject(project.id)).not.toThrow()
    })
  })
})
