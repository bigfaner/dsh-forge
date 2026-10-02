// dock 轨道宽度机制（定位：基础）——fix-4 拖拽调宽的纯函数面（UF-7 机制语义正交扩展）。
// 刻度 = 原型 #rb-resize（styles.css :802-808）：宽 300px 起、70vw 封顶；拖拽/键盘经
// 交互胶水（WorkbenchZones 手柄 pointer 事件）收敛为纯状态——宽度记忆 = zones 机制内态
// （Hard Rule 裁决输入：挂 shell 态机或 zones 内态，禁入域状态层；本实现取 zones 内态，
// view-state.ts 零改动）。与三态相位（collapsed/expanded/hidden）正交：收起/强制隐藏
// 不改写记忆值，展开恢复沿用。

/** 默认宽度（P1 既有刻度：340px） */
export const DOCK_WIDTH_DEFAULT = 340

/** 宽度下限（原型 rb-wrap min-width 刻度） */
export const DOCK_WIDTH_MIN = 300

/** 宽度上限比率（原型 rb-wrap max-width: 70vw 刻度） */
export const DOCK_WIDTH_MAX_RATIO = 0.7

/** 键盘调宽步进（←/→ 方向键；官方无对应刻度，原型无键盘面——P1 补键盘可达的步进值） */
export const DOCK_RESIZE_KEY_STEP = 16

/** 宽度收敛（原型同型 clamp）：域内原值保持；低于下限取下限；高于 70vw 取 70vw。
 *  小视口守卫：70vw < 下限时下限优先（上限不低于下限，不产负空窗）。 */
export function clampDockWidth(candidate: number, viewportWidth: number): number {
  const max = Math.max(DOCK_WIDTH_MIN, viewportWidth * DOCK_WIDTH_MAX_RATIO)
  return Math.min(Math.max(candidate, DOCK_WIDTH_MIN), max)
}

/** 拖拽推导：手柄居轨道左缘——指针左移（负 dx）加宽、右移（正 dx）收窄；越界收敛。 */
export function dockWidthFromDrag(
  current: number,
  dragDx: number,
  viewportWidth: number,
): number {
  return clampDockWidth(current - dragDx, viewportWidth)
}

/** 键盘推导的键面（WAI-ARIA separator resize 语义：方向键移动左缘） */
export type DockResizeKey = 'ArrowLeft' | 'ArrowRight'

/** 键盘推导：← 加宽 / → 收窄（步进刻度）；越界收敛。 */
export function dockWidthFromKey(
  current: number,
  key: DockResizeKey,
  viewportWidth: number,
): number {
  const delta = key === 'ArrowLeft' ? DOCK_RESIZE_KEY_STEP : -DOCK_RESIZE_KEY_STEP
  return clampDockWidth(current + delta, viewportWidth)
}
