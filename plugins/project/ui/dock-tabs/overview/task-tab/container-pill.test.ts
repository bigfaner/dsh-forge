// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 容器 pill 数据模型单测 —— 容器来源 = 任务数据自身（tasks.list({projectId}) 全项目卡
// 按 slug 聚合）：聚合判据（计数/状态分布/稳定排序 slug）+ kind 不参与分组（容器统一为
// spec——仅 wire 回传用、取卡自身值原样保留、缺席回退 feature）。
import { describe, expect, it } from 'vitest'
import type { TaskCard } from '@dsh-forge/contracts'
import { ALL_CONTAINERS_LABEL, ALL_CONTAINERS_MENU_ID, taskContainerOptionsFromCards } from './container-pill.js'
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
  it('按 slug 聚合：计数 + 状态分布 + 稳定排序（slug 字典序）', () => {
    const options = taskContainerOptionsFromCards(CARDS)
    expect(options.map((o) => o.slug)).toEqual(['legacy-eval-retire', 'm2-pipeline']) // slug 字典序：l < m
    expect(options[1]).toMatchObject({
      slug: 'm2-pipeline',
      mode: 'expedition',
      taskCount: 2,
      statusCounts: { completed: 1, in_progress: 1 },
    })
    expect(options[0]).toMatchObject({
      slug: 'legacy-eval-retire',
      taskCount: 3,
      statusCounts: { pending: 2, blocked: 1 },
    })
  })

  it('kind 不参与分组：同 slug 异 kind 卡归一个容器，kind 取首卡原值（wire 回传用）', () => {
    const options = taskContainerOptionsFromCards([
      cardFixture({ taskId: 'a', slug: 'spec-x', source: { kind: 'proposal', slug: 'spec-x' } }),
      cardFixture({ taskId: 'b', slug: 'spec-x', source: { kind: 'feature', slug: 'spec-x' } }),
    ])
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ slug: 'spec-x', kind: 'proposal', taskCount: 2 })
  })

  it('真实 wire 形态（卡无 source——域层水化为 containerSlug）：回退 feature:slug，容器仍可列出', () => {
    const { source: _dropped, ...bare } = cardFixture({ slug: 'bare-slug' })
    const options = taskContainerOptionsFromCards([bare])
    expect(options).toEqual([
      { kind: 'feature', slug: 'bare-slug', title: 'bare-slug', mode: 'expedition', taskCount: 1, statusCounts: { completed: 1 } },
    ])
  })

  it('零任务（真真空）= 空列（容器空态唯一判据）', () => {
    expect(taskContainerOptionsFromCards([])).toEqual([])
  })

  it('「全部任务」作用域行 id 与标签为固定常量', () => {
    expect(ALL_CONTAINERS_MENU_ID).toBe('all')
    expect(ALL_CONTAINERS_LABEL).toBe('全部任务')
  })
})
