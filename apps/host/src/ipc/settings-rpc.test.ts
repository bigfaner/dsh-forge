// M3 3.8 forge:settings/* 注册 pin：两通道（get/set——Interface 4 扩池表）+ 负载映射
// 端到端（替身层）+ 单门读写语义锚（get 每调实时读零缓存；set 整体覆写 worker 段）。
import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerSettingsChannels, type SettingsChannelService } from './settings-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

describe('3.8 forge:settings/* 注册面（Interface 4 扩池表）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const service: SettingsChannelService = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    }
    registerSettingsChannels(createForgeIpc(ipcMain), service)
    return { service, handlers }
  }

  it('注册面恰两通道 = SETTINGS_CHANNELS 全集（get/set——无多无少）', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(Object.values(SETTINGS_CHANNELS).sort())
  })

  it('get：无参负载 → ForgeSettings typed 返回（未配置 = {}——worker 键缺席）', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(SETTINGS_CHANNELS.get)!
    await expect(handler(undefined, undefined)).resolves.toEqual({ ok: true, data: {} })
    expect(service.get).toHaveBeenCalledOnce()
    expect(service.get).toHaveBeenCalledWith()
  })

  it('set：SetForgeSettingsInput 透传 → ok 信封（触发即忘——失败经 RpcErr 信封）', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(SETTINGS_CHANNELS.set)!
    const input = { worker: { provider: 'deepseek', model: 'demo-model', reasoning: 'high' as const } }
    await expect(handler(undefined, input)).resolves.toEqual({ ok: true, data: undefined })
    expect(service.set).toHaveBeenCalledWith(input)
  })

  it('非 typed 错误 fail-loud 原样上抛：set 抛 InvalidSettingsInputError（设置域无 RPC 码——2.7 裁决不入 24 码表，编程错误不降级伪码）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const invalid = new Error('forge 设置入参违规：reasoning ∉ low|medium|high')
    registerSettingsChannels(createForgeIpc(ipcMain), {
      get: vi.fn(async () => ({})),
      set: async () => {
        throw invalid
      },
    })
    const handler = handlers.get(SETTINGS_CHANNELS.set)!
    // rpcEnvelope 非 typed → 原样上抛（Electron 拒绝面；不捏造 RpcErr 伪码信封）
    await expect(handler(undefined, { worker: { provider: 'p', model: 'm', reasoning: 'high' as const } })).rejects.toBe(invalid)
  })
})
