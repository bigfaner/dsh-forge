// 1.17 · 进度事件模块单测：数据守卫形状面 + append 适配链（agents → agent.session.append
// 鸭子消费）+ 链断/抛错 fail-soft。declare-module 合并不可运行期断言——键身份锚由
// ForgeProgressEventKeyAssertion 编译期承担（dispatch-loop 同款）。
import { describe, expect, it, vi } from 'vitest'
import { adaptSessionProgressAppend, createSubmitSettleDisplay, FORGE_PROGRESS_SCENARIO as S, FORGE_PROGRESS_EVENT_TYPE, FORGE_PROGRESS_SCENARIOS, isForgeProgressData, registerProgressEventVocabulary, type ForgeProgressEventData, type SubmitSettleDisplayInput } from './index.js'
import type { AgentLookupFace } from '../faces.js'

const DATA = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
  taskTitle: '任务标题',
  workerSessionId: 'worker-1',
  counts: { pending: 1, running: 1, done: 0 },
  at: 1_700_000_000_000,
} as const

function agentWithAppend(append: (type: string, data: unknown) => unknown): AgentLookupFace {
  return { get: () => ({ session: { append } }) }
}

describe("isForgeProgressData（'forge/progress' 数据守卫）", () => {
  it('合法形状（五件齐：任务键/动词/状态/计数/时间戳）= true', () => {
    expect(isForgeProgressData(DATA)).toBe(true)
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'settle', status: 'blocked', at: 1 })).toBe(true) // 可选位缺席
  })
  it('他形 = false（非对象/空 slug/越界动词/越界状态/坏时间戳）', () => {
    expect(isForgeProgressData(undefined)).toBe(false)
    expect(isForgeProgressData('nope')).toBe(false)
    expect(isForgeProgressData({ ...DATA, sourceSlug: '' })).toBe(false)
    expect(isForgeProgressData({ ...DATA, verb: 'reboot' })).toBe(false)
    expect(isForgeProgressData({ ...DATA, status: 'paused' })).toBe(false)
    expect(isForgeProgressData({ ...DATA, at: Number.NaN })).toBe(false)
    expect(isForgeProgressData({ ...DATA, taskKey: 42 })).toBe(false)
  })
  it('expertKey（loop-card-task-context）：string 可选容忍、缺省容忍（旧载荷）、非 string 拒绝', () => {
    expect(isForgeProgressData({ ...DATA, expertKey: 'retro-reviewer' })).toBe(true)
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'settle', status: 'completed', at: 1 })).toBe(true) // 旧载荷（无 expertKey）兼容
    expect(isForgeProgressData({ ...DATA, expertKey: 42 })).toBe(false)
  })
  it('triage 词（triage-progress-row）：running/终态两用合法；scenario loop/triage 合法（值域联动）', () => {
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'triage', status: 'running', taskKey: 'feat-x/1.1', at: 1 })).toBe(true)
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'triage', status: 'running', taskKey: 'feat-x/1.1', expertKey: 'triage-analyst', scenario: S.loopTriage, note: '决策：add-fix', at: 1 })).toBe(true)
    expect(isForgeProgressData({ ...DATA, scenario: S.loopTriage })).toBe(true)
  })
  it('新字段校验（1.5）：taskTitle/workerSessionId/scenario 类型错 = false；缺省容忍 = true；旧载荷（无新字段）兼容', () => {
    expect(isForgeProgressData({ ...DATA, taskTitle: 7 })).toBe(false)
    expect(isForgeProgressData({ ...DATA, workerSessionId: 9 })).toBe(false)
    expect(isForgeProgressData({ ...DATA, scenario: S.taskComplete })).toBe(true)
    expect(isForgeProgressData({ ...DATA, scenario: S.suspendSpawnRateLimited })).toBe(true)
    expect(isForgeProgressData({ ...DATA, scenario: 'task/oops' })).toBe(false)
    expect(isForgeProgressData({ ...DATA, scenario: 42 })).toBe(false)
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'settle', status: 'completed', at: 1 })).toBe(true) // 旧载荷可解析
  })
  it('attempt（triage 处置序号——bug df44fcfa 结构化载荷）：正整数合法；0/非整数/非 number 拒绝；缺省容忍（旧载荷）', () => {
    expect(isForgeProgressData({ ...DATA, attempt: 1 })).toBe(true)
    expect(isForgeProgressData({ ...DATA, attempt: 3 })).toBe(true)
    expect(isForgeProgressData({ ...DATA, attempt: 0 })).toBe(false)
    expect(isForgeProgressData({ ...DATA, attempt: 1.5 })).toBe(false)
    expect(isForgeProgressData({ ...DATA, attempt: '2' })).toBe(false)
    expect(isForgeProgressData({ sourceSlug: 'feat-x', verb: 'settle', status: 'completed', at: 1 })).toBe(true) // 旧载荷（无 attempt）兼容
  })
})

describe('FORGE_PROGRESS_SCENARIOS（场景码单源常量表——29 值）', () => {
  it('恰 29 值，值域 = 提案事件清单 {major}/{minor} 七族 + 1.16 池级族 + bug 3bd8b829 领取确认 + triage 处置族 + T3 同缝拦截挂起 + bug 6d98a275 孤儿回收 + 越径直接结算 + loop-phase-gate 阶段门持有', () => {
    expect(FORGE_PROGRESS_SCENARIOS).toHaveLength(29)
    expect(new Set(FORGE_PROGRESS_SCENARIOS).size).toBe(29)
    expect([...FORGE_PROGRESS_SCENARIOS]).toEqual(Object.values(S))
    expect(S.settleOutOfBand).toBe('settle/out-of-band')
    expect(S.loopGateHeld).toBe('loop/gate-held')
  })
  it('编码格式：纯英文 + 中划线，{major}/{minor} 两段', () => {
    for (const code of FORGE_PROGRESS_SCENARIOS) {
      expect(code).toMatch(/^[a-z]+\/[a-z-]+$/)
    }
  })
})

