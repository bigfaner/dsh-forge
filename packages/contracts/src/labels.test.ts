// 1.1 AC4 —— TaskType 20 值词汇 + 三域状态中英标签常量 pin（tech-design §Interface 9 §7-6 映射定稿
// + schema.sql 三态 CHECK + Cross-Layer Data Map「标签 contracts 常量（搜索中英共用）」）。
// 权威来源：tech-design §Interface 9 映射表（21 模板 − fix-record-missed = 20 值）与
// design/schema.sql（tasks 七态 / features 六态 / proposals 五态 CHECK 行序）。
import { describe, expect, it } from 'vitest'
import {
  FEATURE_STATUSES,
  FEATURE_STATUS_LABELS,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
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

describe('AC4 三域状态词汇（schema.sql CHECK 行序）', () => {
  it('TASK_STATUSES 七态（tasks ck_tasks_status 行序）', () => {
    expect([...TASK_STATUSES]).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'skipped',
      'rejected',
    ])
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
})

describe('AC4 中英标签常量（exhaustive——搜索中英共用）', () => {
  it('四组标签键集 = 词汇全集（缺一不可）', () => {
    expect([...Object.keys(TASK_TYPE_LABELS).sort()]).toEqual([...TASK_TYPES].sort())
    expect([...Object.keys(TASK_STATUS_LABELS).sort()]).toEqual([...TASK_STATUSES].sort())
    expect([...Object.keys(FEATURE_STATUS_LABELS).sort()]).toEqual([...FEATURE_STATUSES].sort())
    expect([...Object.keys(PROPOSAL_STATUS_LABELS).sort()]).toEqual([...PROPOSAL_STATUSES].sort())
  })

  it('每标签 zh/en 均为非空字符串（双语搜索匹配面）', () => {
    const tables = [
      TASK_TYPE_LABELS,
      TASK_STATUS_LABELS,
      FEATURE_STATUS_LABELS,
      PROPOSAL_STATUS_LABELS,
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
