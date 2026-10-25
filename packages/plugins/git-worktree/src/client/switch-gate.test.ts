// 切换闸键击拦截谓词单测（bug 267dcac1——切换 pending 窗口 composer 禁输）：
// Enter 恒拦（发送动作）；其余键仅当目标为可编辑元素时拦（输入禁止，全局快捷键不误伤）。
import { describe, expect, it } from 'vitest'
import { switchGateBlocksKey } from './switch-gate.js'

const editable = (tag: string): { key: string; target: { tagName: string; isContentEditable: boolean } } => ({
  key: 'a',
  target: { tagName: tag, isContentEditable: false },
})

describe('switchGateBlocksKey（切换 pending 窗口键击拦截）', () => {
  it('Enter 恒拦——目标非可编辑亦拦（发送动作窗口内禁发）', () => {
    expect(switchGateBlocksKey({ key: 'Enter', target: null })).toBe(true)
    expect(switchGateBlocksKey({ key: 'Enter', target: { tagName: 'DIV', isContentEditable: false } })).toBe(true)
  })

  it('可编辑目标（INPUT/TEXTAREA/contentEditable）字符键拦——禁止输入', () => {
    expect(switchGateBlocksKey(editable('INPUT'))).toBe(true)
    expect(switchGateBlocksKey(editable('TEXTAREA'))).toBe(true)
    expect(switchGateBlocksKey({ key: 'a', target: { tagName: 'DIV', isContentEditable: true } })).toBe(true)
  })

  it('非可编辑目标非 Enter 键放行——全局快捷键（如 Cmd+R）不误伤', () => {
    expect(switchGateBlocksKey({ key: 'a', target: { tagName: 'DIV', isContentEditable: false } })).toBe(false)
    expect(switchGateBlocksKey({ key: 'Escape', target: null })).toBe(false)
  })
})
