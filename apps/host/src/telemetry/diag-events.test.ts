// 诊断事件域单测（AC1/AC2）：diag/log 事件经 cordis ctx emit/on 承载，appender 为
// 唯一订阅者；JSONL 行字段全集（固定字段恒在、可选缺席省略）；ALS 缝注入可控。
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { attachDiagAppender } from './appender.js'
import { createDiagContextStore, runWithDiagContext } from './diag-context.js'
import { DIAG_EVENT, emitDiag } from './diag-events.js'

const dirs: string[] = []

async function tempLogsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-telemetry-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

const BASE = {
  level: 'error',
  process: 'main',
  event: 'test-event',
  message: 'boom',
} as const

describe('诊断事件域（cordis ctx emit/on）', () => {
  it('emit 侧零静态依赖：一次 emit → 唯一订阅者 appender 收到并落盘', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const { appender, dispose } = attachDiagAppender(ctx, { dir })
    // 唯一订阅者判据：事件域内仅 appender 一个监听
    const hooks = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events._hooks
    expect(hooks[DIAG_EVENT]).toHaveLength(1)

    emitDiag(ctx, { ...BASE })
    await appender.idle()
    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    const row = JSON.parse(await readFile(join(dir, files[0]!), 'utf8')) as Record<string, unknown>
    expect(row.event).toBe('test-event')
    expect(row.process).toBe('main')
    dispose()
  })

  it('dispose 退订后 emit 不再落盘', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const { appender, dispose } = attachDiagAppender(ctx, { dir })
    dispose()
    emitDiag(ctx, { ...BASE })
    await appender.idle()
    expect(appender.pendingCount).toBe(0)
    expect(await readdir(dir)).toHaveLength(0)
  })

  it('订阅回调不向 emit 点抛（红线①——appender 内部故障被吞）', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const { appender } = attachDiagAppender(ctx, { dir, maxQueue: 0 }) // 队列上界 0 = 恒丢弃
    expect(() => emitDiag(ctx, { ...BASE })).not.toThrow()
    expect(appender.counters.queueDropped).toBe(1)
  })
})

describe('JSONL 字段全集（AC2）', () => {
  it('固定字段恒在 + 可选字段（stack/projectId/sessionId/cwd）呈现', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const { appender } = attachDiagAppender(ctx, { dir })
    emitDiag(ctx, {
      ...BASE,
      stack: 'Error: boom\n    at f (a.ts:1:1)',
      projectId: 'p1',
      sessionId: 's1',
      cwd: 'C:\\ws',
    })
    await appender.idle()
    const row = JSON.parse(await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')) as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(
      ['cwd', 'event', 'level', 'message', 'process', 'projectId', 'sessionId', 'stack', 'timestamp', 'trace_id'].sort(),
    )
    expect(row.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) // UTC ISO
    expect(row.trace_id).toBe('-')
  })

  it('可选字段缺席省略（无 stack/projectId/sessionId/cwd）', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const { appender } = attachDiagAppender(ctx, { dir })
    emitDiag(ctx, { ...BASE })
    await appender.idle()
    const row = JSON.parse(await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')) as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(['event', 'level', 'message', 'process', 'timestamp', 'trace_id'].sort())
  })

  it('ALS 缝注入（评审 Note-4）：trace_id/projectId 等从注入实例读取', async () => {
    const dir = await tempLogsDir()
    const ctx = new Context()
    const als = createDiagContextStore()
    const { appender } = attachDiagAppender(ctx, { dir, als })
    runWithDiagContext(als, { traceId: 'tr-1', sessionId: 's9', cwd: 'C:\\x', projectId: 'pj' }, () => {
      emitDiag(ctx, { ...BASE })
    })
    await appender.idle()
    const row = JSON.parse(await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')) as Record<string, unknown>
    expect(row.trace_id).toBe('tr-1')
    expect(row.sessionId).toBe('s9')
    expect(row.cwd).toBe('C:\\x')
    expect(row.projectId).toBe('pj')
  })
})
