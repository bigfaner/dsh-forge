// 2.2 快照测试 ×20 + 组成序/键值行/映射/digest/标签封闭断言（tech-design §Interface 9
// + Per-Layer Test Plan「prompt 快照 ×20(人格段+标签+块序)」）。快照文件 = dispatchPrompt
// 全文字节级 pin（digest 契约的回归面：任何模板/约束/人格文本改动都会在快照 diff 显形）。
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TASK_TYPES, XML_TAGS, type TaskType } from '@dsh-forge/contracts'
import {
  composeDispatchPrompt,
  CONSTRAINTS_BLOCK,
  PERSONA_BLOCK,
  resolveCoverage,
  TASK_CATEGORY_FOR_TYPE,
  type DispatchPromptInput,
} from './compose.js'
import { DISPATCH_DIGEST_LENGTH, dispatchDigest } from './digest.js'
import { TYPE_POLICY_TEMPLATES } from './templates/index.js'

/** 全载荷夹具（九键全在场——快照覆盖每键行形态） */
function fullInput(o: { taskType: TaskType }): DispatchPromptInput {
  return {
    slug: 'm2-pipeline',
    localId: '2.2',
    taskType: o.taskType,
    taskFile: 'docs/features/m2-pipeline/tasks/2.2-dispatch-prompt-templates.md',
    priority: 'P1',
    coverage: 0.8,
    phaseSummary: 'docs/features/m2-pipeline/tasks/records/1-summary.md',
    blockers: [
      { slug: 'm2-pipeline', localId: '2.1', taskStatus: 'completed' },
      { slug: 'm2-pipeline', localId: '1.gate', taskStatus: 'skipped' },
    ],
    breaking: true,
    sourceTask: { slug: 'm2-pipeline', localId: '2.4' },
  }
}

/** 最小夹具（仅恒在场四键——快照覆盖条件键缺席形态） */
function minimalInput(o: { taskType: TaskType; localId?: string }): DispatchPromptInput {
  return { slug: 'm2-pipeline', localId: o.localId ?? '3.1', taskType: o.taskType }
}

/** 20 类型 → 夹具（代表性动态载荷交替：全载/最小/中载——条件键两态均有覆盖） */
const FIXTURES: Record<TaskType, DispatchPromptInput> = {
  'coding-feature': fullInput({ taskType: 'coding-feature' }),
  'coding-enhancement': minimalInput({ taskType: 'coding-enhancement' }),
  'coding-cleanup': {
    slug: 'm2-pipeline',
    localId: '3.2',
    taskType: 'coding-cleanup',
    coverage: 0.8,
  },
  'coding-refactor': minimalInput({ taskType: 'coding-refactor', localId: '3.3' }),
  'code-quality-simplify': minimalInput({ taskType: 'code-quality-simplify', localId: '3.4' }),
  'coding-fix': {
    slug: 'm2-pipeline',
    localId: 'fix-1',
    taskType: 'coding-fix',
    sourceTask: { slug: 'm2-pipeline', localId: '2.4' },
    priority: 'P0',
  },
  gate: fullInput({ taskType: 'gate' }),
  doc: minimalInput({ taskType: 'doc', localId: '4.1' }),
  'doc-consolidate': minimalInput({ taskType: 'doc-consolidate', localId: '4.2' }),
  'doc-drift': minimalInput({ taskType: 'doc-drift', localId: '4.3' }),
  'doc-review': fullInput({ taskType: 'doc-review' }),
  'doc-summary': minimalInput({ taskType: 'doc-summary', localId: '1.summary' }),
  'test-run': minimalInput({ taskType: 'test-run', localId: '5.1' }),
  'test-gen-contracts': minimalInput({ taskType: 'test-gen-contracts', localId: '5.2' }),
  'test-gen-journeys': minimalInput({ taskType: 'test-gen-journeys', localId: '5.3' }),
  'test-gen-scripts': minimalInput({ taskType: 'test-gen-scripts', localId: '5.4' }),
  'validation-code': fullInput({ taskType: 'validation-code' }),
  'validation-ux': minimalInput({ taskType: 'validation-ux', localId: '6.1' }),
  'eval-contract': minimalInput({ taskType: 'eval-contract', localId: '7.1' }),
  'eval-journey': minimalInput({ taskType: 'eval-journey', localId: '7.2' }),
}

