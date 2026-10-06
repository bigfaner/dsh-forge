// detail-model 单测 —— TaskDetail → 抽屉投影纯函数（AC1 kv chips / AC4 目标·结果与改动范围 /
// AC6 实际耗时格式）。数据形状 = contracts TaskDetail（2.6 core taskDetail 水化口径）。
import { describe, expect, it } from 'vitest'
import type { TaskDetail, TaskDocRef, TaskRecordEntry, TaskType } from '@dsh-forge/contracts'
import {
  actualScopeOf,
  formatActualDuration,
  gateSummary,
  isTerminalStatus,
  latestSubmitGateOf,
  scopeDiff,
  taskGoalOf,
  taskKeyLabel,
  taskKvChips,
  taskResultOf,
  varsList,
  varsText,
} from './detail-model.js'

/** 夹具覆写面（taskType 放宽 string——未注册类型的 generic 回退测试面；refs/records 收 readonly） */
export type DetailFixtureOverrides = Partial<Omit<TaskDetail, 'taskType' | 'refs' | 'records'>> & {
  taskType?: string
  refs?: readonly TaskDocRef[]
  records?: readonly TaskRecordEntry[]
}

/** 基准 TaskDetail 夹具（coding-feature · completed——全承重字段在场） */
export function detailFixture(overrides: DetailFixtureOverrides = {}): TaskDetail {
  const { taskType, refs, records, ...rest } = overrides
  return {
    taskId: 't-1',
    slug: 'm2-pipeline',
    localId: '2.4',
    featureId: 'f-1',
    title: 'plugin-forge tool 半身对接',
    taskType: 'coding-feature',
    taskStatus: 'completed',
    priority: 'P0',
    estimatedTime: '4h',
    actualDurationMs: 151 * 60_000,
    prerequisites: [
      { slug: 'm2-pipeline', localId: '2.3', taskStatus: 'completed' },
    ],
    sessionCount: 2,
    sourceTask: undefined,
    taskDesc: undefined,
    vars: undefined,
    coverage: 0.8,
    complexity: 'high',
    surfaceKey: undefined,
    surfaceType: undefined,
    blockedReason: undefined,
    mainSession: false,
    breaking: false,
    createdAt: '2026-10-01T09:14:00.000Z',
    updatedAt: '2026-10-04T12:00:00.000Z',
    records: [],
    waitingOnMe: [],
    sessions: [],
    actualFiles: [],
    allowedTransitions: [],
    refs: [],
    ...(taskType !== undefined ? { taskType: taskType as TaskType } : {}),
    ...(refs !== undefined ? { refs: [...refs] } : {}),
    ...(records !== undefined ? { records: [...records] } : {}),
    ...rest,
  }
}

function record(verb: TaskRecordEntry['verb'], extra: Partial<TaskRecordEntry> = {}): TaskRecordEntry {
  return { verb, actor: 'plugin-tool', createdAt: '2026-10-02T10:00:00.000Z', ...extra }
}

describe('taskKeyLabel / formatActualDuration（AC1 通用区）', () => {
  it('任务键呈现 = slug/localId（自然键）', () => {
    expect(taskKeyLabel('m2-pipeline', '2.4')).toBe('m2-pipeline/2.4')
    expect(taskKeyLabel('m2-pipeline', 'fix-1')).toBe('m2-pipeline/fix-1')
  })

  it('实际耗时格式：Xm / XhYm / XdXh；缺省或 ≤0 → undefined（不显示）', () => {
    expect(formatActualDuration(45 * 60_000)).toBe('45m')
    expect(formatActualDuration(60 * 60_000)).toBe('1h')
    expect(formatActualDuration(151 * 60_000)).toBe('2h31m')
    expect(formatActualDuration(26 * 60 * 60_000)).toBe('1d2h')
    expect(formatActualDuration(48 * 60 * 60_000)).toBe('2d')
    expect(formatActualDuration(undefined)).toBeUndefined()
    expect(formatActualDuration(0)).toBeUndefined()
    expect(formatActualDuration(-5_000)).toBeUndefined()
  })
})

