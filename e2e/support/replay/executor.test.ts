// 5.1 回放执行器单测（AC4）：按夹具序列重放写入（verb 行依序执行、observed/event 观测行
// 跳过——录制观测不执行）+ fail-fast（步骤上下文定位）。driver 注入替身（app.evaluate
// 面由 e2e/specs/m2/replay-executor.spec.ts 运行面自证）。
import { describe, expect, it, vi } from 'vitest'
import type { ReplayWriteDriver } from './executor.js'
import { replayWrites } from './executor.js'
import { createFixtureBuilder } from './fixtures.js'

function fakeDriver(): ReplayWriteDriver & { calls: Array<[string, string, unknown]> } {
  const calls: Array<[string, string, unknown]> = []
  return {
    calls,
    call: vi.fn(async (service: string, verb: string, args: unknown) => {
      calls.push([service, verb, args])
      return { ok: `${service}.${verb}` }
    }),
    events: vi.fn(async () => []),
  }
}

describe('5.1 replayWrites · 按夹具序列重放写入', () => {
  it('verb 行依序执行 + args 原样 + 结算面返回（seq/service/verb/result）', async () => {
    const driver = fakeDriver()
    const fixture = createFixtureBuilder({ source: 'hand' })
      .verb('forgeTasks', 'addTask', { projectId: 'p', featureSlug: 'f', title: '甲', type: 'coding-feature' })
      .observed('forgeTasks', 'addTask', { taskId: 't-1', localId: '1' }) // 录制观测——不执行
      .event('p') // 事件流——不执行
      .verb('forgeTasks', 'claimTask', { projectId: 'p', sessionId: 's' })
      .build()
    const outcomes = await replayWrites(driver, fixture)
    expect(driver.calls).toEqual([
      ['forgeTasks', 'addTask', { projectId: 'p', featureSlug: 'f', title: '甲', type: 'coding-feature' }],
      ['forgeTasks', 'claimTask', { projectId: 'p', sessionId: 's' }],
    ])
    expect(outcomes.map((o) => [o.seq, o.service, o.verb, o.result])).toEqual([
      [1, 'forgeTasks', 'addTask', { ok: 'forgeTasks.addTask' }],
      [4, 'forgeTasks', 'claimTask', { ok: 'forgeTasks.claimTask' }],
    ])
  })

  it('空步骤夹具 → 空结算（零调用）', async () => {
    const driver = fakeDriver()
    expect(await replayWrites(driver, createFixtureBuilder().build())).toEqual([])
    expect(driver.calls).toEqual([])
  })

  it('fail-fast：动词失败即抛——错误面携带步骤 seq + service.verb + 原因（夹具/产品面错配定位）', async () => {
    const driver: ReplayWriteDriver = {
      call: vi.fn(async (service, verb) => {
        if (verb === 'claimTask') throw new Error('依赖未满足：f/1 in_progress')
        return { ok: `${service}.${verb}` }
      }),
      events: vi.fn(async () => []),
    }
    const fixture = createFixtureBuilder()
      .verb('forgeTasks', 'addTask', {})
      .verb('forgeTasks', 'claimTask', {})
      .verb('forgeTasks', 'submitTask', {}) // 不应触达
      .build()
    await expect(replayWrites(driver, fixture)).rejects.toThrow(/#2 forgeTasks\.claimTask.*依赖未满足/s)
    expect(driver.call).toHaveBeenCalledTimes(2)
  })
})