// ─────────────────── AC4：快照 ×20（人格段 + 三标签在场 + 块序） ───────────────────

describe.each(TASK_TYPES)('AC4 dispatchPrompt 快照 [%s]', (taskType) => {
  it('全文快照 + 人格段在场 + 三标签在场 + 块序（人格段→constraints→task-context→type-policy）', () => {
    const prompt = composeDispatchPrompt(FIXTURES[taskType])
    expect(prompt).toMatchSnapshot()

    // 人格段在场 = 全文以无标签人格段开头（组成序第一段）
    expect(prompt.startsWith(PERSONA_BLOCK)).toBe(true)

    // 三标签在场（开 + 闭）
    for (const tag of [XML_TAGS.constraints, XML_TAGS.taskContext, XML_TAGS.typePolicy]) {
      expect(prompt).toContain(`<${tag}>`)
      expect(prompt).toContain(`</${tag}>`)
    }

    // 块序：人格段 < <constraints> < <task-context> < <type-policy>
    const constraintsAt = prompt.indexOf(`<${XML_TAGS.constraints}>`)
    const contextAt = prompt.indexOf(`<${XML_TAGS.taskContext}>`)
    const policyAt = prompt.indexOf(`<${XML_TAGS.typePolicy}>`)
    expect(constraintsAt).toBeGreaterThan(PERSONA_BLOCK.length)
    expect(contextAt).toBeGreaterThan(constraintsAt)
    expect(policyAt).toBeGreaterThan(contextAt)

    // 模板族内文非空且承载类型策略
    const policyBody = prompt.slice(
      prompt.indexOf(`<${XML_TAGS.typePolicy}>`) + XML_TAGS.typePolicy.length + 2,
      prompt.indexOf(`</${XML_TAGS.typePolicy}>`),
    )
    expect(policyBody.trim().length).toBeGreaterThan(0)
  })
})

// ─────────────────── AC5：XML 标签集封闭 pin（G1-14 core 侧消费面） ───────────────────

describe('AC5 XML 标签集封闭（四枚；<forge-pipeline> 不进 dispatchPrompt）', () => {
  it.each(TASK_TYPES)('[%s] 全文角括号标签 ⊆ 三 dispatchPrompt 标签（开闭成对，无增员）', (taskType) => {
    const prompt = composeDispatchPrompt(FIXTURES[taskType])
    const found = prompt.match(/<\/?[A-Za-z][A-Za-z0-9-]*>/g) ?? []
    expect(new Set(found)).toEqual(
      new Set([
        `<${XML_TAGS.constraints}>`,
        `</${XML_TAGS.constraints}>`,
        `<${XML_TAGS.taskContext}>`,
        `</${XML_TAGS.taskContext}>`,
        `<${XML_TAGS.typePolicy}>`,
        `</${XML_TAGS.typePolicy}>`,
      ]),
    )
    // Hard Rule：forge-pipeline 属 plugin-forge 系统提示段（3.2），不进 dispatchPrompt
    expect(prompt).not.toContain('<forge-pipeline>')
  })
})

// ─────────────────── AC1：组成序 + digest ───────────────────

