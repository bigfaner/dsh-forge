// 任务 2.1 测试 —— 相位推导机（AC3：任务状态分布 → feature 相位快照，§6-29 统一规则）+
// 相位不变量断言（AC4：写事务内增量——受影响 feature 漂移防护）+ 相位侧词汇 exhaustive 对齐
// （AC5）。权威来源：db-schema §6-28「登记即推进」/ §6-29「task-driven 补全」/ §5-9 派生不变量
// + tech-design §Interface 1「相位重算」/ §Interface 2「单调只进」。
import {
  DOC_KINDS,
  FEATURE_STATUSES,
  TASK_STATUSES,
  type DocKind,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_TASK_STATUSES,
  DOC_KIND_PHASE,
  FEATURE_STATUS_ORDER,
  TERMINAL_TASK_STATUSES,
  assertPhaseInvariant,
  deriveFeaturePhase,
  deriveTaskPhase,
  docPhaseMax,
  isPhaseInvariantViolationError,
  PhaseInvariantViolationError,
} from './phase-deriver.js'

// ── AC3 相位推导机：status = archived ∨ combine(docPhaseMax, taskDerived) ──

describe('AC3 deriveFeaturePhase · archived = 唯一不可推导态（人类收纳——推导机不覆盖）', () => {
  it('archived 原样保持（任意文档/任务分布均不动）', () => {
    expect(deriveFeaturePhase({ current: 'archived', docKinds: [], taskStatuses: [] })).toBe('archived')
    expect(deriveFeaturePhase({ current: 'archived', docKinds: ['tech-design'], taskStatuses: [] })).toBe('archived')
    expect(deriveFeaturePhase({ current: 'archived', docKinds: [], taskStatuses: ['pending'] })).toBe('archived')
    expect(
      deriveFeaturePhase({ current: 'archived', docKinds: ['prd-spec'], taskStatuses: ['completed', 'skipped'] }),
    ).toBe('archived')
  })
})

describe('AC3 deriveFeaturePhase · 有任务时 taskDerived 覆盖（无视 docPhase——§6-29 combine 精确定义）', () => {
  it('存在 in_progress / blocked / suspended 其一 → in-progress（两段式第一段）', () => {
    for (const active of ACTIVE_TASK_STATUSES) {
      expect(deriveFeaturePhase({ current: 'design', docKinds: ['tech-design'], taskStatuses: [active] })).toBe(
        'in-progress',
      )
      expect(
        deriveFeaturePhase({ current: 'tasks', docKinds: ['prd-spec'], taskStatuses: ['completed', active, 'pending'] }),
      ).toBe('in-progress')
    }
  })

  it('终态 + pending 混合（无活跃态）→ tasks（两段式第二段）', () => {
    expect(deriveFeaturePhase({ current: 'design', docKinds: ['tech-design'], taskStatuses: ['pending'] })).toBe('tasks')
    expect(
      deriveFeaturePhase({ current: 'in-progress', docKinds: [], taskStatuses: ['completed', 'pending', 'skipped'] }),
    ).toBe('tasks')
  })

  it('全部 ∈ 终态 {completed, skipped, rejected} → completed', () => {
    expect(deriveFeaturePhase({ current: 'tasks', docKinds: [], taskStatuses: ['completed'] })).toBe('completed')
    expect(deriveFeaturePhase({ current: 'in-progress', docKinds: ['prd-spec'], taskStatuses: ['completed', 'skipped'] })).toBe('completed')
    expect(deriveFeaturePhase({ current: 'tasks', docKinds: ['tech-design'], taskStatuses: ['rejected', 'completed', 'skipped'] })).toBe('completed')
  })

  it('回退边合法：completed feature 追加任务 → tasks（快照诚实——朴素单调在任务侧不成立）', () => {
    expect(deriveFeaturePhase({ current: 'completed', docKinds: ['tech-design'], taskStatuses: ['pending'] })).toBe('tasks')
  })

  it('docPhase 被任务面覆盖（docs=design 而任务待处理 → tasks 非 design）', () => {
    expect(deriveFeaturePhase({ current: 'prd', docKinds: ['tech-design'], taskStatuses: ['pending'] })).toBe('tasks')
  })
})

