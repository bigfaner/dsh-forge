// S2 分层承载（worker-lean-execution 1.2）—— composeWorkerPersona 单测：
// ① taskType × complexity 穷尽路由（20 类型 × 3 档全产出非空 personaText）；
// ② 族路由生效（四族专家身份行随 taskType 变化）+ 复杂度分级行随 complexity 变化；
// ③ R9 上游语义锚：persona 文本禁产裸 '{{'（上游严格 {{}} 插值会拆装）；
// ④ persona 含类型/复杂度消费证据（透传面内容可判读——AC-1 的 compose 产出锚）。
import { describe, expect, it } from 'vitest'
import { TASK_TYPES } from '@dsh-forge/contracts'
import { composeWorkerPersona } from './persona.js'

const COMPLEXITIES = ['low', 'medium', 'high'] as const

describe('composeWorkerPersona（S2 persona 通道——plugin 侧合成）', () => {
  it('穷尽路由：20 类型 × 3 复杂度全产出非空 personaText', () => {
    for (const taskType of TASK_TYPES) {
      for (const complexity of COMPLEXITIES) {
        const persona = composeWorkerPersona(taskType, complexity)
        expect(persona.length).toBeGreaterThan(0)
      }
    }
  })

  it('族路由：四族专家身份行随 taskType 变化（coding/doc/gate/validation 各如其表）', () => {
    const coding = composeWorkerPersona('coding-feature', 'medium')
    const doc = composeWorkerPersona('doc', 'medium')
    const gate = composeWorkerPersona('gate', 'medium')
    const validation = composeWorkerPersona('validation-code', 'medium')
    expect(coding).toContain('交付工程师')
    expect(doc).toContain('技术作家')
    expect(gate).toContain('质量门守卫')
    expect(validation).toContain('验证员')
    expect(new Set([coding, doc, gate, validation]).size).toBe(4)
  })

  it('复杂度分级：门纪律行随 complexity 变化（low 裁剪 / medium·high 全门）', () => {
    expect(composeWorkerPersona('coding-fix', 'low')).toContain('low')
    expect(composeWorkerPersona('coding-fix', 'medium')).toContain('medium')
    expect(composeWorkerPersona('coding-fix', 'high')).toContain('high')
    const medium = composeWorkerPersona('doc-review', 'medium')
    const high = composeWorkerPersona('doc-review', 'high')
    expect(medium).not.toBe(high)
  })

  it('R9 上游语义锚：persona 文本禁产裸 {{（上游严格 {{}} 插值）', () => {
    for (const taskType of TASK_TYPES) {
      for (const complexity of COMPLEXITIES) {
        expect(composeWorkerPersona(taskType, complexity)).not.toContain('{{')
      }
    }
  })
})
