// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 容器 pill 数据模型单测 —— AC5：feature 轨全量（taskCount = byStatus 七态总和，mode 恒
// expedition）+「突击提案」标记 + 突击容器无「诊断」按钮（containerHasSubgraphDiag 仅 feature）。
// proposal kind 选项仍在役（TaskContainerOption/呈现判据面零改动），仅不再由
// taskContainerOptions 产出——proposal 域 UI 消费面退役后无提案行源。
// m3.1 D26：「无 feature 阶段」计数注废除——零过程注释文案。
import { describe, expect, it } from 'vitest'
import type { FeatureCard } from '@dsh-forge/contracts'
import {
  BLITZ_CONTAINER_MARK,
  containerHasSubgraphDiag,
  containerMenuMark,
  containerOfSlug,
  taskContainerOptions,
  type TaskContainerOption,
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

const FEATURES: readonly FeatureCard[] = [
  feature('m2-pipeline', 'M2 管线接管', { pending: 2, in_progress: 1, completed: 3 }),
  feature('p1-mvp', 'P1 MVP', { completed: 4 }),
]

/** 突击容器选项（呈现判据面钉——kind='proposal' 仍在役，渲染面零改动） */
const BLITZ_OPTION: TaskContainerOption = {
  kind: 'proposal',
  slug: 'legacy-eval-retire',
  title: '提案 legacy-eval-retire',
  mode: 'blitz',
  taskCount: 2,
}

describe('taskContainerOptions（AC5 feature 轨投影）', () => {
  it('feature 全量入列（输入序）', () => {
    const options = taskContainerOptions(FEATURES)
    expect(options.map((o) => `${o.kind}:${o.slug}`)).toEqual([
      'feature:m2-pipeline',
      'feature:p1-mvp',
    ])
  })

  it('feature 轨：mode 恒 expedition（成链门保证——features 无列）；taskCount = byStatus 七态总和', () => {
    const options = taskContainerOptions(FEATURES)
    expect(options[0]).toMatchObject({ kind: 'feature', slug: 'm2-pipeline', title: 'M2 管线接管', mode: 'expedition', taskCount: 6 })
    expect(options[1]).toMatchObject({ kind: 'feature', slug: 'p1-mvp', mode: 'expedition', taskCount: 4 })
  })

  it('零 feature → 空列', () => {
    expect(taskContainerOptions([])).toEqual([])
  })
})

describe('标记与诊断可见性（AC5 呈现判据）', () => {
  const options = taskContainerOptions(FEATURES)
  const featureOption = options[0]
  if (featureOption === undefined) throw new Error('夹具缺席——投影断言不可达分支')

  it('containerMenuMark：突击容器带「（突击提案）」标记；feature 空', () => {
    expect(BLITZ_CONTAINER_MARK).toBe('突击提案')
    expect(containerMenuMark(featureOption)).toBe('')
    expect(containerMenuMark(BLITZ_OPTION)).toBe('（突击提案）')
  })

  it('containerHasSubgraphDiag：仅 feature 容器有「诊断」按钮（突击容器无）', () => {
    expect(containerHasSubgraphDiag(featureOption)).toBe(true)
    expect(containerHasSubgraphDiag(BLITZ_OPTION)).toBe(false)
  })
})

describe('containerOfSlug（选中解析）', () => {
  it('命中 = 对应选项；未命中 = undefined（不派发切换）', () => {
    const options = taskContainerOptions(FEATURES)
    expect(containerOfSlug(options, 'm2-pipeline')?.kind).toBe('feature')
    expect(containerOfSlug(options, 'nope')).toBeUndefined()
  })
})
