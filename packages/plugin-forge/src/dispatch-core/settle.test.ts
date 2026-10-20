// settleWorkerRun 失败判词定向单测（bug 63112ab2——无结算失败原因携带 worker 输出原文，
// 流控分类的载体；缺输出 = 判词只有 stopReason，循环侧无法识别限流）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, QueryTaskResult, TaskSnapshot } from '@dsh-forge/contracts'
import { settleWorkerRun } from './settle.js'
import type { SpawnWorkerHandle } from './spawn.js'

function snapshot(): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Implement the thing',
    taskType: 'coding-fix',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  }
}

function harness(): ForgeTasksService {
  const query: QueryTaskResult = {
    task: snapshot(),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [],
  }
  return { queryTask: async () => query } as unknown as ForgeTasksService
}

describe('settleWorkerRun 失败判词（bug 63112ab2）', () => {
  it('无结算失败原因携带 worker 输出原文（限流分类载体）', async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: 'worker-1',
      result: Promise.resolve({ stopReason: 'error', output: 'provider error: 429 rate limit exceeded' }),
      dispose: async () => {},
    }
    const settlement = await settleWorkerRun({ tasks: harness() }, { projectId: 'p-1', task: snapshot(), digest: 'd', handle, spawnStartedAt: Date.now() })
    expect(settlement.case).toBe('failed')
    if (settlement.case !== 'failed') return
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause)
    expect(message).toContain('stopReason: error')
    expect(message).toContain('429 rate limit exceeded')
  })

  it('输出为空 = 判词零冒号尾（不引入空尾巴）', async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: 'worker-1',
      result: Promise.resolve({ stopReason: 'error', output: '' }),
      dispose: async () => {},
    }
    const settlement = await settleWorkerRun({ tasks: harness() }, { projectId: 'p-1', task: snapshot(), digest: 'd', handle, spawnStartedAt: Date.now() })
    if (settlement.case !== 'failed') return expect.fail('expected failed')
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause)
    expect(message).toBe('worker run ended without a settlement (stopReason: error)')
  })
})
