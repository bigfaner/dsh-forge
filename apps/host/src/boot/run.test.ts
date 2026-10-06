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
import { createBridgeChannel, resolveChildEntry, type BridgeChildFace } from './run.js'

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
