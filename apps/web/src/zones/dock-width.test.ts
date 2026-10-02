// zones/dock-width 单测 —— fix-4 轨道宽度纯函数面 pin：原型 #rb-resize 刻度收敛
// （300px 起 / 70vw 封顶）、拖拽方向语义（左缘手柄：指针左移加宽）、键盘步进。
// 交互胶水（pointer 捕获/键盘事件）归 WorkbenchZones 结构 pin 与 e2e 计算样式面。
import { describe, expect, it } from 'vitest'
import {
  DOCK_RESIZE_KEY_STEP,
  DOCK_WIDTH_DEFAULT,
  DOCK_WIDTH_MIN,
  clampDockWidth,
  dockWidthFromDrag,
  dockWidthFromKey,
} from './dock-width.js'

const VIEWPORT = 1440 // 窗口基准（1440×900）；70vw = 1008
const MAX_AT_1440 = VIEWPORT * 0.7

describe('clampDockWidth 收敛（原型刻度：300px 起、70vw 封顶）', () => {
  it('域内原值保持（含默认 340）', () => {
    expect(clampDockWidth(340, VIEWPORT)).toBe(340)
    expect(clampDockWidth(300, VIEWPORT)).toBe(300)
    expect(clampDockWidth(MAX_AT_1440, VIEWPORT)).toBe(MAX_AT_1440)
    expect(DOCK_WIDTH_DEFAULT).toBeGreaterThanOrEqual(DOCK_WIDTH_MIN)
  })
  it('低于下限收敛 300；高于 70vw 封顶收敛', () => {
    expect(clampDockWidth(120, VIEWPORT)).toBe(DOCK_WIDTH_MIN)
    expect(clampDockWidth(2000, VIEWPORT)).toBe(MAX_AT_1440)
  })
  it('小视口守卫：70vw < 下限时下限优先（不产负空窗）', () => {
    // 400px 视口：70vw = 280 < 300 → 上限抬到下限，宽度恒 300
    expect(clampDockWidth(500, 400)).toBe(DOCK_WIDTH_MIN)
    expect(clampDockWidth(280, 400)).toBe(DOCK_WIDTH_MIN)
  })
})

describe('拖拽推导（左缘手柄：指针左移加宽、右移收窄）', () => {
  it('dx 负 → 加宽；dx 正 → 收窄', () => {
    expect(dockWidthFromDrag(400, -60, VIEWPORT)).toBe(460)
    expect(dockWidthFromDrag(400, 60, VIEWPORT)).toBe(340)
  })
  it('越界收敛（拖过下限/上限）', () => {
    expect(dockWidthFromDrag(310, 50, VIEWPORT)).toBe(DOCK_WIDTH_MIN)
    expect(dockWidthFromDrag(MAX_AT_1440 - 10, -100, VIEWPORT)).toBe(MAX_AT_1440)
  })
})

describe('键盘推导（← 加宽 / → 收窄，步进刻度）', () => {
  it('ArrowLeft 加宽一步 / ArrowRight 收窄一步', () => {
    expect(dockWidthFromKey(400, 'ArrowLeft', VIEWPORT)).toBe(400 + DOCK_RESIZE_KEY_STEP)
    expect(dockWidthFromKey(400, 'ArrowRight', VIEWPORT)).toBe(400 - DOCK_RESIZE_KEY_STEP)
  })
  it('越界收敛（下限/上限处不越出）', () => {
    expect(dockWidthFromKey(DOCK_WIDTH_MIN, 'ArrowRight', VIEWPORT)).toBe(DOCK_WIDTH_MIN)
    expect(dockWidthFromKey(MAX_AT_1440, 'ArrowLeft', VIEWPORT)).toBe(MAX_AT_1440)
  })
})
