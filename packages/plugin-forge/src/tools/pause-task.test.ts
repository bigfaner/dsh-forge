// pauseTask 工具单测（task-pause-primitive 1.8）：参数校验（slug/localId/reason 必带）/
// registry 判活定位 / localId 与在飞任务一致性 / driver.pause 委托 + 四拒绝径自解释映射 /
// 成功渲染（挂起语义 + 改写/恢复指引）。
import { describe, expect, it, vi } from 'vitest'
import type { ToolExecFace } from '../faces.js'
import { createLoopRegistry } from '../loop/index.js'
import type { LoopDriver, LoopInFlight, LoopRecord, LoopRegistry } from '../loop/index.js'
import { createPauseTaskTool, parsePauseTaskArgs } from './pause-task.js'
import type { PauseTaskToolDeps } from './pause-task.js'

const checkpoints: PauseTaskToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}

let sessionSeq = 0
function execOf(id?: string): ToolExecFace {
  sessionSeq += 1
  return { agent: { session: { id: id ?? `pause-${sessionSeq}`, header: { cwd: 'C:\\ws\\demo' } } } }
}

function recordOf(sessionId: string, over: Partial<LoopRecord> = {}): LoopRecord {
  return {
    id: 'loop-1',
    source: { kind: 'feature', slug: 'feat-x' },
    ownerSessionId: sessionId,
    projectId: 'p-1',
    takeoverSessions: new Set<string>(),
    ...over,
  }
}

function inFlightOf(localId: string): LoopInFlight {
  return {
    taskRef: { slug: 'feat-x', localId },
    taskKey: `feat-x/${localId}`,
    taskId: 'uuid-1',
    title: `task ${localId}`,
  }
}

interface Harness {
  tool: ReturnType<typeof createPauseTaskTool>
  exec: ToolExecFace
  sessionId: string
  registry: LoopRegistry
  pause: ReturnType<typeof vi.fn>
}

function harness(options: { pauseImpl?: (input: unknown) => unknown } = {}): Harness {
  const exec = execOf()
  const sessionId = (exec.agent as { session: { id: string } }).session.id
  const registry = createLoopRegistry()
  const driver = {
    pause: vi.fn(options.pauseImpl ?? (async () => ({ ok: true, paused: true, taskKey: 'feat-x/2.5' }))),
  }
  const deps: PauseTaskToolDeps = {
    tasks: {} as PauseTaskToolDeps['tasks'],
    proposals: {} as PauseTaskToolDeps['proposals'],
    bugs: {} as PauseTaskToolDeps['bugs'],
    checkpoints,
    resolveProjectId: () => 'p-1',
    loop: { driver: driver as unknown as LoopDriver, registry },
  }
  return {
    tool: createPauseTaskTool(deps),
    exec,
    sessionId,
    registry,
    pause: driver.pause,
  }
}

const ARGS = { source_kind: 'feature', source_slug: 'feat-x', local_id: '2.5', reason: 'spec superseded' } as const

// ─────────────────────────── 参数面 ───────────────────────────

describe('parsePauseTaskArgs（slug/localId/reason 必带——缺失给可读原因）', () => {
  it('全参合法；任一缺失即抛（reason 空白视同缺失）', () => {
    expect(parsePauseTaskArgs(ARGS)).toEqual({
      source: { kind: 'feature', slug: 'feat-x' },
      localId: '2.5',
      reason: 'spec superseded',
    })
    expect(() => parsePauseTaskArgs({ ...ARGS, local_id: undefined })).toThrow(/local_id/)
    expect(() => parsePauseTaskArgs({ ...ARGS, reason: undefined })).toThrow(/reason/)
    expect(() => parsePauseTaskArgs({ ...ARGS, reason: '   ' })).toThrow(/reason/)
    expect(() => parsePauseTaskArgs({ ...ARGS, source_slug: undefined })).toThrow(/source/)
    expect(() => parsePauseTaskArgs({ ...ARGS, source_kind: undefined })).toThrow(/source/)
  })
})

// ─────────────────────────── 成功径 ───────────────────────────

