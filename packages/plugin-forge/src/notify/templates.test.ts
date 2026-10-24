// S4 · 十七场景模板逐字对齐单测（run-tasks-host-command 1.3——AC1 全文断言锚）：
// 期望文本 = notification-samples.md 样例块逐字节抄录（含全角括号/逗号、U+2014 破折号、
// U+00B7 间隔点、ASCII 引号）；入参 = 样例值。附带全场景不变式：骨架校验（AC2）、
// 「下一步动作:」封闭两值末行（AC2）、机制词黑名单零出现（AC5）、通道分流（#28——
// ①-⑫ notice / ⑬-⑰ followup）、落盘降级面（详情行随 incidentPath 缺席而省略）。
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

// ─────────────────────────── 逐字样例表（①-⑰） ───────────────────────────

const SAMPLES: readonly SampleCase[] = [
  {
    no: '①',
    id: 'startup-from-scratch',
    render: () => renderNarrative('startup-from-scratch', { sourceSlug: 'm2-pipeline', sourceKind: 'feature', pending: 6 }),
    expected: `[forge·启动] 任务源: m2-pipeline（feature）
状态: 从头执行 — 按依赖顺序逐个执行（待执行 6）
下一步动作: 无`,
  },
  {
    no: '②',
    id: 'startup-resume-stopped',
    render: () => renderNarrative('startup-resume-stopped', { sourceSlug: 'm2-pipeline', sourceKind: 'feature', taskKey: '2.6' }),
    expected: `[forge·启动] 任务源: m2-pipeline（feature）
状态: 接续执行 — 发现未完成任务 2.6（上次已停止），重新执行
下一步动作: 无`,
  },
  {
    no: '③',
    id: 'startup-resume-inflight',
    render: () => renderNarrative('startup-resume-inflight', { sourceSlug: 'm2-pipeline', sourceKind: 'feature', taskKey: '2.7' }),
    expected: `[forge·启动] 任务源: m2-pipeline（feature）
状态: 接续执行 — 任务 2.7 正在执行，等它完成后继续
下一步动作: 无`,
  },
  {
    no: '④',
    id: 'claim',
    render: () =>
      renderNarrative('claim', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '2.8 诊断弹窗装配（Apps web）',
      }),
    expected: `[forge·领取] 任务源: m2-pipeline
任务: 2.8 诊断弹窗装配（Apps web）
下一步动作: 无`,
  },
  {
    no: '⑤',
    id: 'claim-interrupted',
    render: () =>
      renderNarrative('claim-interrupted', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '2.5 会话装配（恢复自中断 — 进程重启前未完成）',
      }),
    expected: `[forge·领取] 任务源: m2-pipeline
任务: 2.5 会话装配（恢复自中断 — 进程重启前未完成）
下一步动作: 无`,
  },
  {
    no: '⑥',
    id: 'completed',
    render: () =>
      renderNarrative('completed', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '2.8 诊断弹窗装配',
        summary: '实现弹窗组件与抽屉接线，测试 12 通过',
      }),
    expected: `[forge·完成] 任务源: m2-pipeline
任务: 2.8 诊断弹窗装配 — 完成
摘要: 实现弹窗组件与抽屉接线，测试 12 通过
下一步动作: 无`,
  },
  {
    no: '⑦',
    id: 'blocked-with-fix',
    render: () =>
      renderNarrative('blocked-with-fix', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '3.1 概览水化',
        reasonSummary: '测试挂起，选中态未同步（原因摘要）',
        incidentPath: 'logs/m2-pipeline/3.1/001-blocked/',
        fixId: 'fix-2',
      }),
    expected: `[forge·阻塞] 任务源: m2-pipeline
任务: 3.1 概览水化 — 阻塞 — 测试挂起，选中态未同步（原因摘要）
详情: logs/m2-pipeline/3.1/001-blocked/
系统: 已自动创建修复任务 fix-2（完成后本任务自动恢复），继续执行
下一步动作: 无`,
  },
  {
    no: '⑧',
    id: 'blocked-auto-fixed',
    render: () =>
      renderNarrative('blocked-auto-fixed', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '3.2 装配桩',
        reasonSummary: 'pnpm 安装失败，编译环境缺失（原因摘要）',
        incidentPath: 'logs/m2-pipeline/3.2/001-blocked/',
        fixId: 'fix-3',
        fixNote: '修构建脚本依赖版本',
      }),
    expected: `[forge·自动处理] 任务源: m2-pipeline
任务: 3.2 装配桩 — 阻塞 — pnpm 安装失败，编译环境缺失（原因摘要）
详情: logs/m2-pipeline/3.2/001-blocked/
系统: 已自动分析原因并创建修复任务 fix-3（修构建脚本依赖版本），继续执行
下一步动作: 无`,
  },
  {
    no: '⑧b',
    id: 'blocked-split',
    render: () =>
      renderNarrative('blocked-split', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '3.3 分块迁移',
        reasonSummary: '剩余范围结构性独立（原因摘要）',
        incidentPath: 'logs/m2-pipeline/3.3/001-blocked/',
        successorId: 'disc-1',
        splitNote: '已完成 A/B，剩余 C/D',
      }),
    expected: `[forge·自动处理] 任务源: m2-pipeline
任务: 3.3 分块迁移 — 阻塞 — 剩余范围结构性独立（原因摘要）
详情: logs/m2-pipeline/3.3/001-blocked/
系统: 已创建继任任务 disc-1 承接剩余范围（本任务保持阻塞，不再重跑），继续执行——已完成 A/B，剩余 C/D
下一步动作: 无`,
  },
  {
    no: '⑨',
    id: 'blocked-wait-external',
    render: () =>
      renderNarrative('blocked-wait-external', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '4.1 API 接线',
        reasonSummary: '等待接口重构先落地（原因摘要）',
        incidentPath: 'logs/m2-pipeline/4.1/001-blocked/',
        externalSlug: 'feature-b',
      }),
    expected: `[forge·自动处理] 任务源: m2-pipeline
任务: 4.1 API 接线 — 阻塞 — 等待接口重构先落地（原因摘要）
详情: logs/m2-pipeline/4.1/001-blocked/
系统: 等待 feature-b 先完成，先执行其它任务
下一步动作: 无`,
  },
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
    expected: `[forge·自动处理] 任务源: m2-pipeline
任务: 4.2 导出功能 — 阻塞 — 验收标准与任务约束冲突（原因摘要）
详情: logs/m2-pipeline/4.2/001-blocked/
系统: 无法自动处理——已向你发起问询（附完整原因与处理历史）
下一步动作: 无`,
  },
  {
    no: '⑪',
    id: 'spawn-failed-retry',
    render: () =>
      renderNarrative('spawn-failed-retry', {
        sourceSlug: 'm2-pipeline',
        attempt: 2,
        errorSummary: '子会话创建被拒（错误摘要）',
        delaySeconds: 30,
        maxAttempts: 3,
      }),
    expected: `[forge·自动重试] 任务源: m2-pipeline
事件: 启动子代理失败（第 2 次）— 子会话创建被拒（错误摘要）
系统: 30 秒后自动重试（连续 3 次失败将停止）
下一步动作: 无`,
  },
  {
    no: '⑫',
    id: 'worker-aborted-retry',
    render: () =>
      renderNarrative('worker-aborted-retry', {
        sourceSlug: 'm2-pipeline',
        taskKey: '2.9',
        attempt: 1,
        maxAttempts: 3,
      }),
    expected: `[forge·自动重试] 任务源: m2-pipeline
事件: 子代理异常退出 — 任务 2.9
系统: 自动重新执行（第 1/3 次）
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
      }),
    expected: `[forge·自动重试] 任务源: m2-pipeline
事件: 启动子代理连续失败 3 次——已停止
系统: 已向你发起问询
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
      }),
    expected: `[forge·结束] 任务源: m2-pipeline — 结束（等待超时）
状态: 完成 4 · 阻塞 2 · 待处理 1
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
      }),
    expected: `[forge·结束] 任务源: m2-pipeline — 全部任务已完成
