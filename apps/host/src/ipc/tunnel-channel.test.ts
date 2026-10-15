// fix-17 ②：隧道 tab 重连缝 IPC 通道单测（registerTunnelChannel/removeTunnelChannel——
// dshForge 域外直转面先例同制：harness-channel 同构，不进 forge invoke allowlist）。
import { describe, expect, it } from 'vitest'
import { TUNNEL_TOGGLE_CHANNEL, registerTunnelChannel, removeTunnelChannel } from './tunnel-channel.js'

/** ipcMain 替身（handle/removeHandler 收集——forge-channels IpcMainLike 消费切片） */
function fakeIpcMain() {
  const handles = new Map<string, (...args: unknown[]) => unknown>()
  const removed = new Set<string>()
  return {
    handles,
    removed,
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      handles.set(channel, handler)
    },
    removeHandler(channel: string) {
      handles.delete(channel)
      removed.add(channel)
    },
  }
}

describe('tunnel-toggle 通道（fix-17 ② tab 切换重连缝）', () => {
  it('通道名 = dsh-forge:remote/tunnel-toggle（dshForge 直转面命名制）', () => {
    expect(TUNNEL_TOGGLE_CHANNEL).toBe('dsh-forge:remote/tunnel-toggle')
  })

  it('注册 → handler 落 ipcMain.handle；invoke → actions.toggle() 调用一次', async () => {
    const ipcMain = fakeIpcMain()
    let toggled = 0
    registerTunnelChannel(ipcMain, {
      toggle: () => {
        toggled += 1
        return true
      },
    })
    expect(ipcMain.handles.has(TUNNEL_TOGGLE_CHANNEL)).toBe(true)
    await ipcMain.handles.get(TUNNEL_TOGGLE_CHANNEL)!.call(undefined)
    expect(toggled).toBe(1)
  })

  it('removeTunnelChannel → handler 撤除（before-quit 清理面）', () => {
    const ipcMain = fakeIpcMain()
    registerTunnelChannel(ipcMain, { toggle: () => true })
    removeTunnelChannel(ipcMain)
    expect(ipcMain.handles.size).toBe(0)
    expect([...ipcMain.removed]).toEqual([TUNNEL_TOGGLE_CHANNEL])
  })
})
