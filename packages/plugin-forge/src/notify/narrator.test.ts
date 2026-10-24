// S4 · 叙述面单测（run-tasks-host-command 1.3 + loop-event-delivery 接口收窄）：narrator
// notice/followup/settle 三发射径收敛到 channel.send 单出口（wakeup 路由——事件径 false
// 写入不唤醒 / 唤醒径与结算单点 true）、通道 fail-soft（注入失败静默降级——异常不外抛不
// 影响调用方，SC7「注入失败循环照常结束」）、阻塞族发射的 reason 机械防线（全文只落盘，
// 叙述仅摘要+子文件夹路径）。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failSoftNarrationChannel } from './channel.js'
import type { NarrationChannel, NarrationSendOptions } from './channel.js'
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

type RecordedCall = {
  method: 'notice' | 'followup' | 'settle'
  sessionId: string
  text: string
  wakeup?: boolean
  headline?: string
  loop?: unknown
}

/** send 录制通道（wakeup 路由换算单点——form settle → settle / wakeup → followup / 其余 notice） */
function methodOf(options?: NarrationSendOptions): RecordedCall['method'] {
  if (options?.form === 'settle') return 'settle'
  return options?.wakeup === true ? 'followup' : 'notice'
}

function recordingChannel(): NarrationChannel & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  return {
    calls,
    send: vi.fn(async (sessionId: string, text: string, options?: NarrationSendOptions) => {
      calls.push({
        method: methodOf(options),
        sessionId,
        text,
        ...(options?.wakeup === true ? { wakeup: true } : {}),
        ...(options?.headline !== undefined ? { headline: options.headline } : {}),
        ...(options?.loop !== undefined ? { loop: options.loop } : {}),
      })
    }),
  }
}

function brokenChannel(mode: 'throw' | 'reject'): NarrationChannel {
  return {
    send: () =>
      mode === 'throw' ? (() => { throw new Error('session gone') })() : Promise.reject(new Error('session gone')),
  }
}

describe('S4 · send 单出口委派（loop-event-delivery 接口收窄）', () => {
  it('事件径 notice → send(wakeup=false)、唤醒径 followup → send(wakeup=true)（sessionId + 全文 + 时间行收尾）', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel })
    await narrator.notice('session-1', '[forge·领取] 任务源: m2-pipeline\n下一步动作: 无')
    await narrator.followup('session-1', '[forge·结束] 任务源: m2-pipeline\n下一步动作: 无')
    expect(channel.calls).toHaveLength(2)
    // 2026-10-12「时间使用 LocalDateTime」——两径统一时间行收尾（本地时区完整日期时间）
    expect(channel.calls[0]?.method).toBe('notice')
    expect(channel.calls[0]?.sessionId).toBe('session-1')
    expect(channel.calls[0]?.wakeup).toBeUndefined() // 写入不唤醒（send(nextStep, false)）
    expect(channel.calls[0]?.text).toMatch(/^\[forge·领取\] 任务源: m2-pipeline\n下一步动作: 无\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(channel.calls[1]?.method).toBe('followup')
    expect(channel.calls[1]?.wakeup).toBe(true) // 唤醒径（send(nextStep, true)）
    expect(channel.calls[1]?.sessionId).toBe('session-1')
    expect(channel.calls[1]?.text).toMatch(/^\[forge·结束\] 任务源: m2-pipeline\n下一步动作: 无\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('结算单点 settle → send(form settle, wakeup=true)——真终局一次唤醒', async () => {
    const channel = recordingChannel()
    const narrator = createNarrator({ channel })
    await narrator.settle('session-1', '[forge·结束] 任务源: m2-pipeline — 全部任务已完成')
    expect(channel.calls).toEqual([
      { method: 'settle', sessionId: 'session-1', text: expect.stringMatching(/\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), wakeup: true },
    ])
    expect(channel.calls[0]?.wakeup).toBe(true)
  })
})

describe('S4 · 通道 fail-soft（AC3——SC7 注入失败循环照常结束）', () => {
  it('通道同步抛出 = 静默降级不外抛', async () => {
    const narrator = createNarrator({ channel: brokenChannel('throw') })
    await expect(narrator.notice('s', '文本')).resolves.toBeUndefined()
  })

  it('通道拒绝（rejected promise）= 静默降级不外抛', async () => {
    const narrator = createNarrator({ channel: brokenChannel('reject') })
    await expect(narrator.followup('s', '文本')).resolves.toBeUndefined()
  })

  it('failSoftNarrationChannel 包装面同样不外抛（空 sessionId 零调用）', async () => {
    const channel = recordingChannel()
    const safe = failSoftNarrationChannel(channel)
    await expect(safe.send('s', '文本', { form: 'followup', wakeup: true })).resolves.toBeUndefined()
    await expect(safe.send('', '文本')).resolves.toBeUndefined()
    expect(channel.calls).toEqual([
      { method: 'followup', sessionId: 's', text: '文本', wakeup: true },
    ])
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
    const call = channel.calls[0]
    const text = call?.text ?? ''
    expect(call?.method).toBe('notice')
    expect(text).toContain('详情: logs/m2-pipeline/3.2/001-blocked/')
    expect(text).toContain('pnpm 安装失败')
    expect(text).not.toContain('依赖树冲突明细第二行')
    expect(text).not.toContain(REASON)
    // 1.15 折叠摘要接线：blocked 径把场景单行摘要传给通道（headline 位——非整段截断）
    expect(call?.headline).toBe('[forge·自动处理] 3.2 装配桩 — 阻塞 · 已创建修复任务 fix-3 · 修构建脚本依赖版本')
  })

  it('wakeup 路由单源 = SCENARIOS 表：⑩ blocked-ask-user（followup 列）send(wakeup=true) 唤醒主 agent；⑦-⑨ 中段场景 wakeup=false', async () => {
    const channel = recordingChannel()
    const incidents = incidentSpy('logs/m2-pipeline/4.2/001-blocked/')
    const narrator = createNarrator({ channel, incidents })
    await narrator.blocked(
      'session-1',
      'blocked-ask-user',
      { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能' },
      { taskKey: '4.2', reason: REASON },
    )
    // 唤醒径 = send(nextStep, true)（阻塞上下文进会话触发主 agent 分析——裁决仍走问询 UI）
    const call = channel.calls[0]
    expect(call?.method).toBe('followup')
    expect(call?.sessionId).toBe('session-1')
    expect(call?.text).toContain('无法自动处理——已向你发起问询')
    expect(call?.text).toContain('详情: logs/m2-pipeline/4.2/001-blocked/')
    expect(call?.text).not.toContain(REASON)
    expect(call?.text).toMatch(/\n时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // 1.18 AD-4 循环哨兵：⑩ 唤醒径携带循环叙述上下文（task=任务键、state=场景 id）
    expect(call?.loop).toEqual({ task: '4.2', state: 'blocked-ask-user' })
    // 中段场景（wait-external）不受影响：send(nextStep, false) 写入不唤醒保持
    await narrator.blocked(
      'session-1',
      'blocked-wait-external',
      { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能', externalSlug: 'feat-y' },
      { taskKey: '4.2', reason: REASON },
    )
    expect(channel.calls[1]?.method).toBe('notice')
    expect(channel.calls[1]?.wakeup).toBeUndefined()
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
