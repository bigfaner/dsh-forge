// expert-squad 装载位判定单测（bug 4d55ba98 / d64473be——壳掌舵门控单源的形态全集 pin）。
import { describe, expect, it } from 'vitest'
import { expertSquadLoadedOf, isExpertSquadEntry } from './expert-squad-presence.js'

describe('isExpertSquadEntry 行形态全集（bug d64473be：bundle 行短名形态漏判回归）', () => {
  it('insert 行形态（id 长名 + name 包名）命中', () => {
    expect(isExpertSquadEntry({ id: 'dsh-forge-expert-squad', options: { name: '@dsh-forge/expert-squad' } })).toBe(true)
  })
  it('bundle 行形态（id 短名）命中——4d55ba98 修复漏判的复发面', () => {
    expect(isExpertSquadEntry({ id: 'expert-squad', options: { name: 'expert-squad' } })).toBe(true)
    expect(isExpertSquadEntry({ id: 'expert-squad', options: { name: '@dsh-forge/expert-squad' } })).toBe(true)
    expect(isExpertSquadEntry({ id: 'expert-squad' })).toBe(true)
  })
  it('name 短名形态命中（loader 注入形态防御）', () => {
    expect(isExpertSquadEntry({ id: 'x', options: { name: 'expert-squad' } })).toBe(true)
  })
  it('他行不误判（含前缀/子串相似行）', () => {
    expect(isExpertSquadEntry({ id: 'dsh-forge-core', options: { name: '@dsh-forge/core' } })).toBe(false)
    expect(isExpertSquadEntry({ id: 'expert-squad-general', options: { name: 'expert-squad-general' } })).toBe(false)
    expect(isExpertSquadEntry({ options: { name: 'dsh-forge-expert-squad' } })).toBe(false)
    expect(isExpertSquadEntry({})).toBe(false)
  })
})

describe('expertSquadLoadedOf（!disabled = 实际装载——官方 plugin-inventory 同读法）', () => {
  it('disabled 行 = 未装载；enabled 行 = 装载；混合取 enabled', () => {
    expect(expertSquadLoadedOf([{ id: 'expert-squad', disabled: true }])).toBe(false)
    expect(expertSquadLoadedOf([{ id: 'expert-squad', disabled: false }])).toBe(true)
    expect(expertSquadLoadedOf([{ id: 'expert-squad', disabled: true }, { id: 'dsh-forge-expert-squad' }])).toBe(true)
    expect(expertSquadLoadedOf([])).toBe(false)
    expect(expertSquadLoadedOf([{ id: 'dsh-forge-core', options: { name: '@dsh-forge/core' } }])).toBe(false)
  })
})
