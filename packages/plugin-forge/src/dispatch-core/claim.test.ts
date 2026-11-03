// T3 同缝拦截守卫单测（loop-recurrence-hardening——claim.ts 两态 + 判据口径）：
// AC2（同缝阈值拦截：≥2 拒绝 / <2 放行）+ AC8（「待建模」派生态现算——零持久标记，
// 报告在场即放行）。face 缺席/异常 = fail-soft 放行（先例 stampEvidenceValidity）。
import { describe, expect, it } from 'vitest'
import type { BugRecurrenceCandidate, TaskSnapshot } from '@dsh-forge/contracts'
import {
  ERR_RECURRENCE_ESCALATION_REQUIRED,
  RECURRENCE_ESCALATION_THRESHOLD,
  isBlindFixDispatch,
  isModelingPending,
  recurrenceCountOf,
  recurrenceEscalationGuard,
  rejectionFailureOf,
  sameSeamCountOf,
} from './claim.js'

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: 'fix-2',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Fix: the thing',
    taskType: 'coding-fix',
    taskStatus: 'in_progress',
    sourceTaskId: 't-0', // fix 链派生（盲试 fix 判别的第二条件）
    breaking: false,
    complexity: 'medium',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }
}

const candidate = (chain: string[]): BugRecurrenceCandidate => ({ bugId: chain[chain.length - 1] as string, summary: 's', chain })

describe('T3 同缝计数口径（台账约定：recurrence count = chain length - 1）', () => {
  it('链根单条 = 0；根 + 一次复发 = 1；三次 = 2', () => {
    expect(recurrenceCountOf(['b-root'])).toBe(0)
    expect(recurrenceCountOf(['b-root', 'b-r1'])).toBe(1)
    expect(recurrenceCountOf(['b-root', 'b-r1', 'b-r2'])).toBe(2)
  })
  it('候选集取最大家族链；空集 = 0；activeCount（core 域活态祖先径）在场优先于链长回退', () => {
    expect(sameSeamCountOf([candidate(['a', 'b']), candidate(['x', 'y', 'z'])])).toBe(2)
    expect(sameSeamCountOf([])).toBe(0)
    expect(sameSeamCountOf([{ bugId: 'b', summary: 's', chain: ['a', 'b', 'c'], activeCount: 1 }])).toBe(1)
  })
  it('阈值 = 2（提案 T3：同缝 ≥ 2 拒绝盲试 fix 派发）', () => {
    expect(RECURRENCE_ESCALATION_THRESHOLD).toBe(2)
  })
})

describe('盲试 fix 派发判别 + 「待建模」派生态现算', () => {
  it('coding-fix ∧ fix 链派生 = 盲试；非 fix 类型 / 非派生 = 否', () => {
    expect(isBlindFixDispatch(snapshot())).toBe(true)
    expect(isBlindFixDispatch(snapshot({ taskType: 'coding-feature' }))).toBe(false)
    expect(isBlindFixDispatch(snapshot({ sourceTaskId: undefined }))).toBe(false)
  })
  it('「待建模」= count≥2 ∧ 报告不在场——纯派生态，零持久标记', () => {
    expect(isModelingPending(2, false)).toBe(true)
    expect(isModelingPending(3, true)).toBe(false) // 报告落卷 → 放行
    expect(isModelingPending(1, false)).toBe(false)
  })
})

