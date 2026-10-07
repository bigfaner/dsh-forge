// 3.3 单测 —— AC2/AC3/AC5 日志监听器（logs/{slug}.jsonl 唯一写者）：
// 事件标准化（键序恒定）→ 归属三分支落盘（四例：任务容器/contextSlug/_pool/兜底）→
// 落盘往返 + 串联读法（taskKey 过滤 → claim/spawn/submit/worker-done 会话链重组；
// slug 过滤 = 容器全程）。Hard Rules 结构断言：行面只承载 digest（dispatchDigest），
// 无凭据字段、无 dispatchPrompt 全文；fail-soft（解析器/IO 异常不拖垮发射闭包）。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ForgePluginEvent } from '@dsh-forge/contracts'
import { createForgeEventBus } from './bus.js'
import {
  attachForgeLogListener,
  createForgeLogListener,
  forgeLogFileOf,
  FORGE_LOG_POOL_SLUG,
  readForgeEventLog,
  resolveLogSlug,
} from './log-listener.js'

/** taskKey 载荷事件构造（task-claimed 基线——四任务事件共用容器前缀口径） */
function claimed(taskKey: string, sessionId = 'dispatcher-1', slug = '_pool'): ForgePluginEvent {
  return {
    ts: 1_760_000_000_000,
    sessionId,
    slug,
    type: 'task-claimed',
    payload: { taskKey, taskType: 'coding-feature', mode: 'expedition', dispatchDigest: 'abc123def456' },
  }
}

describe('resolveLogSlug（归属三分支判定——图 5 节点 E）', () => {
  it('分支①：事件带任务 → 任务容器 slug（taskKey 前缀；信封 slug 语境不越位）', () => {
    expect(resolveLogSlug(claimed('m3-bootstrap/2.4'))).toBe('m3-bootstrap')
    expect(resolveLogSlug(claimed('m3-bootstrap/2.4', 'dispatcher-1', 'other-ctx'))).toBe('m3-bootstrap')
  })

  it('分支②：无任务 → contextSlug（no-ready-task 载荷语境优先于信封 slug 回声）', () => {
    const event: ForgePluginEvent = {
      ts: 1,
      sessionId: 's',
      slug: 'envelope-echo',
      type: 'no-ready-task',
      payload: { contextSlug: 'payload-context' },
    }
    expect(resolveLogSlug(event)).toBe('payload-context')
    const noPayloadCtx: ForgePluginEvent = {
      ts: 1,
      sessionId: 's',
      slug: 'envelope-echo',
      type: 'no-ready-task',
      payload: {},
    }
    expect(resolveLogSlug(noPayloadCtx)).toBe('envelope-echo')
  })

  it('分支③：皆无（无任务、无 contextSlug、信封 slug 空）→ _pool 兜底', () => {
    const event: ForgePluginEvent = {
      ts: 1,
      sessionId: 's',
      slug: '',
      type: 'no-ready-task',
      payload: {},
    }
    expect(resolveLogSlug(event)).toBe(FORGE_LOG_POOL_SLUG)
  })

  it('兜底防御：taskKey 畸形（无容器分隔符）不误归属 → 落 _pool', () => {
    expect(resolveLogSlug(claimed('malformed-no-separator'))).toBe(FORGE_LOG_POOL_SLUG)
  })
})

