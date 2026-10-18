import { describe, expect, it } from 'vitest'
import type { WireEvent } from '../core/wire.ts'
import {
  coerceCommandCatalog,
  commandReceipts,
  deriveTaskRuns,
  dispatchLine,
  groupRunsBySource,
  hasActiveSource,
  normalizeStatus,
  pauseLine,
  type TaskRun,
} from './tasks.ts'

const progress = (
  seq: number,
  sourceSlug: string,
  taskKey: string,
  status: string,
  counts: Record<string, number> = {},
): WireEvent =>
  ({
    type: 'forge/progress',
    seq,
    time: 0,
    data: { sourceSlug, verb: 'task', status, taskKey, counts },
  }) as WireEvent

const run = (overrides: Partial<TaskRun> & { sourceSlug: string; taskKey: string }): TaskRun => ({
  number: 1,
  title: overrides.taskKey,
  status: 'running',
  counts: {},
  ...overrides,
})

describe('deriveTaskRuns（forge/progress 会话日志投影）', () => {
  it('同 (sourceSlug, taskKey) 以最新 seq 状态为准', () => {
    const runs = deriveTaskRuns([
      progress(1, 'mobile-ui', 'mobile-ui/1.1', 'running'),
      progress(2, 'mobile-ui', 'mobile-ui/1.1', 'done'),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]?.status).toBe('done')
  })

  it('编号 = 组内首次出现序（1 起）；title 剥离 slug 前缀', () => {
    const runs = deriveTaskRuns([
      progress(1, 's', 's/1.2-drawer', 'running'),
      progress(2, 's', 's/1.3-hero', 'running'),
      progress(3, 't', 't/x', 'running'),
    ])
    expect(runs.map((r) => [r.number, r.title])).toEqual([
      [1, '1.2-drawer'],
      [2, '1.3-hero'],
      [1, 'x'],
    ])
  })

  it('缺字段行 fail-soft 丢弃；无前缀 taskKey 原样为 title', () => {
    const bad = { type: 'forge/progress', seq: 9, time: 0, data: { sourceSlug: 's' } } as WireEvent
    const runs = deriveTaskRuns([bad, progress(1, 's', 'bare', 'running')])
    expect(runs).toHaveLength(1)
    expect(runs[0]?.title).toBe('bare')
  })
})

describe('normalizeStatus（桌面状态集对齐）', () => {
  it('done/complete → done；pause → paused；block/fail → blocked；其余 → running', () => {
    expect(normalizeStatus('done')).toBe('done')
    expect(normalizeStatus('completed')).toBe('done')
    expect(normalizeStatus('paused')).toBe('paused')
    expect(normalizeStatus('blocked')).toBe('blocked')
    expect(normalizeStatus('failed')).toBe('blocked')
    expect(normalizeStatus('claimed')).toBe('running')
  })
})

describe('groupRunsBySource（R10-F2 多 run chips = 按 source_slug 分组）', () => {
  it('分组计数 + active = 有非 done；running 组排前', () => {
    const chips = groupRunsBySource([
      run({ sourceSlug: 'a', taskKey: 'a/1', status: 'done' }),
      run({ sourceSlug: 'a', taskKey: 'a/2', status: 'done' }),
      run({ sourceSlug: 'b', taskKey: 'b/1', status: 'running' }),
      run({ sourceSlug: 'b', taskKey: 'b/2', status: 'paused' }),
    ])
    expect(chips.map((c) => c.sourceSlug)).toEqual(['b', 'a'])
    expect(chips[0]).toMatchObject({ total: 2, doneCount: 0, active: true })
    expect(chips[1]).toMatchObject({ total: 2, doneCount: 2, active: false })
  })
})

describe('同源独占守卫（F5-甲——防重复派发）', () => {
  it('该 source 有非 done run = 独占中', () => {
    const runs = [
      run({ sourceSlug: 'a', taskKey: 'a/1', status: 'running' }),
      run({ sourceSlug: 'a', taskKey: 'a/2', status: 'done' }),
      run({ sourceSlug: 'b', taskKey: 'b/1', status: 'done' }),
    ]
    expect(hasActiveSource(runs, 'a')).toBe(true)
    expect(hasActiveSource(runs, 'b')).toBe(false)
    expect(hasActiveSource(runs, 'c')).toBe(false)
  })
})

describe('回执（会话内指令回执文本 = command/run+done 成对投影）', () => {
  it('done 到达成对 → 回执文本；未配对开始态不作回执', () => {
    const events: WireEvent[] = [
      { type: 'command/run', seq: 1, time: 0, data: { commandId: 'c1', name: 'run-dag-tasks', args: 'mobile-ui' } } as WireEvent,
      { type: 'command/run', seq: 2, time: 0, data: { commandId: 'c2', name: 'stop-dag-tasks', args: '' } } as WireEvent,
      { type: 'command/done', seq: 3, time: 0, data: { commandId: 'c1', kind: 'ok', text: '派发循环已启动' } } as WireEvent,
    ]
    const receipts = commandReceipts(events)
    expect(receipts).toEqual([{ commandId: 'c1', name: 'run-dag-tasks', kind: 'ok', text: '派发循环已启动' }])
  })

  it('done 无 text 时回退 kind', () => {
    const events: WireEvent[] = [
      { type: 'command/run', seq: 1, time: 0, data: { commandId: 'c1', name: 'x', args: '' } } as WireEvent,
      { type: 'command/done', seq: 2, time: 0, data: { commandId: 'c1', kind: 'error' } } as WireEvent,
    ]
    expect(commandReceipts(events)[0]?.text).toBe('error')
  })
})

describe('指令仲裁行 + 目录收敛（forge:proxy/commands 通道 wire 形状 = 1.1 录制）', () => {
  it('派发/暂停行', () => {
    expect(dispatchLine('mobile-ui')).toBe('/run-dag-tasks mobile-ui')
    expect(pauseLine()).toBe('/stop-dag-tasks')
  })

  it('coerceCommandCatalog 提取 name；缺字段行丢弃', () => {
    const catalog = coerceCommandCatalog([
      { definitionId: 'x', name: 'run-dag-tasks', description: '派发任务', input: { hint: '[<slug>]' } },
      { name: 'stop-dag-tasks' },
      { noName: true },
    ])
    expect(catalog).toEqual(['run-dag-tasks', 'stop-dag-tasks'])
    expect(coerceCommandCatalog(null)).toEqual([])
  })
})