describe('pauseTask（registry 判活 + driver.pause 委托）', () => {
  it('source 对定位：pause 收 loopId + requesterSessionId + reason；paused 渲染含挂起/改写/恢复指引', async () => {
    const h = harness({
      pauseImpl: async () => ({ ok: true, paused: true, taskKey: 'feat-x/2.5' }),
    })
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; source: unknown; taskKey: string }
    expect(out).toEqual({ kind: 'paused', source: { kind: 'feature', slug: 'feat-x' }, taskKey: 'feat-x/2.5' })
    expect(h.pause).toHaveBeenCalledWith({ loopId: 'loop-1', requesterSessionId: h.sessionId, reason: 'spec superseded' })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('✓ task feat-x/2.5 paused')
    expect(text).toContain('suspended')
    expect(text).toContain('updateTask')
    expect(text).toContain('dispatchTask')
  })

  it('挂起态接管：非 owner 会话触达挂起循环放行（driver 守卫裁决——工具面零重复判权）', async () => {
    const h = harness()
    const record = recordOf('owner-x', {
      suspended: {
        escalation: {
          kind: 'task-paused',
          ownerSessionId: 'owner-x',
          source: { kind: 'feature', slug: 'feat-x' },
          taskKey: 'feat-x/2.5',
          reason: 'earlier pause',
        },
        since: 0,
      },
    })
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string }
    expect(out.kind).toBe('paused')
    expect(h.pause).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────── 拒绝径 ───────────────────────────

describe('pauseTask 拒绝径（自解释——错误码 + 人话 + 下一步建议）', () => {
  it('无活循环：拒绝自解释（含 dispatchTask 启动入口）——driver.pause 零触达', async () => {
    const h = harness()
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; code: string; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('no active dispatch loop')
    expect(out.message).toContain('feat-x')
    expect(out.violations.join('\n')).toContain('dispatchTask')
    expect(h.pause).not.toHaveBeenCalled()
  })

  it('无在途任务：拒绝（无可暂停对象 + 当前在飞指认）', async () => {
    const h = harness()
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.3')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('2.5')
    expect(out.message).toContain('2.3')
    expect(h.pause).not.toHaveBeenCalled()
  })

  it('运行中越权：driver 判 forbidden → 拒绝自解释（归属会话 + 接管规则）', async () => {
    const h = harness({
      pauseImpl: async () => ({ ok: false, code: 'forbidden', suspended: false, ownerSessionId: 'owner-x' }),
    })
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('RUNNING and owned by session owner-x')
    expect(out.violations.length).toBeGreaterThan(0)
  })

  it('driver reason-required（防御径）：拒绝自解释', async () => {
    const h = harness({
      pauseImpl: async () => ({ ok: false, code: 'reason-required', suspended: false, ownerSessionId: 'owner-x' }),
    })
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('reason')
  })

  it('driver no-active-loop（终态竞态）：拒绝自解释（零动作不误报成功）', async () => {
    const h = harness({
      pauseImpl: async () => ({ ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }),
    })
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('already reached a final state')
  })

  it('driver no-in-progress-task（挂起接管径无可暂停对象）：拒绝自解释', async () => {
    const h = harness({
      pauseImpl: async () => ({ ok: false, code: 'no-in-progress-task', suspended: true, ownerSessionId: 'owner-x' }),
    })
    const record = recordOf('owner-x')
    record.inFlight = inFlightOf('2.5')
    h.registry.register(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('no in-progress task')
  })
})

// ─────────────────────────── 工具可用性门 ───────────────────────────

describe('pauseTask 工具可用性门（主会话可用 / worker 拒）', () => {
  it('FORGE_TOOL_NAMES 含 pauseTask 且 ∉ WORKER_FORGE_TOOLS（worker 面不注入——deny 矩阵收口）', async () => {
    const { FORGE_TOOL_NAMES } = await import('./index.js')
    const { WORKER_FORGE_TOOLS } = await import('@dsh-forge/contracts')
    expect(FORGE_TOOL_NAMES).toContain('pauseTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('pauseTask')
  })
})