状态: 完成 8 · 阻塞 0
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
      }),
    expected: `[forge·停止] 任务源: m2-pipeline — 已按你的指令停止
状态: 完成 5 · 执行中任务 2.9 已标记为中断
下一步动作: 无`,
  },
]

// ─────────────────────────── AC1 · 全文逐字断言 ───────────────────────────

describe('S4 · 十七场景模板与 notification-samples.md 逐字对齐', () => {
  for (const sample of SAMPLES) {
    it(`${sample.no} ${String(sample.id)} 全文一致`, () => {
      expect(sample.render()).toBe(sample.expected)
    })
  }
})

// ─────────────────────────── AC2 · 骨架 + 封闭两值（全场景） ───────────────────────────

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

// ─────────────────────────── #28 · 通道分流表 ───────────────────────────

describe('S4 · 场景表与通道分流（decisions #28）', () => {
  it('场景表恰 18 场景', () => {
    expect(Object.keys(SCENARIOS)).toHaveLength(18)
  })

  it('常规进行事件 ①-⑫ 走 notice，终局事件 ⑬-⑰ 走 followup', () => {
    const noticeIds: readonly ScenarioId[] = [
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
      'blocked-ask-user',
      'spawn-failed-retry',
      'worker-aborted-retry',
    ]
    const followupIds: readonly ScenarioId[] = [
      'spawn-failed-halted',
      'blocked-pool',
      'finished-timeout',
      'finished-all',
      'stopped-by-command',
    ]
    expect(Object.keys(SCENARIOS)).toEqual([...noticeIds, ...followupIds])
    for (const id of noticeIds) expect(SCENARIOS[id].channel).toBe('notice')
    for (const id of followupIds) expect(SCENARIOS[id].channel).toBe('followup')
  })
})

