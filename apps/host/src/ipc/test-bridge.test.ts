// 5.1 录制-回放 main 侧测试钩子单测——env 门控注册 + 五写动词直调路由 + 事件记账
// + G1 pin 相容口径自证（AC1/AC5）：
//   · 钩子不在产品面：FORGE_CHANNEL_ALLOWLIST 零 test 通道、五写动词零通道（renderer 恒不可达）；
//   · env 缺席 = 零注册零痕迹（globalThis 挂点不设——发布构建在场零暴露）；
//   · 可达面封闭：非五动词（含 RPC 面动词 transitionTask / 读面 listTasks）一律拒绝。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORGE_CHANNEL_ALLOWLIST, FORGE_EVENT_CHANNELS, PROPOSALS_CHANNELS, TASKS_CHANNELS } from '@dsh-forge/contracts'
import type { DshHostServices } from '../boot/index.js'
import type { TasksChangedEvent } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerM2Channels } from './m2-wiring.js'
import {
  registerTestBridge,
  TEST_BRIDGE_ENV,
  TEST_BRIDGE_GLOBAL,
  TEST_BRIDGE_VERBS,
  testBridgeEnabled,
  type TestBridgeFace,
} from './test-bridge.js'

/** globalThis 挂点清理（测试隔离——真实面进程生命周期即挂点生命周期） */
function readRegistry(): TestBridgeFace | undefined {
  return (globalThis as Record<string, unknown>)[TEST_BRIDGE_GLOBAL] as TestBridgeFace | undefined
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[TEST_BRIDGE_GLOBAL]
})