describe('AC3 deriveFeaturePhase · 无任务分支 = max(线性序当前, docPhaseMax)（单调只进——§6-28）', () => {
  it('docPhaseMax 推进：prd + design 族文档 → design', () => {
    expect(deriveFeaturePhase({ current: 'prd', docKinds: ['tech-design'], taskStatuses: [] })).toBe('design')
    expect(deriveFeaturePhase({ current: 'prd', docKinds: ['prd-spec', 'er-diagram'], taskStatuses: [] })).toBe('design')
  })

  it('单调只进：后补低阶段文档不回退（design + prd-spec → design）', () => {
    expect(deriveFeaturePhase({ current: 'design', docKinds: ['prd-spec'], taskStatuses: [] })).toBe('design')
    expect(deriveFeaturePhase({ current: 'design', docKinds: [], taskStatuses: [] })).toBe('design')
  })

  it('human 前推保持（无任务时 max 式不动较前的存储值）', () => {
    expect(deriveFeaturePhase({ current: 'completed', docKinds: ['prd-spec'], taskStatuses: [] })).toBe('completed')
    expect(deriveFeaturePhase({ current: 'tasks', docKinds: ['tech-design'], taskStatuses: [] })).toBe('tasks')
  })

  it('docPhaseMax：无已登记文档 → null / 多文档取线性序最大 / 七类映射正确', () => {
    expect(docPhaseMax([])).toBe(null)
    expect(docPhaseMax(['prd-spec'])).toBe('prd')
    expect(docPhaseMax(['user-stories', 'ui-functions'])).toBe('prd')
    expect(docPhaseMax(['prd-spec', 'tech-design'])).toBe('design')
    expect(docPhaseMax(['sql-schema', 'page-map', 'er-diagram', 'tech-design'])).toBe('design')
  })

  it('deriveTaskPhase：无任务 → null（combine 交还 docPhaseMax 分支）', () => {
    expect(deriveTaskPhase([])).toBe(null)
  })
})

// ── AC4 相位不变量断言（写事务内增量——受影响 feature 漂移防护，§5-9/§6-29） ──