describe('createForgeLogListener / attachForgeLogListener（唯一写者 + 挂接缝）', () => {
  let home: string
  let container: string

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-log-listener-'))
    container = join(home, 'Z-ws-demo@a1b2c3d4')
  })

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  /** 挂好的总线 + 监听器（容器目录恒注入 container） */
  function rig(): { bus: ReturnType<typeof createForgeEventBus>; detach: () => void } {
    const bus = createForgeEventBus()
    const detach = attachForgeLogListener(bus, { resolveContainerDir: () => container })
    return { bus, detach }
  }

  it('归属三分支四例落盘（AC3）：任务容器 / contextSlug / 皆无 _pool / 畸形兜底——各归各文件', () => {
    const { bus } = rig()
    bus.emit(claimed('feat-x/1.1'))
    bus.emit({
      ts: 2,
      sessionId: 's',
      slug: 'some-proposal',
      type: 'no-ready-task',
      payload: { contextSlug: 'some-proposal' },
    })
    bus.emit({ ts: 3, sessionId: 's', slug: FORGE_LOG_POOL_SLUG, type: 'no-ready-task', payload: {} })
    bus.emit(claimed('malformed-no-separator'))
    expect(existsSync(forgeLogFileOf(container, 'feat-x'))).toBe(true)
    expect(existsSync(forgeLogFileOf(container, 'some-proposal'))).toBe(true)
    expect(existsSync(forgeLogFileOf(container, FORGE_LOG_POOL_SLUG))).toBe(true)
    // _pool 收两行：分支③（皆无）+ 畸形 taskKey 兜底（防御面同归兜底文件）
    expect(readForgeEventLog(forgeLogFileOf(container, FORGE_LOG_POOL_SLUG))).toHaveLength(2)
  })

  it('标准行形状（AC2）：键序恒 ts/sessionId/slug/type/payload、单行 JSON、\\n 终结、追加不覆写', () => {
    const file = forgeLogFileOf(container, 'std-shape')
    const listener = createForgeLogListener({ resolveContainerDir: () => container })
    listener.handle(claimed('std-shape/2.1', 'dispatcher-9'))
    listener.handle({
      ts: 5,
      sessionId: 'dispatcher-9',
      slug: 'std-shape',
      type: 'task-spawned',
      payload: { taskKey: 'std-shape/2.1', workerSessionId: 'worker-1', toolFilter: ['submitTask'], model: 'test-model' },
    })
    const text = readFileSync(file, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    const lines = text.split('\n').filter((l) => l !== '')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0] ?? '') as Record<string, unknown>
    expect(Object.keys(first)).toEqual(['ts', 'sessionId', 'slug', 'type', 'payload'])
    expect(first.slug).toBe('std-shape') // 标准行 slug = 归属判定产物（串联读法单源）
  })

  it('Hard Rules 结构断言：task-claimed 行只承载 dispatchDigest，无 dispatchPrompt 全文/凭据字段', () => {
    const file = forgeLogFileOf(container, 'sensitivity')
    createForgeLogListener({ resolveContainerDir: () => container }).handle(claimed('sensitivity/1.1'))
    const line = readFileSync(file, 'utf8')
    expect(line).toContain('"dispatchDigest":"abc123def456"')
    expect(line).not.toContain('dispatchPrompt')
    expect(line).not.toContain('apiKey')
    expect(line).not.toContain('token')
  })

  it('容器维度同文件（AC2）：同容器 claim/spawn/submit/worker-done 全程追加同一 logs/{slug}.jsonl', () => {
    const { bus } = rig()
    const taskKey = 'feat-same/3.3'
    bus.emit(claimed(taskKey, 'dispatcher-1'))
    bus.emit({
      ts: 11,
      sessionId: 'dispatcher-1',
      slug: 'feat-same',
      type: 'task-spawned',
      payload: { taskKey, workerSessionId: 'worker-7', toolFilter: [], model: 'm' },
    })
    bus.emit({
      ts: 12,
      sessionId: 'worker-7',
      slug: 'feat-same',
      type: 'task-submitted',
      payload: { taskKey, outcome: 'success' },
    })
    bus.emit({
      ts: 13,
      sessionId: 'dispatcher-1',
      slug: 'feat-same',
      type: 'task-worker-done',
      payload: { taskKey, workerSessionId: 'worker-7', outcome: 'success', durationMs: 42_000 },
    })
    const events = readForgeEventLog(forgeLogFileOf(container, 'feat-same'))
    expect(events.map((e) => e.type)).toEqual(['task-claimed', 'task-spawned', 'task-submitted', 'task-worker-done'])
  })

  it('落盘往返 + 串联读法（AC5）：taskKey 过滤 → 会话链重组；slug 过滤 = 容器全程（含 no-ready-task）', () => {
    const { bus } = rig()
    const taskKey = 'feat-chain/4.2'
    bus.emit(claimed(taskKey, 'dispatcher-1'))
    bus.emit({
      ts: 21,
      sessionId: 'dispatcher-1',
      slug: 'feat-chain',
      type: 'task-spawned',
      payload: { taskKey, workerSessionId: 'worker-9', toolFilter: [], model: 'm' },
    })
    bus.emit({
      ts: 22,
      sessionId: 'worker-9',
      slug: 'feat-chain',
      type: 'task-submitted',
      payload: { taskKey, outcome: 'success', commitHash: 'abcd1234' },
    })
    bus.emit({
      ts: 23,
      sessionId: 'dispatcher-1',
      slug: 'feat-chain',
      type: 'task-worker-done',
      payload: { taskKey, workerSessionId: 'worker-9', outcome: 'success', durationMs: 3_600_000 },
    })
    bus.emit({
      ts: 24,
      sessionId: 'dispatcher-1',
      slug: 'feat-chain',
      type: 'no-ready-task',
      payload: { contextSlug: 'feat-chain' },
    })
    // 落盘往返：读回 = 标准化事件（含归属判定产物 slug）
    const events = readForgeEventLog(forgeLogFileOf(container, 'feat-chain'))
    expect(events).toHaveLength(5)
    // 串联读法①：taskKey 过滤 → 四事件会话链（claim/spawn = dispatcher；submit = worker；worker-done = dispatcher）
    const chain = events.filter((e) => (e.payload as { taskKey?: string }).taskKey === taskKey)
    expect(chain.map((e) => e.type)).toEqual(['task-claimed', 'task-spawned', 'task-submitted', 'task-worker-done'])
    expect(chain.map((e) => e.sessionId)).toEqual(['dispatcher-1', 'dispatcher-1', 'worker-9', 'dispatcher-1'])
    // 对账锚闭环：spawn 的 workerSessionId = submit 行的执行会话 id
    const spawned = chain[1]?.payload as { workerSessionId: string }
    expect(spawned.workerSessionId).toBe('worker-9')
    expect(chain[2]?.sessionId).toBe(spawned.workerSessionId)
    // 串联读法②：slug 过滤 = 容器全程（含无任务的收工信号 no-ready-task）
    expect(events.filter((e) => e.slug === 'feat-chain')).toHaveLength(5)
  })

  it('挂接缝退订（AC4 挂接缝）：detach 后 emit 不再落盘', () => {
    const { bus, detach } = rig()
    const file = forgeLogFileOf(container, 'detach-check')
    bus.emit(claimed('detach-check/9.9'))
    expect(existsSync(file)).toBe(true)
    const before = readFileSync(file, 'utf8')
    detach()
    bus.emit(claimed('detach-check/9.9', 'dispatcher-2'))
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('fail-soft：容器目录解析抛错不拖垮发射闭包（handle 不抛、零落盘）', () => {
    const listener = createForgeLogListener({
      resolveContainerDir: () => {
        throw new Error('routing boom')
      },
    })
    expect(() => listener.handle(claimed('feat-x/1.1'))).not.toThrow()
  })
})

