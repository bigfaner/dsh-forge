// 阶段 chips 单测 —— 4.3 AC1：in-progress/prd/design/tasks/completed/archived 六态短形中文
// 标签 + 计数；0 计数 disabled、多选并集（filterFeaturesByPhases 纯函数）、清过滤入口。
// 行序 = PHASE_CHIP_ORDER（ui-design UF-4 / 原型 PHASE_ORDER：进行中 · 需求 · 设计 · 任务 ·
// 已完成 · 已归档——活跃前置·文档相位推进序·终态殿后；与 contracts FEATURE_STATUSES 同集不同序）。
// 受控语义（子 tab 切换清空）归帧侧 overview-model（switchSubtab 沿 M2 机制——4.6 接线）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, FeatureStatus, TaskStatus } from '@dsh-forge/contracts'
import { PhaseChips, PHASE_CHIP_ORDER, filterFeaturesByPhases, phaseCounts } from './PhaseChips.js'

const CREATED = '2026-10-01T08:00:00.000Z'

const ZERO_BY_STATUS: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 0,
  completed: 0,
  blocked: 0,
  suspended: 0,
  skipped: 0,
  rejected: 0,
}

function feature(id: string, slug: string, status: FeatureStatus, proposalSlug?: string): FeatureCard {
  return {
    featureId: id,
    slug,
    title: `feature ${slug}`,
    featureStatus: status,
    summary: `摘要 ${slug}`,
    ...(proposalSlug !== undefined ? { proposalSlug } : {}),
    createdAt: CREATED,
    updatedAt: CREATED,
    byStatus: { ...ZERO_BY_STATUS },
    docCount: 0,
  }
}

const FEATURES = [
  feature('f-1', 'dsh-forge-m2-pipeline', 'tasks', 'dsh-forge-m2-pipeline'),
  feature('f-2', 'dsh-forge-p1-mvp', 'completed', 'dsh-forge-p1-mvp'),
  feature('f-3', 'dsh-forge-m3-bootstrap-presets', 'prd', 'dsh-forge-m3-bootstrap-presets'),
  feature('f-4', 'legacy-tooling', 'in-progress', 'legacy-tooling'),
  feature('f-5', 'old-thing', 'archived'),
]

const COUNTS: Record<FeatureStatus, number> = {
  'in-progress': 1,
  prd: 1,
  design: 0,
  tasks: 1,
  completed: 1,
  archived: 1,
}

const NONE = new Set<FeatureStatus>()

describe('计数聚合与并集过滤（AC1 纯函数面）', () => {
  it('phaseCounts：六态聚合（PHASE_CHIP_ORDER 六键全集）', () => {
    expect(phaseCounts(FEATURES)).toEqual(COUNTS)
    expect(phaseCounts([])).toEqual({
      'in-progress': 0,
      prd: 0,
      design: 0,
      tasks: 0,
      completed: 0,
      archived: 0,
    })
  })

  it('filterFeaturesByPhases：空集 = 全部（chips 未激活不过滤）', () => {
    expect(filterFeaturesByPhases(FEATURES, NONE)).toHaveLength(5)
  })

  it('多选并集：两态激活 = 两态命中合集（in-progress ∪ prd = 2 行）', () => {
    const out = filterFeaturesByPhases(FEATURES, new Set<FeatureStatus>(['in-progress', 'prd']))
    expect(out.map((f) => f.featureId)).toEqual(['f-3', 'f-4'])
  })

  it('单态过滤与零命中（过滤零命中 = 空列表——空态呈现归帧侧）', () => {
    expect(filterFeaturesByPhases(FEATURES, new Set<FeatureStatus>(['design']))).toEqual([])
    expect(filterFeaturesByPhases(FEATURES, new Set<FeatureStatus>(['completed']))).toHaveLength(1)
  })
})

describe('阶段 chips 行（AC1 渲染面）', () => {
  it('六态全呈现（PHASE_CHIP_ORDER 行序）+ 短形中文标签 + 计数', () => {
    const markup = renderToStaticMarkup(
      <PhaseChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    const order = PHASE_CHIP_ORDER.map((phase) => markup.indexOf(`data-dswf-ov-phchip="${phase}"`))
    expect(order.every((p) => p >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // 行序语义断言：进行中在需求前、已完成在已归档前（活跃前置·终态殿后）
    expect(markup.indexOf('data-dswf-ov-phchip="in-progress"')).toBeLessThan(
      markup.indexOf('data-dswf-ov-phchip="prd"'),
    )
    expect(markup.indexOf('data-dswf-ov-phchip="completed"')).toBeLessThan(
      markup.indexOf('data-dswf-ov-phchip="archived"'),
    )
    // 短形词汇（「阶段」原「相位」更名 v8；PHASE_PHRASES 单源——非 contracts M2 概览行长形）
    for (const zh of ['进行中', '需求', '设计', '任务', '已完成', '已归档']) {
      expect(markup).toContain(zh)
    }
    expect(markup).not.toContain('任务分解')
    expect(markup).not.toContain('PRD 阶段')
    expect(markup).toContain('>1</span>') // in-progress 计数
  })

  it('0 计数 chip disabled（不可点出空态）+ 淡化类 + 悬停说明', () => {
    const markup = renderToStaticMarkup(
      <PhaseChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    const chipOf = (phase: string): string => {
      const at = markup.indexOf(`data-dswf-ov-phchip="${phase}"`)
      expect(at).toBeGreaterThanOrEqual(0)
      return markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    }
    expect(chipOf('design')).toContain('disabled')
    expect(chipOf('design')).toContain('is-zero')
    expect(chipOf('design')).toContain('title="无此阶段 feature"')
    expect(chipOf('tasks')).not.toContain('disabled')
  })

  it('激活态：aria-pressed + is-on；清过滤入口在场（任一激活时）；零激活缺席', () => {
    const active = new Set<FeatureStatus>(['prd'])
    const markup = renderToStaticMarkup(
      <PhaseChips counts={COUNTS} active={active} onToggle={() => {}} onClear={() => {}} />,
    )
    const at = markup.indexOf('data-dswf-ov-phchip="prd"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).toContain('aria-pressed="true"')
    expect(chip).toContain('is-on')
    expect(markup).toContain('data-dswf-ov-phchip-clear')
    expect(markup).toContain('✕ 清过滤')

    const idle = renderToStaticMarkup(<PhaseChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(idle).not.toContain('aria-pressed="true"')
    expect(idle).not.toContain('data-dswf-ov-phchip-clear')
  })

  it('点色语义封闭（每 chip 一枚 data-phase 点——蓝/绿/中性令牌承载归 CSS）', () => {
    const markup = renderToStaticMarkup(
      <PhaseChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    expect(markup.match(/data-phase="/g)?.length).toBe(6)
  })

  it('PHASE_CHIP_ORDER 与 contracts FEATURE_STATUSES 同集（六值封闭——词汇 contracts 单源）', async () => {
    const { FEATURE_STATUSES } = await import('@dsh-forge/contracts')
    expect([...PHASE_CHIP_ORDER].sort()).toEqual([...FEATURE_STATUSES].sort())
    expect(PHASE_CHIP_ORDER).toHaveLength(6)
  })
})
