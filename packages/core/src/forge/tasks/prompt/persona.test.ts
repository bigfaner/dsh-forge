// persona 组成单测（expert-squad-forge 1.3 合成点改造）：程序段（composePersona——核心
// 纪律/共享策略/复杂度保底门）+ 档案人格段组装（composePersonaWithProfile）。类型级人格
// 内容（title/creed/gate 指引/workflow 叙述）已迁专家档案（persona-migration-audit.md
// 留痕）——本文件断言程序段零类型内容残留与两段组装语义。
import { describe, expect, it } from 'vitest'
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'
import {
  ANTI_CHURN_ANCHORS,
  CODING_STRATEGY_SECTION,
  CODING_STRATEGY_TYPES,
  PERSONA_CORE_SECTION,
  TESTING_STRATEGY_SECTION,
  baselineGate,
  composePersona,
  composePersonaWithProfile,
  renderExpertProfileSection,
  type ExpertPersonaProfile,
  type PersonaComplexity,
} from './persona.js'

const COMPLEXITIES: readonly PersonaComplexity[] = ['low', 'medium', 'high']

/** 档案夹具（合成组装面测试——档案解析/映射键解析归 plugin-forge faces/plugin 测试） */
const PROFILE: ExpertPersonaProfile = {
  name: 'coding-fix',
  title: '缺陷修复专家',
  personaMd:
    '## 职责\n\n先以失败复现测试钉住根因，再做最小化修复。\n\n## 边界\n\n- 不引入超出问题范围的改动。\n\n## 信条\n\n先通过复现定位根因，再最小化修复，不引入超出问题范围的改动。',
}

describe('composePersona 程序段（×20 类型 ×3 复杂度）', () => {
  it('类型词汇全覆盖 + 恒定段在场：核心纪律段、反搅动锚 ×6、AC 核查不变量、产物落盘变量指称、质量门禁节', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain(PERSONA_CORE_SECTION)
        for (const anchor of ANTI_CHURN_ANCHORS) {
          expect(persona, `${taskType}/${cx} missing anchor`).toContain(anchor)
        }
        expect(persona).toContain('AC 逐项核查不变量')
        // 产物/续跑路径只引用花括号变量（值由任务目录锚点节承载——persona 零绝对路径）
        expect(persona).toContain('{forge.task_logs_dir}')
        expect(persona).toContain('## 质量门禁')
      }
    }
  })

  it('程序段零类型级内容残留：无身份行/信条/workflow 叙述/类型级 gate 指引', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona, taskType).not.toContain('你是')
      expect(persona, taskType).not.toContain('行事信条')
      expect(persona, taskType).not.toContain('工作流')
      expect(persona, taskType).not.toContain('COVERAGE=maintain')
      expect(persona, taskType).not.toContain('fix-bug')
      expect(persona, taskType).not.toContain('run-tests 为强制')
    }
  })

  it('任务元数据不入 persona：无类型/复杂度标签', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).not.toContain('类型变体')
      expect(persona).not.toContain('复杂度=')
    }
  })

  it('核心段恒定在场（×20 ×3 穷尽——执行骨架/失败处理/产物落盘/断点续跑/结算纪律）', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain('动手前先规划：领取任务后的第一步（先于任何探索与改动）')
        expect(persona, `${taskType}/${cx}`).toContain('把要做的工作拆成 todo_write 待办清单')
        expect(persona, `${taskType}/${cx}`).toContain('清单全部 completed 后，才允许 submitTask 结算')
        expect(persona, `${taskType}/${cx}`).toContain('同一问题累计最多 3 次（换方案也计入）')
        expect(persona, `${taskType}/${cx}`).toContain('先落盘再继续')
        expect(persona, `${taskType}/${cx}`).toContain('断点续跑约束：当遇到阻塞性问题时')
        expect(persona, `${taskType}/${cx}`).toContain('才用 submit-task 技能（submitTask）结算')
        expect(persona, `${taskType}/${cx}`).toContain('todo_write 建单不豁免')
        expect(persona, `${taskType}/${cx}`).not.toContain('## 结算') // 结算口径 §6 单源，不设独立段
      }
    }
  })

  it('共享策略段路由：coding×6 → Coding Strategy；test-gen×3 → Testing Strategy；其余 11 类不注入', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        if (CODING_STRATEGY_TYPES.includes(taskType)) {
          expect(persona, `${taskType}/${cx}`).toContain(
            taskType.startsWith('test-gen') ? TESTING_STRATEGY_SECTION : CODING_STRATEGY_SECTION,
          )
          if (taskType.startsWith('coding')) {
            expect(persona, `${taskType}/${cx}`).toContain('先写失败测试') // TDD 统一裁决：一切复杂度常驻
          }
        } else {
          expect(persona, `${taskType}/${cx}`).not.toContain('### Coding Strategy')
          expect(persona, `${taskType}/${cx}`).not.toContain('### Testing Strategy')
        }
      }
    }
    expect(composePersona('test-run', 'medium')).not.toContain('绝不改被测代码') // test-gen 专属纪律不回流
  })

  it('复杂度保底门差异（low 收窄 vs medium/high 全量；程序段单源渲染）', () => {
    const low = composePersona('coding-feature', 'low')
    const medium = composePersona('coding-feature', 'medium')
    const high = composePersona('coding-feature', 'high')
    expect(low).toContain('本次收窄为仅改动包，不含依赖它的包')
    expect(medium).toContain('受影响包的类型检查/构建，含直接依赖它的包')
    expect(high).toContain('受影响包的类型检查/构建，含直接依赖它的包')
    expect(low).not.toContain('含直接依赖它的包')
    // 一切类型同构渲染（类型级 gate 差异归档案承载——程序段不做类型分叉）
    expect(composePersona('doc', 'medium')).toContain('受影响包的类型检查/构建')
    expect(composePersona('gate', 'high')).toContain(baselineGate('high'))
  })

  it('产物落盘/如实上报约束恒定（断点续跑三步序）', () => {
    const persona = composePersona('coding-fix', 'low')
    expect(persona).toContain('{issue-key} = 本轮序号-事件关键词（如 001-login-fail/）')
    expect(persona).toContain('按轮追加、永不覆盖')
    const resumeIdx = persona.indexOf('resume.md')
    const commitIdx = persona.indexOf('先把过质量门的完成部分 git commit')
    const blockedIdx = persona.indexOf('然后以 result=blocked 结算')
    expect(resumeIdx).toBeGreaterThan(-1)
    expect(resumeIdx).toBeGreaterThan(commitIdx) // 三步序：commit → resume → blocked
    expect(blockedIdx).toBeGreaterThan(resumeIdx)
  })

  it('出口插值防护：程序段无裸 {{（×20 ×3 穷尽）', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        expect(composePersona(taskType, cx)).not.toContain('{{')
      }
    }
  })

  it('运行期校验：unknown task type / complexity 抛错', () => {
    expect(() => composePersona('doc.fix' as TaskType, 'medium')).toThrow('unknown task type')
    expect(() => composePersona('doc', 'critical' as PersonaComplexity)).toThrow('unknown complexity')
  })
})