describe('taskKvChips（AC1 标签行：类别只显类型 + 条件 chips）', () => {
  it('全字段在场：类别/优先级/预估耗时/实际耗时[completed]/复杂度中文/影响', () => {
    const chips = taskKvChips(
      detailFixture({ priority: 'P1', complexity: 'medium', breaking: true }),
    )
    expect(chips.map((c) => c.kind)).toEqual([
      'category',
      'priority',
      'estimated',
      'actualDuration',
      'complexity',
      'breaking',
    ])
    expect(chips[0]).toEqual({ kind: 'category', value: 'coding-feature' }) // 只显类型，不中英混搭
    expect(chips[3]).toEqual({ kind: 'actualDuration', value: '2h31m' })
    expect(chips[4]).toEqual({ kind: 'complexity', value: '中' })
  })

  it('缺省字段逐项省略：优先级/预估/复杂度缺省不造行', () => {
    const chips = taskKvChips(
      detailFixture({
        priority: undefined,
        estimatedTime: undefined,
        complexity: undefined,
        breaking: false,
      }),
    )
    expect(chips.map((c) => c.kind)).toEqual(['category', 'actualDuration'])
  })

  it('实际耗时仅 completed 展示（v15）——非 completed 一律不显', () => {
    const inProgress = taskKvChips(detailFixture({ taskStatus: 'in_progress', actualDurationMs: 99 * 60_000 }))
    expect(inProgress.map((c) => c.kind)).not.toContain('actualDuration')
    const completedNoDuration = taskKvChips(detailFixture({ actualDurationMs: undefined }))
    expect(completedNoDuration.map((c) => c.kind)).not.toContain('actualDuration')
  })
})

describe('taskGoalOf / taskResultOf（AC4 目标·结果上下展示的数据面）', () => {
  it('目标取值序：vars.goal → vars.scenario → taskDesc → title', () => {
    expect(taskGoalOf(detailFixture({ title: 'T', taskDesc: 'D' }))).toBe('D')
    expect(taskGoalOf(detailFixture({ title: 'T', vars: { scenario: 'S' } }))).toBe('S')
    expect(taskGoalOf(detailFixture({ title: 'T', vars: { goal: 'G', scenario: 'S' } }))).toBe('G')
    expect(taskGoalOf(detailFixture({ title: 'T' }))).toBe('T')
  })

  it('结果——已提交：✓ 语义 + 执行摘要 + commit（最近 submit/transition 记录综合）', () => {
    const detail = detailFixture({
      records: [
        record('add'),
        record('claim', { digest: 'd3f92a71' }),
        record('submit', { summary: 'gate 全过', commitHash: 'a1b2c3d4' }),
      ],
    })
    expect(taskResultOf(detail)).toEqual({
      kind: 'submitted',
      summary: 'gate 全过',
      commitHash: 'a1b2c3d4',
    })
  })

  it('结果——评估型（vars.score 自由文本承载）：得分/严重度/主会话标记', () => {
    const detail = detailFixture({
      taskType: 'eval-contract',
      taskStatus: 'rejected',
      mainSession: true,
      vars: { score: '45', severity: 'high' },
    })
    expect(taskResultOf(detail)).toEqual({
      kind: 'eval',
      score: '45',
      severity: 'high',
      mainSession: true,
    })
  })

  it('结果——阻塞：⚠ 阻塞原因', () => {
    const detail = detailFixture({
      taskStatus: 'blocked',
      blockedReason: '依赖 fix-1 未完成',
      records: [record('add')],
    })
    expect(taskResultOf(detail)).toEqual({ kind: 'blocked', reason: '依赖 fix-1 未完成' })
  })

  it('结果——执行中：最近记录语；pending：未开始；其余状态：中文标签兜底', () => {
    const running = detailFixture({
      taskStatus: 'in_progress',
      records: [record('add'), record('claim', { digest: 'abc' })],
    })
    expect(taskResultOf(running)).toEqual({ kind: 'running', text: '已领取' })
    expect(taskResultOf(detailFixture({ taskStatus: 'pending' }))).toEqual({ kind: 'pending' })
    const suspended = detailFixture({ taskStatus: 'suspended', records: [record('transition', { reason: '等定案' })] })
    expect(taskResultOf(suspended)).toEqual({ kind: 'note', text: '等定案' })
  })

  it('终态判据（验收 checklist 全勾口径）：completed | skipped', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('skipped')).toBe(true)
    expect(isTerminalStatus('rejected')).toBe(false)
    expect(isTerminalStatus('in_progress')).toBe(false)
  })
})

