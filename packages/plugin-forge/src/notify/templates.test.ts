// S4 · 结算/异常两径六场景模板单测（loop-message-consolidation §2.1 注入面裁剪后规格）：
// 场景表收敛为 ⑩⑬⑭⑮⑯⑰——循环级/任务级 notice 场景已退出消息面（零模板）。
// 期望文本逐字对齐（含全角括号/逗号、U+2014 破折号、U+00B7 间隔点、ASCII 引号）；附带
// 骨架不变式（validateNarrative）、通道表（六场景恒 followup）、任务概要段（结算径）、
// 异常最小充分信息集（⑬ taskLabel/errorText 补齐行）、落盘降级面（详情行省略）。
import { describe, expect, it } from 'vitest'
import { findMechanismWords, validateNarrative } from './skeleton.js'
import { HEADLINE_MAX_CHARS, SCENARIOS, renderHeadline, renderNarrative } from './templates.js'
import type { NarrativePayloadMap, ScenarioId } from './templates.js'

interface SampleCase {
  readonly no: string
  readonly id: ScenarioId
  readonly render: () => string
  readonly expected: string
}

// ─────────────────────────── 逐字样例表（⑩⑬⑭⑮⑯⑰） ───────────────────────────

const SAMPLES: readonly SampleCase[] = [
  {
    no: '⑩',
    id: 'blocked-ask-user',
    render: () =>
      renderNarrative('blocked-ask-user', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '4.2 导出功能',
        reasonSummary: '验收标准与任务约束冲突（原因摘要）',
        incidentPath: 'logs/m2-pipeline/4.2/001-blocked/',
      }),
    expected: `[forge·阻塞] 任务源: m2-pipeline
任务: 4.2 导出功能 — 阻塞 — 验收标准与任务约束冲突（原因摘要）
详情: logs/m2-pipeline/4.2/001-blocked/
系统: 无法自动处理——已向你发起问询（附完整原因与处理历史）
处置入口: 响应问询，或任意会话凭任务源 m2-pipeline 认领挂起循环继续处置
下一步动作: 无`,
  },
  {
    no: '⑬',
    id: 'spawn-failed-halted',
    render: () =>
      renderNarrative('spawn-failed-halted', {
        sourceSlug: 'm2-pipeline',
        attempts: 3,
        instruction: '环境排查后重新开始 /run-dag-tasks m2-pipeline',
        taskLabel: 'm2-pipeline/2.9（诊断弹窗装配）',
        errorText: '子会话创建被拒（错误原文）',
      }),
    expected: `[forge·自动重试] 任务源: m2-pipeline
任务: m2-pipeline/2.9（诊断弹窗装配）
事件: 启动子代理连续失败 3 次——已停止
阶段: 启动子代理
错误: 子会话创建被拒（错误原文）
系统: 已向你发起问询
处置入口: 重开 /run-dag-tasks m2-pipeline 循环（终局不自动复活）
下一步动作: 提示用户"环境排查后重新开始 /run-dag-tasks m2-pipeline"，并在问询中决定`,
  },
  {
    no: '⑭',
    id: 'blocked-pool',
    render: () =>
      renderNarrative('blocked-pool', {
        sourceSlug: 'm2-pipeline',
        blockedItems: [
          { taskKey: '3.1', note: '修复任务也阻塞' },
          { taskKey: '4.1', note: '等待 feature-b' },
        ],
      }),
    expected: `[forge·受阻] 任务源: m2-pipeline
事件: 没有可执行的任务，且有任务阻塞中
阻塞中: 3.1（修复任务也阻塞）· 4.1（等待 feature-b）
系统: 已向你发起问询（附阻塞清单与完整原因）
下一步动作: 无`,
  },
  {
    no: '⑮',
    id: 'finished-timeout',
    render: () =>
      renderNarrative('finished-timeout', {
        sourceSlug: 'm2-pipeline',
        reason: '等待超时',
        completed: 4,
        blocked: 2,
        pending: 1,
        instruction: '稍后重新执行 /run-dag-tasks m2-pipeline',
        taskSummaries: ['1.11 P1 修复 — 完成 · 18m', '4.2 导出功能 — 阻塞 · 等待 feature-b'],
      }),
    expected: `[forge·结束] 任务源: m2-pipeline — 结束（等待超时）
状态: 完成 4 · 阻塞 2 · 待处理 1
任务概要: 1.11 P1 修复 — 完成 · 18m
任务概要: 4.2 导出功能 — 阻塞 · 等待 feature-b
下一步动作: 提示用户"稍后重新执行 /run-dag-tasks m2-pipeline"`,
  },
  {
    no: '⑯',
    id: 'finished-all',
    render: () =>
      renderNarrative('finished-all', {
        sourceSlug: 'm2-pipeline',
        completed: 8,
        blocked: 0,
        instruction: '若想派发其它提案或feature的任务，执行 /run-dag-tasks',
        taskSummaries: ['2.8 诊断弹窗装配 — 完成 · 32m'],
      }),
    expected: `[forge·结束] 任务源: m2-pipeline — 全部任务已完成
状态: 完成 8 · 阻塞 0
任务概要: 2.8 诊断弹窗装配 — 完成 · 32m
下一步动作: 提示用户"若想派发其它提案或feature的任务，执行 /run-dag-tasks"`,
  },
  {
    no: '⑰',
    id: 'stopped-by-command',
    render: () =>
      renderNarrative('stopped-by-command', {
        sourceSlug: 'm2-pipeline',
        completed: 5,
        inFlightTaskKey: '2.9',
        taskSummaries: ['2.7 会话装配 — 完成 · 5m'],
      }),
    expected: `[forge·停止] 任务源: m2-pipeline — 已按你的指令停止
状态: 完成 5 · 执行中任务 2.9 已标记为中断
任务概要: 2.7 会话装配 — 完成 · 5m
下一步动作: 无`,
  },
]

