// faces 单测 —— DispatchJobsFace 收窄面 + 适配层（async-dispatch §7 任务 1.2）：
// start(spec) → { jobId } 包装 / kind·label·owner 透传 / appendLog → job.append(line,
// { channel: 'log' }) 单点硬编码（收窄句柄唯一写入口——默认通道 append 与 updateProgress
// 结构性不可达，F4 通道矩阵唯 log 被模型消费读滤除）/ hooks（cancel + done）恒等交还注册表。
import { describe, expect, it } from 'vitest'
import { adaptAgentNarrationChannel, adaptDispatchJobs } from './faces.js'
import type { DispatchJobsRegistryFace } from './faces.js'

describe('adaptDispatchJobs（适配层——channel 单点硬编码）', () => {
  it('start 返回 { jobId }（注册表签发 id 包装）；kind/label/owner 透传', () => {
    const seen: unknown[] = []
    const registry: DispatchJobsRegistryFace = {
      start(spec) {
        seen.push(spec)
        spec.run({ append: () => {} })
        return 'forge-dispatch-7'
      },
    }
    const jobs = adaptDispatchJobs(registry)
    const out = jobs.start({
      kind: 'forge-dispatch',
      label: 'feat-x/1.2 · Implement the thing',
      owner: 'session-a',
      run: () => ({ cancel: () => {}, done: Promise.resolve({ status: 'completed' }) }),
    })
    expect(out).toEqual({ jobId: 'forge-dispatch-7' })
    expect(seen[0]).toMatchObject({ kind: 'forge-dispatch', label: 'feat-x/1.2 · Implement the thing', owner: 'session-a' })
  })

  it('owner 缺席：透传 spec 不含 owner 键（上游 unowned job 语义零强加）', () => {
    const seen: unknown[] = []
    adaptDispatchJobs({
      start(spec) {
        seen.push(spec)
        spec.run({ append: () => {} })
        return 'jd-0'
      },
    }).start({
      kind: 'forge-dispatch',
      label: 'l',
      run: () => ({ cancel: () => {}, done: Promise.resolve({ status: 'completed' }) }),
    })
    expect(seen[0]).not.toHaveProperty('owner')
  })

  it('appendLog → job.append(line, { channel: "log" })；收窄句柄唯一成员 = appendLog（channel 值调用面不可达——F4 泄露路径裁剪）', () => {
    const appends: { text: string; options: unknown }[] = []
    const jobs = adaptDispatchJobs({
      start(spec) {
        spec.run({ append: (text, options) => { appends.push({ text, options }) } })
        return 'jd-1'
      },
    })
    const handleKeys: string[] = []
    jobs.start({
      kind: 'forge-dispatch',
      label: 'l',
      run: (handle) => {
        handleKeys.push(...Object.keys(handle))
        handle.appendLog('claimed feat-x/1.2')
        handle.appendLog('spawned worker-1')
        return { cancel: () => {}, done: Promise.resolve({ status: 'completed' }) }
      },
    })
    expect(handleKeys).toEqual(['appendLog'])
    expect(appends).toEqual([
      { text: 'claimed feat-x/1.2', options: { channel: 'log' } },
      { text: 'spawned worker-1', options: { channel: 'log' } },
    ])
  })

  it('hooks 恒等透传：spec.run 返回的 cancel/done 原样交还注册表（kill taxonomy 零转写）', async () => {
    const done = Promise.resolve({ status: 'killed' as const, detail: 'stop' })
    const cancel = () => {}
    let received: { cancel: unknown; done: unknown } | undefined
    adaptDispatchJobs({
      start(spec) {
        received = spec.run({ append: () => {} }) as { cancel: unknown; done: unknown }
        return 'jd-2'
      },
    }).start({ kind: 'k', label: 'l', run: () => ({ cancel, done }) })
    expect(received).toEqual({ cancel, done })
    await expect(received?.done).resolves.toEqual({ status: 'killed', detail: 'stop' })
  })
})

// ─────────────────────────── S2 adaptAgentNarrationChannel（agents 注册表 → 叙述双通道） ───────────────────────────

describe('adaptAgentNarrationChannel（S2——notice=agent.inject 零模型回合 / followup=agent.followup 新回合）', () => {
  function agentSpy() {
    const injected: unknown[] = []
    const followed: unknown[] = []
    const agent = {
      inject: (m: unknown) => injected.push(m),
      followup: (m: unknown) => followed.push(m),
    }
    return { agent, injected, followed }
  }

  it('notice → 活根 inject：user 消息 + producer 归因（kind forge-dispatch / form notice / summary）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: (id) => (id === 's-1' ? spy.agent : undefined) })
    await channel.notice('s-1', '已领取任务 2.5')
    expect(spy.followed).toHaveLength(0) // 零模型回合——followup 通道零触达
    expect(spy.injected).toHaveLength(1)
    expect(spy.injected[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '已领取任务 2.5' }],
      source: { kind: 'forge-dispatch', form: 'notice' },
    })
    const summary = (spy.injected[0] as { source: { summary?: string } }).source.summary
    expect(summary).toBe('已领取任务 2.5')
    expect(typeof (spy.injected[0] as { id?: unknown }).id).toBe('string')
  })

  it('长文本 notice：summary 界内截断（≤120 字符——上游 CONTEXT_SUMMARY_MAX_CHARS 同值）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    const long = '长'.repeat(300)
    await channel.notice('s-1', long)
    const summary = (spy.injected[0] as { source: { summary?: string } }).source.summary ?? ''
    expect(summary.length).toBeLessThanOrEqual(120)
    expect(summary.endsWith('…')).toBe(true)
    // 全文仍完整进 content——截断只发生在折叠摘要位
    expect((spy.injected[0] as { content: { text: string }[] }).content[0]?.text).toBe(long)
  })

  it('followup → 活根 followup：完整消息（source kind user——主会话新回合并唤醒）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    await channel.followup('s-1', '任务源 feat-x 全部完成')
    expect(spy.injected).toHaveLength(0)
    expect(spy.followed[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '任务源 feat-x 全部完成' }],
      source: { kind: 'user' },
    })
  })

  it('会话无活根 / 面 non-function：静默跳过不抛（R4 叙述通道存活依赖 fail-soft 第二道防线）', async () => {
    const channel = adaptAgentNarrationChannel({ get: () => undefined })
    await expect(channel.notice('s-gone', 'x')).resolves.toBeUndefined()
    await expect(channel.followup('s-gone', 'x')).resolves.toBeUndefined()
    const partial = adaptAgentNarrationChannel({ get: () => ({ inject: 'not-a-function' }) })
    await expect(partial.notice('s-1', 'x')).resolves.toBeUndefined()
  })
})
