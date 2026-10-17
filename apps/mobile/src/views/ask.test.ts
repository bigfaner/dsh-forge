import { describe, expect, it } from 'vitest'
import {
  buildAnswer,
  buildSkipped,
  canSubmit,
  coercePending,
  emptyDraft,
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

describe('pending 载荷收敛（R9#2 官方契约）', () => {
  it('questions 形状直传 + 题型判别 = multiSelect', () => {
    const pending = coercePending({
      rpcId: 'rpc-1',
      questions: [singleQuestion, multiQuestion],
    })
    expect(pending).not.toBeNull()
    expect(pending?.rpcId).toBe('rpc-1')
    expect(pending?.questions).toHaveLength(2)
    expect(pending?.questions[0]?.multiSelect).toBe(false)
    expect(pending?.questions[1]?.multiSelect).toBe(true)
  })

  it('缺字段 fail-soft：questions 缺失/null = null', () => {
    expect(coercePending(null)).toBeNull()
    expect(coercePending({ rpcId: 'x' })).toBeNull()
    expect(coercePending({ rpcId: 'x', questions: 'nope' })).toBeNull()
  })

  it('选项 recommended / description 保留，缺省安全', () => {
    const pending = coercePending({ rpcId: 'r', questions: [singleQuestion] })
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
