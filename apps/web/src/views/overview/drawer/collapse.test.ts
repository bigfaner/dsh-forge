// collapse 单测 —— 折叠/宽度/位置纯函数 + 会话级保持存储（D21 弹窗数学面）。
// 界面说明最小化与就地更新（grid 0fr/1fr）的 CSS 落地归 drawer.css；本文件 pin 交互数学面。
// m3.1 D21 迁移：右锚拖宽数学（宽 = 视口 − clientX）退役 → 左右缘对侧锚定拖宽；
// 位置数学（默认起始位 + 标题栏拖移钳制）新增；宽度不再会话级保持（裁决 #3 不记忆）。
import { describe, expect, it } from 'vitest'
import {
  DRAWER_DEFAULT_TOP_RATIO,
  DRAWER_VIEWPORT_FACTOR,
  DRAWER_WIDTH_DEFAULT,
  DRAWER_WIDTH_MAX,
  DRAWER_WIDTH_MIN,
  DRAWER_WIDTH_STEP,
  clampDrawerPosition,
  clampDrawerWidth,
  createDrawerSessionStore,
  defaultDrawerPosition,
  drawerPositionFromDrag,
  drawerGeometryOnFormToggle,
  drawerSessionStore,
  drawerWidthCeiling,
  drawerWidthFromEdgeDrag,
  initialDrawerCollapse,
  stepDrawerWidth,
  toggleDrawerSection,
} from './collapse.js'

describe('宽度钳制（D21：320–760px）', () => {
  it('常量刻度：min 320 / max 760 / 默认 440（原型 M31_TM_W）/ 步长 32 / 视口因子 0.92 / 起始位纵向比率 0.14', () => {
    expect(DRAWER_WIDTH_MIN).toBe(320)
    expect(DRAWER_WIDTH_MAX).toBe(760)
    expect(DRAWER_WIDTH_DEFAULT).toBe(440)
    expect(DRAWER_WIDTH_STEP).toBe(32)
    expect(DRAWER_VIEWPORT_FACTOR).toBe(0.92)
    expect(DRAWER_DEFAULT_TOP_RATIO).toBe(0.14)
  })

  it('下限/上限钳制；区间内原样', () => {
    expect(clampDrawerWidth(100)).toBe(320)
    expect(clampDrawerWidth(9999)).toBe(760)
    expect(clampDrawerWidth(440)).toBe(440)
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
    expect(stepDrawerWidth(440, DRAWER_WIDTH_STEP)).toBe(472)
    expect(stepDrawerWidth(440, -DRAWER_WIDTH_STEP)).toBe(408)
    expect(stepDrawerWidth(744, 32)).toBe(760)
    expect(stepDrawerWidth(340, -32)).toBe(320)
  })

  it('缘侧拖宽数学（对侧锚定）：左缘指针左移加宽 / 右缘指针右移加宽，钳制 [320, 上限]', () => {
    // 起宽 440、起点 500：左缘拖到 300（左移 200）→ 640；右缘拖到 700（右移 200）→ 640
    expect(drawerWidthFromEdgeDrag('left', 440, 500, 300)).toBe(640)
    expect(drawerWidthFromEdgeDrag('right', 440, 500, 700)).toBe(640)
    // 反向收到下限（左缘右移 / 右缘左移越界 → 320）
    expect(drawerWidthFromEdgeDrag('left', 440, 500, 900)).toBe(320)
    expect(drawerWidthFromEdgeDrag('right', 440, 500, 100)).toBe(320)
    // 大幅外拖收到上限 760
    expect(drawerWidthFromEdgeDrag('left', 440, 500, -500)).toBe(760)
    expect(drawerWidthFromEdgeDrag('right', 440, 500, 1500)).toBe(760)
    // 窄屏上限（430 视口 → 396）
    expect(drawerWidthFromEdgeDrag('right', 420, 0, 430, 430)).toBe(Math.round(430 * 0.92))
  })
})