// ─────────────────────────── AC · 全文逐字断言 ───────────────────────────

describe('S4 · 结算/异常两径六场景模板逐字对齐', () => {
  for (const sample of SAMPLES) {
    it(`${sample.no} ${String(sample.id)} 全文一致`, () => {
      expect(sample.render()).toBe(sample.expected)
    })
  }
})

// ─────────────────────────── 骨架 + 封闭两值（全场景） ───────────────────────────

describe('S4 · 每条叙述的统一骨架不变式', () => {
  for (const sample of SAMPLES) {
    it(`${sample.no} 骨架合法（key: val 单冒号·值内零冒号·机制词零出现）`, () => {
      expect(validateNarrative(sample.render())).toEqual([])
    })

    it(`${sample.no} 「下一步动作:」为末行且值取封闭两值`, () => {
      const last = sample.render().split('\n').at(-1) ?? ''
      expect(last).toMatch(/^下一步动作: (无|提示用户"[^"]*"(，并在问询中决定)?)$/)
    })
  }
})

// ─────────────────────────── 注入面裁剪 · 场景表收敛 ───────────────────────────

describe('loop-message-consolidation · 场景表收敛为结算/异常两径', () => {
  it('场景表恰 6 场景（⑩⑬⑭⑮⑯⑰）且恒 followup 唤醒径', () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(
      ['blocked-ask-user', 'blocked-pool', 'finished-all', 'finished-timeout', 'spawn-failed-halted', 'stopped-by-command'].sort(),
    )
    for (const id of Object.keys(SCENARIOS) as readonly ScenarioId[]) {
      expect(SCENARIOS[id].channel).toBe('followup')
    }
  })

  it('循环级/任务级 notice 场景零模板（启动①-③/领取④⑤/完成⑥/重试⑪⑫/自愈阻塞⑦⑧⑧b⑨）', () => {
    const retired = [
      'startup-from-scratch',
      'startup-resume-stopped',
      'startup-resume-inflight',
      'claim',
      'claim-interrupted',
      'completed',
      'blocked-with-fix',
      'blocked-auto-fixed',
      'blocked-split',
      'blocked-wait-external',
      'spawn-failed-retry',
      'worker-aborted-retry',
    ]
    for (const id of retired) expect(id in SCENARIOS).toBe(false)
  })
})

// ─────────────────────────── 结算径 · 任务概要段 ───────────────────────────

describe('loop-message-consolidation · 结算消息任务概要段', () => {
  it('taskSummaries 缺席 = 概要段整体省略（跨重启降级），骨架仍合法', () => {
    const text = renderNarrative('finished-all', {
      sourceSlug: 'm2-pipeline',
      completed: 1,
      blocked: 0,
      instruction: '若想派发其它任务，执行 /run-dag-tasks',
    })
    expect(text).not.toContain('任务概要')
    expect(validateNarrative(text)).toEqual([])
  })

  it('概要行逐任务一行（标题/终态/耗时），无耗时行降级省略耗时', () => {
    const text = renderNarrative('finished-timeout', {
      sourceSlug: 's',
      reason: '等待超时',
      completed: 2,
      blocked: 0,
      pending: 0,
      instruction: '稍后重试',
      taskSummaries: ['1.1 a — 完成 · 40s', '1.2 b — 完成'],
    })
    expect(text).toContain('任务概要: 1.1 a — 完成 · 40s')
    expect(text).toContain('任务概要: 1.2 b — 完成')
    expect(validateNarrative(text)).toEqual([])
  })
})

// ─────────────────────────── 异常径 · 最小充分信息集 ───────────────────────────

describe('loop-message-consolidation · ⑬ 异常消息信息集', () => {
  it('guard 入口粘住（无在飞/无错误原文）= 任务行与错误行省略，骨架仍合法', () => {
    const text = renderNarrative('spawn-failed-halted', {
      sourceSlug: 'm2-pipeline',
      attempts: 3,
      instruction: '环境排查后重新开始',
    })
    expect(text).not.toContain('\n任务: ')
    expect(text).not.toContain('错误: ')
    expect(text).toContain('阶段: 启动子代理')
    expect(validateNarrative(text)).toEqual([])
  })
})

