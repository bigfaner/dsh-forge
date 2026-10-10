// faces 单测 —— DispatchJobsFace 收窄面 + 适配层（async-dispatch §7 任务 1.2）：
// start(spec) → { jobId } 包装 / kind·label·owner 透传 / appendLog → job.append(line,
// { channel: 'log' }) 单点硬编码（收窄句柄唯一写入口——默认通道 append 与 updateProgress
// 结构性不可达，F4 通道矩阵唯 log 被模型消费读滤除）/ hooks（cancel + done）恒等交还注册表。
import { describe, expect, it } from 'vitest'
import { adaptDispatchJobs } from './faces.js'
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
