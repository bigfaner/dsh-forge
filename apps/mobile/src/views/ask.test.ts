import { describe, expect, it } from 'vitest'
import {
  buildAnswer,
  buildSkipped,
  canSubmit,
  coercePending,
  emptyDraft,
  parseRecommendedLabel,
  pickOption,
  setCustom,
} from './ask.ts'

const singleQuestion = {
  id: 'q1',
  question: '选一个',
  options: [
    { label: '甲', description: '甲说明', recommended: true },
    { label: '乙' },
  ],
}
const multiQuestion = {
  id: 'q2',
  question: '选多个',
  multiSelect: true,
  options: [{ label: '甲' }, { label: '乙' }, { label: '丙' }],
}

// session-projections 响应：UserQuestionProjectionView{active,settled}（官方投影值形）
const projectionView = {
  active: [{ callId: 'call-1', state: 'open', questions: [singleQuestion, multiQuestion] }],
  settled: [],
}

describe('pending 载荷收敛（R12 口径：session-projections userQuestions 投影）', () => {
  it('projections 帧 {values:{userQuestions:{active,settled}}} 收敛首个 open 题', () => {
    const pending = coercePending({ values: { userQuestions: projectionView } })
    expect(pending).not.toBeNull()
    expect(pending?.rpcId).toBe('call-1')
    expect(pending?.questions).toHaveLength(2)
    expect(pending?.questions[0]?.multiSelect).toBe(false)
    expect(pending?.questions[1]?.multiSelect).toBe(true)
  })

  it('裸视图 {userQuestions:view} 与 view 本体两种层级均收敛', () => {
    expect(coercePending({ userQuestions: projectionView })?.rpcId).toBe('call-1')
    expect(coercePending(projectionView)?.rpcId).toBe('call-1')
  })

  it('state=continued 的在途题跳过（只取 open）', () => {
    const view = {
      active: [
        { callId: 'old', state: 'continued', questions: [singleQuestion] },
        { callId: 'live', state: 'open', questions: [multiQuestion] },
      ],
      settled: [],
    }
    expect(coercePending(view)?.rpcId).toBe('live')
    expect(coercePending({ ...view, active: [view.active[0]!] })).toBeNull()
  })

  it('缺字段 fail-soft：无 active 题/畸形载荷 = null', () => {
    expect(coercePending(null)).toBeNull()
    expect(coercePending({})).toBeNull()
    expect(coercePending({ values: {} })).toBeNull()
    expect(coercePending({ userQuestions: { active: [], settled: [] } })).toBeNull()
    expect(coercePending({ userQuestions: { active: [{ callId: 'x', questions: 'nope' }], settled: [] } })).toBeNull()
  })

  it('选项 recommended / description 保留，缺省安全', () => {
    const pending = coercePending({
      userQuestions: { active: [{ callId: 'r', state: 'open', questions: [singleQuestion] }], settled: [] },
    })
    expect(pending?.questions[0]?.options?.[0]).toEqual({
      label: '甲',
      description: '甲说明',
      recommended: true,
    })
  })
})

describe('单选语义（multiSelect 缺省/false）', () => {
  it('点击选项即选中，可改选（替换）', () => {
    let draft = emptyDraft()
    draft = pickOption(singleQuestion, draft, '甲')
    expect(draft.selected).toEqual(['甲'])
    draft = pickOption(singleQuestion, draft, '乙')
    expect(draft.selected).toEqual(['乙'])
  })

  it('占位输入互斥：输入 custom 即选中 other（清空已选项）；点选项清空 custom', () => {
    let draft = pickOption(singleQuestion, emptyDraft(), '甲')
    draft = setCustom(singleQuestion, draft, '自定义回答')
    expect(draft.custom).toBe('自定义回答')
    expect(draft.selected).toEqual([])
    draft = pickOption(singleQuestion, draft, '乙')
    expect(draft.selected).toEqual(['乙'])
    expect(draft.custom).toBe('')
  })

  it('custom 清空文本后不保持 other 选中', () => {
    let draft = setCustom(singleQuestion, emptyDraft(), '临时')
    draft = setCustom(singleQuestion, draft, '')
    expect(draft.custom).toBe('')
    expect(draft.selected).toEqual([])
  })
})

describe('多选语义（multiSelect=true）', () => {
  it('checkbox 任意组合勾选/取消', () => {
    let draft = emptyDraft()
    draft = pickOption(multiQuestion, draft, '甲')
    draft = pickOption(multiQuestion, draft, '丙')
    expect(draft.selected).toEqual(['甲', '丙'])
    draft = pickOption(multiQuestion, draft, '甲')
    expect(draft.selected).toEqual(['丙'])
  })

  it('custom 为额外选中：不影响已勾选项', () => {
    let draft = pickOption(multiQuestion, emptyDraft(), '甲')
    draft = setCustom(multiQuestion, draft, '补充说明')
    expect(draft.selected).toEqual(['甲'])
    expect(draft.custom).toBe('补充说明')
    draft = pickOption(multiQuestion, draft, '乙')
    expect(draft.selected).toEqual(['甲', '乙'])
  })
})

describe('校验与提交载荷（官方契约 {id, selected, custom} + skipped）', () => {
  it('selected 空且 custom 空才拒绝（canSubmit）', () => {
    expect(canSubmit(singleQuestion, emptyDraft())).toBe(false)
    expect(canSubmit(singleQuestion, { selected: ['甲'], custom: '' })).toBe(true)
    expect(canSubmit(singleQuestion, { selected: [], custom: '文' })).toBe(true)
  })

  it('buildAnswer 载荷对齐 {id, selected, custom}，无 skipped 字段', () => {
    expect(buildAnswer(singleQuestion, { selected: ['甲'], custom: '' })).toEqual({
      id: 'q1',
      selected: ['甲'],
      custom: '',
    })
  })

  it('buildSkipped 载荷 = 空选中 + skipped 标记', () => {
    expect(buildSkipped(multiQuestion)).toEqual({
      id: 'q2',
      selected: [],
      custom: '',
      skipped: true,
    })
  })
})

describe('parseRecommendedLabel（桌面端推荐徽标同构——label 后缀约定）', () => {
  it('英文/中文圆括号后缀剥离并标记 recommended', () => {
    expect(parseRecommendedLabel('保持受限视图 (recommended)')).toEqual({ label: '保持受限视图', recommended: true })
    expect(parseRecommendedLabel('保持受限视图（推荐）')).toEqual({ label: '保持受限视图', recommended: true })
    expect(parseRecommendedLabel('普通选项')).toEqual({ label: '普通选项', recommended: false })
  })
  it('仅后缀在末尾生效（中间出现不算）', () => {
    expect(parseRecommendedLabel('推荐 开头')).toEqual({ label: '推荐 开头', recommended: false })
  })
})