// ─────────────────────────── 详情行降级面 ───────────────────────────

describe('S4 · 阻塞族详情行随落盘降级', () => {
  it('incidentPath 缺席（落盘失败）= 详情行省略，骨架仍合法', () => {
    const text = renderNarrative('blocked-ask-user', {
      sourceSlug: 'm2-pipeline',
      taskLabel: '4.2 导出功能',
      reasonSummary: '验收标准冲突（原因摘要）',
    })
    expect(text).not.toContain('详情:')
    expect(validateNarrative(text)).toEqual([])
  })

  it('叙述文本含子文件夹路径、不含 reason 全文', () => {
    const fullReason = '验收标准要求 A\n但 hard rule 禁止 A\n处置历史: 重试 2 次均失败'
    const text = renderNarrative('blocked-ask-user', {
      sourceSlug: 'm2-pipeline',
      taskLabel: '4.2 导出功能',
      reasonSummary: '验收标准与任务约束冲突（原因摘要）',
      incidentPath: 'logs/m2-pipeline/4.2/001-blocked/',
    })
    expect(text).toContain('logs/m2-pipeline/4.2/001-blocked/')
    expect(text).not.toContain(fullReason)
    expect(text).not.toContain('重试 2 次均失败')
  })
})

// ─────────────────────────── 场景专用单行摘要（折叠位） ───────────────────────────

/** 摘要样例表（载荷与全文样例同源——断言事实短语 + 界界 + 零机制词） */
const HEADLINE_SAMPLES: readonly { readonly no: string; readonly id: ScenarioId; readonly payload: NarrativePayloadMap[ScenarioId]; readonly mustContain: readonly string[] }[] = [
  { no: '⑩', id: 'blocked-ask-user', payload: { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能', reasonSummary: '验收标准冲突' }, mustContain: ['[forge·阻塞]', '4.2 导出功能 — 阻塞', '已发起问询'] },
  { no: '⑬', id: 'spawn-failed-halted', payload: { sourceSlug: 'm2-pipeline', attempts: 3, instruction: '环境排查后重新开始' }, mustContain: ['[forge·自动重试]', '连续失败 3 次 — 已停止', '已发起问询'] },
  { no: '⑭', id: 'blocked-pool', payload: { sourceSlug: 'm2-pipeline', blockedItems: [{ taskKey: '3.1', note: 'a' }, { taskKey: '4.1', note: 'b' }] }, mustContain: ['[forge·受阻]', '阻塞 2 项（3.1、4.1）'] },
  { no: '⑮', id: 'finished-timeout', payload: { sourceSlug: 'm2-pipeline', reason: '等待超时', completed: 4, blocked: 2, pending: 1, instruction: '稍后重试' }, mustContain: ['[forge·结束] m2-pipeline — 结束（等待超时）', '完成 4', '阻塞 2', '待处理 1'] },
  { no: '⑯', id: 'finished-all', payload: { sourceSlug: 'm2-pipeline', completed: 8, blocked: 0, instruction: '若想派发其它任务，执行 /run-dag-tasks' }, mustContain: ['[forge·结束] m2-pipeline — 全部任务已完成', '完成 8'] },
  { no: '⑰', id: 'stopped-by-command', payload: { sourceSlug: 'm2-pipeline', completed: 5, inFlightTaskKey: '2.9' }, mustContain: ['[forge·停止] m2-pipeline — 已按你的指令停止', '完成 5'] },
]

describe('场景专用单行摘要（折叠位丰富——替代整段前 120 字符截断）', () => {
  for (const sample of HEADLINE_SAMPLES) {
    it(`${sample.no} ${String(sample.id)} 摘要：单行·≤120·含事实短语·零机制词`, () => {
      const headline = renderHeadline(sample.id, sample.payload)
      expect(headline).not.toContain('\n')
      expect(headline.startsWith('[forge·')).toBe(true)
      expect(headline.length).toBeLessThanOrEqual(HEADLINE_MAX_CHARS)
      for (const fact of sample.mustContain) expect(headline).toContain(fact)
      expect(findMechanismWords(headline)).toEqual([])
      // 与整段截断不同源：单行摘要不含骨架 key: val 冒号行
      expect(headline).not.toMatch(/: /)
    })
  }

  it('超界保底：整行越界省略号截断（恰 ≤120）', () => {
    // blocked-pool 阻塞清单片段不钳制——30 项键名必然挤爆整行预算，触发整行截断保底
    const headline = renderHeadline('blocked-pool', {
      sourceSlug: 'm2-pipeline',
      blockedItems: Array.from({ length: 30 }, (_, i) => ({ taskKey: `9.${i}`, note: 'n' })),
    })
    expect(headline.length).toBeLessThanOrEqual(HEADLINE_MAX_CHARS)
    expect(headline.endsWith('…')).toBe(true)
  })
})
