// 折叠与调宽纯函数 + 会话级保持存储（定位：业务——任务详情弹窗 D21 交互数学面）。
// 口径锚 m3.1 纠正版原型 #m31-tm（可拖动弹窗——proposal.md 六区 D21）：
//   - 宽度：默认 440px、左右缘手柄拖拽 320–760 钳制（窄屏 = min(760, 视口×0.92)）、
//     双击复位 440、←→ 键盘 ±32——**宽度不跨关开保持**（关闭即弃——重开回默认，
//     用户裁决 #3「关闭后不记忆位置/尺寸」）；
//   - 位置：默认起始位 = 水平居中 + 视口高 14%（原型 openTaskModal）；标题栏全窗拖移
//     （视口钳制 4px 边距——原型 bindDragMove 同刻度）；同样不跨关开保持；
//   - 折叠：块头点击就地更新（grid 0fr/1fr + caret 旋转——CSS 承载），aria-expanded 同步源
//     = 本模块布尔态；折叠状态会话级（跨任务/关开保持——原型 tmCollapse 同语义）。
// 存储形态 = 进程内单例（弹窗关开/切任务共享同一实例）；「会话级」= 应用会话生命周期，
// 不落盘（重置种子还原默认 = store.reset）。宽度/位置 = 装载壳逐开本地态（不进本存储）。
/** 宽度下限（px） */
export const DRAWER_WIDTH_MIN = 320
/** 宽度上限（px） */
export const DRAWER_WIDTH_MAX = 760
/** 默认宽度（px）——双击复位值（原型 M31_TM_W = 440） */
export const DRAWER_WIDTH_DEFAULT = 440
/** 键盘步进（px）——← 加宽 +32 / → 收窄 -32 */
export const DRAWER_WIDTH_STEP = 32
/** 窄屏视口因子（上限 = min(760, 视口×0.92)——弹窗不越窄屏） */
export const DRAWER_VIEWPORT_FACTOR = 0.92
/** 拖移视口边距（px——原型 bindDragMove 钳制刻度 4） */
export const DRAWER_DRAG_MARGIN = 4
/** 默认起始位最小偏移（px——原型 openTaskModal max(8, …) 刻度） */
export const DRAWER_DEFAULT_MIN_OFFSET = 8
/** 默认起始位纵向比率（原型 openTaskModal：viewportHeight × 0.14） */
export const DRAWER_DEFAULT_TOP_RATIO = 0.14
/** 拖移纵向可达下界余量（px——标题栏恒可见：原型 Math.min(target.offsetHeight, 44) 刻度） */
export const DRAWER_DRAG_TOP_FLOOR = 44

/** 抽屉两分块 id（块一 任务内容 / 块二 时间线） */
export type DrawerSectionKey = 'content' | 'timeline'

/** 折叠态（true = 展开；默认全展开） */
export type DrawerCollapseState = Readonly<Record<DrawerSectionKey, boolean>>

/** 初始折叠态（两块全展开） */
export function initialDrawerCollapse(): DrawerCollapseState {
  return { content: true, timeline: true }
}

/** 折叠 toggle（就地翻转目标块——其余块不动；不可变返回） */
export function toggleDrawerSection(state: DrawerCollapseState, key: DrawerSectionKey): DrawerCollapseState {
  return { ...state, [key]: !state[key] }
}

/** 宽度上限（视口在场 = min(760, round(视口×0.92))；缺席 = 全幅 760） */
export function drawerWidthCeiling(viewportWidth?: number): number {
  if (viewportWidth === undefined) return DRAWER_WIDTH_MAX
  return Math.min(DRAWER_WIDTH_MAX, Math.round(viewportWidth * DRAWER_VIEWPORT_FACTOR))
}

/** 宽度钳制 [320, 上限]（NaN 防御 → 默认 420） */
export function clampDrawerWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) return DRAWER_WIDTH_DEFAULT
  const ceiling = drawerWidthCeiling(viewportWidth)
  const floor = Math.min(DRAWER_WIDTH_MIN, ceiling)
  return Math.min(ceiling, Math.max(floor, Math.round(width)))
}

