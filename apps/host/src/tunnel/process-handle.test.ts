// bug 3c98e297：onLine 双流合并钉——cloudflared URL 行打 stderr（实测 stdout 零行），
// 单挂 stdout 的旧装配捕获必超时。fake child = EventEmitter + PassThrough 双流。
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createChildProcessHandle } from './process-handle.js'

interface FakeChild extends EventEmitter {
  stdout: PassThrough
  stderr: PassThrough
  pid: number
  exitCode: number | null
  killed: boolean
  kill(): boolean
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.pid = 4242
  child.exitCode = null
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.exitCode = 0
    child.emit('exit', 0)
    return true
  }
  return child
}

function linesOf(handle: { onLine(l: (line: string) => void): unknown }): Promise<string[]> {
  const lines: string[] = []
  handle.onLine((line) => lines.push(line))
  return new Promise((resolve) => setImmediate(() => resolve(lines)))
}

describe('bug 3c98e297：子进程句柄 onLine 双流合并', () => {
  it('stderr 行到达 onLine（cloudflared URL 行载体——单挂 stdout 必红）', async () => {
    const child = fakeChild()
    const handle = createChildProcessHandle(child as never)
    const pending = linesOf(handle)
    child.stderr.write('2026-10-15 INF |  https://words.trycloudflare.com\n')
    child.stderr.end()
    child.stdout.end()
    const lines = await pending
    expect(lines).toContain('2026-10-15 INF |  https://words.trycloudflare.com')
  })

  it('stdout 行同样到达（pinggy banner 载体）——两流合并不丢路', async () => {
    const child = fakeChild()
    const handle = createChildProcessHandle(child as never)
    const pending = linesOf(handle)
    child.stdout.write('tcp://random-12-34.pinggy.link\n')
    child.stdout.end()
    child.stderr.end()
    const lines = await pending
    expect(lines).toContain('tcp://random-12-34.pinggy.link')
  })

  it('exit 事件透传 exitCode；kill 有界收口', async () => {
    const child = fakeChild()
    const handle = createChildProcessHandle(child as never)
    const exited = new Promise<number | null>((resolve) => handle.onExit(resolve))
    child.emit('exit', 1)
    expect(await exited).toBe(1)
    await expect(handle.kill()).resolves.toBeUndefined()
    expect(child.killed).toBe(true)
  })
})
