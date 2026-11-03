// T3 同缝拦截守卫单测（loop-recurrence-hardening + recurrence-signal-tiering 1.3）：
// 触发公式（全边 ≥2 ∧ hasOpen ∧ 报告不在场）+ 拒绝载荷列表式（八字段/条 + top-5 限幅 +
// escalate 链串摘要豁免）+ activeCount 退役随动（sameSeamCountOf 链长回退分支已删除）。
// face 缺席/异常 = fail-soft 放行（先例 stampEvidenceValidity）。
import { describe, expect, it } from 'vitest'
import type { BugRecurrenceCandidate, TaskSnapshot } from '@dsh-forge/contracts'
import {
  ERR_RECURRENCE_ESCALATION_REQUIRED,
  RECURRENCE_ESCALATION_THRESHOLD,
  REJECTION_LIST_LIMIT,
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

/** 候选（fullEdgeCount 缺省 = 链呈现长度回退供 chain 选择；计数口径见各用例显式给值） */
const candidate = (chain: string[], over: Partial<BugRecurrenceCandidate> = {}): BugRecurrenceCandidate => ({
  bugId: chain[chain.length - 1] as string,
  summary: 's',
  chain,
  ...over,
})

/** 触发形候选（全边 = 链呈现长度 - 1，链内有 open——core face 恒产出形） */
const triggering = (chain: string[], over: Partial<BugRecurrenceCandidate> = {}): BugRecurrenceCandidate =>
  candidate(chain, { fullEdgeCount: chain.length - 1, hasOpen: true, ...over })

describe('T3 同缝计数口径（recurrence-signal-tiering：最长祖先径全边，activeCount 退役）', () => {
  it('recurrenceCountOf = 呈现口径（chain length - 1——链根不计复发；不再参与拦截计数）', () => {
    expect(recurrenceCountOf(['b-root'])).toBe(0)
    expect(recurrenceCountOf(['b-root', 'b-r1'])).toBe(1)
    expect(recurrenceCountOf(['b-root', 'b-r1', 'b-r2'])).toBe(2)
  })
  it('候选集取最大家族 fullEdgeCount；空集 = 0；fullEdgeCount 缺席 = 0（链长回退分支已删除）', () => {
    expect(sameSeamCountOf([triggering(['a', 'b']), triggering(['x', 'y', 'z'])])).toBe(2)
    expect(sameSeamCountOf([])).toBe(0)
    expect(sameSeamCountOf([{ bugId: 'b', summary: 's', chain: ['a', 'b', 'c'], fullEdgeCount: 1 }])).toBe(1)
    expect(sameSeamCountOf([candidate(['a', 'b', 'c'])])).toBe(0) // 旧 face 无 fullEdgeCount → 不计数
  })
  it('阈值 = 2（提案 T3：同缝全边 ≥ 2 拒绝盲试 fix 派发）；限幅 = 5', () => {
    expect(RECURRENCE_ESCALATION_THRESHOLD).toBe(2)
    expect(REJECTION_LIST_LIMIT).toBe(5)
  })
})

describe('盲试 fix 派发判别 + 「待建模」派生态现算', () => {
  it('coding-fix ∧ fix 链派生 = 盲试；非 fix 类型 / 非派生 = 否', () => {
    expect(isBlindFixDispatch(snapshot())).toBe(true)
    expect(isBlindFixDispatch(snapshot({ taskType: 'coding-feature' }))).toBe(false)
    expect(isBlindFixDispatch(snapshot({ sourceTaskId: undefined }))).toBe(false)
  })
  it('「待建模」= 全边 ≥2 ∧ 链内有 open ∧ 报告不在场——纯派生态，零持久标记', () => {
    expect(isModelingPending(2, true, false)).toBe(true)
    expect(isModelingPending(3, true, true)).toBe(false) // 报告落卷 → 放行
    expect(isModelingPending(1, true, false)).toBe(false)
    expect(isModelingPending(3, false, false)).toBe(false) // 全 fixed 链 → T3 不拦（无 open 分量）
  })
})

describe('T3 守卫（recurrenceEscalationGuard）两态', () => {
  it('全边 ≥2 ∧ hasOpen ∧ 报告不在场 → 软拒绝（错误码 + 列表式载荷 + release 双轨解除指引）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeDefined()
    expect(rejection!.failure.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
    expect(rejection!.count).toBe(2)
    expect(rejection!.chain).toEqual(['b-root', 'b-r1', 'b-r2'])
    expect(rejection!.failure.message).toContain('同缝拦截')
    expect(rejection!.failure.message).toContain('链内有 open')
    const text = JSON.stringify(rejection!.failure)
    expect(text).toContain('升级排查建模')
    expect(text).toContain('getBug')
    expect(text).toContain('重新 claim')
  })
  it('报告在场（卷宗报告落卷）→ 放行（undefined）——「待建模」解除', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: () => true,
    })
    expect(rejection).toBeUndefined()
  })
  it('全 fixed 链（hasOpen=false）对 T3 不拦 → 放行（recurrence-signal-tiering 验收要点 2/3）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1', 'b-r2'], { hasOpen: false, status: 'fixed' })],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeUndefined()
  })
  it('hasOpen 缺席（旧 face 结构兼容）= 保守拦截不放宽', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [candidate(['b-root', 'b-r1', 'b-r2'], { fullEdgeCount: 2 })],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeDefined()
  })
  it('语义分界：探测面真缺席（false）仍拦截；face 整体缺席降级不变（拦截保守成立）', async () => {
    const candidates = () => [triggering(['b-root', 'b-r1', 'b-r2'])]
    // 双轨目录均可读但无 .md = 真「报告不在场」→ 仍拦截
    expect(
      await recurrenceEscalationGuard({ projectId: 'p-1', task: snapshot(), findRecurrenceCandidates: candidates, modelingReportPresent: () => false }),
    ).toBeDefined()
    // face 缺席（装配降级）→ 拦截保守成立（既有降级语义，本任务不改）
    expect(
      await recurrenceEscalationGuard({ projectId: 'p-1', task: snapshot(), findRecurrenceCandidates: candidates }),
    ).toBeDefined()
  })
  it('探测 IO 故障（face 返回 \'error\'）→ 拦截不生效放行 + warn 留痕（AGENTS §7 降级可观测）', async () => {
    const diags: Array<{ level: string; event: string; message: string }> = []
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: () => 'error',
      diag: (d) => diags.push(d as { level: string; event: string; message: string }),
    })
    expect(rejection).toBeUndefined() // IO 故障 = 机制失能 → 放行（防「永久拦截需绕行」）
    const warn = diags.find((d) => d.event === 'modeling-report-face-error')
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain('拦截未生效')
    expect(warn?.message).toContain('feat-x/fix-2')
  })
  it('报告探测输入携 bugIds（命中链成员——probes/<bugId>/ 备选探测锚）', async () => {
    const inputs: unknown[] = []
    await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1', 'b-r2'])],
      modelingReportPresent: (input) => {
        inputs.push(input)
        return false
      },
    })
    expect(inputs).toEqual([
      { projectId: 'p-1', slug: 'feat-x', localId: 'fix-2', bugIds: ['b-root', 'b-r1', 'b-r2'] },
    ])
  })
  it('归属 scope 传参：face 收到 {slug, localId, sourceTaskId}（不再传 files 全库口径）；无关提案容器链不进候选集 → 放行', async () => {
    const scopes: unknown[] = []
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot({ slug: 'feat-x', localId: 'fix-2', sourceTaskId: 't-feat-x-2.1' }),
      // 归属链过滤的守卫侧消费：仅本任务归属容器（core 域 sourceTaskId 反查 container_slug 锚）
      // 的链进候选——无关提案历史链在场时返回空集，守卫放行。
      findRecurrenceCandidates: (projectId, scope) => {
        scopes.push({ projectId, scope })
        return scope.slug === 'feat-x' ? [] : [triggering(['foreign-root', 'f1', 'f2'])]
      },
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeUndefined()
    expect(scopes).toEqual([
      { projectId: 'p-1', scope: { slug: 'feat-x', localId: 'fix-2', sourceTaskId: 't-feat-x-2.1' } },
    ])
    expect('files' in (scopes[0] as { scope: object }).scope).toBe(false)
  })
  it('本任务缺陷挂链最长祖先径全边 ≥ 2 → 仍拦截（core 域 fullEdgeCount 口径）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot({ slug: 'feat-x', localId: 'fix-2' }),
      findRecurrenceCandidates: () => [
        { bugId: 'b-r2', summary: 's', chain: ['b-root', 'b-r1', 'b-r2'], fullEdgeCount: 2, hasOpen: true },
      ],
      modelingReportPresent: () => false,
    })
    expect(rejection).toBeDefined()
    expect(rejection!.count).toBe(2)
    expect(rejection!.failure.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
  })
  it('全边 < 2 → 放行（< 阈值不受影响）', async () => {
    const rejection = await recurrenceEscalationGuard({
      projectId: 'p-1',
      task: snapshot(),
      findRecurrenceCandidates: () => [triggering(['b-root', 'b-r1'])],
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
      await recurrenceEscalationGuard({ ...base, task: snapshot({ sourceTaskId: undefined }), findRecurrenceCandidates: () => [triggering(['a', 'b', 'c'])] }),
    ).toBeUndefined()
  })
})

