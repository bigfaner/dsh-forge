// 1.1 AC4 —— TaskType 20 值词汇 + 三域状态中英标签常量 pin（tech-design §Interface 9 §7-6 映射定稿
// + schema.sql 三态 CHECK + Cross-Layer Data Map「标签 contracts 常量（搜索中英共用）」）。
// 权威来源：tech-design §Interface 9 映射表（21 模板 − fix-record-missed = 20 值）与
// design/schema.sql（tasks 八态 / features 六态 / proposals 五态 CHECK 行序）。
// S3（run-tasks-host-command）：TaskStatus 七态 → 八态（+interrupted——proposal.md S3/SC3/R6）。
// fix-bug 增补：BugStatus 三态词汇 + 中文标签 pin（bugs.ck_bugs_status 行序）。
import { describe, expect, it } from 'vitest'
import {
  BUG_STATUSES,
  BUG_STATUS_LABELS,
  FEATURE_STATUSES,
  FEATURE_STATUS_LABELS,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  E2E_ATTRIBUTION_COLUMN,
  IMPLEMENTATION_TASK_TYPES,
  VALIDATION_TASK_TYPES,
  type BilingualLabel,
} from './labels.js'

describe('AC4 TaskType 20 值词汇（§7-6 映射定稿）', () => {
  it('TASK_TYPES = 20 值齐备、无重复（21 模板 − fix-record-missed）', () => {
    expect([...TASK_TYPES]).toEqual([
      'coding-feature',
      'coding-enhancement',
      'coding-cleanup',
      'coding-refactor',
      'code-quality-simplify',
      'coding-fix',
      'gate',
      'doc',
      'doc-consolidate',
      'doc-drift',
      'doc-review',
      'doc-summary',
      'test-run',
      'test-gen-contracts',
      'test-gen-journeys',
      'test-gen-scripts',
      'validation-code',
      'validation-ux',
      'eval-contract',
      'eval-journey',
    ])
    expect(TASK_TYPES).toHaveLength(20)
    expect(new Set(TASK_TYPES).size).toBe(20)
  })

  it('fix-record-missed 不入词汇（降级 run-tasks 内置静态文本）', () => {
    expect(TASK_TYPES).not.toContain('fix-record-missed')
  })

  it('词汇一律 kebab 值（§7-6 定稿；老 forge 点号内部标识不入库）', () => {
    for (const type of TASK_TYPES) {
      expect(type).toMatch(/^[a-z][a-z-]*$/)
    }
  })
})

describe('loop-phase-gate T11 验证类词表 pin（设计 §3——词表单点）', () => {
  it('VALIDATION_TASK_TYPES = 5 值齐备（实现收口后验证动作；test-gen-* 属实现族、gate 单列不入）', () => {
    expect([...VALIDATION_TASK_TYPES]).toEqual([
      'test-run',
      'validation-code',
      'validation-ux',
      'eval-contract',
      'eval-journey',
    ])
  })

  it('IMPLEMENTATION_TASK_TYPES = TASK_TYPES − V − gate 派生完备（V ∪ I ∪ {gate} = TASK_TYPES）', () => {
    const union = new Set([...VALIDATION_TASK_TYPES, ...IMPLEMENTATION_TASK_TYPES, 'gate'])
    expect(union.size).toBe(TASK_TYPES.length)
    for (const t of TASK_TYPES) expect(union.has(t)).toBe(true)
  })

  it('V 与 I 均 ⊆ TASK_TYPES（子集与派生同源——消费方不手抄字面清单）', () => {
    for (const v of VALIDATION_TASK_TYPES) expect(TASK_TYPES).toContain(v)
    for (const i of IMPLEMENTATION_TASK_TYPES) expect(TASK_TYPES).toContain(i)
  })

  it('I ∩ V = ∅ ∧ gate ∉ I（三集两两不交——GATE_SQL 换元洞闭合 pin：交集成员会在门判据换元下双向穿透）', () => {
    const iSet = new Set(IMPLEMENTATION_TASK_TYPES)
    for (const v of VALIDATION_TASK_TYPES) expect(iSet.has(v)).toBe(false)
    expect(iSet.has('gate')).toBe(false)
  })

  it('E2E_ATTRIBUTION_COLUMN 标记列常量在场（tasks.e2e_attribution——生成侧机械事实）', () => {
    expect(E2E_ATTRIBUTION_COLUMN).toBe('e2e_attribution')
  })
})

describe('AC4 三域状态词汇（schema.sql CHECK 行序）', () => {
  it('TASK_STATUSES 八态（tasks ck_tasks_status 行序；S3 +interrupted 非终态）', () => {
    expect([...TASK_STATUSES]).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'interrupted',
      'skipped',
      'rejected',
    ])
  })

  it('TASK_STATUS_LABELS.interrupted（S3——zh 已中断 / en Interrupted；非终态双语搜索面）', () => {
    expect(TASK_STATUS_LABELS.interrupted).toEqual({ zh: '已中断', en: 'Interrupted' })
  })

  it('FEATURE_STATUSES 六态（features ck_features_status 行序）', () => {
    expect([...FEATURE_STATUSES]).toEqual([
      'prd',
      'design',
      'tasks',
      'in-progress',
      'completed',
      'archived',
    ])
  })

  it('PROPOSAL_STATUSES 五态（proposals ck_proposals_status 行序）', () => {
    expect([...PROPOSAL_STATUSES]).toEqual([
      'draft',
      'under-review',
      'accepted',
      'rejected',
      'superseded',
    ])
  })

  it('BUG_STATUSES 三态（bugs ck_bugs_status 行序——open 登记 / fixed·unresolved 回填终态）', () => {
    expect([...BUG_STATUSES]).toEqual(['open', 'fixed', 'unresolved'])
  })

  it('BUG_STATUS_LABELS 三态中文标签（子 tab chips 用）', () => {
    expect(BUG_STATUS_LABELS.open).toEqual({ zh: '待修复', en: 'Open' })
    expect(BUG_STATUS_LABELS.fixed).toEqual({ zh: '已修复', en: 'Fixed' })
    expect(BUG_STATUS_LABELS.unresolved).toEqual({ zh: '无法复现', en: 'Unresolved' })
  })
})

describe('AC4 中英标签常量（exhaustive——搜索中英共用）', () => {
  it('四组标签键集 = 词汇全集（缺一不可）', () => {
    expect([...Object.keys(TASK_TYPE_LABELS).sort()]).toEqual([...TASK_TYPES].sort())
    expect([...Object.keys(TASK_STATUS_LABELS).sort()]).toEqual([...TASK_STATUSES].sort())
    expect([...Object.keys(FEATURE_STATUS_LABELS).sort()]).toEqual([...FEATURE_STATUSES].sort())
    expect([...Object.keys(PROPOSAL_STATUS_LABELS).sort()]).toEqual([...PROPOSAL_STATUSES].sort())
    expect([...Object.keys(BUG_STATUS_LABELS).sort()]).toEqual([...BUG_STATUSES].sort())
  })

  it('每标签 zh/en 均为非空字符串（双语搜索匹配面）', () => {
    const tables = [
      TASK_TYPE_LABELS,
      TASK_STATUS_LABELS,
      FEATURE_STATUS_LABELS,
      PROPOSAL_STATUS_LABELS,
      BUG_STATUS_LABELS,
    ] as const
    for (const table of tables) {
      for (const label of Object.values(table)) {
        const bilingual: BilingualLabel = label
        expect(bilingual.zh.trim().length).toBeGreaterThan(0)
        expect(bilingual.en.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
