// 折叠与调宽纯函数 + 会话级保持存储（定位：业务——任务详情抽屉 AC2/AC6 交互数学面）。
// 口径锚 ui-design「任务详情抽屉」：
//   - 宽度：默认 420px、左缘手柄拖拽 320–760 钳制（窄屏 = min(760, 视口×0.92)）、
//     双击复位 420、←→ 键盘 ±32——宽度会话级保持（跨任务/关开抽屉）；
//   - 折叠：块头点击就地更新（grid 0fr/1fr + caret 旋转——CSS 承载），aria-expanded 同步源
//     = 本模块布尔态；折叠状态会话级（跨任务保持）。
// 存储形态 = 进程内单例（抽屉关开/切任务共享同一实例）；「会话级」= 应用会话生命周期，
// 不落盘（重置种子还原默认 = store.reset）。
/** 宽度下限（px） */
export const DRAWER_WIDTH_MIN = 320
/** 宽度上限（px） */
export const DRAWER_WIDTH_MAX = 760
/** 默认宽度（px）——双击复位值 */
export const DRAWER_WIDTH_DEFAULT = 420
/** 键盘步进（px）——← 加宽 +32 / → 收窄 -32 */
export const DRAWER_WIDTH_STEP = 32
/** 窄屏视口因子（上限 = min(760, 视口×0.92)——右锚抽屉不越窄屏） */
export const DRAWER_VIEWPORT_FACTOR = 0.92

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

/** 拖拽数学：宽 = 视口 − clientX（右锚抽屉——指针即左缘），钳制 [320, 上限] */
export function drawerWidthFromDrag(clientX: number, viewportWidth: number): number {
  return clampDrawerWidth(viewportWidth - clientX, viewportWidth)
}

/** 会话级抽屉态（宽度 + 折叠——关开抽屉/切任务保持） */
export interface DrawerSessionState {
  readonly width: number
  readonly collapsed: DrawerCollapseState
}

/** 会话级存储面（订阅 = 跨实例同步；reset = 重置种子还原默认） */
export interface DrawerSessionStore {
  getState(): DrawerSessionState
  /** 写入（落库前钳制 [320, 760]——写入面单一收口） */
  setWidth(width: number): void
  toggleSection(key: DrawerSectionKey): void
  reset(): void
  subscribe(listener: () => void): () => void
}

/** 建会话级存储（独立实例 = 测试面；进程内共享 = drawerSessionStore 单例） */
export function createDrawerSessionStore(): DrawerSessionStore {
  let state: DrawerSessionState = { width: DRAWER_WIDTH_DEFAULT, collapsed: initialDrawerCollapse() }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getState: () => state,
    setWidth(width) {
      state = { ...state, width: clampDrawerWidth(width) }
      notify()
    },
    toggleSection(key) {
      state = { ...state, collapsed: toggleDrawerSection(state.collapsed, key) }
      notify()
    },
    reset() {
      state = { width: DRAWER_WIDTH_DEFAULT, collapsed: initialDrawerCollapse() }
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

/** 进程内单例（会话级保持载体——抽屉关开/切任务共享；e2e 重置种子 = reset） */
export const drawerSessionStore: DrawerSessionStore = createDrawerSessionStore()
