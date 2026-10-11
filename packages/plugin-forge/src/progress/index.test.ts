// 1.17 · 进度事件模块单测：数据守卫形状面 + append 适配链（agents → agent.session.append
// 鸭子消费）+ 链断/抛错 fail-soft。declare-module 合并不可运行期断言——键身份锚由
// ForgeProgressEventKeyAssertion 编译期承担（dispatch-loop 同款）。
import { describe, expect, it, vi } from 'vitest'
import { adaptSessionProgressAppend, FORGE_PROGRESS_EVENT_TYPE, isForgeProgressData, registerProgressEventVocabulary } from './index.js'
import type { AgentLookupFace } from '../faces.js'

const DATA = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
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