describe('AC1 digest = sha-256（全文，含人格段与标签）前 12 hex', () => {
  it('与 node:crypto 逐字等值 + 小写 hex 12 位', () => {
    const prompt = composeDispatchPrompt(FIXTURES['coding-feature'])
    const expected = createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, DISPATCH_DIGEST_LENGTH)
    expect(dispatchDigest(prompt)).toBe(expected)
    expect(dispatchDigest(prompt)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('digest 覆盖人格段与标签（改人格段 → digest 变；改动态块 → digest 变）', () => {
    const base = composeDispatchPrompt(FIXTURES['doc'])
    const baseDigest = dispatchDigest(base)
    const recharted = base.replace(PERSONA_BLOCK, `${PERSONA_BLOCK}\nextra persona line`)
    expect(dispatchDigest(recharted)).not.toBe(baseDigest)
    const recontexted = base.replace(
      '<task-context>',
      `<task-context>\nPHASE_SUMMARY: docs/features/m2-pipeline/tasks/records/1-summary.md`,
    )
    expect(dispatchDigest(recontexted)).not.toBe(baseDigest)
  })

  it('动态载荷注入（BLOCKERS/PHASE_SUMMARY）→ 简报重合成 digest 新值（幂等重入判据）', () => {
    const before = dispatchDigest(composeDispatchPrompt(minimalInput({ taskType: 'coding-feature' })))
    const after = dispatchDigest(
      composeDispatchPrompt({
        ...minimalInput({ taskType: 'coding-feature' }),
        phaseSummary: 'docs/features/m2-pipeline/tasks/records/1-summary.md',
        blockers: [{ slug: 'm2-pipeline', localId: '2.1', taskStatus: 'completed' }],
      }),
    )
    expect(after).not.toBe(before)
  })
})

// ─────────────────── AC2：task-context 动态块键值行 ───────────────────

describe('AC2 <task-context> 键值行（九键；键级零标签）', () => {
  const full = composeDispatchPrompt(FIXTURES['coding-feature'])
  const contextBody = full.slice(
    full.indexOf(`<${XML_TAGS.taskContext}>`) + XML_TAGS.taskContext.length + 2,
    full.indexOf(`</${XML_TAGS.taskContext}>`),
  )

  it('TASK_ID 呈现自然键 slug/localId；TYPE/CATEGORY 恒在场', () => {
    expect(contextBody).toContain('TASK_ID: m2-pipeline/2.2')
    expect(contextBody).toContain('TYPE: coding-feature')
    expect(contextBody).toContain('CATEGORY: coding')
  })

  it('九键行序 = TASK_ID < FILE < TYPE < CATEGORY < BLOCKERS < PHASE_SUMMARY < COVERAGE < PRIORITY < MARKERS', () => {
    const keys = [
      'TASK_ID:',
      'FILE:',
      'TYPE:',
      'CATEGORY:',
      'BLOCKERS:',
      'PHASE_SUMMARY:',
      'COVERAGE:',
      'PRIORITY:',
      'MARKERS:',
    ]
    const positions = keys.map((k) => contextBody.indexOf(k))
    for (const p of positions) expect(p).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]!)
  })

  it('BLOCKERS 快照行 = 前置自然键+状态（领取瞬间注入的列表值）', () => {
    expect(contextBody).toContain('BLOCKERS: 2.1 completed; 1.gate skipped')
  })

  it('COVERAGE 行 = 策略文本（percentage 目标 / maintain）', () => {
    expect(contextBody).toContain('COVERAGE: percentage 80%')
    const maintain = composeDispatchPrompt(FIXTURES['coding-cleanup'])
    expect(maintain).toContain('COVERAGE: maintain')
  })

  it('标记行 = fix-of / breaking（在场者拼接；M3 裁决⑦ main-session 砍除）', () => {
    expect(contextBody).toContain('MARKERS: fix-of m2-pipeline/2.4, breaking')
    expect(contextBody).not.toContain('main-session')
  })

  it('条件键缺席即省行（最小夹具仅恒在场键）', () => {
    const minimal = composeDispatchPrompt(minimalInput({ taskType: 'doc' }))
    for (const key of ['FILE:', 'BLOCKERS:', 'PHASE_SUMMARY:', 'COVERAGE:', 'PRIORITY:', 'MARKERS:']) {
      expect(minimal).not.toContain(key)
    }
  })

  it('键级零标签（task-context 内文为纯键值行——不加键级标签）', () => {
    expect(contextBody).not.toContain('<TASK_ID>')
    expect(contextBody).not.toContain('<BLOCKERS>')
  })
})

// ─────────────────── AC3：20 类型模板族 + ValidTypes ↔ TaskType 映射 ───────────────────

