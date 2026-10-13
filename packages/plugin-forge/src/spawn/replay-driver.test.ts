// worker-exec-evidence-replay/1.4 单测 —— 回放驱动器（spawn/replay-driver.ts）：
// 不走模型，按（dispatch digest, 步序号）键回放录制的 assistant 动作序列（工具调用 + 文本回合）。
// 覆盖三 AC 用例族：正常回放（步序保真 + 终态 output 投影）/ 失配定位（diverge 步序号 +
// 工具名 fail-loud）/ 键漂移拒绝（无录制 digest = spawn 拒绝面）。
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createReplayDriverSpawn, digestOfPrompt, type ReplayScript } from './replay-driver.js'

function scriptOf(prompt: string, actions: ReplayScript['actions']): ReplayScript {
  return { digest: digestOfPrompt(prompt), actions }
}

/** 工具动作构造（seq = 1 起步序号——录制侧语义） */
function tool(seq: number, name: string, args: Record<string, unknown> = {}) {
  return { kind: 'tool' as const, seq, name, args }
}
function text(seq: number, text: string) {
  return { kind: 'text' as const, seq, text }
}

const BRIEF = 'worker 简报全文（digest 键源——sha256 前 12）'

describe('digestOfPrompt（回放键——core dispatchDigest 同式独立实现）', () => {
  it('sha256(utf8 全文) 前 12 hex；全文变则键变', () => {
    const d = digestOfPrompt(BRIEF)
    expect(d).toBe(createHash('sha256').update(BRIEF, 'utf8').digest('hex').slice(0, 12))
    expect(d).toMatch(/^[0-9a-f]{12}$/)
    expect(digestOfPrompt(BRIEF + 'x')).not.toBe(d)
  })
})

describe('createReplayDriverSpawn（正常回放——零模型步序保真）', () => {
  it('按步序号依序执行录制工具调用；文本回合聚合为终态 output', async () => {
    const calls: { name: string; args: unknown }[] = []
    const runTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { ok: true, name }
    })
    const spawn = createReplayDriverSpawn(
      new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [tool(1, 'forgeTasks', { op: 'addTask' }), tool(2, 'forgeTasks', { op: 'submitTask' }), text(3, 'done：任务已结算')])]]),
      runTool,
    )
    const handle = await spawn({
      prompt: BRIEF,
      parent: {},
      signal: new AbortController().signal,
      toolFilter: { deny: [] },
    })
    expect(handle.workerSessionId).toBe(`replay-${digestOfPrompt(BRIEF)}`)
    const result = await handle.result
    expect(result.stopReason).toBe('completed')
    expect(result.output).toBe('done：任务已结算')
    expect(calls).toEqual([
      { name: 'forgeTasks', args: { op: 'addTask' } },
      { name: 'forgeTasks', args: { op: 'submitTask' } },
    ])
    expect(runTool).toHaveBeenCalledTimes(2)
    await handle.dispose()
    await handle.dispose() // 幂等
  })

  it('多文本回合按序拼接（outputTextOf 同式 \\n join）；纯工具脚本 output = 空串', async () => {
    const spawn = createReplayDriverSpawn(
      new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [text(1, '第一段'), tool(2, 'forgeTasks', {}), text(3, '收尾')])]]),
      async () => ({}),
    )
    const handle = await spawn({ prompt: BRIEF, parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } })
    expect((await handle.result).output).toBe('第一段\n收尾')

    const bare = createReplayDriverSpawn(new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [tool(1, 'forgeTasks', {})])]]), async () => ({}))
    const h2 = await bare({ prompt: BRIEF, parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } })
    expect((await h2.result).output).toBe('')
  })
})

describe('createReplayDriverSpawn（失配定位——diverge 步 fail-loud）', () => {
  it('工具执行在步 N 失败 → result 拒绝，错误点名 digest + diverge 步序号 + 工具名', async () => {
    const runTool = vi.fn(async (name: string) => {
      if (name === 'broken') throw new Error('tool handler exploded')
      return {}
    })
    const spawn = createReplayDriverSpawn(
      new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [tool(1, 'forgeTasks', {}), tool(2, 'broken', { x: 1 }), tool(3, 'forgeTasks', {})])]]),
      runTool,
    )
    const handle = await spawn({ prompt: BRIEF, parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } })
    await expect(handle.result).rejects.toThrow(
      new RegExp(`回放 diverge.*${digestOfPrompt(BRIEF)}.*第 2 步.*broken.*tool handler exploded`),
    )
    expect(runTool).toHaveBeenCalledTimes(2) // 失败即停——不继续后续步
  })

  it('空录制脚本（零动作）= spawn 拒绝面（录制源不可带伤）', async () => {
    const spawn = createReplayDriverSpawn(new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [])]]), async () => ({}))
    await expect(
      spawn({ prompt: BRIEF, parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } }),
    ).rejects.toThrow(/空录制脚本/)
  })
})

describe('createReplayDriverSpawn（键漂移拒绝——无录制 digest fail-loud）', () => {
  it('digest 无录制脚本 → spawn 拒绝，错误带漂移 digest 与指引', async () => {
    const spawn = createReplayDriverSpawn(new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [text(1, 'x')])]]), async () => ({}))
    await expect(
      spawn({ prompt: '漂移后的简报全文', parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } }),
    ).rejects.toThrow(new RegExp(`回放键漂移.*${digestOfPrompt('漂移后的简报全文')}`))
  })
})

describe('createReplayDriverSpawn（取消/收尾契约）', () => {
  it('signal 已中止 → result 拒绝；dispose 后 pending result 拒绝（取消剩余工作）', async () => {
    const ac = new AbortController()
    const spawn = createReplayDriverSpawn(
      new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [tool(1, 'slow', {})])]]),
      () => new Promise(() => {}),
    )
    ac.abort()
    const h1 = await spawn({ prompt: BRIEF, parent: {}, signal: ac.signal, toolFilter: { deny: [] } })
    await expect(h1.result).rejects.toThrow(/中止/)

    const spawn2 = createReplayDriverSpawn(
      new Map([[digestOfPrompt(BRIEF), scriptOf(BRIEF, [tool(1, 'slow', {})])]]),
      () => new Promise(() => {}),
    )
    const h2 = await spawn2({ prompt: BRIEF, parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } })
    await h2.dispose()
    await expect(h2.result).rejects.toThrow(/disposed/)
  })
})
