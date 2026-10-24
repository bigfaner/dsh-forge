import { describe, expect, it } from 'vitest'
import {
  commitEffort,
  currentEffort,
  DEFAULT_EFFORT,
  effortOptions,
  rollbackEffort,
  settleEffort,
} from './settings.ts'

import type { EffortOptionInfo } from './models.ts'

const effort = (id: string, name: string): EffortOptionInfo => ({ id, name })

describe('推理档位映射（用户裁决 2026-10-22：显示词 = 官方 adapter 下发 name 逐字透传）', () => {
  it('档位 {id,name} → 分段选项（label = adapter name——默认/低/高/极高 同桌面端同源同词）', () => {
    expect(effortOptions([effort('default', '默认'), effort('low', '低'), effort('high', '高'), effort('ultra', '极高')])).toEqual([
      { value: 'default', label: '默认' },
      { value: 'low', label: '低' },
      { value: 'high', label: '高' },
      { value: 'ultra', label: '极高' },
    ])
  })
})

describe('当前档收敛', () => {
  it('不支持档位 = undefined（分段隐藏判据）', () => {
    expect(currentEffort([], 'low')).toBeUndefined()
  })

  it('会话档在支持列表内取之；缺席 default 兜底 / 首个兜底', () => {
    const efforts = [effort('low', '低'), effort('medium', '中'), effort('high', '高')]
    expect(currentEffort(efforts, 'medium')).toBe('medium')
    expect(currentEffort([effort('default', '默认'), effort('low', '低')], 'medium')).toBe(DEFAULT_EFFORT)
    expect(currentEffort([effort('low', '低'), effort('medium', '中')], undefined)).toBe('low')
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
