// tasks-hub 降级诊断留痕契约（1.29 终审收尾批——B6.O3 实现面收口）：
// follow 流不可达落降级轮询（既有语义）；轮询 list 失败 warn 留痕（AGENTS §7——fail-soft
// 不静默），同因去重不刷屏（仅首轮 + error 变化各一行），恢复后同因复发再留痕。
import { describe, expect, it } from 'vitest'
import { TASKS_HUB_FALLBACK_POLL_MS, createTasksBoardHub, type TasksBoardHub } from '../../ui/tasks-hub.js'
import type { ForgeTasksRpc, TaskBoardDtoView, TasksFollowQuery } from '../../ui/tasks-rpc.js'

/** 手动节拍：注册的定时任务收集进 pending，由测试显式 flush */
function manualSchedule(): {
  schedule: (fn: () => void, ms: number) => () => void
  flush: () => Promise<void>
} {
  const pending: (() => void)[] = []
  const schedule = (fn: () => void, _ms: number): (() => void) => {
    pending.push(fn)
    return () => {
      const i = pending.indexOf(fn)
      if (i >= 0) pending.splice(i, 1)
    }
  }
  const flush = async (): Promise<void> => {
    const batch = pending.splice(0, pending.length)
    for (const fn of batch) fn()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { schedule, flush }
}

/** follow 恒抛 + list 可编排的假 client */
function fakeClient(listResults: (Error | { cards: { taskStatus: string }[] })[]): ForgeTasksRpc & { listCalls: number } {
  let calls = 0
  const client = {
    listCalls: 0,
    // eslint-disable-next-line require-yield
    follow: async function* (_q: TasksFollowQuery): AsyncGenerator<TaskBoardDtoView> {
      throw new Error('stream unreachable')
    },
    list: (async (_q: TasksFollowQuery) => {
      const r = listResults[Math.min(calls, listResults.length - 1)]
      calls += 1
      client.listCalls = calls
      if (r instanceof Error) throw r
      return r.cards
    }) as ForgeTasksRpc['list'],
  }
  return client as unknown as ForgeTasksRpc & { listCalls: number }
}

function startHub(client: ForgeTasksRpc, schedule: (fn: () => void, ms: number) => () => void, diag: string[]): TasksBoardHub {
  const hub = createTasksBoardHub({
    client,
    query: { projectId: 'p' },
    onSnapshot: () => {},
    onDiag: (line) => diag.push(line),
    schedule,
  })
  hub.start()
  return hub
}

describe('tasks-hub 降级诊断留痕（B6.O3 实现面）', () => {
  it('follow 不可达落降级轮询并留痕一行', async () => {
    const { schedule, flush } = manualSchedule()
    const diag: string[] = []
    const hub = startHub(fakeClient([]), schedule, diag)
    await flush() // follow 迭代抛错 → startFallbackPolling（diag 一行）+ 首轮 tick 调度
    expect(diag.some((l) => l.includes('follow 流不可达'))).toBe(true)
    expect(diag.some((l) => l.includes(String(TASKS_HUB_FALLBACK_POLL_MS)))).toBe(true)
    hub.dispose()
  })

  it('轮询 list 失败 warn 留痕；同因去重不刷屏；换因再留痕', async () => {
    const { schedule, flush } = manualSchedule()
    const diag: string[] = []
    const e1 = new Error('boom-1')
    const e2 = new Error('boom-2')
    const hub = startHub(fakeClient([e1, e1, e2, e2]), schedule, diag)
    await flush() // 首轮 tick 排队
    await flush() // tick 1：list 抛 boom-1 → warn
    expect(diag.filter((l) => l.includes('降级轮询 list 不可达')).length).toBe(1)
    await flush() // tick 2：同因 boom-1 → 去重零新增
    expect(diag.filter((l) => l.includes('降级轮询 list 不可达')).length).toBe(1)
    await flush() // tick 3：boom-2 → 换因再 warn
    const lines = diag.filter((l) => l.includes('降级轮询 list 不可达'))
    expect(lines.length).toBe(2)
    expect(lines[1]).toContain('boom-2')
    hub.dispose()
  })

  it('轮询恢复后再遇同因失败——重新留痕（恢复重置去重态）', async () => {
    const { schedule, flush } = manualSchedule()
    const diag: string[] = []
    const e1 = new Error('boom-1')
    const ok = { cards: [{ taskStatus: 'pending' }] }
    const hub = startHub(fakeClient([e1, ok, e1]), schedule, diag)
    await flush()
    await flush() // 失败 → warn boom-1
    await flush() // 成功 → 去重态重置
    await flush() // 同因复发 → 再 warn
    expect(diag.filter((l) => l.includes('boom-1')).length).toBe(2)
    hub.dispose()
  })
})
