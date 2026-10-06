// 覆盖率组件单测 —— AC4：实际 N% / 预期 ≥M% + 进度条填充=实际 + 阈值刻度线位置=预期 +
// 判定徽标（✓达标/未达标/未执行）。小数(0–1) → 百分比归一 = contracts 口径。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { detailFixture } from './detail-model.test.js'
import { CoverageBar, coveragePct, coverageViewOf } from './coverage-bar.js'

describe('coverageViewOf（数据投影）', () => {
  it('预期 = TaskDetail.coverage（阈值小数）；实际 = 最近 submit gate.coverage', () => {
    const detail = detailFixture({
      coverage: 0.8,
      records: [
        {
          verb: 'submit',
          actor: 'plugin-tool',
          createdAt: '2026-10-02T10:00:00.000Z',
          gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.614 },
        },
      ],
    })
    expect(coverageViewOf(detail)).toEqual({
      actualPct: 61,
      expectedPct: 80,
      verdict: 'fail',
    })
  })

  it('实际 ≥ 预期 → pass；实际缺席 → none（未执行）；预期缺席 → 仅实际', () => {
    const pass = detailFixture({
      coverage: 0.8,
      records: [
        { verb: 'submit', actor: 'plugin-tool', createdAt: '2026-10-02T10:00:00.000Z', gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.92 } },
      ],
    })
    expect(coverageViewOf(pass).verdict).toBe('pass')
    const none = detailFixture({ coverage: 0.8, records: [] })
    expect(coverageViewOf(none)).toEqual({ actualPct: undefined, expectedPct: 80, verdict: 'none' })
  })

  it('无预期阈值 + 有实际 → 未达标档（v9 原型口径：act ≥ exp 缺判据即不达标）', () => {
    const detail = detailFixture({
      coverage: undefined,
      records: [
        { verb: 'submit', actor: 'plugin-tool', createdAt: '2026-10-02T10:00:00.000Z', gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.61 } },
      ],
    })
    expect(coverageViewOf(detail)).toEqual({ actualPct: 61, expectedPct: undefined, verdict: 'fail' })
  })

  it('coveragePct：小数四舍五入百分比', () => {
    expect(coveragePct(0.614)).toBe(61)
    expect(coveragePct(0.8)).toBe(80)
    expect(coveragePct(1)).toBe(100)
    expect(coveragePct(0)).toBe(0)
  })
})

describe('CoverageBar（AC4 渲染面）', () => {
  it('进度条填充宽度 = 实际百分比；阈值刻度线 left = 预期百分比；数值行 + 判定徽标', () => {
    const html = renderToStaticMarkup(
      CoverageBar({ view: { actualPct: 61, expectedPct: 80, verdict: 'fail' } }),
    )
    expect(html).toContain('data-dswf-td-cov=""')
    expect(html).toContain('width:61%')
    expect(html).toContain('left:80%')
    expect(html).toContain('实际')
    expect(html).toContain('61%')
    expect(html).toContain('预期')
    expect(html).toContain('≥80%')
    expect(html).toContain('未达标')
    expect(html).toContain('data-dswf-td-cov-verdict="fail"')
  })

  it('达标徽标 ✓；未执行（无实际）= 填充 0 + 未执行徽标 + 预期仍呈现', () => {
    const pass = renderToStaticMarkup(
      CoverageBar({ view: { actualPct: 92, expectedPct: 80, verdict: 'pass' } }),
    )
    expect(pass).toContain('✓ 达标')
    const none = renderToStaticMarkup(
      CoverageBar({ view: { actualPct: undefined, expectedPct: 75, verdict: 'none' } }),
    )
    expect(none).toContain('width:0%')
    expect(none).toContain('未执行')
    expect(none).toContain('≥75%')
    expect(none).toContain('left:75%') // 有阈值 → 刻度线在场
    const noThreshold = renderToStaticMarkup(
      CoverageBar({ view: { actualPct: 61, expectedPct: undefined, verdict: 'fail' } }),
    )
    expect(noThreshold).not.toContain('left:') // 无阈值 → 无刻度线
  })
})
