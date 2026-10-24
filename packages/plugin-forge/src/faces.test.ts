// faces 单测 —— DispatchJobsFace 收窄面 + 适配层（async-dispatch §7 任务 1.2）：
// start(spec) → { jobId } 包装 / kind·label·owner 透传 / appendLog → job.append(line,
// { channel: 'log' }) 单点硬编码（收窄句柄唯一写入口——默认通道 append 与 updateProgress
// 结构性不可达，F4 通道矩阵唯 log 被模型消费读滤除）/ hooks（cancel + done）恒等交还注册表。
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Project } from '@dsh-forge/contracts'
import { adaptAgentNarrationChannel, adaptDispatchJobs, createProjectContainerDirs } from './faces.js'
import type { DispatchJobsRegistryFace } from './faces.js'
import type { NarrationChannel } from './notify/index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

/** 容器目录桩值（平台无关绝对路径——#61：'D:/...' 盘符拼写 POSIX 下为相对路径） */
const DEMO_CONTAINER_DIR = join(tmpdir(), 'dsh-forge-containers', 'demo@abcd1234')

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

// ─────────────────────────── S2 adaptAgentNarrationChannel（agents 注册表 → send 单出口） ───────────────────────────

describe('adaptAgentNarrationChannel（loop-event-delivery——send 单出口：agent.send(msg, nextStep, wakeup)）', () => {
  function agentSpy() {
    const sent: { message: unknown; target: string; wakeup?: boolean }[] = []
    const agent = {
      send: (message: unknown, target: string, wakeup?: boolean) => {
        sent.push({ message, target, wakeup })
      },
    }
    return { agent, sent }
  }

  const sourceOf = (call: { message: unknown } | undefined): { kind?: string; form?: string; summary?: string } =>
    ((call?.message as { source?: { kind?: string; form?: string; summary?: string } })?.source ?? {})
  const messageOf = (call: { message: unknown } | undefined): unknown => call?.message

  it('事件径（notice 形态）：send(msg, nextStep, false)——写入不唤醒 + forge 事件 source（kind forge-dispatch / form notice / summary）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: (id) => (id === 's-1' ? spy.agent : undefined) })
    await channel.send('s-1', '已领取任务 2.5')
    expect(spy.sent).toHaveLength(1)
    expect(spy.sent[0]).toMatchObject({ target: 'nextStep', wakeup: false })
    expect(spy.sent[0]?.message).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '已领取任务 2.5' }],
      source: { kind: 'forge-dispatch', form: 'notice' },
    })
    expect(sourceOf(spy.sent[0]).summary).toBe('已领取任务 2.5')
    expect(typeof (messageOf(spy.sent[0]) as { id?: unknown }).id).toBe('string')
  })

  it('长文本事件径：summary 界内截断（≤120 字符——上游 CONTEXT_SUMMARY_MAX_CHARS 同值），全文完整进 content', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    const long = '长'.repeat(300)
    await channel.send('s-1', long)
    const summary = sourceOf(spy.sent[0]).summary ?? ''
    expect(summary.length).toBeLessThanOrEqual(120)
    expect(summary.endsWith('…')).toBe(true)
    expect((messageOf(spy.sent[0]) as { content: { text: string }[] }).content[0]?.text).toBe(long)
  })

  it('传入预构建摘要（headline）：summary=headline 原样（缺省回退整段截断）；headline 超界保底钳制', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    const longBody = '长'.repeat(300)
    const headline = '[forge·领取] 2.8 诊断弹窗装配（Apps web）· 待执行 3 · 执行中 1'
    await channel.send('s-1', longBody, { headline })
    expect(sourceOf(spy.sent[0]).summary).toBe(headline)
    expect((messageOf(spy.sent[0]) as { content: { text: string }[] }).content[0]?.text).toBe(longBody)
    await channel.send('s-1', 'x', { headline: '标'.repeat(200) })
    const clamped = sourceOf(spy.sent[1]).summary ?? ''
    expect(clamped.length).toBeLessThanOrEqual(120)
    expect(clamped.endsWith('…')).toBe(true)
  })

  it('唤醒径（followup 形态）：send(msg, nextStep, true)——source kind forge-loop 循环哨兵（非人工输入蓝气泡）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    await channel.send('s-1', '任务源 feat-x 全部完成', { form: 'followup', wakeup: true })
    expect(spy.sent[0]).toMatchObject({ target: 'nextStep', wakeup: true })
    expect(spy.sent[0]?.message).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: '任务源 feat-x 全部完成' }],
      source: { kind: 'forge-loop', loopKind: 'dispatch', form: 'notice', summary: '任务源 feat-x 全部完成' },
    })
    const source = (messageOf(spy.sent[0]) as { source: { runId?: string; task?: string; state?: string } }).source
    expect(typeof source.runId).toBe('string')
    expect((source.runId as string).length).toBeGreaterThan(0)
    expect(source.task).toBe('')
    expect(source.state).toBe('followup')
  })

  it('followup 携带循环上下文（task/state 透传；runId 铸发唯一——两次注入不同 runId）', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    await channel.send('s-1', '无法自动处理——已向你发起问询', {
      form: 'followup',
      wakeup: true,
      loop: { task: '4.2', state: 'blocked-ask-user' },
    })
    await channel.send('s-1', '第二次注入', { form: 'followup', wakeup: true })
    const first = (messageOf(spy.sent[0]) as { source: { task?: string; state?: string; runId?: string } }).source
    const second = (messageOf(spy.sent[1]) as { source: { runId?: string } }).source
    expect(first.task).toBe('4.2')
    expect(first.state).toBe('blocked-ask-user')
    expect(first.runId).not.toBe(second.runId)
  })

  it('结算径（settle 形态）：send(msg, nextStep, true) 单点唤醒——source {kind: dispatch-loop-settled}', async () => {
    const spy = agentSpy()
    const channel = adaptAgentNarrationChannel({ get: () => spy.agent })
    await channel.send('s-1', '【任务循环结束】全部任务已完成', { form: 'settle', wakeup: true })
    expect(spy.sent[0]).toMatchObject({ target: 'nextStep', wakeup: true })
    expect(spy.sent[0]?.message).toMatchObject({
      role: 'user',
      source: { kind: 'dispatch-loop-settled' },
    })
  })

  it('会话无活根 / send 面缺席：静默跳过不抛（settle 形态加必达告警——降级凭 slug 认领）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const channel = adaptAgentNarrationChannel({ get: () => undefined })
      await expect(channel.send('s-gone', 'x')).resolves.toBeUndefined()
      await expect(channel.send('s-gone', '结算文本', { form: 'settle', wakeup: true })).resolves.toBeUndefined()
      const partial = adaptAgentNarrationChannel({ get: () => ({ send: 'not-a-function' }) })
      await expect(partial.send('s-1', 'x')).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0]?.[0]).toContain('结算通知未送达')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('类型面断言：NarrationChannel 仅 send 单出口——旧 notice/followup/settle 三方法消失', () => {
    type ExtinctKeys = 'notice' | 'followup' | 'settle'
    type Remaining = Extract<keyof NarrationChannel, ExtinctKeys>
    const extinct: readonly Remaining[] = []
    expect(extinct).toHaveLength(0)
    const channel: NarrationChannel = { send: async () => {} }
    expect(typeof channel.send).toBe('function')
  })
})