describe('vars 负载解析（vars_json 具体化——模板字段源）', () => {
  it('varsText：直取字符串', () => {
    expect(varsText({ goal: 'G' }, 'goal')).toBe('G')
    expect(varsText({}, 'goal')).toBeUndefined()
    expect(varsText({ goal: '' }, 'goal')).toBeUndefined() // 空串归一缺省
  })

  it('varsList：JSON 数组串与换行列表两形态等价', () => {
    expect(varsList({ scope: '["a.ts","b.ts"]' }, 'scope')).toEqual(['a.ts', 'b.ts'])
    expect(varsList({ scope: 'a.ts\nb.ts' }, 'scope')).toEqual(['a.ts', 'b.ts'])
    expect(varsList({ scope: 'a.ts' }, 'scope')).toEqual(['a.ts'])
    expect(varsList({}, 'scope')).toEqual([])
    expect(varsList({ scope: '[]' }, 'scope')).toEqual([]) // 空数组归一空列表
  })
})

describe('改动范围投影（AC4：预期声明 ↔ 实际 + 差异摘要）', () => {
  it('实际 = actualFiles + 提交来源 hashes；预期集命中判据供徽标', () => {
    const detail = detailFixture({
      actualFiles: ['a.ts', 'b.ts', 'c.ts'],
      records: [record('submit', { commitHash: 'a1b2c3d4' }), record('submit', { commitHash: '8c2f1e0a' })],
    })
    const scope = actualScopeOf(detail)
    expect(scope).toEqual({
      kind: 'files',
      files: ['a.ts', 'b.ts', 'c.ts'],
      commitHashes: ['a1b2c3d4', '8c2f1e0a'],
    })
  })

  it('无提交回退记录语（AC4）：暂无提交 + 状态 + 最近记录语；零记录 pending = 未开始', () => {
    const pending = actualScopeOf(detailFixture({ taskStatus: 'pending', records: [] }))
    expect(pending).toEqual({ kind: 'fallback', text: '暂无提交 · 未开始' })
    const blocked = actualScopeOf(
      detailFixture({
        taskStatus: 'blocked',
        blockedReason: 'x',
        records: [record('add'), record('auto-block', { reason: '源置 blocked' })],
      }),
    )
    expect(blocked).toEqual({ kind: 'fallback', text: '暂无提交 · 已阻塞 · 源置 blocked' })
  })

  it('差异摘要计数：预期/实际/预期内/计划外/未涉及', () => {
    expect(scopeDiff(['a.ts', 'b.ts', 'd.ts'], ['a.ts', 'b.ts', 'c.ts'])).toEqual({
      expected: 3,
      actual: 3,
      hit: 2,
      extra: 1,
      miss: 1,
    })
    expect(scopeDiff([], ['x.ts'])).toEqual({ expected: 0, actual: 1, hit: 0, extra: 1, miss: 0 })
  })
})

describe('gate 载荷投影（现状条 质量门 M/N 与 gate checklist 同源）', () => {
  it('latestSubmitGateOf：最近带 gate 的 submit 记录（跳过无 gate 者）', () => {
    const gate = { compile: true, fmt: true, lint: false, test: true, coverage: 0.61 }
    const records = [
      record('submit', { gate: { compile: true, fmt: true, lint: true, test: true } }),
      record('submit', { gate }),
      record('submit'), // 无 gate 的较新记录不遮挡（取最近「带 gate」者）
    ] satisfies TaskRecordEntry[]
    expect(latestSubmitGateOf(records)).toBe(gate)
  })

  it('gateSummary：四项布尔计数 M/N（compile/fmt/lint/test）', () => {
    expect(gateSummary({ compile: true, fmt: true, lint: true, test: true })).toEqual({ passed: 4, total: 4 })
    expect(gateSummary({ compile: true, fmt: false, lint: false, test: true })).toEqual({ passed: 2, total: 4 })
  })
})
