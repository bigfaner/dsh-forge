// S2b 快照/契约测试（worker-lean-execution）：dispatchPrompt 收窄为纯任务级单块简报
// （TITLE 裸值首行 + `<goal>` 包围目标 + SURFACE 行 + ACCEPTANCE_CRITERIA 单行化 + 结算出口一句；
// 无 <task-context> 外包裹）。反锚（SC9）：无人格段/无约束块/无工作流段（agent 级内容迁 persona——
// persona.ts 单源，system 面承载）。快照 ×20 = 任务级简报字节级 pin（digest 契约回归面：任何键/行序改动
// 都在快照 diff 显形）。
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'
import {
  composeDispatchPrompt,
  resolveCoverage,
  RESUME_POINTER_BLOCK,
  SETTLEMENT_EXIT_LINE,
  TASK_CATEGORY_FOR_TYPE,
  type DispatchPromptInput,
} from './compose.js'
import { DISPATCH_DIGEST_LENGTH, dispatchDigest } from './digest.js'
import { ANTI_CHURN_ANCHORS, PERSONA_CORE_SECTION, composePersona } from './persona.js'

/** 全载荷夹具（全键在场——快照覆盖每键行形态；5.3 任务规格内嵌三键入载荷） */
function fullInput(o: { taskType: TaskType }): DispatchPromptInput {
  return {
    slug: 'm2-pipeline',
    localId: '2.2',
    taskType: o.taskType,
    title: '派发简报模板族（20 类型路由）',
    goal: '达成：简报仅承载任务级内容，纪律面全部迁 persona 承载',
    acceptanceCriteria: ['快照与简报逐字一致', '块序恒定'],
    vars: { SOURCE_FILES: 'packages/core/src/forge/tasks/prompt/', TEST_SCRIPT: 'just test' },
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
    surfaceKey: 'web',
    surfaceType: 'web',
  }
}

/** 最小夹具（仅恒在场键——快照覆盖条件键缺席形态） */
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

// ─────────────────── AC4（S2b 重写）：快照 ×20 + 任务级反锚（SC9） ───────────────────

describe.each(TASK_TYPES)('AC4 dispatchPrompt 快照·任务级收窄 [%s]', (taskType) => {
  it('全文快照 + 无包裹单块简报 + 任务级键在场', () => {
    const prompt = composeDispatchPrompt(FIXTURES[taskType])
    expect(prompt).toMatchSnapshot()

    expect(prompt).not.toContain('<task-context>')
    // TITLE 裸值首行（无键前缀）；缺席时首行 = TASK_ID
    const firstLine = prompt.split('\n')[0]!
    const fx = FIXTURES[taskType]!
    expect(firstLine).toBe(fx.title ?? `TASK_ID: ${fx.slug}/${fx.localId}`)
    expect(prompt).toContain(`TASK_ID: ${fx.slug}/${fx.localId}`)
    expect(prompt).toContain('Settlement exit:')
  })

  it('SC9 反锚：无人格段/无约束块/无工作流段/无共享段（agent 级内容在 persona 面）', () => {
    const prompt = composeDispatchPrompt(FIXTURES[taskType])
    for (const antiAnchor of [
      'You are',
      '<constraints>',
      '<type-policy>',
      'Workflow',
      'Quality gate sequence',
      'Coding Strategy',
      'SPEC-CODE SCAN',
      'Reference Files',
      'Record Fields',
      'submit-task skill only after',
    ]) {
      expect(prompt, `反锚缺席：${antiAnchor}`).not.toContain(antiAnchor)
    }
    // 双产物对偶：同类型的 persona 产物确含被迁出的段（分层承载成立，非内容丢失）
    const persona = composePersona(taskType, 'medium')
    expect(persona).toContain(PERSONA_CORE_SECTION)
  })
})

// ─────────────────── AC5（S2b 重写）：XML 标签集封闭——仅 <goal> 开闭对 ───────────────────

