import { describe, expect, it } from 'vitest'
import { FAB_SIZE, snapToEdge } from './fab.ts'

describe('snapToEdge（拖拽释放 → 就近贴边收纳）', () => {
  it('左半屏 → 贴左；右半屏 → 贴右', () => {
    expect(snapToEdge(30, 300, 390, 844).edge).toBe('left')
    expect(snapToEdge(360, 300, 390, 844).edge).toBe('right')
  })

  it('坐标钳制在安全边距内（含拖出屏外）', () => {
    const left = snapToEdge(-100, 0, 390, 844)
    expect(left.x).toBeGreaterThanOrEqual(0)
    expect(left.y).toBeGreaterThanOrEqual(0)
    const right = snapToEdge(9999, 9999, 390, 844)
    expect(right.x + FAB_SIZE).toBeLessThanOrEqual(390)
    expect(right.y + FAB_SIZE).toBeLessThanOrEqual(844)
  })

  it('中线两侧各归其边', () => {
    expect(snapToEdge(150, 400, 390, 844).edge).toBe('left')
    expect(snapToEdge(240, 400, 390, 844).edge).toBe('right')
  })
})
