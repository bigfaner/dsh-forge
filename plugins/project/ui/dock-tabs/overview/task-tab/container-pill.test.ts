// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 容器 pill 数据模型单测 —— 容器来源 = 任务数据自身（tasks.list({projectId}) 全项目卡
// 按 source{kind,slug} 聚合——feature/提案域容器模型退役后唯一行源）：
// 聚合判据（计数/状态分布/稳定排序 slug）+ 双轨 kind（feature 远征 / proposal 突击）+
//「突击提案」标记 + 突击容器无「诊断」按钮（containerHasSubgraphDiag 仅 feature）。
import { describe, expect, it } from 'vitest'
import type { TaskCard } from '@dsh-forge/contracts'
import {
  BLITZ_CONTAINER_MARK,
  containerHasSubgraphDiag,
  containerMenuMark,
  containerOfSlug,
  taskContainerOptionsFromCards,
  type TaskContainerOption,
} from './container-pill.js'
import { cardFixture } from './task-tab-model.test.js'

/** 多容器任务卡夹具（source 恒填——core hydrate 服务不变量 slug ≡ 容器 slug） */
const CARDS: readonly TaskCard[] = [
  cardFixture({ taskId: 'a', slug: 'm2-pipeline', taskStatus: 'completed', source: { kind: 'feature', slug: 'm2-pipeline' } }),
  cardFixture({ taskId: 'b', slug: 'm2-pipeline', taskStatus: 'in_progress', source: { kind: 'feature', slug: 'm2-pipeline' } }),
  cardFixture({ taskId: 'c', slug: 'legacy-eval-retire', taskStatus: 'pending', source: { kind: 'proposal', slug: 'legacy-eval-retire' } }),
  cardFixture({ taskId: 'd', slug: 'legacy-eval-retire', taskStatus: 'blocked', source: { kind: 'proposal', slug: 'legacy-eval-retire' } }),
  cardFixture({ taskId: 'e', slug: 'legacy-eval-retire', taskStatus: 'pending', source: { kind: 'proposal', slug: 'legacy-eval-retire' } }),
]

describe('taskContainerOptionsFromCards（容器来源 = 任务数据自身聚合）', () => {
  it('按 source{kind,slug} 聚合：计数 + 状态分布 + 稳定排序（slug 字典序）', () => {
    const options = taskContainerOptionsFromCards(CARDS)
    expect(options.map((o) => `${o.kind}:${o.slug}`)).toEqual([
      'proposal:legacy-eval-retire', // slug 字典序：l < m
      'feature:m2-pipeline',
    ])
    expect(options[1]).toMatchObject({
      kind: 'feature',
      slug: 'm2-pipeline',
      mode: 'expedition',
      taskCount: 2,
      statusCounts: { completed: 1, in_progress: 1 },
    })
    expect(options[0]).toMatchObject({
      kind: 'proposal',
      slug: 'legacy-eval-retire',
      mode: 'blitz',
      taskCount: 3,
      statusCounts: { pending: 2, blocked: 1 },
    })
  })

  it('source 缺席卡（旧夹具/历史行）回退 feature:slug（任务 slug 恒等容器 slug 服务不变量）', () => {
    const options = taskContainerOptionsFromCards([cardFixture({ slug: 'bare-slug' })])
    expect(options).toEqual([
      { kind: 'feature', slug: 'bare-slug', title: 'bare-slug', mode: 'expedition', taskCount: 1, statusCounts: { completed: 1 } },
    ])
  })

  it('零任务（真真空）= 空列（容器空态唯一判据）', () => {
    expect(taskContainerOptionsFromCards([])).toEqual([])
  })
})

describe('标记与诊断可见性（呈现判据）', () => {
  const options = taskContainerOptionsFromCards(CARDS)
  const featureOption = options[1] as TaskContainerOption
  const blitzOption = options[0] as TaskContainerOption

  it('containerMenuMark：突击容器带「（突击提案）」标记；feature 空', () => {
    expect(BLITZ_CONTAINER_MARK).toBe('突击提案')
    expect(containerMenuMark(featureOption)).toBe('')
    expect(containerMenuMark(blitzOption)).toBe('（突击提案）')
  })

  it('containerHasSubgraphDiag：仅 feature 容器有「诊断」按钮（突击容器无）', () => {
    expect(containerHasSubgraphDiag(featureOption)).toBe(true)
    expect(containerHasSubgraphDiag(blitzOption)).toBe(false)
  })
})

describe('containerOfSlug（选中解析）', () => {
  it('命中 = 对应选项；未命中 = undefined（不派发切换）', () => {
    const options = taskContainerOptionsFromCards(CARDS)
    expect(containerOfSlug(options, 'm2-pipeline')?.kind).toBe('feature')
    expect(containerOfSlug(options, 'nope')).toBeUndefined()
  })
})
