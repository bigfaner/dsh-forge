// S4 · 叙述通道单测（run-tasks-host-command 1.3——AC3/AC4）：notice/followup 双通道
// 委派（#28 分流——常规 inject·notice 零模型回合 / 终局 followup 完整消息）、通道
// fail-soft（注入失败静默降级——异常不外抛不影响调用方，SC7「注入失败循环照常结束」）、
// 阻塞族发射的 reason 机械防线（全文只落盘，叙述仅摘要+子文件夹路径）。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failSoftNarrationChannel } from './channel.js'
import type { NarrationChannel } from './channel.js'
import { createNarrator } from './narrator.js'
import type { NarratorDeps } from './narrator.js'
import { createIncidentStore } from './incident-log.js'
import type { IncidentStore } from './incident-log.js'

let home: string | undefined

afterEach(() => {
  if (home !== undefined) {
    rmSync(home, { recursive: true, force: true })
    home = undefined
  }
})

function recordingChannel(): NarrationChannel & { calls: { method: string; sessionId: string; text: string; headline?: string; loop?: unknown }[] } {
  const calls: { method: string; sessionId: string; text: string; headline?: string; loop?: unknown }[] = []
  return {
    calls,
    notice: vi.fn(async (sessionId: string, text: string, headline?: string) => {
      calls.push({ method: 'notice', sessionId, text, ...(headline !== undefined ? { headline } : {}) })
    }),
    followup: vi.fn(async (sessionId: string, text: string, loop?: unknown) => {
      calls.push({ method: 'followup', sessionId, text, ...(loop !== undefined ? { loop } : {}) })
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
  it('notice 走 notice 通道、followup 走 followup 通道（sessionId + 全文 + 时间行收尾）', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel })
    await narrator.notice('session-1', '[forge·领取] 任务源: m2-pipeline\n下一步动作: 无')
    await narrator.followup('session-1', '[forge·结束] 任务源: m2-pipeline\n下一步动作: 无')
    expect(channel.calls).toHaveLength(2)
    // 2026-10-12「时间使用 LocalDateTime」——两通道统一时间行收尾（本地时区完整日期时间）
    expect(channel.calls[0]?.method).toBe('notice')
    expect(channel.calls[0]?.sessionId).toBe('session-1')
    expect(channel.calls[0]?.text).toMatch(/^\[forge·领取\] 任务源: m2-pipeline\n下一步动作: 无\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(channel.calls[1]?.method).toBe('followup')
    expect(channel.calls[1]?.sessionId).toBe('session-1')
    expect(channel.calls[1]?.text).toMatch(/^\[forge·结束\] 任务源: m2-pipeline\n下一步动作: 无\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
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
      { projectId: 'p-1', taskKey: '3.2', reason: REASON },
    )
    expect(incidents.inputs[0]).toMatchObject({
      projectId: 'p-1',
      sourceSlug: 'm2-pipeline',
      taskKey: '3.2',
      eventType: 'blocked',
      error: REASON,
    })
    const text = channel.calls[0]?.text ?? ''
    expect(channel.calls[0]?.method).toBe('notice')
    expect(text).toContain('详情: logs/m2-pipeline/3.2/001-blocked/')
    expect(text).toContain('pnpm 安装失败')
    expect(text).not.toContain('依赖树冲突明细第二行')
    expect(text).not.toContain(REASON)
    // 1.15 折叠摘要接线：blocked 径把场景单行摘要传给通道（headline 位——非整段截断）
    expect(channel.calls[0]?.headline).toBe('[forge·自动处理] 3.2 装配桩 — 阻塞 · 已创建修复任务 fix-3 · 修构建脚本依赖版本')
  })

  it('⑩ blocked-ask-user（终局）走 followup 唤醒主 agent；⑦-⑨ 中段场景保持 notice', async () => {
    const channel = recordingChannel()
    const incidents = incidentSpy('logs/m2-pipeline/4.2/001-blocked/')
    const narrator = createNarrator({ channel, incidents })
    await narrator.blocked(
      'session-1',
      'blocked-ask-user',
      { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能' },
      { taskKey: '4.2', reason: REASON },
    )
    // 终局阻塞 = 完整消息新回合（阻塞上下文进会话触发主 agent 分析——裁决仍走问询 UI）
    expect(channel.calls[0]?.method).toBe('followup')
    expect(channel.calls[0]?.sessionId).toBe('session-1')
    expect(channel.calls[0]?.text).toContain('无法自动处理——已向你发起问询')
    expect(channel.calls[0]?.text).toContain('详情: logs/m2-pipeline/4.2/001-blocked/')
    expect(channel.calls[0]?.text).not.toContain(REASON)
    expect(channel.calls[0]?.text).toMatch(/\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // 1.18 AD-4 循环哨兵：⑩ 终局 followup 携带循环叙述上下文（task=任务键、state=场景 id）
    expect(channel.calls[0]?.loop).toEqual({ task: '4.2', state: 'blocked-ask-user' })
    // 中段场景（wait-external）不受影响：notice 零模型注入保持
    await narrator.blocked(
      'session-1',
      'blocked-wait-external',
      { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能', externalSlug: 'feat-y' },
      { taskKey: '4.2', reason: REASON },
    )
    expect(channel.calls[1]?.method).toBe('notice')
  })

  it('notice 直发径：headline 可选透传至通道（缺席 = 不带 headline——回退截断由 faces 兜底）', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel })
    await narrator.notice('s-1', '全文', '[forge·领取] 2.8 — 待执行 3')
    await narrator.notice('s-2', '全文')
    expect(channel.calls[0]?.headline).toBe('[forge·领取] 2.8 — 待执行 3')
    expect(channel.calls[1]).not.toHaveProperty('headline')
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

describe('S4 · 解析缝端到端（1.11 装配接线收口——真实事件仓 + projectId 解析器）', () => {
  it('projectId→容器目录解析命中：blocked 叙述带详情行且事件子文件夹真实生成', async () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-narrator-'))
    const channel = recordingChannel()
    // 装配缝同形：projectId → 容器目录（真仓 = faces.createProjectContainerDirs 的产物位）
    const narrator = createNarrator({
      channel,
      incidents: createIncidentStore({ resolveContainerDir: (projectId) => (projectId === 'p-1' ? home : undefined) }),
    })
    await narrator.blocked(
      'session-1',
      'blocked-ask-user',
      { sourceSlug: 'feat-x', taskLabel: '2.5 Implement the thing' },
      { projectId: 'p-1', taskKey: '2.5', reason: 'tests hang on flaky selector', settlement: { outcome: 'blocked' } },
    )
    const text = channel.calls[0]?.text ?? ''
    expect(text).toContain('详情: logs/feat-x/2.5/001-blocked/')
    const dir = join(home!, 'logs', 'feat-x', '2.5', '001-blocked')
    expect(existsSync(dir)).toBe(true)
    // 解析未命中（未注册项目）= 详情行省略，叙述照发（fail-soft 保持）
    await narrator.blocked(
      'session-2',
      'blocked-ask-user',
      { sourceSlug: 'feat-x', taskLabel: '2.6 next' },
      { projectId: 'p-unknown', taskKey: '2.6', reason: 'another reason' },
    )
    expect(channel.calls[1]?.text).not.toContain('详情:')
  })
})

describe('S4 · 依赖类型形状（装配面冒烟）', () => {
  it('NarratorDeps 结构兼容最小通道桩', () => {
    const deps: NarratorDeps = { channel: recordingChannel() }
    expect(deps.incidents).toBeUndefined()
  })
})