describe('AC3 模板族 exhaustive 路由（TaskType 20 值 = 21 模板 − fix-record-missed）', () => {
  it('模板族键集 ≡ TASK_TYPES（20 值，逐字无增减）', () => {
    expect(Object.keys(TYPE_POLICY_TEMPLATES).sort()).toEqual([...TASK_TYPES].sort())
    expect(TASK_TYPES).toHaveLength(20)
  })

  it('fix-record-missed 不入词汇（降级 run-tasks 内置静态文本——非 core 模板族成员）', () => {
    expect(TASK_TYPES).not.toContain('fix-record-missed' as TaskType)
    expect(Object.keys(TYPE_POLICY_TEMPLATES)).not.toContain('fix-record-missed')
  })

  it('每模板可独立渲染（fixture 上下文 → 非空文本且含 Workflow 字样）', () => {
    for (const taskType of TASK_TYPES) {
      const text = TYPE_POLICY_TEMPLATES[taskType]({ slug: 'm2-pipeline', localId: '2.2' })
      expect(text.length).toBeGreaterThan(0)
      expect(text).toContain('Workflow')
    }
  })

  it('CATEGORY 映射 = 老 forge CategoryForType 平移（六类归属逐点）', () => {
    const expected: Record<TaskType, string> = {
      'coding-feature': 'coding',
      'coding-enhancement': 'coding',
      'coding-cleanup': 'coding',
      'coding-refactor': 'coding',
      'code-quality-simplify': 'coding',
      'coding-fix': 'coding',
      gate: 'gate',
      doc: 'doc',
      'doc-consolidate': 'doc',
      'doc-drift': 'doc',
      'doc-review': 'doc',
      'doc-summary': 'doc',
      'test-run': 'test',
      'test-gen-contracts': 'test',
      'test-gen-journeys': 'test',
      'test-gen-scripts': 'test',
      'validation-code': 'validation',
      'validation-ux': 'validation',
      'eval-contract': 'eval',
      'eval-journey': 'eval',
    }
    for (const taskType of TASK_TYPES) {
      expect(TASK_CATEGORY_FOR_TYPE[taskType]).toBe(expected[taskType])
    }
  })
})

describe('AC1/AC2 COVERAGE 解析（老 forge resolveCoverage 平移：cleanup/refactor 恒 maintain）', () => {
  it('coding 系 + 阈值 → percentage（小数→百分整数）', () => {
    expect(resolveCoverage('coding-feature', 0.8)).toEqual({ strategy: 'percentage', target: 80 })
    expect(resolveCoverage('coding-fix', 0.75)).toEqual({ strategy: 'percentage', target: 75 })
  })

  it('coding-cleanup / coding-refactor 恒 maintain（模板禁止新测试——百分比目标自相矛盾）', () => {
    expect(resolveCoverage('coding-cleanup', 0.8)).toEqual({ strategy: 'maintain' })
    expect(resolveCoverage('coding-refactor', 0.9)).toEqual({ strategy: 'maintain' })
  })

  it('非 coding 系（老 IsTestableType 面）与缺席阈值 → 无 COVERAGE 行', () => {
    expect(resolveCoverage('doc', 0.8)).toBeUndefined()
    expect(resolveCoverage('gate', 0.8)).toBeUndefined()
    expect(resolveCoverage('coding-feature')).toBeUndefined()
  })
})

describe('AC1 约束块单一 TS 源（失败分诊/质量门序列/提交纪律/不越权四节齐备）', () => {
  it('四节关键词在场（快照文本面）', () => {
    expect(CONSTRAINTS_BLOCK).toContain('Failure triage')
    expect(CONSTRAINTS_BLOCK).toContain('Quality gate sequence')
    expect(CONSTRAINTS_BLOCK).toContain('Commit discipline')
    expect(CONSTRAINTS_BLOCK).toContain('no authority escalation')
    expect(CONSTRAINTS_BLOCK).toContain('just compile')
    expect(CONSTRAINTS_BLOCK).toContain('just fmt')
    expect(CONSTRAINTS_BLOCK).toContain('just lint')
  })
})

describe('运行期防御面（词汇外值拒绝——TS 已封，防 as 断言直穿）', () => {
  it('unknown task type → throw', () => {
    expect(() =>
      composeDispatchPrompt({ slug: 'x', localId: '1', taskType: 'nonsense' as TaskType }),
    ).toThrow(/unknown task type/)
  })
})
