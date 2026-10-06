// collapse 单测 —— 折叠/宽度纯函数 + 会话级保持存储（AC2/AC6）。
// 界面说明最小化与就地更新（grid 0fr/1fr）的 CSS 落地归 drawer.css；本文件 pin 交互数学面。
import { describe, expect, it } from 'vitest'
import {
  DRAWER_VIEWPORT_FACTOR,
  DRAWER_WIDTH_DEFAULT,
  DRAWER_WIDTH_MAX,
  DRAWER_WIDTH_MIN,
  DRAWER_WIDTH_STEP,
  clampDrawerWidth,
  createDrawerSessionStore,
  drawerSessionStore,
  drawerWidthCeiling,
  drawerWidthFromDrag,
  initialDrawerCollapse,
  stepDrawerWidth,
  toggleDrawerSection,
} from './collapse.js'

describe('宽度钳制（AC6：320–760px）', () => {
  it('常量刻度：min 320 / max 760 / 默认 420 / 步长 32 / 视口因子 0.92', () => {
    expect(DRAWER_WIDTH_MIN).toBe(320)
    expect(DRAWER_WIDTH_MAX).toBe(760)
    expect(DRAWER_WIDTH_DEFAULT).toBe(420)
    expect(DRAWER_WIDTH_STEP).toBe(32)
    expect(DRAWER_VIEWPORT_FACTOR).toBe(0.92)
  })

  it('下限/上限钳制；区间内原样', () => {
    expect(clampDrawerWidth(100)).toBe(320)
    expect(clampDrawerWidth(9999)).toBe(760)
    expect(clampDrawerWidth(420)).toBe(420)
    expect(clampDrawerWidth(760)).toBe(760)
    expect(clampDrawerWidth(320)).toBe(320)
  })

  it('视口收窄：上限 = min(760, round(视口 × 0.92))——窄屏钳在视口内', () => {
    expect(drawerWidthCeiling(500)).toBe(Math.min(760, Math.round(500 * 0.92)))
    expect(clampDrawerWidth(760, 500)).toBe(460)
    // 宽屏不收窄（760 上限优先）
    expect(drawerWidthCeiling(1920)).toBe(760)
    // 视口缺席 = 全幅上限
    expect(drawerWidthCeiling(undefined)).toBe(760)
  })

  it('键盘步进 ±32（钳制内）；← 加宽 = +32、→ 收窄 = -32 由调用方定向', () => {
    expect(stepDrawerWidth(420, DRAWER_WIDTH_STEP)).toBe(452)
    expect(stepDrawerWidth(420, -DRAWER_WIDTH_STEP)).toBe(388)
    expect(stepDrawerWidth(744, 32)).toBe(760)
    expect(stepDrawerWidth(340, -32)).toBe(320)
  })

  it('拖拽数学：宽 = 视口 - clientX（右锚抽屉——指针即左缘），钳制 [320, 上限]', () => {
    expect(drawerWidthFromDrag(500, 1000)).toBe(500)
    expect(drawerWidthFromDrag(900, 1000)).toBe(320) // 指针近右缘 → 收到下限
    expect(drawerWidthFromDrag(0, 1000)).toBe(760) // 指针最左 → 上限
    expect(drawerWidthFromDrag(10, 430)).toBe(Math.round(430 * 0.92)) // 窄屏上限（420 → 396）
  })
})

describe('折叠纯函数（AC2：aria-expanded 同步源）', () => {
  it('初始两块全展开', () => {
    expect(initialDrawerCollapse()).toEqual({ content: true, timeline: true })
  })

  it('toggle 就地翻转目标块——其余块不动（跨块互不影响）', () => {
    const s0 = initialDrawerCollapse()
    const s1 = toggleDrawerSection(s0, 'content')
    expect(s1).toEqual({ content: false, timeline: true })
    const s2 = toggleDrawerSection(s1, 'timeline')
    expect(s2).toEqual({ content: false, timeline: false })
    const s3 = toggleDrawerSection(s2, 'content')
    expect(s3).toEqual({ content: true, timeline: false })
  })
})

describe('会话级保持存储（AC2/AC6：折叠与宽度跨任务/关开抽屉保持）', () => {
  it('宽度与折叠写后可读回；reset 还原默认', () => {
    const store = createDrawerSessionStore()
    expect(store.getState()).toEqual({ width: DRAWER_WIDTH_DEFAULT, collapsed: initialDrawerCollapse() })
    store.setWidth(560)
    store.toggleSection('timeline')
    expect(store.getState()).toEqual({
      width: 560,
      collapsed: { content: true, timeline: false },
    })
    store.reset()
    expect(store.getState()).toEqual({ width: DRAWER_WIDTH_DEFAULT, collapsed: initialDrawerCollapse() })
  })

  it('setWidth 落库前钳制 [320, 760]（写入面单一收口）', () => {
    const store = createDrawerSessionStore()
    store.setWidth(100)
    expect(store.getState().width).toBe(320)
    store.setWidth(5000)
    expect(store.getState().width).toBe(760)
  })

  it('订阅通知：写即通知、退订后静默', () => {
    const store = createDrawerSessionStore()
    const seen: number[] = []
    const unsubscribe = store.subscribe(() => {
      seen.push(store.getState().width)
    })
    store.setWidth(500)
    store.toggleSection('content')
    unsubscribe()
    store.setWidth(600)
    expect(seen).toEqual([500, 500]) // toggle 也通知（宽度未变——读同一状态）
  })

  it('进程内单例在场（会话级保持的载体——关开抽屉共享）', () => {
    expect(drawerSessionStore.getState().width).toBeGreaterThanOrEqual(DRAWER_WIDTH_MIN)
    expect(drawerSessionStore.getState().width).toBeLessThanOrEqual(DRAWER_WIDTH_MAX)
  })
})