// ─────────────────────────── AC4 · 详情行降级面 ───────────────────────────

describe('S4 · 阻塞族详情行随落盘降级', () => {
  it('incidentPath 缺席（落盘失败）= 详情行省略，骨架仍合法', () => {
    const text = renderNarrative('blocked-with-fix', {
      sourceSlug: 'm2-pipeline',
      taskLabel: '3.1 概览水化',
      reasonSummary: '测试挂起（原因摘要）',
      fixId: 'fix-2',
    })
    expect(text).not.toContain('详情:')
    expect(validateNarrative(text)).toEqual([])
  })

  it('叙述文本含子文件夹路径、不含 reason 全文（AC4）', () => {
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

// ─────────────────────────── 1.15 · 场景专用单行摘要（notice 折叠位——替代整段截断） ───────────────────────────

/** 摘要样例表（载荷与全文样例同源——断言事实短语 + 界界 + 零机制词） */
const HEADLINE_SAMPLES: readonly { readonly no: string; readonly id: ScenarioId; readonly payload: NarrativePayloadMap[ScenarioId]; readonly mustContain: readonly string[] }[] = [
  { no: '①', id: 'startup-from-scratch', payload: { sourceSlug: 'm2-pipeline', sourceKind: 'feature', pending: 6 }, mustContain: ['[forge·启动] m2-pipeline（feature）', '从头执行', '待执行 6'] },
  { no: '②', id: 'startup-resume-stopped', payload: { sourceSlug: 'm2-pipeline', sourceKind: 'feature', taskKey: '2.6' }, mustContain: ['[forge·启动]', '接续执行未完成 2.6'] },
  { no: '③', id: 'startup-resume-inflight', payload: { sourceSlug: 'm2-pipeline', sourceKind: 'feature', taskKey: '2.7' }, mustContain: ['[forge·启动]', '在飞任务 2.7'] },
  { no: '④', id: 'claim', payload: { sourceSlug: 'm2-pipeline', taskLabel: '2.8 诊断弹窗装配（Apps web）' }, mustContain: ['[forge·领取] 2.8 诊断弹窗装配（Apps web）'] },
  { no: '⑤', id: 'claim-interrupted', payload: { sourceSlug: 'm2-pipeline', taskLabel: '2.5 会话装配（恢复自中断 — 进程重启前未完成）' }, mustContain: ['[forge·领取]', '恢复自中断'] },
  { no: '⑥', id: 'completed', payload: { sourceSlug: 'm2-pipeline', taskLabel: '2.8 诊断弹窗装配', summary: '实现弹窗组件与抽屉接线，测试 12 通过' }, mustContain: ['[forge·完成] 2.8 诊断弹窗装配 — 完成', '测试 12 通过'] },
  { no: '⑦', id: 'blocked-with-fix', payload: { sourceSlug: 'm2-pipeline', taskLabel: '3.1 概览水化', reasonSummary: '测试挂起，选中态未同步（原因摘要）', incidentPath: 'logs/m2-pipeline/3.1/001-blocked/', fixId: 'fix-2' }, mustContain: ['[forge·阻塞] 3.1 概览水化 — 阻塞', '已创建修复任务 fix-2', '继续执行'] },
  { no: '⑧', id: 'blocked-auto-fixed', payload: { sourceSlug: 'm2-pipeline', taskLabel: '3.2 装配桩', reasonSummary: 'pnpm 安装失败（原因摘要）', fixId: 'fix-3', fixNote: '修构建脚本依赖版本' }, mustContain: ['[forge·自动处理]', '已创建修复任务 fix-3', '修构建脚本依赖版本'] },
  { no: '⑧b', id: 'blocked-split', payload: { sourceSlug: 'm2-pipeline', taskLabel: '3.3 分块迁移', reasonSummary: '剩余范围结构性独立（原因摘要）', successorId: 'disc-1', splitNote: '已完成 A/B，剩余 C/D' }, mustContain: ['[forge·自动处理] 3.3 分块迁移 — 阻塞', '已创建继任任务 disc-1 承接剩余范围', '已完成 A/B，剩余 C/D'] },
  { no: '⑨', id: 'blocked-wait-external', payload: { sourceSlug: 'm2-pipeline', taskLabel: '4.1 API 接线', reasonSummary: '等待接口重构先落地', externalSlug: 'feature-b' }, mustContain: ['[forge·自动处理]', '等待 feature-b 先完成'] },
  { no: '⑩', id: 'blocked-ask-user', payload: { sourceSlug: 'm2-pipeline', taskLabel: '4.2 导出功能', reasonSummary: '验收标准冲突' }, mustContain: ['[forge·自动处理]', '已发起问询'] },
  { no: '⑪', id: 'spawn-failed-retry', payload: { sourceSlug: 'm2-pipeline', attempt: 2, errorSummary: '子会话创建被拒', delaySeconds: 30, maxAttempts: 3 }, mustContain: ['[forge·自动重试]', '第 2 次', '30 秒后重试'] },
  { no: '⑫', id: 'worker-aborted-retry', payload: { sourceSlug: 'm2-pipeline', taskKey: '2.9', attempt: 1, maxAttempts: 3 }, mustContain: ['[forge·自动重试]', '任务 2.9 异常退出', '第 1/3 次'] },
  { no: '⑬', id: 'spawn-failed-halted', payload: { sourceSlug: 'm2-pipeline', attempts: 3, instruction: '环境排查后重新开始' }, mustContain: ['[forge·自动重试]', '连续失败 3 次 — 已停止', '已发起问询'] },
  { no: '⑭', id: 'blocked-pool', payload: { sourceSlug: 'm2-pipeline', blockedItems: [{ taskKey: '3.1', note: 'a' }, { taskKey: '4.1', note: 'b' }] }, mustContain: ['[forge·受阻]', '阻塞 2 项（3.1、4.1）'] },
  { no: '⑮', id: 'finished-timeout', payload: { sourceSlug: 'm2-pipeline', reason: '等待超时', completed: 4, blocked: 2, pending: 1, instruction: '稍后重试' }, mustContain: ['[forge·结束] m2-pipeline — 结束（等待超时）', '完成 4', '阻塞 2', '待处理 1'] },
  { no: '⑯', id: 'finished-all', payload: { sourceSlug: 'm2-pipeline', completed: 8, blocked: 0, instruction: '若想派发其它任务，执行 /run-dag-tasks' }, mustContain: ['[forge·结束] m2-pipeline — 全部任务已完成', '完成 8'] },
  { no: '⑰', id: 'stopped-by-command', payload: { sourceSlug: 'm2-pipeline', completed: 5, inFlightTaskKey: '2.9' }, mustContain: ['[forge·停止] m2-pipeline — 已按你的指令停止', '完成 5'] },
]

describe('1.15 · 十八场景专用单行摘要（折叠位丰富——替代整段前 120 字符截断）', () => {
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

  it('claim 面零计数（剩余行整体移除——阻塞计数必然缺席）', () => {
    const headline = renderHeadline('claim', {
      sourceSlug: 's',
      taskLabel: '1.1 t',
    })
    expect(headline).not.toContain('阻塞')
  })
})
