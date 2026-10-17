// 3b③ 单测 —— stopTaskLoop 工具（dispatch-loop-hardening 改进 3b③）：
// 双入口同 registry 判活（source 对定位 / 缺席 = byOwner 本会话）/ 作用域裁决
// （运行中仅 owner 可停、挂起态任意会话可停）/ 越权与无活循环拒绝自解释 /
// 统一结束处理委托 driver.stopLoop（在途取消 + 孤儿真化 + 结束通知单源在驱动器）。
import { describe, expect, it, vi } from 'vitest'
import type { ToolExecFace } from '../faces.js'
import { createLoopRegistry } from '../loop/index.js'
import type { LoopDriver, LoopRecord, LoopRegistry } from '../loop/index.js'
import type { StopTaskLoopToolDeps } from './stop-task-loop.js'
import { createStopTaskLoopTool, parseStopTaskLoopArgs } from './stop-task-loop.js'

let sessionSeq = 0
function execOf(id?: string): ToolExecFace {
  sessionSeq += 1
  return { agent: { session: { id: id ?? `stop-${sessionSeq}`, header: { cwd: 'C:\\ws\\demo' } } } }
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

interface Harness {
  tool: ReturnType<typeof createStopTaskLoopTool>
  exec: ToolExecFace
  sessionId: string
  registry: LoopRegistry
  stopLoop: ReturnType<typeof vi.fn>
}

function harness(options: { stopLoopImpl?: (input: unknown) => unknown } = {}): Harness {
  const exec = execOf()
  const sessionId = (exec.agent as { session: { id: string } }).session.id
  const registry = createLoopRegistry()
  const driver = {
    stopLoop: vi.fn(options.stopLoopImpl ?? (async () => ({ ok: true, stopped: true, hadInFlight: false }))),
  }
  const deps: StopTaskLoopToolDeps = {
    tasks: {} as StopTaskLoopToolDeps['tasks'],
    proposals: {} as StopTaskLoopToolDeps['proposals'],
    bugs: {} as StopTaskLoopToolDeps['bugs'],
    resolveProjectId: () => 'p-1',
    loop: { driver: driver as unknown as LoopDriver, registry },
  }
  return {
    tool: createStopTaskLoopTool(deps),
    exec,
    sessionId,
    registry,
    stopLoop: driver.stopLoop,
  }
}

const ARGS = { source_kind: 'feature', source_slug: 'feat-x' } as const

// ─────────────────────────── 参数面 ───────────────────────────

describe('parseStopTaskLoopArgs（source 对可选——缺席 = 停本会话自己的活循环）', () => {
  it('零参合法（byOwner 径）；成对解析；半对即拒', () => {
    expect(parseStopTaskLoopArgs({})).toEqual({})
    expect(parseStopTaskLoopArgs(ARGS)).toEqual({ source: { kind: 'feature', slug: 'feat-x' } })
    expect(() => parseStopTaskLoopArgs({ source_kind: 'feature' })).toThrow(/both or neither/)
    expect(() => parseStopTaskLoopArgs({ source_slug: 'feat-x' })).toThrow(/both or neither/)
  })
})

// ─────────────────────────── 判活与作用域 ───────────────────────────

describe('stopTaskLoop（双入口同 registry 判活 + 作用域裁决）', () => {
  it('source 对定位：stopLoop 收 loopId + requesterSessionId；stopped 渲染含统一结束语义', async () => {
    const h = harness({ stopLoopImpl: async () => ({ ok: true, stopped: true, hadInFlight: true }) })
    h.registry.register(recordOf('owner-x'))
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; source: unknown; hadInFlight: boolean }
    expect(out).toEqual({ kind: 'stopped', source: { kind: 'feature', slug: 'feat-x' }, hadInFlight: true })
    expect(h.stopLoop).toHaveBeenCalledWith({ loopId: 'loop-1', requesterSessionId: h.sessionId })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('✓ dispatch loop stopped for feat-x')
    expect(text).toContain('interrupted')
  })

  it('source 对缺席 = byOwner(本会话)：停自己发起的活循环（owner 运行中放行）', async () => {
    const h = harness()
    h.registry.register(recordOf(h.sessionId))
    const out = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('stopped')
    expect(h.stopLoop).toHaveBeenCalledWith({ loopId: 'loop-1', requesterSessionId: h.sessionId })
  })

  it('无活循环：拒绝自解释（含启动入口指引）——stopLoop 零触达', async () => {
    const h = harness()
    const out = (await h.tool.execute({}, h.exec)) as { ok: boolean; code: string; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('no active dispatch loop')
    expect(out.message).toContain('dispatchTask')
    expect(h.stopLoop).not.toHaveBeenCalled()
  })

  it('作用域·运行中非 owner：driver 判 forbidden → 拒绝自解释（归属会话 + 作用域规则 + 观察入口）', async () => {
    const h = harness({
      stopLoopImpl: async () => ({ ok: false, code: 'forbidden', suspended: false, ownerSessionId: 'owner-x' }),
    })
    h.registry.register(recordOf('owner-x'))
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('RUNNING and owned by session owner-x')
    expect(out.violations.some((v) => v.includes('SUSPENDED') && v.includes('any session'))).toBe(true)
    expect(h.stopLoop).toHaveBeenCalledTimes(1)
    expect(h.stopLoop).toHaveBeenCalledWith({ loopId: 'loop-1', requesterSessionId: h.sessionId })
  })

  it('作用域·挂起态任意会话可停：非 owner 触达挂起循环放行（接管支撑）', async () => {
    const h = harness()
    h.registry.register(recordOf('owner-x', { suspended: { escalation: {
      kind: 'deadlock',
      ownerSessionId: 'owner-x',
      source: { kind: 'feature', slug: 'feat-x' },
      blockedItems: [],
    }, since: 0 } }))
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string }
    expect(out.kind).toBe('stopped')
    expect(h.stopLoop).toHaveBeenCalledWith({ loopId: 'loop-1', requesterSessionId: h.sessionId })
  })

  it('stopLoop no-active-loop（终态竞态）：拒绝自解释（零动作不误报成功）', async () => {
    const h = harness({
      stopLoopImpl: async () => ({ ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }),
    })
    h.registry.register(recordOf(h.sessionId))
    const out = (await h.tool.execute({}, h.exec)) as { ok: boolean; message: string }
    expect(out.ok).toBe(false)
    expect(out.message).toContain('already reached a final state')
  })
})
