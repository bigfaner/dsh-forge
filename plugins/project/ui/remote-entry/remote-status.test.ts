// 远程状态模型单测（mobile-remote-approval 1.2/fix-3）——相位派生（配置意图 × 实际绑定
// 双源，pending = 待重启生效缝）+ 局域网地址派生 + 快照映射（状态单源纪律：模型只做
// 「产品配置 + boot manifest 读数 → 相位」纯映射）。
import { describe, expect, it } from 'vitest'
import { remoteDotStateOf, remotePhaseOf, remoteSnapshotOf } from './remote-status.js'
import type { RemoteStatusSnapshot } from './remote-status.js'

describe('remoteDotStateOf 图标圆点四态（fix-12 用户纠正：本体恒 currentColor，右上角圆点承载状态）', () => {
  const NOW = 1_000_000

  it('未启用（off）= 无圆点（none——零视觉噪声）', () => {
    expect(remoteDotStateOf({ phase: 'off' }, NOW)).toBe('none')
  })

  it('已启用未连接（listening / pending）= 橙（warning）', () => {
    expect(remoteDotStateOf({ phase: 'listening' }, NOW)).toBe('warning')
    expect(remoteDotStateOf({ phase: 'pending' }, NOW)).toBe('warning')
  })

  it('已启用且连接成功（connected）= 绿（success）', () => {
    expect(remoteDotStateOf({ phase: 'connected' }, NOW)).toBe('success')
  })

  it('连接失败 = 红（error）——listening × 隧道面 TTL 已到期（隧道失效 = 双链路失败撤面前的失败读数）', () => {
    const snapshot: RemoteStatusSnapshot = {
      phase: 'listening',
      lanAddress: 'http://192.168.1.7:8787',
      tunnel: { url: 'https://t.example/', provider: 'pinggy', expiresAt: NOW - 1 },
    }
    expect(remoteDotStateOf(snapshot, NOW)).toBe('error')
  })

  it('隧道在线（TTL 未到期/缺席）不误报红——读数缺席不虚报失败（fail-soft 口径）', () => {
    const live: RemoteStatusSnapshot = {
      phase: 'listening',
      tunnel: { url: 'https://t.example/', provider: 'cloudflared' },
    }
    const alive: RemoteStatusSnapshot = {
      phase: 'listening',
      tunnel: { url: 'https://t.example/', provider: 'pinggy', expiresAt: NOW + 60_000 },
    }
    expect(remoteDotStateOf(live, NOW)).toBe('warning')
    expect(remoteDotStateOf(alive, NOW)).toBe('warning')
  })
})

describe('remotePhaseOf 相位派生（fix-3 重启生效形态）', () => {
  it('配置关 × 未暴露 = off（默认形制；历史残留 devices 读数不抬相位）', () => {
    expect(remotePhaseOf({ enabled: false })).toBe('off')
    expect(remotePhaseOf({ enabled: false, exposureActive: false, devicesConnected: true })).toBe('off')
  })

  it('配置开 × 全卡绑定实况 = listening（重启后真监听态）', () => {
    expect(remotePhaseOf({ enabled: true, exposureActive: true })).toBe('listening')
    expect(remotePhaseOf({ enabled: true, exposureActive: true, devicesConnected: false })).toBe('listening')
  })

  it('有设备已连接 = connected（读数在场且真）', () => {
    expect(remotePhaseOf({ enabled: true, exposureActive: true, devicesConnected: true })).toBe('connected')
  })

  it('配置 ↔ 实况不一致 = pending（待重启生效提示态——开启未生效/关闭未收回两向同语义；不伪装 listening）', () => {
    expect(remotePhaseOf({ enabled: true, exposureActive: false })).toBe('pending')
    expect(remotePhaseOf({ enabled: false, exposureActive: true })).toBe('pending')
  })

  it('exposure 读数缺席（undefined）= 与 false 同判（回环默认形制——不误报 pending）', () => {
    expect(remotePhaseOf({ enabled: false })).toBe('off')
    expect(remotePhaseOf({ enabled: true })).toBe('pending')
  })
})

