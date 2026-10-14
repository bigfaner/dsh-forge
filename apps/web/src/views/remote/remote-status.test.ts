// 远程状态模型单测（mobile-remote-approval 1.2/fix-3）——相位派生（配置意图 × 实际绑定
// 双源，pending = 待重启生效缝）+ 局域网地址派生 + 快照映射（状态单源纪律：模型只做
// 「产品配置 + boot manifest 读数 → 相位」纯映射）。
import { describe, expect, it } from 'vitest'
import { remoteLanAddressOf, remotePhaseOf, remoteSnapshotOf } from './remote-status.js'

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

describe('remoteLanAddressOf 地址派生', () => {
  it('监听实况 → http://<当前主机名>:<port>', () => {
    expect(remoteLanAddressOf({ exposureActive: true, port: 8787 }, '192.168.1.7')).toBe('http://192.168.1.7:8787')
  })

  it('非监听/缺 port = undefined（面板地址行回退提示语）', () => {
    expect(remoteLanAddressOf({ exposureActive: false, port: 8787 }, '192.168.1.7')).toBeUndefined()
    expect(remoteLanAddressOf({ exposureActive: true }, '192.168.1.7')).toBeUndefined()
  })
})

describe('remoteSnapshotOf 快照映射（配置 + manifest → 快照）', () => {
  it('配置缺席（undefined）= fail-soft off 快照（读面失败/畸形不虚报不炸装配）', () => {
    expect(remoteSnapshotOf(undefined, { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' })).toEqual({ phase: 'off' })
    expect(remoteSnapshotOf(undefined, undefined)).toEqual({ phase: 'off' })
  })

  it('配置开 × remoteHost 0.0.0.0 = listening + 局域网地址（manifest.url 端口 + 页面 hostname）', () => {
    const snapshot = remoteSnapshotOf(true, { url: 'http://127.0.0.1:19400/#token', remoteHost: '0.0.0.0' })
    expect(snapshot.phase).toBe('listening')
    expect(snapshot.lanAddress).toContain(':19400')
  })

  it('配置开 × 回环实况 = pending（待重启生效——开关后未重启的实机态）', () => {
    expect(remoteSnapshotOf(true, { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' })).toEqual({ phase: 'pending' })
    expect(remoteSnapshotOf(true, undefined)).toEqual({ phase: 'pending' })
  })

  it('配置关 × 全卡实况 = pending（关闭待重启收回）；配置关 × 回环 = off', () => {
    expect(remoteSnapshotOf(false, { url: 'http://127.0.0.1:1/', remoteHost: '0.0.0.0' })).toEqual({ phase: 'pending' })
    expect(remoteSnapshotOf(false, { url: 'http://127.0.0.1:1/', remoteHost: '127.0.0.1' })).toEqual({ phase: 'off' })
  })

  it('manifest.url 畸形/缺端口 = listening 但地址缺席（面板回退提示——地址行不炸）', () => {
    const snapshot = remoteSnapshotOf(true, { url: 'not a url', remoteHost: '0.0.0.0' })
    expect(snapshot.phase).toBe('listening')
    expect(snapshot.lanAddress).toBeUndefined()
  })
})
