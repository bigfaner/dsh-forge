// 3.1 M2 接线收口 pin：四族 + derive 扩族注册（服务缺席 fail-soft 记 warn 不注册）+
// 写推送事件广播（onEvent → webContents.send('forge:events/tasks-changed')——载荷只读）。
// main.ts 单行编排的装配逻辑全量锚定于此（~100 行纪律的配套测试面）。
import { describe, expect, it, vi } from 'vitest'
import {
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FORGE_EVENT_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  TASKS_CHANNELS,
  type TasksChangedEvent,
} from '@dsh-forge/contracts'
import type { DshHostServices } from '../boot/index.js'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerM2Channels } from './m2-wiring.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

/** host 替身（services 局部在场 + onEvent 记录订阅 + emit 测试发射面） */
function fakeHost(services: Partial<DshHostServices>) {
  const listeners: Array<(payload: TasksChangedEvent) => void> = []
  return {
    services,
    onEvent: (listener: (payload: TasksChangedEvent) => void): (() => void) => {
      listeners.push(listener)
      return () => {}
    },
    emit: (payload: TasksChangedEvent): void => {
      for (const listener of listeners) listener(payload)
    },
  }
}

/** 六服务全量替身（任意方法 → async {}——注册面测试只关心通道注册，方法语义在各域测试文件） */
const stub = new Proxy({}, { get: () => vi.fn(async () => ({})) }) as unknown as never

describe('3.1 registerM2Channels · 通道族注册', () => {
  it('六服务齐备：五族全量注册（tasks 八 + features 五 + proposals 一 + docs 两 + derive 一 = 17 通道）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    registerM2Channels(
      createForgeIpc(ipcMain),
      fakeHost({
        forgeProjects: stub,
        forgeTasks: stub,
        forgeFeatures: stub,
        forgeProposals: stub,
        forgeDocs: stub,
      }),
      () => undefined,
      vi.fn(async () => ''),
    )
    expect([...handlers.keys()].sort()).toEqual(
      [
        ...Object.values(TASKS_CHANNELS),
        ...Object.values(FEATURES_CHANNELS),
        ...Object.values(PROPOSALS_CHANNELS),
        ...Object.values(DOCS_CHANNELS),
        PROJECTS_M2_CHANNELS.deriveTaskStoreDir,
      ]
        .slice()
        .sort(),
    )
    expect(handlers).toHaveLength(17)
  })

  it('服务缺席（M2 面降级）：缺席族不注册 + 逐族 warn（fail-soft 不抛）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const warn = vi.fn()
    expect(() =>
      registerM2Channels(
        createForgeIpc(ipcMain),
        fakeHost({ forgeProjects: stub }), // 仅 P1 服务在场
        () => undefined,
        vi.fn(async () => ''),
        warn,
      ),
    ).not.toThrow()
    expect(handlers.has(PROJECTS_M2_CHANNELS.deriveTaskStoreDir)).toBe(true)
    expect(handlers.has(TASKS_CHANNELS.list)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(4) // 四域缺席各一条（forgeProjects 在场不计）
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('forgeTasks 服务缺席'),
      expect.stringContaining('forgeFeatures 服务缺席'),
      expect.stringContaining('forgeProposals 服务缺席'),
      expect.stringContaining('forgeDocs 服务缺席'),
    ])
  })
})

describe('3.1 registerM2Channels · 写推送事件广播（交互二事件链末段）', () => {
  it("onEvent 事件 → webContents.send('forge:events/tasks-changed', { projectId })——通道常量本尊", () => {
    const { ipcMain } = fakeIpcMain()
    const host = fakeHost({ forgeTasks: stub })
    const send = vi.fn()
    registerM2Channels(createForgeIpc(ipcMain), host, () => ({ send }), vi.fn(async () => ''))
    host.emit({ projectId: 'p-1' })
    expect(send).toHaveBeenCalledWith(FORGE_EVENT_CHANNELS.tasksChanged, { projectId: 'p-1' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('广播目标缺席（窗口未建/已毁）或 send 面缺席（fake 窗口）→ 静默跳过不抛', () => {
    const { ipcMain } = fakeIpcMain()
    const host = fakeHost({ forgeTasks: stub })
    expect(() => registerM2Channels(createForgeIpc(ipcMain), host, () => undefined, vi.fn(async () => ''))).not.toThrow()
    const faceless = fakeHost({ forgeTasks: stub })
    expect(() => registerM2Channels(createForgeIpc(ipcMain), faceless, () => ({}), vi.fn(async () => ''))).not.toThrow()
    expect(() => faceless.emit({ projectId: 'p-2' })).not.toThrow()
  })

  it('openPath 注入透传：docs 族注册后 openExternal 经 openPath 执行（shell.openPath 装配缝）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const openPath = vi.fn(async (_target: string): Promise<string> => '')
    const read = vi.fn(async () => ({
      title: 'T',
      content: '# T',
      canonicalPath: 'C:/ws/x.md',
      dangling: false,
    }))
    registerM2Channels(
      createForgeIpc(ipcMain),
      fakeHost({ forgeDocs: { read } }),
      () => undefined,
      openPath,
    )
    const envelope = (await handlers.get(DOCS_CHANNELS.openExternal)!(undefined, { projectId: 'p-1', docRel: 'x.md' })) as {
      ok: boolean
    }
    expect(envelope.ok).toBe(true)
    expect(openPath).toHaveBeenCalledWith('C:/ws/x.md')
  })
})
