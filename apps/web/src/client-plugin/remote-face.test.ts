// 远程状态注入面单测（mobile-remote-approval 1.2/fix-3——plugin.ts buildRemoteStatusSource）：
// 产品自有配置（forge:settings/get remoteApproval.enabled）× boot manifest（remoteHost 实际
// 绑定）双源 → 相位快照（配置↔实况不一致 = pending 待重启生效）；桥缺席/失败 = fail-soft
// off；setEnabled = forge:settings/set remoteApproval 分节覆写 + 即时 refresh。
import { afterEach, describe, expect, it } from 'vitest'
import {
  SIDEBAR_FOOTER_ACTION_SLOT,
  buildRemoteStatusSource,
  type ForgeClientCtx,
} from './plugin.js'

/** dshForge 桥替身安装面（globalThis.dshForge——preloadBridgeOf 读取面；用后还原） */
let installed: unknown
afterEach(() => {
  ;(globalThis as { dshForge?: unknown }).dshForge = installed
  installed = undefined
})

function fakeBridge(overrides: {
  readonly settings?: unknown
  readonly manifest?: { url?: string; remoteHost?: string; remotePairUrl?: string; remotePairExpiresAt?: number; remoteDeviceConnected?: boolean; tunnelUrl?: string; tunnelProvider?: string; tunnelExpiresAt?: number; remotePin?: string; remotePinExpiresAt?: number }
  readonly invokeFail?: boolean
  readonly written?: { channel: string; payload: unknown }[]
}): ForgeClientCtx {
  installed = (globalThis as { dshForge?: unknown }).dshForge
  const bridge = {
    invoke: (channel: string, payload?: unknown) => {
      overrides.written?.push({ channel, payload })
      if (overrides.invokeFail === true) return Promise.reject(new Error('boom'))
      if (channel === 'forge:settings/get') return Promise.resolve({ ok: true, data: overrides.settings })
      if (channel === 'forge:settings/set') return Promise.resolve({ ok: true, data: null })
      return Promise.reject(new Error(`unexpected channel ${channel}`))
    },
    getBootManifest: () => Promise.resolve(overrides.manifest ?? {}),
  }
  ;(globalThis as { dshForge?: unknown }).dshForge = bridge
  return {} as unknown as ForgeClientCtx
}

describe('sidebar.footer.action 槽常量', () => {
  it('字面量 = 官方 dsh-client-ui-sidebar SlotMap 扩展槽（pin-06 探针锚同源）', () => {
    expect(SIDEBAR_FOOTER_ACTION_SLOT).toBe('sidebar.footer.action')
  })
})