describe('拒绝载荷形态（rejectionFailureOf——列表式 + top-5 限幅 + escalate 豁免）', () => {
  const full = (i: number): BugRecurrenceCandidate => ({
    bugId: `bug-${i}`,
    summary: `候选 ${i}`,
    chain: ['b-root', `bug-${i}`],
    fullEdgeCount: 1,
    hasOpen: true,
    status: i % 2 === 0 ? 'open' : 'fixed',
    errorType: i % 3 === 0 ? 'type-a' : 'type-b',
    containerSlug: 'feat-x',
    suspectedLocation: `src/file${i}.ts:${i}`,
    lastSeenAt: `2026-11-0${(i % 9) + 1}T00:00:00.000Z`,
    ...(i === 0 ? {} : { recurrenceOf: 'b-root' }),
  })

  it('候选行八字段齐（bugId/summary/status/errorType/containerSlug/suspectedLocation/lastSeenAt/recurrenceOf）', () => {
    const dto = rejectionFailureOf('feat-x/fix-2', [full(1)], 2, ['b-root', 'b-r1', 'b-r2'])
    expect(dto.ok).toBe(false)
    expect(dto.code).toBe(ERR_RECURRENCE_ESCALATION_REQUIRED)
    const line = dto.message.split('\n').find((l) => l.startsWith('- ')) ?? ''
    expect(line).toContain('bug-1')
    expect(line).toContain('候选 1')
    expect(line).toContain('[fixed]')
    expect(line).toContain('errorType=type-b')
    expect(line).toContain('container=feat-x')
    expect(line).toContain('suspected=src/file1.ts:1')
    expect(line).toContain('lastSeen=2026-11-')
    expect(line).toContain('recurrenceOf=b-root')
    // 字段缺席回退占位（unknown / 未归类 / — / 链根）
    const bare = rejectionFailureOf('k', [{ bugId: 'b', summary: 's', chain: ['b'] }], 2, ['b'])
    const bareLine = bare.message.split('\n').find((l) => l.startsWith('- ')) ?? ''
    expect(bareLine).toContain('[unknown]')
    expect(bareLine).toContain('未归类')
    expect(bareLine).toContain('recurrenceOf=链根')
  })
  it('>5 条限幅：lastSeenAt 降序 top-5 + 其余按 errorType 计数（控呈现不控召回）', () => {
    const many = [8, 7, 6, 5, 4, 3, 2, 1, 0].map(full) // lastSeenAt 手工降序排列
    const dto = rejectionFailureOf('feat-x/fix-2', many, 3, ['b-root', 'a', 'b', 'c'])
    const lines = dto.message.split('\n')
    const entryLines = lines.filter((l) => l.startsWith('- '))
    expect(entryLines).toHaveLength(REJECTION_LIST_LIMIT)
    expect(entryLines[0]).toContain('bug-8') // lastSeenAt 降序首条
    const overflow = lines.find((l) => l.includes('其余 4 条'))
    expect(overflow).toBeDefined()
    expect(overflow).toContain('type-a×')
    expect(overflow).toContain('type-b×')
    expect(overflow).toContain('getBug')
  })
  it('escalate 豁免：升级指引携链串摘要（因果链证据非甄别列表）；release 双轨路径模板 + .md + 重新 claim', () => {
    const dto = rejectionFailureOf('feat-x/fix-2', [full(1)], 2, ['b-root', 'b-r1', 'b-r2'])
    expect(dto.message).toContain('feat-x/fix-2')
    const escalate = dto.violations.find((v) => v.startsWith('escalate:'))
    expect(escalate).toBeDefined()
    expect(escalate!).toContain('b-root → b-r1 → b-r2') // 链串摘要豁免保留
    const release = dto.violations.find((v) => v.startsWith('release:'))
    expect(release).toBeDefined()
    expect(release!).toContain('.forge/docs/proposals/<slug>/issues/<localId>/')
    expect(release!).toContain('.forge/docs/probes/<bugId>/') // 落点双轨备选
    expect(release!).toContain('.md')
    expect(release!).toContain('重新 claim')
    // 事故判例 4545fde4：与解除形态无关的 related 条不进指引文案
    expect(dto.violations.some((v) => v.includes('ERR_BLOCK_SOURCE_REQUIRED'))).toBe(false)
  })
})