describe('AC4 assertPhaseInvariant · 不动点判据（stored ≡ derive(current=stored, docs, tasks)）', () => {
  it('一致快照恒绿（写动词事务内重算后的常态）', () => {
    expect(() =>
      assertPhaseInvariant({ featureStatus: 'archived', docKinds: ['tech-design'], taskStatuses: ['pending'] }),
    ).not.toThrow()
    expect(() => assertPhaseInvariant({ featureStatus: 'tasks', docKinds: ['tech-design'], taskStatuses: ['pending', 'completed'] })).not.toThrow()
    expect(() => assertPhaseInvariant({ featureStatus: 'in-progress', docKinds: [], taskStatuses: ['blocked'] })).not.toThrow()
    expect(() =>
      assertPhaseInvariant({ featureStatus: 'completed', docKinds: [], taskStatuses: ['completed', 'skipped', 'rejected'] }),
    ).not.toThrow()
    expect(() => assertPhaseInvariant({ featureStatus: 'design', docKinds: ['tech-design'], taskStatuses: [] })).not.toThrow()
    expect(() => assertPhaseInvariant({ featureStatus: 'prd', docKinds: [], taskStatuses: [] })).not.toThrow()
  })

  it('archived 恒豁免（唯一不可推导态——永不红）', () => {
    for (const docs of [[], ['prd-spec'], ['tech-design']] as const) {
      for (const tasks of [[], ['pending'], ['in_progress']] as const) {
        expect(() => assertPhaseInvariant({ featureStatus: 'archived', docKinds: [...docs], taskStatuses: [...tasks] })).not.toThrow()
      }
    }
  })

  it('漂移即红：存储相位 ≠ 任务分布推导值 → PhaseInvariantViolationError', () => {
    // completed 快照 + 待处理任务（如 addTask 后相位漏重算）
    expect(() => assertPhaseInvariant({ featureStatus: 'completed', docKinds: [], taskStatuses: ['pending'] })).toThrowError(
      PhaseInvariantViolationError,
    )
    // 任务全终态但快照停在 tasks（如 submit 后漏重算）
    expect(() => assertPhaseInvariant({ featureStatus: 'tasks', docKinds: [], taskStatuses: ['completed'] })).toThrowError(
      PhaseInvariantViolationError,
    )
    // 存在活跃任务但快照停在 design
    expect(() => assertPhaseInvariant({ featureStatus: 'design', docKinds: ['tech-design'], taskStatuses: ['in_progress'] })).toThrowError(
      PhaseInvariantViolationError,
    )
  })

  it('漂移即红：无任务分支回退/落后于 docPhaseMax（如 upsertFeatureDoc 后漏推进）', () => {
    expect(() => assertPhaseInvariant({ featureStatus: 'prd', docKinds: ['tech-design'], taskStatuses: [] })).toThrowError(
      PhaseInvariantViolationError,
    )
  })

  it('typed 形状：expected/actual 字段 + 诊断信息含 feature 定位与输入分布', () => {
    let thrown: unknown
    try {
      assertPhaseInvariant({ featureSlug: 'dsh-forge-m2-pipeline', featureStatus: 'completed', docKinds: [], taskStatuses: ['pending'] })
    } catch (e) {
      thrown = e
    }
    expect(isPhaseInvariantViolationError(thrown)).toBe(true)
    const err = thrown as PhaseInvariantViolationError
    expect(err.expected).toBe('tasks')
    expect(err.actual).toBe('completed')
    expect(err.message).toContain('dsh-forge-m2-pipeline')
    expect(err.message).toContain('tasks')
    expect(err.message).toContain('pending')
    expect(isPhaseInvariantViolationError(new Error('x'))).toBe(false)
  })

  it('推导机幂等（不动点存在性）：derive ∘ derive = derive（全状态 × 代表分布枚举）', () => {
    const docSets: readonly (readonly DocKind[])[] = [[], ['prd-spec'], ['tech-design'], ['prd-spec', 'page-map']]
    const taskSets: readonly (readonly TaskStatus[])[] = [
      [],
      ['pending'],
      ['in_progress'],
      ['blocked'],
      ['suspended'],
      ['completed'],
      ['pending', 'completed'],
      ['completed', 'skipped', 'rejected'],
      ['rejected', 'pending'],
    ]
    for (const current of FEATURE_STATUSES) {
      for (const docKinds of docSets) {
        for (const taskStatuses of taskSets) {
          const once = deriveFeaturePhase({ current, docKinds, taskStatuses })
          const twice = deriveFeaturePhase({ current: once, docKinds, taskStatuses })
          expect(twice, `${current} + docs[${docKinds}] + tasks[${taskStatuses}]`).toBe(once)
          // 重算结果即合法不动点：断言面恒绿
          expect(() => assertPhaseInvariant({ featureStatus: once, docKinds, taskStatuses })).not.toThrow()
        }
      }
    }
  })
})

// ── AC5 相位侧词汇 exhaustive 对齐（Record 编译期穷尽的运行期对照） ──

describe('AC5 相位侧词汇 exhaustive 对齐（相位机面 ↔ contracts 词汇）', () => {
  it('DOC_KIND_PHASE 键集 ≡ DOC_KINDS 七类全映射（Record<DocKind,…> 编译期穷尽证物）', () => {
    expect([...Object.keys(DOC_KIND_PHASE).sort()]).toEqual([...DOC_KINDS].sort())
    expect(Object.values(DOC_KIND_PHASE).every((p) => p === 'prd' || p === 'design')).toBe(true)
  })

  it('FEATURE_STATUS_ORDER：order[FEATURE_STATUSES[i]] === i（线性序与词汇行序同源）且 0..5 无重复', () => {
    FEATURE_STATUSES.forEach((s, i) => expect(FEATURE_STATUS_ORDER[s]).toBe(i))
    expect(Object.values(FEATURE_STATUS_ORDER).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
    expect([...Object.keys(FEATURE_STATUS_ORDER).sort()]).toEqual([...FEATURE_STATUSES].sort())
  })

  it('任务终态/活跃判定集：均 ⊆ 七态、互斥、并与 pending 恰为全集（两段式判据完备）', () => {
    const terminal: readonly TaskStatus[] = [...TERMINAL_TASK_STATUSES]
    const active: readonly TaskStatus[] = [...ACTIVE_TASK_STATUSES]
    for (const s of [...terminal, ...active]) expect(TASK_STATUSES).toContain(s)
    expect(terminal.filter((s) => active.includes(s))).toEqual([])
    expect([...new Set([...terminal, ...active, 'pending'])].sort()).toEqual([...TASK_STATUSES].sort())
  })
})