describe('readForgeEventLog（JSONL 读回——串联读法载面）', () => {
  let home: string

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-log-reader-'))
  })

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('文件缺席 → 空数组（运营读面 fail-soft）', () => {
    expect(readForgeEventLog(join(home, 'absent.jsonl'))).toEqual([])
  })

  it('坏行跳过不抛（追加写半行等运营残渣），好行保序读回', () => {
    const file = join(home, 'partial.jsonl')
    const good = JSON.stringify({
      ts: 1,
      sessionId: 's',
      slug: 'x',
      type: 'tool-error',
      payload: { verb: 'claimTask', code: 'ERR_TASK_NOT_FOUND', message: '未命中' },
    })
    writeFileSync(file, `${good}\n{"ts": 2, "broken…\n${good}\n`, 'utf8')
    const events = readForgeEventLog(file)
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('tool-error')
  })
})


// ─────────────────────────── 3.4 接线增补：未解析目录 = 丢行不落相对路径 ───────────────────────────

describe('resolveContainerDir 未解析（undefined/空串）——fail-soft 丢行', () => {
  it('undefined 与空串两形：零文件写出（绝不以进程 CWD 为根写相对路径）', () => {
    for (const dir of [undefined, '']) {
      const listener = createForgeLogListener({ resolveContainerDir: () => dir })
      expect(() =>
        listener.handle({ ts: Date.now(), sessionId: 's', slug: 'c', type: 'no-ready-task', payload: {} }),
      ).not.toThrow()
      expect(existsSync(join(process.cwd(), 'logs', 'c.jsonl'))).toBe(false)
    }
  })
})
