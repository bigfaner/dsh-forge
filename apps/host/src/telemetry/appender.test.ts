// appender 留存与红线单测（AC3/AC4）：UTC 日界滚动、7 天清理、50MB 截断、句柄占用
// 跳过下轮重试；红线① fire-and-forget 写失败计数、红线② 队列上界丢弃计数、
// 红线③ 崩溃路径同步写确定落盘。
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagAppender, logFileNameFor, type AppenderDriver } from './appender.js'

const dirs: string[] = []

async function tempLogsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-appender-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

function dayDate(day: string, time = '00:00:00.000'): Date {
  return new Date(`${day}T${time}Z`)
}

const BASE = { level: 'warn', process: 'child', event: 'e', message: 'm' } as const

describe('trace_id / repeat 字段透传（app-observability 1.2）', () => {
  it('payload.traceId 显式携带（child relay 跨进程链）优先于 ALS', async () => {
    const dir = await tempLogsDir()
    const captured: string[] = []
    const appender = new DiagAppender({
      dir,
      now: () => dayDate('2026-10-19'),
      driver: driverWith({ append: async (file, data) => { void file; captured.push(data) } }),
    })
    appender.handleEvent({ ...BASE, traceId: 'tr-relay' })
    await appender.idle()
    expect(JSON.parse(captured[0]!).trace_id).toBe('tr-relay')
  })

  it('repeat 字段透传入行；缺席省略', async () => {
    const dir = await tempLogsDir()
    const captured: string[] = []
    const appender = new DiagAppender({
      dir,
      now: () => dayDate('2026-10-19'),
      driver: driverWith({ append: async (_file, data) => { captured.push(data) } }),
    })
    appender.handleEvent({ ...BASE, repeat: 4 })
    appender.handleEvent({ ...BASE })
    await appender.idle()
    expect(JSON.parse(captured[0]!).repeat).toBe(4)
    expect(JSON.parse(captured[1]!)).not.toHaveProperty('repeat')
  })
})

/** 零维护替身驱动（维护面用真实 fs，写面按用例注入） */
function driverWith(overrides: Partial<AppenderDriver>): AppenderDriver {
  return {
    append: async () => {},
    appendSync: () => {},
    sizeOf: async () => undefined,
    list: async () => [],
    truncate: async () => {},
    remove: async () => {},
    ...overrides,
  }
}

describe('留存策略（AC3）', () => {
  it('UTC 日界滚动：app-YYYYMMDD.jsonl 按行 timestamp 日切', async () => {
    const dir = await tempLogsDir()
    let now = dayDate('2026-10-19')
    const appender = new DiagAppender({ dir, now: () => now })
    appender.handleEvent({ ...BASE })
    now = dayDate('2026-10-20', '01:00:00.000')
    appender.handleEvent({ ...BASE, message: 'm2' })
    await appender.idle()
    expect((await readdir(dir)).sort()).toEqual(['app-20261019.jsonl', 'app-20261020.jsonl'])
  })

  it('保留 7 天清理：第 8 天文件被删除，窗口内保留', async () => {
    const dir = await tempLogsDir()
    for (let d = 1; d <= 8; d++) {
      await writeFile(join(dir, `app-2026100${d}.jsonl`), 'x\n', 'utf8')
    }
    const appender = new DiagAppender({ dir, now: () => dayDate('2026-10-08') })
    appender.handleEvent({ ...BASE })
    await appender.idle()
    // 窗口 = 今天 10-08 + 前 6 天（10-02..10-07）；10-08 当日文件由本行写入创建
    expect((await readdir(dir)).sort()).toEqual([
      'app-20261002.jsonl', 'app-20261003.jsonl', 'app-20261004.jsonl',
      'app-20261005.jsonl', 'app-20261006.jsonl', 'app-20261007.jsonl', 'app-20261008.jsonl',
    ])
  })

  it('50MB 截断：超阈值文件写入前截断归零、新行照常落盘', async () => {
    const dir = await tempLogsDir()
    const big = join(dir, logFileNameFor(dayDate('2026-10-19')))
    await writeFile(big, Buffer.alloc(60 * 1024 * 1024), 'utf8') // 60MB 占位
    const appender = new DiagAppender({ dir, now: () => dayDate('2026-10-19') })
    appender.handleEvent({ ...BASE })
    await appender.idle()
    const size = (await stat(big)).size
    expect(size).toBeLessThan(60 * 1024 * 1024)
    expect(size).toBeGreaterThan(0)
  })

  it('句柄占用（EBUSY）致清理失败：跳过本轮计一次、下一轮重试成功', async () => {
    const dir = await tempLogsDir()
    await writeFile(join(dir, 'app-20261001.jsonl'), 'x\n', 'utf8')
    let attempts = 0
    const driver = driverWith({
      list: async () => ['app-20261001.jsonl'],
      remove: async (file) => {
        attempts += 1
        if (attempts === 1) {
          const e = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException
          e.code = 'EBUSY'
          throw e
        }
        await rm(file, { force: true })
      },
    })
    const appender = new DiagAppender({ dir, now: () => dayDate('2026-10-08'), driver })
    appender.handleEvent({ ...BASE }) // 第 1 轮：清理失败跳过
    await appender.idle()
    expect(appender.counters.maintenanceSkipped).toBe(1)
    expect(attempts).toBe(1)
    appender.handleEvent({ ...BASE, message: 'retry' }) // 第 2 轮：重试
    await appender.idle()
    expect(attempts).toBe(2)
    expect(appender.counters.maintenanceSkipped).toBe(1)
    // 替身 append 不落盘——旧文件（过期日）重试后已被清除
    expect(await readdir(dir)).toEqual([])
  })
})