describe('AC5 XML 标签封闭（仅 <goal> 包围目标；<task-context>/<forge-pipeline> 不进）', () => {
  it.each(TASK_TYPES)('[%s] 全文角括号标签 = goal 开闭对（无增员）', (taskType) => {
    const prompt = composeDispatchPrompt(FIXTURES[taskType])
    const found = prompt.match(/<\/?[A-Za-z][A-Za-z0-9-]*>/g) ?? []
    expect(new Set(found)).toEqual(
      new Set(FIXTURES[taskType]!.goal === undefined ? [] : ['<goal>', '</goal>']),
    )
    // Hard Rule：forge-pipeline 属 plugin-forge 系统提示段（3.2），不进 dispatchPrompt
    expect(prompt).not.toContain('<forge-pipeline>')
  })
})

// ─────────────────── AC1：digest 语义不变（对全文取指纹——对账锚不受迁移影响） ───────────────────

describe('AC1 digest = sha-256（全文，含标签与任务级载荷）前 12 hex', () => {
  it('与 node:crypto 逐字等值 + 小写 hex 12 位', () => {
    const prompt = composeDispatchPrompt(FIXTURES['coding-feature'])
    const expected = createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, DISPATCH_DIGEST_LENGTH)
    expect(dispatchDigest(prompt)).toBe(expected)
    expect(dispatchDigest(prompt)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('digest 覆盖任务级载荷（改 GOAL/动态块 → digest 变）', () => {
    const base = composeDispatchPrompt(FIXTURES['doc'])
    const baseDigest = dispatchDigest(base)
    const regoaled = base.replace('TYPE: doc', 'TYPE: docx-extra')
    expect(dispatchDigest(regoaled)).not.toBe(baseDigest)
    const recontexted = base.replace(
      'TASK_ID:',
      `PHASE_SUMMARY: docs/features/m2-pipeline/tasks/records/1-summary.md\nTASK_ID:`,
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

// ─────────────────── AC2（S2b）：简报键值行 ───────────────────

describe('AC2 简报键值行（键级零标签）', () => {
  const ctx = composeDispatchPrompt(FIXTURES['coding-feature'])

  it('TITLE 裸值首行（无 TITLE: 前缀）；TASK_ID 呈现自然键 slug/localId；TYPE/CATEGORY 恒在场', () => {
    expect(ctx.split('\n')[0]).toBe('派发简报模板族（20 类型路由）')
    expect(ctx).not.toContain('TITLE:')
    expect(ctx).toContain('TASK_ID: m2-pipeline/2.2')
    expect(ctx).toContain('TYPE: coding-feature')
    expect(ctx).toContain('CATEGORY: coding')
  })

  it('TITLE 缺席 → 首行 = TASK_ID 行', () => {
    const noTitle = composeDispatchPrompt(minimalInput({ taskType: 'doc' }))
    expect(noTitle.split('\n')[0]).toBe('TASK_ID: m2-pipeline/3.1')
  })

  it('键值行序 = TASK_ID < FILE < TYPE < CATEGORY < SURFACE < BLOCKERS < PHASE_SUMMARY < COVERAGE < PRIORITY < MARKERS < VARS（SURFACE = S2b 增键，紧随 CATEGORY——SC3）', () => {
    const keys = [
      'TASK_ID:',
      'FILE:',
      'TYPE:',
      'CATEGORY:',
      'SURFACE:',
      'BLOCKERS:',
      'PHASE_SUMMARY:',
      'COVERAGE:',
      'PRIORITY:',
      'MARKERS:',
      'VARS:',
    ]
    const positions = keys.map((k) => ctx.indexOf(k))
    for (const p of positions) expect(p).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]!)
  })

  it('SURFACE 行 = SC3 单行双值 `web (web)`；type 缺席单值；key 缺席省行', () => {
    expect(ctx).toContain('SURFACE: web (web)')
    const keyOnly = composeDispatchPrompt({ ...minimalInput({ taskType: 'doc' }), surfaceKey: 'api' })
    expect(keyOnly).toContain('SURFACE: api')
    expect(keyOnly).not.toContain('SURFACE: api (')
    const none = composeDispatchPrompt(minimalInput({ taskType: 'doc' }))
    expect(none).not.toContain('SURFACE:')
  })

  it('BLOCKERS 快照行 = 前置自然键+状态（领取瞬间注入的列表值）', () => {
    expect(ctx).toContain('BLOCKERS: 2.1 completed; 1.gate skipped')
  })

  it('COVERAGE 行 = 策略文本（percentage 目标 / maintain）', () => {
    expect(ctx).toContain('COVERAGE: percentage 80%')
    const maintain = composeDispatchPrompt(FIXTURES['coding-cleanup'])
    expect(maintain).toContain('COVERAGE: maintain')
  })

  it('标记行 = fix-of / breaking（在场者拼接；M3 裁决⑦ main-session 砍除）', () => {
    expect(ctx).toContain('MARKERS: fix-of m2-pipeline/2.4, breaking')
    expect(ctx).not.toContain('main-session')
  })

  it('VARS 行 = 键序字母序 KEY=VALUE 分号拼接（vars 注入面——SKIP_EVAL_GATE/fix 链契约的送达面）；空对象省行', () => {
    expect(ctx).toContain('VARS: SOURCE_FILES=packages/core/src/forge/tasks/prompt/; TEST_SCRIPT=just test')
    const emptyVars = composeDispatchPrompt({ ...minimalInput({ taskType: 'coding-fix' }), vars: {} })
    expect(emptyVars).not.toContain('VARS:')
  })

  it('条件键缺席即省行（最小夹具仅恒在场键 + 结算出口句恒在场）', () => {
    const minimal = composeDispatchPrompt(minimalInput({ taskType: 'doc' }))
    for (const key of ['FILE:', 'BLOCKERS:', 'PHASE_SUMMARY:', 'COVERAGE:', 'PRIORITY:', 'MARKERS:', 'TITLE:', 'VARS:', '<goal>', 'ACCEPTANCE_CRITERIA:', 'SURFACE:']) {
      expect(minimal).not.toContain(key)
    }
    expect(minimal).toContain(SETTLEMENT_EXIT_LINE)
  })

  it('键级零标签（简报正文为纯键值行——除 <goal> 外不加键级标签）', () => {
    expect(ctx).not.toContain('<TASK_ID>')
    expect(ctx).not.toContain('<BLOCKERS>')
  })
})

// ─────────────────── M3 2.4：SOURCE 容器语境行（任务带容器出厂） ───────────────────

describe('M3 2.4 SOURCE 容器语境行（Interface 1：SOURCE: feature|proposal <slug>）', () => {
  it('feature 容器 → `SOURCE: feature <slug>`；行序紧随 TASK_ID、先于 TYPE', () => {
    const prompt = composeDispatchPrompt({
      ...fullInput({ taskType: 'coding-feature' }),
      source: { kind: 'feature', slug: 'm2-pipeline' },
    })
    expect(prompt).toContain('SOURCE: feature m2-pipeline')
    const at = (k: string): number => prompt.indexOf(k)
    expect(at('SOURCE: feature m2-pipeline')).toBeGreaterThan(at('TASK_ID: m2-pipeline/2.2'))
    expect(at('TYPE:')).toBeGreaterThan(at('SOURCE: feature m2-pipeline'))
  })

  it('proposal 容器 → `SOURCE: proposal <slug>`', () => {
    const prompt = composeDispatchPrompt({
      ...minimalInput({ taskType: 'coding-feature' }),
      source: { kind: 'proposal', slug: 'blitz-idea' },
    })
    expect(prompt).toContain('SOURCE: proposal blitz-idea')
    expect(prompt).not.toContain('SOURCE: feature')
  })

  it('条件键缺席即省行（M2 形态兼容——source 缺席无 SOURCE 行）', () => {
    const prompt = composeDispatchPrompt(minimalInput({ taskType: 'doc' }))
    expect(prompt).not.toContain('SOURCE:')
  })

  it('source 注入 → digest 新值（简报重合成判据同族）', () => {
    const base = dispatchDigest(composeDispatchPrompt(minimalInput({ taskType: 'coding-feature' })))
    const withSource = dispatchDigest(
      composeDispatchPrompt({
        ...minimalInput({ taskType: 'coding-feature' }),
        source: { kind: 'feature', slug: 'm2-pipeline' },
      }),
    )
    expect(withSource).not.toBe(base)
  })
})

// ─────────────────── 5.3/S2b：任务规格内嵌（TITLE 首行 + <goal> 段 + AC 单行化 + 结算出口） ───────────────────

describe('5.3/S2b 任务规格内嵌：TITLE 首行 + <goal> 段 + AC 段 + 结算出口句', () => {
  it('全载荷：TITLE 裸值首行 + <goal> 包围目标与 AC（结果导向，原 DESCRIPTION 键更名）+ 结算出口句收尾', () => {
    const prompt = composeDispatchPrompt(fullInput({ taskType: 'coding-feature' }))
    expect(prompt).toContain(
      '<goal>\n达成：简报仅承载任务级内容，纪律面全部迁 persona 承载\nACCEPTANCE_CRITERIA:\n- 快照与简报逐字一致\n- 块序恒定\n</goal>',
    )
    expect(prompt).not.toContain('DESCRIPTION:')
    expect(prompt.indexOf('<goal>')).toBeGreaterThan(prompt.indexOf('VARS:'))
    expect(prompt.indexOf(SETTLEMENT_EXIT_LINE)).toBeGreaterThan(prompt.indexOf('</goal>'))
    expect(prompt.trimEnd().endsWith(SETTLEMENT_EXIT_LINE)).toBe(true)
  })

  it('AC 条目单行化（S2b：换行折叠空格——机械提取无歧义，criterion 交叉校验同源）', () => {
    const prompt = composeDispatchPrompt({
      ...minimalInput({ taskType: 'doc' }),
      acceptanceCriteria: ['多行条目第一行\n第二行续', '单行条目'],
    })
    expect(prompt).toContain('ACCEPTANCE_CRITERIA:\n- 多行条目第一行 第二行续\n- 单行条目')
  })

  it('任务体收尾（结算出口句为全文最后一行；目标内容不越收尾句）', () => {
    const prompt = composeDispatchPrompt(fullInput({ taskType: 'coding-feature' }))
    expect(prompt.lastIndexOf('\n')).toBe(prompt.length - SETTLEMENT_EXIT_LINE.length - 1)
    expect(prompt.slice(prompt.indexOf(SETTLEMENT_EXIT_LINE))).not.toContain('达成：简报仅承载任务级内容')
  })

  it('仅 AC 在场（无目标）→ <goal> 只含 ACCEPTANCE_CRITERIA；两者皆缺 → 省段', () => {
    const acOnly = composeDispatchPrompt({
      ...minimalInput({ taskType: 'doc' }),
      acceptanceCriteria: ['仅验收条目'],
    })
    expect(acOnly).toContain('<goal>\nACCEPTANCE_CRITERIA:\n- 仅验收条目\n</goal>')
    const none = composeDispatchPrompt({
      ...minimalInput({ taskType: 'doc' }),
      goal: undefined,
      acceptanceCriteria: [],
    })
    expect(none).not.toContain('<goal>')
  })

  it('GOAL 单独在场（无 AC）→ 仅目标入 <goal>；空 AC 数组 → AC 省段', () => {
    const goalOnly = composeDispatchPrompt({
      ...minimalInput({ taskType: 'doc' }),
      title: '仅有目标的任务',
      goal: '一行目标',
      acceptanceCriteria: [],
    })
    expect(goalOnly).toContain('<goal>\n一行目标\n</goal>')
    expect(goalOnly).not.toContain('ACCEPTANCE_CRITERIA:')
  })

  it('任务规格注入 → digest 新值（简报重合成判据同族——规格变更 = 新简报）', () => {
    const base = dispatchDigest(composeDispatchPrompt(minimalInput({ taskType: 'doc' })))
    const withSpec = dispatchDigest(
      composeDispatchPrompt({ ...minimalInput({ taskType: 'doc' }), title: 'T', goal: 'D' }),
    )
    expect(withSpec).not.toBe(base)
  })
})

// ─────────────────── CATEGORY 映射（submit-task 路由面保持） ───────────────────

describe('CATEGORY 映射 = 老 forge CategoryForType 平移（六类归属逐点）', () => {
  it('20 类型归属逐点', () => {
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

describe('S2b 分层对偶（SC9 双产物）：persona 面承载被迁出内容', () => {
  it('反搅动锚 ×6 与核心段在 persona 产物恒定在场（20 类型穷尽——SC6/SC10 对偶锚）', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      for (const anchor of ANTI_CHURN_ANCHORS) expect(persona, `${taskType} 反搅动锚`).toContain(anchor)
      expect(persona).toContain('AC 逐项核查不变量')
    }
  })

  it('dispatchPrompt 与 persona 零文本交叠（任务级 vs agent 级分层收口）', () => {
    const prompt = composeDispatchPrompt(fullInput({ taskType: 'coding-feature' }))
    const persona = composePersona('coding-feature', 'medium')
    for (const line of persona.split('\n').filter((l) => l.trim().length > 20)) {
      expect(prompt).not.toContain(line)
    }
  })
})

describe('运行期防御面（词汇外值拒绝——TS 已封，防 as 断言直穿）', () => {
  it('unknown task type → throw', () => {
    expect(() =>
      composeDispatchPrompt({ slug: 'x', localId: '1', taskType: 'nonsense' as TaskType }),
    ).toThrow(/unknown task type/)
  })
})

// ─────────────────── worker-exec-evidence-replay 1.3：EVIDENCE 续跑指针行（Solution③/SC3） ───────────────────

describe('1.3 EVIDENCE 续跑指针行（重入派发 brief 自动携带——首步读指针续跑）', () => {
  it('evidencePointer 在场 → EVIDENCE 行（相对路径 + 首步读指针续跑指令），VARS 之后、<goal> 之前', () => {
    const prompt = composeDispatchPrompt({
      ...fullInput({ taskType: 'coding-feature' }),
      evidencePointer: 'logs/m2-pipeline/2.2/resume.md',
    })
    expect(prompt).toContain('EVIDENCE: logs/m2-pipeline/2.2/resume.md')
    expect(prompt).toContain('首步读取')
    expect(prompt).toContain('从最后落盘点续跑')
    expect(prompt).not.toContain('会话快照')
    const at = (k: string): number => prompt.indexOf(k)
    expect(at('EVIDENCE:')).toBeGreaterThan(at('VARS:'))
    expect(at('<goal>')).toBeGreaterThan(at('EVIDENCE:'))
  })

  it('evidencePointer 缺席 → 省行（零证据位 = 首跑零行，M2 形态兼容）', () => {
    const prompt = composeDispatchPrompt(minimalInput({ taskType: 'coding-feature' }))
    expect(prompt).not.toContain('EVIDENCE:')
  })

  it('evidencePointer 注入 → digest 新值（简报重合成判据同族）', () => {
    const base = dispatchDigest(composeDispatchPrompt(minimalInput({ taskType: 'coding-feature' })))
    const withPointer = dispatchDigest(
      composeDispatchPrompt({
        ...minimalInput({ taskType: 'coding-feature' }),
        evidencePointer: 'logs/m2-pipeline/3.1/resume.md',
      }),
    )
    expect(withPointer).not.toBe(base)
  })

  it('断点续跑约束块（worker 系统提示词硬约定——单行 + 指针路径模板 + 续跑指令），persona 面恒定在场', () => {
    expect(RESUME_POINTER_BLOCK).not.toContain('\n')
    expect(RESUME_POINTER_BLOCK).toContain('logs/{slug}/{task-local-id}/resume.md')
    expect(RESUME_POINTER_BLOCK).toContain('已完成轮次')
    expect(RESUME_POINTER_BLOCK).toContain('已清零簇')
    expect(RESUME_POINTER_BLOCK).toContain('证据目录指针')
    for (const taskType of TASK_TYPES) {
      expect(composePersona(taskType, 'medium')).toContain(RESUME_POINTER_BLOCK)
    }
  })
})
