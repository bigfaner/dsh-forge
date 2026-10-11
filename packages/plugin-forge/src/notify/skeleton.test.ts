// S4 · 叙述骨架机械单测（run-tasks-host-command 1.3）：key: val 单冒号 / 值内零冒号 /
// 「下一步动作:」封闭两值 / 机制词黑名单 / reason 摘要截断——notification-samples.md
// 「统一骨架与文案原则」段 + decisions #24/#25/#27 的机械面锚。
import { describe, expect, it } from 'vitest'
import {
  MECHANISM_WORDS,
  findMechanismWords,
  line,
  nextActionLine,
  nextActionPromptUser,
  NEXT_ACTION_NONE,
  NEXT_ACTION_PATTERN,
  sanitizeValue,
  summarizeReason,
  typeLine,
  validateNarrative,
} from './skeleton.js'

describe('S4 · key: val 单冒号机械（decisions #27③）', () => {
  it('line 拼出「key: val」且值内冒号净化为全角逗号', () => {
    expect(line('任务', '2.8 装配: 前段：后段')).toBe('任务: 2.8 装配， 前段，后段')
  })

  it('typeLine 呈现「[forge·X] key: val」（#25② 类型行）', () => {
    expect(typeLine('启动', '任务源', 'm2-pipeline（feature）')).toBe('[forge·启动] 任务源: m2-pipeline（feature）')
  })

  it('sanitizeValue ASCII 与全角冒号都净化', () => {
    expect(sanitizeValue('a:b')).not.toContain(':')
    expect(sanitizeValue('a：b')).not.toContain('：')
  })
})

describe('S4 · 下一步动作封闭两值（decisions #27④）', () => {
  it('无 值渲染', () => {
    expect(nextActionLine(NEXT_ACTION_NONE)).toBe('下一步动作: 无')
  })

  it('提示用户"<指令文本>"值渲染（宾语定向用户侧）', () => {
    expect(nextActionLine(nextActionPromptUser('继续执行 /run-dag-tasks m2-pipeline'))).toBe(
      '下一步动作: 提示用户"继续执行 /run-dag-tasks m2-pipeline"',
    )
  })

  it('问询后缀变体（样例 ⑬ 专属）', () => {
    expect(nextActionLine(nextActionPromptUser('环境排查后重新开始', { alsoInquiry: true }))).toBe(
      '下一步动作: 提示用户"环境排查后重新开始"，并在问询中决定',
    )
  })

  it('封闭模式：仅接受 无 / 提示用户"<文本>"（含可选问询后缀）', () => {
    expect(NEXT_ACTION_PATTERN.test('无')).toBe(true)
    expect(NEXT_ACTION_PATTERN.test('提示用户"执行 /run-dag-tasks"')).toBe(true)
    expect(NEXT_ACTION_PATTERN.test('提示用户"环境排查"，并在问询中决定')).toBe(true)
    expect(NEXT_ACTION_PATTERN.test('执行 /run-dag-tasks')).toBe(false)
    expect(NEXT_ACTION_PATTERN.test('无需处理')).toBe(false)
    expect(NEXT_ACTION_PATTERN.test('提示用户"x"附加私货')).toBe(false)
    expect(NEXT_ACTION_PATTERN.test('')).toBe(false)
  })
})

describe('S4 · reason 摘要截断（decisions #24——全文只进裁决问询）', () => {
  it('取首行', () => {
    expect(summarizeReason('第一行原因\n第二行细节')).toBe('第一行原因')
  })

  it('超长截断加省略号', () => {
    const long = '长'.repeat(120)
    const summary = summarizeReason(long)
    expect(summary.length).toBeLessThanOrEqual(82)
    expect(summary.endsWith('……')).toBe(true)
  })

  it('短文本原样', () => {
    expect(summarizeReason('测试挂起')).toBe('测试挂起')
  })
})

describe('S4 · 机制词黑名单（decisions #25——消息面零出现）', () => {
  it('命中检出（ASCII 词大小写不敏感）', () => {
    expect(findMechanismWords('已由处置代理接管，adopt 重入，退避 30s')).toEqual([
      '处置代理',
      'adopt',
      '退避',
    ])
    expect(findMechanismWords('Use ADOPT path; follow-up fix spawned')).toEqual(['adopt', 'follow-up'])
  })

  it('干净文本零命中', () => {
    expect(findMechanismWords('已自动分析原因并创建修复任务 fix-3，继续执行')).toEqual([])
  })

  it('黑名单覆盖裁决点名的机制词', () => {
    for (const word of ['处置代理', '宿主循环', 'adopt', '退避', 'follow-up', 'followup', '收口']) {
      expect(MECHANISM_WORDS).toContain(word)
    }
  })
})

describe('S4 · validateNarrative 骨架校验', () => {
  const good = [
    '[forge·领取] 任务源: m2-pipeline',
    '任务: 2.8 诊断弹窗装配',
    '剩余: 待执行 3 · 执行中 1 · 阻塞 0',
    '下一步动作: 无',
  ].join('\n')

  it('合法骨架零问题', () => {
    expect(validateNarrative(good)).toEqual([])
  })

  it('首行缺 [forge·X] 类型行前缀', () => {
    expect(validateNarrative(good.replace('[forge·领取] ', ''))).toContain('首行缺 [forge·X] 类型行前缀')
  })

  it('值内冒号报问题', () => {
    const bad = ['[forge·领取] 任务源: m2-pipeline', '任务: a: b', '下一步动作: 无'].join('\n')
    expect(validateNarrative(bad).some((p) => p.includes('值内出现冒号'))).toBe(true)
  })

  it('缺「下一步动作:」行', () => {
    const bad = ['[forge·领取] 任务源: m2-pipeline', '任务: 2.8'].join('\n')
    expect(validateNarrative(bad).some((p) => p.includes('恰一行'))).toBe(true)
  })

  it('「下一步动作:」不在末行', () => {
    const bad = ['[forge·领取] 任务源: m2-pipeline', '下一步动作: 无', '任务: 2.8'].join('\n')
    expect(validateNarrative(bad).some((p) => p.includes('末行'))).toBe(true)
  })

  it('下一步动作值越出封闭两值', () => {
    const bad = ['[forge·领取] 任务源: m2-pipeline', '下一步动作: 自行决定'].join('\n')
    expect(validateNarrative(bad).some((p) => p.includes('封闭两值'))).toBe(true)
  })

  it('机制词入文报问题', () => {
    const bad = ['[forge·受阻] 任务源: m2-pipeline', '系统: 处置代理已介入', '下一步动作: 无'].join('\n')
    expect(validateNarrative(bad).some((p) => p.includes('机制词'))).toBe(true)
  })
})