describe('remoteSnapshotOf 快照映射（配置 + manifest → 快照）', () => {
  it('配置缺席（undefined）= fail-soft off 快照（读面失败/畸形不虚报不炸装配）', () => {
    expect(remoteSnapshotOf(undefined, { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' })).toEqual({ phase: 'off' })
    expect(remoteSnapshotOf(undefined, undefined)).toEqual({ phase: 'off' })
  })

  it('fix-5：配置开 × remoteHost 0.0.0.0 × remotePairUrl 在场 = listening + lanAddress = 官方配对地址单源（不再自造 location 拼接）', () => {
    const snapshot = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/#token',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/?token=v1.x',
    })
    expect(snapshot.phase).toBe('listening')
    expect(snapshot.lanAddress).toBe('http://192.168.1.7:19400/?token=v1.x')
  })

  it('fix-5：remotePairUrl 缺席（旧 child/无局域网 IPv4 降级）= listening 但地址缺席（面板回退提示——不自造地址）', () => {
    const snapshot = remoteSnapshotOf(true, { url: 'http://127.0.0.1:19400/', remoteHost: '0.0.0.0' })
    expect(snapshot.phase).toBe('listening')
    expect(snapshot.lanAddress).toBeUndefined()
  })

  it('配置开 × 回环实况 = pending（待重启生效——开关后未重启的实机态）', () => {
    expect(remoteSnapshotOf(true, { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' })).toEqual({ phase: 'pending' })
    expect(remoteSnapshotOf(true, undefined)).toEqual({ phase: 'pending' })
  })

  it('配置关 × 全卡实况 = pending（关闭待重启收回）；配置关 × 回环 = off', () => {
    expect(remoteSnapshotOf(false, { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' })).toEqual({ phase: 'pending' })
    expect(remoteSnapshotOf(false, { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' })).toEqual({ phase: 'off' })
  })

  it('manifest.url 畸形 = 相位判读不受阻（remoteHost 单源；地址只认 remotePairUrl）', () => {
    const snapshot = remoteSnapshotOf(true, { url: 'not a url', remoteHost: '0.0.0.0' })
    expect(snapshot.phase).toBe('listening')
    expect(snapshot.lanAddress).toBeUndefined()
  })

  it('fix-7：manifest.remoteDeviceConnected 在场且真 = connected（/pair 握手成功读数——等待扫码抬手机已连接）', () => {
    const snapshot = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
      remoteDeviceConnected: true,
    })
    expect(snapshot.phase).toBe('connected')
    expect('lanAddress' in snapshot).toBe(false)
  })

  it('fix-7：remoteDeviceConnected 缺席/false = listening（不虚报连接）', () => {
    expect(
      remoteSnapshotOf(true, { url: 'http://127.0.0.1:19400/', remoteHost: '0.0.0.0', remotePairUrl: 'http://x/pair?token=t' }).phase,
    ).toBe('listening')
    expect(
      remoteSnapshotOf(true, { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0', remoteDeviceConnected: false }).phase,
    ).toBe('listening')
  })

  it('fix-6：remotePairExpiresAt 在场 = 快照 pairExpiresAt 读数透传（倒计时单源）；缺席 = 字段不出现', () => {
    const withTtl = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
      remotePairExpiresAt: 1_234_567,
    })
    expect(withTtl.pairExpiresAt).toBe(1_234_567)
    const withoutTtl = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
    })
    expect('pairExpiresAt' in withoutTtl).toBe(false)
  })

  it('fix-17 ③：remotePin/remotePinExpiresAt 在场 = 快照 pin/pinExpiresAt 透传（互联网 tab PIN 卡单源）；畸形 = 字段不出现', () => {
    const withPin = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
      remotePin: '482913',
      remotePinExpiresAt: 1_234_567,
    })
    expect(withPin.pin).toBe('482913')
    expect(withPin.pinExpiresAt).toBe(1_234_567)
    const withoutPin = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
    })
    expect('pin' in withoutPin).toBe(false)
    expect('pinExpiresAt' in withoutPin).toBe(false)
    for (const badPin of ['12345', 'abcdef', 42 as unknown as string]) {
      const bad = remoteSnapshotOf(true, {
        url: 'http://127.0.0.1:19400/',
        remoteHost: '0.0.0.0',
        remotePairUrl: 'http://192.168.1.7:19400/pair?token=t',
        remotePin: badPin,
        remotePinExpiresAt: 1,
      })
      expect('pin' in bad).toBe(false)
    }
  })
})

describe('fix-19 ⑦ 意外死亡位透传（manifest tunnelUnexpectedlyClosed → 快照 tunnel.unexpectedlyClosed——UI 自动重开单源）', () => {
  it('死亡位随隧道面收拢携带；健康面不携带', () => {
    const dead = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      tunnelUrl: 'https://x.pinggy.link/pair?token=t',
      tunnelProvider: 'pinggy',
      tunnelUnexpectedlyClosed: true,
    })
    expect(dead.tunnel?.unexpectedlyClosed).toBe(true)
    const healthy = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      tunnelUrl: 'https://x.pinggy.link/pair?token=t',
      tunnelProvider: 'pinggy',
    })
    expect(healthy.tunnel?.unexpectedlyClosed).toBeUndefined()
  })
})

// ── fix-26 durable PIN 读数（长效位透传——UI hint 双态单源） ──

describe('fix-26 remoteSnapshotOf：remotePinDurable 透传（长效 PIN）', () => {
  it('durable = true：pin 在场 + pinDurable 位；pinExpiresAt 缺席不阻 PIN 卡（长效无 TTL）', () => {
    const snap = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePin: '482913',
      remotePinDurable: true,
    })
    expect(snap.phase).toBe('listening')
    expect(snap.pin).toBe('482913')
    expect(snap.pinDurable).toBe(true)
    expect(snap.pinExpiresAt).toBeUndefined()
  })

  it('临时 PIN 面不变：无 durable 位 + TTL 齐备才携带（既有口径零回退）', () => {
    const snap = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePin: '482913',
      remotePinExpiresAt: Date.now() + 240_000,
    })
    expect(snap.pin).toBe('482913')
    expect(snap.pinDurable).toBeUndefined()
    expect(snap.pinExpiresAt).toBeDefined()
    // durable 读数缺席但 TTL 缺席 = 既有降级（PIN 不呈现）——机制面不变
    const noTtl = remoteSnapshotOf(true, {
      url: 'http://127.0.0.1:19400/',
      remoteHost: '0.0.0.0',
      remotePin: '482913',
    })
    expect(noTtl.pin).toBeUndefined()
  })
})