describe('性能红线（AC4）', () => {
  it('红线①：写挂死时 append 立即返回（业务不受阻）', async () => {
    const dir = await tempLogsDir()
    let resolveWrite: () => void = () => {}
    const gate = new Promise<void>((r) => (resolveWrite = r))
    const appender = new DiagAppender({ dir, driver: driverWith({ append: () => gate }) })
    const t0 = Date.now()
    appender.handleEvent({ ...BASE })
    expect(Date.now() - t0).toBeLessThan(50) // fire-and-forget：零等待
    expect(appender.pendingCount).toBe(1)
    resolveWrite()
    await appender.idle()
    expect(appender.pendingCount).toBe(0)
  })

  it('红线①：写失败 → 内存计数 +1，不反压后续业务行', async () => {
    const dir = await tempLogsDir()
    let fail = true
    const appender = new DiagAppender({
      dir,
      driver: driverWith({
        append: async () => {
          if (fail) throw new Error('disk gone')
        },
      }),
    })
    appender.handleEvent({ ...BASE })
    appender.handleEvent({ ...BASE, message: 'm2' })
    await appender.idle()
    expect(appender.counters.writeFailures).toBe(2)
    fail = false
    appender.handleEvent({ ...BASE, message: 'm3' })
    await appender.idle()
    expect(appender.counters.writeFailures).toBe(2)
  })

  it('红线②：队列超上界丢弃 + 计数，业务调用不被阻塞', async () => {
    const dir = await tempLogsDir()
    let resolveWrite: () => void = () => {}
    const gate = new Promise<void>((r) => (resolveWrite = r))
    const appender = new DiagAppender({ dir, driver: driverWith({ append: () => gate }), maxQueue: 2 })
    appender.handleEvent({ ...BASE }) // 占住 drain（写挂死）
    await new Promise((r) => setTimeout(r, 0)) // 等 drain 启动（首行已出队、写挂死中）
    appender.handleEvent({ ...BASE, message: 'q1' })
    appender.handleEvent({ ...BASE, message: 'q2' })
    appender.handleEvent({ ...BASE, message: 'dropped' }) // 超界
    expect(appender.counters.queueDropped).toBe(1)
    expect(appender.pendingCount).toBe(2)
    resolveWrite()
    await appender.idle()
  })

  it('红线③：异步队列写挂死时，崩溃行 appendCrashLine 同步确定落盘', async () => {
    const dir = await tempLogsDir()
    const appender = new DiagAppender({
      dir,
      driver: driverWith({
        append: () => new Promise<void>(() => {}), // 异步面永久挂死（fs 线程池积压模拟）
        appendSync: (file, data) => appendFileSync(file, data, 'utf8'),
      }),
      now: () => dayDate('2026-10-19', '23:59:59.999'),
    })
    appender.handleEvent({ ...BASE }) // 队列挂死
    const err = new Error('fatal crash')
    err.stack = 'Error: fatal crash\n    at main (main.ts:1:1)'
    appender.appendCrashLine({ level: 'error', process: 'main', event: 'fallback-uncaught', message: err.message, stack: err.stack })
    const file = join(dir, 'app-20261019.jsonl')
    const row = JSON.parse((await readFile(file, 'utf8')).trim()) as Record<string, unknown> // 同步返回即已落盘
    expect(row.event).toBe('fallback-uncaught')
    expect(row.stack).toContain('at main (main.ts:1:1)')
    expect(row.timestamp).toBe('2026-10-19T23:59:59.999Z')
  })

  it('flushSync：队列残留退出前排空同步落盘', async () => {
    const dir = await tempLogsDir()
    const appender = new DiagAppender({
      dir,
      driver: driverWith({
        append: () => new Promise<void>(() => {}),
        appendSync: (file, data) => appendFileSync(file, data, 'utf8'),
      }),
      now: () => dayDate('2026-10-19'),
    })
    appender.handleEvent({ ...BASE })
    appender.flushSync()
    expect(appender.pendingCount).toBe(0)
    const rows = (await readFile(join(dir, 'app-20261019.jsonl'), 'utf8')).trim().split('\n')
    expect(rows).toHaveLength(1)
  })
})
