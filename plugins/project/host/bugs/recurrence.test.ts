// bugs 域 recurrence 面纯函数测试（plugin-project 1.11 归拢）：parseBugRef 弱引用格式校验
// （非法 → null 不抛）/ projectBug 投影降级（NULL 列键缺席）/ parseBugCoverageDeclaration
// 协议行解析 / parseTaskContainerSlug 退役兼容层。链算法（回溯/收齐/全边计数）经
// service.test.ts 端到端锁死，此处不重复。
import { describe, expect, it } from 'vitest'
import { parseBugCoverageDeclaration, parseBugRef, projectBug } from './recurrence.js'
import type { BugRow } from '../db/row-types.js'

function row(patch: Partial<BugRow> = {}): BugRow {
  return {
    id: '01234567-89ab-cdef-0123-456789abcdef',
    projectKey: 'key-1',
    summary: 's',
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    suspected: null,
    errorType: null,
    bugStatus: 'open',
    commitHash: null,
    worktree: null,
    branch: null,
    unresolvedReason: null,
    fixApproach: null,
    sourceTaskId: null,
    recurrenceOf: null,
    containerSlug: null,
    reportSessionId: null,
    fixSessionId: null,
    fixer: null,
    reporter: 'r',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

describe('parseBugRef：bug_id 弱引用格式校验（非法 → null 不抛）', () => {
  it('合法 uuid 形制返回 trim 后原值（大小写不敏感）', () => {
    expect(parseBugRef('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567-89ab-cdef-0123-456789abcdef')
    expect(parseBugRef('  01234567-89AB-CDEF-0123-456789ABCDEF  ')).toBe('01234567-89AB-CDEF-0123-456789ABCDEF')
  })
  it('非法/缺席 → null（不抛——弱引用降级配方，拒写决策归调用方）', () => {
    expect(parseBugRef(undefined)).toBeNull()
    expect(parseBugRef('')).toBeNull()
    expect(parseBugRef('   ')).toBeNull()
    expect(parseBugRef('no-such-bug')).toBeNull()
    expect(parseBugRef('01234567-89ab-cdef-0123-456789abcde')).toBeNull() // 少一位
    expect(parseBugRef('01234567-89ab-cdef-0123-456789abcdefg')).toBeNull() // 多一位
    expect(parseBugRef('01234567_89ab-cdef-0123-456789abcdef')).toBeNull() // 分隔符漂移
  })
})

describe('projectBug：BugRow → BugCard 投影降级（NULL 列键缺席）', () => {
  it('全 NULL 弱引用/证据列 → 全键缺席；非 NULL 列原样投影', () => {
    const card = projectBug(row())
    expect('suspected' in card).toBe(false)
    expect('errorType' in card).toBe(false)
    expect('sourceTaskId' in card).toBe(false) // 缺席留空 = 键缺席（tool 返回面 lossless JSON 合规）
    expect('containerSlug' in card).toBe(false)
    expect('recurrenceOf' in card).toBe(false)
    expect('commitHash' in card).toBe(false)
    expect('fixer' in card).toBe(false)
    expect(card.bugId).toBe('01234567-89ab-cdef-0123-456789abcdef')
    expect(card.bugStatus).toBe('open')
    expect(card.reporter).toBe('r')
  })
  it('在值列逐键投影（含 sourceTaskId/recurrenceOf）', () => {
    const card = projectBug(row({
      suspected: 'a.ts:1',
      errorType: 'api',
      sourceTaskId: 'task-1',
      recurrenceOf: '01234567-89ab-cdef-0123-456789abcdee',
      commitHash: 'b'.repeat(40),
      fixer: 'faner',
      bugStatus: 'fixed',
    }))
    expect(card.suspected).toBe('a.ts:1')
    expect(card.errorType).toBe('api')
    expect(card.sourceTaskId).toBe('task-1')
    expect(card.recurrenceOf).toBe('01234567-89ab-cdef-0123-456789abcdee')
    expect(card.commitHash).toBe('b'.repeat(40))
    expect(card.fixer).toBe('faner')
    expect(card.bugStatus).toBe('fixed')
  })
})

describe('parseBugCoverageDeclaration：T4 覆盖声明协议行解析', () => {
  it('两段齐备：coverage/anchor 行值 trim 后返回（首个命中行生效）', () => {
    expect(
      parseBugCoverageDeclaration('修法总结\ncoverage:  覆盖全链共同根因 \nanchor: docs/report.md\ncoverage: 第二个声明不覆盖'),
    ).toEqual({ declaration: '覆盖全链共同根因', anchor: 'docs/report.md' })
  })
  it('缺席/空值段 = 键缺席；大小写不敏感前缀', () => {
    expect(parseBugCoverageDeclaration(undefined)).toEqual({})
    expect(parseBugCoverageDeclaration('自由一段话')).toEqual({})
    expect(parseBugCoverageDeclaration('coverage:   ')).toEqual({}) // 值 trim 后空 = 不算在场
    expect(parseBugCoverageDeclaration('COVERAGE: 大写前缀命中')).toEqual({ declaration: '大写前缀命中' })
    expect(parseBugCoverageDeclaration('Anchor: x.md')).toEqual({ anchor: 'x.md' })
  })
})
