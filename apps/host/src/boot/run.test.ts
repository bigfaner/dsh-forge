// 4.1 打包形态 boot child 入口解析 pin（run.ts resolveChildEntry）+ 3.1 桥通道
//（createBridgeChannel：rpc-result 按 id 结算 / event 分支扇出 / close 全量拒绝——
// 进程编排与通道解耦后的纯逻辑面，EventEmitter 替身注入）。
// 权威：tech-design「打包管线（Windows NSIS）」+ §交互二事件推送链（G1-09）。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FORGE_EVENT_CHANNELS } from '@dsh-forge/contracts'
import { applyPairConnected, applyPairDisconnected, applyPairMessage, applyTunnelMessage, createBridgeChannel, resolveChildEntry, type BridgeChildFace } from './run.js'
import { buildBootManifest } from './manifest.js'

const MODULE_URL = 'file:///Z:/worktrees/redesign/apps/host/dist/boot/run.js'
let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-forge-child-entry-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveChildEntry 双形态', () => {
  it('resourcesDir 未给（dev）→ 本模块同目录 child.js（workspace dist 解析邻接）', () => {
    const entry = resolveChildEntry(MODULE_URL)
    expect(entry.replaceAll('\\', '/')).toMatch(/apps\/host\/dist\/boot\/child\.js$/)
  })

  it('resourcesDir 给定且 host-dist 在场（packaged）→ {resources}/runtime/host-dist/boot/child.js', () => {
    const packaged = join(dir, 'runtime', 'host-dist', 'boot', 'child.js')
    mkdirSync(join(dir, 'runtime', 'host-dist', 'boot'), { recursive: true })
    writeFileSync(packaged, '// stub', 'utf8')
    const entry = resolveChildEntry(MODULE_URL, dir)
    expect(entry).toBe(packaged)
  })

  it('resourcesDir 给定但 host-dist 缺席（半成型资源）→ 直接 throw（fix-33 ④：不回退 dev 入口——打包形态 dev 入口不在场且 asar 路径误导，早 throw 早定位）', () => {
    expect(() => resolveChildEntry(MODULE_URL, join(dir, 'nonexistent-resources'))).toThrow(/host-dist 缺席/)
  })
})

// ── 3.1 桥通道（createBridgeChannel）——事件链中段 + RPC 结算面 ──

/** child 替身（EventEmitter 结构兼容 BridgeChildFace；send 记录出站消息可编程成败） */
function fakeChild() {
  const child = new EventEmitter() as unknown as EventEmitter & { send(message: unknown): boolean }
  const sent: unknown[] = []
  let failSend = false
  child.send = (message: unknown): boolean => {
    if (failSend) return false
    sent.push(message)
    return true
  }
  return {
    child: child as unknown as BridgeChildFace & { emit(event: string, ...args: unknown[]): unknown },
    sent,
    failNextSend(): void {
      failSend = true
    },
  }
}

