// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 两列元数据网格单测 —— 4.3 AC2：摘要独占一行 + 两列网格（第一行 标识|阶段、第二行
// 模式|谱系——谱系右列对齐）+ 远征 mode chip 只读（硬编码恒真——feature 固定远征，
// tech-design 裁决⑥：features 恒远征·成链门保证）+ 谱系 = proposal_id 关联链
// （FeatureCard.proposalSlug——在场「成链自 <slug>」/ 无来源「—」）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, TaskStatus } from '@dsh-forge/contracts'
import { FEATURE_FIXED_MODE, MetaGrid, featureLineage } from './MetaGrid.js'

const CREATED = '2026-10-01T08:00:00.000Z'

const ZERO_BY_STATUS: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 0,
  completed: 0,
  blocked: 0,
  suspended: 0,
  interrupted: 0,
  skipped: 0,
  rejected: 0,
}

function feature(overrides: Partial<FeatureCard> = {}): FeatureCard {
  return {
    featureId: 'f-1',
    slug: 'dsh-forge-m3-bootstrap-presets',
    title: 'M3 自举·模式预设',
    featureStatus: 'tasks',
    summary: '双预设 + 拆包 + 技能迁移 + 提案管线消费',
    proposalSlug: 'dsh-forge-m3-bootstrap-presets',
    createdAt: CREATED,
    updatedAt: CREATED,
    byStatus: { ...ZERO_BY_STATUS },
    docCount: 4,
    ...overrides,
  }
}

describe('两列元数据网格（AC2 渲染面）', () => {
  it('摘要独占一行（is-full）+ 缺席 = —', () => {
    const markup = renderToStaticMarkup(<MetaGrid feature={feature()} />)
    const at = markup.indexOf('摘要')
    expect(at).toBeGreaterThanOrEqual(0)
    const row = markup.slice(markup.lastIndexOf('<div', at), markup.indexOf('</div>', at))
    expect(row).toContain('is-full')
    expect(markup).toContain('双预设 + 拆包 + 技能迁移 + 提案管线消费')

    const bare = renderToStaticMarkup(
      <MetaGrid feature={feature({ summary: undefined })} />,
    )
    const atBare = bare.indexOf('摘要')
    expect(bare.slice(bare.lastIndexOf('<div', atBare), bare.indexOf('</div>', atBare))).toContain(
      '>—</span>',
    )
  })

  it('两列网格字段序：标识|阶段 第一行、模式|谱系 第二行（谱系右列 = 网格第 4 格）', () => {
    const markup = renderToStaticMarkup(<MetaGrid feature={feature()} />)
    const keys = ['摘要', '标识', '阶段', '模式', '谱系'].map((k) => markup.indexOf(`>${k}</span>`))
    expect(keys.every((p) => p >= 0)).toBe(true)
    expect([...keys].sort((a, b) => a - b)).toEqual(keys) // DOM 序 = 摘要 → 标识 → 阶段 → 模式 → 谱系
    const gridAt = markup.indexOf('dswf-ov-fmeta-grid')
    expect(gridAt).toBeGreaterThanOrEqual(0)
    // 网格四格序（两列）：标识、阶段 | 模式、谱系——谱系殿后 = 右列第二行（v9 对齐裁决）
    const grid = markup.slice(gridAt, markup.indexOf('</div></div>', gridAt))
    const cells = ['标识', '阶段', '模式', '谱系'].map((k) => grid.indexOf(`>${k}</span>`))
    expect(cells.every((p) => p >= 0)).toBe(true)
    expect([...cells].sort((a, b) => a - b)).toEqual(cells)
  })

  it('阶段 = 短形词汇（PHASE_PHRASES 单源——tasks →「任务」非「任务分解」）', () => {
    const markup = renderToStaticMarkup(<MetaGrid feature={feature()} />)
    expect(markup).toContain('>任务</span>')
    expect(markup).not.toContain('任务分解')

    const done = renderToStaticMarkup(
      <MetaGrid feature={feature({ featureStatus: 'completed' })} />,
    )
    expect(done).toContain('>已完成</span>')
  })

  it('模式 = 远征 mode chip 只读（disabled + 无「唯一正门」title——回调缺席 = ModeChip 只读消费面）', () => {
    const markup = renderToStaticMarkup(<MetaGrid feature={feature()} />)
    expect(markup).toContain('data-dswf-mode-chip="expedition"')
    const at = markup.indexOf('data-dswf-mode-chip="expedition"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).toContain('disabled')
    expect(chip).toContain('>远征</span>')
    expect(markup).not.toContain('唯一正门')
  })

  it('FEATURE_FIXED_MODE 硬编码恒真（feature 固定远征——无 per-feature 数据面）', () => {
    expect(FEATURE_FIXED_MODE).toBe<'expedition'>('expedition')
  })
})

describe('谱系（AC2 纯函数面——proposal_id 关联链）', () => {
  it('成链：proposalSlug 在场 = 「成链自 <slug>」', () => {
    expect(featureLineage(feature())).toBe('成链自 dsh-forge-m3-bootstrap-presets')
  })

  it('无来源（proposal_id 缺席）= —', () => {
    expect(featureLineage(feature({ proposalSlug: undefined }))).toBe('—')
  })
})
