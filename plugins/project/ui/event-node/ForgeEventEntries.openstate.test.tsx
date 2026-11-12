// 结算组卡展开态自适应回归（用户裁决——旧组结算 turn 汇总全部任务进度投影，保持展开）：
// 纯消息组起步挂载收起 → progress 后折入同组自动展开 → 用户手动收起后手动值优先 →
// 结算后（非最新组 + 全量投影在场）保持展开。
// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { ForgeEventGroupData, ForgeProgressEntryData } from './forge-event-data.js'
import { ForgeEventEntries } from './ForgeEventEntries.js'

const progAt = (n: number): number => new Date(2026, 9, 24, 14, n, 0).getTime()

const PROGRESS: ForgeProgressEntryData = {
  seq: 8,
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.3',
  taskTitle: '折叠条目组',
  at: progAt(2),
}

function groupOf(progress: ForgeProgressEntryData[] | undefined, isLatest: boolean): ForgeEventGroupData {
  return {
    key: 'm1',
    firstSeq: 7,
    lastSeq: 9,
    isLatest,
    entries: [
      { seq: 7, id: 'm1', time: progAt(1), badge: '启动', title: 'feat-x', summary: '启动', text: '[forge·启动] 任务源: feat-x' },
      { seq: 9, id: 'm2', time: progAt(30), badge: '完成', title: 'feat-x', summary: '循环结束', text: '[forge·完成] 循环结束' },
    ],
    progress,
  }
}

async function renderData(root: ReturnType<typeof createRoot>, container: HTMLElement, data: ForgeEventGroupData): Promise<void> {
  await act(async () => {
    root.render(<ForgeEventEntries node={{ kind: 'forge-event-group', data }} />)
  })
}

function expandedState(container: HTMLElement): boolean {
  return container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') === 'true'
}

async function toggle(container: HTMLElement): Promise<void> {
  const row = container.querySelector('[aria-expanded]')
  if (row === null) throw new Error('disclosure row 不在场')
  await act(async () => {
    row.dispatchEvent(new Event('click', { bubbles: true }))
  })
}

describe('组卡展开态自适应（progress 后折入自动展开；手动切换优先）', () => {
  it('纯消息组起步收起 → progress 折入自动展开 → 手动收起优先 → 结算后保持展开', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    // ① 非最新纯消息组挂载 → 默认收起（旧默认态不回归）
    await renderData(root, container, groupOf(undefined, false))
    expect(expandedState(container)).toBe(false)

    // ② progress 事件后折入同组（同 key 组数据更新）→ 自动态翻转展开
    await renderData(root, container, groupOf([PROGRESS], false))
    expect(expandedState(container)).toBe(true)

    // ③ 用户手动收起 → 手动值优先，后续数据更新不再自动翻回
    await toggle(container)
    expect(expandedState(container)).toBe(false)
    await renderData(root, container, groupOf([PROGRESS, { ...PROGRESS, seq: 10, taskKey: 'feat-x/2.4', status: 'completed' }], false))
    expect(expandedState(container)).toBe(false)

    // ④ 结算组卡新挂载（无手动干预：非最新组 + 全量投影在场）→ 自动语义 = 保持展开
    container.remove()
    const container2 = document.createElement('div')
    document.body.append(container2)
    const root2 = createRoot(container2)
    await renderData(root2, container2, groupOf([PROGRESS], false))
    expect(expandedState(container2)).toBe(true)
  })
})
