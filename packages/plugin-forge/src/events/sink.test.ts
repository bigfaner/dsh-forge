// 3.4 单测 —— 事件发射面 sink：emit 直通总线 + 会话目录记忆（prepare 幂等/失败降级）
// + 监听器集成（事件 → 记忆目录 logs/{slug}.jsonl 落盘——3.3 唯一写者经 dirOf 消费）
// + emitToolError 守卫（sink 缺席/空 sessionId/空 slug = 零发射）+ slugOfToolArgs 提取。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ForgePluginEvent } from '@dsh-forge/contracts'
import { attachForgeLogListener, forgeLogFileOf, readForgeEventLog } from './log-listener.js'
import { createForgeEventBus } from './bus.js'
import { createForgeEventSink, emitToolError, slugOfToolArgs } from './sink.js'

const TMP_DIRS: string[] = []

afterEach(() => {
  for (const dir of TMP_DIRS.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 清理失败不拖垮用例
    }
  }
})

function tmpContainerDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-sink-'))
  TMP_DIRS.push(dir)
  return dir
}

function noTaskEvent(sessionId: string, slug = '_pool'): ForgePluginEvent {
  return { ts: Date.now(), sessionId, slug, type: 'no-ready-task', payload: {} }
}

describe('createForgeEventSink（emit + 会话目录记忆）', () => {
  it('emit 直通总线；prepare 记忆 sessionId → 目录（resolver 单源）', async () => {
    const bus = createForgeEventBus()
    const seen: ForgePluginEvent[] = []
    bus.on((e) => seen.push(e))
    const dir = tmpContainerDir()
    const sink = createForgeEventSink({ bus, resolveDir: async () => dir })
    await sink.prepare({ sessionId: 's-1', cwd: 'C:\\ws\\demo' })
    expect(sink.dirOf('s-1')).toBe(dir)
    sink.emit(noTaskEvent('s-1'))
    expect(seen.map((e) => e.type)).toEqual(['no-ready-task'])
  })

  it('prepare 幂等：同会话 resolver 只调一次；resolver 拒绝 = 不记忆不抛（fail-soft）', async () => {
    const bus = createForgeEventBus()
    let resolveCalls = 0
    const sink = createForgeEventSink({
      bus,
      resolveDir: async () => {
        resolveCalls += 1
        return 'D:\\container'
      },
    })
    await sink.prepare({ sessionId: 's-2', cwd: 'C:\\ws\\a' })
    await sink.prepare({ sessionId: 's-2', cwd: 'C:\\ws\\a' })
    expect(resolveCalls).toBe(1)
    const failing = createForgeEventSink({
      bus,
      resolveDir: async () => {
        throw new Error('derive unavailable')
      },
    })
    await expect(failing.prepare({ sessionId: 's-3', cwd: 'C:\\ws\\b' })).resolves.toBeUndefined()
    expect(failing.dirOf('s-3')).toBeUndefined()
  })

  it('cwd 缺席 / 空串 sessionId / 空结果 = 不记忆；未知会话 dirOf = undefined', async () => {
    const bus = createForgeEventBus()
    const sink = createForgeEventSink({ bus, resolveDir: async () => 'D:\\c' })
    await sink.prepare({ sessionId: '', cwd: 'C:\\ws\\a' })
    await sink.prepare({ sessionId: 's-4', cwd: undefined })
    expect(sink.dirOf('s-4')).toBeUndefined()
    expect(sink.dirOf('unknown')).toBeUndefined()
    const empty = createForgeEventSink({ bus, resolveDir: async () => '' })
    await empty.prepare({ sessionId: 's-5', cwd: 'C:\\ws\\a' })
    expect(empty.dirOf('s-5')).toBeUndefined()
  })

  it('监听器集成：prepare 后 emit → 记忆目录 logs/{slug}.jsonl 落盘；未记忆会话 = fail-soft 丢行', async () => {
    const bus = createForgeEventBus()
    const dir = tmpContainerDir()
    const sink = createForgeEventSink({ bus, resolveDir: async () => dir })
    attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) })
    await sink.prepare({ sessionId: 's-6', cwd: 'C:\\ws\\demo' })
    sink.emit({ ts: Date.now(), sessionId: 's-6', slug: 'feat-x', type: 'task-claimed', payload: { taskKey: 'feat-x/1.1', taskType: 'doc', dispatchDigest: 'd1' } })
    const lines = readForgeEventLog(forgeLogFileOf(dir, 'feat-x'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ sessionId: 's-6', slug: 'feat-x', type: 'task-claimed' })
    // 未记忆会话：目录缺位 → 丢行（监听器 fail-soft——绝不回落相对路径写散落文件）
    sink.emit(noTaskEvent('s-unknown'))
    expect(readForgeEventLog(forgeLogFileOf(dir, '_pool'))).toEqual([])
    expect(existsSync(join(process.cwd(), 'logs', '_pool.jsonl'))).toBe(false)
  })
})

describe('emitToolError（守卫：宁零事件不空信封）', () => {
  it('正常路径发射 {verb, code, message}；sink 缺席 / 空 sessionId / 空 slug = 零发射', () => {
    const events: ForgePluginEvent[] = []
    const sink = { emit: (e: ForgePluginEvent) => events.push(e), prepare: async () => {}, dirOf: () => undefined }
    emitToolError(sink, 's-1', 'feat-x', 'dispatchTask', {
      ok: false,
      code: 'ERR_SPAWN_FAILED',
      message: 'boom',
      violations: [],
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      sessionId: 's-1',
      slug: 'feat-x',
      type: 'tool-error',
      payload: { verb: 'dispatchTask', code: 'ERR_SPAWN_FAILED', message: 'boom' },
    })
    emitToolError(undefined, 's-1', 'feat-x', 'v', { ok: false, code: 'ERR_SPAWN_FAILED', message: 'm', violations: [] })
    emitToolError(sink, '', 'feat-x', 'v', { ok: false, code: 'ERR_SPAWN_FAILED', message: 'm', violations: [] })
    emitToolError(sink, 's-1', '', 'v', { ok: false, code: 'ERR_SPAWN_FAILED', message: 'm', violations: [] })
    expect(events).toHaveLength(1)
  })
})

describe('slugOfToolArgs（tool-error 归属 slug 防御提取）', () => {
  it('slug / source_slug 命中；缺席或畸形 = _pool 兜底', () => {
    expect(slugOfToolArgs({ slug: 'feat-x', local_id: '1' })).toBe('feat-x')
    expect(slugOfToolArgs({ source_kind: 'proposal', source_slug: 'prop-1', title: 'T' })).toBe('prop-1')
    expect(slugOfToolArgs({ proposal_id: 'p-1', to_status: 'accepted' })).toBe('_pool')
    expect(slugOfToolArgs(null)).toBe('_pool')
    expect(slugOfToolArgs({ slug: '', source_slug: '' })).toBe('_pool')
  })
})
