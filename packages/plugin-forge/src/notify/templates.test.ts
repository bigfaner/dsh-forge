// S4 · 十七场景模板逐字对齐单测（run-tasks-host-command 1.3——AC1 全文断言锚）：
// 期望文本 = notification-samples.md 样例块逐字节抄录（含全角括号/逗号、U+2014 破折号、
// U+00B7 间隔点、ASCII 引号）；入参 = 样例值。附带全场景不变式：骨架校验（AC2）、
// 「下一步动作:」封闭两值末行（AC2）、机制词黑名单零出现（AC5）、通道分流（#28——
// ①-⑫ notice / ⑬-⑰ followup）、落盘降级面（详情行随 incidentPath 缺席而省略）。
import { describe, expect, it } from 'vitest'
import { validateNarrative } from './skeleton.js'
import { SCENARIOS, renderNarrative } from './templates.js'
import type { ScenarioId } from './templates.js'

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
        remaining: { pending: 3, inProgress: 1, blocked: 0 },
      }),
    expected: `[forge·领取] 任务源: m2-pipeline
任务: 2.8 诊断弹窗装配（Apps web）
剩余: 待执行 3 · 执行中 1 · 阻塞 0
下一步动作: 无`,
  },
  {
    no: '⑤',
    id: 'claim-interrupted',
    render: () =>
      renderNarrative('claim-interrupted', {
        sourceSlug: 'm2-pipeline',
        taskLabel: '2.5 会话装配（恢复自中断 — 进程重启前未完成）',
        remaining: { pending: 2, interrupted: 1, blocked: 0 },
      }),
    expected: `[forge·领取] 任务源: m2-pipeline
任务: 2.5 会话装配（恢复自中断 — 进程重启前未完成）
剩余: 待执行 2 · 中断 1 · 阻塞 0
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
        instruction: '继续执行 /run-dag-tasks m2-pipeline',
      }),
    expected: `[forge·停止] 任务源: m2-pipeline — 已按你的指令停止
状态: 完成 5 · 执行中任务 2.9 已标记为中断
下一步动作: 提示用户"继续执行 /run-dag-tasks m2-pipeline"`,
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
  it('场景表恰 17 场景', () => {
    expect(Object.keys(SCENARIOS)).toHaveLength(17)
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