describe('registerProgressEventVocabulary（#35 读侧词汇注册）', () => {
  it('注册后持久化已知集包含 forge/progress（含该事件的日志恢复可观测）', async () => {
    const { KNOWN_SESSION_EVENT_TYPES } = await import('@deepseek-ai/dsh-session')
    registerProgressEventVocabulary()
    // 动态 import 链微延迟——注册为同步 Set.add，微任务后必达
    await Promise.resolve()
    expect(KNOWN_SESSION_EVENT_TYPES.has(FORGE_PROGRESS_EVENT_TYPE)).toBe(true)
  })
  it('幂等：重复注册不抛错不劣化', () => {
    expect(() => {
      registerProgressEventVocabulary()
      registerProgressEventVocabulary()
    }).not.toThrow()
  })
})

describe('adaptSessionProgressAppend（append 权限链鸭子消费——第二缝）', () => {
  it('链通：append 以事件类型常量 + 数据原样调用（agent.session.append）', () => {
    const append = vi.fn()
    const face = adaptSessionProgressAppend(agentWithAppend(append))!
    face.append('s-1', DATA)
    expect(append).toHaveBeenCalledExactlyOnceWith(FORGE_PROGRESS_EVENT_TYPE, DATA)
  })
  it('注册表缺席/非函数 = 面缺席（undefined——装配 fail-soft 不注入）', () => {
    expect(adaptSessionProgressAppend(undefined)).toBeUndefined()
    expect(adaptSessionProgressAppend({} as AgentLookupFace)).toBeUndefined()
  })
  it('链断 fail-soft：get 抛错 / agent 无根 / session.append 缺席 = 静默零外溢', () => {
    const throwing = adaptSessionProgressAppend({ get: () => { throw new Error('gone') } })!
    expect(() => throwing.append('s-1', DATA)).not.toThrow()
    const rootless = adaptSessionProgressAppend({ get: () => undefined })!
    expect(() => rootless.append('s-1', DATA)).not.toThrow()
    const noAppend = adaptSessionProgressAppend({ get: () => ({ session: {} }) })!
    expect(() => noAppend.append('s-1', DATA)).not.toThrow()
  })
  it('append 抛错 = 告警不外溢（进度零循环正确性依赖）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const face = adaptSessionProgressAppend(agentWithAppend(() => { throw new Error('log full') }))!
    expect(() => face.append('s-1', DATA)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('forge progress append failed'))
    warn.mockRestore()
  })
})

describe('createSubmitSettleDisplay（越径结算显示同步——submitTask 终态事件补发）', () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
  function harness(overrides?: { activeSource?: unknown; records?: readonly { verb: string; sessionId?: string }[]; queryThrows?: boolean }) {
    const appended: Array<{ sessionId: string; event: ForgeProgressEventData }> = []
    const display = createSubmitSettleDisplay({
      registry: {
        bySource: (source) => (overrides?.activeSource !== undefined && source.slug === 'feat-x' ? overrides.activeSource : undefined),
      },
      tasks: {
        queryTask: overrides?.queryThrows
          ? async () => {
              throw new Error('query gone')
            }
          : async () => ({ task: { title: '任务甲' }, records: overrides?.records ?? [{ verb: 'claim', sessionId: 'owner-1' }] }),
      },
      progressAppend: {
        append: (sessionId, event) => {
          appended.push({ sessionId, event })
        },
      },
    })
    const input: SubmitSettleDisplayInput = { projectId: 'p-1', slug: 'feat-x', localId: '2.1', result: 'completed' }
    return { display, input, appended }
  }
  it('无活循环 + claim 会话在场：向 claim 会话补发 settle/out-of-band 终态事件', async () => {
    const h = harness()
    await h.display(h.input)
    await flush()
    expect(h.appended).toHaveLength(1)
    expect(h.appended[0]).toMatchObject({
      sessionId: 'owner-1',
      event: {
        sourceSlug: 'feat-x',
        verb: 'settle',
        status: 'completed',
        scenario: 'settle/out-of-band',
        taskKey: 'feat-x/2.1',
        taskTitle: '任务甲',
      },
    })
    expect(isForgeProgressData(h.appended[0]!.event)).toBe(true)
  })
  it('门①：任务源有活循环 = 零补发（驱动器自有结算事件——防双发）', async () => {
    const h = harness({ activeSource: { id: 'loop-1' } })
    await h.display(h.input)
    await flush()
    expect(h.appended).toHaveLength(0)
  })
  it('门②：claim 记录缺席 / 领取会话缺席 = 零补发；补发面缺席 = 零操作；queryTask 故障 = fail-soft 零外抛', async () => {
    const noClaim = harness({ records: [{ verb: 'add' }] })
    await noClaim.display(noClaim.input)
    await flush()
    expect(noClaim.appended).toHaveLength(0)

    const noSession = harness({ records: [{ verb: 'claim' }] })
    await noSession.display(noSession.input)
    await flush()
    expect(noSession.appended).toHaveLength(0)

    const noAppend = createSubmitSettleDisplay({
      registry: { bySource: () => undefined },
      tasks: { queryTask: async () => ({ task: { title: 'x' }, records: [{ verb: 'claim', sessionId: 's' }] }) },
    })
    await expect(noAppend({ projectId: 'p', slug: 's', localId: '1', result: 'blocked' })).resolves.toBeUndefined()

    const throwing = harness({ queryThrows: true })
    await expect(throwing.display(throwing.input)).resolves.toBeUndefined()
    expect(throwing.appended).toHaveLength(0)
  })
})
