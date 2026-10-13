// triage · 决策解析单测（split-remainder 第四态，proposal blocked-salvage-split B）：
// 有效形（title/type/taskDesc/note 全参/缺省）+ 既有三动作不破 + 越权/字段错拒绝路径。
import { describe, expect, it } from 'vitest'
import { parseTriageDecision, TriageDecisionInvalidError } from './decision.js'

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

describe('既有三动作不破（第四态增列后回归）', () => {
  it('add-fix / wait-external / ask-user 解析保持原样', () => {
    expect(parseTriageDecision('{"action":"add-fix","title":"Fix: x"}')).toEqual({ action: 'add-fix', title: 'Fix: x' })
    expect(parseTriageDecision('{"action":"wait-external","externalSlug":"feature-b"}')).toEqual({ action: 'wait-external', externalSlug: 'feature-b' })
    expect(parseTriageDecision('{"action":"ask-user"}')).toEqual({ action: 'ask-user' })
  })

  it('枚举外动作仍拒绝（错误文案更新为四动作枚举）', () => {
    expect(() => parseTriageDecision('{"action":"dispatch","slug":"x"}')).toThrowError(/add-fix\/wait-external\/ask-user\/split-remainder/)
  })
})
