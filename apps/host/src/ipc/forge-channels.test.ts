// 1.4 AC4 pin：forge:* 通道注册走 contracts 通道常量 + allowlist 校验（负样例自证）。
import { FORGE_CHANNELS, FORGE_CHANNEL_ALLOWLIST } from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

describe('AC4 allowlist 注册机制', () => {
  it('contracts 全部 invoke 通道（P1 十通道 + M2 五族十八通道 = 28）可注册且落 ipcMain.handle', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    for (const channel of Object.values(FORGE_CHANNELS)) {
      ipc.register(channel, () => 'ok')
    }
    expect(ipc.registered()).toHaveLength(FORGE_CHANNEL_ALLOWLIST.length)
    expect(handlers.size).toBe(FORGE_CHANNEL_ALLOWLIST.length)
  })

  it('handler 原样透传（2.4/3.5 的域 handler 注册进同一机制）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    ipc.register(FORGE_CHANNELS.list, (_event, arg) => ({ echoed: arg }))
    const out = handlers.get(FORGE_CHANNELS.list)!(undefined, 42)
    expect(out).toEqual({ echoed: 42 })
  })

  it('负样例：未列通道拒绝（forge 前缀伪通道）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    expect(() => ipc.register('forge:projects/drop-table' as never, () => 1)).toThrow(/allowlist/)
    expect(handlers.size).toBe(0)
  })

  it('负样例：非 forge 域通道拒绝（boot 通道属另一分面，不走域 allowlist）', () => {
    const { ipcMain } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    expect(() => ipc.register('dsh-forge:boot' as never, () => 1)).toThrow(/allowlist/)
    expect(() => ipc.register('evil:anything' as never, () => 1)).toThrow(/allowlist/)
  })

  it('重复注册拒绝', () => {
    const { ipcMain } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    ipc.register(FORGE_CHANNELS.list, () => 1)
    expect(() => ipc.register(FORGE_CHANNELS.list, () => 2)).toThrow(/重复/)
  })

  it('unregisterAll 全量注销（关停清理面）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    ipc.register(FORGE_CHANNELS.list, () => 1)
    ipc.register(FORGE_CHANNELS.heat, () => 2)
    ipc.unregisterAll()
    expect(ipc.registered()).toEqual([])
    expect(handlers.size).toBe(0)
  })
})
