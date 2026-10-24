// loop-event-delivery 1.9 · 折叠条目组数据守卫单测（forge-event-data.ts——他形不猜不抛）。
import { describe, expect, it } from 'vitest'
import {
  forgeEventBadgeTone,
  forgeEventClock,
  forgeEventClockSeconds,
  isForgeEventGroupData,
  type ForgeEventGroupData,
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
