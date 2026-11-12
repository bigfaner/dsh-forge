// loop-card-task-context 1.4 · running 行实时计时器 interval 挂载/清理单测（happy-dom 客户端
// 渲染——静态面两态断言在 ForgeEventEntries.test.tsx）：仅 running 行挂 interval、逐秒刷新、
// 卸载清理、多 running 行各自独立计时。
// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForgeEventGroupData, ForgeProgressEntryData } from './forge-event-data.js'
import { ForgeEventEntries } from './ForgeEventEntries.js'

const progAt = (n: number): number => new Date(2026, 9, 24, 14, n, 0).getTime()

const runningRow = { seq: 4, sourceSlug: 'feat-x', verb: 'claim', status: 'running', taskKey: 'feat-x/2.3', taskTitle: '折叠条目组', at: progAt(2) }

function groupOf(progress: ForgeProgressEntryData[]): ForgeEventGroupData {
  return {
    key: 'm1',
    firstSeq: 7,
    lastSeq: 9,
    isLatest: true,
    entries: [{ seq: 7, id: 'm1', time: progAt(1), badge: '启动', title: 'feat-x', summary: '启动', text: '[forge·启动] 任务源: feat-x' }],
    progress,
  }
}

function textOf(root: HTMLElement): string {
  return root.textContent ?? ''
}

afterEach(() => {
  vi.useRealTimers()
})

describe('running 行实时计时器（1.4——interval 生命周期）', () => {
  it('仅 running 行挂载 interval（两行 running = 2 个 interval）；逐秒刷新；卸载清理无泄漏', async () => {
    vi.useFakeTimers()
    const intervals: number[] = []
    const realSetInterval = window.setInterval.bind(window)
    const realClearInterval = window.clearInterval.bind(window)
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void) => {
      const id = realSetInterval(fn, 1000)
      intervals.push(id)
      return id
    }) as typeof window.setInterval)
    const cleared: number[] = []
    const clearSpy = vi.spyOn(window, 'clearInterval').mockImplementation(((id: number) => {
      cleared.push(id)
      realClearInterval(id)
    }) as typeof window.clearInterval)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    // 两行 running（不同任务键）+ 终态行各一
    const data = groupOf([
      runningRow,
      { ...runningRow, taskKey: 'feat-x/2.4', taskTitle: '另一行' },
      { seq: 9, sourceSlug: 'feat-x', verb: 'settle', status: 'completed', taskKey: 'feat-x/1.1', taskTitle: '已终态', at: progAt(30) },
    ])
    await act(async () => {
      root.render(<ForgeEventEntries node={{ kind: 'forge-event-group', data }} />)
    })
    // 终态行不挂 interval；两行 running 各挂一个（各含 mount 时 now 校准一发 setNow，无 interval 之外副作用）
    expect(intervalSpy).toHaveBeenCalledTimes(2)
    expect(textOf(container)).toContain('折叠条目组')

    // 逐秒刷新：推进 2s 后标签随 now 变化（running 行 startAt=14:02，system time 已被 fake 推进）
    vi.setSystemTime(progAt(2) + 61_000)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(textOf(container)).toContain('1分2秒')
    vi.setSystemTime(progAt(2) + 122_000)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(textOf(container)).toContain('2分3秒')

    await act(async () => {
      root.unmount()
    })
    expect(clearSpy).toHaveBeenCalledTimes(2) // 两行 running 各自清理（组件卸载即清 interval，无泄漏）
    expect(cleared).toEqual(intervals)
    intervalSpy.mockRestore()
    clearSpy.mockRestore()
  })
})
