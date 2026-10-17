import { describe, expect, it } from 'vitest'
import {
  commitEffort,
  currentEffort,
  DEFAULT_EFFORT,
  effortOptions,
  rollbackEffort,
  settleEffort,
} from './settings.ts'

describe('推理档位映射（随模型 efforts 联动）', () => {
  it('档位取值 → 显示词；未知取值原样展示', () => {
    expect(effortOptions(['default', 'low', 'medium', 'high'])).toEqual([
      { value: 'default', label: '默认' },
      { value: 'low', label: '低' },
      { value: 'medium', label: '中' },
      { value: 'high', label: '高' },
    ])
    expect(effortOptions(['max'])[0]?.label).toBe('最高')
    expect(effortOptions(['turbo'])[0]?.label).toBe('turbo')
  })
})

describe('当前档收敛', () => {
  it('不支持档位 = undefined（分段隐藏判据）', () => {
    expect(currentEffort([], 'low')).toBeUndefined()
  })

  it('会话档在支持列表内取之；缺席 default 兜底 / 首个兜底', () => {
    expect(currentEffort(['low', 'medium', 'high'], 'medium')).toBe('medium')
    expect(currentEffort(['default', 'low'], 'medium')).toBe(DEFAULT_EFFORT)
    expect(currentEffort(['low', 'medium'], undefined)).toBe('low')
  })
})

describe('乐观选档回滚状态机', () => {
  it('commit → pending + 乐观 picked；settle → pending 复位', () => {
    let draft = { pending: false, picked: 'low' as string | undefined }
    draft = commitEffort(draft, 'high')
    expect(draft).toEqual({ pending: true, picked: 'high' })
    draft = settleEffort(draft, 'high')
    expect(draft).toEqual({ pending: false, picked: 'high' })
  })

  it('失败回滚到 previous', () => {
    let draft = { pending: true, picked: 'high' as string | undefined }
    draft = rollbackEffort(draft, 'low')
    expect(draft).toEqual({ pending: false, picked: 'low' })
  })
})
