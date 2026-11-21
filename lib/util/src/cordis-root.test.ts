import { describe, expect, it } from 'vitest'
import { CORDIS_ROOT, rootCtxOf } from './cordis-root.js'

describe('rootCtxOf', () => {
  it('真 ctx 形入参：经符号键取树根', () => {
    const root = { name: 'root' }
    const leaf = { [CORDIS_ROOT]: root, name: 'leaf' }
    expect(rootCtxOf(leaf)).toBe(root)
  })

  it('纯 face 形入参：无符号键原样返回自身', () => {
    const face = { name: 'face' }
    expect(rootCtxOf(face)).toBe(face)
  })

  it('符号键跨副本同一性（Symbol.for 全局注册）', () => {
    expect(CORDIS_ROOT).toBe(Symbol.for('cordis.root'))
  })
})
