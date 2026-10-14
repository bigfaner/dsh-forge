// fix-7 配对独立窗口页单测（bug 9fd9b6b1 ①③）：`?forgePair=1` 路由判定（host 配对窗
// 载入产品配对页）+ 页内状态源（产品配置 × boot manifest 双源——plugin remote-face 同型
// 镜像，跑在主 bundle 侧）+ 官方 800ms 状态轮询刻度 + 页面静态渲染（标题 + RemotePanel
// 配对面）。交互（开关回写/倒计时刷新）沿 RemotePanel 既有面不重钉。
import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  PAIR_STATUS_POLL_MS,
  ForgePairingWindow,
  createPairingStatusSource,
  isPairingWindowLocation,
  type PairingBridge,
} from './pairing-window.js'

/** dshForge 桥替身（globalThis 安装面——createPairingStatusSource 读取面；用后还原） */
let installed: unknown
afterEach(() => {
  ;(globalThis as { dshForge?: unknown }).dshForge = installed
  installed = undefined
})

function fakeBridge(overrides: {
  readonly settings?: unknown
  readonly manifest?: Record<string, unknown>
}): PairingBridge {
  installed = (globalThis as { dshForge?: unknown }).dshForge
  const bridge = {
    invoke: (channel: string) => {
      if (channel === 'forge:settings/get') return Promise.resolve({ ok: true, data: overrides.settings })
      if (channel === 'forge:settings/set') return Promise.resolve({ ok: true, data: null })
      return Promise.reject(new Error(`unexpected channel ${channel}`))
    },
    getBootManifest: () => Promise.resolve(overrides.manifest ?? {}),
  }
  ;(globalThis as { dshForge?: unknown }).dshForge = bridge
  return bridge
}

describe('isPairingWindowLocation（fix-7 配对窗路由判定）', () => {
  it('?forgePair=1 = 配对窗页；其余（无参 / forgeRemote 手机受限视图）= 否', () => {
    expect(isPairingWindowLocation({ search: '?forgePair=1', hash: '' })).toBe(true)
    expect(isPairingWindowLocation({ search: '?forgePair=1&x=2', hash: '' })).toBe(true)
    expect(isPairingWindowLocation({ search: '', hash: '' })).toBe(false)
    expect(isPairingWindowLocation({ search: '?forgeRemote=1', hash: '' })).toBe(false)
  })
})

describe('PAIR_STATUS_POLL_MS（官方状态轮询刻度——DSH Desktop 0.10.0 :1194）', () => {
  it('800ms', () => {
    expect(PAIR_STATUS_POLL_MS).toBe(800)
  })
})

describe('createPairingStatusSource（页内状态源——remote-face 同型镜像）', () => {
  it('配置开 × 全卡绑定 × /pair 握手成功读数 → connected；未连接 → listening + lanAddress', async () => {
    const listening = createPairingStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { remoteHost: '0.0.0.0', remotePairUrl: 'http://192.168.1.7:19400/pair?token=t', remotePairExpiresAt: 1_234_567 },
      }),
    )
    await listening.refresh()
    expect(listening.source.getSnapshot().phase).toBe('listening')
    expect(listening.source.getSnapshot().lanAddress).toBe('http://192.168.1.7:19400/pair?token=t')
    const connected = createPairingStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { remoteHost: '0.0.0.0', remotePairUrl: 'http://192.168.1.7:19400/pair?token=t', remoteDeviceConnected: true },
      }),
    )
    await connected.refresh()
    expect(connected.source.getSnapshot().phase).toBe('connected')
  })

  it('桥缺席 = fail-soft off 快照（页面不炸装配）', async () => {
    ;(globalThis as { dshForge?: unknown }).dshForge = undefined
    const source = createPairingStatusSource(undefined)
    await source.refresh()
    expect(source.source.getSnapshot().phase).toBe('off')
  })
})

describe('ForgePairingWindow 静态渲染（配对窗页面——标题 + RemotePanel 配对面）', () => {
  it('页面标题「连接移动设备」+ 配对面（QR tab 卡 + 地址条带）在场', async () => {
    const source = createPairingStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { remoteHost: '0.0.0.0', remotePairUrl: 'http://192.168.1.7:19400/pair?token=t' },
      }),
    )
    await source.refresh()
    const html = renderToStaticMarkup(createElement(ForgePairingWindow, { source }))
    expect(html).toMatch(/连接移动设备/)
    expect(html).toMatch(/dswf-remote-tab-lan/)
    expect(html).toMatch(/dswf-remote-address/)
    expect(html).toContain('http://192.168.1.7:19400/pair?token=t')
  })
})
