// persona 组成矩阵单测（提案 worker-lean-execution S2a AC）：×20 类型 ×low/medium/high
// 全矩阵——核心段①-⑧一切类型在场、反搅动锚 ×6 恒定、变体按 20 类型表路由、
// Coding Strategy 9 类注入面、low 裁剪不触及核心段与 AC 核查、裸 `{{` 防护、
// UI 任务不作特殊处理（coding-feature/enhancement 引导为「—」，无 UI 专属锚）。
// 文案语言裁决（2026-10-12）：除术语外中文——锚文本随迁；目标导向（先规划后行动、
// todo 先行）与 e2e 证据落盘锚同步断言。
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
  '### 1. 风格与工作纪律',
  '### 2. 失败分诊',
  '### 3. 提交纪律与不越权',
  '### 4. 如实上报',
  '### 5. 反搅动纪律',
  '### 6. 产物落盘约定',
  '### 7. todo_write 引导',
  '### 8. ask 二分',
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
        expect(persona).toContain('AC 逐项核查不变量')
        expect(persona).toContain('logs/<slug>/<taskKey>/')
      }
    }
  })

  it('目标导向强制：开场即宣告先规划后行动；todo 先行 + 全绿才结算锚恒定', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain('目标导向：先规划（todo_write 待办清单）后行动')
        expect(persona, `${taskType}/${cx}`).toContain('领取后第一步（先于任何探索/改动）：用 todo_write')
        expect(persona, `${taskType}/${cx}`).toContain('全部 completed 才允许 submitTask')
      }
    }
  })

  it('e2e/验收证据落盘锚：核心段第 6 节强制临时产物（含证据票据）统一归档', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).toContain('特别是 e2e/验收测试的证据票据')
      expect(persona).toContain('避免复跑从头再来')
      expect(persona).toContain('一任务一文件夹、一事件一子文件夹')
    }
  })

  it('旧审计条款移除：任务定义/执行记录保护句不再出现（任务内容与记录已入库）', () => {
    for (const taskType of TASK_TYPES) {
      expect(composePersona(taskType, 'medium')).not.toContain('docs/**/tasks/**')
      expect(composePersona(taskType, 'medium')).not.toContain('audit artifacts')
    }
  })

  it('变体段路由：专家身份首行逐类型在位（20 类型表唯一权威）', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      const variantHead = persona.slice(persona.indexOf('## 类型变体'))
      expect(variantHead).toContain(`## 类型变体：${taskType}`)
      expect(variantHead).toContain(`专家身份：${PERSONA_VARIANTS[taskType].expert}`)
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
      expect(low).toContain('AC 逐项核查不变量')
    }
  })

  it('门禁分级：low 与 medium/high 呈现不同保底门分级行', () => {
    const low = composePersona('coding-feature', 'low')
    const medium = composePersona('coding-feature', 'medium')
    expect(low).toContain('复杂度=low')
    expect(medium).toContain('复杂度=medium|high')
    expect(medium).not.toContain('复杂度=low')
  })

  it('门禁变体按类型表路由：gate=全面 / doc=无编译测试门 / test-run=报告即产物', () => {
    expect(composePersona('gate', 'medium')).toContain('全面测试分层')
    expect(composePersona('doc', 'medium')).toContain('无编译/测试门')
    expect(composePersona('test-run', 'medium')).toContain('测试报告本身即交付物')
    expect(composePersona('validation-code', 'medium')).toContain('绝不改码')
  })

  it('Record Fields 按类型族路由', () => {
    expect(composePersona('coding-fix', 'medium')).toContain('记录字段：testsPassed、testsFailed、coverage')
    expect(composePersona('doc-review', 'medium')).toContain('记录字段：referencedDocs、reviewStatus、docMetrics')
    expect(composePersona('gate', 'medium')).toContain('记录字段：gateChecks')
    expect(composePersona('eval-journey', 'medium')).toContain('记录字段：—（eval 结果留在 vars_json')
  })

  it('专属引导：test-run/validation-ux/eval 在场，其余为「—」', () => {
    expect(composePersona('test-run', 'medium')).toContain('专属引导：run-tests 技能为强制')
    expect(composePersona('validation-ux', 'medium')).toContain('专属引导：视觉验收主径')
    expect(composePersona('eval-contract', 'medium')).toContain('专属引导：评分产物按产物落盘约定落盘')
    for (const taskType of TASK_TYPES) {
      if (PERSONA_VARIANTS[taskType].guidance === undefined) {
        expect(composePersona(taskType, 'medium')).toContain('专属引导：—')
      }
    }
  })

  it('UI 任务不作特殊处理：coding-feature/enhancement 引导为「—」且变体段无 UI 专属锚', () => {
    for (const taskType of ['coding-feature', 'coding-enhancement'] as const) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        const variantHead = persona.slice(persona.indexOf('## 类型变体'))
        expect(persona).toContain('专属引导：—')
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