/** host 替身（services 记账 + onEvent 订阅收集 + 手动发射面） */
function fakeHost(services: Partial<DshHostServices>) {
  const listeners: Array<(payload: TasksChangedEvent) => void> = []
  return {
    services,
    onEvent: (listener: (payload: TasksChangedEvent) => void): (() => void) => {
      listeners.push(listener)
      return () => {
        const i = listeners.indexOf(listener)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    emit: (payload: TasksChangedEvent): void => {
      for (const listener of listeners) listener(payload)
    },
  }
}

describe('5.1 testBridgeEnabled · env 门控', () => {
  it("env '1' → 开；缺席/其余值 → 关（门控二值口径）", () => {
    expect(testBridgeEnabled({ [TEST_BRIDGE_ENV]: '1' })).toBe(true)
    expect(testBridgeEnabled({})).toBe(false)
    expect(testBridgeEnabled({ [TEST_BRIDGE_ENV]: '' })).toBe(false)
    expect(testBridgeEnabled({ [TEST_BRIDGE_ENV]: 'true' })).toBe(false)
    expect(testBridgeEnabled({ [TEST_BRIDGE_ENV]: '0' })).toBe(false)
  })
})

describe('5.1 registerTestBridge · env 门控注册（AC1/AC5 缺席态）', () => {
  it('env 缺席 → 返回 undefined + globalThis 零挂点 + 服务零触达（发布构建零痕迹）', () => {
    const addTask = vi.fn(async () => ({}))
    const host = fakeHost({ forgeTasks: { addTask } as unknown as DshHostServices['forgeTasks'] })
    expect(registerTestBridge(host, {})).toBeUndefined()
    expect(readRegistry()).toBeUndefined()
    expect(addTask).not.toHaveBeenCalled()
  })

  it("env '1' → 挂点在位 + 返回撤销器；撤销后挂点摘除 + 订阅退订", () => {
    const host = fakeHost({ forgeTasks: new Proxy({}, { get: () => vi.fn(async () => ({})) }) as unknown as never })
    const unregister = registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    expect(unregister).toBeTypeOf('function')
    expect(readRegistry()).toBeDefined()
    unregister!()
    expect(readRegistry()).toBeUndefined()
    // 退订后事件不再记账
    expect(() => host.emit({ projectId: 'p-1' })).not.toThrow()
  })
})

describe('5.1 registerTestBridge · 五写动词直调路由（经 host.services 桥代理）', () => {
  it('forgeTasks.addTask：args 原样透传 + 结果回传（单参数对象契约）', async () => {
    const input = { projectId: 'p-1', featureSlug: 'f', title: '任务', type: 'coding-feature' }
    const addTask = vi.fn(async () => ({ taskId: 't-1', slug: 'f', localId: '1', reused: false }))
    const host = fakeHost({ forgeTasks: { addTask } as unknown as DshHostServices['forgeTasks'] })
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    const result = await readRegistry()!.call('forgeTasks', 'addTask', input)
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(addTask).toHaveBeenCalledWith(input)
    expect(result).toEqual({ taskId: 't-1', slug: 'f', localId: '1', reused: false })
  })

  it('forgeProposals.createProposal / transitionProposal 同路由（提案两动词）', async () => {
    const createProposal = vi.fn(async () => ({ proposalId: 'pr-1' }))
    const transitionProposal = vi.fn(async () => ({ proposalId: 'pr-1' }))
    const host = fakeHost({
      forgeProposals: { createProposal, transitionProposal } as unknown as DshHostServices['forgeProposals'],
    })
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    await readRegistry()!.call('forgeProposals', 'createProposal', { projectId: 'p-1', slug: 'pr', title: '提案' })
    await readRegistry()!.call('forgeProposals', 'transitionProposal', { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' })
    expect(createProposal).toHaveBeenCalledTimes(1)
    expect(transitionProposal).toHaveBeenCalledTimes(1)
  })

  it('动词服务失败 → 原样 reject（桥错误保真面不在本层——直传）', async () => {
    const claimTask = vi.fn(async () => {
      throw new Error('依赖未满足')
    })
    const host = fakeHost({ forgeTasks: { claimTask } as unknown as DshHostServices['forgeTasks'] })
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    await expect(readRegistry()!.call('forgeTasks', 'claimTask', { projectId: 'p-1', sessionId: 's' })).rejects.toThrow('依赖未满足')
  })
})

describe('5.1 registerTestBridge · 可达面封闭（非五动词一律拒绝——禁通用 RPC 旁路）', () => {
  it('RPC 面动词（transitionTask）/ 读面（listTasks/taskStats）/ 未知动词 → fail-loud', () => {
    const stub = new Proxy({}, { get: () => vi.fn(async () => ({})) }) as unknown as never
    const host = fakeHost({ forgeTasks: stub, forgeProposals: stub })
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    const face = readRegistry()!
    expect(() => face.call('forgeTasks', 'transitionTask', {})).toThrow('不在测试钩子可达面')
    expect(() => face.call('forgeTasks', 'listTasks', {})).toThrow('不在测试钩子可达面')
    expect(() => face.call('forgeTasks', 'taskStats', {})).toThrow('不在测试钩子可达面')
  })

  it('未知服务（forgeProjects/forgeDocs 等）→ fail-loud（钩子只服务回放写动词）', () => {
    const stub = new Proxy({}, { get: () => vi.fn(async () => ({})) }) as unknown as never
    const host = fakeHost({ forgeTasks: stub, forgeProposals: stub, forgeProjects: stub })
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    expect(() => readRegistry()!.call('forgeProjects', 'registerProject', {})).toThrow('不在测试钩子可达面')
    expect(() => readRegistry()!.call('forgeDocs', 'read', {})).toThrow('不在测试钩子可达面')
  })

  it('服务缺席（M2 面降级）→ 明确拒绝文案', () => {
    const host = fakeHost({})
    registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
    expect(() => readRegistry()!.call('forgeTasks', 'addTask', {})).toThrow('forgeTasks 服务缺席')
  })
})

describe('5.1 registerTestBridge · 事件记账（fix 链事件流观测面——主侧收讫时戳）', () => {
  it('onEvent 推送 → events() 快照记录 { at, channel, payload }；快照只读（返回副本）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'))
    try {
      const host = fakeHost({ forgeTasks: new Proxy({}, { get: () => vi.fn(async () => ({})) }) as unknown as never })
      registerTestBridge(host, { [TEST_BRIDGE_ENV]: '1' })
      host.emit({ projectId: 'p-1' })
      vi.advanceTimersByTime(5)
      host.emit({ projectId: 'p-1' })
      const events = readRegistry()!.events()
      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ at: Date.now() - 5, channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p-1' } })
      expect(events.map((e) => e.payload.projectId)).toEqual(['p-1', 'p-1'])
      // 快照只读：再发射不影响已取副本
      host.emit({ projectId: 'p-2' })
      expect(events).toHaveLength(2)
      expect(readRegistry()!.events()).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('5.1 m2-wiring 接线（main.ts 零改动缝——registerM2Channels 末段内聚注册）', () => {
  function fakeIpcMain(): IpcMainLike {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    return {
      handle: (channel, listener) => void handlers.set(channel, listener),
      removeHandler: (channel) => void handlers.delete(channel),
    }
  }

  it('registerM2Channels 默认 env（钩子门关）→ 零挂点（产品装配面零痕迹）', () => {
    const host = fakeHost({})
    registerM2Channels(createForgeIpc(fakeIpcMain()), host, () => undefined, vi.fn(async () => ''))
    expect(readRegistry()).toBeUndefined()
  })

  it("registerM2Channels testEnv '1' → 挂点在位（装配缝可达）", () => {
    const host = fakeHost({})
    registerM2Channels(createForgeIpc(fakeIpcMain()), host, () => undefined, vi.fn(async () => ''), console.warn, {
      [TEST_BRIDGE_ENV]: '1',
    })
    expect(readRegistry()).toBeDefined()
  })
})

describe('5.1 G1 pin 相容口径自证（AC5——审计断言缺席态）', () => {
  it('TEST_BRIDGE_VERBS 面 = 恰五写动词（tasks 三 + proposals 二）', () => {
    expect(TEST_BRIDGE_VERBS).toEqual({
      forgeTasks: ['addTask', 'claimTask', 'submitTask'],
      forgeProposals: ['createProposal', 'transitionProposal'],
    })
  })

  it('产品面缺席态①：FORGE_CHANNEL_ALLOWLIST 无任何 test 通道（钩子非通道——renderer 恒不可达）', () => {
    for (const channel of FORGE_CHANNEL_ALLOWLIST) {
      expect(channel.includes('test'), `allowlist 出现 test 通道：${channel}`).toBe(false)
    }
  })

  it('产品面缺席态②：五写动词在 RPC 通道族零通道（SC7 断言面——add/claim/submit/create/transitionProposal 不上 RPC）', () => {
    const productChannels = [...Object.values(TASKS_CHANNELS), ...Object.values(PROPOSALS_CHANNELS)]
    for (const verb of [...TEST_BRIDGE_VERBS.forgeTasks, ...TEST_BRIDGE_VERBS.forgeProposals]) {
      expect(productChannels.some((c) => c.endsWith(`/${verb}`)), `${verb} 泄漏进 RPC 通道族`).toBe(false)
    }
  })
})
