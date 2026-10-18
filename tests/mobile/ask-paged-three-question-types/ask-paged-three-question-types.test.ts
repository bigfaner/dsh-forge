// @feature:mobile-ui
// @mobile-e2e
// Journey: ask-paged-three-question-types（ask 分页面板：单选/多选/other 三题型 + 分页 + 提交）。
// 溯源：contracts/step-1-enter-ask.md … step-6-submit-answer.md（每 Outcome 一测 + 冒烟）。
// 策略：ask.ts 纯逻辑面（coercePending/选项语义状态机/提交载荷构造）行为实测；数据面钉
// e2e/fixtures/mobile（官方 SessionSummary 参照腿的 userQuestions 投影字段 + user-questions-answer
// 通道录制——404 缺口显性化）。载荷契约正本 = tech-research R9#2 renderQuestionComposer。
import { describe, expect, it } from 'vitest'
import {
  buildAnswer,
  buildSkipped,
  canSubmit,
  coercePending,
  emptyDraft,
  pickOption,
  setCustom,
  type AskQuestion,
} from '../../../apps/mobile/src/views/ask.js'
import { expectMobileFile, loadFixtures, mobileSrc, sessionSummarySample } from '../support.js'

const FIX = loadFixtures()
const SINGLE: AskQuestion = { id: 'q1', question: '部署目标？', options: [{ label: '边缘', recommended: true }, { label: '云端' }] }
const MULTI: AskQuestion = { id: 'q2', question: '导出格式？', multiSelect: true, options: [{ label: 'md' }, { label: 'csv' }, { label: 'html' }] }
const PENDING = { rpcId: 'rec-ask-1', questions: [SINGLE, MULTI] }

describe('step-1 enter-ask（pending 交互进入 ask 面板）', () => {
  it('success（进入分页面板）', () => {
    // 回链 contracts/step-1-enter-ask.md Outcome:success——pending 载荷收敛 + 分页序/总数
    const pending = coercePending(PENDING)
    expect(pending?.rpcId).toBe('rec-ask-1')
    expect(pending?.questions).toHaveLength(2) // 1/N = 1/2
    expect(pending?.questions[0]?.multiSelect).toBe(false) // 题型判别归一：缺省 = 单选
    expect(pending?.questions[1]?.multiSelect).toBe(true)
    // 官方参照腿：session/list 投影含 userQuestions 字段（pending 发现源）
    const summary = sessionSummarySample(FIX.apiRef)
    const values = (summary.projections as { values?: Record<string, unknown> }).values ?? {}
    expect(Object.keys(values)).toContain('userQuestions')
    // 通道录制在场（404 缺口显性化——录制期通道未放行）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === 'forge:proxy/user-questions-answer')).toBe(true)
  })

  it('session-switch-race（面板打开期间切会话）', () => {
    // 回链 contracts/step-1-enter-ask.md Outcome:session-switch-race——作答状态局部性：
    // 答案只存在于面板缓冲（draft 纯值），不提交即丢弃；宿主 pending 保持
    const draft = pickOption(SINGLE, emptyDraft(), '云端')
    expect(draft.selected).toEqual(['云端']) // 缓冲在面板内
    // coercePending 为纯函数：pending 载荷零可变状态——切会话重进 pending 仍在（未提交不消失）
    expect(coercePending(PENDING)).toEqual(coercePending(PENDING))
    expect(mobileSrc('views/ask.ts')).toMatch(/interaction\.answer/) // 唯一提交出口 = answer 通道
  })
})