describe('位置数学（D21：默认起始位 + 标题栏拖移钳制）', () => {
  it('默认起始位 = 水平居中 + 视口高 14%（8px 最小偏移——原型 openTaskModal 刻度）', () => {
    expect(defaultDrawerPosition(1920, 1000, 440)).toEqual({ left: Math.round((1920 - 440) / 2), top: 140 })
    // 窄视口（居中为负/零）→ 左缘 8px 兜底
    expect(defaultDrawerPosition(400, 800, 440)).toEqual({ left: 8, top: 112 })
    // 矮视口 → 顶缘 8px 兜底
    expect(defaultDrawerPosition(1920, 50, 440).top).toBe(8)
  })

  it('拖移钳制：左/上 ≥ 4px、右不越视口、标题栏恒可见（top ≤ 视口 − 44 − 4）', () => {
    const clamped = clampDrawerPosition({ left: -50, top: -50 }, 1000, 800, 440)
    expect(clamped).toEqual({ left: 4, top: 4 })
    expect(clampDrawerPosition({ left: 900, top: 900 }, 1000, 800, 440)).toEqual({ left: 556, top: 752 })
    // 区间内原样（取整）
    expect(clampDrawerPosition({ left: 200.6, top: 100.4 }, 1000, 800, 440)).toEqual({ left: 201, top: 100 })
    // 弹宽近视口宽：左缘钳至边距（右不越）
    expect(clampDrawerPosition({ left: 500, top: 100 }, 500, 800, 760)).toEqual({ left: 4, top: 100 })
  })

  it('标题栏拖移 = 起位 + 指针位移（视口钳制——越界吸附边界）', () => {
    const start = { left: 200, top: 100 }
    expect(drawerPositionFromDrag(start, 500, 300, 620, 350, 1920, 1000, 440)).toEqual({ left: 320, top: 150 })
    // 越界拖移 → 钳在边距
    expect(drawerPositionFromDrag(start, 500, 300, -400, -900, 1920, 1000, 440)).toEqual({ left: 4, top: 4 })
  })
})

describe('双形态翻转几何（D22：⤢/⤡——原型 m31-tm-expand 宽度交换 + 水平再居中）', () => {
  it('展开：宽 <700 → 720 + 水平再居中（top 保持）；宽 ≥700 → 几何不动（用户自宽尊重）', () => {
    expect(drawerGeometryOnFormToggle(440, { left: 300, top: 140 }, true, 1920)).toEqual({
      width: 720,
      position: { left: Math.round((1920 - 720) / 2), top: 140 },
    })
    // 已 760（用户缘侧拖宽）→ 展开不动
    expect(drawerGeometryOnFormToggle(760, { left: 40, top: 200 }, true, 1920)).toEqual({
      width: 760,
      position: { left: 40, top: 200 },
    })
    // 恰 700 = 带内不动（原型 < 700 严格判定）
    expect(drawerGeometryOnFormToggle(700, { left: 60, top: 160 }, true, 1920)).toEqual({
      width: 700,
      position: { left: 60, top: 160 },
    })
  })

  it('收起：宽 >500 → 440 + 水平再居中（top 保持）；宽 ≤500 → 几何不动', () => {
    expect(drawerGeometryOnFormToggle(720, { left: 600, top: 140 }, false, 1920)).toEqual({
      width: 440,
      position: { left: Math.round((1920 - 440) / 2), top: 140 },
    })
    // 用户已收窄至 500 内 → 收起不动
    expect(drawerGeometryOnFormToggle(480, { left: 90, top: 180 }, false, 1920)).toEqual({
      width: 480,
      position: { left: 90, top: 180 },
    })
  })

  it('窄屏钳制：720 → min(760, round(视口 × 0.92))；再居中左缘 8px 兜底', () => {
    const out = drawerGeometryOnFormToggle(440, { left: 30, top: 120 }, true, 700)
    expect(out.width).toBe(Math.round(700 * 0.92))
    expect(out.position).toEqual({ left: Math.max(8, Math.round((700 - Math.round(700 * 0.92)) / 2)), top: 120 })
  })

  it('位未定（null = mount 效应前）：仅换宽——CSS 居中兜底自适应（left 零注入保持）', () => {
    expect(drawerGeometryOnFormToggle(440, null, true, 1920)).toEqual({ width: 720, position: null })
    expect(drawerGeometryOnFormToggle(720, null, false, 1920)).toEqual({ width: 440, position: null })
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

describe('会话级保持存储（D21：折叠跨任务/关开保持——宽度/位置不入[裁决 #3 不记忆]）', () => {
  it('折叠写后可读回；reset 还原默认', () => {
    const store = createDrawerSessionStore()
    expect(store.getState()).toEqual({ collapsed: initialDrawerCollapse() })
    store.toggleSection('timeline')
    expect(store.getState()).toEqual({ collapsed: { content: true, timeline: false } })
    store.reset()
    expect(store.getState()).toEqual({ collapsed: initialDrawerCollapse() })
  })

  it('宽度零会话级通道（setWidth 不在存储面——不记忆尺寸的机械面）', () => {
    const store = createDrawerSessionStore()
    expect('setWidth' in store).toBe(false)
    expect('width' in store.getState()).toBe(false)
  })

  it('订阅通知：写即通知、退订后静默', () => {
    const store = createDrawerSessionStore()
    const seen: boolean[] = []
    const unsubscribe = store.subscribe(() => {
      seen.push(store.getState().collapsed.timeline)
    })
    store.toggleSection('timeline')
    store.toggleSection('content')
    unsubscribe()
    store.toggleSection('timeline')
    expect(seen).toEqual([false, false]) // toggle 也通知（折叠未变于第二写——读同一状态）
  })

  it('进程内单例在场（折叠态会话级保持的载体——关开弹窗共享）', () => {
    expect(drawerSessionStore.getState().collapsed).toEqual(initialDrawerCollapse())
  })
})