// ─────────────────────────── S1c/S4 createProjectContainerDirs（projectId→容器目录解析缝） ───────────────────────────

describe('createProjectContainerDirs（1.11 装配接线收口——反向解析记忆化桥接）', () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
  const DEMO_PROJECT = { wsPath: 'C:\\ws\\demo' } as unknown as Project

  function projectSpy(over: { project?: Project | null; dir?: string; deriveThrows?: boolean } = {}) {
    const getCalls: string[] = []
    const deriveInputs: unknown[] = []
    const projects = {
      getProject: async (id: string): Promise<Project | null> => {
        getCalls.push(id)
        return over.project === undefined ? DEMO_PROJECT : over.project
      },
      deriveTaskStoreDir: async (q: { workspaceDir: string }) => {
        deriveInputs.push(q)
        if (over.deriveThrows === true) throw new Error('derive exploded')
        return { dir: over.dir ?? DEMO_CONTAINER_DIR }
      },
    }
    return { projects, getCalls, deriveInputs }
  }

  it('warm→resolve 命中：ws_path 反查 + deriveTaskStoreDir 单源派生（插件不复制派生逻辑）', async () => {
    const spy = projectSpy()
    const dirs = createProjectContainerDirs(spy.projects)
    dirs.warm(['p-1'])
    await flush()
    expect(spy.getCalls).toEqual(['p-1'])
    expect(spy.deriveInputs).toEqual([{ workspaceDir: 'C:\\ws\\demo' }])
    expect(dirs.resolve('p-1')).toBe(DEMO_CONTAINER_DIR)
    expect(spy.getCalls).toEqual(['p-1']) // 记忆命中零二次解析
  })

  it('resolve 未命中 = undefined + 懒解析（下次命中）；warm 幂等去重', async () => {
    const spy = projectSpy()
    const dirs = createProjectContainerDirs(spy.projects)
    expect(dirs.resolve('p-1')).toBeUndefined() // 未命中即时回 undefined（同步落盘径 fail-soft）
    await flush()
    expect(dirs.resolve('p-1')).toBe(DEMO_CONTAINER_DIR)
    dirs.warm(['p-1', 'p-1']) // 已记忆/解析中跳过——幂等
    await flush()
    expect(spy.getCalls).toEqual(['p-1'])
  })

  it('项目不存在（getProject null）= 永不记忆零抛；解析失败（derive 拒绝）= 清除占位可重试', async () => {
    const missing = createProjectContainerDirs(projectSpy({ project: null }).projects)
    missing.warm(['p-404'])
    await flush()
    expect(missing.resolve('p-404')).toBeUndefined()

    const spy = projectSpy({ deriveThrows: true })
    const dirs = createProjectContainerDirs(spy.projects)
    dirs.warm(['p-1'])
    await flush()
    expect(dirs.resolve('p-1')).toBeUndefined() // 失败未记忆——不拖垮调用方
    await flush()
    expect(spy.getCalls).toEqual(['p-1', 'p-1']) // 占位已清除——再次触发懒解析（可自愈重试）
  })
})