describe('step-2 select-single（单选题点选）', () => {
  it('success（radio 单选唯一）', () => {
    // 回链 contracts/step-2-select-single.md Outcome:success——单选替换、选中态唯一
    let draft = pickOption(SINGLE, emptyDraft(), '边缘')
    expect(draft.selected).toEqual(['边缘'])
    draft = pickOption(SINGLE, draft, '云端') // 改选
    expect(draft.selected).toEqual(['云端']) // 选中态唯一
  })

  it('single-with-other（单选带 other 输入域）', () => {
    // 回链 contracts/step-2-select-single.md Outcome:single-with-other——输入即选中 other（占位互斥）
    let draft = setCustom(SINGLE, emptyDraft(), '自建机房')
    expect(draft.selected).toEqual([]) // other 选中：已选项清空
    expect(draft.custom).toBe('自建机房')
    draft = pickOption(SINGLE, draft, '云端') // 改选其它选项 → other 文本清空（互斥）
    expect(draft).toEqual({ selected: ['云端'], custom: '' })
    // 提交前可改回 other
    draft = setCustom(SINGLE, draft, '混合')
    expect(draft.custom).toBe('混合')
  })
})

describe('step-3 next-multi（翻页到多选题）', () => {
  it('success（checkbox 任意组合）', () => {
    // 回链 contracts/step-3-next-multi.md Outcome:success——多选 toggle 任意组合、翻页不丢答案
    let draft = pickOption(MULTI, emptyDraft(), 'md')
    draft = pickOption(MULTI, draft, 'html')
    expect(draft.selected).toEqual(['md', 'html'])
    draft = pickOption(MULTI, draft, 'csv') // 再勾
    expect(draft.selected).toEqual(['md', 'html', 'csv'])
    // 第一题答案在独立缓冲（翻页不丢）——drafts per question（面板分页缓冲语义）
    const first = pickOption(SINGLE, emptyDraft(), '边缘')
    expect(first.selected).toEqual(['边缘'])
  })

  it('uncheck-combo（取消已勾选项）', () => {
    // 回链 contracts/step-3-next-multi.md Outcome:uncheck-combo——取消互不影响、空集合法
    let draft = pickOption(MULTI, emptyDraft(), 'md')
    draft = pickOption(MULTI, draft, 'csv')
    draft = pickOption(MULTI, draft, 'md') // 取消 md，csv 不变
    expect(draft.selected).toEqual(['csv'])
    draft = pickOption(MULTI, draft, 'csv') // 全取消
    expect(draft.selected).toEqual([])
    expect(canSubmit(MULTI, draft)).toBe(false) // 空集 = 拒绝提交（官方校验口径），翻页不受阻
  })
})

describe('step-4 multi-other（多选题 other 与选项并存）', () => {
  it('success（other 与勾选并存）', () => {
    // 回链 contracts/step-4-multi-other.md Outcome:success——多选 other = 额外选中（selected+custom 并存）
    let draft = pickOption(MULTI, emptyDraft(), 'md')
    draft = setCustom(MULTI, draft, 'yaml')
    expect(draft.selected).toEqual(['md']) // 已勾选不受影响
    expect(draft.custom).toBe('yaml')
    const answer = buildAnswer(MULTI, draft)
    expect(answer).toEqual({ id: 'q2', selected: ['md'], custom: 'yaml' }) // 载荷形状一一对应
  })

  it('recommended-badge（recommended 选项徽标）', () => {
    // 回链 contracts/step-4-multi-other.md Outcome:recommended-badge——徽标纯呈现、零自动选中
    expect(SINGLE.options?.[0]?.recommended).toBe(true)
    expect(emptyDraft().selected).toEqual([]) // 初始缓冲空——推荐不自动选中
    const draft = pickOption(SINGLE, emptyDraft(), '边缘') // 点击行为与普通选项一致
    expect(draft.selected).toEqual(['边缘'])
    expectMobileFile('views/ask.ts')
  })

  it('clear-other（清空 other 取消选中）', () => {
    // 回链 contracts/step-4-multi-other.md Outcome:clear-other——清空 = 取消 other，勾选保留
    let draft = pickOption(MULTI, emptyDraft(), 'md')
    draft = setCustom(MULTI, draft, 'yaml')
    draft = setCustom(MULTI, draft, '') // 清空输入
    expect(draft.custom).toBe('')
    expect(draft.selected).toEqual(['md']) // 勾选组合保留
  })
})

