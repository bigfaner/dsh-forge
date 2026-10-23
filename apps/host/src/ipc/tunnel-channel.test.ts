// fix-17 ②：隧道 tab 重连缝 IPC 通道单测（registerTunnelChannel/removeTunnelChannel——
// dshForge 域外直转面先例同制：harness-channel 同构，不进 forge invoke allowlist）。
import { describe, expect, it } from 'vitest'
import { PIN_CONSENT_CHANNEL, PIN_RESET_CHANNEL, PSK_READ_CHANNEL, PSK_ROTATE_CHANNEL, TUNNEL_FALLBACK_CHANNEL, TUNNEL_TOGGLE_CHANNEL, registerTunnelChannel, removeTunnelChannel } from './tunnel-channel.js'

/** psk 双缝替身动作（1.107——读数/轮换带值返回） */
function pskSeams() {
  return {
    pskRead: () => Promise.resolve({ configured: false }),
    pskRotate: () => Promise.resolve({ configured: false }),
  }
}

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
      fallback: () => true,
      pinReset: () => true,
      consentPin: () => undefined,
      ...pskSeams(),
    })
    expect(ipcMain.handles.has(TUNNEL_TOGGLE_CHANNEL)).toBe(true)
    await ipcMain.handles.get(TUNNEL_TOGGLE_CHANNEL)!.call(undefined)
    expect(toggled).toBe(1)
  })

  it('fix-18：三缝同注册（toggle/fallback/pin-reset）——invoke 各直转对应动作', async () => {
    const ipcMain = fakeIpcMain()
    const calls: string[] = []
    registerTunnelChannel(ipcMain, {
      toggle: () => void calls.push('toggle'),
      fallback: () => void calls.push('fallback'),
      pinReset: () => void calls.push('pinReset'),
      consentPin: () => void calls.push('consentPin'),
      ...pskSeams(),
    })
    expect(ipcMain.handles.has(TUNNEL_TOGGLE_CHANNEL)).toBe(true)
    expect(ipcMain.handles.has(TUNNEL_FALLBACK_CHANNEL)).toBe(true)
    expect(ipcMain.handles.has(PIN_RESET_CHANNEL)).toBe(true)
    await ipcMain.handles.get(TUNNEL_FALLBACK_CHANNEL)!.call(undefined)
    await ipcMain.handles.get(PIN_RESET_CHANNEL)!.call(undefined)
    expect(calls).toEqual(['fallback', 'pinReset'])
  })

  it('removeTunnelChannel → handler 撤除（before-quit 清理面——fix-18 起三缝同撤）', () => {
    const ipcMain = fakeIpcMain()
    registerTunnelChannel(ipcMain, { toggle: () => true, fallback: () => true, pinReset: () => true, consentPin: () => undefined, ...pskSeams() })
    removeTunnelChannel(ipcMain)
    expect(ipcMain.handles.size).toBe(0)
    expect([...ipcMain.removed]).toEqual(
      expect.arrayContaining([TUNNEL_TOGGLE_CHANNEL, TUNNEL_FALLBACK_CHANNEL, PIN_RESET_CHANNEL, PIN_CONSENT_CHANNEL]),
    )
  })
})

describe('fix-18 通道名（dshForge 直转面命名制）', () => {
  it('tunnel-fallback / pin-reset 通道字面量 pin', () => {
    expect(TUNNEL_FALLBACK_CHANNEL).toBe('dsh-forge:remote/tunnel-fallback')
    expect(PIN_RESET_CHANNEL).toBe('dsh-forge:remote/pin-reset')
  })
})

describe('fix-26 pin-consent 通道（长效密码开关——官方 POST /desktop/pin/consent 直转缝）', () => {
  it('invoke pin-consent → actions.consentPin(consent) 直转（载荷布尔原样）', async () => {
    const ipcMain = fakeIpcMain()
    const calls: unknown[] = []
    registerTunnelChannel(ipcMain, {
      toggle: () => true,
      fallback: () => true,
      pinReset: () => true,
      consentPin: (consent) => {
        calls.push(consent)
      },
      ...pskSeams(),
    })
    await ipcMain.handles.get(PIN_CONSENT_CHANNEL)?.(undefined, true)
    await ipcMain.handles.get(PIN_CONSENT_CHANNEL)?.(undefined, false)
    expect(calls).toEqual([true, false])
  })

  it('removeTunnelChannel 四缝同撤（含 pin-consent）；通道字面量 pin', () => {
    const ipcMain = fakeIpcMain()
    registerTunnelChannel(ipcMain, {
      toggle: () => true,
      fallback: () => true,
      pinReset: () => true,
      consentPin: () => undefined,
      ...pskSeams(),
    })
    removeTunnelChannel(ipcMain)
    expect(ipcMain.handles.size).toBe(0)
    expect(PIN_CONSENT_CHANNEL).toBe('dsh-forge:remote/pin-consent')
    expect([...ipcMain.removed]).toContain(PIN_CONSENT_CHANNEL)
  })
})

describe('1.107 psk 双缝（连接密钥三件套读数/轮换——bridge remotePsk 服务直转）', () => {
  it('通道名 pin：psk-read / psk-rotate（dshForge 直转面命名制）', () => {
    expect(PSK_READ_CHANNEL).toBe('dsh-forge:remote/psk-read')
    expect(PSK_ROTATE_CHANNEL).toBe('dsh-forge:remote/psk-rotate')
  })

  it('invoke psk-read / psk-rotate → actions 带值返回（读数即显）', async () => {
    const ipcMain = fakeIpcMain()
    const trio = { configured: true, display: 'A', checksum: 'b', spki: 'c' }
    registerTunnelChannel(ipcMain, { toggle: () => true, fallback: () => true, pinReset: () => true, consentPin: () => undefined, pskRead: () => Promise.resolve(trio), pskRotate: () => Promise.resolve(trio) })
    await expect(ipcMain.handles.get(PSK_READ_CHANNEL)!.call(undefined)).resolves.toEqual(trio)
    await expect(ipcMain.handles.get(PSK_ROTATE_CHANNEL)!.call(undefined)).resolves.toEqual(trio)
  })

  it('removeTunnelChannel 六缝同撤（含 psk 双缝）', () => {
    const ipcMain = fakeIpcMain()
    registerTunnelChannel(ipcMain, { toggle: () => true, fallback: () => true, pinReset: () => true, consentPin: () => undefined, ...pskSeams() })
    removeTunnelChannel(ipcMain)
    expect(ipcMain.handles.size).toBe(0)
    expect([...ipcMain.removed]).toContain(PSK_READ_CHANNEL)
    expect([...ipcMain.removed]).toContain(PSK_ROTATE_CHANNEL)
  })
})