describe('T3 守卫（recurrenceEscalationGuard）两态', () => {
  it('count ≥ 2 ∧ 报告不在场 → 软拒绝（错误码 + 升级提示 + 对偶守卫互指 + 解除指引）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [candidate(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeDefined()
    expect(rejection!.failure.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
    expect(rejection!.count).toBe(2)
    expect(rejection!.chain).toEqual(['b-root', 'b-r1', 'b-r2'])
    expect(rejection!.failure.message).toContain('同缝拦截')
    expect(rejection!.failure.message).toContain('升级')
    const text = JSON.stringify(rejection!.failure)
    expect(text).toContain('升级排查建模')
    expect(text).toContain('.forge/docs/proposals/<slug>/issues/<localId>/')
    expect(text).toContain('重新 claim')
  })
  it('报告在场（卷宗报告落卷）→ 放行（undefined）——「待建模」解除', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [candidate(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: () => true,
    })
    expect(rejection).toBeUndefined()
  })
  it('归属 scope 传参：face 收到 {slug, localId, sourceTaskId}（不再传 files 全库口径）；无关提案容器链不进候选集 → 放行', async () => {
    const scopes: unknown[] = []
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot({ slug: 'feat-x', localId: 'fix-2', sourceTaskId: 't-feat-x-2.1' }),
      // 1.1 归属链过滤的守卫侧消费：仅本任务归属容器（t-<slug>- 前缀）的链进候选——
      // 无关提案历史链在场时返回空集，守卫放行。
      findRecurrenceCandidates: (projectId, scope) => {
        scopes.push({ projectId, scope })
        return scope.slug === 'feat-x' ? [] : [candidate(['foreign-root', 'f1', 'f2'])]
      },
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeUndefined()
    expect(scopes).toEqual([
      { projectId: 'p-1', scope: { slug: 'feat-x', localId: 'fix-2', sourceTaskId: 't-feat-x-2.1' } },
    ])
    expect('files' in (scopes[0] as { scope: object }).scope).toBe(false)
  })
  it('本任务缺陷挂链活态祖先径 ≥ 2 → 仍拦截（core 域 activeCount 口径）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot({ slug: 'feat-x', localId: 'fix-2' }),
      findRecurrenceCandidates: () => [
        { bugId: 'b-r2', summary: 's', chain: ['b-root', 'b-r1', 'b-r2'], activeCount: 2 },
      ],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeDefined()
    expect(rejection!.count).toBe(2)
    expect(rejection!.failure.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
  })
  it('count < 2 → 放行（< 阈值不受影响）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [candidate(['b-root', 'b-r1'])],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeUndefined()
  })
  it('face 缺席 / 异常 / 零候选 / 非盲试 fix → 放行（fail-soft 降级，行为零变化）', async () => {
    const base = { projectId: 'p-1', task: snapshot() }
    expect(await recurrenceEscalationGuard(base)).toBeUndefined()
    expect(
      await recurrenceEscalationGuard({ ...base, findRecurrenceCandidates: () => { throw new Error('ledger down') } }),
    ).toBeUndefined()
    expect(
      await recurrenceEscalationGuard({ ...base, findRecurrenceCandidates: () => [] }),
    ).toBeUndefined()
    expect(
      await recurrenceEscalationGuard({ ...base, task: snapshot({ sourceTaskId: undefined }), findRecurrenceCandidates: () => [candidate(['a', 'b', 'c'])] }),
    ).toBeUndefined()
  })
})

describe('拒绝 DTO 形状（rejectionFailureOf——release 解除指引三要件）', () => {
  it('code/message/violations 承载解除指引三要件（顶层路径模板 / .md 形态 / 重新 claim 放行）', () => {
    const dto = rejectionFailureOf('feat-x/fix-2', ['a', 'b', 'c'], 2)
    expect(dto.ok).toBe(false)
    expect(dto.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
    expect(dto.message).toContain('feat-x/fix-2')
    expect(dto.message).toContain('a → b → c')
    const release = dto.violations.find((v) => v.startsWith('release:'))
    expect(release).toBeDefined()
    expect(release!).toContain('.forge/docs/proposals/<slug>/issues/<localId>/')
    expect(release!).toContain('.md')
    expect(release!).toContain('重新 claim')
    // 事故判例 4545fde4：与解除形态无关的 related 条不进指引文案
    expect(dto.violations.some((v) => v.includes('ERR_BLOCK_SOURCE_REQUIRED'))).toBe(false)
  })
})