/** 键盘步进（← 加宽 = +32 / → 收窄 = -32——方向由调用方定向；钳制内） */
export function stepDrawerWidth(current: number, delta: number, viewportWidth?: number): number {
  return clampDrawerWidth(current + delta, viewportWidth)
}

/** 缘侧（左缘/右缘——拖宽方向语义） */
export type DrawerResizeEdge = 'left' | 'right'

/**
 * 缘侧拖宽数学（D21：左右缘拖宽——对侧锚定）：左缘 = 起宽 + 起点左移量（指针左移加宽）、
 * 右缘 = 起宽 + 起点右移量（指针右移加宽），钳制 [320, 上限]。
 */
export function drawerWidthFromEdgeDrag(
  edge: DrawerResizeEdge,
  startWidth: number,
  startClientX: number,
  clientX: number,
  viewportWidth?: number,
): number {
  const delta = edge === 'left' ? startClientX - clientX : clientX - startClientX
  return clampDrawerWidth(startWidth + delta, viewportWidth)
}

/** 弹窗位置（px——inline left/top；装载壳本地态，关闭即弃） */
export interface DrawerModalPosition {
  readonly left: number
  readonly top: number
}

/** 默认起始位（D21：水平居中 + 视口高 14%——原型 openTaskModal；8px 最小偏移） */
export function defaultDrawerPosition(viewportWidth: number, viewportHeight: number, width: number): DrawerModalPosition {
  return {
    left: Math.max(DRAWER_DEFAULT_MIN_OFFSET, Math.round((viewportWidth - width) / 2)),
    top: Math.max(DRAWER_DEFAULT_MIN_OFFSET, Math.round(viewportHeight * DRAWER_DEFAULT_TOP_RATIO)),
  }
}

/** 位置钳制（拖移期：左/上 ≥ 4px、右不越视口、标题栏恒可见——原型 bindDragMove 刻度） */
export function clampDrawerPosition(
  position: DrawerModalPosition,
  viewportWidth: number,
  viewportHeight: number,
  width: number,
): DrawerModalPosition {
  const margin = DRAWER_DRAG_MARGIN
  const widthClamped = Math.min(width, viewportWidth - 2 * margin)
  return {
    left: Math.min(Math.max(margin, Math.round(position.left)), Math.max(margin, viewportWidth - widthClamped - margin)),
    top: Math.min(Math.max(margin, Math.round(position.top)), Math.max(margin, viewportHeight - DRAWER_DRAG_TOP_FLOOR - margin)),
  }
}

/** 标题栏拖移位置数学（起位 + 指针位移，视口钳制） */
export function drawerPositionFromDrag(
  start: DrawerModalPosition,
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  width: number,
): DrawerModalPosition {
  return clampDrawerPosition(
    { left: start.left + (clientX - startClientX), top: start.top + (clientY - startClientY) },
    viewportWidth,
    viewportHeight,
    width,
  )
}

/** 会话级弹窗态（分块折叠——关开弹窗/切任务保持；宽度/位置不记忆[裁决 #3]不入） */
export interface DrawerSessionState {
  readonly collapsed: DrawerCollapseState
}

/** 会话级存储面（订阅 = 跨实例同步；reset = 重置种子还原默认） */
export interface DrawerSessionStore {
  getState(): DrawerSessionState
  toggleSection(key: DrawerSectionKey): void
  reset(): void
  subscribe(listener: () => void): () => void
}

/** 建会话级存储（独立实例 = 测试面；进程内共享 = drawerSessionStore 单例） */
export function createDrawerSessionStore(): DrawerSessionStore {
  let state: DrawerSessionState = { collapsed: initialDrawerCollapse() }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getState: () => state,
    toggleSection(key) {
      state = { ...state, collapsed: toggleDrawerSection(state.collapsed, key) }
      notify()
    },
    reset() {
      state = { collapsed: initialDrawerCollapse() }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** 进程内单例（折叠态会话级保持载体——弹窗关开/切任务共享；e2e 重置种子 = reset） */
export const drawerSessionStore: DrawerSessionStore = createDrawerSessionStore()
