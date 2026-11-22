// 箭头开放化单测（1.14——用户裁决链 2026-10-13：开放燕尾 + 箭头颜色跟线条一致）。
// 口径：形状模式驱动（只认五族实心三角 d 值，不认 marker id）——上游改几何 → 零命中
// → 原样返回回归实心箭头（安全失效）。cross/o/solidTop 语义 marker 不动。
// 生产面 marker id 经 nextMermaidId 每渲染唯一——无预览页 -open 后缀去重需求
// （那是同文档双拷贝工件，注记即可）。
import { describe, expect, it } from 'vitest'

import { applyOpenArrowheads, OPEN_ARROWHEADS_D_PATTERNS } from './arrowheads.js'
import { MERMAID_THEME_VARIABLES } from './theme.js'

/** 五族实心 d（mermaid 12.1.0 实渲染出厂形态）→ 开放燕尾 d（walkthrough/arrow-style-review 对照表） */
const SOLID_TO_OPEN: ReadonlyArray<readonly [solid: string, open: string]> = [
  ['M 0 0 L 10 5 L 0 10 z', 'M 1.5 1 L 9 5 L 1.5 9'], // flowchart pointEnd / point
  ['M -1 0 L 10 5 L 0 10 z', 'M 0.5 1 L 9 5 L 0.5 9'], // sequence arrowhead
  ['M 0 5 L 10 10 L 10 0 z', 'M 8.5 1 L 1 5 L 8.5 9'], // flowchart pointStart（反向）
  ['M 0 0 L 11.5 7 L 0 14 z', 'M 1.5 1.5 L 10.5 7 L 1.5 12.5'], // pointEnd-margin（边标签让位）
  ['M 18,7 L9,13 L14,7 L9,1 Z', 'M 9,1.5 L 16.5,7 L 9,12.5'], // sequence filled-head（->> 肥箭头）
]

function markerSvg(solidD: string): string {
  return `<svg><defs><marker id="dswf-mermaid-1_flowchart-pointEnd" markerWidth="12" markerHeight="12" refX="7.9" refY="5" orient="auto"><path style="fill: #adb2b8; stroke: #adb2b8;" class="marker flowchart-pointEnd" d="${solidD}"/></marker></defs><path class="flowchart-link" style="stroke: #adb2b8;" d="M 50 100 L 150 100"/></svg>`
}

describe('applyOpenArrowheads（开放燕尾手术——形状模式驱动）', () => {
  it('五族实心三角 d 值模式各替换为燕尾 chevron（全覆盖对照表）', () => {
    expect(OPEN_ARROWHEADS_D_PATTERNS.map((p) => p[0])).toEqual(SOLID_TO_OPEN.map((p) => p[0]))
    for (const [solid, open] of SOLID_TO_OPEN) {
      const out = applyOpenArrowheads(markerSvg(solid))
      expect(out, `d "${solid}" → "${open}"`).toContain(`d="${open}"`)
      expect(out).not.toContain(solid)
    }
  })

  it('命中 path 内联 style 整体重写：fill:none + stroke=主题 lineColor + 1.6px 圆角线帽（级联最高）', () => {
    const expectedStyle = `style="fill:none;stroke:${MERMAID_THEME_VARIABLES.lineColor};stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;"`
    const out = applyOpenArrowheads(markerSvg(SOLID_TO_OPEN[0]![0]))
    expect(out).toContain(expectedStyle)
    expect(out).not.toContain('fill: #adb2b8')
    // 线条 path 不动（手术只触 marker 实心三角）
    expect(out).toContain('class="flowchart-link"')
  })

  it('marker id 原样保留（生产面 id 经 nextMermaidId 每渲染唯一——无 -open 后缀去重）', () => {
    const out = applyOpenArrowheads(markerSvg(SOLID_TO_OPEN[0]![0]))
    expect(out).toContain('id="dswf-mermaid-1_flowchart-pointEnd"')
  })

  it('语义 marker 不动：cross / o（circle）/ solidTopArrowHead 零命中零改写', () => {
    const semantic = [
      '<svg><path style="fill: none; stroke: #adb2b8;" class="marker cross" d="M 0 0 L 10 10 M 10 0 L 0 10"/></svg>',
      '<svg><path style="fill: none; stroke: #adb2b8;" class="marker circle" d="M 0 5 A 5 5 0 1 1 0.0001 5"/></svg>',
      '<svg><path style="fill: #adb2b8;" class="marker solidTop" d="M 0 5 L 10 5 L 5 0 z"/></svg>',
    ]
    for (const svg of semantic) expect(applyOpenArrowheads(svg)).toBe(svg)
  })

  it('多命中全替换（同图多 marker/多出现）', () => {
    const svg = `<svg>${SOLID_TO_OPEN.map(([d]) => markerSvg(d).replace(/^<svg>/, '').replace(/<\/svg>$/, '')).join('')}</svg>`
    let out = applyOpenArrowheads(svg)
    for (const [, open] of SOLID_TO_OPEN) out = out.replace(`d="${open}"`, '')
    expect(out).not.toContain('M 0 0 L 10 5')
    expect(out).not.toMatch(/ z"|Z"/)
  })

  it('零命中原样返回（上游改几何 → 安全回归实心箭头，不炸管线）', () => {
    const svg = '<svg><path d="M 9 9 L 99 99" style="fill:#f00"/></svg>'
    expect(applyOpenArrowheads(svg)).toBe(svg)
  })

  it('Chromium 计算样式口径的字符串面：燕尾 marker stroke / 线条 stroke / 时序 signalColor 三处同值 #adb2b8', () => {
    // 实渲染 computed style 等值（walkthrough/arrow-style-review.png）在字符串面同构为：
    // 手术 style 的 stroke 值、主题 lineColor、主题 signalColor 三者同值
    const out = applyOpenArrowheads(markerSvg('M 0 0 L 10 5 L 0 10 z'))
    expect(MERMAID_THEME_VARIABLES.lineColor).toBe('#adb2b8')
    expect(MERMAID_THEME_VARIABLES.signalColor).toBe('#adb2b8')
    expect(out).toContain(`stroke:${MERMAID_THEME_VARIABLES.lineColor};`)
    expect(out).toContain('style="stroke: #adb2b8;" d="M 50 100 L 150 100"')
  })
})