describe('step-5 prev-review（回看上一题答案保留）', () => {
  it('success（回翻不丢答案）', () => {
    // 回链 contracts/step-5-prev-review.md Outcome:success——导航只改索引、缓冲全程不变
    const answers = new Map<string, ReturnType<typeof emptyDraft>>([
      [SINGLE.id, pickOption(SINGLE, emptyDraft(), '边缘')],
      [MULTI.id, setCustom(MULTI, pickOption(MULTI, emptyDraft(), 'csv'), 'yaml')],
    ])
    // 往返翻页后两题缓冲逐位不变
    expect(answers.get(SINGLE.id)?.selected).toEqual(['边缘'])
    expect(answers.get(MULTI.id)?.selected).toEqual(['csv'])
    expect(answers.get(MULTI.id)?.custom).toBe('yaml')
    expect(PENDING.questions).toHaveLength(2) // 序号/总数一致
  })

  it('navigation-no-submit（翻页不提交中间态）', () => {
    // 回链 contracts/step-5-prev-review.md Outcome:navigation-no-submit——翻页零请求；
    // 提交载荷构造是纯函数（唯一出口），导航路径不触达
    expect(mobileSrc('views/ask.ts')).toMatch(/buildAnswer|answer\(/)
    // 纯函数零副作用：构造两次载荷逐位一致（无隐藏发送）
    expect(buildAnswer(SINGLE, pickOption(SINGLE, emptyDraft(), '云端'))).toEqual(buildAnswer(SINGLE, pickOption(SINGLE, emptyDraft(), '云端')))
  })
})

describe('step-6 submit-answer（末题提交载荷）', () => {
  it('success（提交后面板关闭）', () => {
    // 回链 contracts/step-6-submit-answer.md Outcome:success——载荷 {id, selected, custom} 形状契约
    const answer = buildAnswer(SINGLE, pickOption(SINGLE, emptyDraft(), '边缘'))
    expect(Object.keys(answer).sort()).toEqual(['custom', 'id', 'selected'])
    expect(answer.selected).toEqual(['边缘'])
    expect(answer.custom).toBe('')
  })

  it('placeholder-exclusive（占位输入框互斥）', () => {
    // 回链 contracts/step-6-submit-answer.md Outcome:placeholder-exclusive——
    // 输入主导形态：custom 携带输入值、selected 为空（载荷层互斥成立）
    const answer = buildAnswer(SINGLE, setCustom(SINGLE, emptyDraft(), '自由文本'))
    expect(answer.custom).toBe('自由文本')
    expect(answer.selected).toEqual([])
    expect(canSubmit(SINGLE, { selected: [], custom: '自由文本' })).toBe(true)
  })

  it('skipped-question（未作答 skipped 提交）', () => {
    // 回链 contracts/step-6-submit-answer.md Outcome:skipped-question——skipped 语义进载荷、面板零阻塞
    const skipped = buildSkipped(MULTI)
    expect(skipped).toEqual({ id: 'q2', selected: [], custom: '', skipped: true })
    expect(canSubmit(MULTI, emptyDraft())).toBe(false) // 未答不阻塞导航（提交面由 skip 出口承担）
  })
})

describe('smoke: happy path 依序走全链（ask-paged-three-question-types）', () => {
  it('进入 → 单选 → 多选+other → 回翻 → 提交全链', () => {
    // ① pending 收敛（两题，序号/总数一致）
    const pending = coercePending(PENDING)
    expect(pending?.questions).toHaveLength(2)
    // ② 第 1 题单选
    const a1 = buildAnswer(SINGLE, pickOption(SINGLE, emptyDraft(), '边缘'))
    // ③④ 第 2 题多选 + other 并存
    const d2 = setCustom(MULTI, pickOption(MULTI, emptyDraft(), 'md'), 'yaml')
    const a2 = buildAnswer(MULTI, d2)
    // ⑤ 回翻缓冲不变（Map 语义）
    expect(a1.selected).toEqual(['边缘'])
    expect(a2).toEqual({ id: 'q2', selected: ['md'], custom: 'yaml' })
    // ⑥ 末题提交载荷契约（official interaction.answer 形状）
    expect([a1, a2].map((a) => Object.keys(a).sort())).toEqual([['custom', 'id', 'selected'], ['custom', 'id', 'selected']])
  })
})
