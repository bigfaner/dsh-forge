// persona 组成矩阵单测（提案 worker-lean-execution S2a AC）：×20 类型 ×low/medium/high
// 全矩阵——核心段①-⑧一切类型在场、反搅动锚 ×6 恒定、变体按 20 类型表路由、
// Coding Strategy 9 类注入面、low 裁剪不触及核心段与 AC 核查、裸 `{{` 防护、
// UI 任务不作特殊处理（coding-feature/enhancement 引导为「—」，无 UI 专属锚）。
import { describe, expect, it } from 'vitest'
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'
import {
  ANTI_CHURN_ANCHORS,
  CODING_STRATEGY_SECTION,
  CODING_STRATEGY_TYPES,
  composePersona,
  PERSONA_CORE_SECTION,
  PERSONA_VARIANTS,
  type PersonaComplexity,
} from './persona.js'

const COMPLEXITIES: readonly PersonaComplexity[] = ['low', 'medium', 'high']

/** 核心段①-⑧锚（每节标题——穷尽断言的稳定基面） */
const CORE_SECTION_ANCHORS = [
  '### 1. Style & working discipline',
  '### 2. Failure triage',
  '### 3. Commit discipline & no authority escalation',
  '### 4. Honest reporting',
  '### 5. Anti-churn discipline',
  '### 6. Artifact persistence',
  '### 7. todo_write guidance',
  '### 8. Ask triage (binary)',
]

describe('persona 组成矩阵（×20 类型 ×3 复杂度）', () => {
  it('20 类型变体表穷尽（Record<TaskType,…> 编译期 + 运行期双锚）', () => {
    expect(Object.keys(PERSONA_VARIANTS).sort()).toEqual([...TASK_TYPES].sort())
  })

  it('全矩阵：核心段①-⑧ + 反搅动锚 ×6 + AC 核查不变量恒定在场', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        for (const anchor of CORE_SECTION_ANCHORS) {
          expect(persona, `${taskType}/${cx} missing ${anchor}`).toContain(anchor)
        }
        for (const anchor of ANTI_CHURN_ANCHORS) {
          expect(persona, `${taskType}/${cx} missing anti-churn anchor`).toContain(anchor)
        }
        expect(persona).toContain('AC item-by-item check is invariable')
        expect(persona).toContain('logs/<slug>/<taskKey>/')
      }
    }
  })

  it('变体段路由：专家身份首行逐类型在位（20 类型表唯一权威）', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      const variantHead = persona.slice(persona.indexOf('## Type Variant'))
      expect(variantHead).toContain(`## Type Variant: ${taskType}`)
      expect(variantHead).toContain(`Expert: ${PERSONA_VARIANTS[taskType].expert}`)
    }
  })

  it('Coding Strategy 注入面：coding 族 9 类含段，其余 11 类不含', () => {
    expect(CODING_STRATEGY_TYPES).toHaveLength(9)
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        if (CODING_STRATEGY_TYPES.includes(taskType)) {
          expect(persona, `${taskType}/${cx}`).toContain(CODING_STRATEGY_SECTION)
        } else {
          expect(persona, `${taskType}/${cx}`).not.toContain('### Coding Strategy')
        }
      }
    }
  })

  it('low 裁剪只触及变体段：TDD/SCAN 段缺席，核心段与 AC 核查在位', () => {
    for (const taskType of CODING_STRATEGY_TYPES) {
      const low = composePersona(taskType, 'low')
      const high = composePersona(taskType, 'high')
      expect(low).not.toContain('SPEC-CODE SCAN')
      if (['coding-feature', 'coding-enhancement', 'coding-cleanup', 'coding-refactor', 'coding-fix'].includes(taskType)) {
        expect(high, taskType).toContain('SPEC-CODE SCAN')
      }
      // 裁剪不触及核心段：核心段文本逐字保留
      expect(low).toContain(PERSONA_CORE_SECTION)
      expect(low).toContain('AC item-by-item check is invariable')
    }
  })

  it('门纪律分级：low 与 medium/high 呈现不同保底门分级行', () => {
    const low = composePersona('coding-feature', 'low')
    const medium = composePersona('coding-feature', 'medium')
    expect(low).toContain('complexity=low')
    expect(medium).toContain('complexity=medium|high')
    expect(medium).not.toContain('complexity=low')
  })

  it('门纪律变体按类型表路由：gate=全面 / doc=无编译测试门 / test-run=报告即产物', () => {
    expect(composePersona('gate', 'medium')).toContain('Full test layering')
    expect(composePersona('doc', 'medium')).toContain('No compile/test gate')
    expect(composePersona('test-run', 'medium')).toContain('report itself is the deliverable')
    expect(composePersona('validation-code', 'medium')).toContain('never fix code')
  })

  it('Record Fields 按类型族路由', () => {
    expect(composePersona('coding-fix', 'medium')).toContain('Record Fields: testsPassed, testsFailed, coverage')
    expect(composePersona('doc-review', 'medium')).toContain('Record Fields: referencedDocs, reviewStatus, docMetrics')
    expect(composePersona('gate', 'medium')).toContain('Record Fields: gateChecks')
    expect(composePersona('eval-journey', 'medium')).toContain('Record Fields: — (eval keeps results in vars_json')
  })

  it('专属引导：test-run/validation-ux/eval 在场，其余为「—」', () => {
    expect(composePersona('test-run', 'medium')).toContain('Guidance: run-tests skill is MANDATORY')
    expect(composePersona('validation-ux', 'medium')).toContain('Guidance: Visual-acceptance main path')
    expect(composePersona('eval-contract', 'medium')).toContain('Guidance: Score artifacts land on disk')
    for (const taskType of TASK_TYPES) {
      if (PERSONA_VARIANTS[taskType].guidance === undefined) {
        expect(composePersona(taskType, 'medium')).toContain('Guidance: —')
      }
    }
  })

  it('UI 任务不作特殊处理：coding-feature/enhancement 引导为「—」且无 UI 专属锚', () => {
    for (const taskType of ['coding-feature', 'coding-enhancement'] as const) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        const variantHead = persona.slice(persona.indexOf('## Type Variant'))
        expect(persona).toContain('Guidance: —')
        expect(variantHead).not.toContain('UI')
        expect(variantHead).not.toContain('e2e')
      }
    }
  })

  it('裸 {{ 防护：全矩阵产出无裸 {{（上游严格插值）', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        expect(composePersona(taskType, cx)).not.toContain('{{')
      }
    }
  })

  it('doc.fix 未迁移：不在 TaskType 词汇 → 无变体且运行期抛错', () => {
    expect(TASK_TYPES).not.toContain('doc.fix')
    expect(() => composePersona('doc.fix' as TaskType, 'medium')).toThrow('unknown task type')
  })
})