describe('renderExpertProfileSection 档案人格段', () => {
  it('身份头 + personaMd 正文（title 逐字渲染；ASCII 首字母补空格）', () => {
    const section = renderExpertProfileSection(PROFILE)
    expect(section.startsWith('你是缺陷修复专家。\n\n')).toBe(true)
    expect(section).toContain(PROFILE.personaMd)
    const ascii = renderExpertProfileSection({ name: 'x', title: 'DevX', personaMd: 'body' })
    expect(ascii.startsWith('你是 DevX。\n\n')).toBe(true)
  })

  it('title 缺席回落 name', () => {
    const section = renderExpertProfileSection({ name: 'ghost-expert', personaMd: 'body' })
    expect(section.startsWith('你是 ghost-expert。\n\n')).toBe(true)
    expect(section).toContain('body')
  })
})

describe('composePersonaWithProfile 两段组装（档案人格段 + forge 程序段）', () => {
  it('档案段在前、程序段在后，空行分隔；两段内容齐全', () => {
    const persona = composePersonaWithProfile(PROFILE, 'coding-fix', 'high')
    const program = composePersona('coding-fix', 'high')
    expect(persona.startsWith(renderExpertProfileSection(PROFILE) + '\n\n')).toBe(true)
    expect(persona.endsWith(program)).toBe(true)
    expect(persona).toContain('你是缺陷修复专家。')
    expect(persona).toContain('先以失败复现测试钉住根因') // 档案承载的类型级职责
    expect(persona).toContain('先通过复现定位根因，再最小化修复') // 档案信条（迁移留痕逐字）
    expect(persona).toContain(PERSONA_CORE_SECTION) // 程序段恒定
    expect(persona).toContain('## 质量门禁')
  })

  it('程序段仅复杂度差异——同档案不同复杂度只变保底门', () => {
    const low = composePersonaWithProfile(PROFILE, 'coding-fix', 'low')
    const high = composePersonaWithProfile(PROFILE, 'coding-fix', 'high')
    expect(low).toContain('本次收窄为仅改动包，不含依赖它的包')
    expect(high).toContain('受影响包的类型检查/构建，含直接依赖它的包')
  })

  it('×20 类型 smoke：两段齐全 + 无裸 {{（含档案正文）', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersonaWithProfile(PROFILE, taskType, 'medium')
      expect(persona).toContain('你是缺陷修复专家。')
      expect(persona).toContain(PERSONA_CORE_SECTION)
      expect(persona).not.toContain('{{')
    }
  })

  it('出口插值防护：档案正文含裸 {{ → 抛错（用户编辑面同受上游防护约束）', () => {
    expect(() =>
      composePersonaWithProfile({ ...PROFILE, personaMd: '好用 {{name}} 模板' }, 'coding-fix', 'medium'),
    ).toThrow("must not contain bare '{{'")
  })

  it('unknown task type / complexity 抛错（与 composePersona 同校验面）', () => {
    expect(() => composePersonaWithProfile(PROFILE, 'doc.fix' as TaskType, 'medium')).toThrow('unknown task type')
    expect(() => composePersonaWithProfile(PROFILE, 'doc', 'urgent' as PersonaComplexity)).toThrow(
      'unknown complexity',
    )
  })
})
