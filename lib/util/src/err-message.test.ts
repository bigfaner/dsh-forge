// errMessage 单测——unknown 错误的消息面（Error 取 message，其余 String 化）。
import { describe, expect, it } from 'vitest'
import { errMessage } from './err-message.js'

describe('errMessage', () => {
  it('Error 实例 → 取 message', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
  })

  it('非 Error → String 化（字符串原样 / 数字与 null 亦收敛为字符串）', () => {
    expect(errMessage('plain')).toBe('plain')
    expect(errMessage(42)).toBe('42')
    expect(errMessage(null)).toBe('null')
    expect(errMessage({ code: 'E_X' })).toBe('[object Object]')
  })
})