describe('buildRemoteStatusSource（fix-3 产品配置通道）', () => {
  it('fix-7：manifest.remoteDeviceConnected 在场且真 → connected 快照（/pair 握手成功读数透传）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:1/',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
          remoteDeviceConnected: true,
        },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('connected')
  })

  it('fix-10（bug e7234823）：manifest 隧道面透传快照.tunnel（互联网 tab 读数缝——镜像 remote-status 口径）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:1/',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
          tunnelUrl: 'https://x.pinggy.link/pair?token=t',
          tunnelProvider: 'pinggy',
          tunnelExpiresAt: 1_234_567,
        },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().tunnel).toEqual({
      url: 'https://x.pinggy.link/pair?token=t',
      provider: 'pinggy',
      expiresAt: 1_234_567,
    })
  })

  it('fix-10：隧道撤面（tunnelUrl 缺席/畸形）= 快照.tunnel 不出现（空态收敛单源——不再恒 starting）', async () => {
    const absent = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' },
      }),
    )
    await absent.refresh()
    expect('tunnel' in absent.source.getSnapshot()).toBe(false)

    const malformed = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:1/',
          remoteHost: '0.0.0.0',
          tunnelUrl: 'https://x/pair?token=t',
          tunnelProvider: 'evil',
        },
      }),
    )
    await malformed.refresh()
    expect('tunnel' in malformed.source.getSnapshot()).toBe(false)
  })

  it('fix-10：disconnectDevice 上行 forge:remote/disconnect 并即时 refresh（撤该设备会话缝）', async () => {
    const written: { channel: string; payload?: unknown }[] = []
    installed = (globalThis as { dshForge?: unknown }).dshForge
    const bridge = {
      invoke: (channel: string, payload?: unknown) => {
        written.push({ channel, payload })
        if (channel === 'forge:settings/get') return Promise.resolve({ ok: true, data: { remoteApproval: { enabled: true } } })
        if (channel === 'forge:remote/disconnect') return Promise.resolve({ ok: true, data: { revoked: true } })
        return Promise.reject(new Error(`unexpected channel ${channel}`))
      },
      getBootManifest: () =>
        Promise.resolve({ url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' }),
    }
    ;(globalThis as { dshForge?: unknown }).dshForge = bridge
    const remote = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await remote.refresh()
    const ok = await remote.disconnectDevice()
    expect(ok).toBe(true)
    expect(written.map((w) => w.channel)).toContain('forge:remote/disconnect')
  })

  it('配置开 × 全卡绑定实况 → listening 快照（fix-5：lanAddress = manifest.remotePairUrl 官方配对地址单源）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:19400/#token',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/?token=v1.x',
        },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('listening')
    expect(remote.source.getSnapshot().lanAddress).toBe('http://192.168.1.7:19400/?token=v1.x')
  })

  it('fix-5：remotePairUrl 缺席（真宿主自造 hostname 读数缝降级）= listening 但 lanAddress 缺席（不自造地址）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { url: 'http://127.0.0.1:19400/', remoteHost: '0.0.0.0' },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('listening')
    expect(remote.source.getSnapshot().lanAddress).toBeUndefined()
  })

  it('fix-6：remotePairExpiresAt 在场 = 快照 pairExpiresAt 透传（倒计时单源；缺席镜像 = 字段不出现）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:19400/',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
          remotePairExpiresAt: 1_234_567,
        },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().pairExpiresAt).toBe(1_234_567)

    const absent = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:19400/',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
        },
      }),
    )
    await absent.refresh()
    expect('pairExpiresAt' in absent.source.getSnapshot()).toBe(false)
  })

  it('配置开 × 回环实况 → pending（待重启生效——不伪装 listening）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('pending')
  })

  it('配置关 × 回环实况 → off；配置关 × 全卡实况 → pending（关闭待重启收回）', async () => {
    const off = buildRemoteStatusSource(
      fakeBridge({
        settings: {},
        manifest: { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' },
      }),
    )
    await off.refresh()
    expect(off.source.getSnapshot().phase).toBe('off')

    const pending = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: false } },
        manifest: { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' },
      }),
    )
    await pending.refresh()
    expect(pending.source.getSnapshot().phase).toBe('pending')
  })

  it('桥缺席 / 配置读失败 = fail-soft off 快照（不炸装配）', async () => {
    delete (globalThis as { dshForge?: unknown }).dshForge
    const absent = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await absent.refresh()
    expect(absent.source.getSnapshot().phase).toBe('off')

    const boom = buildRemoteStatusSource(fakeBridge({ invokeFail: true }))
    await boom.refresh()
    expect(boom.source.getSnapshot().phase).toBe('off')
  })

  it('setEnabled 回写 forge:settings/set（只携 remoteApproval 节——worker 段不被冲掉）并即时 refresh', async () => {
    const written: { channel: string; payload: unknown }[] = []
    let settings: Record<string, unknown> = { worker: { provider: 'p', model: 'm', reasoning: 'high' } }
    installed = (globalThis as { dshForge?: unknown }).dshForge
    const bridge = {
      invoke: (channel: string, payload?: unknown) => {
        written.push({ channel, payload })
        if (channel === 'forge:settings/get') return Promise.resolve({ ok: true, data: settings })
        if (channel === 'forge:settings/set') {
          settings = { ...settings, ...(payload as Record<string, unknown>) }
          return Promise.resolve({ ok: true, data: null })
        }
        return Promise.reject(new Error(`unexpected channel ${channel}`))
      },
      getBootManifest: () => Promise.resolve({ url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' }),
    }
    ;(globalThis as { dshForge?: unknown }).dshForge = bridge
    const remote = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('off')
    const ok = await remote.setEnabled(true)
    expect(ok).toBe(true)
    const setCall = written.find((w) => w.channel === 'forge:settings/set')
    expect(setCall).toEqual({ channel: 'forge:settings/set', payload: { remoteApproval: { enabled: true } } })
    expect(settings['worker']).toEqual({ provider: 'p', model: 'm', reasoning: 'high' }) // 分节覆写——worker 段保留
    expect(remote.source.getSnapshot().phase).toBe('pending') // 配置已开 × 绑定仍回环 = 待重启
  })

  it('桥缺席 = setEnabled false（fail-soft，不改快照）', async () => {
    delete (globalThis as { dshForge?: unknown }).dshForge
    const remote = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await remote.refresh()
    expect(await remote.setEnabled(true)).toBe(false)
    expect(remote.source.getSnapshot().phase).toBe('off')
  })

  it('fix-17 ③：manifest.remotePin/remotePinExpiresAt 透传快照 pin/pinExpiresAt（互联网 tab PIN 卡单源——镜像 remote-status 口径）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: {
          url: 'http://127.0.0.1:1/',
          remoteHost: '0.0.0.0',
          remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
          remotePin: '482913',
          remotePinExpiresAt: 1_234_567,
        },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().pin).toBe('482913')
    expect(remote.source.getSnapshot().pinExpiresAt).toBe(1_234_567)

    const absent = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' },
      }),
    )
    await absent.refresh()
    expect('pin' in absent.source.getSnapshot()).toBe(false)
  })

  it('fix-17 ②：tunnelEnsure 上行 dsh-forge:remote/tunnel-toggle 并即时 refresh（tab 切换重连缝）', async () => {
    const written: { channel: string; payload?: unknown }[] = []
    installed = (globalThis as { dshForge?: unknown }).dshForge
    const bridge = {
      invoke: (channel: string, payload?: unknown) => {
        written.push({ channel, payload })
        if (channel === 'forge:settings/get') return Promise.resolve({ ok: true, data: { remoteApproval: { enabled: true } } })
        if (channel === 'dsh-forge:remote/tunnel-toggle') return Promise.resolve(true)
        return Promise.reject(new Error(`unexpected channel ${channel}`))
      },
      getBootManifest: () => Promise.resolve({ url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' }),
    }
    ;(globalThis as { dshForge?: unknown }).dshForge = bridge
    const remote = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await remote.refresh()
    await expect(remote.tunnelEnsure()).resolves.toBe(true)
    expect(written.map((w) => w.channel)).toContain('dsh-forge:remote/tunnel-toggle')
  })

  it('fix-17 ②：桥缺席/通道失败 = tunnelEnsure false（fail-soft 不炸 tab 切换）', async () => {
    delete (globalThis as { dshForge?: unknown }).dshForge
    const remote = buildRemoteStatusSource({} as unknown as ForgeClientCtx)
    await expect(remote.tunnelEnsure()).resolves.toBe(false)
  })

  it('订阅面：refresh 后通知订阅者（useSyncExternalStore 直连契约）', async () => {
    const remote = buildRemoteStatusSource(fakeBridge({ settings: {} }))
    let notified = 0
    const dispose = remote.source.subscribe(() => {
      notified += 1
    })
    await remote.refresh()
    expect(notified).toBeGreaterThan(0)
    dispose()
  })
})
