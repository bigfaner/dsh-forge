// 容器 pill 双轨数据模型单测 —— AC5：features ∪ 有任务提案（taskCount > 0 判据——2.3 单查询）
// + 突击容器 mode='blitz'（琥珀点判据）+「突击提案」标记 +「无 feature 阶段」计数注 +
// 突击容器无「诊断」按钮（containerHasSubgraphDiag 仅 feature）。
// 零任务提案不在列（AC6 断言）；非突击提案容器不入列（远征任务归成链 feature 承载——裁决⑪；
// 无溯源提案无模式路由——openSessionWithPreset mode 参不可缺省成谎）。
import { describe, expect, it } from 'vitest'
import type { FeatureCard, ProposalCard, ProposalStatus } from '@dsh-forge/contracts'
import {
  BLITZ_CONTAINER_MARK,
  containerCountNoteSuffix,
  containerHasSubgraphDiag,
  containerMenuMark,
  containerOfSlug,
  taskContainerOptions,
} from './container-pill.js'

const CREATED = '2026-10-01T08:00:00.000Z'

function feature(slug: string, title: string, byStatus: Partial<Record<string, number>>): FeatureCard {
  const full = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 }
  return {
    featureId: `f-${slug}`,
    slug,
    title,
    featureStatus: 'in-progress',
    createdAt: CREATED,
    updatedAt: CREATED,
    byStatus: { ...full, ...byStatus } as FeatureCard['byStatus'],
    docCount: 2,
  }
}

function proposal(
  id: string,
  slug: string,
  status: ProposalStatus,
  mode: 'expedition' | 'blitz' | undefined,
  taskCount: number,
): ProposalCard {
  return {
    proposalId: id,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    author: 'faner',
    taskCount,
    ...(mode !== undefined ? { mode } : {}),
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

const FEATURES: readonly FeatureCard[] = [
  feature('m2-pipeline', 'M2 管线接管', { pending: 2, in_progress: 1, completed: 3 }),
  feature('p1-mvp', 'P1 MVP', { completed: 4 }),
]

const ZERO_TASK_BLITZ = proposal('pr-2', 'ui-polish-round', 'under-review', 'blitz', 0)

const PROPOSALS: readonly ProposalCard[] = [
  // 突击 + 有任务 → 入列（琥珀点双轨成员）
  proposal('pr-1', 'legacy-eval-retire', 'rejected', 'blitz', 2),
  // 突击 + 零任务 → 不在列（AC6 断言）
  ZERO_TASK_BLITZ,
  // 远征提案（成链任务归 feature 承载）→ 不在列
  proposal('pr-3', 'dsh-forge-m2-pipeline', 'accepted', 'expedition', 6),
  // 无溯源（mode NULL）+ 有任务 → 不在列（无模式路由）
  proposal('pr-4', 'legacy-scan-absorbed', 'accepted', undefined, 3),
]

describe('taskContainerOptions（AC5 双轨并集——前端组合两域读）', () => {
  it('features ∪ 有任务突击提案（feature 在前、提案随后——各自输入序）', () => {
    const options = taskContainerOptions(FEATURES, PROPOSALS)
    expect(options.map((o) => `${o.kind}:${o.slug}`)).toEqual([
      'feature:m2-pipeline',
      'feature:p1-mvp',
      'proposal:legacy-eval-retire',
    ])
  })

  it('feature 轨：mode 恒 expedition（成链门保证——features 无列）；taskCount = byStatus 七态总和', () => {
    const options = taskContainerOptions(FEATURES, PROPOSALS)
    expect(options[0]).toMatchObject({ kind: 'feature', slug: 'm2-pipeline', title: 'M2 管线接管', mode: 'expedition', taskCount: 6 })
    expect(options[1]).toMatchObject({ kind: 'feature', slug: 'p1-mvp', mode: 'expedition', taskCount: 4 })
  })

  it('突击轨：mode = blitz（琥珀点判据）+ taskCount = 2.3 单查询原值', () => {
    const option = taskContainerOptions(FEATURES, PROPOSALS)[2]
    expect(option).toMatchObject({ kind: 'proposal', slug: 'legacy-eval-retire', mode: 'blitz', taskCount: 2 })
  })

  it('零任务提案不在列（taskCount > 0 判据）——空任务集突击提案全排除', () => {
    expect(taskContainerOptions([], [ZERO_TASK_BLITZ])).toEqual([])
  })

  it('零 feature + 零合格提案 → 空列（4.6 呈现 feature 空态）', () => {
    expect(taskContainerOptions([], [])).toEqual([])
  })
})

describe('标记与注记（AC5 呈现判据）', () => {
  const options = taskContainerOptions(FEATURES, PROPOSALS)
  const featureOption = options[0]
  const blitzOption = options[2]
  if (featureOption === undefined || blitzOption === undefined) throw new Error('夹具缺席——并集断言不可达分支')

  it('containerMenuMark：突击容器带「（突击提案）」标记；feature 空', () => {
    expect(BLITZ_CONTAINER_MARK).toBe('突击提案')
    expect(containerMenuMark(featureOption)).toBe('')
    expect(containerMenuMark(blitzOption)).toBe('（突击提案）')
  })

  it('containerCountNoteSuffix：突击容器带「无 feature 阶段」计数注；feature 空', () => {
    expect(containerCountNoteSuffix(featureOption)).toBe('')
    expect(containerCountNoteSuffix(blitzOption)).toBe(' · 突击提案容器（无 feature 阶段）')
  })

  it('containerHasSubgraphDiag：仅 feature 容器有「诊断」按钮（突击容器无）', () => {
    expect(containerHasSubgraphDiag(featureOption)).toBe(true)
    expect(containerHasSubgraphDiag(blitzOption)).toBe(false)
  })
})

describe('containerOfSlug（选中解析）', () => {
  it('命中 = 对应选项；未命中 = undefined（不派发切换）', () => {
    const options = taskContainerOptions(FEATURES, PROPOSALS)
    expect(containerOfSlug(options, 'legacy-eval-retire')?.kind).toBe('proposal')
    expect(containerOfSlug(options, 'nope')).toBeUndefined()
  })
})
