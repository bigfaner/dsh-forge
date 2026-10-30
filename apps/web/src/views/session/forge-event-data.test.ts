// loop-event-delivery 1.9 · 折叠条目组数据守卫单测（forge-event-data.ts——他形不猜不抛）。
import { describe, expect, it } from 'vitest'
import {
  forgeEventBadgeTone,
  forgeEventClock,
  forgeEventClockSeconds,
  forgeProgressRowItems,
  forgeProgressStatusTone,
  FORGE_PROGRESS_STATUS_WORD,
  isForgeEventGroupData,
  isForgeProgressEntryData,
  type ForgeEventGroupData,
  type ForgeProgressEntryData,
} from './forge-event-data.js'

const entry = {
  id: 'm1',
  seq: 7,
  time: 1_700_000_000_000,
  badge: '启动',
  title: '2.3 折叠条目组',
  summary: '启动 · 2.3',
  text: '[forge·启动] 任务源: feat-x',
}

const data: ForgeEventGroupData = { key: 'm1', firstSeq: 7, lastSeq: 8, isLatest: true, entries: [entry] }

describe('isForgeEventGroupData（buildViewNode data 形状镜像守卫）', () => {
  it('整形状在场 = true；字段缺失/类型漂移/条目畸形 = false', () => {
    expect(isForgeEventGroupData(data)).toBe(true)
    expect(isForgeEventGroupData({ ...data, key: 42 })).toBe(false)
    expect(isForgeEventGroupData({ ...data, isLatest: 'yes' })).toBe(false)
    expect(isForgeEventGroupData({ ...data, entries: [{ ...entry, seq: 'x' }] })).toBe(false)
    expect(isForgeEventGroupData({ ...data, firstSeq: Number.NaN })).toBe(false)
    expect(isForgeEventGroupData({})).toBe(false)
    expect(isForgeEventGroupData(null)).toBe(false)
    expect(isForgeEventGroupData('x')).toBe(false)
  })
})

describe('族色与时刻刻度（prototype evt-kind 同语义）', () => {
  it('徽记族色映射：进行蓝/完成绿/阻塞琥珀；未知徽记 run 兜底', () => {
    expect(forgeEventBadgeTone('启动')).toBe('run')
    expect(forgeEventBadgeTone('自动重试')).toBe('run')
    expect(forgeEventBadgeTone('完成')).toBe('done')
    expect(forgeEventBadgeTone('停止')).toBe('done')
    expect(forgeEventBadgeTone('阻塞')).toBe('blk')
    expect(forgeEventBadgeTone('受阻')).toBe('blk')
    expect(forgeEventBadgeTone('未知场景')).toBe('run')
  })
  it('时刻刻度：组头 HH:mm 与条目 HH:mm:ss（畸形时间戳 = 空串收口）', () => {
    const d = new Date(2023, 10, 14, 14, 2, 11)
    expect(forgeEventClock(d.getTime())).toBe('14:02')
    expect(forgeEventClockSeconds(d.getTime())).toBe('14:02:11')
    expect(forgeEventClock(Number.NaN)).toBe('')
  })
})

// ─────────────────── 1.2 循环进度卡聚合 ───────────────────

const at = (seq: number): number => 1_700_000_000_000 + seq * 60_000

function progress(seq: number, fields: Partial<ForgeProgressEntryData>): ForgeProgressEntryData {
  return { seq, sourceSlug: 'feat-x', status: 'running', verb: 'claim', at: at(seq), ...fields }
}

describe('isForgeProgressEntryData（progress 条目守卫）', () => {
  it('整形状 = true；必填位缺失/类型漂移 = false；可选位宽容', () => {
    expect(isForgeProgressEntryData(progress(1, {}))).toBe(true)
    expect(isForgeProgressEntryData(progress(1, { taskKey: 'feat-x/1.2', note: 'x' }))).toBe(true)
    expect(isForgeProgressEntryData({ ...progress(1, {}), sourceSlug: '' })).toBe(false)
    expect(isForgeProgressEntryData({ ...progress(1, {}), at: Number.NaN })).toBe(false)
    expect(isForgeProgressEntryData({ ...progress(1, {}), taskKey: 42 })).toBe(false)
    expect(isForgeProgressEntryData(null)).toBe(false)
  })
  it('组守卫：progress 可选位在 = 整组通过；progress 内畸形条目 = 整组拒绝', () => {
    expect(isForgeEventGroupData({ ...data, progress: [progress(1, {})] })).toBe(true)
    expect(isForgeEventGroupData({ ...data, progress: [{ seq: 'x' }] })).toBe(false)
  })
})

describe('forgeProgressRowItems（进度行聚合——后写覆盖 + 起止/耗时口径）', () => {
  it('每任务键最新态一行：后写覆盖 entry、startAt = 首事件、endAt = 最新时戳', () => {
    const rows = forgeProgressRowItems([
      progress(1, { taskKey: 'feat-x/1.2', taskTitle: '甲', status: 'running' }),
      progress(2, { taskKey: 'feat-x/1.3', taskTitle: '乙', status: 'running' }),
      progress(3, { taskKey: 'feat-x/1.2', taskTitle: '甲', status: 'completed', verb: 'settle' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ startAt: at(1), endAt: at(3), entry: { taskKey: 'feat-x/1.2', status: 'completed' } })
    expect(rows[1]).toMatchObject({ entry: { taskKey: 'feat-x/1.3' } })
  })
  it('循环级事件（无 taskKey）收敛单行最新态，居首；pool/pending 快照不进行轨', () => {
    const rows = forgeProgressRowItems([
      progress(1, { verb: 'startup', status: 'running', note: '从头执行' }),
      progress(2, { scenario: 'pool/pending' }),
      progress(3, { taskKey: 'feat-x/1.2', status: 'running' }),
      progress(4, { verb: 'finish-all', status: 'completed', note: '全部完成' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ entry: { verb: 'finish-all', status: 'completed' }, startAt: at(4), endAt: at(4) })
    expect(rows[1]).toMatchObject({ entry: { taskKey: 'feat-x/1.2' } })
  })
  it('零条目 = 空数组', () => {
    expect(forgeProgressRowItems([])).toEqual([])
  })
})

describe('进度状态词与族色（面板同语镜像）', () => {
  it('状态词：running/completed/blocked/interrupted', () => {
    expect(FORGE_PROGRESS_STATUS_WORD['running']).toBe('执行中')
    expect(FORGE_PROGRESS_STATUS_WORD['completed']).toBe('完成')
    expect(FORGE_PROGRESS_STATUS_WORD['blocked']).toBe('阻塞')
    expect(FORGE_PROGRESS_STATUS_WORD['interrupted']).toBe('已中断')
  })
  it('族色：执行中=run / 完成=done / 阻塞·中断=blk / 未知=run 兜底', () => {
    expect(forgeProgressStatusTone('running')).toBe('run')
    expect(forgeProgressStatusTone('completed')).toBe('done')
    expect(forgeProgressStatusTone('blocked')).toBe('blk')
    expect(forgeProgressStatusTone('interrupted')).toBe('blk')
    expect(forgeProgressStatusTone('other')).toBe('run')
  })
})
