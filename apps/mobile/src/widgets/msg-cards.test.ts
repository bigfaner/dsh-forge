import { describe, expect, it } from 'vitest'
import type { Projection } from '../core/wire.ts'
import {
  COLLAPSE_LINE_THRESHOLD,
  collapseMaxHeight,
  degradedNarrativeSeqs,
  docFileName,
  estimateLineCount,
  formatSize,
  isShellTool,
  loopKindOf,
  loopBadge,
  pairToolActivity,
  shouldCollapseMessage,
  type ToolActivity,
} from './msg-cards.ts'

const call = (callId: string, seq: number): Projection => ({
  kind: 'tool-call',
  seq,
  callId,
  name: 'pwsh',
  arguments: 'vitest run',
})

const result = (callId: string, seq: number, isError = false): Projection => ({
  kind: 'tool-result',
  seq,
  callId,
  isError,
  text: 'ok',
})

describe('A 档工具卡配对（data.message.toolCallId）', () => {
  it('无结果 = running；有结果 = done；isError = error', () => {
    const activities = pairToolActivity([call('a', 1), result('a', 2), call('b', 3), result('b', 4, true)])
    expect(activities.map((activity: ToolActivity) => activity.state)).toEqual(['done', 'error'])
  })

  it('终态缺失 = running（成对纪律：可收起 running 卡，不悬挂错误）', () => {
    expect(pairToolActivity([call('a', 1)])[0]?.state).toBe('running')
  })

  it('乱序（result 先到）不影响配对', () => {
    const activities = pairToolActivity([result('a', 2), call('a', 1)])
    expect(activities[0]?.result?.text).toBe('ok')
  })
})

describe('shell 判别（终端块 vs ioCard 双段）', () => {
  it('shell 族 = 终端风格块', () => {
    for (const name of ['shell', 'pwsh', 'bash', 'PowerShell']) expect(isShellTool(name)).toBe(true)
  })
  it('非 shell（subagent/job/read 等）= ioCard 分段卡', () => {
    expect(isShellTool('subagent.start')).toBe(false)
    expect(isShellTool('read')).toBe(false)
  })
})

describe('折叠空间纪律', () => {
  it('>~8 行才折叠；8 行内不折叠', () => {
    const eightLines = Array.from({ length: COLLAPSE_LINE_THRESHOLD }, () => '行').join('\n')
    expect(shouldCollapseMessage(eightLines)).toBe(false)
    expect(shouldCollapseMessage(`${eightLines}\n又一行`)).toBe(true)
  })

  it('长行按 44 列折行计入行数', () => {
    expect(estimateLineCount('x'.repeat(88))).toBe(2)
  })

  it('预览高 = 排版行高整数倍（≥96px，不拦腰截断）', () => {
    expect(collapseMaxHeight(22)).toBe(110)
    expect(collapseMaxHeight(22) % 22).toBe(0)
    expect(collapseMaxHeight(22)).toBeGreaterThanOrEqual(96)
  })
})

describe('loop 卡 kind 色条（dispatch 蓝/followup 浅蓝/state 灰/done 绿）', () => {
  it('verb 定 kind；done 状态优先', () => {
    expect(loopKindOf('dispatch', 'running')).toBe('dispatch')
    expect(loopKindOf('followup', 'running')).toBe('followup')
    expect(loopKindOf('unknown-verb', 'running')).toBe('state')
    expect(loopKindOf('dispatch', 'completed')).toBe('done')
  })

  it('R10-F3 verb 全集（loop/driver.ts emitProgress 值集）：claim/claim-resume/settle/stop', () => {
    expect(loopKindOf('claim', 'running')).toBe('dispatch')
    expect(loopKindOf('claim-resume', 'running')).toBe('followup')
    expect(loopKindOf('settle', 'blocked')).toBe('state')
    expect(loopKindOf('stop', 'interrupted')).toBe('state')
    expect(loopKindOf('settle', 'completed')).toBe('done')
    expect(loopKindOf('claim', 'completed')).toBe('done')
  })

  it('状态徽标同任务面板色板', () => {
    expect(loopBadge('running')).toEqual({ text: '运行中', tone: 'run' })
    expect(loopBadge('blocked')).toEqual({ text: '阻塞', tone: 'blocked' })
    expect(loopBadge('done')).toEqual({ text: '已完成', tone: 'done' })
    expect(loopBadge('paused')).toEqual({ text: '已暂停', tone: 'paused' })
  })
})

describe('循环叙述 runId 聚合（1.19——纯函数面）', () => {
  const narrative = (seq: number, runId: string): Projection => ({
    kind: 'loop-narrative',
    seq,
    text: `循环叙述 ${seq}`,
    runId,
    state: 'followup',
  })

  it('同 runId 仅最新（seq 最大）保持卡，其余退化', () => {
    const degraded = degradedNarrativeSeqs([narrative(1, 'r1'), narrative(2, 'r1'), narrative(3, 'r2')])
    expect(degraded.has(1)).toBe(true)
    expect(degraded.has(2)).toBe(false)
    expect(degraded.has(3)).toBe(false)
  })

  it('不同 runId 互不影响；无叙述投影 = 空集', () => {
    expect(degradedNarrativeSeqs([narrative(1, 'a'), narrative(2, 'b')]).size).toBe(0)
    expect(degradedNarrativeSeqs([{ kind: 'user-bubble', seq: 1, text: 'hi' }]).size).toBe(0)
  })
})

describe('文档卡五类识别与 size 刻度（屏⑨——纯函数面，DOM 对齐证据走 Playwright）', () => {
  it('文件名 = 路径末段（反斜杠归一）', () => {
    expect(docFileName('Z:\\ws\\docs\\a.md')).toBe('a.md')
    expect(docFileName('docs/b.csv')).toBe('b.csv')
  })

  it('size 人类可读（B / KB 一位小数 / MB——mockup 屏⑨ 刻度）', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(6349)).toBe('6.2 KB')
    expect(formatSize(18432)).toBe('18 KB')
    expect(formatSize(2 * 1024 * 1024 + 512 * 1024)).toBe('2.5 MB')
  })
})
