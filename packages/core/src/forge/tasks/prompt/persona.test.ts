// persona 组成矩阵单测（提案 worker-lean-execution S2a AC）：×20 类型 ×low/medium/high
// 全矩阵——核心段①-⑧一切类型在场、反搅动锚 ×6 恒定、变体按 20 类型表路由、
// Coding Strategy 9 类注入面、low 裁剪不触及核心段与 AC 核查、裸 `{{` 防护、
// UI 任务不作特殊处理（coding-feature/enhancement 无专属引导行）。
// 文案语言裁决（2026-10-12）：除术语外中文；目标导向 todo 先行（§7 单源）；
// e2e 证据落盘锚；任务元数据（类型/复杂度标签）不入 persona——路由断言走身份行与门禁事实。
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

  it('身份行：角色名 + 行事信条显词连接（无中划线拼贴），×20 逐类型断言', () => {
    for (const taskType of TASK_TYPES) {
      const { title, creed } = PERSONA_VARIANTS[taskType].expert
      const persona = composePersona(taskType, 'medium')
      expect(persona, taskType).toContain(`你是${title}。行事信条：${creed}。`)
    }
  })

  it('任务元数据不入 persona：无「类型变体」标签、无复杂度标签、类型名不出现', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).not.toContain('类型变体')
      expect(persona).not.toContain('复杂度=')
    }
    // 路由可观测性改走门禁/工作流差异（SC10 断言面迁移）：抽样三类互异
    expect(composePersona('gate', 'medium')).toContain('全面测试分层')
    expect(composePersona('doc', 'medium')).toContain('无编译/测试门')
    expect(composePersona('test-run', 'medium')).toContain('测试报告本身即交付物')
  })

  it('目标导向 todo 先行（§7 单源）：第一步建单 + 全 completed 才结算，恒定在场', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain('领取后第一步（先于任何探索/改动）：用 todo_write')
        expect(persona, `${taskType}/${cx}`).toContain('全部 completed 才允许 submitTask')
        expect(persona, `${taskType}/${cx}`).not.toContain('可跳过建单') // 强制语义——无豁免口子
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

  it('门禁术语统一：产出零「门纪律」残留', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        expect(composePersona(taskType, cx), `${taskType}/${cx}`).not.toContain('门纪律')
      }
    }
    expect(composePersona('coding-fix', 'medium')).toContain('## 门禁')
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

  it('low 裁剪只触及变体段：SCAN 段缺席，核心段与 AC 核查在位', () => {
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

  it('门禁分级方向（对齐提案 S1）：low = ①收窄改动包 + ③保底全走；medium/high = ①含依赖包全走', () => {
    const low = composePersona('coding-feature', 'low')
    const medium = composePersona('coding-feature', 'medium')
    expect(low).toContain('改动包的类型检查')
    expect(low).toContain('不含直接依赖它的包')
    expect(low).toContain('保底全走')
    expect(low).not.toContain('（含直接依赖它的包）') // low 下第 1 项收窄——依赖包不进保底门
    expect(medium).toContain('受影响包的类型检查/构建（含直接依赖它的包）')
    // coding-cleanup/refactor 的 COVERAGE=maintain 变体随门禁在位
    expect(composePersona('coding-cleanup', 'medium')).toContain('COVERAGE=maintain')
    expect(composePersona('coding-refactor', 'low')).toContain('COVERAGE=maintain')
  })

  it('工作流变体：cleanup 的 SCAN 为附加段形态（非计步）；fix 高档含错误分诊首步', () => {
    expect(composePersona('coding-cleanup', 'high')).toContain('Step 1.5 简化后缀附加段')
    expect(composePersona('coding-fix', 'high')).toContain('错误分诊')
    expect(composePersona('coding-fix', 'low')).not.toContain('错误分诊')
  })

  it('结算面聚合：记录字段按类型族路由 + 用途注记；无引导类型整行省略', () => {
    expect(composePersona('coding-fix', 'medium')).toContain(
      '记录字段：testsPassed、testsFailed、coverage（submitTask 结算面按此填报）',
    )
    expect(composePersona('doc-review', 'medium')).toContain(
      '记录字段：referencedDocs、reviewStatus、docMetrics（submitTask 结算面按此填报）',
    )
    expect(composePersona('gate', 'medium')).toContain('记录字段：gateChecks')
    expect(composePersona('eval-journey', 'medium')).toContain('记录字段：—（eval 结果留在 vars_json')
    // 无专属引导：整行省略（非「—」占位）
    expect(composePersona('coding-feature', 'medium')).not.toContain('专属引导')
    expect(composePersona('test-run', 'medium')).toContain('专属引导：run-tests 技能为强制')
    expect(composePersona('validation-ux', 'medium')).toContain('专属引导：视觉验收主径')
    expect(composePersona('eval-contract', 'medium')).toContain('专属引导：评分产物按产物落盘约定落盘')
  })

  it('UI 任务不作特殊处理：coding-feature/enhancement 无 UI 专属锚（核心段 §6 截图通则除外）', () => {
    for (const taskType of ['coding-feature', 'coding-enhancement'] as const) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        const variantTail = persona.slice(persona.indexOf('### Coding Strategy') + 1 || persona.indexOf('工作流'))
        expect(persona).not.toContain('专属引导')
        expect(variantTail).not.toContain('UI')
        expect(variantTail).not.toContain('e2e')
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
