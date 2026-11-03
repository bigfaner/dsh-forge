// subagent-assemble 单测（架构裁决 verification-report §5.1 ⑤ 最小增量——persona 合成 /
// agentOptions 折叠族上移 contracts 的锚定；用例语义与 plugin-forge assemble.test.ts /
// expert-squad compose 既有锚定同源）。
import { describe, expect, it } from 'vitest'
import { composePersonaText, reconcileWorkerReasoning, workerAgentOptionsOf } from './subagent-assemble.js'

describe('composePersonaText：身份头 + 人设 Markdown 拼接', () => {
  it('五段拼接：头行/空行/简介/空行/trimEnd 人设/尾空行', () => {
    expect(
      composePersonaText({
        name: 'architect',
        title: '架构师',
        description: '负责架构裁决',
        personaMd: '人设正文\n\n',
      }),
    ).toBe('# 架构师（architect）\n\n负责架构裁决\n\n人设正文\n')
  })

  it('人设尾部无空白 = 原样拼接', () => {
    expect(
      composePersonaText({ name: 'n', title: 't', description: 'd', personaMd: 'body' }),
    ).toBe('# t（n）\n\nd\n\nbody\n')
  })
})

describe('workerAgentOptionsOf：四级链 first-def 折叠', () => {
  it('① 条目整组胜出（含 reasoning）', () => {
    expect(
      workerAgentOptionsOf({ entry: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }),
    ).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
  })

  it('全空三级 = ④ 父会话继承（undefined）', () => {
    expect(workerAgentOptionsOf({})).toBeUndefined()
  })

  it('② 成对整组胜出 ③ 基座', () => {
    expect(
      workerAgentOptionsOf({ profile: { provider: 'pp', model: 'pm' }, defaults: { provider: 'dp', model: 'dm' } }),
    ).toEqual({ provider: 'pp', model: 'pm' })
  })

  it('② 单边 model 与 ③ 基座逐位合成（V1-EX1）；entry 缺 model = undefined', () => {
    expect(workerAgentOptionsOf({ entry: { model: 'em' }, defaults: { provider: 'dp', model: 'dm' } })).toEqual({
      provider: 'dp',
      model: 'em',
    })
    expect(workerAgentOptionsOf({ entry: { model: 'em' } })).toBeUndefined()
  })

  it('reasoning 三级合成：① > ② > ③ > 不下发', () => {
    expect(
      workerAgentOptionsOf({
        entry: { provider: 'p', model: 'm', reasoning: 'low' },
        profile: { reasoning: 'medium' },
        defaults: { reasoning: 'high' },
      })?.reasoningEffort,
    ).toBe('low')
    expect(
      workerAgentOptionsOf({ entry: { reasoning: 'low' }, profile: { provider: 'p', model: 'm', reasoning: 'medium' }, defaults: { reasoning: 'high' } })?.reasoningEffort,
    ).toBe('low')
    expect(
      workerAgentOptionsOf({ profile: { provider: 'pp', model: 'pm', reasoning: 'medium' }, defaults: { reasoning: 'high' } }),
    ).toEqual({ provider: 'pp', model: 'pm', reasoningEffort: 'medium' })
    expect(workerAgentOptionsOf({ defaults: { model: 'dm', reasoning: 'high' } })).toBeUndefined()
    expect(workerAgentOptionsOf({ profile: { provider: 'pp', model: 'pm' } })).toEqual({ provider: 'pp', model: 'pm' })
  })
})

describe('reconcileWorkerReasoning：档位兼容收口', () => {
  const options = { provider: 'p', model: 'm', reasoningEffort: 'medium' as const }

  it('目录支持 = 原样携带', async () => {
    await expect(reconcileWorkerReasoning(options, async () => ['low', 'high', 'medium'])).resolves.toBe(options)
  })

  it('目录不支持 = 剥离 reasoningEffort（回落默认档）', async () => {
    await expect(reconcileWorkerReasoning(options, async () => ['low', 'high'])).resolves.toEqual({
      provider: 'p',
      model: 'm',
    })
  })

  it('目录不可知（undefined/解析拒绝/解析器缺席）= 不判原样携带', async () => {
    await expect(reconcileWorkerReasoning(options, undefined)).resolves.toBe(options)
    await expect(reconcileWorkerReasoning(options, async () => undefined)).resolves.toBe(options)
    await expect(reconcileWorkerReasoning(options, async () => { throw new Error('resolve failed') })).resolves.toBe(options)
  })

  it('目录已知但空支持表 = 不支持 → 剥离 reasoningEffort', async () => {
    await expect(reconcileWorkerReasoning(options, async () => [])).resolves.toEqual({ provider: 'p', model: 'm' })
  })

  it('无 reasoningEffort / options undefined = 原样透传', async () => {
    await expect(reconcileWorkerReasoning({ provider: 'p', model: 'm' }, async () => [])).resolves.toEqual({
      provider: 'p',
      model: 'm',
    })
    await expect(reconcileWorkerReasoning(undefined, async () => [])).resolves.toBeUndefined()
  })
})
