// main 兜底钩挂接面单测（AC4 红线③——崩溃行确定落盘 + 挂接/退订面）。
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagAppender } from './appender.js'
import { installMainFallbackHooks, type FallbackProcessLike } from './fallback.js'

const dirs: string[] = []

async function tempLogsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-fallback-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** EventEmitter 替身（run.test.ts 同型——进程事件面注入） */
function fakeProcess(): EventEmitter & FallbackProcessLike {
  return new EventEmitter() as EventEmitter & FallbackProcessLike
}

describe('installMainFallbackHooks（兜底钩挂接面）', () => {
  it('uncaughtException → 崩溃行同步确定落盘（异步队列零参与）', async () => {
    const dir = await tempLogsDir()
    const appender = new DiagAppender({ dir, now: () => new Date('2026-10-19T00:00:00.000Z') })
    const proc = fakeProcess()
    installMainFallbackHooks(proc, appender)
    const err = new Error('uncaught boom')
    proc.emit('uncaughtException', err)
    const files = await readdir(dir)
    expect(files).toEqual(['app-20261019.jsonl'])
    const row = JSON.parse(await readFile(join(dir, files[0]!), 'utf8')) as Record<string, unknown>
    expect(row.event).toBe('fallback-uncaught')
    expect(row.level).toBe('error')
    expect(row.process).toBe('main')
    expect(row.message).toBe('uncaught boom')
    expect(row.stack).toContain('uncaught boom')
  })

  it('unhandledRejection → 崩溃行（reason 非 Error 也落 message）', async () => {
    const dir = await tempLogsDir()
    const appender = new DiagAppender({ dir, now: () => new Date('2026-10-19T00:00:00.000Z') })
    const proc = fakeProcess()
    installMainFallbackHooks(proc, appender)
    proc.emit('unhandledRejection', 'string reason')
    const row = JSON.parse(await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')) as Record<string, unknown>
    expect(row.event).toBe('fallback-unhandled')
    expect(row.message).toBe('string reason')
    expect(row.stack).toBeUndefined()
  })

  it('退订器：dispose 后事件不再落盘', async () => {
    const dir = await tempLogsDir()
    const appender = new DiagAppender({ dir, now: () => new Date('2026-10-19T00:00:00.000Z') })
    const proc = fakeProcess()
    const dispose = installMainFallbackHooks(proc, appender)
    dispose()
    proc.emit('uncaughtException', new Error('after dispose'))
    expect(await readdir(dir)).toHaveLength(0)
  })
})
