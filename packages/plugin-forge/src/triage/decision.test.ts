// triage · 决策解析单测（split-remainder 第四态，proposal blocked-salvage-split B）：
// 有效形（title/type/taskDesc/note 全参/缺省）+ 既有三动作不破 + 越权/字段错拒绝路径。
import { describe, expect, it } from 'vitest'
import { parseTriageDecision, TriageDecisionInvalidError, TRIAGE_ESCALATION_POINTER_MAX, TRIAGE_ESCALATION_SECTION_MAX } from './decision.js'

describe('split-remainder（封闭四动作枚举的第四态）', () => {
  it('有效形：title/type/taskDesc/note 全参（围栏 JSON）', () => {
    const decision = parseTriageDecision(
      ['分析过程略。', '```json', '{"action":"split-remainder","title":"Split: 剩余范围","type":"coding-enhancement","taskDesc":"承接未完成的 C/D 项","note":"已完成 A/B，剩余 C/D"}', '```'].join('\n'),
    )
    expect(decision).toEqual({ action: 'split-remainder', title: 'Split: 剩余范围', type: 'coding-enhancement', taskDesc: '承接未完成的 C/D 项', note: '已完成 A/B，剩余 C/D' })
  })

  it('有效形：裸 JSON 缺省参（宿主补缺省——title/type/taskDesc/note 全可选）', () => {
    expect(parseTriageDecision('前置说明 {"action":"split-remainder"} 后置说明')).toEqual({ action: 'split-remainder' })
  })

  it('越权拒绝：title 型错抛（同 add-fix 形校验）', () => {
    expect(() => parseTriageDecision('{"action":"split-remainder","title":42}')).toThrowError(/split-remainder\.title/)
    expect(() => parseTriageDecision('{"action":"split-remainder","title":42}')).toThrowError(TriageDecisionInvalidError)
  })

  it('越权拒绝：type 越出任务类型全集抛', () => {
    expect(() => parseTriageDecision('{"action":"split-remainder","type":"not-a-type"}')).toThrowError(/split-remainder\.type/)
    expect(() => parseTriageDecision('{"action":"split-remainder","type":"not-a-type"}')).toThrowError(TriageDecisionInvalidError)
  })

  it('越权拒绝：note/taskDesc 型错抛', () => {
    expect(() => parseTriageDecision('{"action":"split-remainder","note":true}')).toThrowError(/split-remainder\.note/)
    expect(() => parseTriageDecision('{"action":"split-remainder","taskDesc":[]}')).toThrowError(/split-remainder\.taskDesc/)
  })
})

describe('既有三动作不破（escalate 改名后回归）', () => {
  it('add-fix / wait-external / escalate 解析保持原样', () => {
    expect(parseTriageDecision('{"action":"add-fix","title":"Fix: x"}')).toEqual({ action: 'add-fix', title: 'Fix: x' })
    expect(parseTriageDecision('{"action":"wait-external","externalSlug":"feature-b"}')).toEqual({ action: 'wait-external', externalSlug: 'feature-b' })
    expect(parseTriageDecision('{"action":"escalate"}')).toEqual({ action: 'escalate' })
  })

  it('枚举外动作仍拒绝（错误文案更新为四动作枚举）', () => {
    expect(() => parseTriageDecision('{"action":"dispatch","slug":"x"}')).toThrowError(/add-fix\/wait-external\/escalate\/split-remainder/)
  })
})

describe('escalate 升级载荷（loop-recurrence-hardening §2.2.1——四节可选 + 限长）', () => {
  it('旧无载荷形态解析零回归：纯动作 = 无 payload 键', () => {
    expect(parseTriageDecision('分析略。{"action":"escalate"}')).not.toHaveProperty('payload')
  })

  it('四节全参：payload 结构化承载（三文本节 + 证据指针数组）', () => {
    const decision = parseTriageDecision(
      '{"action":"escalate","classification":"可形式化形态——状态机无不变式","disposition":"建议建模排查","delegateTarget":"具备形式化建模能力的专家","evidencePointers":["bug-a1","bug-b2"]}',
    )
    expect(decision).toEqual({
      action: 'escalate',
      payload: {
        classification: '可形式化形态——状态机无不变式',
        disposition: '建议建模排查',
        delegateTarget: '具备形式化建模能力的专家',
        evidencePointers: ['bug-a1', 'bug-b2'],
      },
    })
  })

  it('部分节缺省：payload 只携带在场节', () => {
    expect(parseTriageDecision('{"action":"escalate","evidencePointers":["logs/x/report.md"]}')).toEqual({
      action: 'escalate',
      payload: { evidencePointers: ['logs/x/report.md'] },
    })
  })

  it('文本节型错即无效（不静默转写）', () => {
    expect(() => parseTriageDecision('{"action":"escalate","classification":42}')).toThrowError(/escalate\.classification/)
  })

  it('文本节超限即无效（限长约定——指针化引用不整段搬运）', () => {
    const long = 'x'.repeat(TRIAGE_ESCALATION_SECTION_MAX + 1)
    expect(() => parseTriageDecision(`{"action":"escalate","disposition":"${long}"}`)).toThrowError(/escalate\.disposition 超限/)
  })

  it('证据指针：非字符串数组 / 条数超限 / 单条超限均无效', () => {
    expect(() => parseTriageDecision('{"action":"escalate","evidencePointers":"bug-1"}')).toThrowError(/字符串数组/)
    expect(() =>
      parseTriageDecision(`{"action":"escalate","evidencePointers":[${Array.from({ length: TRIAGE_ESCALATION_POINTER_MAX + 1 }, (_, i) => `"p${i}"`).join(',')}]}`),
    ).toThrowError(/超限/)
    expect(() => parseTriageDecision(`{"action":"escalate","evidencePointers":["${'x'.repeat(TRIAGE_ESCALATION_SECTION_MAX + 1)}"]}`)).toThrowError(/单条超限/)
  })

  it('ask-user 旧词退役：按越权动作拒绝（不留别名）', () => {
    expect(() => parseTriageDecision('{"action":"ask-user"}')).toThrowError(/越权动作.*escalate/)
  })
})
