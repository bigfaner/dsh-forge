// 远程状态模型单测（mobile-remote-approval 1.2/fix-3）——相位派生（配置意图 × 实际绑定
// 双源，pending = 待重启生效缝）+ 局域网地址派生 + 快照映射（状态单源纪律：模型只做
// 「产品配置 + boot manifest 读数 → 相位」纯映射）。
import { describe, expect, it } from 'vitest'
import { remotePhaseOf, remoteSnapshotOf } from './remote-status.js'

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
})
