// 3.1 单测 —— forge:spec 系统提示段（AC5）：段名/段序常量 + 一段式纪律文本锚
//（文档 → upsertFeatureDoc / 任务 → addTask + registerFeature / 诊断 → validateFeatureTasks）
// + 裸 {{ 禁用（SystemPrompt 插值面）+ 无 XML 包裹标签（标签集四枚封闭不扩——knowledge 段同形）。
import { describe, expect, it } from 'vitest'
import { SPEC_SECTION_NAME, SPEC_SECTION_ORDER, renderForgeSpecSection } from './index.js'

describe('forge:spec 系统提示段', () => {
  it('段名/段序常量（Interface：forge:spec / knowledge 500 → forge:pipeline 510 之后）', () => {
    expect(SPEC_SECTION_NAME).toBe('forge:spec')
    expect(SPEC_SECTION_ORDER).toBe(520)
  })

  it('一段式纪律文本：规格产出经 tool 读写状态层（三径动词点名）', () => {
    const text = renderForgeSpecSection()
    expect(text).toContain('## Forge spec chain')
    // 文档径 → upsertFeatureDoc（登记即推进·单调只进）
    expect(text).toContain('upsertFeatureDoc')
    expect(text).toContain('monotonic')
    // 任务径 → addTask + registerFeature（显式补链正门·成链内聚不重复）
    expect(text).toContain('registerFeature')
    expect(text).toContain('addTask')
    // 诊断径 → validateFeatureTasks（✗ 违规含任务键直达）
    expect(text).toContain('validateFeatureTasks')
    // 状态层唯一事实源纪律（与 forge:pipeline 段同口径）
    expect(text).toContain('source of truth')
    expect(text).toContain('Never edit that state by hand')
  })

  it('边界声明：模式改写/feature 级转移 = 人类决策（裁决②/律三面分治）', () => {
    const text = renderForgeSpecSection()
    expect(text).toContain('human decisions')
  })

  it('裸 {{ 禁用（SystemPrompt 段文本 {{var}} 插值面——未知引用炸渲染）', () => {
    expect(renderForgeSpecSection()).not.toMatch(/\{\{/)
  })

  it('无 XML 包裹标签（标签集四枚封闭——G1-14 pin 不扩；knowledge 段同形）', () => {
    expect(renderForgeSpecSection()).not.toMatch(/^</)
    expect(renderForgeSpecSection()).not.toMatch(/\n</)
  })
})
