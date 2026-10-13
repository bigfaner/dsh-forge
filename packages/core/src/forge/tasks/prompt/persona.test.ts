// persona 组成矩阵单测（提案 worker-lean-execution S2a AC）：×20 类型 ×low/medium/high
// 全矩阵——核心段①-⑧一切类型在场、高效执行锚 ×6 恒定、变体按 20 类型表路由、
// Coding Strategy 9 类注入面、low 裁剪不触及核心段与 AC 核查、裸 `{{` 防护、
// UI 任务不作特殊处理（coding-feature/enhancement 无 UI 专属锚）。
// 文案裁决（2026-10-12）：统一祈使句中文分点；目标导向 todo 先行（§7 单源、无豁免）；
// e2e 证据落盘锚；质量门禁术语；结算面从简（只指 submit-task 技能，无字段清单）；
// 任务元数据（类型/复杂度标签）不入 persona——路由断言走身份行与门禁事实。
import { describe, expect, it } from 'vitest'
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'
import {
  ANTI_CHURN_ANCHORS,
  codingStrategyFor,
  CODING_STRATEGY_TYPES,
  composePersona,
  PERSONA_CORE_SECTION,
  PERSONA_VARIANTS,
  TESTING_STRATEGY_SECTION,
  type PersonaComplexity,
} from './persona.js'
import { CONSTRAINTS_BLOCK, RESUME_POINTER_BLOCK } from './compose.js'

const COMPLEXITIES: readonly PersonaComplexity[] = ['low', 'medium', 'high']

/** 核心段①-⑧锚（每节标题——穷尽断言的稳定基面；段序 = 执行动线：规划→执行→异常→证据→上报→收口） */
const CORE_SECTION_ANCHORS = [
  '### 1. 工作方式',
  '### 2. todo_write：目标导向的执行骨架',
  '### 3. 高效执行（避免无效动作）',
  '### 4. 失败处理',
  '### 5. 产物落盘',
  '### 6. 如实上报',
  '### 7. 提交纪律',
  '### 8. 歧义处置',
]

