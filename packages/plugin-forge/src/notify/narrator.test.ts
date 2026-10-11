// S4 · 叙述通道单测（run-tasks-host-command 1.3——AC3/AC4）：notice/followup 双通道
// 委派（#28 分流——常规 inject·notice 零模型回合 / 终局 followup 完整消息）、通道
// fail-soft（注入失败静默降级——异常不外抛不影响调用方，SC7「注入失败循环照常结束」）、
// 阻塞族发射的 reason 机械防线（全文只落盘，叙述仅摘要+子文件夹路径）。
import { describe, expect, it, vi } from 'vitest'
import { failSoftNarrationChannel } from './channel.js'
import type { NarrationChannel } from './channel.js'
import { createNarrator } from './narrator.js'
import type { NarratorDeps } from './narrator.js'
import type { IncidentStore } from './incident-log.js'

function recordingChannel(): NarrationChannel & { calls: { method: string; sessionId: string; text: string }[] } {
  const calls: { method: string; sessionId: string; text: string }[] = []
  return {
    calls,
    notice: vi.fn(async (sessionId: string, text: string) => {
      calls.push({ method: 'notice', sessionId, text })
    }),
    followup: vi.fn(async (sessionId: string, text: string) => {
      calls.push({ method: 'followup', sessionId, text })
    }),
  }
}

function brokenChannel(): NarrationChannel {
  return {
    notice: () => {
      throw new Error('session gone')
    },
    followup: () => Promise.reject(new Error('session gone')),
  }
}

describe('S4 · 双通道委派（decisions #28）', () => {
  it('notice 走 notice 通道、followup 走 followup 通道（sessionId+全文原样）', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel })
    await narrator.notice('session-1', '[forge·领取] 任务源: m2-pipeline\n下一步动作: 无')
    await narrator.followup('session-1', '[forge·结束] 任务源: m2-pipeline\n下一步动作: 无')
    expect(channel.calls).toEqual([
      { method: 'notice', sessionId: 'session-1', text: '[forge·领取] 任务源: m2-pipeline\n下一步动作: 无' },
      { method: 'followup', sessionId: 'session-1', text: '[forge·结束] 任务源: m2-pipeline\n下一步动作: 无' },
    ])
  })
})

describe('S4 · 通道 fail-soft（AC3——SC7 注入失败循环照常结束）', () => {
  it('通道同步抛出 = 静默降级不外抛', async () => {
    const narrator = createNarrator({ channel: brokenChannel() })
    await expect(narrator.notice('s', '文本')).resolves.toBeUndefined()
  })

  it('通道拒绝（rejected promise）= 静默降级不外抛', async () => {
    const narrator = createNarrator({ channel: brokenChannel() })
    await expect(narrator.followup('s', '文本')).resolves.toBeUndefined()
  })

  it('failSoftNarrationChannel 包装面同样不外抛（空 sessionId 零调用）', async () => {
    const channel = recordingChannel()
    const safe = failSoftNarrationChannel(channel)
    await expect(safe.followup('s', '文本')).resolves.toBeUndefined()
    await expect(safe.notice('', '文本')).resolves.toBeUndefined()
    expect(channel.calls).toEqual([{ method: 'followup', sessionId: 's', text: '文本' }])
  })
})

describe('S4 · 阻塞族发射机械防线（AC4——reason 全文只落盘）', () => {
  const REASON = 'pnpm 安装失败——完整原因全文\n依赖树冲突明细第二行\n处置历史重试两次'

  function incidentSpy(path: string | undefined): IncidentStore & { inputs: unknown[] } {
    const inputs: unknown[] = []
    return {
      inputs,
      record: vi.fn((input: Parameters<IncidentStore['record']>[0]) => {
        inputs.push(input)
        return path
      }),
    }
  }

  it('全文入落盘、叙述仅摘要+子文件夹路径、不含全文片段', async () => {
    const channel = recordingChannel()
    const incidents = incidentSpy('logs/m2-pipeline/3.2/001-blocked/')
    const narrator = createNarrator({ channel, incidents })
    await narrator.blocked(
      'session-1',
      'blocked-auto-fixed',
      { sourceSlug: 'm2-pipeline', taskLabel: '3.2 装配桩', fixId: 'fix-3', fixNote: '修构建脚本依赖版本' },
      { taskKey: '3.2', reason: REASON },
    )
    expect(incidents.inputs[0]).toMatchObject({ sourceSlug: 'm2-pipeline', taskKey: '3.2', eventType: 'blocked', error: REASON })
    const text = channel.calls[0]?.text ?? ''
    expect(channel.calls[0]?.method).toBe('notice')
    expect(text).toContain('详情: logs/m2-pipeline/3.2/001-blocked/')
    expect(text).toContain('pnpm 安装失败')
    expect(text).not.toContain('依赖树冲突明细第二行')
    expect(text).not.toContain(REASON)
  })

  it('落盘失败 = 详情行省略，叙述照发（fail-soft 全链）', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel, incidents: incidentSpy(undefined) })
    await narrator.blocked(
      'session-1',
      'blocked-with-fix',
      { sourceSlug: 'm2-pipeline', taskLabel: '3.1 概览水化', fixId: 'fix-2' },
      { taskKey: '3.1', reason: REASON },
    )
    expect(channel.calls[0]?.text).not.toContain('详情:')
    expect(channel.calls[0]?.text).toContain('已自动创建修复任务 fix-2')
  })

  it('事件仓缺席 = 详情行省略（narrator.recordIncident 返回 undefined）', async () => {
    const narrator = createNarrator({ channel: recordingChannel() })
    expect(narrator.recordIncident({ sourceSlug: 's', taskKey: '1', eventType: 'blocked', error: 'x' })).toBeUndefined()
  })
})

describe('S4 · 依赖类型形状（装配面冒烟）', () => {
  it('NarratorDeps 结构兼容最小通道桩', () => {
    const deps: NarratorDeps = { channel: recordingChannel() }
    expect(deps.incidents).toBeUndefined()
  })
})
