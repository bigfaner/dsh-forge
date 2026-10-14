// 远程状态注入面单测（mobile-remote-approval 1.2/fix-3——plugin.ts buildRemoteStatusSource）：
// 产品自有配置（forge:settings/get remoteApproval.enabled）× boot manifest（remoteHost 实际
// 绑定）双源 → 相位快照（配置↔实况不一致 = pending 待重启生效）；桥缺席/失败 = fail-soft
// off；setEnabled = forge:settings/set remoteApproval 分节覆写 + 即时 refresh。
import { afterEach, describe, expect, it } from 'vitest'
import { SIDEBAR_FOOTER_ACTION_SLOT, buildRemoteStatusSource, type ForgeClientCtx } from './plugin.js'

/** dshForge 桥替身安装面（globalThis.dshForge——preloadBridgeOf 读取面；用后还原） */
let installed: unknown
afterEach(() => {
  ;(globalThis as { dshForge?: unknown }).dshForge = installed
  installed = undefined
})

function fakeBridge(overrides: {
  readonly settings?: unknown
  readonly manifest?: { url?: string; remoteHost?: string }
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
  it('配置开 × 全卡绑定实况 → listening 快照（manifest.url 端口入局域网地址）', async () => {
    const remote = buildRemoteStatusSource(
      fakeBridge({
        settings: { remoteApproval: { enabled: true } },
        manifest: { url: 'http://127.0.0.1:19400/#token', remoteHost: '0.0.0.0' },
      }),
    )
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('listening')
    expect(remote.source.getSnapshot().lanAddress).toContain(':19400')
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
