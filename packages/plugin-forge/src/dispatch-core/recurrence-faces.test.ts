// bug 0db72bcb 生产装配面单测——createRecurrenceFaces（台账 recurrence 只读 face + 卷宗建模
// 报告在场探测的生产实现工厂）：装配径接线断言走工厂真实现（非手写 face 桩），T3 拦截/
// 解除判据经生产 face + 真实卷宗目录全径验证。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { BugRecurrenceCandidate } from '@dsh-forge/contracts'
import { createRecurrenceFaces } from './recurrence-faces.js'
import { recurrenceEscalationGuard } from './claim.js'

const CHAIN3: readonly BugRecurrenceCandidate[] = [
  { bugId: 'b-root', summary: '根', chain: ['b-root', 'b-r1', 'b-r2'] },
]

function snapshot(taskType: string, sourceTaskId?: string) {
  return {
    taskId: 't-1', slug: 'feat-x', localId: '2.1', source: { kind: 'feature', slug: 'feat-x' },
    title: 'T', taskType, taskStatus: 'in_progress', breaking: false, complexity: 'low',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...(sourceTaskId !== undefined ? { sourceTaskId } : {}),
  } as Parameters<typeof recurrenceEscalationGuard>[0]['task']
}

describe('createRecurrenceFaces（bug 0db72bcb 生产装配工厂）', () => {
  let ws: string | undefined
  afterEach(() => {
    if (ws !== undefined) rmSync(ws, { recursive: true, force: true })
    ws = undefined
  })

  it('modelingReportPresent：卷宗 issues/<localId>/ 顶层 .md 在场 = true（同源路径派生）', () => {
    ws = mkdtempSync(join(tmpdir(), 'recurrence-faces-'))
    const issuesDir = join(ws, '.forge', 'docs', 'proposals', 'feat-x', 'issues', '2.1')
    mkdirSync(issuesDir, { recursive: true })
    writeFileSync(join(issuesDir, 'modeling-report.md'), '# 判别实验清单\n')
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => [] }, resolveProjectDir: () => ws })
    expect(faces.modelingReportPresent({ projectId: 'p-1', slug: 'feat-x', localId: '2.1' })).toBe(true)
    expect(faces.modelingReportPresent({ projectId: 'p-1', slug: 'feat-x', localId: '2.2' })).toBe(false) // 无卷宗
  })

  it('modelingReportPresent：子目录 .md 不计（顶层非递归）；探测面只读 fail-soft 缺席 false', () => {
    ws = mkdtempSync(join(tmpdir(), 'recurrence-faces-'))
    const issuesDir = join(ws, '.forge', 'docs', 'proposals', 'feat-x', 'issues', '2.1', 'incident')
    mkdirSync(issuesDir, { recursive: true })
    writeFileSync(join(issuesDir, 'note.md'), 'x')
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => [] }, resolveProjectDir: () => ws })
    expect(faces.modelingReportPresent({ projectId: 'p-1', slug: 'feat-x', localId: '2.1' })).toBe(false)
    // 项目目录解析缺席 = false（不抛）
    const absent = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => [] }, resolveProjectDir: () => undefined })
    expect(absent.modelingReportPresent({ projectId: 'p-1', slug: 'feat-x', localId: '2.1' })).toBe(false)
  })

  it('findRecurrenceCandidates：台账域服务 face 委派（scope 原样透传）', async () => {
    const calls: unknown[] = []
    const faces = createRecurrenceFaces({
      bugs: {
        findRecurrenceCandidates: async (projectId, scope) => {
          calls.push({ projectId, scope })
          return CHAIN3
        },
      },
      resolveProjectDir: () => undefined,
    })
    const out = await faces.findRecurrenceCandidates('p-1', { slug: 'feat-x', localId: '2.1', sourceTaskId: 't-feat-x-2.1' })
    expect(out).toEqual(CHAIN3)
    expect(calls).toEqual([{ projectId: 'p-1', scope: { slug: 'feat-x', localId: '2.1', files: [] } }])
  })

  it('T3 解除判据生产可达：同缝 ≥2 且报告不在场 → 软拒绝；报告落卷 → 放行（同一生产 face 现算）', async () => {
    ws = mkdtempSync(join(tmpdir(), 'recurrence-faces-'))
    const issuesDir = join(ws, '.forge', 'docs', 'proposals', 'feat-x', 'issues', '2.1')
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => CHAIN3 }, resolveProjectDir: () => ws })
    const input = {
      projectId: 'p-1',
      task: snapshot('coding-fix', 't-src'),
      findRecurrenceCandidates: faces.findRecurrenceCandidates,
      modelingReportPresent: faces.modelingReportPresent,
    }
    const rejected = await recurrenceEscalationGuard(input)
    expect(rejected?.failure.code).toBe('ERR_RECURRENCE_ESCALATION_REQUIRED')
    // 报告落卷（结算旁挂回收同落点）→ 守卫派生态现算即放行
    mkdirSync(issuesDir, { recursive: true })
    writeFileSync(join(issuesDir, 'modeling-report.md'), '# 判别实验清单\n')
    expect(await recurrenceEscalationGuard(input)).toBeUndefined()
  })
})