describe('createBridgeChannel · event 分支（交互二事件链中段——G1-09）', () => {
  it("事件消息 → onEvent 订阅方收 { projectId }（channel 恒 'forge:events/tasks-changed' 载荷只读）", () => {
    const { child } = fakeChild()
    const channel = createBridgeChannel(child)
    const received: string[] = []
    channel.onEvent((payload) => received.push(payload.projectId))
    child.emit('message', { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p-1' } })
    child.emit('message', { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p-2' } })
    expect(received).toEqual(['p-1', 'p-2'])
  })

  it('畸形事件信封（channel 越界/载荷残缺）静默忽略——订阅方零触发；rpc-result 不误入事件面', () => {
    const { child } = fakeChild()
    const channel = createBridgeChannel(child)
    const received: string[] = []
    channel.onEvent((payload) => received.push(payload.projectId))
    child.emit('message', { type: 'event', channel: 'forge:events/evil', payload: { projectId: 'p' } })
    child.emit('message', { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 42 } })
    child.emit('message', { type: 'rpc-result', id: 1, ok: true, data: 1 })
    expect(received).toEqual([])
  })

  it('退订生效 + 多订阅方扇出 + 订阅方异常隔离（不阻断其余订阅）', () => {
    const { child } = fakeChild()
    const channel = createBridgeChannel(child)
    const a: string[] = []
    const b: string[] = []
    const off = channel.onEvent((payload) => a.push(payload.projectId))
    channel.onEvent(() => {
      throw new Error('listener exploded')
    })
    channel.onEvent((payload) => b.push(payload.projectId))
    child.emit('message', { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p-9' } })
    expect(a).toEqual(['p-9'])
    expect(b).toEqual(['p-9'])
    off()
    child.emit('message', { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p-10' } })
    expect(a).toEqual(['p-9'])
    expect(b).toEqual(['p-9', 'p-10'])
  })
})

describe('applyPairConnected（fix-7 /pair 握手成功——connected 读数入 manifest）', () => {
  const base = () => buildBootManifest('http://127.0.0.1:1/#t', [], '0.0.0.0', 'http://192.168.1.7:1/pair?token=old', 1000)
  it('pair-connected 事实 → manifest 抬 remoteDeviceConnected（url/绑定/配对面保留——粘性 until 重启）', () => {
    const next = applyPairConnected(base())
    expect(next.remoteDeviceConnected).toBe(true)
    expect(next.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=old')
    expect(next.remoteHost).toBe('0.0.0.0')
  })

  it('已抬 connected 的 manifest 过 applyPairMessage（token 轮换）→ connected 读数保留（不因轮换丢态）', () => {
    const connected = applyPairConnected(base())
    const rotated = applyPairMessage(connected, { type: 'pair', remotePairUrl: 'http://192.168.1.7:1/pair?token=new', remotePairExpiresAt: 2000 })
    expect(rotated.remoteDeviceConnected).toBe(true)
    expect(rotated.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=new')
  })
})

describe('applyPairDisconnected（fix-10 断开连接——connected 粘性位收回）', () => {
  const base = () => applyPairConnected(buildBootManifest('http://127.0.0.1:1/#t', [], '0.0.0.0', 'http://192.168.1.7:1/pair?token=old', 1000))
  it('断开连接 → remoteDeviceConnected 收回（UI 回等待扫码——其余面全保留）', () => {
    expect(base().remoteDeviceConnected).toBe(true)
    const next = applyPairDisconnected(base())
    expect('remoteDeviceConnected' in next).toBe(false)
    expect(next.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=old')
    expect(next.remoteHost).toBe('0.0.0.0')
  })
})

describe('applyPairMessage（fix-6 配对轮换——pair 推送刷新 manifest 面）', () => {
  const base = () => buildBootManifest('http://127.0.0.1:1/#t', [], '0.0.0.0', 'http://192.168.1.7:1/pair?token=old', 1000)

  it('pair 消息 → manifest 换新 token + TTL 读数（旧 URL/绑定 host 保留——QR 倒计时到期重取单源）', () => {
    const next = applyPairMessage(base(), { type: 'pair', remotePairUrl: 'http://192.168.1.7:1/pair?token=new', remotePairExpiresAt: 2000 })
    expect(next.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=new')
    expect(next.remotePairExpiresAt).toBe(2000)
    expect(next.url).toBe('http://127.0.0.1:1/#t')
    expect(next.remoteHost).toBe('0.0.0.0')
  })

  it('非 pair 消息 → manifest 原样返回（零重build）', () => {
    const m = base()
    expect(applyPairMessage(m, { type: 'event', channel: 'forge:events/tasks-changed', payload: { projectId: 'p' } })).toBe(m)
    expect(applyPairMessage(m, undefined)).toBe(m)
  })

  it('畸形 pair 消息（TTL 缺席）→ manifest 原样返回（静默忽略）', () => {
    const m = base()
    expect(applyPairMessage(m, { type: 'pair', remotePairUrl: 'http://x/pair?token=t' })).toBe(m)
  })
})

describe('applyTunnelMessage（dsh-mobile-tunnel 隧道状态推送——manifest 隧道面单源消费）', () => {
  const base = () => buildBootManifest('http://127.0.0.1:1/#t', [], '0.0.0.0', 'http://192.168.1.7:1/pair?token=t', 1000)

  it('激活推送 → manifest 携带 tunnelUrl/链路类型/TTL（LAN remotePairUrl 并存——单源消费）', () => {
    const next = applyTunnelMessage(base(), {
      type: 'tunnel',
      tunnelUrl: 'https://x.pinggy.link/pair?token=t',
      tunnelProvider: 'pinggy',
      tunnelExpiresAt: 3600_000,
    })
    expect(next.tunnelUrl).toBe('https://x.pinggy.link/pair?token=t')
    expect(next.tunnelProvider).toBe('pinggy')
    expect(next.tunnelExpiresAt).toBe(3600_000)
    // WiFi 面不受影响
    expect(next.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=t')
    expect(next.remotePairExpiresAt).toBe(1000)
  })

  it('关闭/失效推送（零载荷）→ manifest 隧道字段撤除（WiFi 面保留）', () => {
    const withTunnel = applyTunnelMessage(base(), {
      type: 'tunnel',
      tunnelUrl: 'https://x.pinggy.link/pair?token=t',
      tunnelProvider: 'pinggy',
      tunnelExpiresAt: 1,
    })
    const closed = applyTunnelMessage(withTunnel, { type: 'tunnel' })
    expect('tunnelUrl' in closed).toBe(false)
    expect('tunnelProvider' in closed).toBe(false)
    expect('tunnelExpiresAt' in closed).toBe(false)
    expect(closed.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=t')
    expect(closed.remoteHost).toBe('0.0.0.0')
  })

  it('换线：cloudflared → pinggy 激活推送 → 链路类型/TTL 原位换新（url 保留面不动）', () => {
    const cf = applyTunnelMessage(base(), { type: 'tunnel', tunnelUrl: 'https://x.trycloudflare.com/pair?token=t', tunnelProvider: 'cloudflared' })
    expect(cf.tunnelProvider).toBe('cloudflared')
    const pg = applyTunnelMessage(cf, { type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy', tunnelExpiresAt: 5 })
    expect(pg.tunnelUrl).toBe('https://x.pinggy.link/pair?token=t')
    expect(pg.tunnelProvider).toBe('pinggy')
    expect(pg.tunnelExpiresAt).toBe(5)
    expect(pg.url).toBe('http://127.0.0.1:1/#t')
  })

  it('畸形 tunnel 消息 → manifest 原样返回（静默忽略）', () => {
    const m = base()
    expect(applyTunnelMessage(m, { type: 'tunnel', tunnelProvider: 'pinggy' })).toBe(m)
    expect(applyTunnelMessage(m, { type: 'tunnel', tunnelUrl: 'x', tunnelProvider: 'evil' })).toBe(m)
    expect(applyTunnelMessage(m, undefined)).toBe(m)
  })

  it('token 轮换（pair 消息）→ 隧道面保留（不因 pair 重建丢态；新 URL 由后续 tunnel 推送换新）', () => {
    const withTunnel = applyTunnelMessage(base(), {
      type: 'tunnel',
      tunnelUrl: 'https://x.pinggy.link/pair?token=old',
      tunnelProvider: 'pinggy',
      tunnelExpiresAt: 100,
    })
    const rotated = applyPairMessage(withTunnel, { type: 'pair', remotePairUrl: 'http://192.168.1.7:1/pair?token=new', remotePairExpiresAt: 2000 })
    expect(rotated.tunnelUrl).toBe('https://x.pinggy.link/pair?token=old')
    expect(rotated.tunnelProvider).toBe('pinggy')
    expect(rotated.tunnelExpiresAt).toBe(100)
    expect(rotated.remotePairUrl).toBe('http://192.168.1.7:1/pair?token=new')
  })

  it('pair-connected（握手成功）→ 隧道面保留（connected 粘性位与隧道面共存）', () => {
    const withTunnel = applyTunnelMessage(base(), { type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy' })
    const connected = applyPairConnected(withTunnel)
    expect(connected.remoteDeviceConnected).toBe(true)
    expect(connected.tunnelUrl).toBe('https://x.pinggy.link/pair?token=t')
    expect(connected.tunnelProvider).toBe('pinggy')
  })
})

describe('fix-17 ③ PIN 读数 manifest 面（轮换换新 / 重建保留）', () => {
  const base = () =>
    buildBootManifest('http://127.0.0.1:1/#t', [], '0.0.0.0', 'http://192.168.1.7:1/pair?token=old', 1000, undefined, undefined, '111111', 5000)

  it('pair 轮换消息携 PIN 读数 → manifest PIN 换新（隧道/连接位保留）', () => {
    const next = applyPairMessage(base(), {
      type: 'pair',
      remotePairUrl: 'http://192.168.1.7:1/pair?token=new',
      remotePairExpiresAt: 2000,
      remotePin: '222222',
      remotePinExpiresAt: 8000,
    })
    expect(next.remotePin).toBe('222222')
    expect(next.remotePinExpiresAt).toBe(8000)
    expect(next.remotePairExpiresAt).toBe(2000)
  })

  it('pair 轮换消息零 PIN 载荷 → 保留旧 PIN 读数（旧 child 兼容）', () => {
    const next = applyPairMessage(base(), { type: 'pair', remotePairUrl: 'http://192.168.1.7:1/pair?token=new', remotePairExpiresAt: 2000 })
    expect(next.remotePin).toBe('111111')
    expect(next.remotePinExpiresAt).toBe(5000)
  })

  it('connected/断开/隧道重建 → PIN 读数保留（粘性面不动）', () => {
    expect(applyPairConnected(base()).remotePin).toBe('111111')
    expect(applyPairDisconnected(base()).remotePinExpiresAt).toBe(5000)
    const withTunnel = applyTunnelMessage(base(), { type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy' })
    expect(withTunnel.remotePin).toBe('111111')
    expect(withTunnel.tunnelProvider).toBe('pinggy')
  })
})

describe('createBridgeChannel · RPC 结算面（既有语义回归——提取重构零漂移）', () => {
  it('call → rpc 请求出站（id 递增）；ok 结果按 id 结算', async () => {
    const { child, sent } = fakeChild()
    const channel = createBridgeChannel(child)
    const first = channel.call('forgeTasks', 'listTasks', [{ projectId: 'p-1' }])
    const second = channel.call('forgeDocs', 'read', [{ projectId: 'p-1', docRel: 'x.md' }])
    expect(sent).toEqual([
      { type: 'rpc', id: 1, service: 'forgeTasks', method: 'listTasks', args: [{ projectId: 'p-1' }] },
      { type: 'rpc', id: 2, service: 'forgeDocs', method: 'read', args: [{ projectId: 'p-1', docRel: 'x.md' }] },
    ])
    child.emit('message', { type: 'rpc-result', id: 2, ok: true, data: { content: '' } })
    await expect(second).resolves.toEqual({ content: '' })
    child.emit('message', { type: 'rpc-result', id: 1, ok: false, error: { code: 'ERR_WORKSPACE_DB_UNAVAILABLE', message: 'x' } })
    const caught = await first.then(
      () => undefined,
      (e: unknown) => e,
    )
    expect((caught as Error & { code?: unknown }).code).toBe('ERR_WORKSPACE_DB_UNAVAILABLE')
  })

  it('发送失败（IPC 通道已关）→ 立即拒绝；child close → pending 全量拒绝', async () => {
    const failing = fakeChild()
    failing.failNextSend()
    const failChannel = createBridgeChannel(failing.child)
    await expect(failChannel.call('forgeTasks', 'listTasks', [])).rejects.toThrow(/发送失败/)
    const { child } = fakeChild()
    const channel = createBridgeChannel(child)
    const pending = channel.call('forgeTasks', 'taskStats', [])
    child.emit('close')
    await expect(pending).rejects.toThrow(/boot child 已退出/)
  })
})
