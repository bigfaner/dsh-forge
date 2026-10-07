// 3.1 forge:tasks/* 八通道注册 pin：注册面 = TASKS_CHANNELS 全集（无多无少）+ 负载
// 映射端到端（替身层）+ SC7 面分治（add/claim/submit 不入注入面——类型级禁律 + 通道面
// 零写动词）+ typed error 经信封保真（ERR_INVALID_TRANSITION）。
import { describe, expect, it, vi } from 'vitest'
import { TASKS_CHANNELS, type TaskSnapshot } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerTasksChannels, type TasksChannelService } from './tasks-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

const invoke = (handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>, channel: string, payload?: unknown) => {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for '${channel}'`)
  return Promise.resolve(handler(undefined, payload))
}

const snapshot: TaskSnapshot = {
  taskId: 't-1',
  slug: 'demo-feature',
  localId: '2.1',
  source: { kind: 'feature', slug: 'demo-feature' },
  title: '桥扩四服务',
  taskType: 'coding-feature',
  taskStatus: 'in_progress',
  breaking: false,
  complexity: 'high',
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
}

/** 替身服务：八法可编程（写动词三法不在 TasksChannelService 面——注入即编译红） */
function fakeService(): TasksChannelService {
  return {
    transitionTask: vi.fn().mockResolvedValue(snapshot),
    queryTask: vi.fn().mockResolvedValue({ task: snapshot }),
    validateFeatureTasks: vi.fn().mockResolvedValue({ violations: [], checked: { featureSlug: 'demo-feature', tasks: 1 } }),
    listTasks: vi.fn().mockResolvedValue([]),
    taskStats: vi.fn().mockResolvedValue({ total: 0, byStatus: {} as never }),
    taskGraph: vi.fn().mockResolvedValue({ tasks: [], edges: [] }),
    taskDetail: vi.fn().mockResolvedValue({ ...snapshot, records: [], waitingOnMe: [], sessions: [], actualFiles: [], allowedTransitions: [], prerequisites: [], refs: [], sessionCount: 0 }),
    sessionLinks: vi.fn().mockResolvedValue([]),
  }
}

describe('3.1 forge:tasks/* 注册面', () => {
  it('注册面 = contracts TASKS_CHANNELS 全集八通道（无多无少——allowlist 守门）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    registerTasksChannels(createForgeIpc(ipcMain), fakeService())
    expect([...handlers.keys()].sort()).toEqual(Object.values(TASKS_CHANNELS).slice().sort())
    expect(handlers.has('forge:tasks/add')).toBe(false) // 写动词无通道（SC7）
    expect(handlers.has('forge:tasks/claim')).toBe(false)
    expect(handlers.has('forge:tasks/submit')).toBe(false)
  })

  it('SC7 面分治：client 可达方法键封闭八法（add/claim/submit 不在 RPC 面——tool 专属）', () => {
    expect(Object.keys(TASKS_CHANNELS).sort()).toEqual([
      'detail',
      'graph',
      'list',
      'query',
      'sessionLinks',
      'stats',
      'transition',
      'validateFeatureTasks',
    ])
  })
})

describe('3.1 forge:tasks/* 负载映射端到端（替身层）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const service = fakeService()
    registerTasksChannels(createForgeIpc(ipcMain), service)
    return { service, call: (channel: string, payload?: unknown) => invoke(handlers, channel, payload) }
  }

  it('transition：TransitionTaskInput 透传 → TaskSnapshot typed 返回', async () => {
    const { service, call } = setup()
    const input = { projectId: 'p-1', taskId: 't-1', toStatus: 'blocked' as const, reason: '等待上游' }
    await expect(call(TASKS_CHANNELS.transition, input)).resolves.toEqual({ ok: true, data: snapshot })
    expect(service.transitionTask).toHaveBeenCalledWith(input)
  })

  it('query / validateFeatureTasks / list / stats / graph / detail / sessionLinks：负载原样透传 typed 返回', async () => {
    const { service, call } = setup()
    await call(TASKS_CHANNELS.query, { projectId: 'p-1', taskRef: { slug: 's', localId: '1.1' } })
    expect(service.queryTask).toHaveBeenCalledWith({ projectId: 'p-1', taskRef: { slug: 's', localId: '1.1' } })
    await call(TASKS_CHANNELS.validateFeatureTasks, { projectId: 'p-1', featureSlug: 'demo-feature' })
    expect(service.validateFeatureTasks).toHaveBeenCalledOnce()
    await call(TASKS_CHANNELS.list, { projectId: 'p-1', search: '桥' })
    expect(service.listTasks).toHaveBeenCalledWith({ projectId: 'p-1', search: '桥' })
    await call(TASKS_CHANNELS.stats, { projectId: 'p-1' })
    expect(service.taskStats).toHaveBeenCalledWith({ projectId: 'p-1' })
    await call(TASKS_CHANNELS.graph, { projectId: 'p-1', featureSlug: 'demo-feature' })
    expect(service.taskGraph).toHaveBeenCalledOnce()
    await call(TASKS_CHANNELS.detail, { projectId: 'p-1', taskId: 't-1' })
    expect(service.taskDetail).toHaveBeenCalledWith({ projectId: 'p-1', taskId: 't-1' })
    await call(TASKS_CHANNELS.sessionLinks, { projectId: 'p-1', sessionId: 'sess-1' })
    expect(service.sessionLinks).toHaveBeenCalledWith({ projectId: 'p-1', sessionId: 'sess-1' })
  })

  it('typed error 经信封保真：ERR_INVALID_TRANSITION（code/message/data 三元组）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const service = fakeService()
    service.transitionTask = vi.fn().mockRejectedValue(
      Object.assign(new Error('目标态不在 transitionTargets(current, human)'), {
        code: 'ERR_INVALID_TRANSITION',
        data: { taskId: 't-1', toStatus: 'completed' },
      }),
    )
    registerTasksChannels(createForgeIpc(ipcMain), service)
    await expect(invoke(handlers, TASKS_CHANNELS.transition, { projectId: 'p-1', taskId: 't-1', toStatus: 'completed', reason: 'x' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'ERR_INVALID_TRANSITION',
        message: expect.stringContaining('transitionTargets'),
        data: { taskId: 't-1', toStatus: 'completed' },
      },
    })
  })
})