describe('persona 组成矩阵（×20 类型 ×3 复杂度）', () => {
  it('20 类型变体表穷尽（Record<TaskType,…> 编译期 + 运行期双锚）', () => {
    expect(Object.keys(PERSONA_VARIANTS).sort()).toEqual([...TASK_TYPES].sort())
  })

  it('全矩阵：核心段①-⑧ + 高效执行锚 ×6 + AC 核查不变量恒定在场', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        for (const anchor of CORE_SECTION_ANCHORS) {
          expect(persona, `${taskType}/${cx} missing ${anchor}`).toContain(anchor)
        }
        for (const anchor of ANTI_CHURN_ANCHORS) {
          expect(persona, `${taskType}/${cx} missing execution anchor`).toContain(anchor)
        }
        expect(persona).toContain('AC 逐项核查不变量')
        expect(persona).toContain('logs/{slug}/{task-local-id}/{NNN-issue-key}/')
        expect(persona).toContain(CONSTRAINTS_BLOCK)
      }
    }
  })

  it('身份行：角色名 + 行事信条显词连接（无中划线拼贴），×20 逐类型断言', () => {
    for (const taskType of TASK_TYPES) {
      const { title, creed } = PERSONA_VARIANTS[taskType].expert
      const persona = composePersona(taskType, 'medium')
      const gap = /^[A-Za-z]/.test(title) ? ' ' : ''
      expect(persona, taskType).toContain(`你是${gap}${title}。行事信条：${creed}。`)
    }
  })

  it('任务元数据不入 persona：无「类型变体」标签、无复杂度标签', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).not.toContain('类型变体')
      expect(persona).not.toContain('复杂度=')
    }
    // 路由可观测性走门禁/工作流差异（SC10 断言面迁移）：抽样三类互异
    expect(composePersona('gate', 'medium')).toContain('全面测试')
    expect(composePersona('doc', 'medium')).toContain('无编译/测试门禁')
    expect(composePersona('test-run', 'medium')).toContain('交付物即测试报告')
  })

  it('目标导向 todo 先行（§7 单源）：第一步建单 + 全 completed 才结算，恒定在场', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain('领取任务后的第一步（先于任何探索与改动）：把任务目标与 AC 逐项转成 todo_write 待办清单')
        expect(persona, `${taskType}/${cx}`).toContain('清单全部 completed 后，才允许 submitTask 结算')
      }
    }
  })

  it('e2e/验收证据落盘锚：核心段第 5 节分点列举 + 先落盘再继续', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).toContain('e2e/验收测试的证据票据（trace、error-context、失败摘录）')
      expect(persona).toContain('先落盘再继续')
      expect(persona).toContain('一个任务一个文件夹，一个事件一个子文件夹')
    }
  })

  it('统一证据路径约束块（worker-exec-evidence-replay S①）：单行模板 + 按轮追加不覆盖 + 细则外链，恒定在场', () => {
    expect(CONSTRAINTS_BLOCK).not.toContain('\n')
    expect(CONSTRAINTS_BLOCK).toContain('logs/{slug}/{task-local-id}/{NNN-issue-key}/')
    expect(CONSTRAINTS_BLOCK).toContain('永不覆盖')
    expect(CONSTRAINTS_BLOCK).toContain('README')
    for (const taskType of TASK_TYPES) {
      expect(composePersona(taskType, 'low')).toContain('按轮追加')
    }
  })

  it('断点续跑约束块（worker-exec-evidence-replay 1.3/S③）：单行指针路径 + 进度三要素 + 续跑指令，恒定在场', () => {
    expect(RESUME_POINTER_BLOCK).not.toContain('\n')
    expect(RESUME_POINTER_BLOCK).toContain('logs/{slug}/{task-local-id}/resume.md')
    for (const taskType of TASK_TYPES) {
      expect(composePersona(taskType, 'low')).toContain(RESUME_POINTER_BLOCK)
    }
  })

  it('旧审计条款移除：任务定义/执行记录保护句不再出现（任务内容与记录已入库）', () => {
    for (const taskType of TASK_TYPES) {
      expect(composePersona(taskType, 'medium')).not.toContain('docs/**/tasks/**')
      expect(composePersona(taskType, 'medium')).not.toContain('audit artifacts')
    }
  })

  it('门禁术语统一：产出零「门纪律」残留；结算面从简（submit-task 技能指称、无字段清单）', () => {
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).not.toContain('门纪律')
        expect(persona, `${taskType}/${cx}`).toContain('## 质量门禁')
        expect(persona, `${taskType}/${cx}`).not.toContain('## 结算') // 结算口径 §7 单源，不设独立段
        expect(persona, `${taskType}/${cx}`).toContain('才用 submit-task 技能（submitTask）结算')
        expect(persona, `${taskType}/${cx}`).not.toContain('记录字段：')
      }
    }
  })

  it('Coding Strategy 注入面：coding 族 9 类含段，其余 11 类不含', () => {
    expect(CODING_STRATEGY_TYPES).toHaveLength(9)
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        if (CODING_STRATEGY_TYPES.includes(taskType)) {
          if (taskType.startsWith('test-gen')) {
            expect(persona, `${taskType}/${cx}`).toContain(TESTING_STRATEGY_SECTION)
          } else {
            expect(persona, `${taskType}/${cx}`).toContain(codingStrategyFor(cx))
          }
        } else {
          expect(persona, `${taskType}/${cx}`).not.toContain('### Coding Strategy')
          expect(persona, `${taskType}/${cx}`).not.toContain('### Testing Strategy')
        }
      }
    }
  })

  it('SC2 回归锚：coding 族 low 不含逐需求 TDD 句（红队攻 1），medium/high 含；test-gen 全档注入 Testing Strategy', () => {
    for (const taskType of CODING_STRATEGY_TYPES) {
      const low = composePersona(taskType, 'low')
      const high = composePersona(taskType, 'high')
      if (taskType.startsWith('test-gen')) {
        expect(low, taskType).toContain('绝不改被测代码')
        expect(high, taskType).toContain('绝不改被测代码')
        continue
      }
      expect(low, taskType).not.toContain('先写失败测试')
      expect(low, taskType).toContain('外科手术式修改') // 裁 TDD 不裁外科手术式
      expect(high, taskType).toContain('先写失败测试')
      expect(high, taskType).not.toContain('绝不改被测代码') // test-gen 专属纪律不回流 coding 族
    }
  })

  it('角色匹配评审回归锚：三路对抗评估的判别与纪律缺口收口', () => {
    // simplify：COVERAGE=maintain 豁免 + 行为等价红线 + 扫描步（coding 族报告「唯一硬错位」）
    const simplify = composePersona('code-quality-simplify', 'high')
    expect(simplify).toContain('最应豁免补测的类型')
    expect(simplify).toContain('行为等价红线')
    expect(simplify).toContain('五个维度')
    // enhancement/feature/fix 判别锚
    expect(composePersona('coding-enhancement', 'high')).toContain('判别增量边界')
    expect(composePersona('coding-feature', 'medium')).toContain('规格是唯一事实源')
    expect(composePersona('coding-fix', 'high')).toContain('失败复现测试钉住根因')
    // test-gen 推导步 + scripts 可复用 + run/test-run 边界
    expect(composePersona('test-gen-contracts', 'high')).toContain('提取断言清单')
    expect(composePersona('test-gen-journeys', 'high')).toContain('沿旅程切分路径与覆盖点')
    expect(composePersona('test-gen-scripts', 'medium')).toContain('不硬编码环境细节')
    expect(composePersona('test-run', 'medium')).toContain('环境故障原样记录上报')
    // doc 族门禁分化（非共享字符串）
    expect(composePersona('doc-drift', 'medium')).toContain('每条发现附代码事实源位置')
    expect(composePersona('doc-drift', 'medium')).toContain('不要求图文并茂')
    expect(composePersona('doc-consolidate', 'medium')).toContain('语义零损失自查')
    expect(composePersona('doc-review', 'medium')).toContain('每条意见可定位')
    expect(composePersona('doc-summary', 'medium')).toContain('不强制插图')
    expect(composePersona('doc', 'medium')).toContain('图文（mermaid）并茂') // 只有技术作家保行文要求
    // gate 判据来源 + eval 判据缺失出口 + validation-code 边界
    expect(composePersona('gate', 'medium')).toContain('缺判据即以 result=blocked 结算')
    expect(composePersona('eval-contract', 'medium')).toContain('不得自造评分口径')
    expect(composePersona('validation-code', 'medium')).toContain('文档与代码的一致性核对属文档漂移审计')
  })

  it('红队攻 2/3 回归锚：todo 无豁免措辞；blocked 结算出口在场', () => {
    for (const taskType of TASK_TYPES) {
      const persona = composePersona(taskType, 'medium')
      expect(persona).not.toContain('跳过完整分析')
      expect(persona).toContain('todo_write 建单不豁免')
      expect(persona).toContain('result=blocked 提前结算除外')
    }
  })

  it('红队攻 7/8 回归锚：失败计数按同一问题累计；范围外问题承载位 = summary', () => {
    const persona = composePersona('coding-fix', 'medium')
    expect(persona).toContain('同一问题累计最多 3 次（换方案也计入）')
    expect(persona).toContain('范围外的问题写进 summary 后上报')
  })

  it('红队攻 4/5/6 回归锚：悬空术语清除、白名单外英文清除、步数诚实', () => {
    expect(composePersona('gate', 'medium')).toContain('执行本节质量门禁所列的全部检查')
    expect(composePersona('code-quality-simplify', 'high')).toContain('冗余、嵌套、命名、耦合、注释五个维度')
    expect(composePersona('eval-contract', 'medium')).not.toContain('vars_json')
    expect(composePersona('coding-refactor', 'high')).toContain('重构（新增 → 迁移 → 移除）')
    expect(composePersona('coding-cleanup', 'high')).toContain('第 1.5 步扫描附加段')
    expect(composePersona('coding-cleanup', 'high')).not.toContain('（4 步，')
    expect(composePersona('test-run', 'medium')).not.toContain('探测面 → 跑其 just 配方序列')
  })

  it('Coding Strategy 模块边界锚：不新增模块/包 + 业务代码红线（low/high 两档恒定）', () => {
    for (const taskType of ['coding-feature', 'coding-enhancement', 'coding-fix'] as const) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        expect(persona, `${taskType}/${cx}`).toContain('除非任务确有必要，不新增模块/包')
        expect(persona, `${taskType}/${cx}`).toContain('业务代码不得混入公共包/框架性代码')
      }
    }
  })

  it('红队攻 9 回归锚：合并写入不破坏外科手术式——重写保持其余内容逐字不变', () => {
    expect(ANTI_CHURN_ANCHORS[0]).toContain('重写保持其余内容逐字不变')
  })

  it('红队攻 11：complexity 运行期校验（unknown 抛错，与 unknown type 防御对称）', () => {
    expect(() => composePersona('doc', 'critical' as PersonaComplexity)).toThrow('unknown complexity')
  })

  it('英文白名单机械扫描：产出中的英文词汇 ⊆ 白名单（红队攻 5 防线）', () => {
    const whitelist = new Set(
      [
        // 术语白名单（裁决 2）+ TDD 子术语 + 工具/字段/路径词汇
        'AC', 'AGENTS.md', 'Hard', 'Rules', 'Impact', 'Mapping', 'TDD', 'RED', 'GREEN', 'REFACTOR',
        'SPEC-CODE', 'SCAN', 'Strategy', 'todo_write', 'submitTask', 'submit-task', 'result=blocked',
        'COVERAGE=maintain', 'COVERAGE', 'maintain', 'vars_json',
        'grep', 'glob', 'write', 'ls', 'git', 'status', 'diff', 'lint', 'just', 'run-tests',
        'gate', 'coding', 'doc', 'doc-review', 'test', 'e2e', 'trace', 'error-context', 'fix',
        'summary', 'reason', 'Step', 'completed', 'false', 'logs', 'slug', 'taskKey', 'seq', 'event-type',
        'testsPassed', 'testsFailed', 'coverage', 'nnn', 'readme', 'task-local-id', 'issue-key',
        'evidence', 'resume.md', // worker-exec-evidence-replay 1.3：EVIDENCE 行 + 续跑指针文件名
        'UI', 'UX', 'MUST', 'Simplicity', 'First', 'PASS', 'FAIL', 'N', 'AC-N', 'Skill', 'mermaid', 'Testing', 'Schema', 'PRD',
      ].map((w) => w.toLowerCase()),
    )
    for (const taskType of TASK_TYPES) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        const sansCode = persona.replace(/`[^`]*`/g, ' ') // 代码跨度（路径/命令）豁免
        const words = sansCode.match(/[A-Za-z][A-Za-z0-9_.=|-]*/g) ?? []
        for (const w of words) {
          const token = w.toLowerCase().replace(/[.=|-]+$/, '')
          expect(
            whitelist.has(token),
            `${taskType}/${cx} 白名单外英文: ${w}`,
          ).toBe(true)
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

  it('质量门禁命令构造口径：按改动范围自行构造 + 禁固定 just 配方', () => {
    const persona = composePersona('coding-feature', 'medium')
    expect(persona).toContain('不得机械套用固定的命令配方')
    expect(persona).not.toContain('质量门禁（根据')
  })

  it('质量门禁分级方向（对齐提案 S1）：low = ①收窄仅改动包 + ③必须完整执行；medium/high = ①含依赖包', () => {
    const low = composePersona('coding-feature', 'low')
    const medium = composePersona('coding-feature', 'medium')
    expect(low).toContain('收窄为仅改动包，不含依赖它的包')
    expect(low).toContain('本项必须完整执行')
    expect(low).not.toContain('含直接依赖它的包')
    expect(medium).toContain('受影响包的类型检查/构建，含直接依赖它的包')
    // 类型变体门禁附加条款随分级在位
    expect(composePersona('coding-cleanup', 'medium')).toContain('COVERAGE=maintain')
    expect(composePersona('coding-refactor', 'low')).toContain('COVERAGE=maintain')
    expect(composePersona('coding-fix', 'high')).toContain('Hard Rules 中针对 fix 的范围与命令限制条款')
  })

  it('工作流变体：cleanup 的 SCAN 为附加段形态（非计步）；fix 高档含错误分诊首步', () => {
    expect(composePersona('coding-cleanup', 'high')).toContain('第 1.5 步扫描附加段')
    expect(composePersona('coding-fix', 'high')).toContain('错误分诊')
    expect(composePersona('coding-fix', 'low')).not.toContain('错误分诊')
  })

  it('UI 任务不作特殊处理：coding-feature/enhancement 无 UI 专属锚（核心段 §6 截图通则除外）', () => {
    for (const taskType of ['coding-feature', 'coding-enhancement'] as const) {
      for (const cx of COMPLEXITIES) {
        const persona = composePersona(taskType, cx)
        const variantTail = persona.slice(persona.indexOf('### Coding Strategy') + 1 || persona.indexOf('工作流'))
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
